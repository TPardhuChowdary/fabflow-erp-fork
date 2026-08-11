-- FabFlow ERP — Phase 15 QMS master-data SEED (separate from and NOT part
-- of phase15_qms_master_data_FINAL.sql, per explicit instruction: schema
-- migration and data seed are different concerns, run as two separate,
-- deliberate steps).
--
-- Requires phase15_qms_master_data_FINAL.sql to already be applied.
--
-- What this is: the exact same starter/demo master data the IndexedDB
-- version has always auto-seeded once per browser (qms/db/seed.ts,
-- seedQmsData() + seedInspectionStages() — read in full before writing
-- this file). Nothing here is invented, simplified, or reordered —
-- every name, sequence, tolerance, tag, and relationship below is
-- transcribed exactly from that file. Auto-generated from seed.ts's exact
-- data via a script (not hand-typed) specifically to eliminate
-- transcription error across ~83 rows; regenerate the same way if
-- seed.ts's starter data ever changes.
--
-- IDs: seed.ts generates a fresh crypto.randomUUID() per browser on every
-- first load — there is no single "existing" id to preserve here, since
-- this data has never lived in one shared place before. This file mints
-- ONE fixed, real set of uuids (real uuid4, generated once by this
-- script) and uses them consistently for every foreign key below.
--
-- Idempotent and safe to run more than once: every insert uses
-- `on conflict (id) do nothing` — a second run is a guaranteed no-op, not
-- a duplicate-insert risk. Not a schema change, so it is deliberately
-- NOT registered in schema_migrations (no checksum row) — running it
-- twice must never require a migration-tracking rollback.
--
-- Scope: manufacturing_processes (17 + the "Final Inspection" process
-- seedInspectionStages() also creates = 18), operations (1 per process =
-- 18, mirroring each process's name/sequence exactly as seed.ts does),
-- inspection_methods (11), quality_characteristics (24), qms_templates
-- (3, referencing the characteristics above by their new fixed ids),
-- inspection_stage_definitions (9). qms_favorites is deliberately never
-- seeded here — favorites are inherently per-user, seed.ts itself never
-- touches favoriteRepo either.
--
-- Do NOT run this automatically. Run only when you decide production
-- Supabase should have this starter data (organization-wide, shared by
-- everyone in the org, unlike the old per-browser IndexedDB seed).
--
-- organization_id: explicitly set to a literal, live-verified value on
-- every row (see the runtime check below) rather than relying on the
-- organization_id column's `default public.current_organization_id()`
-- — that default reads auth.uid(), which is NULL in a raw SQL Editor
-- session (no authenticated request/JWT context), unlike every normal
-- app-driven INSERT. This is what caused the first run of this file to
-- fail with a NOT NULL violation; fixed here without touching FINAL.sql
-- or any application code.

begin;

-- Runtime safety check (Requirements 10-12 of the fix instructions):
-- verifies exactly one organization exists and it is the one this seed
-- was authored against (verified live via
-- `select id, name from public.organizations` immediately before writing
-- this file: 00000000-0000-0000-0000-000000000001, "Shanmukha Sai Engineering Works"). Aborts loudly
-- rather than silently guessing if that has changed since. Every
-- organization_id value below is this same literal, verified id — never
-- current_organization_id(), which depends on auth.uid() and is always
-- NULL in a raw SQL Editor session (root cause of the original failure).
do $$
declare
  v_org_count integer;
  v_org_id uuid;
begin
  select count(*) into v_org_count from public.organizations;
  if v_org_count <> 1 then
    raise exception 'Expected exactly 1 organization, found %. Refusing to guess which one should receive this seed -- resolve manually.', v_org_count;
  end if;

  select id into v_org_id from public.organizations limit 1;
  if v_org_id <> '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'The single organization id (%) does not match the one this seed was authored against (00000000-0000-0000-0000-000000000001). Refusing to guess -- verify and update this file explicitly.', v_org_id;
  end if;
end $$;
-- ── manufacturing_processes ──────────────────────────────────────
insert into public.manufacturing_processes (id, organization_id, name, sequence, active) values
  ('8b257432-4e17-4a57-9b04-a06966d98854', '00000000-0000-0000-0000-000000000001', 'Material Receiving', 1, true),
  ('2d3913da-0cf0-4031-9dc9-45892d322031', '00000000-0000-0000-0000-000000000001', 'Cutting', 2, true),
  ('0c184ad6-639d-444c-a2cd-7ebf3bb3f21f', '00000000-0000-0000-0000-000000000001', 'Laser Cutting', 3, true),
  ('3559f868-2e72-4314-b48c-69c51d6bf103', '00000000-0000-0000-0000-000000000001', 'Punching', 4, true),
  ('02f0afd0-bc4d-4d88-b1a2-2c730b67d498', '00000000-0000-0000-0000-000000000001', 'Drilling', 5, true),
  ('9f288ebf-d232-4db8-b2c6-7bbc13a44b3f', '00000000-0000-0000-0000-000000000001', 'Tapping', 6, true),
  ('abbbd1b3-4d52-41bf-8a38-502f9377f4d3', '00000000-0000-0000-0000-000000000001', 'Bending', 7, true),
  ('9559629b-0f31-4a56-a148-5af71921ff3e', '00000000-0000-0000-0000-000000000001', 'Machining', 8, true),
  ('fdcbd55a-fd0b-4f73-a4c9-6a8c5c0da033', '00000000-0000-0000-0000-000000000001', 'Welding', 9, true),
  ('ecc89902-ce9f-4060-ab10-d255f3e9c68a', '00000000-0000-0000-0000-000000000001', 'Grinding', 10, true),
  ('d4ba013d-f276-4a82-8cea-734bdb43d53d', '00000000-0000-0000-0000-000000000001', 'Surface Preparation', 11, true),
  ('e47f2ab2-b29e-4907-a3a4-2a1b5336d1e5', '00000000-0000-0000-0000-000000000001', 'Powder Coating', 12, true),
  ('57d8e825-90a6-4fbd-8acc-9d87b1a6edbd', '00000000-0000-0000-0000-000000000001', 'Painting', 13, true),
  ('1660bc98-7eaf-4ff4-99f5-bbc277bce890', '00000000-0000-0000-0000-000000000001', 'Assembly', 14, true),
  ('91f79b9f-7074-4e42-84dc-4eddf8ccaff5', '00000000-0000-0000-0000-000000000001', 'Testing', 15, true),
  ('d79acc90-e545-4021-ab4e-dd4528eb9a21', '00000000-0000-0000-0000-000000000001', 'Packaging', 16, true),
  ('7ec89073-6989-4fa0-b8e3-de7a27af1726', '00000000-0000-0000-0000-000000000001', 'Dispatch', 17, true),
  ('cf912074-964a-4b99-bcb9-0dbce18e5b55', '00000000-0000-0000-0000-000000000001', 'Final Inspection', 18, true)
on conflict (id) do nothing;

-- ── operations (one per process, mirrors seed.ts exactly) ───────
insert into public.operations (id, organization_id, process_id, name, sequence, required_skills, required_machines, active) values
  ('237a73c3-b3c9-456b-bc59-299ca5b51343', '00000000-0000-0000-0000-000000000001', '8b257432-4e17-4a57-9b04-a06966d98854', 'Material Receiving', 1, '{}', '{}', true),
  ('226f71a3-e884-40d8-b965-df5a8b0d4d00', '00000000-0000-0000-0000-000000000001', '2d3913da-0cf0-4031-9dc9-45892d322031', 'Cutting', 2, '{}', '{}', true),
  ('acf05d09-e929-4a94-81dd-497adb9b31ba', '00000000-0000-0000-0000-000000000001', '0c184ad6-639d-444c-a2cd-7ebf3bb3f21f', 'Laser Cutting', 3, '{}', '{}', true),
  ('f829417c-0e60-4ba5-b5c8-2ed9197d8b68', '00000000-0000-0000-0000-000000000001', '3559f868-2e72-4314-b48c-69c51d6bf103', 'Punching', 4, '{}', '{}', true),
  ('abcaef03-b438-4f08-a42b-6335cf005907', '00000000-0000-0000-0000-000000000001', '02f0afd0-bc4d-4d88-b1a2-2c730b67d498', 'Drilling', 5, '{}', '{}', true),
  ('dc9b21e7-4e28-4941-bd87-c895ccd6bc45', '00000000-0000-0000-0000-000000000001', '9f288ebf-d232-4db8-b2c6-7bbc13a44b3f', 'Tapping', 6, '{}', '{}', true),
  ('5b479d32-c602-410b-ab68-f544f5814541', '00000000-0000-0000-0000-000000000001', 'abbbd1b3-4d52-41bf-8a38-502f9377f4d3', 'Bending', 7, '{}', '{}', true),
  ('a9840c15-cb5b-494b-b2da-022fa53dc4cd', '00000000-0000-0000-0000-000000000001', '9559629b-0f31-4a56-a148-5af71921ff3e', 'Machining', 8, '{}', '{}', true),
  ('14b848fd-9d7a-4c41-8ddc-d30f60e8cbc2', '00000000-0000-0000-0000-000000000001', 'fdcbd55a-fd0b-4f73-a4c9-6a8c5c0da033', 'Welding', 9, '{}', '{}', true),
  ('c4f0b3d4-062e-4445-8f4d-6f1db08a4fff', '00000000-0000-0000-0000-000000000001', 'ecc89902-ce9f-4060-ab10-d255f3e9c68a', 'Grinding', 10, '{}', '{}', true),
  ('f014d324-9e3a-47f1-a423-4d0d752a4159', '00000000-0000-0000-0000-000000000001', 'd4ba013d-f276-4a82-8cea-734bdb43d53d', 'Surface Preparation', 11, '{}', '{}', true),
  ('1c71e26e-3211-4ed8-b5d6-f119a2a42bce', '00000000-0000-0000-0000-000000000001', 'e47f2ab2-b29e-4907-a3a4-2a1b5336d1e5', 'Powder Coating', 12, '{}', '{}', true),
  ('e56b6625-bfee-451f-9f50-466557fe9938', '00000000-0000-0000-0000-000000000001', '57d8e825-90a6-4fbd-8acc-9d87b1a6edbd', 'Painting', 13, '{}', '{}', true),
  ('08908039-6529-49c8-87b9-50503d7607b1', '00000000-0000-0000-0000-000000000001', '1660bc98-7eaf-4ff4-99f5-bbc277bce890', 'Assembly', 14, '{}', '{}', true),
  ('84f76bf3-7aa7-46dd-a9ef-80a93bc36f76', '00000000-0000-0000-0000-000000000001', '91f79b9f-7074-4e42-84dc-4eddf8ccaff5', 'Testing', 15, '{}', '{}', true),
  ('531b8089-52f7-48fd-bbde-c2c3c0e99f1c', '00000000-0000-0000-0000-000000000001', 'd79acc90-e545-4021-ab4e-dd4528eb9a21', 'Packaging', 16, '{}', '{}', true),
  ('f214ac0c-85bd-4ae8-9dd6-acbdde1fbe77', '00000000-0000-0000-0000-000000000001', '7ec89073-6989-4fa0-b8e3-de7a27af1726', 'Dispatch', 17, '{}', '{}', true),
  ('52b8660d-b6df-4eb9-90d6-d8c225e3efc6', '00000000-0000-0000-0000-000000000001', 'cf912074-964a-4b99-bcb9-0dbce18e5b55', 'Final Inspection', 18, '{}', '{}', true)
on conflict (id) do nothing;

-- ── inspection_methods ───────────────────────────────────────────
insert into public.inspection_methods (id, organization_id, name, type, active) values
  ('c7b98be7-5846-4875-8d7b-11b4abc066f2', '00000000-0000-0000-0000-000000000001', 'Pass / Fail Check', 'PassFail', true),
  ('af810872-732f-4fc1-a9de-6463a7e75383', '00000000-0000-0000-0000-000000000001', 'Numeric Measurement', 'Numeric', true),
  ('0f9b91eb-629b-4c23-a8c8-0d37bf22993c', '00000000-0000-0000-0000-000000000001', 'Multiple Numeric Measurements', 'MultiNumeric', true),
  ('50551fad-51e7-4df0-85be-8ae6ad92bced', '00000000-0000-0000-0000-000000000001', 'Text Entry', 'Text', true),
  ('eb33f646-6040-4802-abb7-6a293021eaf9', '00000000-0000-0000-0000-000000000001', 'Dropdown Selection', 'Dropdown', true),
  ('5f75f4c9-a650-4633-b057-3d7ed9ad4712', '00000000-0000-0000-0000-000000000001', 'Checkbox Confirmation', 'Checkbox', true),
  ('3fcda313-97a7-4173-97f4-5b321acdef1c', '00000000-0000-0000-0000-000000000001', 'Photo Capture', 'Photo', true),
  ('6d62950b-de00-4e01-bbd1-e83b33e8f7bc', '00000000-0000-0000-0000-000000000001', 'File Upload', 'File', true),
  ('cea57ff9-8ace-4c9f-a9ae-a9596c32e548', '00000000-0000-0000-0000-000000000001', 'Certificate Upload', 'Certificate', true),
  ('066bddfd-f4de-46b2-8601-efffc5b52147', '00000000-0000-0000-0000-000000000001', 'Barcode Scan', 'BarcodeScan', true),
  ('c2bd0125-c11e-4e86-9b08-c5e4b388891b', '00000000-0000-0000-0000-000000000001', 'QR Code Scan', 'QRScan', true)
on conflict (id) do nothing;

-- ── quality_characteristics ──────────────────────────────────────
insert into public.quality_characteristics (id, organization_id, name, description, category, process_id, operation_id, criticality, inspection_method_id, acceptance_criteria, tolerance_nominal, tolerance_plus, tolerance_minus, unit, measuring_instrument, standard_reference, evidence_required, photo_required, tags, version, status) values
  ('7ad01ebd-39c5-4450-be8d-47fed110eaba', '00000000-0000-0000-0000-000000000001', 'Material Certificate Verification', 'Verify mill test certificate matches PO grade/spec before material is accepted.', 'Documentation', '8b257432-4e17-4a57-9b04-a06966d98854', '237a73c3-b3c9-456b-bc59-299ca5b51343', 'RegulatoryCritical', 'cea57ff9-8ace-4c9f-a9ae-a9596c32e548', 'MTC present, grade matches PO, no discrepancy', null, null, null, null, null, null, true, false, ARRAY['incoming','mtc','traceability']::text[], 1, 'Active'),
  ('05c55361-3802-43fc-8cac-400a55f486ca', '00000000-0000-0000-0000-000000000001', 'Cut Length Accuracy', 'Verify cut piece length against drawing dimension.', 'Dimensional', '2d3913da-0cf0-4031-9dc9-45892d322031', '226f71a3-e884-40d8-b965-df5a8b0d4d00', 'FunctionalCritical', 'af810872-732f-4fc1-a9de-6463a7e75383', 'Within tolerance of drawing dimension', 0, 0.5, 0.5, 'mm', 'Steel tape / digital caliper', null, true, false, ARRAY['cutting','length']::text[], 1, 'Active'),
  ('09a1346e-267f-4563-b960-19b26af42217', '00000000-0000-0000-0000-000000000001', 'Laser Cut Edge Quality', 'Visual check for dross, burn marks, and clean edge on laser-cut profile.', 'Visual', '0c184ad6-639d-444c-a2cd-7ebf3bb3f21f', 'acf05d09-e929-4a94-81dd-497adb9b31ba', 'Cosmetic', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'No visible dross, burn marks, or edge tearing', null, null, null, null, null, null, false, true, ARRAY['laser','edge','visual']::text[], 1, 'Active'),
  ('553819d7-a687-4568-84f0-fa9dbc6fe16a', '00000000-0000-0000-0000-000000000001', 'Hole Diameter Tolerance', 'Verify punched hole diameter against drawing.', 'Dimensional', '3559f868-2e72-4314-b48c-69c51d6bf103', 'f829417c-0e60-4ba5-b5c8-2ed9197d8b68', 'FunctionalCritical', 'af810872-732f-4fc1-a9de-6463a7e75383', 'Within tolerance of drawing dimension', null, 0.1, 0.1, 'mm', 'Pin gauge / caliper', null, true, false, ARRAY['punching','hole']::text[], 1, 'Active'),
  ('78c86b30-03ac-4a2c-93a5-8e877bb065de', '00000000-0000-0000-0000-000000000001', 'Hole Position Accuracy', 'Verify drilled hole center position against drawing datum.', 'Dimensional', '02f0afd0-bc4d-4d88-b1a2-2c730b67d498', 'abcaef03-b438-4f08-a42b-6335cf005907', 'FunctionalCritical', 'af810872-732f-4fc1-a9de-6463a7e75383', 'Within positional tolerance of drawing', null, 0.2, 0.2, 'mm', 'CMM / height gauge', null, true, false, ARRAY['drilling','position']::text[], 1, 'Active'),
  ('aa5a1a7f-9701-49d0-a737-e50276f840ca', '00000000-0000-0000-0000-000000000001', 'Thread Gauge Check', 'Go/No-Go thread gauge check on tapped holes.', 'Functional', '9f288ebf-d232-4db8-b2c6-7bbc13a44b3f', 'dc9b21e7-4e28-4941-bd87-c895ccd6bc45', 'FunctionalCritical', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'Go gauge passes, No-Go gauge does not enter', null, null, null, null, 'Go/No-Go thread gauge', null, false, false, ARRAY['tapping','thread']::text[], 1, 'Active'),
  ('9b12ac28-297c-48a5-9c12-019f060f2d59', '00000000-0000-0000-0000-000000000001', 'Bend Angle Tolerance', 'Verify bend angle against drawing using angle gauge/protractor.', 'Dimensional', 'abbbd1b3-4d52-41bf-8a38-502f9377f4d3', '5b479d32-c602-410b-ab68-f544f5814541', 'FunctionalCritical', 'af810872-732f-4fc1-a9de-6463a7e75383', 'Within tolerance of drawing angle', null, 1, 1, 'deg', 'Digital angle gauge', null, true, false, ARRAY['bending','angle']::text[], 1, 'Active'),
  ('7aec7f80-e364-4ad5-9ad4-615eae3f918d', '00000000-0000-0000-0000-000000000001', 'Bend Radius Check', 'Verify inside bend radius meets drawing requirement for material thickness.', 'Dimensional', 'abbbd1b3-4d52-41bf-8a38-502f9377f4d3', '5b479d32-c602-410b-ab68-f544f5814541', 'ProcessCritical', 'af810872-732f-4fc1-a9de-6463a7e75383', 'Bend radius within specified range for material grade/thickness', null, null, null, 'mm', 'Radius gauge', null, true, false, ARRAY['bending','radius']::text[], 1, 'Active'),
  ('d88a0365-35bf-4ad7-9af2-8541bf73d58b', '00000000-0000-0000-0000-000000000001', 'Surface Finish (Ra)', 'Measure surface roughness on machined face.', 'Visual', '9559629b-0f31-4a56-a148-5af71921ff3e', 'a9840c15-cb5b-494b-b2da-022fa53dc4cd', 'CustomerCritical', 'af810872-732f-4fc1-a9de-6463a7e75383', 'Ra within customer-specified range', null, null, null, 'µm', 'Surface roughness tester', null, true, false, ARRAY['machining','finish']::text[], 1, 'Active'),
  ('51788f3c-6e40-4619-a3ba-d9a95ace0c34', '00000000-0000-0000-0000-000000000001', 'Weld Penetration', 'Verify full penetration weld per WPS — visual or NDT as specified.', 'Functional', 'fdcbd55a-fd0b-4f73-a4c9-6a8c5c0da033', '14b848fd-9d7a-4c41-8ddc-d30f60e8cbc2', 'SafetyCritical', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'Full penetration, no incomplete fusion', null, null, null, null, null, 'AWS D1.1', true, true, ARRAY['welding','penetration','structural']::text[], 1, 'Active'),
  ('b7e43822-c3b4-468d-9361-70c6bb5a72d8', '00000000-0000-0000-0000-000000000001', 'Weld Visual Appearance', 'Visual check for uniform bead, no undercut or overlap.', 'Visual', 'fdcbd55a-fd0b-4f73-a4c9-6a8c5c0da033', '14b848fd-9d7a-4c41-8ddc-d30f60e8cbc2', 'Cosmetic', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'Uniform bead profile, no visible undercut/overlap', null, null, null, null, null, 'AWS D1.1', false, true, ARRAY['welding','visual']::text[], 1, 'Active'),
  ('80b8e81c-10cc-4a2c-b4a6-95a3362c73f9', '00000000-0000-0000-0000-000000000001', 'Weld Size', 'Measure fillet weld leg size against drawing callout.', 'Dimensional', 'fdcbd55a-fd0b-4f73-a4c9-6a8c5c0da033', '14b848fd-9d7a-4c41-8ddc-d30f60e8cbc2', 'FunctionalCritical', 'af810872-732f-4fc1-a9de-6463a7e75383', 'Within tolerance of drawing weld symbol', null, 0.5, 0, 'mm', 'Weld gauge', null, true, false, ARRAY['welding','size']::text[], 1, 'Active'),
  ('64297462-10fb-4ef2-96fa-625a14585605', '00000000-0000-0000-0000-000000000001', 'Spatter Check', 'Verify weld area is free of excessive spatter.', 'Visual', 'fdcbd55a-fd0b-4f73-a4c9-6a8c5c0da033', '14b848fd-9d7a-4c41-8ddc-d30f60e8cbc2', 'Cosmetic', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'No excessive spatter on or around weld', null, null, null, null, null, null, false, true, ARRAY['welding','spatter']::text[], 1, 'Active'),
  ('0517df10-d761-4d66-a384-42c565c7c0ce', '00000000-0000-0000-0000-000000000001', 'Grinding Surface Smoothness', 'Visual/tactile check that ground weld/surface is smooth and flush.', 'Visual', 'ecc89902-ce9f-4060-ab10-d255f3e9c68a', 'c4f0b3d4-062e-4445-8f4d-6f1db08a4fff', 'Cosmetic', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'Smooth, flush surface, no gouging', null, null, null, null, null, null, false, true, ARRAY['grinding','finish']::text[], 1, 'Active'),
  ('a5fdf1b5-f0a8-4882-9085-689af26086a9', '00000000-0000-0000-0000-000000000001', 'Surface Cleanliness (Sa 2.5)', 'Verify blast cleanliness grade before coating.', 'Process', 'd4ba013d-f276-4a82-8cea-734bdb43d53d', 'f014d324-9e3a-47f1-a423-4d0d752a4159', 'ProcessCritical', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'Meets Sa 2.5 near-white blast standard', null, null, null, null, null, 'ISO 8501-1', true, true, ARRAY['surface prep','blasting']::text[], 1, 'Active'),
  ('8c6a7411-2322-4f39-b487-517478d3bc2c', '00000000-0000-0000-0000-000000000001', 'Dry Film Thickness (DFT)', 'Measure coating thickness using DFT gauge.', 'Dimensional', 'e47f2ab2-b29e-4907-a3a4-2a1b5336d1e5', '1c71e26e-3211-4ed8-b5d6-f119a2a42bce', 'CustomerCritical', 'af810872-732f-4fc1-a9de-6463a7e75383', 'Within customer-specified DFT range', null, null, null, 'µm', 'DFT gauge', null, true, false, ARRAY['powder coating','dft']::text[], 1, 'Active'),
  ('2c338d66-a587-4a54-8b7f-689ba17cbd4f', '00000000-0000-0000-0000-000000000001', 'Coating Adhesion Test', 'Cross-hatch adhesion test on coated surface.', 'Functional', 'e47f2ab2-b29e-4907-a3a4-2a1b5336d1e5', '1c71e26e-3211-4ed8-b5d6-f119a2a42bce', 'FunctionalCritical', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'No flaking/peeling per cross-hatch test', null, null, null, null, null, 'ASTM D3359', true, true, ARRAY['powder coating','adhesion']::text[], 1, 'Active'),
  ('41634557-5d5e-4e35-91ee-ad9f2b092fe5', '00000000-0000-0000-0000-000000000001', 'Paint Colour Match', 'Verify paint colour matches approved RAL/customer sample.', 'Visual', '57d8e825-90a6-4fbd-8acc-9d87b1a6edbd', 'e56b6625-bfee-451f-9f50-466557fe9938', 'CustomerCritical', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'Visual match to RAL/approved sample under standard light', null, null, null, null, null, null, false, true, ARRAY['painting','colour']::text[], 1, 'Active'),
  ('164ecdcb-7244-4096-a1e9-bc84ddc630cd', '00000000-0000-0000-0000-000000000001', 'Fastener Torque Check', 'Verify critical fasteners are torqued to specification.', 'Functional', '1660bc98-7eaf-4ff4-99f5-bbc277bce890', '08908039-6529-49c8-87b9-50503d7607b1', 'SafetyCritical', 'af810872-732f-4fc1-a9de-6463a7e75383', 'Torque within specified range, verified with calibrated wrench', null, null, null, 'Nm', 'Calibrated torque wrench', null, true, false, ARRAY['assembly','torque','safety']::text[], 1, 'Active'),
  ('4e587553-8f1b-4b07-b13c-823b73ff3543', '00000000-0000-0000-0000-000000000001', 'Assembly Completeness', 'Confirm all BOM items are fitted per assembly drawing.', 'Functional', '1660bc98-7eaf-4ff4-99f5-bbc277bce890', '08908039-6529-49c8-87b9-50503d7607b1', 'FunctionalCritical', '5f75f4c9-a650-4633-b057-3d7ed9ad4712', 'All BOM line items present and correctly fitted', null, null, null, null, null, null, false, false, ARRAY['assembly','bom']::text[], 1, 'Active'),
  ('7d09a737-81f3-4d56-b5cf-85929486fc42', '00000000-0000-0000-0000-000000000001', 'Functional Test — Power On', 'Power-on functional test of assembled unit before dispatch.', 'Functional', '91f79b9f-7074-4e42-84dc-4eddf8ccaff5', '84f76bf3-7aa7-46dd-a9ef-80a93bc36f76', 'SafetyCritical', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'Unit powers on and passes functional checklist with no faults', null, null, null, null, null, null, true, false, ARRAY['testing','electrical']::text[], 1, 'Active'),
  ('ce0def75-35da-43b7-bdb5-4ceb44ccfa23', '00000000-0000-0000-0000-000000000001', 'Insulation Resistance Test', 'Megger test to verify insulation resistance meets regulatory minimum.', 'Safety', '91f79b9f-7074-4e42-84dc-4eddf8ccaff5', '84f76bf3-7aa7-46dd-a9ef-80a93bc36f76', 'RegulatoryCritical', 'af810872-732f-4fc1-a9de-6463a7e75383', 'Insulation resistance above regulatory minimum', null, null, null, 'MΩ', 'Insulation resistance tester (Megger)', null, true, false, ARRAY['testing','electrical','safety']::text[], 1, 'Active'),
  ('a3331702-6cc7-41f4-ba48-acd8bf7fd965', '00000000-0000-0000-0000-000000000001', 'Packaging Integrity Check', 'Verify packaging is intact and adequate for transit before dispatch.', 'Visual', 'd79acc90-e545-4021-ab4e-dd4528eb9a21', '531b8089-52f7-48fd-bbde-c2c3c0e99f1c', 'Cosmetic', 'c7b98be7-5846-4875-8d7b-11b4abc066f2', 'No damage, adequate protective packaging for transit mode', null, null, null, null, null, null, false, true, ARRAY['packaging']::text[], 1, 'Active'),
  ('3e8d9a32-f3e4-4140-be54-8db19b298fd6', '00000000-0000-0000-0000-000000000001', 'Final Dispatch Documentation', 'Verify all dispatch documents (DC, COC, test certificates) are complete before release.', 'Documentation', '7ec89073-6989-4fa0-b8e3-de7a27af1726', 'f214ac0c-85bd-4ae8-9dd6-acbdde1fbe77', 'RegulatoryCritical', 'cea57ff9-8ace-4c9f-a9ae-a9596c32e548', 'All required documents present and correct', null, null, null, null, null, null, true, false, ARRAY['dispatch','documentation']::text[], 1, 'Active')
on conflict (id) do nothing;

-- ── qms_templates ─────────────────────────────────────────────────
insert into public.qms_templates (id, organization_id, name, category, description, characteristic_ids) values
  ('03d08b4e-5661-4247-8cad-d85a934e9bba', '00000000-0000-0000-0000-000000000001', 'Electrical Enclosure', 'Product Family', 'Standard checkpoints for sheet-metal electrical enclosures.', ARRAY['05c55361-3802-43fc-8cac-400a55f486ca'::uuid,'9b12ac28-297c-48a5-9c12-019f060f2d59'::uuid,'b7e43822-c3b4-468d-9361-70c6bb5a72d8'::uuid,'8c6a7411-2322-4f39-b487-517478d3bc2c'::uuid,'4e587553-8f1b-4b07-b13c-823b73ff3543'::uuid,'7d09a737-81f3-4d56-b5cf-85929486fc42'::uuid,'ce0def75-35da-43b7-bdb5-4ceb44ccfa23'::uuid]),
  ('451bb27c-ca16-40b1-a2da-aa9a09441dda', '00000000-0000-0000-0000-000000000001', 'Bracket', 'Product Family', 'Standard checkpoints for simple structural brackets.', ARRAY['05c55361-3802-43fc-8cac-400a55f486ca'::uuid,'9b12ac28-297c-48a5-9c12-019f060f2d59'::uuid,'7aec7f80-e364-4ad5-9ad4-615eae3f918d'::uuid,'78c86b30-03ac-4a2c-93a5-8e877bb065de'::uuid]),
  ('3ec43364-3688-4af4-8538-a5391a7f9d1c', '00000000-0000-0000-0000-000000000001', 'Control Panel', 'Product Family', 'Standard checkpoints for welded/painted control panel enclosures.', ARRAY['51788f3c-6e40-4619-a3ba-d9a95ace0c34'::uuid,'80b8e81c-10cc-4a2c-b4a6-95a3362c73f9'::uuid,'a5fdf1b5-f0a8-4882-9085-689af26086a9'::uuid,'41634557-5d5e-4e35-91ee-ad9f2b092fe5'::uuid,'164ecdcb-7244-4096-a1e9-bc84ddc630cd'::uuid,'3e8d9a32-f3e4-4140-be54-8db19b298fd6'::uuid])
on conflict (id) do nothing;

-- ── inspection_stage_definitions ─────────────────────────────────
insert into public.inspection_stage_definitions (id, organization_id, name, process_id, sequence, active) values
  ('7fb11d8d-9d75-420b-a12c-eb27074978bb', '00000000-0000-0000-0000-000000000001', 'Material Inspection', '8b257432-4e17-4a57-9b04-a06966d98854', 1, true),
  ('b9b2e80b-3fd3-44fd-b04b-5a0839759040', '00000000-0000-0000-0000-000000000001', 'Cutting Inspection', '2d3913da-0cf0-4031-9dc9-45892d322031', 2, true),
  ('cef788c1-9fe9-4c5c-b453-f6cc66d59c7f', '00000000-0000-0000-0000-000000000001', 'Bending Inspection', 'abbbd1b3-4d52-41bf-8a38-502f9377f4d3', 3, true),
  ('3a127d8c-6ba5-4bb5-839c-fabd5195e3ec', '00000000-0000-0000-0000-000000000001', 'Welding Inspection', 'fdcbd55a-fd0b-4f73-a4c9-6a8c5c0da033', 4, true),
  ('0f480efd-1f62-4340-891c-f87cdade1876', '00000000-0000-0000-0000-000000000001', 'Grinding Inspection', 'ecc89902-ce9f-4060-ab10-d255f3e9c68a', 5, true),
  ('0c061bc2-222d-43c5-a31f-011ffefc3d49', '00000000-0000-0000-0000-000000000001', 'Powder Coating Inspection', 'e47f2ab2-b29e-4907-a3a4-2a1b5336d1e5', 6, true),
  ('a42cacc6-c88b-40d2-981d-c8ff4efe4e11', '00000000-0000-0000-0000-000000000001', 'Assembly Inspection', '1660bc98-7eaf-4ff4-99f5-bbc277bce890', 7, true),
  ('8107ef26-d744-4c1e-be25-0ac82c83d396', '00000000-0000-0000-0000-000000000001', 'Testing Inspection', '91f79b9f-7074-4e42-84dc-4eddf8ccaff5', 8, true),
  ('980af314-98c5-44d7-b915-a59bd279f1c0', '00000000-0000-0000-0000-000000000001', 'Final Inspection', 'cf912074-964a-4b99-bcb9-0dbce18e5b55', 9, true)
on conflict (id) do nothing;

commit;
