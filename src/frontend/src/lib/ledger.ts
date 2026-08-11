/**
 * Ledger aggregation engine — a pure, read-only layer over existing store
 * data (Invoices, Payments, Payables, PayablePayments, Quotations,
 * CompanyPOs). It creates no new transaction records: every LedgerEntry is
 * derived on the fly from a record that already lives in one of the
 * existing modules. Nothing here mutates the store.
 */
import type {
  CompanyPO,
  Invoice,
  Payable,
  PayablePayment,
  Payment,
  Quotation,
} from "../types";

export type LedgerDocType =
  | "Quotation"
  | "Invoice"
  | "Payment"
  | "Credit Note"
  | "Debit Note"
  | "Adjustment"
  | "Payable"
  | "Vendor Payment"
  | "Purchase Order";

export interface LedgerEntry {
  /** Stable key for React lists — `${docType}-${sourceId}`. */
  key: string;
  date: string; // yyyy-mm-dd
  timestamp: number; // tie-breaker for same-day chronological order
  docType: LedgerDocType;
  docNo: string;
  description: string;
  debit: number;
  credit: number;
  /** Quotations and (unlinked) Purchase Orders are shown for context but
   * never counted in debit/credit totals or the running balance. */
  informational: boolean;
  /** Reference amount to display for informational rows (debit/credit are
   * always 0 on those rows). */
  refAmount?: number;
  status?: string;
  projectId?: string;
  sourceId: string;
}

export interface LedgerRow extends LedgerEntry {
  balance: number;
}

export type DateRangePreset =
  | "all"
  | "today"
  | "this_month"
  | "last_month"
  | "custom";

export interface DateRange {
  start: string | null; // yyyy-mm-dd, inclusive; null = no lower bound
  end: string | null; // yyyy-mm-dd, inclusive; null = no upper bound
}

const pad = (n: number) => String(n).padStart(2, "0");
const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function resolveDateRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
): DateRange {
  const now = new Date();
  switch (preset) {
    case "today": {
      const iso = toIsoDate(now);
      return { start: iso, end: iso };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: toIsoDate(start), end: toIsoDate(end) };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toIsoDate(start), end: toIsoDate(end) };
    }
    case "custom":
      return { start: customStart || null, end: customEnd || null };
    default:
      return { start: null, end: null };
  }
}

/** Same formula as Payables.tsx's local getPayableStatus — duplicated here
 * (5 lines) rather than imported, since pages aren't meant to be imported
 * as libraries. Payables.tsx itself is untouched. */
export function getPayableDerivedStatus(p: Payable): string {
  if (p.paidAmount >= p.totalAmount) return "Paid";
  const overdue =
    p.dueDate &&
    new Date(p.dueDate) < new Date() &&
    p.paidAmount < p.totalAmount;
  if (overdue) return "Overdue";
  if (p.paidAmount > 0) return "Partial";
  return "Pending";
}

function dateFromTimestamp(ts: number): string {
  return toIsoDate(new Date(ts));
}

// ── Customer Ledger ─────────────────────────────────────────────────

export interface CustomerLedgerSource {
  customerId: string;
  quotations: Quotation[];
  invoices: Invoice[];
  payments: Payment[];
}

export function buildCustomerLedgerEntries({
  customerId,
  quotations,
  invoices,
  payments,
}: CustomerLedgerSource): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const q of quotations) {
    if (q.customerId !== customerId) continue;
    const date = q.quotationDate || dateFromTimestamp(q.createdAt);
    entries.push({
      key: `quotation-${q.id}`,
      date,
      timestamp: q.createdAt,
      docType: "Quotation",
      docNo: q.qtNo,
      description: `Quotation • ${q.lineItems?.length ?? 0} item(s)`,
      debit: 0,
      credit: 0,
      informational: true,
      refAmount: q.totalAmount,
      status: q.status,
      projectId: q.projectId,
      sourceId: q.id,
    });
  }

  const custInvoices = invoices.filter((inv) => inv.customerId === customerId);
  for (const inv of custInvoices) {
    const isTax = (inv.invoiceType ?? "tax") !== "proforma";
    const date = inv.invoiceDate || dateFromTimestamp(inv.createdAt);
    entries.push({
      key: `invoice-${inv.id}`,
      date,
      timestamp: inv.createdAt,
      docType: "Invoice",
      docNo: inv.invNo,
      description:
        inv.invoiceType === "proforma" ? "Proforma Invoice" : "Tax Invoice",
      // Proforma invoices aren't a confirmed sale — Payments.tsx already
      // excludes them from the payable-against list, so they're shown here
      // for context only and never counted toward the receivable balance.
      debit: isTax ? inv.totalAmount : 0,
      credit: 0,
      informational: !isTax,
      refAmount: !isTax ? inv.totalAmount : undefined,
      status: inv.status,
      projectId: inv.projectId,
      sourceId: inv.id,
    });
  }

  const invoiceById = new Map(custInvoices.map((inv) => [inv.id, inv]));
  for (const p of payments) {
    const inv = invoiceById.get(p.invoiceId);
    if (!inv) continue;
    entries.push({
      key: `payment-${p.id}`,
      date: p.paymentDate || dateFromTimestamp(p.createdAt),
      timestamp: p.createdAt,
      docType: "Payment",
      docNo: p.referenceNo || `PAY-${p.id.slice(0, 8).toUpperCase()}`,
      description: `Payment via ${p.mode} against ${inv.invNo}${p.notes ? ` • ${p.notes}` : ""}`,
      debit: 0,
      credit: p.amount,
      informational: false,
      projectId: inv.projectId,
      sourceId: p.id,
    });
  }

  return entries;
}

