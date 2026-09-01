// UX Redesign Lab — shared secondary-module screens, real (not
// placeholder) list+detail with search/sort where the module is
// data-heavy, reused across all 5 models.
import { Fragment, useState } from "react";
import type {
  Customer,
  CustomerDetail,
  CustomerEmail,
  ProjectStageStatus,
  Vendor,
} from "../data";
import {
  getDefaultPermissions,
  getModulesByCategory,
} from "../permissionCatalog";
import {
  FieldError,
  type FieldSchema,
  RecordFormModal,
  SearchBox,
  SortHeader,
  StatusBadge,
  useConfirm,
  useTableControls,
  useToast,
} from "../primitives";
import { type EntityKey, useUxLabStore } from "../store";
import { ROLES } from "./roleAccess";

// Real ERP has a standalone Projects list with its own "Create Project"
// button (confirmed in Projects.tsx — independent of the quotation
// conversion flow) — this was genuinely missing from the prototype
// before this pass; every other model links straight to a project by
// id, none had a plain browsable list.
// Real Projects.tsx: search by project OR customer name, real Edit
// (customer/name/description/qty), real Delete with a pre-confirm
// linked-record guard (invoices, delivery challans) — see
// PARITY_TRACKER.md #3. Production also has a parallel mobile card
// layout (< sm) rendering the same data/actions as the table; not
// reproduced here — a disclosed responsive-presentation gap, not a
// missing action, since every field/action is still reachable via the
// table on any viewport.
function ProjectFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").Project | null;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const { data, createProjectDirect, updateProjectFields } = useUxLabStore();
  const toast = useToast();
  const [customerId, setCustomerId] = useState(editing?.customerId ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [workDescription, setWorkDescription] = useState(
    editing?.workDescription ?? "",
  );
  const [qty, setQty] = useState(String(editing?.qty ?? ""));
  const [errors, setErrors] = useState<{
    customerId?: string;
    name?: string;
    qty?: string;
  }>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!customerId) next.customerId = "Customer is required";
    if (!name.trim()) next.name = "Project Name is required";
    if (!qty || Number(qty) <= 0) next.qty = "Total Quantity is required";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    if (editing) {
      updateProjectFields(editing.id, {
        customerId,
        name: name.trim(),
        qty: Number(qty),
        workDescription,
      });
      toast("Project updated");
      setSaving(false);
      onSaved(editing.id);
    } else {
      const p = createProjectDirect(
        customerId,
        name.trim(),
        Number(qty),
        0,
        workDescription,
      );
      toast(`Project ${p.no} created`);
      setSaving(false);
      onSaved(p.id);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Project" : "New Project"}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="pf-customer"
            >
              Customer <span className="text-red-600">*</span>
            </label>
            <select
              id="pf-customer"
              className={`mt-1 w-full h-8 text-sm rounded-lg border px-2 ${errors.customerId ? "border-red-400" : ""}`}
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setErrors((p) => ({ ...p, customerId: undefined }));
              }}
            >
              <option value="">Choose…</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError msg={errors.customerId} />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="pf-name"
            >
              Project Name <span className="text-red-600">*</span>
            </label>
            <input
              id="pf-name"
              className={`mt-1 w-full h-8 text-sm rounded-lg border px-2.5 ${errors.name ? "border-red-400" : ""}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((p) => ({ ...p, name: undefined }));
              }}
              placeholder="e.g. MS Enclosure Set"
            />
            <FieldError msg={errors.name} />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="pf-desc"
            >
              Work Description
            </label>
            <textarea
              id="pf-desc"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              placeholder="Describe the work to be done…"
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="pf-qty"
            >
              Total Quantity <span className="text-red-600">*</span>
            </label>
            <input
              id="pf-qty"
              type="number"
              min={1}
              className={`mt-1 w-full h-8 text-sm rounded-lg border px-2.5 ${errors.qty ? "border-red-400" : ""}`}
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                setErrors((p) => ({ ...p, qty: undefined }));
              }}
              placeholder="e.g. 100"
            />
            <FieldError msg={errors.qty} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectsScreen({
  onNavigate,
}: { onNavigate: (view: string, id: string) => void }) {
  const { data, projectDeleteBlockReason, deleteProject } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const tbl = useTableControls(
    data.projects,
    (p) =>
      `${p.no} ${p.name} ${data.customers.find((c) => c.id === p.customerId)?.name ?? ""}`,
    "createdAt",
  );
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; project: (typeof data.projects)[number] }
    | null
  >(null);

  const startDelete = async (p: (typeof data.projects)[number]) => {
    const blockReason = projectDeleteBlockReason(p.id);
    if (blockReason) {
      toast(blockReason);
      return;
    }
    const ok = await confirm(
      "Delete project?",
      `Project "${p.name}" will be permanently deleted.`,
    );
    if (!ok) return;
    deleteProject(p.id);
    toast("Project deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SearchBox
          value={tbl.query}
          onChange={tbl.setQuery}
          placeholder="Search by project or customer…"
        />
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + New Project
        </button>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">Project No</th>
              <th className="text-left p-2.5">Customer</th>
              <th className="text-left p-2.5">Project Name</th>
              <th className="text-left p-2.5">Description</th>
              <th className="text-left p-2.5">Created</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((p) => {
              const cust = data.customers.find((c) => c.id === p.customerId);
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-2.5 font-mono font-semibold text-blue-600">
                    {p.no}
                  </td>
                  <td className="p-2.5">{cust?.name ?? "—"}</td>
                  <td className="p-2.5">{p.name}</td>
                  <td className="p-2.5 text-gray-500 max-w-[220px] truncate">
                    {p.workDescription || "—"}
                  </td>
                  <td className="p-2.5 text-gray-500">{p.createdAt}</td>
                  <td className="p-2.5">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onNavigate("project", p.id)}
                        className="text-blue-600 font-semibold"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialog({ mode: "edit", project: p })}
                        className="text-blue-600 font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => startDelete(p)}
                        className="text-red-600 font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  No projects found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <ProjectFormDialog
          editing={dialog.mode === "edit" ? dialog.project : null}
          onCancel={() => setDialog(null)}
          onSaved={(id) => {
            setDialog(null);
            if (dialog.mode === "create") onNavigate("project", id);
          }}
        />
      )}
    </div>
  );
}

// Real Customers.tsx has a much richer surface than a generic 2-field
// form: multi-email array with type + "set primary", free-form
// additional-details array, a pre-confirm linked-record delete guard,
// and a real Edit path — none of which the generic RecordFormModal can
// express. Built bespoke to match, per PARITY_TRACKER.md #1.
const EMAIL_TYPES: CustomerEmail["type"][] = [
  "Purchase",
  "Accounts",
  "Sales",
  "Other",
];

function emptyCustomerForm(): Omit<Customer, "id" | "contact" | "since"> {
  return {
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    gstin: "",
    stateName: "",
    stateCode: "",
    address: "",
    emails: [],
    primaryEmail: "",
    additionalDetails: [],
  };
}

function CustomerFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: Customer | null;
  onCancel: () => void;
  onSaved: (c: Customer) => void;
}) {
  const { addCustomer, updateCustomer } = useUxLabStore();
  const toast = useToast();
  const [form, setForm] = useState(() =>
    editing
      ? {
          name: editing.name,
          contactPerson: editing.contactPerson,
          phone: editing.phone,
          email: editing.email,
          gstin: editing.gstin,
          stateName: editing.stateName,
          stateCode: editing.stateCode,
          address: editing.address,
          emails: editing.emails,
          primaryEmail: editing.primaryEmail,
          additionalDetails: editing.additionalDetails,
        }
      : emptyCustomerForm(),
  );
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (k === "name" && v) setNameError(undefined);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setNameError("Customer name is required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    const saved = editing ? { ...editing, ...form } : addCustomer(form);
    if (editing) updateCustomer(editing.id, form);
    setSaving(false);
    toast(editing ? "Customer updated" : "Customer created");
    onSaved(saved as Customer);
  };

  const setEmail = (i: number, patch: Partial<CustomerEmail>) =>
    setField(
      "emails",
      form.emails.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    );
  const removeEmail = (i: number) =>
    setField(
      "emails",
      form.emails.filter((_, j) => j !== i),
    );
  const setDetail = (i: number, patch: Partial<CustomerDetail>) =>
    setField(
      "additionalDetails",
      form.additionalDetails.map((d, j) => (j === i ? { ...d, ...patch } : d)),
    );
  const removeDetail = (i: number) =>
    setField(
      "additionalDetails",
      form.additionalDetails.filter((_, j) => j !== i),
    );

  const textFields: [string, keyof typeof form][] = [
    ["Company Name", "name"],
    ["Contact Person", "contactPerson"],
    ["Phone", "phone"],
    ["Email", "email"],
    ["GSTIN", "gstin"],
    ["State Name", "stateName"],
    ["State Code", "stateCode"],
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Customer" : "New Customer"}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {textFields.map(([label, key]) => (
            <div key={key} className={key === "name" ? "col-span-2" : ""}>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor={`cust-${key}`}
              >
                {label}
                {key === "name" && <span className="text-red-600"> *</span>}
              </label>
              <input
                id={`cust-${key}`}
                className={`mt-1 w-full h-8 text-sm rounded-lg border px-2.5 ${key === "name" && nameError ? "border-red-400" : ""}`}
                value={form[key] as string}
                onChange={(e) => setField(key, e.target.value)}
              />
              {key === "name" && <FieldError msg={nameError} />}
            </div>
          ))}
          <div className="col-span-2">
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="cust-address"
            >
              Address
            </label>
            <textarea
              id="cust-address"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-gray-500 uppercase">
              Email addresses
            </span>
            <button
              type="button"
              onClick={() =>
                setField("emails", [
                  ...form.emails,
                  { email: "", type: "Accounts" as const },
                ])
              }
              className="text-xs font-semibold text-blue-600"
            >
              + Add Email
            </button>
          </div>
          {form.emails.map((entry, i) => (
            <div
              key={`email-${entry.email || "new"}-${i}`}
              className="flex gap-1.5 mb-1.5 items-center"
            >
              <input
                className="flex-1 min-w-0 h-7 text-xs rounded-lg border px-2"
                placeholder="email@company.com"
                value={entry.email}
                onChange={(e) => setEmail(i, { email: e.target.value })}
              />
              <select
                className="h-7 w-24 shrink-0 text-xs rounded-lg border px-1.5"
                value={entry.type}
                onChange={(e) =>
                  setEmail(i, {
                    type: e.target.value as CustomerEmail["type"],
                  })
                }
              >
                {EMAIL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setField("primaryEmail", entry.email)}
                className={`h-7 px-2 text-[11px] font-semibold rounded-lg shrink-0 ${entry.email === form.primaryEmail ? "bg-gray-900 text-white" : "border"}`}
              >
                {entry.email === form.primaryEmail
                  ? "✓ Primary"
                  : "Set primary"}
              </button>
              <button
                type="button"
                onClick={() => removeEmail(i)}
                aria-label="Remove email"
                className="text-red-500 text-xs px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-gray-500 uppercase">
              Additional details
            </span>
            <button
              type="button"
              onClick={() =>
                setField("additionalDetails", [
                  ...form.additionalDetails,
                  { key: "", value: "" },
                ])
              }
              className="text-xs font-semibold text-blue-600"
            >
              + Add Detail
            </button>
          </div>
          {form.additionalDetails.map((d, i) => (
            <div
              key={`detail-${d.key || "new"}-${i}`}
              className="flex gap-1.5 mb-1.5 items-center"
            >
              <input
                className="flex-1 min-w-0 h-7 text-xs rounded-lg border px-2"
                placeholder="Field name (e.g. PAN)"
                value={d.key}
                onChange={(e) => setDetail(i, { key: e.target.value })}
              />
              <input
                className="flex-1 min-w-0 h-7 text-xs rounded-lg border px-2"
                placeholder="Value"
                value={d.value}
                onChange={(e) => setDetail(i, { value: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeDetail(i)}
                aria-label="Remove detail"
                className="text-red-500 text-xs px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CustomersScreen({
  onNavigate,
}: { onNavigate: (view: string, id: string) => void }) {
  const { data, customerDeleteBlockReason, deleteRecord } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const tbl = useTableControls(
    data.customers,
    (c) => `${c.name} ${c.contactPerson}`,
    "name",
  );
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; customer: Customer } | null
  >(null);

  const startDelete = async (c: Customer) => {
    const blockReason = customerDeleteBlockReason(c.id);
    if (blockReason) {
      toast(blockReason);
      return;
    }
    const ok = await confirm(
      "Delete customer?",
      `Customer "${c.name}" will be permanently deleted.`,
    );
    if (!ok) return;
    deleteRecord("customers", c.id);
    toast("Customer deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Customers</h2>
          <p className="text-xs text-gray-500">
            {data.customers.length} registered customers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox
            value={tbl.query}
            onChange={tbl.setQuery}
            placeholder="Search customers…"
          />
          <button
            type="button"
            onClick={() => setDialog({ mode: "create" })}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white whitespace-nowrap"
          >
            + Add Customer
          </button>
        </div>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">
                <SortHeader
                  label="Company Name"
                  col="name"
                  sortKey={tbl.sortKey}
                  sortDesc={tbl.sortDesc}
                  onSort={tbl.toggleSort}
                />
              </th>
              <th className="text-left p-2.5">Contact Person</th>
              <th className="text-left p-2.5">Phone</th>
              <th className="text-left p-2.5">Email</th>
              <th className="text-left p-2.5">GSTIN</th>
              <th className="text-left p-2.5">State</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-2.5 font-semibold text-gray-900">{c.name}</td>
                <td className="p-2.5">{c.contactPerson}</td>
                <td className="p-2.5">{c.phone}</td>
                <td className="p-2.5">{c.email}</td>
                <td className="p-2.5 font-mono">{c.gstin}</td>
                <td className="p-2.5">
                  {c.stateName ? `${c.stateName} (${c.stateCode || "—"})` : "—"}
                </td>
                <td className="p-2.5">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", customer: c })}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => startDelete(c)}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate("customer", c.id)}
                      className="text-gray-500 font-semibold"
                      title="View document history"
                    >
                      History
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No customers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <CustomerFormDialog
          editing={dialog.mode === "edit" ? dialog.customer : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// Real Vendors.tsx list: Vendor Name/Phone/Address/GST Number columns,
// real Add/Edit dialog (duplicate-name rejected on create), real Delete
// that WARNS about orphaning linked records rather than blocking it
// (a deliberately different business rule from Customers' hard block —
// see PARITY_TRACKER.md #2). Row click opens the real relationship
// workspace (VendorWorkspace) instead of production's inline slide-over
// panel — a legitimate presentation change, not a functional removal,
// since every field/section the slide-over shows is still reachable.
function emptyVendorForm(): Omit<Vendor, "id" | "contact"> {
  return { name: "", phone: "", address: "", gstNumber: "" };
}

function VendorFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: Vendor | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { addVendor, updateVendor, vendorNameExists } = useUxLabStore();
  const toast = useToast();
  const [form, setForm] = useState(() =>
    editing
      ? {
          name: editing.name,
          phone: editing.phone,
          address: editing.address,
          gstNumber: editing.gstNumber,
        }
      : emptyVendorForm(),
  );
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      setNameError("Vendor name is required");
      return;
    }
    if (!editing && vendorNameExists(form.name)) {
      setNameError("A vendor with this name already exists");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    if (editing) {
      updateVendor(editing.id, form);
      toast("Vendor updated");
    } else {
      addVendor(form);
      toast("Vendor added");
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Vendor" : "Add Vendor"}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="vend-name"
            >
              Vendor Name <span className="text-red-600">*</span>
            </label>
            <input
              id="vend-name"
              className={`mt-1 w-full h-8 text-sm rounded-lg border px-2.5 ${nameError ? "border-red-400" : ""}`}
              value={form.name}
              onChange={(e) => {
                setForm((p) => ({ ...p, name: e.target.value }));
                if (e.target.value) setNameError(undefined);
              }}
              placeholder="e.g. Steel India Pvt Ltd"
            />
            <FieldError msg={nameError} />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="vend-phone"
            >
              Phone
            </label>
            <input
              id="vend-phone"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={form.phone}
              onChange={(e) =>
                setForm((p) => ({ ...p, phone: e.target.value }))
              }
              placeholder="9876543210"
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="vend-address"
            >
              Address
            </label>
            <input
              id="vend-address"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={form.address}
              onChange={(e) =>
                setForm((p) => ({ ...p, address: e.target.value }))
              }
              placeholder="City / Area"
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="vend-gst"
            >
              GST Number (optional)
            </label>
            <input
              id="vend-gst"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={form.gstNumber}
              onChange={(e) =>
                setForm((p) => ({ ...p, gstNumber: e.target.value }))
              }
              placeholder="27ABCDE1234F1Z5"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Vendor"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function VendorsScreen({
  onNavigate,
}: { onNavigate: (view: string, id: string) => void }) {
  const { data, deleteRecord } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const tbl = useTableControls(data.vendors, (v) => v.name, "name");
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; vendor: Vendor } | null
  >(null);

  const startDelete = async (v: Vendor) => {
    const ok = await confirm(
      "Delete Vendor",
      "Are you sure? Existing purchase and payable records linked to this vendor will retain the vendor name but lose the link.",
    );
    if (!ok) return;
    deleteRecord("vendors", v.id);
    toast("Vendor deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Vendors</h2>
          <p className="text-xs text-gray-500">
            {data.vendors.length} vendor{data.vendors.length !== 1 ? "s" : ""}{" "}
            registered
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox
            value={tbl.query}
            onChange={tbl.setQuery}
            placeholder="Search vendors…"
          />
          <button
            type="button"
            onClick={() => setDialog({ mode: "create" })}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white whitespace-nowrap"
          >
            + Add Vendor
          </button>
        </div>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">
                <SortHeader
                  label="Vendor Name"
                  col="name"
                  sortKey={tbl.sortKey}
                  sortDesc={tbl.sortDesc}
                  onSort={tbl.toggleSort}
                />
              </th>
              <th className="text-left p-2.5">Phone</th>
              <th className="text-left p-2.5">Address</th>
              <th className="text-left p-2.5">GST Number</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((v) => (
              <tr
                key={v.id}
                className="border-b last:border-0 cursor-pointer hover:bg-gray-50"
                tabIndex={0}
                onClick={() => onNavigate("vendor", v.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onNavigate("vendor", v.id);
                  }
                }}
              >
                <td className="p-2.5 font-semibold text-gray-900">{v.name}</td>
                <td className="p-2.5">{v.phone || "—"}</td>
                <td className="p-2.5 text-gray-500">{v.address || "—"}</td>
                <td className="p-2.5 font-mono">{v.gstNumber || "—"}</td>
                <td className="p-2.5">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDialog({ mode: "edit", vendor: v });
                      }}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startDelete(v);
                      }}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">
                  No vendors yet. Click "Add Vendor" to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <VendorFormDialog
          editing={dialog.mode === "edit" ? dialog.vendor : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// Real Quotations.tsx action surface: line items + real GST/IGST tax,
// revisions (versioned quotation history), an inline status dropdown
// (Draft/Sent/Accepted/Rejected), Duplicate, Delete, Record PO (once
// Accepted — matches line items to existing projects and records a
// linked PO), Print/Download/Share. See PARITY_TRACKER.md #4.
//
// Print/Download/Share are simulated (toast-confirmed) rather than
// producing real files — the lab has no PDF-rendering infrastructure —
// disclosed the same way Export Engine's CSV buttons were.
//
// Kept alongside, not removed: the pre-existing "Accept →" convenience
// (acceptQuotation) that auto-creates a Project on accept. This predates
// this parity pass and does NOT match production (which never
// auto-creates a project on accept — Record PO's project-matching is
// the real linkage). Disclosed rather than silently changed, since 10
// earlier lab models built around this shared component still route
// through it.
function LineItemsEditor({
  items,
  onChange,
}: {
  items: import("../data").QuotationLineItem[];
  onChange: (items: import("../data").QuotationLineItem[]) => void;
}) {
  const setItem = (
    i: number,
    patch: Partial<import("../data").QuotationLineItem>,
  ) => {
    const next = items.map((li, j) => {
      if (j !== i) return li;
      const merged = { ...li, ...patch };
      if ("qty" in patch || "unitPrice" in patch) {
        merged.amount = merged.qty * merged.unitPrice;
      }
      return merged;
    });
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () =>
    onChange([
      ...items,
      { desc: "", hsn: "", qty: 1, unitPrice: 0, amount: 0 },
    ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold text-gray-500 uppercase">
          Line items
        </span>
        <button
          type="button"
          onClick={add}
          className="text-xs font-semibold text-blue-600"
        >
          + Add Item
        </button>
      </div>
      <div className="space-y-1.5">
        {items.map((li, i) => (
          <div
            key={`li-${i}-${li.desc}`}
            className="grid grid-cols-12 gap-1.5 items-center"
          >
            <input
              className="col-span-5 h-7 text-xs rounded-lg border px-2"
              placeholder="Description"
              value={li.desc}
              onChange={(e) => setItem(i, { desc: e.target.value })}
            />
            <input
              className="col-span-2 h-7 text-xs rounded-lg border px-1.5"
              placeholder="HSN"
              value={li.hsn}
              onChange={(e) => setItem(i, { hsn: e.target.value })}
            />
            <input
              className="col-span-2 h-7 text-xs rounded-lg border px-1.5"
              type="number"
              placeholder="Qty"
              value={li.qty}
              onChange={(e) => setItem(i, { qty: Number(e.target.value) || 0 })}
            />
            <input
              className="col-span-2 h-7 text-xs rounded-lg border px-1.5"
              type="number"
              placeholder="Unit ₹"
              value={li.unitPrice}
              onChange={(e) =>
                setItem(i, { unitPrice: Number(e.target.value) || 0 })
              }
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove line item"
              className="col-span-1 text-red-500 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuotationFormDialog({
  mode,
  quotation,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit" | "revision" | "duplicate";
  quotation: import("../data").Quotation | null;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const {
    data,
    createQuotation,
    updateQuotationFields,
    createQuotationRevision,
  } = useUxLabStore();
  const toast = useToast();
  const [customerId, setCustomerId] = useState(quotation?.customerId ?? "");
  const [lineItems, setLineItems] = useState(
    quotation?.lineItems ?? [
      { desc: "", hsn: "", qty: 1, unitPrice: 0, amount: 0 },
    ],
  );
  const [applyGST, setApplyGST] = useState(quotation?.applyGST ?? false);
  const [applyIGST, setApplyIGST] = useState(quotation?.applyIGST ?? false);
  const [validUntil, setValidUntil] = useState(quotation?.validUntil ?? "");
  const [terms, setTerms] = useState(quotation?.terms ?? "");
  const [customerError, setCustomerError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const subtotal = lineItems.reduce((s, li) => s + li.amount, 0);
  const cgstAmt = applyGST ? Math.round(subtotal * 0.09) : 0;
  const sgstAmt = applyGST ? Math.round(subtotal * 0.09) : 0;
  const igstAmt = applyIGST ? Math.round(subtotal * 0.18) : 0;
  const total = subtotal + cgstAmt + sgstAmt + igstAmt;

  const submit = async () => {
    if (!customerId) {
      setCustomerError("Select a customer");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    if (mode === "edit" && quotation) {
      updateQuotationFields(quotation.id, {
        customerId,
        lineItems,
        applyGST,
        applyIGST,
        validUntil,
        terms,
      });
      toast("Quotation updated");
      onSaved(quotation.id);
    } else if (mode === "revision" && quotation) {
      createQuotationRevision(quotation.id, {
        lineItems,
        applyGST,
        applyIGST,
        validUntil,
        terms,
      });
      toast(`Revision created for ${quotation.no}`);
      onSaved(quotation.id);
    } else {
      const q = createQuotation(
        customerId,
        lineItems[0]?.desc ?? "",
        lineItems.reduce((s, li) => s + li.qty, 0),
        total,
      );
      updateQuotationFields(q.id, {
        customerId,
        lineItems,
        applyGST,
        applyIGST,
        validUntil,
        terms,
      });
      toast(`${q.no} created as Draft`);
      onSaved(q.id);
    }
    setSaving(false);
  };

  const title =
    mode === "edit"
      ? "Edit Quotation"
      : mode === "revision"
        ? `Create Revision — ${quotation?.no}`
        : "New Quotation";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-xl max-h-[85vh] overflow-y-auto p-5">
        <h3 className="text-sm font-bold mb-3">{title}</h3>
        <div className="space-y-3">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="qf-customer"
            >
              Customer <span className="text-red-600">*</span>
            </label>
            <select
              id="qf-customer"
              className={`mt-1 w-full h-8 text-sm rounded-lg border px-2 ${customerError ? "border-red-400" : ""}`}
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setCustomerError(undefined);
              }}
              disabled={mode !== "create"}
            >
              <option value="">Choose…</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError msg={customerError} />
          </div>
          <LineItemsEditor items={lineItems} onChange={setLineItems} />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={applyGST}
                onChange={(e) => setApplyGST(e.target.checked)}
              />
              Apply GST (9% CGST + 9% SGST)
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={applyIGST}
                onChange={(e) => setApplyIGST(e.target.checked)}
              />
              Apply IGST (18%)
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qf-valid"
              >
                Valid Until
              </label>
              <input
                id="qf-valid"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qf-terms"
              >
                Terms
              </label>
              <input
                id="qf-terms"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 border p-2.5 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>₹{subtotal.toLocaleString("en-IN")}</span>
            </div>
            {applyGST && (
              <>
                <div className="flex justify-between text-gray-500">
                  <span>CGST 9%</span>
                  <span>₹{cgstAmt.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>SGST 9%</span>
                  <span>₹{sgstAmt.toLocaleString("en-IN")}</span>
                </div>
              </>
            )}
            {applyIGST && (
              <div className="flex justify-between text-gray-500">
                <span>IGST 18%</span>
                <span>₹{igstAmt.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="flex justify-between font-bold pt-1 border-t">
              <span>Total</span>
              <span>₹{total.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : mode === "revision"
                ? "Create Revision"
                : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordPODialog({
  quotation,
  onCancel,
  onSaved,
}: {
  quotation: import("../data").Quotation;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { recordQuotationPO } = useUxLabStore();
  const toast = useToast();
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!poNumber.trim() || !poDate) {
      setError("PO Number and PO Date are required.");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    recordQuotationPO(quotation.id, poNumber.trim(), poDate);
    setSaving(false);
    toast(`PO ${poNumber.trim()} recorded against ${quotation.no}`);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">
          Record Purchase Order — {quotation.no}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="po-number"
            >
              PO Number <span className="text-red-600">*</span>
            </label>
            <input
              id="po-number"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={poNumber}
              onChange={(e) => {
                setPoNumber(e.target.value);
                setError("");
              }}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="po-date"
            >
              PO Date <span className="text-red-600">*</span>
            </label>
            <input
              id="po-date"
              type="date"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={poDate}
              onChange={(e) => {
                setPoDate(e.target.value);
                setError("");
              }}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Record PO"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RevisionsPanel({
  quotation,
  onClose,
}: { quotation: import("../data").Quotation; onClose: () => void }) {
  const { data } = useUxLabStore();
  const revs = data.quotationRevisions
    .filter((r) => r.quotationId === quotation.id)
    .sort((a, b) => b.revisionNumber - a.revisionNumber);
  const pos = data.quotationPOs.filter((p) => p.quotationId === quotation.id);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-md max-h-[80vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">
            Revisions & Purchase Orders — {quotation.no}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400"
          >
            ✕
          </button>
        </div>
        <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">
          Revisions
        </p>
        <div className="space-y-1.5 mb-4">
          {revs.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between text-xs border rounded-lg px-2.5 py-1.5 bg-gray-50"
            >
              <div>
                <p className="font-semibold">
                  Revision {r.revisionNumber}
                  {r.isCurrent && (
                    <span className="ml-1.5 text-emerald-600">· Current</span>
                  )}
                </p>
                <p className="text-gray-500">{r.revisionDate}</p>
              </div>
              <p className="font-mono">₹{r.total.toLocaleString("en-IN")}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">
          Purchase Orders
        </p>
        {pos.length === 0 ? (
          <p className="text-xs text-gray-400">
            No purchase orders recorded yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {pos.map((po) => (
              <div
                key={po.id}
                className="flex items-center justify-between text-xs border rounded-lg px-2.5 py-1.5 bg-gray-50"
              >
                <p className="font-mono font-semibold">{po.poNumber}</p>
                <p className="text-gray-500">{po.poDate}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function QuotationsScreen({
  onNavigate,
}: { onNavigate: (view: string, id: string) => void }) {
  const {
    data,
    acceptQuotation,
    deleteQuotation,
    duplicateQuotation,
    updateQuotationStatus,
  } = useUxLabStore();
  const confirm = useConfirm();
  const toast = useToast();
  const tbl = useTableControls(
    data.quotations,
    (q) => `${q.no} ${q.item}`,
    "createdAt",
  );
  const [dialog, setDialog] = useState<
    | {
        kind: "form";
        mode: "create" | "edit" | "revision";
        quotation: import("../data").Quotation | null;
      }
    | { kind: "recordPO"; quotation: import("../data").Quotation }
    | { kind: "revisions"; quotation: import("../data").Quotation }
    | null
  >(null);

  const doAccept = async (id: string, no: string) => {
    const ok = await confirm(
      "Accept quotation?",
      `Accepting ${no} creates a new Project with its own production stages. This cannot be undone in this session.`,
    );
    if (!ok) return;
    const proj = acceptQuotation(id);
    toast(`${no} accepted — ${proj.no} created`);
    onNavigate("project", proj.id);
  };

  const doDelete = async (q: import("../data").Quotation) => {
    const ok = await confirm(
      "Delete quotation?",
      `Quotation "${q.no}" will be permanently deleted.`,
    );
    if (!ok) return;
    deleteQuotation(q.id);
    toast("Quotation deleted");
  };

  const doDuplicate = (q: import("../data").Quotation) => {
    const dup = duplicateQuotation(q.id);
    if (dup) toast(`Duplicated as ${dup.no} (Draft)`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SearchBox
          value={tbl.query}
          onChange={tbl.setQuery}
          placeholder="Search quotations…"
        />
        <button
          type="button"
          onClick={() =>
            setDialog({ kind: "form", mode: "create", quotation: null })
          }
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + New Quotation
        </button>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">
                <SortHeader
                  label="QT No."
                  col="no"
                  sortKey={tbl.sortKey}
                  sortDesc={tbl.sortDesc}
                  onSort={tbl.toggleSort}
                />
              </th>
              <th className="text-left p-2.5">Customer</th>
              <th className="text-left p-2.5">
                <SortHeader
                  label="Total"
                  col="total"
                  sortKey={tbl.sortKey}
                  sortDesc={tbl.sortDesc}
                  onSort={tbl.toggleSort}
                />
              </th>
              <th className="text-left p-2.5">Valid Until</th>
              <th className="text-left p-2.5">PO</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((q) => {
              const cust = data.customers.find((c) => c.id === q.customerId);
              const poCount = data.quotationPOs.filter(
                (p) => p.quotationId === q.id,
              ).length;
              return (
                <tr key={q.id} className="border-b last:border-0">
                  <td className="p-2.5 font-mono font-semibold">{q.no}</td>
                  <td className="p-2.5">{cust?.name ?? "—"}</td>
                  <td className="p-2.5">₹{q.total.toLocaleString("en-IN")}</td>
                  <td className="p-2.5 text-gray-500">{q.validUntil || "—"}</td>
                  <td className="p-2.5">
                    {poCount > 0 ? (
                      <span className="font-mono text-emerald-700 font-semibold">
                        {poCount} PO{poCount > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-2.5">
                    <select
                      className="h-7 text-xs rounded-lg border px-1.5"
                      value={q.status}
                      onChange={(e) =>
                        updateQuotationStatus(
                          q.id,
                          e.target.value as import("../data").QuotationStatus,
                        )
                      }
                    >
                      {(["Draft", "Sent", "Accepted", "Rejected"] as const).map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td className="p-2.5">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 max-w-[260px]">
                      <button
                        type="button"
                        onClick={() =>
                          setDialog({ kind: "revisions", quotation: q })
                        }
                        className="text-blue-600 font-semibold"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDialog({
                            kind: "form",
                            mode: "edit",
                            quotation: q,
                          })
                        }
                        className="text-blue-600 font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => doDuplicate(q)}
                        className="text-blue-600 font-semibold"
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDialog({
                            kind: "form",
                            mode: "revision",
                            quotation: q,
                          })
                        }
                        className="text-blue-600 font-semibold"
                      >
                        Revise
                      </button>
                      <button
                        type="button"
                        onClick={() => toast(`Print requested for ${q.no}`)}
                        className="text-gray-500 font-semibold"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => toast(`${q.no} downloaded (simulated)`)}
                        className="text-gray-500 font-semibold"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => toast(`Share link copied for ${q.no}`)}
                        className="text-gray-500 font-semibold"
                      >
                        Share
                      </button>
                      {q.status === "Accepted" && (
                        <button
                          type="button"
                          onClick={() =>
                            setDialog({ kind: "recordPO", quotation: q })
                          }
                          className="text-emerald-600 font-semibold"
                        >
                          Record PO
                        </button>
                      )}
                      {q.status === "Sent" && (
                        <button
                          type="button"
                          onClick={() => doAccept(q.id, q.no)}
                          className="text-emerald-600 font-semibold"
                        >
                          Accept →
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => doDelete(q)}
                        className="text-red-600 font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No quotations
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog?.kind === "form" && (
        <QuotationFormDialog
          mode={dialog.mode}
          quotation={dialog.quotation}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "recordPO" && (
        <RecordPODialog
          quotation={dialog.quotation}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "revisions" && (
        <RevisionsPanel
          quotation={dialog.quotation}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// Real pages/PurchaseOrders.tsx — "Customer Purchase Orders" (Sales),
// listing real QuotationPO records created via Quotations' Record PO
// flow. See PARITY_TRACKER.md #5 for the file-name correction (this is
// NOT the vendor-side "Company PO", which is PurchaseOrder/PODetailScreen
// below).
// Real pages/Invoices.tsx action surface: line items, editable
// CGST/SGST/IGST rates (not opt-in checkboxes like Quotations), a real
// tax/proforma type toggle, PO number/date linkage, status workflow
// (Unpaid/PartiallyPaid/Paid, hidden for proforma — "Document only"),
// overdue-days indicator, View/Edit/Print/Download/Share/Delete. See
// PARITY_TRACKER.md #6. Print/Download/Share simulated, same disclosed
// treatment as Quotations/Export Engine — no PDF-rendering
// infrastructure in the lab.
function InvLineItemsEditor({
  items,
  onChange,
}: {
  items: import("../data").InvLineItem[];
  onChange: (items: import("../data").InvLineItem[]) => void;
}) {
  const setItem = (
    i: number,
    patch: Partial<import("../data").InvLineItem>,
  ) => {
    const next = items.map((li, j) => {
      if (j !== i) return li;
      const merged = { ...li, ...patch };
      if ("qty" in patch || "rate" in patch)
        merged.amount = merged.qty * merged.rate;
      return merged;
    });
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () =>
    onChange([...items, { desc: "", hsn: "", qty: 1, rate: 0, amount: 0 }]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold text-gray-500 uppercase">
          Line items
        </span>
        <button
          type="button"
          onClick={add}
          className="text-xs font-semibold text-blue-600"
        >
          + Add Item
        </button>
      </div>
      <div className="space-y-1.5">
        {items.map((li, i) => (
          <div
            key={`ili-${i}-${li.desc}`}
            className="grid grid-cols-12 gap-1.5 items-center"
          >
            <input
              className="col-span-5 h-7 text-xs rounded-lg border px-2"
              placeholder="Description"
              value={li.desc}
              onChange={(e) => setItem(i, { desc: e.target.value })}
            />
            <input
              className="col-span-2 h-7 text-xs rounded-lg border px-1.5"
              placeholder="HSN"
              value={li.hsn}
              onChange={(e) => setItem(i, { hsn: e.target.value })}
            />
            <input
              className="col-span-2 h-7 text-xs rounded-lg border px-1.5"
              type="number"
              placeholder="Qty"
              value={li.qty}
              onChange={(e) => setItem(i, { qty: Number(e.target.value) || 0 })}
            />
            <input
              className="col-span-2 h-7 text-xs rounded-lg border px-1.5"
              type="number"
              placeholder="Rate ₹"
              value={li.rate}
              onChange={(e) =>
                setItem(i, { rate: Number(e.target.value) || 0 })
              }
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove line item"
              className="col-span-1 text-red-500 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvoiceFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").Invoice | null;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const { data, addInvoice, updateInvoiceFields } = useUxLabStore();
  const toast = useToast();
  const [projectId, setProjectId] = useState(editing?.projectId ?? "");
  const [lineItems, setLineItems] = useState(
    editing?.lineItems ?? [{ desc: "", hsn: "", qty: 1, rate: 0, amount: 0 }],
  );
  const [cgstRate, setCgstRate] = useState(editing?.cgstRate ?? 9);
  const [sgstRate, setSgstRate] = useState(editing?.sgstRate ?? 9);
  const [igstRate, setIgstRate] = useState(editing?.igstRate ?? 0);
  const [invoiceDate, setInvoiceDate] = useState(
    editing?.invoiceDate ?? new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? "");
  const [poNumber, setPoNumber] = useState(editing?.poNumber ?? "");
  const [poDate, setPoDate] = useState(editing?.poDate ?? "");
  const [invoiceType, setInvoiceType] = useState<"tax" | "proforma">(
    editing?.invoiceType ?? "tax",
  );
  const [projectError, setProjectError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const subtotal = lineItems.reduce((s, li) => s + li.amount, 0);
  const cgstAmt = Math.round((subtotal * cgstRate) / 100);
  const sgstAmt = Math.round((subtotal * sgstRate) / 100);
  const igstAmt = Math.round((subtotal * igstRate) / 100);
  const total = subtotal + cgstAmt + sgstAmt + igstAmt;

  const submit = async () => {
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) {
      setProjectError("Select a project");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    const fields = {
      customerId: project.customerId,
      projectId,
      lineItems,
      cgstRate,
      sgstRate,
      igstRate,
      invoiceDate,
      dueDate,
      poNumber,
      poDate,
      invoiceType,
    };
    if (editing) {
      updateInvoiceFields(editing.id, fields);
      toast("Invoice updated");
      onSaved(editing.id);
    } else {
      const inv = addInvoice(fields);
      toast(`${inv.no} created`);
      onSaved(inv.id);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-xl max-h-[85vh] overflow-y-auto p-5">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Invoice" : "New Invoice"}
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="if-project"
              >
                Project <span className="text-red-600">*</span>
              </label>
              <select
                id="if-project"
                className={`mt-1 w-full h-8 text-sm rounded-lg border px-2 ${projectError ? "border-red-400" : ""}`}
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setProjectError(undefined);
                }}
                disabled={!!editing}
              >
                <option value="">Choose…</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.no}
                  </option>
                ))}
              </select>
              <FieldError msg={projectError} />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="if-type"
              >
                Invoice Type
              </label>
              <select
                id="if-type"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={invoiceType}
                onChange={(e) =>
                  setInvoiceType(e.target.value as "tax" | "proforma")
                }
              >
                <option value="tax">Tax Invoice</option>
                <option value="proforma">Proforma</option>
              </select>
            </div>
          </div>
          <InvLineItemsEditor items={lineItems} onChange={setLineItems} />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="if-cgst"
              >
                CGST %
              </label>
              <input
                id="if-cgst"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={cgstRate}
                onChange={(e) => setCgstRate(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="if-sgst"
              >
                SGST %
              </label>
              <input
                id="if-sgst"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={sgstRate}
                onChange={(e) => setSgstRate(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="if-igst"
              >
                IGST %
              </label>
              <input
                id="if-igst"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={igstRate}
                onChange={(e) => setIgstRate(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="if-date"
              >
                Invoice Date
              </label>
              <input
                id="if-date"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="if-due"
              >
                Due Date
              </label>
              <input
                id="if-due"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="if-pon"
              >
                PO Number
              </label>
              <input
                id="if-pon"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="if-pod"
              >
                PO Date
              </label>
              <input
                id="if-pod"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={poDate}
                onChange={(e) => setPoDate(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 border p-2.5 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>₹{subtotal.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>CGST {cgstRate}%</span>
              <span>₹{cgstAmt.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>SGST {sgstRate}%</span>
              <span>₹{sgstAmt.toLocaleString("en-IN")}</span>
            </div>
            {igstRate > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>IGST {igstRate}%</span>
                <span>₹{igstAmt.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="flex justify-between font-bold pt-1 border-t">
              <span>Total</span>
              <span>₹{total.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InvoicesScreen({
  onNavigate,
}: { onNavigate: (view: string, id: string) => void }) {
  const { data, updateInvoiceStatus, deleteInvoiceFull } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; invoice: import("../data").Invoice }
    | null
  >(null);
  const [viewing, setViewing] = useState<import("../data").Invoice | null>(
    null,
  );
  const tbl = useTableControls(
    data.invoices,
    (i) =>
      `${i.no} ${data.customers.find((c) => c.id === i.customerId)?.name ?? ""} ${i.poNumber}`,
    "invoiceDate",
  );

  const daysOverdue = (dueDate: string, status: string) => {
    if (!dueDate || status === "Paid") return 0;
    const d = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
    return d > 0 ? d : 0;
  };

  const doDelete = async (inv: import("../data").Invoice) => {
    const ok = await confirm(
      "Delete invoice?",
      `Invoice "${inv.no}" will be permanently deleted.`,
    );
    if (!ok) return;
    deleteInvoiceFull(inv.id);
    toast("Invoice deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">GST Invoices</h2>
          <p className="text-xs text-gray-500">
            {data.invoices.length} invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox
            value={tbl.query}
            onChange={tbl.setQuery}
            placeholder="Search by customer, invoice no, PO no…"
          />
          <button
            type="button"
            onClick={() => setDialog({ mode: "create" })}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white whitespace-nowrap"
          >
            + New Invoice
          </button>
        </div>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">
                <SortHeader
                  label="INV No."
                  col="no"
                  sortKey={tbl.sortKey}
                  sortDesc={tbl.sortDesc}
                  onSort={tbl.toggleSort}
                />
              </th>
              <th className="text-left p-2.5">Customer</th>
              <th className="text-left p-2.5">PO No.</th>
              <th className="text-left p-2.5">Date</th>
              <th className="text-left p-2.5">Due</th>
              <th className="text-left p-2.5">
                <SortHeader
                  label="Total"
                  col="amount"
                  sortKey={tbl.sortKey}
                  sortDesc={tbl.sortDesc}
                  onSort={tbl.toggleSort}
                />
              </th>
              <th className="text-left p-2.5">Paid</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Update</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((inv) => {
              const cust = data.customers.find((c) => c.id === inv.customerId);
              const overdue = daysOverdue(inv.dueDate, inv.status);
              return (
                <tr key={inv.id} className="border-b last:border-0">
                  <td className="p-2.5 font-mono font-semibold">{inv.no}</td>
                  <td className="p-2.5">{cust?.name ?? "—"}</td>
                  <td className="p-2.5 font-mono">{inv.poNumber || "—"}</td>
                  <td className="p-2.5 text-gray-500">{inv.invoiceDate}</td>
                  <td className="p-2.5">
                    <span
                      className={
                        overdue > 0
                          ? "text-red-600 font-semibold"
                          : "text-gray-500"
                      }
                    >
                      {inv.dueDate || "—"}
                      {overdue > 0 ? ` (${overdue}d overdue)` : ""}
                    </span>
                  </td>
                  <td className="p-2.5 font-semibold">
                    ₹{inv.amount.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2.5 text-emerald-700">
                    ₹{inv.paidAmount.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2.5">
                    <StatusBadge
                      status={inv.status}
                      tone={
                        inv.status === "Paid"
                          ? "success"
                          : overdue > 0
                            ? "danger"
                            : "warning"
                      }
                    />
                  </td>
                  <td className="p-2.5">
                    {inv.invoiceType === "proforma" ? (
                      <span className="text-gray-400 italic">
                        Document only
                      </span>
                    ) : (
                      <select
                        className="h-7 text-xs rounded-lg border px-1.5"
                        value={inv.status}
                        onChange={(e) =>
                          updateInvoiceStatus(
                            inv.id,
                            e.target.value as import("../data").InvoiceStatus,
                          )
                        }
                      >
                        {(["Unpaid", "PartiallyPaid", "Paid"] as const).map(
                          (s) => (
                            <option key={s} value={s}>
                              {s === "PartiallyPaid" ? "Partially Paid" : s}
                            </option>
                          ),
                        )}
                      </select>
                    )}
                  </td>
                  <td className="p-2.5">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 max-w-[200px]">
                      <button
                        type="button"
                        onClick={() => setViewing(inv)}
                        className="text-blue-600 font-semibold"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDialog({ mode: "edit", invoice: inv })
                        }
                        className="text-blue-600 font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toast(`Print requested for ${inv.no}`)}
                        className="text-gray-500 font-semibold"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          toast(`${inv.no} downloaded (simulated)`)
                        }
                        className="text-gray-500 font-semibold"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => toast(`Share link copied for ${inv.no}`)}
                        className="text-gray-500 font-semibold"
                      >
                        Share
                      </button>
                      <button
                        type="button"
                        onClick={() => doDelete(inv)}
                        className="text-red-600 font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-gray-400">
                  No invoices
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <InvoiceFormDialog
          editing={dialog.mode === "edit" ? dialog.invoice : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border shadow-lg w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold">{viewing.no}</h3>
              <button
                type="button"
                onClick={() => setViewing(null)}
                aria-label="Close"
                className="text-gray-400"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              {viewing.lineItems.map((li, i) => (
                <div
                  key={`v-${i}-${li.desc}`}
                  className="flex justify-between border-b pb-1"
                >
                  <span>
                    {li.desc} ({li.qty} × ₹{li.rate.toLocaleString("en-IN")})
                  </span>
                  <span className="font-mono">
                    ₹{li.amount.toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
              <div className="flex justify-between font-bold pt-1">
                <span>Total</span>
                <span>₹{viewing.amount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Paid</span>
                <span>₹{viewing.paidAmount.toLocaleString("en-IN")}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onNavigate("project", viewing.projectId);
                setViewing(null);
              }}
              className="mt-3 text-xs font-semibold text-blue-600"
            >
              Open project →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Real pages/Payments.tsx "Payments" tab: pending-invoices summary
// strip, real payments log, Record Payment dialog with the real
// overpayment guard. See PARITY_TRACKER.md #7 — production's real
// "Receivables" reminder tab (WhatsApp/Email scheduling) is a disclosed
// gap; production itself has no Edit/Delete on payment records either,
// so the lab correctly has none.
function RecordPaymentDialog({
  onCancel,
  onSaved,
}: { onCancel: () => void; onSaved: () => void }) {
  const { data, addPayment } = useUxLabStore();
  const toast = useToast();
  const unpaid = data.invoices.filter(
    (i) => i.status !== "Paid" && i.invoiceType !== "proforma",
  );
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("NEFT");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedInvoice = data.invoices.find((i) => i.id === invoiceId);
  const remaining = selectedInvoice
    ? selectedInvoice.amount - selectedInvoice.paidAmount
    : 0;

  const submit = async () => {
    if (!invoiceId || !amount) {
      setError("Invoice and amount required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    const result = addPayment({
      invoiceId,
      amount: Number(amount),
      date,
      method,
      referenceNo,
      notes,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("Payment recorded");
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">Record Payment</h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="rp-invoice"
            >
              Invoice <span className="text-red-600">*</span>
            </label>
            <select
              id="rp-invoice"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                setError("");
              }}
            >
              <option value="">Choose…</option>
              {unpaid.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.no} — ₹{(i.amount - i.paidAmount).toLocaleString("en-IN")}{" "}
                  due
                </option>
              ))}
            </select>
            {selectedInvoice && (
              <p className="text-[11px] text-gray-500 mt-1">
                Remaining balance: ₹{remaining.toLocaleString("en-IN")}
              </p>
            )}
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="rp-amount"
            >
              Amount <span className="text-red-600">*</span>
            </label>
            <input
              id="rp-amount"
              type="number"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="rp-date"
              >
                Date
              </label>
              <input
                id="rp-date"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="rp-mode"
              >
                Mode
              </label>
              <select
                id="rp-mode"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {["Cash", "Cheque", "NEFT", "RTGS", "UPI"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="rp-ref"
            >
              Reference No.
            </label>
            <input
              id="rp-ref"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="rp-notes"
            >
              Notes
            </label>
            <textarea
              id="rp-notes"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Record Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PaymentsScreen() {
  const { data } = useUxLabStore();
  const [open, setOpen] = useState(false);
  const sorted = [...data.payments].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const unpaid = data.invoices.filter(
    (i) => i.status !== "Paid" && i.invoiceType !== "proforma",
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Payments</h2>
          <p className="text-xs text-gray-500">
            {sorted.length} payments recorded
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white whitespace-nowrap"
        >
          + Record Payment
        </button>
      </div>
      {unpaid.length > 0 && (
        <div className="rounded-lg border bg-amber-50 border-amber-200 p-3">
          <p className="text-xs font-semibold text-amber-800 mb-2">
            {unpaid.length} invoice(s) with pending payment
          </p>
          <div className="flex flex-wrap gap-2">
            {unpaid.map((inv) => (
              <div
                key={inv.id}
                className="text-[11px] bg-white rounded-lg border border-amber-200 px-2 py-1"
              >
                <span className="font-mono font-semibold">{inv.no}</span>{" "}
                <span className="text-red-600 font-semibold">
                  ₹{(inv.amount - inv.paidAmount).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">Date</th>
              <th className="text-left p-2.5">Invoice</th>
              <th className="text-left p-2.5">Customer</th>
              <th className="text-left p-2.5">Amount</th>
              <th className="text-left p-2.5">Mode</th>
              <th className="text-left p-2.5">Reference</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const inv = data.invoices.find((i) => i.id === p.invoiceId);
              const cust = data.customers.find((c) => c.id === inv?.customerId);
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-2.5 text-gray-500">{p.date}</td>
                  <td className="p-2.5 font-mono">{inv?.no ?? "—"}</td>
                  <td className="p-2.5">{cust?.name ?? "—"}</td>
                  <td className="p-2.5 font-semibold text-emerald-700">
                    ₹{p.amount.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2.5">
                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                      {p.method}
                    </span>
                  </td>
                  <td className="p-2.5 font-mono text-gray-500">
                    {p.referenceNo || "—"}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  No payments recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <RecordPaymentDialog
          onCancel={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// Real pages/Payables.tsx: real payment types (Material/CNC/Transport/
// Salary/Outsourcing/Other), Add Payable, Add Payment against a payable
// with the real overpayment guard, real status computation (Paid/
// Partial/Pending/Overdue), stats row, Delete. See PARITY_TRACKER.md #8.
// Not reproduced: payment-attachment upload (disclosed gap, same as
// every other module).
const PAYABLE_TYPES = [
  "Material",
  "CNC",
  "Transport",
  "Salary",
  "Outsourcing",
  "Other",
];

function payableStatus(
  p: import("../data").Payable,
): "Paid" | "Overdue" | "Partial" | "Pending" {
  if (p.paidAmount >= p.amount) return "Paid";
  if (p.dueDate && new Date(p.dueDate) < new Date() && p.paidAmount < p.amount)
    return "Overdue";
  if (p.paidAmount > 0) return "Partial";
  return "Pending";
}

function AddPayableDialog({
  onCancel,
  onSaved,
}: { onCancel: () => void; onSaved: () => void }) {
  const { data, addPayable } = useUxLabStore();
  const toast = useToast();
  const [vendorId, setVendorId] = useState("");
  const [paymentType, setPaymentType] = useState("Material");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!vendorId || !amount) {
      setError("Vendor and total amount are required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    addPayable({
      vendorId,
      paymentType,
      amount: Number(amount),
      dueDate,
      projectId: projectId || null,
      notes,
    });
    setSaving(false);
    toast("Payable added");
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">Add Payable</h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ap-vendor"
            >
              Vendor <span className="text-red-600">*</span>
            </label>
            <select
              id="ap-vendor"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={vendorId}
              onChange={(e) => {
                setVendorId(e.target.value);
                setError("");
              }}
            >
              <option value="">Choose…</option>
              {data.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ap-type"
            >
              Payment Type
            </label>
            <select
              id="ap-type"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            >
              {PAYABLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ap-amount"
            >
              Total Amount <span className="text-red-600">*</span>
            </label>
            <input
              id="ap-amount"
              type="number"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ap-due"
            >
              Due Date
            </label>
            <input
              id="ap-due"
              type="date"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ap-project"
            >
              Project (optional)
            </label>
            <select
              id="ap-project"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">None</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.no}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ap-notes"
            >
              Notes
            </label>
            <textarea
              id="ap-notes"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add Payable"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPayablePaymentDialog({
  payable,
  onCancel,
  onSaved,
}: {
  payable: import("../data").Payable;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { addPayablePayment } = useUxLabStore();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [mode, setMode] = useState("NEFT");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const balance = payable.amount - payable.paidAmount;

  const submit = async () => {
    const amt = Number(amount);
    if (!amount || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    const result = addPayablePayment({
      payableId: payable.id,
      amount: amt,
      paymentDate,
      mode,
      referenceNo,
      notes,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("Payment recorded");
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-1">Add Payment</h3>
        <p className="text-[11px] text-gray-500 mb-3">
          Remaining balance: ₹{balance.toLocaleString("en-IN")}
        </p>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="app-amount"
            >
              Amount <span className="text-red-600">*</span>
            </label>
            <input
              id="app-amount"
              type="number"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="app-date"
              >
                Date
              </label>
              <input
                id="app-date"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="app-mode"
              >
                Mode
              </label>
              <select
                id="app-mode"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                {["Cash", "Cheque", "NEFT", "RTGS", "UPI"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="app-ref"
            >
              Reference No.
            </label>
            <input
              id="app-ref"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="app-notes"
            >
              Notes
            </label>
            <textarea
              id="app-notes"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PayablesScreen({
  onNavigate,
}: { onNavigate: (view: string, id: string) => void }) {
  const { data, deletePayableFull } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<import("../data").Payable | null>(
    null,
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const totalPayables = data.payables.reduce((s, p) => s + p.amount, 0);
  const totalPaid = data.payables.reduce((s, p) => s + p.paidAmount, 0);
  const overdueCount = data.payables.filter(
    (p) => payableStatus(p) === "Overdue",
  ).length;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const doDelete = async (p: import("../data").Payable) => {
    const ok = await confirm(
      "Delete payable?",
      "This payable and its payment history will be permanently deleted.",
    );
    if (!ok) return;
    deletePayableFull(p.id);
    toast("Payable deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold">Payables</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + Add Payable
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold">
            ₹{totalPayables.toLocaleString("en-IN")}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Total</p>
        </div>
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold text-emerald-700">
            ₹{totalPaid.toLocaleString("en-IN")}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Paid</p>
        </div>
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold text-amber-700">
            ₹{(totalPayables - totalPaid).toLocaleString("en-IN")}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Outstanding</p>
        </div>
        <div className="rounded-lg border bg-red-50 border-red-200 p-2.5 text-center">
          <p className="text-sm font-bold text-red-700">{overdueCount}</p>
          <p className="text-[10px] text-red-600 uppercase">Overdue</p>
        </div>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="p-2.5" />
              <th className="text-left p-2.5">Vendor</th>
              <th className="text-left p-2.5">Type</th>
              <th className="text-left p-2.5">Amount</th>
              <th className="text-left p-2.5">Balance</th>
              <th className="text-left p-2.5">Due</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.payables.map((p) => {
              const vendor = data.vendors.find((v) => v.id === p.vendorId);
              const balance = p.amount - p.paidAmount;
              const status = payableStatus(p);
              const pays = data.payablePayments.filter(
                (pp) => pp.payableId === p.id,
              );
              const isOpen = expanded.has(p.id);
              return (
                <Fragment key={p.id}>
                  <tr className="border-b last:border-0">
                    <td className="p-2.5">
                      <button
                        type="button"
                        onClick={() => toggle(p.id)}
                        aria-label="Toggle payment history"
                        className="text-gray-400"
                      >
                        {isOpen ? "▾" : "▸"}
                      </button>
                    </td>
                    <td className="p-2.5">
                      <button
                        type="button"
                        onClick={() => onNavigate("vendor", p.vendorId)}
                        className="text-blue-600 font-semibold"
                      >
                        {vendor?.name ?? "—"}
                      </button>
                    </td>
                    <td className="p-2.5">{p.paymentType}</td>
                    <td className="p-2.5 font-semibold">
                      ₹{p.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2.5">
                      ₹{balance.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2.5 text-gray-500">{p.dueDate || "—"}</td>
                    <td className="p-2.5">
                      <StatusBadge
                        status={status}
                        tone={
                          status === "Paid"
                            ? "success"
                            : status === "Overdue"
                              ? "danger"
                              : "warning"
                        }
                      />
                    </td>
                    <td className="p-2.5">
                      <div className="flex gap-2">
                        {balance > 0 && (
                          <button
                            type="button"
                            onClick={() => setPayTarget(p)}
                            className="text-emerald-600 font-semibold"
                          >
                            Add Payment
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => doDelete(p)}
                          className="text-red-600 font-semibold"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${p.id}-detail`} className="bg-gray-50">
                      <td colSpan={8} className="p-2.5">
                        {pays.length === 0 ? (
                          <p className="text-[11px] text-gray-400">
                            No payments recorded yet.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {pays.map((pp) => (
                              <div
                                key={pp.id}
                                className="flex justify-between text-[11px]"
                              >
                                <span>
                                  {pp.paymentDate} · {pp.mode}{" "}
                                  {pp.referenceNo && `· ${pp.referenceNo}`}
                                </span>
                                <span className="font-mono">
                                  ₹{pp.amount.toLocaleString("en-IN")}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {data.payables.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400">
                  No payables recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {addOpen && (
        <AddPayableDialog
          onCancel={() => setAddOpen(false)}
          onSaved={() => setAddOpen(false)}
        />
      )}
      {payTarget && (
        <AddPayablePaymentDialog
          payable={payTarget}
          onCancel={() => setPayTarget(null)}
          onSaved={() => setPayTarget(null)}
        />
      )}
    </div>
  );
}

// Real pages/Inventory.tsx: real category taxonomy, Add/Edit/Delete
// Item, Record Purchase (increments stock + updates last purchase
// price). See PARITY_TRACKER.md #9. Not reproduced: category-specific
// conditional fields, Reserved/Available stock split, file attachments,
// material-usage tracking — all disclosed gaps.
const INVENTORY_CATEGORIES: {
  value: import("../data").InventoryCategory;
  label: string;
}[] = [
  { value: "raw_material", label: "Raw Material" },
  { value: "consumable", label: "Consumable" },
  { value: "spare_part", label: "Spare Part" },
  { value: "powder_coating_powder", label: "Powder Coating Powder" },
  { value: "pretreatment_chemical", label: "Pretreatment Chemical" },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  INVENTORY_CATEGORIES.map((c) => [c.value, c.label]),
);

function ItemFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").InventoryItem | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { addInventoryItemFull, updateInventoryItemFields } = useUxLabStore();
  const toast = useToast();
  const [sku, setSku] = useState(editing?.sku ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState<import("../data").InventoryCategory>(
    editing?.category ?? "raw_material",
  );
  const [reorderAt, setReorderAt] = useState(String(editing?.reorderAt ?? ""));
  const [unit, setUnit] = useState(editing?.unit ?? "pcs");
  const [unitCost, setUnitCost] = useState(String(editing?.unitCost ?? ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError("Material name is required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    const fields = {
      sku,
      name: name.trim(),
      category,
      reorderAt: Number(reorderAt) || 0,
      unit,
      unitCost: Number(unitCost) || 0,
    };
    if (editing) {
      updateInventoryItemFields(editing.id, fields);
      toast("Item updated");
    } else {
      const item = addInventoryItemFull(fields);
      toast(`${item.name} added to inventory`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Material" : "Add Material"}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ii-name"
            >
              Material Name <span className="text-red-600">*</span>
            </label>
            <input
              id="ii-name"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ii-sku"
              >
                SKU
              </label>
              <input
                id="ii-sku"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ii-unit"
              >
                Unit
              </label>
              <input
                id="ii-unit"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ii-category"
            >
              Category
            </label>
            <select
              id="ii-category"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={category}
              onChange={(e) =>
                setCategory(
                  e.target.value as import("../data").InventoryCategory,
                )
              }
            >
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ii-reorder"
              >
                Reorder Level
              </label>
              <input
                id="ii-reorder"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={reorderAt}
                onChange={(e) => setReorderAt(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ii-cost"
              >
                Unit Cost ₹
              </label>
              <input
                id="ii-cost"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Material"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordPurchaseDialog({
  item,
  onCancel,
  onSaved,
}: {
  item: import("../data").InventoryItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { data, addInventoryPurchaseFull } = useUxLabStore();
  const toast = useToast();
  const [vendorId, setVendorId] = useState("");
  const [quantityPurchased, setQuantityPurchased] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [cost, setCost] = useState("");
  const [applyGST, setApplyGST] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!vendorId || !quantityPurchased || !cost) {
      setError("Vendor, quantity, and cost are required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    addInventoryPurchaseFull({
      itemId: item.id,
      vendorId,
      quantityPurchased: Number(quantityPurchased),
      purchaseDate,
      cost: Number(cost),
      applyGST,
    });
    setSaving(false);
    toast(`Purchase recorded for ${item.name}`);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">
          Record Purchase — {item.name}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="rpi-vendor"
            >
              Vendor <span className="text-red-600">*</span>
            </label>
            <select
              id="rpi-vendor"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={vendorId}
              onChange={(e) => {
                setVendorId(e.target.value);
                setError("");
              }}
            >
              <option value="">Choose…</option>
              {data.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="rpi-qty"
              >
                Quantity <span className="text-red-600">*</span>
              </label>
              <input
                id="rpi-qty"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={quantityPurchased}
                onChange={(e) => {
                  setQuantityPurchased(e.target.value);
                  setError("");
                }}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="rpi-cost"
              >
                Total Cost ₹ <span className="text-red-600">*</span>
              </label>
              <input
                id="rpi-cost"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={cost}
                onChange={(e) => {
                  setCost(e.target.value);
                  setError("");
                }}
              />
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="rpi-date"
            >
              Purchase Date
            </label>
            <input
              id="rpi-date"
              type="date"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={applyGST}
              onChange={(e) => setApplyGST(e.target.checked)}
            />
            Apply GST (18%)
          </label>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Record Purchase"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InventoryScreen() {
  const { data, deleteInventoryItemFull } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"stock" | "purchases">("stock");
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; item: import("../data").InventoryItem }
    | null
  >(null);
  const [purchaseTarget, setPurchaseTarget] = useState<
    import("../data").InventoryItem | null
  >(null);
  const tbl = useTableControls(
    data.inventory.filter(
      (i) => categoryFilter === "all" || i.category === categoryFilter,
    ),
    (i) => `${i.sku} ${i.name}`,
    "name",
  );

  const doDelete = async (item: import("../data").InventoryItem) => {
    const ok = await confirm(
      "Delete material?",
      `"${item.name}" will be permanently deleted.`,
    );
    if (!ok) return;
    deleteInventoryItemFull(item.id);
    toast("Material deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold">Inventory</h2>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + Add Material
        </button>
      </div>
      <div className="flex gap-1.5 border-b">
        <button
          type="button"
          onClick={() => setActiveTab("stock")}
          className={`text-xs font-semibold px-3 py-2 ${activeTab === "stock" ? "border-b-2 border-gray-900" : "text-gray-500"}`}
        >
          Stock
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("purchases")}
          className={`text-xs font-semibold px-3 py-2 ${activeTab === "purchases" ? "border-b-2 border-gray-900" : "text-gray-500"}`}
        >
          Purchases
        </button>
      </div>
      {activeTab === "stock" ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <SearchBox
              value={tbl.query}
              onChange={tbl.setQuery}
              placeholder="Search materials…"
            />
            <select
              className="h-8 text-xs rounded-lg border px-2"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left p-2.5">Material Name</th>
                  <th className="text-left p-2.5">Category</th>
                  <th className="text-left p-2.5">Unit</th>
                  <th className="text-left p-2.5">Total Stock</th>
                  <th className="text-left p-2.5">Reserved</th>
                  <th className="text-left p-2.5">Available</th>
                  <th className="text-left p-2.5">Reorder At</th>
                  <th className="text-left p-2.5">Unit Cost</th>
                  <th className="text-left p-2.5">Last Purchase</th>
                  <th className="text-left p-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tbl.rows.map((item) => {
                  const available = item.qty - item.reserved;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b last:border-0 ${available <= item.reorderAt ? "bg-amber-50" : ""}`}
                    >
                      <td className="p-2.5 font-semibold">{item.name}</td>
                      <td className="p-2.5">{CATEGORY_LABEL[item.category]}</td>
                      <td className="p-2.5">{item.unit}</td>
                      <td className="p-2.5">{item.qty}</td>
                      <td className="p-2.5 text-gray-500">
                        {item.reserved > 0 ? item.reserved : "—"}
                      </td>
                      <td className="p-2.5 font-semibold">
                        {available}
                        {available <= item.reorderAt && (
                          <span className="ml-1 text-amber-600 font-semibold">
                            low
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-gray-500">{item.reorderAt}</td>
                      <td className="p-2.5">
                        ₹{item.unitCost.toLocaleString("en-IN")}
                      </td>
                      <td className="p-2.5 text-gray-500">
                        {item.lastPurchaseDate || "—"}
                      </td>
                      <td className="p-2.5">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPurchaseTarget(item)}
                            className="text-emerald-600 font-semibold"
                          >
                            Record Purchase
                          </button>
                          <button
                            type="button"
                            onClick={() => setDialog({ mode: "edit", item })}
                            className="text-blue-600 font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => doDelete(item)}
                            className="text-red-600 font-semibold"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {tbl.rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-gray-400">
                      No materials found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-xl border bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-left p-2.5">Material</th>
                <th className="text-left p-2.5">Vendor</th>
                <th className="text-left p-2.5">Date</th>
                <th className="text-left p-2.5">Qty</th>
                <th className="text-left p-2.5">Cost</th>
              </tr>
            </thead>
            <tbody>
              {[...data.inventoryPurchases]
                .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
                .map((p) => {
                  const vendor = data.vendors.find((v) => v.id === p.vendorId);
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="p-2.5 font-semibold">{p.materialName}</td>
                      <td className="p-2.5">{vendor?.name ?? "—"}</td>
                      <td className="p-2.5 text-gray-500">{p.purchaseDate}</td>
                      <td className="p-2.5">{p.quantityPurchased}</td>
                      <td className="p-2.5">
                        ₹{p.cost.toLocaleString("en-IN")}
                        {p.applyGST && " (+GST)"}
                      </td>
                    </tr>
                  );
                })}
              {data.inventoryPurchases.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    No purchases recorded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {dialog && (
        <ItemFormDialog
          editing={dialog.mode === "edit" ? dialog.item : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {purchaseTarget && (
        <RecordPurchaseDialog
          item={purchaseTarget}
          onCancel={() => setPurchaseTarget(null)}
          onSaved={() => setPurchaseTarget(null)}
        />
      )}
    </div>
  );
}

// Real pages/Machinery.tsx: real 5-status/12-type taxonomy, KPI row
// (Total/Operational/Breakdown/Service Overdue), status+type filters,
// search, Add/Edit — production has no Delete for machines. Service-due
// badge logic reproduced exactly (overdue/due-soon/normal). See
// PARITY_TRACKER.md #10. Not reproduced: warranty tracking, AMC
// contract, purchase cost/vendor, service-record log.
const MACHINE_TYPES: import("../data").MachineType[] = [
  "Laser Cutting",
  "CNC",
  "Welding",
  "Bending",
  "Powder Coating",
  "Compressor",
  "Generator",
  "Drilling",
  "Grinding",
  "Forklift",
  "Testing",
  "Air Tool",
  "Other",
];
const MACHINE_STATUSES: import("../data").MachineStatus[] = [
  "Operational",
  "Under Maintenance",
  "Breakdown",
  "Idle",
  "Decommissioned",
];

function ServiceDueBadge({ nextServiceDue }: { nextServiceDue: string }) {
  if (!nextServiceDue) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextServiceDue);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0)
    return (
      <span className="text-[11px] text-red-600 font-semibold">
        Service overdue {Math.abs(diffDays)}d
      </span>
    );
  if (diffDays <= 14)
    return (
      <span className="text-[11px] text-amber-600 font-semibold">
        Service in {diffDays}d
      </span>
    );
  return (
    <span className="text-[11px] text-gray-500">Next: {nextServiceDue}</span>
  );
}

function MachineFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").Machine | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { addMachineFull, updateMachineFields } = useUxLabStore();
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<import("../data").MachineType>(
    editing?.type ?? "Other",
  );
  const [status, setStatus] = useState<import("../data").MachineStatus>(
    editing?.status ?? "Operational",
  );
  const [location, setLocation] = useState(editing?.location ?? "");
  const [department, setDepartment] = useState(editing?.department ?? "");
  const [hourlyRate, setHourlyRate] = useState(
    String(editing?.hourlyRate ?? ""),
  );
  const [nextServiceDue, setNextServiceDue] = useState(
    editing?.nextServiceDue ?? "",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError("Machine name is required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    const fields = {
      name: name.trim(),
      type,
      status,
      location,
      department,
      hourlyRate: Number(hourlyRate) || 0,
      nextServiceDue,
    };
    if (editing) {
      updateMachineFields(editing.id, fields);
      toast("Machine updated");
    } else {
      addMachineFull(fields);
      toast("Machine added");
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Machine" : "Add New Machine"}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="mf-name"
            >
              Machine Name <span className="text-red-600">*</span>
            </label>
            <input
              id="mf-name"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="mf-type"
              >
                Type
              </label>
              <select
                id="mf-type"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as import("../data").MachineType)
                }
              >
                {MACHINE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="mf-status"
              >
                Status
              </label>
              <select
                id="mf-status"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as import("../data").MachineStatus)
                }
              >
                {MACHINE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="mf-loc"
              >
                Location
              </label>
              <input
                id="mf-loc"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="mf-dept"
              >
                Department
              </label>
              <input
                id="mf-dept"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="mf-rate"
              >
                Hourly Rate ₹
              </label>
              <input
                id="mf-rate"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="mf-service"
              >
                Next Service
              </label>
              <input
                id="mf-service"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={nextServiceDue}
                onChange={(e) => setNextServiceDue(e.target.value)}
              />
            </div>
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Machine"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MachineryScreen() {
  const { data } = useUxLabStore();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; machine: import("../data").Machine }
    | null
  >(null);
  const filtered = data.machines.filter(
    (m) =>
      (statusFilter === "all" || m.status === statusFilter) &&
      (typeFilter === "all" || m.type === typeFilter),
  );
  const tbl = useTableControls(
    filtered,
    (m) => `${m.name} ${m.machineCode}`,
    "name",
  );

  const kpis = {
    total: data.machines.length,
    operational: data.machines.filter((m) => m.status === "Operational").length,
    breakdown: data.machines.filter((m) => m.status === "Breakdown").length,
    serviceOverdue: data.machines.filter(
      (m) => m.nextServiceDue && new Date(m.nextServiceDue) < new Date(),
    ).length,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold">Machinery</h2>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + Add Machine
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold">{kpis.total}</p>
          <p className="text-[10px] text-gray-500 uppercase">Total</p>
        </div>
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold text-emerald-700">
            {kpis.operational}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Operational</p>
        </div>
        <div className="rounded-lg border bg-red-50 border-red-200 p-2.5 text-center">
          <p className="text-sm font-bold text-red-700">{kpis.breakdown}</p>
          <p className="text-[10px] text-red-600 uppercase">Breakdown</p>
        </div>
        <div className="rounded-lg border bg-amber-50 border-amber-200 p-2.5 text-center">
          <p className="text-sm font-bold text-amber-700">
            {kpis.serviceOverdue}
          </p>
          <p className="text-[10px] text-amber-600 uppercase">
            Service Overdue
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox
          value={tbl.query}
          onChange={tbl.setQuery}
          placeholder="Search machines…"
        />
        <select
          className="h-8 text-xs rounded-lg border px-2"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {MACHINE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="h-8 text-xs rounded-lg border px-2"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All types</option>
          {MACHINE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">Machine</th>
              <th className="text-left p-2.5">Type</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Location</th>
              <th className="text-left p-2.5">Hourly Rate</th>
              <th className="text-left p-2.5">Service</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="p-2.5 font-semibold">
                  {m.name}
                  <span className="block text-[10px] text-gray-400 font-mono">
                    {m.machineCode}
                  </span>
                </td>
                <td className="p-2.5">{m.type}</td>
                <td className="p-2.5">
                  <StatusBadge
                    status={m.status}
                    tone={
                      m.status === "Operational"
                        ? "success"
                        : m.status === "Breakdown"
                          ? "danger"
                          : "warning"
                    }
                  />
                </td>
                <td className="p-2.5 text-gray-500">{m.location || "—"}</td>
                <td className="p-2.5">
                  ₹{m.hourlyRate.toLocaleString("en-IN")}
                </td>
                <td className="p-2.5">
                  <ServiceDueBadge nextServiceDue={m.nextServiceDue} />
                </td>
                <td className="p-2.5">
                  <button
                    type="button"
                    onClick={() => setDialog({ mode: "edit", machine: m })}
                    className="text-blue-600 font-semibold"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No machines found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <MachineFormDialog
          editing={dialog.mode === "edit" ? dialog.machine : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
    </div>
  );
}

const TOOL_STATUSES: import("../data").ToolStatus[] = [
  "Available",
  "In Use",
  "Under Repair",
  "Lost",
  "Retired",
];
const TOOL_CONDITIONS: import("../data").ToolCondition[] = [
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "Critical",
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Real Tools Add/Edit dialog: name/category/quantity/status/condition/
// location/assigned employee/purchase date/replacement value/vendor/
// notes/photo — matches pages/Tools.tsx (see PARITY_TRACKER.md #11).
function ToolFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").Tool | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { data, addToolFull, updateToolFields } = useUxLabStore();
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [quantity, setQuantity] = useState(String(editing?.quantity ?? 1));
  const [status, setStatus] = useState<import("../data").ToolStatus>(
    editing?.status ?? "Available",
  );
  const [condition, setCondition] = useState<
    import("../data").ToolCondition | ""
  >(editing?.condition ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(
    editing?.assignedEmployeeId ?? "",
  );
  const [purchaseDate, setPurchaseDate] = useState(editing?.purchaseDate ?? "");
  const [replacementValue, setReplacementValue] = useState(
    String(editing?.replacementValue ?? ""),
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [photoData, setPhotoData] = useState(editing?.photoData ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError("Tool name is required");
      return;
    }
    if (!status) {
      setError("Status is required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    const fields = {
      name: name.trim(),
      category: category || undefined,
      quantity: Number(quantity) || 1,
      location: location || undefined,
      assignedEmployeeId: assignedEmployeeId || undefined,
      condition: condition || undefined,
      status,
      purchaseDate: purchaseDate || undefined,
      replacementValue: replacementValue ? Number(replacementValue) : undefined,
      notes: notes || undefined,
      photoData: photoData || undefined,
    };
    if (editing) {
      updateToolFields(editing.id, fields);
      toast("Tool updated");
    } else {
      const t = addToolFull(fields);
      toast(`Tool ${t.toolCode} added`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Tool" : "Add Tool"}
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              <span className="text-[11px] font-semibold text-gray-500 block">
                Photo
              </span>
              <label className="mt-1 flex items-center justify-center w-14 h-14 rounded-lg border border-dashed cursor-pointer overflow-hidden text-[10px] text-gray-400">
                {photoData ? (
                  <img
                    src={photoData}
                    alt="Tool"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  "Upload"
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setPhotoData(await fileToDataUrl(file));
                  }}
                />
              </label>
            </div>
            <div className="flex-1">
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="tf-name"
              >
                Tool Name <span className="text-red-600">*</span>
              </label>
              <input
                id="tf-name"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                placeholder="e.g. Digital Vernier Caliper"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="tf-category"
              >
                Category
              </label>
              <input
                id="tf-category"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="tf-qty"
              >
                Quantity
              </label>
              <input
                id="tf-qty"
                type="number"
                min={1}
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="tf-status"
              >
                Status <span className="text-red-600">*</span>
              </label>
              <select
                id="tf-status"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as import("../data").ToolStatus)
                }
              >
                {TOOL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="tf-condition"
              >
                Condition
              </label>
              <select
                id="tf-condition"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={condition}
                onChange={(e) =>
                  setCondition(
                    e.target.value as import("../data").ToolCondition,
                  )
                }
              >
                <option value="">Select condition</option>
                {TOOL_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="tf-location"
              >
                Location
              </label>
              <input
                id="tf-location"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Tool Crib A"
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="tf-assigned"
              >
                Assigned To
              </label>
              <select
                id="tf-assigned"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={assignedEmployeeId}
                onChange={(e) => setAssignedEmployeeId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {data.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="tf-purchase-date"
              >
                Purchase Date
              </label>
              <input
                id="tf-purchase-date"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="tf-value"
              >
                Replacement Value ₹
              </label>
              <input
                id="tf-value"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={replacementValue}
                onChange={(e) => setReplacementValue(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="tf-notes"
            >
              Notes
            </label>
            <textarea
              id="tf-notes"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Tool"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Tools History panel: current holder + purchase recap, Issue/
// Reassign/Return controls, and the full insert-only assignment log —
// matches pages/Tools.tsx (see PARITY_TRACKER.md #11).
function ToolHistoryDialog({
  tool,
  onClose,
}: {
  tool: import("../data").Tool;
  onClose: () => void;
}) {
  const { data, issueTool, returnTool } = useUxLabStore();
  const toast = useToast();
  const [pick, setPick] = useState("");
  const employeeName = (id?: string) =>
    data.employees.find((e) => e.id === id)?.name;
  const log = data.toolAssignmentHistory
    .filter((h) => h.toolId === tool.id)
    .sort((a, b) => b.recordedAt - a.recordedAt);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold mb-3">{tool.name} — History</h3>
        <div className="rounded-lg border p-3 space-y-1 text-xs mb-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Current Holder</span>
            <span className="font-semibold">
              {employeeName(tool.assignedEmployeeId) || "Unassigned"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Purchase Vendor</span>
            <span>{tool.purchaseVendorName || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Replacement Value</span>
            <span>
              {tool.replacementValue ? `₹${tool.replacementValue}` : "—"}
            </span>
          </div>
        </div>
        <div className="space-y-1.5 mb-3">
          <span className="text-[11px] font-semibold text-gray-500">
            {tool.assignedEmployeeId ? "Change Holder / Reassign" : "Issue To"}
          </span>
          <div className="flex items-center gap-2">
            <select
              className="flex-1 h-8 text-xs rounded-lg border px-2"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              <option value="">Select employee…</option>
              {data.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!pick}
              onClick={() => {
                issueTool(tool.id, pick);
                toast(`Issued to ${employeeName(pick)}`);
                setPick("");
              }}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-40"
            >
              {tool.assignedEmployeeId ? "Reassign" : "Issue"}
            </button>
          </div>
          {tool.assignedEmployeeId && (
            <button
              type="button"
              onClick={() => {
                returnTool(tool.id);
                toast("Tool returned");
              }}
              className="text-xs font-semibold px-3 py-2 rounded-lg border"
            >
              Return
            </button>
          )}
        </div>
        <div>
          <span className="text-[11px] font-semibold text-gray-500">
            Assignment Log
          </span>
          <div className="mt-1 rounded-lg border max-h-48 overflow-y-auto">
            {log.length === 0 ? (
              <p className="p-3 text-xs text-gray-400 text-center">
                No assignment history yet.
              </p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {log.map((h) => (
                    <tr key={h.id} className="border-t first:border-t-0">
                      <td className="p-2 whitespace-nowrap text-gray-500">
                        {new Date(h.recordedAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="p-2">
                        <StatusBadge
                          status={h.action === "issued" ? "Issued" : "Returned"}
                          tone={h.action === "issued" ? "success" : "neutral"}
                        />
                      </td>
                      <td className="p-2">
                        {h.action === "issued"
                          ? employeeName(h.employeeId) || "—"
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Tools list: KPI row, status filter + search, photo thumbnail,
// Add/Edit/Delete, History panel with Issue/Reassign/Return — matches
// pages/Tools.tsx (see PARITY_TRACKER.md #11). Disclosed gap: RBAC
// gating on Issue/Return ("tools.assign" permission) is not enforced,
// consistent with the Role Layer being presentation-level throughout
// this prototype.
export function ToolsScreen() {
  const { data, deleteRecord } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; tool: import("../data").Tool } | null
  >(null);
  const [historyTool, setHistoryTool] = useState<import("../data").Tool | null>(
    null,
  );

  const active = data.tools.filter((t) => t.isActive !== false);
  const filtered = active.filter(
    (t) => statusFilter === "all" || t.status === statusFilter,
  );
  const tbl = useTableControls(
    filtered,
    (t) => `${t.name} ${t.toolCode}`,
    "name",
  );
  const employeeName = (id?: string) =>
    data.employees.find((e) => e.id === id)?.name;

  const kpis = {
    total: active.length,
    available: active.filter((t) => t.status === "Available").length,
    inUse: active.filter((t) => t.status === "In Use").length,
    underRepair: active.filter((t) => t.status === "Under Repair").length,
  };

  // Latest historyTool ref stays in sync with the live tool record so
  // Issue/Return immediately reflect in the open dialog.
  const liveHistoryTool = historyTool
    ? (data.tools.find((t) => t.id === historyTool.id) ?? historyTool)
    : null;

  const doDelete = async (t: import("../data").Tool) => {
    const ok = await confirm(
      "Delete Tool",
      `Delete "${t.name}" (${t.toolCode})?`,
    );
    if (!ok) return;
    deleteRecord("tools", t.id);
    toast("Tool removed");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold">Tool Register</h2>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + Add Tool
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold">{kpis.total}</p>
          <p className="text-[10px] text-gray-500 uppercase">Total Tools</p>
        </div>
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold text-emerald-700">{kpis.available}</p>
          <p className="text-[10px] text-gray-500 uppercase">Available</p>
        </div>
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold text-blue-700">{kpis.inUse}</p>
          <p className="text-[10px] text-gray-500 uppercase">In Use</p>
        </div>
        <div className="rounded-lg border bg-amber-50 border-amber-200 p-2.5 text-center">
          <p className="text-sm font-bold text-amber-700">{kpis.underRepair}</p>
          <p className="text-[10px] text-amber-600 uppercase">Under Repair</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox
          value={tbl.query}
          onChange={tbl.setQuery}
          placeholder="Search tools…"
        />
        <select
          className="h-8 text-xs rounded-lg border px-2"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          {TOOL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">Tool</th>
              <th className="text-left p-2.5">Category</th>
              <th className="text-left p-2.5">Qty</th>
              <th className="text-left p-2.5">Location</th>
              <th className="text-left p-2.5">Assigned To</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="p-2.5">
                  <div className="flex items-center gap-2">
                    {t.photoData ? (
                      <img
                        src={t.photoData}
                        alt={t.name}
                        className="w-7 h-7 rounded object-cover border shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded border bg-gray-50 shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">
                        {t.toolCode}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-2.5 text-gray-500">{t.category || "—"}</td>
                <td className="p-2.5 font-mono">{t.quantity}</td>
                <td className="p-2.5 text-gray-500">{t.location || "—"}</td>
                <td className="p-2.5 text-gray-500">
                  {employeeName(t.assignedEmployeeId) || "—"}
                </td>
                <td className="p-2.5">
                  <StatusBadge
                    status={t.status}
                    tone={
                      t.status === "Available"
                        ? "success"
                        : t.status === "In Use"
                          ? "neutral"
                          : t.status === "Under Repair"
                            ? "warning"
                            : "danger"
                    }
                  />
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryTool(t)}
                      className="text-gray-500 font-semibold"
                    >
                      History
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", tool: t })}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => doDelete(t)}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No tools added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <ToolFormDialog
          editing={dialog.mode === "edit" ? dialog.tool : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {liveHistoryTool && (
        <ToolHistoryDialog
          tool={liveHistoryTool}
          onClose={() => setHistoryTool(null)}
        />
      )}
    </div>
  );
}

const DIE_STATUSES: import("../data").DieStatus[] = [
  "Available",
  "In Use",
  "Under Maintenance",
  "Retired",
];

// Real Tooling/Dies Add/Edit dialog — matches pages/Dies.tsx (see
// PARITY_TRACKER.md #12). Reproduces the real "must link at least one
// drawing" rule on Create, using this prototype's simpler denormalized
// `linkedDrawingIds` (see the Die type comment in data.ts for why).
function DieFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").Die | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { data, addDieFull, updateDieFields } = useUxLabStore();
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState(editing?.type ?? "");
  const [purpose, setPurpose] = useState(editing?.purpose ?? "");
  const [compatibleMachineId, setCompatibleMachineId] = useState(
    editing?.compatibleMachineId ?? "",
  );
  const [originalProjectId, setOriginalProjectId] = useState(
    editing?.originalProjectId ?? "",
  );
  const [location, setLocation] = useState(editing?.location ?? "");
  const [status, setStatus] = useState<import("../data").DieStatus>(
    editing?.status ?? "Available",
  );
  const [condition, setCondition] = useState<
    import("../data").ToolCondition | ""
  >(editing?.condition ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [photoData, setPhotoData] = useState(editing?.photoData ?? "");
  const [linkedDrawingIds, setLinkedDrawingIds] = useState<string[]>(
    editing?.linkedDrawingIds ?? [],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleDrawing = (id: string) =>
    setLinkedDrawingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const submit = async () => {
    if (!name.trim()) {
      setError("Die name is required");
      return;
    }
    if (!editing && linkedDrawingIds.length === 0) {
      setError("Link at least one drawing before saving.");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    const fields = {
      name: name.trim(),
      type: type || undefined,
      purpose: purpose || undefined,
      compatibleMachineId: compatibleMachineId || undefined,
      originalProjectId: originalProjectId || undefined,
      location: location || undefined,
      status,
      condition: condition || undefined,
      notes: notes || undefined,
      photoData: photoData || undefined,
      linkedDrawingIds,
    };
    if (editing) {
      updateDieFields(editing.id, fields);
      toast("Die updated");
    } else {
      const d = addDieFull(fields);
      toast(`Die ${d.dieCode} added`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Die" : "Add Die"}
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              <span className="text-[11px] font-semibold text-gray-500 block">
                Photo
              </span>
              <label className="mt-1 flex items-center justify-center w-14 h-14 rounded-lg border border-dashed cursor-pointer overflow-hidden text-[10px] text-gray-400">
                {photoData ? (
                  <img
                    src={photoData}
                    alt="Die"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  "Upload"
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setPhotoData(await fileToDataUrl(file));
                  }}
                />
              </label>
            </div>
            <div className="flex-1">
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="df-name"
              >
                Die Name <span className="text-red-600">*</span>
              </label>
              <input
                id="df-name"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                placeholder="e.g. Progressive Die A14"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="df-type"
              >
                Type
              </label>
              <input
                id="df-type"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="e.g. Progressive"
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="df-purpose"
              >
                Purpose
              </label>
              <input
                id="df-purpose"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="df-machine"
              >
                Compatible Machine
              </label>
              <select
                id="df-machine"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={compatibleMachineId}
                onChange={(e) => setCompatibleMachineId(e.target.value)}
              >
                <option value="">—</option>
                {data.machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="df-project"
              >
                Original Project
              </label>
              <select
                id="df-project"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={originalProjectId}
                onChange={(e) => setOriginalProjectId(e.target.value)}
              >
                <option value="">—</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="df-status"
              >
                Status <span className="text-red-600">*</span>
              </label>
              <select
                id="df-status"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as import("../data").DieStatus)
                }
              >
                {DIE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="df-condition"
              >
                Condition
              </label>
              <select
                id="df-condition"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={condition}
                onChange={(e) =>
                  setCondition(
                    e.target.value as import("../data").ToolCondition,
                  )
                }
              >
                <option value="">Select condition</option>
                {TOOL_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="df-location"
            >
              Location
            </label>
            <input
              id="df-location"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500">
              Linked Drawings{" "}
              {!editing && <span className="text-red-600">*</span>}
            </span>
            <div className="mt-1 rounded-lg border divide-y max-h-28 overflow-y-auto">
              {data.drawings.length === 0 ? (
                <p className="p-2 text-xs text-gray-400">
                  No drawings in the repository.
                </p>
              ) : (
                data.drawings.map((dw) => (
                  <label
                    key={dw.id}
                    className="flex items-center gap-2 p-2 text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={linkedDrawingIds.includes(dw.id)}
                      onChange={() => {
                        toggleDrawing(dw.id);
                        setError("");
                      }}
                    />
                    {dw.fileName}{" "}
                    <span className="text-gray-400">rev {dw.version}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="df-notes"
            >
              Notes
            </label>
            <textarea
              id="df-notes"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Die"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Tooling/Dies list: KPI row, status filter/search, photo
// thumbnail, compatible machine/original project columns, Add/Edit/
// Delete — matches pages/Dies.tsx (see PARITY_TRACKER.md #12).
export function DiesScreen() {
  const { data, deleteDie } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; die: import("../data").Die } | null
  >(null);

  const active = data.dies.filter((d) => d.isActive !== false);
  const filtered = active.filter(
    (d) => statusFilter === "all" || d.status === statusFilter,
  );
  const tbl = useTableControls(
    filtered,
    (d) => `${d.name} ${d.dieCode}`,
    "name",
  );
  const machineName = (id?: string) =>
    data.machines.find((m) => m.id === id)?.name;
  const projectName = (id?: string) =>
    data.projects.find((p) => p.id === id)?.name;

  const kpis = {
    total: active.length,
    available: active.filter((d) => d.status === "Available").length,
    inUse: active.filter((d) => d.status === "In Use").length,
    underMaintenance: active.filter((d) => d.status === "Under Maintenance")
      .length,
  };

  const doDelete = async (d: import("../data").Die) => {
    const ok = await confirm(
      "Delete Die",
      `Delete "${d.name}" (${d.dieCode})?`,
    );
    if (!ok) return;
    deleteDie(d.id);
    toast("Die removed");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold">Tooling / Dies Register</h2>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + Add Die
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold">{kpis.total}</p>
          <p className="text-[10px] text-gray-500 uppercase">Total Dies</p>
        </div>
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold text-emerald-700">{kpis.available}</p>
          <p className="text-[10px] text-gray-500 uppercase">Available</p>
        </div>
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold text-blue-700">{kpis.inUse}</p>
          <p className="text-[10px] text-gray-500 uppercase">In Use</p>
        </div>
        <div className="rounded-lg border bg-amber-50 border-amber-200 p-2.5 text-center">
          <p className="text-sm font-bold text-amber-700">
            {kpis.underMaintenance}
          </p>
          <p className="text-[10px] text-amber-600 uppercase">
            Under Maintenance
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox
          value={tbl.query}
          onChange={tbl.setQuery}
          placeholder="Search dies…"
        />
        <select
          className="h-8 text-xs rounded-lg border px-2"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          {DIE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">Die</th>
              <th className="text-left p-2.5">Type</th>
              <th className="text-left p-2.5">Compatible Machine</th>
              <th className="text-left p-2.5">Original Project</th>
              <th className="text-left p-2.5">Location</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((d) => (
              <tr key={d.id} className="border-b last:border-0">
                <td className="p-2.5">
                  <div className="flex items-center gap-2">
                    {d.photoData ? (
                      <img
                        src={d.photoData}
                        alt={d.name}
                        className="w-7 h-7 rounded object-cover border shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded border bg-gray-50 shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold">{d.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">
                        {d.dieCode}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-2.5 text-gray-500">{d.type || "—"}</td>
                <td className="p-2.5 text-gray-500">
                  {machineName(d.compatibleMachineId) || "—"}
                </td>
                <td className="p-2.5 text-gray-500">
                  {projectName(d.originalProjectId) || "—"}
                </td>
                <td className="p-2.5 text-gray-500">{d.location || "—"}</td>
                <td className="p-2.5">
                  <StatusBadge
                    status={d.status}
                    tone={
                      d.status === "Available"
                        ? "success"
                        : d.status === "In Use"
                          ? "neutral"
                          : d.status === "Under Maintenance"
                            ? "warning"
                            : "danger"
                    }
                  />
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", die: d })}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => doDelete(d)}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No dies added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <DieFormDialog
          editing={dialog.mode === "edit" ? dialog.die : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
    </div>
  );
}

const USER_ROLES: import("../data").UserRole[] = [
  "admin",
  "sales",
  "procurement",
  "production",
  "quality",
  "dispatch",
  "accounts",
  "employee",
];
const EMPLOYMENT_TYPES: import("../data").EmploymentType[] = [
  "Permanent",
  "Temporary",
  "Daily Wage",
];

// Real Employees Add/Edit dialog — matches pages/Employees.tsx (see
// PARITY_TRACKER.md #13). Disclosed gap: real production also collects
// a username/temporary password on Create to provision a linked
// Supabase Auth login account through a shared Edge Function — not
// reproduced (no real backend auth to provision here).
function EmployeeFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").Employee | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { addEmployeeFull, updateEmployeeFields, employeeDuplicateExists } =
    useUxLabStore();
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [role, setRole] = useState<import("../data").UserRole>(
    editing?.role ?? "employee",
  );
  const [monthlySalary, setMonthlySalary] = useState(
    String(editing?.monthlySalary ?? ""),
  );
  const [joiningDate, setJoiningDate] = useState(editing?.joiningDate ?? "");
  const [designation, setDesignation] = useState(editing?.designation ?? "");
  const [bloodGroup, setBloodGroup] = useState(editing?.bloodGroup ?? "");
  const [emergencyContactName, setEmergencyContactName] = useState(
    editing?.emergencyContactName ?? "",
  );
  const [emergencyContactRelation, setEmergencyContactRelation] = useState(
    editing?.emergencyContactRelation ?? "",
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    editing?.emergencyContactPhone ?? "",
  );
  const [employmentType, setEmploymentType] = useState<
    import("../data").EmploymentType
  >(editing?.employmentType ?? "Permanent");
  const [tempStartDate, setTempStartDate] = useState(
    editing?.tempStartDate ?? "",
  );
  const [tempEndDate, setTempEndDate] = useState(editing?.tempEndDate ?? "");
  const [dailyWageRate, setDailyWageRate] = useState(
    String(editing?.dailyWageRate ?? ""),
  );
  const [photoRef, setPhotoRef] = useState(editing?.photoRef ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    if (!editing) {
      const dup = employeeDuplicateExists(name, phone);
      if (dup) {
        toast(
          `An employee named "${dup.name}" with this phone number already exists. Saving anyway as a new record.`,
        );
      }
    }
    await new Promise((r) => setTimeout(r, 400));
    const fields = {
      name: name.trim(),
      phone: phone.trim(),
      role,
      monthlySalary: Number(monthlySalary) || 0,
      joiningDate,
      photoRef: photoRef || undefined,
      designation: designation || undefined,
      bloodGroup: bloodGroup || undefined,
      emergencyContactName: emergencyContactName || undefined,
      emergencyContactRelation: emergencyContactRelation || undefined,
      emergencyContactPhone: emergencyContactPhone || undefined,
      employmentType,
      tempStartDate:
        employmentType === "Temporary" && tempStartDate
          ? tempStartDate
          : undefined,
      tempEndDate:
        employmentType === "Temporary" && tempEndDate ? tempEndDate : undefined,
      dailyWageRate:
        employmentType === "Daily Wage" && dailyWageRate
          ? Number(dailyWageRate)
          : undefined,
    };
    if (editing) {
      updateEmployeeFields(editing.id, fields);
      toast("Employee updated");
    } else {
      addEmployeeFull(fields);
      toast(`Employee ${fields.name} added`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Employee" : "New Employee"}
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              <span className="text-[11px] font-semibold text-gray-500 block">
                Photo
              </span>
              <label className="mt-1 flex items-center justify-center w-14 h-14 rounded-full border border-dashed cursor-pointer overflow-hidden text-[10px] text-gray-400">
                {photoRef ? (
                  <img
                    src={photoRef}
                    alt="Employee"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  "Upload"
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setPhotoRef(await fileToDataUrl(file));
                  }}
                />
              </label>
            </div>
            <div className="flex-1">
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ef-name"
              >
                Name <span className="text-red-600">*</span>
              </label>
              <input
                id="ef-name"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ef-phone"
              >
                Phone
              </label>
              <input
                id="ef-phone"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ef-role"
              >
                Role
              </label>
              <select
                id="ef-role"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as import("../data").UserRole)
                }
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ef-salary"
              >
                Monthly Salary ₹
              </label>
              <input
                id="ef-salary"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ef-joining"
              >
                Joining Date
              </label>
              <input
                id="ef-joining"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ef-designation"
            >
              Designation
            </label>
            <input
              id="ef-designation"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ef-employment-type"
              >
                Employment Type
              </label>
              <select
                id="ef-employment-type"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={employmentType}
                onChange={(e) =>
                  setEmploymentType(
                    e.target.value as import("../data").EmploymentType,
                  )
                }
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ef-blood"
              >
                Blood Group
              </label>
              <input
                id="ef-blood"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
              />
            </div>
          </div>
          {employmentType === "Temporary" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  className="text-[11px] font-semibold text-gray-500"
                  htmlFor="ef-temp-start"
                >
                  Temp Start
                </label>
                <input
                  id="ef-temp-start"
                  type="date"
                  className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                  value={tempStartDate}
                  onChange={(e) => setTempStartDate(e.target.value)}
                />
              </div>
              <div>
                <label
                  className="text-[11px] font-semibold text-gray-500"
                  htmlFor="ef-temp-end"
                >
                  Temp End
                </label>
                <input
                  id="ef-temp-end"
                  type="date"
                  className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                  value={tempEndDate}
                  onChange={(e) => setTempEndDate(e.target.value)}
                />
              </div>
            </div>
          )}
          {employmentType === "Daily Wage" && (
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="ef-daily-rate"
              >
                Daily Wage Rate ₹
              </label>
              <input
                id="ef-daily-rate"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={dailyWageRate}
                onChange={(e) => setDailyWageRate(e.target.value)}
              />
            </div>
          )}
          <div className="rounded-lg border p-2.5 space-y-2">
            <span className="text-[11px] font-semibold text-gray-500">
              Emergency Contact
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="h-8 text-sm rounded-lg border px-2.5"
                placeholder="Name"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
              />
              <input
                className="h-8 text-sm rounded-lg border px-2.5"
                placeholder="Relation"
                value={emergencyContactRelation}
                onChange={(e) => setEmergencyContactRelation(e.target.value)}
              />
            </div>
            <input
              className="w-full h-8 text-sm rounded-lg border px-2.5"
              placeholder="Phone"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Employee"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real production drills "View" into a ~2,100-line EmployeeDetail.tsx
// subsystem (ID Card generation, monthly attendance-driven Salary/
// Payroll, Advances with e-signature, Documents) — not reproduced here
// (see PARITY_TRACKER.md #13). This read-only summary preserves the
// "View" action's reachability of every field that IS reproduced.
function EmployeeViewDialog({
  employee,
  onClose,
}: {
  employee: import("../data").Employee;
  onClose: () => void;
}) {
  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-right">{value || "—"}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-3">
          {employee.photoRef ? (
            <img
              src={employee.photoRef}
              alt={employee.name}
              className="w-12 h-12 rounded-full object-cover border"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-100 border" />
          )}
          <div>
            <h3 className="text-sm font-bold">{employee.name}</h3>
            <p className="text-xs text-gray-500">
              {employee.designation || employee.role}
            </p>
          </div>
        </div>
        <div className="divide-y">
          {row("Role", employee.role)}
          {row("Phone", employee.phone)}
          {row(
            "Monthly Salary",
            `₹${employee.monthlySalary.toLocaleString("en-IN")}`,
          )}
          {row("Joining Date", employee.joiningDate)}
          {row("Employment Type", employee.employmentType || "Permanent")}
          {employee.employmentType === "Daily Wage" &&
            row(
              "Daily Wage Rate",
              employee.dailyWageRate ? `₹${employee.dailyWageRate}` : "",
            )}
          {row("Blood Group", employee.bloodGroup || "")}
          {row("Emergency Contact", employee.emergencyContactName || "")}
          {row("Relation", employee.emergencyContactRelation || "")}
          {row("Emergency Phone", employee.emergencyContactPhone || "")}
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Employees list: photo avatar, role badge, salary column gated
// behind the real `employees.view` permission (canSeeSalary), View/
// Edit/Delete — matches pages/Employees.tsx (see PARITY_TRACKER.md
// #13). Disclosed gap: the salary-visibility gate is presentation-level
// here (always shown), consistent with the Role Layer elsewhere in this
// prototype not being an enforcement gate.
export function EmployeesScreen() {
  const { data, deleteRecord } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; employee: import("../data").Employee }
    | null
  >(null);
  const [viewing, setViewing] = useState<import("../data").Employee | null>(
    null,
  );
  const tbl = useTableControls(
    data.employees,
    (e) => `${e.name} ${e.designation ?? ""}`,
    "name",
  );

  const doDelete = async (e: import("../data").Employee) => {
    const ok = await confirm("Delete Employee", `Delete "${e.name}"?`);
    if (!ok) return;
    deleteRecord("employees", e.id);
    toast("Employee deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Employees</h2>
          <p className="text-xs text-gray-500">
            {data.employees.length} employee
            {data.employees.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + New Employee
        </button>
      </div>
      <SearchBox
        value={tbl.query}
        onChange={tbl.setQuery}
        placeholder="Search employees…"
      />
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5 w-10" />
              <th className="text-left p-2.5">Name</th>
              <th className="text-left p-2.5">Role</th>
              <th className="text-left p-2.5">Phone</th>
              <th className="text-left p-2.5">Monthly Salary</th>
              <th className="text-left p-2.5">Joining Date</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="p-2.5">
                  {e.photoRef ? (
                    <img
                      src={e.photoRef}
                      alt={e.name}
                      className="w-7 h-7 rounded-full object-cover border"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gray-100 border" />
                  )}
                </td>
                <td className="p-2.5 font-semibold">{e.name}</td>
                <td className="p-2.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                    {e.role}
                  </span>
                </td>
                <td className="p-2.5 text-gray-500">{e.phone || "—"}</td>
                <td className="p-2.5">
                  ₹{e.monthlySalary.toLocaleString("en-IN")}
                </td>
                <td className="p-2.5 text-gray-500">
                  {e.joiningDate
                    ? new Date(e.joiningDate).toLocaleDateString("en-IN")
                    : "—"}
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewing(e)}
                      className="text-gray-600 font-semibold"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", employee: e })}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => doDelete(e)}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No employees found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <EmployeeFormDialog
          editing={dialog.mode === "edit" ? dialog.employee : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {viewing && (
        <EmployeeViewDialog
          employee={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

const DISPATCH_METHODS: import("../data").DispatchMethod[] = [
  "Company Vehicle",
  "Customer Pickup",
  "Courier",
  "Transport / Logistics",
];
const DC_STATUSES: import("../data").DCStatus[] = [
  "Prepared",
  "Dispatched",
  "Delivered",
];

function previewDcNo(existing: import("../data").DeliveryChallan[]): string {
  const year = new Date().getFullYear();
  const maxNum = existing.reduce((max, dc) => {
    const m = dc.dcNo.match(/DC-\d{4}-(\d+)/);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `DC-${year}-${String(maxNum + 1).padStart(3, "0")}`;
}

// Real Delivery Challans Add/Edit dialog — matches pages/
// DeliveryChallans.tsx (see PARITY_TRACKER.md #14). Reproduces the real
// per-project dispatch-qty cap (against remaining = project total minus
// what every OTHER challan already dispatched), the "all projects must
// share one customer" rule, the 4 dispatch-method conditional field
// sets, and the delivery-address toggle. Real production lets Create
// add/remove projects but Edit only adjust already-selected projects'
// quantities — reproduced identically (`editing` fixes the project set).
function DeliveryChallanFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").DeliveryChallan | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const {
    data,
    dcRemainingQty,
    dcNumberExists,
    addDeliveryChallanFull,
    updateDeliveryChallanFull,
  } = useUxLabStore();
  const toast = useToast();
  const [dcNo, setDcNo] = useState(
    editing?.dcNo ?? previewDcNo(data.deliveryChallans),
  );
  const [customerId, setCustomerId] = useState(editing?.customerId ?? "");
  const [entries, setEntries] = useState<import("../data").DCProjectEntry[]>(
    editing?.projectEntries ?? [],
  );
  const [addProjectId, setAddProjectId] = useState("");
  const [dispatchMethod, setDispatchMethod] = useState<
    import("../data").DispatchMethod
  >(editing?.dispatchMethod ?? "Company Vehicle");
  const [vehicleNo, setVehicleNo] = useState(editing?.vehicleNo ?? "");
  const [driverName, setDriverName] = useState(editing?.driverName ?? "");
  const [courierCompany, setCourierCompany] = useState(
    editing?.courierCompany ?? "",
  );
  const [trackingNumber, setTrackingNumber] = useState(
    editing?.trackingNumber ?? "",
  );
  const [transportCompany, setTransportCompany] = useState(
    editing?.transportCompany ?? "",
  );
  const [lrNumber, setLrNumber] = useState(editing?.lrNumber ?? "");
  const [collectedBy, setCollectedBy] = useState(editing?.collectedBy ?? "");
  const [mobileNumber, setMobileNumber] = useState(editing?.mobileNumber ?? "");
  const [dispatchDate, setDispatchDate] = useState(
    editing?.dispatchDate ?? new Date().toISOString().slice(0, 10),
  );
  const [receiverName, setReceiverName] = useState(editing?.receiverName ?? "");
  const [useCustomerAddress, setUseCustomerAddress] = useState(
    editing ? editing.deliveryAddress.type === "customer" : true,
  );
  const [customAddress, setCustomAddress] = useState(
    editing?.deliveryAddress.type === "custom"
      ? editing.deliveryAddress.value
      : "",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const customer = data.customers.find((c) => c.id === customerId);
  const projectName = (id: string) =>
    data.projects.find((p) => p.id === id)?.name ?? id;
  const availableProjects = editing
    ? []
    : data.projects.filter((p) => !entries.some((e) => e.projectId === p.id));

  const addProject = () => {
    if (!addProjectId) return;
    const project = data.projects.find((p) => p.id === addProjectId);
    if (!project) return;
    if (entries.length > 0 && project.customerId !== customerId) {
      toast("All projects must belong to the same customer");
      return;
    }
    setEntries((prev) => [
      ...prev,
      { projectId: addProjectId, dispatchQty: 0 },
    ]);
    if (entries.length === 0) setCustomerId(project.customerId);
    setAddProjectId("");
  };

  const removeProject = (projectId: string) => {
    setEntries((prev) => prev.filter((e) => e.projectId !== projectId));
  };

  const setQty = (projectId: string, qty: number) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.projectId === projectId ? { ...e, dispatchQty: qty } : e,
      ),
    );
  };

  const submit = async () => {
    if (entries.length === 0) {
      setError("Select at least one project");
      return;
    }
    if (!dispatchDate) {
      setError("Dispatch date is required");
      return;
    }
    if (!entries.some((e) => e.dispatchQty > 0)) {
      setError("Enter dispatch quantity for at least one project");
      return;
    }
    for (const e of entries) {
      const remaining =
        dcRemainingQty(e.projectId, editing?.id) +
        (editing?.projectEntries.find((x) => x.projectId === e.projectId)
          ?.dispatchQty ?? 0);
      if (e.dispatchQty > remaining) {
        setError(
          `Dispatch qty for "${projectName(e.projectId)}" exceeds remaining (${remaining})`,
        );
        return;
      }
    }
    if (!editing && dcNumberExists(dcNo.trim())) {
      setError(
        `Challan number ${dcNo.trim()} already exists. Please use a different number.`,
      );
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    const deliveryAddress = {
      type: useCustomerAddress ? ("customer" as const) : ("custom" as const),
      value: useCustomerAddress ? (customer?.address ?? "") : customAddress,
    };
    const dispatchFields = {
      vehicleNo: dispatchMethod === "Company Vehicle" ? vehicleNo : undefined,
      driverName: dispatchMethod === "Company Vehicle" ? driverName : undefined,
      courierCompany: dispatchMethod === "Courier" ? courierCompany : undefined,
      trackingNumber: dispatchMethod === "Courier" ? trackingNumber : undefined,
      transportCompany:
        dispatchMethod === "Transport / Logistics"
          ? transportCompany
          : undefined,
      lrNumber:
        dispatchMethod === "Transport / Logistics" ? lrNumber : undefined,
      collectedBy:
        dispatchMethod === "Customer Pickup" ? collectedBy : undefined,
      mobileNumber:
        dispatchMethod === "Customer Pickup" ? mobileNumber : undefined,
    };
    if (editing) {
      updateDeliveryChallanFull(editing.id, {
        projectEntries: entries,
        dispatchMethod,
        ...dispatchFields,
        receiverName,
        deliveryAddress,
      });
      toast("Delivery Challan updated");
    } else {
      const dc = addDeliveryChallanFull({
        dcNo: dcNo.trim() || previewDcNo(data.deliveryChallans),
        customerId,
        projectEntries: entries,
        dispatchMethod,
        ...dispatchFields,
        dispatchDate,
        receiverName,
        deliveryAddress,
      });
      toast(`Delivery Challan ${dc.dcNo} created`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold mb-3">
          {editing ? `Edit ${editing.dcNo}` : "New Delivery Challan"}
        </h3>
        <div className="space-y-2.5">
          {!editing && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  className="text-[11px] font-semibold text-gray-500"
                  htmlFor="dc-no"
                >
                  DC Number
                </label>
                <input
                  id="dc-no"
                  className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                  value={dcNo}
                  onChange={(e) => setDcNo(e.target.value)}
                />
              </div>
              <div>
                <label
                  className="text-[11px] font-semibold text-gray-500"
                  htmlFor="dc-date"
                >
                  Dispatch Date <span className="text-red-600">*</span>
                </label>
                <input
                  id="dc-date"
                  type="date"
                  className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                />
              </div>
            </div>
          )}
          <div>
            <span className="text-[11px] font-semibold text-gray-500">
              Projects {!editing && <span className="text-red-600">*</span>}
            </span>
            {!editing && (
              <div className="mt-1 flex items-center gap-2">
                <select
                  className="flex-1 h-8 text-xs rounded-lg border px-2"
                  value={addProjectId}
                  onChange={(e) => setAddProjectId(e.target.value)}
                >
                  <option value="">Select a project…</option>
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addProject}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                >
                  Add
                </button>
              </div>
            )}
            <div className="mt-1.5 space-y-1.5">
              {entries.map((e) => {
                const remaining =
                  dcRemainingQty(e.projectId, editing?.id) +
                  (editing?.projectEntries.find(
                    (x) => x.projectId === e.projectId,
                  )?.dispatchQty ?? 0);
                return (
                  <div
                    key={e.projectId}
                    className="flex items-center gap-2 rounded-lg border p-2"
                  >
                    <span className="flex-1 text-xs font-medium">
                      {projectName(e.projectId)}
                      <span className="block text-[10px] text-gray-400">
                        Remaining: {remaining}
                      </span>
                    </span>
                    <input
                      type="number"
                      className="w-20 h-7 text-xs rounded border px-2"
                      value={e.dispatchQty}
                      onChange={(ev) =>
                        setQty(e.projectId, Number(ev.target.value))
                      }
                    />
                    {!editing && (
                      <button
                        type="button"
                        onClick={() => removeProject(e.projectId)}
                        className="text-red-600 text-xs font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
              {entries.length === 0 && (
                <p className="text-xs text-gray-400">No projects selected.</p>
              )}
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="dc-method"
            >
              Dispatch Method
            </label>
            <select
              id="dc-method"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={dispatchMethod}
              onChange={(e) =>
                setDispatchMethod(
                  e.target.value as import("../data").DispatchMethod,
                )
              }
            >
              {DISPATCH_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          {dispatchMethod === "Company Vehicle" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                className="h-8 text-sm rounded-lg border px-2.5"
                placeholder="Vehicle No."
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
              />
              <input
                className="h-8 text-sm rounded-lg border px-2.5"
                placeholder="Driver Name"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
            </div>
          )}
          {dispatchMethod === "Courier" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                className="h-8 text-sm rounded-lg border px-2.5"
                placeholder="Courier Company"
                value={courierCompany}
                onChange={(e) => setCourierCompany(e.target.value)}
              />
              <input
                className="h-8 text-sm rounded-lg border px-2.5"
                placeholder="Tracking Number"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>
          )}
          {dispatchMethod === "Transport / Logistics" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                className="h-8 text-sm rounded-lg border px-2.5"
                placeholder="Transport Company"
                value={transportCompany}
                onChange={(e) => setTransportCompany(e.target.value)}
              />
              <input
                className="h-8 text-sm rounded-lg border px-2.5"
                placeholder="LR Number"
                value={lrNumber}
                onChange={(e) => setLrNumber(e.target.value)}
              />
            </div>
          )}
          {dispatchMethod === "Customer Pickup" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                className="h-8 text-sm rounded-lg border px-2.5"
                placeholder="Collected By"
                value={collectedBy}
                onChange={(e) => setCollectedBy(e.target.value)}
              />
              <input
                className="h-8 text-sm rounded-lg border px-2.5"
                placeholder="Mobile Number"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
              />
            </div>
          )}
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="dc-receiver"
            >
              Receiver Name
            </label>
            <input
              id="dc-receiver"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
            />
          </div>
          <div className="rounded-lg border p-2.5 space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={useCustomerAddress}
                onChange={(e) => setUseCustomerAddress(e.target.checked)}
              />
              Deliver to customer's address
              {customer?.address ? ` (${customer.address})` : ""}
            </label>
            {!useCustomerAddress && (
              <textarea
                className="w-full text-sm rounded-lg border px-2.5 py-1.5"
                rows={2}
                placeholder="Custom delivery address"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
              />
            )}
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Challan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Delivery Challans list: multi-project display, dispatch method/
// vehicle column, inline Status select, View/Edit/Print/Download/
// Share/Delete — matches pages/DeliveryChallans.tsx (see
// PARITY_TRACKER.md #14). Print/Download/Share are simulated (toast-
// confirmed), same disclosed simplification as Quotations/Invoices —
// no real PDF-rendering pipeline in this lab.
export function DeliveryChallansScreen() {
  const { data, updateDeliveryChallanStatus, deleteRecord } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; dc: import("../data").DeliveryChallan }
    | null
  >(null);
  const [viewing, setViewing] = useState<
    import("../data").DeliveryChallan | null
  >(null);
  const sorted = [...data.deliveryChallans].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  const tbl = useTableControls(sorted, (dc) => dc.dcNo, "dcNo");
  const customerName = (id: string) =>
    data.customers.find((c) => c.id === id)?.name ?? "—";
  const projectNames = (dc: import("../data").DeliveryChallan) =>
    dc.projectEntries
      .map(
        (e) =>
          data.projects.find((p) => p.id === e.projectId)?.name ?? e.projectId,
      )
      .join(", ") || "N/A";

  const doDelete = async (dc: import("../data").DeliveryChallan) => {
    const ok = await confirm(
      "Delete delivery challan?",
      `Challan "${dc.dcNo}" will be permanently deleted.`,
    );
    if (!ok) return;
    deleteRecord("deliveryChallans", dc.id);
    toast("Delivery challan deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Delivery Challans</h2>
          <p className="text-xs text-gray-500">
            {data.deliveryChallans.length} challan
            {data.deliveryChallans.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + New DC
        </button>
      </div>
      <SearchBox
        value={tbl.query}
        onChange={tbl.setQuery}
        placeholder="Search challans…"
      />
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">DC No.</th>
              <th className="text-left p-2.5">Customer</th>
              <th className="text-left p-2.5">Projects</th>
              <th className="text-left p-2.5">Dispatch Date</th>
              <th className="text-left p-2.5">Vehicle</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((dc) => (
              <tr key={dc.id} className="border-b last:border-0">
                <td className="p-2.5 font-mono font-semibold">{dc.dcNo}</td>
                <td className="p-2.5">{customerName(dc.customerId)}</td>
                <td className="p-2.5 max-w-[200px] truncate text-gray-500">
                  {projectNames(dc)}
                </td>
                <td className="p-2.5 text-gray-500">{dc.dispatchDate}</td>
                <td className="p-2.5 text-gray-500">{dc.vehicleNo || "—"}</td>
                <td className="p-2.5">
                  <select
                    className="h-7 text-xs rounded-lg border px-1.5"
                    value={dc.status}
                    onChange={(e) =>
                      updateDeliveryChallanStatus(
                        dc.id,
                        e.target.value as import("../data").DCStatus,
                      )
                    }
                  >
                    {DC_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setViewing(dc)}
                      className="text-gray-600 font-semibold"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", dc })}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => toast(`Print requested for ${dc.dcNo}`)}
                      className="text-gray-600 font-semibold"
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => toast(`${dc.dcNo} downloaded (simulated)`)}
                      className="text-gray-600 font-semibold"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => toast(`Share link copied for ${dc.dcNo}`)}
                      className="text-emerald-600 font-semibold"
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      onClick={() => doDelete(dc)}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No delivery challans found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <DeliveryChallanFormDialog
          editing={dialog.mode === "edit" ? dialog.dc : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
            <h3 className="text-sm font-bold mb-3">{viewing.dcNo}</h3>
            <div className="divide-y text-xs">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Customer</span>
                <span className="font-medium">
                  {customerName(viewing.customerId)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Projects</span>
                <span className="font-medium text-right">
                  {projectNames(viewing)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Dispatch Method</span>
                <span className="font-medium">{viewing.dispatchMethod}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Receiver</span>
                <span className="font-medium">
                  {viewing.receiverName || "—"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Delivery Address</span>
                <span className="font-medium text-right">
                  {viewing.deliveryAddress.value || "—"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Status</span>
                <span className="font-medium">{viewing.status}</span>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setViewing(null)}
                className="text-xs font-semibold px-3 py-2 rounded-lg border"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CPO_STATUSES: import("../data").CompanyPOStatus[] = [
  "Draft",
  "Sent",
  "Received",
];
const emptyCpoItem = (): import("../data").CompanyPOItem => ({
  id: `item-${Date.now()}-${Math.random()}`,
  description: "",
  quantity: 1,
  unit: "nos",
  rate: 0,
  amount: 0,
});

// Real Company PO (vendor-side) Add/Edit dialog — matches
// pages/CompanyPOs.tsx (see PARITY_TRACKER.md #15). NOT the customer-
// side "Customer Purchase Orders" (Module #5, CustomerPOsScreen below).
function CompanyPOFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").CompanyPO | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { data, addCompanyPOFull, updateCompanyPOFull } = useUxLabStore();
  const toast = useToast();
  const [vendorId, setVendorId] = useState(editing?.vendorId ?? "");
  const [vendorName, setVendorName] = useState(editing?.vendorName ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(
    editing?.deliveryAddress ?? "",
  );
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    editing?.expectedDeliveryDate ?? "",
  );
  const [gstPercent, setGstPercent] = useState(
    String(editing?.gstPercent ?? 18),
  );
  const [termsAndConditions, setTermsAndConditions] = useState(
    editing?.termsAndConditions ?? "",
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [items, setItems] = useState<import("../data").CompanyPOItem[]>(
    editing?.items.map((i) => ({ ...i })) ?? [emptyCpoItem()],
  );
  const [file, setFile] = useState(editing?.file);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectVendor = (id: string) => {
    setVendorId(id);
    const v = data.vendors.find((x) => x.id === id);
    if (v) setVendorName(v.name);
  };
  const vendor = data.vendors.find((v) => v.id === vendorId);

  const updateItem = (
    id: string,
    field: keyof import("../data").CompanyPOItem,
    value: string | number,
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: value };
        if (field === "quantity" || field === "rate") {
          updated.amount = Number(updated.quantity) * Number(updated.rate);
        }
        return updated;
      }),
    );
  };
  const addItem = () => setItems((prev) => [...prev, emptyCpoItem()]);
  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.rate, 0);
  const gstAmount = subtotal * ((Number(gstPercent) || 0) / 100);
  const grandTotal = subtotal + gstAmount;

  const submit = async () => {
    if (!vendorName.trim()) {
      setError("Vendor name is required.");
      return;
    }
    if (items.length === 0 || !items.some((i) => i.description.trim())) {
      setError("At least one item with a description is required.");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    const itemsWithAmounts = items.map((i) => ({
      ...i,
      amount: i.quantity * i.rate,
    }));
    const fields = {
      vendorId: vendorId || undefined,
      vendorName: vendorName.trim(),
      vendorAddress: vendor?.address,
      vendorGst: vendor?.gstNumber,
      vendorContact: vendor?.phone,
      items: itemsWithAmounts,
      deliveryAddress: deliveryAddress || undefined,
      expectedDeliveryDate: expectedDeliveryDate || undefined,
      gstPercent: Number(gstPercent) || 0,
      termsAndConditions: termsAndConditions || undefined,
      notes: notes || undefined,
      file,
    };
    if (editing) {
      updateCompanyPOFull(editing.id, fields);
      toast("PO updated.");
    } else {
      const po = addCompanyPOFull(fields);
      toast(`PO ${po.cpoNumber} created.`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold mb-3">
          {editing ? `Edit ${editing.cpoNumber}` : "New Company PO"}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="cpo-vendor"
            >
              Vendor <span className="text-red-600">*</span>
            </label>
            <select
              id="cpo-vendor"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={vendorId}
              onChange={(e) => {
                selectVendor(e.target.value);
                setError("");
              }}
            >
              <option value="">Select vendor…</option>
              {data.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500">
              Items <span className="text-red-600">*</span>
            </span>
            <div className="mt-1 space-y-1.5">
              {items.map((it) => (
                <div key={it.id} className="rounded-lg border p-2 space-y-1.5">
                  <input
                    className="w-full h-7 text-xs rounded border px-2"
                    placeholder="Description"
                    value={it.description}
                    onChange={(e) =>
                      updateItem(it.id, "description", e.target.value)
                    }
                  />
                  <div className="grid grid-cols-4 gap-1.5">
                    <input
                      type="number"
                      className="h-7 text-xs rounded border px-2"
                      placeholder="Qty"
                      value={it.quantity}
                      onChange={(e) =>
                        updateItem(it.id, "quantity", Number(e.target.value))
                      }
                    />
                    <input
                      className="h-7 text-xs rounded border px-2"
                      placeholder="Unit"
                      value={it.unit}
                      onChange={(e) =>
                        updateItem(it.id, "unit", e.target.value)
                      }
                    />
                    <input
                      type="number"
                      className="h-7 text-xs rounded border px-2"
                      placeholder="Rate"
                      value={it.rate}
                      onChange={(e) =>
                        updateItem(it.id, "rate", Number(e.target.value))
                      }
                    />
                    <div className="h-7 text-xs rounded border px-2 flex items-center justify-between bg-gray-50">
                      ₹{(it.quantity * it.rate).toLocaleString("en-IN")}
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="text-red-600 font-semibold"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="mt-1.5 text-xs font-semibold text-blue-600"
            >
              + Add Item
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="cpo-delivery-date"
              >
                Expected Delivery
              </label>
              <input
                id="cpo-delivery-date"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="cpo-gst"
              >
                GST %
              </label>
              <input
                id="cpo-gst"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={gstPercent}
                onChange={(e) => setGstPercent(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="cpo-delivery-address"
            >
              Delivery Address
            </label>
            <input
              id="cpo-delivery-address"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
            />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500 block">
              Attachment
            </span>
            <label className="mt-1 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border cursor-pointer">
              {file ? file.name : "Upload file"}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const ref = await fileToDataUrl(f);
                  setFile({
                    ref,
                    type: f.type === "application/pdf" ? "pdf" : "image",
                    name: f.name,
                  });
                }}
              />
            </label>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="cpo-terms"
            >
              Terms &amp; Conditions
            </label>
            <textarea
              id="cpo-terms"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={termsAndConditions}
              onChange={(e) => setTermsAndConditions(e.target.value)}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="cpo-notes"
            >
              Notes
            </label>
            <textarea
              id="cpo-notes"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="rounded-lg border p-2.5 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span>₹{subtotal.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">GST ({gstPercent || 0}%)</span>
              <span>₹{gstAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Grand Total</span>
              <span>₹{grandTotal.toLocaleString("en-IN")}</span>
            </div>
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Create PO"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Company PO (vendor-side) list — matches pages/CompanyPOs.tsx
// (see PARITY_TRACKER.md #15). Print/Download/Share simulated, same
// disclosed simplification as every document-producing module in this
// prototype. Disclosed gap: the real per-line-item "Receive" flow that
// can create/link Inventory/Tools/Machines/Dies is not reproduced —
// Status here is a plain Draft/Sent/Received toggle.
export function CompanyPOsScreen() {
  const { data, updateCompanyPOStatus, deleteRecord } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; po: import("../data").CompanyPO }
    | null
  >(null);
  const [viewing, setViewing] = useState<import("../data").CompanyPO | null>(
    null,
  );
  const sorted = [...data.companyPOs].sort((a, b) => b.createdAt - a.createdAt);
  const tbl = useTableControls(
    sorted,
    (po) => `${po.cpoNumber} ${po.vendorName}`,
    "cpoNumber",
  );

  const doDelete = async (po: import("../data").CompanyPO) => {
    const ok = await confirm(
      "Delete Purchase Order",
      `Delete "${po.cpoNumber}"? This cannot be undone.`,
    );
    if (!ok) return;
    deleteRecord("companyPOs", po.id);
    toast("PO deleted.");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Company PO</h2>
          <p className="text-xs text-gray-500">
            {data.companyPOs.length} purchase order
            {data.companyPOs.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + New PO
        </button>
      </div>
      <SearchBox
        value={tbl.query}
        onChange={tbl.setQuery}
        placeholder="Search purchase orders…"
      />
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">PO No.</th>
              <th className="text-left p-2.5">Vendor</th>
              <th className="text-left p-2.5">Items</th>
              <th className="text-left p-2.5">Grand Total</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((po) => (
              <tr key={po.id} className="border-b last:border-0">
                <td className="p-2.5 font-mono font-semibold">
                  {po.cpoNumber}
                </td>
                <td className="p-2.5">{po.vendorName}</td>
                <td className="p-2.5 text-gray-500">{po.items.length}</td>
                <td className="p-2.5 font-medium">
                  ₹{po.grandTotal.toLocaleString("en-IN")}
                </td>
                <td className="p-2.5">
                  <select
                    className="h-7 text-xs rounded-lg border px-1.5"
                    value={po.status}
                    onChange={(e) =>
                      updateCompanyPOStatus(
                        po.id,
                        e.target.value as import("../data").CompanyPOStatus,
                      )
                    }
                  >
                    {CPO_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setViewing(po)}
                      className="text-gray-600 font-semibold"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", po })}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        toast(`Print requested for ${po.cpoNumber}`)
                      }
                      className="text-gray-600 font-semibold"
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        toast(`${po.cpoNumber} downloaded (simulated)`)
                      }
                      className="text-gray-600 font-semibold"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        toast(`Share link copied for ${po.cpoNumber}`)
                      }
                      className="text-emerald-600 font-semibold"
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      onClick={() => doDelete(po)}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  No purchase orders found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <CompanyPOFormDialog
          editing={dialog.mode === "edit" ? dialog.po : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold mb-3">{viewing.cpoNumber}</h3>
            <div className="divide-y text-xs mb-3">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Vendor</span>
                <span className="font-medium">{viewing.vendorName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Expected Delivery</span>
                <span className="font-medium">
                  {viewing.expectedDeliveryDate || "—"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Status</span>
                <span className="font-medium">{viewing.status}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Grand Total</span>
                <span className="font-medium">
                  ₹{viewing.grandTotal.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
            <div className="rounded-lg border divide-y">
              {viewing.items.map((it) => (
                <div key={it.id} className="p-2 text-xs flex justify-between">
                  <span>
                    {it.description} ({it.quantity} {it.unit})
                  </span>
                  <span>₹{it.amount.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setViewing(null)}
                className="text-xs font-semibold px-3 py-2 rounded-lg border"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PETTY_EXPENSE_TYPES: import("../data").PettyExpenseType[] = [
  "Material",
  "Tools",
  "Labour",
  "Maintenance",
  "Food",
  "Transport",
  "Misc",
  "Inventory Purchase",
  "Machine Service",
  "Vehicle Expense",
  "Employee Personal Expense",
  "Courier / Delivery",
];
const PETTY_EXPENSE_MODES: import("../data").PettyExpenseMode[] = [
  "Company Expense",
  "Personal Expense",
];
const fmtRs = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

// Real Add/Edit Expense dialog — matches pages/PettyExpenses.tsx's
// ad-hoc single-amount flow (see PARITY_TRACKER.md #16). Reproduces the
// real `resolveFloatLink` rule: a chosen float only sticks if it
// belongs to the selected employee and isn't Fully Settled, and forces
// Company Expense mode when a float is linked (float cash is company
// money by definition).
function PettyExpenseFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").PettyExpense | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const {
    data,
    addPettyExpenseFull,
    updatePettyExpenseFull,
    resolveFloatLink,
  } = useUxLabStore();
  const toast = useToast();
  const [date, setDate] = useState(
    editing?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ?? "");
  const [amount, setAmount] = useState(String(editing?.amount ?? ""));
  const [expenseType, setExpenseType] = useState<
    import("../data").PettyExpenseType
  >(editing?.expenseType ?? "Misc");
  const [expenseMode, setExpenseMode] = useState<
    import("../data").PettyExpenseMode
  >(editing?.expenseMode ?? "Company Expense");
  const [floatId, setFloatId] = useState(editing?.floatId ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const employeeFloats = data.expenseFloats.filter(
    (f) => f.employeeId === employeeId && f.status !== "Fully Settled",
  );

  const submit = async () => {
    if (!employeeId) {
      setError("Select employee");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    const resolvedFloatId = resolveFloatLink(floatId || undefined, employeeId);
    const fields = {
      date,
      employeeId,
      amount: Number(amount),
      expenseType,
      expenseMode: resolvedFloatId ? ("Company Expense" as const) : expenseMode,
      floatId: resolvedFloatId,
      notes: notes || undefined,
    };
    if (editing) {
      updatePettyExpenseFull(editing.id, fields);
      toast("Expense updated");
    } else {
      addPettyExpenseFull(fields);
      toast("Expense added");
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Expense" : "Add Expense"}
        </h3>
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="pe-date"
              >
                Date
              </label>
              <input
                id="pe-date"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="pe-employee"
              >
                Employee <span className="text-red-600">*</span>
              </label>
              <select
                id="pe-employee"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setFloatId("");
                  setError("");
                }}
              >
                <option value="">Select…</option>
                {data.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="pe-amount"
              >
                Amount ₹ <span className="text-red-600">*</span>
              </label>
              <input
                id="pe-amount"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError("");
                }}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="pe-type"
              >
                Category
              </label>
              <select
                id="pe-type"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={expenseType}
                onChange={(e) =>
                  setExpenseType(
                    e.target.value as import("../data").PettyExpenseType,
                  )
                }
              >
                {PETTY_EXPENSE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="pe-mode"
              >
                Mode
              </label>
              <select
                id="pe-mode"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={floatId ? "Company Expense" : expenseMode}
                disabled={!!floatId}
                onChange={(e) =>
                  setExpenseMode(
                    e.target.value as import("../data").PettyExpenseMode,
                  )
                }
              >
                {PETTY_EXPENSE_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="pe-float"
              >
                Expense Float
              </label>
              <select
                id="pe-float"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={floatId}
                onChange={(e) => setFloatId(e.target.value)}
              >
                <option value="">None</option>
                {employeeFloats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.floatNo} — Balance {fmtRs(f.balanceAmount)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="pe-notes"
            >
              Notes
            </label>
            <textarea
              id="pe-notes"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Update" : "Add Expense"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Issue Float dialog — matches pages/PettyExpenses.tsx's Floats
// tab (see PARITY_TRACKER.md #16).
function ExpenseFloatFormDialog({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { data, addExpenseFloatFull } = useUxLabStore();
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [issuedDate, setIssuedDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [issuedAmount, setIssuedAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!employeeId) {
      setError("Select employee");
      return;
    }
    if (!issuedAmount || Number(issuedAmount) <= 0) {
      setError("Enter issued amount");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    const f = addExpenseFloatFull({
      employeeId,
      issuedDate,
      issuedAmount: Number(issuedAmount),
      purpose: purpose || undefined,
      notes: notes || undefined,
    });
    toast(`Expense float ${f.floatNo} issued`);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">Issue Float</h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="flt-employee"
            >
              Employee <span className="text-red-600">*</span>
            </label>
            <select
              id="flt-employee"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setError("");
              }}
            >
              <option value="">Select…</option>
              {data.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="flt-date"
              >
                Issued Date
              </label>
              <input
                id="flt-date"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="flt-amount"
              >
                Issued Amount ₹ <span className="text-red-600">*</span>
              </label>
              <input
                id="flt-amount"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={issuedAmount}
                onChange={(e) => {
                  setIssuedAmount(e.target.value);
                  setError("");
                }}
              />
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="flt-purpose"
            >
              Purpose
            </label>
            <input
              id="flt-purpose"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="flt-notes"
            >
              Notes
            </label>
            <textarea
              id="flt-notes"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Issuing…" : "Issue Float"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Petty Expenses screen: Records + Floats tabs, real Expense Float
// lifecycle (issued/spent/returned/balance, all balance/status DERIVED
// from linked expenses exactly like production's deriveFloatTotals) —
// matches pages/PettyExpenses.tsx (see PARITY_TRACKER.md #16).
// Disclosed gap: the deep itemized "Settle Float via Purchased Items"
// flow (12 per-category conditional field sets fanning out to
// Inventory/Machinery/Payroll) is not reproduced — "Return Remaining"
// here only records `returnedAmount` on the float.
export function PettyExpensesScreen() {
  const { data, deleteRecord, returnExpenseFloatAmount } = useUxLabStore();
  const toast = useToast();
  const [tab, setTab] = useState<"records" | "floats">("records");
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; expense: import("../data").PettyExpense }
    | null
  >(null);
  const [floatDialogOpen, setFloatDialogOpen] = useState(false);
  const [returningFloat, setReturningFloat] = useState<
    import("../data").ExpenseFloat | null
  >(null);
  const [returnAmount, setReturnAmount] = useState("");

  const employeeName = (id: string) =>
    data.employees.find((e) => e.id === id)?.name ?? "—";
  const sortedExpenses = [...data.pettyExpenses].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const totalSpent = data.pettyExpenses.reduce((s, e) => s + e.amount, 0);
  const openFloats = data.expenseFloats.filter(
    (f) => f.status !== "Fully Settled",
  ).length;

  // No confirm dialog here — matches production's real (direct, no-
  // confirm) delete for petty expenses exactly.
  const doDelete = (id: string) => {
    deleteRecord("pettyExpenses", id);
    toast("Expense deleted");
  };

  const submitReturn = () => {
    if (!returningFloat) return;
    returnExpenseFloatAmount(returningFloat.id, Number(returnAmount) || 0);
    toast("Float updated");
    setReturningFloat(null);
    setReturnAmount("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Petty Expenses</h2>
          <p className="text-xs text-gray-500">
            Total spent {fmtRs(totalSpent)} · {openFloats} open float
            {openFloats !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFloatDialogOpen(true)}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            + Issue Float
          </button>
          <button
            type="button"
            onClick={() => setDialog({ mode: "create" })}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
          >
            + Add Expense
          </button>
        </div>
      </div>
      <div className="flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab("records")}
          className={`text-xs font-semibold px-3 py-2 border-b-2 ${tab === "records" ? "border-gray-900" : "border-transparent text-gray-400"}`}
        >
          Records
        </button>
        <button
          type="button"
          onClick={() => setTab("floats")}
          className={`text-xs font-semibold px-3 py-2 border-b-2 ${tab === "floats" ? "border-gray-900" : "border-transparent text-gray-400"}`}
        >
          Floats
        </button>
      </div>
      {tab === "records" ? (
        <div className="rounded-xl border bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-left p-2.5">Date</th>
                <th className="text-left p-2.5">Employee</th>
                <th className="text-left p-2.5">Category</th>
                <th className="text-left p-2.5">Mode</th>
                <th className="text-left p-2.5">Float</th>
                <th className="text-left p-2.5">Amount</th>
                <th className="text-left p-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedExpenses.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="p-2.5 text-gray-500">{e.date}</td>
                  <td className="p-2.5 font-medium">
                    {employeeName(e.employeeId)}
                  </td>
                  <td className="p-2.5 text-gray-500">{e.expenseType}</td>
                  <td className="p-2.5 text-gray-500">{e.expenseMode}</td>
                  <td className="p-2.5 text-gray-500">
                    {data.expenseFloats.find((f) => f.id === e.floatId)
                      ?.floatNo ?? "—"}
                  </td>
                  <td className="p-2.5 font-medium">{fmtRs(e.amount)}</td>
                  <td className="p-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDialog({ mode: "edit", expense: e })}
                        className="text-blue-600 font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => doDelete(e.id)}
                        className="text-red-600 font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedExpenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No expenses recorded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-left p-2.5">Float No.</th>
                <th className="text-left p-2.5">Employee</th>
                <th className="text-left p-2.5">Issued</th>
                <th className="text-left p-2.5">Spent</th>
                <th className="text-left p-2.5">Returned</th>
                <th className="text-left p-2.5">Balance</th>
                <th className="text-left p-2.5">Status</th>
                <th className="text-left p-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.expenseFloats.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="p-2.5 font-mono font-semibold">{f.floatNo}</td>
                  <td className="p-2.5">{employeeName(f.employeeId)}</td>
                  <td className="p-2.5">{fmtRs(f.issuedAmount)}</td>
                  <td className="p-2.5 text-gray-500">
                    {fmtRs(f.spentAmount)}
                  </td>
                  <td className="p-2.5 text-gray-500">
                    {fmtRs(f.returnedAmount)}
                  </td>
                  <td className="p-2.5 font-medium">
                    {fmtRs(f.balanceAmount)}
                  </td>
                  <td className="p-2.5">
                    <StatusBadge
                      status={f.status}
                      tone={
                        f.status === "Fully Settled"
                          ? "success"
                          : f.status === "Partially Settled"
                            ? "warning"
                            : "neutral"
                      }
                    />
                  </td>
                  <td className="p-2.5">
                    {f.status !== "Fully Settled" && (
                      <button
                        type="button"
                        onClick={() => {
                          setReturningFloat(f);
                          setReturnAmount(String(f.returnedAmount || ""));
                        }}
                        className="text-blue-600 font-semibold"
                      >
                        Return Remaining
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data.expenseFloats.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    No floats issued
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {dialog && (
        <PettyExpenseFormDialog
          editing={dialog.mode === "edit" ? dialog.expense : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {floatDialogOpen && (
        <ExpenseFloatFormDialog
          onCancel={() => setFloatDialogOpen(false)}
          onSaved={() => setFloatDialogOpen(false)}
        />
      )}
      {returningFloat && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border shadow-lg w-full max-w-xs p-5">
            <h3 className="text-sm font-bold mb-3">
              Return Remaining — {returningFloat.floatNo}
            </h3>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="flt-return"
            >
              Returned Amount ₹
            </label>
            <input
              id="flt-return"
              type="number"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={returnAmount}
              onChange={(e) => setReturnAmount(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setReturningFloat(null)}
                className="text-xs font-semibold px-3 py-2 rounded-lg border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReturn}
                className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CHARGING_METHODS: import("../data").ChargingMethod[] = [
  "hour",
  "piece",
  "bend",
  "kg",
  "other",
];
const CHARGING_METHOD_LABEL: Record<import("../data").ChargingMethod, string> =
  {
    hour: "Per Hour",
    piece: "Per Piece",
    bend: "Per Bend",
    kg: "Per Kg",
    other: "Other",
  };
const fmtRs2 = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

// Real Add/Edit Billable Service dialog — matches pages/
// MachineRevenue.tsx (see PARITY_TRACKER.md #17).
function BillableServiceFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").BillableService | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { data, addBillableServiceFull, updateBillableServiceFull } =
    useUxLabStore();
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? "");
  const [machineId, setMachineId] = useState(editing?.machineId ?? "");
  const [chargingMethod, setChargingMethod] = useState<
    import("../data").ChargingMethod
  >(editing?.chargingMethod ?? "hour");
  const [unitLabel, setUnitLabel] = useState(editing?.unitLabel ?? "");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [initialRate, setInitialRate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError("Service name is required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    if (editing) {
      updateBillableServiceFull(editing.id, {
        name: name.trim(),
        machineId: machineId || undefined,
        chargingMethod,
        unitLabel: unitLabel || undefined,
        isActive,
      });
      toast("Billable service updated");
    } else {
      const rateNum = Number(initialRate);
      const s = addBillableServiceFull({
        name: name.trim(),
        machineId: machineId || undefined,
        chargingMethod,
        unitLabel: unitLabel || undefined,
        initialRate: initialRate.trim() && rateNum >= 0 ? rateNum : undefined,
      });
      toast(`Billable service "${s.name}" added`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Billable Service" : "New Billable Service"}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="bsv-name"
            >
              Service Name <span className="text-red-600">*</span>
            </label>
            <input
              id="bsv-name"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="bsv-machine"
            >
              Machine (optional)
            </label>
            <select
              id="bsv-machine"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
            >
              <option value="">Process-level (no machine)</option>
              {data.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="bsv-method"
              >
                Charging Method
              </label>
              <select
                id="bsv-method"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={chargingMethod}
                onChange={(e) =>
                  setChargingMethod(
                    e.target.value as import("../data").ChargingMethod,
                  )
                }
              >
                {CHARGING_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {CHARGING_METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="bsv-unit"
              >
                Unit Label
              </label>
              <input
                id="bsv-unit"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.target.value)}
              />
            </div>
          </div>
          {!editing && (
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="bsv-rate"
              >
                Initial Rate ₹
              </label>
              <input
                id="bsv-rate"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={initialRate}
                onChange={(e) => setInitialRate(e.target.value)}
              />
            </div>
          )}
          {editing && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
          )}
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Service"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Record/Edit Usage dialog. Quantity × rate revenue preview; on
// Create the rate is the service's live current rate, on Edit the
// original frozen rateApplied is preserved and reused for the preview
// — matches pages/MachineRevenue.tsx exactly (see PARITY_TRACKER.md
// #17).
function ServiceUsageFormDialog({
  service,
  editing,
  onCancel,
  onSaved,
}: {
  service: import("../data").BillableService;
  editing: import("../data").MachineServiceUsage | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const {
    data,
    currentServiceRate,
    addServiceUsageFull,
    updateServiceUsageFull,
  } = useUxLabStore();
  const toast = useToast();
  const [projectId, setProjectId] = useState(editing?.projectId ?? "");
  const [usageDate, setUsageDate] = useState(
    editing?.usageDate ?? new Date().toISOString().slice(0, 10),
  );
  const [quantity, setQuantity] = useState(String(editing?.quantity ?? ""));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const rate = editing ? editing.rateApplied : currentServiceRate(service.id);
  const qtyNum = Number(quantity) || 0;
  const revenuePreview = qtyNum * rate;

  const submit = async () => {
    if (!editing && !projectId) {
      setError("Select a project");
      return;
    }
    if (qtyNum <= 0) {
      setError("Quantity must be greater than zero");
      return;
    }
    if (!usageDate) {
      setError("Usage date is required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    if (editing) {
      updateServiceUsageFull(editing.id, {
        usageDate,
        quantity: qtyNum,
        notes: notes || undefined,
      });
      toast("Usage updated");
    } else {
      const u = addServiceUsageFull({
        projectId,
        billableServiceId: service.id,
        usageDate,
        quantity: qtyNum,
        notes: notes || undefined,
      });
      toast(`Usage recorded — ${fmtRs2(u.revenueAmount)} revenue`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Usage" : `Record Usage — ${service.name}`}
        </h3>
        <div className="space-y-2.5">
          {!editing && (
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="msu-project"
              >
                Project <span className="text-red-600">*</span>
              </label>
              <select
                id="msu-project"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setError("");
                }}
              >
                <option value="">Select…</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="msu-date"
              >
                Usage Date
              </label>
              <input
                id="msu-date"
                type="date"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={usageDate}
                onChange={(e) => setUsageDate(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="msu-qty"
              >
                Quantity {service.unitLabel ? `(${service.unitLabel})` : ""}
              </label>
              <input
                id="msu-qty"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setError("");
                }}
              />
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="msu-notes"
            >
              Notes
            </label>
            <textarea
              id="msu-notes"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="rounded-lg border p-2.5 text-xs flex justify-between">
            <span className="text-gray-500">
              Revenue ({qtyNum} × {fmtRs2(rate)})
            </span>
            <span className="font-bold">{fmtRs2(revenuePreview)}</span>
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Record Usage"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Machine/Service Revenue screen: billable services with live
// current rate, insert-only rate history (Change Rate always appends,
// never edits a past rate — "past revenue is unaffected"), per-service
// usage drill-down with Record/Edit/Delete, real delete-block-reason
// guard ("Services with recorded usage cannot be deleted") — matches
// pages/MachineRevenue.tsx (see PARITY_TRACKER.md #17). Revenue-only,
// never profit/costing, exactly like production.
export function MachineRevenueScreen() {
  const {
    data,
    currentServiceRate,
    serviceDeleteBlockReason,
    deleteBillableServiceFull,
    changeServiceRate,
    deleteServiceUsageFull,
  } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; service: import("../data").BillableService }
    | null
  >(null);
  const [rateTarget, setRateTarget] = useState<
    import("../data").BillableService | null
  >(null);
  const [newRate, setNewRate] = useState("");
  const [usageDialog, setUsageDialog] = useState<{
    service: import("../data").BillableService;
    editing: import("../data").MachineServiceUsage | null;
  } | null>(null);
  const [usageListFor, setUsageListFor] = useState<
    import("../data").BillableService | null
  >(null);

  const activeServices = data.billableServices.filter(
    (s) => s.isActive !== false,
  );
  const projectName = (id: string) =>
    data.projects.find((p) => p.id === id)?.name ?? "—";
  const machineName = (id?: string) =>
    id ? data.machines.find((m) => m.id === id)?.name : undefined;

  const serviceStats = (s: import("../data").BillableService) => {
    const rows = data.machineServiceUsage.filter(
      (u) => u.billableServiceId === s.id,
    );
    return {
      totalQty: rows.reduce((sum, u) => sum + u.quantity, 0),
      totalRevenue: rows.reduce((sum, u) => sum + u.revenueAmount, 0),
      usageCount: rows.length,
    };
  };
  const grandTotalRevenue = activeServices.reduce(
    (sum, s) => sum + serviceStats(s).totalRevenue,
    0,
  );

  const doDeleteService = async (s: import("../data").BillableService) => {
    const block = serviceDeleteBlockReason(s.id);
    const ok = await confirm(
      "Delete Billable Service",
      block
        ? `Delete "${s.name}"? ${block}`
        : `Delete "${s.name}"? Services with recorded usage cannot be deleted.`,
    );
    if (!ok) return;
    if (block) {
      toast(block);
      return;
    }
    deleteBillableServiceFull(s.id);
    toast("Billable service removed");
  };

  const doDeleteUsage = async (u: import("../data").MachineServiceUsage) => {
    const ok = await confirm(
      "Delete Usage Record",
      `Delete this usage record dated ${u.usageDate} (${fmtRs2(u.revenueAmount)})? This will remove it from all revenue totals.`,
    );
    if (!ok) return;
    deleteServiceUsageFull(u.id);
    toast("Usage removed");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Machine / Service Revenue</h2>
          <p className="text-xs text-gray-500">
            Total revenue {fmtRs2(grandTotalRevenue)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + New Service
        </button>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">Service</th>
              <th className="text-left p-2.5">Machine</th>
              <th className="text-left p-2.5">Method</th>
              <th className="text-left p-2.5">Current Rate</th>
              <th className="text-left p-2.5">Usage</th>
              <th className="text-left p-2.5">Total Revenue</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeServices.map((s) => {
              const stats = serviceStats(s);
              return (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="p-2.5 font-semibold">{s.name}</td>
                  <td className="p-2.5 text-gray-500">
                    {machineName(s.machineId) || "—"}
                  </td>
                  <td className="p-2.5 text-gray-500">
                    {CHARGING_METHOD_LABEL[s.chargingMethod]}
                  </td>
                  <td className="p-2.5">{fmtRs2(currentServiceRate(s.id))}</td>
                  <td className="p-2.5">
                    <button
                      type="button"
                      onClick={() => setUsageListFor(s)}
                      className="text-blue-600 font-semibold"
                    >
                      {stats.usageCount} record
                      {stats.usageCount !== 1 ? "s" : ""}
                    </button>
                  </td>
                  <td className="p-2.5 font-medium">
                    {fmtRs2(stats.totalRevenue)}
                  </td>
                  <td className="p-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          setUsageDialog({ service: s, editing: null })
                        }
                        className="text-emerald-600 font-semibold"
                      >
                        Record Usage
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRateTarget(s);
                          setNewRate(String(currentServiceRate(s.id) || ""));
                        }}
                        className="text-gray-600 font-semibold"
                      >
                        Change Rate
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialog({ mode: "edit", service: s })}
                        className="text-blue-600 font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => doDeleteService(s)}
                        className="text-red-600 font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {activeServices.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No billable services yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <BillableServiceFormDialog
          editing={dialog.mode === "edit" ? dialog.service : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {usageDialog && (
        <ServiceUsageFormDialog
          service={usageDialog.service}
          editing={usageDialog.editing}
          onCancel={() => setUsageDialog(null)}
          onSaved={() => setUsageDialog(null)}
        />
      )}
      {rateTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border shadow-lg w-full max-w-xs p-5">
            <h3 className="text-sm font-bold mb-3">
              Change Rate — {rateTarget.name}
            </h3>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="msr-rate"
            >
              New Rate ₹
            </label>
            <input
              id="msr-rate"
              type="number"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setRateTarget(null)}
                className="text-xs font-semibold px-3 py-2 rounded-lg border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const n = Number(newRate);
                  if (!newRate.trim() || Number.isNaN(n) || n < 0) {
                    toast("Enter a valid rate");
                    return;
                  }
                  changeServiceRate(rateTarget.id, n);
                  toast(
                    `New rate ${fmtRs2(n)} set for "${rateTarget.name}" — past revenue is unaffected`,
                  );
                  setRateTarget(null);
                }}
                className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {usageListFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border shadow-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold mb-3">
              Usage — {usageListFor.name}
            </h3>
            <div className="rounded-lg border divide-y">
              {data.machineServiceUsage
                .filter((u) => u.billableServiceId === usageListFor.id)
                .sort((a, b) => b.usageDate.localeCompare(a.usageDate))
                .map((u) => (
                  <div key={u.id} className="p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium">
                        {projectName(u.projectId)}
                      </span>
                      <span>{fmtRs2(u.revenueAmount)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400 mt-0.5">
                      <span>
                        {u.usageDate} · {u.quantity} {u.unit} @{" "}
                        {fmtRs2(u.rateApplied)}
                      </span>
                      <span className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setUsageDialog({
                              service: usageListFor,
                              editing: u,
                            })
                          }
                          className="text-blue-600 font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => doDeleteUsage(u)}
                          className="text-red-600 font-semibold"
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              {data.machineServiceUsage.filter(
                (u) => u.billableServiceId === usageListFor.id,
              ).length === 0 && (
                <p className="p-3 text-xs text-gray-400 text-center">
                  No usage recorded yet.
                </p>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setUsageListFor(null)}
                className="text-xs font-semibold px-3 py-2 rounded-lg border"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SCRAP_UNITS = ["kg", "pcs", "sheets", "meters", "liters"];
const SCRAP_STATUSES: import("../data").ScrapStatus[] = [
  "In Stock",
  "Sold",
  "Disposed",
];

// Real Add/Edit Scrap dialog — matches pages/ScrapManagement.tsx (see
// PARITY_TRACKER.md #18).
function ScrapFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").ScrapRecord | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { data, addScrapRecordFull, updateScrapRecordFull } = useUxLabStore();
  const toast = useToast();
  const [materialType, setMaterialType] = useState(editing?.materialType ?? "");
  const [unit, setUnit] = useState(editing?.unit ?? "kg");
  const [projectId, setProjectId] = useState(editing?.projectId ?? "");
  const [stage, setStage] = useState(editing?.stage ?? "");
  const [status, setStatus] = useState<import("../data").ScrapStatus>(
    editing?.status ?? "In Stock",
  );
  const [generatedQty, setGeneratedQty] = useState(
    String(editing?.generatedQty ?? 0),
  );
  const [reusableQty, setReusableQty] = useState(
    String(editing?.reusableQty ?? 0),
  );
  const [soldQty, setSoldQty] = useState(String(editing?.soldQty ?? 0));
  const [disposedQty, setDisposedQty] = useState(
    String(editing?.disposedQty ?? 0),
  );
  const [scrapValue, setScrapValue] = useState(
    String(editing?.scrapValue ?? ""),
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!materialType.trim()) {
      setError("Material type required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    const fields = {
      projectId: projectId || undefined,
      stage: stage || undefined,
      materialType: materialType.trim(),
      unit,
      generatedQty: Number(generatedQty) || 0,
      reusableQty: Number(reusableQty) || 0,
      soldQty: Number(soldQty) || 0,
      disposedQty: Number(disposedQty) || 0,
      scrapValue: scrapValue ? Number(scrapValue) : undefined,
      status,
      notes: notes || undefined,
    };
    if (editing) {
      updateScrapRecordFull(editing.id, fields);
      toast("Scrap record updated");
    } else {
      addScrapRecordFull(fields);
      toast("Scrap record added");
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Scrap Record" : "Log Scrap"}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="scrap-material"
            >
              Material Type <span className="text-red-600">*</span>
            </label>
            <input
              id="scrap-material"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              placeholder="e.g. MS Sheet offcuts"
              value={materialType}
              onChange={(e) => {
                setMaterialType(e.target.value);
                setError("");
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="scrap-unit"
              >
                Unit
              </label>
              <select
                id="scrap-unit"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              >
                {SCRAP_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="scrap-project"
              >
                Project (optional)
              </label>
              <select
                id="scrap-project"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">—</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="scrap-stage"
              >
                Stage (optional)
              </label>
              <input
                id="scrap-stage"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                placeholder="e.g. Laser Cutting"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="scrap-status"
              >
                Status
              </label>
              <select
                id="scrap-status"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as import("../data").ScrapStatus)
                }
              >
                {SCRAP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="scrap-generated"
              >
                Generated Qty
              </label>
              <input
                id="scrap-generated"
                type="number"
                min={0}
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={generatedQty}
                onChange={(e) => setGeneratedQty(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="scrap-reusable"
              >
                Reusable Qty
              </label>
              <input
                id="scrap-reusable"
                type="number"
                min={0}
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={reusableQty}
                onChange={(e) => setReusableQty(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="scrap-sold"
              >
                Sold Qty
              </label>
              <input
                id="scrap-sold"
                type="number"
                min={0}
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={soldQty}
                onChange={(e) => setSoldQty(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="scrap-disposed"
              >
                Disposed Qty
              </label>
              <input
                id="scrap-disposed"
                type="number"
                min={0}
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={disposedQty}
                onChange={(e) => setDisposedQty(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="scrap-value"
            >
              Scrap Value (₹)
            </label>
            <input
              id="scrap-value"
              type="number"
              min={0}
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={scrapValue}
              onChange={(e) => setScrapValue(e.target.value)}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="scrap-notes"
            >
              Notes
            </label>
            <input
              id="scrap-notes"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Scrap Management screen: KPI row, row-click-to-edit table, real
// confirm-delete — matches pages/ScrapManagement.tsx (see
// PARITY_TRACKER.md #18).
export function ScrapScreen() {
  const { data, deleteRecord } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; record: import("../data").ScrapRecord }
    | null
  >(null);

  const projectName = (r: import("../data").ScrapRecord) =>
    r.projectName ??
    data.projects.find((p) => p.id === r.projectId)?.name ??
    "—";
  const totalGenerated = data.scrapRecords.reduce(
    (s, r) => s + r.generatedQty,
    0,
  );
  const totalReusable = data.scrapRecords.reduce(
    (s, r) => s + r.reusableQty,
    0,
  );
  const totalSold = data.scrapRecords.reduce((s, r) => s + r.soldQty, 0);
  const totalValue = data.scrapRecords.reduce(
    (s, r) => s + (r.scrapValue ?? 0),
    0,
  );

  const doDelete = async (r: import("../data").ScrapRecord) => {
    const ok = await confirm(
      "Delete scrap record?",
      "This scrap record will be permanently deleted.",
    );
    if (!ok) return;
    deleteRecord("scrapRecords", r.id);
    toast("Scrap record deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Scrap Management</h2>
          <p className="text-xs text-gray-500">
            {data.scrapRecords.length} record
            {data.scrapRecords.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + Log Scrap
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold">{totalGenerated} kg</p>
          <p className="text-[10px] text-gray-500 uppercase">Total Generated</p>
        </div>
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold text-emerald-700">
            {totalReusable} kg
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Reusable</p>
        </div>
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold text-blue-700">{totalSold} kg</p>
          <p className="text-[10px] text-gray-500 uppercase">Sold</p>
        </div>
        <div className="rounded-lg border bg-amber-50 border-amber-200 p-2.5 text-center">
          <p className="text-sm font-bold text-amber-700">
            {fmtRs2(totalValue)}
          </p>
          <p className="text-[10px] text-amber-600 uppercase">Scrap Value</p>
        </div>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">Material</th>
              <th className="text-left p-2.5">Project</th>
              <th className="text-left p-2.5">Stage</th>
              <th className="text-left p-2.5">Generated</th>
              <th className="text-left p-2.5">Reusable</th>
              <th className="text-left p-2.5">Sold</th>
              <th className="text-left p-2.5">Value</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.scrapRecords.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-2.5 font-semibold">{r.materialType}</td>
                <td className="p-2.5 text-gray-500">{projectName(r)}</td>
                <td className="p-2.5 text-gray-500">{r.stage || "—"}</td>
                <td className="p-2.5">
                  {r.generatedQty} {r.unit}
                </td>
                <td className="p-2.5 text-emerald-700">
                  {r.reusableQty} {r.unit}
                </td>
                <td className="p-2.5 text-blue-700">
                  {r.soldQty} {r.unit}
                </td>
                <td className="p-2.5">
                  {r.scrapValue ? fmtRs2(r.scrapValue) : "—"}
                </td>
                <td className="p-2.5">
                  <StatusBadge
                    status={r.status}
                    tone={
                      r.status === "In Stock"
                        ? "success"
                        : r.status === "Sold"
                          ? "neutral"
                          : "warning"
                    }
                  />
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", record: r })}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => doDelete(r)}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {data.scrapRecords.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-400">
                  No scrap records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <ScrapFormDialog
          editing={dialog.mode === "edit" ? dialog.record : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// Real Ledger aggregation engine — matches lib/ledger.ts exactly (see
// PARITY_TRACKER.md #19). A pure, read-only layer over existing
// Quotations/Invoices/Payments (customer) or Payables/PayablePayments/
// CompanyPOs (vendor). Creates no new records; every row is derived on
// the fly. Quotations and unlinked Purchase Orders are informational —
// shown for context, never counted in debit/credit or running balance.
type LedgerDocType =
  | "Quotation"
  | "Invoice"
  | "Payment"
  | "Payable"
  | "Vendor Payment"
  | "Purchase Order";
interface LedgerEntry {
  key: string;
  date: string;
  timestamp: number;
  docType: LedgerDocType;
  docNo: string;
  description: string;
  debit: number;
  credit: number;
  informational: boolean;
  refAmount?: number;
  status?: string;
  sourceId: string;
}
interface LedgerRow extends LedgerEntry {
  balance: number;
}
type DateRangePreset = "all" | "today" | "this_month" | "last_month";
interface DateRange {
  start: string | null;
  end: string | null;
}

const ledgerPad = (n: number) => String(n).padStart(2, "0");
const ledgerIsoDate = (d: Date) =>
  `${d.getFullYear()}-${ledgerPad(d.getMonth() + 1)}-${ledgerPad(d.getDate())}`;

function resolveDateRange(preset: DateRangePreset): DateRange {
  const now = new Date();
  if (preset === "today") {
    const iso = ledgerIsoDate(now);
    return { start: iso, end: iso };
  }
  if (preset === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: ledgerIsoDate(start), end: ledgerIsoDate(end) };
  }
  if (preset === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: ledgerIsoDate(start), end: ledgerIsoDate(end) };
  }
  return { start: null, end: null };
}

function buildCustomerLedgerEntries(
  customerId: string,
  data: import("../data").DataState,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const q of data.quotations) {
    if (q.customerId !== customerId) continue;
    entries.push({
      key: `quotation-${q.id}`,
      date: q.quotationDate || q.createdAt,
      timestamp: new Date(q.createdAt).getTime(),
      docType: "Quotation",
      docNo: q.no,
      description: `Quotation • ${q.lineItems?.length ?? 0} item(s)`,
      debit: 0,
      credit: 0,
      informational: true,
      refAmount: q.total,
      status: q.status,
      sourceId: q.id,
    });
  }
  const custInvoices = data.invoices.filter(
    (inv) => inv.customerId === customerId,
  );
  for (const inv of custInvoices) {
    const isTax = inv.invoiceType !== "proforma";
    entries.push({
      key: `invoice-${inv.id}`,
      date: inv.invoiceDate,
      timestamp: new Date(inv.invoiceDate).getTime(),
      docType: "Invoice",
      docNo: inv.no,
      description:
        inv.invoiceType === "proforma" ? "Proforma Invoice" : "Tax Invoice",
      debit: isTax ? inv.amount : 0,
      credit: 0,
      informational: !isTax,
      refAmount: !isTax ? inv.amount : undefined,
      status: inv.status,
      sourceId: inv.id,
    });
  }
  const invoiceById = new Map(custInvoices.map((inv) => [inv.id, inv]));
  for (const p of data.payments) {
    const inv = invoiceById.get(p.invoiceId);
    if (!inv) continue;
    entries.push({
      key: `payment-${p.id}`,
      date: p.date,
      timestamp: new Date(p.date).getTime(),
      docType: "Payment",
      docNo: p.referenceNo || `PAY-${p.id.slice(0, 8).toUpperCase()}`,
      description: `Payment via ${p.method} against ${inv.no}${p.notes ? ` • ${p.notes}` : ""}`,
      debit: 0,
      credit: p.amount,
      informational: false,
      sourceId: p.id,
    });
  }
  return entries;
}

function buildVendorLedgerEntries(
  vendorId: string,
  data: import("../data").DataState,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const vPayables = data.payables.filter((p) => p.vendorId === vendorId);
  for (const p of vPayables) {
    entries.push({
      key: `payable-${p.id}`,
      date: p.dueDate,
      timestamp: new Date(p.dueDate).getTime(),
      docType: "Payable",
      docNo: `PBL-${p.id.slice(0, 8).toUpperCase()}`,
      description: `${p.paymentType || "Payable"}${p.notes ? ` • ${p.notes}` : ""}`,
      debit: p.amount,
      credit: 0,
      informational: false,
      status: payableStatus(p),
      sourceId: p.id,
    });
  }
  const payableById = new Map(vPayables.map((p) => [p.id, p]));
  for (const pp of data.payablePayments) {
    const payable = payableById.get(pp.payableId);
    if (!payable) continue;
    entries.push({
      key: `payable-payment-${pp.id}`,
      date: pp.paymentDate,
      timestamp: new Date(pp.paymentDate).getTime(),
      docType: "Vendor Payment",
      docNo: pp.referenceNo || `VPAY-${pp.id.slice(0, 8).toUpperCase()}`,
      description: `Payment via ${pp.mode} against ${payable.paymentType || "payable"}${pp.notes ? ` • ${pp.notes}` : ""}`,
      debit: 0,
      credit: pp.amount,
      informational: false,
      sourceId: pp.id,
    });
  }
  return entries;
}

function sortChrono(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.timestamp - b.timestamp;
  });
}

function computeLedger(
  entries: LedgerEntry[],
  range: DateRange,
): {
  rows: LedgerRow[];
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  outstanding: number;
} {
  const sorted = sortChrono(entries);
  let cumulative = 0;
  const before: LedgerEntry[] = [];
  const inRange: LedgerEntry[] = [];
  for (const e of sorted) {
    const afterStart = !range.start || e.date >= range.start;
    const beforeEnd = !range.end || e.date <= range.end;
    if (!afterStart) before.push(e);
    else if (beforeEnd) inRange.push(e);
  }
  for (const e of before) {
    if (!e.informational) cumulative += e.debit - e.credit;
  }
  const openingBalance = cumulative;
  const rows: LedgerRow[] = [];
  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  for (const e of inRange) {
    if (!e.informational) {
      running += e.debit - e.credit;
      totalDebit += e.debit;
      totalCredit += e.credit;
    }
    rows.push({ ...e, balance: running });
  }
  let outstanding = 0;
  for (const e of sorted) {
    if (!e.informational) outstanding += e.debit - e.credit;
  }
  return {
    rows,
    openingBalance,
    closingBalance: running,
    totalDebit,
    totalCredit,
    outstanding,
  };
}

const LEDGER_DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
];

// Real Ledger screen — Customer/Vendor tabs, date-range/status/doc-type
// filters, opening/running/closing balance, all-time outstanding —
// matches pages/Ledger.tsx (see PARITY_TRACKER.md #19). Print/CSV/
// Excel/PDF export are simulated (toast-confirmed), same disclosed
// simplification as every document-producing module in this prototype.
export function LedgerScreen() {
  const { data } = useUxLabStore();
  const toast = useToast();
  const [accountType, setAccountType] = useState<"customer" | "vendor">(
    "customer",
  );
  const [customerId, setCustomerId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState<string[]>([]);

  const range = resolveDateRange(datePreset);
  const hasAccount = accountType === "customer" ? !!customerId : !!vendorId;
  const accountLabel =
    accountType === "customer"
      ? data.customers.find((c) => c.id === customerId)?.name
      : data.vendors.find((v) => v.id === vendorId)?.name;

  const rawEntries =
    accountType === "customer"
      ? customerId
        ? buildCustomerLedgerEntries(customerId, data)
        : []
      : vendorId
        ? buildVendorLedgerEntries(vendorId, data)
        : [];
  const computation = computeLedger(rawEntries, range);
  const availableDocTypes = Array.from(
    new Set(computation.rows.map((r) => r.docType)),
  );
  const availableStatuses = Array.from(
    new Set(
      computation.rows.map((r) => r.status).filter((s): s is string => !!s),
    ),
  );
  const displayRows = computation.rows.filter((r) => {
    if (docTypeFilter.length > 0 && !docTypeFilter.includes(r.docType))
      return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">
            Ledger{accountLabel ? ` — ${accountLabel}` : ""}
          </h2>
          <p className="text-xs text-gray-500">
            Chronological financial history with running balance — derived from
            existing Invoices, Payments, Payables and Vendor Payments.
          </p>
        </div>
        {hasAccount && (
          <div className="flex gap-2">
            {["CSV", "Excel", "PDF", "Print"].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => toast(`${label} export (simulated)`)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1 border-b">
        {(["customer", "vendor"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setAccountType(t);
              setDocTypeFilter([]);
              setStatusFilter("");
            }}
            className={`text-xs font-semibold px-3 py-2 border-b-2 ${accountType === t ? "border-gray-900" : "border-transparent text-gray-400"}`}
          >
            {t === "customer" ? "Customer Ledger" : "Vendor Ledger"}
          </button>
        ))}
      </div>
      <div className="rounded-lg border bg-white p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ldg-account"
            >
              {accountType === "customer" ? "Customer" : "Vendor"}
            </label>
            {accountType === "customer" ? (
              <select
                id="ldg-account"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select customer</option>
                {data.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="ldg-account"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">Select vendor</option>
                {data.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ldg-date"
            >
              Date Range
            </label>
            <select
              id="ldg-date"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
            >
              {LEDGER_DATE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ldg-status"
            >
              Status
            </label>
            <select
              id="ldg-status"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {availableStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        {availableDocTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {availableDocTypes.map((dt) => {
              const active = docTypeFilter.includes(dt);
              return (
                <button
                  key={dt}
                  type="button"
                  onClick={() =>
                    setDocTypeFilter((cur) =>
                      cur.includes(dt)
                        ? cur.filter((x) => x !== dt)
                        : [...cur, dt],
                    )
                  }
                  className={`text-[11px] px-2.5 py-1 rounded-full border ${active ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 text-gray-500 border-gray-200"}`}
                >
                  {dt}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {!hasAccount ? (
        <div className="rounded-lg border py-16 text-center text-sm text-gray-400">
          Select a {accountType === "customer" ? "customer" : "vendor"} above to
          view their ledger.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              ["Opening Balance", computation.openingBalance, ""],
              [
                accountType === "customer" ? "Total Debit" : "Total Payables",
                computation.totalDebit,
                "text-red-600",
              ],
              [
                accountType === "customer" ? "Total Credit" : "Total Payments",
                computation.totalCredit,
                "text-emerald-600",
              ],
              ["Closing Balance", computation.closingBalance, ""],
              [
                "Outstanding",
                computation.outstanding,
                computation.outstanding > 0 ? "text-red-600" : "text-gray-400",
              ],
            ].map(([label, value, cls]) => (
              <div
                key={label as string}
                className="rounded-lg border bg-white p-2.5"
              >
                <p className="text-[10px] text-gray-500 uppercase">{label}</p>
                <p className={`text-sm font-bold mt-1 ${cls}`}>
                  {fmtRs2(value as number)}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left p-2.5">Date</th>
                  <th className="text-left p-2.5">Type</th>
                  <th className="text-left p-2.5">Doc No.</th>
                  <th className="text-left p-2.5">Description</th>
                  <th className="text-left p-2.5">Status</th>
                  <th className="text-right p-2.5">Debit</th>
                  <th className="text-right p-2.5">Credit</th>
                  <th className="text-right p-2.5">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-50 border-b">
                  <td colSpan={7} className="p-2.5 text-gray-500 font-medium">
                    Opening Balance
                  </td>
                  <td className="p-2.5 text-right font-bold">
                    {fmtRs2(computation.openingBalance)}
                  </td>
                </tr>
                {displayRows.map((r) => (
                  <tr
                    key={r.key}
                    className={`border-b last:border-0 ${r.informational ? "opacity-60" : ""}`}
                  >
                    <td className="p-2.5">{r.date}</td>
                    <td className="p-2.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-gray-50">
                        {r.docType}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono">{r.docNo}</td>
                    <td
                      className="p-2.5 max-w-[220px] truncate"
                      title={r.description}
                    >
                      {r.description}
                    </td>
                    <td className="p-2.5">{r.status || ""}</td>
                    <td className="p-2.5 text-right">
                      {r.informational
                        ? r.refAmount
                          ? `(${fmtRs2(r.refAmount)})`
                          : "—"
                        : r.debit
                          ? fmtRs2(r.debit)
                          : "—"}
                    </td>
                    <td className="p-2.5 text-right">
                      {r.informational
                        ? "—"
                        : r.credit
                          ? fmtRs2(r.credit)
                          : "—"}
                    </td>
                    <td className="p-2.5 text-right font-semibold">
                      {r.informational ? "—" : fmtRs2(r.balance)}
                    </td>
                  </tr>
                ))}
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-400">
                      No transactions in this period.
                    </td>
                  </tr>
                )}
                <tr className="bg-gray-50">
                  <td colSpan={7} className="p-2.5 font-bold">
                    Closing Balance
                  </td>
                  <td className="p-2.5 text-right font-bold">
                    {fmtRs2(computation.closingBalance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const STAGE_STATUS_LABEL: Record<import("../data").ProjectStageStatus, string> =
  {
    NotStarted: "Not Started",
    Sent: "Sent",
    InProgress: "In Progress",
    Completed: "Completed",
    Received: "Received",
  };
const STAGE_STATUSES: import("../data").ProjectStageStatus[] = [
  "NotStarted",
  "Sent",
  "InProgress",
  "Completed",
  "Received",
];

// Real Send/Receive Material dialog — matches pages/Production.tsx (see
// PARITY_TRACKER.md #20).
function StageTransactionDialog({
  mode,
  onCancel,
  onSubmit,
}: {
  mode: "send" | "receive";
  onCancel: () => void;
  onSubmit: (
    quantity: number,
    dateTime: string,
    vendorId?: string,
    vendorName?: string,
  ) => void;
}) {
  const { data } = useUxLabStore();
  const [quantity, setQuantity] = useState("");
  const [dateTime, setDateTime] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [vendorId, setVendorId] = useState("inhouse");
  const [error, setError] = useState("");

  const submit = () => {
    const q = Number(quantity);
    if (!q || q <= 0) {
      setError("Enter a valid quantity");
      return;
    }
    const vendor = data.vendors.find((v) => v.id === vendorId);
    onSubmit(
      q,
      dateTime,
      mode === "send" ? vendorId : undefined,
      mode === "send"
        ? vendorId === "inhouse"
          ? "In-house"
          : vendor?.name
        : undefined,
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-xs p-5">
        <h3 className="text-sm font-bold mb-3">
          {mode === "send" ? "Send Material" : "Receive Material"}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="stx-qty"
            >
              Quantity
            </label>
            <input
              id="stx-qty"
              type="number"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setError("");
              }}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="stx-date"
            >
              Date/Time
            </label>
            <input
              id="stx-date"
              type="datetime-local"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
            />
          </div>
          {mode === "send" && (
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="stx-vendor"
              >
                Sent To
              </label>
              <select
                id="stx-vendor"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="inhouse">🏭 In-house</option>
                {data.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
          >
            {mode === "send" ? "Send" : "Receive"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Production screen: per-project stage cards with sequential-lock
// enforcement (a stage stays locked until the previous one is
// Completed — matches production's real card-row UI exactly), Send/
// Receive Material with a running transaction log, notes — matches
// pages/Production.tsx (see PARITY_TRACKER.md #20). Disclosed gaps: the
// QMS inspection gate check/override on completing a stage and the
// material-availability check/admin-override (both real, both depend
// on modules not yet built in this prototype — QMS and BOM/Inventory
// integration respectively) are not reproduced; nor is the OK/Rejected/
// Rework quantity breakdown and Send-to-Rework flow, a deep secondary
// feature.
export function ProductionScreen() {
  const { data, updateProjectStagesFull, addStageTransactionFull } =
    useUxLabStore();
  const toast = useToast();
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    data.projectProductions[0]?.projectId ?? null,
  );
  const [txDialog, setTxDialog] = useState<{
    projectId: string;
    stageIdx: number;
    mode: "send" | "receive";
  } | null>(null);

  const projectName = (id: string) =>
    data.projects.find((p) => p.id === id)?.name ?? id;

  const setStageStatus = (
    projectId: string,
    stageIdx: number,
    newStatus: import("../data").ProjectStageStatus,
  ) => {
    const prod = data.projectProductions.find(
      (pp) => pp.projectId === projectId,
    );
    if (!prod) return;
    const updated = prod.stages.map((s, i) =>
      i === stageIdx ? { ...s, status: newStatus } : s,
    );
    updateProjectStagesFull(projectId, updated);
    toast(
      newStatus === "Completed" ? "Stage marked complete" : "Status updated",
    );
  };

  const setStageNotes = (
    projectId: string,
    stageIdx: number,
    notes: string,
  ) => {
    const prod = data.projectProductions.find(
      (pp) => pp.projectId === projectId,
    );
    if (!prod) return;
    const updated = prod.stages.map((s, i) =>
      i === stageIdx ? { ...s, notes } : s,
    );
    updateProjectStagesFull(projectId, updated);
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold">Production</h2>
        <p className="text-xs text-gray-500">
          {data.projectProductions.length} project
          {data.projectProductions.length !== 1 ? "s" : ""} in production
        </p>
      </div>
      <div className="space-y-2">
        {data.projectProductions.map((prod) => {
          const isExpanded = expandedProjectId === prod.projectId;
          const completedCount = prod.stages.filter(
            (s) => s.status === "Completed" || s.status === "Received",
          ).length;
          return (
            <div key={prod.projectId} className="rounded-xl border bg-white">
              <button
                type="button"
                onClick={() =>
                  setExpandedProjectId(isExpanded ? null : prod.projectId)
                }
                className="w-full flex items-center justify-between p-3 text-left"
              >
                <span className="text-sm font-semibold">
                  {projectName(prod.projectId)}
                </span>
                <span className="text-xs text-gray-500">
                  {completedCount}/{prod.stages.length} stages complete
                </span>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 flex gap-3 overflow-x-auto">
                  {prod.stages.map((stage, idx) => {
                    const prevStage = idx > 0 ? prod.stages[idx - 1] : null;
                    const isLocked =
                      prevStage !== null && prevStage.status !== "Completed";
                    const totalSent = (stage.transactions || [])
                      .filter((t) => t.type === "send")
                      .reduce((a, t) => a + t.quantity, 0);
                    const totalReceived = (stage.transactions || [])
                      .filter((t) => t.type === "receive")
                      .reduce((a, t) => a + t.quantity, 0);
                    return (
                      <div
                        key={`${stage.stageName}-${idx}`}
                        className={`min-w-[240px] shrink-0 rounded-xl border p-3 ${isLocked ? "opacity-50" : ""} ${stage.status === "Completed" || stage.status === "Received" ? "bg-emerald-50 border-emerald-200" : stage.status === "InProgress" || stage.status === "Sent" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-100"}`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold">
                            {idx + 1}. {stage.stageName}
                          </span>
                          {isLocked && (
                            <span className="text-[10px] text-gray-400">
                              locked
                            </span>
                          )}
                        </div>
                        <select
                          className="w-full h-7 text-[11px] rounded-lg border px-1.5 mb-1.5"
                          value={stage.status}
                          disabled={isLocked}
                          onChange={(e) =>
                            setStageStatus(
                              prod.projectId,
                              idx,
                              e.target.value as ProjectStageStatus,
                            )
                          }
                        >
                          {STAGE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STAGE_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        {stage.requiresMaterialTracking && (
                          <p className="text-[10px] text-gray-500 mb-1">
                            Sent {totalSent} · Received {totalReceived}
                            {stage.sentToVendorName
                              ? ` · ${stage.sentToVendorName}`
                              : ""}
                          </p>
                        )}
                        <div className="flex gap-1.5 mb-1.5">
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() =>
                              setTxDialog({
                                projectId: prod.projectId,
                                stageIdx: idx,
                                mode: "send",
                              })
                            }
                            className="flex-1 text-[10px] font-semibold px-2 py-1 rounded border bg-white disabled:opacity-40"
                          >
                            Send
                          </button>
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() =>
                              setTxDialog({
                                projectId: prod.projectId,
                                stageIdx: idx,
                                mode: "receive",
                              })
                            }
                            className="flex-1 text-[10px] font-semibold px-2 py-1 rounded border bg-white disabled:opacity-40"
                          >
                            Receive
                          </button>
                        </div>
                        <textarea
                          className="w-full text-[11px] rounded-lg border px-2 py-1"
                          rows={2}
                          placeholder="Notes"
                          disabled={isLocked}
                          defaultValue={stage.notes}
                          onBlur={(e) =>
                            setStageNotes(prod.projectId, idx, e.target.value)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {data.projectProductions.length === 0 && (
          <div className="rounded-xl border py-12 text-center text-sm text-gray-400">
            No projects in production yet.
          </div>
        )}
      </div>
      {txDialog && (
        <StageTransactionDialog
          mode={txDialog.mode}
          onCancel={() => setTxDialog(null)}
          onSubmit={(quantity, dateTime, vendorId, vendorNameArg) => {
            addStageTransactionFull(txDialog.projectId, txDialog.stageIdx, {
              id: `tx-${Date.now()}`,
              type: txDialog.mode,
              quantity,
              dateTime,
              sentToVendorId: vendorId,
              sentToVendorName: vendorNameArg,
            });
            toast(
              txDialog.mode === "send"
                ? "Material sent recorded"
                : "Material received recorded",
            );
            setTxDialog(null);
          }}
        />
      )}
    </div>
  );
}

const BOM_REQ_STATUS_LABEL: Record<
  import("../data").BomRequisitionStatus,
  { label: string; tone: "success" | "warning" | "neutral" }
> = {
  Pending: { label: "Pending", tone: "warning" },
  "Ready to Complete": { label: "Ready to Complete", tone: "neutral" },
  Completed: { label: "Completed", tone: "success" },
};

// Real Material Requisitions screen: filter tabs with live counts,
// real Mark as Completed action (only on Ready to Complete rows) —
// matches pages/MaterialRequisitions.tsx (see PARITY_TRACKER.md #21).
// Disclosed simplification: production auto-generates these from a
// real BOM shortage-detection system this lab has never modeled —
// seeded as already-existing requisitions instead of generated live.
export function MaterialRequisitionsScreen() {
  const { data, completeBomRequisition } = useUxLabStore();
  const toast = useToast();
  const [tab, setTab] = useState<
    "All" | import("../data").BomRequisitionStatus
  >("All");

  const projectLabel = (id: string) =>
    data.projects.find((p) => p.id === id)?.no ?? id;

  const counts = {
    All: data.bomRequisitions.length,
    Pending: data.bomRequisitions.filter((r) => r.status === "Pending").length,
    "Ready to Complete": data.bomRequisitions.filter(
      (r) => r.status === "Ready to Complete",
    ).length,
    Completed: data.bomRequisitions.filter((r) => r.status === "Completed")
      .length,
  };
  const tabs: ("All" | import("../data").BomRequisitionStatus)[] = [
    "All",
    "Pending",
    "Ready to Complete",
    "Completed",
  ];
  const filtered =
    tab === "All"
      ? data.bomRequisitions
      : data.bomRequisitions.filter((r) => r.status === tab);

  const markCompleted = (id: string) => {
    completeBomRequisition(id);
    toast("Requisition marked as completed");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold">Material Requisitions</h2>
          <p className="text-xs text-gray-500">
            Auto-generated from BOM shortages
          </p>
        </div>
        <div className="text-xs text-gray-500 bg-gray-50 border rounded-md px-2.5 py-1.5">
          {counts.All} total • {counts.Pending} pending
        </div>
      </div>
      <div className="flex gap-1 bg-gray-50 border rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
          >
            {t}
            <span
              className={`inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full text-[10px] font-semibold ${tab === t ? "bg-gray-900 text-white" : "bg-gray-200"}`}
            >
              {counts[t]}
            </span>
          </button>
        ))}
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">Material</th>
              <th className="text-left p-2.5">Available Qty</th>
              <th className="text-left p-2.5">Required Qty</th>
              <th className="text-left p-2.5">Est. Price</th>
              <th className="text-left p-2.5">Project</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Updated</th>
              <th className="text-left p-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const cfg = BOM_REQ_STATUS_LABEL[r.status];
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-2.5 font-semibold">{r.materialName}</td>
                  <td
                    className={`p-2.5 ${!r.availableQty ? "text-red-500" : ""}`}
                  >
                    {r.availableQty ?? 0}
                  </td>
                  <td className="p-2.5">{r.requiredQty ?? r.shortageQty}</td>
                  <td className="p-2.5 font-mono">
                    ₹{Number(r.estimatedPrice || 0).toFixed(2)}
                  </td>
                  <td className="p-2.5 text-gray-500 font-mono">
                    {projectLabel(r.projectId)}
                  </td>
                  <td className="p-2.5">
                    <StatusBadge status={cfg.label} tone={cfg.tone} />
                  </td>
                  <td className="p-2.5 text-gray-500">
                    {new Date(r.updatedAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="p-2.5">
                    {r.status === "Ready to Complete" && (
                      <button
                        type="button"
                        onClick={() => markCompleted(r.id)}
                        className="text-xs font-semibold px-2 py-1 rounded-lg bg-gray-900 text-white"
                      >
                        Mark as Completed
                      </button>
                    )}
                    {r.status === "Pending" && (
                      <span className="text-[11px] text-gray-400 italic">
                        Waiting for purchase
                      </span>
                    )}
                    {r.status === "Completed" && (
                      <span className="text-emerald-600">✓</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400">
                  No material requisitions yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DRAWING_CATEGORIES: import("../data").DrawingCategory[] = [
  "CNC Program",
  "Die Drawing",
  "Tooling",
  "Machine Setup",
  "Standard Drawing",
  "Template",
  "Other",
];
const DRAWING_OWNER_TYPES: import("../data").DrawingOwnerType[] = [
  "project",
  "machine",
  "library",
];
const DRAWING_LINK_TYPES: import("../data").DrawingLinkedType[] = [
  "project",
  "machine",
  "vendor",
  "customer",
  "die",
];

// Real Drawing Repository Add/Edit dialog — metadata only, matches
// pages/DrawingEditorPage.tsx's Repository half (see PARITY_TRACKER.md
// #27). The Editor half (canvas annotation) is a disclosed gap — see
// the Drawing type comment in data.ts.
function DrawingFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").Drawing | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { data, addDrawingFull, updateDrawingFull } = useUxLabStore();
  const toast = useToast();
  const [fileName, setFileName] = useState(editing?.fileName ?? "");
  const [numPages, setNumPages] = useState(String(editing?.numPages ?? 1));
  const [ownerType, setOwnerType] = useState<
    import("../data").DrawingOwnerType
  >(editing?.ownerType ?? "project");
  const [ownerId, setOwnerId] = useState(editing?.ownerId ?? "");
  const [category, setCategory] = useState<
    import("../data").DrawingCategory | ""
  >(editing?.category ?? "");
  const [status, setStatus] = useState<"Draft" | "Approved">(
    editing?.status ?? "Draft",
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [tags, setTags] = useState(editing?.tags.join(", ") ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!fileName.trim()) {
      setError("File name is required");
      return;
    }
    if (ownerType !== "library" && !ownerId) {
      setError("Select the owning project or machine");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    const fields = {
      fileName: fileName.trim(),
      numPages: Number(numPages) || 1,
      ownerType,
      ownerId: ownerType === "library" ? undefined : ownerId,
      category: category || undefined,
      status,
      notes: notes || undefined,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    if (editing) {
      updateDrawingFull(editing.id, fields);
      toast("Drawing updated");
    } else {
      const d = addDrawingFull(fields);
      toast(`Drawing "${d.fileName}" added`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Drawing" : "Upload Drawing"}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="dwg-name"
            >
              File Name <span className="text-red-600">*</span>
            </label>
            <input
              id="dwg-name"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={fileName}
              onChange={(e) => {
                setFileName(e.target.value);
                setError("");
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="dwg-owner-type"
              >
                Owner Type
              </label>
              <select
                id="dwg-owner-type"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={ownerType}
                onChange={(e) => {
                  setOwnerType(
                    e.target.value as import("../data").DrawingOwnerType,
                  );
                  setOwnerId("");
                  setError("");
                }}
              >
                {DRAWING_OWNER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="dwg-owner-id"
              >
                {ownerType === "project"
                  ? "Project"
                  : ownerType === "machine"
                    ? "Machine"
                    : "N/A"}
              </label>
              {ownerType === "library" ? (
                <input
                  disabled
                  className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5 bg-gray-50 text-gray-400"
                  value="Company-wide asset"
                />
              ) : (
                <select
                  id="dwg-owner-id"
                  className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                  value={ownerId}
                  onChange={(e) => {
                    setOwnerId(e.target.value);
                    setError("");
                  }}
                >
                  <option value="">Select…</option>
                  {(ownerType === "project"
                    ? data.projects
                    : data.machines
                  ).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="dwg-category"
              >
                Category
              </label>
              <select
                id="dwg-category"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={category}
                onChange={(e) =>
                  setCategory(
                    e.target.value as import("../data").DrawingCategory,
                  )
                }
              >
                <option value="">—</option>
                {DRAWING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="dwg-pages"
              >
                Pages
              </label>
              <input
                id="dwg-pages"
                type="number"
                min={1}
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={numPages}
                onChange={(e) => setNumPages(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="dwg-status"
            >
              Status
            </label>
            <select
              id="dwg-status"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "Draft" | "Approved")
              }
            >
              <option value="Draft">Draft</option>
              <option value="Approved">Approved</option>
            </select>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="dwg-tags"
            >
              Tags (comma-separated)
            </label>
            <input
              id="dwg-tags"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="dwg-notes"
            >
              Notes
            </label>
            <textarea
              id="dwg-notes"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <FieldError msg={error || undefined} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Upload Drawing"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Real Drawing Repository screen: real owner classification (project/
// machine/library), real 7-value category taxonomy, real many-to-many
// links panel — matches pages/DrawingEditorPage.tsx's Repository half
// (see PARITY_TRACKER.md #27). Disclosed gap: no "Open Editor" — the
// canvas-based annotation engine (fabric.js + pdf.js, vector/pixel
// modes, dimension tools) is not reproducible in this prototype; View/
// Edit here only ever touch metadata.
export function DrawingRepositoryScreen() {
  const { data, deleteRecord, addDrawingLinkFull, removeDrawingLinkFull } =
    useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; d: import("../data").Drawing } | null
  >(null);
  const [linksFor, setLinksFor] = useState<import("../data").Drawing | null>(
    null,
  );
  const [linkType, setLinkType] =
    useState<import("../data").DrawingLinkedType>("project");
  const [linkId, setLinkId] = useState("");

  const ownerLabel = (d: import("../data").Drawing) => {
    if (d.ownerType === "library") return "Library";
    if (d.ownerType === "machine")
      return data.machines.find((m) => m.id === d.ownerId)?.name ?? "—";
    return data.projects.find((p) => p.id === d.ownerId)?.name ?? "—";
  };

  const linkTargetOptions = (t: import("../data").DrawingLinkedType) => {
    if (t === "project") return data.projects;
    if (t === "machine") return data.machines;
    if (t === "vendor") return data.vendors;
    if (t === "customer") return data.customers;
    return data.dies;
  };
  const linkTargetLabel = (
    t: import("../data").DrawingLinkedType,
    id: string,
  ) =>
    (linkTargetOptions(t) as { id: string; name: string }[]).find(
      (o) => o.id === id,
    )?.name ?? id;

  const doDelete = async (d: import("../data").Drawing) => {
    const ok = await confirm(
      "Delete Drawing",
      `Delete "${d.fileName}"? This cannot be undone.`,
    );
    if (!ok) return;
    deleteRecord("drawings", d.id);
    toast("Drawing deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Drawing Repository</h2>
          <p className="text-xs text-gray-500">
            {data.drawings.length} drawing
            {data.drawings.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + Upload Drawing
        </button>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">File Name</th>
              <th className="text-left p-2.5">Owner</th>
              <th className="text-left p-2.5">Category</th>
              <th className="text-left p-2.5">Version</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Links</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.drawings.map((d) => (
              <tr key={d.id} className="border-b last:border-0">
                <td className="p-2.5 font-semibold">{d.fileName}</td>
                <td className="p-2.5 text-gray-500">
                  {ownerLabel(d)}{" "}
                  <span className="text-[10px] text-gray-400">
                    ({d.ownerType})
                  </span>
                </td>
                <td className="p-2.5 text-gray-500">{d.category || "—"}</td>
                <td className="p-2.5">Rev {d.version}</td>
                <td className="p-2.5">
                  <StatusBadge
                    status={d.status}
                    tone={d.status === "Approved" ? "success" : "neutral"}
                  />
                </td>
                <td className="p-2.5">
                  <button
                    type="button"
                    onClick={() => setLinksFor(d)}
                    className="text-blue-600 font-semibold"
                  >
                    {
                      data.drawingLinks.filter((l) => l.drawingId === d.id)
                        .length
                    }{" "}
                    link
                    {data.drawingLinks.filter((l) => l.drawingId === d.id)
                      .length !== 1
                      ? "s"
                      : ""}
                  </button>
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", d })}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => doDelete(d)}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {data.drawings.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No drawings uploaded yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog && (
        <DrawingFormDialog
          editing={dialog.mode === "edit" ? dialog.d : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
      {linksFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
            <h3 className="text-sm font-bold mb-3">
              Links — {linksFor.fileName}
            </h3>
            <div className="flex items-center gap-2 mb-2">
              <select
                className="h-8 text-xs rounded-lg border px-2"
                value={linkType}
                onChange={(e) => {
                  setLinkType(
                    e.target.value as import("../data").DrawingLinkedType,
                  );
                  setLinkId("");
                }}
              >
                {DRAWING_LINK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                className="flex-1 h-8 text-xs rounded-lg border px-2"
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
              >
                <option value="">Select…</option>
                {(
                  linkTargetOptions(linkType) as { id: string; name: string }[]
                ).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!linkId}
                onClick={() => {
                  addDrawingLinkFull(linksFor.id, linkType, linkId);
                  toast("Link added");
                  setLinkId("");
                }}
                className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
            <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
              {data.drawingLinks
                .filter((l) => l.drawingId === linksFor.id)
                .map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between p-2 text-xs"
                  >
                    <span>
                      {l.linkedType}:{" "}
                      {linkTargetLabel(l.linkedType, l.linkedId)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        removeDrawingLinkFull(l.id);
                        toast("Link removed");
                      }}
                      className="text-red-600 font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              {data.drawingLinks.filter((l) => l.drawingId === linksFor.id)
                .length === 0 && (
                <p className="p-3 text-xs text-gray-400 text-center">
                  No links yet.
                </p>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setLinksFor(null)}
                className="text-xs font-semibold px-3 py-2 rounded-lg border"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Real Export Engine section manifest — matches pages/ExportEngine.tsx
// exactly (17 sections, real grouping, real default selection, real
// permission-gate on 4 finance sections) (see PARITY_TRACKER.md #28).
interface ExportSectionDef {
  id: string;
  label: string;
  description: string;
  group: string;
  applicableTo: ("project" | "customer")[];
  gated?: boolean;
}
const EXPORT_SECTIONS: ExportSectionDef[] = [
  {
    id: "cover_page",
    label: "Cover Page",
    description: "Project/customer summary with company branding",
    group: "Documents",
    applicableTo: ["project", "customer"],
  },
  {
    id: "quotations",
    label: "Quotations",
    description: "All quotations with line items and GST breakdown",
    group: "Sales",
    applicableTo: ["project", "customer"],
  },
  {
    id: "purchase_orders",
    label: "Customer Purchase Orders",
    description: "Recorded customer POs with file attachments",
    group: "Sales",
    applicableTo: ["project", "customer"],
  },
  {
    id: "bom",
    label: "Bill of Materials",
    description: "Required materials vs available inventory",
    group: "Technical",
    applicableTo: ["project"],
  },
  {
    id: "design_files",
    label: "Design Files Index",
    description: "List of uploaded design/CAD files with metadata",
    group: "Technical",
    applicableTo: ["project"],
  },
  {
    id: "material_purchases",
    label: "Material Purchases",
    description: "Raw material purchase records",
    group: "Technical",
    applicableTo: ["project"],
  },
  {
    id: "material_usage",
    label: "Material Usage",
    description: "Materials consumed from inventory",
    group: "Technical",
    applicableTo: ["project"],
  },
  {
    id: "production_history",
    label: "Production History",
    description: "Stage-by-stage production progress log",
    group: "Technical",
    applicableTo: ["project"],
  },
  {
    id: "outsourced_work",
    label: "Outsourced Work",
    description: "Work sent to external vendors",
    group: "Technical",
    applicableTo: ["project"],
  },
  {
    id: "qc_reports",
    label: "Quality Inspection",
    description: "QC inspection results per stage",
    group: "Quality & Dispatch",
    applicableTo: ["project"],
  },
  {
    id: "delivery_challans",
    label: "Delivery Challans",
    description: "Dispatch records with quantities",
    group: "Quality & Dispatch",
    applicableTo: ["project", "customer"],
  },
  {
    id: "invoices",
    label: "Tax Invoices",
    description: "GST-compliant invoices with breakdowns",
    group: "Finance",
    applicableTo: ["project", "customer"],
    gated: true,
  },
  {
    id: "payment_history",
    label: "Payment History",
    description: "Payment records against invoices",
    group: "Finance",
    applicableTo: ["project", "customer"],
    gated: true,
  },
  {
    id: "internal_costing",
    label: "Internal Costing",
    description: "Cost breakdown (Material, Process, Labour, etc.)",
    group: "Finance",
    applicableTo: ["project"],
    gated: true,
  },
  {
    id: "profit_summary",
    label: "Profit & Costing Summary",
    description: "Revenue vs costs — margin analysis",
    group: "Finance",
    applicableTo: ["project"],
    gated: true,
  },
  {
    id: "machine_usage",
    label: "Machine Usage Log",
    description: "Machines used for this project with hours",
    group: "Technical",
    applicableTo: ["project"],
  },
  {
    id: "attachments_index",
    label: "Attachments Index",
    description: "Complete listing of all uploaded files",
    group: "Appendix",
    applicableTo: ["project", "customer"],
  },
];
const EXPORT_DEFAULT_SECTIONS = new Set([
  "cover_page",
  "quotations",
  "purchase_orders",
  "production_history",
  "qc_reports",
  "delivery_challans",
  "invoices",
  "payment_history",
  "attachments_index",
]);

// Real Export Engine screen: project/customer context, the real 17-
// section manifest grouped exactly as production groups it, real
// default selection, Select All/Deselect All — matches
// pages/ExportEngine.tsx (see PARITY_TRACKER.md #28). Disclosed gap:
// "Generate" is simulated (toast-confirmed) — production's real per-
// section rendering pulls live data from ~15 different modules
// (several of which, like BOM/Design Files/Internal Costing/Profit
// Summary/Machine Usage Log/Outsourced Work, don't exist as entities
// in this lab at all) into a real printable multi-section report, same
// disclosed simplification as every document-producing module in this
// prototype, just at the scale of the whole screen instead of one
// button.
export function ExportEngineScreen() {
  const { data } = useUxLabStore();
  const toast = useToast();
  const [ctxType, setCtxType] = useState<"project" | "customer">("project");
  const [ctxId, setCtxId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(EXPORT_DEFAULT_SECTIONS),
  );

  const available = EXPORT_SECTIONS.filter((s) =>
    s.applicableTo.includes(ctxType),
  );
  const grouped = available.reduce<Record<string, ExportSectionDef[]>>(
    (acc, s) => {
      if (!acc[s.group]) acc[s.group] = [];
      acc[s.group].push(s);
      return acc;
    },
    {},
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ctxName =
    ctxType === "project"
      ? data.projects.find((p) => p.id === ctxId)?.name
      : data.customers.find((c) => c.id === ctxId)?.name;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold">Export Engine</h2>
        <p className="text-xs text-gray-500">
          Build a custom multi-section export for a project or customer.
        </p>
      </div>
      <div className="rounded-lg border bg-white p-3 flex items-center gap-2 flex-wrap">
        <select
          className="h-8 text-xs rounded-lg border px-2"
          value={ctxType}
          onChange={(e) => {
            setCtxType(e.target.value as "project" | "customer");
            setCtxId("");
          }}
        >
          <option value="project">Project</option>
          <option value="customer">Customer</option>
        </select>
        <select
          className="h-8 text-xs rounded-lg border px-2 min-w-[220px]"
          value={ctxId}
          onChange={(e) => setCtxId(e.target.value)}
        >
          <option value="">Select {ctxType}…</option>
          {(ctxType === "project" ? data.projects : data.customers).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      {ctxId && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {selected.size} of {available.length} sections selected for{" "}
              <span className="font-semibold text-gray-700">{ctxName}</span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(available.map((s) => s.id)))}
                className="text-xs font-semibold text-blue-600"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs font-semibold text-blue-600"
              >
                Deselect All
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {Object.entries(grouped).map(([group, sections]) => (
              <div key={group} className="rounded-lg border bg-white p-3">
                <h3 className="text-[11px] font-bold uppercase text-gray-400 mb-1.5">
                  {group}
                </h3>
                <div className="space-y-1">
                  {sections.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-start gap-2 text-xs py-1 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <span>
                        <span className="font-medium">{s.label}</span>
                        {s.gated && (
                          <span className="ml-1.5 text-[10px] text-gray-400">
                            (permission-gated)
                          </span>
                        )}
                        <span className="block text-gray-400">
                          {s.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() =>
              toast(
                `Export generated for ${ctxName} — ${selected.size} section${selected.size !== 1 ? "s" : ""} (simulated)`,
              )
            }
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-40"
          >
            Generate Export
          </button>
        </>
      )}
    </div>
  );
}

export function CustomerPOsScreen({
  onNavigate,
}: { onNavigate: (view: string, id: string) => void }) {
  const { data, updateQuotationPOStatus, deleteQuotationPO } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const sorted = [...data.quotationPOs].sort((a, b) =>
    b.poDate.localeCompare(a.poDate),
  );

  const doDelete = async (po: (typeof data.quotationPOs)[number]) => {
    const ok = await confirm(
      "Delete purchase order?",
      `Purchase order "${po.poNumber}" will be permanently deleted.`,
    );
    if (!ok) return;
    deleteQuotationPO(po.id);
    toast("Purchase order deleted");
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold">Purchase Orders</h2>
        <p className="text-xs text-gray-500">
          {sorted.length} customer PO{sorted.length !== 1 ? "s" : ""} — recorded
          from quotations
        </p>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">PO Number</th>
              <th className="text-left p-2.5">Customer</th>
              <th className="text-left p-2.5">Quotation Ref</th>
              <th className="text-left p-2.5">PO Date</th>
              <th className="text-left p-2.5">Linked Projects</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Update</th>
              <th className="text-left p-2.5">Delete</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((po) => {
              const q = data.quotations.find((x) => x.id === po.quotationId);
              const cust = data.customers.find((c) => c.id === q?.customerId);
              const linked = data.projects.filter(
                (p) => p.quotationId === po.quotationId,
              );
              return (
                <tr key={po.id} className="border-b last:border-0">
                  <td className="p-2.5 font-mono font-semibold">
                    {po.poNumber}
                  </td>
                  <td className="p-2.5">{cust?.name ?? "—"}</td>
                  <td className="p-2.5 font-mono">
                    {q ? (
                      <button
                        type="button"
                        onClick={() => onNavigate("quotations", "")}
                        className="text-blue-600 font-semibold"
                      >
                        {q.no}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2.5 text-gray-500">{po.poDate}</td>
                  <td className="p-2.5">
                    {linked.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {linked.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => onNavigate("project", p.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded border text-blue-600"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-2.5">
                    <StatusBadge
                      status={po.status}
                      tone={
                        po.status === "Completed"
                          ? "success"
                          : po.status === "In Progress"
                            ? "warning"
                            : "neutral"
                      }
                    />
                  </td>
                  <td className="p-2.5">
                    <select
                      className="h-7 text-xs rounded-lg border px-1.5"
                      value={po.status}
                      onChange={(e) =>
                        updateQuotationPOStatus(
                          po.id,
                          e.target.value as typeof po.status,
                        )
                      }
                    >
                      {(["Open", "In Progress", "Completed"] as const).map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td className="p-2.5">
                    <button
                      type="button"
                      onClick={() => doDelete(po)}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400">
                  <p className="font-medium text-gray-500">
                    No Purchase Orders yet
                  </p>
                  <p className="text-[11px] mt-0.5">
                    Record a PO from an Accepted quotation in the Quotations
                    module.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PODetailScreen({ poId }: { poId: string }) {
  const { data, approvePO, receivePO } = useUxLabStore();
  const confirm = useConfirm();
  const toast = useToast();
  const po = data.purchaseOrders.find((p) => p.id === poId);
  if (!po) return <p className="text-sm text-gray-500">PO not found.</p>;
  const vendor = data.vendors.find((v) => v.id === po.vendorId);
  const project = data.projects.find((p) => p.id === po.projectId);

  const doApprove = async () => {
    if (await confirm("Approve PO?", `Approve ${po.no}.`)) {
      approvePO(po.id);
      toast(`${po.no} approved`);
    }
  };
  const doReceive = async () => {
    if (
      await confirm(
        "Mark received?",
        `Confirm ${po.no} materials have arrived.`,
      )
    ) {
      receivePO(po.id);
      toast(`${po.no} confirmed received`);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-5 max-w-md">
      <h2 className="text-base font-bold">{po.no}</h2>
      <p className="text-xs text-gray-500 mt-0.5">{po.item}</p>
      <div className="mt-3 space-y-1.5 text-xs text-gray-600">
        <p>Vendor: {vendor?.name}</p>
        <p>Amount: ₹{po.amount.toLocaleString("en-IN")}</p>
        {project && <p>For project: {project.no}</p>}
        <p>ETA: {po.etaDays} days</p>
      </div>
      <div className="mt-3">
        <StatusBadge
          status={po.status}
          tone={
            po.status === "Confirmed"
              ? "success"
              : po.status === "Delayed"
                ? "danger"
                : "warning"
          }
        />
      </div>
      <div className="flex gap-2 mt-4">
        {po.status === "PendingApproval" && (
          <button
            type="button"
            onClick={doApprove}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-600 text-white"
          >
            Approve
          </button>
        )}
        {po.status === "Approved" && (
          <button
            type="button"
            onClick={doReceive}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
          >
            Mark received
          </button>
        )}
      </div>
    </div>
  );
}

type Row = Record<string, unknown>;
export interface AddConfig {
  entity: EntityKey;
  label: string;
  fields: FieldSchema[];
}
export function SimpleListScreen<T extends object>({
  title,
  rows,
  columns,
  searchField,
  onRowClick,
  addConfig,
  deletable,
}: {
  title: string;
  rows: T[];
  columns: { key: string; label: string }[];
  searchField: (r: T) => string;
  onRowClick?: (r: T) => void;
  addConfig?: AddConfig;
  /** Pass the entity key to enable a real Delete action per row. */
  deletable?: EntityKey;
}) {
  const { addRecord, deleteRecord } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const asRows = rows as unknown as Row[];
  const tbl = useTableControls(
    asRows,
    searchField as (r: Row) => string,
    columns[0]?.key as never,
  );

  const doDelete = async (r: Row) => {
    if (!deletable) return;
    const ok = await confirm(
      "Delete this record?",
      "This removes it from the list — cannot be undone in this session.",
    );
    if (!ok) return;
    deleteRecord(deletable, String(r.id));
    toast("Deleted");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold">{title}</h2>
        <div className="flex items-center gap-2">
          <SearchBox value={tbl.query} onChange={tbl.setQuery} />
          {addConfig && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white whitespace-nowrap"
            >
              + {addConfig.label}
            </button>
          )}
        </div>
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              {columns.map((c) => (
                <th key={c.key} className="text-left p-2.5">
                  <SortHeader
                    label={c.label}
                    col={c.key as never}
                    sortKey={tbl.sortKey as never}
                    sortDesc={tbl.sortDesc}
                    onSort={tbl.toggleSort as never}
                  />
                </th>
              ))}
              {deletable && <th className="p-2.5" />}
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((r) => (
              <tr
                key={columns.map((c) => String(r[c.key])).join("|")}
                className={`border-b last:border-0 ${onRowClick ? "cursor-pointer hover:bg-gray-50" : ""}`}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                onClick={
                  onRowClick ? () => onRowClick(r as unknown as T) : undefined
                }
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(r as unknown as T);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={`p-2.5 ${onRowClick && i === 0 ? "font-semibold text-blue-600" : ""}`}
                  >
                    {String(r[c.key])}
                  </td>
                ))}
                {deletable && (
                  <td className="p-2.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        doDelete(r);
                      }}
                      className="text-xs font-semibold text-red-500"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {tbl.rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (deletable ? 1 : 0)}
                  className="p-6 text-center text-gray-400"
                >
                  No results for "{tbl.query}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {addConfig && addOpen && (
        <RecordFormModal
          title={addConfig.label}
          fields={addConfig.fields}
          onCancel={() => setAddOpen(false)}
          onSubmit={async (values) => {
            const result = addRecord(addConfig.entity, values);
            toast(`${result.label || "Record"} added`);
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Real pages/Settings.tsx's Company Profile card — every field
// (identity, GSTIN/state for GST math, bank details for
// invoices/quotations, logo, and the 4 terms/declaration texts that
// auto-fill new documents) — see PARITY_TRACKER.md #29.
function CompanyProfileCard() {
  const { data, updateAppSettingsFull } = useUxLabStore();
  const toast = useToast();
  const [form, setForm] = useState(data.settings);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const configured = form.companyName.trim() !== "";

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set("companyLogo", reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-xl border bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">Company Profile</h2>
        <StatusBadge
          status={configured ? "Configured" : "Not Configured"}
          tone={configured ? "success" : "neutral"}
        />
      </div>
      <div>
        <label
          htmlFor="s-cname"
          className="text-[11px] font-semibold text-gray-500"
        >
          Company Name
        </label>
        <input
          id="s-cname"
          value={form.companyName}
          onChange={(e) => set("companyName", e.target.value)}
          placeholder="Your Company Pvt. Ltd."
          className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
        />
      </div>
      <div>
        <label
          htmlFor="s-caddr"
          className="text-[11px] font-semibold text-gray-500"
        >
          Company Address
        </label>
        <input
          id="s-caddr"
          value={form.companyAddress}
          onChange={(e) => set("companyAddress", e.target.value)}
          className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="s-gstin"
            className="text-[11px] font-semibold text-gray-500"
          >
            GSTIN
          </label>
          <input
            id="s-gstin"
            value={form.companyGstin}
            onChange={(e) => set("companyGstin", e.target.value)}
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border font-mono"
          />
        </div>
        <div>
          <label
            htmlFor="s-state"
            className="text-[11px] font-semibold text-gray-500"
          >
            State Name
          </label>
          <input
            id="s-state"
            value={form.companyStateName}
            onChange={(e) => set("companyStateName", e.target.value)}
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
          />
        </div>
      </div>
      <div className="max-w-[140px]">
        <label
          htmlFor="s-statecode"
          className="text-[11px] font-semibold text-gray-500"
        >
          State Code
        </label>
        <input
          id="s-statecode"
          value={form.companyStateCode}
          onChange={(e) => set("companyStateCode", e.target.value)}
          className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="s-phone"
            className="text-[11px] font-semibold text-gray-500"
          >
            Phone Number
          </label>
          <input
            id="s-phone"
            value={form.companyPhone}
            onChange={(e) => set("companyPhone", e.target.value)}
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
          />
        </div>
        <div>
          <label
            htmlFor="s-email"
            className="text-[11px] font-semibold text-gray-500"
          >
            Email
          </label>
          <input
            id="s-email"
            type="email"
            value={form.companyEmail}
            onChange={(e) => set("companyEmail", e.target.value)}
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
          />
        </div>
      </div>
      <div>
        <label
          htmlFor="s-web"
          className="text-[11px] font-semibold text-gray-500"
        >
          Website
        </label>
        <input
          id="s-web"
          value={form.companyWebsite}
          onChange={(e) => set("companyWebsite", e.target.value)}
          className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
        />
      </div>
      <div>
        <label
          htmlFor="s-logo"
          className="text-[11px] font-semibold text-gray-500"
        >
          Company Logo (PNG/JPG)
        </label>
        <input
          id="s-logo"
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleLogo}
          className="w-full mt-1 text-xs"
        />
        {form.companyLogo && (
          <img
            src={form.companyLogo}
            alt="Company logo preview"
            className="mt-2 max-h-16 object-contain border rounded p-1"
          />
        )}
      </div>
      <div className="pt-1 border-t">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-2">
          Bank Details
        </p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <label
              htmlFor="s-bank"
              className="text-[11px] font-semibold text-gray-500"
            >
              Bank Name
            </label>
            <input
              id="s-bank"
              value={form.bankName}
              onChange={(e) => set("bankName", e.target.value)}
              className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
            />
          </div>
          <div>
            <label
              htmlFor="s-acname"
              className="text-[11px] font-semibold text-gray-500"
            >
              Account Name
            </label>
            <input
              id="s-acname"
              value={form.accountName}
              onChange={(e) => set("accountName", e.target.value)}
              className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
            />
          </div>
          <div>
            <label
              htmlFor="s-acno"
              className="text-[11px] font-semibold text-gray-500"
            >
              Account Number
            </label>
            <input
              id="s-acno"
              value={form.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border font-mono"
            />
          </div>
          <div>
            <label
              htmlFor="s-ifsc"
              className="text-[11px] font-semibold text-gray-500"
            >
              IFSC Code
            </label>
            <input
              id="s-ifsc"
              value={form.ifscCode}
              onChange={(e) => set("ifscCode", e.target.value)}
              className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border font-mono"
            />
          </div>
        </div>
        <div className="mt-3">
          <label
            htmlFor="s-branch"
            className="text-[11px] font-semibold text-gray-500"
          >
            Bank Branch
          </label>
          <input
            id="s-branch"
            value={form.bankBranch}
            onChange={(e) => set("bankBranch", e.target.value)}
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
          />
        </div>
      </div>
      <div>
        <label
          htmlFor="s-terms"
          className="text-[11px] font-semibold text-gray-500"
        >
          Terms &amp; Conditions (appears on documents)
        </label>
        <textarea
          id="s-terms"
          rows={3}
          value={form.companyTerms}
          onChange={(e) => set("companyTerms", e.target.value)}
          className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
        />
      </div>
      <div>
        <label
          htmlFor="s-decl"
          className="text-[11px] font-semibold text-gray-500"
        >
          Declaration (appears on invoices)
        </label>
        <textarea
          id="s-decl"
          rows={2}
          value={form.companyDeclaration}
          onChange={(e) => set("companyDeclaration", e.target.value)}
          className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
        />
      </div>
      <div>
        <label
          htmlFor="s-qterms"
          className="text-[11px] font-semibold text-gray-500"
        >
          Default Quotation Terms (auto-fills new quotations)
        </label>
        <textarea
          id="s-qterms"
          rows={3}
          value={form.quotationTerms}
          onChange={(e) => set("quotationTerms", e.target.value)}
          className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
        />
      </div>
      <div>
        <label
          htmlFor="s-poterms"
          className="text-[11px] font-semibold text-gray-500"
        >
          Default Company PO Terms (auto-fills new purchase orders)
        </label>
        <textarea
          id="s-poterms"
          rows={3}
          value={form.companyPOTerms}
          onChange={(e) => set("companyPOTerms", e.target.value)}
          className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            updateAppSettingsFull(form);
            toast("Company profile saved");
          }}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          Save Company Profile
        </button>
      </div>
    </div>
  );
}

// Real WhatsApp (Twilio)/Email (Gmail SMTP) reminder-integration cards
// — credential forms only, since sending an actual WhatsApp/SMS/email
// needs a live Twilio/Gmail relay this lab has no server side to call,
// the same disclosed simplification as every other document-producing
// module's Print/Download/Share.
function IntegrationCard({
  title,
  configured,
  infoTone,
  info,
  children,
  onSave,
}: {
  title: string;
  configured: boolean;
  infoTone: "blue" | "amber";
  info: React.ReactNode;
  children: React.ReactNode;
  onSave: () => void;
}) {
  const toneClasses =
    infoTone === "blue"
      ? "bg-blue-50 border-blue-200 text-blue-700"
      : "bg-amber-50 border-amber-200 text-amber-700";
  return (
    <div className="rounded-xl border bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{title}</h2>
        <StatusBadge
          status={configured ? "Configured" : "Not Configured"}
          tone={configured ? "success" : "neutral"}
        />
      </div>
      {children}
      <div className={`text-[11px] rounded-md border p-3 ${toneClasses}`}>
        {info}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSave}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function WhatsAppCard() {
  const { data, updateAppSettingsFull } = useUxLabStore();
  const toast = useToast();
  const [sid, setSid] = useState(data.settings.twilioAccountSid);
  const [token, setToken] = useState(data.settings.twilioAuthToken);
  const [from, setFrom] = useState(data.settings.twilioFromNumber);
  const configured =
    sid.trim() !== "" && token.trim() !== "" && from.trim() !== "";
  return (
    <IntegrationCard
      title="WhatsApp Reminders (via Twilio)"
      configured={configured}
      infoTone="blue"
      info={
        <>
          Credentials are stored locally in the browser. Get your credentials
          from console.twilio.com.
        </>
      }
      onSave={() => {
        updateAppSettingsFull({
          twilioAccountSid: sid.trim(),
          twilioAuthToken: token.trim(),
          twilioFromNumber: from.trim(),
        });
        toast("WhatsApp (Twilio) settings saved");
      }}
    >
      <div className="space-y-2.5">
        <div>
          <label
            htmlFor="s-tsid"
            className="text-[11px] font-semibold text-gray-500"
          >
            Twilio Account SID
          </label>
          <input
            id="s-tsid"
            value={sid}
            onChange={(e) => setSid(e.target.value)}
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border font-mono"
          />
        </div>
        <div>
          <label
            htmlFor="s-ttok"
            className="text-[11px] font-semibold text-gray-500"
          >
            Auth Token
          </label>
          <input
            id="s-ttok"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border font-mono"
          />
        </div>
        <div>
          <label
            htmlFor="s-tfrom"
            className="text-[11px] font-semibold text-gray-500"
          >
            From Number (WhatsApp)
          </label>
          <input
            id="s-tfrom"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="whatsapp:+14155238886"
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border font-mono"
          />
        </div>
      </div>
    </IntegrationCard>
  );
}

function EmailCard() {
  const { data, updateAppSettingsFull } = useUxLabStore();
  const toast = useToast();
  const [email, setEmail] = useState(data.settings.gmailSenderEmail);
  const [pass, setPass] = useState(data.settings.gmailAppPassword);
  const configured = email.trim() !== "" && pass.trim() !== "";
  return (
    <IntegrationCard
      title="Email Reminders (Gmail SMTP)"
      configured={configured}
      infoTone="amber"
      info={
        <>
          Use a Gmail App Password — not your regular Gmail password. You must
          enable 2-Step Verification on your Google account first.
        </>
      }
      onSave={() => {
        updateAppSettingsFull({
          gmailSenderEmail: email.trim(),
          gmailAppPassword: pass.trim(),
        });
        toast("Email (Gmail SMTP) settings saved");
      }}
    >
      <div className="space-y-2.5">
        <div>
          <label
            htmlFor="s-gemail"
            className="text-[11px] font-semibold text-gray-500"
          >
            Sender Email (Gmail)
          </label>
          <input
            id="s-gemail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="yourname@gmail.com"
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
          />
        </div>
        <div>
          <label
            htmlFor="s-gpass"
            className="text-[11px] font-semibold text-gray-500"
          >
            Gmail App Password
          </label>
          <input
            id="s-gpass"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="xxxx xxxx xxxx xxxx"
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border font-mono"
          />
        </div>
      </div>
    </IntegrationCard>
  );
}

// Real pages/Settings.tsx's Backup & Restore — exports every entity in
// this lab's own store (its real shape, not production's 30-collection
// shape) as a downloadable JSON file, and restores from one with the
// same version-tag + key-presence validation and destructive-action
// confirm dialog production uses.
function BackupRestoreCard() {
  const { exportBackup, restoreBackup } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();

  const handleExport = () => {
    const json = exportBackup();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `fabflow-uxlab-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exported successfully");
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const ok = await confirm(
      "Restore Data?",
      "This will replace all current data and cannot be undone. Are you sure you want to restore?",
      true,
    );
    if (!ok) return;
    const result = restoreBackup(text);
    if (!result.ok) {
      toast(result.error);
      return;
    }
    toast("Data restored successfully");
  };

  return (
    <div className="rounded-xl border bg-white p-5 space-y-3">
      <div>
        <h2 className="text-sm font-bold">Backup &amp; Restore</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Export all system data as a JSON file or restore from a previous
          backup.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          Export Backup
        </button>
        <label className="text-xs font-semibold px-3 py-2 rounded-lg border cursor-pointer">
          Restore Data
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFile}
          />
        </label>
      </div>
      <p className="text-[11px] text-red-600">
        ⚠ Restoring will replace all current data permanently.
      </p>
    </div>
  );
}

// Real pages/Settings.tsx's fine-grained permission matrix — module ×
// action checkboxes grouped by category, ported verbatim from
// permissionCatalog.ts. Matches production's own real quirk exactly:
// only the 8 named columns get individual checkboxes; any module action
// outside that set (upload, assign, manage_rates, etc.) is only
// reachable via the row's "All" checkbox.
const MATRIX_COLUMNS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "download",
  "print",
  "share",
];
function PermissionMatrixEditor({
  permissions,
  onChange,
  disabled = false,
}: {
  permissions: import("../data").PermissionMap;
  onChange: (perms: import("../data").PermissionMap) => void;
  disabled?: boolean;
}) {
  const groups = getModulesByCategory();
  const toggle = (key: string) => {
    if (disabled) return;
    onChange({ ...permissions, [key]: !permissions[key] });
  };
  const setRow = (moduleKey: string, actions: string[], value: boolean) => {
    if (disabled) return;
    const updated = { ...permissions };
    for (const a of actions) updated[`${moduleKey}.${a}`] = value;
    onChange(updated);
  };
  return (
    <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
      {Object.entries(groups).map(([category, modules]) => (
        <div key={category}>
          <div className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1">
            {category}
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-[11px]" style={{ minWidth: 420 }}>
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold">
                    Module
                  </th>
                  {MATRIX_COLUMNS.map((a) => (
                    <th
                      key={a}
                      className="text-center px-1 py-1.5 font-semibold capitalize"
                    >
                      {a}
                    </th>
                  ))}
                  <th className="text-center px-1 py-1.5 font-semibold">All</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((mod, idx) => {
                  const allChecked = mod.actions.every(
                    (a) => permissions[`${mod.key}.${a}`],
                  );
                  return (
                    <tr
                      key={mod.key}
                      className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}
                    >
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                        {mod.label}
                      </td>
                      {MATRIX_COLUMNS.map((a) => (
                        <td key={a} className="text-center px-1 py-1.5">
                          {mod.actions.includes(a) ? (
                            <input
                              type="checkbox"
                              checked={!!permissions[`${mod.key}.${a}`]}
                              onChange={() => toggle(`${mod.key}.${a}`)}
                              disabled={disabled}
                            />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      ))}
                      <td className="text-center px-1 py-1.5">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={(e) =>
                            setRow(mod.key, mod.actions, e.target.checked)
                          }
                          disabled={disabled}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// Real Settings -> Users Create/Edit dialog. Create mode previews the
// selected role's real defaults (read-only); Edit mode is the live
// override editor with "Reset to Role Defaults". Disclosed
// simplification: Create only records the account (username + role +
// temp-password flag) — there is no real backend auth to provision, the
// same gap already disclosed on Employee.userId.
function UserFormDialog({
  editUser,
  onCancel,
  onSaved,
}: {
  editUser: import("../data").OrgUser | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const {
    createOrgUserFull,
    updateOrgUserRoleFull,
    updateOrgUserOverridesFull,
  } = useUxLabStore();
  const toast = useToast();
  const [username, setUsername] = useState(editUser?.username ?? "");
  const [role, setRole] = useState<import("../data").UserRole>(
    editUser?.role ?? "sales",
  );
  const [overrides, setOverrides] = useState<import("../data").PermissionMap>(
    editUser?.overrides ?? {},
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const defaults = getDefaultPermissions(role);
  const previewPerms = editUser ? { ...defaults, ...overrides } : defaults;

  const submit = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    if (editUser) {
      if (editUser.role !== role) updateOrgUserRoleFull(editUser.id, role);
      updateOrgUserOverridesFull(editUser.id, overrides);
      setSaving(false);
      toast("User updated");
      onSaved();
      return;
    }
    const result = createOrgUserFull(username, role);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreated(result.user.username);
  };

  if (created) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-emerald-600">User Created</h3>
          <p className="text-xs text-gray-600">
            Share this with the new user. They'll be required to set their own
            password on first sign-in.
          </p>
          <div className="rounded-md border bg-gray-50 p-3 font-mono text-xs">
            Username: {created}
            <br />
            Temporary password: (set by admin out of band)
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                onSaved();
              }}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5 space-y-3">
        <h3 className="text-sm font-bold">
          {editUser ? "Edit User" : "Create User"}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="u-username"
              className="text-[11px] font-semibold text-gray-500"
            >
              Username {!editUser && <span className="text-red-600">*</span>}
            </label>
            <input
              id="u-username"
              value={username}
              disabled={!!editUser}
              onChange={(e) => {
                setUsername(e.target.value);
                setError("");
              }}
              placeholder="johndoe"
              className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          <div>
            <label
              htmlFor="u-role"
              className="text-[11px] font-semibold text-gray-500"
            >
              Role *
            </label>
            <select
              id="u-role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as import("../data").UserRole);
                if (!editUser) setOverrides({});
              }}
              className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border capitalize"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <FieldError msg={error} />
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-bold flex items-center gap-1">
              {editUser ? "Permission Overrides" : "Role Default Permissions"}
            </p>
            {editUser && (
              <button
                type="button"
                onClick={() => setOverrides({})}
                className="text-[10px] font-semibold px-2 py-1 rounded border"
              >
                Reset to Role Defaults
              </button>
            )}
          </div>
          {!editUser && (
            <p className="text-[10px] text-gray-500 mb-1.5">
              Preview only — shows what the selected role grants by default.
              Per-user overrides can be configured after the account is created,
              by editing it from the list.
            </p>
          )}
          <PermissionMatrixEditor
            permissions={editUser ? previewPerms : defaults}
            onChange={(perms) => {
              if (!editUser) return;
              // Store only the deltas from this role's real defaults, so
              // switching roles later doesn't drag stale overrides along.
              const deltas: import("../data").PermissionMap = {};
              for (const [k, v] of Object.entries(perms)) {
                if (defaults[k] !== v) deltas[k] = v;
              }
              setOverrides(deltas);
            }}
            disabled={!editUser}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : editUser ? "Save Changes" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  sales: "bg-emerald-100 text-emerald-700",
  procurement: "bg-orange-100 text-orange-700",
  production: "bg-yellow-100 text-yellow-700",
  quality: "bg-cyan-100 text-cyan-700",
  dispatch: "bg-indigo-100 text-indigo-700",
  accounts: "bg-blue-100 text-blue-700",
  employee: "bg-gray-100 text-gray-700",
};

function UserManagementCard() {
  const { data, setOrgUserActiveFull } = useUxLabStore();
  const toast = useToast();
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; user: import("../data").OrgUser }
    | null
  >(null);

  const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label ?? id;

  const handleToggleActive = (user: import("../data").OrgUser) => {
    setOrgUserActiveFull(user.id, !user.isActive);
    toast(
      `User "${user.username}" ${user.isActive ? "deactivated" : "reactivated"}`,
    );
  };

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="flex items-center justify-between p-5 pb-3">
        <h2 className="text-sm font-bold">User Management</h2>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
        >
          + New User
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-t">
              <th className="text-left p-2.5">Username</th>
              <th className="text-left p-2.5">Role</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-right p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.orgUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-400">
                  No users yet. Create the first user.
                </td>
              </tr>
            )}
            {data.orgUsers.map((user) => (
              <tr key={user.id} className="border-b last:border-0">
                <td className="p-2.5 font-semibold">
                  {user.username}
                  {user.mustChangePassword && (
                    <span className="ml-1.5 text-[10px] text-amber-600 font-normal">
                      (pending first login)
                    </span>
                  )}
                </td>
                <td className="p-2.5">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_BADGE_COLORS[user.role] || "bg-gray-100 text-gray-700"}`}
                  >
                    {roleLabel(user.role)}
                  </span>
                </td>
                <td className="p-2.5">
                  <StatusBadge
                    status={user.isActive ? "Active" : "Deactivated"}
                    tone={user.isActive ? "success" : "neutral"}
                  />
                </td>
                <td className="p-2.5">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", user })}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(user)}
                      className="text-red-600 font-semibold"
                    >
                      {user.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog && (
        <UserFormDialog
          editUser={dialog.mode === "edit" ? dialog.user : null}
          onCancel={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// Real read-only Security Audit Log viewer — most recent events first.
// Disclosed gap: real production also logs every AI Agent action
// (proposed/confirmed/executed/blocked/failed); this lab's AI
// Briefing/Command Palette are a disclosed non-substitute for the real
// Agent module (Module 30), so no agent events are logged here.
function SecurityAuditLogCard() {
  const { data } = useUxLabStore();
  const entries = [...data.securityAuditLog].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  return (
    <div className="rounded-xl border bg-white p-5 space-y-3">
      <div>
        <h2 className="text-sm font-bold">Security Audit Log</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Account and permission-change events. Most recent first.
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-400">No audit events recorded yet.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-2 py-1.5 font-semibold">Time</th>
                <th className="text-left px-2 py-1.5 font-semibold">Event</th>
                <th className="text-left px-2 py-1.5 font-semibold">Actor</th>
                <th className="text-left px-2 py-1.5 font-semibold">Target</th>
                <th className="text-left px-2 py-1.5 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">
                    {new Date(entry.createdAt).toLocaleString("en-IN")}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{entry.eventType}</td>
                  <td className="px-2 py-1.5">{entry.actorUsername}</td>
                  <td className="px-2 py-1.5">{entry.targetUsername ?? "—"}</td>
                  <td className="px-2 py-1.5 font-mono text-gray-500 max-w-xs truncate">
                    {Object.keys(entry.metadata).length > 0
                      ? JSON.stringify(entry.metadata)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Real pages/Settings.tsx — see PARITY_TRACKER.md #29. Disclosed gaps:
// (1) Appearance (theme palette + light/dark mode) isn't reproduced —
// this lab's shared UI foundation has no theming system at all, and
// retrofitting real cross-cutting dark-mode/multi-palette theming
// across all 29 other already-built modules is out of scope for a
// Settings-module pass; a non-functional toggle would be worse than
// disclosing the gap outright. (2) The 4 one-time Supabase migration
// tools (Drawing Repository/Machinery/Production Stages/QMS Inspection)
// are inapplicable by construction — they exist to migrate real
// production's local IndexedDB/localStorage data into Supabase, and
// this lab's mock store has no such local/remote duality to migrate
// between.
export function SettingsScreen() {
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-base font-bold">Settings</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Configure company profile and integration credentials.
        </p>
      </div>
      <CompanyProfileCard />
      <WhatsAppCard />
      <EmailCard />
      <BackupRestoreCard />
      <UserManagementCard />
      <SecurityAuditLogCard />
    </div>
  );
}

export function ReportsScreen() {
  const { data } = useUxLabStore();
  const totalValue = data.projects.reduce((s, p) => s + p.value, 0);
  const totalReceived = data.payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = data.invoices.reduce(
    (s, i) => s + (i.amount - i.paidAmount),
    0,
  );
  const bars = [
    { label: "Quotations", v: data.quotations.length },
    { label: "Projects", v: data.projects.length },
    {
      label: "Open NCRs",
      v: data.qmsIssues.filter((q) => q.status === "Open").length,
    },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-[11px] text-gray-500">Order value</p>
          <p className="text-lg font-bold">
            ₹{totalValue.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-[11px] text-gray-500">Received</p>
          <p className="text-lg font-bold text-emerald-600">
            ₹{totalReceived.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-[11px] text-gray-500">Outstanding</p>
          <p className="text-lg font-bold text-red-600">
            ₹{outstanding.toLocaleString("en-IN")}
          </p>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
          Pipeline (computed live from store state)
        </h3>
        <div className="flex items-end gap-4">
          {bars.map((b) => (
            <div key={b.label} className="flex-1 text-center">
              <div className="text-lg font-bold">{b.v}</div>
              <div className="h-2 rounded-full bg-blue-500 opacity-80 mb-1" />
              <div className="text-[10px] text-gray-500">{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
