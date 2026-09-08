// Phase 8 Email Operations — narrow, read-only ERP lookups for the
// unattended monitor's own matching step.
//
// Deliberately NOT a port of agent/queries.ts: those functions read
// from useStore.getState(), an in-memory Zustand store that only exists
// after a browser has hydrated it — nothing here can reach that. These
// are direct, minimal Deno-native re-implementations against the same
// underlying Supabase tables, using the service-role client (already
// constructed in index.ts, passed in here) — org-scoped explicitly by
// this code, never by RLS (service-role bypasses RLS entirely) and
// never by anything the model supplies.
//
// Only the 8 read-only domains Phase 8B named as likely candidates are
// implemented — no job cards, tenders, drawings, inventory, or
// anything write-shaped. Each function takes the organizationId as an
// explicit, trusted parameter (from the mailbox's own row, never from
// model output) and a short free-text query, and returns at most 5
// matches — this is a narrowing aid for the model's own MATCHING
// reasoning, not a bulk export, so results are intentionally small.

// deno-lint-ignore no-explicit-any
type ServiceClient = any; // structural use only (.from().select()...) —
// avoids pulling the full supabase-js type surface into this file.

const MAX_RESULTS = 5;

export interface LookupRecord {
  type: string;
  id: string;
  label: string;
  fields: Record<string, unknown>;
}

// Security note: `query` originates from the model's tool-call
// arguments — ultimately influenceable by untrusted email content (a
// prompt-injection attempt could try to make the model pass a crafted
// query string). `.eq()`/`.ilike()` calls below are safe regardless (the
// client sends the value as a real parameter, not spliced into a raw
// filter string) — but `.or()` takes one raw PostgREST filter-syntax
// STRING that this file builds via template literals, where "," and
// "()" are syntactically significant (clause delimiters/grouping).
// Stripping them here means a crafted query can, at worst, fail to
// match or match more broadly WITHIN the caller's own organization_id
// (still separately, non-string-enforced by the .eq() filter on every
// function below) — never escape that organization scope, since
// organization_id is never part of this interpolated string.
function like(q: string): string {
  return `%${q.replace(/[%_,()]/g, "")}%`;
}

export async function searchCustomers(
  client: ServiceClient,
  organizationId: string,
  query: string,
): Promise<LookupRecord[]> {
  const { data } = await client
    .from("customers")
    .select("id, name, email, phone, gstin")
    .eq("organization_id", organizationId)
    .or(`name.ilike.${like(query)},email.ilike.${like(query)},gstin.ilike.${like(query)}`)
    .limit(MAX_RESULTS);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    type: "customer",
    id: r.id as string,
    label: r.name as string,
    fields: { name: r.name, email: r.email, phone: r.phone, gstin: r.gstin },
  }));
}

export async function searchVendors(
  client: ServiceClient,
  organizationId: string,
  query: string,
): Promise<LookupRecord[]> {
  // Deliberately not selecting/exposing vendors.email as a match signal
  // — Phase 6's own established MATCHING guidance treats vendors as
  // having no email signal (name/phone/address/gstin only); this keeps
  // the monitor consistent with that documented behavior rather than
  // introducing a signal the interactive Agent doesn't use.
  const { data } = await client
    .from("vendors")
    .select("id, name, phone, address, gstin")
    .eq("organization_id", organizationId)
    .or(`name.ilike.${like(query)},gstin.ilike.${like(query)}`)
    .limit(MAX_RESULTS);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    type: "vendor",
    id: r.id as string,
    label: r.name as string,
    fields: { name: r.name, phone: r.phone, address: r.address, gstNumber: r.gstin },
  }));
}

export async function searchProjects(
  client: ServiceClient,
  organizationId: string,
  query: string,
): Promise<LookupRecord[]> {
  const { data } = await client
    .from("projects")
    .select(
      "id, name, project_number, customer_id, ordered_quantity, produced_quantity, accepted_quantity, rejected_quantity",
    )
    .eq("organization_id", organizationId)
    .or(`name.ilike.${like(query)},project_number.ilike.${like(query)}`)
    .limit(MAX_RESULTS);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    type: "project",
    id: r.id as string,
    label: (r.project_number as string) || (r.name as string),
    fields: {
      name: r.name,
      projectNumber: r.project_number,
      customerId: r.customer_id,
      orderedQuantity: r.ordered_quantity,
      producedQuantity: r.produced_quantity,
      acceptedQuantity: r.accepted_quantity,
      rejectedQuantity: r.rejected_quantity,
    },
  }));
}

