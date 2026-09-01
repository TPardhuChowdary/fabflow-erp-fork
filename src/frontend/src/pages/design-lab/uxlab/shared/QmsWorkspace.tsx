// UX Redesign Lab — real QMS area: Dashboard / Characteristics /
// Inspection Sheets / My Inspections / Project QMS, matching production's
// real 5-page split (see PARITY_TRACKER.md #22-26). Built alongside the
// pre-existing `qmsIssues`/`qmsCharacteristics`/`qmsInspections` demo
// entities (an invented "NCR" concept and a simplified inspection-log
// shape) rather than replacing them — those are read unmodified by 4 of
// the 10 untouchable pre-existing models. See data.ts's QmsIssue/
// QmsCharacteristic/QmsInspection comment for the full disclosure.
import { useState } from "react";
import type {
  InspectionMode,
  InspectionSheetStatus,
  QmsCriticality,
  QmsInspectionMethodType,
} from "../data";
import { INSPECTION_SHEET_TRANSITIONS } from "../data";
import {
  FieldError,
  SearchBox,
  StatusBadge,
  useConfirm,
  useTableControls,
  useToast,
} from "../primitives";
import { useUxLabStore } from "../store";

type Tab = "dashboard" | "characteristics" | "sheets" | "mine" | "project";

const CRITICALITY_LABEL: Record<QmsCriticality, string> = {
  SafetyCritical: "Safety Critical",
  FunctionalCritical: "Functional Critical",
  RegulatoryCritical: "Regulatory Critical",
  CustomerCritical: "Customer Critical",
  ProcessCritical: "Process Critical",
  Cosmetic: "Cosmetic",
};
const CRITICALITY_TONE: Record<
  QmsCriticality,
  "success" | "warning" | "danger" | "neutral"
> = {
  SafetyCritical: "danger",
  FunctionalCritical: "warning",
  RegulatoryCritical: "warning",
  CustomerCritical: "neutral",
  ProcessCritical: "neutral",
  Cosmetic: "success",
};
const METHOD_TYPES: QmsInspectionMethodType[] = [
  "PassFail",
  "Numeric",
  "MultiNumeric",
  "Text",
  "Dropdown",
  "Checkbox",
  "Photo",
  "File",
  "Certificate",
  "BarcodeScan",
  "QRScan",
];
const CRITICALITIES: QmsCriticality[] = [
  "SafetyCritical",
  "FunctionalCritical",
  "RegulatoryCritical",
  "CustomerCritical",
  "ProcessCritical",
  "Cosmetic",
];
const SHEET_STATUS_LABEL: Record<InspectionSheetStatus, string> = {
  Draft: "Draft",
  Generated: "Generated",
  Printed: "Printed",
  InspectionStarted: "Inspection Started",
  InProgress: "Inspection In Progress",
  Completed: "Inspection Completed",
  AwaitingUpload: "Awaiting Upload",
  Uploaded: "Uploaded",
  Reviewed: "Under Review",
  Approved: "Approved",
  Closed: "Closed",
};
const MODE_LABEL: Record<InspectionMode, string> = {
  Paper: "Paper-Based",
  Digital: "Digital",
  Hybrid: "Hybrid (Recommended)",
};

