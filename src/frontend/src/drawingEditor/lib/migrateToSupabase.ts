// Phase 14 — one-time IndexedDB (fabflow-drawing-editor) -> Supabase
// migration/import tool. User-triggered only (Settings -> Backup & Restore
// area); never runs automatically. IndexedDB itself is never written to or
// cleared by this file — it stays exactly as-is, a dormant backup, even
// after a fully successful migration.
//
// Safety properties (all load-bearing, see the Drawing Repository
// implementation plan this fulfils):
// - IDs are preserved exactly (drawingRepo/drawingViewRepo/
//   drawingLinkRepo/userPreferenceRepo ids become the Supabase row ids).
// - Idempotent + safely retryable: every item is checked against what's
//   already in Supabase before writing; already-migrated ids are skipped,
//   never re-inserted or duplicated. A prior partial/failed run can always
//   be re-run to pick up only what's left.
// - Never migrates to the wrong organization: requireOrgContext() below
//   resolves the organization from the CURRENTLY SIGNED-IN user's own
//   profiles row, and throws rather than guessing if there is no real
//   session. Nothing here ever accepts an organization id as a parameter.
// - Historical uploadedBy/createdBy values predate real Supabase Auth
//   (Priority 1) and cannot be assumed to be valid auth.users ids — each
//   is verified against profiles before being written into a real FK
//   column; an unverifiable one is written as null (never fabricated),
//   with the original name preserved via uploaded_by_name/created_by_name
//   regardless. (Verifying an id belonging to a DIFFERENT user requires
//   the migrating user to hold users.view per profiles_select RLS — an
//   admin running this, the expected case, always has it. A caller
//   without it will see those specific historical ids fall back to null,
//   never a wrong guess.)
// - Every item's outcome (migrated / already migrated / failed + why) is
//   reported individually — nothing is silently dropped.

import { getSupabase } from "@/lib/supabaseClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  drawingLinkRepo,
  drawingRepo,
  drawingViewRepo,
  userPreferenceRepo,
} from "../db/repositories";

const DRAWINGS_BUCKET = "engineering-drawings";

export type MigrationItemStatus = "migrated" | "already_migrated" | "failed";

export interface MigrationItemResult {
  id: string;
  label: string;
  status: MigrationItemStatus;
  error?: string;
}

export interface MigrationReport {
  organizationId: string;
  startedAt: string;
  finishedAt: string;
  drawings: MigrationItemResult[];
  views: MigrationItemResult[];
  links: MigrationItemResult[];
  preferences: MigrationItemResult[];
}

async function requireOrgContext(): Promise<{
  client: SupabaseClient;
  userId: string;
  orgId: string;
}> {
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    throw new Error(
      "Not signed in — sign in before migrating local drawing data.",
    );
  }
  const { data: profile, error } = await client
    .from("profiles")
    .select("organization_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error)
    throw new Error(`Failed to resolve organization: ${error.message}`);
  if (!profile) {
    throw new Error(
      "Could not resolve your organization — refusing to migrate.",
    );
  }
  return {
    client,
    userId: session.user.id,
    orgId: (profile as { organization_id: string }).organization_id,
  };
}

/** Returns userId if it's a real profiles row (safe to write as a FK), or
 * null if it's empty, unverifiable, or not visible under RLS — never
 * writes an unverified value into uploaded_by/created_by. */
async function resolveVerifiedUserId(
  client: SupabaseClient,
  userId: string | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await client
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  return data ? userId : null;
}

