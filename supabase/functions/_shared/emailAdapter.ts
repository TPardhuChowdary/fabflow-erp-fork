// Universal Email Integration (see chat) — provider boundary.
//
// Same pattern as agent-chat/provider.ts's ChatProvider: index.ts (in
// email-connect/email-sync) depends on THIS interface, never on a
// provider's actual API/protocol directly. Adding a provider means
// writing one new file that implements EmailProviderAdapter, not touching
// the Edge Functions' own auth/request-validation/row-writing logic.
//
// Providers genuinely differ in what they can do (capabilities below) —
// this interface does not pretend every provider behaves identically
// (requirement: "Do not pretend all providers behave identically").
// `getAttachment`/`sendMessage` are typed as always-present methods (not
// optional) so every adapter must at least implement them; an adapter
// whose capabilities.smtp/imap is false should throw a clear
// "not supported by this provider" error from a method it can't
// genuinely perform, rather than the interface silently omitting it and
// every caller needing an `if (adapter.sendMessage)` check.

export interface EmailProviderCapabilities {
  oauth: boolean;
  push: boolean;
  imap: boolean;
  smtp: boolean;
  labels: boolean;
  threads: boolean;
}

/** Opaque to callers outside the adapter that produced it — an IMAP/SMTP
 * adapter's credentials are {username, password, imapHost, ...}, an OAuth
 * adapter's are {accessToken, refreshToken}. Never logged, never returned
 * from an Edge Function response body. */
export type EmailProviderCredentials = Record<string, unknown>;

export interface EmailAdapterMessage {
  providerMessageId: string;
  providerThreadId?: string;
  /** The RFC822 "Message-ID" header — Phase 5 Email Operations. Distinct
   * from providerMessageId (a provider-specific id/UID for sync cursor
   * and dedup) — this is the value a real reply's In-Reply-To/References
   * headers must reference for other mail clients to thread it
   * correctly. Undefined where an adapter doesn't (yet) capture it. */
  internetMessageId?: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  sentAt?: string; // ISO timestamp
  isRead: boolean;
  folder: string;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType?: string;
    sizeBytes?: number;
  }>;
}

export interface ListMessagesOptions {
  /** Only messages sent on/after this date — used for the initial sync
   * window (30/90/180 days) and as a floor even during incremental sync. */
  since?: Date;
  /** Provider-specific opaque resume token from email_sync_state.cursor —
   * an IMAP adapter might use a UIDNEXT value, an OAuth adapter a
   * historyId/deltaLink. Never interpreted by callers, only round-tripped. */
  cursor?: string;
  limit?: number;
  /** Phase 9G bounded-batching fix — internal per-call wall-clock budget
   * (ms) an adapter may use to bound how much fetching it does in one
   * listMessages() call, so a mailbox with many pending messages is
   * processed across several bounded calls (each with its own correctly
   * capped `nextCursor`) rather than one unbounded, all-or-nothing pass.
   * Optional; adapters that don't support bounded batching ignore it.
   * Exposed mainly so tests can exercise the stop-early path
   * deterministically and fast, without a real multi-second wait —
   * production callers should leave this unset (the adapter's own
   * default applies). */
  fetchDeadlineMs?: number;
}

export interface ListMessagesResult {
  messages: EmailAdapterMessage[];
  /** The new cursor to persist into email_sync_state for the next call —
   * null when the provider has no incremental-resume concept and a full
   * since-based re-scan is the only option. */
  nextCursor: string | null;
  /** Phase 9G — true when the adapter's own internal time budget ran out
   * before every candidate message could be fetched (bounded batching);
   * `nextCursor` is guaranteed to only cover messages actually included
   * in `messages`, so a caller can always resume correctly on the next
   * call. Optional — an adapter that never truncates (or hasn't been
   * updated to report this) simply omits it, which callers treat as
   * false. */
  partial?: boolean;
}

export interface SendMessageInput {
  to: string[];
  cc?: string[];
  // No bcc field — Phase 5 v1 explicitly does not support BCC; the
  // absence of the field is itself part of enforcing that (see
  // email_outbound_sends' matching absence of a bcc_addresses column).
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  /** The RFC822 Message-ID of the message being replied to (NOT a
   * provider UID) — sets the outgoing In-Reply-To header. Only ever
   * populated by a caller holding a real, non-null
   * email_messages.provider_internet_message_id; never fabricated. */
  inReplyToInternetMessageId?: string;
  /** Full References chain for proper thread grouping in real mail
   * clients — conventionally the prior References value plus the
   * immediate parent's Message-ID appended. Optional even for a reply:
   * a reply with no prior References still sets In-Reply-To alone. */
  references?: string[];
  /** Phase 5 v1: attachments are forwarded/attached by reference only
   * (email_outbound_sends.attachments), never as an arbitrary
   * LLM-supplied path — by the time a SendMessageInput reaches an
   * adapter, `content` is real bytes already fetched server-side by the
   * email-send Edge Function after re-validating organization/permission
   * against the source email_attachments row (see that function). */
  attachments?: Array<{
    filename: string;
    mimeType?: string;
    content: Uint8Array;
  }>;
}

export interface EmailProviderAdapter {
  readonly capabilities: EmailProviderCapabilities;
  /** Verifies the given credentials actually work against the real
   * provider — never returns ok:true without a genuine round-trip check
   * (e.g. an IMAP LOGIN, or an OAuth token-info call). This is what
   * email-connect calls before ever writing a row. */
  testConnection(
    creds: EmailProviderCredentials,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  listMessages(
    creds: EmailProviderCredentials,
    opts: ListMessagesOptions,
  ): Promise<ListMessagesResult>;
  getAttachment(
    creds: EmailProviderCredentials,
    providerMessageId: string,
    attachmentId: string,
  ): Promise<Uint8Array>;
  sendMessage(
    creds: EmailProviderCredentials,
    message: SendMessageInput,
  ): Promise<{ providerMessageId: string }>;
}
