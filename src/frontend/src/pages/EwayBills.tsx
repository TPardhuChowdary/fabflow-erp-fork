// Central E-Way Bills repository (see chat) — a read/index view over the
// existing per-invoice E-Way Bill attachment. Deliberately NOT a second
// storage system: this page never reads or writes anything except the
// same `invoices.eway_bill_document` field (via the already-hydrated
// `invoices`/`customers` store collections) that EwayBillIndicator.tsx
// has always used. Opening a document reuses the exact same
// openAttachmentPreview helper; "View Invoice" reuses the exact same
// Invoices page + InvoicePrintView dialog — no second preview/viewer is
// created here.
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { openAttachmentPreview } from "@/lib/utils";
import {
  ExternalLink,
  FileWarning,
  Paperclip,
  Search,
  ShieldOff,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import { EWAY_BILL_THRESHOLD } from "../components/EwayBillIndicator";
import { canView } from "../permissions";
import { useStore } from "../store";
import type { Invoice } from "../types";

type FilterMode = "attached" | "missing";

interface EwayBillsProps {
  /** Same "navigate to a specific record on another page" pattern as
   * App.tsx's existing selectedCustomerId/selectedProjectId props — lets
   * "View Invoice" hand off to the real Invoices page instead of this
   * page building its own invoice viewer. */
  onViewInvoice: (invoiceId: string) => void;
}

export function EwayBills({ onViewInvoice }: EwayBillsProps) {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "invoices");
  const { invoices, customers } = useStore();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<FilterMode>("attached");

  const customerName = (customerId: string) =>
    customers.find((c) => c.id === customerId)?.name || "—";

  const rows = useMemo(() => {
    const list = (invoices || []).filter((inv) =>
      mode === "attached"
        ? !!inv.ewayBillDocument
        : !inv.ewayBillDocument && inv.totalAmount > EWAY_BILL_THRESHOLD,
    );
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter((inv) => {
          const custName =
            customers.find((c) => c.id === inv.customerId)?.name || "";
          return (
            inv.invNo?.toLowerCase().includes(q) ||
            custName.toLowerCase().includes(q)
          );
        })
      : list;
    return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
  }, [invoices, customers, mode, search]);

  if (!pView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mt-1">
            You do not have permission to view this module.
          </p>
        </div>
      </div>
    );
  }

  const fmt = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-4" data-ocid="eway-bills.page">
      <div>
        <h1 className="text-xl font-bold">E-Way Bills</h1>
        <p className="text-sm text-muted-foreground">
          Every E-Way Bill already attached to an invoice, in one place.
          Documents live on the invoice itself — this page only indexes them.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="inline-flex rounded-md border p-0.5 bg-muted/40 w-fit">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm rounded-sm transition-colors ${
              mode === "attached"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground"
            }`}
            onClick={() => setMode("attached")}
            data-ocid="eway-bills.tab.attached"
          >
            Attached
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm rounded-sm transition-colors ${
              mode === "missing"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground"
            }`}
            onClick={() => setMode("missing")}
            data-ocid="eway-bills.tab.missing"
          >
            Missing (&gt; ₹{EWAY_BILL_THRESHOLD.toLocaleString("en-IN")})
          </button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            data-ocid="eway-bills.search_input"
            className="pl-8 h-8 text-sm"
            placeholder="Search by invoice no. or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-2 border rounded-lg bg-muted/20">
          {mode === "attached" ? (
            <Paperclip className="w-8 h-8 text-muted-foreground" />
          ) : (
            <FileWarning className="w-8 h-8 text-muted-foreground" />
          )}
          <p className="text-sm text-muted-foreground">
            {mode === "attached"
              ? "No E-Way Bills attached yet."
              : "No invoices above the threshold are missing an E-Way Bill."}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* Mobile card layout (< md) */}
          <div
            className="md:hidden space-y-3"
            data-ocid="eway-bills.list.cards"
          >
            {rows.map((inv) => (
              <EwayBillCard
                key={inv.id}
                invoice={inv}
                customerLabel={customerName(inv.customerId)}
                fmt={fmt}
                onViewInvoice={onViewInvoice}
              />
            ))}
          </div>

          {/* Desktop table (>= md) */}
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <Table data-ocid="eway-bills.list.table">
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>E-Way Bill</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => {
                  const doc = inv.ewayBillDocument;
                  return (
                    <TableRow key={inv.id} data-ocid="eway-bills.list.row">
                      <TableCell className="font-medium">{inv.invNo}</TableCell>
                      <TableCell>{customerName(inv.customerId)}</TableCell>
                      <TableCell>{inv.invoiceDate || "—"}</TableCell>
                      <TableCell className="text-right">
                        {fmt(inv.totalAmount)}
                      </TableCell>
                      <TableCell>
                        {doc ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            onClick={() => openAttachmentPreview(doc.ref)}
                            data-ocid="eway-bills.open_button"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            {doc.name || "Open"}
                          </button>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-amber-600 border-amber-300"
                          >
                            Missing
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                          onClick={() => onViewInvoice(inv.id)}
                          data-ocid="eway-bills.view_invoice_button"
                        >
                          View Invoice <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function EwayBillCard({
  invoice,
  customerLabel,
  fmt,
  onViewInvoice,
}: {
  invoice: Invoice;
  customerLabel: string;
  fmt: (n: number) => string;
  onViewInvoice: (invoiceId: string) => void;
}) {
  const ewayBillDoc = invoice.ewayBillDocument;
  return (
    <div
      className="rounded-lg border bg-card p-4 shadow-sm space-y-2"
      data-ocid="eway-bills.list.item"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{invoice.invNo}</div>
          <div className="text-sm text-muted-foreground">{customerLabel}</div>
        </div>
        <div className="text-sm font-medium">{fmt(invoice.totalAmount)}</div>
      </div>
      <div className="text-xs text-muted-foreground">
        {invoice.invoiceDate || "—"}
      </div>
      <div className="flex items-center justify-between pt-1">
        {ewayBillDoc ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            onClick={() => openAttachmentPreview(ewayBillDoc.ref)}
            data-ocid="eway-bills.open_button"
          >
            <Paperclip className="w-3.5 h-3.5" />
            {ewayBillDoc.name || "Open"}
          </button>
        ) : (
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            Missing
          </Badge>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => onViewInvoice(invoice.id)}
          data-ocid="eway-bills.view_invoice_button"
        >
          View Invoice <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