export async function migrateDrawingRepositoryToSupabase(
  onProgress?: (message: string) => void,
): Promise<MigrationReport> {
  const { client, userId, orgId } = await requireOrgContext();
  const startedAt = new Date().toISOString();
  const report: MigrationReport = {
    organizationId: orgId,
    startedAt,
    finishedAt: "",
    drawings: [],
    views: [],
    links: [],
    preferences: [],
  };

  // ── Drawings (+ Storage blobs) ──────────────────────────────────────
  const localDrawings = await drawingRepo.getAll();
  const { data: existingDrawingRows, error: existingDrawingsErr } = await client
    .from("drawings")
    .select("id");
  if (existingDrawingsErr) {
    throw new Error(
      `Failed to check already-migrated drawings: ${existingDrawingsErr.message}`,
    );
  }
  const existingDrawingIds = new Set(
    ((existingDrawingRows as { id: string }[]) ?? []).map((r) => r.id),
  );

  for (const d of localDrawings) {
    onProgress?.(`Drawing: ${d.fileName}`);
    if (existingDrawingIds.has(d.id)) {
      report.drawings.push({
        id: d.id,
        label: d.fileName,
        status: "already_migrated",
      });
      continue;
    }
    try {
      // Every record ever written to IndexedDB via drawingRepo always had
      // a real pdfBlob (the field is only optional on the Supabase-backed
      // DrawingDocument shape now returned by list functions — see
      // types.ts) — this is a defensive guard against a corrupt/partial
      // IndexedDB row, not an expected case.
      if (!d.pdfBlob) {
        throw new Error("Local record has no pdfBlob — cannot migrate.");
      }
      const storagePath = `${orgId}/${d.id}/${d.fileName}`;
      const { error: uploadError } = await client.storage
        .from(DRAWINGS_BUCKET)
        .upload(storagePath, d.pdfBlob, {
          contentType: d.pdfBlob.type || "application/pdf",
          // A prior run may have uploaded the object but failed before
          // the DB insert below (network drop, RLS denial, etc.) —
          // upsert makes re-running safe instead of erroring on a
          // leftover object from that partial attempt.
          upsert: true,
        });
      if (uploadError)
        throw new Error(`Storage upload failed: ${uploadError.message}`);

      const uploadedBy = await resolveVerifiedUserId(client, d.uploadedBy);

      const { error: insertError } = await client.from("drawings").insert({
        id: d.id,
        file_name: d.fileName,
        storage_path: storagePath,
        num_pages: d.numPages,
        project_id:
          d.ownerType === "project"
            ? (d.ownerId ?? null)
            : (d.projectId ?? null),
        owner_type: d.ownerType ?? null,
        owner_id: d.ownerId ?? null,
        category: d.category ?? null,
        notes: d.notes ?? null,
        tags: d.tags ?? null,
        uploaded_by: uploadedBy,
        uploaded_by_name: d.uploadedByName,
        source_design_file_id: d.sourceDesignFileId ?? null,
        // parent_drawing_id / original_drawing_id are self-referencing
        // FKs — deliberately left null here and backfilled in the second
        // pass below, once every drawing id in this batch actually
        // exists in Supabase (a child's parent may not have been
        // inserted yet at this point in the loop).
        created_at: new Date(d.uploadedAt).toISOString(),
        updated_at: new Date(d.updatedAt).toISOString(),
      });
      if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
      report.drawings.push({ id: d.id, label: d.fileName, status: "migrated" });
    } catch (e) {
      report.drawings.push({
        id: d.id,
        label: d.fileName,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Second pass: backfill parentDrawingId / originalDrawingId now that
  // every drawing row in this batch exists.
  const drawingOk = (id: string) =>
    report.drawings.some((r) => r.id === id && r.status !== "failed");
  for (const d of localDrawings) {
    if (!d.parentDrawingId && !d.originalDrawingId) continue;
    if (!drawingOk(d.id)) continue;
    const fields: Record<string, unknown> = {};
    if (d.parentDrawingId) fields.parent_drawing_id = d.parentDrawingId;
    if (d.originalDrawingId) fields.original_drawing_id = d.originalDrawingId;
    const { error } = await client
      .from("drawings")
      .update(fields)
      .eq("id", d.id);
    if (error) {
      const entry = report.drawings.find((r) => r.id === d.id);
      if (entry) {
        entry.status = "failed";
        entry.error = `Row created but lineage link (parent/original) failed: ${error.message}`;
      }
    }
  }

  // ── Views ────────────────────────────────────────────────────────────
  const localViews = await drawingViewRepo.getAll();
  const { data: existingViewRows, error: existingViewsErr } = await client
    .from("drawing_views")
    .select("id");
  if (existingViewsErr) {
    throw new Error(
      `Failed to check already-migrated views: ${existingViewsErr.message}`,
    );
  }
  const existingViewIds = new Set(
    ((existingViewRows as { id: string }[]) ?? []).map((r) => r.id),
  );

  for (const v of localViews) {
    const label = `Page ${v.pageNumber} (drawing ${v.drawingId})`;
    onProgress?.(`View: ${label}`);
    if (existingViewIds.has(v.id)) {
      report.views.push({ id: v.id, label, status: "already_migrated" });
      continue;
    }
    if (!drawingOk(v.drawingId)) {
      report.views.push({
        id: v.id,
        label,
        status: "failed",
        error: `Parent drawing ${v.drawingId} was not migrated`,
      });
      continue;
    }
    try {
      let fabricJson: unknown;
      try {
        fabricJson = JSON.parse(v.fabricJSON);
      } catch {
        throw new Error(
          "fabricJSON is not valid JSON — refusing to migrate a corrupt view.",
        );
      }
      const createdBy = await resolveVerifiedUserId(client, v.createdBy);
      const { error } = await client.from("drawing_views").insert({
        id: v.id,
        drawing_id: v.drawingId,
        page_number: v.pageNumber,
        crop_rect: v.cropRect,
        editor_mode: v.editorMode,
        fabric_json: fabricJson,
        canvas_width: v.canvasWidth ?? null,
        canvas_height: v.canvasHeight ?? null,
        title_block: v.titleBlock,
        created_by: createdBy,
        created_by_name: v.createdByName,
        export_count: v.exportCount,
        created_at: new Date(v.createdAt).toISOString(),
        updated_at: new Date(v.updatedAt).toISOString(),
      });
      if (error) throw new Error(error.message);
      report.views.push({ id: v.id, label, status: "migrated" });
    } catch (e) {
      report.views.push({
        id: v.id,
        label,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── Links ────────────────────────────────────────────────────────────
  const localLinks = await drawingLinkRepo.getAll();
  const { data: existingLinkRows, error: existingLinksErr } = await client
    .from("drawing_links")
    .select("id");
  if (existingLinksErr) {
    throw new Error(
      `Failed to check already-migrated links: ${existingLinksErr.message}`,
    );
  }
  const existingLinkIds = new Set(
    ((existingLinkRows as { id: string }[]) ?? []).map((r) => r.id),
  );

  for (const l of localLinks) {
    const label = `${l.linkedType}:${l.linkedId} (drawing ${l.drawingId})`;
    if (existingLinkIds.has(l.id)) {
      report.links.push({ id: l.id, label, status: "already_migrated" });
      continue;
    }
    if (!drawingOk(l.drawingId)) {
      report.links.push({
        id: l.id,
        label,
        status: "failed",
        error: `Parent drawing ${l.drawingId} was not migrated`,
      });
      continue;
    }
    try {
      const { error } = await client.from("drawing_links").insert({
        id: l.id,
        drawing_id: l.drawingId,
        linked_type: l.linkedType,
        linked_id: l.linkedId,
        created_at: new Date(l.createdAt).toISOString(),
      });
      if (error) throw new Error(error.message);
      report.links.push({ id: l.id, label, status: "migrated" });
    } catch (e) {
      report.links.push({
        id: l.id,
        label,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── Per-user preferences ────────────────────────────────────────────
  // RLS on user_editor_preferences is self-only (id = auth.uid()) — this
  // migration, running as whoever is currently signed in, can only ever
  // write ITS OWN preference row. A local preference belonging to a
  // different historical userId is reported as failed with a clear
  // explanation rather than silently skipped or attempted (and RLS would
  // reject it anyway) — sign in as that user to migrate theirs.
  const localPrefs = await userPreferenceRepo.getAll();
  for (const p of localPrefs) {
    const label = `Editor preference for user ${p.userId}`;
    if (p.userId !== userId) {
      report.preferences.push({
        id: p.id,
        label,
        status: "failed",
        error:
          "Can only migrate the currently signed-in user's own preference (RLS is self-only) — sign in as that user to migrate theirs.",
      });
      continue;
    }
    try {
      const { error } = await client.from("user_editor_preferences").upsert(
        {
          id: p.id,
          remembered_mode: p.rememberedMode ?? null,
          last_project_id: p.lastProjectId ?? null,
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
      report.preferences.push({ id: p.id, label, status: "migrated" });
    } catch (e) {
      report.preferences.push({
        id: p.id,
        label,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  report.finishedAt = new Date().toISOString();
  return report;
}
