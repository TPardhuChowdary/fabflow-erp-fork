// Phase 9B — the reusable per-mailbox sync core, extracted unchanged
// from email-sync/index.ts so both the existing human-triggered "Sync
// Now" endpoint and the new unattended email-sync-scan endpoint call
// the exact same logic — per the explicit instruction not to create a
// second synchronization implementation. Every line of business logic
// below (provider dispatch, message upsert, attachment dedup/timeout/
// memory-cap handling, cursor advancement) is moved verbatim from that
// file; only the two things that used to be caller concerns (locking,
// HTTP response shaping) were pulled out — see syncOneMailbox's own
// comment for the exact contract change.

import { googleAdapter } from "./googleAdapter.ts";
import { imapSmtpAdapter } from "./imapSmtpAdapter.ts";
import { imapRemoteAdapter } from "./imapRemoteAdapter.ts";
import { microsoftAdapter } from "./microsoftAdapter.ts";
import type { EmailProviderAdapter } from "./emailAdapter.ts";

const ADAPTERS: Record<"google" | "microsoft" | "imap_smtp", EmailProviderAdapter> = {
  google: googleAdapter,
  microsoft: microsoftAdapter,
  imap_smtp: imapSmtpAdapter,
};

export const MAX_MESSAGES_PER_SYNC = 25; // cost/time control — a single sync
// call fetches at most this many messages; a very large backlog is
// covered by repeated "Sync now" calls / the scheduled worker's next
// tick, not by one unbounded call that could time out or hammer the
// provider. Live-verified (see the Phase 1B deployment report): 200 was
// too high — against a real mailbox, listing plus per-attachment
// downloading could run past the Edge Function platform's execution limit.

// Lock/lease + the multi-mailbox scan loop live in emailSyncLock.ts —
// split out deliberately so that file has no adapter ("npm:"-specifier)
// import and can be exercised under a plain Node/tsx test (see that
// file's own header). Re-exported here so callers of this module don't
// need two import lines for what is, from their perspective, one
// "sync a mailbox" concern.
export {
  claimSyncLock,
  ensureSyncStateRow,
  LOCK_LEASE_MS,
  releaseSyncLock,
  scanMailboxes,
} from "./emailSyncLock.ts";

export const SYNC_WALL_CLOCK_BUDGET_MS = 25_000; // Applies to THIS mailbox's
// own message upsert + attachment download/upload loop specifically —
// separate from imapSmtpAdapter.ts's own internal fetch deadline, and
// separate from email-sync-scan's OWN overall (multi-mailbox) budget,
// because attachment downloading happens here, after listMessages() has
// already returned, and needs its own budget for the same reason.

