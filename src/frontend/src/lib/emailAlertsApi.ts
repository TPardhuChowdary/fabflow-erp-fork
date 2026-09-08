// Phase 7 Email Operations — proactive operational alerts, over
// database/20260907030000_email_operational_alerts.sql (written, NOT
// applied). Same WriteResult/requireSession() contract as
// emailOutboundApi.ts and every other <domain>Api.ts.
//
// Detection/notification only: nothing here mutates an ERP record,
// sends email, or bypasses a permission. Creating an alert is the exact
// same "no external side effect" shape as draftEmailReply/draftNewEmail
// (Phase 5) — RLS-gated on 'email.view' (not 'email.send'), and the
// unique constraint on email_message_id is the durable
// idempotency/deduplication mechanism: a second createEmailAlert for an
// already-alerted message returns the EXISTING row instead of erroring
// or duplicating, so repeat monitoring runs are always safe to re-call.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  EmailAlertConfidence,
  EmailAlertIssueType,
  EmailAlertMatchedRecord,
  EmailAlertSeverity,
  EmailAlertStatus,
  EmailOperationalAlert,
} from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface EmailOperationalAlertRow {
  id: string;
  email_message_id: string;
  email_account_id: string;
  issue_type: EmailAlertIssueType;
  severity: EmailAlertSeverity;
  confidence: EmailAlertConfidence;
  summary: string;
  matched_records: EmailAlertMatchedRecord[];
  details: Record<string, unknown>;
  recommended_action: string | null;
  status: EmailAlertStatus;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAlert(row: EmailOperationalAlertRow): EmailOperationalAlert {
  return {
    id: row.id,
    emailMessageId: row.email_message_id,
    emailAccountId: row.email_account_id,
    issueType: row.issue_type,
    severity: row.severity,
    confidence: row.confidence,
    summary: row.summary,
    matchedRecords: row.matched_records ?? [],
    details: row.details ?? {},
    recommendedAction: row.recommended_action ?? undefined,
    status: row.status,
    acknowledgedAt: row.acknowledged_at
      ? new Date(row.acknowledged_at).getTime()
      : undefined,
    resolvedAt: row.resolved_at
      ? new Date(row.resolved_at).getTime()
      : undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

const ALERT_COLUMNS =
  "id, email_message_id, email_account_id, issue_type, severity, confidence, " +
  "summary, matched_records, details, recommended_action, status, " +
  "acknowledged_at, resolved_at, created_at, updated_at";

async function requireSession() {
  if (!isSupabaseConfigured) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: "Supabase is not configured" },
    };
  }
  const client = getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: error.message },
    };
  }
  if (!data.session) {
    return {
      ok: false as const,
      result: { status: "unauthenticated" as const },
    };
  }
  return { ok: true as const, client };
}

export interface ListEmailAlertsFilter {
  status?: EmailAlertStatus;
  severity?: EmailAlertSeverity;
  emailAccountId?: string;
  limit?: number;
}

export async function listEmailAlerts(
  filter: ListEmailAlertsFilter = {},
): Promise<WriteResult<EmailOperationalAlert[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  let query = gate.client
    .from("email_operational_alerts")
    .select(ALERT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 200);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.severity) query = query.eq("severity", filter.severity);
  if (filter.emailAccountId)
    query = query.eq("email_account_id", filter.emailAccountId);
  const { data, error } = await query;
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as EmailOperationalAlertRow[]).map(rowToAlert),
  };
}

/** Which of the given message ids already have an alert — the
 * deterministic eligibility/deduplication check the Agent's alert-scan
 * tool calls before analyzing anything, so it never re-analyzes a
 * message it already has a durable verdict for. */
export async function listAlertedMessageIds(
  messageIds: string[],
): Promise<WriteResult<string[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  if (messageIds.length === 0) return { status: "success", data: [] };
  const { data, error } = await gate.client
    .from("email_operational_alerts")
    .select("email_message_id")
    .in("email_message_id", messageIds);
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data ?? []).map((r) => r.email_message_id as string),
  };
}

export interface CreateEmailAlertInput {
  emailMessageId: string;
  emailAccountId: string;
  issueType: EmailAlertIssueType;
  severity: EmailAlertSeverity;
  confidence: EmailAlertConfidence;
  summary: string;
  matchedRecords?: EmailAlertMatchedRecord[];
  details?: Record<string, unknown>;
  recommendedAction?: string;
}

/** Creates one alert. If email_message_id already has one (the unique
 * constraint), returns the EXISTING row instead of erroring — repeat
 * monitoring runs are always safe to re-call, and this is the actual
 * mechanism that prevents duplicate alerts/duplicate notifications. */
export async function createEmailAlert(
  input: CreateEmailAlertInput,
): Promise<
  WriteResult<{ alert: EmailOperationalAlert; alreadyExisted: boolean }>
> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("email_operational_alerts")
    .insert({
      email_message_id: input.emailMessageId,
      email_account_id: input.emailAccountId,
      issue_type: input.issueType,
      severity: input.severity,
      confidence: input.confidence,
      summary: input.summary,
      matched_records: input.matchedRecords ?? [],
      details: input.details ?? {},
      recommended_action: input.recommendedAction ?? null,
    })
    .select(ALERT_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      // Unique violation on email_message_id — already alerted. Fetch
      // and return the existing row rather than treating this as a
      // failure; the caller (recordEmailAlert) reports this plainly as
      // "already had an alert", never as a new one.
      const existing = await gate.client
        .from("email_operational_alerts")
        .select(ALERT_COLUMNS)
        .eq("email_message_id", input.emailMessageId)
        .maybeSingle();
      if (existing.data) {
        return {
          status: "success",
          data: {
            alert: rowToAlert(
              existing.data as unknown as EmailOperationalAlertRow,
            ),
            alreadyExisted: true,
          },
        };
      }
    }
    return { status: "error", error: error.message };
  }
  return {
    status: "success",
    data: {
      alert: rowToAlert(data as unknown as EmailOperationalAlertRow),
      alreadyExisted: false,
    },
  };
}

async function updateAlertStatus(
  id: string,
  fromStatus: EmailAlertStatus | EmailAlertStatus[],
  toStatus: EmailAlertStatus,
  timestampColumn: "acknowledged_at" | "resolved_at",
): Promise<WriteResult<EmailOperationalAlert>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const fromList = Array.isArray(fromStatus) ? fromStatus : [fromStatus];
  const { data, error } = await gate.client
    .from("email_operational_alerts")
    .update({ status: toStatus, [timestampColumn]: new Date().toISOString() })
    .eq("id", id)
    .in("status", fromList)
    .select(ALERT_COLUMNS)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!data)
    return {
      status: "denied",
      error: "Alert not found, or not in a state this transition allows.",
    };
  return {
    status: "success",
    data: rowToAlert(data as unknown as EmailOperationalAlertRow),
  };
}

export async function acknowledgeEmailAlert(
  id: string,
): Promise<WriteResult<EmailOperationalAlert>> {
  return updateAlertStatus(id, "new", "acknowledged", "acknowledged_at");
}

export async function resolveEmailAlert(
  id: string,
): Promise<WriteResult<EmailOperationalAlert>> {
  return updateAlertStatus(
    id,
    ["new", "acknowledged"],
    "resolved",
    "resolved_at",
  );
}
