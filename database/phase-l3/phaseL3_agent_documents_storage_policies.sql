-- database/phase-l3/phaseL3_agent_documents_storage_policies.sql
-- Design B (Phase L3): permission-specific storage.objects policies for
-- agent-documents, reusing the three permissions its three actual
-- callers already require — drawing_editor.create (attachDocument),
-- payments.create (recordPayment), ledger.export (exportLedger). No new
-- permission module, no new bucket. DELETE omits ledger.export because
-- no code path ever deletes an export file (see Phase L3 investigation
-- report §3). UPDATE omitted entirely — no caller updates in place.
-- ledger.export's policies additionally require the literal "exports"
-- path segment ledgerExportRemote.ts already writes, scoping that one
-- grant to its own subfolder — the one caller where this is possible
-- without touching application code (see §6: drawing_editor.create and
-- payments.create share an indistinguishable path shape in
-- documentUpload.ts and cannot be separated the same way without a
-- code change, which is out of scope here).

-- ── SELECT ──────────────────────────────────────────────────────────
drop policy if exists agent_documents_select_drawing_editor on storage.objects;
create policy agent_documents_select_drawing_editor on storage.objects
  as permissive for select to public
  using (
    bucket_id = 'agent-documents'
    and has_permission('drawing_editor', 'create')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  );

drop policy if exists agent_documents_select_payments on storage.objects;
create policy agent_documents_select_payments on storage.objects
  as permissive for select to public
  using (
    bucket_id = 'agent-documents'
    and has_permission('payments', 'create')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  );

drop policy if exists agent_documents_select_ledger_export on storage.objects;
create policy agent_documents_select_ledger_export on storage.objects
  as permissive for select to public
  using (
    bucket_id = 'agent-documents'
    and has_permission('ledger', 'export')
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and (storage.foldername(name))[2] = 'exports'
  );

-- ── INSERT ──────────────────────────────────────────────────────────
drop policy if exists agent_documents_insert_drawing_editor on storage.objects;
create policy agent_documents_insert_drawing_editor on storage.objects
  as permissive for insert to public
  with check (
    bucket_id = 'agent-documents'
    and has_permission('drawing_editor', 'create')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  );

drop policy if exists agent_documents_insert_payments on storage.objects;
create policy agent_documents_insert_payments on storage.objects
  as permissive for insert to public
  with check (
    bucket_id = 'agent-documents'
    and has_permission('payments', 'create')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  );

drop policy if exists agent_documents_insert_ledger_export on storage.objects;
create policy agent_documents_insert_ledger_export on storage.objects
  as permissive for insert to public
  with check (
    bucket_id = 'agent-documents'
    and has_permission('ledger', 'export')
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and (storage.foldername(name))[2] = 'exports'
  );

-- ── DELETE (drawing_editor.create / payments.create only) ─────────────
drop policy if exists agent_documents_delete_drawing_editor on storage.objects;
create policy agent_documents_delete_drawing_editor on storage.objects
  as permissive for delete to public
  using (
    bucket_id = 'agent-documents'
    and has_permission('drawing_editor', 'create')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  );

drop policy if exists agent_documents_delete_payments on storage.objects;
create policy agent_documents_delete_payments on storage.objects
  as permissive for delete to public
  using (
    bucket_id = 'agent-documents'
    and has_permission('payments', 'create')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  );
