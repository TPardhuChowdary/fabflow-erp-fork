// Production Material Transactions UI — the actual material-conversion
// event layer (Input Item -> Operation -> Performer -> Output Item),
// additive to and clearly distinct from the existing Work Lines
// (planning/outsourcing) and Stage Transactions (send/receive) UI. The
// database (production_material_transactions + its triggers) is the
// sole authority for stock mutation, negative-stock protection,
// vendor/in-house consistency, organization isolation, and
// performed_by — this component only ever submits a row and reads rows
// back; it never computes or displays a locally-derived stock number.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { JobCardSelect } from "@/components/JobCardSelect";
import { VendorSelect } from "@/components/VendorSelect";
import { InventoryItemPicker } from "@/components/InventoryItemPicker";
import {
  createProductionMaterialTransactionRemote,
  fetchProductionMaterialTransactions,
  type WriteResult,
} from "@/lib/productionMaterialTransactionsApi";
import { fetchMaterialFamilies } from "@/lib/materialFamiliesApi";
import { useStore } from "@/store";
import type {
  MaterialFamily,
  ProductionMaterialTransaction,
  ProjectProductionStage,
} from "@/types";

interface Props {
  projectId: string;
  stages: ProjectProductionStage[];
  pEdit: boolean;
  /** Set by the Outsourcing/Dispatch receipt follow-up flow ("Record
   * Material Conversion") to open this component's own existing dialog
   * pre-filled with only what a Stage Transaction/Work Line receipt
   * genuinely knows. Never a second form — same dialog, same submit
   * path (createProductionMaterialTransactionRemote), same DB
   * triggers. Cleared via onPrefillConsumed once applied, so it never
   * re-fires on an unrelated re-render. */
  prefill?: MaterialFlowPrefill | null;
  onPrefillConsumed?: () => void;
}

/** What a receipt follow-up can honestly prefill — every field here is
 * either directly known (stageId, vendor from the Work Line/Send
 * transaction) or deliberately omitted when the source data doesn't
 * genuinely identify it (inputItemId, outputItemId, jobCardId are
 * never part of this — see ProductionMaterialTransactions' own
 * handling and the receipt follow-up code in Production.tsx /
 * ProductionStageLines.tsx for exactly why). */
export interface MaterialFlowPrefill {
  stageId?: string;
  performerType: "inhouse" | "vendor";
  vendorId?: string;
  vendorName?: string;
  /** From Work Line workType or the Stage's own name — both free text
   * the user themselves entered/chose, never invented here. */
  operation?: string;
  /** Only set when a genuine unit is known (Work Line uom) — never a
   * bare number with an assumed/guessed unit. */
  inputQty?: string;
  inputUom?: string;
  /** Short explanation shown in the dialog so the user understands
   * what was and wasn't auto-filled and why. */
  note?: string;
}

/** Reported by the Outsourcing/Dispatch "Mark Received" flow (both the
 * stage-wide dialog in Production.tsx and the per-Work-Line dialog in
 * ProductionStageLines.tsx) immediately after a receipt is
 * successfully recorded, so Production.tsx can show the receipt
 * follow-up prompt ("Record Material Conversion" / "Skip for Now").
 * Everything here is display-only — none of it is written anywhere;
 * the receipt itself is already saved by the time this fires. */
export interface ReceiptFollowUpInfo {
  vendorName?: string;
  receivedQty: number;
  uom?: string;
  plannedQty?: number;
  pendingQty?: number;
  prefill: MaterialFlowPrefill;
}

interface FormState {
  stageId: string;
  jobCardId: string;
  operation: string;
  performerType: "inhouse" | "vendor";
  vendorId: string;
  vendorName: string;
  inputMode: "item" | "vendor_supplied";
  inputItemId: string;
  inputQty: string;
  inputUom: string;
  outputItemId: string;
  outputQty: string;
  outputUom: string;
  rejectedQty: string;
  notes: string;
  eventTime: string;
}

function emptyForm(): FormState {
  return {
    stageId: "",
    jobCardId: "",
    operation: "",
    performerType: "inhouse",
    vendorId: "",
    vendorName: "",
    inputMode: "item",
    inputItemId: "",
    inputQty: "",
    inputUom: "",
    outputItemId: "",
    outputQty: "",
    outputUom: "",
    rejectedQty: "0",
    notes: "",
    eventTime: new Date().toISOString().slice(0, 16),
  };
}

