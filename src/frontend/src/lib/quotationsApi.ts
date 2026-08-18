// Phase 27 Batch 2 — Quotations + Quotation Revisions write persistence
// layer. Sibling to lib/projectsApi.ts, lib/companyPosApi.ts, etc.
// Quotations.tsx's centralized CREATE/UPDATE/DELETE for both quotations
// and quotation_revisions routes through this module.
//
// Contract every write function here follows (identical to every prior
// domain): checks for a real session first; never fabricates success;
// only "success" returns the actual persisted row; RLS is the only
// authorization boundary; update/delete request .select() and check
// data.length since a blocked UPDATE/DELETE silently matches zero rows.
//
// qt_no collision handling: same bounded-retry Option 1 pattern as
// Company POs/Projects. quotations carries a genuine UNIQUE
// (organization_id, qt_no) constraint; qt_no is not DB-generated. The
// retry recomputes purely from fresh server state, never re-calling the
// side-effecting local generateDocNo("QT") counter.
//
// revision_number collision handling: same bounded-retry shape, scoped
// to one quotation_id (UNIQUE (quotation_id, revision_number)).
//
// approved_by/created_by: DB uuid FKs to auth.users. The frontend's
// approvedBy/createdBy are display usernames from a different, local
// auth system - never written here. approved_by is stamped with the
// real session user id only when the caller explicitly records an
// approval (recordApproval=true); created_by is always stamped with the
// real session user id on revision creation (created_by is a strict
// "who really created this row" fact, unconditional). Usernames stay
// local-only, merged back in by store.ts's hydration setters.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Quotation, QuotationRevision } from "@/types";
import {
  QUOTATION_COLUMNS,
  QUOTATION_REVISION_COLUMNS,
  transformQuotationRevisionRow,
  transformQuotationRow,
} from "./hydration";
import type { QuotationRevisionRow, QuotationRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

export type QuotationWritable = Omit<
  Quotation,
  | "id"
  | "createdAt"
  | "qtNo"
  | "version"
  | "recordedPO"
  | "approvedBy"
  | "enqId"
>;

function toQuotationFields(v: QuotationWritable) {
  return {
    customer_id: v.customerId,
    project_id: v.projectId || null,
    line_items: v.lineItems,
    subtotal: v.subtotal,
    apply_gst: v.applyGST,
    apply_igst: v.applyIGST,
    cgst_rate: v.cgstRate,
    sgst_rate: v.sgstRate,
    igst_rate: v.igstRate,
    cgst_amt: v.cgstAmt,
    sgst_amt: v.sgstAmt,
    igst_amt: v.igstAmt,
    total_amount: v.totalAmount,
    valid_until: v.validUntil,
    terms: v.terms || null,
    status: v.status,
    quotation_date: v.quotationDate || null,
    notes: v.notes || null,
    history: v.history ?? [],
    approved_at: v.approvedAt ? new Date(v.approvedAt).toISOString() : null,
  };
}

export type QuotationRevisionWritable = Omit<
  QuotationRevision,
  "id" | "createdAt" | "createdBy" | "approvedBy" | "approvedAt"
>;

function toRevisionFields(v: QuotationRevisionWritable) {
  return {
    quotation_id: v.quotationId,
    revision_number: v.revisionNumber,
    revision_date: v.revisionDate,
    revision_notes: v.revisionNotes || null,
    line_items: v.lineItems,
    subtotal: v.subtotal,
    apply_gst: v.applyGST,
    apply_igst: v.applyIGST,
    cgst_rate: v.cgstRate,
    sgst_rate: v.sgstRate,
    igst_rate: v.igstRate,
    cgst_amt: v.cgstAmt,
    sgst_amt: v.sgstAmt,
    igst_amt: v.igstAmt,
    total_amount: v.totalAmount,
    valid_until: v.validUntil,
    terms: v.terms || null,
    notes: v.notes || null,
    status: v.status,
    is_current: v.isCurrent,
  };
}

// UPDATE never touches revision_number/quotation_id - immutable after
// creation, same rule as every other domain's number/PK-ish field.
function toRevisionUpdateFields(v: QuotationRevisionWritable) {
  const {
    revision_number: _n,
    quotation_id: _q,
    ...rest
  } = toRevisionFields(v);
  return rest;
}

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
  return { ok: true as const, client, userId: data.session.user.id };
}

// Same QT-YYYY-NNN format as generateDocNo("QT") in store.ts, but a pure
// calculation over supplied server-side numbers - mirrors
// computeNextProjectNumber's monotonic-across-years semantics exactly.
export function computeNextQtNumber(existingNumbers: string[]): string {
  const year = new Date().getFullYear();
  const nums = existingNumbers.map((n) => {
    const m = (n || "").match(/^QT-\d{4}-(\d+)$/);
    return m ? Number.parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `QT-${year}-${String(next).padStart(3, "0")}`;
}

async function fetchExistingQtNumbers(
  client: ReturnType<typeof getSupabase>,
): Promise<string[] | null> {
  const { data, error } = await client.from("quotations").select("qt_no");
  if (error || !data) return null;
  return (data as unknown as { qt_no: string }[]).map((r) => r.qt_no);
}

function isQtNumberConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("uq_quotations_org_qtno") ||
      error.message?.includes("qt_no"))
  );
}

