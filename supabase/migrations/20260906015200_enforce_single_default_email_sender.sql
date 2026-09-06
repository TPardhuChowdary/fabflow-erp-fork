-- Default-sender enforcement for email_accounts, so password-recovery OTP
-- emails (and any future outbound feature) can trust "the org's default
-- sender" to be unambiguous.
--
-- NOT YET APPLIED — written for review, per explicit instruction not to
-- push/apply without approval.
--
-- is_default_sender already exists on email_accounts (not new). What's
-- missing is enforcement: today nothing stops two rows in the same
-- organization_id both being true, and nothing automatically clears the
-- old default when a new one is chosen — the client would need a
-- two-step "unset old, set new" that's neither atomic nor guaranteed.
--
-- Two layers, deliberately both present:
--
-- 1. A BEFORE trigger that makes "make this one the default" a true
--    single-row client action: whenever a row's is_default_sender is set
--    to true (insert or update), every OTHER row in the same
--    organization_id is cleared to false first, in the same statement.
--    The existing updateEmailAccountSettings({isDefaultSender: true})
--    client function and the new "Make Default" UI action need no
--    change to their call shape - they already do exactly a single-row
--    update.
create or replace function public.enforce_single_default_email_sender()
returns trigger
language plpgsql
as $$
begin
  update public.email_accounts
  set is_default_sender = false
  where organization_id = new.organization_id
    and id <> new.id
    and is_default_sender = true;
  return new;
end;
$$;

create trigger trg_enforce_single_default_email_sender
before insert or update of is_default_sender on public.email_accounts
for each row
when (new.is_default_sender = true)
execute function public.enforce_single_default_email_sender();

-- 2. A partial unique index as the structural backstop the trigger alone
--    can't fully guarantee (e.g. a single multi-row UPDATE statement
--    that tries to set two different rows true at once - the trigger's
--    nested UPDATE only clears rows that are true when EACH row's own
--    BEFORE fires, which doesn't perfectly serialize a same-statement
--    multi-row write). This is what makes "two defaults in one org" a
--    hard error instead of a silent inconsistency, regardless of which
--    code path attempted it - the client library, a future RPC, or a
--    direct database session.
create unique index email_accounts_one_default_per_org_idx
  on public.email_accounts (organization_id)
  where is_default_sender = true;
