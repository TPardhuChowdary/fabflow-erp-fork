// Phase 3 — Document Conversion UI. Three small, self-contained dialogs
// wired directly to the Phase 2 RPCs via documentConversionApi.ts. Never
// call Supabase table writes directly here — every submit goes through
// exactly one RPC call, matching Phase 2's atomicity guarantee. Remaining
// quantities are always fetched live (getQuotationRemainingRemote/
// getDcRemainingRemote) when a dialog opens — never read from a cached
// store field, never computed client-side as authoritative, since the
// Zustand store doesn't even hydrate the lineage tables (Phase 1/2 never
// touched hydration.ts/store.ts — deliberately out of scope for those
// phases). The RPC's own trigger is still the real enforcement point;
// this is only for showing the user an honest number before they submit.
//
// Kept deliberately smaller than the full Quotations/DeliveryChallans/
// Invoices create forms — a conversion is a narrower action (source
// quantity + the few fields that genuinely differ per conversion), not a
// re-implementation of those forms. Standalone document creation on
// those three pages is completely untouched by this file.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  convertDcToInvoiceRemote,
  convertQuotationToDcRemote,
  convertQuotationToInvoiceRemote,
  getDcRemainingRemote,
  getQuotationRemainingRemote,
} from "@/lib/documentConversionApi";
import type { ConversionErrorCategory } from "@/lib/documentConversionApi";
import type { DeliveryChallan, InvLineItem, Invoice, Quotation } from "@/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const CATEGORY_MESSAGE: Record<ConversionErrorCategory, string> = {
  permission_denied: "You don't have permission to do this.",
  not_found: "The source document could not be found.",
  insufficient_quantity: "", // the RPC's own message is already clear/specific for this one
  invalid_quantity: "Enter a valid, positive quantity.",
  invalid_input: "", // ditto — already specific (e.g. duplicate DC)
  duplicate_conversion:
    "Could not generate a unique document number. Please try again.",
  unexpected: "Something went wrong. Please try again.",
};

function friendlyError(
  error?: string,
  category?: ConversionErrorCategory,
): string {
  if (category && CATEGORY_MESSAGE[category]) return CATEGORY_MESSAGE[category];
  return error || "Something went wrong. Please try again.";
}

// ── Remaining-quantity summary line, shared by all three dialogs ──────
function RemainingSummary({
  loading,
  total,
  consumed,
  remaining,
}: {
  loading: boolean;
  total: number | null;
  consumed: number | null;
  remaining: number | null;
}) {
  if (loading) {
    return (
      <p className="text-xs text-muted-foreground">
        Loading remaining quantity…
      </p>
    );
  }
  if (total === null) return null;
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm flex justify-between">
      <span>
        Total: <strong>{total}</strong>
      </span>
      <span>
        Already consumed: <strong>{consumed}</strong>
      </span>
      <span>
        Remaining: <strong>{remaining}</strong>
      </span>
    </div>
  );
}

