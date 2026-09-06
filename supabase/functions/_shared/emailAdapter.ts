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
}

export interface ListMessagesResult {
  messages: EmailAdapterMessage[];
  /** The new cursor to persist into email_sync_state for the next call —
   * null when the provider has no incremental-resume concept and a full
   * since-based re-scan is the only option. */
  nextCursor: string | null;
}

export interface SendMessageInput {
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyToProviderMessageId?: string;
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