export function ProductionMaterialTransactions({
  projectId,
  stages,
  pEdit,
  prefill,
  onPrefillConsumed,
}: Props) {
  const { inventoryItems, jobCards } = useStore();
  const stageIds = stages.map((s) => s.stageId).filter((id): id is string => !!id);

  const [transactions, setTransactions] = useState<
    ProductionMaterialTransaction[] | null
  >(null);
  // Transactions with no stage_id at all cannot be attributed to any
  // particular project — production_material_transactions has no
  // project_id column (design limitation, not a bug). Fetched
  // separately (org-wide, same fetch function, no API change) and
  // rendered under its own clearly-labeled "Ungrouped" section rather
  // than silently pretending they belong to this project.
  const [ungroupedTransactions, setUngroupedTransactions] = useState<
    ProductionMaterialTransaction[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  // Locally fetched, same reuse-first pattern as this component's own
  // transaction list and Inventory.tsx's family list — not threaded
  // through the global store for what's a small, rarely-changing list.
  const [materialFamilies, setMaterialFamilies] = useState<MaterialFamily[]>([]);
  useEffect(() => {
    fetchMaterialFamilies().then((result) => {
      if (result.status === "success" && result.data) {
        setMaterialFamilies(result.data);
      }
    });
  }, []);
  const [saving, setSaving] = useState(false);
  // Set only when the dialog was opened via a receipt follow-up's
  // prefill, cleared on manual open/close — never derived from
  // `prefill` directly, since that prop is cleared by the parent right
  // after being applied (see the prefill effect below).
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [scoped, all] = await Promise.all([
      stageIds.length > 0
        ? fetchProductionMaterialTransactions(stageIds)
        : Promise.resolve<WriteResult<ProductionMaterialTransaction[]>>({
            status: "success",
            data: [],
          }),
      fetchProductionMaterialTransactions(),
    ]);
    setLoading(false);
    if (scoped.status === "success" && scoped.data) {
      setTransactions(scoped.data);
    } else if (scoped.status !== "unauthenticated") {
      toast.error(scoped.error ?? "Could not load production transactions");
    }
    if (all.status === "success" && all.data) {
      setUngroupedTransactions(all.data.filter((t) => !t.stageId));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, stageIds.join(",")]);

  // Applies a receipt follow-up's prefill (see Props.prefill) by opening
  // this same dialog with only the genuinely-known fields filled in —
  // inputItemId/outputItemId/jobCardId are never part of `prefill` and
  // so always stay blank here, same as opening the dialog normally.
  useEffect(() => {
    if (!prefill) return;
    setForm({
      ...emptyForm(),
      stageId: prefill.stageId ?? "",
      performerType: prefill.performerType,
      vendorId: prefill.vendorId ?? "",
      vendorName: prefill.vendorName ?? "",
      operation: prefill.operation ?? "",
      inputQty: prefill.inputQty ?? "",
      inputUom: prefill.inputUom ?? "",
    });
    setPrefillNote(prefill.note ?? null);
    setOpen(true);
    onPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Chain grouping: purely a visual hint derived from the already-loaded
  // data (no new field, no new API) — a transaction's input item name
  // matches an EARLIER transaction's output item. Inventory is pooled,
  // so this never proves the exact physical pieces came from that
  // earlier transaction — it only means the same item was produced
  // before this one consumed it.
  const chainPredecessor = (
    list: ProductionMaterialTransaction[],
    tx: ProductionMaterialTransaction,
  ) => {
    if (!tx.inputItemId) return null;
    const earlier = list
      .filter(
        (t) =>
          t.id !== tx.id &&
          t.outputItemId === tx.inputItemId &&
          new Date(t.eventTime).getTime() <= new Date(tx.eventTime).getTime(),
      )
      .sort(
        (a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime(),
      );
    return earlier[0] ?? null;
  };

  const itemName = (id?: string) =>
    (id && inventoryItems.find((i) => i.id === id)?.name) || "—";
  const stageName = (id?: string) =>
    (id && stages.find((s) => s.stageId === id)?.stageName) || null;
  const jobCardNo = (id?: string) =>
    (id && jobCards.find((jc) => jc.id === id)?.jobNo) || null;

  const openAdd = () => {
    setForm(emptyForm());
    setPrefillNote(null);
    setOpen(true);
  };

  const handleInputItemSelect = (itemId: string) => {
    const item = inventoryItems.find((i) => i.id === itemId);
    setForm((f) => ({
      ...f,
      inputItemId: itemId,
      inputUom: item?.unit ?? f.inputUom,
    }));
  };

  const handleOutputItemSelect = (itemId: string) => {
    const item = inventoryItems.find((i) => i.id === itemId);
    setForm((f) => ({
      ...f,
      outputItemId: itemId,
      outputUom: item?.unit ?? f.outputUom,
    }));
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!form.operation.trim()) {
      toast.error("Operation is required");
      return;
    }
    if (form.performerType === "vendor" && !form.vendorId) {
      toast.error("Vendor is required");
      return;
    }
    if (form.inputMode === "item") {
      if (!form.inputItemId) {
        toast.error("Input item is required (or switch to Vendor Supplied)");
        return;
      }
      const qty = Number(form.inputQty);
      if (!qty || qty <= 0) {
        toast.error("Enter a valid input quantity");
        return;
      }
      if (!form.inputUom.trim()) {
        toast.error("Input UOM is required");
        return;
      }
    }
    if (!form.outputItemId) {
      toast.error("Output item is required");
      return;
    }
    const outputQty = Number(form.outputQty);
    if (!outputQty || outputQty <= 0) {
      toast.error("Output quantity must be greater than 0");
      return;
    }
    if (!form.outputUom.trim()) {
      toast.error("Output UOM is required");
      return;
    }
    const rejectedQty = Number(form.rejectedQty) || 0;
    if (rejectedQty < 0) {
      toast.error("Rejected quantity cannot be negative");
      return;
    }

    setSaving(true);
    const result = await createProductionMaterialTransactionRemote({
      stageId: form.stageId || undefined,
      jobCardId: form.jobCardId || undefined,
      operation: form.operation.trim(),
      performerType: form.performerType,
      vendorId: form.performerType === "vendor" ? form.vendorId : undefined,
      vendorName: form.performerType === "vendor" ? form.vendorName : undefined,
      inputItemId: form.inputMode === "item" ? form.inputItemId : undefined,
      inputQty: form.inputMode === "item" ? Number(form.inputQty) : undefined,
      inputUom: form.inputMode === "item" ? form.inputUom.trim() : undefined,
      outputItemId: form.outputItemId,
      outputQty,
      outputUom: form.outputUom.trim(),
      rejectedQty,
      notes: form.notes.trim() || undefined,
      eventTime: form.eventTime
        ? new Date(form.eventTime).toISOString()
        : undefined,
    });
    setSaving(false);

    if (result.status !== "success" || !result.data) {
      // Surface the database's own message directly (e.g. "Not enough
      // stock") — never a generic "Something went wrong".
      toast.error(result.error ?? "Could not save production transaction");
      return;
    }

    // Route the optimistic insert to whichever bucket load() would have
    // put it in: scoped when its stageId belongs to this project's own
    // stages, ungrouped when it has none (same rule the real fetch
    // applies) — otherwise a freshly-created stageless transaction
    // would briefly appear to belong to this project until the next
    // reload silently moved it.
    if (result.data.stageId && stageIds.includes(result.data.stageId)) {
      setTransactions((prev) => [result.data!, ...(prev ?? [])]);
    } else if (!result.data.stageId) {
      setUngroupedTransactions((prev) => [result.data!, ...(prev ?? [])]);
    }
    toast.success(
      `Recorded: ${result.data.operation} — ${itemName(result.data.outputItemId)} +${result.data.outputQty}`,
    );
    setOpen(false);
    setForm(emptyForm());
    setPrefillNote(null);
  };

  // One transaction card, redesigned into clear Input / Operation /
  // Output / Quality / Context sections (same underlying data as
  // before — presentation only). `list` is whichever set (this
  // project's stage-scoped transactions, or the ungrouped set) the
  // chain-predecessor lookup should search within.
  const renderTransactionCard = (
    tx: ProductionMaterialTransaction,
    list: ProductionMaterialTransaction[],
    keyPrefix: string,
  ) => {
    const predecessor = chainPredecessor(list, tx);
    return (
      <div
        key={tx.id}
        className="rounded-md border p-3 text-xs space-y-2"
        data-ocid={`production.material_transactions.${projectId}.${keyPrefix}.${tx.id}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-1 text-[10px] text-muted-foreground">
          <span>{new Date(tx.eventTime).toLocaleString("en-IN")}</span>
          <div className="flex items-center gap-1 flex-wrap">
            {stageName(tx.stageId) && (
              <Badge variant="outline" className="text-[10px]">
                Stage: {stageName(tx.stageId)}
              </Badge>
            )}
            {jobCardNo(tx.jobCardId) && (
              <Badge variant="outline" className="text-[10px]">
                Job Card: {jobCardNo(tx.jobCardId)}
              </Badge>
            )}
          </div>
        </div>

        {predecessor && (
          <p className="text-[10px] text-muted-foreground italic">
            ↳ Same item as an earlier transaction's output (
            {new Date(predecessor.eventTime).toLocaleString("en-IN")},{" "}
            {predecessor.operation}) — inventory is pooled, this is not
            physical batch/lot traceability.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Input
            </p>
            {tx.inputItemId ? (
              <p className="font-medium">
                {itemName(tx.inputItemId)}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  {tx.inputQty} {tx.inputUom}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground italic">
                Vendor supplied — no tracked input
              </p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Operation
            </p>
            <p className="flex items-center gap-1.5 flex-wrap">
              <Badge className="bg-info/10 text-info text-[10px]">
                {tx.operation}
              </Badge>
              <span className="text-muted-foreground">
                {tx.performerType === "vendor"
                  ? tx.vendorName || "Vendor"
                  : "In-House"}
              </span>
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Output
            </p>
            <p className="font-medium text-success">
              {itemName(tx.outputItemId)}{" "}
              <span className="font-normal">
                +{tx.outputQty} {tx.outputUom}
              </span>
            </p>
          </div>
        </div>

        {tx.rejectedQty > 0 && (
          <p className="text-[10px] text-destructive">
            Quality — Rejected: {tx.rejectedQty}
          </p>
        )}

        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t">
          <span>By {tx.performedByName || "—"}</span>
          {tx.notes && <span className="italic">{tx.notes}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3" data-ocid={`production.material_transactions.${projectId}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Transaction History
        </p>
        {pEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={openAdd}
            data-ocid={`production.material_transactions.${projectId}.add`}
          >
            <Plus className="w-3.5 h-3.5" />
            Record Transaction
          </Button>
        )}
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground">Loading…</p>
      )}

      {!loading &&
        (transactions?.length ?? 0) === 0 &&
        (ungroupedTransactions?.length ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground">
            No production transactions recorded yet.
          </p>
        )}

      {(transactions?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {transactions!.map((tx) =>
            renderTransactionCard(tx, transactions!, "material_transactions"),
          )}
        </div>
      )}

      {(ungroupedTransactions?.length ?? 0) > 0 && (
        <div className="space-y-2 pt-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ungrouped Material Flow
            </p>
            <p className="text-[10px] text-muted-foreground">
              These transactions have no Production Stage association, so
              they cannot be attributed to this or any specific project —
              shown here for visibility only.
            </p>
          </div>
          {ungroupedTransactions!.map((tx) =>
            renderTransactionCard(tx, ungroupedTransactions!, "ungrouped"),
          )}
        </div>
      )}

      {/* Record Transaction Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Production Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {prefillNote && (
              <div
                className="rounded-md border border-info/30 bg-info/10 p-2 text-[10px] text-info"
                data-ocid="production.material_transactions.form.prefill_note"
              >
                {prefillNote}
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Stage (optional)</Label>
              <Select
                value={form.stageId || "__none__"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, stageId: v === "__none__" ? "" : v }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="No stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">
                    No stage
                  </SelectItem>
                  {stages
                    .filter((s) => s.stageId)
                    .map((s) => (
                      <SelectItem key={s.stageId} value={s.stageId!} className="text-xs">
                        {s.stageName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Operation *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. Cutting"
                value={form.operation}
                onChange={(e) =>
                  setForm((f) => ({ ...f, operation: e.target.value }))
                }
                data-ocid="production.material_transactions.form.operation"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Performer *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.performerType === "inhouse" ? "default" : "outline"}
                  className="h-8 text-xs flex-1"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      performerType: "inhouse",
                      vendorId: "",
                      vendorName: "",
                    }))
                  }
                  data-ocid="production.material_transactions.form.performer_inhouse"
                >
                  In-House
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.performerType === "vendor" ? "default" : "outline"}
                  className="h-8 text-xs flex-1"
                  onClick={() =>
                    setForm((f) => ({ ...f, performerType: "vendor" }))
                  }
                  data-ocid="production.material_transactions.form.performer_vendor"
                >
                  Vendor
                </Button>
              </div>
              {form.performerType === "vendor" && (
                <VendorSelect
                  value={form.vendorId}
                  onChange={(id, name) =>
                    setForm((f) => ({ ...f, vendorId: id, vendorName: name }))
                  }
                  className="h-8 text-xs mt-1"
                  data-ocid="production.material_transactions.form.vendor"
                />
              )}
            </div>

            <div className="space-y-1 rounded-md border p-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Input</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] px-2"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      inputMode: f.inputMode === "item" ? "vendor_supplied" : "item",
                      inputItemId: "",
                      inputQty: "",
                      inputUom: "",
                    }))
                  }
                  data-ocid="production.material_transactions.form.input_mode_toggle"
                >
                  {form.inputMode === "item"
                    ? "Switch to Vendor Supplied / No Tracked Input"
                    : "Switch to Tracked Input Item"}
                </Button>
              </div>
              {form.inputMode === "vendor_supplied" ? (
                <p className="text-[10px] text-muted-foreground italic">
                  Vendor Supplied — no input item, no stock decrease.
                </p>
              ) : (
                <>
                  <InventoryItemPicker
                    value={form.inputItemId}
                    onChange={handleInputItemSelect}
                    items={inventoryItems}
                    families={materialFamilies}
                    placeholder="Select input item"
                    className="h-8 text-xs"
                    data-ocid="production.material_transactions.form.input_item"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 text-xs"
                      placeholder="Qty"
                      value={form.inputQty}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, inputQty: e.target.value }))
                      }
                      data-ocid="production.material_transactions.form.input_qty"
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="UOM"
                      value={form.inputUom}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, inputUom: e.target.value }))
                      }
                      data-ocid="production.material_transactions.form.input_uom"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-1 rounded-md border p-2">
              <Label className="text-xs">Output *</Label>
              <InventoryItemPicker
                value={form.outputItemId}
                onChange={handleOutputItemSelect}
                items={inventoryItems}
                families={materialFamilies}
                placeholder="Select output item"
                className="h-8 text-xs"
                data-ocid="production.material_transactions.form.output_item"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-8 text-xs"
                  placeholder="Qty"
                  value={form.outputQty}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, outputQty: e.target.value }))
                  }
                  data-ocid="production.material_transactions.form.output_qty"
                />
                <Input
                  className="h-8 text-xs"
                  placeholder="UOM"
                  value={form.outputUom}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, outputUom: e.target.value }))
                  }
                  data-ocid="production.material_transactions.form.output_uom"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Rejected Quantity</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-8 text-xs"
                placeholder="0"
                value={form.rejectedQty}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rejectedQty: e.target.value }))
                }
                data-ocid="production.material_transactions.form.rejected_qty"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Job Card (optional, reference only)</Label>
              <JobCardSelect
                value={form.jobCardId}
                onChange={(id) => setForm((f) => ({ ...f, jobCardId: id }))}
                className="h-8 text-xs"
                data-ocid="production.material_transactions.form.job_card"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Event Time</Label>
              <Input
                type="datetime-local"
                className="h-8 text-xs"
                value={form.eventTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, eventTime: e.target.value }))
                }
                data-ocid="production.material_transactions.form.event_time"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={2}
                className="text-xs"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                data-ocid="production.material_transactions.form.notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saving}
              onClick={handleSubmit}
              data-ocid="production.material_transactions.form.submit"
            >
              {saving ? "Saving..." : "Record Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
