-- Phase 64 (Employee Job Card Mobile Workflow — server-side evidence
-- enforcement) — proven live: a real Worker account holding only
-- job_cards.edit could UPDATE a job card straight to status='Completed'
-- with rejected_qty > 0 and zero rows in asset_photos, with no server-side
-- objection. RLS on job_cards only ever checks has_permission('job_cards',
-- action) + organization_id - it has no concept of asset_photos or
-- company_settings at all, so the Phase 62 evidence requirement has been
-- enforceable only in MyJobs.tsx's CompleteJobDialog until now, exactly
-- as flagged when this gap was first reported.
--
-- ── Why a plain (non-SECURITY DEFINER) trigger cannot do this safely ──
-- Considered first, since it's the lighter option and matches Phase 61's
-- own enforce_die_drawing_required() precedent, which is a plain
-- SECURITY INVOKER trigger. That works there because drawing_links is
-- readable by anyone who can already reach the die-status-edit path in
-- practice. It does NOT transfer to this case:
--   - company_settings_select requires has_permission('settings','view').
--     A Worker completing their own job card structurally never holds
--     that (and requirement #7 of this phase forbids ever granting it).
--     A SECURITY INVOKER trigger reading company_settings under the
--     Worker's own session would see zero rows every time, regardless of
--     the real configured policy - reproducing the exact silent-RLS-
--     bypass bug this whole phase exists to close, just moved from the
--     frontend read into the trigger.
--   - asset_photos_select requires has_asset_permission('job_card','view')
--     -> has_permission('job_cards','view'). A Worker who holds
--     job_cards.edit without job_cards.view (an unusual but not
--     impossible grant combination - nothing forces the two together) is
--     not guaranteed to see their own job card's photos, so the same
--     invoker-context trigger could file a false "no evidence" block even
--     when a photo genuinely exists.
-- Both risks point the same direction: this check genuinely needs to see
-- the live policy and the true photo state regardless of the caller's own
-- permission grants - the definition of what SECURITY DEFINER exists for,
-- and exactly the same reasoning that already makes has_permission() and
-- current_organization_id() SECURITY DEFINER in this schema. Kept as
-- narrow as those two: this function makes exactly one pass/fail decision
-- and returns nothing else - no data is exposed to the caller through it,
-- matching requirement #7 ("must not give Workers access to
-- company_settings") and the instruction against a broad-access function.
--
-- ── What fires, when ──
-- One new trigger, enforce_job_card_evidence_required(), BEFORE INSERT OR
-- UPDATE ON job_cards, firing its check only when new.status = 'Completed'
-- AND (this is a fresh INSERT arriving already-Completed, OR an UPDATE
-- that is actually changing status into Completed - old.status is
-- distinct from new.status). An already-Completed row being touched again
-- for an unrelated reason (a later note edit, a supervisor correction)
-- never re-fires the check, so no existing completed job card - real or
-- from prior testing - is retroactively affected. Every other status
-- (NotStarted, InProgress, OnHold) is untouched at every step of its
-- lifecycle.
--
-- ── How it decides evidence is required ──
-- Reads company_settings.evidence_requirements for new.organization_id
-- (the row's own already-RLS-checked org, never a client-supplied
-- parameter - this function takes no arguments at all). Required exactly
-- per this phase's own semantics, no invented rule:
--   required := coalesce((value->>'job_card_completion')::boolean, false)
--            or (coalesce((value->>'quality_rejection')::boolean, false)
--                and new.rejected_qty > 0)
-- Missing company_settings row/key, or both flags false, or (rejected_qty
-- = 0 and job_card_completion is false) -> required = false, completion
-- proceeds - matches Phase 60/62's own "ship configurable defaults,
-- missing configuration never blocks" default, and matches
-- MyJobs.tsx's identical evidenceRequired / requirePhotoOnReject
-- computation exactly (Phase 63 already fixed the frontend to read this
-- same live policy correctly for a Worker; this migration is the
-- database's version of that same rule, not a second rule).
--
-- ── How it verifies evidence exists ──
-- exists (select 1 from asset_photos where owner_type = 'job_card' and
-- owner_id = new.id) - the same ownerType/ownerId pair the frontend's
-- AssetPhotoGallery/assetPhotosApi.ts already write on upload (Phase 62).
-- No new photo-storage concept, no duplicate bookkeeping column.
--
-- ── How it prevents bypass ──
-- Runs BEFORE the row is written, inside the same transaction as the
-- INSERT/UPDATE statement itself - there is no code path to
-- status='Completed' that skips it (the frontend's own JobCards.tsx admin
-- edit dialog and MyJobs.tsx's CompleteJobDialog both go through the same
-- job_cards UPDATE; so does any direct Supabase client call, the exact
-- vector proven live). If required and no photo row exists, the trigger
-- raises an exception, the whole statement is rolled back, and the row
-- never reaches 'Completed' - no partial write, no way to retry around
-- it from the client side. job_cards RLS itself is completely untouched;
-- this is an additional check layered on top of it, not a replacement for
-- it.
--
-- ── Behavior summary ──
--   * job_card_completion:false, quality_rejection:true (today's live
--     config), rejected_qty = 0 -> not required, proceeds.
--   * same config, rejected_qty > 0, no photo -> blocked.
--   * same config, rejected_qty > 0, photo exists -> proceeds.
--   * job_card_completion:true (if ever configured) -> required on every
--     completion regardless of rejected_qty.
--   * evidence_requirements row/key absent entirely for an organization
--     -> not required, proceeds (fail-open on missing configuration,
--     never fail-closed - matches every other company_settings consumer
--     in this schema).
--   * any UPDATE that does not change status into 'Completed' (including
--     edits to an already-Completed row) -> trigger body never runs.
--
-- No frontend change needed: MyJobs.tsx already implements this exact
-- same rule (Phase 63) and already surfaces the "photo required" state
-- before ever attempting the write, so a compliant client never hits this
-- trigger's exception in normal use - it only fires for the bypass path
-- this phase set out to close.

begin;

create or replace function public.enforce_job_card_evidence_required()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_policy jsonb;
  v_required boolean;
begin
  if new.status <> 'Completed'
     or (tg_op = 'UPDATE' and old.status is not distinct from new.status)
  then
    return new;
  end if;

  select setting_value into v_policy
  from public.company_settings
  where organization_id = new.organization_id
    and setting_key = 'evidence_requirements';

  v_required := coalesce((v_policy->>'job_card_completion')::boolean, false)
    or (
      coalesce((v_policy->>'quality_rejection')::boolean, false)
      and coalesce(new.rejected_qty, 0) > 0
    );

  if v_required
     and not exists (
       select 1 from public.asset_photos
       where owner_type = 'job_card' and owner_id = new.id
     )
  then
    raise exception
      'This job card requires at least one evidence photo before it can be marked Completed. Attach a photo first.';
  end if;

  return new;
end;
$function$;

comment on function public.enforce_job_card_evidence_required() is
  'Phase 64 - server-side enforcement of company_settings.evidence_requirements, closing a live-proven bypass where a direct Supabase update could mark a job card Completed with no evidence photo, skipping MyJobs.tsx''s own frontend check entirely. SECURITY DEFINER is required (not a broad grant of access - see the migration''s own comment) because the caller (a Worker) is neither expected nor permitted to hold settings.view, so a SECURITY INVOKER trigger would see zero company_settings rows under RLS regardless of the real policy. Reads only evidence_requirements for the row''s own organization_id (never a client-supplied id - this function takes no parameters), checks only for the existence of an asset_photos row for this exact job card, and returns no data to the caller beyond an exception on failure. Fires only on the transition into status = Completed (INSERT arriving pre-Completed, or UPDATE changing into it) - never on any other status, never on an already-Completed row being edited again.';

revoke all on function public.enforce_job_card_evidence_required() from public;
revoke all on function public.enforce_job_card_evidence_required() from authenticated;

drop trigger if exists trg_enforce_job_card_evidence_required on public.job_cards;
create trigger trg_enforce_job_card_evidence_required
  before insert or update on public.job_cards
  for each row
  execute function public.enforce_job_card_evidence_required();

insert into public.schema_migrations (version, description, checksum)
values (
  '20260905_064_phase64_job_card_evidence_server_enforcement',
  'Closes the live-proven direct-API bypass of the Phase 62/63 evidence-photo requirement: adds a BEFORE INSERT OR UPDATE trigger on job_cards (enforce_job_card_evidence_required) that fires only on the transition into status=Completed, reads company_settings.evidence_requirements for the row''s own organization_id via SECURITY DEFINER (required because a Worker never holds settings.view and a SECURITY INVOKER trigger would silently see nothing), checks only for an asset_photos row matching owner_type=job_card/owner_id=<this job card>, and raises an exception (rolling back the write) when evidence is required and absent. job_cards RLS, asset_photos RLS, Storage privacy, and the settings permission module are all completely unchanged. Existing Completed job cards are unaffected since the trigger never re-fires on a row whose status was already Completed.',
  'phase64-v1'
)
on conflict (version) do nothing;

commit;
