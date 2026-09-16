-- Job Card print/layout modifications (see chat) — lets a Job Card act
-- as a clear work instruction: the Project's own reference photo shown
-- small on Page 1, an optional Job Card "Work Reference" photo as a
-- large opt-in Page 2, and the existing linked engineering Drawing as
-- opt-in Page 3+. Smallest safe extension — no new photo-storage or
-- drawing-storage architecture; reuses asset_photos and drawing_links
-- exactly as every other module already does.
--
-- Three additive, nullable/defaulted columns on job_cards:
--
-- reference_photo_id: which of THIS Job Card's own asset_photos rows
-- (owner_type='job_card', owner_id=job_cards.id) is the "Work
-- Reference" photo. Deliberately a NEW column rather than reusing
-- asset_photos.is_primary — is_primary already has an established,
-- different meaning for job_card photos: the "primary" evidence photo
-- an employee marks via CompleteJobCardDialog/MyJobs.tsx at job
-- completion (previously also what got auto-printed on Page 1, see
-- 20260915130000_project_photos.sql's own Job Card generalization).
-- Reusing it here would let an employee's future evidence-photo
-- selection silently overwrite an admin's pre-set print Reference
-- Photo (and vice versa) — exactly the evidence/reference conflation
-- the feature spec explicitly warns against ("must not be mixed").
-- ON DELETE SET NULL: deleting the referenced photo (e.g. via
-- AssetPhotoGallery's own Delete) must never fail or cascade-delete
-- the Job Card — it just stops being printable until reselected.
--
-- print_reference_photo / print_drawing: per-Job-Card persisted print
-- options (never localStorage/Zustand-only — these are business
-- settings). Both default false: printing a reference photo or a
-- drawing is opt-in, matching the spec's explicit default.
alter table job_cards
  add column reference_photo_id uuid references asset_photos(id) on delete set null;

alter table job_cards
  add column print_reference_photo boolean not null default false;

alter table job_cards
  add column print_drawing boolean not null default false;

-- Defense in depth (see chat's security section: "Do not trust
-- arbitrary client-supplied photo IDs... without validating
-- ownership/relationship server-side"). The FK above only proves
-- reference_photo_id exists in asset_photos — not that it belongs to
-- THIS job card. Without this trigger a client could set any
-- asset_photos id it can merely SELECT (another job card's, or even
-- another owner type's, photo) as this job card's Reference Photo.
-- Mirrors validate_job_card_stage_reference()'s own same-parent-entity
-- check (20260906060000) for the analogous stage_id FK.
create or replace function public.validate_job_card_reference_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.reference_photo_id is not null then
    if not exists (
      select 1 from public.asset_photos
      where id = NEW.reference_photo_id
        and owner_type = 'job_card'
        and owner_id = NEW.id
        and organization_id = NEW.organization_id
    ) then
      raise exception 'reference_photo_id must belong to this job card';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_validate_job_card_reference_photo on public.job_cards;
create trigger trg_validate_job_card_reference_photo
  before insert or update of reference_photo_id on public.job_cards
  for each row
  execute function public.validate_job_card_reference_photo();

-- Widen the existing Drawing Repository many-to-many link table to
-- allow Job Cards — same established pattern as Phase 43's "die" and
-- Phase 6's "tool"/"inventory_item" widenings of this exact same
-- constraint. No new table, no second drawing renderer, no duplicated
-- drawing data — just one more valid linked_type value on the table
-- every other module already links through.
alter table drawing_links drop constraint drawing_links_linked_type_check;
alter table drawing_links add constraint drawing_links_linked_type_check
  check (linked_type = any (array['project', 'machine', 'vendor', 'customer', 'die', 'tool', 'inventory_item', 'job_card']));