function CharacteristicFormDialog({
  editing,
  onCancel,
  onSaved,
}: {
  editing: import("../data").QualityCharacteristic | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { data, addCharacteristicFull, updateCharacteristicFull } =
    useUxLabStore();
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [category, setCategory] = useState(editing?.category ?? "Dimensional");
  const [processId, setProcessId] = useState(editing?.processId ?? "");
  const [criticality, setCriticality] = useState<QmsCriticality>(
    editing?.criticality ?? "ProcessCritical",
  );
  const [inspectionMethodType, setInspectionMethodType] =
    useState<QmsInspectionMethodType>(
      editing?.inspectionMethodType ?? "PassFail",
    );
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(
    editing?.acceptanceCriteria ?? "",
  );
  const [toleranceNominal, setToleranceNominal] = useState(
    String(editing?.toleranceNominal ?? ""),
  );
  const [tolerancePlus, setTolerancePlus] = useState(
    String(editing?.tolerancePlus ?? ""),
  );
  const [toleranceMinus, setToleranceMinus] = useState(
    String(editing?.toleranceMinus ?? ""),
  );
  const [unit, setUnit] = useState(editing?.unit ?? "");
  const [measuringInstrument, setMeasuringInstrument] = useState(
    editing?.measuringInstrument ?? "",
  );
  const [standardReference, setStandardReference] = useState(
    editing?.standardReference ?? "",
  );
  const [drawingReference, setDrawingReference] = useState(
    editing?.drawingReference ?? "",
  );
  const [evidenceRequired, setEvidenceRequired] = useState(
    editing?.evidenceRequired ?? false,
  );
  const [photoRequired, setPhotoRequired] = useState(
    editing?.photoRequired ?? false,
  );
  const [customerScope, setCustomerScope] = useState(
    editing?.customerScope ?? "",
  );
  const [tags, setTags] = useState(editing?.tags.join(", ") ?? "");
  const [status, setStatus] = useState<
    import("../data").QmsCharacteristicStatus
  >(editing?.status ?? "Active");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!processId) {
      setError("Process is required");
      return;
    }
    if (!acceptanceCriteria.trim()) {
      setError("Acceptance criteria is required");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    const fields = {
      name: name.trim(),
      description: description.trim(),
      category,
      processId,
      criticality,
      inspectionMethodType,
      acceptanceCriteria: acceptanceCriteria.trim(),
      toleranceNominal: toleranceNominal ? Number(toleranceNominal) : undefined,
      tolerancePlus: tolerancePlus ? Number(tolerancePlus) : undefined,
      toleranceMinus: toleranceMinus ? Number(toleranceMinus) : undefined,
      unit: unit || undefined,
      measuringInstrument: measuringInstrument || undefined,
      standardReference: standardReference || undefined,
      drawingReference: drawingReference || undefined,
      evidenceRequired,
      photoRequired,
      customerScope: customerScope || undefined,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    if (editing) {
      updateCharacteristicFull(editing.id, { ...fields, status });
      toast("Characteristic updated");
    } else {
      const c = addCharacteristicFull(fields);
      toast(`Characteristic "${c.name}" added`);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border shadow-lg w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold mb-3">
          {editing ? "Edit Characteristic" : "New Characteristic"}
        </h3>
        <div className="space-y-2.5">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="qc-name"
            >
              Name <span className="text-red-600">*</span>
            </label>
            <input
              id="qc-name"
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
              htmlFor="qc-desc"
            >
              Description
            </label>
            <textarea
              id="qc-desc"
              className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-category"
              >
                Category
              </label>
              <input
                id="qc-category"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-process"
              >
                Process <span className="text-red-600">*</span>
              </label>
              <select
                id="qc-process"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={processId}
                onChange={(e) => {
                  setProcessId(e.target.value);
                  setError("");
                }}
              >
                <option value="">Select…</option>
                {data.manufacturingProcesses.map((p) => (
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
                htmlFor="qc-criticality"
              >
                Criticality
              </label>
              <select
                id="qc-criticality"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={criticality}
                onChange={(e) =>
                  setCriticality(e.target.value as QmsCriticality)
                }
              >
                {CRITICALITIES.map((c) => (
                  <option key={c} value={c}>
                    {CRITICALITY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-method"
              >
                Inspection Method
              </label>
              <select
                id="qc-method"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={inspectionMethodType}
                onChange={(e) =>
                  setInspectionMethodType(
                    e.target.value as QmsInspectionMethodType,
                  )
                }
              >
                {METHOD_TYPES.map((m) => (
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
              htmlFor="qc-acceptance"
            >
              Acceptance Criteria <span className="text-red-600">*</span>
            </label>
            <input
              id="qc-acceptance"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={acceptanceCriteria}
              onChange={(e) => {
                setAcceptanceCriteria(e.target.value);
                setError("");
              }}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-nominal"
              >
                Nominal
              </label>
              <input
                id="qc-nominal"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={toleranceNominal}
                onChange={(e) => setToleranceNominal(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-plus"
              >
                +Tol
              </label>
              <input
                id="qc-plus"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={tolerancePlus}
                onChange={(e) => setTolerancePlus(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-minus"
              >
                -Tol
              </label>
              <input
                id="qc-minus"
                type="number"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={toleranceMinus}
                onChange={(e) => setToleranceMinus(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-unit"
              >
                Unit
              </label>
              <input
                id="qc-unit"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-instrument"
              >
                Measuring Instrument
              </label>
              <input
                id="qc-instrument"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={measuringInstrument}
                onChange={(e) => setMeasuringInstrument(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-standard"
              >
                Standard Reference
              </label>
              <input
                id="qc-standard"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={standardReference}
                onChange={(e) => setStandardReference(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-drawing"
              >
                Drawing Reference
              </label>
              <input
                id="qc-drawing"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                value={drawingReference}
                onChange={(e) => setDrawingReference(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-[11px] font-semibold text-gray-500"
                htmlFor="qc-customer"
              >
                Customer Scope
              </label>
              <select
                id="qc-customer"
                className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
                value={customerScope}
                onChange={(e) => setCustomerScope(e.target.value)}
              >
                <option value="">Generic (all customers)</option>
                {data.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="qc-tags"
            >
              Tags (comma-separated)
            </label>
            <input
              id="qc-tags"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={evidenceRequired}
                onChange={(e) => setEvidenceRequired(e.target.checked)}
              />
              Evidence Required
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={photoRequired}
                onChange={(e) => setPhotoRequired(e.target.checked)}
              />
              Photo Required
            </label>
            {editing && (
              <label className="flex items-center gap-1.5 text-xs ml-auto">
                <input
                  type="checkbox"
                  checked={status === "Active"}
                  onChange={(e) =>
                    setStatus(e.target.checked ? "Active" : "Obsolete")
                  }
                />
                Active
              </label>
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
            {saving
              ? "Saving…"
              : editing
                ? "Save Changes"
                : "Add Characteristic"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function QmsWorkspace() {
  const {
    data,
    generateInspectionSheet,
    advanceInspectionSheetStatus,
    addProjectQmsInspection,
    recordCharacteristicResult,
  } = useUxLabStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("dashboard");
  const tbl = useTableControls(
    data.qmsInspections,
    (i) => `${i.characteristic} ${i.inspector}`,
    "date",
  );

  const [charDialog, setCharDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; c: import("../data").QualityCharacteristic }
    | null
  >(null);

  const [sheetProjectId, setSheetProjectId] = useState("");
  const [sheetMode, setSheetMode] = useState<InspectionMode>("Hybrid");

  const [pqProjectId, setPqProjectId] = useState("");
  const [pqProcessId, setPqProcessId] = useState("");
  const [pqMode, setPqMode] = useState<InspectionMode>("Digital");
  const [expandedPqi, setExpandedPqi] = useState<string | null>(null);
  const [recordTarget, setRecordTarget] = useState<
    import("../data").ProjectQmsInspectionCharacteristic | null
  >(null);
  const [recordResult, setRecordResult] = useState<"Pass" | "Fail" | "NA">(
    "Pass",
  );
  const [recordValue, setRecordValue] = useState("");
  const [recordRemarks, setRecordRemarks] = useState("");
  const [recordFailReason, setRecordFailReason] = useState("");

  const processName = (id: string) =>
    data.manufacturingProcesses.find((p) => p.id === id)?.name ?? id;
  const projectName = (id: string) =>
    data.projects.find((p) => p.id === id)?.name ?? id;

  const active = data.qualityCharacteristics.filter(
    (c) => c.status === "Active",
  );
  const obsolete = data.qualityCharacteristics.filter(
    (c) => c.status === "Obsolete",
  );
  const byCriticality = CRITICALITIES.map((level) => ({
    level,
    count: active.filter((c) => c.criticality === level).length,
  }));
  const byProcess = data.manufacturingProcesses
    .map((p) => ({
      process: p,
      count: active.filter((c) => c.processId === p.id).length,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const doGenerateSheet = () => {
    if (!sheetProjectId) {
      toast("Select a project");
      return;
    }
    const s = generateInspectionSheet(sheetProjectId, sheetMode);
    toast(`Inspection sheet ${s.inspectionNumber} generated`);
    setSheetProjectId("");
  };

  const doAddProjectInspection = () => {
    if (!pqProjectId || !pqProcessId) {
      toast("Select a project and process");
      return;
    }
    const result = addProjectQmsInspection(pqProjectId, pqProcessId, pqMode);
    if (result.ok) {
      toast(`"${result.data.processName}" added to this project's QMS`);
      setExpandedPqi(result.data.id);
      setPqProcessId("");
    } else {
      toast("Already exists for this project");
    }
  };

  const openRecord = (
    c: import("../data").ProjectQmsInspectionCharacteristic,
  ) => {
    setRecordTarget(c);
    setRecordResult(c.result ?? "Pass");
    setRecordValue(c.measuredValue ?? "");
    setRecordRemarks(c.remarks ?? "");
    setRecordFailReason(c.failureReason ?? "");
  };

  const submitRecord = () => {
    if (!recordTarget) return;
    recordCharacteristicResult(
      recordTarget.id,
      recordResult,
      recordValue || undefined,
      recordRemarks || undefined,
      recordResult === "Fail" ? recordFailReason || undefined : undefined,
    );
    toast("Result recorded");
    setRecordTarget(null);
  };

  const doAdvanceSheet = async (
    sheet: import("../data").InspectionSheet,
    next: InspectionSheetStatus,
  ) => {
    const ok = await confirm(
      "Advance status?",
      `Move ${sheet.inspectionNumber} to "${SHEET_STATUS_LABEL[next]}"?`,
    );
    if (!ok) return;
    advanceInspectionSheetStatus(sheet.id, next);
    toast("Status updated");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b overflow-x-auto">
        {(
          ["dashboard", "characteristics", "sheets", "mine", "project"] as Tab[]
        ).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === t ? "border-blue-600 text-gray-900" : "border-transparent text-gray-500"}`}
          >
            {t === "mine"
              ? "My Inspections"
              : t === "sheets"
                ? "Inspection Sheets"
                : t === "project"
                  ? "Project QMS"
                  : t === "characteristics"
                    ? "Characteristics"
                    : "Dashboard"}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-[11px] text-gray-500">
                Active Characteristics
              </p>
              <p className="text-xl font-bold">{active.length}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-[11px] text-gray-500">Obsolete</p>
              <p className="text-xl font-bold text-gray-400">
                {obsolete.length}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-[11px] text-gray-500">Inspection Sheets</p>
              <p className="text-xl font-bold">
                {data.inspectionSheets.length}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-[11px] text-gray-500">Open NCRs</p>
              <p className="text-xl font-bold text-red-600">
                {data.qmsIssues.filter((q) => q.status === "Open").length}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-xs font-bold mb-2">
                Active Characteristics by Criticality
              </h3>
              <div className="space-y-1.5">
                {byCriticality.map(({ level, count }) => (
                  <div
                    key={level}
                    className="flex items-center justify-between text-xs"
                  >
                    <StatusBadge
                      status={CRITICALITY_LABEL[level]}
                      tone={CRITICALITY_TONE[level]}
                    />
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-xs font-bold mb-2">
                Active Characteristics by Process
              </h3>
              <div className="space-y-1.5">
                {byProcess.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">
                    No characteristics yet
                  </p>
                )}
                {byProcess.map(({ process, count }) => (
                  <div
                    key={process.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-gray-500">{process.name}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "characteristics" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Master library of reusable inspection checkpoints across all
              manufacturing processes.
            </p>
            <button
              type="button"
              onClick={() => setCharDialog({ mode: "create" })}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 text-white shrink-0"
            >
              + New Characteristic
            </button>
          </div>
          <div className="rounded-xl border bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left p-2.5">Name</th>
                  <th className="text-left p-2.5">Process</th>
                  <th className="text-left p-2.5">Criticality</th>
                  <th className="text-left p-2.5">Method</th>
                  <th className="text-left p-2.5">Status</th>
                  <th className="text-left p-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.qualityCharacteristics.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="p-2.5 font-semibold">{c.name}</td>
                    <td className="p-2.5 text-gray-500">
                      {processName(c.processId)}
                    </td>
                    <td className="p-2.5">
                      <StatusBadge
                        status={CRITICALITY_LABEL[c.criticality]}
                        tone={CRITICALITY_TONE[c.criticality]}
                      />
                    </td>
                    <td className="p-2.5 text-gray-500">
                      {c.inspectionMethodType}
                    </td>
                    <td className="p-2.5">
                      <StatusBadge
                        status={c.status}
                        tone={c.status === "Active" ? "success" : "neutral"}
                      />
                    </td>
                    <td className="p-2.5">
                      <button
                        type="button"
                        onClick={() => setCharDialog({ mode: "edit", c })}
                        className="text-blue-600 font-semibold"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {data.qualityCharacteristics.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      No characteristics defined yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "sheets" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-gray-50 p-2">
            <select
              className="h-8 text-xs rounded-lg border px-2"
              value={sheetProjectId}
              onChange={(e) => setSheetProjectId(e.target.value)}
            >
              <option value="">Select project…</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="h-8 text-xs rounded-lg border px-2"
              value={sheetMode}
              onChange={(e) => setSheetMode(e.target.value as InspectionMode)}
            >
              {(["Digital", "Paper", "Hybrid"] as InspectionMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={doGenerateSheet}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 text-white"
            >
              Generate Sheet
            </button>
          </div>
          <div className="rounded-xl border bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left p-2.5">Inspection No.</th>
                  <th className="text-left p-2.5">Project</th>
                  <th className="text-left p-2.5">Mode</th>
                  <th className="text-left p-2.5">Status</th>
                  <th className="text-left p-2.5">Generated</th>
                  <th className="text-left p-2.5">Advance</th>
                </tr>
              </thead>
              <tbody>
                {data.inspectionSheets.map((s) => {
                  const next = INSPECTION_SHEET_TRANSITIONS[s.status];
                  return (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="p-2.5 font-mono font-semibold">
                        {s.inspectionNumber}
                      </td>
                      <td className="p-2.5">{projectName(s.projectId)}</td>
                      <td className="p-2.5 text-gray-500">
                        {MODE_LABEL[s.mode]}
                      </td>
                      <td className="p-2.5">
                        <StatusBadge
                          status={SHEET_STATUS_LABEL[s.status]}
                          tone={
                            s.status === "Approved" || s.status === "Closed"
                              ? "success"
                              : s.status === "Draft"
                                ? "neutral"
                                : "warning"
                          }
                        />
                      </td>
                      <td className="p-2.5 text-gray-500">
                        {new Date(s.generatedAt).toLocaleDateString()}
                      </td>
                      <td className="p-2.5">
                        {next.length > 0 ? (
                          <select
                            className="h-7 text-[11px] rounded-lg border px-1.5"
                            value=""
                            onChange={(e) =>
                              e.target.value &&
                              doAdvanceSheet(
                                s,
                                e.target.value as InspectionSheetStatus,
                              )
                            }
                          >
                            <option value="">Advance to…</option>
                            {next.map((n) => (
                              <option key={n} value={n}>
                                {SHEET_STATUS_LABEL[n]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {data.inspectionSheets.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      No inspection sheets yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "mine" && (
        <div className="space-y-2">
          <SearchBox
            value={tbl.query}
            onChange={tbl.setQuery}
            placeholder="Search inspections…"
          />
          <div className="rounded-xl border bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left p-2.5">Characteristic</th>
                  <th className="text-left p-2.5">Inspector</th>
                  <th className="text-left p-2.5">Date</th>
                  <th className="text-left p-2.5">Result</th>
                </tr>
              </thead>
              <tbody>
                {tbl.rows
                  .filter((i) => i.inspector === "Kavita Rao")
                  .map((i) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="p-2.5">{i.characteristic}</td>
                      <td className="p-2.5">{i.inspector}</td>
                      <td className="p-2.5">{i.date}</td>
                      <td className="p-2.5">
                        <StatusBadge
                          status={i.result}
                          tone={
                            i.result === "Pass"
                              ? "success"
                              : i.result === "Fail"
                                ? "danger"
                                : "warning"
                          }
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "project" && (
        <div className="space-y-2">
          <div>
            <label
              className="text-[11px] font-semibold text-gray-500"
              htmlFor="pq-project"
            >
              Project
            </label>
            <select
              id="pq-project"
              className="mt-1 w-full h-8 text-sm rounded-lg border px-2"
              value={pqProjectId}
              onChange={(e) => setPqProjectId(e.target.value)}
            >
              <option value="">Select a project…</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {pqProjectId && (
            <>
              <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-gray-50 p-2">
                <select
                  className="h-8 text-xs rounded-lg border px-2"
                  value={pqProcessId}
                  onChange={(e) => setPqProcessId(e.target.value)}
                >
                  <option value="">Add an inspection (process)…</option>
                  {data.manufacturingProcesses.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-8 text-xs rounded-lg border px-2"
                  value={pqMode}
                  onChange={(e) => setPqMode(e.target.value as InspectionMode)}
                >
                  {(["Digital", "Paper", "Hybrid"] as InspectionMode[]).map(
                    (m) => (
                      <option key={m} value={m}>
                        {MODE_LABEL[m]}
                      </option>
                    ),
                  )}
                </select>
                <button
                  type="button"
                  disabled={!pqProcessId}
                  onClick={doAddProjectInspection}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 text-white disabled:opacity-40"
                >
                  Add Inspection
                </button>
              </div>
              <div className="space-y-2">
                {data.projectQmsInspections
                  .filter((i) => i.projectId === pqProjectId)
                  .map((insp) => {
                    const chars = data.projectQmsInspectionCharacteristics
                      .filter((c) => c.projectQmsInspectionId === insp.id)
                      .sort((a, b) => a.sequence - b.sequence);
                    const expanded = expandedPqi === insp.id;
                    return (
                      <div key={insp.id} className="rounded-lg border">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                          onClick={() =>
                            setExpandedPqi(expanded ? null : insp.id)
                          }
                        >
                          <span className="flex items-center gap-2 flex-wrap text-xs">
                            <span className="font-semibold">
                              {insp.processName}
                            </span>
                            <StatusBadge
                              status={insp.status}
                              tone={
                                insp.status === "Passed"
                                  ? "success"
                                  : insp.status === "Failed"
                                    ? "danger"
                                    : insp.status === "InProgress"
                                      ? "warning"
                                      : "neutral"
                              }
                            />
                            <span className="text-gray-400">
                              {MODE_LABEL[insp.mode]}
                            </span>
                            <span className="text-gray-400">
                              {chars.length} characteristic
                              {chars.length !== 1 ? "s" : ""}
                            </span>
                          </span>
                        </button>
                        {expanded && (
                          <div className="border-t px-3 py-2 space-y-1.5">
                            {chars.length === 0 && (
                              <p className="text-xs text-gray-400">
                                No active characteristics defined for this
                                process.
                              </p>
                            )}
                            {chars.map((c) => (
                              <div
                                key={c.id}
                                className="flex items-center justify-between text-xs rounded-md border p-2"
                              >
                                <span>{c.nameSnapshot}</span>
                                <div className="flex items-center gap-2">
                                  {c.result ? (
                                    <StatusBadge
                                      status={c.result}
                                      tone={
                                        c.result === "Pass"
                                          ? "success"
                                          : c.result === "Fail"
                                            ? "danger"
                                            : "neutral"
                                      }
                                    />
                                  ) : (
                                    <span className="text-gray-400">
                                      Not recorded
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openRecord(c)}
                                    className="text-blue-600 font-semibold"
                                  >
                                    Record
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                {data.projectQmsInspections.filter(
                  (i) => i.projectId === pqProjectId,
                ).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">
                    No QMS inspections for this project yet.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {charDialog && (
        <CharacteristicFormDialog
          editing={charDialog.mode === "edit" ? charDialog.c : null}
          onCancel={() => setCharDialog(null)}
          onSaved={() => setCharDialog(null)}
        />
      )}

      {recordTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border shadow-lg w-full max-w-xs p-5">
            <h3 className="text-sm font-bold mb-3">
              Record Result — {recordTarget.nameSnapshot}
            </h3>
            <div className="space-y-2.5">
              <div>
                <span className="text-[11px] font-semibold text-gray-500 block mb-1">
                  Result
                </span>
                <div className="flex gap-1.5">
                  {(["Pass", "Fail", "NA"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRecordResult(r)}
                      className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg border ${recordResult === r ? "bg-gray-900 text-white border-gray-900" : "bg-white"}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label
                  className="text-[11px] font-semibold text-gray-500"
                  htmlFor="rec-value"
                >
                  Measured Value
                </label>
                <input
                  id="rec-value"
                  className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                  value={recordValue}
                  onChange={(e) => setRecordValue(e.target.value)}
                />
              </div>
              {recordResult === "Fail" && (
                <div>
                  <label
                    className="text-[11px] font-semibold text-gray-500"
                    htmlFor="rec-fail"
                  >
                    Failure Reason
                  </label>
                  <input
                    id="rec-fail"
                    className="mt-1 w-full h-8 text-sm rounded-lg border px-2.5"
                    value={recordFailReason}
                    onChange={(e) => setRecordFailReason(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label
                  className="text-[11px] font-semibold text-gray-500"
                  htmlFor="rec-remarks"
                >
                  Remarks
                </label>
                <textarea
                  id="rec-remarks"
                  className="mt-1 w-full text-sm rounded-lg border px-2.5 py-1.5"
                  rows={2}
                  value={recordRemarks}
                  onChange={(e) => setRecordRemarks(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setRecordTarget(null)}
                className="text-xs font-semibold px-3 py-2 rounded-lg border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRecord}
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
