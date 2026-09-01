import { AgentScreen } from "./AgentScreen";
import { CustomerWorkspace } from "./CustomerWorkspace";
// UX Redesign Lab — maps a (view, id) pair to the right shared screen.
// Every model calls this the same way; what differs per model is only
// how the user ARRIVES at a given (view, id), not what renders once
// they're there — that's the honest reuse boundary for this lab.
// Covers every real FabFlow module (see data.ts's header for the
// ground-truth source): list+detail depth is concentrated on Projects,
// Vendors, Customers, and QMS (the relationship chains the brief names
// explicitly) — every other module gets a genuinely real, searchable,
// sortable list, disclosed in the final report rather than padded out
// with fake bespoke screens for modules that are administratively thin
// in the real ERP too (Ledger, Petty Expenses, Scrap, etc.).
import {
  CompanyPOsScreen,
  CustomerPOsScreen,
  CustomersScreen,
  DeliveryChallansScreen,
  DiesScreen,
  DrawingRepositoryScreen,
  EmployeesScreen,
  ExportEngineScreen,
  InventoryScreen,
  InvoicesScreen,
  LedgerScreen,
  MachineRevenueScreen,
  MachineryScreen,
  MaterialRequisitionsScreen,
  PODetailScreen,
  PayablesScreen,
  PaymentsScreen,
  PettyExpensesScreen,
  ProductionScreen,
  ProjectsScreen,
  QuotationsScreen,
  ReportsScreen,
  ScrapScreen,
  SettingsScreen,
  ToolsScreen,
  VendorsScreen,
} from "./GenericScreens";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { QmsWorkspace } from "./QmsWorkspace";
import { VendorWorkspace } from "./VendorWorkspace";

export type ViewKey =
  | "project"
  | "projects"
  | "po"
  | "purchase-orders"
  | "quotations"
  | "customers"
  | "customer"
  | "vendors"
  | "vendor"
  | "machinery"
  | "tools"
  | "dies"
  | "employees"
  | "inventory"
  | "drawings"
  | "invoices"
  | "payments"
  | "payables"
  | "qms"
  | "settings"
  | "reports"
  | "delivery-challans"
  | "company-po"
  | "petty-expenses"
  | "ledger"
  | "machine-revenue"
  | "scrap"
  | "material-requisitions"
  | "production"
  | "export-engine"
  | "ai-agent";

