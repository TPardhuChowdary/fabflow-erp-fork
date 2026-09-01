// FINAL UNIFIED UX PROTOTYPE — the recommended direction, not an 11th
// alternative. Foundation: Model 05 (grouped sidebar + real tables +
// workspace drill-in — the shape closest to what FabFlow's own
// production shell already does). Six layers merged in on top, each
// sourced from the model that earned it in the audit:
//   - Role layer (Model 08): sidebar groups + dashboard tailored to the
//     signed-in role, grounded in the real ROLE_DEFAULTS permission
//     catalog (see shared/roleAccess.ts) — ordering/emphasis + hiding
//     groups with zero real access, never inventing access.
//   - Attention layer (Model 02): a live, reactive alerts section on
//     the dashboard, matching the real Dashboard.tsx's own alert logic
//     — a prominent SECTION, not the whole home screen.
//   - Relationship layer (Model 03): every detail view is the existing
//     real cross-linked workspace (ProjectWorkspace/VendorWorkspace/
//     CustomerWorkspace/QmsWorkspace, unchanged) plus a bounded (max 6)
//     recents rail for quick context switching — not an unbounded flat
//     list of every record.
//   - Command palette (Model 04): Cmd/Ctrl+K opens an optional overlay
//     with the real parser — a power-user accelerator layered OVER the
//     sidebar, never a replacement for it.
//   - AI Briefing (Model 09): one real computed sentence at the top of
//     the dashboard, not a whole chat-shaped home screen.
//   - Pipeline view (Model 01): a stage-count strip on the dashboard
//     that drills into the real Quotation/Production/Quality/Invoice
//     views — a lens on order status, not the primary navigation.
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  LayoutDashboard,
  Menu,
  Search,
  Send,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ConfirmProvider,
  StatusBadge,
  ToastProvider,
  useConfirm,
  useToast,
} from "./primitives";
import { UxLoginScreen } from "./shared/LoginScreen";
import { ModuleRouter, type ViewKey } from "./shared/ModuleRouter";
import { FUNCTIONAL_GROUPS } from "./shared/functionalGroups";
import {
  ROLES,
  type RoleDef,
  orderedItems,
  visibleGroupIds,
} from "./shared/roleAccess";
import { UxLabStoreProvider, useUxLabStore } from "./store";

const PIPELINE = [
  { key: "quotations" as const, label: "Quotation" },
  { key: "production" as const, label: "Production" },
  { key: "qms" as const, label: "Quality" },
  { key: "invoices" as const, label: "Invoice" },
];

type Target = { v: ViewKey | "dashboard"; id: string };
type Recent = { v: ViewKey; id: string; label: string };

