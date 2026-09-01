// MODEL 08 — Role-Based Workspace (Role-Driven UX)
// UX idea: FabFlow isn't one job — it's five. A production supervisor,
// a QC inspector, and an accountant need genuinely different curated
// home screens and nav priority, not the same generic ERP shell with
// permission flags. After sign-in, you pick your role and the nav order,
// dashboard content, and even which modules appear first change for
// real — same real data and store underneath every role.
import {
  Boxes,
  ClipboardCheck,
  Factory,
  Menu,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { useUxLabStore } from "../store";

const ROLES = [
  {
    id: "production",
    label: "Production Supervisor",
    icon: Factory,
    priority: [
      "production",
      "machinery",
      "tools",
      "material-requisitions",
    ] as ViewKey[],
  },
  {
    id: "quality",
    label: "QC Inspector",
    icon: ClipboardCheck,
    priority: ["qms", "project", "drawings"] as ViewKey[],
  },
  {
    id: "procurement",
    label: "Procurement Lead",
    icon: ShoppingCart,
    priority: [
      "purchase-orders",
      "vendors",
      "inventory",
      "payables",
    ] as ViewKey[],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    priority: ["invoices", "payments", "payables", "ledger"] as ViewKey[],
  },
  {
    id: "sales",
    label: "Sales",
    icon: Boxes,
    priority: ["quotations", "customers", "project"] as ViewKey[],
  },
];

export function Model8RoleBased() {
  const { attentionItems } = useUxLabStore();
  const [role, setRole] = useState<(typeof ROLES)[number] | null>(null);
  const [view, setView] = useState<{ v: ViewKey | "dashboard"; id: string }>({
    v: "dashboard",
    id: "",
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!role) {
    return (
      <div className="min-h-[600px] flex items-center justify-center bg-gray-50 rounded-xl p-8">
        <div className="max-w-sm text-center">
          <h2 className="text-base font-bold text-gray-900 mb-1">
            Who's working today?
          </h2>
          <p className="text-xs text-gray-500 mb-5">
            Your dashboard, navigation order, and priorities change based on
            your role.
          </p>
          <div className="space-y-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border bg-white hover:border-blue-400 hover:shadow-sm text-left"
              >
                <r.icon className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-sm font-medium text-gray-900">
                  {r.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const roleAttention = attentionItems.filter((a) =>
    role.priority.some((p) =>
      a.module.toLowerCase().includes(p.replace("-", " ")),
    ),
  );
  const otherModules = [
    "quotations",
    "purchase-orders",
    "customers",
    "vendors",
    "production",
    "inventory",
    "machinery",
    "tools",
    "qms",
    "invoices",
    "payments",
    "payables",
    "reports",
    "settings",
  ].filter((m) => !role.priority.includes(m as ViewKey)) as ViewKey[];

  return (
    <div className="flex h-full bg-gray-50 rounded-xl overflow-hidden border">
      <div
        className={`${drawerOpen ? "block" : "hidden"} md:block w-48 shrink-0 bg-white border-r p-3`}
      >
        <div className="flex items-center gap-2 px-2 py-2 mb-2 rounded-lg bg-blue-50">
          <role.icon className="w-4 h-4 text-blue-600" />{" "}
          <span className="text-xs font-bold text-blue-800">{role.label}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setView({ v: "dashboard", id: "" });
          }}
          className={`w-full text-left px-2 py-1.5 text-xs rounded-lg mb-2 font-semibold ${view.v === "dashboard" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
        >
          Dashboard
        </button>
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">
          Your priorities
        </p>
        {role.priority.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setView({ v: k, id: "" });
              setDrawerOpen(false);
            }}
            className={`w-full text-left px-2 py-1.5 text-xs rounded-lg mb-0.5 capitalize ${view.v === k ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}
          >
            {k.replace("-", " ")}
          </button>
        ))}
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 px-1 mt-3">
          Everything else
        </p>
        {otherModules.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setView({ v: k, id: "" });
              setDrawerOpen(false);
            }}
            className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-gray-100 text-gray-500 mb-0.5 capitalize"
          >
            {k.replace("-", " ")}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRole(null)}
          className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-gray-100 text-gray-400 mt-3"
        >
          Switch role
        </button>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-white">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Menu"
            className="md:hidden"
          >
            <Menu className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold capitalize">
            {view.v === "dashboard"
              ? `${role.label}'s Dashboard`
              : String(view.v).replace("-", " ")}
          </span>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {view.v === "dashboard" ? (
            <div className="space-y-4 max-w-xl">
              <p className="text-sm text-gray-600">
                {roleAttention.length > 0
                  ? `${roleAttention.length} item${roleAttention.length > 1 ? "s" : ""} in your area need attention.`
                  : "Nothing in your area needs attention right now."}
              </p>
              {roleAttention.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    setView({
                      v: a.navigateTo.view as ViewKey,
                      id: a.navigateTo.id,
                    })
                  }
                  className="w-full text-left p-3 rounded-lg border bg-white hover:shadow-sm block mb-2"
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {a.title}
                  </p>
                  <p className="text-xs text-gray-500">{a.detail}</p>
                </button>
              ))}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {role.priority.slice(0, 2).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setView({ v: k, id: "" })}
                    className="rounded-xl border bg-white p-4 text-left hover:shadow-sm"
                  >
                    <p className="text-xs font-semibold text-gray-500 uppercase capitalize">
                      {k.replace("-", " ")}
                    </p>
                    <p className="text-lg font-bold text-gray-900">Open →</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ModuleRouter
              view={view.v as ViewKey}
              id={view.id}
              onNavigate={(v, id) => setView({ v: v as ViewKey, id })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
