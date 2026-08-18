drop extension if exists "pg_net";


  create table "public"."advance_records" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "employee_id" uuid not null,
    "amount" numeric not null,
    "date" date not null,
    "reason" text not null,
    "remaining_balance" numeric not null,
    "signature_data" text,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."advance_records" enable row level security;


  create table "public"."attendance_records" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "employee_id" uuid not null,
    "date" date not null,
    "status" text not null,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."attendance_records" enable row level security;


  create table "public"."bom_requisitions" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "bom_item_id" uuid not null,
    "project_id" uuid not null,
    "inventory_item_id" uuid not null,
    "material_name" text,
    "required_qty" numeric,
    "available_qty" numeric,
    "shortage_qty" numeric not null,
    "estimated_price" numeric,
    "status" text not null default 'Pending'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."bom_requisitions" enable row level security;


  create table "public"."company_pos" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "cpo_number" text not null,
    "vendor_id" uuid,
    "vendor_name" text not null,
    "vendor_address" text,
    "vendor_gst" text,
    "vendor_contact" text,
    "items" jsonb not null default '[]'::jsonb,
    "delivery_address" text,
    "expected_delivery_date" date,
    "status" text not null,
    "gst_percent" numeric,
    "subtotal" numeric not null,
    "gst_amount" numeric not null,
    "grand_total" numeric not null,
    "terms_and_conditions" text,
    "notes" text,
    "file" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."company_pos" enable row level security;


  create table "public"."customers" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "name" text not null,
    "contact_person" text,
    "email" text,
    "phone" text,
    "gstin" text,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id(),
    "address" text,
    "state_name" text,
    "state_code" text,
    "additional_details" jsonb,
    "emails" jsonb,
    "primary_email" text,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."customers" enable row level security;


  create table "public"."delivery_challans" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "project_id" uuid,
    "dc_number" text,
    "quantity" numeric,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id(),
    "customer_id" uuid,
    "dc_no" text,
    "items" jsonb default '[]'::jsonb,
    "project_entries" jsonb default '[]'::jsonb,
    "dispatch_method" text,
    "vehicle_no" text,
    "driver_name" text,
    "courier_company" text,
    "tracking_number" text,
    "transport_company" text,
    "lr_number" text,
    "collected_by" text,
    "mobile_number" text,
    "dispatch_date" date not null,
    "receiver_name" text,
    "status" text default 'Prepared'::text,
    "delivery_address" jsonb,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."delivery_challans" enable row level security;


  create table "public"."document_counters" (
    "organization_id" uuid not null,
    "counter_key" text not null,
    "current_value" integer not null default 0,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."document_counters" enable row level security;


  create table "public"."drawing_links" (
    "id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "drawing_id" uuid not null,
    "linked_type" text not null,
    "linked_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."drawing_links" enable row level security;


  create table "public"."drawing_views" (
    "id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "drawing_id" uuid not null,
    "page_number" integer not null,
    "crop_rect" jsonb not null,
    "editor_mode" text not null,
    "fabric_json" jsonb not null,
    "canvas_width" numeric,
    "canvas_height" numeric,
    "title_block" jsonb not null,
    "created_by" uuid,
    "created_by_name" text not null,
    "export_count" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."drawing_views" enable row level security;


  create table "public"."drawings" (
    "id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "file_name" text not null,
    "storage_path" text not null,
    "num_pages" integer not null,
    "project_id" uuid,
    "owner_type" text,
    "owner_id" uuid,
    "uploaded_by" uuid,
    "uploaded_by_name" text not null,
    "category" text,
    "notes" text,
    "tags" text[],
    "parent_drawing_id" uuid,
    "source_design_file_id" uuid,
    "original_drawing_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."drawings" enable row level security;


  create table "public"."employee_documents" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "employee_id" uuid not null,
    "document_group_id" uuid not null,
    "superseded_at" timestamp with time zone,
    "document_name" text not null,
    "document_type" text not null,
    "file_data" text not null,
    "file_mime_type" text not null,
    "upload_date" date not null,
    "expiry_date" date,
    "notes" text,
    "uploaded_by" uuid,
    "uploaded_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."employee_documents" enable row level security;


  create table "public"."employees" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "name" text not null,
    "phone" text not null,
    "role" text not null,
    "monthly_salary" numeric not null,
    "joining_date" date not null,
    "photo_ref" text,
    "employee_code" text,
    "designation" text,
    "blood_group" text,
    "emergency_contact_name" text,
    "emergency_contact_relation" text,
    "emergency_contact_phone" text,
    "employee_type" text,
    "is_active" boolean not null default true,
    "left_date" date,
    "termination_reason" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."employees" enable row level security;


  create table "public"."expense_floats" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "float_no" text not null,
    "employee_id" uuid not null,
    "issued_date" date not null,
    "issued_amount" numeric not null,
    "spent_amount" numeric not null default 0,
    "returned_amount" numeric not null default 0,
    "balance_amount" numeric not null default 0,
    "status" text not null default 'Open'::text,
    "purpose" text,
    "notes" text,
    "project_id" uuid,
    "issued_by" uuid,
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."expense_floats" enable row level security;


  create table "public"."inspection_methods" (
    "id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "name" text not null,
    "type" text not null,
    "config" jsonb,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."inspection_methods" enable row level security;


  create table "public"."inspection_stage_definitions" (
    "id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "name" text not null,
    "process_id" uuid,
    "sequence" integer not null,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."inspection_stage_definitions" enable row level security;


  create table "public"."inventory_items" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "name" text not null,
    "unit" text,
    "current_stock" numeric default 0,
    "cost_per_unit" numeric default 0,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id(),
    "quantity_reserved" numeric default 0,
    "reorder_level" numeric,
    "last_purchase_price" numeric,
    "estimated_price" numeric,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."inventory_items" enable row level security;


  create table "public"."inventory_purchases" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "vendor_id" uuid,
    "inventory_item_id" uuid,
    "quantity" numeric,
    "cost" numeric,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id(),
    "material_name" text,
    "supplier_name" text,
    "unit_cost" numeric,
    "apply_gst" boolean default false,
    "gst_percent" numeric,
    "subtotal" numeric,
    "gst_amount" numeric,
    "final_total" numeric,
    "attachments" jsonb default '[]'::jsonb,
    "purchase_date" date,
    "updated_at" timestamp with time zone not null default now(),
    "project_id" uuid,
    "thickness" text
      );


alter table "public"."inventory_purchases" enable row level security;


  create table "public"."inventory_usages" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "project_id" uuid,
    "inventory_item_id" uuid,
    "quantity_used" numeric,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id(),
    "material_name" text,
    "used_date" date,
    "notes" text,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."inventory_usages" enable row level security;


  create table "public"."invoice_items" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "invoice_id" uuid,
    "description" text,
    "quantity" numeric,
    "price" numeric,
    "organization_id" uuid not null default public.current_organization_id(),
    "hsn" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."invoice_items" enable row level security;


  create table "public"."invoices" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "project_id" uuid,
    "total_amount" numeric default 0,
    "status" text default 'Pending'::text,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id(),
    "customer_id" uuid not null,
    "inv_no" text,
    "dc_id" uuid,
    "subtotal" numeric,
    "cgst_rate" numeric default 9,
    "sgst_rate" numeric default 9,
    "igst_rate" numeric default 0,
    "cgst_amt" numeric,
    "sgst_amt" numeric,
    "igst_amt" numeric,
    "invoice_date" date,
    "due_date" date,
    "payment_terms" text default '30 days'::text,
    "paid_amount" numeric default 0,
    "buyer_gstin" text,
    "buyer_address" text,
    "buyer_state_name" text,
    "buyer_state_code" text,
    "reminder_enabled" boolean default true,
    "reminder_interval_days" numeric default 5,
    "reminder_frequency_days" numeric default 5,
    "next_reminder_at" text,
    "last_reminder_sent_at" text,
    "reminder_count" numeric default 0,
    "next_reminder_custom_date" text,
    "selected_email" text,
    "invoice_type" text default 'tax'::text,
    "po_number" text,
    "po_date" date,
    "delivery_vehicle_no" text,
    "delivery_destination" text,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."invoices" enable row level security;


  create table "public"."logs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "project_id" uuid,
    "message" text,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id()
      );


alter table "public"."logs" enable row level security;


  create table "public"."manufacturing_processes" (
    "id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "name" text not null,
    "sequence" integer not null,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."manufacturing_processes" enable row level security;


  create table "public"."master_pos" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "po_number" text not null,
    "po_date" date not null,
    "customer_id" uuid not null,
    "quotation_id" uuid not null,
    "files" jsonb,
    "status" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."master_pos" enable row level security;


  create table "public"."material_requisitions" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "project_id" uuid,
    "inventory_item_id" uuid,
    "quantity" numeric,
    "status" text default 'Pending'::text,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id()
      );


alter table "public"."material_requisitions" enable row level security;


  create table "public"."operations" (
    "id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "process_id" uuid not null,
    "name" text not null,
    "sequence" integer not null,
    "department" text,
    "required_skills" text[] not null default '{}'::text[],
    "required_machines" text[] not null default '{}'::text[],
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."operations" enable row level security;


  create table "public"."organizations" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."organizations" enable row level security;


  create table "public"."outsourced_works" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "project_id" uuid not null,
    "vendor_id" uuid,
    "vendor_name" text not null,
    "material_sent" text,
    "quantity_sent" numeric not null,
    "date_sent" date,
    "date_received" date,
    "process_cost" numeric not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."outsourced_works" enable row level security;


  create table "public"."payments" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "invoice_id" uuid,
    "amount" numeric,
    "payment_date" date,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id(),
    "mode" text,
    "reference_no" text,
    "notes" text,
    "files" jsonb default '[]'::jsonb
      );


alter table "public"."payments" enable row level security;


  create table "public"."permissions" (
    "id" uuid not null default gen_random_uuid(),
    "module" text not null,
    "action" text not null,
    "label" text,
    "category" text
      );


alter table "public"."permissions" enable row level security;


  create table "public"."petty_expenses" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "date" date not null,
    "employee_id" uuid not null,
    "amount" numeric not null,
    "expense_type" text not null,
    "expense_mode" text not null,
    "project_id" uuid,
    "float_id" uuid,
    "notes" text,
    "item_name" text,
    "quantity" numeric,
    "unit_price" numeric,
    "vendor" text,
    "vendor_id" uuid,
    "bill_number" text,
    "attachments" jsonb,
    "inventory_item_id" uuid,
    "added_to_inventory" boolean,
    "machine_id" uuid,
    "service_type" text,
    "vehicle_expense_type" text,
    "service_provider_type" text,
    "pickup_location" text,
    "drop_location" text,
    "recovered_in_salary_payment_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."petty_expenses" enable row level security;


  create table "public"."production_stage_transactions" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "stage_id" uuid not null,
    "type" text not null,
    "quantity" numeric not null,
    "event_time" timestamp with time zone not null default now(),
    "vendor_id" uuid,
    "vendor_name" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."production_stage_transactions" enable row level security;


  create table "public"."production_stages" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "project_id" uuid,
    "stage_name" text,
    "status" text default 'Pending'::text,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id()
      );


alter table "public"."production_stages" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "username" text not null,
    "organization_id" uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
    "employee_id" uuid,
    "is_active" boolean not null default true,
    "must_change_password" boolean not null default false,
    "last_login" timestamp with time zone,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."profiles" enable row level security;


  create table "public"."project_bom_items" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "project_id" uuid not null,
    "inventory_item_id" uuid not null,
    "material_name" text not null,
    "required_quantity" numeric not null,
    "estimated_price" numeric,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."project_bom_items" enable row level security;


  create table "public"."project_employees" (
    "project_id" uuid not null,
    "employee_id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."project_employees" enable row level security;


  create table "public"."project_materials" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "project_id" uuid,
    "inventory_item_id" uuid,
    "quantity_required" numeric,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id()
      );


alter table "public"."project_materials" enable row level security;


  create table "public"."project_production_stages" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "project_id" uuid not null,
    "stage_name" text not null,
    "position" integer not null,
    "status" text not null default 'NotStarted'::text,
    "notes" text,
    "requires_material_tracking" boolean not null default false,
    "sent_qty" numeric,
    "received_qty" numeric,
    "ok_qty" numeric,
    "rejected_qty" numeric,
    "is_rework" boolean not null default false,
    "reference_stage_id" uuid,
    "rework_stage_name" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."project_production_stages" enable row level security;


  create table "public"."project_purchase_orders" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "project_id" uuid not null,
    "master_po_id" uuid not null,
    "quotation_id" uuid,
    "po_number" text not null,
    "po_date" date not null,
    "quantity" numeric not null,
    "status" text not null,
    "file" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."project_purchase_orders" enable row level security;


  create table "public"."project_qms_inspection_attempt_photos" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "attempt_id" uuid not null,
    "file_data" text not null,
    "file_mime_type" text not null,
    "caption" text,
    "uploaded_by" text,
    "uploaded_by_name" text,
    "uploaded_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."project_qms_inspection_attempt_photos" enable row level security;


  create table "public"."project_qms_inspection_attempts" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "project_qms_inspection_id" uuid not null,
    "characteristic_id" uuid not null,
    "round_number" integer not null,
    "result" text not null,
    "measured_value" text,
    "remarks" text,
    "failure_reason" text,
    "failure_description" text,
    "rectification_action" text,
    "rectification_description" text,
    "performed_by" text,
    "performed_by_name" text,
    "performed_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."project_qms_inspection_attempts" enable row level security;


  create table "public"."project_qms_inspection_characteristics" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "project_qms_inspection_id" uuid not null,
    "library_characteristic_id" text not null,
    "name_snapshot" text not null,
    "category_snapshot" text,
    "sequence" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."project_qms_inspection_characteristics" enable row level security;


  create table "public"."project_qms_inspection_overrides" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "project_qms_inspection_id" uuid not null,
    "required_production_stage_id" text not null,
    "reason" text not null,
    "overridden_by" text not null,
    "overridden_by_name" text not null,
    "overridden_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."project_qms_inspection_overrides" enable row level security;


  create table "public"."project_qms_inspections" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "project_id" uuid not null,
    "library_inspection_id" text not null,
    "library_inspection_name" text not null,
    "required_production_stage_id" text,
    "mode" text not null,
    "status" text not null default 'NotStarted'::text,
    "created_by" text,
    "created_by_name" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."project_qms_inspections" enable row level security;


  create table "public"."projects" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "project_number" text not null,
    "name" text not null,
    "customer_id" uuid not null,
    "quantity" numeric not null,
    "status" text,
    "value" numeric,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id(),
    "work_description" text,
    "production_version" text,
    "customer_visible_name" text,
    "internal_order_code" text,
    "project_type" text,
    "parent_project_id" uuid,
    "source_project_id" uuid,
    "repeat_order_seq" integer,
    "original_project_name" text,
    "activity_log" jsonb,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."projects" enable row level security;


  create table "public"."qms_favorites" (
    "id" text not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "user_id" uuid not null,
    "characteristic_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."qms_favorites" enable row level security;


  create table "public"."qms_stage_completions" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "project_id" uuid not null,
    "sheet_id" uuid not null,
    "stage_id" uuid not null,
    "mode" text not null,
    "inspector_name" text,
    "signature_data_url" text,
    "remarks" text,
    "completed_at" timestamp with time zone,
    "signed_at" timestamp with time zone,
    "assigned_to" text,
    "assigned_to_name" text,
    "assigned_by" text,
    "assigned_at" timestamp with time zone,
    "due_date" date,
    "accepted_qty" numeric,
    "rejected_qty" numeric,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."qms_stage_completions" enable row level security;


  create table "public"."qms_templates" (
    "id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "name" text not null,
    "category" text not null,
    "description" text,
    "characteristic_ids" uuid[] not null default '{}'::uuid[],
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."qms_templates" enable row level security;


  create table "public"."quality_characteristics" (
    "id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "name" text not null,
    "description" text not null,
    "category" text not null,
    "process_id" uuid not null,
    "operation_id" uuid not null,
    "criticality" text not null,
    "inspection_method_id" uuid not null,
    "acceptance_criteria" text not null,
    "tolerance_nominal" numeric,
    "tolerance_plus" numeric,
    "tolerance_minus" numeric,
    "unit" text,
    "measuring_instrument" text,
    "standard_reference" text,
    "drawing_reference" text,
    "evidence_required" boolean not null default false,
    "photo_required" boolean not null default false,
    "customer_scope" uuid,
    "tags" text[] not null default '{}'::text[],
    "version" integer not null default 1,
    "status" text not null default 'Active'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."quality_characteristics" enable row level security;


  create table "public"."quotation_purchase_orders" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "quotation_id" uuid not null,
    "revision_id" uuid not null,
    "master_po_id" uuid not null,
    "po_number" text not null,
    "po_date" date not null,
    "customer_id" uuid not null,
    "files" jsonb,
    "remarks" text,
    "status" text not null,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."quotation_purchase_orders" enable row level security;


  create table "public"."quotation_revisions" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "quotation_id" uuid not null,
    "revision_number" integer not null,
    "revision_date" date not null,
    "revision_notes" text,
    "line_items" jsonb not null default '[]'::jsonb,
    "subtotal" numeric not null,
    "gst_rate" numeric not null,
    "gst_amount" numeric not null,
    "total_amount" numeric not null,
    "valid_until" date not null,
    "terms" text,
    "notes" text,
    "status" text not null,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "is_current" boolean not null default true,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."quotation_revisions" enable row level security;


  create table "public"."quotations" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "qt_no" text not null,
    "customer_id" uuid not null,
    "project_id" uuid,
    "line_items" jsonb not null default '[]'::jsonb,
    "subtotal" numeric not null,
    "gst_rate" numeric not null,
    "gst_amount" numeric not null,
    "total_amount" numeric not null,
    "valid_until" date not null,
    "terms" text,
    "status" text not null,
    "quotation_date" date,
    "notes" text,
    "history" jsonb,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."quotations" enable row level security;


  create table "public"."role_permissions" (
    "role_id" uuid not null,
    "permission_id" uuid not null
      );


alter table "public"."role_permissions" enable row level security;


  create table "public"."roles" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "is_admin" boolean not null default false,
    "description" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."roles" enable row level security;


  create table "public"."salary_payments" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null default public.current_organization_id(),
    "employee_id" uuid not null,
    "month" text not null,
    "amount" numeric not null,
    "payment_date" date not null,
    "notes" text,
    "original_salary" numeric,
    "deducted_advance" numeric,
    "final_paid_amount" numeric,
    "advance_deductions" jsonb,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."salary_payments" enable row level security;


  create table "public"."schema_migrations" (
    "version" text not null,
    "description" text not null,
    "executed_at" timestamp with time zone not null default now(),
    "executed_by" text not null default CURRENT_USER,
    "checksum" text not null
      );


alter table "public"."schema_migrations" enable row level security;


  create table "public"."security_audit_log" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid,
    "event_type" text not null,
    "actor_user_id" uuid,
    "target_user_id" uuid,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."security_audit_log" enable row level security;


  create table "public"."user_editor_preferences" (
    "id" uuid not null,
    "organization_id" uuid not null default public.current_organization_id(),
    "remembered_mode" text,
    "last_project_id" uuid,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."user_editor_preferences" enable row level security;


  create table "public"."user_permission_overrides" (
    "user_id" uuid not null,
    "permission_id" uuid not null,
    "allowed" boolean not null
      );


alter table "public"."user_permission_overrides" enable row level security;


  create table "public"."user_roles" (
    "user_id" uuid not null,
    "role_id" uuid not null,
    "assigned_at" timestamp with time zone not null default now()
      );


alter table "public"."user_roles" enable row level security;


  create table "public"."vendors" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "name" text not null,
    "phone" text,
    "email" text,
    "gstin" text,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null default public.current_organization_id(),
    "address" text,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."vendors" enable row level security;

CREATE UNIQUE INDEX advance_records_pkey ON public.advance_records USING btree (id);

CREATE UNIQUE INDEX attendance_records_employee_id_date_key ON public.attendance_records USING btree (employee_id, date);

CREATE UNIQUE INDEX attendance_records_pkey ON public.attendance_records USING btree (id);

CREATE UNIQUE INDEX bom_requisitions_pkey ON public.bom_requisitions USING btree (id);

CREATE UNIQUE INDEX company_pos_pkey ON public.company_pos USING btree (id);

CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (id);

CREATE UNIQUE INDEX delivery_challans_pkey ON public.delivery_challans USING btree (id);

CREATE UNIQUE INDEX document_counters_pkey ON public.document_counters USING btree (organization_id, counter_key);

CREATE UNIQUE INDEX drawing_links_pkey ON public.drawing_links USING btree (id);

CREATE UNIQUE INDEX drawing_views_pkey ON public.drawing_views USING btree (id);

CREATE UNIQUE INDEX drawings_pkey ON public.drawings USING btree (id);

CREATE UNIQUE INDEX employee_documents_pkey ON public.employee_documents USING btree (id);

CREATE UNIQUE INDEX employees_pkey ON public.employees USING btree (id);

CREATE UNIQUE INDEX expense_floats_organization_id_float_no_key ON public.expense_floats USING btree (organization_id, float_no);

CREATE UNIQUE INDEX expense_floats_pkey ON public.expense_floats USING btree (id);

CREATE INDEX idx_advance_records_org_employee ON public.advance_records USING btree (organization_id, employee_id);

CREATE INDEX idx_attendance_records_org_employee ON public.attendance_records USING btree (organization_id, employee_id);

CREATE INDEX idx_bom_requisitions_org_project_status ON public.bom_requisitions USING btree (organization_id, project_id, status);

CREATE INDEX idx_company_pos_org_vendor ON public.company_pos USING btree (organization_id, vendor_id);

CREATE INDEX idx_customers_org_name ON public.customers USING btree (organization_id, name);

CREATE INDEX idx_delivery_challans_org_project ON public.delivery_challans USING btree (organization_id, project_id);

CREATE INDEX idx_drawing_links_org_drawing ON public.drawing_links USING btree (organization_id, drawing_id);

CREATE INDEX idx_drawing_links_org_linked ON public.drawing_links USING btree (organization_id, linked_type, linked_id);

CREATE INDEX idx_drawing_views_org_drawing ON public.drawing_views USING btree (organization_id, drawing_id);

CREATE INDEX idx_drawings_org_owner ON public.drawings USING btree (organization_id, owner_type, owner_id);

CREATE INDEX idx_drawings_org_project ON public.drawings USING btree (organization_id, project_id);

CREATE INDEX idx_drawings_original ON public.drawings USING btree (original_drawing_id);

CREATE INDEX idx_drawings_parent ON public.drawings USING btree (parent_drawing_id);

CREATE INDEX idx_drawings_source_design_file ON public.drawings USING btree (source_design_file_id);

CREATE INDEX idx_employee_documents_group ON public.employee_documents USING btree (document_group_id);

CREATE INDEX idx_employee_documents_org_employee ON public.employee_documents USING btree (organization_id, employee_id);

CREATE INDEX idx_employees_org_name ON public.employees USING btree (organization_id, name);

CREATE INDEX idx_expense_floats_org_employee ON public.expense_floats USING btree (organization_id, employee_id);

CREATE INDEX idx_inspection_methods_org ON public.inspection_methods USING btree (organization_id);

CREATE INDEX idx_inspection_stage_definitions_org ON public.inspection_stage_definitions USING btree (organization_id);

CREATE INDEX idx_inspection_stage_definitions_process ON public.inspection_stage_definitions USING btree (process_id);

CREATE INDEX idx_inventory_items_org_name ON public.inventory_items USING btree (organization_id, name);

CREATE INDEX idx_inventory_purchases_org_item ON public.inventory_purchases USING btree (organization_id, inventory_item_id);

CREATE INDEX idx_inventory_purchases_org_project ON public.inventory_purchases USING btree (organization_id, project_id);

CREATE INDEX idx_inventory_purchases_org_vendor ON public.inventory_purchases USING btree (organization_id, vendor_id);

CREATE INDEX idx_inventory_usages_org_item ON public.inventory_usages USING btree (organization_id, inventory_item_id);

CREATE INDEX idx_inventory_usages_org_project ON public.inventory_usages USING btree (organization_id, project_id);

CREATE INDEX idx_invoice_items_org_invoice ON public.invoice_items USING btree (organization_id, invoice_id);

CREATE INDEX idx_invoices_org_project ON public.invoices USING btree (organization_id, project_id);

CREATE INDEX idx_invoices_org_status ON public.invoices USING btree (organization_id, status);

CREATE INDEX idx_logs_org_project ON public.logs USING btree (organization_id, project_id);

CREATE INDEX idx_manufacturing_processes_org ON public.manufacturing_processes USING btree (organization_id);

CREATE INDEX idx_master_pos_org_quotation ON public.master_pos USING btree (organization_id, quotation_id);

CREATE INDEX idx_material_requisitions_org_project ON public.material_requisitions USING btree (organization_id, project_id);

CREATE INDEX idx_material_requisitions_org_status ON public.material_requisitions USING btree (organization_id, status);

CREATE INDEX idx_operations_org_process ON public.operations USING btree (organization_id, process_id);

CREATE INDEX idx_outsourced_works_org_project ON public.outsourced_works USING btree (organization_id, project_id);

CREATE INDEX idx_payments_org_date ON public.payments USING btree (organization_id, payment_date);

CREATE INDEX idx_payments_org_invoice ON public.payments USING btree (organization_id, invoice_id);

CREATE INDEX idx_petty_expenses_org_employee ON public.petty_expenses USING btree (organization_id, employee_id);

CREATE INDEX idx_petty_expenses_org_float ON public.petty_expenses USING btree (organization_id, float_id);

CREATE INDEX idx_petty_expenses_org_project ON public.petty_expenses USING btree (organization_id, project_id);

CREATE INDEX idx_production_stage_transactions_org_stage ON public.production_stage_transactions USING btree (organization_id, stage_id);

CREATE INDEX idx_production_stages_org_project ON public.production_stages USING btree (organization_id, project_id);

CREATE INDEX idx_project_bom_items_inventory_item ON public.project_bom_items USING btree (inventory_item_id);

CREATE INDEX idx_project_bom_items_org_project ON public.project_bom_items USING btree (organization_id, project_id);

CREATE INDEX idx_project_employees_org_project ON public.project_employees USING btree (organization_id, project_id);

CREATE INDEX idx_project_materials_org_project ON public.project_materials USING btree (organization_id, project_id);

CREATE INDEX idx_project_production_stages_org_project ON public.project_production_stages USING btree (organization_id, project_id);

CREATE INDEX idx_project_production_stages_reference ON public.project_production_stages USING btree (reference_stage_id);

CREATE INDEX idx_project_purchase_orders_org_project ON public.project_purchase_orders USING btree (organization_id, project_id);

CREATE INDEX idx_project_qms_inspection_attempt_photos_attempt ON public.project_qms_inspection_attempt_photos USING btree (attempt_id);

CREATE INDEX idx_project_qms_inspection_attempts_characteristic ON public.project_qms_inspection_attempts USING btree (characteristic_id, round_number DESC);

CREATE INDEX idx_project_qms_inspection_attempts_inspection ON public.project_qms_inspection_attempts USING btree (project_qms_inspection_id);

CREATE INDEX idx_project_qms_inspection_characteristics_inspection ON public.project_qms_inspection_characteristics USING btree (project_qms_inspection_id);

CREATE INDEX idx_project_qms_inspection_overrides_inspection ON public.project_qms_inspection_overrides USING btree (project_qms_inspection_id);

CREATE INDEX idx_project_qms_inspection_overrides_stage ON public.project_qms_inspection_overrides USING btree (required_production_stage_id);

CREATE INDEX idx_project_qms_inspections_org_project ON public.project_qms_inspections USING btree (organization_id, project_id);

CREATE INDEX idx_project_qms_inspections_required_stage ON public.project_qms_inspections USING btree (required_production_stage_id) WHERE (required_production_stage_id IS NOT NULL);

CREATE INDEX idx_projects_org_customer ON public.projects USING btree (organization_id, customer_id);

CREATE INDEX idx_projects_org_status ON public.projects USING btree (organization_id, status);

CREATE INDEX idx_qms_favorites_org_user ON public.qms_favorites USING btree (organization_id, user_id);

CREATE INDEX idx_qms_stage_completions_org_project ON public.qms_stage_completions USING btree (organization_id, project_id);

CREATE INDEX idx_qms_stage_completions_sheet_stage ON public.qms_stage_completions USING btree (sheet_id, stage_id);

CREATE INDEX idx_qms_templates_org ON public.qms_templates USING btree (organization_id);

CREATE INDEX idx_quality_characteristics_category ON public.quality_characteristics USING btree (category);

CREATE INDEX idx_quality_characteristics_customer_scope ON public.quality_characteristics USING btree (customer_scope);

CREATE INDEX idx_quality_characteristics_method ON public.quality_characteristics USING btree (inspection_method_id);

CREATE INDEX idx_quality_characteristics_operation ON public.quality_characteristics USING btree (operation_id);

CREATE INDEX idx_quality_characteristics_org ON public.quality_characteristics USING btree (organization_id);

CREATE INDEX idx_quality_characteristics_process ON public.quality_characteristics USING btree (process_id);

CREATE INDEX idx_quality_characteristics_status ON public.quality_characteristics USING btree (status);

CREATE INDEX idx_quotation_purchase_orders_org_revision ON public.quotation_purchase_orders USING btree (organization_id, revision_id);

CREATE INDEX idx_quotation_revisions_org_quotation ON public.quotation_revisions USING btree (organization_id, quotation_id);

CREATE INDEX idx_quotations_org_customer ON public.quotations USING btree (organization_id, customer_id);

CREATE INDEX idx_salary_payments_org_employee ON public.salary_payments USING btree (organization_id, employee_id);

CREATE INDEX idx_vendors_org_name ON public.vendors USING btree (organization_id, name);

CREATE UNIQUE INDEX inspection_methods_pkey ON public.inspection_methods USING btree (id);

CREATE UNIQUE INDEX inspection_stage_definitions_pkey ON public.inspection_stage_definitions USING btree (id);

CREATE UNIQUE INDEX inventory_items_pkey ON public.inventory_items USING btree (id);

CREATE UNIQUE INDEX inventory_purchases_pkey ON public.inventory_purchases USING btree (id);

CREATE UNIQUE INDEX inventory_usages_pkey ON public.inventory_usages USING btree (id);

CREATE UNIQUE INDEX invoice_items_pkey ON public.invoice_items USING btree (id);

CREATE UNIQUE INDEX invoices_pkey ON public.invoices USING btree (id);

CREATE UNIQUE INDEX logs_pkey ON public.logs USING btree (id);

CREATE UNIQUE INDEX manufacturing_processes_pkey ON public.manufacturing_processes USING btree (id);

CREATE UNIQUE INDEX master_pos_pkey ON public.master_pos USING btree (id);

CREATE UNIQUE INDEX material_requisitions_pkey ON public.material_requisitions USING btree (id);

CREATE UNIQUE INDEX operations_pkey ON public.operations USING btree (id);

CREATE UNIQUE INDEX organizations_name_key ON public.organizations USING btree (name);

CREATE UNIQUE INDEX organizations_pkey ON public.organizations USING btree (id);

CREATE UNIQUE INDEX outsourced_works_pkey ON public.outsourced_works USING btree (id);

CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id);

CREATE UNIQUE INDEX permissions_module_action_key ON public.permissions USING btree (module, action);

CREATE UNIQUE INDEX permissions_pkey ON public.permissions USING btree (id);

CREATE UNIQUE INDEX petty_expenses_pkey ON public.petty_expenses USING btree (id);

CREATE UNIQUE INDEX production_stage_transactions_pkey ON public.production_stage_transactions USING btree (id);

CREATE UNIQUE INDEX production_stages_pkey ON public.production_stages USING btree (id);

CREATE UNIQUE INDEX profiles_employee_id_key ON public.profiles USING btree (employee_id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX profiles_username_key ON public.profiles USING btree (username);

CREATE UNIQUE INDEX project_bom_items_pkey ON public.project_bom_items USING btree (id);

CREATE UNIQUE INDEX project_employees_pkey ON public.project_employees USING btree (project_id, employee_id);

CREATE UNIQUE INDEX project_materials_pkey ON public.project_materials USING btree (id);

CREATE UNIQUE INDEX project_production_stages_pkey ON public.project_production_stages USING btree (id);

CREATE UNIQUE INDEX project_purchase_orders_pkey ON public.project_purchase_orders USING btree (id);

CREATE UNIQUE INDEX project_qms_inspection_attempt_photos_pkey ON public.project_qms_inspection_attempt_photos USING btree (id);

CREATE UNIQUE INDEX project_qms_inspection_attempts_pkey ON public.project_qms_inspection_attempts USING btree (id);

CREATE UNIQUE INDEX project_qms_inspection_characteristics_pkey ON public.project_qms_inspection_characteristics USING btree (id);

CREATE UNIQUE INDEX project_qms_inspection_overrides_pkey ON public.project_qms_inspection_overrides USING btree (id);

CREATE UNIQUE INDEX project_qms_inspections_pkey ON public.project_qms_inspections USING btree (id);

CREATE UNIQUE INDEX projects_pkey ON public.projects USING btree (id);

CREATE UNIQUE INDEX projects_project_number_key ON public.projects USING btree (project_number);

CREATE UNIQUE INDEX qms_favorites_pkey ON public.qms_favorites USING btree (id);

CREATE UNIQUE INDEX qms_stage_completions_pkey ON public.qms_stage_completions USING btree (id);

CREATE UNIQUE INDEX qms_templates_pkey ON public.qms_templates USING btree (id);

CREATE UNIQUE INDEX quality_characteristics_pkey ON public.quality_characteristics USING btree (id);

CREATE UNIQUE INDEX quotation_purchase_orders_pkey ON public.quotation_purchase_orders USING btree (id);

CREATE UNIQUE INDEX quotation_revisions_pkey ON public.quotation_revisions USING btree (id);

CREATE UNIQUE INDEX quotations_pkey ON public.quotations USING btree (id);

CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (role_id, permission_id);

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);

CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id);

CREATE UNIQUE INDEX salary_payments_pkey ON public.salary_payments USING btree (id);

CREATE UNIQUE INDEX schema_migrations_pkey ON public.schema_migrations USING btree (version);

CREATE UNIQUE INDEX security_audit_log_pkey ON public.security_audit_log USING btree (id);

CREATE UNIQUE INDEX uq_bom_requisitions_bom_item ON public.bom_requisitions USING btree (bom_item_id);

CREATE UNIQUE INDEX uq_company_pos_org_cpono ON public.company_pos USING btree (organization_id, cpo_number);

CREATE UNIQUE INDEX uq_employees_org_code ON public.employees USING btree (organization_id, employee_code) WHERE (employee_code IS NOT NULL);

CREATE UNIQUE INDEX uq_inventory_items_org_name_ci ON public.inventory_items USING btree (organization_id, lower(name));

CREATE UNIQUE INDEX uq_project_production_stages_project_position ON public.project_production_stages USING btree (project_id, "position");

CREATE UNIQUE INDEX uq_project_qms_inspection_attempts_round ON public.project_qms_inspection_attempts USING btree (characteristic_id, round_number);

CREATE UNIQUE INDEX uq_project_qms_inspection_characteristics ON public.project_qms_inspection_characteristics USING btree (project_qms_inspection_id, library_characteristic_id);

CREATE UNIQUE INDEX uq_project_qms_inspections_project_library ON public.project_qms_inspections USING btree (project_id, library_inspection_id);

CREATE UNIQUE INDEX uq_qms_favorites_user_characteristic ON public.qms_favorites USING btree (user_id, characteristic_id);

CREATE UNIQUE INDEX uq_quotation_revisions_one_current ON public.quotation_revisions USING btree (quotation_id) WHERE is_current;

CREATE UNIQUE INDEX uq_quotation_revisions_quotation_number ON public.quotation_revisions USING btree (quotation_id, revision_number);

CREATE UNIQUE INDEX uq_quotations_org_qtno ON public.quotations USING btree (organization_id, qt_no);

CREATE UNIQUE INDEX user_editor_preferences_pkey ON public.user_editor_preferences USING btree (id);

CREATE UNIQUE INDEX user_permission_overrides_pkey ON public.user_permission_overrides USING btree (user_id, permission_id);

CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (user_id, role_id);

CREATE UNIQUE INDEX vendors_pkey ON public.vendors USING btree (id);

alter table "public"."advance_records" add constraint "advance_records_pkey" PRIMARY KEY using index "advance_records_pkey";

alter table "public"."attendance_records" add constraint "attendance_records_pkey" PRIMARY KEY using index "attendance_records_pkey";

alter table "public"."bom_requisitions" add constraint "bom_requisitions_pkey" PRIMARY KEY using index "bom_requisitions_pkey";

alter table "public"."company_pos" add constraint "company_pos_pkey" PRIMARY KEY using index "company_pos_pkey";

alter table "public"."customers" add constraint "customers_pkey" PRIMARY KEY using index "customers_pkey";

alter table "public"."delivery_challans" add constraint "delivery_challans_pkey" PRIMARY KEY using index "delivery_challans_pkey";

alter table "public"."document_counters" add constraint "document_counters_pkey" PRIMARY KEY using index "document_counters_pkey";

alter table "public"."drawing_links" add constraint "drawing_links_pkey" PRIMARY KEY using index "drawing_links_pkey";

alter table "public"."drawing_views" add constraint "drawing_views_pkey" PRIMARY KEY using index "drawing_views_pkey";

alter table "public"."drawings" add constraint "drawings_pkey" PRIMARY KEY using index "drawings_pkey";

alter table "public"."employee_documents" add constraint "employee_documents_pkey" PRIMARY KEY using index "employee_documents_pkey";

alter table "public"."employees" add constraint "employees_pkey" PRIMARY KEY using index "employees_pkey";

alter table "public"."expense_floats" add constraint "expense_floats_pkey" PRIMARY KEY using index "expense_floats_pkey";

alter table "public"."inspection_methods" add constraint "inspection_methods_pkey" PRIMARY KEY using index "inspection_methods_pkey";

alter table "public"."inspection_stage_definitions" add constraint "inspection_stage_definitions_pkey" PRIMARY KEY using index "inspection_stage_definitions_pkey";

alter table "public"."inventory_items" add constraint "inventory_items_pkey" PRIMARY KEY using index "inventory_items_pkey";

alter table "public"."inventory_purchases" add constraint "inventory_purchases_pkey" PRIMARY KEY using index "inventory_purchases_pkey";

alter table "public"."inventory_usages" add constraint "inventory_usages_pkey" PRIMARY KEY using index "inventory_usages_pkey";

alter table "public"."invoice_items" add constraint "invoice_items_pkey" PRIMARY KEY using index "invoice_items_pkey";

alter table "public"."invoices" add constraint "invoices_pkey" PRIMARY KEY using index "invoices_pkey";

alter table "public"."logs" add constraint "logs_pkey" PRIMARY KEY using index "logs_pkey";

alter table "public"."manufacturing_processes" add constraint "manufacturing_processes_pkey" PRIMARY KEY using index "manufacturing_processes_pkey";

alter table "public"."master_pos" add constraint "master_pos_pkey" PRIMARY KEY using index "master_pos_pkey";

alter table "public"."material_requisitions" add constraint "material_requisitions_pkey" PRIMARY KEY using index "material_requisitions_pkey";

alter table "public"."operations" add constraint "operations_pkey" PRIMARY KEY using index "operations_pkey";

alter table "public"."organizations" add constraint "organizations_pkey" PRIMARY KEY using index "organizations_pkey";

alter table "public"."outsourced_works" add constraint "outsourced_works_pkey" PRIMARY KEY using index "outsourced_works_pkey";

alter table "public"."payments" add constraint "payments_pkey" PRIMARY KEY using index "payments_pkey";

alter table "public"."permissions" add constraint "permissions_pkey" PRIMARY KEY using index "permissions_pkey";

alter table "public"."petty_expenses" add constraint "petty_expenses_pkey" PRIMARY KEY using index "petty_expenses_pkey";

alter table "public"."production_stage_transactions" add constraint "production_stage_transactions_pkey" PRIMARY KEY using index "production_stage_transactions_pkey";

alter table "public"."production_stages" add constraint "production_stages_pkey" PRIMARY KEY using index "production_stages_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."project_bom_items" add constraint "project_bom_items_pkey" PRIMARY KEY using index "project_bom_items_pkey";

alter table "public"."project_employees" add constraint "project_employees_pkey" PRIMARY KEY using index "project_employees_pkey";

alter table "public"."project_materials" add constraint "project_materials_pkey" PRIMARY KEY using index "project_materials_pkey";

alter table "public"."project_production_stages" add constraint "project_production_stages_pkey" PRIMARY KEY using index "project_production_stages_pkey";

alter table "public"."project_purchase_orders" add constraint "project_purchase_orders_pkey" PRIMARY KEY using index "project_purchase_orders_pkey";

alter table "public"."project_qms_inspection_attempt_photos" add constraint "project_qms_inspection_attempt_photos_pkey" PRIMARY KEY using index "project_qms_inspection_attempt_photos_pkey";

alter table "public"."project_qms_inspection_attempts" add constraint "project_qms_inspection_attempts_pkey" PRIMARY KEY using index "project_qms_inspection_attempts_pkey";

alter table "public"."project_qms_inspection_characteristics" add constraint "project_qms_inspection_characteristics_pkey" PRIMARY KEY using index "project_qms_inspection_characteristics_pkey";

alter table "public"."project_qms_inspection_overrides" add constraint "project_qms_inspection_overrides_pkey" PRIMARY KEY using index "project_qms_inspection_overrides_pkey";

alter table "public"."project_qms_inspections" add constraint "project_qms_inspections_pkey" PRIMARY KEY using index "project_qms_inspections_pkey";

alter table "public"."projects" add constraint "projects_pkey" PRIMARY KEY using index "projects_pkey";

alter table "public"."qms_favorites" add constraint "qms_favorites_pkey" PRIMARY KEY using index "qms_favorites_pkey";

alter table "public"."qms_stage_completions" add constraint "qms_stage_completions_pkey" PRIMARY KEY using index "qms_stage_completions_pkey";

alter table "public"."qms_templates" add constraint "qms_templates_pkey" PRIMARY KEY using index "qms_templates_pkey";

alter table "public"."quality_characteristics" add constraint "quality_characteristics_pkey" PRIMARY KEY using index "quality_characteristics_pkey";

alter table "public"."quotation_purchase_orders" add constraint "quotation_purchase_orders_pkey" PRIMARY KEY using index "quotation_purchase_orders_pkey";

alter table "public"."quotation_revisions" add constraint "quotation_revisions_pkey" PRIMARY KEY using index "quotation_revisions_pkey";

alter table "public"."quotations" add constraint "quotations_pkey" PRIMARY KEY using index "quotations_pkey";

alter table "public"."role_permissions" add constraint "role_permissions_pkey" PRIMARY KEY using index "role_permissions_pkey";

alter table "public"."roles" add constraint "roles_pkey" PRIMARY KEY using index "roles_pkey";

alter table "public"."salary_payments" add constraint "salary_payments_pkey" PRIMARY KEY using index "salary_payments_pkey";

alter table "public"."schema_migrations" add constraint "schema_migrations_pkey" PRIMARY KEY using index "schema_migrations_pkey";

alter table "public"."security_audit_log" add constraint "security_audit_log_pkey" PRIMARY KEY using index "security_audit_log_pkey";

alter table "public"."user_editor_preferences" add constraint "user_editor_preferences_pkey" PRIMARY KEY using index "user_editor_preferences_pkey";

alter table "public"."user_permission_overrides" add constraint "user_permission_overrides_pkey" PRIMARY KEY using index "user_permission_overrides_pkey";

alter table "public"."user_roles" add constraint "user_roles_pkey" PRIMARY KEY using index "user_roles_pkey";

alter table "public"."vendors" add constraint "vendors_pkey" PRIMARY KEY using index "vendors_pkey";

alter table "public"."advance_records" add constraint "advance_records_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT not valid;

alter table "public"."advance_records" validate constraint "advance_records_employee_id_fkey";

alter table "public"."advance_records" add constraint "advance_records_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."advance_records" validate constraint "advance_records_organization_id_fkey";

alter table "public"."attendance_records" add constraint "attendance_records_employee_id_date_key" UNIQUE using index "attendance_records_employee_id_date_key";

alter table "public"."attendance_records" add constraint "attendance_records_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."attendance_records" validate constraint "attendance_records_employee_id_fkey";

alter table "public"."attendance_records" add constraint "attendance_records_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."attendance_records" validate constraint "attendance_records_organization_id_fkey";

alter table "public"."bom_requisitions" add constraint "bom_requisitions_bom_item_id_fkey" FOREIGN KEY (bom_item_id) REFERENCES public.project_bom_items(id) ON DELETE CASCADE not valid;

alter table "public"."bom_requisitions" validate constraint "bom_requisitions_bom_item_id_fkey";

alter table "public"."bom_requisitions" add constraint "bom_requisitions_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) not valid;

alter table "public"."bom_requisitions" validate constraint "bom_requisitions_inventory_item_id_fkey";

alter table "public"."bom_requisitions" add constraint "bom_requisitions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."bom_requisitions" validate constraint "bom_requisitions_organization_id_fkey";

alter table "public"."bom_requisitions" add constraint "bom_requisitions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."bom_requisitions" validate constraint "bom_requisitions_project_id_fkey";

alter table "public"."bom_requisitions" add constraint "chk_bom_requisitions_shortage" CHECK ((shortage_qty >= (0)::numeric)) not valid;

alter table "public"."bom_requisitions" validate constraint "chk_bom_requisitions_shortage";

alter table "public"."bom_requisitions" add constraint "chk_bom_requisitions_status" CHECK ((status = ANY (ARRAY['Pending'::text, 'Ready to Complete'::text, 'Completed'::text]))) not valid;

alter table "public"."bom_requisitions" validate constraint "chk_bom_requisitions_status";

alter table "public"."bom_requisitions" add constraint "uq_bom_requisitions_bom_item" UNIQUE using index "uq_bom_requisitions_bom_item";

alter table "public"."company_pos" add constraint "company_pos_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."company_pos" validate constraint "company_pos_organization_id_fkey";

alter table "public"."company_pos" add constraint "company_pos_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL not valid;

alter table "public"."company_pos" validate constraint "company_pos_vendor_id_fkey";

alter table "public"."customers" add constraint "customers_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."customers" validate constraint "customers_organization_id_fkey";

alter table "public"."delivery_challans" add constraint "delivery_challans_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL not valid;

alter table "public"."delivery_challans" validate constraint "delivery_challans_customer_id_fkey";

alter table "public"."delivery_challans" add constraint "delivery_challans_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."delivery_challans" validate constraint "delivery_challans_organization_id_fkey";

alter table "public"."delivery_challans" add constraint "delivery_challans_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."delivery_challans" validate constraint "delivery_challans_project_id_fkey";

alter table "public"."document_counters" add constraint "document_counters_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."document_counters" validate constraint "document_counters_organization_id_fkey";

alter table "public"."drawing_links" add constraint "drawing_links_drawing_id_fkey" FOREIGN KEY (drawing_id) REFERENCES public.drawings(id) ON DELETE CASCADE not valid;

alter table "public"."drawing_links" validate constraint "drawing_links_drawing_id_fkey";

alter table "public"."drawing_links" add constraint "drawing_links_linked_type_check" CHECK ((linked_type = ANY (ARRAY['project'::text, 'machine'::text, 'vendor'::text, 'customer'::text]))) not valid;

alter table "public"."drawing_links" validate constraint "drawing_links_linked_type_check";

alter table "public"."drawing_links" add constraint "drawing_links_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."drawing_links" validate constraint "drawing_links_organization_id_fkey";

alter table "public"."drawing_views" add constraint "drawing_views_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."drawing_views" validate constraint "drawing_views_created_by_fkey";

alter table "public"."drawing_views" add constraint "drawing_views_drawing_id_fkey" FOREIGN KEY (drawing_id) REFERENCES public.drawings(id) ON DELETE CASCADE not valid;

alter table "public"."drawing_views" validate constraint "drawing_views_drawing_id_fkey";

alter table "public"."drawing_views" add constraint "drawing_views_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."drawing_views" validate constraint "drawing_views_organization_id_fkey";

alter table "public"."drawings" add constraint "drawings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."drawings" validate constraint "drawings_organization_id_fkey";

alter table "public"."drawings" add constraint "drawings_original_drawing_id_fkey" FOREIGN KEY (original_drawing_id) REFERENCES public.drawings(id) ON DELETE CASCADE not valid;

alter table "public"."drawings" validate constraint "drawings_original_drawing_id_fkey";

alter table "public"."drawings" add constraint "drawings_owner_type_check" CHECK ((owner_type = ANY (ARRAY['project'::text, 'machine'::text, 'library'::text]))) not valid;

alter table "public"."drawings" validate constraint "drawings_owner_type_check";

alter table "public"."drawings" add constraint "drawings_parent_drawing_id_fkey" FOREIGN KEY (parent_drawing_id) REFERENCES public.drawings(id) ON DELETE SET NULL not valid;

alter table "public"."drawings" validate constraint "drawings_parent_drawing_id_fkey";

alter table "public"."drawings" add constraint "drawings_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."drawings" validate constraint "drawings_project_id_fkey";

alter table "public"."drawings" add constraint "drawings_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) not valid;

alter table "public"."drawings" validate constraint "drawings_uploaded_by_fkey";

alter table "public"."employee_documents" add constraint "employee_documents_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."employee_documents" validate constraint "employee_documents_employee_id_fkey";

alter table "public"."employee_documents" add constraint "employee_documents_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."employee_documents" validate constraint "employee_documents_organization_id_fkey";

alter table "public"."employee_documents" add constraint "employee_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) not valid;

alter table "public"."employee_documents" validate constraint "employee_documents_uploaded_by_fkey";

alter table "public"."employees" add constraint "employees_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."employees" validate constraint "employees_organization_id_fkey";

alter table "public"."expense_floats" add constraint "expense_floats_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) not valid;

alter table "public"."expense_floats" validate constraint "expense_floats_employee_id_fkey";

alter table "public"."expense_floats" add constraint "expense_floats_issued_amount_check" CHECK ((issued_amount > (0)::numeric)) not valid;

alter table "public"."expense_floats" validate constraint "expense_floats_issued_amount_check";

alter table "public"."expense_floats" add constraint "expense_floats_issued_by_fkey" FOREIGN KEY (issued_by) REFERENCES auth.users(id) not valid;

alter table "public"."expense_floats" validate constraint "expense_floats_issued_by_fkey";

alter table "public"."expense_floats" add constraint "expense_floats_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."expense_floats" validate constraint "expense_floats_organization_id_fkey";

alter table "public"."expense_floats" add constraint "expense_floats_organization_id_float_no_key" UNIQUE using index "expense_floats_organization_id_float_no_key";

alter table "public"."expense_floats" add constraint "expense_floats_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."expense_floats" validate constraint "expense_floats_project_id_fkey";

alter table "public"."inspection_methods" add constraint "chk_inspection_methods_type" CHECK ((type = ANY (ARRAY['PassFail'::text, 'Numeric'::text, 'MultiNumeric'::text, 'Text'::text, 'Dropdown'::text, 'Checkbox'::text, 'Photo'::text, 'File'::text, 'Certificate'::text, 'BarcodeScan'::text, 'QRScan'::text]))) not valid;

alter table "public"."inspection_methods" validate constraint "chk_inspection_methods_type";

alter table "public"."inspection_methods" add constraint "inspection_methods_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."inspection_methods" validate constraint "inspection_methods_organization_id_fkey";

alter table "public"."inspection_stage_definitions" add constraint "inspection_stage_definitions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."inspection_stage_definitions" validate constraint "inspection_stage_definitions_organization_id_fkey";

alter table "public"."inspection_stage_definitions" add constraint "inspection_stage_definitions_process_id_fkey" FOREIGN KEY (process_id) REFERENCES public.manufacturing_processes(id) not valid;

alter table "public"."inspection_stage_definitions" validate constraint "inspection_stage_definitions_process_id_fkey";

alter table "public"."inventory_items" add constraint "inventory_items_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."inventory_items" validate constraint "inventory_items_organization_id_fkey";

alter table "public"."inventory_purchases" add constraint "inventory_purchases_gst_percent_check" CHECK (((gst_percent IS NULL) OR (gst_percent >= (0)::numeric))) not valid;

alter table "public"."inventory_purchases" validate constraint "inventory_purchases_gst_percent_check";

alter table "public"."inventory_purchases" add constraint "inventory_purchases_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_purchases" validate constraint "inventory_purchases_inventory_item_id_fkey";

alter table "public"."inventory_purchases" add constraint "inventory_purchases_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."inventory_purchases" validate constraint "inventory_purchases_organization_id_fkey";

alter table "public"."inventory_purchases" add constraint "inventory_purchases_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_purchases" validate constraint "inventory_purchases_project_id_fkey";

alter table "public"."inventory_purchases" add constraint "inventory_purchases_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_purchases" validate constraint "inventory_purchases_vendor_id_fkey";

alter table "public"."inventory_usages" add constraint "inventory_usages_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_usages" validate constraint "inventory_usages_inventory_item_id_fkey";

alter table "public"."inventory_usages" add constraint "inventory_usages_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."inventory_usages" validate constraint "inventory_usages_organization_id_fkey";

alter table "public"."inventory_usages" add constraint "inventory_usages_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_usages" validate constraint "inventory_usages_project_id_fkey";

alter table "public"."invoice_items" add constraint "invoice_items_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE not valid;

alter table "public"."invoice_items" validate constraint "invoice_items_invoice_id_fkey";

alter table "public"."invoice_items" add constraint "invoice_items_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."invoice_items" validate constraint "invoice_items_organization_id_fkey";

alter table "public"."invoices" add constraint "invoices_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."invoices" validate constraint "invoices_organization_id_fkey";

alter table "public"."invoices" add constraint "invoices_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."invoices" validate constraint "invoices_project_id_fkey";

alter table "public"."logs" add constraint "logs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."logs" validate constraint "logs_organization_id_fkey";

alter table "public"."manufacturing_processes" add constraint "manufacturing_processes_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."manufacturing_processes" validate constraint "manufacturing_processes_organization_id_fkey";

alter table "public"."master_pos" add constraint "master_pos_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."master_pos" validate constraint "master_pos_customer_id_fkey";

alter table "public"."master_pos" add constraint "master_pos_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."master_pos" validate constraint "master_pos_organization_id_fkey";

alter table "public"."master_pos" add constraint "master_pos_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE RESTRICT not valid;

alter table "public"."master_pos" validate constraint "master_pos_quotation_id_fkey";

alter table "public"."material_requisitions" add constraint "material_requisitions_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) not valid;

alter table "public"."material_requisitions" validate constraint "material_requisitions_inventory_item_id_fkey";

alter table "public"."material_requisitions" add constraint "material_requisitions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."material_requisitions" validate constraint "material_requisitions_organization_id_fkey";

alter table "public"."material_requisitions" add constraint "material_requisitions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."material_requisitions" validate constraint "material_requisitions_project_id_fkey";

alter table "public"."operations" add constraint "operations_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."operations" validate constraint "operations_organization_id_fkey";

alter table "public"."operations" add constraint "operations_process_id_fkey" FOREIGN KEY (process_id) REFERENCES public.manufacturing_processes(id) not valid;

alter table "public"."operations" validate constraint "operations_process_id_fkey";

alter table "public"."organizations" add constraint "organizations_name_key" UNIQUE using index "organizations_name_key";

alter table "public"."outsourced_works" add constraint "chk_outsourced_works_cost" CHECK ((process_cost >= (0)::numeric)) not valid;

alter table "public"."outsourced_works" validate constraint "chk_outsourced_works_cost";

alter table "public"."outsourced_works" add constraint "chk_outsourced_works_quantity" CHECK ((quantity_sent > (0)::numeric)) not valid;

alter table "public"."outsourced_works" validate constraint "chk_outsourced_works_quantity";

alter table "public"."outsourced_works" add constraint "outsourced_works_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."outsourced_works" validate constraint "outsourced_works_organization_id_fkey";

alter table "public"."outsourced_works" add constraint "outsourced_works_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."outsourced_works" validate constraint "outsourced_works_project_id_fkey";

alter table "public"."outsourced_works" add constraint "outsourced_works_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL not valid;

alter table "public"."outsourced_works" validate constraint "outsourced_works_vendor_id_fkey";

alter table "public"."payments" add constraint "payments_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE not valid;

alter table "public"."payments" validate constraint "payments_invoice_id_fkey";

alter table "public"."payments" add constraint "payments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."payments" validate constraint "payments_organization_id_fkey";

alter table "public"."permissions" add constraint "permissions_module_action_key" UNIQUE using index "permissions_module_action_key";

alter table "public"."petty_expenses" add constraint "petty_expenses_amount_check" CHECK ((amount > (0)::numeric)) not valid;

alter table "public"."petty_expenses" validate constraint "petty_expenses_amount_check";

alter table "public"."petty_expenses" add constraint "petty_expenses_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) not valid;

alter table "public"."petty_expenses" validate constraint "petty_expenses_employee_id_fkey";

alter table "public"."petty_expenses" add constraint "petty_expenses_float_id_fkey" FOREIGN KEY (float_id) REFERENCES public.expense_floats(id) ON DELETE SET NULL not valid;

alter table "public"."petty_expenses" validate constraint "petty_expenses_float_id_fkey";

alter table "public"."petty_expenses" add constraint "petty_expenses_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL not valid;

alter table "public"."petty_expenses" validate constraint "petty_expenses_inventory_item_id_fkey";

alter table "public"."petty_expenses" add constraint "petty_expenses_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."petty_expenses" validate constraint "petty_expenses_organization_id_fkey";

alter table "public"."petty_expenses" add constraint "petty_expenses_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."petty_expenses" validate constraint "petty_expenses_project_id_fkey";

alter table "public"."petty_expenses" add constraint "petty_expenses_recovered_in_salary_payment_id_fkey" FOREIGN KEY (recovered_in_salary_payment_id) REFERENCES public.salary_payments(id) not valid;

alter table "public"."petty_expenses" validate constraint "petty_expenses_recovered_in_salary_payment_id_fkey";

alter table "public"."petty_expenses" add constraint "petty_expenses_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL not valid;

alter table "public"."petty_expenses" validate constraint "petty_expenses_vendor_id_fkey";

alter table "public"."production_stage_transactions" add constraint "chk_production_stage_transactions_quantity" CHECK ((quantity > (0)::numeric)) not valid;

alter table "public"."production_stage_transactions" validate constraint "chk_production_stage_transactions_quantity";

alter table "public"."production_stage_transactions" add constraint "chk_production_stage_transactions_type" CHECK ((type = ANY (ARRAY['send'::text, 'receive'::text]))) not valid;

alter table "public"."production_stage_transactions" validate constraint "chk_production_stage_transactions_type";

alter table "public"."production_stage_transactions" add constraint "production_stage_transactions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."production_stage_transactions" validate constraint "production_stage_transactions_organization_id_fkey";

alter table "public"."production_stage_transactions" add constraint "production_stage_transactions_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES public.project_production_stages(id) ON DELETE CASCADE not valid;

alter table "public"."production_stage_transactions" validate constraint "production_stage_transactions_stage_id_fkey";

alter table "public"."production_stage_transactions" add constraint "production_stage_transactions_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL not valid;

alter table "public"."production_stage_transactions" validate constraint "production_stage_transactions_vendor_id_fkey";

alter table "public"."production_stages" add constraint "production_stages_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."production_stages" validate constraint "production_stages_organization_id_fkey";

alter table "public"."production_stages" add constraint "production_stages_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."production_stages" validate constraint "production_stages_project_id_fkey";

alter table "public"."profiles" add constraint "profiles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."profiles" validate constraint "profiles_created_by_fkey";

alter table "public"."profiles" add constraint "profiles_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) not valid;

alter table "public"."profiles" validate constraint "profiles_employee_id_fkey";

alter table "public"."profiles" add constraint "profiles_employee_id_key" UNIQUE using index "profiles_employee_id_key";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."profiles" validate constraint "profiles_organization_id_fkey";

alter table "public"."profiles" add constraint "profiles_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."profiles" validate constraint "profiles_updated_by_fkey";

alter table "public"."profiles" add constraint "profiles_username_key" UNIQUE using index "profiles_username_key";

alter table "public"."project_bom_items" add constraint "chk_project_bom_items_required_quantity" CHECK ((required_quantity >= (0)::numeric)) not valid;

alter table "public"."project_bom_items" validate constraint "chk_project_bom_items_required_quantity";

alter table "public"."project_bom_items" add constraint "project_bom_items_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) not valid;

alter table "public"."project_bom_items" validate constraint "project_bom_items_inventory_item_id_fkey";

alter table "public"."project_bom_items" add constraint "project_bom_items_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."project_bom_items" validate constraint "project_bom_items_organization_id_fkey";

alter table "public"."project_bom_items" add constraint "project_bom_items_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_bom_items" validate constraint "project_bom_items_project_id_fkey";

alter table "public"."project_employees" add constraint "project_employees_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."project_employees" validate constraint "project_employees_employee_id_fkey";

alter table "public"."project_employees" add constraint "project_employees_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."project_employees" validate constraint "project_employees_organization_id_fkey";

alter table "public"."project_employees" add constraint "project_employees_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_employees" validate constraint "project_employees_project_id_fkey";

alter table "public"."project_materials" add constraint "project_materials_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) not valid;

alter table "public"."project_materials" validate constraint "project_materials_inventory_item_id_fkey";

alter table "public"."project_materials" add constraint "project_materials_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."project_materials" validate constraint "project_materials_organization_id_fkey";

alter table "public"."project_materials" add constraint "project_materials_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_materials" validate constraint "project_materials_project_id_fkey";

alter table "public"."project_production_stages" add constraint "chk_project_production_stages_qty_invariant" CHECK (((ok_qty IS NULL) OR (rejected_qty IS NULL) OR (received_qty IS NULL) OR ((ok_qty + rejected_qty) = received_qty))) not valid;

alter table "public"."project_production_stages" validate constraint "chk_project_production_stages_qty_invariant";

alter table "public"."project_production_stages" add constraint "chk_project_production_stages_status" CHECK ((status = ANY (ARRAY['NotStarted'::text, 'Sent'::text, 'InProgress'::text, 'Completed'::text, 'Received'::text]))) not valid;

alter table "public"."project_production_stages" validate constraint "chk_project_production_stages_status";

alter table "public"."project_production_stages" add constraint "project_production_stages_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."project_production_stages" validate constraint "project_production_stages_organization_id_fkey";

alter table "public"."project_production_stages" add constraint "project_production_stages_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_production_stages" validate constraint "project_production_stages_project_id_fkey";

alter table "public"."project_production_stages" add constraint "project_production_stages_reference_stage_id_fkey" FOREIGN KEY (reference_stage_id) REFERENCES public.project_production_stages(id) ON DELETE SET NULL not valid;

alter table "public"."project_production_stages" validate constraint "project_production_stages_reference_stage_id_fkey";

alter table "public"."project_production_stages" add constraint "uq_project_production_stages_project_position" UNIQUE using index "uq_project_production_stages_project_position";

alter table "public"."project_purchase_orders" add constraint "project_purchase_orders_master_po_id_fkey" FOREIGN KEY (master_po_id) REFERENCES public.master_pos(id) ON DELETE RESTRICT not valid;

alter table "public"."project_purchase_orders" validate constraint "project_purchase_orders_master_po_id_fkey";

alter table "public"."project_purchase_orders" add constraint "project_purchase_orders_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."project_purchase_orders" validate constraint "project_purchase_orders_organization_id_fkey";

alter table "public"."project_purchase_orders" add constraint "project_purchase_orders_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_purchase_orders" validate constraint "project_purchase_orders_project_id_fkey";

alter table "public"."project_purchase_orders" add constraint "project_purchase_orders_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE SET NULL not valid;

alter table "public"."project_purchase_orders" validate constraint "project_purchase_orders_quotation_id_fkey";

alter table "public"."project_qms_inspection_attempt_photos" add constraint "project_qms_inspection_attempt_photos_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES public.project_qms_inspection_attempts(id) ON DELETE CASCADE not valid;

alter table "public"."project_qms_inspection_attempt_photos" validate constraint "project_qms_inspection_attempt_photos_attempt_id_fkey";

alter table "public"."project_qms_inspection_attempt_photos" add constraint "project_qms_inspection_attempt_photos_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."project_qms_inspection_attempt_photos" validate constraint "project_qms_inspection_attempt_photos_organization_id_fkey";

alter table "public"."project_qms_inspection_attempts" add constraint "chk_project_qms_inspection_attempts_result" CHECK ((result = ANY (ARRAY['Pass'::text, 'Fail'::text, 'NA'::text]))) not valid;

alter table "public"."project_qms_inspection_attempts" validate constraint "chk_project_qms_inspection_attempts_result";

alter table "public"."project_qms_inspection_attempts" add constraint "project_qms_inspection_attempts_characteristic_id_fkey" FOREIGN KEY (characteristic_id) REFERENCES public.project_qms_inspection_characteristics(id) ON DELETE CASCADE not valid;

alter table "public"."project_qms_inspection_attempts" validate constraint "project_qms_inspection_attempts_characteristic_id_fkey";

alter table "public"."project_qms_inspection_attempts" add constraint "project_qms_inspection_attempts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."project_qms_inspection_attempts" validate constraint "project_qms_inspection_attempts_organization_id_fkey";

alter table "public"."project_qms_inspection_attempts" add constraint "project_qms_inspection_attempts_project_qms_inspection_id_fkey" FOREIGN KEY (project_qms_inspection_id) REFERENCES public.project_qms_inspections(id) ON DELETE CASCADE not valid;

alter table "public"."project_qms_inspection_attempts" validate constraint "project_qms_inspection_attempts_project_qms_inspection_id_fkey";

alter table "public"."project_qms_inspection_attempts" add constraint "uq_project_qms_inspection_attempts_round" UNIQUE using index "uq_project_qms_inspection_attempts_round";

alter table "public"."project_qms_inspection_characteristics" add constraint "project_qms_inspection_character_project_qms_inspection_id_fkey" FOREIGN KEY (project_qms_inspection_id) REFERENCES public.project_qms_inspections(id) ON DELETE CASCADE not valid;

alter table "public"."project_qms_inspection_characteristics" validate constraint "project_qms_inspection_character_project_qms_inspection_id_fkey";

alter table "public"."project_qms_inspection_characteristics" add constraint "project_qms_inspection_characteristics_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."project_qms_inspection_characteristics" validate constraint "project_qms_inspection_characteristics_organization_id_fkey";

alter table "public"."project_qms_inspection_characteristics" add constraint "uq_project_qms_inspection_characteristics" UNIQUE using index "uq_project_qms_inspection_characteristics";

alter table "public"."project_qms_inspection_overrides" add constraint "project_qms_inspection_overrides_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."project_qms_inspection_overrides" validate constraint "project_qms_inspection_overrides_organization_id_fkey";

alter table "public"."project_qms_inspection_overrides" add constraint "project_qms_inspection_overrides_project_qms_inspection_id_fkey" FOREIGN KEY (project_qms_inspection_id) REFERENCES public.project_qms_inspections(id) ON DELETE CASCADE not valid;

alter table "public"."project_qms_inspection_overrides" validate constraint "project_qms_inspection_overrides_project_qms_inspection_id_fkey";

alter table "public"."project_qms_inspections" add constraint "chk_project_qms_inspections_mode" CHECK ((mode = ANY (ARRAY['Digital'::text, 'Paper'::text, 'Hybrid'::text]))) not valid;

alter table "public"."project_qms_inspections" validate constraint "chk_project_qms_inspections_mode";

alter table "public"."project_qms_inspections" add constraint "chk_project_qms_inspections_status" CHECK ((status = ANY (ARRAY['NotStarted'::text, 'InProgress'::text, 'Failed'::text, 'Passed'::text]))) not valid;

alter table "public"."project_qms_inspections" validate constraint "chk_project_qms_inspections_status";

alter table "public"."project_qms_inspections" add constraint "project_qms_inspections_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."project_qms_inspections" validate constraint "project_qms_inspections_organization_id_fkey";

alter table "public"."project_qms_inspections" add constraint "project_qms_inspections_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_qms_inspections" validate constraint "project_qms_inspections_project_id_fkey";

alter table "public"."project_qms_inspections" add constraint "uq_project_qms_inspections_project_library" UNIQUE using index "uq_project_qms_inspections_project_library";

alter table "public"."projects" add constraint "projects_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."projects" validate constraint "projects_customer_id_fkey";

alter table "public"."projects" add constraint "projects_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."projects" validate constraint "projects_organization_id_fkey";

alter table "public"."projects" add constraint "projects_parent_project_id_fkey" FOREIGN KEY (parent_project_id) REFERENCES public.projects(id) ON DELETE SET NULL not valid;

alter table "public"."projects" validate constraint "projects_parent_project_id_fkey";

alter table "public"."projects" add constraint "projects_project_number_key" UNIQUE using index "projects_project_number_key";

alter table "public"."projects" add constraint "projects_quantity_check" CHECK ((quantity > (0)::numeric)) not valid;

alter table "public"."projects" validate constraint "projects_quantity_check";

alter table "public"."projects" add constraint "projects_source_project_id_fkey" FOREIGN KEY (source_project_id) REFERENCES public.projects(id) ON DELETE SET NULL not valid;

alter table "public"."projects" validate constraint "projects_source_project_id_fkey";

alter table "public"."qms_favorites" add constraint "qms_favorites_characteristic_id_fkey" FOREIGN KEY (characteristic_id) REFERENCES public.quality_characteristics(id) ON DELETE CASCADE not valid;

alter table "public"."qms_favorites" validate constraint "qms_favorites_characteristic_id_fkey";

alter table "public"."qms_favorites" add constraint "qms_favorites_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."qms_favorites" validate constraint "qms_favorites_organization_id_fkey";

alter table "public"."qms_favorites" add constraint "qms_favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."qms_favorites" validate constraint "qms_favorites_user_id_fkey";

alter table "public"."qms_favorites" add constraint "uq_qms_favorites_user_characteristic" UNIQUE using index "uq_qms_favorites_user_characteristic";

alter table "public"."qms_stage_completions" add constraint "chk_qms_stage_completions_mode" CHECK ((mode = ANY (ARRAY['Paper'::text, 'Digital'::text]))) not valid;

alter table "public"."qms_stage_completions" validate constraint "chk_qms_stage_completions_mode";

alter table "public"."qms_stage_completions" add constraint "qms_stage_completions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."qms_stage_completions" validate constraint "qms_stage_completions_organization_id_fkey";

alter table "public"."qms_stage_completions" add constraint "qms_stage_completions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."qms_stage_completions" validate constraint "qms_stage_completions_project_id_fkey";

alter table "public"."qms_templates" add constraint "qms_templates_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."qms_templates" validate constraint "qms_templates_organization_id_fkey";

alter table "public"."quality_characteristics" add constraint "chk_quality_characteristics_criticality" CHECK ((criticality = ANY (ARRAY['SafetyCritical'::text, 'FunctionalCritical'::text, 'RegulatoryCritical'::text, 'CustomerCritical'::text, 'Cosmetic'::text, 'ProcessCritical'::text]))) not valid;

alter table "public"."quality_characteristics" validate constraint "chk_quality_characteristics_criticality";

alter table "public"."quality_characteristics" add constraint "chk_quality_characteristics_status" CHECK ((status = ANY (ARRAY['Active'::text, 'Obsolete'::text]))) not valid;

alter table "public"."quality_characteristics" validate constraint "chk_quality_characteristics_status";

alter table "public"."quality_characteristics" add constraint "quality_characteristics_customer_scope_fkey" FOREIGN KEY (customer_scope) REFERENCES public.customers(id) not valid;

alter table "public"."quality_characteristics" validate constraint "quality_characteristics_customer_scope_fkey";

alter table "public"."quality_characteristics" add constraint "quality_characteristics_inspection_method_id_fkey" FOREIGN KEY (inspection_method_id) REFERENCES public.inspection_methods(id) not valid;

alter table "public"."quality_characteristics" validate constraint "quality_characteristics_inspection_method_id_fkey";

alter table "public"."quality_characteristics" add constraint "quality_characteristics_operation_id_fkey" FOREIGN KEY (operation_id) REFERENCES public.operations(id) not valid;

alter table "public"."quality_characteristics" validate constraint "quality_characteristics_operation_id_fkey";

alter table "public"."quality_characteristics" add constraint "quality_characteristics_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."quality_characteristics" validate constraint "quality_characteristics_organization_id_fkey";

alter table "public"."quality_characteristics" add constraint "quality_characteristics_process_id_fkey" FOREIGN KEY (process_id) REFERENCES public.manufacturing_processes(id) not valid;

alter table "public"."quality_characteristics" validate constraint "quality_characteristics_process_id_fkey";

alter table "public"."quotation_purchase_orders" add constraint "quotation_purchase_orders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."quotation_purchase_orders" validate constraint "quotation_purchase_orders_created_by_fkey";

alter table "public"."quotation_purchase_orders" add constraint "quotation_purchase_orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."quotation_purchase_orders" validate constraint "quotation_purchase_orders_customer_id_fkey";

alter table "public"."quotation_purchase_orders" add constraint "quotation_purchase_orders_master_po_id_fkey" FOREIGN KEY (master_po_id) REFERENCES public.master_pos(id) ON DELETE RESTRICT not valid;

alter table "public"."quotation_purchase_orders" validate constraint "quotation_purchase_orders_master_po_id_fkey";

alter table "public"."quotation_purchase_orders" add constraint "quotation_purchase_orders_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."quotation_purchase_orders" validate constraint "quotation_purchase_orders_organization_id_fkey";

alter table "public"."quotation_purchase_orders" add constraint "quotation_purchase_orders_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE not valid;

alter table "public"."quotation_purchase_orders" validate constraint "quotation_purchase_orders_quotation_id_fkey";

alter table "public"."quotation_purchase_orders" add constraint "quotation_purchase_orders_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES public.quotation_revisions(id) ON DELETE CASCADE not valid;

alter table "public"."quotation_purchase_orders" validate constraint "quotation_purchase_orders_revision_id_fkey";

alter table "public"."quotation_revisions" add constraint "quotation_revisions_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) not valid;

alter table "public"."quotation_revisions" validate constraint "quotation_revisions_approved_by_fkey";

alter table "public"."quotation_revisions" add constraint "quotation_revisions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."quotation_revisions" validate constraint "quotation_revisions_created_by_fkey";

alter table "public"."quotation_revisions" add constraint "quotation_revisions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."quotation_revisions" validate constraint "quotation_revisions_organization_id_fkey";

alter table "public"."quotation_revisions" add constraint "quotation_revisions_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE not valid;

alter table "public"."quotation_revisions" validate constraint "quotation_revisions_quotation_id_fkey";

alter table "public"."quotations" add constraint "quotations_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) not valid;

alter table "public"."quotations" validate constraint "quotations_approved_by_fkey";

alter table "public"."quotations" add constraint "quotations_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."quotations" validate constraint "quotations_customer_id_fkey";

alter table "public"."quotations" add constraint "quotations_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."quotations" validate constraint "quotations_organization_id_fkey";

alter table "public"."quotations" add constraint "quotations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."quotations" validate constraint "quotations_project_id_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_permission_id_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_role_id_fkey";

alter table "public"."roles" add constraint "roles_name_key" UNIQUE using index "roles_name_key";

alter table "public"."salary_payments" add constraint "salary_payments_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT not valid;

alter table "public"."salary_payments" validate constraint "salary_payments_employee_id_fkey";

alter table "public"."salary_payments" add constraint "salary_payments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."salary_payments" validate constraint "salary_payments_organization_id_fkey";

alter table "public"."security_audit_log" add constraint "security_audit_log_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) not valid;

alter table "public"."security_audit_log" validate constraint "security_audit_log_actor_user_id_fkey";

alter table "public"."security_audit_log" add constraint "security_audit_log_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."security_audit_log" validate constraint "security_audit_log_organization_id_fkey";

alter table "public"."security_audit_log" add constraint "security_audit_log_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth.users(id) not valid;

alter table "public"."security_audit_log" validate constraint "security_audit_log_target_user_id_fkey";

alter table "public"."user_editor_preferences" add constraint "user_editor_preferences_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_editor_preferences" validate constraint "user_editor_preferences_id_fkey";

alter table "public"."user_editor_preferences" add constraint "user_editor_preferences_last_project_id_fkey" FOREIGN KEY (last_project_id) REFERENCES public.projects(id) not valid;

alter table "public"."user_editor_preferences" validate constraint "user_editor_preferences_last_project_id_fkey";

alter table "public"."user_editor_preferences" add constraint "user_editor_preferences_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."user_editor_preferences" validate constraint "user_editor_preferences_organization_id_fkey";

alter table "public"."user_permission_overrides" add constraint "user_permission_overrides_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE not valid;

alter table "public"."user_permission_overrides" validate constraint "user_permission_overrides_permission_id_fkey";

alter table "public"."user_permission_overrides" add constraint "user_permission_overrides_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_permission_overrides" validate constraint "user_permission_overrides_user_id_fkey";

alter table "public"."user_roles" add constraint "user_roles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE not valid;

alter table "public"."user_roles" validate constraint "user_roles_role_id_fkey";

alter table "public"."user_roles" add constraint "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_roles" validate constraint "user_roles_user_id_fkey";

alter table "public"."vendors" add constraint "vendors_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."vendors" validate constraint "vendors_organization_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_project_activity(p_project_id uuid, p_type text, p_description text, p_performed_by text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entry jsonb;
begin
  if not (has_permission('projects','edit') or has_permission('production','edit')) then
    raise exception 'permission denied for add_project_activity';
  end if;

  v_entry := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'type', p_type,
    'description', p_description,
    'performedBy', p_performed_by,
    'metadata', p_metadata,
    'timestamp', extract(epoch from now()) * 1000
  );

  update public.projects
  set activity_log = coalesce(activity_log, '[]'::jsonb) || jsonb_build_array(v_entry)
  where id = p_project_id
    and organization_id = public.current_organization_id();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_own_must_change_password()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.profiles
  set must_change_password = false
  where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.create_stages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO production_stages (project_id, stage_name) VALUES
  (NEW.id, 'Design Review'),
  (NEW.id, 'Procurement'),
  (NEW.id, 'Fabrication'),
  (NEW.id, 'Assembly'),
  (NEW.id, 'QC'),
  (NEW.id, 'Dispatch');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_organization_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select organization_id from public.profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_stage_transaction_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_sent numeric;
  v_total_received numeric;
begin
  -- Lock the parent stage row first - this is what makes the check below
  -- safe under concurrent inserts targeting the same stage.
  perform 1 from public.project_production_stages where id = NEW.stage_id for update;

  if NEW.type = 'receive' then
    select coalesce(sum(quantity), 0) into v_total_sent
    from public.production_stage_transactions
    where stage_id = NEW.stage_id and type = 'send';

    select coalesce(sum(quantity), 0) into v_total_received
    from public.production_stage_transactions
    where stage_id = NEW.stage_id and type = 'receive';

    if v_total_received + NEW.quantity > v_total_sent then
      raise exception 'cannot receive % - cumulative received (%) would exceed cumulative sent (%) for stage %',
        NEW.quantity, v_total_received + NEW.quantity, v_total_sent, NEW.stage_id;
    end if;
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.expense_float_apply_recompute(p_float_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f record;
  r record;
begin
  select issued_amount, returned_amount, settled_at into f
  from public.expense_floats
  where id = p_float_id
  for update;

  if not found then
    return;
  end if;

  select * into r from public.expense_float_recompute(
    p_float_id, f.issued_amount, f.returned_amount, f.settled_at
  );

  update public.expense_floats
  set spent_amount = r.spent_amount,
      balance_amount = r.balance_amount,
      status = r.status,
      settled_at = r.settled_at
  where id = p_float_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.expense_float_recompute(p_float_id uuid, p_issued_amount numeric, p_returned_amount numeric, p_current_settled_at timestamp with time zone)
 RETURNS TABLE(spent_amount numeric, balance_amount numeric, status text, settled_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_spent numeric;
  v_balance numeric;
  v_status text;
begin
  select coalesce(sum(amount), 0) into v_spent
  from public.petty_expenses
  where float_id = p_float_id;

  v_balance := greatest(0, p_issued_amount - v_spent - p_returned_amount);

  if p_issued_amount - v_spent - p_returned_amount <= 0 then
    v_status := 'Fully Settled';
  elsif v_spent > 0 or p_returned_amount > 0 then
    v_status := 'Partially Settled';
  else
    v_status := 'Open';
  end if;

  return query select
    v_spent,
    v_balance,
    v_status,
    case when v_status = 'Fully Settled'
         then coalesce(p_current_settled_at, now())
         else null end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.expense_floats_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
begin
  select * into r from public.expense_float_recompute(
    NEW.id, NEW.issued_amount, NEW.returned_amount, NEW.settled_at
  );
  NEW.spent_amount := r.spent_amount;
  NEW.balance_amount := r.balance_amount;
  NEW.status := r.status;
  NEW.settled_at := r.settled_at;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_employee_code(p_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value integer;
begin
  insert into public.document_counters (organization_id, counter_key, current_value)
  values (p_organization_id, 'EMP', 1)
  on conflict (organization_id, counter_key)
  do update set current_value = public.document_counters.current_value + 1
  returning current_value into v_value;

  return 'EMP-' || extract(year from now())::text || '-' || lpad(v_value::text, 3, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_float_number(p_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value integer;
begin
  insert into public.document_counters (organization_id, counter_key, current_value)
  values (p_organization_id, 'FLT', 1)
  on conflict (organization_id, counter_key)
  do update set current_value = public.document_counters.current_value + 1
  returning current_value into v_value;

  return 'FLT-' || extract(year from now())::text || '-' || lpad(v_value::text, 3, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_project_number(p_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value integer;
begin
  insert into public.document_counters (organization_id, counter_key, current_value)
  values (p_organization_id, 'PROJ', 1)
  on conflict (organization_id, counter_key)
  do update set current_value = public.document_counters.current_value + 1
  returning current_value into v_value;

  return 'PROJ-' || extract(year from now())::text || '-' || lpad(v_value::text, 3, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_quotation_number(p_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value integer;
begin
  insert into public.document_counters (organization_id, counter_key, current_value)
  values (p_organization_id, 'QT', 1)
  on conflict (organization_id, counter_key)
  do update set current_value = public.document_counters.current_value + 1
  returning current_value into v_value;

  return 'QT-' || extract(year from now())::text || '-' || lpad(v_value::text, 3, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role_name text;
  v_role_id uuid;
  v_org_id uuid;
  v_created_by uuid;
begin
  v_role_name := coalesce(new.raw_user_meta_data ->> 'role', 'employee');
  select id into v_role_id from public.roles where name = v_role_name;
  if v_role_id is null then
    select id into v_role_id from public.roles where name = 'employee';
  end if;

  v_org_id := coalesce(
    (new.raw_user_meta_data ->> 'organization_id')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );
  v_created_by := coalesce((new.raw_user_meta_data ->> 'created_by')::uuid, auth.uid());

  insert into public.profiles (id, username, organization_id, created_by, must_change_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    v_org_id,
    v_created_by,
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  )
  on conflict (id) do nothing;

  -- user_roles is the single source of truth for "what role(s) does this
  -- user have" — this is the only place a role gets assigned.
  insert into public.user_roles (user_id, role_id)
  values (new.id, v_role_id)
  on conflict do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(p_module text, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    exists (select 1 from public.profiles where id = auth.uid() and is_active)
    and (
      exists (
        select 1 from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = auth.uid() and r.is_admin
      )
      or coalesce(
        (select upo.allowed
         from public.user_permission_overrides upo
         join public.permissions p on p.id = upo.permission_id
         where upo.user_id = auth.uid() and p.module = p_module and p.action = p_action),
        exists (
          select 1
          from public.user_roles ur
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id
          where ur.user_id = auth.uid() and p.module = p_module and p.action = p_action
        )
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.increase_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE inventory_items
  SET current_stock = current_stock + NEW.quantity
  WHERE id = NEW.inventory_item_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_auth_login()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.profiles set last_login = new.last_sign_in_at where id = new.id;
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values ((select organization_id from public.profiles where id = new.id), 'login_success', new.id, new.id, jsonb_build_object('at', new.last_sign_in_at));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_permission_override_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op in ('INSERT','UPDATE') then
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values ((select organization_id from public.profiles where id = new.user_id), 'permission_override_changed', auth.uid(), new.user_id,
      jsonb_build_object('permission_id', new.permission_id, 'allowed', new.allowed));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values ((select organization_id from public.profiles where id = old.user_id), 'permission_override_removed', auth.uid(), old.user_id,
      jsonb_build_object('permission_id', old.permission_id));
    return old;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_profile_active_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_active is distinct from old.is_active then
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values (new.organization_id, case when new.is_active then 'user_activated' else 'user_deactivated' end, auth.uid(), new.id, '{}'::jsonb);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_project()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO logs (project_id, message)
  VALUES (NEW.id, 'Project created');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values ((select organization_id from public.profiles where id = new.user_id), 'role_assigned', auth.uid(), new.user_id, jsonb_build_object('role_id', new.role_id));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values ((select organization_id from public.profiles where id = old.user_id), 'role_removed', auth.uid(), old.user_id, jsonb_build_object('role_id', old.role_id));
    return old;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_security_event(p_event_type text, p_target_user_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is distinct from p_target_user_id and not has_permission('users','edit') then
    raise exception 'Not authorized to log this event';
  end if;
  insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
  values (public.current_organization_id(), p_event_type, auth.uid(), p_target_user_id, p_metadata);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_employee_code_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.employee_code is not null and new.employee_code is distinct from old.employee_code then
    if not exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.is_admin
    ) then
      raise exception 'employee_code is immutable once set; only a Super Admin can change it';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_negative_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare stock_val numeric;
begin
  select current_stock into stock_val from inventory_items where id = new.inventory_item_id for update;
  if stock_val < new.quantity_used then
    raise exception 'Not enough stock';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_overpayment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare paid numeric;
declare total numeric;
begin
  perform 1 from invoices where id = new.invoice_id for update;
  select coalesce(sum(amount), 0) into paid from payments where invoice_id = new.invoice_id;
  select total_amount into total from invoices where id = new.invoice_id;
  if paid + new.amount > total then
    raise exception 'Overpayment not allowed';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_qms_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'Rows in % are append-only and cannot be updated or deleted (id=%)',
    TG_TABLE_NAME, coalesce(OLD.id, NEW.id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_bom_requisition(p_bom_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  v_available numeric;
  v_shortage numeric;
  v_existing record;
  v_new_status text;
begin
  select id, organization_id, project_id, inventory_item_id, material_name, required_quantity, estimated_price
  into b
  from public.project_bom_items
  where id = p_bom_item_id;

  if not found then
    -- BOM item itself was deleted; its requisition cascades via FK, nothing to do.
    return;
  end if;

  select coalesce(current_stock, 0) into v_available
  from public.inventory_items
  where id = b.inventory_item_id;

  v_shortage := greatest(coalesce(b.required_quantity, 0) - coalesce(v_available, 0), 0);

  select * into v_existing from public.bom_requisitions where bom_item_id = p_bom_item_id;

  if v_shortage > 0 then
    if found then
      v_new_status := case
        when v_existing.status = 'Completed' then 'Pending'
        when v_existing.status = 'Ready to Complete' then 'Pending'
        else v_existing.status
      end;

      update public.bom_requisitions
      set shortage_qty = v_shortage,
          required_qty = b.required_quantity,
          available_qty = v_available,
          estimated_price = b.estimated_price,
          material_name = b.material_name,
          status = v_new_status,
          updated_at = now()
      where bom_item_id = p_bom_item_id;
    else
      insert into public.bom_requisitions (
        organization_id, bom_item_id, project_id, inventory_item_id,
        material_name, required_qty, available_qty, shortage_qty,
        estimated_price, status
      ) values (
        b.organization_id, b.id, b.project_id, b.inventory_item_id,
        b.material_name, b.required_quantity, v_available, v_shortage,
        b.estimated_price, 'Pending'
      );
    end if;
  else
    -- No shortage: remove the requisition unless it is Completed, exactly
    -- matching the frontend's deleteBomItem/updateBomItem filter
    -- (r.status !== "Completed").
    if found and v_existing.status <> 'Completed' then
      delete from public.bom_requisitions where bom_item_id = p_bom_item_id;
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_petty_expense_floats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if TG_OP = 'DELETE' then
    if OLD.float_id is not null then
      perform public.expense_float_apply_recompute(OLD.float_id);
    end if;
    return OLD;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.float_id is not null then
      perform public.expense_float_apply_recompute(NEW.float_id);
    end if;
    return NEW;
  end if;

  -- UPDATE
  if OLD.float_id is not null then
    perform public.expense_float_apply_recompute(OLD.float_id);
  end if;
  if NEW.float_id is not null and NEW.float_id is distinct from OLD.float_id then
    perform public.expense_float_apply_recompute(NEW.float_id);
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_qms_inspection_status(p_inspection_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_characteristics integer;
  v_characteristics_with_attempts integer;
  v_fail_count integer;
  v_pass_count integer;
  v_status text;
begin
  select count(*) into v_total_characteristics
  from public.project_qms_inspection_characteristics
  where project_qms_inspection_id = p_inspection_id;

  with latest as (
    select distinct on (characteristic_id) characteristic_id, result
    from public.project_qms_inspection_attempts
    where project_qms_inspection_id = p_inspection_id
    order by characteristic_id, round_number desc
  )
  select
    count(*),
    count(*) filter (where result = 'Fail'),
    count(*) filter (where result = 'Pass')
  into v_characteristics_with_attempts, v_fail_count, v_pass_count
  from latest;

  if v_characteristics_with_attempts = 0 then
    v_status := 'NotStarted';
  elsif v_fail_count > 0 then
    v_status := 'Failed';
  elsif v_total_characteristics > 0 and v_pass_count = v_total_characteristics then
    v_status := 'Passed';
  else
    v_status := 'InProgress';
  end if;

  update public.project_qms_inspections
  set status = v_status, updated_at = now()
  where id = p_inspection_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_material_purchase(p_project_id uuid, p_material_type text, p_thickness text, p_quantity numeric, p_unit text, p_supplier_name text, p_vendor_id uuid, p_purchase_date date, p_attachments jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := public.current_organization_id();
  v_item_id uuid;
  v_purchase_id uuid;
  v_new_stock numeric;
begin
  if not (has_permission('inventory','create') or has_permission('production','create') or has_permission('projects','create')) then
    raise exception 'permission denied for record_material_purchase';
  end if;

  -- Find-or-create by case-insensitive name, race-safe via the unique
  -- index added in section 1.
  insert into public.inventory_items (organization_id, name, unit, current_stock)
  values (v_org, p_material_type, coalesce(p_unit, 'units'), 0)
  on conflict (organization_id, lower(name)) do nothing;

  select id into v_item_id
  from public.inventory_items
  where organization_id = v_org and lower(name) = lower(p_material_type);

  -- Purchase record + stock increase: reuses inventory_purchases +
  -- increase_stock() completely unmodified.
  insert into public.inventory_purchases (
    organization_id, vendor_id, inventory_item_id, quantity,
    material_name, supplier_name, purchase_date, attachments,
    project_id, thickness
  ) values (
    v_org, p_vendor_id, v_item_id, p_quantity,
    p_material_type, p_supplier_name, p_purchase_date, p_attachments,
    p_project_id, p_thickness
  )
  returning id into v_purchase_id;

  -- CORRECTED (see section 6's header note and phase11_completion_report.md
  -- for the disclosed incident): matches addMaterialPurchase() exactly -
  -- flip a Pending requisition to Ready to Complete only when the NEW
  -- stock level covers its OWN already-recorded shortage_qty. Never
  -- recomputes or deletes shortage_qty here - that full recomputation
  -- belongs only to project_bom_items edits (section 6's own trigger).
  select current_stock into v_new_stock from public.inventory_items where id = v_item_id;

  update public.bom_requisitions
  set status = 'Ready to Complete', updated_at = now()
  where project_id = p_project_id
    and inventory_item_id = v_item_id
    and status = 'Pending'
    and v_new_stock >= shortage_qty;

  return v_purchase_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reduce_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE inventory_items
  SET current_stock = current_stock - NEW.quantity_used
  WHERE id = NEW.inventory_item_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_qms_inspection_attempt_round()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_max_round integer;
begin
  perform 1 from public.project_qms_inspection_characteristics
    where id = NEW.characteristic_id for update;

  select coalesce(max(round_number), 0) into v_max_round
  from public.project_qms_inspection_attempts
  where characteristic_id = NEW.characteristic_id;

  NEW.round_number := v_max_round + 1;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.settle_expense_float(p_float_id uuid, p_delta numeric, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f record;
  r record;
begin
  if not (has_permission('expense_float','edit') or has_permission('expense_float','settle')) then
    raise exception 'permission denied for settle_expense_float';
  end if;

  select issued_amount, returned_amount, settled_at into f
  from public.expense_floats
  where id = p_float_id
    and organization_id = current_organization_id()
  for update;

  if not found then
    raise exception 'expense float % not found in this organization', p_float_id;
  end if;

  select * into r from public.expense_float_recompute(
    p_float_id, f.issued_amount, f.returned_amount + p_delta, f.settled_at
  );

  update public.expense_floats
  set returned_amount = f.returned_amount + p_delta,
      spent_amount = r.spent_amount,
      balance_amount = r.balance_amount,
      status = r.status,
      settled_at = r.settled_at,
      notes = coalesce(p_notes, notes)
  where id = p_float_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.stock_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE stock_val NUMERIC;
BEGIN
  SELECT current_stock INTO stock_val
  FROM inventory_items
  WHERE id = NEW.inventory_item_id;

  IF stock_val < NEW.quantity_required THEN
    INSERT INTO material_requisitions (project_id, inventory_item_id, quantity)
    VALUES (NEW.project_id, NEW.inventory_item_id, NEW.quantity_required - stock_val);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_customer_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.email := coalesce(new.primary_email, new.emails -> 0 ->> 'email', new.email);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_recompute_bom_requisition_on_bom_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if TG_OP = 'DELETE' then
    -- Requisition cascades via FK on delete of the BOM item; nothing
    -- further to recompute.
    return OLD;
  end if;
  perform public.recompute_bom_requisition(NEW.id);
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_recompute_qms_inspection_status_on_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.recompute_qms_inspection_status(NEW.project_qms_inspection_id);
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_invoice_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare paid numeric;
declare total numeric;
begin
  select coalesce(sum(amount),0) into paid
  from payments where invoice_id = new.invoice_id;

  select total_amount into total
  from invoices where id = new.invoice_id;

  update invoices
  set status =
    case
      when paid = 0 then 'Unpaid'
      when paid < total then 'PartiallyPaid'
      else 'Paid'
    end
  where id = new.invoice_id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_invoice_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_subtotal numeric;
  v_cgst_rate numeric;
  v_sgst_rate numeric;
  v_igst_rate numeric;
  v_cgst_amt numeric;
  v_sgst_amt numeric;
  v_igst_amt numeric;
begin
  select coalesce(sum(quantity * price), 0) into v_subtotal
  from invoice_items
  where invoice_id = new.invoice_id;

  select coalesce(cgst_rate, 0), coalesce(sgst_rate, 0), coalesce(igst_rate, 0)
    into v_cgst_rate, v_sgst_rate, v_igst_rate
  from invoices
  where id = new.invoice_id;

  v_cgst_amt := round(v_subtotal * v_cgst_rate / 100);
  v_sgst_amt := round(v_subtotal * v_sgst_rate / 100);
  v_igst_amt := round(v_subtotal * v_igst_rate / 100);

  update invoices
  set total_amount = v_subtotal + v_cgst_amt + v_sgst_amt + v_igst_amt
  where id = new.invoice_id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_rework_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ref_project uuid;
begin
  if NEW.reference_stage_id is not null then
    select project_id into v_ref_project
    from public.project_production_stages
    where id = NEW.reference_stage_id;

    if v_ref_project is null then
      raise exception 'reference_stage_id % does not exist', NEW.reference_stage_id;
    end if;

    if v_ref_project <> NEW.project_id then
      raise exception 'rework reference_stage_id must belong to the same project (stage project %, reference project %)', NEW.project_id, v_ref_project;
    end if;
  end if;
  return NEW;
end;
$function$
;

grant delete on table "public"."advance_records" to "anon";

grant insert on table "public"."advance_records" to "anon";

grant references on table "public"."advance_records" to "anon";

grant select on table "public"."advance_records" to "anon";

grant trigger on table "public"."advance_records" to "anon";

grant truncate on table "public"."advance_records" to "anon";

grant update on table "public"."advance_records" to "anon";

grant delete on table "public"."advance_records" to "authenticated";

grant insert on table "public"."advance_records" to "authenticated";

grant references on table "public"."advance_records" to "authenticated";

grant select on table "public"."advance_records" to "authenticated";

grant trigger on table "public"."advance_records" to "authenticated";

grant truncate on table "public"."advance_records" to "authenticated";

grant update on table "public"."advance_records" to "authenticated";

grant delete on table "public"."advance_records" to "service_role";

grant insert on table "public"."advance_records" to "service_role";

grant references on table "public"."advance_records" to "service_role";

grant select on table "public"."advance_records" to "service_role";

grant trigger on table "public"."advance_records" to "service_role";

grant truncate on table "public"."advance_records" to "service_role";

grant update on table "public"."advance_records" to "service_role";

grant delete on table "public"."attendance_records" to "anon";

grant insert on table "public"."attendance_records" to "anon";

grant references on table "public"."attendance_records" to "anon";

grant select on table "public"."attendance_records" to "anon";

grant trigger on table "public"."attendance_records" to "anon";

grant truncate on table "public"."attendance_records" to "anon";

grant update on table "public"."attendance_records" to "anon";

grant delete on table "public"."attendance_records" to "authenticated";

grant insert on table "public"."attendance_records" to "authenticated";

grant references on table "public"."attendance_records" to "authenticated";

grant select on table "public"."attendance_records" to "authenticated";

grant trigger on table "public"."attendance_records" to "authenticated";

grant truncate on table "public"."attendance_records" to "authenticated";

grant update on table "public"."attendance_records" to "authenticated";

grant delete on table "public"."attendance_records" to "service_role";

grant insert on table "public"."attendance_records" to "service_role";

grant references on table "public"."attendance_records" to "service_role";

grant select on table "public"."attendance_records" to "service_role";

grant trigger on table "public"."attendance_records" to "service_role";

grant truncate on table "public"."attendance_records" to "service_role";

grant update on table "public"."attendance_records" to "service_role";

grant delete on table "public"."bom_requisitions" to "anon";

grant insert on table "public"."bom_requisitions" to "anon";

grant references on table "public"."bom_requisitions" to "anon";

grant select on table "public"."bom_requisitions" to "anon";

grant trigger on table "public"."bom_requisitions" to "anon";

grant truncate on table "public"."bom_requisitions" to "anon";

grant update on table "public"."bom_requisitions" to "anon";

grant delete on table "public"."bom_requisitions" to "authenticated";

grant insert on table "public"."bom_requisitions" to "authenticated";

grant references on table "public"."bom_requisitions" to "authenticated";

grant select on table "public"."bom_requisitions" to "authenticated";

grant trigger on table "public"."bom_requisitions" to "authenticated";

grant truncate on table "public"."bom_requisitions" to "authenticated";

grant update on table "public"."bom_requisitions" to "authenticated";

grant delete on table "public"."bom_requisitions" to "service_role";

grant insert on table "public"."bom_requisitions" to "service_role";

grant references on table "public"."bom_requisitions" to "service_role";

grant select on table "public"."bom_requisitions" to "service_role";

grant trigger on table "public"."bom_requisitions" to "service_role";

grant truncate on table "public"."bom_requisitions" to "service_role";

grant update on table "public"."bom_requisitions" to "service_role";

grant delete on table "public"."company_pos" to "anon";

grant insert on table "public"."company_pos" to "anon";

grant references on table "public"."company_pos" to "anon";

grant select on table "public"."company_pos" to "anon";

grant trigger on table "public"."company_pos" to "anon";

grant truncate on table "public"."company_pos" to "anon";

grant update on table "public"."company_pos" to "anon";

grant delete on table "public"."company_pos" to "authenticated";

grant insert on table "public"."company_pos" to "authenticated";

grant references on table "public"."company_pos" to "authenticated";

grant select on table "public"."company_pos" to "authenticated";

grant trigger on table "public"."company_pos" to "authenticated";

grant truncate on table "public"."company_pos" to "authenticated";

grant update on table "public"."company_pos" to "authenticated";

grant delete on table "public"."company_pos" to "service_role";

grant insert on table "public"."company_pos" to "service_role";

grant references on table "public"."company_pos" to "service_role";

grant select on table "public"."company_pos" to "service_role";

grant trigger on table "public"."company_pos" to "service_role";

grant truncate on table "public"."company_pos" to "service_role";

grant update on table "public"."company_pos" to "service_role";

grant delete on table "public"."customers" to "anon";

grant insert on table "public"."customers" to "anon";

grant references on table "public"."customers" to "anon";

grant select on table "public"."customers" to "anon";

grant trigger on table "public"."customers" to "anon";

grant truncate on table "public"."customers" to "anon";

grant update on table "public"."customers" to "anon";

grant delete on table "public"."customers" to "authenticated";

grant insert on table "public"."customers" to "authenticated";

grant references on table "public"."customers" to "authenticated";

grant select on table "public"."customers" to "authenticated";

grant trigger on table "public"."customers" to "authenticated";

grant truncate on table "public"."customers" to "authenticated";

grant update on table "public"."customers" to "authenticated";

grant delete on table "public"."customers" to "service_role";

grant insert on table "public"."customers" to "service_role";

grant references on table "public"."customers" to "service_role";

grant select on table "public"."customers" to "service_role";

grant trigger on table "public"."customers" to "service_role";

grant truncate on table "public"."customers" to "service_role";

grant update on table "public"."customers" to "service_role";

grant delete on table "public"."delivery_challans" to "anon";

grant insert on table "public"."delivery_challans" to "anon";

grant references on table "public"."delivery_challans" to "anon";

grant select on table "public"."delivery_challans" to "anon";

grant trigger on table "public"."delivery_challans" to "anon";

grant truncate on table "public"."delivery_challans" to "anon";

grant update on table "public"."delivery_challans" to "anon";

grant delete on table "public"."delivery_challans" to "authenticated";

grant insert on table "public"."delivery_challans" to "authenticated";

grant references on table "public"."delivery_challans" to "authenticated";

grant select on table "public"."delivery_challans" to "authenticated";

grant trigger on table "public"."delivery_challans" to "authenticated";

grant truncate on table "public"."delivery_challans" to "authenticated";

grant update on table "public"."delivery_challans" to "authenticated";

grant delete on table "public"."delivery_challans" to "service_role";

grant insert on table "public"."delivery_challans" to "service_role";

grant references on table "public"."delivery_challans" to "service_role";

grant select on table "public"."delivery_challans" to "service_role";

grant trigger on table "public"."delivery_challans" to "service_role";

grant truncate on table "public"."delivery_challans" to "service_role";

grant update on table "public"."delivery_challans" to "service_role";

grant delete on table "public"."document_counters" to "anon";

grant insert on table "public"."document_counters" to "anon";

grant references on table "public"."document_counters" to "anon";

grant select on table "public"."document_counters" to "anon";

grant trigger on table "public"."document_counters" to "anon";

grant truncate on table "public"."document_counters" to "anon";

grant update on table "public"."document_counters" to "anon";

grant delete on table "public"."document_counters" to "authenticated";

grant insert on table "public"."document_counters" to "authenticated";

grant references on table "public"."document_counters" to "authenticated";

grant select on table "public"."document_counters" to "authenticated";

grant trigger on table "public"."document_counters" to "authenticated";

grant truncate on table "public"."document_counters" to "authenticated";

grant update on table "public"."document_counters" to "authenticated";

grant delete on table "public"."document_counters" to "service_role";

grant insert on table "public"."document_counters" to "service_role";

grant references on table "public"."document_counters" to "service_role";

grant select on table "public"."document_counters" to "service_role";

grant trigger on table "public"."document_counters" to "service_role";

grant truncate on table "public"."document_counters" to "service_role";

grant update on table "public"."document_counters" to "service_role";

grant delete on table "public"."drawing_links" to "anon";

grant insert on table "public"."drawing_links" to "anon";

grant references on table "public"."drawing_links" to "anon";

grant select on table "public"."drawing_links" to "anon";

grant trigger on table "public"."drawing_links" to "anon";

grant truncate on table "public"."drawing_links" to "anon";

grant update on table "public"."drawing_links" to "anon";

grant delete on table "public"."drawing_links" to "authenticated";

grant insert on table "public"."drawing_links" to "authenticated";

grant references on table "public"."drawing_links" to "authenticated";

grant select on table "public"."drawing_links" to "authenticated";

grant trigger on table "public"."drawing_links" to "authenticated";

grant truncate on table "public"."drawing_links" to "authenticated";

grant update on table "public"."drawing_links" to "authenticated";

grant delete on table "public"."drawing_links" to "service_role";

grant insert on table "public"."drawing_links" to "service_role";

grant references on table "public"."drawing_links" to "service_role";

grant select on table "public"."drawing_links" to "service_role";

grant trigger on table "public"."drawing_links" to "service_role";

grant truncate on table "public"."drawing_links" to "service_role";

grant update on table "public"."drawing_links" to "service_role";

grant delete on table "public"."drawing_views" to "anon";

grant insert on table "public"."drawing_views" to "anon";

grant references on table "public"."drawing_views" to "anon";

grant select on table "public"."drawing_views" to "anon";

grant trigger on table "public"."drawing_views" to "anon";

grant truncate on table "public"."drawing_views" to "anon";

grant update on table "public"."drawing_views" to "anon";

grant delete on table "public"."drawing_views" to "authenticated";

grant insert on table "public"."drawing_views" to "authenticated";

grant references on table "public"."drawing_views" to "authenticated";

grant select on table "public"."drawing_views" to "authenticated";

grant trigger on table "public"."drawing_views" to "authenticated";

grant truncate on table "public"."drawing_views" to "authenticated";

grant update on table "public"."drawing_views" to "authenticated";

grant delete on table "public"."drawing_views" to "service_role";

grant insert on table "public"."drawing_views" to "service_role";

grant references on table "public"."drawing_views" to "service_role";

grant select on table "public"."drawing_views" to "service_role";

grant trigger on table "public"."drawing_views" to "service_role";

grant truncate on table "public"."drawing_views" to "service_role";

grant update on table "public"."drawing_views" to "service_role";

grant delete on table "public"."drawings" to "anon";

grant insert on table "public"."drawings" to "anon";

grant references on table "public"."drawings" to "anon";

grant select on table "public"."drawings" to "anon";

grant trigger on table "public"."drawings" to "anon";

grant truncate on table "public"."drawings" to "anon";

grant update on table "public"."drawings" to "anon";

grant delete on table "public"."drawings" to "authenticated";

grant insert on table "public"."drawings" to "authenticated";

grant references on table "public"."drawings" to "authenticated";

grant select on table "public"."drawings" to "authenticated";

grant trigger on table "public"."drawings" to "authenticated";

grant truncate on table "public"."drawings" to "authenticated";

grant update on table "public"."drawings" to "authenticated";

grant delete on table "public"."drawings" to "service_role";

grant insert on table "public"."drawings" to "service_role";

grant references on table "public"."drawings" to "service_role";

grant select on table "public"."drawings" to "service_role";

grant trigger on table "public"."drawings" to "service_role";

grant truncate on table "public"."drawings" to "service_role";

grant update on table "public"."drawings" to "service_role";

grant delete on table "public"."employee_documents" to "anon";

grant insert on table "public"."employee_documents" to "anon";

grant references on table "public"."employee_documents" to "anon";

grant select on table "public"."employee_documents" to "anon";

grant trigger on table "public"."employee_documents" to "anon";

grant truncate on table "public"."employee_documents" to "anon";

grant update on table "public"."employee_documents" to "anon";

grant delete on table "public"."employee_documents" to "authenticated";

grant insert on table "public"."employee_documents" to "authenticated";

grant references on table "public"."employee_documents" to "authenticated";

grant select on table "public"."employee_documents" to "authenticated";

grant trigger on table "public"."employee_documents" to "authenticated";

grant truncate on table "public"."employee_documents" to "authenticated";

grant update on table "public"."employee_documents" to "authenticated";

grant delete on table "public"."employee_documents" to "service_role";

grant insert on table "public"."employee_documents" to "service_role";

grant references on table "public"."employee_documents" to "service_role";

grant select on table "public"."employee_documents" to "service_role";

grant trigger on table "public"."employee_documents" to "service_role";

grant truncate on table "public"."employee_documents" to "service_role";

grant update on table "public"."employee_documents" to "service_role";

grant delete on table "public"."employees" to "anon";

grant insert on table "public"."employees" to "anon";

grant references on table "public"."employees" to "anon";

grant select on table "public"."employees" to "anon";

grant trigger on table "public"."employees" to "anon";

grant truncate on table "public"."employees" to "anon";

grant update on table "public"."employees" to "anon";

grant delete on table "public"."employees" to "authenticated";

grant insert on table "public"."employees" to "authenticated";

grant references on table "public"."employees" to "authenticated";

grant select on table "public"."employees" to "authenticated";

grant trigger on table "public"."employees" to "authenticated";

grant truncate on table "public"."employees" to "authenticated";

grant update on table "public"."employees" to "authenticated";

grant delete on table "public"."employees" to "service_role";

grant insert on table "public"."employees" to "service_role";

grant references on table "public"."employees" to "service_role";

grant select on table "public"."employees" to "service_role";

grant trigger on table "public"."employees" to "service_role";

grant truncate on table "public"."employees" to "service_role";

grant update on table "public"."employees" to "service_role";

grant delete on table "public"."expense_floats" to "anon";

grant insert on table "public"."expense_floats" to "anon";

grant references on table "public"."expense_floats" to "anon";

grant select on table "public"."expense_floats" to "anon";

grant trigger on table "public"."expense_floats" to "anon";

grant truncate on table "public"."expense_floats" to "anon";

grant update on table "public"."expense_floats" to "anon";

grant delete on table "public"."expense_floats" to "authenticated";

grant insert on table "public"."expense_floats" to "authenticated";

grant references on table "public"."expense_floats" to "authenticated";

grant select on table "public"."expense_floats" to "authenticated";

grant trigger on table "public"."expense_floats" to "authenticated";

grant truncate on table "public"."expense_floats" to "authenticated";

grant update on table "public"."expense_floats" to "authenticated";

grant delete on table "public"."expense_floats" to "service_role";

grant insert on table "public"."expense_floats" to "service_role";

grant references on table "public"."expense_floats" to "service_role";

grant select on table "public"."expense_floats" to "service_role";

grant trigger on table "public"."expense_floats" to "service_role";

grant truncate on table "public"."expense_floats" to "service_role";

grant update on table "public"."expense_floats" to "service_role";

grant delete on table "public"."inspection_methods" to "anon";

grant insert on table "public"."inspection_methods" to "anon";

grant references on table "public"."inspection_methods" to "anon";

grant select on table "public"."inspection_methods" to "anon";

grant trigger on table "public"."inspection_methods" to "anon";

grant truncate on table "public"."inspection_methods" to "anon";

grant update on table "public"."inspection_methods" to "anon";

grant delete on table "public"."inspection_methods" to "authenticated";

grant insert on table "public"."inspection_methods" to "authenticated";

grant references on table "public"."inspection_methods" to "authenticated";

grant select on table "public"."inspection_methods" to "authenticated";

grant trigger on table "public"."inspection_methods" to "authenticated";

grant truncate on table "public"."inspection_methods" to "authenticated";

grant update on table "public"."inspection_methods" to "authenticated";

grant delete on table "public"."inspection_methods" to "service_role";

grant insert on table "public"."inspection_methods" to "service_role";

grant references on table "public"."inspection_methods" to "service_role";

grant select on table "public"."inspection_methods" to "service_role";

grant trigger on table "public"."inspection_methods" to "service_role";

grant truncate on table "public"."inspection_methods" to "service_role";

grant update on table "public"."inspection_methods" to "service_role";

grant delete on table "public"."inspection_stage_definitions" to "anon";

grant insert on table "public"."inspection_stage_definitions" to "anon";

grant references on table "public"."inspection_stage_definitions" to "anon";

grant select on table "public"."inspection_stage_definitions" to "anon";

grant trigger on table "public"."inspection_stage_definitions" to "anon";

grant truncate on table "public"."inspection_stage_definitions" to "anon";

grant update on table "public"."inspection_stage_definitions" to "anon";

grant delete on table "public"."inspection_stage_definitions" to "authenticated";

grant insert on table "public"."inspection_stage_definitions" to "authenticated";

grant references on table "public"."inspection_stage_definitions" to "authenticated";

grant select on table "public"."inspection_stage_definitions" to "authenticated";

grant trigger on table "public"."inspection_stage_definitions" to "authenticated";

grant truncate on table "public"."inspection_stage_definitions" to "authenticated";

grant update on table "public"."inspection_stage_definitions" to "authenticated";

grant delete on table "public"."inspection_stage_definitions" to "service_role";

grant insert on table "public"."inspection_stage_definitions" to "service_role";

grant references on table "public"."inspection_stage_definitions" to "service_role";

grant select on table "public"."inspection_stage_definitions" to "service_role";

grant trigger on table "public"."inspection_stage_definitions" to "service_role";

grant truncate on table "public"."inspection_stage_definitions" to "service_role";

grant update on table "public"."inspection_stage_definitions" to "service_role";

grant delete on table "public"."inventory_items" to "anon";

grant insert on table "public"."inventory_items" to "anon";

grant references on table "public"."inventory_items" to "anon";

grant select on table "public"."inventory_items" to "anon";

grant trigger on table "public"."inventory_items" to "anon";

grant truncate on table "public"."inventory_items" to "anon";

grant update on table "public"."inventory_items" to "anon";

grant delete on table "public"."inventory_items" to "authenticated";

grant insert on table "public"."inventory_items" to "authenticated";

grant references on table "public"."inventory_items" to "authenticated";

grant select on table "public"."inventory_items" to "authenticated";

grant trigger on table "public"."inventory_items" to "authenticated";

grant truncate on table "public"."inventory_items" to "authenticated";

grant update on table "public"."inventory_items" to "authenticated";

grant delete on table "public"."inventory_items" to "service_role";

grant insert on table "public"."inventory_items" to "service_role";

grant references on table "public"."inventory_items" to "service_role";

grant select on table "public"."inventory_items" to "service_role";

grant trigger on table "public"."inventory_items" to "service_role";

grant truncate on table "public"."inventory_items" to "service_role";

grant update on table "public"."inventory_items" to "service_role";

grant delete on table "public"."inventory_purchases" to "anon";

grant insert on table "public"."inventory_purchases" to "anon";

grant references on table "public"."inventory_purchases" to "anon";

grant select on table "public"."inventory_purchases" to "anon";

grant trigger on table "public"."inventory_purchases" to "anon";

grant truncate on table "public"."inventory_purchases" to "anon";

grant update on table "public"."inventory_purchases" to "anon";

grant delete on table "public"."inventory_purchases" to "authenticated";

grant insert on table "public"."inventory_purchases" to "authenticated";

grant references on table "public"."inventory_purchases" to "authenticated";

grant select on table "public"."inventory_purchases" to "authenticated";

grant trigger on table "public"."inventory_purchases" to "authenticated";

grant truncate on table "public"."inventory_purchases" to "authenticated";

grant update on table "public"."inventory_purchases" to "authenticated";

grant delete on table "public"."inventory_purchases" to "service_role";

grant insert on table "public"."inventory_purchases" to "service_role";

grant references on table "public"."inventory_purchases" to "service_role";

grant select on table "public"."inventory_purchases" to "service_role";

grant trigger on table "public"."inventory_purchases" to "service_role";

grant truncate on table "public"."inventory_purchases" to "service_role";

grant update on table "public"."inventory_purchases" to "service_role";

grant delete on table "public"."inventory_usages" to "anon";

grant insert on table "public"."inventory_usages" to "anon";

grant references on table "public"."inventory_usages" to "anon";

grant select on table "public"."inventory_usages" to "anon";

grant trigger on table "public"."inventory_usages" to "anon";

grant truncate on table "public"."inventory_usages" to "anon";

grant update on table "public"."inventory_usages" to "anon";

grant delete on table "public"."inventory_usages" to "authenticated";

grant insert on table "public"."inventory_usages" to "authenticated";

grant references on table "public"."inventory_usages" to "authenticated";

grant select on table "public"."inventory_usages" to "authenticated";

grant trigger on table "public"."inventory_usages" to "authenticated";

grant truncate on table "public"."inventory_usages" to "authenticated";

grant update on table "public"."inventory_usages" to "authenticated";

grant delete on table "public"."inventory_usages" to "service_role";

grant insert on table "public"."inventory_usages" to "service_role";

grant references on table "public"."inventory_usages" to "service_role";

grant select on table "public"."inventory_usages" to "service_role";

grant trigger on table "public"."inventory_usages" to "service_role";

grant truncate on table "public"."inventory_usages" to "service_role";

grant update on table "public"."inventory_usages" to "service_role";

grant delete on table "public"."invoice_items" to "anon";

grant insert on table "public"."invoice_items" to "anon";

grant references on table "public"."invoice_items" to "anon";

grant select on table "public"."invoice_items" to "anon";

grant trigger on table "public"."invoice_items" to "anon";

grant truncate on table "public"."invoice_items" to "anon";

grant update on table "public"."invoice_items" to "anon";

grant delete on table "public"."invoice_items" to "authenticated";

grant insert on table "public"."invoice_items" to "authenticated";

grant references on table "public"."invoice_items" to "authenticated";

grant select on table "public"."invoice_items" to "authenticated";

grant trigger on table "public"."invoice_items" to "authenticated";

grant truncate on table "public"."invoice_items" to "authenticated";

grant update on table "public"."invoice_items" to "authenticated";

grant delete on table "public"."invoice_items" to "service_role";

grant insert on table "public"."invoice_items" to "service_role";

grant references on table "public"."invoice_items" to "service_role";

grant select on table "public"."invoice_items" to "service_role";

grant trigger on table "public"."invoice_items" to "service_role";

grant truncate on table "public"."invoice_items" to "service_role";

grant update on table "public"."invoice_items" to "service_role";

grant delete on table "public"."invoices" to "anon";

grant insert on table "public"."invoices" to "anon";

grant references on table "public"."invoices" to "anon";

grant select on table "public"."invoices" to "anon";

grant trigger on table "public"."invoices" to "anon";

grant truncate on table "public"."invoices" to "anon";

grant update on table "public"."invoices" to "anon";

grant delete on table "public"."invoices" to "authenticated";

grant insert on table "public"."invoices" to "authenticated";

grant references on table "public"."invoices" to "authenticated";

grant select on table "public"."invoices" to "authenticated";

grant trigger on table "public"."invoices" to "authenticated";

grant truncate on table "public"."invoices" to "authenticated";

grant update on table "public"."invoices" to "authenticated";

grant delete on table "public"."invoices" to "service_role";

grant insert on table "public"."invoices" to "service_role";

grant references on table "public"."invoices" to "service_role";

grant select on table "public"."invoices" to "service_role";

grant trigger on table "public"."invoices" to "service_role";

grant truncate on table "public"."invoices" to "service_role";

grant update on table "public"."invoices" to "service_role";

grant delete on table "public"."logs" to "anon";

grant insert on table "public"."logs" to "anon";

grant references on table "public"."logs" to "anon";

grant select on table "public"."logs" to "anon";

grant trigger on table "public"."logs" to "anon";

grant truncate on table "public"."logs" to "anon";

grant update on table "public"."logs" to "anon";

grant delete on table "public"."logs" to "authenticated";

grant insert on table "public"."logs" to "authenticated";

grant references on table "public"."logs" to "authenticated";

grant select on table "public"."logs" to "authenticated";

grant trigger on table "public"."logs" to "authenticated";

grant truncate on table "public"."logs" to "authenticated";

grant update on table "public"."logs" to "authenticated";

grant delete on table "public"."logs" to "service_role";

grant insert on table "public"."logs" to "service_role";

grant references on table "public"."logs" to "service_role";

grant select on table "public"."logs" to "service_role";

grant trigger on table "public"."logs" to "service_role";

grant truncate on table "public"."logs" to "service_role";

grant update on table "public"."logs" to "service_role";

grant delete on table "public"."manufacturing_processes" to "anon";

grant insert on table "public"."manufacturing_processes" to "anon";

grant references on table "public"."manufacturing_processes" to "anon";

grant select on table "public"."manufacturing_processes" to "anon";

grant trigger on table "public"."manufacturing_processes" to "anon";

grant truncate on table "public"."manufacturing_processes" to "anon";

grant update on table "public"."manufacturing_processes" to "anon";

grant delete on table "public"."manufacturing_processes" to "authenticated";

grant insert on table "public"."manufacturing_processes" to "authenticated";

grant references on table "public"."manufacturing_processes" to "authenticated";

grant select on table "public"."manufacturing_processes" to "authenticated";

grant trigger on table "public"."manufacturing_processes" to "authenticated";

grant truncate on table "public"."manufacturing_processes" to "authenticated";

grant update on table "public"."manufacturing_processes" to "authenticated";

grant delete on table "public"."manufacturing_processes" to "service_role";

grant insert on table "public"."manufacturing_processes" to "service_role";

grant references on table "public"."manufacturing_processes" to "service_role";

grant select on table "public"."manufacturing_processes" to "service_role";

grant trigger on table "public"."manufacturing_processes" to "service_role";

grant truncate on table "public"."manufacturing_processes" to "service_role";

grant update on table "public"."manufacturing_processes" to "service_role";

grant delete on table "public"."master_pos" to "anon";

grant insert on table "public"."master_pos" to "anon";

grant references on table "public"."master_pos" to "anon";

grant select on table "public"."master_pos" to "anon";

grant trigger on table "public"."master_pos" to "anon";

grant truncate on table "public"."master_pos" to "anon";

grant update on table "public"."master_pos" to "anon";

grant delete on table "public"."master_pos" to "authenticated";

grant insert on table "public"."master_pos" to "authenticated";

grant references on table "public"."master_pos" to "authenticated";

grant select on table "public"."master_pos" to "authenticated";

grant trigger on table "public"."master_pos" to "authenticated";

grant truncate on table "public"."master_pos" to "authenticated";

grant update on table "public"."master_pos" to "authenticated";

grant delete on table "public"."master_pos" to "service_role";

grant insert on table "public"."master_pos" to "service_role";

grant references on table "public"."master_pos" to "service_role";

grant select on table "public"."master_pos" to "service_role";

grant trigger on table "public"."master_pos" to "service_role";

grant truncate on table "public"."master_pos" to "service_role";

grant update on table "public"."master_pos" to "service_role";

grant delete on table "public"."material_requisitions" to "anon";

grant insert on table "public"."material_requisitions" to "anon";

grant references on table "public"."material_requisitions" to "anon";

grant select on table "public"."material_requisitions" to "anon";

grant trigger on table "public"."material_requisitions" to "anon";

grant truncate on table "public"."material_requisitions" to "anon";

grant update on table "public"."material_requisitions" to "anon";

grant delete on table "public"."material_requisitions" to "authenticated";

grant insert on table "public"."material_requisitions" to "authenticated";

grant references on table "public"."material_requisitions" to "authenticated";

grant select on table "public"."material_requisitions" to "authenticated";

grant trigger on table "public"."material_requisitions" to "authenticated";

grant truncate on table "public"."material_requisitions" to "authenticated";

grant update on table "public"."material_requisitions" to "authenticated";

grant delete on table "public"."material_requisitions" to "service_role";

grant insert on table "public"."material_requisitions" to "service_role";

grant references on table "public"."material_requisitions" to "service_role";

grant select on table "public"."material_requisitions" to "service_role";

grant trigger on table "public"."material_requisitions" to "service_role";

grant truncate on table "public"."material_requisitions" to "service_role";

grant update on table "public"."material_requisitions" to "service_role";

grant delete on table "public"."operations" to "anon";

grant insert on table "public"."operations" to "anon";

grant references on table "public"."operations" to "anon";

grant select on table "public"."operations" to "anon";

grant trigger on table "public"."operations" to "anon";

grant truncate on table "public"."operations" to "anon";

grant update on table "public"."operations" to "anon";

grant delete on table "public"."operations" to "authenticated";

grant insert on table "public"."operations" to "authenticated";

grant references on table "public"."operations" to "authenticated";

grant select on table "public"."operations" to "authenticated";

grant trigger on table "public"."operations" to "authenticated";

grant truncate on table "public"."operations" to "authenticated";

grant update on table "public"."operations" to "authenticated";

grant delete on table "public"."operations" to "service_role";

grant insert on table "public"."operations" to "service_role";

grant references on table "public"."operations" to "service_role";

grant select on table "public"."operations" to "service_role";

grant trigger on table "public"."operations" to "service_role";

grant truncate on table "public"."operations" to "service_role";

grant update on table "public"."operations" to "service_role";

grant delete on table "public"."organizations" to "anon";

grant insert on table "public"."organizations" to "anon";

grant references on table "public"."organizations" to "anon";

grant select on table "public"."organizations" to "anon";

grant trigger on table "public"."organizations" to "anon";

grant truncate on table "public"."organizations" to "anon";

grant update on table "public"."organizations" to "anon";

grant delete on table "public"."organizations" to "authenticated";

grant insert on table "public"."organizations" to "authenticated";

grant references on table "public"."organizations" to "authenticated";

grant select on table "public"."organizations" to "authenticated";

grant trigger on table "public"."organizations" to "authenticated";

grant truncate on table "public"."organizations" to "authenticated";

grant update on table "public"."organizations" to "authenticated";

grant delete on table "public"."organizations" to "service_role";

grant insert on table "public"."organizations" to "service_role";

grant references on table "public"."organizations" to "service_role";

grant select on table "public"."organizations" to "service_role";

grant trigger on table "public"."organizations" to "service_role";

grant truncate on table "public"."organizations" to "service_role";

grant update on table "public"."organizations" to "service_role";

grant delete on table "public"."outsourced_works" to "anon";

grant insert on table "public"."outsourced_works" to "anon";

grant references on table "public"."outsourced_works" to "anon";

grant select on table "public"."outsourced_works" to "anon";

grant trigger on table "public"."outsourced_works" to "anon";

grant truncate on table "public"."outsourced_works" to "anon";

grant update on table "public"."outsourced_works" to "anon";

grant delete on table "public"."outsourced_works" to "authenticated";

grant insert on table "public"."outsourced_works" to "authenticated";

grant references on table "public"."outsourced_works" to "authenticated";

grant select on table "public"."outsourced_works" to "authenticated";

grant trigger on table "public"."outsourced_works" to "authenticated";

grant truncate on table "public"."outsourced_works" to "authenticated";

grant update on table "public"."outsourced_works" to "authenticated";

grant delete on table "public"."outsourced_works" to "service_role";

grant insert on table "public"."outsourced_works" to "service_role";

grant references on table "public"."outsourced_works" to "service_role";

grant select on table "public"."outsourced_works" to "service_role";

grant trigger on table "public"."outsourced_works" to "service_role";

grant truncate on table "public"."outsourced_works" to "service_role";

grant update on table "public"."outsourced_works" to "service_role";

grant delete on table "public"."payments" to "anon";

grant insert on table "public"."payments" to "anon";

grant references on table "public"."payments" to "anon";

grant select on table "public"."payments" to "anon";

grant trigger on table "public"."payments" to "anon";

grant truncate on table "public"."payments" to "anon";

grant update on table "public"."payments" to "anon";

grant delete on table "public"."payments" to "authenticated";

grant insert on table "public"."payments" to "authenticated";

grant references on table "public"."payments" to "authenticated";

grant select on table "public"."payments" to "authenticated";

grant trigger on table "public"."payments" to "authenticated";

grant truncate on table "public"."payments" to "authenticated";

grant update on table "public"."payments" to "authenticated";

grant delete on table "public"."payments" to "service_role";

grant insert on table "public"."payments" to "service_role";

grant references on table "public"."payments" to "service_role";

grant select on table "public"."payments" to "service_role";

grant trigger on table "public"."payments" to "service_role";

grant truncate on table "public"."payments" to "service_role";

grant update on table "public"."payments" to "service_role";

grant delete on table "public"."permissions" to "anon";

grant insert on table "public"."permissions" to "anon";

grant references on table "public"."permissions" to "anon";

grant select on table "public"."permissions" to "anon";

grant trigger on table "public"."permissions" to "anon";

grant truncate on table "public"."permissions" to "anon";

grant update on table "public"."permissions" to "anon";

grant delete on table "public"."permissions" to "authenticated";

grant insert on table "public"."permissions" to "authenticated";

grant references on table "public"."permissions" to "authenticated";

grant select on table "public"."permissions" to "authenticated";

grant trigger on table "public"."permissions" to "authenticated";

grant truncate on table "public"."permissions" to "authenticated";

grant update on table "public"."permissions" to "authenticated";

grant delete on table "public"."permissions" to "service_role";

grant insert on table "public"."permissions" to "service_role";

grant references on table "public"."permissions" to "service_role";

grant select on table "public"."permissions" to "service_role";

grant trigger on table "public"."permissions" to "service_role";

grant truncate on table "public"."permissions" to "service_role";

grant update on table "public"."permissions" to "service_role";

grant delete on table "public"."petty_expenses" to "anon";

grant insert on table "public"."petty_expenses" to "anon";

grant references on table "public"."petty_expenses" to "anon";

grant select on table "public"."petty_expenses" to "anon";

grant trigger on table "public"."petty_expenses" to "anon";

grant truncate on table "public"."petty_expenses" to "anon";

grant update on table "public"."petty_expenses" to "anon";

grant delete on table "public"."petty_expenses" to "authenticated";

grant insert on table "public"."petty_expenses" to "authenticated";

grant references on table "public"."petty_expenses" to "authenticated";

grant select on table "public"."petty_expenses" to "authenticated";

grant trigger on table "public"."petty_expenses" to "authenticated";

grant truncate on table "public"."petty_expenses" to "authenticated";

grant update on table "public"."petty_expenses" to "authenticated";

grant delete on table "public"."petty_expenses" to "service_role";

grant insert on table "public"."petty_expenses" to "service_role";

grant references on table "public"."petty_expenses" to "service_role";

grant select on table "public"."petty_expenses" to "service_role";

grant trigger on table "public"."petty_expenses" to "service_role";

grant truncate on table "public"."petty_expenses" to "service_role";

grant update on table "public"."petty_expenses" to "service_role";

grant delete on table "public"."production_stage_transactions" to "anon";

grant insert on table "public"."production_stage_transactions" to "anon";

grant references on table "public"."production_stage_transactions" to "anon";

grant select on table "public"."production_stage_transactions" to "anon";

grant trigger on table "public"."production_stage_transactions" to "anon";

grant truncate on table "public"."production_stage_transactions" to "anon";

grant update on table "public"."production_stage_transactions" to "anon";

grant delete on table "public"."production_stage_transactions" to "authenticated";

grant insert on table "public"."production_stage_transactions" to "authenticated";

grant references on table "public"."production_stage_transactions" to "authenticated";

grant select on table "public"."production_stage_transactions" to "authenticated";

grant trigger on table "public"."production_stage_transactions" to "authenticated";

grant truncate on table "public"."production_stage_transactions" to "authenticated";

grant update on table "public"."production_stage_transactions" to "authenticated";

grant delete on table "public"."production_stage_transactions" to "service_role";

grant insert on table "public"."production_stage_transactions" to "service_role";

grant references on table "public"."production_stage_transactions" to "service_role";

grant select on table "public"."production_stage_transactions" to "service_role";

grant trigger on table "public"."production_stage_transactions" to "service_role";

grant truncate on table "public"."production_stage_transactions" to "service_role";

grant update on table "public"."production_stage_transactions" to "service_role";

grant delete on table "public"."production_stages" to "anon";

grant insert on table "public"."production_stages" to "anon";

grant references on table "public"."production_stages" to "anon";

grant select on table "public"."production_stages" to "anon";

grant trigger on table "public"."production_stages" to "anon";

grant truncate on table "public"."production_stages" to "anon";

grant update on table "public"."production_stages" to "anon";

grant delete on table "public"."production_stages" to "authenticated";

grant insert on table "public"."production_stages" to "authenticated";

grant references on table "public"."production_stages" to "authenticated";

grant select on table "public"."production_stages" to "authenticated";

grant trigger on table "public"."production_stages" to "authenticated";

grant truncate on table "public"."production_stages" to "authenticated";

grant update on table "public"."production_stages" to "authenticated";

grant delete on table "public"."production_stages" to "service_role";

grant insert on table "public"."production_stages" to "service_role";

grant references on table "public"."production_stages" to "service_role";

grant select on table "public"."production_stages" to "service_role";

grant trigger on table "public"."production_stages" to "service_role";

grant truncate on table "public"."production_stages" to "service_role";

grant update on table "public"."production_stages" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."project_bom_items" to "anon";

grant insert on table "public"."project_bom_items" to "anon";

grant references on table "public"."project_bom_items" to "anon";

grant select on table "public"."project_bom_items" to "anon";

grant trigger on table "public"."project_bom_items" to "anon";

grant truncate on table "public"."project_bom_items" to "anon";

grant update on table "public"."project_bom_items" to "anon";

grant delete on table "public"."project_bom_items" to "authenticated";

grant insert on table "public"."project_bom_items" to "authenticated";

grant references on table "public"."project_bom_items" to "authenticated";

grant select on table "public"."project_bom_items" to "authenticated";

grant trigger on table "public"."project_bom_items" to "authenticated";

grant truncate on table "public"."project_bom_items" to "authenticated";

grant update on table "public"."project_bom_items" to "authenticated";

grant delete on table "public"."project_bom_items" to "service_role";

grant insert on table "public"."project_bom_items" to "service_role";

grant references on table "public"."project_bom_items" to "service_role";

grant select on table "public"."project_bom_items" to "service_role";

grant trigger on table "public"."project_bom_items" to "service_role";

grant truncate on table "public"."project_bom_items" to "service_role";

grant update on table "public"."project_bom_items" to "service_role";

grant delete on table "public"."project_employees" to "anon";

grant insert on table "public"."project_employees" to "anon";

grant references on table "public"."project_employees" to "anon";

grant select on table "public"."project_employees" to "anon";

grant trigger on table "public"."project_employees" to "anon";

grant truncate on table "public"."project_employees" to "anon";

grant update on table "public"."project_employees" to "anon";

grant delete on table "public"."project_employees" to "authenticated";

grant insert on table "public"."project_employees" to "authenticated";

grant references on table "public"."project_employees" to "authenticated";

grant select on table "public"."project_employees" to "authenticated";

grant trigger on table "public"."project_employees" to "authenticated";

grant truncate on table "public"."project_employees" to "authenticated";

grant update on table "public"."project_employees" to "authenticated";

grant delete on table "public"."project_employees" to "service_role";

grant insert on table "public"."project_employees" to "service_role";

grant references on table "public"."project_employees" to "service_role";

grant select on table "public"."project_employees" to "service_role";

grant trigger on table "public"."project_employees" to "service_role";

grant truncate on table "public"."project_employees" to "service_role";

grant update on table "public"."project_employees" to "service_role";

grant delete on table "public"."project_materials" to "anon";

grant insert on table "public"."project_materials" to "anon";

grant references on table "public"."project_materials" to "anon";

grant select on table "public"."project_materials" to "anon";

grant trigger on table "public"."project_materials" to "anon";

grant truncate on table "public"."project_materials" to "anon";

grant update on table "public"."project_materials" to "anon";

grant delete on table "public"."project_materials" to "authenticated";

grant insert on table "public"."project_materials" to "authenticated";

grant references on table "public"."project_materials" to "authenticated";

grant select on table "public"."project_materials" to "authenticated";

grant trigger on table "public"."project_materials" to "authenticated";

grant truncate on table "public"."project_materials" to "authenticated";

grant update on table "public"."project_materials" to "authenticated";

grant delete on table "public"."project_materials" to "service_role";

grant insert on table "public"."project_materials" to "service_role";

grant references on table "public"."project_materials" to "service_role";

grant select on table "public"."project_materials" to "service_role";

grant trigger on table "public"."project_materials" to "service_role";

grant truncate on table "public"."project_materials" to "service_role";

grant update on table "public"."project_materials" to "service_role";

grant delete on table "public"."project_production_stages" to "anon";

grant insert on table "public"."project_production_stages" to "anon";

grant references on table "public"."project_production_stages" to "anon";

grant select on table "public"."project_production_stages" to "anon";

grant trigger on table "public"."project_production_stages" to "anon";

grant truncate on table "public"."project_production_stages" to "anon";

grant update on table "public"."project_production_stages" to "anon";

grant delete on table "public"."project_production_stages" to "authenticated";

grant insert on table "public"."project_production_stages" to "authenticated";

grant references on table "public"."project_production_stages" to "authenticated";

grant select on table "public"."project_production_stages" to "authenticated";

grant trigger on table "public"."project_production_stages" to "authenticated";

grant truncate on table "public"."project_production_stages" to "authenticated";

grant update on table "public"."project_production_stages" to "authenticated";

grant delete on table "public"."project_production_stages" to "service_role";

grant insert on table "public"."project_production_stages" to "service_role";

grant references on table "public"."project_production_stages" to "service_role";

grant select on table "public"."project_production_stages" to "service_role";

grant trigger on table "public"."project_production_stages" to "service_role";

grant truncate on table "public"."project_production_stages" to "service_role";

grant update on table "public"."project_production_stages" to "service_role";

grant delete on table "public"."project_purchase_orders" to "anon";

grant insert on table "public"."project_purchase_orders" to "anon";

grant references on table "public"."project_purchase_orders" to "anon";

grant select on table "public"."project_purchase_orders" to "anon";

grant trigger on table "public"."project_purchase_orders" to "anon";

grant truncate on table "public"."project_purchase_orders" to "anon";

grant update on table "public"."project_purchase_orders" to "anon";

grant delete on table "public"."project_purchase_orders" to "authenticated";

grant insert on table "public"."project_purchase_orders" to "authenticated";

grant references on table "public"."project_purchase_orders" to "authenticated";

grant select on table "public"."project_purchase_orders" to "authenticated";

grant trigger on table "public"."project_purchase_orders" to "authenticated";

grant truncate on table "public"."project_purchase_orders" to "authenticated";

grant update on table "public"."project_purchase_orders" to "authenticated";

grant delete on table "public"."project_purchase_orders" to "service_role";

grant insert on table "public"."project_purchase_orders" to "service_role";

grant references on table "public"."project_purchase_orders" to "service_role";

grant select on table "public"."project_purchase_orders" to "service_role";

grant trigger on table "public"."project_purchase_orders" to "service_role";

grant truncate on table "public"."project_purchase_orders" to "service_role";

grant update on table "public"."project_purchase_orders" to "service_role";

grant delete on table "public"."project_qms_inspection_attempt_photos" to "anon";

grant insert on table "public"."project_qms_inspection_attempt_photos" to "anon";

grant references on table "public"."project_qms_inspection_attempt_photos" to "anon";

grant select on table "public"."project_qms_inspection_attempt_photos" to "anon";

grant trigger on table "public"."project_qms_inspection_attempt_photos" to "anon";

grant truncate on table "public"."project_qms_inspection_attempt_photos" to "anon";

grant update on table "public"."project_qms_inspection_attempt_photos" to "anon";

grant delete on table "public"."project_qms_inspection_attempt_photos" to "authenticated";

grant insert on table "public"."project_qms_inspection_attempt_photos" to "authenticated";

grant references on table "public"."project_qms_inspection_attempt_photos" to "authenticated";

grant select on table "public"."project_qms_inspection_attempt_photos" to "authenticated";

grant trigger on table "public"."project_qms_inspection_attempt_photos" to "authenticated";

grant truncate on table "public"."project_qms_inspection_attempt_photos" to "authenticated";

grant update on table "public"."project_qms_inspection_attempt_photos" to "authenticated";

grant delete on table "public"."project_qms_inspection_attempt_photos" to "service_role";

grant insert on table "public"."project_qms_inspection_attempt_photos" to "service_role";

grant references on table "public"."project_qms_inspection_attempt_photos" to "service_role";

grant select on table "public"."project_qms_inspection_attempt_photos" to "service_role";

grant trigger on table "public"."project_qms_inspection_attempt_photos" to "service_role";

grant truncate on table "public"."project_qms_inspection_attempt_photos" to "service_role";

grant update on table "public"."project_qms_inspection_attempt_photos" to "service_role";

grant delete on table "public"."project_qms_inspection_attempts" to "anon";

grant insert on table "public"."project_qms_inspection_attempts" to "anon";

grant references on table "public"."project_qms_inspection_attempts" to "anon";

grant select on table "public"."project_qms_inspection_attempts" to "anon";

grant trigger on table "public"."project_qms_inspection_attempts" to "anon";

grant truncate on table "public"."project_qms_inspection_attempts" to "anon";

grant update on table "public"."project_qms_inspection_attempts" to "anon";

grant delete on table "public"."project_qms_inspection_attempts" to "authenticated";

grant insert on table "public"."project_qms_inspection_attempts" to "authenticated";

grant references on table "public"."project_qms_inspection_attempts" to "authenticated";

grant select on table "public"."project_qms_inspection_attempts" to "authenticated";

grant trigger on table "public"."project_qms_inspection_attempts" to "authenticated";

grant truncate on table "public"."project_qms_inspection_attempts" to "authenticated";

grant update on table "public"."project_qms_inspection_attempts" to "authenticated";

grant delete on table "public"."project_qms_inspection_attempts" to "service_role";

grant insert on table "public"."project_qms_inspection_attempts" to "service_role";

grant references on table "public"."project_qms_inspection_attempts" to "service_role";

grant select on table "public"."project_qms_inspection_attempts" to "service_role";

grant trigger on table "public"."project_qms_inspection_attempts" to "service_role";

grant truncate on table "public"."project_qms_inspection_attempts" to "service_role";

grant update on table "public"."project_qms_inspection_attempts" to "service_role";

grant delete on table "public"."project_qms_inspection_characteristics" to "anon";

grant insert on table "public"."project_qms_inspection_characteristics" to "anon";

grant references on table "public"."project_qms_inspection_characteristics" to "anon";

grant select on table "public"."project_qms_inspection_characteristics" to "anon";

grant trigger on table "public"."project_qms_inspection_characteristics" to "anon";

grant truncate on table "public"."project_qms_inspection_characteristics" to "anon";

grant update on table "public"."project_qms_inspection_characteristics" to "anon";

grant delete on table "public"."project_qms_inspection_characteristics" to "authenticated";

grant insert on table "public"."project_qms_inspection_characteristics" to "authenticated";

grant references on table "public"."project_qms_inspection_characteristics" to "authenticated";

grant select on table "public"."project_qms_inspection_characteristics" to "authenticated";

grant trigger on table "public"."project_qms_inspection_characteristics" to "authenticated";

grant truncate on table "public"."project_qms_inspection_characteristics" to "authenticated";

grant update on table "public"."project_qms_inspection_characteristics" to "authenticated";

grant delete on table "public"."project_qms_inspection_characteristics" to "service_role";

grant insert on table "public"."project_qms_inspection_characteristics" to "service_role";

grant references on table "public"."project_qms_inspection_characteristics" to "service_role";

grant select on table "public"."project_qms_inspection_characteristics" to "service_role";

grant trigger on table "public"."project_qms_inspection_characteristics" to "service_role";

grant truncate on table "public"."project_qms_inspection_characteristics" to "service_role";

grant update on table "public"."project_qms_inspection_characteristics" to "service_role";

grant delete on table "public"."project_qms_inspection_overrides" to "anon";

grant insert on table "public"."project_qms_inspection_overrides" to "anon";

grant references on table "public"."project_qms_inspection_overrides" to "anon";

grant select on table "public"."project_qms_inspection_overrides" to "anon";

grant trigger on table "public"."project_qms_inspection_overrides" to "anon";

grant truncate on table "public"."project_qms_inspection_overrides" to "anon";

grant update on table "public"."project_qms_inspection_overrides" to "anon";

grant delete on table "public"."project_qms_inspection_overrides" to "authenticated";

grant insert on table "public"."project_qms_inspection_overrides" to "authenticated";

grant references on table "public"."project_qms_inspection_overrides" to "authenticated";

grant select on table "public"."project_qms_inspection_overrides" to "authenticated";

grant trigger on table "public"."project_qms_inspection_overrides" to "authenticated";

grant truncate on table "public"."project_qms_inspection_overrides" to "authenticated";

grant update on table "public"."project_qms_inspection_overrides" to "authenticated";

grant delete on table "public"."project_qms_inspection_overrides" to "service_role";

grant insert on table "public"."project_qms_inspection_overrides" to "service_role";

grant references on table "public"."project_qms_inspection_overrides" to "service_role";

grant select on table "public"."project_qms_inspection_overrides" to "service_role";

grant trigger on table "public"."project_qms_inspection_overrides" to "service_role";

grant truncate on table "public"."project_qms_inspection_overrides" to "service_role";

grant update on table "public"."project_qms_inspection_overrides" to "service_role";

grant delete on table "public"."project_qms_inspections" to "anon";

grant insert on table "public"."project_qms_inspections" to "anon";

grant references on table "public"."project_qms_inspections" to "anon";

grant select on table "public"."project_qms_inspections" to "anon";

grant trigger on table "public"."project_qms_inspections" to "anon";

grant truncate on table "public"."project_qms_inspections" to "anon";

grant update on table "public"."project_qms_inspections" to "anon";

grant delete on table "public"."project_qms_inspections" to "authenticated";

grant insert on table "public"."project_qms_inspections" to "authenticated";

grant references on table "public"."project_qms_inspections" to "authenticated";

grant select on table "public"."project_qms_inspections" to "authenticated";

grant trigger on table "public"."project_qms_inspections" to "authenticated";

grant truncate on table "public"."project_qms_inspections" to "authenticated";

grant update on table "public"."project_qms_inspections" to "authenticated";

grant delete on table "public"."project_qms_inspections" to "service_role";

grant insert on table "public"."project_qms_inspections" to "service_role";

grant references on table "public"."project_qms_inspections" to "service_role";

grant select on table "public"."project_qms_inspections" to "service_role";

grant trigger on table "public"."project_qms_inspections" to "service_role";

grant truncate on table "public"."project_qms_inspections" to "service_role";

grant update on table "public"."project_qms_inspections" to "service_role";

grant delete on table "public"."projects" to "anon";

grant insert on table "public"."projects" to "anon";

grant references on table "public"."projects" to "anon";

grant select on table "public"."projects" to "anon";

grant trigger on table "public"."projects" to "anon";

grant truncate on table "public"."projects" to "anon";

grant update on table "public"."projects" to "anon";

grant delete on table "public"."projects" to "authenticated";

grant insert on table "public"."projects" to "authenticated";

grant references on table "public"."projects" to "authenticated";

grant select on table "public"."projects" to "authenticated";

grant trigger on table "public"."projects" to "authenticated";

grant truncate on table "public"."projects" to "authenticated";

grant update on table "public"."projects" to "authenticated";

grant delete on table "public"."projects" to "service_role";

grant insert on table "public"."projects" to "service_role";

grant references on table "public"."projects" to "service_role";

grant select on table "public"."projects" to "service_role";

grant trigger on table "public"."projects" to "service_role";

grant truncate on table "public"."projects" to "service_role";

grant update on table "public"."projects" to "service_role";

grant delete on table "public"."qms_favorites" to "anon";

grant insert on table "public"."qms_favorites" to "anon";

grant references on table "public"."qms_favorites" to "anon";

grant select on table "public"."qms_favorites" to "anon";

grant trigger on table "public"."qms_favorites" to "anon";

grant truncate on table "public"."qms_favorites" to "anon";

grant update on table "public"."qms_favorites" to "anon";

grant delete on table "public"."qms_favorites" to "authenticated";

grant insert on table "public"."qms_favorites" to "authenticated";

grant references on table "public"."qms_favorites" to "authenticated";

grant select on table "public"."qms_favorites" to "authenticated";

grant trigger on table "public"."qms_favorites" to "authenticated";

grant truncate on table "public"."qms_favorites" to "authenticated";

grant update on table "public"."qms_favorites" to "authenticated";

grant delete on table "public"."qms_favorites" to "service_role";

grant insert on table "public"."qms_favorites" to "service_role";

grant references on table "public"."qms_favorites" to "service_role";

grant select on table "public"."qms_favorites" to "service_role";

grant trigger on table "public"."qms_favorites" to "service_role";

grant truncate on table "public"."qms_favorites" to "service_role";

grant update on table "public"."qms_favorites" to "service_role";

grant delete on table "public"."qms_stage_completions" to "anon";

grant insert on table "public"."qms_stage_completions" to "anon";

grant references on table "public"."qms_stage_completions" to "anon";

grant select on table "public"."qms_stage_completions" to "anon";

grant trigger on table "public"."qms_stage_completions" to "anon";

grant truncate on table "public"."qms_stage_completions" to "anon";

grant update on table "public"."qms_stage_completions" to "anon";

grant delete on table "public"."qms_stage_completions" to "authenticated";

grant insert on table "public"."qms_stage_completions" to "authenticated";

grant references on table "public"."qms_stage_completions" to "authenticated";

grant select on table "public"."qms_stage_completions" to "authenticated";

grant trigger on table "public"."qms_stage_completions" to "authenticated";

grant truncate on table "public"."qms_stage_completions" to "authenticated";

grant update on table "public"."qms_stage_completions" to "authenticated";

grant delete on table "public"."qms_stage_completions" to "service_role";

grant insert on table "public"."qms_stage_completions" to "service_role";

grant references on table "public"."qms_stage_completions" to "service_role";

grant select on table "public"."qms_stage_completions" to "service_role";

grant trigger on table "public"."qms_stage_completions" to "service_role";

grant truncate on table "public"."qms_stage_completions" to "service_role";

grant update on table "public"."qms_stage_completions" to "service_role";

grant delete on table "public"."qms_templates" to "anon";

grant insert on table "public"."qms_templates" to "anon";

grant references on table "public"."qms_templates" to "anon";

grant select on table "public"."qms_templates" to "anon";

grant trigger on table "public"."qms_templates" to "anon";

grant truncate on table "public"."qms_templates" to "anon";

grant update on table "public"."qms_templates" to "anon";

grant delete on table "public"."qms_templates" to "authenticated";

grant insert on table "public"."qms_templates" to "authenticated";

grant references on table "public"."qms_templates" to "authenticated";

grant select on table "public"."qms_templates" to "authenticated";

grant trigger on table "public"."qms_templates" to "authenticated";

grant truncate on table "public"."qms_templates" to "authenticated";

grant update on table "public"."qms_templates" to "authenticated";

grant delete on table "public"."qms_templates" to "service_role";

grant insert on table "public"."qms_templates" to "service_role";

grant references on table "public"."qms_templates" to "service_role";

grant select on table "public"."qms_templates" to "service_role";

grant trigger on table "public"."qms_templates" to "service_role";

grant truncate on table "public"."qms_templates" to "service_role";

grant update on table "public"."qms_templates" to "service_role";

grant delete on table "public"."quality_characteristics" to "anon";

grant insert on table "public"."quality_characteristics" to "anon";

grant references on table "public"."quality_characteristics" to "anon";

grant select on table "public"."quality_characteristics" to "anon";

grant trigger on table "public"."quality_characteristics" to "anon";

grant truncate on table "public"."quality_characteristics" to "anon";

grant update on table "public"."quality_characteristics" to "anon";

grant delete on table "public"."quality_characteristics" to "authenticated";

grant insert on table "public"."quality_characteristics" to "authenticated";

grant references on table "public"."quality_characteristics" to "authenticated";

grant select on table "public"."quality_characteristics" to "authenticated";

grant trigger on table "public"."quality_characteristics" to "authenticated";

grant truncate on table "public"."quality_characteristics" to "authenticated";

grant update on table "public"."quality_characteristics" to "authenticated";

grant delete on table "public"."quality_characteristics" to "service_role";

grant insert on table "public"."quality_characteristics" to "service_role";

grant references on table "public"."quality_characteristics" to "service_role";

grant select on table "public"."quality_characteristics" to "service_role";

grant trigger on table "public"."quality_characteristics" to "service_role";

grant truncate on table "public"."quality_characteristics" to "service_role";

grant update on table "public"."quality_characteristics" to "service_role";

grant delete on table "public"."quotation_purchase_orders" to "anon";

grant insert on table "public"."quotation_purchase_orders" to "anon";

grant references on table "public"."quotation_purchase_orders" to "anon";

grant select on table "public"."quotation_purchase_orders" to "anon";

grant trigger on table "public"."quotation_purchase_orders" to "anon";

grant truncate on table "public"."quotation_purchase_orders" to "anon";

grant update on table "public"."quotation_purchase_orders" to "anon";

grant delete on table "public"."quotation_purchase_orders" to "authenticated";

grant insert on table "public"."quotation_purchase_orders" to "authenticated";

grant references on table "public"."quotation_purchase_orders" to "authenticated";

grant select on table "public"."quotation_purchase_orders" to "authenticated";

grant trigger on table "public"."quotation_purchase_orders" to "authenticated";

grant truncate on table "public"."quotation_purchase_orders" to "authenticated";

grant update on table "public"."quotation_purchase_orders" to "authenticated";

grant delete on table "public"."quotation_purchase_orders" to "service_role";

grant insert on table "public"."quotation_purchase_orders" to "service_role";

grant references on table "public"."quotation_purchase_orders" to "service_role";

grant select on table "public"."quotation_purchase_orders" to "service_role";

grant trigger on table "public"."quotation_purchase_orders" to "service_role";

grant truncate on table "public"."quotation_purchase_orders" to "service_role";

grant update on table "public"."quotation_purchase_orders" to "service_role";

grant delete on table "public"."quotation_revisions" to "anon";

grant insert on table "public"."quotation_revisions" to "anon";

grant references on table "public"."quotation_revisions" to "anon";

grant select on table "public"."quotation_revisions" to "anon";

grant trigger on table "public"."quotation_revisions" to "anon";

grant truncate on table "public"."quotation_revisions" to "anon";

grant update on table "public"."quotation_revisions" to "anon";

grant delete on table "public"."quotation_revisions" to "authenticated";

grant insert on table "public"."quotation_revisions" to "authenticated";

grant references on table "public"."quotation_revisions" to "authenticated";

grant select on table "public"."quotation_revisions" to "authenticated";

grant trigger on table "public"."quotation_revisions" to "authenticated";

grant truncate on table "public"."quotation_revisions" to "authenticated";

grant update on table "public"."quotation_revisions" to "authenticated";

grant delete on table "public"."quotation_revisions" to "service_role";

grant insert on table "public"."quotation_revisions" to "service_role";

grant references on table "public"."quotation_revisions" to "service_role";

grant select on table "public"."quotation_revisions" to "service_role";

grant trigger on table "public"."quotation_revisions" to "service_role";

grant truncate on table "public"."quotation_revisions" to "service_role";

grant update on table "public"."quotation_revisions" to "service_role";

grant delete on table "public"."quotations" to "anon";

grant insert on table "public"."quotations" to "anon";

grant references on table "public"."quotations" to "anon";

grant select on table "public"."quotations" to "anon";

grant trigger on table "public"."quotations" to "anon";

grant truncate on table "public"."quotations" to "anon";

grant update on table "public"."quotations" to "anon";

grant delete on table "public"."quotations" to "authenticated";

grant insert on table "public"."quotations" to "authenticated";

grant references on table "public"."quotations" to "authenticated";

grant select on table "public"."quotations" to "authenticated";

grant trigger on table "public"."quotations" to "authenticated";

grant truncate on table "public"."quotations" to "authenticated";

grant update on table "public"."quotations" to "authenticated";

grant delete on table "public"."quotations" to "service_role";

grant insert on table "public"."quotations" to "service_role";

grant references on table "public"."quotations" to "service_role";

grant select on table "public"."quotations" to "service_role";

grant trigger on table "public"."quotations" to "service_role";

grant truncate on table "public"."quotations" to "service_role";

grant update on table "public"."quotations" to "service_role";

grant delete on table "public"."role_permissions" to "anon";

grant insert on table "public"."role_permissions" to "anon";

grant references on table "public"."role_permissions" to "anon";

grant select on table "public"."role_permissions" to "anon";

grant trigger on table "public"."role_permissions" to "anon";

grant truncate on table "public"."role_permissions" to "anon";

grant update on table "public"."role_permissions" to "anon";

grant delete on table "public"."role_permissions" to "authenticated";

grant insert on table "public"."role_permissions" to "authenticated";

grant references on table "public"."role_permissions" to "authenticated";

grant select on table "public"."role_permissions" to "authenticated";

grant trigger on table "public"."role_permissions" to "authenticated";

grant truncate on table "public"."role_permissions" to "authenticated";

grant update on table "public"."role_permissions" to "authenticated";

grant delete on table "public"."role_permissions" to "service_role";

grant insert on table "public"."role_permissions" to "service_role";

grant references on table "public"."role_permissions" to "service_role";

grant select on table "public"."role_permissions" to "service_role";

grant trigger on table "public"."role_permissions" to "service_role";

grant truncate on table "public"."role_permissions" to "service_role";

grant update on table "public"."role_permissions" to "service_role";

grant delete on table "public"."roles" to "anon";

grant insert on table "public"."roles" to "anon";

grant references on table "public"."roles" to "anon";

grant select on table "public"."roles" to "anon";

grant trigger on table "public"."roles" to "anon";

grant truncate on table "public"."roles" to "anon";

grant update on table "public"."roles" to "anon";

grant delete on table "public"."roles" to "authenticated";

grant insert on table "public"."roles" to "authenticated";

grant references on table "public"."roles" to "authenticated";

grant select on table "public"."roles" to "authenticated";

grant trigger on table "public"."roles" to "authenticated";

grant truncate on table "public"."roles" to "authenticated";

grant update on table "public"."roles" to "authenticated";

grant delete on table "public"."roles" to "service_role";

grant insert on table "public"."roles" to "service_role";

grant references on table "public"."roles" to "service_role";

grant select on table "public"."roles" to "service_role";

grant trigger on table "public"."roles" to "service_role";

grant truncate on table "public"."roles" to "service_role";

grant update on table "public"."roles" to "service_role";

grant delete on table "public"."salary_payments" to "anon";

grant insert on table "public"."salary_payments" to "anon";

grant references on table "public"."salary_payments" to "anon";

grant select on table "public"."salary_payments" to "anon";

grant trigger on table "public"."salary_payments" to "anon";

grant truncate on table "public"."salary_payments" to "anon";

grant update on table "public"."salary_payments" to "anon";

grant delete on table "public"."salary_payments" to "authenticated";

grant insert on table "public"."salary_payments" to "authenticated";

grant references on table "public"."salary_payments" to "authenticated";

grant select on table "public"."salary_payments" to "authenticated";

grant trigger on table "public"."salary_payments" to "authenticated";

grant truncate on table "public"."salary_payments" to "authenticated";

grant update on table "public"."salary_payments" to "authenticated";

grant delete on table "public"."salary_payments" to "service_role";

grant insert on table "public"."salary_payments" to "service_role";

grant references on table "public"."salary_payments" to "service_role";

grant select on table "public"."salary_payments" to "service_role";

grant trigger on table "public"."salary_payments" to "service_role";

grant truncate on table "public"."salary_payments" to "service_role";

grant update on table "public"."salary_payments" to "service_role";

grant delete on table "public"."schema_migrations" to "anon";

grant insert on table "public"."schema_migrations" to "anon";

grant references on table "public"."schema_migrations" to "anon";

grant select on table "public"."schema_migrations" to "anon";

grant trigger on table "public"."schema_migrations" to "anon";

grant truncate on table "public"."schema_migrations" to "anon";

grant update on table "public"."schema_migrations" to "anon";

grant delete on table "public"."schema_migrations" to "authenticated";

grant insert on table "public"."schema_migrations" to "authenticated";

grant references on table "public"."schema_migrations" to "authenticated";

grant select on table "public"."schema_migrations" to "authenticated";

grant trigger on table "public"."schema_migrations" to "authenticated";

grant truncate on table "public"."schema_migrations" to "authenticated";

grant update on table "public"."schema_migrations" to "authenticated";

grant delete on table "public"."schema_migrations" to "service_role";

grant insert on table "public"."schema_migrations" to "service_role";

grant references on table "public"."schema_migrations" to "service_role";

grant select on table "public"."schema_migrations" to "service_role";

grant trigger on table "public"."schema_migrations" to "service_role";

grant truncate on table "public"."schema_migrations" to "service_role";

grant update on table "public"."schema_migrations" to "service_role";

grant delete on table "public"."security_audit_log" to "anon";

grant insert on table "public"."security_audit_log" to "anon";

grant references on table "public"."security_audit_log" to "anon";

grant select on table "public"."security_audit_log" to "anon";

grant trigger on table "public"."security_audit_log" to "anon";

grant truncate on table "public"."security_audit_log" to "anon";

grant update on table "public"."security_audit_log" to "anon";

grant delete on table "public"."security_audit_log" to "authenticated";

grant insert on table "public"."security_audit_log" to "authenticated";

grant references on table "public"."security_audit_log" to "authenticated";

grant select on table "public"."security_audit_log" to "authenticated";

grant trigger on table "public"."security_audit_log" to "authenticated";

grant truncate on table "public"."security_audit_log" to "authenticated";

grant update on table "public"."security_audit_log" to "authenticated";

grant delete on table "public"."security_audit_log" to "service_role";

grant insert on table "public"."security_audit_log" to "service_role";

grant references on table "public"."security_audit_log" to "service_role";

grant select on table "public"."security_audit_log" to "service_role";

grant trigger on table "public"."security_audit_log" to "service_role";

grant truncate on table "public"."security_audit_log" to "service_role";

grant update on table "public"."security_audit_log" to "service_role";

grant delete on table "public"."user_editor_preferences" to "anon";

grant insert on table "public"."user_editor_preferences" to "anon";

grant references on table "public"."user_editor_preferences" to "anon";

grant select on table "public"."user_editor_preferences" to "anon";

grant trigger on table "public"."user_editor_preferences" to "anon";

grant truncate on table "public"."user_editor_preferences" to "anon";

grant update on table "public"."user_editor_preferences" to "anon";

grant delete on table "public"."user_editor_preferences" to "authenticated";

grant insert on table "public"."user_editor_preferences" to "authenticated";

grant references on table "public"."user_editor_preferences" to "authenticated";

grant select on table "public"."user_editor_preferences" to "authenticated";

grant trigger on table "public"."user_editor_preferences" to "authenticated";

grant truncate on table "public"."user_editor_preferences" to "authenticated";

grant update on table "public"."user_editor_preferences" to "authenticated";

grant delete on table "public"."user_editor_preferences" to "service_role";

grant insert on table "public"."user_editor_preferences" to "service_role";

grant references on table "public"."user_editor_preferences" to "service_role";

grant select on table "public"."user_editor_preferences" to "service_role";

grant trigger on table "public"."user_editor_preferences" to "service_role";

grant truncate on table "public"."user_editor_preferences" to "service_role";

grant update on table "public"."user_editor_preferences" to "service_role";

grant delete on table "public"."user_permission_overrides" to "anon";

grant insert on table "public"."user_permission_overrides" to "anon";

grant references on table "public"."user_permission_overrides" to "anon";

grant select on table "public"."user_permission_overrides" to "anon";

grant trigger on table "public"."user_permission_overrides" to "anon";

grant truncate on table "public"."user_permission_overrides" to "anon";

grant update on table "public"."user_permission_overrides" to "anon";

grant delete on table "public"."user_permission_overrides" to "authenticated";

grant insert on table "public"."user_permission_overrides" to "authenticated";

grant references on table "public"."user_permission_overrides" to "authenticated";

grant select on table "public"."user_permission_overrides" to "authenticated";

grant trigger on table "public"."user_permission_overrides" to "authenticated";

grant truncate on table "public"."user_permission_overrides" to "authenticated";

grant update on table "public"."user_permission_overrides" to "authenticated";

grant delete on table "public"."user_permission_overrides" to "service_role";

grant insert on table "public"."user_permission_overrides" to "service_role";

grant references on table "public"."user_permission_overrides" to "service_role";

grant select on table "public"."user_permission_overrides" to "service_role";

grant trigger on table "public"."user_permission_overrides" to "service_role";

grant truncate on table "public"."user_permission_overrides" to "service_role";

grant update on table "public"."user_permission_overrides" to "service_role";

grant delete on table "public"."user_roles" to "anon";

grant insert on table "public"."user_roles" to "anon";

grant references on table "public"."user_roles" to "anon";

grant select on table "public"."user_roles" to "anon";

grant trigger on table "public"."user_roles" to "anon";

grant truncate on table "public"."user_roles" to "anon";

grant update on table "public"."user_roles" to "anon";

grant delete on table "public"."user_roles" to "authenticated";

grant insert on table "public"."user_roles" to "authenticated";

grant references on table "public"."user_roles" to "authenticated";

grant select on table "public"."user_roles" to "authenticated";

grant trigger on table "public"."user_roles" to "authenticated";

grant truncate on table "public"."user_roles" to "authenticated";

grant update on table "public"."user_roles" to "authenticated";

grant delete on table "public"."user_roles" to "service_role";

grant insert on table "public"."user_roles" to "service_role";

grant references on table "public"."user_roles" to "service_role";

grant select on table "public"."user_roles" to "service_role";

grant trigger on table "public"."user_roles" to "service_role";

grant truncate on table "public"."user_roles" to "service_role";

grant update on table "public"."user_roles" to "service_role";

grant delete on table "public"."vendors" to "anon";

grant insert on table "public"."vendors" to "anon";

grant references on table "public"."vendors" to "anon";

grant select on table "public"."vendors" to "anon";

grant trigger on table "public"."vendors" to "anon";

grant truncate on table "public"."vendors" to "anon";

grant update on table "public"."vendors" to "anon";

grant delete on table "public"."vendors" to "authenticated";

grant insert on table "public"."vendors" to "authenticated";

grant references on table "public"."vendors" to "authenticated";

grant select on table "public"."vendors" to "authenticated";

grant trigger on table "public"."vendors" to "authenticated";

grant truncate on table "public"."vendors" to "authenticated";

grant update on table "public"."vendors" to "authenticated";

grant delete on table "public"."vendors" to "service_role";

grant insert on table "public"."vendors" to "service_role";

grant references on table "public"."vendors" to "service_role";

grant select on table "public"."vendors" to "service_role";

grant trigger on table "public"."vendors" to "service_role";

grant truncate on table "public"."vendors" to "service_role";

grant update on table "public"."vendors" to "service_role";


  create policy "advance_records_delete"
  on "public"."advance_records"
  as permissive
  for delete
  to public
using ((public.has_permission('employees'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "advance_records_insert"
  on "public"."advance_records"
  as permissive
  for insert
  to public
with check ((public.has_permission('employees'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "advance_records_select"
  on "public"."advance_records"
  as permissive
  for select
  to public
using ((public.has_permission('employees'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "advance_records_update"
  on "public"."advance_records"
  as permissive
  for update
  to public
using ((public.has_permission('employees'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "attendance_records_delete"
  on "public"."attendance_records"
  as permissive
  for delete
  to public
using ((public.has_permission('employees'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "attendance_records_insert"
  on "public"."attendance_records"
  as permissive
  for insert
  to public
with check ((public.has_permission('employees'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "attendance_records_select"
  on "public"."attendance_records"
  as permissive
  for select
  to public
using ((public.has_permission('employees'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "attendance_records_update"
  on "public"."attendance_records"
  as permissive
  for update
  to public
using ((public.has_permission('employees'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "bom_requisitions_approve"
  on "public"."bom_requisitions"
  as permissive
  for update
  to public
using ((public.has_permission('material_requisitions'::text, 'approve'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('material_requisitions'::text, 'approve'::text) AND (organization_id = public.current_organization_id())));



  create policy "bom_requisitions_select"
  on "public"."bom_requisitions"
  as permissive
  for select
  to public
using ((public.has_permission('material_requisitions'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "company_pos_delete"
  on "public"."company_pos"
  as permissive
  for delete
  to public
using ((public.has_permission('company_po'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "company_pos_insert"
  on "public"."company_pos"
  as permissive
  for insert
  to public
with check ((public.has_permission('company_po'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "company_pos_select"
  on "public"."company_pos"
  as permissive
  for select
  to public
using ((public.has_permission('company_po'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "company_pos_update"
  on "public"."company_pos"
  as permissive
  for update
  to public
using ((public.has_permission('company_po'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "customers_delete"
  on "public"."customers"
  as permissive
  for delete
  to public
using ((public.has_permission('customers'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "customers_insert"
  on "public"."customers"
  as permissive
  for insert
  to public
with check ((public.has_permission('customers'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "customers_select"
  on "public"."customers"
  as permissive
  for select
  to public
using ((public.has_permission('customers'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "customers_update"
  on "public"."customers"
  as permissive
  for update
  to public
using ((public.has_permission('customers'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "delivery_challans_delete"
  on "public"."delivery_challans"
  as permissive
  for delete
  to public
using ((public.has_permission('delivery_challans'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "delivery_challans_insert"
  on "public"."delivery_challans"
  as permissive
  for insert
  to public
with check ((public.has_permission('delivery_challans'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "delivery_challans_select"
  on "public"."delivery_challans"
  as permissive
  for select
  to public
using ((public.has_permission('delivery_challans'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "delivery_challans_update"
  on "public"."delivery_challans"
  as permissive
  for update
  to public
using ((public.has_permission('delivery_challans'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawing_links_delete"
  on "public"."drawing_links"
  as permissive
  for delete
  to public
using ((public.has_permission('drawing_editor'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawing_links_insert"
  on "public"."drawing_links"
  as permissive
  for insert
  to public
with check ((public.has_permission('drawing_editor'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawing_links_select"
  on "public"."drawing_links"
  as permissive
  for select
  to public
using ((public.has_permission('drawing_editor'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawing_views_delete"
  on "public"."drawing_views"
  as permissive
  for delete
  to public
using ((public.has_permission('drawing_editor'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawing_views_insert"
  on "public"."drawing_views"
  as permissive
  for insert
  to public
with check ((public.has_permission('drawing_editor'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawing_views_select"
  on "public"."drawing_views"
  as permissive
  for select
  to public
using ((public.has_permission('drawing_editor'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawing_views_update"
  on "public"."drawing_views"
  as permissive
  for update
  to public
using ((public.has_permission('drawing_editor'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('drawing_editor'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawings_delete"
  on "public"."drawings"
  as permissive
  for delete
  to public
using ((public.has_permission('drawing_editor'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawings_insert"
  on "public"."drawings"
  as permissive
  for insert
  to public
with check ((public.has_permission('drawing_editor'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawings_select"
  on "public"."drawings"
  as permissive
  for select
  to public
using ((public.has_permission('drawing_editor'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "drawings_update"
  on "public"."drawings"
  as permissive
  for update
  to public
using ((public.has_permission('drawing_editor'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('drawing_editor'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "employee_documents_delete"
  on "public"."employee_documents"
  as permissive
  for delete
  to public
using ((public.has_permission('employees'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "employee_documents_insert"
  on "public"."employee_documents"
  as permissive
  for insert
  to public
with check (((public.has_permission('employees'::text, 'upload'::text) OR public.has_permission('employees'::text, 'edit'::text)) AND (organization_id = public.current_organization_id())));



  create policy "employee_documents_select"
  on "public"."employee_documents"
  as permissive
  for select
  to public
using ((public.has_permission('employees'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "employee_documents_update"
  on "public"."employee_documents"
  as permissive
  for update
  to public
using ((public.has_permission('employees'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "employees_delete"
  on "public"."employees"
  as permissive
  for delete
  to public
using ((public.has_permission('employees'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "employees_insert"
  on "public"."employees"
  as permissive
  for insert
  to public
with check ((public.has_permission('employees'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "employees_select"
  on "public"."employees"
  as permissive
  for select
  to public
using ((public.has_permission('employees'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "employees_update"
  on "public"."employees"
  as permissive
  for update
  to public
using ((public.has_permission('employees'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "expense_floats_delete"
  on "public"."expense_floats"
  as permissive
  for delete
  to public
using ((public.has_permission('expense_float'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "expense_floats_insert"
  on "public"."expense_floats"
  as permissive
  for insert
  to public
with check ((public.has_permission('expense_float'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "expense_floats_select"
  on "public"."expense_floats"
  as permissive
  for select
  to public
using ((public.has_permission('expense_float'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "expense_floats_update"
  on "public"."expense_floats"
  as permissive
  for update
  to public
using (((public.has_permission('expense_float'::text, 'edit'::text) OR public.has_permission('expense_float'::text, 'settle'::text)) AND (organization_id = public.current_organization_id())))
with check (((public.has_permission('expense_float'::text, 'edit'::text) OR public.has_permission('expense_float'::text, 'settle'::text)) AND (organization_id = public.current_organization_id())));



  create policy "inspection_methods_delete"
  on "public"."inspection_methods"
  as permissive
  for delete
  to public
using ((public.has_permission('quality_characteristics'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "inspection_methods_insert"
  on "public"."inspection_methods"
  as permissive
  for insert
  to public
with check ((public.has_permission('quality_characteristics'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "inspection_methods_select"
  on "public"."inspection_methods"
  as permissive
  for select
  to public
using ((public.has_permission('quality_characteristics'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "inspection_methods_update"
  on "public"."inspection_methods"
  as permissive
  for update
  to public
using ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "inspection_stage_definitions_delete"
  on "public"."inspection_stage_definitions"
  as permissive
  for delete
  to public
using ((public.has_permission('quality_characteristics'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "inspection_stage_definitions_insert"
  on "public"."inspection_stage_definitions"
  as permissive
  for insert
  to public
with check ((public.has_permission('quality_characteristics'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "inspection_stage_definitions_select"
  on "public"."inspection_stage_definitions"
  as permissive
  for select
  to public
using ((public.has_permission('quality_characteristics'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "inspection_stage_definitions_update"
  on "public"."inspection_stage_definitions"
  as permissive
  for update
  to public
using ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_items_delete"
  on "public"."inventory_items"
  as permissive
  for delete
  to public
using ((public.has_permission('inventory'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_items_insert"
  on "public"."inventory_items"
  as permissive
  for insert
  to public
with check ((public.has_permission('inventory'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_items_select"
  on "public"."inventory_items"
  as permissive
  for select
  to public
using ((public.has_permission('inventory'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_items_update"
  on "public"."inventory_items"
  as permissive
  for update
  to public
using ((public.has_permission('inventory'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_purchases_delete"
  on "public"."inventory_purchases"
  as permissive
  for delete
  to public
using ((public.has_permission('inventory'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_purchases_insert"
  on "public"."inventory_purchases"
  as permissive
  for insert
  to public
with check ((public.has_permission('inventory'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_purchases_select"
  on "public"."inventory_purchases"
  as permissive
  for select
  to public
using ((public.has_permission('inventory'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_purchases_update"
  on "public"."inventory_purchases"
  as permissive
  for update
  to public
using ((public.has_permission('inventory'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_usages_delete"
  on "public"."inventory_usages"
  as permissive
  for delete
  to public
using ((public.has_permission('inventory'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_usages_insert"
  on "public"."inventory_usages"
  as permissive
  for insert
  to public
with check ((public.has_permission('inventory'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_usages_select"
  on "public"."inventory_usages"
  as permissive
  for select
  to public
using ((public.has_permission('inventory'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "inventory_usages_update"
  on "public"."inventory_usages"
  as permissive
  for update
  to public
using ((public.has_permission('inventory'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "invoice_items_delete"
  on "public"."invoice_items"
  as permissive
  for delete
  to public
using ((public.has_permission('invoices'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "invoice_items_insert"
  on "public"."invoice_items"
  as permissive
  for insert
  to public
with check (((public.has_permission('invoices'::text, 'create'::text) OR public.has_permission('invoices'::text, 'edit'::text)) AND (organization_id = public.current_organization_id())));



  create policy "invoice_items_select"
  on "public"."invoice_items"
  as permissive
  for select
  to public
using ((public.has_permission('invoices'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "invoice_items_update"
  on "public"."invoice_items"
  as permissive
  for update
  to public
using ((public.has_permission('invoices'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "invoices_delete"
  on "public"."invoices"
  as permissive
  for delete
  to public
using ((public.has_permission('invoices'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "invoices_insert"
  on "public"."invoices"
  as permissive
  for insert
  to public
with check ((public.has_permission('invoices'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "invoices_select"
  on "public"."invoices"
  as permissive
  for select
  to public
using ((public.has_permission('invoices'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "invoices_update"
  on "public"."invoices"
  as permissive
  for update
  to public
using ((public.has_permission('invoices'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "logs_select"
  on "public"."logs"
  as permissive
  for select
  to public
using ((public.has_permission('projects'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "manufacturing_processes_delete"
  on "public"."manufacturing_processes"
  as permissive
  for delete
  to public
using ((public.has_permission('quality_characteristics'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "manufacturing_processes_insert"
  on "public"."manufacturing_processes"
  as permissive
  for insert
  to public
with check ((public.has_permission('quality_characteristics'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "manufacturing_processes_select"
  on "public"."manufacturing_processes"
  as permissive
  for select
  to public
using ((public.has_permission('quality_characteristics'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "manufacturing_processes_update"
  on "public"."manufacturing_processes"
  as permissive
  for update
  to public
using ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "master_pos_delete"
  on "public"."master_pos"
  as permissive
  for delete
  to public
using ((public.has_permission('purchase_orders'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "master_pos_insert"
  on "public"."master_pos"
  as permissive
  for insert
  to public
with check ((public.has_permission('quotations'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "master_pos_select"
  on "public"."master_pos"
  as permissive
  for select
  to public
using ((public.has_permission('purchase_orders'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "master_pos_update"
  on "public"."master_pos"
  as permissive
  for update
  to public
using ((public.has_permission('purchase_orders'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "material_requisitions_delete"
  on "public"."material_requisitions"
  as permissive
  for delete
  to public
using ((public.has_permission('material_requisitions'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "material_requisitions_insert"
  on "public"."material_requisitions"
  as permissive
  for insert
  to public
with check ((public.has_permission('material_requisitions'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "material_requisitions_select"
  on "public"."material_requisitions"
  as permissive
  for select
  to public
using ((public.has_permission('material_requisitions'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "material_requisitions_update"
  on "public"."material_requisitions"
  as permissive
  for update
  to public
using (((public.has_permission('material_requisitions'::text, 'edit'::text) OR public.has_permission('material_requisitions'::text, 'approve'::text)) AND (organization_id = public.current_organization_id())));



  create policy "operations_delete"
  on "public"."operations"
  as permissive
  for delete
  to public
using ((public.has_permission('quality_characteristics'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "operations_insert"
  on "public"."operations"
  as permissive
  for insert
  to public
with check ((public.has_permission('quality_characteristics'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "operations_select"
  on "public"."operations"
  as permissive
  for select
  to public
using ((public.has_permission('quality_characteristics'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "operations_update"
  on "public"."operations"
  as permissive
  for update
  to public
using ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "organizations_select"
  on "public"."organizations"
  as permissive
  for select
  to public
using ((id = public.current_organization_id()));



  create policy "outsourced_works_delete"
  on "public"."outsourced_works"
  as permissive
  for delete
  to public
using ((public.has_permission('projects'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "outsourced_works_insert"
  on "public"."outsourced_works"
  as permissive
  for insert
  to public
with check ((public.has_permission('projects'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "outsourced_works_select"
  on "public"."outsourced_works"
  as permissive
  for select
  to public
using ((public.has_permission('projects'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "outsourced_works_update"
  on "public"."outsourced_works"
  as permissive
  for update
  to public
using ((public.has_permission('projects'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('projects'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "payments_delete"
  on "public"."payments"
  as permissive
  for delete
  to public
using ((public.has_permission('payments'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "payments_insert"
  on "public"."payments"
  as permissive
  for insert
  to public
with check ((public.has_permission('payments'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "payments_select"
  on "public"."payments"
  as permissive
  for select
  to public
using ((public.has_permission('payments'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "payments_update"
  on "public"."payments"
  as permissive
  for update
  to public
using ((public.has_permission('payments'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "permissions_select"
  on "public"."permissions"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "permissions_write"
  on "public"."permissions"
  as permissive
  for all
  to public
using (public.has_permission('users'::text, 'edit'::text))
with check (public.has_permission('users'::text, 'edit'::text));



  create policy "petty_expenses_delete"
  on "public"."petty_expenses"
  as permissive
  for delete
  to public
using ((public.has_permission('petty_expenses'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "petty_expenses_insert"
  on "public"."petty_expenses"
  as permissive
  for insert
  to public
with check (((public.has_permission('petty_expenses'::text, 'create'::text) OR public.has_permission('expense_float'::text, 'settle'::text)) AND (organization_id = public.current_organization_id())));



  create policy "petty_expenses_select"
  on "public"."petty_expenses"
  as permissive
  for select
  to public
using ((public.has_permission('petty_expenses'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "petty_expenses_update"
  on "public"."petty_expenses"
  as permissive
  for update
  to public
using (((public.has_permission('petty_expenses'::text, 'edit'::text) OR public.has_permission('employees'::text, 'edit'::text)) AND (organization_id = public.current_organization_id())))
with check (((public.has_permission('petty_expenses'::text, 'edit'::text) OR public.has_permission('employees'::text, 'edit'::text)) AND (organization_id = public.current_organization_id())));



  create policy "production_stage_transactions_delete"
  on "public"."production_stage_transactions"
  as permissive
  for delete
  to public
using (((public.has_permission('production'::text, 'delete'::text) OR public.has_permission('projects'::text, 'delete'::text)) AND (organization_id = public.current_organization_id())));



  create policy "production_stage_transactions_insert"
  on "public"."production_stage_transactions"
  as permissive
  for insert
  to public
with check (((public.has_permission('production'::text, 'edit'::text) OR public.has_permission('projects'::text, 'edit'::text)) AND (organization_id = public.current_organization_id())));



  create policy "production_stage_transactions_select"
  on "public"."production_stage_transactions"
  as permissive
  for select
  to public
using (((public.has_permission('production'::text, 'view'::text) OR public.has_permission('projects'::text, 'view'::text)) AND (organization_id = public.current_organization_id())));



  create policy "production_stages_delete"
  on "public"."production_stages"
  as permissive
  for delete
  to public
using ((public.has_permission('production'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "production_stages_insert"
  on "public"."production_stages"
  as permissive
  for insert
  to public
with check ((public.has_permission('production'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "production_stages_select"
  on "public"."production_stages"
  as permissive
  for select
  to public
using ((public.has_permission('production'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "production_stages_update"
  on "public"."production_stages"
  as permissive
  for update
  to public
using ((public.has_permission('production'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "profiles_select"
  on "public"."profiles"
  as permissive
  for select
  to public
using (((id = auth.uid()) OR (public.has_permission('users'::text, 'view'::text) AND (organization_id = public.current_organization_id()))));



  create policy "profiles_write"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((public.has_permission('users'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('users'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_bom_items_delete"
  on "public"."project_bom_items"
  as permissive
  for delete
  to public
using ((public.has_permission('material_requisitions'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_bom_items_insert"
  on "public"."project_bom_items"
  as permissive
  for insert
  to public
with check ((public.has_permission('material_requisitions'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_bom_items_select"
  on "public"."project_bom_items"
  as permissive
  for select
  to public
using ((public.has_permission('material_requisitions'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_bom_items_update"
  on "public"."project_bom_items"
  as permissive
  for update
  to public
using ((public.has_permission('material_requisitions'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('material_requisitions'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_employees_delete"
  on "public"."project_employees"
  as permissive
  for delete
  to public
using ((public.has_permission('projects'::text, 'edit'::text) AND public.has_permission('employees'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_employees_insert"
  on "public"."project_employees"
  as permissive
  for insert
  to public
with check ((public.has_permission('projects'::text, 'edit'::text) AND public.has_permission('employees'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_employees_select"
  on "public"."project_employees"
  as permissive
  for select
  to public
using ((public.has_permission('projects'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_employees_update"
  on "public"."project_employees"
  as permissive
  for update
  to public
using ((public.has_permission('projects'::text, 'edit'::text) AND public.has_permission('employees'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_materials_delete"
  on "public"."project_materials"
  as permissive
  for delete
  to public
using ((public.has_permission('inventory'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_materials_insert"
  on "public"."project_materials"
  as permissive
  for insert
  to public
with check ((public.has_permission('inventory'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_materials_select"
  on "public"."project_materials"
  as permissive
  for select
  to public
using ((public.has_permission('inventory'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_materials_update"
  on "public"."project_materials"
  as permissive
  for update
  to public
using ((public.has_permission('inventory'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_production_stages_delete"
  on "public"."project_production_stages"
  as permissive
  for delete
  to public
using (((public.has_permission('production'::text, 'delete'::text) OR public.has_permission('projects'::text, 'delete'::text)) AND (organization_id = public.current_organization_id())));



  create policy "project_production_stages_insert"
  on "public"."project_production_stages"
  as permissive
  for insert
  to public
with check (((public.has_permission('production'::text, 'edit'::text) OR public.has_permission('projects'::text, 'edit'::text) OR public.has_permission('production'::text, 'create'::text) OR public.has_permission('projects'::text, 'create'::text)) AND (organization_id = public.current_organization_id())));



  create policy "project_production_stages_select"
  on "public"."project_production_stages"
  as permissive
  for select
  to public
using (((public.has_permission('production'::text, 'view'::text) OR public.has_permission('projects'::text, 'view'::text)) AND (organization_id = public.current_organization_id())));



  create policy "project_production_stages_update"
  on "public"."project_production_stages"
  as permissive
  for update
  to public
using (((public.has_permission('production'::text, 'edit'::text) OR public.has_permission('projects'::text, 'edit'::text)) AND (organization_id = public.current_organization_id())))
with check (((public.has_permission('production'::text, 'edit'::text) OR public.has_permission('projects'::text, 'edit'::text)) AND (organization_id = public.current_organization_id())));



  create policy "project_purchase_orders_delete"
  on "public"."project_purchase_orders"
  as permissive
  for delete
  to public
using ((public.has_permission('projects'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_purchase_orders_insert"
  on "public"."project_purchase_orders"
  as permissive
  for insert
  to public
with check (((public.has_permission('quotations'::text, 'edit'::text) OR public.has_permission('projects'::text, 'edit'::text)) AND (organization_id = public.current_organization_id())));



  create policy "project_purchase_orders_select"
  on "public"."project_purchase_orders"
  as permissive
  for select
  to public
using (((public.has_permission('projects'::text, 'view'::text) OR public.has_permission('purchase_orders'::text, 'view'::text)) AND (organization_id = public.current_organization_id())));



  create policy "project_purchase_orders_update"
  on "public"."project_purchase_orders"
  as permissive
  for update
  to public
using ((public.has_permission('projects'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspection_attempt_photos_insert"
  on "public"."project_qms_inspection_attempt_photos"
  as permissive
  for insert
  to public
with check ((public.has_permission('inspection_sheets'::text, 'complete'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspection_attempt_photos_select"
  on "public"."project_qms_inspection_attempt_photos"
  as permissive
  for select
  to public
using ((public.has_permission('inspection_sheets'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspection_attempts_insert"
  on "public"."project_qms_inspection_attempts"
  as permissive
  for insert
  to public
with check ((public.has_permission('inspection_sheets'::text, 'complete'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspection_attempts_select"
  on "public"."project_qms_inspection_attempts"
  as permissive
  for select
  to public
using ((public.has_permission('inspection_sheets'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspection_characteristics_insert"
  on "public"."project_qms_inspection_characteristics"
  as permissive
  for insert
  to public
with check ((public.has_permission('inspection_sheets'::text, 'generate'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspection_characteristics_select"
  on "public"."project_qms_inspection_characteristics"
  as permissive
  for select
  to public
using ((public.has_permission('inspection_sheets'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspection_overrides_insert"
  on "public"."project_qms_inspection_overrides"
  as permissive
  for insert
  to public
with check ((public.has_permission('inspection_sheets'::text, 'override'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspection_overrides_select"
  on "public"."project_qms_inspection_overrides"
  as permissive
  for select
  to public
using ((public.has_permission('inspection_sheets'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspections_insert"
  on "public"."project_qms_inspections"
  as permissive
  for insert
  to public
with check ((public.has_permission('inspection_sheets'::text, 'generate'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspections_select"
  on "public"."project_qms_inspections"
  as permissive
  for select
  to public
using ((public.has_permission('inspection_sheets'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "project_qms_inspections_update"
  on "public"."project_qms_inspections"
  as permissive
  for update
  to public
using ((public.has_permission('inspection_sheets'::text, 'complete'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('inspection_sheets'::text, 'complete'::text) AND (organization_id = public.current_organization_id())));



  create policy "projects_delete"
  on "public"."projects"
  as permissive
  for delete
  to public
using ((public.has_permission('projects'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "projects_insert"
  on "public"."projects"
  as permissive
  for insert
  to public
with check ((public.has_permission('projects'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "projects_select"
  on "public"."projects"
  as permissive
  for select
  to public
using ((public.has_permission('projects'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "projects_update"
  on "public"."projects"
  as permissive
  for update
  to public
using ((public.has_permission('projects'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "qms_favorites_delete"
  on "public"."qms_favorites"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "qms_favorites_insert"
  on "public"."qms_favorites"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (organization_id = public.current_organization_id()) AND public.has_permission('quality_characteristics'::text, 'view'::text)));



  create policy "qms_favorites_select"
  on "public"."qms_favorites"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "qms_stage_completions_insert"
  on "public"."qms_stage_completions"
  as permissive
  for insert
  to public
with check ((public.has_permission('inspection_sheets'::text, 'complete'::text) AND (organization_id = public.current_organization_id())));



  create policy "qms_stage_completions_select"
  on "public"."qms_stage_completions"
  as permissive
  for select
  to public
using ((public.has_permission('inspection_sheets'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "qms_stage_completions_update"
  on "public"."qms_stage_completions"
  as permissive
  for update
  to public
using ((public.has_permission('inspection_sheets'::text, 'complete'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('inspection_sheets'::text, 'complete'::text) AND (organization_id = public.current_organization_id())));



  create policy "qms_templates_delete"
  on "public"."qms_templates"
  as permissive
  for delete
  to public
using ((public.has_permission('quality_characteristics'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "qms_templates_insert"
  on "public"."qms_templates"
  as permissive
  for insert
  to public
with check ((public.has_permission('quality_characteristics'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "qms_templates_select"
  on "public"."qms_templates"
  as permissive
  for select
  to public
using ((public.has_permission('quality_characteristics'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "qms_templates_update"
  on "public"."qms_templates"
  as permissive
  for update
  to public
using ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "quality_characteristics_delete"
  on "public"."quality_characteristics"
  as permissive
  for delete
  to public
using ((public.has_permission('quality_characteristics'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "quality_characteristics_insert"
  on "public"."quality_characteristics"
  as permissive
  for insert
  to public
with check ((public.has_permission('quality_characteristics'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "quality_characteristics_select"
  on "public"."quality_characteristics"
  as permissive
  for select
  to public
using ((public.has_permission('quality_characteristics'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "quality_characteristics_update"
  on "public"."quality_characteristics"
  as permissive
  for update
  to public
using ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())))
with check ((public.has_permission('quality_characteristics'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotation_purchase_orders_delete"
  on "public"."quotation_purchase_orders"
  as permissive
  for delete
  to public
using ((public.has_permission('quotations'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotation_purchase_orders_insert"
  on "public"."quotation_purchase_orders"
  as permissive
  for insert
  to public
with check ((public.has_permission('quotations'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotation_purchase_orders_select"
  on "public"."quotation_purchase_orders"
  as permissive
  for select
  to public
using ((public.has_permission('quotations'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotation_purchase_orders_update"
  on "public"."quotation_purchase_orders"
  as permissive
  for update
  to public
using ((public.has_permission('quotations'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotation_revisions_delete"
  on "public"."quotation_revisions"
  as permissive
  for delete
  to public
using ((public.has_permission('quotations'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotation_revisions_insert"
  on "public"."quotation_revisions"
  as permissive
  for insert
  to public
with check ((public.has_permission('quotations'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotation_revisions_select"
  on "public"."quotation_revisions"
  as permissive
  for select
  to public
using ((public.has_permission('quotations'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotation_revisions_update"
  on "public"."quotation_revisions"
  as permissive
  for update
  to public
using ((public.has_permission('quotations'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotations_delete"
  on "public"."quotations"
  as permissive
  for delete
  to public
using ((public.has_permission('quotations'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotations_insert"
  on "public"."quotations"
  as permissive
  for insert
  to public
with check ((public.has_permission('quotations'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotations_select"
  on "public"."quotations"
  as permissive
  for select
  to public
using ((public.has_permission('quotations'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "quotations_update"
  on "public"."quotations"
  as permissive
  for update
  to public
using ((public.has_permission('quotations'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "role_permissions_select"
  on "public"."role_permissions"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "role_permissions_write"
  on "public"."role_permissions"
  as permissive
  for all
  to public
using (public.has_permission('users'::text, 'edit'::text))
with check (public.has_permission('users'::text, 'edit'::text));



  create policy "roles_select"
  on "public"."roles"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "roles_write"
  on "public"."roles"
  as permissive
  for all
  to public
using (public.has_permission('users'::text, 'edit'::text))
with check (public.has_permission('users'::text, 'edit'::text));



  create policy "salary_payments_delete"
  on "public"."salary_payments"
  as permissive
  for delete
  to public
using ((public.has_permission('employees'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "salary_payments_insert"
  on "public"."salary_payments"
  as permissive
  for insert
  to public
with check ((public.has_permission('employees'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "salary_payments_select"
  on "public"."salary_payments"
  as permissive
  for select
  to public
using ((public.has_permission('employees'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "salary_payments_update"
  on "public"."salary_payments"
  as permissive
  for update
  to public
using ((public.has_permission('employees'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));



  create policy "security_audit_log_select"
  on "public"."security_audit_log"
  as permissive
  for select
  to public
using ((public.has_permission('audit_log'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "user_editor_preferences_insert"
  on "public"."user_editor_preferences"
  as permissive
  for insert
  to public
with check (((id = auth.uid()) AND (organization_id = public.current_organization_id())));



  create policy "user_editor_preferences_select"
  on "public"."user_editor_preferences"
  as permissive
  for select
  to public
using ((id = auth.uid()));



  create policy "user_editor_preferences_update"
  on "public"."user_editor_preferences"
  as permissive
  for update
  to public
using ((id = auth.uid()))
with check (((id = auth.uid()) AND (organization_id = public.current_organization_id())));



  create policy "user_permission_overrides_select"
  on "public"."user_permission_overrides"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR public.has_permission('users'::text, 'view'::text)));



  create policy "user_permission_overrides_write"
  on "public"."user_permission_overrides"
  as permissive
  for all
  to public
using (public.has_permission('users'::text, 'edit'::text))
with check (public.has_permission('users'::text, 'edit'::text));



  create policy "user_roles_select"
  on "public"."user_roles"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR public.has_permission('users'::text, 'view'::text)));



  create policy "user_roles_write"
  on "public"."user_roles"
  as permissive
  for all
  to public
using (public.has_permission('users'::text, 'assign_roles'::text))
with check (public.has_permission('users'::text, 'assign_roles'::text));



  create policy "vendors_delete"
  on "public"."vendors"
  as permissive
  for delete
  to public
using ((public.has_permission('vendors'::text, 'delete'::text) AND (organization_id = public.current_organization_id())));



  create policy "vendors_insert"
  on "public"."vendors"
  as permissive
  for insert
  to public
with check ((public.has_permission('vendors'::text, 'create'::text) AND (organization_id = public.current_organization_id())));



  create policy "vendors_select"
  on "public"."vendors"
  as permissive
  for select
  to public
using ((public.has_permission('vendors'::text, 'view'::text) AND (organization_id = public.current_organization_id())));



  create policy "vendors_update"
  on "public"."vendors"
  as permissive
  for update
  to public
using ((public.has_permission('vendors'::text, 'edit'::text) AND (organization_id = public.current_organization_id())));


CREATE TRIGGER trg_advance_records_updated_at BEFORE UPDATE ON public.advance_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_attendance_records_updated_at BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_company_pos_updated_at BEFORE UPDATE ON public.company_pos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_customers_sync_email BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.sync_customer_email();

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_delivery_challans_updated_at BEFORE UPDATE ON public.delivery_challans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_document_counters_updated_at BEFORE UPDATE ON public.document_counters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_drawing_views_updated_at BEFORE UPDATE ON public.drawing_views FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_drawings_updated_at BEFORE UPDATE ON public.drawings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_employee_documents_updated_at BEFORE UPDATE ON public.employee_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_prevent_employee_code_change BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.prevent_employee_code_change();

CREATE TRIGGER trg_expense_floats_before_insert BEFORE INSERT ON public.expense_floats FOR EACH ROW EXECUTE FUNCTION public.expense_floats_before_write();

CREATE TRIGGER trg_expense_floats_before_update BEFORE UPDATE ON public.expense_floats FOR EACH ROW WHEN (((new.issued_amount IS DISTINCT FROM old.issued_amount) OR (new.returned_amount IS DISTINCT FROM old.returned_amount))) EXECUTE FUNCTION public.expense_floats_before_write();

CREATE TRIGGER trg_expense_floats_updated_at BEFORE UPDATE ON public.expense_floats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_increase_stock AFTER INSERT ON public.inventory_purchases FOR EACH ROW EXECUTE FUNCTION public.increase_stock();

CREATE TRIGGER trg_inventory_purchases_updated_at BEFORE UPDATE ON public.inventory_purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_inventory_usages_updated_at BEFORE UPDATE ON public.inventory_usages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_negative_stock BEFORE INSERT ON public.inventory_usages FOR EACH ROW EXECUTE FUNCTION public.prevent_negative_stock();

CREATE TRIGGER trg_reduce_stock AFTER INSERT ON public.inventory_usages FOR EACH ROW EXECUTE FUNCTION public.reduce_stock();

CREATE TRIGGER trg_invoice_items_updated_at BEFORE UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_invoice_total AFTER INSERT OR UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.update_invoice_total();

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_master_pos_updated_at BEFORE UPDATE ON public.master_pos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_outsourced_works_updated_at BEFORE UPDATE ON public.outsourced_works FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_overpayment BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.prevent_overpayment();

CREATE TRIGGER trg_payment_status AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_invoice_status();

CREATE TRIGGER trg_petty_expenses_updated_at BEFORE UPDATE ON public.petty_expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_recompute_petty_expense_floats AFTER INSERT OR DELETE OR UPDATE ON public.petty_expenses FOR EACH ROW EXECUTE FUNCTION public.recompute_petty_expense_floats();

CREATE TRIGGER trg_enforce_stage_transaction_limit BEFORE INSERT ON public.production_stage_transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_transaction_limit();

CREATE TRIGGER trg_log_profile_active_change AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.log_profile_active_change();

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_project_bom_items_recompute AFTER INSERT OR UPDATE OF required_quantity, inventory_item_id ON public.project_bom_items FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_bom_requisition_on_bom_item();

CREATE TRIGGER trg_project_bom_items_updated_at BEFORE UPDATE ON public.project_bom_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_project_employees_updated_at BEFORE UPDATE ON public.project_employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_stock_check AFTER INSERT ON public.project_materials FOR EACH ROW EXECUTE FUNCTION public.stock_check();

CREATE TRIGGER trg_project_production_stages_updated_at BEFORE UPDATE ON public.project_production_stages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_validate_rework_reference BEFORE INSERT OR UPDATE OF reference_stage_id, project_id ON public.project_production_stages FOR EACH ROW EXECUTE FUNCTION public.validate_rework_reference();

CREATE TRIGGER trg_project_purchase_orders_updated_at BEFORE UPDATE ON public.project_purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_project_qms_inspection_attempt_photos_append_only BEFORE DELETE OR UPDATE ON public.project_qms_inspection_attempt_photos FOR EACH ROW EXECUTE FUNCTION public.prevent_qms_history_mutation();

CREATE TRIGGER trg_project_qms_inspection_attempts_append_only BEFORE DELETE OR UPDATE ON public.project_qms_inspection_attempts FOR EACH ROW EXECUTE FUNCTION public.prevent_qms_history_mutation();

CREATE TRIGGER trg_qms_inspection_attempts_recompute_status AFTER INSERT ON public.project_qms_inspection_attempts FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_qms_inspection_status_on_attempt();

CREATE TRIGGER trg_set_qms_inspection_attempt_round BEFORE INSERT ON public.project_qms_inspection_attempts FOR EACH ROW EXECUTE FUNCTION public.set_qms_inspection_attempt_round();

CREATE TRIGGER trg_project_qms_inspection_overrides_append_only BEFORE DELETE OR UPDATE ON public.project_qms_inspection_overrides FOR EACH ROW EXECUTE FUNCTION public.prevent_qms_history_mutation();

CREATE TRIGGER trg_project_qms_inspections_updated_at BEFORE UPDATE ON public.project_qms_inspections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_log_project AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.log_project();

CREATE TRIGGER trg_project_stages AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.create_stages();

CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_qms_stage_completions_updated_at BEFORE UPDATE ON public.qms_stage_completions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_qms_templates_updated_at BEFORE UPDATE ON public.qms_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_quality_characteristics_updated_at BEFORE UPDATE ON public.quality_characteristics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_quotation_purchase_orders_updated_at BEFORE UPDATE ON public.quotation_purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_quotation_revisions_updated_at BEFORE UPDATE ON public.quotation_revisions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_quotations_updated_at BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_salary_payments_updated_at BEFORE UPDATE ON public.salary_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_user_editor_preferences_updated_at BEFORE UPDATE ON public.user_editor_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER trg_log_permission_override AFTER INSERT OR DELETE OR UPDATE ON public.user_permission_overrides FOR EACH ROW EXECUTE FUNCTION public.log_permission_override_change();

CREATE TRIGGER trg_log_role_change AFTER INSERT OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_role_change();

CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE TRIGGER on_auth_user_login AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.log_auth_login();


  create policy "engineering_drawings_delete"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'engineering-drawings'::text) AND public.has_permission('drawing_editor'::text, 'delete'::text) AND ((storage.foldername(name))[1] = (public.current_organization_id())::text)));



  create policy "engineering_drawings_insert"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'engineering-drawings'::text) AND public.has_permission('drawing_editor'::text, 'create'::text) AND ((storage.foldername(name))[1] = (public.current_organization_id())::text)));



  create policy "engineering_drawings_select"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'engineering-drawings'::text) AND public.has_permission('drawing_editor'::text, 'view'::text) AND ((storage.foldername(name))[1] = (public.current_organization_id())::text)));



  create policy "engineering_drawings_update"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'engineering-drawings'::text) AND public.has_permission('drawing_editor'::text, 'edit'::text) AND ((storage.foldername(name))[1] = (public.current_organization_id())::text)))
with check (((bucket_id = 'engineering-drawings'::text) AND public.has_permission('drawing_editor'::text, 'edit'::text) AND ((storage.foldername(name))[1] = (public.current_organization_id())::text)));



