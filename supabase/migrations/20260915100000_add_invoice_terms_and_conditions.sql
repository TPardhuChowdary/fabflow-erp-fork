-- DRAFT — NOT APPLIED. Do not run against the live project without
-- explicit approval first.
--
-- Adds a per-invoice Terms & Conditions snapshot column, mirroring the
-- already-existing, already-working pattern on quotations.terms and
-- company_pos.terms_and_conditions. Nullable, no default: existing
-- invoices get NULL and keep rendering via the existing
-- invoice.termsAndConditions || settings.companyTerms || DEFAULT_TERMS
-- fallback already implemented in InvoicePrintView.tsx and
-- documentRenderers.tsx (neither of which this change touches). Purely
-- additive — no existing row is modified, no existing column is altered.

alter table public.invoices
add column terms_and_conditions text;
