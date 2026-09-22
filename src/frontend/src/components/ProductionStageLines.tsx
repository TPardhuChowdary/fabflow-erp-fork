// Production Stage Lines UI — Multiple Outsourcing/Work Lines under one
// production stage (see chat design record). Reuses the existing
// production_stage_transactions architecture end to end: lines are
// fetched from the new production_stage_lines table, but every
// Send/Receive here goes through the store's existing addStageTransaction
// action (same Supabase write, same RLS, same append-only ledger),
// just tagging the transaction with lineId. Sent/Received/Pending per
// line are derived by filtering stage.transactions — never a second
// stored total.

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
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import {
  createProductionStageLineRemote,
  fetchProductionStageLines,
} from "@/lib/productionStageLinesApi";
import { useStore } from "@/store";
import type { ProductionStageLine, ProjectProductionStage } from "@/types";

type LineStatus =
  | "NotStarted"
  | "PartiallySent"
  | "Sent"
  | "PartiallyReceived"
  | "Completed";

const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  NotStarted: "Not Started",
  PartiallySent: "Partially Sent",
  Sent: "Sent",
  PartiallyReceived: "Partially Received",
  Completed: "Completed",
};

const LINE_STATUS_CLASS: Record<LineStatus, string> = {
  NotStarted: "bg-muted text-muted-foreground",
  PartiallySent: "bg-info/10 text-info",
  Sent: "bg-info/10 text-info",
  PartiallyReceived: "bg-warning/15 text-warning",
  Completed: "bg-success/10 text-success",
};

function computeLineStatus(
  planned: number,
  sent: number,
  received: number,
): LineStatus {
  if (received > 0 && received >= sent && sent >= planned) return "Completed";
  if (received > 0) return "PartiallyReceived";
  if (sent >= planned && planned > 0) return "Sent";
  if (sent > 0) return "PartiallySent";
  return "NotStarted";
}

interface Props {
  stage: ProjectProductionStage;
  projectId: string;
  stageIdx: number;
  pEdit: boolean;
}

