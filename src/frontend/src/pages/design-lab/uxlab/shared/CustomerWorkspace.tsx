// UX Redesign Lab — real Customer relationship workspace: Customer →
// its Quotations → the Projects converted from them → their Invoices.
import { StatusBadge } from "../primitives";
import { useUxLabStore } from "../store";

export function CustomerWorkspace({
  customerId,
  onNavigate,
}: { customerId: string; onNavigate: (view: string, id: string) => void }) {
  const { customerContext } = useUxLabStore();
  const { customer, quotations, projects, invoices } =
    customerContext(customerId);
  if (!customer)
    return <p className="text-sm text-gray-500">Customer not found.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">{customer.name}</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {customer.contact} · Customer since {customer.since}
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
          Quotations
        </h3>
        {quotations.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">No quotations yet.</p>
        ) : (
          <div className="space-y-1.5">
            {quotations.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between text-xs py-1.5 border-b last:border-0"
              >
                <span>
                  {q.no} — {q.item}
                </span>
                <StatusBadge
                  status={q.status}
                  tone={q.status === "Accepted" ? "success" : "neutral"}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
          Projects
        </h3>
        {projects.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">No projects yet.</p>
        ) : (
          <div className="space-y-1.5">
            {projects.map((p) => (
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
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
          Invoices
        </h3>
        {invoices.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">No invoices yet.</p>
        ) : (
          <div className="space-y-1.5">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between text-xs py-1.5 border-b last:border-0"
              >
                <span>{inv.no}</span>
                <StatusBadge
                  status={inv.amount === inv.paidAmount ? "Paid" : "Unpaid"}
                  tone={inv.amount === inv.paidAmount ? "success" : "danger"}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