// Live-verified need (see the Phase 1B deployment report): the Storage
// upload call below had no timeout of its own — unlike every IMAP-side
// operation (already hard-timeout-wrapped in imapSmtpAdapter.ts), a stalled
// upload could hang the whole per-message loop past the platform's
// execution limit with no error ever written, leaving email_sync_state
// stuck at "syncing" indefinitely. Same fix shape as the adapter's own.
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Operation timed out after ${ms}ms`)),
      ms,
    );
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface SyncAccount {
  id: string;
  organization_id: string;
  provider: string;
  imap_host: string | null;
  imap_port: number | null;
  imap_encryption: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_encryption: string | null;
  imap_username: string | null;
  sync_window_days: number;
}

// Phase 9B (8J-equivalent for sync): credentials are decrypted with the
// SAME service-role client either caller already uses for everything
// else — decrypt_email_credentials's own definition was read and
// confirmed to be a pure, stateless SQL function (pgp_sym_decrypt on the
// given ciphertext+key, no table access, no auth.uid(), not SECURITY
// DEFINER) with zero identity dependence, so calling it via serviceClient
// instead of a user's own client is behaviorally identical — it was only
// ever called via userClient before because decryption sat inline right
// after the userClient-gated authorization read, not because the RPC
// itself needed a user. Centralizing this here removes the duplicate
// decrypt-and-handle-failure block the automatic path would otherwise need.
export async function decryptAccountCredentials(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  accountId: string,
  encryptionKey: string,
  // deno-lint-ignore no-explicit-any
): Promise<{ ok: true; credentials: any } | { ok: false; error: string }> {
  const { data: encryptedRow, error: readCredError } = await serviceClient
    .from("email_accounts")
    .select("encrypted_credentials")
    .eq("id", accountId)
    .single();
  if (readCredError || !encryptedRow?.encrypted_credentials) {
    return { ok: false, error: "Could not read stored credentials." };
  }
  const { data: decrypted, error: decryptError } = await serviceClient.rpc(
    "decrypt_email_credentials",
    { p_ciphertext: encryptedRow.encrypted_credentials, p_key: encryptionKey },
  );
  if (decryptError || !decrypted) {
    await serviceClient
      .from("email_accounts")
      .update({ status: "auth_required", status_detail: "Could not decrypt stored credentials." })
      .eq("id", accountId);
    return { ok: false, error: "Could not decrypt stored credentials." };
  }
  return { ok: true, credentials: JSON.parse(decrypted) };
}

export interface SyncResult {
  newMessages: number;
  partial: boolean;
}

/** Syncs ONE mailbox the caller has already authorized and locked.
 * Identical logic to what email-sync/index.ts's handle() used to do
 * inline, from provider dispatch through cursor advancement — moved
 * here verbatim except for two contract changes needed to make it
 * reusable outside an HTTP handler: on a listMessages failure it now
 * THROWS (after making the exact same email_sync_state/email_accounts
 * failure writes it always did) instead of directly returning a
 * jsonResponse; on success it RETURNS {newMessages, partial} instead of
 * a jsonResponse. Both callers translate that back to their own
 * response/reporting shape — see email-sync/index.ts (preserves its
 * existing 200/502 HTTP shape exactly) and email-sync-scan/index.ts
 * (per-mailbox result entry, same shape as email-monitor's own loop). */
export async function syncOneMailbox(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  account: SyncAccount,
  // deno-lint-ignore no-explicit-any
  credentials: any,
): Promise<SyncResult> {
  // Phase 1 Option B — EXPERIMENTAL, defaulted OFF. Setting the
  // IMAP_WORKER_TEST_MODE secret to exactly "true" routes imap_smtp
  // syncs through imapRemoteAdapter (the Node worker) instead of
  // imapSmtpAdapter (in-process Deno ImapFlow) — used only for the
  // controlled test described in the Phase 1 investigation report. Any
  // other value, or the secret being unset entirely (the default,
  // production state), preserves today's exact behavior unchanged.
  const useImapWorker =
    account.provider === "imap_smtp" &&
    Deno.env.get("IMAP_WORKER_TEST_MODE") === "true";
  const adapter = useImapWorker
    ? imapRemoteAdapter
    : (ADAPTERS[account.provider as keyof typeof ADAPTERS] ?? imapSmtpAdapter);

  const { data: syncState } = await serviceClient
    .from("email_sync_state")
    .select("cursor, last_synced_at, consecutive_failures")
    .eq("email_account_id", account.id)
    .maybeSingle();

  let result: Awaited<ReturnType<EmailProviderAdapter["listMessages"]>>;
  try {
    const since = syncState?.cursor
      ? undefined
      : new Date(Date.now() - account.sync_window_days * 24 * 60 * 60 * 1000);
    result = await adapter.listMessages(credentials, {
      since,
      cursor: syncState?.cursor ?? undefined,
      limit: MAX_MESSAGES_PER_SYNC,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    await serviceClient
      .from("email_sync_state")
      .update({
        status: "failed",
        last_error: message,
        consecutive_failures: (syncState?.consecutive_failures ?? 0) + 1,
      })
      .eq("email_account_id", account.id);
    await serviceClient
      .from("email_accounts")
      .update({ status: "sync_failed", status_detail: message })
      .eq("id", account.id);
    throw new Error(message);
  }

  let newMessages = 0;
  // Tracks the cursor value up to which messages have actually been
  // WRITTEN, separate from result.nextCursor (which only means "fetched
  // from the provider"). If the wall-clock budget below cuts the loop
  // short, persisting result.nextCursor as-is would silently skip every
  // already-fetched-but-not-yet-written message on the next sync — this
  // variable is what prevents that data loss.
  let lastWrittenCursor: string | null = syncState?.cursor ?? null;
  const writeDeadline = Date.now() + SYNC_WALL_CLOCK_BUDGET_MS;
  let stoppedEarly = false;
  for (const msg of result.messages) {
    if (Date.now() > writeDeadline) {
      stoppedEarly = true;
      break;
    }
    const { data: messageRow, error: upsertError } = await serviceClient
      .from("email_messages")
      .upsert(
        {
          organization_id: account.organization_id,
          email_account_id: account.id,
          provider_message_id: msg.providerMessageId,
          provider_thread_id: msg.providerThreadId ?? null,
          // Phase 5 Email Operations — the real RFC822 Message-ID, only
          // ever what the adapter itself reported (never fabricated
          // here); null for messages an adapter doesn't yet capture it
          // for (see emailAdapter.ts's own field comment).
          provider_internet_message_id: msg.internetMessageId ?? null,
          from_address: msg.fromAddress,
          from_name: msg.fromName ?? null,
          to_addresses: msg.toAddresses,
          cc_addresses: msg.ccAddresses,
          subject: msg.subject ?? null,
          body_text: msg.bodyText ?? null,
          body_html: msg.bodyHtml ?? null,
          snippet: (msg.bodyText ?? msg.bodyHtml ?? "").slice(0, 240) || null,
          sent_at: msg.sentAt ?? null,
          is_read: msg.isRead,
          folder: msg.folder,
          has_attachments: msg.attachments.length > 0,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "email_account_id,provider_message_id" },
      )
      .select("id")
      .single();
    if (upsertError || !messageRow) continue; // one bad message must not fail the whole sync
    newMessages++;

    // Correctness fix (Phase 1 email-ingestion hardening): lastWrittenCursor
    // used to advance to this message right here, before its attachments
    // were processed at all — so a message whose attachment loop got cut
    // off by the deadline below was still permanently "past the cursor"
    // and could never be retried, leaving has_attachments=true with zero
    // email_attachments rows forever. It now only advances after the
    // attachment loop for THIS message finishes without being interrupted
    // (see `attachmentsInterrupted` below) — a message with no attachments
    // at all still advances immediately, since the loop body below simply
    // never executes for it.
    let attachmentsInterrupted = false;
    for (const att of msg.attachments) {
      // Re-checked per attachment, not just per message: a message with
      // several attachments could otherwise blow the budget without the
      // outer per-message check ever getting a chance to see it.
      if (Date.now() > writeDeadline) {
        attachmentsInterrupted = true;
        stoppedEarly = true;
        break;
      }
      // Live-verified need (see the Phase 1B deployment report): a real
      // attachment large enough pushed the whole invocation past the Edge
      // Function platform's own memory limit — a hard isolate kill that no
      // JS-level try/catch or setTimeout can protect against, since the
      // process is terminated from outside the V8 isolate entirely. The
      // adapter already knows the size from bodyStructure (no download
      // needed to find out), so checking it BEFORE ever pulling bytes into
      // memory avoids the crash instead of racing to recover from it.
      // 'skipped_too_large' is a processing_status the migration already
      // defined for exactly this case.
      const ATTACHMENT_MEMORY_CAP_BYTES = 8 * 1024 * 1024; // 8MB
      if (att.sizeBytes && att.sizeBytes > ATTACHMENT_MEMORY_CAP_BYTES) {
        // Idempotency guard (Phase 1 hardening): this outcome is
        // deterministic and pre-download (decided from att.sizeBytes
        // alone), so it has no content_hash to dedup on the way the
        // "stored"/upload-failure paths below do. Now that an interrupted
        // message can be legitimately revisited (see attachmentsInterrupted
        // above), without this check a retry would re-insert an identical
        // skipped_too_large row every single time this message is resynced.
        const { data: alreadySkipped } = await serviceClient
          .from("email_attachments")
          .select("id")
          .eq("email_message_id", messageRow.id)
          .eq("filename", att.filename)
          .eq("processing_status", "skipped_too_large")
          .limit(1)
          .maybeSingle();
        if (!alreadySkipped) {
          await serviceClient.from("email_attachments").insert({
            organization_id: account.organization_id,
            email_message_id: messageRow.id,
            filename: att.filename,
            mime_type: att.mimeType ?? null,
            size_bytes: att.sizeBytes,
            storage_path: "",
            processing_status: "skipped_too_large",
          });
        }
        continue;
      }

      // Dedup-aware storage (requirement #15): check for an existing
      // attachment with the same (organization_id, content_hash) before
      // downloading+uploading again. The hash can only be known AFTER
      // downloading, so this still fetches the bytes once per attachment
      // per sync run — the dedup saves the STORAGE write and the second
      // copy, not the provider round-trip (a provider-side dedup would
      // need the provider to expose a content hash up front, which none
      // of the three adapters' listMessages() results include).
      // Diagnostic breadcrumb only (filename/size, never content or
      // credentials) — if this specific step ever stalls again, the next
      // status check tells us exactly which attachment and how large,
      // instead of a bare "stuck at syncing" with no further signal.
      await serviceClient
        .from("email_sync_state")
        .update({
          last_error: `Downloading attachment "${att.filename}" (~${att.sizeBytes ?? "unknown"} bytes)...`,
        })
        .eq("email_account_id", account.id);

      let bytes: Uint8Array;
      try {
        bytes = await adapter.getAttachment(credentials, msg.providerMessageId, att.id);
      } catch {
        // Idempotency guard (Phase 1 hardening): a download failure has no
        // content_hash to dedup on (never reached), same reasoning as the
        // skipped_too_large guard above — without this, a deterministic
        // repeat failure (e.g. the provider genuinely can't serve this
        // attachment) would re-insert an identical "failed" row on every
        // retry of a message left incomplete by a sibling attachment.
        const { data: alreadyFailed } = await serviceClient
          .from("email_attachments")
          .select("id")
          .eq("email_message_id", messageRow.id)
          .eq("filename", att.filename)
          .eq("processing_status", "failed")
          .limit(1)
          .maybeSingle();
        if (!alreadyFailed) {
          await serviceClient.from("email_attachments").insert({
            organization_id: account.organization_id,
            email_message_id: messageRow.id,
            filename: att.filename,
            mime_type: att.mimeType ?? null,
            size_bytes: att.sizeBytes ?? null,
            storage_path: "",
            processing_status: "failed",
          });
        }
        continue;
      }
      const hash = await sha256Hex(bytes);

      // Recovery cleanup (Phase 1 hardening): this download just SUCCEEDED,
      // so any earlier "failed" marker for this same (message, filename)
      // from a prior interrupted-then-retried sync is now stale — it
      // predates hash computation (content_hash IS NULL is what scopes
      // this to genuine download-failure markers, never the storage-upload
      // -failure rows below, which already carry a content_hash and are
      // instead deduped by the content_hash check that follows). Without
      // this, a transient failure that later succeeds on retry would leave
      // both the stale "failed" row and the new "stored" row behind.
      await serviceClient
        .from("email_attachments")
        .delete()
        .eq("email_message_id", messageRow.id)
        .eq("filename", att.filename)
        .eq("processing_status", "failed")
        .is("content_hash", null);

      // Live-verified fix (see the Phase 1B deployment report): the
      // email_messages upsert dedups the MESSAGE row on repeated sync, but
      // this attachment insert below is a plain insert, not an upsert —
      // if this exact message's attachment is ever processed twice (a
      // crash-retry, a manual cursor reset, ...), it created a genuine
      // duplicate ROW even though the storage-reuse check further down
      // already prevented a duplicate FILE. Scoped to THIS message
      // specifically (not just org+hash) so a different message that
      // happens to share identical attachment content — e.g. a forward —
      // still correctly gets its own row.
      const { data: alreadyRecorded } = await serviceClient
        .from("email_attachments")
        .select("id")
        .eq("email_message_id", messageRow.id)
        .eq("content_hash", hash)
        .limit(1)
        .maybeSingle();
      if (alreadyRecorded) continue;

      const { data: existing } = await serviceClient
        .from("email_attachments")
        .select("storage_path")
        .eq("organization_id", account.organization_id)
        .eq("content_hash", hash)
        .limit(1)
        .maybeSingle();
      const storagePath =
        existing?.storage_path ||
        `${account.organization_id}/${messageRow.id}/${crypto.randomUUID()}-${att.filename}`;
      if (!existing) {
        let uploadError: { message: string } | null = null;
        try {
          const result = await withTimeout(
            serviceClient.storage.from("email-attachments").upload(storagePath, bytes, {
              contentType: att.mimeType || "application/octet-stream",
              upsert: false,
            }),
            20_000,
          );
          uploadError = result.error;
        } catch (err) {
          uploadError = {
            message: err instanceof Error ? err.message : "Upload timed out.",
          };
        }
        if (uploadError) {
          await serviceClient.from("email_attachments").insert({
            organization_id: account.organization_id,
            email_message_id: messageRow.id,
            filename: att.filename,
            mime_type: att.mimeType ?? null,
            // Live-verified fix (see the Phase 1B deployment report):
            // bodyStructure's att.sizeBytes is the provider's pre-download
            // estimate (often the base64-encoded transfer size, not the
            // decoded byte count) — once real `bytes` have actually been
            // downloaded, that's the authoritative size, not the estimate.
            size_bytes: bytes.byteLength,
            storage_path: "",
            content_hash: hash,
            processing_status: "failed",
          });
          continue;
        }
      }
      await serviceClient.from("email_attachments").insert({
        organization_id: account.organization_id,
        email_message_id: messageRow.id,
        filename: att.filename,
        mime_type: att.mimeType ?? null,
        size_bytes: bytes.byteLength,
        storage_path: storagePath,
        content_hash: hash,
        processing_status: "stored",
      });
    }

    if (attachmentsInterrupted) break; // deadline already passed — leave
    // this message as the resume point (lastWrittenCursor NOT advanced to
    // it) instead of looping to the top only to hit the same deadline
    // check again on the next message.

    lastWrittenCursor = msg.providerMessageId;
  }

  // Only advance the cursor past every fetched message when every fetched
  // message was actually written (loop completed normally). If the
  // wall-clock budget cut the write loop short, persist lastWrittenCursor
  // instead — see its declaration above for why using result.nextCursor
  // here in that case would silently skip unwritten messages forever.
  // (When the ADAPTER itself truncated — result.partial — result.nextCursor
  // is already correctly capped to what it actually fetched, so no
  // separate branch is needed for that case specifically.)
  const nextCursor = stoppedEarly ? lastWrittenCursor : result.nextCursor;
  // Phase 9G fix: this used to only reflect THIS loop's own write budget —
  // an adapter that itself returned a bounded, partial batch (see
  // imapSmtpAdapter.ts's pass-2 fix) was invisible here, so a mailbox with
  // more messages still pending than fit in one fetch would be reported
  // (and left) as fully synced. Folding in result.partial makes the
  // reported status/statusDetail honest either way, and — since
  // email_sync_state.cursor already correctly stops short of the
  // untouched messages via nextCursor above — the next natural tick still
  // picks up exactly where either kind of partial attempt left off.
  const partial = stoppedEarly || Boolean(result.partial);
  const statusDetail = partial
    ? `Partial sync: ${newMessages} message(s) processed so far. Next sync will continue.`
    : null;
  await serviceClient
    .from("email_sync_state")
    .update({
      status: "idle",
      last_synced_at: new Date().toISOString(),
      last_successful_sync_at: new Date().toISOString(),
      cursor: nextCursor,
      last_error: statusDetail,
      consecutive_failures: 0,
    })
    .eq("email_account_id", account.id);
  await serviceClient
    .from("email_accounts")
    .update({
      status: "connected",
      status_detail: statusDetail,
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  return { newMessages, partial };
}
