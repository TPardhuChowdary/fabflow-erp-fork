// UX Implementation Lab — Petty Expenses, with a REAL Settle-Float flow.
//
// Phase 2 designed this flow (decisionlab/UX_CONSOLIDATION.md §4.2) but
// didn't build it — a category selector revealing conditional fields,
// fanning out to real store actions rather than a disconnected
// settlement record. This screen builds it for real this pass, using
// production's real 5 settle-categories (see pages/PettyExpenses.tsx)
// and this lab's own already-correct float-derivation engine
// (store.tsx's recomputeFloats, built in Module 16) — no new derivation
// logic, just real expenses linked via floatId, which that engine
// already handles correctly.
//
// Disclosed simplification: only "Inventory Purchase" fans out to
// another real module (calls the real addInventoryPurchaseFull action,
// Module 9) — production's real Settle dialog also links Machine
// Service/Vehicle Expense/Courier settlements to their own subsystems
// more deeply than this pass reproduces; those three record a real
// PettyExpense with the category-specific detail captured in notes,
// not a full cross-module resource creation. Employee Personal Expense
// has no further fields in production either — reproduced exactly.
import { useState } from "react";
import { StatusBadge, useToast } from "../../primitives";
import { useUxLabStore } from "../../store";

type SettleCategory =
  | "Inventory Purchase"
  | "Machine Service"
  | "Vehicle Expense"
  | "Employee Personal Expense"
  | "Courier / Delivery";

const SETTLE_CATEGORIES: SettleCategory[] = [
  "Inventory Purchase",
  "Machine Service",
  "Vehicle Expense",
  "Employee Personal Expense",
  "Courier / Delivery",
];

const VEHICLE_TYPES = [
  "Company Vehicle",
  "Rented Vehicle",
  "Personal Vehicle (reimbursed)",
];
const COURIER_PROVIDERS = ["DTDC", "Blue Dart", "Delhivery", "Local Courier"];

