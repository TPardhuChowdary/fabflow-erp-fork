import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
} from "lucide-react";
// Final Unified Prototype — the real, deep Project Workspace, matching
// real production's `pages/ProjectDetail.tsx` (6,453 lines, the single
// largest production file — see PARITY_TRACKER.md's ProjectDetail
// entry). Click a Project → see its real customer, quotation lineage,
// customer PO, production stages, QMS inspections, material
// requisitions, delivery challans, drawings, and invoice, all via real
// foreign-key lookups (store.projectContext) — take a real action and
// watch the state change and cascade everywhere it's referenced.
//
// Rewired this pass: `projectContext` used to read the OLD invented
// `stages`/`qmsIssues`/`purchaseOrders` demo entities — a real staleness
// bug, since Modules 20 (Production), 22-26 (QMS), and 5 (Customer PO)
// already built the real per-project entities these should have pointed
// at. Fixed at the source (store.tsx), not worked around here.
//
// Reuse boundary (disclosed, not accidental): Production/QMS/Material
// Requisitions/Delivery/Drawings each already have a full, real,
// dedicated screen (Modules 20, 22-26, 21, 14, 27). This workspace shows
// each one's real live status here — with the single most common quick
// action inline (advance a stage, mark a requisition complete, update a
// customer PO's status) — and deep-links to that module's own screen for
// the full multi-step editor, rather than re-implementing every editor a
// second time. This matches the file's own original architecture
// principle: "each model just decides how you ARRIVE here."
import { useState } from "react";
import { StatusBadge, useConfirm, useToast } from "../primitives";
import { useUxLabStore } from "../store";

const STAGE_STATUSES: import("../data").ProjectStageStatus[] = [
  "NotStarted",
  "Sent",
  "InProgress",
  "Completed",
  "Received",
];

export function ProjectWorkspace({
  projectId,
  onNavigate,
}: { projectId: string; onNavigate: (view: string, id: string) => void }) {
  const {
    projectContext,
    recordPayment,
    updateProjectStagesFull,
    completeBomRequisition,
    updateQuotationPOStatus,
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
    status: import("../data").QuotationPO["status"],
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

  const dispatchedQty = deliveryChallans.reduce(
    (sum, dc) =>
      sum +
      (dc.projectEntries.find((e) => e.projectId === projectId)?.dispatchQty ??
        0),
    0,
  );

  return (
    <div className="space-y-4">
      {/* breadcrumb */}
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

      <div>
        <h1 className="text-lg font-bold text-gray-900">{project.name}</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {project.no} · {project.qty} units · ₹
          {project.value.toLocaleString("en-IN")}
        </p>
      </div>

      {/* dispatch summary — real math over real DeliveryChallans */}
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

      {/* production stages — real per-project ProjectProduction */}
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
                      className="text-xs font-semibold text-blue-600 flex items-center gap-0.5"
                    >
                      Advance <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* customer PO — real QuotationPO */}
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

      {/* material requisitions — real BomRequisition */}
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

      {/* QMS — real ProjectQmsInspection */}
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

      {/* delivery challans — real, project-filtered */}
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

      {/* Invoice / payment — real balance math */}
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

      {/* Drawings + quotation lineage */}
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
