-- Final regression audit cleanup — one leftover artifact found from the
-- very first E-Way Bill permission test (Test A, view-only user), never
-- removed at the time since that pass's cleanup only covered the
-- test invoice, not this override. ewaybill-qa-test's role ("accounts")
-- grants invoices.edit=true by default; this override had pinned it to
-- false to construct a "view-only" test persona. No longer needed -
-- removing it returns the account to its unmodified role defaults for
-- the invoices module, with zero permission overrides remaining anywhere.
delete from public.user_permission_overrides
where user_id = '351c06d1-9400-4f04-b679-64b077bdafda'::uuid
  and permission_id = (
    select id from public.permissions where module = 'invoices' and action = 'edit'
  );
