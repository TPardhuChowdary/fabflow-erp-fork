// UX Implementation Lab — Projects list, built new this pass (component
// I reference implementation for a real list screen, Instrument-skinned
// via the semantic Tailwind classes instrument-skin.css remaps).
import { SearchBox, useTableControls } from "../../primitives";
import { useUxLabStore } from "../../store";

export function ProjectsListScreen({
  onOpen,
}: { onOpen: (projectId: string) => void }) {
  const { data } = useUxLabStore();
  const tbl = useTableControls(
    data.projects,
    (p) =>
      `${p.no} ${p.name} ${data.customers.find((c) => c.id === p.customerId)?.name ?? ""}`,
    "no",
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold">Projects</h2>
          <p className="text-xs text-gray-500">
            {data.projects.length} projects
          </p>
        </div>
        <SearchBox
          value={tbl.query}
          onChange={tbl.setQuery}
          placeholder="Search project or customer…"
        />
      </div>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th className="text-left p-2.5">Project No.</th>
              <th className="text-left p-2.5">Customer</th>
              <th className="text-left p-2.5">Project Name</th>
              <th className="text-left p-2.5">Qty</th>
              <th className="text-left p-2.5">Value</th>
              <th className="text-left p-2.5">Created</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tbl.rows.map((p) => {
              const cust = data.customers.find((c) => c.id === p.customerId);
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-2.5 font-mono font-semibold">{p.no}</td>
                  <td className="p-2.5">{cust?.name ?? "—"}</td>
                  <td className="p-2.5">{p.name}</td>
                  <td className="p-2.5 font-mono">{p.qty}</td>
                  <td className="p-2.5 font-mono">
                    ₹{p.value.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2.5 text-gray-500">{p.createdAt}</td>
                  <td className="p-2.5">
                    <button
                      type="button"
                      onClick={() => onOpen(p.id)}
                      className="text-blue-600 font-semibold"
                    >
                      Open →
                    </button>
                  </td>
                </tr>
              );
            })}
            {tbl.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  No projects found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