const MAX_QT_NUMBER_ATTEMPTS = 3;

export async function createQuotationRemote(
  quotation: QuotationWritable & { qtNo: string },
): Promise<WriteResult<Quotation>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;

  let candidateNumber = quotation.qtNo;

  for (let attempt = 1; attempt <= MAX_QT_NUMBER_ATTEMPTS; attempt++) {
    const { data, error } = await client
      .from("quotations")
      .insert({ ...toQuotationFields(quotation), qt_no: candidateNumber })
      .select(QUOTATION_COLUMNS)
      .single();

    if (!error) {
      return {
        status: "success",
        data: transformQuotationRow(data as unknown as QuotationRow),
      };
    }

    if (!isQtNumberConflict(error)) {
      return { status: "error", error: error.message };
    }

    if (attempt === MAX_QT_NUMBER_ATTEMPTS) break;

    const freshNumbers = await fetchExistingQtNumbers(client);
    if (freshNumbers === null) break;
    candidateNumber = computeNextQtNumber(freshNumbers);
  }

  return {
    status: "error",
    error:
      "This quotation number was just used by another session. Please try saving again.",
  };
}

export async function updateQuotationRemote(
  quotation: QuotationWritable & { id: string },
  recordApproval = false,
): Promise<WriteResult<Quotation>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const fields: Record<string, unknown> = toQuotationFields(quotation);
  if (recordApproval) fields.approved_by = gate.userId;

  const { data, error } = await gate.client
    .from("quotations")
    .update(fields)
    .eq("id", quotation.id)
    .select(QUOTATION_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as QuotationRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformQuotationRow(rows[0]) };
}

// RESTRICT from master_pos - a quotation with a recorded customer PO
// cannot be deleted (same protective shape as deleteCompanyPO's local
// hasProjects check used to be, now a real DB constraint).
function isQuotationHasMasterPOs(error: { code?: string; message?: string }) {
  return error.code === "23503" && error.message?.includes("master_pos");
}

export async function deleteQuotationRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("quotations")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    if (isQuotationHasMasterPOs(error)) {
      return {
        status: "error",
        error:
          "Cannot delete this quotation - a Purchase Order has been recorded against it.",
      };
    }
    return { status: "error", error: error.message };
  }
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success" };
}

function isRevisionNumberConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("uq_quotation_revisions_quotation_number") ||
      error.message?.includes("revision_number"))
  );
}

function isRevisionCurrentConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    error.message?.includes("uq_quotation_revisions_one_current")
  );
}

async function fetchExistingRevisionNumbers(
  client: ReturnType<typeof getSupabase>,
  quotationId: string,
): Promise<number[] | null> {
  const { data, error } = await client
    .from("quotation_revisions")
    .select("revision_number")
    .eq("quotation_id", quotationId);
  if (error || !data) return null;
  return (data as unknown as { revision_number: number }[]).map(
    (r) => r.revision_number,
  );
}

export function computeNextRevisionNumber(existing: number[]): number {
  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

const MAX_REVISION_NUMBER_ATTEMPTS = 3;

export async function createQuotationRevisionRemote(
  revision: QuotationRevisionWritable,
): Promise<WriteResult<QuotationRevision>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;

  let candidateNumber = revision.revisionNumber;

  for (let attempt = 1; attempt <= MAX_REVISION_NUMBER_ATTEMPTS; attempt++) {
    const { data, error } = await client
      .from("quotation_revisions")
      .insert({
        ...toRevisionFields(revision),
        revision_number: candidateNumber,
        created_by: gate.userId,
      })
      .select(QUOTATION_REVISION_COLUMNS)
      .single();

    if (!error) {
      return {
        status: "success",
        data: transformQuotationRevisionRow(
          data as unknown as QuotationRevisionRow,
        ),
      };
    }

    if (isRevisionCurrentConflict(error)) {
      return {
        status: "error",
        error:
          "Another revision is still marked current for this quotation. Please reload and try again.",
      };
    }

    if (!isRevisionNumberConflict(error)) {
      return { status: "error", error: error.message };
    }

    if (attempt === MAX_REVISION_NUMBER_ATTEMPTS) break;

    const freshNumbers = await fetchExistingRevisionNumbers(
      client,
      revision.quotationId,
    );
    if (freshNumbers === null) break;
    candidateNumber = computeNextRevisionNumber(freshNumbers);
  }

  return {
    status: "error",
    error:
      "This revision number was just used by another session. Please try saving again.",
  };
}

export async function updateQuotationRevisionRemote(
  revision: QuotationRevisionWritable & { id: string },
): Promise<WriteResult<QuotationRevision>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("quotation_revisions")
    .update(toRevisionUpdateFields(revision))
    .eq("id", revision.id)
    .select(QUOTATION_REVISION_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as QuotationRevisionRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return {
    status: "success",
    data: transformQuotationRevisionRow(rows[0]),
  };
}