export function ModuleRouter({
  view,
  id,
  onNavigate,
}: {
  view: ViewKey;
  id: string;
  onNavigate: (view: string, id: string) => void;
}) {
  switch (view) {
    case "project":
      return <ProjectWorkspace projectId={id} onNavigate={onNavigate} />;
    case "projects":
      return <ProjectsScreen onNavigate={onNavigate} />;
    case "vendor":
      return <VendorWorkspace vendorId={id} onNavigate={onNavigate} />;
    case "customer":
      return <CustomerWorkspace customerId={id} onNavigate={onNavigate} />;
    case "po":
      return <PODetailScreen poId={id} />;
    case "quotations":
      return <QuotationsScreen onNavigate={onNavigate} />;
    case "customers":
      // Full real parity (fields, dialogs, delete guard) — see
      // PARITY_TRACKER.md #1. Not the generic SimpleListScreen anymore.
      return <CustomersScreen onNavigate={onNavigate} />;
    case "vendors":
      // Full real parity — see PARITY_TRACKER.md #2.
      return <VendorsScreen onNavigate={onNavigate} />;
    case "purchase-orders":
      // Full real parity — real Company PO (vendor-side): line items,
      // GST%, file attachment, status workflow, Print/Download/Share
      // (simulated). See PARITY_TRACKER.md #15. NOT the old
      // `purchaseOrders`/`approvePO` demo entity — that stays intact,
      // unreachable from the sidebar now but still read by 3 of the 10
      // pre-existing models via the "po" ViewKey.
      return <CompanyPOsScreen />;
    case "machinery":
      // Full real parity — real 5-status/12-type taxonomy, KPI row,
      // filters, Add/Edit (no Delete — matches real absence). See
      // PARITY_TRACKER.md #10.
      return <MachineryScreen />;
    case "tools":
      // Full real parity — KPI row, status filter/search, Add/Edit/
      // Delete, History panel with Issue/Reassign/Return. See
      // PARITY_TRACKER.md #11.
      return <ToolsScreen />;
    case "dies":
      // Full real parity — KPI row, status filter/search, Add/Edit/
      // Delete, mandatory drawing-link-on-create rule. See
      // PARITY_TRACKER.md #12. Real production has this as a separate
      // sidebar item/permission ("tooling_dies") from Tools — split out
      // to match, correcting this lab's earlier collapsed nav entry.
      return <DiesScreen />;
    case "employees":
      // Full real parity — photo, salary (canSeeSalary gate is
      // presentation-level here), View/Edit/Delete, duplicate-name+
      // phone warning on Create. See PARITY_TRACKER.md #13.
      return <EmployeesScreen />;
    case "inventory":
      // Full real parity — real categories, Add/Edit/Delete Item,
      // Record Purchase. See PARITY_TRACKER.md #9.
      return <InventoryScreen />;
    case "material-requisitions":
      // Full real parity — filter tabs with live counts, real Mark as
      // Completed action. See PARITY_TRACKER.md #21.
      return <MaterialRequisitionsScreen />;
    case "production":
      // Full real parity — real per-project stage config, sequential-
      // lock enforcement, Send/Receive Material with transaction log.
      // See PARITY_TRACKER.md #20. NOT the old `stages`/`advanceStage`
      // demo entity — that stays intact, still read by Model1Pipeline.
      return <ProductionScreen />;
    case "drawings":
      // Full real parity — real owner classification (project/machine/
      // library), real category taxonomy, real many-to-many links. See
      // PARITY_TRACKER.md #27. Disclosed gap: no canvas annotation
      // Editor (fabric.js/pdf.js graphics engine, not reproducible).
      return <DrawingRepositoryScreen />;
    case "invoices":
      // Full real parity — line items, editable tax rates, tax/proforma
      // type, PO linkage, status workflow. See PARITY_TRACKER.md #6.
      return <InvoicesScreen onNavigate={onNavigate} />;
    case "payments":
      // Full real parity — Record Payment with the real overpayment
      // guard. See PARITY_TRACKER.md #7.
      return <PaymentsScreen />;
    case "payables":
      // Full real parity — Add Payable, Add Payment against a payable
      // with the real overpayment guard. See PARITY_TRACKER.md #8.
      return <PayablesScreen onNavigate={onNavigate} />;
    case "delivery-challans":
      // Full real parity — multi-project challans, per-project dispatch-
      // qty cap, 4 dispatch methods, delivery address toggle, status
      // workflow, Print/Download/Share (simulated). See
      // PARITY_TRACKER.md #14.
      return <DeliveryChallansScreen />;
    case "company-po":
      // Real production page here is pages/PurchaseOrders.tsx — "Customer
      // Purchase Orders" (Sales), backed by the real QuotationPO entity
      // created via Quotations' "Record PO" — see PARITY_TRACKER.md #5.
      return <CustomerPOsScreen onNavigate={onNavigate} />;
    case "petty-expenses":
      // Full real parity — Records + Floats tabs, real 12-category
      // taxonomy, real Expense Float lifecycle with derived balance/
      // status. See PARITY_TRACKER.md #16.
      return <PettyExpensesScreen />;
    case "ledger":
      // Full real parity — real ledger aggregation engine over existing
      // Quotations/Invoices/Payments/Payables/PayablePayments (a pure
      // read-only derivation, no new records), Customer/Vendor tabs,
      // opening/running/closing balance, all-time outstanding. See
      // PARITY_TRACKER.md #19.
      return <LedgerScreen />;
    case "machine-revenue":
      // Full real parity — billable services, insert-only rate history
      // (Change Rate), per-service usage with frozen rateApplied/
      // revenueAmount, real delete-block-reason guard. Revenue-only,
      // never profit/costing. See PARITY_TRACKER.md #17.
      return <MachineRevenueScreen />;
    case "scrap":
      // Full real parity — KPI row, real 3-status workflow, row-click-
      // to-edit, generated/reusable/sold/disposed qty breakdown. See
      // PARITY_TRACKER.md #18.
      return <ScrapScreen />;
    case "export-engine":
      // Full real parity — real 17-section manifest, real grouping,
      // real default selection, project/customer context. See
      // PARITY_TRACKER.md #28. "Generate" is simulated — see the
      // screen's own header comment for why.
      return <ExportEngineScreen />;
    case "qms":
      return <QmsWorkspace />;
    case "ai-agent":
      // Real "Classic mode" deterministic parser + confirm-before-write
      // pipeline — the real LLM chat panel is a disclosed infeasible gap
      // (no backend to hold an API key). See PARITY_TRACKER.md #30.
      return <AgentScreen />;
    case "settings":
      return <SettingsScreen />;
    case "reports":
      return <ReportsScreen />;
    default:
      return <p className="text-sm text-gray-500">Unknown view.</p>;
  }
}
