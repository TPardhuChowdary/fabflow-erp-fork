import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { useAuth } from "../AuthContext";
import { CustomerSelect } from "../components/CustomerSelect";
import { LedgerDocContent } from "../components/LedgerDocContent";
import { StatusBadge } from "../components/StatusBadge";
import { VendorSelect } from "../components/VendorSelect";
import { SearchableSelect } from "../components/ui/searchable-select";
import {
  printDocument,
  handleDownload as triggerDownload,
} from "../lib/documentUtils";
import {
  type DateRangePreset,
  buildCustomerLedgerEntries,
  buildVendorLedgerEntries,
  computeLedger,
  resolveDateRange,
} from "../lib/ledger";
import { exportLedgerCsv, exportLedgerExcel } from "../lib/ledgerExport";
import { getCustomerVisibleName } from "../lib/utils";
import { hasPermission } from "../permissions";
import { useStore } from "../store";

const fmt = (n: number) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;

const PAYABLE_STATUS_COLOR: Record<string, string> = {
  Pending: "bg-muted text-muted-foreground border-border",
  Partial: "bg-warning/15 text-warning border-warning/30",
  Paid: "bg-success/10 text-success border-success/30",
  Overdue: "bg-destructive/10 text-destructive border-destructive/30",
};

const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "custom", label: "Custom Range" },
];

type AccountType = "customer" | "vendor";

