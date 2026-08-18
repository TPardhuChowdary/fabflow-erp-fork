import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { ForcePasswordChangeScreen } from "./components/ForcePasswordChangeScreen";
import { InvoicePrintView } from "./components/InvoicePrintView";
import { Layout } from "./components/Layout";
import { QuotationPrintView } from "./components/QuotationPrintView";
import { DrawingEditorPage } from "./drawingEditor/pages/DrawingEditorPage";
import { useSupabaseHydration } from "./hooks/useSupabaseHydration";
import CompanyPOs from "./pages/CompanyPOs";
import { CustomerHistory } from "./pages/CustomerHistory";
import { Customers } from "./pages/Customers";
import { Dashboard } from "./pages/Dashboard";
import { DeliveryChallans } from "./pages/DeliveryChallans";
import { Dies } from "./pages/Dies";
import { EmployeeDetail } from "./pages/EmployeeDetail";
import { Employees } from "./pages/Employees";
import { ExportEngine } from "./pages/ExportEngine";
import { Inventory } from "./pages/Inventory";
import { Invoices } from "./pages/Invoices";
import { Ledger } from "./pages/Ledger";
import { LoginPage } from "./pages/LoginPage";
import { MachineDetail } from "./pages/MachineDetail";
import { MachineRevenue } from "./pages/MachineRevenue";
import { Machinery } from "./pages/Machinery";
import { MaterialRequisitions } from "./pages/MaterialRequisitions";
import { Payables } from "./pages/Payables";
import { Payments } from "./pages/Payments";
import PettyExpenses from "./pages/PettyExpenses";
import { Production } from "./pages/Production";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Projects } from "./pages/Projects";
import { PurchaseOrders } from "./pages/PurchaseOrders";
import { Quality } from "./pages/Quality";
import { Quotations } from "./pages/Quotations";
import { ScrapManagement } from "./pages/ScrapManagement";
import { Settings } from "./pages/Settings";
import { Tools } from "./pages/Tools";
import { Vendors } from "./pages/Vendors";
import { canView } from "./permissions";
import { InspectionSheetsList } from "./qms/pages/InspectionSheetsList";
import { InspectorDashboard } from "./qms/pages/InspectorDashboard";
import { QmsDashboard } from "./qms/pages/QmsDashboard";
import { QualityCharacteristicLibrary } from "./qms/pages/QualityCharacteristicLibrary";
import { useStore } from "./store";
import type { Invoice, Page, Quotation } from "./types";

