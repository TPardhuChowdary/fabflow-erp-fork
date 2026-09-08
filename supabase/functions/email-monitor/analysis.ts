// Phase 8 Email Operations — pure decision/validation logic for the
// unattended email monitor. Deliberately free of any Deno/Supabase
// import so it can be unit-tested with a plain TS runtime (see
// email-monitor.analysis.test.ts) — the safety-critical "malformed AI
// output must fail closed" logic lives here, not scattered through
// index.ts's I/O code.
//
// Same four enums as agent/actions.ts's recordEmailAlert (Phase 7) —
// copied, not re-derived from a shared import, because that file lives
// in the frontend (depends on browser-only modules) and is not
// reachable from this Deno function. Any future change to Phase 7's
// enums must be mirrored here by hand; this comment is that tripwire.

export const ISSUE_TYPES = [
  "delivery_delay",
  "quantity_change",
  "quality_rejection",
  "po_change",
  "invoice_po_mismatch",
  "price_discrepancy",
  "correction_revision",
  "follow_up_reminder",
  "duplicate",
  "unanswered",
  "ambiguous_match",
  "other",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCES = [
  "high_confidence",
  "possible_match",
  "ambiguous",
  "no_match",
] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export interface MatchedRecord {
  type: string;
  id: string;
  label: string;
  confidence: Confidence;
}

export interface AlertOutcome {
  kind: "alert";
  issueType: IssueType;
  severity: Severity;
  confidence: Confidence;
  summary: string;
  matchedRecords: MatchedRecord[];
  details: Record<string, unknown>;
  recommendedAction?: string;
}

export interface NoAlertOutcome {
  kind: "no_alert";
  summary: string;
}

export type AnalysisOutcome = AlertOutcome | NoAlertOutcome;

export interface ValidationFailure {
  ok: false;
  error: string;
}

export interface ValidationSuccess {
  ok: true;
  outcome: AnalysisOutcome;
}

// The only two tool names the monitor's model may call to conclude an
// analysis — anything else (a stray write-shaped tool name, a typo, a
// hallucinated tool) is rejected by the caller before this function is
// even reached (see index.ts's tool dispatch), so this function only
// needs to validate the ARGUMENTS of a call already known to be one of
// these two names.
export const CREATE_ALERT_TOOL = "create_alert";
export const MARK_NO_ALERT_TOOL = "mark_no_alert";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Fails closed on anything not exactly well-formed: invalid JSON, a
 * missing field, an enum value outside the fixed list, matchedRecords
 * not an array of well-shaped objects, details not a plain object. A
 * failure here must never be treated as "no alert needed" — the caller
 * records it as a failed/unprocessed message, safely eligible for retry
 * on the next run (see this repo's Phase 8C eligibility design). */
export function validateAnalysisToolCall(
  toolName: string,
  argsJson: string,
): ValidationSuccess | ValidationFailure {
  let args: unknown;
  try {
    args = JSON.parse(argsJson);
  } catch {
    return { ok: false, error: "Tool arguments were not valid JSON." };
  }
  if (!isPlainObject(args)) {
    return { ok: false, error: "Tool arguments must be a JSON object." };
  }

  if (toolName === MARK_NO_ALERT_TOOL) {
    const summary = args.summary;
    if (typeof summary !== "string" || summary.trim().length === 0) {
      return { ok: false, error: "mark_no_alert requires a non-empty summary." };
    }
    return { ok: true, outcome: { kind: "no_alert", summary } };
  }

  if (toolName === CREATE_ALERT_TOOL) {
    const { issueType, severity, confidence, summary, matchedRecords, details, recommendedAction } =
      args as Record<string, unknown>;
    if (typeof issueType !== "string" || !(ISSUE_TYPES as readonly string[]).includes(issueType)) {
      return { ok: false, error: `issueType must be one of: ${ISSUE_TYPES.join(", ")}.` };
    }
    if (typeof severity !== "string" || !(SEVERITIES as readonly string[]).includes(severity)) {
      return { ok: false, error: `severity must be one of: ${SEVERITIES.join(", ")}.` };
    }
    if (typeof confidence !== "string" || !(CONFIDENCES as readonly string[]).includes(confidence)) {
      return { ok: false, error: `confidence must be one of: ${CONFIDENCES.join(", ")}.` };
    }
    if (typeof summary !== "string" || summary.trim().length === 0) {
      return { ok: false, error: "create_alert requires a non-empty summary." };
    }
    let matched: MatchedRecord[] = [];
    if (matchedRecords !== undefined) {
      if (!Array.isArray(matchedRecords)) {
        return { ok: false, error: "matchedRecords must be an array." };
      }
      for (const r of matchedRecords) {
        if (
          !isPlainObject(r) ||
          typeof r.type !== "string" ||
          typeof r.id !== "string" ||
          typeof r.label !== "string" ||
          typeof r.confidence !== "string" ||
          !(CONFIDENCES as readonly string[]).includes(r.confidence)
        ) {
          return {
            ok: false,
            error: 'Each matchedRecords entry must be {type,id,label,confidence} with confidence from the fixed 4-way scale.',
          };
        }
      }
      matched = matchedRecords as MatchedRecord[];
    }
    let detailsObj: Record<string, unknown> = {};
    if (details !== undefined) {
      if (!isPlainObject(details)) {
        return { ok: false, error: "details must be a JSON object." };
      }
      detailsObj = details;
    }
    if (recommendedAction !== undefined && typeof recommendedAction !== "string") {
      return { ok: false, error: "recommendedAction must be a string if present." };
    }
    return {
      ok: true,
      outcome: {
        kind: "alert",
        issueType: issueType as IssueType,
        severity: severity as Severity,
        confidence: confidence as Confidence,
        summary,
        matchedRecords: matched,
        details: detailsObj,
        recommendedAction: recommendedAction as string | undefined,
      },
    };
  }

  return { ok: false, error: `Unknown tool "${toolName}" — expected ${CREATE_ALERT_TOOL} or ${MARK_NO_ALERT_TOOL}.` };
}

// Conservative, documented run-shape constants (8F) — kept together so
// the whole "how big is a run" story is in one place.
export const MAX_CANDIDATE_FETCH = 10; // the batch cap per mailbox per
// invocation — the eligibility function itself never returns more than
// this many rows (see the migration's email_monitor_find_eligible_messages
// LIMIT), so there is no separate "fetch more than we'll use" step to
// reconcile, and no second constant duplicating this same number.
export const LOCK_LEASE_MS = 5 * 60_000; // 5 minutes — comfortably longer than
// this function's own per-mailbox work should ever take; a crash mid-run
// self-heals once this lease expires (see the migration's own comment).
export const MAX_TOOL_ITERATIONS = 6; // per-message tool-call loop cap — a
// runaway loop (model repeatedly calling read tools without ever
// concluding) fails that ONE message closed rather than hanging the run.
