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

interface Props {
  customerId: string;
  onNavigate: (page: Page) => void;
  onViewInvoice: (inv: Invoice) => void;
  onViewQuotation: (q: Quotation) => void;
  onViewProject?: (id: string) => void;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function CustomerHistory({
  customerId,
  onNavigate,
  onViewProject,
}: Props) {
  const { currentUser } = useAuth();
  const { customers, invoices, quotations, projects } = useStore();
  const customer = customers.find((c) => c.id === customerId);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(
    null,
  );

  const custInvoices = invoices
    .filter((inv) => inv.customerId === customerId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const custQuotations = quotations
    .filter((q) => q.customerId === customerId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const custProjects = projects
    .filter((p) => p.customerId === customerId)
    .sort((a, b) => b.createdAt - a.createdAt);

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
        <div className="flex gap-3 text-sm">
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
                        {p.projectName}
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
