import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Building2,
  CheckSquare,
  Download,
  FileDown,
  FileText,
  Loader2,
  Printer,
  Square,
  User,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { hasPermission } from "../permissions";
import { useStore } from "../store";
import { getCustomerVisibleName } from "../lib/utils";
import type { ExportContext, ExportSectionId } from "../types";

// ── Section Manifest ─────────────────────────────────────────────

interface SectionDef {
  id: ExportSectionId;
  label: string;
  description: string;
  group: string;
  applicableTo: ExportContext[];
  requiresPermission?: string;
  hasFiles: boolean;
}

const SECTION_MANIFEST: SectionDef[] = [
  {
    id: "cover_page",
    label: "Cover Page",
    description: "Project/customer summary with company branding",
    group: "Documents",
    applicableTo: ["project", "customer"],
    hasFiles: false,
  },
  {
    id: "quotations",
    label: "Quotations",
    description: "All quotations with line items and GST breakdown",
    group: "Sales",
    applicableTo: ["project", "customer"],
    hasFiles: true,
  },
  {
    id: "purchase_orders",
    label: "Customer Purchase Orders",
    description: "Recorded customer POs with file attachments",
    group: "Sales",
    applicableTo: ["project", "customer"],
    hasFiles: true,
  },
  {
    id: "bom",
    label: "Bill of Materials",
    description: "Required materials vs available inventory",
    group: "Technical",
    applicableTo: ["project"],
    hasFiles: false,
  },
  {
    id: "design_files",
    label: "Design Files Index",
    description: "List of uploaded design/CAD files with metadata",
    group: "Technical",
    applicableTo: ["project"],
    hasFiles: true,
  },
  {
    id: "material_purchases",
    label: "Material Purchases",
    description: "Raw material purchase records",
    group: "Technical",
    applicableTo: ["project"],
    hasFiles: true,
  },
  {
    id: "material_usage",
    label: "Material Usage",
    description: "Materials consumed from inventory",
    group: "Technical",
    applicableTo: ["project"],
    hasFiles: false,
  },
  {
    id: "production_history",
    label: "Production History",
    description: "Stage-by-stage production progress log",
    group: "Technical",
    applicableTo: ["project"],
    hasFiles: false,
  },
  {
    id: "outsourced_work",
    label: "Outsourced Work",
    description: "Work sent to external vendors",
    group: "Technical",
    applicableTo: ["project"],
    hasFiles: false,
  },
  {
    id: "qc_reports",
    label: "Quality Inspection",
    description: "QC inspection results per stage",
    group: "Quality & Dispatch",
    applicableTo: ["project"],
    hasFiles: false,
  },
  {
    id: "delivery_challans",
    label: "Delivery Challans",
    description: "Dispatch records with quantities",
    group: "Quality & Dispatch",
    applicableTo: ["project", "customer"],
    hasFiles: false,
  },
  {
    id: "invoices",
    label: "Tax Invoices",
    description: "GST-compliant invoices with breakdowns",
    group: "Finance",
    applicableTo: ["project", "customer"],
    requiresPermission: "invoices.view",
    hasFiles: false,
  },
  {
    id: "payment_history",
    label: "Payment History",
    description: "Payment records against invoices",
    group: "Finance",
    applicableTo: ["project", "customer"],
    requiresPermission: "payments.view",
    hasFiles: true,
  },
  {
    id: "internal_costing",
    label: "Internal Costing",
    description: "Cost breakdown (Material, Process, Labour, etc.)",
    group: "Finance",
    applicableTo: ["project"],
    requiresPermission: "invoices.view",
    hasFiles: false,
  },
  {
    id: "profit_summary",
    label: "Profit & Costing Summary",
    description: "Revenue vs costs — margin analysis",
    group: "Finance",
    applicableTo: ["project"],
    requiresPermission: "invoices.view",
    hasFiles: false,
  },
  {
    id: "machine_usage",
    label: "Machine Usage Log",
    description: "Machines used for this project with hours",
    group: "Technical",
    applicableTo: ["project"],
    hasFiles: false,
  },
  {
    id: "attachments_index",
    label: "Attachments Index",
    description: "Complete listing of all uploaded files",
    group: "Appendix",
    applicableTo: ["project", "customer"],
    hasFiles: false,
  },
];

const DEFAULT_SECTIONS: ExportSectionId[] = [
  "cover_page",
  "quotations",
  "purchase_orders",
  "production_history",
  "qc_reports",
  "delivery_challans",
  "invoices",
  "payment_history",
  "attachments_index",
];

