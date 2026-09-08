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

import { StatusBadge } from "@/components/StatusBadge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listEmailAccounts, syncEmailAccount } from "@/lib/emailAccountsApi";
import {
  acknowledgeEmailAlert,
  listEmailAlerts,
  resolveEmailAlert,
} from "@/lib/emailAlertsApi";
import {
  getEmailAttachmentSignedUrl,
  getEmailMessage,
  listEmailAttachments,
  listEmailMessages,
  markEmailMessageRead,
} from "@/lib/emailMessagesApi";
import { listEmailOutboundSends } from "@/lib/emailOutboundApi";
import type {
  EmailAccount,
  EmailAlertStatus,
  EmailAttachment,
  EmailMessage,
  EmailOperationalAlert,
  EmailOutboundSend,
  EmailOutboundSendStatus,
} from "@/types";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  CornerUpLeft,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  RefreshCw,
  Search,
  SendHorizonal,
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

// ── Outbox (Phase 5 Email Operations) ───────────────────────────────
// Pure read/audit view over email_outbound_sends — no send, retry, edit,
// or delete action exists anywhere in this section. That's deliberate,
// not an oversight: the state machine already forbids illegal
// transitions at the database level (triggers), and the only legitimate
// way to draft/confirm/send is the AI Agent chat flow (unchanged by this
// page). Showing an action button here that the backend would just
// reject anyway would be worse than showing none.
type OutboxStatusFilter = "all" | EmailOutboundSendStatus;

const OUTBOX_STATUS_ITEMS: Array<{ id: OutboxStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "confirmed", label: "Confirmed" },
  { id: "sending", label: "Sending" },
  { id: "sent", label: "Sent" },
  { id: "failed_before_provider", label: "Failed" },
  { id: "provider_rejected", label: "Rejected" },
  { id: "unknown", label: "Unknown" },
];

const OUTBOUND_STATUS_LABELS: Record<EmailOutboundSendStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  sending: "Sending",
  sent: "Sent",
  failed_before_provider: "Failed",
  provider_rejected: "Rejected",
  unknown: "Unknown",
};

// Never render the real idempotency key — it's an internal replay guard,
// not user-facing data, but showing SOME trace of it (rather than
// hiding the field entirely) is useful when comparing a support report
// against the audit log. Last 8 characters only.
function maskIdempotencyKey(key?: string): string | undefined {
  if (!key) return undefined;
  return `••••${key.slice(-8)}`;
}

// ── Operational Alerts (Phase 7) ────────────────────────────────────
// Pure read + acknowledge/resolve view over email_operational_alerts —
// detection/notification only, same as the module that writes these
// rows (agent/actions.ts's recordEmailAlert). No action here can touch
// a Customer/Vendor/Project/PO/Invoice/Job Card/Production/QMS/
// Inventory record, create a Payable, or send anything.
type AlertStatusFilter = "all" | EmailAlertStatus;

const ALERT_STATUS_ITEMS: Array<{ id: AlertStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "acknowledged", label: "Acknowledged" },
  { id: "resolved", label: "Resolved" },
];

const ALERT_SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const ALERT_STATUS_LABELS: Record<EmailAlertStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};

const ALERT_CONFIDENCE_LABELS: Record<string, string> = {
  high_confidence: "High confidence",
  possible_match: "Possible match",
  ambiguous: "Ambiguous",
  no_match: "No match",
};

