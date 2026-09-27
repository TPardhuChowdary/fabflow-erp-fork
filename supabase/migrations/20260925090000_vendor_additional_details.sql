-- Vendor Additional Details (see chat) — REVIEW ONLY, NOT APPLIED. Do
-- not run supabase db push against this file until explicitly approved.
--
-- Adds a single free-form field-name/value list to vendors, mirroring
-- customers.additional_details exactly (same jsonb array of
-- {key, value} pairs, same nullable-no-default shape, same "no RLS
-- change needed" reasoning — it is just another column on a table whose
-- existing SELECT/INSERT/UPDATE/DELETE policies already cover every
-- column, not a new table). This replaces the need for a dedicated
-- column per vendor attribute (email, delivery address, contact
-- person, payment terms, ...): the user names the field and enters the
-- value directly, the same way Customer's own Additional Details
-- already works.
--
-- Purely additive: existing vendor rows get additional_details = null,
-- which the frontend already treats as "no details yet" (rowToVendor's
-- `?? undefined`), identical to how existing customers rows behaved
-- before this feature was used for them. No existing column altered or
-- dropped; vendors.email stays exactly as it is (Additional Details is
-- a separate, generic mechanism — not a replacement for that column's
-- data, which nothing here touches).

alter table public.vendors
  add column additional_details jsonb null;

comment on column public.vendors.additional_details is
  'Free-form field-name/value pairs (e.g. Email, Delivery Address, Contact Person, Payment Terms), same convention as customers.additional_details. NULL means no details entered yet.';