export function Ledger() {
  const { currentUser } = useAuth();
  const {
    customers,
    vendors,
    projects,
    quotations,
    invoices,
    payments,
    payables,
    payablePayments,
    companyPOs,
    settings,
  } = useStore();

  const [accountType, setAccountType] = useState<AccountType>("customer");
  const [customerId, setCustomerId] = useState<string>("");
  const [vendorId, setVendorId] = useState<string>("");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [docTypeFilter, setDocTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const selectedCustomer = customers.find((c) => c.id === customerId) || null;
  const selectedVendor = vendors.find((v) => v.id === vendorId) || null;

  const range = useMemo(
    () => resolveDateRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd],
  );

  const rawEntries = useMemo(() => {
    if (accountType === "customer") {
      if (!customerId) return [];
      return buildCustomerLedgerEntries({
        customerId,
        quotations,
        invoices,
        payments,
      });
    }
    if (!vendorId || !selectedVendor) return [];
    return buildVendorLedgerEntries({
      vendorId,
      vendorName: selectedVendor.name,
      payables,
      payablePayments,
      companyPOs,
    });
  }, [
    accountType,
    customerId,
    vendorId,
    selectedVendor,
    quotations,
    invoices,
    payments,
    payables,
    payablePayments,
    companyPOs,
  ]);

  const computation = useMemo(
    () => computeLedger(rawEntries, range),
    [rawEntries, range],
  );

  const availableDocTypes = useMemo(
    () => Array.from(new Set(computation.rows.map((r) => r.docType))),
    [computation.rows],
  );
  const availableStatuses = useMemo(
    () =>
      Array.from(
        new Set(
          computation.rows.map((r) => r.status).filter((s): s is string => !!s),
        ),
      ),
    [computation.rows],
  );

  const displayRows = useMemo(() => {
    return computation.rows.filter((r) => {
      if (projectFilter && r.projectId !== projectFilter) return false;
      if (docTypeFilter.length > 0 && !docTypeFilter.includes(r.docType))
        return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [computation.rows, projectFilter, docTypeFilter, statusFilter]);

  const periodLabel =
    datePreset === "all"
      ? "All Time"
      : datePreset === "custom"
        ? `${range.start || "…"} to ${range.end || "…"}`
        : DATE_PRESETS.find((p) => p.value === datePreset)?.label || "All Time";

  const accountLabel =
    accountType === "customer" ? selectedCustomer?.name : selectedVendor?.name;
  const hasAccount =
    accountType === "customer" ? !!selectedCustomer : !!selectedVendor;

  const canExportLedger = hasPermission(currentUser, "ledger.export");
  const canPrintLedger = hasPermission(currentUser, "ledger.print");

  const exportMeta = () => ({
    companyName: settings.companyName || "Company",
    accountType: (accountType === "customer" ? "Customer" : "Vendor") as
      | "Customer"
      | "Vendor",
    accountLabel: accountLabel || "—",
    periodLabel,
    openingBalance: computation.openingBalance,
    closingBalance: computation.closingBalance,
    totalDebit: computation.totalDebit,
    totalCredit: computation.totalCredit,
    outstanding: computation.outstanding,
  });

  const fileBase = `Ledger_${accountLabel?.replace(/\s+/g, "_") || "account"}_${new Date().toISOString().split("T")[0]}`;

  const handleCsv = () =>
    exportLedgerCsv(displayRows, exportMeta(), `${fileBase}.csv`);
  const handleExcel = () =>
    exportLedgerExcel(displayRows, exportMeta(), `${fileBase}.xls`);

  const renderOffscreen = async (action: (docId: string) => void) => {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `ledger-pdf-content-${Date.now()}`;
    const details =
      accountType === "customer"
        ? {
            phone: selectedCustomer?.phone,
            email: selectedCustomer?.email,
            address: selectedCustomer?.address,
            gstin: selectedCustomer?.gstin,
          }
        : {
            phone: selectedVendor?.phone,
            address: selectedVendor?.address,
            gstin: selectedVendor?.gstNumber,
          };
    flushSync(() => {
      root.render(
        <LedgerDocContent
          id={docId}
          accountType={accountType === "customer" ? "Customer" : "Vendor"}
          accountLabel={accountLabel || "—"}
          accountDetails={details}
          periodLabel={periodLabel}
          openingBalance={computation.openingBalance}
          closingBalance={computation.closingBalance}
          totalDebit={computation.totalDebit}
          totalCredit={computation.totalCredit}
          outstanding={computation.outstanding}
          rows={displayRows}
          settings={settings as unknown as Record<string, string>}
        />,
      );
    });
    try {
      action(docId);
    } finally {
      setTimeout(() => {
        root.unmount();
        container.remove();
      }, 1000);
    }
  };

  const handlePdf = () =>
    renderOffscreen((docId) => triggerDownload(docId, `${fileBase}.pdf`));
  const handlePrint = () => renderOffscreen((docId) => printDocument(docId));

  return (
    <div className="space-y-4" data-ocid="ledger.page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Chronological financial history with running balance — derived from
            existing Invoices, Payments, Payables and Vendor Payments.
          </p>
        </div>
        {hasAccount && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCsv}
              disabled={!canExportLedger}
              data-ocid="ledger.export.csv_button"
            >
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExcel}
              disabled={!canExportLedger}
              data-ocid="ledger.export.excel_button"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePdf}
              disabled={!canExportLedger}
              data-ocid="ledger.export.pdf_button"
            >
              <FileText className="w-3.5 h-3.5 mr-1" /> PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={!canPrintLedger}
              data-ocid="ledger.export.print_button"
            >
              <Printer className="w-3.5 h-3.5 mr-1" /> Print
            </Button>
          </div>
        )}
      </div>

      <Tabs
        value={accountType}
        onValueChange={(v) => {
          setAccountType(v as AccountType);
          setDocTypeFilter([]);
          setStatusFilter("");
          setProjectFilter("");
        }}
      >
        <TabsList>
          <TabsTrigger value="customer" data-ocid="ledger.tab.customer">
            Customer Ledger
          </TabsTrigger>
          <TabsTrigger value="vendor" data-ocid="ledger.tab.vendor">
            Vendor Ledger
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">
              {accountType === "customer" ? "Customer" : "Vendor"}
            </Label>
            {accountType === "customer" ? (
              <CustomerSelect
                value={customerId}
                onChange={setCustomerId}
                placeholder="Select customer"
                className="w-full"
                data-ocid="ledger.filter.customer.select"
              />
            ) : (
              <VendorSelect
                value={vendorId}
                onChange={setVendorId}
                placeholder="Select vendor"
                className="w-full"
                data-ocid="ledger.filter.vendor.select"
              />
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Date Range</Label>
            <Select
              value={datePreset}
              onValueChange={(v) => setDatePreset(v as DateRangePreset)}
            >
              <SelectTrigger
                data-ocid="ledger.filter.date_preset.select"
                className="h-8 text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-sm">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Project</Label>
            <SearchableSelect
              value={projectFilter || "__all__"}
              onChange={(v) => setProjectFilter(v === "__all__" ? "" : v)}
              options={[
                { value: "__all__", label: "All Projects" },
                ...projects.map((p) => ({
                  value: p.id,
                  label: `${p.projectNo} — ${getCustomerVisibleName(p)}`,
                })),
              ]}
              placeholder="All Projects"
              searchPlaceholder="Search by project no. or customer…"
              emptyText="No projects found."
              className="w-full"
              data-ocid="ledger.filter.project.select"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select
              value={statusFilter || "__all__"}
              onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                data-ocid="ledger.filter.status.select"
                className="h-8 text-sm"
              >
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-sm">
                  All Statuses
                </SelectItem>
                {availableStatuses.map((s) => (
                  <SelectItem key={s} value={s} className="text-sm">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {datePreset === "custom" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 text-sm"
                data-ocid="ledger.filter.custom_start.input"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 text-sm"
                data-ocid="ledger.filter.custom_end.input"
              />
            </div>
          </div>
        )}

        {availableDocTypes.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Document Type</Label>
            <div className="flex flex-wrap gap-1.5">
              {availableDocTypes.map((dt) => {
                const active = docTypeFilter.includes(dt);
                return (
                  <button
                    key={dt}
                    type="button"
                    data-ocid={`ledger.filter.doc_type.${dt.replace(/\s+/g, "_").toLowerCase()}`}
                    onClick={() =>
                      setDocTypeFilter((cur) =>
                        cur.includes(dt)
                          ? cur.filter((x) => x !== dt)
                          : [...cur, dt],
                      )
                    }
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border transition-colors",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {dt}
                  </button>
                );
              })}
              {docTypeFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDocTypeFilter([])}
                  className="text-xs px-2.5 py-1 rounded-full border border-dashed text-muted-foreground hover:bg-muted"
                  data-ocid="ledger.filter.doc_type.clear"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!hasAccount ? (
        <div
          className="rounded-md border py-16 text-center text-sm text-muted-foreground"
          data-ocid="ledger.empty_state"
        >
          Select a {accountType === "customer" ? "customer" : "vendor"} above to
          view their ledger.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Opening Balance
              </p>
              <p className="text-lg font-bold mt-1">
                {fmt(computation.openingBalance)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {accountType === "customer" ? "Total Debit" : "Total Payables"}
              </p>
              <p className="text-lg font-bold mt-1 text-destructive">
                {fmt(computation.totalDebit)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {accountType === "customer" ? "Total Credit" : "Total Payments"}
              </p>
              <p className="text-lg font-bold mt-1 text-success">
                {fmt(computation.totalCredit)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Closing Balance
              </p>
              <p className="text-lg font-bold mt-1">
                {fmt(computation.closingBalance)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Outstanding
              </p>
              <p
                className={cn(
                  "text-lg font-bold mt-1",
                  computation.outstanding > 0
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {fmt(computation.outstanding)}
              </p>
            </div>
          </div>

          {/* Transaction table */}
          <div className="table-wrapper">
            <div className="rounded-md border" data-ocid="ledger.table">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Doc No.
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Description
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-right">
                      Debit
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-right">
                      Credit
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-right">
                      Balance
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/20">
                    <TableCell
                      colSpan={7}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Opening Balance
                    </TableCell>
                    <TableCell className="text-xs font-bold text-right">
                      {fmt(computation.openingBalance)}
                    </TableCell>
                  </TableRow>
                  {displayRows.map((r, i) => (
                    <TableRow
                      key={r.key}
                      className={r.informational ? "opacity-60" : ""}
                      data-ocid={`ledger.row.${i + 1}`}
                    >
                      <TableCell className="text-xs">{r.date}</TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-medium"
                        >
                          {r.docType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {r.docNo}
                      </TableCell>
                      <TableCell
                        className="text-xs max-w-[260px] truncate"
                        title={r.description}
                      >
                        {r.description}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.status &&
                          (PAYABLE_STATUS_COLOR[r.status] ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-medium",
                                PAYABLE_STATUS_COLOR[r.status],
                              )}
                            >
                              {r.status}
                            </Badge>
                          ) : (
                            <StatusBadge status={r.status} />
                          ))}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {r.informational ? (
                          r.refAmount ? (
                            <span className="text-muted-foreground">
                              ({fmt(r.refAmount)})
                            </span>
                          ) : (
                            "—"
                          )
                        ) : r.debit ? (
                          fmt(r.debit)
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {r.informational ? "—" : r.credit ? fmt(r.credit) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold">
                        {r.informational ? "—" : fmt(r.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {displayRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="ledger.list.empty_state"
                      >
                        No transactions in this period.
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className="bg-muted/20">
                    <TableCell colSpan={7} className="text-xs font-bold">
                      Closing Balance
                    </TableCell>
                    <TableCell className="text-xs font-bold text-right">
                      {fmt(computation.closingBalance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