export async function searchCustomerPOs(
  client: ServiceClient,
  organizationId: string,
  query: string,
): Promise<LookupRecord[]> {
  const { data } = await client
    .from("master_pos")
    .select("id, po_number, po_date, customer_id, quotation_id, status")
    .eq("organization_id", organizationId)
    .ilike("po_number", like(query))
    .limit(MAX_RESULTS);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    type: "customer_po",
    id: r.id as string,
    label: r.po_number as string,
    fields: {
      poNumber: r.po_number,
      poDate: r.po_date,
      customerId: r.customer_id,
      quotationId: r.quotation_id,
      status: r.status,
    },
  }));
}

export async function searchCompanyPOs(
  client: ServiceClient,
  organizationId: string,
  query: string,
): Promise<LookupRecord[]> {
  const { data } = await client
    .from("company_pos")
    .select("id, cpo_number, vendor_id, vendor_name, status, grand_total, expected_delivery_date, items")
    .eq("organization_id", organizationId)
    .or(`cpo_number.ilike.${like(query)},vendor_name.ilike.${like(query)}`)
    .limit(MAX_RESULTS);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    type: "company_po",
    id: r.id as string,
    label: r.cpo_number as string,
    fields: {
      cpoNumber: r.cpo_number,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      status: r.status,
      grandTotal: r.grand_total,
      expectedDeliveryDate: r.expected_delivery_date,
      items: r.items,
    },
  }));
}

export async function searchInvoices(
  client: ServiceClient,
  organizationId: string,
  query: string,
): Promise<LookupRecord[]> {
  const { data } = await client
    .from("invoices")
    .select("id, inv_no, customer_id, project_id, status, total_amount, paid_amount, due_date")
    .eq("organization_id", organizationId)
    .ilike("inv_no", like(query))
    .limit(MAX_RESULTS);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    type: "invoice",
    id: r.id as string,
    label: r.inv_no as string,
    fields: {
      invNo: r.inv_no,
      customerId: r.customer_id,
      projectId: r.project_id,
      status: r.status,
      totalAmount: r.total_amount,
      paidAmount: r.paid_amount,
      dueDate: r.due_date,
    },
  }));
}

export async function searchQuotations(
  client: ServiceClient,
  organizationId: string,
  query: string,
): Promise<LookupRecord[]> {
  const { data } = await client
    .from("quotations")
    .select("id, qt_no, customer_id, project_id, status, total_amount, valid_until")
    .eq("organization_id", organizationId)
    .ilike("qt_no", like(query))
    .limit(MAX_RESULTS);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    type: "quotation",
    id: r.id as string,
    label: r.qt_no as string,
    fields: {
      qtNo: r.qt_no,
      customerId: r.customer_id,
      projectId: r.project_id,
      status: r.status,
      totalAmount: r.total_amount,
      validUntil: r.valid_until,
    },
  }));
}

export async function searchDeliveryChallans(
  client: ServiceClient,
  organizationId: string,
  query: string,
): Promise<LookupRecord[]> {
  const { data } = await client
    .from("delivery_challans")
    .select("id, dc_no, dc_number, dispatch_date, receiver_name, status, project_id, quantity")
    .eq("organization_id", organizationId)
    .or(`dc_no.ilike.${like(query)},dc_number.ilike.${like(query)}`)
    .limit(MAX_RESULTS);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    type: "delivery_challan",
    id: r.id as string,
    label: (r.dc_number as string) || (r.dc_no as string),
    fields: {
      dcNumber: r.dc_number || r.dc_no,
      dispatchDate: r.dispatch_date,
      receiverName: r.receiver_name,
      status: r.status,
      projectId: r.project_id,
      quantity: r.quantity,
    },
  }));
}

export const LOOKUPS: Record<
  string,
  (client: ServiceClient, organizationId: string, query: string) => Promise<LookupRecord[]>
> = {
  search_customers: searchCustomers,
  search_vendors: searchVendors,
  search_projects: searchProjects,
  search_customer_pos: searchCustomerPOs,
  search_company_pos: searchCompanyPOs,
  search_invoices: searchInvoices,
  search_quotations: searchQuotations,
  search_delivery_challans: searchDeliveryChallans,
};
