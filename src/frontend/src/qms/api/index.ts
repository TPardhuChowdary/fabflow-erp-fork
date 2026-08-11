// Phase 15 — Supabase-backed. Was IndexedDB (fabflow-qms v2, stores
// processes/operations/inspectionMethods/characteristics/templates/
// favorites); see database/phase-15/phase15_qms_master_data_FINAL.sql for
// the schema this now reads/writes. qms/db/*.ts (kept, dormant) is the old
// local store this replaces as the source of truth for these 6 domains.
// Same seam pattern as drawingEditor/api/drawings.ts — pure async
// functions the Zustand store and every QMS page call through; every
// exported function signature and return shape is preserved from the
// IndexedDB version.
//
// ensureSeeded() is now a no-op (see below) — starter/demo master data is
// no longer auto-inserted per-browser. It is seeded once, org-wide, only
// if and when an admin explicitly runs
// database/phase-15/phase15_qms_master_data_SEED.sql — a deliberate,
// disclosed behavior change from the old per-browser auto-seed, per
// explicit instruction not to auto-copy demo/test data into production.

import { getSupabase } from "@/lib/supabaseClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InspectionMethod,
  ManufacturingProcess,
  Operation,
  QmsCharacteristicStatus,
  QmsTemplate,
  QualityCharacteristic,
} from "../types";

// ── Row shapes (snake_case, as returned by PostgREST) ────────────────

interface ProcessRow {
  id: string;
  name: string;
  sequence: number;
  active: boolean;
  created_at: string;
}

interface OperationRow {
  id: string;
  process_id: string;
  name: string;
  sequence: number;
  department: string | null;
  required_skills: string[] | null;
  required_machines: string[] | null;
  active: boolean;
  created_at: string;
}

interface MethodRow {
  id: string;
  name: string;
  type: string;
  config: InspectionMethod["config"] | null;
  active: boolean;
  created_at: string;
}

