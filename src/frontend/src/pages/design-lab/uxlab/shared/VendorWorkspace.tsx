// UX Redesign Lab — real Vendor relationship workspace: Vendor → its
// Purchase Orders → the Projects those POs feed → its Payables — the
// exact relationship chain the brief's own worked example names — PLUS
// full parity with pages/Vendors.tsx's own detail surface (summary
// cards, real Purchase History merging materialPurchases+
// inventoryPurchases, Edit/Delete) per PARITY_TRACKER.md #2. Reached by
// a row click from VendorsScreen, a deliberate presentation change from
// production's inline slide-over panel — everything the panel shows is
// still here, just as a full workspace page consistent with the rest
// of this shell's list→detail pattern.
import { useState } from "react";
import type { Vendor } from "../data";
import {
  FieldError,
  StatusBadge,
  useConfirm,
  useFormValidation,
  useToast,
} from "../primitives";
import { useUxLabStore } from "../store";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function EditVendorDialog({
  vendor,
  onCancel,
  onSaved,
}: { vendor: Vendor; onCancel: () => void; onSaved: () => void }) {
  const { updateVendor } = useUxLabStore();
  const toast = useToast();
  const [form, setForm] = useState({
    name: vendor.name,
    phone: vendor.phone,
    address: vendor.address,
    gstNumber: vendor.gstNumber,
  });
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      setNameError("Vendor name is required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    updateVendor(vendor.id, form);
    setSaving(false);
    toast("Vendor updated");
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-sm font-bold mb-3">Edit Vendor</h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ev-name"
            >
              Vendor Name <span className="text-red-600">*</span>
            </label>
            <input
              id="ev-name"
              className={`mt-1 w-full h-8 text-sm rounded-lg border px-2.5 ${nameError ? "border-red-400" : ""}`}
              value={form.name}
              onChange={(e) => {
                setForm((p) => ({ ...p, name: e.target.value }));
                if (e.target.value) setNameError(undefined);
              }}
            />
            <FieldError msg={nameError} />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ev-phone"
            >
              Phone
            </label>
            <input
              id="ev-phone"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={form.phone}
              onChange={(e) =>
                setForm((p) => ({ ...p, phone: e.target.value }))
              }
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ev-address"
            >
              Address
            </label>
            <input
              id="ev-address"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={form.address}
              onChange={(e) =>
                setForm((p) => ({ ...p, address: e.target.value }))
              }
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="ev-gst"
            >
              GST Number
            </label>
            <input
              id="ev-gst"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={form.gstNumber}
              onChange={(e) =>
                setForm((p) => ({ ...p, gstNumber: e.target.value }))
              }
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
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function VendorWorkspace({
  vendorId,
  onNavigate,
}: { vendorId: string; onNavigate: (view: string, id: string) => void }) {
  const { vendorContext, createPO, deleteRecord } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [poOpen, setPoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const {
    vendor,
    purchaseOrders,
    relatedProjects,
    materialPurchases,
    inventoryPurchases,
    vPayables,
    totalPayablesAmt,
    pendingBalance,
    totalPurchaseCount,
  } = vendorContext(vendorId);
  const { values, set, errors, validate } = useFormValidation(
    { item: "", amount: "" },
    ["item", "amount"],
  );

  if (!vendor)
    return <p className="text-sm text-gray-500">Vendor not found.</p>;

  const submitPO = () => {
    if (!validate()) return;
    const po = createPO(
      vendorId,
      String(values.item),
      Number(values.amount),
      null,
    );
    toast(`${po.no} created as Draft`);
    setPoOpen(false);
  };

  const startDelete = async () => {
    const ok = await confirm(
      "Delete Vendor",
      "Are you sure? Existing purchase and payable records linked to this vendor will retain the vendor name but lose the link.",
    );
    if (!ok) return;
    deleteRecord("vendors", vendor.id);
    toast("Vendor deleted");
    onNavigate("vendors", "");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{vendor.name}</h1>
          {vendor.phone && (
            <p className="text-xs text-gray-500 mt-0.5">{vendor.phone}</p>
          )}
          {vendor.address && (
            <p className="text-xs text-gray-500">{vendor.address}</p>
          )}
          {vendor.gstNumber && (
            <p className="text-xs font-mono text-gray-500 mt-0.5">
              GST: {vendor.gstNumber}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={startDelete}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border text-red-600"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Summary cards — matches real Vendors.tsx detail panel */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-lg font-bold">{totalPurchaseCount}</p>
          <p className="text-[10px] text-gray-500 uppercase">Purchases</p>
        </div>
        <div className="rounded-lg border bg-white p-2.5 text-center">
          <p className="text-sm font-bold">{fmt(totalPayablesAmt)}</p>
          <p className="text-[10px] text-gray-500 uppercase">Payables</p>
        </div>
        <div className="rounded-lg border bg-amber-50 border-amber-200 p-2.5 text-center">
          <p className="text-sm font-bold text-amber-800">
            {fmt(pendingBalance)}
          </p>
          <p className="text-[10px] text-amber-600 uppercase">Pending</p>
        </div>
      </div>

      {/* Purchase History — real materialPurchases + inventoryPurchases,
          a distinct real concept from formal Purchase Orders below */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
          Purchase history
        </h3>
        {materialPurchases.length === 0 && inventoryPurchases.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">
            No purchases recorded for this vendor.
          </p>
        ) : (
          <div className="space-y-1.5">
            {materialPurchases.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-xs border rounded-lg px-2.5 py-1.5 bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {p.materialType}
                    {p.thickness ? ` (${p.thickness})` : ""}
                  </p>
                  <p className="text-gray-500">{p.purchaseDate}</p>
                </div>
                <p className="font-mono">{p.quantity} units</p>
              </div>
            ))}
            {inventoryPurchases.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-xs border rounded-lg px-2.5 py-1.5 bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{p.materialName}</p>
                  <p className="text-gray-500">Inventory · {p.purchaseDate}</p>
                </div>
                <p className="font-mono">{p.quantityPurchased} units</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-gray-500 uppercase">
            Purchase orders
          </h3>
          <button
            type="button"
            onClick={() => setPoOpen(true)}
            className="text-xs font-semibold text-blue-600"
          >
            + New PO
          </button>
        </div>
        {purchaseOrders.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">
            No purchase orders with this vendor yet.
          </p>
        ) : (
          <div className="space-y-2">
            {purchaseOrders.map((po) => (
              <button
                key={po.id}
                type="button"
                onClick={() => onNavigate("po", po.id)}
                className="w-full text-left flex items-center justify-between p-2.5 rounded-lg border hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-semibold text-blue-600">{po.no}</p>
                  <p className="text-[11px] text-gray-500">
                    {po.item} — ₹{po.amount.toLocaleString("en-IN")}
                  </p>
                </div>
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
              </button>
            ))}
          </div>
        )}
      </div>

      {relatedProjects.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
            Related projects
          </h3>
          <div className="space-y-1.5">
            {relatedProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onNavigate("project", p.id)}
                className="w-full text-left flex justify-between text-xs py-1.5 border-b last:border-0"
              >
                <span className="font-mono font-semibold text-blue-600">
                  {p.no}
                </span>
                <span className="text-gray-500">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Payables — full list with real status logic (Paid/Partial/
          Pending/Overdue), matching pages/Vendors.tsx's own
          getPayableStatus() exactly */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
          Payables
        </h3>
        {vPayables.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">
            No payables for this vendor.
          </p>
        ) : (
          <div className="space-y-1.5">
            {vPayables.map((p) => {
              const status =
                p.paidAmount >= p.amount
                  ? "Paid"
                  : p.dueDate &&
                      new Date(p.dueDate) < new Date() &&
                      p.paidAmount < p.amount
                    ? "Overdue"
                    : p.paidAmount > 0
                      ? "Partial"
                      : "Pending";
              const tone =
                status === "Paid"
                  ? "success"
                  : status === "Overdue"
                    ? "danger"
                    : "warning";
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs border rounded-lg px-2.5 py-1.5 bg-gray-50"
                >
                  <div>
                    <p className="font-medium text-gray-900">{fmt(p.amount)}</p>
                    <p className="text-gray-500">Due: {p.dueDate || "—"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="font-semibold">
                      {fmt(p.amount - p.paidAmount)} outstanding
                    </p>
                    <StatusBadge status={status} tone={tone} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {poOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setPoOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setPoOpen(false)}
          aria-hidden="true"
        >
          <div
            className="w-full max-w-sm bg-white rounded-xl p-5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-bold mb-3">New PO — {vendor.name}</h2>
            <div className="space-y-2.5">
              <div>
                <input
                  value={String(values.item)}
                  onChange={(e) => set("item", e.target.value)}
                  placeholder="Item description"
                  className="w-full text-xs px-2.5 py-2 rounded-lg border"
                />
                <FieldError msg={errors.item} />
              </div>
              <div>
                <input
                  value={String(values.amount)}
                  onChange={(e) => set("amount", e.target.value)}
                  type="number"
                  placeholder="Amount ₹"
                  className="w-full text-xs px-2.5 py-2 rounded-lg border"
                />
                <FieldError msg={errors.amount} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPoOpen(false)}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitPO}
                  className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <EditVendorDialog
          vendor={vendor}
          onCancel={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