export function ProductionStageLines({
  stage,
  projectId,
  stageIdx,
  pEdit,
}: Props) {
  const { addStageTransaction, vendors, inventoryItems } = useStore();
  const stageId = stage.stageId;

  const [lines, setLines] = useState<ProductionStageLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

  const load = async () => {
    if (!stageId) return;
    setLoading(true);
    const result = await fetchProductionStageLines(stageId);
    setLoading(false);
    if (result.status === "success" && result.data) {
      setLines(result.data);
    } else if (result.status !== "unauthenticated") {
      toast.error(result.error ?? "Could not load work lines");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId]);

  // Add Work Line dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    workType: "",
    material: "",
    vendorId: "",
    vendorName: "",
    plannedQty: "",
    uom: "pcs",
    notes: "",
  });
  const [addSaving, setAddSaving] = useState(false);

  const openAddDialog = () => {
    setAddForm({
      workType: "",
      material: "",
      vendorId: "",
      vendorName: "",
      plannedQty: "",
      uom: "pcs",
      notes: "",
    });
    setAddOpen(true);
  };

  const handleAddLine = async () => {
    if (!stageId) return;
    if (!addForm.workType.trim()) {
      toast.error("Work / Cutting Type is required");
      return;
    }
    const plannedQty = Number(addForm.plannedQty);
    if (!plannedQty || plannedQty <= 0) {
      toast.error("Planned Quantity must be greater than 0");
      return;
    }
    if (!addForm.uom.trim()) {
      toast.error("UOM is required");
      return;
    }
    setAddSaving(true);
    const result = await createProductionStageLineRemote(stageId, {
      workType: addForm.workType.trim(),
      material: addForm.material.trim() || undefined,
      vendorId: addForm.vendorId || undefined,
      vendorName: addForm.vendorName || undefined,
      plannedQty,
      uom: addForm.uom.trim(),
      notes: addForm.notes.trim() || undefined,
    });
    setAddSaving(false);
    if (result.status !== "success" || !result.data) {
      toast.error(result.error ?? "Could not create work line");
      return;
    }
    setLines((prev) => [...(prev ?? []), result.data!]);
    setAddOpen(false);
    toast.success(`Work line "${result.data.workType}" added`);
  };

  // Send / Receive dialogs, scoped to one line
  const [sendLine, setSendLine] = useState<ProductionStageLine | null>(null);
  const [sendForm, setSendForm] = useState({ quantity: "", remarks: "" });
  const [sending, setSending] = useState(false);

  const [receiveLine, setReceiveLine] = useState<ProductionStageLine | null>(
    null,
  );
  const [receiveForm, setReceiveForm] = useState({
    quantity: "",
    remarks: "",
  });
  const [receiving, setReceiving] = useState(false);

  const txForLine = (lineId: string) =>
    (stage.transactions || []).filter((t) => t.lineId === lineId);

  const handleSend = async () => {
    if (!sendLine) return;
    const qty = Number(sendForm.quantity);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid send quantity");
      return;
    }
    setSending(true);
    const ok = await addStageTransaction(projectId, stageIdx, {
      id: `tx-${Date.now()}`,
      type: "send",
      quantity: qty,
      dateTime: new Date().toISOString(),
      sentToVendorId: sendLine.vendorId,
      sentToVendorName: sendLine.vendorName,
      lineId: sendLine.id,
    });
    setSending(false);
    if (!ok) {
      toast.error("Could not record material sent - please try again");
      return;
    }
    toast.success(`Sent ${qty} ${sendLine.uom} - ${sendLine.workType}`);
    setSendLine(null);
    setSendForm({ quantity: "", remarks: "" });
  };

  const handleReceive = async () => {
    if (!receiveLine) return;
    const qty = Number(receiveForm.quantity);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid receive quantity");
      return;
    }
    const txs = txForLine(receiveLine.id);
    const totalSent = txs
      .filter((t) => t.type === "send")
      .reduce((a, t) => a + t.quantity, 0);
    const totalReceived = txs
      .filter((t) => t.type === "receive")
      .reduce((a, t) => a + t.quantity, 0);
    if (totalReceived + qty > totalSent) {
      toast.error("Cannot receive more than sent for this line");
      return;
    }
    setReceiving(true);
    const ok = await addStageTransaction(projectId, stageIdx, {
      id: `tx-${Date.now()}`,
      type: "receive",
      quantity: qty,
      dateTime: new Date().toISOString(),
      lineId: receiveLine.id,
    });
    setReceiving(false);
    if (!ok) {
      toast.error("Could not record material received - please try again");
      return;
    }
    toast.success(`Received ${qty} ${receiveLine.uom} - ${receiveLine.workType}`);
    setReceiveLine(null);
    setReceiveForm({ quantity: "", remarks: "" });
  };

  if (!stageId) return null;

  // Parent-stage aggregate across every line (§8) — computed here, never
  // written back to the legacy stage-wide sent_qty/received_qty columns.
  const aggregate = (lines ?? []).reduce(
    (acc, line) => {
      const txs = txForLine(line.id);
      const sent = txs
        .filter((t) => t.type === "send")
        .reduce((a, t) => a + t.quantity, 0);
      const received = txs
        .filter((t) => t.type === "receive")
        .reduce((a, t) => a + t.quantity, 0);
      acc.planned += line.plannedQty;
      acc.sent += sent;
      acc.received += received;
      if (line.vendorId) acc.vendorIds.add(line.vendorId);
      return acc;
    },
    { planned: 0, sent: 0, received: 0, vendorIds: new Set<string>() },
  );

  return (
    <div className="space-y-3" data-ocid={`production.lines.${stageId}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Work Lines
        </p>
        {pEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={openAddDialog}
            data-ocid={`production.lines.${stageId}.add`}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Work Line
          </Button>
        )}
      </div>

      {(lines?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-muted/30 rounded-md p-2 text-center">
          <div>
            <div className="text-[10px] text-muted-foreground">
              {lines!.length} Work Line{lines!.length === 1 ? "" : "s"} /{" "}
              {aggregate.vendorIds.size} Vendor
              {aggregate.vendorIds.size === 1 ? "" : "s"}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Planned</div>
            <div className="text-sm font-bold">{aggregate.planned}</div>
          </div>
          <div>
            <div className="text-[10px] text-info">Sent</div>
            <div className="text-sm font-bold text-info">{aggregate.sent}</div>
          </div>
          <div>
            <div className="text-[10px] text-success">Received</div>
            <div className="text-sm font-bold text-success">
              {aggregate.received}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <p className="text-xs text-muted-foreground">Loading work lines…</p>
      )}

      {!loading && lines && lines.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No work lines yet. Add one to split this stage across multiple
          vendors/materials.
        </p>
      )}

      <div className="space-y-2">
        {(lines ?? []).map((line) => {
          const txs = txForLine(line.id);
          const sent = txs
            .filter((t) => t.type === "send")
            .reduce((a, t) => a + t.quantity, 0);
          const received = txs
            .filter((t) => t.type === "receive")
            .reduce((a, t) => a + t.quantity, 0);
          const pending = sent - received;
          const status = computeLineStatus(line.plannedQty, sent, received);
          const isHistoryOpen = expandedLineId === line.id;

          return (
            <div
              key={line.id}
              className="rounded-md border p-2.5 space-y-2"
              data-ocid={`production.lines.${stageId}.line.${line.id}`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-semibold">{line.workType}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {line.material ? `${line.material} · ` : ""}
                    {line.vendorName || "In-house"}
                  </p>
                </div>
                <Badge className={`text-[10px] ${LINE_STATUS_CLASS[status]}`}>
                  {LINE_STATUS_LABELS[status]}
                </Badge>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-muted-foreground">
                    Planned
                  </div>
                  <div className="text-sm font-bold">
                    {line.plannedQty} {line.uom}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-info">Sent</div>
                  <div className="text-sm font-bold text-info">{sent}</div>
                </div>
                <div>
                  <div className="text-[10px] text-success">Received</div>
                  <div className="text-sm font-bold text-success">
                    {received}
                  </div>
                </div>
                <div>
                  <div
                    className={`text-[10px] ${pending > 0 ? "text-warning" : "text-muted-foreground"}`}
                  >
                    Pending
                  </div>
                  <div
                    className={`text-sm font-bold ${pending > 0 ? "text-warning" : "text-muted-foreground"}`}
                  >
                    {pending}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {pEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      setSendLine(line);
                      setSendForm({ quantity: "", remarks: "" });
                    }}
                    data-ocid={`production.lines.${stageId}.line.${line.id}.send`}
                  >
                    Send Material
                  </Button>
                )}
                {pEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={pending <= 0}
                    onClick={() => {
                      setReceiveLine(line);
                      setReceiveForm({ quantity: "", remarks: "" });
                    }}
                    data-ocid={`production.lines.${stageId}.line.${line.id}.receive`}
                  >
                    Receive Material
                  </Button>
                )}
                {txs.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 ml-auto"
                    onClick={() =>
                      setExpandedLineId(isHistoryOpen ? null : line.id)
                    }
                    data-ocid={`production.lines.${stageId}.line.${line.id}.history`}
                  >
                    History
                    {isHistoryOpen ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </Button>
                )}
              </div>

              {isHistoryOpen && (
                <div className="border-t pt-2 space-y-1">
                  {[...txs]
                    .sort(
                      (a, b) =>
                        new Date(a.dateTime).getTime() -
                        new Date(b.dateTime).getTime(),
                    )
                    .map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            tx.type === "send"
                              ? "bg-info/10 text-info"
                              : "bg-success/10 text-success"
                          }`}
                        >
                          {tx.type === "send" ? "SENT" : "RECEIVED"}
                        </span>
                        <span className="font-mono">
                          {tx.quantity} {line.uom}
                        </span>
                        <span className="text-muted-foreground">
                          {tx.dateTime
                            ? new Date(tx.dateTime).toLocaleDateString(
                                "en-IN",
                                { day: "2-digit", month: "short", year: "numeric" },
                              )
                            : "—"}
                        </span>
                        <span className="text-muted-foreground">
                          {tx.type === "send"
                            ? tx.sentToVendorName || "In-house"
                            : "—"}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Work Line Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Work Line</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Work / Cutting Type *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. Side Panel"
                value={addForm.workType}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, workType: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Material</Label>
              <Select
                value={addForm.material || "__none__"}
                onValueChange={(v) =>
                  setAddForm((f) => ({
                    ...f,
                    material: v === "__none__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select material (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">
                    None
                  </SelectItem>
                  {(inventoryItems || []).map((item) => (
                    <SelectItem key={item.id} value={item.name} className="text-xs">
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendor</Label>
              <Select
                value={addForm.vendorId || "inhouse"}
                onValueChange={(v) => {
                  if (v === "inhouse") {
                    setAddForm((f) => ({
                      ...f,
                      vendorId: "",
                      vendorName: "In-house",
                    }));
                    return;
                  }
                  const vendor = vendors.find((x) => x.id === v);
                  setAddForm((f) => ({
                    ...f,
                    vendorId: v,
                    vendorName: vendor?.name ?? "",
                  }));
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inhouse" className="text-xs">
                    In-house
                  </SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Planned Quantity *</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  min={1}
                  placeholder="0"
                  value={addForm.plannedQty}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, plannedQty: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">UOM *</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="pcs"
                  value={addForm.uom}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, uom: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={2}
                className="text-xs"
                value={addForm.notes}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={addSaving} onClick={handleAddLine}>
              Add Line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Material Dialog (per line) */}
      <Dialog open={!!sendLine} onOpenChange={(open) => !open && setSendLine(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Material</DialogTitle>
          </DialogHeader>
          {sendLine && (
            <div className="space-y-3 py-2 text-xs">
              <div className="rounded-md border bg-muted/30 p-2.5 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stage</span>
                  <span className="font-medium">{stage.stageName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Work</span>
                  <span className="font-medium">{sendLine.workType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vendor</span>
                  <span className="font-medium">
                    {sendLine.vendorName || "In-house"}
                  </span>
                </div>
                {sendLine.material && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Material</span>
                    <span className="font-medium">{sendLine.material}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Planned</span>
                  <span className="font-medium">
                    {sendLine.plannedQty} {sendLine.uom}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already Sent</span>
                  <span className="font-medium">
                    {txForLine(sendLine.id)
                      .filter((t) => t.type === "send")
                      .reduce((a, t) => a + t.quantity, 0)}{" "}
                    {sendLine.uom}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Remaining to Send
                  </span>
                  <span className="font-medium">
                    {Math.max(
                      sendLine.plannedQty -
                        txForLine(sendLine.id)
                          .filter((t) => t.type === "send")
                          .reduce((a, t) => a + t.quantity, 0),
                      0,
                    )}{" "}
                    {sendLine.uom}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Send Quantity</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  min={1}
                  placeholder="0"
                  value={sendForm.quantity}
                  onChange={(e) =>
                    setSendForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">UOM</Label>
                <Input className="h-8 text-xs" value={sendLine.uom} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Remarks</Label>
                <Textarea
                  rows={2}
                  className="text-xs"
                  value={sendForm.remarks}
                  onChange={(e) =>
                    setSendForm((f) => ({ ...f, remarks: e.target.value }))
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSendLine(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={sending} onClick={handleSend}>
              Send Material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive Material Dialog (per line) */}
      <Dialog
        open={!!receiveLine}
        onOpenChange={(open) => !open && setReceiveLine(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Receive Material</DialogTitle>
          </DialogHeader>
          {receiveLine &&
            (() => {
              const txs = txForLine(receiveLine.id);
              const sent = txs
                .filter((t) => t.type === "send")
                .reduce((a, t) => a + t.quantity, 0);
              const received = txs
                .filter((t) => t.type === "receive")
                .reduce((a, t) => a + t.quantity, 0);
              return (
                <div className="space-y-3 py-2 text-xs">
                  <div className="rounded-md border bg-muted/30 p-2.5 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stage</span>
                      <span className="font-medium">{stage.stageName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Work</span>
                      <span className="font-medium">{receiveLine.workType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vendor</span>
                      <span className="font-medium">
                        {receiveLine.vendorName || "In-house"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sent</span>
                      <span className="font-medium">
                        {sent} {receiveLine.uom}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Received</span>
                      <span className="font-medium">
                        {received} {receiveLine.uom}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pending</span>
                      <span className="font-medium">
                        {sent - received} {receiveLine.uom}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Receive Quantity</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      min={1}
                      placeholder="0"
                      value={receiveForm.quantity}
                      onChange={(e) =>
                        setReceiveForm((f) => ({
                          ...f,
                          quantity: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">UOM</Label>
                    <Input
                      className="h-8 text-xs"
                      value={receiveLine.uom}
                      disabled
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Remarks</Label>
                    <Textarea
                      rows={2}
                      className="text-xs"
                      value={receiveForm.remarks}
                      onChange={(e) =>
                        setReceiveForm((f) => ({
                          ...f,
                          remarks: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              );
            })()}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReceiveLine(null)}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={receiving} onClick={handleReceive}>
              Receive Material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
