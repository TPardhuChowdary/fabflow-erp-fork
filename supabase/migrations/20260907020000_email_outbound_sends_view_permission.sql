-- Phase 5 — Email Center Outbox. WRITTEN, NOT APPLIED per explicit
-- instruction (Section 11: "If a schema change is genuinely required,
-- write the migration but do not apply it").
--
-- The original Phase 5 design gated ALL of email_outbound_sends' RLS
-- (select/insert/update) on has_permission('email','send') — reasonable
-- at the time, since the only thing that ever touched this table was
-- the Agent's send flow, which already required that permission for
-- every step. Now that Email Center's Outbox reads this table for
-- pure viewing (Section 5: "Reuse the existing email.view permission
-- for viewing outbound history... existing email.send remains separate
-- from email.view"), SELECT needs to be gated on 'view' instead —
-- otherwise a user who can see the Inbox (email.view) but was never
-- granted email.send couldn't see their own org's outbound history at
-- all, which is the wrong shape for a read-only audit view.
--
-- INSERT and UPDATE are deliberately left untouched (still
-- 'email.send') — drafting, confirming, and sending remain exactly as
-- gated as before; this migration only loosens who may READ.
alter policy email_outbound_sends_select on public.email_outbound_sends
  using (
    has_permission('email', 'view')
    and organization_id = current_organization_id()
  );
