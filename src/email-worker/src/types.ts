// Phase 1 Option B experimental worker — wire types.
//
// These mirror supabase/functions/_shared/emailAdapter.ts's
// EmailAdapterMessage / ListMessagesOptions / ListMessagesResult exactly,
// by hand — this Node package and the Deno Edge Functions are separate
// runtimes with separate module systems, so there is no way to import one
// file into the other. If emailAdapter.ts's shapes ever change, these must
// be updated to match. Keeping this file intentionally tiny (just the
// wire shapes, nothing else) minimizes that maintenance surface.

export interface ImapSmtpCredentials {
  imapHost: string;
  imapPort: number;
  imapEncryption: "ssl" | "starttls" | "none";
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: "ssl" | "starttls" | "none";
  username: string;
  password: string;
}

export interface EmailAdapterAttachment {
  id: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
}

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
  sentAt?: string;
  isRead: boolean;
  folder: string;
  attachments: EmailAdapterAttachment[];
}

export interface ListMessagesOptions {
  since?: string; // ISO date string over the wire (Date doesn't survive JSON)
  cursor?: string;
  limit?: number;
}

export interface ListMessagesResult {
  messages: EmailAdapterMessage[];
  nextCursor: string | null;
}
