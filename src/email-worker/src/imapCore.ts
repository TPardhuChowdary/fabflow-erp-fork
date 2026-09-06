// Phase 1 Option B experimental worker — IMAP core.
//
// This is a port of supabase/functions/_shared/imapSmtpAdapter.ts's
// testConnection/listMessages/getAttachment logic into a real Node.js
// runtime, kept as close to line-for-line identical as practical. The
// entire purpose of this port is to test one specific hypothesis: that
// the reproducible "Already logged out" ImapFlow uncaught-exception crash
// (authenticate() called from startSession() on an already-closed client)
// is specific to running ImapFlow under Supabase Edge/Deno, and does not
// occur when the exact same logic runs in the real Node.js environment
// ImapFlow is actually built and tested for (it underpins the maintainer's
// own commercial EmailEngine product, which runs as a persistent Node
// service, never Deno).
//
// Deliberately excluded from this port (see the Phase 1 spec): SMTP
// sending (sendMessage/nodemailer) — this worker only performs the IMAP
// read operations the current EmailProviderAdapter interface's
// experimental remote path needs. imapRemoteAdapter.ts's own sendMessage()
// throws a clear "not implemented" error rather than silently doing
// nothing, matching this codebase's established "never pretend a
// capability exists" convention (see emailAdapter.ts's own header comment).

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type {
  EmailAdapterMessage,
  ImapSmtpCredentials,
  ListMessagesOptions,
  ListMessagesResult,
} from "./types.js";

function openImapClient(creds: ImapSmtpCredentials): ImapFlow {
  return new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapEncryption === "ssl",
    auth: { user: creds.username, pass: creds.password },
    logger: false,
    // Ported unchanged from imapSmtpAdapter.ts's own hard-won lifecycle
    // fixes (see that file's header for the full history): close()
    // instead of logout() in every cleanup path below, plus these
    // timeouts and disableAutoIdle. None of these individually eliminated
    // the crash under Deno — they're kept here because they're still
    // correct, defensive practice regardless of runtime, and because this
    // port is deliberately "as close as practical" to the original rather
    // than a redesign.
    socketTimeout: 20_000,
    greetingTimeout: 15_000,
    disableAutoIdle: true,
  });
}

// Live-verified need (see the Phase 1 deployment reports): a stalled read
// on a real IMAP connection can block `for await` indefinitely, since a
// deadline counter inside the loop only gets a chance to check anything
// BETWEEN already-yielded items. This wraps the whole operation so this
// code stops waiting after `ms` regardless.
function withHardTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`IMAP operation timed out after ${ms}ms`)),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Phase 1 IMAP sync hardening: a message's declared bodyStructure size —
// the sum of every leaf part's own `size` field — is available WITHOUT
// downloading anything. Used as the gate between pass 1 (always safe,
// metadata-only) and pass 2 (source fetch, skipped for anything over
// MAX_BODY_SOURCE_BYTES).
function estimateBodyStructureBytes(
  part: { size?: number; childNodes?: unknown[] } | undefined,
): number {
  if (!part) return 0;
  let total = typeof part.size === "number" ? part.size : 0;
  for (const child of (part.childNodes as typeof part[]) ?? []) {
    total += estimateBodyStructureBytes(child);
  }
  return total;
}

const MAX_BODY_SOURCE_BYTES = 5 * 1024 * 1024; // 5MB — see the two-pass note below.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB — matches every major provider's own outbound limit.

interface MessageMetadata {
  uid: number;
  envelope:
    | {
        from?: Array<{ address?: string; name?: string }>;
        to?: Array<{ address?: string }>;
        cc?: Array<{ address?: string }>;
        subject?: string;
        date?: string | Date;
      }
    | undefined;
  flags: Set<string> | undefined;
  attachments: EmailAdapterMessage["attachments"];
  estimatedBytes: number;
}

// ImapFlow's bodyStructure walk for attachment parts — only parts with a
// real filename (disposition/name) are treated as attachments; inline
// text/html parts are the message body, handled separately via pass 2's
// source fetch below.
function walkAttachments(
  part: {
    dispositionParameters?: Record<string, string>;
    parameters?: Record<string, string>;
    type?: string;
    subtype?: string;
    size?: number;
    part?: string;
    childNodes?: unknown[];
  },
  attachments: EmailAdapterMessage["attachments"],
) {
  const filename = part.dispositionParameters?.filename ?? part.parameters?.name;
  if (filename) {
    attachments.push({
      id: part.part ?? filename,
      filename,
      mimeType: part.type && part.subtype ? `${part.type}/${part.subtype}` : undefined,
      sizeBytes: part.size,
    });
  }
  for (const child of (part.childNodes as typeof part[]) ?? []) {
    walkAttachments(child, attachments);
  }
}

