import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { InvoicePrintView } from "./components/InvoicePrintView";
import { Layout } from "./components/Layout";
import { QuotationPrintView } from "./components/QuotationPrintView";
import CompanyPOs from "./pages/CompanyPOs";
import { CustomerHistory } from "./pages/CustomerHistory";
import { Customers } from "./pages/Customers";
import { Dashboard } from "./pages/Dashboard";
import { DeliveryChallans } from "./pages/DeliveryChallans";
import { EmployeeDetail } from "./pages/EmployeeDetail";
import { Employees } from "./pages/Employees";
import { Inventory } from "./pages/Inventory";
import { Invoices } from "./pages/Invoices";
import { LoginPage } from "./pages/LoginPage";
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
import { Settings } from "./pages/Settings";
import { Vendors } from "./pages/Vendors";
import { canView } from "./permissions";
import { useStore } from "./store";
import type { Invoice, Page, Quotation } from "./types";

function AppInner() {
  const { currentUser, isInitializing } = useAuth();
  const [page, setPage] = useState<Page>("dashboard");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(
    null,
  );
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
          />
        );
      case "inventory":
        return <Inventory />;
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
        return <Production />;
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
        return <PettyExpenses />;
      case "vendors":
        return <Vendors onNavigate={setPage} />;
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
