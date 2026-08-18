-- FabFlow ERP — Phase 44: invoice_items.project_id (Unify Project
-- Selection in Quotations & Invoices).
--
-- Today, neither quotations.line_items (a jsonb blob, so it needs no
-- migration) nor invoice_items (a real decomposed table - see
-- invoicesApi.ts's own header comment, "invoice_items is a real
-- decomposed table") carries a per-line-item project association.
-- Invoice's existing "+ Add Projects" feature converts a selected
-- project into a line item by copying its display name into the
-- description string and then discarding the project id entirely -
-- there has never been a way to tell, after the fact, which line item
-- (if any) came from which project.
--
-- This migration adds one additive, nullable FK column to invoice_items,
-- mirroring the exact pattern already used for quotations.project_id and
-- invoices.project_id (both already FK to public.projects). Nullable and
-- ON DELETE SET NULL so it never blocks a project deletion and never
-- requires backfilling existing rows - every pre-existing invoice_items
-- row simply gets project_id = NULL, which is the correct, honest
-- representation of "we don't know which project (if any) this
-- historical line item came from," since that information was never
-- captured before this migration.
--
-- No other column, table, trigger, or constraint is touched.

begin;

alter table public.invoice_items
  add column if not exists project_id uuid references public.projects(id) on delete set null;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260818_044_phase44_invoice_items_project_id',
  'Phase 44: invoice_items gets a nullable project_id uuid FK to public.projects (ON DELETE SET NULL), mirroring the existing quotations.project_id/invoices.project_id pattern. Enables persisting which project (if any) each individual invoice line item came from, unifying Invoice''s "+ Add Projects" feature with the new equivalent added to Quotation. Pre-existing rows are left as project_id = NULL (no backfill - that association was never captured before this migration).',
  'phase44-invoice-items-project-id-v1'
)
on conflict (version) do nothing;

commit;
