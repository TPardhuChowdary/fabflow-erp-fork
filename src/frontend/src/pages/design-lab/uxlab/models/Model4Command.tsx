// MODEL 04 — Command / AI-First
// UX idea: a persistent command bar is the primary way to move and act.
// Unlike the earlier Design Lab rounds' command palette (confirmed by
// this session's own audit to just close on click, doing nothing), the
// parser here is REAL: it matches against live store data and either
// navigates or performs a genuine mutation (approve a PO, resolve an
// NCR) — try "approve PO-2026-041" or "what needs my attention".
import { Bot, Send } from "lucide-react";
import { useState } from "react";
import { useConfirm, useToast } from "../primitives";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { useUxLabStore } from "../store";

const MODULE_WORDS: Record<string, ViewKey> = {
  quotation: "quotations",
  quotations: "quotations",
  customer: "customers",
  customers: "customers",
  vendor: "vendors",
  vendors: "vendors",
  machine: "machinery",
  machinery: "machinery",
  tool: "tools",
  tools: "tools",
  dies: "tools",
  employee: "employees",
  employees: "employees",
  inventory: "inventory",
  stock: "inventory",
  drawing: "drawings",
  drawings: "drawings",
  invoice: "invoices",
  invoices: "invoices",
  qms: "qms",
  quality: "qms",
  payment: "payments",
  payments: "payments",
  payable: "payables",
  payables: "payables",
  production: "production",
  challan: "delivery-challans",
  "delivery-challans": "delivery-challans",
  companypo: "company-po",
  ledger: "ledger",
  scrap: "scrap",
  report: "reports",
  reports: "reports",
  setting: "settings",
  settings: "settings",
};

export function Model4Command() {
  const store = useUxLabStore();
  const { data, approvePO, resolveQms, attentionItems } = store;
  const confirm = useConfirm();
  const toast = useToast();
  const [log, setLog] = useState<{ role: "user" | "system"; text: string }[]>([
    {
      role: "system",
      text: 'Try: "what needs my attention", "open PROJ-2026-013", "approve PO-2026-041", or "show invoices".',
    },
  ]);
  const [input, setInput] = useState("");
  const [view, setView] = useState<{ v: ViewKey; id: string } | null>(null);

  const say = (text: string) => setLog((l) => [...l, { role: "system", text }]);

  const run = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setLog((l) => [...l, { role: "user", text: q }]);
    setInput("");
    const lower = q.toLowerCase();

    // real reference lookup: PROJ-, PO-, QT-, INV-
    const refMatch = q.match(/\b(PROJ|PO|QT|INV|NCR)-[\w-]+\b/i);
    if (refMatch) {
      const ref = refMatch[0].toUpperCase();
      const proj = data.projects.find((p) => p.no === ref);
      const po = data.purchaseOrders.find((p) => p.no === ref);
      const qt = data.quotations.find((x) => x.no === ref);
      const inv = data.invoices.find((x) => x.no === ref);
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
        setView({ v: "project", id: proj.id });
        say(`Opened ${proj.no}.`);
        return;
      }
      if (po) {
        setView({ v: "po", id: po.id });
        say(`Opened ${po.no}.`);
        return;
      }
      if (qt) {
        setView({ v: "quotations", id: "" });
        say(`${qt.no} is in Quotations — showing the list.`);
        return;
      }
      if (inv) {
        setView({ v: "invoices", id: "" });
        say(`${inv.no} is in Invoices — showing the list.`);
        return;
      }
      say(`Couldn't find ${ref}.`);
      return;
    }

    if (
      lower.includes("attention") ||
      lower.includes("what needs") ||
      lower.includes("blocked")
    ) {
      if (attentionItems.length === 0) {
        say("Nothing needs attention right now — everything's on track.");
        return;
      }
      say(
        `${attentionItems.length} item${attentionItems.length > 1 ? "s" : ""} need attention: ${attentionItems
          .slice(0, 4)
          .map((a) => a.title)
          .join("; ")}${attentionItems.length > 4 ? "…" : ""}`,
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
    if (showMatch) {
      const word = showMatch[2].trim().replace(/s$/, "");
      const key = MODULE_WORDS[word] ?? MODULE_WORDS[`${word}s`];
      if (key) {
        setView({ v: key, id: "" });
        say(`Showing ${key}.`);
        return;
      }
    }
    for (const [word, key] of Object.entries(MODULE_WORDS)) {
      if (lower === word || lower === `show ${word}`) {
        setView({ v: key, id: "" });
        say(`Showing ${key}.`);
        return;
      }
    }

    say(
      'I didn\'t recognize that command. Try a module name ("show inventory"), a reference ("open PROJ-2026-013"), or "what needs my attention".',
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-xl overflow-hidden border">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-gray-900 text-white">
        <Bot className="w-4 h-4" />{" "}
        <span className="text-sm font-bold">FabFlow Command</span>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {log.map((l, i) => (
          <div
            key={`${l.role}-${i}`}
            className={`text-xs px-3 py-2 rounded-lg max-w-md ${l.role === "user" ? "bg-gray-900 text-white ml-auto" : "bg-white border text-gray-700"}`}
          >
            {l.text}
          </div>
        ))}
        {view && (
          <div className="mt-3 bg-white rounded-xl border p-4">
            <ModuleRouter
              view={view.v}
              id={view.id}
              onNavigate={(v, id) => setView({ v: v as ViewKey, id })}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 p-3 border-t bg-white">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(input)}
          placeholder="Type a command…"
          className="flex-1 text-sm px-3 py-2 rounded-lg border outline-none"
        />
        <button
          type="button"
          onClick={() => run(input)}
          aria-label="Send"
          className="p-2 rounded-lg bg-gray-900 text-white"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
