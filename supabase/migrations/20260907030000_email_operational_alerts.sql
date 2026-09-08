-- Phase 7 Email Operations — proactive operational alerts.
--
-- NOT YET APPLIED — written for review, per explicit instruction not to
-- push/apply without approval.
--
-- Why a new table rather than reusing anything: repo-wide audit (see the
-- Phase 7 report) confirmed FabFlow has exactly two existing "attention"
-- mechanisms — the Agent's findAttentionItems query and the Dashboard's
-- AttentionLayer component — and both are purely EPHEMERAL: recomputed
-- fresh from already-hydrated ERP stores on every call/render, with no
-- persisted row, no id, no acknowledgment state, and no email awareness
-- at all. Neither can hold "this specific email was analyzed, here is
-- the durable verdict, has a human seen it yet" — which is exactly what
-- proactive email monitoring requires (task's own explicit ask: "every
-- analyzed message must have a durable identity/idempotency mechanism").
-- There is also no existing notifications/alerts table anywhere in the
-- schema (confirmed: zero tables matching '%notif%' or '%alert%').
--
-- The UNIQUE constraint on email_message_id below IS the idempotency
-- mechanism task 7 asks for: re-running the scan against an
-- already-alerted message hits a unique violation, which the calling
-- code (see agent/actions.ts's recordEmailAlert) treats as "already
-- exists" rather than creating a duplicate or re-notifying anyone.
--
-- Lifecycle (enforced by trigger, not just application code, matching
-- email_outbound_sends' own precedent): new -> acknowledged -> resolved,
-- with new -> resolved also legal (skipping acknowledgment is fine —
-- the task's "keep it simple" instruction, not every alert needs an
-- explicit ack step). No transition out of resolved: reopening a
-- resolved alert is a future ask, not this phase's.

create table public.email_operational_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default current_organization_id(),
  created_by uuid not null default auth.uid(),
  -- One alert per message, enforced below — this is the durable
  -- identity/deduplication mechanism, keyed off the stable email row
  -- (itself keyed off the provider's own message id at sync time).
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  -- Denormalized for mailbox-scoped queries/RLS-free filtering without
  -- a join — the same email_account_id already sits on email_messages,
  -- this is just a snapshot at analysis time (an alert never needs to
  -- track a message being moved to a different mailbox after the fact).
  email_account_id uuid not null references public.email_accounts(id) on delete cascade,
  issue_type text not null check (issue_type in (
    'delivery_delay', 'quantity_change', 'quality_rejection', 'po_change',
    'invoice_po_mismatch', 'price_discrepancy', 'correction_revision',
    'follow_up_reminder', 'duplicate', 'unanswered', 'ambiguous_match', 'other'
  )),
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  -- Same four-way scale as Phase 6's MATCHING guidance (orchestrator.ts)
  -- — never a numeric score, and 'ambiguous' here must never be treated
  -- as a resolved ERP association (see that same section).
  confidence text not null check (confidence in ('high_confidence', 'possible_match', 'ambiguous', 'no_match')),
  summary text not null,
  -- Each element: {"type":"customer"|"vendor"|"project"|"customer_po"|
  -- "company_po"|"invoice"|"quotation"|"delivery_challan"|"job_card"|...,
  -- "id":"<uuid>","label":"...","confidence":"<same 4-way scale>"} — a
  -- snapshot of what MATCHING found at analysis time, not a live FK
  -- (the underlying record may since have changed; this alert describes
  -- what was true when it was raised).
  matched_records jsonb not null default '[]'::jsonb,
  -- Free-form structured detail for whatever quantities/amounts/dates
  -- were actually compared (e.g. {"emailQty":25,"erpQty":10,"unit":"nos"})
  -- — deliberately not a fixed schema, since which fields exist depends
  -- entirely on which issue_type and which ERP record type was involved;
  -- never inventing a field the source tool didn't actually return.
  details jsonb not null default '{}'::jsonb,
  recommended_action text,
  status text not null default 'new' check (status in ('new', 'acknowledged', 'resolved')),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_operational_alerts_message_unique unique (email_message_id)
);

create index email_operational_alerts_org_status_idx
  on public.email_operational_alerts (organization_id, status);

create index email_operational_alerts_account_idx
  on public.email_operational_alerts (email_account_id);

comment on table public.email_operational_alerts is
  'Phase 7 Email Operations — proactive, read-only operational alerts derived from analyzing synced email. Detection and notification only: nothing in this table or the code that writes to it may perform, or result from, an autonomous ERP mutation, an outbound email, or a permission bypass. One row per email_message_id (enforced by the unique constraint), which is the durable idempotency mechanism preventing repeat analysis from duplicating or re-notifying.';

create or replace function public.validate_email_alert_status_transition()
returns trigger
language plpgsql
as $$
declare
  is_allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;
  is_allowed := (old.status, new.status) in (
    ('new', 'acknowledged'),
    ('new', 'resolved'),
    ('acknowledged', 'resolved')
  );
  if not is_allowed then
    raise exception 'Invalid email_operational_alerts status transition from % to % (id=%)', old.status, new.status, old.id;
  end if;
  return new;
end;
$$;

create trigger trg_validate_email_alert_status_transition
before update of status on public.email_operational_alerts
for each row
when (new.status is distinct from old.status)
execute function public.validate_email_alert_status_transition();

create or replace function public.touch_email_operational_alert_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_touch_email_operational_alert_updated_at
before update on public.email_operational_alerts
for each row
execute function public.touch_email_operational_alert_updated_at();

alter table public.email_operational_alerts enable row level security;

-- Gated on 'email.view', not 'email.send' — an alert is a byproduct of
-- reading/monitoring a mailbox (no external side effect, same "kind"
-- reasoning as draftEmailReply/draftNewEmail in Phase 5), not a
-- send-capable action. Acknowledging/resolving is likewise a plain
-- visibility-scoped state toggle, same precedent as
-- markEmailMessageRead's own is_read column already being gated on
-- 'email.view' territory. No DELETE policy — an alert, once raised, is
-- a permanent record of what was detected and when, same precedent as
-- email_outbound_sends.
create policy email_operational_alerts_select on public.email_operational_alerts
for select
using (has_permission('email', 'view') and organization_id = current_organization_id());

create policy email_operational_alerts_insert on public.email_operational_alerts
for insert
with check (has_permission('email', 'view') and organization_id = current_organization_id());

create policy email_operational_alerts_update on public.email_operational_alerts
for update
using (has_permission('email', 'view') and organization_id = current_organization_id())
with check (organization_id = current_organization_id());