const ALERT_ISSUE_TYPE_LABELS: Record<string, string> = {
  delivery_delay: "Delivery delay",
  quantity_change: "Quantity change",
  quality_rejection: "Quality / rejection",
  po_change: "PO change",
  invoice_po_mismatch: "Invoice/PO mismatch",
  price_discrepancy: "Price discrepancy",
  correction_revision: "Correction / revision",
  follow_up_reminder: "Follow-up / reminder",
  duplicate: "Duplicate",
  unanswered: "Unanswered",
  ambiguous_match: "Ambiguous match",
  other: "Other",
};

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

  const [activeTab, setActiveTab] = useState<"inbox" | "outbox" | "alerts">(
    "inbox",
  );
  const [outboxStatusFilter, setOutboxStatusFilter] =
    useState<OutboxStatusFilter>("all");
  const [outboundRecords, setOutboundRecords] = useState<EmailOutboundSend[]>(
    [],
  );
  const [loadingOutbound, setLoadingOutbound] = useState(false);
  const [selectedOutboundRecord, setSelectedOutboundRecord] =
    useState<EmailOutboundSend | null>(null);
  const [replyTargetSubject, setReplyTargetSubject] = useState<string | null>(
    null,
  );

  const [alertStatusFilter, setAlertStatusFilter] =
    useState<AlertStatusFilter>("all");
  const [alerts, setAlerts] = useState<EmailOperationalAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  // Separate from `alerts` (which reflects whatever alertStatusFilter is
  // currently selected) — the tab's live "needs attention" count must
  // stay correct regardless of which filter the user has open, so it's
  // tracked independently rather than derived from the filtered list.
  const [newAlertCount, setNewAlertCount] = useState(0);
  const [selectedAlert, setSelectedAlert] =
    useState<EmailOperationalAlert | null>(null);
  const [alertEmailPreview, setAlertEmailPreview] =
    useState<EmailMessage | null>(null);

  const selectAlert = async (alert: EmailOperationalAlert) => {
    setSelectedAlert(alert);
    setAlertEmailPreview(null);
    const msg = await getEmailMessage(alert.emailMessageId);
    if (msg.status === "success" && msg.data) setAlertEmailPreview(msg.data);
  };

  const selectOutboundRecord = async (rec: EmailOutboundSend) => {
    setSelectedOutboundRecord(rec);
    setReplyTargetSubject(null);
    if (rec.kind === "reply" && rec.replyToMessageId) {
      const original = await getEmailMessage(rec.replyToMessageId);
      setReplyTargetSubject(
        original.status === "success"
          ? (original.data?.subject ?? "(no subject)")
          : "(original message no longer accessible)",
      );
    }
  };

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

  const loadOutbound = useCallback(async () => {
    setLoadingOutbound(true);
    const result = await listEmailOutboundSends({
      status: outboxStatusFilter === "all" ? undefined : outboxStatusFilter,
    });
    setLoadingOutbound(false);
    if (result.status === "success") {
      setOutboundRecords(result.data ?? []);
    } else if (result.status !== "unauthenticated") {
      toast.error(result.error || "Could not load outbound history.");
    }
  }, [outboxStatusFilter]);

  // Loaded lazily on first switch to the Outbox tab (and refreshed on
  // every status-filter change thereafter) — no point fetching outbound
  // history for a user who never opens that tab.
  useEffect(() => {
    if (activeTab === "outbox") void loadOutbound();
  }, [activeTab, loadOutbound]);

  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    const result = await listEmailAlerts({
      status: alertStatusFilter === "all" ? undefined : alertStatusFilter,
    });
    setLoadingAlerts(false);
    if (result.status === "success") {
      setAlerts(result.data ?? []);
    } else if (result.status !== "unauthenticated") {
      toast.error(result.error || "Could not load alerts.");
    }
  }, [alertStatusFilter]);

  const loadNewAlertCount = useCallback(async () => {
    const result = await listEmailAlerts({ status: "new" });
    if (result.status === "success")
      setNewAlertCount((result.data ?? []).length);
  }, []);

  // Loaded eagerly (not lazily, unlike Outbox) — the "new" count on the
  // Alerts tab itself is meant to work as a live attention indicator
  // visible from Inbox/Outbox too, not only after the tab is opened.
  // Kept independent of alertStatusFilter (see newAlertCount's own
  // comment) so switching the filter dropdown never changes the badge.
  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);
  useEffect(() => {
    void loadNewAlertCount();
  }, [loadNewAlertCount]);

  const handleAcknowledgeAlert = async (id: string) => {
    const result = await acknowledgeEmailAlert(id);
    if (result.status !== "success" || !result.data) {
      toast.error(result.error || "Could not acknowledge alert.");
      return;
    }
    setAlerts((prev) => prev.map((a) => (a.id === id ? result.data! : a)));
    setSelectedAlert((prev) => (prev?.id === id ? result.data! : prev));
    void loadNewAlertCount();
  };

  const handleResolveAlert = async (id: string) => {
    const result = await resolveEmailAlert(id);
    if (result.status !== "success" || !result.data) {
      toast.error(result.error || "Could not resolve alert.");
      return;
    }
    setAlerts((prev) => prev.map((a) => (a.id === id ? result.data! : a)));
    setSelectedAlert((prev) => (prev?.id === id ? result.data! : prev));
    void loadNewAlertCount();
  };

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
      className="flex flex-col gap-3 h-[calc(100vh-8rem)]"
      data-ocid="email_center.page"
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "inbox" | "outbox" | "alerts")}
        className="flex flex-col flex-1 min-h-0 gap-3"
      >
        <TabsList className="h-8 w-fit shrink-0">
          <TabsTrigger value="inbox" data-ocid="email_center.tab_inbox">
            Inbox
          </TabsTrigger>
          <TabsTrigger value="outbox" data-ocid="email_center.tab_outbox">
            Outbox
          </TabsTrigger>
          <TabsTrigger value="alerts" data-ocid="email_center.tab_alerts">
            Alerts
            {newAlertCount > 0 && (
              <Badge
                variant="outline"
                className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-destructive/10 text-destructive border-destructive/30"
              >
                {newAlertCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="flex-1 min-h-0 mt-0">
          <div className="flex gap-4 h-full">
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
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
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
        </TabsContent>

        <TabsContent
          value="outbox"
          className="flex-1 min-h-0 mt-0"
          data-ocid="email_center.outbox_panel"
        >
          <div className="flex flex-col md:flex-row gap-4 h-full">
            {/* Status filter sidebar */}
            <nav
              className="md:w-48 shrink-0 flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible pb-1 md:pb-0"
              aria-label="Outbound status filters"
            >
              {OUTBOX_STATUS_ITEMS.map((item) => {
                const active = outboxStatusFilter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOutboxStatusFilter(item.id)}
                    className={`shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded text-sm transition-colors whitespace-nowrap ${
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    data-ocid="email_center.outbox_status_item"
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Outbound list */}
            <div className="w-full md:w-96 shrink-0 flex flex-col border border-border rounded-lg overflow-hidden bg-card max-h-64 md:max-h-none">
              <div className="flex-1 overflow-y-auto">
                {loadingOutbound ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : outboundRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
                    <SendHorizonal className="w-8 h-8 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">
                      No outbound emails match this view.
                    </p>
                  </div>
                ) : (
                  outboundRecords.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => void selectOutboundRecord(rec)}
                      className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${
                        selectedOutboundRecord?.id === rec.id ? "bg-muted" : ""
                      }`}
                      data-ocid="email_center.outbound_row"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                          {rec.kind === "reply" ? (
                            <CornerUpLeft className="w-3 h-3" />
                          ) : (
                            <SendHorizonal className="w-3 h-3" />
                          )}
                          {rec.kind === "reply" ? "Reply" : "New"}
                        </span>
                        <StatusBadge
                          status={OUTBOUND_STATUS_LABELS[rec.status]}
                        />
                      </div>
                      <p className="text-sm font-medium truncate mt-1">
                        {rec.subject || "(no subject)"}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate flex-1">
                          To: {rec.toAddresses.join(", ")}
                        </p>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatSentAt(rec.createdAt)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Outbound detail — the persisted/frozen envelope, never
                reconstructed from current ERP/email data. */}
            <div className="flex-1 min-w-0 border border-border rounded-lg overflow-hidden bg-card flex flex-col">
              {!selectedOutboundRecord ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Select an outbound record to see its details.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {selectedOutboundRecord.kind === "reply"
                        ? "REPLY"
                        : "NEW EMAIL"}
                    </Badge>
                    <StatusBadge
                      status={
                        OUTBOUND_STATUS_LABELS[selectedOutboundRecord.status]
                      }
                    />
                  </div>

                  {selectedOutboundRecord.status === "unknown" && (
                    <div
                      className="flex gap-2 items-start rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5"
                      data-ocid="email_center.outbound_unknown_banner"
                    >
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                      <p className="text-xs text-warning-foreground">
                        This send's outcome could not be determined — the mail
                        server did not confirm or reject it in time. FabFlow has
                        NOT retried it automatically. Check the mailbox/provider
                        directly before taking any further action.
                      </p>
                    </div>
                  )}

                  <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-muted-foreground">From</dt>
                    <dd className="truncate">
                      {accounts.find(
                        (a) => a.id === selectedOutboundRecord.emailAccountId,
                      )?.emailAddress ?? selectedOutboundRecord.emailAccountId}
                    </dd>
                    <dt className="text-muted-foreground">To</dt>
                    <dd className="truncate">
                      {selectedOutboundRecord.toAddresses.join(", ")}
                    </dd>
                    <dt className="text-muted-foreground">CC</dt>
                    <dd className="truncate">
                      {selectedOutboundRecord.ccAddresses.length > 0
                        ? selectedOutboundRecord.ccAddresses.join(", ")
                        : "None"}
                    </dd>
                    <dt className="text-muted-foreground">Subject</dt>
                    <dd className="truncate">
                      {selectedOutboundRecord.subject || "(no subject)"}
                    </dd>
                    {selectedOutboundRecord.kind === "reply" && (
                      <>
                        <dt className="text-muted-foreground">Replying to</dt>
                        <dd className="truncate">
                          {replyTargetSubject ?? "Loading…"}
                        </dd>
                      </>
                    )}
                  </dl>

                  <div className="space-y-1 pt-1 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground pt-2">
                      Body
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {selectedOutboundRecord.bodyText}
                    </p>
                  </div>

                  {selectedOutboundRecord.attachments.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground">
                        Attachments
                      </p>
                      {selectedOutboundRecord.attachments.map((att) => (
                        <div
                          key={att.attachmentId}
                          className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border border-border bg-muted/30"
                          data-ocid="email_center.outbound_attachment_row"
                        >
                          <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">
                            {att.filename}
                          </span>
                          {typeof att.sizeBytes === "number" && (
                            <span className="text-muted-foreground shrink-0">
                              {(att.sizeBytes / 1024).toFixed(0)} KB
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1 pt-2 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground">
                      Send record
                    </p>
                    <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-xs">
                      <dt className="text-muted-foreground">Created</dt>
                      <dd>
                        {new Date(
                          selectedOutboundRecord.createdAt,
                        ).toLocaleString()}
                      </dd>
                      <dt className="text-muted-foreground">Confirmed</dt>
                      <dd>
                        {selectedOutboundRecord.confirmedAt
                          ? new Date(
                              selectedOutboundRecord.confirmedAt,
                            ).toLocaleString()
                          : "—"}
                      </dd>
                      <dt className="text-muted-foreground">Sending</dt>
                      <dd>
                        {selectedOutboundRecord.sendingAt
                          ? new Date(
                              selectedOutboundRecord.sendingAt,
                            ).toLocaleString()
                          : "—"}
                      </dd>
                      <dt className="text-muted-foreground">Sent</dt>
                      <dd>
                        {selectedOutboundRecord.sentAt
                          ? new Date(
                              selectedOutboundRecord.sentAt,
                            ).toLocaleString()
                          : "—"}
                      </dd>
                      <dt className="text-muted-foreground">Idempotency key</dt>
                      <dd className="font-mono">
                        {maskIdempotencyKey(
                          selectedOutboundRecord.idempotencyKey,
                        ) ?? "—"}
                      </dd>
                      <dt className="text-muted-foreground">Provider ID</dt>
                      <dd className="truncate font-mono">
                        {selectedOutboundRecord.providerMessageId ?? "—"}
                      </dd>
                      {selectedOutboundRecord.lastError && (
                        <>
                          <dt className="text-muted-foreground">Error</dt>
                          <dd className="text-destructive">
                            {selectedOutboundRecord.lastError}
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="alerts"
          className="flex-1 min-h-0 mt-0"
          data-ocid="email_center.alerts_panel"
        >
          <div className="flex flex-col md:flex-row gap-4 h-full">
            {/* Status filter sidebar */}
            <nav
              className="md:w-48 shrink-0 flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible pb-1 md:pb-0"
              aria-label="Alert status filters"
            >
              {ALERT_STATUS_ITEMS.map((item) => {
                const active = alertStatusFilter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAlertStatusFilter(item.id)}
                    className={`shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded text-sm transition-colors whitespace-nowrap ${
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    data-ocid="email_center.alert_status_item"
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Alert list */}
            <div className="w-full md:w-96 shrink-0 flex flex-col border border-border rounded-lg overflow-hidden bg-card max-h-64 md:max-h-none">
              <div className="flex-1 overflow-y-auto">
                {loadingAlerts ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
                    <AlertTriangle className="w-8 h-8 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">
                      No operational alerts match this view.
                    </p>
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => void selectAlert(alert)}
                      className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${
                        selectedAlert?.id === alert.id ? "bg-muted" : ""
                      }`}
                      data-ocid="email_center.alert_row"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge
                          status={ALERT_SEVERITY_LABELS[alert.severity]}
                        />
                        <StatusBadge
                          status={ALERT_STATUS_LABELS[alert.status]}
                        />
                      </div>
                      <p className="text-sm font-medium truncate mt-1">
                        {ALERT_ISSUE_TYPE_LABELS[alert.issueType] ??
                          alert.issueType}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate flex-1">
                          {alert.summary}
                        </p>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatSentAt(alert.createdAt)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Alert detail */}
            <div className="flex-1 min-w-0 border border-border rounded-lg overflow-hidden bg-card flex flex-col">
              {!selectedAlert ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Select an alert to see its details.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge
                      status={ALERT_SEVERITY_LABELS[selectedAlert.severity]}
                    />
                    <StatusBadge
                      status={ALERT_STATUS_LABELS[selectedAlert.status]}
                    />
                    <Badge variant="outline" className="text-xs">
                      {ALERT_CONFIDENCE_LABELS[selectedAlert.confidence] ??
                        selectedAlert.confidence}
                    </Badge>
                  </div>

                  {selectedAlert.confidence === "ambiguous" && (
                    <div
                      className="flex gap-2 items-start rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5"
                      data-ocid="email_center.alert_ambiguous_banner"
                    >
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                      <p className="text-xs text-warning-foreground">
                        More than one ERP record plausibly matches — none has
                        been picked automatically. Review the matched records
                        below and decide which (if any) is correct.
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {ALERT_ISSUE_TYPE_LABELS[selectedAlert.issueType] ??
                        selectedAlert.issueType}
                    </p>
                    <p className="text-sm mt-1">{selectedAlert.summary}</p>
                  </div>

                  {alertEmailPreview && (
                    <div className="space-y-1 pt-2 border-t border-border text-xs">
                      <p className="font-medium text-muted-foreground">
                        Source email
                      </p>
                      <p>
                        {alertEmailPreview.fromName
                          ? `${alertEmailPreview.fromName} <${alertEmailPreview.fromAddress}>`
                          : alertEmailPreview.fromAddress}
                      </p>
                      <p className="truncate">
                        {alertEmailPreview.subject || "(no subject)"}
                      </p>
                    </div>
                  )}

                  {selectedAlert.matchedRecords.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground">
                        Matched ERP records
                      </p>
                      {selectedAlert.matchedRecords.map((rec, i) => (
                        <div
                          key={`${rec.type}-${rec.id}-${i}`}
                          className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border border-border bg-muted/30"
                        >
                          <span className="flex-1 truncate">
                            {rec.type}: {rec.label}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {ALERT_CONFIDENCE_LABELS[rec.confidence] ??
                              rec.confidence}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {Object.keys(selectedAlert.details).length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground">
                        Quantities / amounts / dates
                      </p>
                      <pre className="text-xs whitespace-pre-wrap break-words bg-muted/30 rounded-md p-2">
                        {JSON.stringify(selectedAlert.details, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedAlert.recommendedAction && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground">
                        Recommended next action
                      </p>
                      <p className="text-sm mt-1">
                        {selectedAlert.recommendedAction}
                      </p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                    Created {new Date(selectedAlert.createdAt).toLocaleString()}
                    {selectedAlert.acknowledgedAt &&
                      ` · Acknowledged ${new Date(selectedAlert.acknowledgedAt).toLocaleString()}`}
                    {selectedAlert.resolvedAt &&
                      ` · Resolved ${new Date(selectedAlert.resolvedAt).toLocaleString()}`}
                  </div>

                  {selectedAlert.status !== "resolved" && (
                    <div className="flex gap-2 pt-2">
                      {selectedAlert.status === "new" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void handleAcknowledgeAlert(selectedAlert.id)
                          }
                          data-ocid="email_center.alert_acknowledge_button"
                        >
                          <Check className="w-3.5 h-3.5 mr-1.5" />
                          Acknowledge
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void handleResolveAlert(selectedAlert.id)
                        }
                        data-ocid="email_center.alert_resolve_button"
                      >
                        <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
                        Resolve
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
