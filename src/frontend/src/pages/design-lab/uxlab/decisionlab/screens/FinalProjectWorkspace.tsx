import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
} from "lucide-react";
// UX Consolidation / Decision Lab — Final Project Workspace.
//
// Demonstrates Blueprint §4.1 (see ../content.ts / ../UX_CONSOLIDATION.md)
// — the flagship hybrid of this whole phase. Extends, not replaces, the
// existing prototype's real ProjectWorkspace.tsx (kept as-is, still the
// "prototype" reference point for the before/after comparison) with:
//   - restored section-anchor jump-links (Planning/Materials/Execution/
//     Closure), mirroring production's own real IA instead of discarding it
//   - a real Production Summary breakdown, computed from the same real
//     ProjectProduction/QMS data every other screen reads — not invented
//   - the 6 real ProjectDetail tabs this prototype never built (Design
//     Files, BOM, Items, Internal Costing, Outsourced, Profit & Costing,
//     Timeline), each clearly labeled TARGET DESIGN where no real data
//     model exists yet, rather than silently faked as if they were real
//   - restored "Repeat Order" / "Generate Report" header actions
import { useState } from "react";
import { StatusBadge, useConfirm, useToast } from "../../primitives";
import { useUxLabStore } from "../../store";

const SECTIONS = [
  { id: "planning", label: "Planning" },
  { id: "materials", label: "Materials" },
  { id: "execution", label: "Execution" },
  { id: "closure", label: "Closure" },
] as const;

const STAGE_STATUSES: import("../../data").ProjectStageStatus[] = [
  "NotStarted",
  "Sent",
  "InProgress",
  "Completed",
  "Received",
];

function TargetDesignBadge() {
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-700"
      title="Blueprint §4.1 — real production tab, no real data model in this prototype yet. Shown to make the target information architecture concrete, not backed by live store data."
    >
      Target design
    </span>
  );
}

function SectionAnchor({
  id,
  label,
}: {
  id: string;
  label: string;
}) {
  return (
    <h3
      id={id}
      className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pt-2 scroll-mt-16"
    >
      {label}
    </h3>
  );
}

