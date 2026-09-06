// Universal Email Integration (see chat) — the Generic IMAP/SMTP adapter.
// Covers any standards-compliant provider: Hostinger, cPanel mail, Zoho
// (where generic access is permitted), and technically Gmail/Microsoft
// too via an app password, though those two have their own native OAuth
// adapters (googleAdapter.ts/microsoftAdapter.ts) as the preferred path.
//
// Uses ImapFlow, Nodemailer, and mailparser via Deno's native `npm:`
// specifier support (confirmed working — this adapter has been exercised
// against a real Hostinger mailbox, see the Phase 1B deployment report)
// rather than hand-rolling the IMAP/SMTP/MIME wire protocols from scratch —
// these are the standard, battle-tested Node libraries for exactly this
// job; a bespoke IMAP/MIME client here would be strictly worse engineering
// (more code, less tested, more edge cases silently wrong) for zero real
// benefit.

import { ImapFlow } from "npm:imapflow@1";
import nodemailer from "npm:nodemailer@6";
import { simpleParser } from "npm:mailparser@3";
import type {
  EmailAdapterMessage,
  EmailProviderAdapter,
  EmailProviderCredentials,
  ListMessagesOptions,
  ListMessagesResult,
  SendMessageInput,
} from "./emailAdapter.ts";

export interface ImapSmtpCredentials extends EmailProviderCredentials {
  imapHost: string;
  imapPort: number;
  imapEncryption: "ssl" | "starttls" | "none";
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: "ssl" | "starttls" | "none";
  username: string;
  password: string;
}

function isImapSmtpCreds(
  creds: EmailProviderCredentials,
): creds is ImapSmtpCredentials {
  return (
    typeof creds.imapHost === "string" && typeof creds.password === "string"
  );
}

// Live-verified need (see the Phase 1B deployment report): a stalled read
// on a real IMAP connection — a single slow/large message, a network path
// hiccup — can block `for await` indefinitely, since a deadline counter
// inside the loop only gets a chance to check anything BETWEEN
// already-yielded items. This wraps the whole operation so MY code stops
// waiting after `ms` regardless. Deliberately does NOT force the
// connection closed on timeout (an earlier version did — see
// openImapClient's socketTimeout comment for why that caused an uncaught
// exception instead of a clean failure); ImapFlow's own socketTimeout is
// what actually bounds and gracefully fails a stuck operation now, this is
// only a last-resort backstop for this code's own control flow.
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

function openImapClient(creds: ImapSmtpCredentials): ImapFlow {
  return new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapEncryption === "ssl",
    auth: { user: creds.username, pass: creds.password },
    logger: false,
    // Live-verified fix (see the Phase 1B deployment report): bounding a
    // slow operation by externally calling client.close() from OUTSIDE
    // ImapFlow's own control flow (this file's earlier withHardTimeout
    // approach) raced with ImapFlow's own internal cleanup and threw an
    // UNCAUGHT "Already logged out" exception from deep inside the
    // library — invisible to any try/catch or Promise.race in this file,
    // since it isn't a rejection on any promise being awaited here. Using
    // ImapFlow's OWN timeout options instead lets it fail its operations
    // gracefully, as a normal rejected promise this code can actually
    // catch.
    socketTimeout: 20_000,
    greetingTimeout: 15_000,
    // Live-verified fix (see the Phase 1B deployment report): the
    // "Already logged out" crash (authenticate() called from
    // startSession(), unprompted by any call this file makes) recurred
    // even after the socketTimeout fix above — its trace points to
    // ImapFlow's own automatic IDLE/session-keepalive machinery trying to
    // re-authenticate internally sometime after this code has already
    // called logout(). This adapter is polling-based by design
    // (capabilities.push is false — nothing here ever needs IMAP IDLE),
    // so disabling it entirely removes the actual trigger rather than
    // continuing to chase its symptom. Previously only applied when
    // imapEncryption === "none" (conflated with an unrelated STARTTLS
    // concern) — always on now, since IDLE is never wanted here
    // regardless of encryption mode.
    disableAutoIdle: true,
  });
}

// Phase 1 IMAP sync hardening (see the deployment report): a message's
// declared bodyStructure size — the sum of every leaf part's own `size`
// field — is available WITHOUT downloading anything. Used as the gate
// between pass 1 (always safe, metadata-only) and pass 2 (source fetch,
// skipped for anything over MAX_BODY_SOURCE_BYTES).
function estimateBodyStructureBytes(part: {
  size?: number;
  childNodes?: unknown[];
} | undefined): number {
  if (!part) return 0;
  let total = typeof part.size === "number" ? part.size : 0;
  for (const child of (part.childNodes as typeof part[]) ?? []) {
    total += estimateBodyStructureBytes(child);
  }
  return total;
}

