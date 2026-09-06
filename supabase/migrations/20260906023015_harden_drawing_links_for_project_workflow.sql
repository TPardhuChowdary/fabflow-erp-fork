-- Hardening for the new Project → Design Files "Add Existing Drawings"
-- workflow (see chat). NOT YET APPLIED — written for review per explicit
-- instruction not to push without approval.
--
-- drawing_links and drawings already exist and already carry correct
-- organization-scoped RLS (drawing_editor.{view,create,edit,delete} +
-- organization_id = current_organization_id() on every policy) — nothing
-- about that model changes here. Two narrow gaps found during inspection:
--
-- 1. No uniqueness on drawing_links(drawing_id, linked_type, linked_id) —
--    nothing currently stops the same drawing being linked to the same
--    project twice (confirmed: 0 existing duplicates, so this is safe to
--    add now). The new UI already excludes already-linked drawings from
--    its own "Add Existing" picker, but that is a client-side courtesy,
--    not an enforced guarantee against a direct API call - this is the
--    actual guarantee.
create unique index drawing_links_unique_target_idx
  on public.drawing_links (drawing_id, linked_type, linked_id);

-- 2. drawing_links' own RLS only checks that the LINK ROW's organization_id
--    matches the caller's org — it says nothing about the *linked_id*
--    itself. Because linked_type is polymorphic (project/machine/vendor/
--    customer/die/tool/inventory_item), there's no single FK that could
--    enforce this for every case, but "project" is exactly the one this
--    new workflow adds a first UI path for, so it gets a targeted,
--    narrow trigger rather than a broad change to every linked_type -
--    a direct API call cannot link a drawing to a project belonging to a
--    different organization.
create or replace function public.enforce_drawing_link_project_org_match()
returns trigger
language plpgsql
as $$
declare
  v_project_org uuid;
begin
  if new.linked_type = 'project' then
    select organization_id into v_project_org
    from public.projects
    where id = new.linked_id;
    if v_project_org is null then
      raise exception 'Cannot link drawing: target project % does not exist', new.linked_id;
    end if;
    if v_project_org <> new.organization_id then
      raise exception 'Cannot link drawing: target project belongs to a different organization';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_drawing_link_project_org_match
before insert or update of linked_type, linked_id on public.drawing_links
for each row
execute function public.enforce_drawing_link_project_org_match();
