// Phase 56 (Group 2) / Phases 19-24 — Tender Management write layer.
// Same shape/conventions as every other <domain>Api.ts in this codebase.
// Document upload (source tender PDF) mirrors companyDocumentsApi.ts's
// org-folder-scoped private-bucket pattern exactly.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Tender, TenderRequirement } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

const TENDER_DOCUMENTS_BUCKET = "tender-documents";
const MAX_TENDER_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25MB — full tender packages can be large, multi-page
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour, regenerated on each view

async function requireSession() {
  if (!isSupabaseConfigured) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: "Supabase is not configured" },
    };
  }
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    return {
      ok: false as const,
      result: { status: "unauthenticated" as const },
    };
  }
  return { ok: true as const, client, userId: session.user.id };
}

function sanitizeFileName(rawName: string): string {
  const noSeparators = rawName.split("/").join("_").split("\\").join("_");
  let printable = "";
  for (let i = 0; i < noSeparators.length; i++) {
    const code = noSeparators.charCodeAt(i);
    if (code > 31 && code !== 127) printable += noSeparators[i];
  }
  const trimmed = printable.slice(-150);
  return trimmed.length > 0 ? trimmed : "document";
}

function rowToTender(row: Record<string, unknown>): Tender {
  return {
    id: row.id as string,
    tenderNumber: row.tender_number as string,
    title: row.title as string,
    customerId: (row.customer_id as string) ?? undefined,
    authorityName: (row.authority_name as string) ?? undefined,
    portal: (row.portal as string) ?? undefined,
    bidType: (row.bid_type as string) ?? undefined,
    submissionDeadline: (row.submission_deadline as string) ?? undefined,
    openingDate: (row.opening_date as string) ?? undefined,
    technicalRequirementsSummary:
      (row.technical_requirements_summary as string) ?? undefined,
    financialRequirementsSummary:
      (row.financial_requirements_summary as string) ?? undefined,
    emdAmount: (row.emd_amount as number) ?? undefined,
    emdDetails: (row.emd_details as string) ?? undefined,
    status: row.status as Tender["status"],
    sourceDocumentStoragePath:
      (row.source_document_storage_path as string) ?? undefined,
    sourceDocumentFilename:
      (row.source_document_filename as string) ?? undefined,
    finalPackStoragePath: (row.final_pack_storage_path as string) ?? undefined,
    finalPackGeneratedAt: row.final_pack_generated_at
      ? new Date(row.final_pack_generated_at as string).getTime()
      : undefined,
    activityLog: (row.activity_log as Tender["activityLog"]) ?? undefined,
    createdBy: (row.created_by as string) ?? undefined,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

export interface TenderFormInput {
  tenderNumber: string;
  title: string;
  customerId?: string;
  authorityName?: string;
  portal?: string;
  bidType?: string;
  submissionDeadline?: string;
  openingDate?: string;
  technicalRequirementsSummary?: string;
  financialRequirementsSummary?: string;
  emdAmount?: number;
  emdDetails?: string;
  status: Tender["status"];
}

function toTenderFields(v: TenderFormInput) {
  return {
    tender_number: v.tenderNumber,
    title: v.title,
    customer_id: v.customerId || null,
    authority_name: v.authorityName || null,
    portal: v.portal || null,
    bid_type: v.bidType || null,
    submission_deadline: v.submissionDeadline || null,
    opening_date: v.openingDate || null,
    technical_requirements_summary: v.technicalRequirementsSummary || null,
    financial_requirements_summary: v.financialRequirementsSummary || null,
    emd_amount: v.emdAmount ?? null,
    emd_details: v.emdDetails || null,
    status: v.status,
  };
}

export async function createTenderRemote(
  input: TenderFormInput,
): Promise<WriteResult<Tender>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("tenders")
    .insert({ ...toTenderFields(input), created_by: gate.userId })
    .select()
    .single();
  if (error) return { status: "error", error: error.message };
  return { status: "success", data: rowToTender(data) };
}

export async function updateTenderRemote(
  id: string,
  input: TenderFormInput,
): Promise<WriteResult<Tender>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("tenders")
    .update(toTenderFields(input))
    .eq("id", id)
    .select();
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error:
        "No row was updated (blocked by RLS, or the tender does not exist)",
    };
  }
  return { status: "success", data: rowToTender(rows[0]) };
}

export async function deleteTenderRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("tenders")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error:
        "No row was deleted (blocked by RLS, or the tender does not exist)",
    };
  }
  return { status: "success" };
}

/** Uploads the tender's own source document (the inbound PDF from the
 * authority) and stamps its path onto the tender row. */