// A minimal line-item editor shared by both invoice-creating dialogs —
// same InvLineItem shape the real Invoices.tsx form already uses, just a
// smaller surface (desc/hsn/qty/rate only, no per-item project link).
function LineItemsEditor({
  items,
  onChange,
}: {
  items: Pick<InvLineItem, "desc" | "hsn" | "qty" | "rate">[];
  onChange: (
    items: Pick<InvLineItem, "desc" | "hsn" | "qty" | "rate">[],
  ) => void;
}) {
  const update = (i: number, patch: Partial<InvLineItem>) => {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  return (
    <div className="space-y-2">
      <Label>Line Items</Label>
      {items.map((item, i) => (
        <div
          key={`${i}-${item.desc}`}
          className="grid grid-cols-12 gap-1 items-center"
        >
          <Input
            className="col-span-5 h-8 text-xs"
            placeholder="Description"
            value={item.desc}
            onChange={(e) => update(i, { desc: e.target.value })}
          />
          <Input
            className="col-span-2 h-8 text-xs"
            placeholder="HSN"
            value={item.hsn}
            onChange={(e) => update(i, { hsn: e.target.value })}
          />
          <Input
            className="col-span-2 h-8 text-xs"
            type="number"
            placeholder="Qty"
            value={item.qty}
            onChange={(e) => update(i, { qty: Number(e.target.value) })}
          />
          <Input
            className="col-span-2 h-8 text-xs"
            type="number"
            placeholder="Rate"
            value={item.rate}
            onChange={(e) => update(i, { rate: Number(e.target.value) })}
          />
          <Button
            variant="ghost"
            size="sm"
            className="col-span-1 h-8 px-1 text-destructive"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            disabled={items.length <= 1}
          >
            ✕
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...items, { desc: "", hsn: "", qty: 1, rate: 0 }])
        }
      >
        + Add Row
      </Button>
    </div>
  );
}

// ── Quotation → Delivery Challan ───────────────────────────────────────
export function QuotationToDcDialog({
  quotation,
  open,
  onClose,
  onCreated,
}: {
  quotation: Quotation | null;
  open: boolean;
  onClose: () => void;
  onCreated: (dc: DeliveryChallan) => void;
}) {
  const [loadingRemaining, setLoadingRemaining] = useState(false);
  const [remaining, setRemaining] = useState<{
    total: number;
    consumed: number;
    remaining: number;
  } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [dispatchDate, setDispatchDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [vehicleNo, setVehicleNo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !quotation) return;
    setQuantity("");
    setReceiverName("");
    setVehicleNo("");
    setRemaining(null);
    setLoadingRemaining(true);
    getQuotationRemainingRemote(quotation.id).then((res) => {
      setLoadingRemaining(false);
      if (res.status === "success" && res.data) setRemaining(res.data);
      else toast.error(friendlyError(res.error, res.errorCategory));
    });
  }, [open, quotation]);

  if (!quotation) return null;

  const qty = Number(quantity);
  const qtyValid = quantity !== "" && qty > 0;

  const handleSubmit = async () => {
    if (!qtyValid) {
      toast.error("Enter a valid, positive quantity.");
      return;
    }
    setSubmitting(true);
    const res = await convertQuotationToDcRemote({
      quotationId: quotation.id,
      quantity: qty,
      receiverName,
      dispatchDate,
      vehicleNo: vehicleNo || undefined,
    });
    setSubmitting(false);
    if (res.status !== "success" || !res.data) {
      toast.error(friendlyError(res.error, res.errorCategory));
      return;
    }
    toast.success(`Delivery Challan ${res.data.dcNo} created`);
    onCreated(res.data);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Create Delivery Challan from {quotation.qtNo}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <RemainingSummary
            loading={loadingRemaining}
            total={remaining?.total ?? null}
            consumed={remaining?.consumed ?? null}
            remaining={remaining?.remaining ?? null}
          />
          <div>
            <Label>Quantity to Dispatch</Label>
            <Input
              type="number"
              min={0}
              max={remaining?.remaining}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {remaining !== null && qtyValid && qty > remaining.remaining && (
              <p className="text-xs text-destructive mt-1">
                Exceeds remaining quantity ({remaining.remaining}). The server
                will reject this — reduce the quantity.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Dispatch Date</Label>
              <Input
                type="date"
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Receiver Name</Label>
              <Input
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Vehicle No. (optional)</Label>
            <Input
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !qtyValid}>
            {submitting ? "Creating…" : "Create Delivery Challan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Quotation → direct Invoice ─────────────────────────────────────────
export function QuotationToInvoiceDialog({
  quotation,
  open,
  onClose,
  onCreated,
}: {
  quotation: Quotation | null;
  open: boolean;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}) {
  const [loadingRemaining, setLoadingRemaining] = useState(false);
  const [remaining, setRemaining] = useState<{
    total: number;
    consumed: number;
    remaining: number;
  } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [lineItems, setLineItems] = useState<
    Pick<InvLineItem, "desc" | "hsn" | "qty" | "rate">[]
  >([{ desc: "", hsn: "", qty: 1, rate: 0 }]);
  const [paymentTerms, setPaymentTerms] = useState("30 days");
  const [invoiceType, setInvoiceType] = useState<"tax" | "proforma">("tax");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !quotation) return;
    setQuantity("");
    setTermsAndConditions("");
    setRemaining(null);
    // Same "starting point, not a mandatory copy" behavior as the
    // existing Quotation→Invoice auto-fill in Invoices.tsx — seeded once
    // from the quotation's own line items, freely editable afterward.
    setLineItems(
      (quotation.lineItems || []).length > 0
        ? quotation.lineItems.map((li) => ({
            desc: li.desc,
            hsn: li.hsn || "",
            qty: li.qty,
            rate: li.unitPrice,
          }))
        : [{ desc: "", hsn: "", qty: 1, rate: 0 }],
    );
    setLoadingRemaining(true);
    getQuotationRemainingRemote(quotation.id).then((res) => {
      setLoadingRemaining(false);
      if (res.status === "success" && res.data) setRemaining(res.data);
      else toast.error(friendlyError(res.error, res.errorCategory));
    });
  }, [open, quotation]);

  if (!quotation) return null;

  const qty = Number(quantity);
  const qtyValid = quantity !== "" && qty > 0;
  const itemsValid = lineItems.every((li) => li.desc.trim() && li.qty > 0);

  const handleSubmit = async () => {
    if (!qtyValid) {
      toast.error("Enter a valid, positive quantity.");
      return;
    }
    if (!itemsValid) {
      toast.error(
        "Every line item needs a description and a positive quantity.",
      );
      return;
    }
    setSubmitting(true);
    const res = await convertQuotationToInvoiceRemote({
      quotationId: quotation.id,
      quantity: qty,
      lineItems,
      cgstRate: quotation.cgstRate,
      sgstRate: quotation.sgstRate,
      igstRate: quotation.igstRate,
      paymentTerms,
      invoiceType,
      termsAndConditions: termsAndConditions || undefined,
    });
    setSubmitting(false);
    if (res.status !== "success" || !res.data) {
      toast.error(friendlyError(res.error, res.errorCategory));
      return;
    }
    toast.success(`Invoice ${res.data.invNo} created`);
    onCreated(res.data);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Invoice from {quotation.qtNo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <RemainingSummary
            loading={loadingRemaining}
            total={remaining?.total ?? null}
            consumed={remaining?.consumed ?? null}
            remaining={remaining?.remaining ?? null}
          />
          <div>
            <Label>Quantity Being Invoiced</Label>
            <Input
              type="number"
              min={0}
              max={remaining?.remaining}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {remaining !== null && qtyValid && qty > remaining.remaining && (
              <p className="text-xs text-destructive mt-1">
                Exceeds remaining quantity ({remaining.remaining}). The server
                will reject this — reduce the quantity.
              </p>
            )}
          </div>
          <LineItemsEditor items={lineItems} onChange={setLineItems} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Payment Terms</Label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </div>
            <div>
              <Label>Invoice Type</Label>
              <Select
                value={invoiceType}
                onValueChange={(v) => setInvoiceType(v as "tax" | "proforma")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tax">Tax Invoice</SelectItem>
                  <SelectItem value="proforma">Proforma Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Terms & Conditions</Label>
            <Textarea
              rows={2}
              placeholder="Leave blank to use the company default"
              value={termsAndConditions}
              onChange={(e) => setTermsAndConditions(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !qtyValid || !itemsValid}
          >
            {submitting ? "Creating…" : "Create Invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Delivery Challan(s) → Invoice ──────────────────────────────────────
// Handles both the single-DC entry point (row action on one DC) and a
// modest multi-DC extension (checking additional eligible DCs from the
// same customer) — a self-contained checklist + per-row quantity input,
// not a redesign of the existing single-select DC field on the main
// Invoices.tsx form, which is untouched.
export function DcToInvoiceDialog({
  primaryDc,
  otherEligibleDcs,
  open,
  onClose,
  onCreated,
}: {
  primaryDc: DeliveryChallan | null;
  otherEligibleDcs: DeliveryChallan[];
  open: boolean;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [remainingById, setRemainingById] = useState<
    Record<string, { total: number; consumed: number; remaining: number }>
  >({});
  const [loadingRemaining, setLoadingRemaining] = useState(false);
  const [lineItems, setLineItems] = useState<
    Pick<InvLineItem, "desc" | "hsn" | "qty" | "rate">[]
  >([{ desc: "", hsn: "", qty: 1, rate: 0 }]);
  const [paymentTerms, setPaymentTerms] = useState("30 days");
  const [invoiceType, setInvoiceType] = useState<"tax" | "proforma">("tax");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !primaryDc) return;
    setSelectedIds([primaryDc.id]);
    setQuantities({});
    setRemainingById({});
    setLineItems([{ desc: "", hsn: "", qty: 1, rate: 0 }]);
    setTermsAndConditions("");
  }, [open, primaryDc]);

  useEffect(() => {
    if (!open || selectedIds.length === 0) return;
    setLoadingRemaining(true);
    Promise.all(selectedIds.map((id) => getDcRemainingRemote(id))).then(
      (results) => {
        setLoadingRemaining(false);
        const next: typeof remainingById = {};
        results.forEach((res, i) => {
          if (res.status === "success" && res.data)
            next[selectedIds[i]] = res.data;
          else toast.error(friendlyError(res.error, res.errorCategory));
        });
        setRemainingById(next);
      },
    );
  }, [open, selectedIds]);

  if (!primaryDc) return null;

  const toggleDc = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const allocations = selectedIds
    .map((id) => ({
      deliveryChallanId: id,
      quantity: Number(quantities[id] || 0),
    }))
    .filter((a) => a.quantity > 0);

  const allocationsValid =
    allocations.length === selectedIds.length &&
    allocations.every((a) => {
      const r = remainingById[a.deliveryChallanId];
      return r && a.quantity <= r.remaining;
    });
  const itemsValid = lineItems.every((li) => li.desc.trim() && li.qty > 0);

  const handleSubmit = async () => {
    if (!allocationsValid) {
      toast.error(
        "Enter a valid quantity (within the remaining amount) for every selected DC.",
      );
      return;
    }
    if (!itemsValid) {
      toast.error(
        "Every line item needs a description and a positive quantity.",
      );
      return;
    }
    setSubmitting(true);
    const res = await convertDcToInvoiceRemote({
      dcs: allocations,
      lineItems,
      paymentTerms,
      invoiceType,
      termsAndConditions: termsAndConditions || undefined,
    });
    setSubmitting(false);
    if (res.status !== "success" || !res.data) {
      toast.error(friendlyError(res.error, res.errorCategory));
      return;
    }
    toast.success(`Invoice ${res.data.invNo} created`);
    onCreated(res.data);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Invoice from {primaryDc.dcNo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {otherEligibleDcs.length > 0 && (
            <div>
              <Label>Also include (same customer)</Label>
              <div className="space-y-1 mt-1">
                {otherEligibleDcs.map((dc) => (
                  <label
                    key={dc.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(dc.id)}
                      onChange={() => toggleDc(dc.id)}
                    />
                    {dc.dcNo}
                  </label>
                ))}
              </div>
            </div>
          )}
          {loadingRemaining && (
            <p className="text-xs text-muted-foreground">
              Loading remaining quantities…
            </p>
          )}
          {selectedIds.map((id) => {
            const dc =
              id === primaryDc.id
                ? primaryDc
                : otherEligibleDcs.find((d) => d.id === id);
            const r = remainingById[id];
            const q = Number(quantities[id] || 0);
            return (
              <div key={id} className="rounded-md border p-2 space-y-1">
                <div className="flex justify-between text-sm font-medium">
                  <span>{dc?.dcNo ?? id}</span>
                  {r && (
                    <span className="text-muted-foreground">
                      Remaining: {r.remaining}
                    </span>
                  )}
                </div>
                <Input
                  type="number"
                  min={0}
                  max={r?.remaining}
                  placeholder="Quantity to invoice"
                  value={quantities[id] || ""}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [id]: e.target.value }))
                  }
                />
                {r && q > r.remaining && (
                  <p className="text-xs text-destructive">
                    Exceeds remaining quantity ({r.remaining}).
                  </p>
                )}
              </div>
            );
          })}
          <LineItemsEditor items={lineItems} onChange={setLineItems} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Payment Terms</Label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </div>
            <div>
              <Label>Invoice Type</Label>
              <Select
                value={invoiceType}
                onValueChange={(v) => setInvoiceType(v as "tax" | "proforma")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tax">Tax Invoice</SelectItem>
                  <SelectItem value="proforma">Proforma Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Terms & Conditions</Label>
            <Textarea
              rows={2}
              placeholder="Leave blank to use the company default"
              value={termsAndConditions}
              onChange={(e) => setTermsAndConditions(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !allocationsValid || !itemsValid}
          >
            {submitting ? "Creating…" : "Create Invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
