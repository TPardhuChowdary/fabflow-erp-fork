import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Eye, FileText, FolderKanban, Receipt } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../AuthContext";
import { InvoicePrintView } from "../components/InvoicePrintView";
import { QuotationPrintView } from "../components/QuotationPrintView";
import { StatusBadge } from "../components/StatusBadge";
import { canView } from "../permissions";
import { useStore } from "../store";
import type { Invoice, Page, Quotation } from "../types";
import { getCustomerVisibleName } from "../lib/utils";

interface Props {
  customerId: string;
  onNavigate: (page: Page) => void;
  onViewInvoice: (inv: Invoice) => void;
  onViewQuotation: (q: Quotation) => void;
  onViewProject?: (id: string) => void;
  onGenerateReport?: (customerId: string, customerName: string) => void;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function CustomerHistory({
  customerId,
  onNavigate,
  onViewProject,
  onGenerateReport,
}: Props) {
  const { currentUser } = useAuth();
  const { customers, invoices, quotations, projects } = useStore();
  const customer = customers.find((c) => c.id === customerId);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(
    null,
  );

  const { payments } = useStore();

  const custInvoices = invoices
    .filter((inv) => inv.customerId === customerId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const custQuotations = quotations
    .filter((q) => q.customerId === customerId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const custProjects = projects
    .filter((p) => p.customerId === customerId)
    .sort((a, b) => b.createdAt - a.createdAt);

  // Analytics
  const totalRevenue = custInvoices.reduce((s, i) => s + (i.totalAmount ?? 0), 0);
  const totalPaid = custInvoices.reduce((s, i) => s + (i.paidAmount ?? 0), 0);
  const outstanding = totalRevenue - totalPaid;
  const acceptedQuotations = custQuotations.filter((q) => q.status === "Accepted").length;
  const conversionRate = custQuotations.length > 0 ? Math.round((acceptedQuotations / custQuotations.length) * 100) : 0;

  // Average payment delay: days between invoiceDate and first payment for paid invoices
  const paymentDelays: number[] = custInvoices
    .filter((i) => i.status === "Paid" && i.invoiceDate)
    .map((inv) => {
      const pmt = payments.filter((p) => p.invoiceId === inv.id).sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!pmt || !inv.invoiceDate) return null;
      return Math.max(0, Math.floor((pmt.createdAt - new Date(inv.invoiceDate).getTime()) / (1000 * 60 * 60 * 24)));
    })
    .filter((d): d is number => d !== null);
  const avgPaymentDelay = paymentDelays.length > 0
    ? Math.round(paymentDelays.reduce((s, d) => s + d, 0) / paymentDelays.length)
    : null;

  const lastOrderDate = custProjects.length > 0
    ? new Date(custProjects[0].createdAt).toLocaleDateString("en-IN")
    : null;

  if (!canView(currentUser, "customers")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <span className="text-2xl">🔒</span>
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

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p>Customer not found.</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => onNavigate("customers")}
        >
          Back to Customers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-ocid="customer-history.page">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("customers")}
            data-ocid="customer-history.back.button"
            className="mt-0.5"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">{customer.name}</h1>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
              {customer.contactPerson && <span>{customer.contactPerson}</span>}
              {customer.phone && <span>· {customer.phone}</span>}
              {customer.email && <span>· {customer.email}</span>}
              {customer.gstin && <span>· GSTIN: {customer.gstin}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-3 text-sm flex-wrap justify-end">
          {onGenerateReport && (
            <button
              type="button"
              onClick={() => onGenerateReport(customer.id, customer.name)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted text-sm font-medium transition-colors self-start"
              title="Generate customer history pack"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
              Export History
            </button>
          )}
          <div className="text-center px-4 py-2 bg-muted/40 rounded-lg">
            <div className="text-xl font-bold">{custProjects.length}</div>
            <div className="text-xs text-muted-foreground">Projects</div>
          </div>
          <div className="text-center px-4 py-2 bg-muted/40 rounded-lg">
            <div className="text-xl font-bold">{custInvoices.length}</div>
            <div className="text-xs text-muted-foreground">Invoices</div>
          </div>
          <div className="text-center px-4 py-2 bg-muted/40 rounded-lg">
            <div className="text-xl font-bold">{custQuotations.length}</div>
            <div className="text-xs text-muted-foreground">Quotations</div>
          </div>
        </div>
      </div>

      {/* Customer Analytics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Revenue</p>
          <p className="text-xl font-bold mt-1 text-green-600">{fmt(totalRevenue)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Outstanding</p>
          <p className={`text-xl font-bold mt-1 ${outstanding > 0 ? "text-red-600" : "text-muted-foreground"}`}>{fmt(outstanding)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Quotation Conversion</p>
          <p className="text-xl font-bold mt-1 text-blue-600">{conversionRate}%</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{acceptedQuotations} of {custQuotations.length} accepted</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Payment Delay</p>
          <p className={`text-xl font-bold mt-1 ${avgPaymentDelay !== null && avgPaymentDelay > 30 ? "text-orange-600" : "text-foreground"}`}>
            {avgPaymentDelay !== null ? `${avgPaymentDelay}d` : "—"}
          </p>
          {lastOrderDate && <p className="text-[11px] text-muted-foreground mt-0.5">Last order: {lastOrderDate}</p>}
        </div>
      </div>

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger
            value="projects"
            data-ocid="customer-history.projects.tab"
          >
            <FolderKanban className="w-3.5 h-3.5 mr-1.5" /> Projects (
            {custProjects.length})
          </TabsTrigger>
          <TabsTrigger
            value="invoices"
            data-ocid="customer-history.invoices.tab"
          >
            <Receipt className="w-3.5 h-3.5 mr-1.5" /> Invoices (
            {custInvoices.length})
          </TabsTrigger>
          <TabsTrigger
            value="quotations"
            data-ocid="customer-history.quotations.tab"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Quotations (
            {custQuotations.length})
          </TabsTrigger>
        </TabsList>

        {/* Projects Tab */}
        <TabsContent value="projects" className="mt-4">
          <div className="table-wrapper">
            <div
              className="rounded-md border"
              data-ocid="customer-history.projects.table"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      Project No
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Project Name
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Description
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Created
                    </TableHead>
                    <TableHead className="text-xs font-semibold w-24">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {custProjects.map((p, i) => (
                    <TableRow
                      key={p.id}
                      data-ocid={`customer-history.projects.row.${i + 1}`}
                    >
                      <TableCell className="text-xs font-mono font-semibold text-primary">
                        {p.projectNo}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{getCustomerVisibleName(p)}</span>
                          {p.internalOrderCode && (
                            <span className="font-mono text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                              {p.internalOrderCode}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                        {p.workDescription || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(p.createdAt).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell>
                        {onViewProject && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            onClick={() => onViewProject(p.id)}
                            data-ocid={`customer-history.projects.edit_button.${i + 1}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {custProjects.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="customer-history.projects.empty_state"
                      >
                        No projects found for this customer
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <div className="table-wrapper">
            <div
              className="rounded-md border"
              data-ocid="customer-history.invoices.table"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      Invoice No.
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      PO Number
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Total Amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold w-20">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {custInvoices.map((inv, i) => (
                    <TableRow
                      key={inv.id}
                      data-ocid={`customer-history.invoices.row.${i + 1}`}
                    >
                      <TableCell className="text-xs font-mono font-semibold">
                        {inv.invNo}
                      </TableCell>
                      <TableCell className="text-xs">
                        {inv.invoiceDate || "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {inv.poNumber || "—"}
                      </TableCell>
                      <TableCell className="text-sm font-semibold">
                        {fmt(inv.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => setSelectedInvoice(inv)}
                          data-ocid={`customer-history.invoices.edit_button.${i + 1}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {custInvoices.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="customer-history.invoices.empty_state"
                      >
                        No invoices found for this customer
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="quotations" className="mt-4">
          <div className="table-wrapper">
            <div
              className="rounded-md border"
              data-ocid="customer-history.quotations.table"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      QT No.
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Total Amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Valid Until
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold w-20">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {custQuotations.map((q, i) => (
                    <TableRow
                      key={q.id}
                      data-ocid={`customer-history.quotations.row.${i + 1}`}
                    >
                      <TableCell className="text-xs font-mono font-semibold">
                        {q.qtNo}
                      </TableCell>
                      <TableCell className="text-xs">
                        {q.createdAt
                          ? new Date(q.createdAt).toLocaleDateString("en-IN")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-semibold">
                        {fmt(q.totalAmount)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {q.validUntil || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={q.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => setSelectedQuotation(q)}
                          data-ocid={`customer-history.quotations.edit_button.${i + 1}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {custQuotations.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="customer-history.quotations.empty_state"
                      >
                        No quotations found for this customer
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Print dialogs */}
      <InvoicePrintView
        invoice={selectedInvoice}
        customer={customer}
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
      <QuotationPrintView
        quotation={selectedQuotation}
        customer={customer}
        open={!!selectedQuotation}
        onClose={() => setSelectedQuotation(null)}
      />
    </div>
  );
}