interface CharacteristicRow {
  id: string;
  name: string;
  description: string;
  category: string;
  process_id: string;
  operation_id: string;
  criticality: string;
  inspection_method_id: string;
  acceptance_criteria: string;
  tolerance_nominal: number | null;
  tolerance_plus: number | null;
  tolerance_minus: number | null;
  unit: string | null;
  measuring_instrument: string | null;
  standard_reference: string | null;
  drawing_reference: string | null;
  evidence_required: boolean;
  photo_required: boolean;
  customer_scope: string | null;
  tags: string[] | null;
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  description: string | null;
  characteristic_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

// ── Row -> domain mapping ──────────────────────────────────────────

function rowToProcess(row: ProcessRow): ManufacturingProcess {
  return {
    id: row.id,
    name: row.name,
    sequence: row.sequence,
    active: row.active,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function rowToOperation(row: OperationRow): Operation {
  return {
    id: row.id,
    processId: row.process_id,
    name: row.name,
    sequence: row.sequence,
    department: row.department ?? undefined,
    requiredSkills: row.required_skills ?? [],
    requiredMachines: row.required_machines ?? [],
    active: row.active,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function rowToMethod(row: MethodRow): InspectionMethod {
  return {
    id: row.id,
    name: row.name,
    type: row.type as InspectionMethod["type"],
    config: row.config ?? undefined,
    active: row.active,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function rowToCharacteristic(row: CharacteristicRow): QualityCharacteristic {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    processId: row.process_id,
    operationId: row.operation_id,
    criticality: row.criticality as QualityCharacteristic["criticality"],
    inspectionMethodId: row.inspection_method_id,
    acceptanceCriteria: row.acceptance_criteria,
    toleranceNominal: row.tolerance_nominal ?? undefined,
    tolerancePlus: row.tolerance_plus ?? undefined,
    toleranceMinus: row.tolerance_minus ?? undefined,
    unit: row.unit ?? undefined,
    measuringInstrument: row.measuring_instrument ?? undefined,
    standardReference: row.standard_reference ?? undefined,
    drawingReference: row.drawing_reference ?? undefined,
    evidenceRequired: row.evidence_required,
    photoRequired: row.photo_required,
    customerScope: row.customer_scope ?? undefined,
    tags: row.tags ?? [],
    version: row.version,
    status: row.status as QmsCharacteristicStatus,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function rowToTemplate(row: TemplateRow): QmsTemplate {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? undefined,
    characteristicIds: row.characteristic_ids ?? [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// ── Seeding ───────────────────────────────────────────────────────
// Master data is now organization-wide, not per-browser — there is
// nothing left for this function to do automatically. Starter data is
// seeded at most once, deliberately, by running
// phase15_qms_master_data_SEED.sql yourself. Kept as an exported no-op
// so every existing `await ensureSeeded()` call site keeps compiling and
// behaving safely (a resolved no-op promise) without every read function
// needing to know this changed.

export async function ensureSeeded(): Promise<void> {
  return Promise.resolve();
}

// ── Master data (read-only in the current UI; RLS still permits full
// CRUD for a permissioned caller — see the phase-15 migration) ────────

export async function getProcesses(): Promise<ManufacturingProcess[]> {
  await ensureSeeded();
  const client = getSupabase();
  const { data, error } = await client
    .from("manufacturing_processes")
    .select("*")
    .order("sequence");
  if (error) throw new Error(`Failed to load processes: ${error.message}`);
  return ((data as ProcessRow[]) ?? []).map(rowToProcess);
}

export async function getOperations(): Promise<Operation[]> {
  await ensureSeeded();
  const client = getSupabase();
  const { data, error } = await client
    .from("operations")
    .select("*")
    .order("sequence");
  if (error) throw new Error(`Failed to load operations: ${error.message}`);
  return ((data as OperationRow[]) ?? []).map(rowToOperation);
}

export async function getInspectionMethods(): Promise<InspectionMethod[]> {
  await ensureSeeded();
  const client = getSupabase();
  const { data, error } = await client.from("inspection_methods").select("*");
  if (error)
    throw new Error(`Failed to load inspection methods: ${error.message}`);
  return ((data as MethodRow[]) ?? [])
    .map(rowToMethod)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Quality Characteristics ──────────────────────────────────────

export async function getCharacteristicLibrary(): Promise<
  QualityCharacteristic[]
> {
  await ensureSeeded();
  const client = getSupabase();
  const { data, error } = await client
    .from("quality_characteristics")
    .select("*");
  if (error)
    throw new Error(`Failed to load characteristics: ${error.message}`);
  return ((data as CharacteristicRow[]) ?? []).map(rowToCharacteristic);
}

export type CreateCharacteristicInput = Omit<
  QualityCharacteristic,
  "id" | "version" | "status" | "createdAt" | "updatedAt"
>;

export async function createCharacteristic(
  input: CreateCharacteristicInput,
): Promise<QualityCharacteristic> {
  const client = getSupabase();
  const { data, error } = await client
    .from("quality_characteristics")
    .insert({
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      category: input.category,
      process_id: input.processId,
      operation_id: input.operationId,
      criticality: input.criticality,
      inspection_method_id: input.inspectionMethodId,
      acceptance_criteria: input.acceptanceCriteria,
      tolerance_nominal: input.toleranceNominal ?? null,
      tolerance_plus: input.tolerancePlus ?? null,
      tolerance_minus: input.toleranceMinus ?? null,
      unit: input.unit ?? null,
      measuring_instrument: input.measuringInstrument ?? null,
      standard_reference: input.standardReference ?? null,
      drawing_reference: input.drawingReference ?? null,
      evidence_required: input.evidenceRequired,
      photo_required: input.photoRequired,
      customer_scope: input.customerScope ?? null,
      tags: input.tags,
      version: 1,
      status: "Active",
    })
    .select()
    .single();
  if (error)
    throw new Error(`Failed to create characteristic: ${error.message}`);
  return rowToCharacteristic(data as CharacteristicRow);
}

export async function updateCharacteristic(
  id: string,
  updates: Partial<CreateCharacteristicInput>,
): Promise<QualityCharacteristic> {
  const client = getSupabase();
  const existing = await getCharacteristicById(client, id);
  if (!existing) throw new Error("Characteristic not found");

  const fields: Record<string, unknown> = { version: existing.version + 1 };
  if (updates.name !== undefined) fields.name = updates.name;
  if (updates.description !== undefined)
    fields.description = updates.description;
  if (updates.category !== undefined) fields.category = updates.category;
  if (updates.processId !== undefined) fields.process_id = updates.processId;
  if (updates.operationId !== undefined)
    fields.operation_id = updates.operationId;
  if (updates.criticality !== undefined)
    fields.criticality = updates.criticality;
  if (updates.inspectionMethodId !== undefined) {
    fields.inspection_method_id = updates.inspectionMethodId;
  }
  if (updates.acceptanceCriteria !== undefined) {
    fields.acceptance_criteria = updates.acceptanceCriteria;
  }
  if (updates.toleranceNominal !== undefined)
    fields.tolerance_nominal = updates.toleranceNominal;
  if (updates.tolerancePlus !== undefined)
    fields.tolerance_plus = updates.tolerancePlus;
  if (updates.toleranceMinus !== undefined)
    fields.tolerance_minus = updates.toleranceMinus;
  if (updates.unit !== undefined) fields.unit = updates.unit;
  if (updates.measuringInstrument !== undefined) {
    fields.measuring_instrument = updates.measuringInstrument;
  }
  if (updates.standardReference !== undefined) {
    fields.standard_reference = updates.standardReference;
  }
  if (updates.drawingReference !== undefined) {
    fields.drawing_reference = updates.drawingReference;
  }
  if (updates.evidenceRequired !== undefined)
    fields.evidence_required = updates.evidenceRequired;
  if (updates.photoRequired !== undefined)
    fields.photo_required = updates.photoRequired;
  if (updates.customerScope !== undefined)
    fields.customer_scope = updates.customerScope ?? null;
  if (updates.tags !== undefined) fields.tags = updates.tags;

  const { data, error } = await client
    .from("quality_characteristics")
    .update(fields)
    .eq("id", id)
    .select();
  if (error)
    throw new Error(`Failed to update characteristic: ${error.message}`);
  const rows = (data as CharacteristicRow[]) ?? [];
  if (rows.length === 0) {
    throw new Error(
      `Update to characteristic ${id} was blocked by policy, or it no longer exists.`,
    );
  }
  return rowToCharacteristic(rows[0]);
}

async function getCharacteristicById(
  client: SupabaseClient,
  id: string,
): Promise<QualityCharacteristic | undefined> {
  const { data, error } = await client
    .from("quality_characteristics")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load characteristic: ${error.message}`);
  return data ? rowToCharacteristic(data as CharacteristicRow) : undefined;
}

export async function setCharacteristicStatus(
  id: string,
  status: QmsCharacteristicStatus,
): Promise<QualityCharacteristic> {
  const client = getSupabase();
  const { data, error } = await client
    .from("quality_characteristics")
    .update({ status })
    .eq("id", id)
    .select();
  if (error)
    throw new Error(`Failed to update characteristic status: ${error.message}`);
  const rows = (data as CharacteristicRow[]) ?? [];
  if (rows.length === 0) {
    throw new Error(
      `Update to characteristic ${id} was blocked by policy, or it no longer exists.`,
    );
  }
  return rowToCharacteristic(rows[0]);
}

export async function bulkSetCharacteristicStatus(
  ids: string[],
  status: QmsCharacteristicStatus,
): Promise<void> {
  if (ids.length === 0) return;
  const client = getSupabase();
  const { error } = await client
    .from("quality_characteristics")
    .update({ status })
    .in("id", ids);
  if (error)
    throw new Error(
      `Failed to bulk-update characteristic status: ${error.message}`,
    );
}

// ── Favorites ─────────────────────────────────────────────────────

export async function getFavoriteIds(userId: string): Promise<string[]> {
  const client = getSupabase();
  const { data, error } = await client
    .from("qms_favorites")
    .select("characteristic_id")
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to load favorites: ${error.message}`);
  return ((data as { characteristic_id: string }[]) ?? []).map(
    (r) => r.characteristic_id,
  );
}

export async function toggleFavorite(
  userId: string,
  characteristicId: string,
): Promise<boolean> {
  const client = getSupabase();
  const id = `${userId}__${characteristicId}`;
  const { data: existing, error: fetchError } = await client
    .from("qms_favorites")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError)
    throw new Error(`Failed to check favorite: ${fetchError.message}`);

  if (existing) {
    const { error } = await client.from("qms_favorites").delete().eq("id", id);
    if (error) throw new Error(`Failed to remove favorite: ${error.message}`);
    return false;
  }
  const { error } = await client.from("qms_favorites").insert({
    id,
    user_id: userId,
    characteristic_id: characteristicId,
  });
  if (error) throw new Error(`Failed to add favorite: ${error.message}`);
  return true;
}

export async function bulkAddFavorites(
  userId: string,
  characteristicIds: string[],
): Promise<void> {
  if (characteristicIds.length === 0) return;
  const client = getSupabase();
  const { error } = await client.from("qms_favorites").upsert(
    characteristicIds.map((characteristicId) => ({
      id: `${userId}__${characteristicId}`,
      user_id: userId,
      characteristic_id: characteristicId,
    })),
    { onConflict: "id" },
  );
  if (error) throw new Error(`Failed to bulk-add favorites: ${error.message}`);
}

// ── Templates ─────────────────────────────────────────────────────

export async function getTemplates(): Promise<QmsTemplate[]> {
  await ensureSeeded();
  const client = getSupabase();
  const { data, error } = await client.from("qms_templates").select("*");
  if (error) throw new Error(`Failed to load templates: ${error.message}`);
  return ((data as TemplateRow[]) ?? []).map(rowToTemplate);
}

export async function createTemplate(input: {
  name: string;
  category: string;
  description?: string;
  characteristicIds: string[];
}): Promise<QmsTemplate> {
  const client = getSupabase();
  const { data, error } = await client
    .from("qms_templates")
    .insert({
      id: crypto.randomUUID(),
      name: input.name,
      category: input.category,
      description: input.description ?? null,
      characteristic_ids: input.characteristicIds,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create template: ${error.message}`);
  return rowToTemplate(data as TemplateRow);
}

export async function renameTemplate(
  id: string,
  name: string,
): Promise<QmsTemplate> {
  const client = getSupabase();
  const { data, error } = await client
    .from("qms_templates")
    .update({ name })
    .eq("id", id)
    .select();
  if (error) throw new Error(`Failed to rename template: ${error.message}`);
  const rows = (data as TemplateRow[]) ?? [];
  if (rows.length === 0) {
    throw new Error(
      `Update to template ${id} was blocked by policy, or it no longer exists.`,
    );
  }
  return rowToTemplate(rows[0]);
}

async function getTemplateById(
  client: SupabaseClient,
  id: string,
): Promise<QmsTemplate | undefined> {
  const { data, error } = await client
    .from("qms_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load template: ${error.message}`);
  return data ? rowToTemplate(data as TemplateRow) : undefined;
}

export async function addCharacteristicsToTemplate(
  templateId: string,
  characteristicIds: string[],
): Promise<QmsTemplate> {
  const client = getSupabase();
  const existing = await getTemplateById(client, templateId);
  if (!existing) throw new Error("Template not found");
  const merged = Array.from(
    new Set([...existing.characteristicIds, ...characteristicIds]),
  );
  const { data, error } = await client
    .from("qms_templates")
    .update({ characteristic_ids: merged })
    .eq("id", templateId)
    .select();
  if (error) throw new Error(`Failed to update template: ${error.message}`);
  const rows = (data as TemplateRow[]) ?? [];
  if (rows.length === 0) {
    throw new Error(
      `Update to template ${templateId} was blocked by policy, or it no longer exists.`,
    );
  }
  return rowToTemplate(rows[0]);
}

export async function removeCharacteristicFromTemplate(
  templateId: string,
  characteristicId: string,
): Promise<QmsTemplate> {
  const client = getSupabase();
  const existing = await getTemplateById(client, templateId);
  if (!existing) throw new Error("Template not found");
  const filtered = existing.characteristicIds.filter(
    (id) => id !== characteristicId,
  );
  const { data, error } = await client
    .from("qms_templates")
    .update({ characteristic_ids: filtered })
    .eq("id", templateId)
    .select();
  if (error) throw new Error(`Failed to update template: ${error.message}`);
  const rows = (data as TemplateRow[]) ?? [];
  if (rows.length === 0) {
    throw new Error(
      `Update to template ${templateId} was blocked by policy, or it no longer exists.`,
    );
  }
  return rowToTemplate(rows[0]);
}

export async function deleteTemplate(id: string): Promise<void> {
  const client = getSupabase();
  const { error } = await client.from("qms_templates").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete template: ${error.message}`);
}