// Two-pass fetch (ported unchanged from imapSmtpAdapter.ts — see that
// file's own comment for the full reasoning): PASS 1 is one batched,
// cheap fetch (envelope + flags + uid + bodyStructure, no `source`) that
// is safe regardless of any message's real size. PASS 2 is sequential,
// one UID at a time, only for messages under MAX_BODY_SOURCE_BYTES — kept
// as a fully separate loop from pass 1, never interleaved with pass 1's
// own async iterator.
async function imapListMessages(
  client: ImapFlow,
  opts: ListMessagesOptions,
): Promise<ListMessagesResult> {
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const searchCriteria: Record<string, unknown> = opts.cursor
        ? { uid: `${Number(opts.cursor) + 1}:*` }
        : { since: opts.since ? new Date(opts.since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
      let highestUid = opts.cursor ? Number(opts.cursor) : 0;
      let count = 0;
      const deadline = Date.now() + 20_000;

      // PASS 1
      const metadata: MessageMetadata[] = [];
      for await (const msg of client.fetch(searchCriteria, {
        envelope: true,
        flags: true,
        uid: true,
        bodyStructure: true,
      })) {
        if (opts.limit && count >= opts.limit) break;
        if (Date.now() > deadline) break;
        count++;
        highestUid = Math.max(highestUid, msg.uid);
        const attachments: EmailAdapterMessage["attachments"] = [];
        if (msg.bodyStructure) {
          walkAttachments(
            msg.bodyStructure as unknown as Parameters<typeof walkAttachments>[0],
            attachments,
          );
        }
        metadata.push({
          uid: msg.uid,
          envelope: msg.envelope,
          flags: msg.flags,
          attachments,
          estimatedBytes: estimateBodyStructureBytes(
            msg.bodyStructure as unknown as Parameters<typeof estimateBodyStructureBytes>[0],
          ),
        });
      }

      // PASS 2
      const messages: EmailAdapterMessage[] = [];
      for (const rec of metadata) {
        let bodyText: string | undefined;
        let bodyHtml: string | undefined;
        if (rec.estimatedBytes <= MAX_BODY_SOURCE_BYTES && Date.now() <= deadline) {
          try {
            for await (const full of client.fetch({ uid: String(rec.uid) }, { source: true })) {
              if (full.source) {
                try {
                  const parsed = await simpleParser(full.source as Buffer);
                  bodyText = parsed.text || undefined;
                  bodyHtml = typeof parsed.html === "string" ? parsed.html : undefined;
                } catch {
                  // unparseable body — metadata/attachments still recorded
                }
              }
            }
          } catch {
            // this one message's source fetch failed/timed out — leave
            // its body empty and continue; never aborts the whole sync
          }
        }

        const envelope = rec.envelope;
        messages.push({
          providerMessageId: String(rec.uid),
          providerThreadId: undefined,
          fromAddress: envelope?.from?.[0]?.address ?? "unknown@unknown",
          fromName: envelope?.from?.[0]?.name ?? undefined,
          toAddresses: (envelope?.to ?? [])
            .map((a) => a.address)
            .filter((a): a is string => Boolean(a)),
          ccAddresses: (envelope?.cc ?? [])
            .map((a) => a.address)
            .filter((a): a is string => Boolean(a)),
          subject: envelope?.subject ?? undefined,
          bodyText,
          bodyHtml,
          sentAt: envelope?.date ? new Date(envelope.date).toISOString() : undefined,
          isRead: (rec.flags ?? new Set()).has("\\Seen"),
          folder: "inbox",
          attachments: rec.attachments,
        });
      }

      return {
        messages,
        nextCursor: highestUid > 0 ? String(highestUid) : (opts.cursor ?? null),
      };
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.close();
    } catch {
      // connection already gone
    }
  }
}

export async function testConnection(
  creds: ImapSmtpCredentials,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = openImapClient(creds);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "IMAP connection failed.",
    };
  } finally {
    try {
      await client.close();
    } catch {
      // already closed / never fully opened — nothing to clean up
    }
  }
}

export async function listMessages(
  creds: ImapSmtpCredentials,
  opts: ListMessagesOptions,
): Promise<ListMessagesResult> {
  const client = openImapClient(creds);
  return withHardTimeout(imapListMessages(client, opts), 25_000);
}

export async function getAttachment(
  creds: ImapSmtpCredentials,
  providerMessageId: string,
  attachmentId: string,
): Promise<Uint8Array> {
  const client = openImapClient(creds);
  const doDownload = async (): Promise<Uint8Array> => {
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uid = Number(providerMessageId);
        const download = await client.download(uid, attachmentId, { uid: true });
        const chunks: Uint8Array[] = [];
        let total = 0;
        for await (const chunk of download.content) {
          total += chunk.length;
          if (total > MAX_ATTACHMENT_BYTES) {
            throw new Error(`Attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit.`);
          }
          chunks.push(chunk);
        }
        const combined = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        return combined;
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.close();
      } catch {
        // connection already gone
      }
    }
  };
  return withHardTimeout(doDownload(), 25_000);
}