// ── Vendor Ledger ───────────────────────────────────────────────────

export interface VendorLedgerSource {
  vendorId: string;
  vendorName: string;
  payables: Payable[];
  payablePayments: PayablePayment[];
  companyPOs: CompanyPO[];
}

export function buildVendorLedgerEntries({
  vendorId,
  vendorName,
  payables,
  payablePayments,
  companyPOs,
}: VendorLedgerSource): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  // Same match rule Vendors.tsx already uses to associate a Payable with a
  // Vendor record (payables can be entered by name only, no vendorId).
  const vPayables = payables.filter(
    (p) => p.vendorId === vendorId || p.vendorName === vendorName,
  );

  for (const p of vPayables) {
    entries.push({
      key: `payable-${p.id}`,
      date: dateFromTimestamp(p.createdAt),
      timestamp: p.createdAt,
      docType: "Payable",
      docNo: `PBL-${p.id.slice(0, 8).toUpperCase()}`,
      description: `${p.paymentType || "Payable"}${p.notes ? ` • ${p.notes}` : ""}`,
      debit: p.totalAmount,
      credit: 0,
      informational: false,
      status: getPayableDerivedStatus(p),
      projectId: p.projectId,
      sourceId: p.id,
    });

    if (p.companyPoId) {
      const po = companyPOs.find((c) => c.id === p.companyPoId);
      if (po) {
        entries.push({
          key: `po-${po.id}`,
          date: dateFromTimestamp(po.createdAt),
          timestamp: po.createdAt,
          docType: "Purchase Order",
          docNo: po.cpoNumber,
          description: `Purchase Order • ${po.status}`,
          debit: 0,
          credit: 0,
          informational: true,
          refAmount: po.grandTotal,
          status: po.status,
          projectId: p.projectId,
          sourceId: po.id,
        });
      }
    }
  }

  const payableById = new Map(vPayables.map((p) => [p.id, p]));
  for (const pp of payablePayments) {
    const payable = payableById.get(pp.payableId);
    if (!payable) continue;
    entries.push({
      key: `payable-payment-${pp.id}`,
      date: pp.paymentDate || dateFromTimestamp(pp.createdAt),
      timestamp: pp.createdAt,
      docType: "Vendor Payment",
      docNo: pp.referenceNo || `VPAY-${pp.id.slice(0, 8).toUpperCase()}`,
      description: `Payment via ${pp.mode} against ${payable.paymentType || "payable"}${pp.notes ? ` • ${pp.notes}` : ""}`,
      debit: 0,
      credit: pp.amount,
      informational: false,
      projectId: payable.projectId,
      sourceId: pp.id,
    });
  }

  return entries;
}

// ── Running balance / summary computation ──────────────────────────

export interface LedgerComputation {
  rows: LedgerRow[];
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  /** True, all-time balance as of now — independent of the selected date
   * range's end boundary. */
  outstanding: number;
}

function sortChrono(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.timestamp - b.timestamp;
  });
}

export function computeLedger(
  entries: LedgerEntry[],
  range: DateRange,
): LedgerComputation {
  const sorted = sortChrono(entries);

  let cumulative = 0;
  const before: LedgerEntry[] = [];
  const inRange: LedgerEntry[] = [];
  for (const e of sorted) {
    const afterStart = !range.start || e.date >= range.start;
    const beforeEnd = !range.end || e.date <= range.end;
    if (!afterStart) before.push(e);
    else if (beforeEnd) inRange.push(e);
    // entries after range.end are ignored entirely — they don't affect
    // opening, closing, or outstanding "as of the selected period".
  }

  for (const e of before) {
    if (!e.informational) cumulative += e.debit - e.credit;
  }
  const openingBalance = cumulative;

  const rows: LedgerRow[] = [];
  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  for (const e of inRange) {
    if (!e.informational) {
      running += e.debit - e.credit;
      totalDebit += e.debit;
      totalCredit += e.credit;
    }
    rows.push({ ...e, balance: running });
  }

  // All-time outstanding, unbounded by the selected range's end date.
  let outstanding = 0;
  for (const e of sorted) {
    if (!e.informational) outstanding += e.debit - e.credit;
  }

  return {
    rows,
    openingBalance,
    closingBalance: running,
    totalDebit,
    totalCredit,
    outstanding,
  };
}
