-- Add a single optional attached E-Way Bill document to invoices,
-- mirroring company_pos.file's existing shape exactly (PurchaseAttachment:
-- {id?, ref, type, name} as jsonb, ref = a base64 data URI, same tradeoff
-- CompanyPO's own attachment already accepts) rather than inventing new
-- state or a new storage mechanism.
--
-- Presence of this column (not a separate boolean/status field) is the
-- sole source of truth for "E-Way Bill completed": NULL = not attached,
-- non-NULL = attached. Every existing invoice gets NULL on this ALTER,
-- which is correct — none of them have an E-Way Bill on file today (there
-- was never a column to hold one).
--
-- No RLS/grant changes needed: invoices' existing RLS policies and
-- table-level grants are row-level (organization_id-scoped), not
-- column-level, so a new nullable column is automatically covered.
alter table "public"."invoices"
  add column "eway_bill_document" jsonb;