export async function uploadTenderSourceDocument(
  tenderId: string,
  file: File,
): Promise<WriteResult<Tender>> {
  if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
    return { status: "error", error: "Only PDF or image files are supported." };
  }
  if (file.size > MAX_TENDER_DOCUMENT_BYTES) {
    return {
      status: "error",
      error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum is ${MAX_TENDER_DOCUMENT_BYTES / (1024 * 1024)}MB.`,
    };
  }
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client, userId } = gate;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile) {
    return { status: "error", error: "Could not resolve your organization." };
  }
  const orgId = (profile as { organization_id: string }).organization_id;
  const path = `${orgId}/${tenderId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await client.storage
    .from(TENDER_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { status: "error", error: `Upload failed: ${uploadError.message}` };
  }

  const { data, error } = await client
    .from("tenders")
    .update({
      source_document_storage_path: path,
      source_document_filename: file.name,
    })
    .eq("id", tenderId)
    .select();
  if (error) {
    await client.storage.from(TENDER_DOCUMENTS_BUCKET).remove([path]);
    return { status: "error", error: error.message };
  }
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  if (rows.length === 0) {
    await client.storage.from(TENDER_DOCUMENTS_BUCKET).remove([path]);
    return { status: "denied", error: "Tender not found or access denied." };
  }
  return { status: "success", data: rowToTender(rows[0]) };
}

export async function getTenderDocumentSignedUrl(
  storagePath: string,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const client = getSupabase();
  const { data, error } = await client.storage
    .from(TENDER_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

// ── Requirements ────────────────────────────────────────────────

function rowToTenderRequirement(
  row: Record<string, unknown>,
): TenderRequirement {
  return {
    id: row.id as string,
    tenderId: row.tender_id as string,
    requirementText: row.requirement_text as string,
    category: row.category as TenderRequirement["category"],
    isMandatory: row.is_mandatory as boolean,
    priority: row.priority as number,
    status: row.status as TenderRequirement["status"],
    matchedCompanyDocumentId:
      (row.matched_company_document_id as string) ?? undefined,
    matchedDocumentTitle: (row.matched_document_title as string) ?? undefined,
    matchedDocumentExpiry: (row.matched_document_expiry as string) ?? undefined,
    actionNeeded: (row.action_needed as string) ?? undefined,
    displayOrder: row.display_order as number,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

export interface TenderRequirementFormInput {
  tenderId: string;
  requirementText: string;
  category: TenderRequirement["category"];
  isMandatory: boolean;
  priority: number;
  displayOrder: number;
}

export async function createTenderRequirementRemote(
  input: TenderRequirementFormInput,
): Promise<WriteResult<TenderRequirement>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("tender_requirements")
    .insert({
      tender_id: input.tenderId,
      requirement_text: input.requirementText,
      category: input.category,
      is_mandatory: input.isMandatory,
      priority: input.priority,
      display_order: input.displayOrder,
      status: "NEEDS_REVIEW",
    })
    .select()
    .single();
  if (error) return { status: "error", error: error.message };
  return { status: "success", data: rowToTenderRequirement(data) };
}

/** Matches (or clears the match on) one requirement against a Company
 * Document Library entry — snapshots title/expiry per Phase 21's explicit
 * requirement so a later library edit never silently rewrites an
 * already-prepared tender's checklist. Pass `null` doc to clear a match
 * and fall back to NEEDS_REVIEW. */
export async function setTenderRequirementMatch(
  requirementId: string,
  doc: { id: string; title: string; expiryDate?: string } | null,
  status: TenderRequirement["status"],
): Promise<WriteResult<TenderRequirement>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("tender_requirements")
    .update({
      matched_company_document_id: doc?.id ?? null,
      matched_document_title: doc?.title ?? null,
      matched_document_expiry: doc?.expiryDate ?? null,
      status,
    })
    .eq("id", requirementId)
    .select();
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error:
        "No row was updated (blocked by RLS, or the requirement does not exist)",
    };
  }
  return { status: "success", data: rowToTenderRequirement(rows[0]) };
}

export async function updateTenderRequirementRemote(
  id: string,
  patch: Partial<
    Pick<
      TenderRequirement,
      | "requirementText"
      | "category"
      | "isMandatory"
      | "priority"
      | "status"
      | "actionNeeded"
    >
  >,
): Promise<WriteResult<TenderRequirement>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const fields: Record<string, unknown> = {};
  if (patch.requirementText !== undefined)
    fields.requirement_text = patch.requirementText;
  if (patch.category !== undefined) fields.category = patch.category;
  if (patch.isMandatory !== undefined) fields.is_mandatory = patch.isMandatory;
  if (patch.priority !== undefined) fields.priority = patch.priority;
  if (patch.status !== undefined) fields.status = patch.status;
  if (patch.actionNeeded !== undefined)
    fields.action_needed = patch.actionNeeded || null;

  const { data, error } = await gate.client
    .from("tender_requirements")
    .update(fields)
    .eq("id", id)
    .select();
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error:
        "No row was updated (blocked by RLS, or the requirement does not exist)",
    };
  }
  return { status: "success", data: rowToTenderRequirement(rows[0]) };
}

export async function deleteTenderRequirementRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("tender_requirements")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error:
        "No row was deleted (blocked by RLS, or the requirement does not exist)",
    };
  }
  return { status: "success" };
}