const MAX_BODY_SOURCE_BYTES = 5 * 1024 * 1024; // 5MB — see the two-pass
// comment below for why this exists.

interface MessageMetadata {
  uid: number;
  envelope: {
    from?: Array<{ address?: string; name?: string }>;
    to?: Array<{ address?: string }>;
    cc?: Array<{ address?: string }>;
    subject?: string;
    date?: string | Date;
  } | undefined;
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
  const filename =
    part.dispositionParameters?.filename ?? part.parameters?.name;
  if (filename) {
    attachments.push({
      id: part.part ?? filename,
      filename,
      mimeType: part.type && part.subtype
        ? `${part.type}/${part.subtype}`
        : undefined,
      sizeBytes: part.size,
    });
  }
  for (const child of (part.childNodes as typeof part[]) ?? []) {
    walkAttachments(child, attachments);
  }
}

// The actual listMessages implementation — factored out of the adapter
// object so `listMessages()` itself can stay a thin `withHardTimeout(...)`
// wrapper around it (see that method below).
//
// Two-pass fetch (Phase 1 IMAP sync hardening — see the deployment
// report): a real large message pulled through the OLD single-fetch
// `source: true` design crashed the whole Edge Function isolate (memory
// pressure, no catchable error). The fix is to never fetch a message's
// raw MIME source before knowing it's safe to:
//   PASS 1 — one batched, cheap fetch: envelope + flags + uid +
//     bodyStructure for every matched message. bodyStructure alone gives
//     both the attachment list AND a real size estimate (sum of every
//     leaf part's own size field) — zero bytes of actual content
//     downloaded, so this pass is safe regardless of any message's real
//     size.
//   PASS 2 — sequential, one UID at a time, only for messages whose
//     estimated size clears MAX_BODY_SOURCE_BYTES: a second, separate
//     `client.fetch()` call for just that UID's `source`, parsed via
//     mailparser. Kept as a fully separate loop from pass 1 (not
//     interleaved with pass 1's own async iterator) — IMAP does not
//     guarantee a connection can safely handle a second FETCH command
//     issued while an earlier one's response stream is still being
//     consumed.
// A message over the cap, or whose pass-2 fetch itself fails, still gets
// its metadata + attachments recorded — it just keeps bodyText/bodyHtml
// empty, the same graceful-degradation shape already used for a
// mailparser parse failure. This is what satisfies "one oversized message
// must not prevent later messages from syncing."
async function imapListMessages(
  client: ImapFlow,
  opts: ListMessagesOptions,
): Promise<ListMessagesResult> {
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // cursor (when present) is the last-seen UID — IMAP UIDs are
      // strictly increasing per mailbox, so "UID > cursor" is a correct,
      // cheap incremental-sync filter. Falls back to a SINCE-date scan
      // for the very first sync (no cursor yet).
      const searchCriteria: Record<string, unknown> = opts.cursor
        ? { uid: `${Number(opts.cursor) + 1}:*` }
        : { since: opts.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
      let highestUid = opts.cursor ? Number(opts.cursor) : 0;
      let count = 0;
      // Live-verified need (see the Phase 1B deployment report): a real
      // mailbox's SINCE/UID search can match far more messages than
      // MAX_MESSAGES_PER_SYNC expects, and fetching+MIME-parsing each one
      // is genuinely slow. Without a wall-clock budget here, one sync
      // call can run past the Edge Function platform's own execution
      // limit and get killed mid-loop — no error, no partial write, the
      // browser just sees an opaque network failure and email_sync_state
      // is stuck at "syncing" forever. Breaking out early instead means:
      // whatever was collected up to the deadline is still returned (and
      // written by email-sync/index.ts) with a correctly-advanced cursor,
      // so the next "Sync now" click picks up exactly where this one
      // stopped — graceful partial progress, never a silent hang. (The
      // outer withHardTimeout() below is still the real backstop, since
      // this check only runs BETWEEN already-yielded messages.) Applied
      // to BOTH passes below.
      const deadline = Date.now() + 20_000;

      // PASS 1 — cheap, batched, metadata-only. No `source` requested.
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

      // PASS 2 — sequential, one UID at a time, gated by size. Body text
      // extracted via mailparser — a real MIME parser rather than a
      // hand-rolled multipart scanner, for the same "don't hand-roll what
      // a battle-tested library already solves" reasoning as
      // ImapFlow/Nodemailer themselves.
      const messages: EmailAdapterMessage[] = [];
      for (const rec of metadata) {
        let bodyText: string | undefined;
        let bodyHtml: string | undefined;
        if (rec.estimatedBytes <= MAX_BODY_SOURCE_BYTES && Date.now() <= deadline) {
          try {
            for await (const full of client.fetch(
              { uid: String(rec.uid) },
              { source: true },
            )) {
              if (full.source) {
                try {
                  const parsed = await simpleParser(full.source as Uint8Array);
                  bodyText = parsed.text || undefined;
                  bodyHtml =
                    typeof parsed.html === "string" ? parsed.html : undefined;
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
          providerThreadId: undefined, // see capabilities.threads note
          fromAddress: envelope?.from?.[0]?.address ?? "unknown@unknown",
          fromName: envelope?.from?.[0]?.name ?? undefined,
          toAddresses: (envelope?.to ?? [])
            .map((a: { address?: string }) => a.address)
            .filter((a): a is string => Boolean(a)),
          ccAddresses: (envelope?.cc ?? [])
            .map((a: { address?: string }) => a.address)
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
        nextCursor: highestUid > 0 ? String(highestUid) : opts.cursor ?? null,
      };
    } finally {
      lock.release();
    }
  } finally {
    try {
      // Phase 1 lifecycle fix — see testConnection's identical comment
      // above for the full reasoning (logout()'s response round-trip is
      // the window for the "Already logged out" crash; close() skips it).
      await client.close();
    } catch {
      // connection already gone
    }
  }
}

// A handful of common business-document MIME types — anything else is
// still stored (see database/phase-50: processing_status supports
// 'skipped_unsupported_type' for a future stricter policy, but this pass
// stores whatever the mailbox actually contains rather than silently
// dropping a real attachment the user would expect to see).
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB — matches every major
// provider's own outbound limit; nothing legitimate exceeds this.

export const imapSmtpAdapter: EmailProviderAdapter = {
  capabilities: {
    oauth: false,
    push: false,
    imap: true,
    smtp: true,
    labels: false,
    threads: false, // generic IMAP has no native thread concept; a later
    // pass can approximate threading from References/In-Reply-To headers
    // if needed — never fabricated here.
  },

  async testConnection(creds) {
    if (!isImapSmtpCreds(creds)) {
      return { ok: false, error: "Missing IMAP connection details." };
    }
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
        // Phase 1 lifecycle fix (see the investigation report): logout()
        // waits for the server's own LOGOUT response round-trip — the
        // exact window in which a stray/late response can hit ImapFlow's
        // unguarded initialOK() handler and re-enter startSession() on an
        // already-closed client, throwing "Already logged out" as an
        // uncaught exception outside anything this file can catch.
        // close() tears the connection down immediately without waiting
        // for that round-trip, removing the window entirely. Documented
        // public API (imapflow.com), not an internal — see
        // github.com/postalsys/imapflow/issues/28 for the same
        // logout()-vs-close() lesson independently reached by another
        // user hitting a related logout-time race.
        await client.close();
      } catch {
        // already closed / never fully opened — nothing to clean up
      }
    }
  },

  async listMessages(creds, opts: ListMessagesOptions): Promise<ListMessagesResult> {
    if (!isImapSmtpCreds(creds)) {
      throw new Error("Missing IMAP connection details.");
    }
    const client = openImapClient(creds);
    return withHardTimeout(imapListMessages(client, opts), 25_000);
  },

  async getAttachment(creds, providerMessageId, attachmentId) {
    if (!isImapSmtpCreds(creds)) {
      throw new Error("Missing IMAP connection details.");
    }
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
              throw new Error(
                `Attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit.`,
              );
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
          // Phase 1 lifecycle fix — see testConnection's identical comment
          // for the full reasoning.
          await client.close();
        } catch {
          // connection already gone
        }
      }
    };
    return withHardTimeout(doDownload(), 25_000);
  },

  async sendMessage(creds, message: SendMessageInput) {
    if (!isImapSmtpCreds(creds)) {
      throw new Error("Missing SMTP connection details.");
    }
    const transporter = nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: creds.smtpEncryption === "ssl",
      auth: { user: creds.username, pass: creds.password },
    });
    const info = await transporter.sendMail({
      from: creds.username,
      to: message.to.join(", "),
      cc: message.cc?.join(", "),
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml,
      inReplyTo: message.inReplyToProviderMessageId,
    });
    return { providerMessageId: info.messageId };
  },
};