export function FinalProjectWorkspace({
  projectId,
  onNavigate,
}: { projectId: string; onNavigate: (view: string, id: string) => void }) {
  const {
    projectContext,
    recordPayment,
    updateProjectStagesFull,
    completeBomRequisition,
    updateQuotationPOStatus,
    createProjectDirect,
    data,
  } = useUxLabStore();
  const confirm = useConfirm();
  const toast = useToast();
  const {
    project,
    customer,
    quotation,
    stages,
    inspections,
    invoice,
    payments,
    customerPOs,
    requisitions,
    deliveryChallans,
    drawings,
  } = projectContext(projectId);
  const [payAmount, setPayAmount] = useState("");

  if (!project)
    return <p className="text-sm text-gray-500">Project not found.</p>;

  const balance = invoice ? invoice.amount - invoice.paidAmount : 0;

  // Real Production Summary breakdown — Blueprint §4.1's specific,
  // named gap. Computed from the same real stage/QMS data every other
  // screen reads, not a second invented source. Rework has no real
  // field anywhere in this prototype's data model (disclosed already in
  // Module 20's own gap list) — shown as 0 with an explicit note rather
  // than silently omitted or faked.
  const producedQty =
    stages.length > 0 ? stages[stages.length - 1].receivedQuantity : 0;
  const projectInspectionIds = new Set(inspections.map((i) => i.id));
  const relevantCharacteristics =
    data.projectQmsInspectionCharacteristics.filter((c) =>
      projectInspectionIds.has(c.projectQmsInspectionId),
    );
  const approvedQty = relevantCharacteristics.filter(
    (c) => c.result === "Pass",
  ).length;
  const rejectedQty = relevantCharacteristics.filter(
    (c) => c.result === "Fail",
  ).length;
  const dispatchedQty = deliveryChallans.reduce(
    (sum, dc) =>
      sum +
      (dc.projectEntries.find((e) => e.projectId === projectId)?.dispatchQty ??
        0),
    0,
  );

  const doAdvanceStage = async (idx: number, name: string, current: string) => {
    const next = STAGE_STATUSES[STAGE_STATUSES.indexOf(current as never) + 1];
    if (!next) return;
    const ok = await confirm(
      "Advance stage?",
      `Move "${name}" to "${next}". This is visible to everyone viewing this project.`,
    );
    if (!ok) return;
    const updated = stages.map((s, i) =>
      i === idx ? { ...s, status: next } : s,
    );
    updateProjectStagesFull(projectId, updated);
    toast(`${name} advanced to ${next}`);
  };

  const doCompleteRequisition = (id: string, materialName: string) => {
    completeBomRequisition(id);
    toast(`${materialName} requisition marked complete`);
  };

  const doAdvancePOStatus = async (
    poId: string,
    poNumber: string,
    status: import("../../data").QuotationPO["status"],
  ) => {
    const next = status === "Open" ? "In Progress" : "Completed";
    const ok = await confirm(
      "Update customer PO status?",
      `Mark ${poNumber} as "${next}".`,
    );
    if (!ok) return;
    updateQuotationPOStatus(poId, next);
    toast(`${poNumber} marked ${next}`);
  };

  const doPay = () => {
    const amt = Number(payAmount);
    if (!invoice || !amt || amt <= 0) {
      toast("Enter a valid payment amount", "error");
      return;
    }
    if (amt > balance) {
      toast(
        `Cannot exceed balance of ₹${balance.toLocaleString("en-IN")}`,
        "error",
      );
      return;
    }
    recordPayment(invoice.id, amt);
    toast(`₹${amt.toLocaleString("en-IN")} recorded against ${invoice.no}`);
    setPayAmount("");
  };

  const doRepeatOrder = async () => {
    const ok = await confirm(
      "Create repeat order?",
      `Create a new order from "${project.name}" for ${customer?.name ?? "this customer"}, same quantity and specs.`,
    );
    if (!ok) return;
    const created = createProjectDirect(
      project.customerId,
      project.name,
      project.qty,
      project.value,
      project.workDescription,
    );
    toast(`Created repeat order ${created.no}`);
    onNavigate("project", created.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <button
          type="button"
          onClick={() => onNavigate("customers", customer?.id ?? "")}
          className="hover:text-gray-900"
        >
          {customer?.name}
        </button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-900 font-semibold">{project.no}</span>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{project.name}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {project.no} · {project.qty} units · ₹
            {project.value.toLocaleString("en-IN")}
          </p>
        </div>
        {/* Restored per Blueprint §4.1 — production's real always-visible
            header actions, absent from the prototype's original hub. */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={doRepeatOrder}
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            + Repeat Order
          </button>
          <button
            type="button"
            onClick={() =>
              toast("Report generation is simulated in this prototype")
            }
            className="text-xs font-semibold px-3 py-2 rounded-lg border"
          >
            Generate Report
          </button>
        </div>
      </div>

      {/* Section-anchor jump-links — restored per Blueprint §4.1.
          Production's real 4-group tab structure, kept as in-page nav
          instead of 4 separate navigations. */}
      <div className="flex gap-1 flex-wrap sticky top-0 bg-gray-50/95 backdrop-blur py-1.5 z-10 -mx-1 px-1">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-white text-gray-600 hover:border-gray-400"
          >
            {s.label}
          </a>
        ))}
      </div>

      <SectionAnchor id="planning" label="Planning" />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-gray-50 border p-2.5 text-center">
          <p className="text-[10px] text-gray-500 uppercase">Total Qty</p>
          <p className="text-base font-bold">{project.qty}</p>
        </div>
        <div className="rounded-lg bg-gray-50 border p-2.5 text-center">
          <p className="text-[10px] text-gray-500 uppercase">Dispatched</p>
          <p className="text-base font-bold">{dispatchedQty}</p>
        </div>
        <div className="rounded-lg bg-gray-50 border p-2.5 text-center">
          <p className="text-[10px] text-gray-500 uppercase">Remaining</p>
          <p
            className={`text-base font-bold ${project.qty - dispatchedQty <= 0 ? "text-red-600" : "text-emerald-600"}`}
          >
            {project.qty - dispatchedQty}
          </p>
        </div>
      </div>

      {/* Production Summary — the specific real gap Blueprint §4.1 named.
          Produced/Approved/Rejected computed from real stage + QMS
          characteristic data; Rework has no real field in this
          prototype's data model at all (disclosed, not invented). */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
          Production Summary
        </h3>
        <div className="grid grid-cols-5 gap-2">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-2 text-center">
            <p className="text-[9px] text-blue-600 uppercase font-semibold">
              Produced
            </p>
            <p className="text-sm font-bold text-blue-700">{producedQty}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-center">
            <p className="text-[9px] text-emerald-600 uppercase font-semibold">
              Approved
            </p>
            <p className="text-sm font-bold text-emerald-700">{approvedQty}</p>
          </div>
          <div className="rounded-lg bg-red-50 border border-red-100 p-2 text-center">
            <p className="text-[9px] text-red-600 uppercase font-semibold">
              Rejected
            </p>
            <p className="text-sm font-bold text-red-700">{rejectedQty}</p>
          </div>
          <div
            className="rounded-lg bg-amber-50 border border-amber-100 p-2 text-center"
            title="Not modeled in this prototype — no rework-tracking field exists anywhere in the data model yet."
          >
            <p className="text-[9px] text-amber-600 uppercase font-semibold">
              Rework*
            </p>
            <p className="text-sm font-bold text-amber-700">0</p>
          </div>
          <div className="rounded-lg bg-gray-50 border p-2 text-center">
            <p className="text-[9px] text-gray-500 uppercase font-semibold">
              Dispatched
            </p>
            <p className="text-sm font-bold text-gray-700">{dispatchedQty}</p>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">
          * Rework isn't tracked by this prototype's data model yet — shown as
          0, not omitted, per the disclosed gap in Module 20.
        </p>
      </div>

      {customerPOs.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
            Customer purchase order
          </h3>
          <div className="space-y-2">
            {customerPOs.map((po) => (
              <div
                key={po.id}
                className="flex items-center justify-between p-2.5 rounded-lg border"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => onNavigate("company-po", "")}
                    className="text-sm font-semibold text-blue-600"
                  >
                    {po.poNumber}
                  </button>
                  <p className="text-[11px] text-gray-500">
                    PO date {po.poDate}
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                  {po.status !== "Completed" && (
                    <button
                      type="button"
                      onClick={() =>
                        doAdvancePOStatus(po.id, po.poNumber, po.status)
                      }
                      className="text-xs font-semibold text-emerald-600"
                    >
                      Advance
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Design Files / BOM / Items / Internal Costing — 4 of the real
          12 tabs, none with a real data model in this prototype yet.
          Shown as target-design placeholders per Blueprint §4.1/§4.5. */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-dashed bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase">
              Design Files
            </h3>
            <TargetDesignBadge />
          </div>
          <p className="text-xs text-gray-400">
            Design-file revisions specific to this project, distinct from the
            Drawing Repository's cross-project library — not modeled yet.
          </p>
        </div>
        <div className="rounded-xl border border-dashed bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase">Items</h3>
            <TargetDesignBadge />
          </div>
          <p className="text-xs text-gray-400">
            Production's real projects can carry several distinct physical items
            per order — this prototype's Project is single-item, a foundational
            shape decision, not a display gap.
          </p>
        </div>
        <div className="rounded-xl border border-dashed bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase">BOM</h3>
            <TargetDesignBadge />
          </div>
          <p className="text-xs text-gray-400">
            The real bill-of-materials engine — distinct from Material
            Requisitions below, which is real and working. Same disclosed gap as
            Module 21.
          </p>
        </div>
        <div className="rounded-xl border border-dashed bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase">
              Internal Costing
            </h3>
            <TargetDesignBadge />
          </div>
          <p className="text-xs text-gray-400">
            Real per-project material/process/labour cost breakdown — feeds
            Profit &amp; Costing below. Not modeled yet.
          </p>
        </div>
      </div>

      <SectionAnchor id="materials" label="Materials" />

      {requisitions.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
            Material requisitions
          </h3>
          <div className="space-y-2">
            {requisitions.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-2.5 rounded-lg border"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {r.materialName}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Shortage {r.shortageQty}
                    {r.requiredQty ? ` of ${r.requiredQty} required` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={r.status}
                    tone={r.status === "Completed" ? "success" : "warning"}
                  />
                  {r.status !== "Completed" && (
                    <button
                      type="button"
                      onClick={() =>
                        doCompleteRequisition(r.id, r.materialName)
                      }
                      className="text-xs font-semibold text-emerald-600"
                    >
                      Mark Complete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SectionAnchor id="execution" label="Execution" />

      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-gray-500 uppercase">
            Production
          </h3>
          <button
            type="button"
            onClick={() => onNavigate("production", "")}
            className="text-[11px] font-semibold text-blue-600"
          >
            Manage in Production →
          </button>
        </div>
        {stages.length === 0 ? (
          <p className="text-xs text-gray-400">
            No production stages configured for this project yet.
          </p>
        ) : (
          <div className="space-y-2">
            {stages.map((s, idx) => (
              <div
                key={`${s.stageName}-${idx}`}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg border"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 w-5">
                    {idx + 1}
                  </span>
                  <p className="text-sm font-medium text-gray-900">
                    {s.stageName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={s.status}
                    tone={
                      s.status === "Completed" || s.status === "Received"
                        ? "success"
                        : s.status === "InProgress" || s.status === "Sent"
                          ? "warning"
                          : "neutral"
                    }
                  />
                  {s.status !== "Completed" && s.status !== "Received" && (
                    <button
                      type="button"
                      onClick={() => doAdvanceStage(idx, s.stageName, s.status)}
                      className="text-xs font-semibold text-blue-600"
                    >
                      Advance
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dashed bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase">
            Outsourced Work
          </h3>
          <TargetDesignBadge />
        </div>
        <p className="text-xs text-gray-400">
          Real vendor-outsourced production-step tracking, distinct from
          Production's own real vendor send/receive (already built). Not modeled
          yet.
        </p>
      </div>

      {inspections.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase">
              Quality
            </h3>
            <button
              type="button"
              onClick={() => onNavigate("qms", "")}
              className="text-[11px] font-semibold text-blue-600"
            >
              Manage in QMS →
            </button>
          </div>
          <div className="space-y-2">
            {inspections.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between p-2.5 rounded-lg border"
              >
                <div className="flex items-start gap-2">
                  {q.status === "Failed" ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  )}
                  <p className="text-sm font-medium text-gray-900">
                    {q.processName}
                  </p>
                </div>
                <StatusBadge
                  status={q.status}
                  tone={
                    q.status === "Passed"
                      ? "success"
                      : q.status === "Failed"
                        ? "danger"
                        : "warning"
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <SectionAnchor id="closure" label="Closure" />

      {deliveryChallans.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase">
              Delivery
            </h3>
            <button
              type="button"
              onClick={() => onNavigate("delivery-challans", "")}
              className="text-[11px] font-semibold text-blue-600"
            >
              View all →
            </button>
          </div>
          <div className="space-y-1.5">
            {deliveryChallans.map((dc) => (
              <div
                key={dc.id}
                className="flex items-center justify-between text-xs py-1"
              >
                <span className="text-gray-700">{dc.dcNo}</span>
                <StatusBadge
                  status={dc.status}
                  tone={dc.status === "Delivered" ? "success" : "neutral"}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-dashed bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase">
            Profit &amp; Costing
          </h3>
          <TargetDesignBadge />
        </div>
        <p className="text-xs text-gray-400">
          Real margin analysis, depends on Internal Costing existing first. Not
          modeled yet.
        </p>
      </div>

      <div className="rounded-xl border border-dashed bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase">
            Timeline
          </h3>
          <TargetDesignBadge />
        </div>
        <p className="text-xs text-gray-400">
          Real per-project activity/audit log. Not modeled yet.
        </p>
      </div>

      {invoice && (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">
            Invoice
          </h3>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {invoice.no}
              </p>
              <p className="text-[11px] text-gray-500">Due {invoice.dueDate}</p>
            </div>
            <StatusBadge
              status={
                balance === 0
                  ? "Paid"
                  : payments.length > 0
                    ? "Partially Paid"
                    : "Unpaid"
              }
              tone={
                balance === 0
                  ? "success"
                  : payments.length > 0
                    ? "warning"
                    : "danger"
              }
            />
          </div>
          <p className="text-xs text-gray-500">
            ₹{invoice.paidAmount.toLocaleString("en-IN")} paid of ₹
            {invoice.amount.toLocaleString("en-IN")} — balance ₹
            {balance.toLocaleString("en-IN")}
          </p>
          {balance > 0 && (
            <div className="flex gap-2 mt-2">
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                type="number"
                placeholder="Amount"
                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border"
              />
              <button
                type="button"
                onClick={doPay}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 text-white"
              >
                Record payment
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {quotation && (
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">
              Originating quotation
            </h3>
            <p className="text-sm font-medium text-gray-900">{quotation.no}</p>
            <p className="text-[11px] text-gray-500">
              {quotation.item} — accepted {quotation.createdAt}
            </p>
          </div>
        )}
        {drawings.length > 0 && (
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> Drawings
            </h3>
            {drawings.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between text-xs py-1"
              >
                <span className="text-gray-700">
                  {d.fileName} (v{d.version})
                </span>
                <StatusBadge
                  status={d.status}
                  tone={d.status === "Approved" ? "success" : "neutral"}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
