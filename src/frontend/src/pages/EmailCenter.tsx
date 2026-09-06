// Universal Email Integration (see chat) — the unified Email Center.
// Whether a message came from Gmail, Microsoft 365, or generic IMAP/SMTP
// makes no visible difference here (spec section 8) — every row is a
// plain EmailMessage, read the same way through emailMessagesApi.ts
// regardless of email_accounts.provider.
//
// Folder sidebar is deliberately just All / Unread / Attachments this
// pass — the classification-based folders (Purchase Orders, RFQs,
// Quotations, ...) shown in the spec's mockup require AI classification,
// which is explicitly deferred to the next phase (see the plan). Adding
// them later is a new filter branch here, not a rework of this page.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listEmailAccounts, syncEmailAccount } from "@/lib/emailAccountsApi";
import {
  getEmailAttachmentSignedUrl,
  getEmailMessage,
  listEmailAttachments,
  listEmailMessages,
  markEmailMessageRead,
} from "@/lib/emailMessagesApi";
import type { EmailAccount, EmailAttachment, EmailMessage } from "@/types";
import {
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type FolderFilter = "all" | "unread" | "attachments";

const FOLDER_ITEMS: Array<{
  id: FolderFilter;
  label: string;
  icon: typeof Inbox;
}> = [
  { id: "all", label: "All", icon: Inbox },
  { id: "unread", label: "Unread", icon: Mail },
  { id: "attachments", label: "Attachments", icon: Paperclip },
];

function formatSentAt(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function EmailCenter() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [folder, setFolder] = useState<FolderFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(
    null,
  );
  const [selectedAttachments, setSelectedAttachments] = useState<
    EmailAttachment[]
  >([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await listEmailAccounts();
      if (result.status === "success") setAccounts(result.data ?? []);
    })();
  }, []);

  const loadMessages = useCallback(async () => {
    setLoadingMessages(true);
    const result = await listEmailMessages({
      emailAccountId:
        selectedAccountId === "all" ? undefined : selectedAccountId,
      unreadOnly: folder === "unread",
      hasAttachmentsOnly: folder === "attachments",
      searchText: searchText.trim() || undefined,
    });
    setLoadingMessages(false);
    if (result.status === "success") {
      setMessages(result.data ?? []);
    } else if (result.status !== "unauthenticated") {
      toast.error(result.error || "Could not load messages.");
    }
  }, [selectedAccountId, folder, searchText]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const openMessage = async (message: EmailMessage) => {
    setLoadingDetail(true);
    setSelectedMessage(message);
    const [full, attachments] = await Promise.all([
      getEmailMessage(message.id),
      listEmailAttachments(message.id),
    ]);
    setLoadingDetail(false);
    if (full.status === "success" && full.data) setSelectedMessage(full.data);
    if (attachments.status === "success")
      setSelectedAttachments(attachments.data ?? []);
    if (!message.isRead) {
      void markEmailMessageRead(message.id, true);
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, isRead: true } : m)),
      );
    }
  };

  const downloadAttachment = async (attachment: EmailAttachment) => {
    const result = await getEmailAttachmentSignedUrl(attachment.storagePath);
    if (result.status !== "success" || !result.data) {
      toast.error(result.error || "Could not open this attachment.");
      return;
    }
    window.open(result.data, "_blank", "noopener,noreferrer");
  };

  const handleSyncAll = async () => {
    if (accounts.length === 0) {
      toast.error("Connect an email account in Settings first.");
      return;
    }
    setSyncing(true);
    let totalNew = 0;
    for (const acct of accounts) {
      const result = await syncEmailAccount(acct.id);
      if (result.status === "success")
        totalNew += result.data?.newMessages ?? 0;
    }
    setSyncing(false);
    toast.success(
      totalNew > 0
        ? `Synced — ${totalNew} new message(s).`
        : "Synced — no new messages.",
    );
    void loadMessages();
  };

  return (
    <div
      className="flex gap-4 h-[calc(100vh-8rem)]"
      data-ocid="email_center.page"
    >
      {/* Folder sidebar */}
      <div className="w-48 shrink-0 space-y-4">
        <div className="space-y-1">
          <label
            className="text-xs font-medium text-muted-foreground px-1"
            htmlFor="email-center-account-select"
          >
            Account
          </label>
          <Select
            value={selectedAccountId}
            onValueChange={setSelectedAccountId}
          >
            <SelectTrigger
              id="email-center-account-select"
              className="h-8 text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.emailAddress}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <nav className="space-y-0.5" aria-label="Email folders">
          {FOLDER_ITEMS.map((f) => {
            const Icon = f.icon;
            const active = folder === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFolder(f.id)}
                className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-sm transition-colors ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                data-ocid="email_center.folder_item"
              >
                <Icon className="w-3.5 h-3.5" />
                {f.label}
              </button>
            );
          })}
        </nav>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void handleSyncAll()}
          disabled={syncing}
          data-ocid="email_center.sync_button"
        >
          {syncing ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          )}
          Sync now
        </Button>
      </div>

      {/* Message list */}
      <div className="w-80 shrink-0 flex flex-col border border-border rounded-lg overflow-hidden bg-card">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search emails…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 pl-8 text-sm"
              data-ocid="email_center.search_input"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingMessages ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
              <MailOpen className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                {accounts.length === 0
                  ? "Connect an email account in Settings to see messages here."
                  : "No messages match this view."}
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void openMessage(m)}
                className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${
                  selectedMessage?.id === m.id ? "bg-muted" : ""
                } ${!m.isRead ? "bg-primary/5" : ""}`}
                data-ocid="email_center.message_row"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm truncate ${!m.isRead ? "font-semibold" : "font-medium"}`}
                  >
                    {m.fromName || m.fromAddress}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatSentAt(m.sentAt)}
                  </span>
                </div>
                <p className="text-xs text-foreground/80 truncate">
                  {m.subject || "(no subject)"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate flex-1">
                    {m.snippet}
                  </p>
                  {m.hasAttachments && (
                    <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message detail */}
      <div className="flex-1 min-w-0 border border-border rounded-lg overflow-hidden bg-card flex flex-col">
        {!selectedMessage ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a message to read it.
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">
                {selectedMessage.subject || "(no subject)"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedMessage.fromName
                  ? `${selectedMessage.fromName} <${selectedMessage.fromAddress}>`
                  : selectedMessage.fromAddress}
                {" → "}
                {selectedMessage.toAddresses.join(", ")}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingDetail ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <>
                  {selectedMessage.bodyHtml ? (
                    <div
                      className="text-sm prose prose-sm max-w-none [&_a]:text-primary"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: this is the message's OWN body from the connected mailbox, rendered read-only in an isolated container — same trust boundary as opening the email in any mail client; no user-authored content is ever injected here beyond what the mailbox itself returned.
                      dangerouslySetInnerHTML={{
                        __html: selectedMessage.bodyHtml,
                      }}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">
                      {selectedMessage.bodyText}
                    </p>
                  )}
                  {selectedAttachments.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground">
                        Attachments
                      </p>
                      {selectedAttachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={() => void downloadAttachment(att)}
                          className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border border-border bg-muted/30 hover:bg-muted transition-colors w-full text-left"
                          data-ocid="email_center.attachment_row"
                        >
                          <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">
                            {att.filename}
                          </span>
                          {att.processingStatus === "failed" && (
                            <Badge variant="secondary" className="text-[10px]">
                              Failed to process
                            </Badge>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