// ── Command palette parser — trimmed, self-contained re-implementation
// of Model 04's real parser (not imported, so Model 04's own file stays
// untouched) — reference lookup, approve/resolve, and module jump.
function useCommandRunner(
  store: ReturnType<typeof useUxLabStore>,
  navigate: (v: ViewKey, id: string, label?: string) => void,
) {
  const { data, approvePO, resolveQms, attentionItems } = store;
  const confirm = useConfirm();
  const toast = useToast();
  const [log, setLog] = useState<{ role: "user" | "system"; text: string }[]>([
    {
      role: "system",
      text: 'Try "what needs attention", "open PROJ-2026-013", "approve PO-2026-041", or "show invoices".',
    },
  ]);

  const say = (text: string) => setLog((l) => [...l, { role: "system", text }]);

  const run = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setLog((l) => [...l, { role: "user", text: q }]);
    const lower = q.toLowerCase();

    const refMatch = q.match(/\b(PROJ|PO|QT|INV)-[\w-]+\b/i);
    if (refMatch) {
      const ref = refMatch[0].toUpperCase();
      const proj = data.projects.find((p) => p.no === ref);
      const po = data.purchaseOrders.find((p) => p.no === ref);
      if (lower.startsWith("approve") && po) {
        if (po.status !== "PendingApproval") {
          say(`${po.no} isn't pending approval (currently ${po.status}).`);
          return;
        }
        const ok = await confirm(
          "Approve purchase order?",
          `Approve ${po.no} — ₹${po.amount.toLocaleString("en-IN")}.`,
        );
        if (ok) {
          approvePO(po.id);
          toast(`${po.no} approved`);
          say(`Done — ${po.no} approved.`);
        }
        return;
      }
      if (proj) {
        navigate("project", proj.id, proj.no);
        say(`Opened ${proj.no}.`);
        return;
      }
      if (po) {
        navigate("po", po.id, po.no);
        say(`Opened ${po.no}.`);
        return;
      }
      say(`Couldn't find ${ref}.`);
      return;
    }

    if (lower.includes("attention") || lower.includes("what needs")) {
      say(
        attentionItems.length === 0
          ? "Nothing needs attention right now."
          : `${attentionItems.length} item(s) need attention: ${attentionItems
              .slice(0, 4)
              .map((a) => a.title)
              .join("; ")}`,
      );
      return;
    }

    if (lower.includes("resolve") && lower.includes("ncr")) {
      const ncrMatch = q.match(/NCR-\d+/i);
      const issue = ncrMatch
        ? data.qmsIssues.find(
            (i) => i.ncrNo.toLowerCase() === ncrMatch[0].toLowerCase(),
          )
        : undefined;
      if (issue) {
        resolveQms(issue.id);
        toast(`${issue.ncrNo} resolved`);
        say(`Resolved ${issue.ncrNo}.`);
        return;
      }
    }

    const showMatch = lower.match(/^(show|open|go to)\s+(.+)/);
    const norm = (s: string) => s.replace(/[\s-]/g, "").replace(/s$/, "");
    const word = norm((showMatch ? showMatch[2] : lower).trim());
    const key = FUNCTIONAL_GROUPS.flatMap((g) => g.items).find(
      (i) => norm(i.key) === word || norm(i.label.toLowerCase()) === word,
    );
    if (key) {
      navigate(key.key, "");
      say(`Showing ${key.label}.`);
      return;
    }

    say(
      'Not recognized. Try a module name, a reference (e.g. "open PROJ-2026-013"), or "what needs attention".',
    );
  };

  return { log, run };
}

