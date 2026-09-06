// Phase 56 (Group 2) / Phase 23 — Final Tender PDF Pack assembly.
//
// Builds one real merged PDF: a cover page + index (drawn fresh via
// pdf-lib), followed by the actual bytes of every matched Company
// Document (Phase 55/17) in priority order — never a placeholder, never
// a fabricated "document". Anything mandatory but unmatched is listed
// explicitly on the index page under "Missing — not included", exactly
// per the roadmap's "NEVER fabricate missing documents... explicitly
// identify it instead" instruction.
//
// Only PDFs and JPEG/PNG images can be embedded as real pages (pdf-lib's
// actual capability) — any other matched file type is listed on the
// index as "attached separately" rather than silently dropped or faked.

import { getCompanyDocumentSignedUrl } from "@/lib/companyDocumentsApi";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { CompanyDocument, Tender, TenderRequirement } from "@/types";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";
export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

const TENDER_DOCUMENTS_BUCKET = "tender-documents";
const EMBEDDABLE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "doc"
  );
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch document (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

interface PackInput {
  tender: Tender;
  requirements: TenderRequirement[];
  companyDocuments: CompanyDocument[];
}

/** Assembles the pack in memory and returns its bytes — does not upload.
 * Split from the upload step so a caller could preview/re-run without a
 * network round trip if that's ever needed. */
export async function assembleTenderPackBytes(
  input: PackInput,
): Promise<{ bytes: Uint8Array; includedCount: number; missingCount: number }> {
  const { tender, requirements, companyDocuments } = input;
  const sorted = [...requirements].sort(
    (a, b) => a.priority - b.priority || a.displayOrder - b.displayOrder,
  );

  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  // ── Cover page ──
  const cover = out.addPage([595, 842]); // A4
  cover.drawText("Tender Submission Pack", {
    x: 50,
    y: 780,
    size: 22,
    font: bold,
  });
  cover.drawText(`${tender.tenderNumber} — ${tender.title}`, {
    x: 50,
    y: 745,
    size: 13,
    font,
  });
  if (tender.authorityName) {
    cover.drawText(`Authority: ${tender.authorityName}`, {
      x: 50,
      y: 720,
      size: 11,
      font,
    });
  }
  if (tender.submissionDeadline) {
    cover.drawText(
      `Submission Deadline: ${new Date(tender.submissionDeadline).toLocaleString("en-IN")}`,
      { x: 50, y: 700, size: 11, font },
    );
  }
  cover.drawText(`Generated: ${new Date().toLocaleString("en-IN")}`, {
    x: 50,
    y: 680,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // ── Index page ──
  const index = out.addPage([595, 842]);
  index.drawText("Document Index", { x: 50, y: 790, size: 16, font: bold });
  let y = 755;
  let n = 1;
  let includedCount = 0;
  let missingCount = 0;
  const toEmbed: { requirement: TenderRequirement; doc: CompanyDocument }[] =
    [];

  for (const req of sorted) {
    const doc = req.matchedCompanyDocumentId
      ? companyDocuments.find((d) => d.id === req.matchedCompanyDocumentId)
      : undefined;
    if (index.getHeight() && y < 60) {
      y = 790;
    }
    if (doc) {
      const embeddable = EMBEDDABLE_MIME_TYPES.has(doc.mimeType || "");
      index.drawText(`${n}. ${req.requirementText.slice(0, 70)}`, {
        x: 50,
        y,
        size: 10,
        font,
      });
      index.drawText(
        embeddable
          ? `    -> ${doc.title} (included below)`
          : `    -> ${doc.title} (attached separately - file type not mergeable)`,
        { x: 50, y: y - 13, size: 9, font, color: rgb(0.2, 0.45, 0.2) },
      );
      if (embeddable) {
        toEmbed.push({ requirement: req, doc });
        includedCount++;
      }
    } else {
      index.drawText(`${n}. ${req.requirementText.slice(0, 70)}`, {
        x: 50,
        y,
        size: 10,
        font,
      });
      index.drawText(
        req.isMandatory
          ? "    -> MISSING - not included (mandatory)"
          : "    -> Missing - not included",
        { x: 50, y: y - 13, size: 9, font, color: rgb(0.7, 0.15, 0.15) },
      );
      missingCount++;
    }
    y -= 30;
    n++;
  }

  // ── Merge each matched document's real bytes ──
  for (const { doc } of toEmbed) {
    const url = await getCompanyDocumentSignedUrl(doc.storagePath);
    if (!url) continue; // best-effort — index already disclosed it above
    try {
      const bytes = await fetchBytes(url);
      if (doc.mimeType === "application/pdf") {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const p of pages) out.addPage(p);
      } else if (
        doc.mimeType === "image/jpeg" ||
        doc.mimeType === "image/png"
      ) {
        const img =
          doc.mimeType === "image/jpeg"
            ? await out.embedJpg(bytes)
            : await out.embedPng(bytes);
        const page = out.addPage([595, 842]);
        const scale = Math.min(495 / img.width, 700 / img.height, 1);
        page.drawImage(img, {
          x: 50,
          y: 800 - img.height * scale,
          width: img.width * scale,
          height: img.height * scale,
        });
      }
    } catch {
      // A single unreadable/corrupt source file must not abort the whole
      // pack — its absence is already disclosed on the index page.
    }
  }

  const bytes = await out.save();
  return { bytes, includedCount, missingCount };
}

/** Assembles the pack, uploads it to Storage with a deterministic
 * user-facing filename, and stamps tenders.final_pack_storage_path. */
export async function generateAndSaveTenderPack(
  input: PackInput,
): Promise<WriteResult<Tender>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return { status: "unauthenticated" };

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("organization_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return { status: "error", error: "Could not resolve your organization." };
  }
  const orgId = (profile as { organization_id: string }).organization_id;

  const { bytes } = await assembleTenderPackBytes(input);
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // Deterministic, sanitized filename per the roadmap's automatic-naming
  // rule: TENDER-{tender_no}_{document_type}_{entity}_{date}.pdf
  const filename = `TENDER-${slug(input.tender.tenderNumber)}_FINAL-PACK_${datePart}.pdf`;
  const path = `${orgId}/${input.tender.id}/${filename}`;

  const { error: uploadError } = await client.storage
    .from(TENDER_DOCUMENTS_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    return { status: "error", error: `Upload failed: ${uploadError.message}` };
  }

  const { data, error } = await client
    .from("tenders")
    .update({
      final_pack_storage_path: path,
      final_pack_generated_at: new Date().toISOString(),
    })
    .eq("id", input.tender.id)
    .select();
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  if (rows.length === 0) {
    return { status: "denied", error: "Tender not found or access denied." };
  }
  const row = rows[0];
  return {
    status: "success",
    data: {
      ...input.tender,
      finalPackStoragePath: row.final_pack_storage_path as string,
      finalPackGeneratedAt: new Date(
        row.final_pack_generated_at as string,
      ).getTime(),
    },
  };
}