function SettleFloatDialog({
  floatId,
  onClose,
}: { floatId: string; onClose: () => void }) {
  const { data, addPettyExpenseFull, addInventoryPurchaseFull } =
    useUxLabStore();
  const toast = useToast();
  const float = data.expenseFloats.find((f) => f.id === floatId);
  const [category, setCategory] =
    useState<SettleCategory>("Inventory Purchase");
  const [amount, setAmount] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [qty, setQty] = useState("1");
  const [machineId, setMachineId] = useState("");
  const [vehicleType, setVehicleType] = useState(VEHICLE_TYPES[0]);
  const [courierProvider, setCourierProvider] = useState(COURIER_PROVIDERS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!float) return null;

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (amt > float.balanceAmount) {
      setError(
        `Cannot exceed remaining float balance of ₹${float.balanceAmount.toLocaleString("en-IN")}`,
      );
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 350));

    let notes = "";
    if (category === "Inventory Purchase") {
      const item = data.inventory.find((i) => i.id === inventoryItemId);
      if (!item || !vendorId) {
        setError("Select a material and vendor");
        setSaving(false);
        return;
      }
      // Real cross-module fan-out — the one settlement category this
      // pass reproduces in full: a real Inventory Purchase record,
      // real stock increment, real unit-cost recompute (Module 9's
      // existing action, unmodified).
      addInventoryPurchaseFull({
        itemId: inventoryItemId,
        vendorId,
        quantityPurchased: Number(qty) || 1,
        purchaseDate: float.issuedDate,
        cost: amt,
        applyGST: false,
      });
      notes = `${item.name} × ${qty} (Inventory Purchase, float settlement)`;
    } else if (category === "Machine Service") {
      const machine = data.machines.find((m) => m.id === machineId);
      if (!machine) {
        setError("Select a machine");
        setSaving(false);
        return;
      }
      notes = `Machine Service: ${machine.name}`;
    } else if (category === "Vehicle Expense") {
      notes = `Vehicle Expense: ${vehicleType}`;
    } else if (category === "Courier / Delivery") {
      notes = `Courier / Delivery via ${courierProvider}`;
    }

    addPettyExpenseFull({
      date: float.issuedDate,
      employeeId: float.employeeId,
      amount: amt,
      expenseType: category,
      expenseMode: "Company Expense",
      projectId: float.projectId,
      floatId: float.id,
      notes,
    });
    toast(
      `₹${amt.toLocaleString("en-IN")} settled against ${float.floatNo} — ${category}`,
    );
    setSaving(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="bg-white rounded-xl border shadow-lg w-full max-w-md p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-sm font-bold">Settle Float — {float.floatNo}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Remaining balance ₹{float.balanceAmount.toLocaleString("en-IN")}
          </p>
        </div>

        <div>
          <label
            htmlFor="settle-cat"
            className="text-[11px] font-semibold text-gray-500"
          >
            Category *
          </label>
          <select
            id="settle-cat"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as SettleCategory);
              setError("");
            }}
            className="w-full mt-1 text-sm px-2.5 py-2 rounded-lg border"
          >
            {SETTLE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Progressive disclosure — only the fields the selected
            category needs, matching production's real conditional
            field configuration exactly. */}
        {category === "Inventory Purchase" && (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2">
              <label
                htmlFor="settle-item"
                className="text-[11px] font-semibold text-gray-500"
              >
                Material *
              </label>
              <select
                id="settle-item"
                value={inventoryItemId}
                onChange={(e) => setInventoryItemId(e.target.value)}
                className="w-full mt-1 text-sm px-2.5 py-2 rounded-lg border"
              >
                <option value="">Select material…</option>
                {data.inventory.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="settle-vendor"
                className="text-[11px] font-semibold text-gray-500"
              >
                Vendor *
              </label>
              <select
                id="settle-vendor"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full mt-1 text-sm px-2.5 py-2 rounded-lg border"
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
              <label
                htmlFor="settle-qty"
                className="text-[11px] font-semibold text-gray-500"
              >
                Quantity
              </label>
              <input
                id="settle-qty"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full mt-1 text-sm px-2.5 py-2 rounded-lg border"
              />
            </div>
          </div>
        )}
        {category === "Machine Service" && (
          <div>
            <label
              htmlFor="settle-machine"
              className="text-[11px] font-semibold text-gray-500"
            >
              Machine *
            </label>
            <select
              id="settle-machine"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              className="w-full mt-1 text-sm px-2.5 py-2 rounded-lg border"
            >
              <option value="">Select machine…</option>
              {data.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {category === "Vehicle Expense" && (
          <div>
            <label
              htmlFor="settle-vehicle"
              className="text-[11px] font-semibold text-gray-500"
            >
              Vehicle Type
            </label>
            <select
              id="settle-vehicle"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="w-full mt-1 text-sm px-2.5 py-2 rounded-lg border"
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}
        {category === "Courier / Delivery" && (
          <div>
            <label
              htmlFor="settle-courier"
              className="text-[11px] font-semibold text-gray-500"
            >
              Courier Provider
            </label>
            <select
              id="settle-courier"
              value={courierProvider}
              onChange={(e) => setCourierProvider(e.target.value)}
              className="w-full mt-1 text-sm px-2.5 py-2 rounded-lg border"
            >
              {COURIER_PROVIDERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        {category === "Employee Personal Expense" && (
          <p className="text-xs text-gray-500">
            No additional fields for this category.
          </p>
        )}

        <div>
          <label
            htmlFor="settle-amt"
            className="text-[11px] font-semibold text-gray-500"
          >
            Amount (₹) *
          </label>
          <input
            id="settle-amt"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError("");
            }}
            className="w-full mt-1 text-sm px-2.5 py-2 rounded-lg border"
          />
          {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
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
            {saving ? "Settling..." : "Finish Settlement"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PettyExpensesScreen() {
  const { data } = useUxLabStore();
  const [settleFloatId, setSettleFloatId] = useState<string | null>(null);

  const employeeName = (id: string) =>
    data.employees.find((e) => e.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold">Petty Expenses — Expense Floats</h2>
        <p className="text-xs text-gray-500">
          {data.expenseFloats.length} float
          {data.expenseFloats.length !== 1 ? "s" : ""} — Settle Float now fans
          out to real category-specific records, not just a plain returned
          amount.
        </p>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">Float No.</th>
              <th className="text-left p-2.5">Employee</th>
              <th className="text-left p-2.5">Issued</th>
              <th className="text-left p-2.5">Spent</th>
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
                <td className="p-2.5 text-gray-500">
                  ₹{f.issuedAmount.toLocaleString("en-IN")}
                </td>
                <td className="p-2.5 text-gray-500">
                  ₹{f.spentAmount.toLocaleString("en-IN")}
                </td>
                <td className="p-2.5 font-semibold">
                  ₹{f.balanceAmount.toLocaleString("en-IN")}
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
                      onClick={() => setSettleFloatId(f.id)}
                      className="text-blue-600 font-semibold"
                    >
                      Settle Float
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
          Recent expense records
        </h3>
        <div className="space-y-1.5">
          {[...data.pettyExpenses]
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
            .slice(0, 6)
            .map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between text-xs py-1.5 border-b last:border-0"
              >
                <div>
                  <span className="font-semibold">{e.expenseType}</span>
                  <span className="text-gray-500 ml-2">
                    {employeeName(e.employeeId)}
                  </span>
                  {e.notes && (
                    <span className="text-gray-400 ml-2">— {e.notes}</span>
                  )}
                </div>
                <span className="font-mono">
                  ₹{e.amount.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
        </div>
      </div>

      {settleFloatId && (
        <SettleFloatDialog
          floatId={settleFloatId}
          onClose={() => setSettleFloatId(null)}
        />
      )}
    </div>
  );
}