function FinalPrototypeShell() {
  const store = useUxLabStore();
  const [role, setRole] = useState<RoleDef | null>(null);
  const [target, setTarget] = useState<Target>({ v: "dashboard", id: "" });
  const [recents, setRecents] = useState<Recent[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [input, setInput] = useState("");

  const navigate = (v: ViewKey, id: string, label?: string) => {
    setTarget({ v, id });
    if (label) {
      setRecents((r) =>
        [
          { v, id, label },
          ...r.filter((x) => !(x.v === v && x.id === id)),
        ].slice(0, 6),
      );
    }
    setDrawerOpen(false);
    setPaletteOpen(false);
  };
  const goDashboard = () => {
    setTarget({ v: "dashboard", id: "" });
    setDrawerOpen(false);
  };

  const { log, run } = useCommandRunner(store, navigate);
  const paletteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (paletteOpen) paletteInputRef.current?.focus();
  }, [paletteOpen]);

  if (!role) {
    return (
      <div className="min-h-[600px] flex items-center justify-center bg-gray-50 rounded-xl p-8">
        <div className="max-w-sm text-center">
          <h2 className="text-base font-bold text-gray-900 mb-1">
            Who's signing in?
          </h2>
          <p className="text-xs text-gray-500 mb-5">
            Your sidebar and dashboard are tailored to your role — same real
            data underneath, matching the real FabFlow permission system.
          </p>
          <div className="space-y-2 max-h-96 overflow-auto">
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

  const visibleGroups = FUNCTIONAL_GROUPS.filter((g) =>
    visibleGroupIds(role, FUNCTIONAL_GROUPS).has(g.id),
  );

  return (
    <div className="flex h-full bg-gray-50 rounded-xl overflow-hidden border relative">
      {/* sidebar */}
      <div
        className={`${drawerOpen ? "block" : "hidden"} md:block w-56 shrink-0 bg-white border-r p-3 overflow-y-auto`}
      >
        <div className="flex items-center gap-2 px-1 mb-3">
          <role.icon className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-bold text-gray-900">{role.label}</span>
        </div>
        <button
          type="button"
          onClick={goDashboard}
          className={`w-full text-left flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg mb-3 font-semibold ${
            target.v === "dashboard"
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
        </button>
        {visibleGroups.map((g) => (
          <div key={g.id} className="mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 px-2">
              {g.label}
            </p>
            {orderedItems(role, g).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.key, "", item.label)}
                className={`w-full text-left px-2 py-1.5 text-xs rounded-lg mb-0.5 ${
                  target.v === item.key
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setRole(null);
            setTarget({ v: "dashboard", id: "" });
          }}
          className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-gray-100 text-gray-400 mt-2"
        >
          Switch role
        </button>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* top bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-white">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Menu"
            className="md:hidden"
          >
            <Menu className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold">FabFlow</span>
          {recents.length > 0 && (
            <div className="flex items-center gap-1.5 ml-3 overflow-x-auto">
              <Clock className="w-3 h-3 text-gray-400 shrink-0" />
              {recents.map((r) => (
                <button
                  key={`${r.v}-${r.id}`}
                  type="button"
                  onClick={() => navigate(r.v, r.id, r.label)}
                  className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap hover:bg-gray-200"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 border rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
          >
            <Search className="w-3.5 h-3.5" /> Search or run a command
            <kbd className="text-[10px] bg-gray-100 rounded px-1 py-0.5 ml-1">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {target.v === "dashboard" ? (
            <DashboardHome role={role} navigate={navigate} />
          ) : (
            <ModuleRouter
              view={target.v as ViewKey}
              id={target.id}
              onNavigate={(v, id) => navigate(v as ViewKey, id)}
            />
          )}
        </div>
      </div>

      {/* command palette overlay — optional, Cmd/Ctrl+K, never primary nav */}
      {paletteOpen && (
        <div className="absolute inset-0 bg-black/30 flex items-start justify-center pt-20 z-50">
          <div className="w-full max-w-lg bg-white rounded-xl border shadow-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-900 text-white">
              <Bot className="w-4 h-4" />
              <span className="text-xs font-bold">Command palette</span>
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                aria-label="Close"
                className="ml-auto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-64 overflow-auto p-3 space-y-1.5">
              {log.map((l, i) => (
                <div
                  key={`${l.role}-${i}`}
                  className={`text-xs px-2.5 py-1.5 rounded-lg max-w-[85%] ${
                    l.role === "user"
                      ? "bg-gray-900 text-white ml-auto"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {l.text}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 p-2.5 border-t">
              <input
                ref={paletteInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    run(input);
                    setInput("");
                  }
                }}
                placeholder="Type a command…"
                className="flex-1 text-sm px-2.5 py-1.5 rounded-lg border outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  run(input);
                  setInput("");
                }}
                aria-label="Run"
                className="p-1.5 rounded-lg bg-gray-900 text-white"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardHome({
  role,
  navigate,
}: {
  role: RoleDef;
  navigate: (v: ViewKey, id: string, label?: string) => void;
}) {
  const { data, attentionItems } = useUxLabStore();

  const totalValue = useMemo(
    () => data.projects.reduce((s, p) => s + p.value, 0),
    [data],
  );
  const received = useMemo(
    () => data.payments.reduce((s, p) => s + p.amount, 0),
    [data],
  );
  const roleAttention = useMemo(
    () =>
      role.id === "admin"
        ? attentionItems
        : attentionItems.filter((a) =>
            [...role.primary, ...role.secondary].some((k) =>
              a.module.toLowerCase().includes(k.replace("-", " ")),
            ),
          ),
    [attentionItems, role],
  );
  const critical = roleAttention.filter((a) => a.severity === "critical");

  const stageCount = (k: string) => {
    if (k === "quotations")
      return data.quotations.filter(
        (q) => q.status !== "Accepted" && q.status !== "Rejected",
      ).length;
    if (k === "production") return data.projects.length;
    if (k === "qms")
      return data.qmsIssues.filter((q) => q.status === "Open").length;
    if (k === "invoices")
      return data.invoices.filter((i) => i.amount > i.paidAmount).length;
    return 0;
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {/* AI Briefing — one real computed sentence, not a chat screen */}
      <div className="rounded-xl border bg-white p-4 flex items-start gap-3">
        <Bot className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm leading-relaxed text-gray-800">
          Good morning, {role.label}. There
          {data.projects.length === 1 ? " is " : " are "}
          <strong>{data.projects.length} active project(s)</strong> worth ₹
          {totalValue.toLocaleString("en-IN")}, and ₹
          {received.toLocaleString("en-IN")} received so far.{" "}
          {critical.length > 0
            ? `${critical.length} item(s) in your area need urgent attention.`
            : "Nothing urgent in your area right now."}
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Projects" value={data.projects.length} />
        <Kpi label="Quotations" value={data.quotations.length} />
        <Kpi
          label="Open NCRs"
          value={data.qmsIssues.filter((q) => q.status === "Open").length}
        />
        <Kpi
          label="Needs attention"
          value={roleAttention.length}
          tone={roleAttention.length > 0 ? "warning" : "success"}
        />
      </div>

      {/* Attention layer — live, reactive, resolves out of the list */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Needs your attention
        </h3>
        {roleAttention.length === 0 ? (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> All clear
            in your area.
          </p>
        ) : (
          <div className="space-y-1.5">
            {roleAttention.slice(0, 6).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  navigate(a.navigateTo.view as ViewKey, a.navigateTo.id)
                }
                className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 border-b last:border-0"
              >
                <AlertTriangle
                  className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${a.severity === "critical" ? "text-red-500" : "text-amber-500"}`}
                />
                <div>
                  <p className="text-xs font-semibold text-gray-900">
                    {a.title}
                  </p>
                  <p className="text-[11px] text-gray-500">{a.detail}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pipeline view — a lens on order status, not primary nav */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
          Order pipeline
        </h3>
        <div className="flex items-center gap-1 overflow-x-auto">
          {PIPELINE.map((p, i) => (
            <div key={p.key} className="flex items-center">
              <button
                type="button"
                onClick={() => navigate(p.key, "")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 whitespace-nowrap"
              >
                {p.label}{" "}
                <span className="opacity-60">({stageCount(p.key)})</span>
              </button>
              {i < PIPELINE.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 mx-1 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent projects, role-relevant */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
          Active projects
        </h3>
        <div className="space-y-1.5">
          {data.projects.map((p) => {
            const cust = data.customers.find((c) => c.id === p.customerId);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate("project", p.id, p.no)}
                className="w-full text-left flex justify-between text-xs py-1.5 border-b last:border-0"
              >
                <span className="font-mono font-semibold">{p.no}</span>
                <span className="text-gray-500">{cust?.name}</span>
                <StatusBadge status="Active" tone="success" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: { label: string; value: number; tone?: "warning" | "success" }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-[10px] font-semibold text-gray-500 uppercase">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${tone === "warning" ? "text-amber-600" : tone === "success" ? "text-emerald-600" : "text-gray-900"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function FinalPrototype() {
  const [loggedIn, setLoggedIn] = useState(false);
  return (
    <div className="space-y-4" data-ocid="uxlab.final">
      <div>
        <h1 className="text-xl font-bold">
          FabFlow — Final Unified UX Prototype
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
          Foundation: Model 05's grouped sidebar + real tables/workspaces.
          Layered in: Role (08), Attention (02), Relationships (03), an optional
          Command Palette (04, ⌘K), AI Briefing (09), and a Pipeline view (01).
          Same real, mutable mock store as the 10 earlier models.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl">
        <div className="min-w-[760px]" style={{ height: "700px" }}>
          <ToastProvider>
            <ConfirmProvider>
              <UxLabStoreProvider>
                {loggedIn ? (
                  <FinalPrototypeShell />
                ) : (
                  <UxLoginScreen
                    modelName="Final Unified Prototype"
                    onSuccess={() => setLoggedIn(true)}
                  />
                )}
              </UxLabStoreProvider>
            </ConfirmProvider>
          </ToastProvider>
        </div>
      </div>
    </div>
  );
}