function AppInner() {
  const { currentUser, isInitializing } = useAuth();
  // Phase 18 — independent of the local-auth gate above: checks its own
  // Supabase Auth session and safely no-ops if none exists (see
  // useSupabaseHydration.ts for the full rationale).
  useSupabaseHydration();
  const [page, setPage] = useState<Page>("dashboard");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(
    null,
  );
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");
  const [exportContext, setExportContext] = useState<{
    type: "project" | "customer";
    id: string;
    name: string;
  } | null>(null);
  const [selectedDrawingEditorContext, setSelectedDrawingEditorContext] =
    useState<{
      ownerType?: "project" | "machine";
      ownerId?: string;
      drawingId?: string;
    } | null>(null);
  /** Carries a one-shot "land on this tab, highlight this row" instruction
   * for a cross-module navigation (e.g. Petty Expense History's "View
   * Inventory Record"). Consumed by Inventory/MachineDetail/EmployeeDetail
   * as initialTab/highlight props. */
  const [moduleNavContext, setModuleNavContext] = useState<{
    tab?: string;
    highlightId?: string;
  } | null>(null);

  // Clear the carried-over project/drawing context as soon as the user
  // leaves the editor — otherwise clicking the plain global nav item after
  // visiting a project would incorrectly reopen that project's context.
  useEffect(() => {
    if (page !== "drawing-editor" && selectedDrawingEditorContext) {
      setSelectedDrawingEditorContext(null);
    }
  }, [page, selectedDrawingEditorContext]);

  // Same rationale as above, for moduleNavContext: only relevant on the
  // three pages it can target, otherwise clear it so a later plain visit
  // to that page doesn't inherit a stale highlight/tab.
  useEffect(() => {
    if (
      page !== "inventory" &&
      page !== "machine-detail" &&
      page !== "employee-detail" &&
      moduleNavContext
    ) {
      setModuleNavContext(null);
    }
  }, [page, moduleNavContext]);
  const { customers } = useStore();

  const sendEmailReminder = async (inv: Invoice) => {
    try {
      await fetch("https://your-backend-url.onrender.com/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: (inv as any).email,
          subject: "Payment Reminder",
          message: `Invoice ${inv.invNo} is pending`,
        }),
      });
    } catch (e) {
      console.error("Reminder failed", e);
    }
  };

  const runReminderCheck = () => {
    const raw = localStorage.getItem("invoices");
    const invoiceList: Invoice[] = raw ? JSON.parse(raw) : [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let changed = false;

    for (const inv of invoiceList) {
      if (!inv.reminderEnabled) continue;
      if (inv.status === "Paid") continue;
      if (!inv.nextReminderAt) continue;

      const next = new Date(inv.nextReminderAt);
      next.setHours(0, 0, 0, 0);

      if (next <= today) {
        if (inv.lastReminderSentAt) {
          const last = new Date(inv.lastReminderSentAt);
          if (last.toDateString() === today.toDateString()) continue;
        }

        sendEmailReminder(inv);

        inv.lastReminderSentAt = today.toISOString();
        inv.reminderCount = (inv.reminderCount || 0) + 1;

        const nextDate = new Date(today);
        nextDate.setDate(nextDate.getDate() + (inv.reminderIntervalDays || 5));
        inv.nextReminderAt = nextDate.toISOString();
        changed = true;
      }
    }

    if (changed) {
      localStorage.setItem("invoices", JSON.stringify(invoiceList));
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: scheduler only needs to run once on mount
  useEffect(() => {
    runReminderCheck();
    const interval = setInterval(runReminderCheck, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  if (currentUser.mustChangePassword) {
    return <ForcePasswordChangeScreen />;
  }

  const accessDenied = (
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

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return <Dashboard onNavigate={setPage} />;
      case "customers":
        return (
          <Customers
            onViewHistory={(id) => {
              setSelectedCustomerId(id);
              setPage("customer-history");
            }}
          />
        );
      case "customer-history":
        if (!canView(currentUser, "customers")) return accessDenied;
        return (
          <CustomerHistory
            customerId={selectedCustomerId}
            onNavigate={setPage}
            onViewInvoice={setSelectedInvoice}
            onViewQuotation={setSelectedQuotation}
            onViewProject={(id) => {
              setSelectedProjectId(id);
              setPage("project-detail");
            }}
            onGenerateReport={(id, name) => {
              setExportContext({ type: "customer", id, name });
              setPage("export-engine");
            }}
          />
        );
      case "projects":
        return (
          <Projects
            onViewProject={(id) => {
              setSelectedProjectId(id);
              setPage("project-detail");
            }}
          />
        );
      case "project-detail":
        if (!canView(currentUser, "projects")) return accessDenied;
        return (
          <ProjectDetail
            projectId={selectedProjectId}
            onBack={() => setPage("projects")}
            onGenerateReport={(id, name) => {
              setExportContext({ type: "project", id, name });
              setPage("export-engine");
            }}
            onOpenDrawingEditor={(context) => {
              setSelectedDrawingEditorContext({
                ownerType: "project",
                ownerId: context.projectId,
                drawingId: context.drawingId,
              });
              setPage("drawing-editor");
            }}
          />
        );
      case "employees":
        return (
          <Employees
            onViewEmployee={(id) => {
              setSelectedEmployeeId(id);
              setPage("employee-detail");
            }}
          />
        );
      case "employee-detail":
        return (
          <EmployeeDetail
            employeeId={selectedEmployeeId}
            onBack={() => setPage("employees")}
            initialTab={moduleNavContext?.tab}
          />
        );
      case "inventory":
        return (
          <Inventory
            initialTab={
              moduleNavContext?.tab as "stock" | "purchases" | undefined
            }
            highlightPurchaseId={moduleNavContext?.highlightId}
          />
        );
      case "settings":
        if (!canView(currentUser, "settings")) return accessDenied;
        return <Settings />;
      case "quotations":
        return <Quotations />;
      case "purchase-orders":
        if (!canView(currentUser, "purchase_orders")) return accessDenied;
        return <PurchaseOrders />;
      case "company-po":
        return <CompanyPOs />;
      case "production":
        return (
          <Production
            onOpenProject={(id) => {
              setSelectedProjectId(id);
              setPage("project-detail");
            }}
          />
        );
      case "material-requisitions":
        if (!canView(currentUser, "material_requisitions")) return accessDenied;
        return <MaterialRequisitions />;
      case "quality":
        return <Quality />;
      case "delivery-challans":
        return <DeliveryChallans />;
      case "invoices":
        return <Invoices />;
      case "payments":
        if (!canView(currentUser, "payments")) return accessDenied;
        return <Payments />;
      case "payables":
        if (!canView(currentUser, "payables")) return accessDenied;
        return <Payables />;
      case "petty-expenses":
        if (!canView(currentUser, "petty_expenses")) return accessDenied;
        return (
          <PettyExpenses
            onViewInventoryPurchase={(purchaseId) => {
              setModuleNavContext({
                tab: "purchases",
                highlightId: purchaseId,
              });
              setPage("inventory");
            }}
            onViewMachineService={(machineId, serviceId) => {
              if (!canView(currentUser, "machinery")) return;
              setSelectedMachineId(machineId);
              setModuleNavContext({ tab: "service", highlightId: serviceId });
              setPage("machine-detail");
            }}
            onViewEmployeeRecord={(employeeId) => {
              if (!canView(currentUser, "employees")) return;
              setSelectedEmployeeId(employeeId);
              setModuleNavContext({ tab: "salary" });
              setPage("employee-detail");
            }}
          />
        );
      case "vendors":
        return <Vendors onNavigate={setPage} />;
      case "machinery":
        if (!canView(currentUser, "machinery")) return accessDenied;
        return (
          <Machinery
            onViewMachine={(id) => {
              setSelectedMachineId(id);
              setPage("machine-detail");
            }}
          />
        );
      case "machine-detail":
        if (!canView(currentUser, "machinery")) return accessDenied;
        return (
          <MachineDetail
            machineId={selectedMachineId}
            onBack={() => setPage("machinery")}
            initialTab={moduleNavContext?.tab}
            highlightServiceId={moduleNavContext?.highlightId}
            onOpenDrawingEditor={(context) => {
              setSelectedDrawingEditorContext({
                ownerType: "machine",
                ownerId: context.machineId,
                drawingId: context.drawingId,
              });
              setPage("drawing-editor");
            }}
          />
        );
      case "tools":
        if (!canView(currentUser, "tools")) return accessDenied;
        return <Tools />;
      case "dies":
        if (!canView(currentUser, "tooling_dies")) return accessDenied;
        return <Dies />;
      case "machine-revenue":
        if (!canView(currentUser, "machine_revenue")) return accessDenied;
        return <MachineRevenue />;
      case "export-engine":
        if (!canView(currentUser, "export_engine")) return accessDenied;
        return (
          <ExportEngine
            context={exportContext}
            onBack={() => {
              if (exportContext?.type === "project") setPage("project-detail");
              else setPage("customers");
            }}
          />
        );
      case "scrap":
        return <ScrapManagement />;
      case "qms-dashboard":
        if (!canView(currentUser, "quality_characteristics"))
          return accessDenied;
        return <QmsDashboard onNavigate={setPage} />;
      case "qms-characteristics":
        if (!canView(currentUser, "quality_characteristics"))
          return accessDenied;
        return <QualityCharacteristicLibrary />;
      case "qms-inspection-sheets":
        if (!canView(currentUser, "inspection_sheets")) return accessDenied;
        return (
          <InspectionSheetsList
            onViewProject={(id) => {
              setSelectedProjectId(id);
              setPage("project-detail");
            }}
          />
        );
      case "qms-my-inspections":
        if (!canView(currentUser, "inspection_sheets")) return accessDenied;
        return (
          <InspectorDashboard
            onOpenProject={(id) => {
              setSelectedProjectId(id);
              setPage("project-detail");
            }}
          />
        );
      case "drawing-editor":
        if (!canView(currentUser, "drawing_editor")) return accessDenied;
        return (
          <DrawingEditorPage
            initialOwnerType={selectedDrawingEditorContext?.ownerType}
            initialOwnerId={selectedDrawingEditorContext?.ownerId}
            initialDrawingId={selectedDrawingEditorContext?.drawingId}
            onExitContext={
              selectedDrawingEditorContext?.ownerType === "machine"
                ? () => setPage("machine-detail")
                : selectedDrawingEditorContext?.ownerType === "project"
                  ? () => setPage("project-detail")
                  : undefined
            }
          />
        );
      case "ledger":
        if (!canView(currentUser, "ledger")) return accessDenied;
        return <Ledger />;
      default:
        return <Dashboard onNavigate={setPage} />;
    }
  };

  return (
    <>
      <Layout currentPage={page} onNavigate={setPage}>
        {renderPage()}
      </Layout>
      <Toaster richColors position="top-right" />
      <InvoicePrintView
        invoice={selectedInvoice}
        customer={
          customers.find((c) => c.id === selectedInvoice?.customerId) ?? null
        }
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
      <QuotationPrintView
        quotation={selectedQuotation}
        customer={
          customers.find((c) => c.id === selectedQuotation?.customerId) ?? null
        }
        open={!!selectedQuotation}
        onClose={() => setSelectedQuotation(null)}
      />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