// ── Print CSS injected into the print window ─────────────────────

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 0; }
  h1 { font-size: 20px; font-weight: bold; margin: 0 0 4px 0; }
  h2 { font-size: 14px; font-weight: bold; margin: 0 0 4px 0; color: #333; }
  h3 { font-size: 11px; font-weight: bold; margin: 0 0 3px 0; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
  p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th { background: #f3f4f6; padding: 6px 8px; text-align: left; font-size: 10px; border: 1px solid #ddd; }
  td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .section { page-break-before: always; padding: 24px 32px; }
  .section:first-child { page-break-before: avoid; }
  .section-header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 16px; }
  .cover { display: flex; flex-direction: column; justify-content: center; min-height: 60vh; padding: 32px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-orange { background: #ffedd5; color: #9a3412; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .kv-row { display: flex; gap: 12px; margin-bottom: 4px; }
  .kv-label { color: #6b7280; min-width: 140px; }
  .kv-value { font-weight: 500; }
  .total-row td { font-weight: bold; background: #f3f4f6 !important; }
  .no-data { color: #9ca3af; font-style: italic; padding: 12px 0; }
  .file-item { padding: 6px 0; border-bottom: 1px solid #f0f0f0; display: flex; gap: 8px; align-items: center; }
  @media print {
    .no-print { display: none !important; }
    .section { padding: 20px 24px; }
  }
`;

// ── Prop types ───────────────────────────────────────────────────

interface Props {
  context: { type: "project" | "customer"; id: string; name: string } | null;
  onBack: () => void;
}

// ── Main Component ───────────────────────────────────────────────

export function ExportEngine({ context, onBack }: Props) {
  const { currentUser } = useAuth();
  const store = useStore();

  const [selectedSections, setSelectedSections] = useState<Set<ExportSectionId>>(
    new Set(DEFAULT_SECTIONS),
  );
  const [generating, setGenerating] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const ctxType = context?.type ?? "project";
  const ctxId = context?.id ?? "";
  const ctxName = context?.name ?? "Unknown";

  // Filter sections applicable to this context and permitted to this user
  const availableSections = useMemo(
    () => SECTION_MANIFEST.filter((s) => {
      if (!s.applicableTo.includes(ctxType)) return false;
      if (s.requiresPermission && !hasPermission(currentUser, s.requiresPermission)) return false;
      return true;
    }),
    [ctxType, currentUser],
  );

  const groupedSections = useMemo(() => {
    const groups: Record<string, SectionDef[]> = {};
    for (const s of availableSections) {
      if (!groups[s.group]) groups[s.group] = [];
      groups[s.group].push(s);
    }
    return groups;
  }, [availableSections]);

  function toggleSection(id: ExportSectionId) {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedSections(new Set(availableSections.map((s) => s.id)));
  }

  function deselectAll() {
    setSelectedSections(new Set());
  }

  // ── Data gathering ───────────────────────────────────────────

  function gatherData() {
    const {
      projects, customers, quotations, masterPOs, designFiles,
      bomItems, inventoryItems, materialPurchases, materialUsages,
      projectProductions, outsourcedWorks, qualityInspections,
      deliveryChallans, invoices, payments, internalCostings,
      machineUsageLogs, machines, settings,
    } = store;

    if (ctxType === "project") {
      const project = projects.find((p) => p.id === ctxId);
      const customer = project ? customers.find((c) => c.id === project.customerId) : null;
      const projectQuotations = quotations.filter((q) => q.projectId === ctxId || (project && q.customerId === project.customerId));
      const projectPOs = masterPOs.filter((po) => (project?.pos || []).some((pp) => pp.sharedPoId === po.sharedPoId));
      const projectDesignFiles = designFiles.filter((f) => f.projectId === ctxId);
      const projectBOM = bomItems.filter((b) => b.projectId === ctxId);
      const projectMatPurchases = materialPurchases.filter((m) => m.projectId === ctxId);
      const projectMatUsages = materialUsages.filter((m) => m.projectId === ctxId);
      const projectProduction = projectProductions.find((pp) => pp.projectId === ctxId);
      const projectOutsourced = outsourcedWorks.filter((o) => o.projectId === ctxId);
      const projectQC = qualityInspections.filter((q) => q.projectId === ctxId);
      const projectChallans = deliveryChallans.filter((dc) =>
        dc.projectId === ctxId || (dc.projectEntries || []).some((pe) => pe.projectId === ctxId)
      );
      const projectInvoices = invoices.filter((i) => i.projectId === ctxId);
      const projectPayments = payments.filter((p) => projectInvoices.some((i) => i.id === p.invoiceId));
      const projectCosting = internalCostings.find((ic) => ic.projectId === ctxId);
      const projectMachineUsage = machineUsageLogs.filter((l) => l.projectId === ctxId);

      return {
        project, customer, quotations: projectQuotations, masterPOs: projectPOs,
        designFiles: projectDesignFiles, bomItems: projectBOM, inventoryItems,
        materialPurchases: projectMatPurchases, materialUsages: projectMatUsages,
        production: projectProduction, outsourcedWorks: projectOutsourced,
        qualityInspections: projectQC, deliveryChallans: projectChallans,
        invoices: projectInvoices, payments: projectPayments,
        internalCosting: projectCosting, machineUsageLogs: projectMachineUsage,
        machines, settings,
      };
    } else {
      // Customer context
      const customer = customers.find((c) => c.id === ctxId);
      const customerProjects = projects.filter((p) => p.customerId === ctxId);
      const projectIds = customerProjects.map((p) => p.id);
      const customerQuotations = quotations.filter((q) => q.customerId === ctxId);
      const customerChallans = deliveryChallans.filter((dc) =>
        dc.customerId === ctxId || projectIds.some((id) =>
          dc.projectId === id || (dc.projectEntries || []).some((pe) => pe.projectId === id)
        )
      );
      const customerInvoices = invoices.filter((i) => i.customerId === ctxId);
      const customerPayments = payments.filter((p) => customerInvoices.some((i) => i.id === p.invoiceId));

      return {
        customer, projects: customerProjects,
        quotations: customerQuotations, masterPOs: [],
        deliveryChallans: customerChallans,
        invoices: customerInvoices, payments: customerPayments,
        settings,
      };
    }
  }

  // ── HTML Report Builders ─────────────────────────────────────

  function fmtCurrency(v: number | undefined) {
    if (v === undefined || v === null) return "—";
    return `₹${v.toLocaleString("en-IN")}`;
  }

  function fmtDate(d: string | number | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN");
  }

  function buildCoverSection(data: ReturnType<typeof gatherData>): string {
    const { settings } = data;
    const proj = (data as any).project;
    const title = ctxType === "project"
      ? `Project Dossier — ${proj ? getCustomerVisibleName(proj) : ctxName}`
      : `Customer History Pack — ${ctxName}`;
    const subtitle = ctxType === "project"
      ? `${(data as any).project?.projectNo || ""} · ${(data as any).customer?.name || ""}`
      : `Customer: ${(data as any).customer?.name || ctxName}`;

    return `
      <div class="section cover">
        <div class="section-header">
          <h3>${settings.companyName || "FabFlow ERP"}</h3>
          <p style="color:#6b7280;font-size:10px">${settings.companyAddress || ""}</p>
        </div>
        <h1>${title}</h1>
        <p style="color:#6b7280;margin-top:4px">${subtitle}</p>
        <div style="margin-top:16px;color:#6b7280;font-size:10px">
          <p>Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
          <p>Sections: ${selectedSections.size}</p>
        </div>
        ${ctxType === "project" ? `
          <div style="margin-top:24px" class="grid-2">
            <div>
              <h3>Project</h3>
              <div class="kv-row"><span class="kv-label">Project No</span><span class="kv-value">${(data as any).project?.projectNo || "—"}</span></div>
              <div class="kv-row"><span class="kv-label">Project Name</span><span class="kv-value">${(data as any).project ? getCustomerVisibleName((data as any).project) : "—"}</span></div>${(data as any).project?.internalOrderCode ? `<div class="kv-row"><span class="kv-label">Order Code</span><span class="kv-value">${(data as any).project.internalOrderCode}</span></div>` : ""}
              <div class="kv-row"><span class="kv-label">Description</span><span class="kv-value">${(data as any).project?.workDescription || "—"}</span></div>
              <div class="kv-row"><span class="kv-label">Created</span><span class="kv-value">${fmtDate((data as any).project?.createdAt)}</span></div>
            </div>
            <div>
              <h3>Customer</h3>
              <div class="kv-row"><span class="kv-label">Company</span><span class="kv-value">${(data as any).customer?.name || "—"}</span></div>
              <div class="kv-row"><span class="kv-label">Contact</span><span class="kv-value">${(data as any).customer?.contactPerson || "—"}</span></div>
              <div class="kv-row"><span class="kv-label">Phone</span><span class="kv-value">${(data as any).customer?.phone || "—"}</span></div>
              <div class="kv-row"><span class="kv-label">GSTIN</span><span class="kv-value">${(data as any).customer?.gstin || "—"}</span></div>
            </div>
          </div>
        ` : `
          <div style="margin-top:24px">
            <h3>Customer Details</h3>
            <div class="kv-row"><span class="kv-label">Company</span><span class="kv-value">${(data as any).customer?.name || "—"}</span></div>
            <div class="kv-row"><span class="kv-label">Contact</span><span class="kv-value">${(data as any).customer?.contactPerson || "—"}</span></div>
            <div class="kv-row"><span class="kv-label">Phone</span><span class="kv-value">${(data as any).customer?.phone || "—"}</span></div>
            <div class="kv-row"><span class="kv-label">GSTIN</span><span class="kv-value">${(data as any).customer?.gstin || "—"}</span></div>
            <div class="kv-row"><span class="kv-label">Projects</span><span class="kv-value">${(data as any).projects?.length || 0}</span></div>
          </div>
        `}
      </div>`;
  }

  function buildQuotationsSection(data: ReturnType<typeof gatherData>): string {
    const quots = (data as any).quotations || [];
    const rows = quots.map((q: any) => `
      <tr>
        <td>${q.qtNo}</td>
        <td>${fmtDate(q.quotationDate || q.createdAt)}</td>
        <td>${q.validUntil || "—"}</td>
        <td>${q.lineItems?.length || 0} items</td>
        <td>${fmtCurrency(q.totalAmount)}</td>
        <td><span class="badge ${q.status === "Accepted" ? "badge-green" : q.status === "Draft" ? "badge-blue" : "badge-orange"}">${q.status}</span></td>
      </tr>`).join("");
    return `
      <div class="section">
        <div class="section-header"><h2>Quotations</h2></div>
        ${quots.length === 0 ? '<p class="no-data">No quotations found.</p>' : `
          <table><thead><tr><th>QT No.</th><th>Date</th><th>Valid Until</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody></table>
        `}
      </div>`;
  }

  function buildProductionSection(data: ReturnType<typeof gatherData>): string {
    const production = (data as any).production;
    if (!production) return `<div class="section"><div class="section-header"><h2>Production History</h2></div><p class="no-data">No production data.</p></div>`;
    const stages = production.stages || [];
    const rows = stages.map((s: any) => `
      <tr>
        <td>${s.stageName}</td>
        <td><span class="badge ${s.status === "Completed" ? "badge-green" : s.status === "InProgress" ? "badge-blue" : "badge-orange"}">${s.status}</span></td>
        <td>${s.quantitySent || 0}</td>
        <td>${s.receivedQuantity || s.receivedQty || 0}</td>
        <td>${s.notes || "—"}</td>
      </tr>`).join("");
    return `
      <div class="section">
        <div class="section-header"><h2>Production History</h2></div>
        <table><thead><tr><th>Stage</th><th>Status</th><th>Sent Qty</th><th>Received Qty</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
  }

  function buildQCSection(data: ReturnType<typeof gatherData>): string {
    const qcs = (data as any).qualityInspections || [];
    const rows = qcs.map((q: any) => `
      <tr>
        <td>${q.stage}</td>
        <td><span class="badge ${q.qcStatus === "Pass" ? "badge-green" : q.qcStatus === "Fail" ? "badge-red" : "badge-orange"}">${q.qcStatus}</span></td>
        <td>${q.approvedQty ?? "—"}</td>
        <td>${q.rejectedQty ?? "—"}</td>
        <td>${q.remarks || q.qcNotes || "—"}</td>
      </tr>`).join("");
    return `
      <div class="section">
        <div class="section-header"><h2>Quality Inspection</h2></div>
        ${qcs.length === 0 ? '<p class="no-data">No QC records found.</p>' : `
          <table><thead><tr><th>Stage</th><th>Status</th><th>Approved Qty</th><th>Rejected Qty</th><th>Remarks</th></tr></thead>
          <tbody>${rows}</tbody></table>
        `}
      </div>`;
  }

  function buildChallansSection(data: ReturnType<typeof gatherData>): string {
    const challans = (data as any).deliveryChallans || [];
    const rows = challans.map((dc: any) => `
      <tr>
        <td>${dc.dcNo}</td>
        <td>${fmtDate(dc.dispatchDate)}</td>
        <td>${dc.vehicleNo || "—"}</td>
        <td>${dc.receiverName || "—"}</td>
        <td><span class="badge ${dc.status === "Delivered" ? "badge-green" : "badge-blue"}">${dc.status}</span></td>
      </tr>`).join("");
    return `
      <div class="section">
        <div class="section-header"><h2>Delivery Challans</h2></div>
        ${challans.length === 0 ? '<p class="no-data">No delivery challans found.</p>' : `
          <table><thead><tr><th>DC No.</th><th>Dispatch Date</th><th>Vehicle</th><th>Receiver</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody></table>
        `}
      </div>`;
  }

  function buildInvoicesSection(data: ReturnType<typeof gatherData>): string {
    const invs = (data as any).invoices || [];
    const rows = invs.map((inv: any) => `
      <tr>
        <td>${inv.invNo}</td>
        <td>${fmtDate(inv.invoiceDate)}</td>
        <td>${fmtDate(inv.dueDate)}</td>
        <td>${fmtCurrency(inv.totalAmount)}</td>
        <td>${fmtCurrency(inv.paidAmount)}</td>
        <td>${fmtCurrency(inv.totalAmount - (inv.paidAmount || 0))}</td>
        <td><span class="badge ${inv.status === "Paid" ? "badge-green" : inv.status === "PartiallyPaid" ? "badge-orange" : "badge-red"}">${inv.status}</span></td>
      </tr>`).join("");
    const totalAmt = invs.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0);
    const totalPaid = invs.reduce((s: number, i: any) => s + (i.paidAmount || 0), 0);
    return `
      <div class="section">
        <div class="section-header"><h2>Tax Invoices</h2></div>
        ${invs.length === 0 ? '<p class="no-data">No invoices found.</p>' : `
          <table><thead><tr><th>Invoice No.</th><th>Invoice Date</th><th>Due Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>${rows}
            <tr class="total-row"><td colspan="3">TOTAL</td><td>${fmtCurrency(totalAmt)}</td><td>${fmtCurrency(totalPaid)}</td><td>${fmtCurrency(totalAmt - totalPaid)}</td><td></td></tr>
          </tbody></table>
        `}
      </div>`;
  }

  function buildPaymentsSection(data: ReturnType<typeof gatherData>): string {
    const pmts = (data as any).payments || [];
    const invMap = Object.fromEntries(((data as any).invoices || []).map((i: any) => [i.id, i.invNo]));
    const rows = pmts.map((p: any) => `
      <tr>
        <td>${fmtDate(p.paymentDate)}</td>
        <td>${invMap[p.invoiceId] || "—"}</td>
        <td>${fmtCurrency(p.amount)}</td>
        <td>${p.mode}</td>
        <td>${p.referenceNo || "—"}</td>
        <td>${p.notes || "—"}</td>
      </tr>`).join("");
    const total = pmts.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    return `
      <div class="section">
        <div class="section-header"><h2>Payment History</h2></div>
        ${pmts.length === 0 ? '<p class="no-data">No payments found.</p>' : `
          <table><thead><tr><th>Date</th><th>Invoice</th><th>Amount</th><th>Mode</th><th>Reference</th><th>Notes</th></tr></thead>
          <tbody>${rows}
            <tr class="total-row"><td colspan="2">TOTAL RECEIVED</td><td>${fmtCurrency(total)}</td><td colspan="3"></td></tr>
          </tbody></table>
        `}
      </div>`;
  }

  function buildBOMSection(data: ReturnType<typeof gatherData>): string {
    const bom = (data as any).bomItems || [];
    const inv = (data as any).inventoryItems || [];
    const rows = bom.map((b: any) => {
      const item = inv.find((i: any) => i.id === b.inventoryItemId);
      const avail = item?.quantityAvailable || 0;
      const short = Math.max(0, b.requiredQuantity - avail);
      return `<tr>
        <td>${b.materialName}</td>
        <td>${b.requiredQuantity}</td>
        <td>${avail}</td>
        <td>${short > 0 ? `<span class="badge badge-red">Short ${short}</span>` : '<span class="badge badge-green">OK</span>'}</td>
        <td>${b.estimatedPrice ? fmtCurrency(b.estimatedPrice) : "—"}</td>
      </tr>`;
    }).join("");
    return `
      <div class="section">
        <div class="section-header"><h2>Bill of Materials</h2></div>
        ${bom.length === 0 ? '<p class="no-data">No BOM items defined.</p>' : `
          <table><thead><tr><th>Material</th><th>Required Qty</th><th>Available</th><th>Status</th><th>Est. Price</th></tr></thead>
          <tbody>${rows}</tbody></table>
        `}
      </div>`;
  }

  function buildDesignFilesSection(data: ReturnType<typeof gatherData>): string {
    const files = (data as any).designFiles || [];
    const rows = files.map((f: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td>${f.fileName}</td>
        <td>${f.fileType}</td>
        <td>${fmtDate(f.uploadedAt)}</td>
        <td>${f.fileName.match(/\.(dwg|dxf|step|igs|sldprt|sldasm)$/i) ? '<span class="badge badge-orange">CAD — Not Printable</span>' : '<span class="badge badge-green">Embedded</span>'}</td>
      </tr>`).join("");
    return `
      <div class="section">
        <div class="section-header"><h2>Design Files Index</h2></div>
        <p style="color:#6b7280;font-size:10px;margin-bottom:8px">Note: CAD files (.dwg, .dxf, .step) are listed here but cannot be embedded in the PDF. Download the project archive for original files.</p>
        ${files.length === 0 ? '<p class="no-data">No design files uploaded.</p>' : `
          <table><thead><tr><th>#</th><th>File Name</th><th>Type</th><th>Uploaded</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody></table>
        `}
      </div>`;
  }

  function buildMaterialPurchasesSection(data: ReturnType<typeof gatherData>): string {
    const purchases = (data as any).materialPurchases || [];
    const rows = purchases.map((m: any) => `
      <tr>
        <td>${m.materialType}</td>
        <td>${m.thickness || "—"}</td>
        <td>${m.quantity} ${m.unit || ""}</td>
        <td>${m.supplierName}</td>
        <td>${fmtDate(m.purchaseDate)}</td>
      </tr>`).join("");
    return `
      <div class="section">
        <div class="section-header"><h2>Material Purchases</h2></div>
        ${purchases.length === 0 ? '<p class="no-data">No material purchases recorded.</p>' : `
          <table><thead><tr><th>Material</th><th>Thickness</th><th>Qty</th><th>Supplier</th><th>Date</th></tr></thead>
          <tbody>${rows}</tbody></table>
        `}
      </div>`;
  }

  function buildMaterialUsageSection(data: ReturnType<typeof gatherData>): string {
    const usages = (data as any).materialUsages || [];
    const rows = usages.map((u: any) => `
      <tr>
        <td>${u.materialName}</td>
        <td>${u.quantityUsed}</td>
        <td>${fmtDate(u.usedDate)}</td>
        <td>${u.notes || "—"}</td>
      </tr>`).join("");
    return `
      <div class="section">
        <div class="section-header"><h2>Material Usage</h2></div>
        ${usages.length === 0 ? '<p class="no-data">No material usage recorded.</p>' : `
          <table><thead><tr><th>Material</th><th>Qty Used</th><th>Date</th><th>Notes</th></tr></thead>
          <tbody>${rows}</tbody></table>
        `}
      </div>`;
  }

  function buildOutsourcedSection(data: ReturnType<typeof gatherData>): string {
    const works = (data as any).outsourcedWorks || [];
    const rows = works.map((o: any) => `
      <tr>
        <td>${o.vendorName}</td>
        <td>${o.materialSent}</td>
        <td>${o.quantitySent}</td>
        <td>${fmtDate(o.dateSent)}</td>
        <td>${fmtDate(o.dateReceived)}</td>
        <td>${fmtCurrency(o.processCost)}</td>
      </tr>`).join("");
    return `
      <div class="section">
        <div class="section-header"><h2>Outsourced Work</h2></div>
        ${works.length === 0 ? '<p class="no-data">No outsourced work recorded.</p>' : `
          <table><thead><tr><th>Vendor</th><th>Material</th><th>Qty Sent</th><th>Date Sent</th><th>Date Received</th><th>Cost</th></tr></thead>
          <tbody>${rows}</tbody></table>
        `}
      </div>`;
  }

  function buildCostingSection(data: ReturnType<typeof gatherData>): string {
    const ic = (data as any).internalCosting;
    if (!ic) return `<div class="section"><div class="section-header"><h2>Internal Costing</h2></div><p class="no-data">No costing data.</p></div>`;
    const fixedRows = [
      ["Raw Material", ic.rawMaterialCost],
      ["CNC / Processing", ic.cncCost],
      ["Hardware", ic.hardwareCost],
      ["Powder Coating", ic.powderCoatingCost],
      ["Assembly", ic.assemblyCost],
      ["Packing", ic.packingCost],
      ["Labour", ic.labourCost],
      ["Machine / Equipment", ic.machineCost],
      ["Outsourced Work", ic.outsourceCost],
      ["Consumables", ic.consumablesCost],
      ["Electricity", ic.electricityCost],
      ["Scrap / Material Loss", ic.scrapLossCost],
      ["Transport", ic.transportCost],
    ].filter(([, v]) => v).map(([l, v]) => `<tr><td>${l}</td><td style="text-align:right">${fmtCurrency(v as number)}</td></tr>`).join("");
    const extraRows = (ic.extraCosts || []).map((e: any) => `<tr><td>${e.name} <span style="color:#6b7280;font-size:10px">(${e.category})</span></td><td style="text-align:right">${fmtCurrency(e.amount)}</td></tr>`).join("");
    const adjustmentRows = (ic.manualAdjustments || []).map((a: any) => `<tr><td>${a.name} <span style="color:${a.type === "Reduce Cost" ? "#dc2626" : "#16a34a"};font-size:10px">(${a.type})</span></td><td style="text-align:right;color:${a.type === "Reduce Cost" ? "#dc2626" : "#16a34a"}">${a.type === "Reduce Cost" ? "−" : "+"}${fmtCurrency(a.amount)}</td></tr>`).join("");
    const baseTotal = [ic.rawMaterialCost, ic.cncCost, ic.hardwareCost, ic.powderCoatingCost, ic.assemblyCost, ic.packingCost, ic.labourCost, ic.machineCost, ic.outsourceCost, ic.consumablesCost, ic.electricityCost, ic.scrapLossCost, ic.transportCost].filter(Boolean).reduce((s: number, v: any) => s + v, 0);
    const extraTotal = (ic.extraCosts || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
    const adjTotal = (ic.manualAdjustments || []).reduce((s: number, a: any) => s + (a.type === "Reduce Cost" ? -(a.amount || 0) : (a.amount || 0)), 0);
    const total = baseTotal + extraTotal + adjTotal;
    return `
      <div class="section">
        <div class="section-header"><h2>Internal Costing</h2></div>
        <table><thead><tr><th>Category / Item</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${fixedRows}${extraRows}${adjustmentRows}<tr class="total-row"><td>TOTAL COST</td><td style="text-align:right">${fmtCurrency(total)}</td></tr></tbody></table>
      </div>`;
  }

  function buildProfitSection(data: ReturnType<typeof gatherData>): string {
    const ic = (data as any).internalCosting;
    const invs = (data as any).invoices || [];
    const pmts = (data as any).payments || [];
    const totalInvoiced = invs.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0);
    const totalReceived = pmts.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const totalCost = ic ? (
      [ic.rawMaterialCost, ic.cncCost, ic.hardwareCost, ic.powderCoatingCost, ic.assemblyCost, ic.packingCost, ic.labourCost, ic.machineCost, ic.outsourceCost, ic.consumablesCost, ic.electricityCost, ic.scrapLossCost, ic.transportCost].filter(Boolean).reduce((s: number, v: any) => s + v, 0) +
      (ic.extraCosts || []).reduce((s: number, e: any) => s + (e.amount || 0), 0) +
      (ic.manualAdjustments || []).reduce((s: number, a: any) => s + (a.type === "Reduce Cost" ? -(a.amount || 0) : (a.amount || 0)), 0)
    ) : 0;
    const profit = totalInvoiced - totalCost;
    const margin = totalInvoiced > 0 ? ((profit / totalInvoiced) * 100).toFixed(1) : "0";
    return `
      <div class="section">
        <div class="section-header"><h2>Profit & Costing Summary</h2></div>
        <table>
          <tbody>
            <tr><td>Total Invoiced</td><td>${fmtCurrency(totalInvoiced)}</td></tr>
            <tr><td>Total Received</td><td>${fmtCurrency(totalReceived)}</td></tr>
            <tr><td>Outstanding</td><td>${fmtCurrency(totalInvoiced - totalReceived)}</td></tr>
            <tr><td>Total Cost</td><td>${fmtCurrency(totalCost)}</td></tr>
            <tr class="total-row"><td>Gross Profit</td><td>${fmtCurrency(profit)}</td></tr>
            <tr class="total-row"><td>Margin %</td><td>${margin}%</td></tr>
          </tbody>
        </table>
      </div>`;
  }

  function buildMachineUsageSection(data: ReturnType<typeof gatherData>): string {
    const logs = (data as any).machineUsageLogs || [];
    const machineMap = Object.fromEntries(((data as any).machines || []).map((m: any) => [m.id, m]));
    const rows = logs.map((l: any) => {
      const machine = machineMap[l.machineId];
      const cost = machine?.hourlyRate ? l.hoursUsed * machine.hourlyRate : undefined;
      return `<tr>
        <td>${l.logDate}</td>
        <td>${machine?.name || l.machineId}</td>
        <td>${machine?.type || "—"}</td>
        <td>${l.hoursUsed} hrs</td>
        <td>${l.operatorName || "—"}</td>
        <td>${cost !== undefined ? fmtCurrency(cost) : "—"}</td>
      </tr>`;
    }).join("");
    const totalHours = logs.reduce((s: number, l: any) => s + l.hoursUsed, 0);
    return `
      <div class="section">
        <div class="section-header"><h2>Machine Usage Log</h2></div>
        ${logs.length === 0 ? '<p class="no-data">No machine usage logged for this project.</p>' : `
          <table><thead><tr><th>Date</th><th>Machine</th><th>Type</th><th>Hours</th><th>Operator</th><th>Allocated Cost</th></tr></thead>
          <tbody>${rows}
            <tr class="total-row"><td colspan="3">TOTAL HOURS</td><td>${totalHours} hrs</td><td colspan="2"></td></tr>
          </tbody></table>
        `}
      </div>`;
  }

  function buildAttachmentsIndex(data: ReturnType<typeof gatherData>): string {
    const files: { name: string; section: string; type: string }[] = [];
    if (ctxType === "project") {
      ((data as any).designFiles || []).forEach((f: any) => files.push({ name: f.fileName, section: "Design Files", type: f.fileType }));
      ((data as any).materialPurchases || []).forEach((m: any) => (m.attachments || []).forEach((a: any) => files.push({ name: a.name, section: "Material Purchases", type: a.type })));
    }
    ((data as any).masterPOs || []).forEach((po: any) => (po.files || []).forEach((f: any) => files.push({ name: f.name, section: "Purchase Orders", type: f.type })));
    ((data as any).payments || []).forEach((p: any) => (p.files || []).forEach((f: any) => files.push({ name: f.name, section: "Payments", type: f.type })));

    const rows = files.map((f, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${f.name}</td>
        <td>${f.section}</td>
        <td>${f.type}</td>
      </tr>`).join("");
    return `
      <div class="section">
        <div class="section-header"><h2>Appendix: Attachments Index</h2></div>
        <p style="color:#6b7280;font-size:10px;margin-bottom:8px">This index lists all uploaded files. Use the ZIP export to download original files.</p>
        ${files.length === 0 ? '<p class="no-data">No attachments found.</p>' : `
          <table><thead><tr><th>#</th><th>File Name</th><th>Section</th><th>Type</th></tr></thead>
          <tbody>${rows}</tbody></table>
        `}
      </div>`;
  }

  // ── Build full HTML document ─────────────────────────────────

  function buildFullHTML(): string {
    const data = gatherData();
    const sections: string[] = [];

    const ordered: ExportSectionId[] = [
      "cover_page", "quotations", "purchase_orders", "bom", "design_files",
      "material_purchases", "material_usage", "production_history", "outsourced_work",
      "qc_reports", "delivery_challans", "invoices", "payment_history",
      "internal_costing", "profit_summary", "machine_usage", "attachments_index",
    ];

    for (const id of ordered) {
      if (!selectedSections.has(id)) continue;
      switch (id) {
        case "cover_page": sections.push(buildCoverSection(data)); break;
        case "quotations": sections.push(buildQuotationsSection(data)); break;
        case "bom": sections.push(buildBOMSection(data)); break;
        case "design_files": sections.push(buildDesignFilesSection(data)); break;
        case "material_purchases": sections.push(buildMaterialPurchasesSection(data)); break;
        case "material_usage": sections.push(buildMaterialUsageSection(data)); break;
        case "production_history": sections.push(buildProductionSection(data)); break;
        case "outsourced_work": sections.push(buildOutsourcedSection(data)); break;
        case "qc_reports": sections.push(buildQCSection(data)); break;
        case "delivery_challans": sections.push(buildChallansSection(data)); break;
        case "invoices": sections.push(buildInvoicesSection(data)); break;
        case "payment_history": sections.push(buildPaymentsSection(data)); break;
        case "internal_costing": sections.push(buildCostingSection(data)); break;
        case "profit_summary": sections.push(buildProfitSection(data)); break;
        case "machine_usage": sections.push(buildMachineUsageSection(data)); break;
        case "attachments_index": sections.push(buildAttachmentsIndex(data)); break;
        default: break;
      }
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${ctxName} — FabFlow Report</title><style>${PRINT_STYLES}</style></head><body>${sections.join("\n")}</body></html>`;
  }

  // ── Actions ──────────────────────────────────────────────────

  function handlePrint() {
    if (selectedSections.size === 0) { toast.error("Select at least one section"); return; }
    setGenerating(true);
    setTimeout(() => {
      try {
        const html = buildFullHTML();
        const win = window.open("", "_blank", "width=900,height=700");
        if (!win) { toast.error("Popup blocked — allow popups for this site"); setGenerating(false); return; }
        win.document.write(html);
        win.document.close();
        win.onload = () => { win.focus(); win.print(); };
        toast.success("Report opened in print preview");
      } catch (e) {
        toast.error("Error generating report");
        console.error(e);
      }
      setGenerating(false);
    }, 100);
  }

  function handleDownloadHTML() {
    if (selectedSections.size === 0) { toast.error("Select at least one section"); return; }
    setGenerating(true);
    setTimeout(() => {
      try {
        const html = buildFullHTML();
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${ctxName.replace(/[^a-z0-9]/gi, "_")}_Report_${new Date().toISOString().split("T")[0]}.html`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Report downloaded as HTML — open in browser and print to PDF");
      } catch (e) {
        toast.error("Error generating report");
      }
      setGenerating(false);
    }, 100);
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 mt-0.5">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <FileDown className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">Generate Report</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ctxType === "project" ? (
              <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{ctxName}</span>
            ) : (
              <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{ctxName}</span>
            )}
          </p>
        </div>
      </div>

      {/* Section Selector */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h2 className="font-semibold text-sm">Select Sections</h2>
            <p className="text-xs text-muted-foreground">{selectedSections.size} of {availableSections.length} selected</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={selectAll}>
              <CheckSquare className="w-3.5 h-3.5" /> All
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={deselectAll}>
              <Square className="w-3.5 h-3.5" /> None
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {Object.entries(groupedSections).map(([group, sections]) => (
            <div key={group}>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">{group}</p>
              <div className="space-y-2">
                {sections.map((section) => {
                  const checked = selectedSections.has(section.id);
                  return (
                    <div
                      key={section.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checked ? "bg-primary/5 border-primary/30" : "hover:bg-muted/30"}`}
                      onClick={() => toggleSection(section.id)}
                      onKeyDown={(e) => e.key === " " && toggleSection(section.id)}
                      role="checkbox"
                      aria-checked={checked}
                      tabIndex={0}
                    >
                      <Checkbox checked={checked} className="mt-0.5 shrink-0" onCheckedChange={() => toggleSection(section.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{section.label}</span>
                          {section.hasFiles && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              includes files
                            </Badge>
                          )}
                          {section.requiresPermission && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              finance
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export Actions */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <h2 className="font-semibold text-sm">Export</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handlePrint}
            disabled={generating || selectedSections.size === 0}
            className="flex items-center gap-3 p-4 rounded-lg border-2 border-primary/20 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 transition-all disabled:opacity-50 text-left"
          >
            <Printer className="w-6 h-6 text-primary shrink-0" />
            <div>
              <p className="font-semibold text-sm">Print / Save as PDF</p>
              <p className="text-xs text-muted-foreground">Opens print dialog — use "Save as PDF" in your browser</p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleDownloadHTML}
            disabled={generating || selectedSections.size === 0}
            className="flex items-center gap-3 p-4 rounded-lg border-2 border-border hover:border-border/80 bg-muted/30 hover:bg-muted/50 transition-all disabled:opacity-50 text-left"
          >
            <Download className="w-6 h-6 text-muted-foreground shrink-0" />
            <div>
              <p className="font-semibold text-sm">Download HTML Report</p>
              <p className="text-xs text-muted-foreground">Download as .html file — open in browser and print to PDF</p>
            </div>
          </button>
        </div>

        {generating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Assembling report sections...
          </div>
        )}

        {selectedSections.size === 0 && (
          <p className="text-xs text-destructive">Select at least one section to generate a report.</p>
        )}

        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground">
            <strong>How to save as PDF:</strong> Click "Print / Save as PDF" → In the print dialog, change Destination to "Save as PDF" → Click Save.
            This works in Chrome, Edge, Firefox, and Safari.
          </p>
        </div>
      </div>
    </div>
  );
}
