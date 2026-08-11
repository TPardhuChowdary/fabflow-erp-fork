import type React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileText,
  Package,
  Receipt,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { useStore } from "../store";
import type { Page } from "../types";

interface Props {
  onNavigate: (p: Page) => void;
}

export function Dashboard({ onNavigate }: Props) {
  const { invoices, payments, customers, projects, quotations, machines, inventoryItems, payables } = useStore();

  const activeProjects = (projects || []).length;
  const activeQuotations = (quotations || []).filter(
    (q) => q.status === "Draft" || q.status === "Sent",
  ).length;
  const pendingInvoices = invoices.filter(
    (i) => i.status === "Unpaid" && (i.invoiceType ?? "tax") !== "proforma",
  ).length;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  const pipeline = [
    {
      label: "Quotations",
      count: (quotations || []).length,
      color: "bg-blue-500",
    },
    {
      label: "Projects",
      count: (projects || []).length,
      color: "bg-purple-500",
    },
    {
      label: "Invoiced",
      count: (invoices || []).length,
      color: "bg-green-500",
    },
  ];

  const recentProjects = [...(projects || [])]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
  const recentQuotations = [...(quotations || [])]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);

  // ── Operational Alerts ──────────────────────────────────────────
  const today = new Date();
  const todayMs = today.getTime();

  const overdueInvoices = (invoices || []).filter(
    (i) => i.status !== "Paid" && i.invoiceType !== "proforma" && i.dueDate && new Date(i.dueDate).getTime() < todayMs,
  );

  const overduePayables = (payables || []).filter(
    (p) => p.paidAmount < p.totalAmount && p.dueDate && new Date(p.dueDate).getTime() < todayMs,
  );

  const breakdownMachines = (machines || []).filter((m) => m.currentStatus === "Breakdown");

  const serviceOverdueMachines = (machines || []).filter((m) => {
    if (!m.nextServiceDue || m.currentStatus === "Decommissioned") return false;
    return new Date(m.nextServiceDue).getTime() < todayMs;
  });

  const lowStockItems = (inventoryItems || []).filter((item) => {
    const reorder = (item as any).reorderLevel;
    return reorder != null && (item.quantityAvailable ?? 0) <= reorder;
  });

  interface Alert {
    id: string;
    level: "critical" | "warning" | "info";
    icon: React.ReactNode;
    title: string;
    detail: string;
    navigate?: Page;
  }

  const alerts: Alert[] = [];

  if (breakdownMachines.length > 0) {
    alerts.push({
      id: "breakdown",
      level: "critical",
      icon: <Zap className="w-4 h-4" />,
      title: `${breakdownMachines.length} Machine Breakdown${breakdownMachines.length > 1 ? "s" : ""}`,
      detail: breakdownMachines.map((m) => m.name).join(", "),
      navigate: "machinery",
    });
  }

  if (overdueInvoices.length > 0) {
    const total = overdueInvoices.reduce((s, i) => s + ((i.totalAmount ?? 0) - (i.paidAmount ?? 0)), 0);
    alerts.push({
      id: "overdue-inv",
      level: "critical",
      icon: <Receipt className="w-4 h-4" />,
      title: `${overdueInvoices.length} Overdue Invoice${overdueInvoices.length > 1 ? "s" : ""}`,
      detail: `${fmt(total)} outstanding`,
      navigate: "invoices",
    });
  }

  if (overduePayables.length > 0) {
    const total = overduePayables.reduce((s, p) => s + ((p.totalAmount ?? 0) - (p.paidAmount ?? 0)), 0);
    alerts.push({
      id: "overdue-pay",
      level: "warning",
      icon: <CreditCard className="w-4 h-4" />,
      title: `${overduePayables.length} Overdue Payable${overduePayables.length > 1 ? "s" : ""}`,
      detail: `${fmt(total)} due to vendors`,
      navigate: "payables",
    });
  }

  if (serviceOverdueMachines.length > 0) {
    alerts.push({
      id: "service-due",
      level: "warning",
      icon: <Wrench className="w-4 h-4" />,
      title: `${serviceOverdueMachines.length} Machine${serviceOverdueMachines.length > 1 ? "s" : ""} Service Overdue`,
      detail: serviceOverdueMachines.map((m) => m.name).join(", "),
      navigate: "machinery",
    });
  }

  if (lowStockItems.length > 0) {
    alerts.push({
      id: "low-stock",
      level: "warning",
      icon: <Package className="w-4 h-4" />,
      title: `${lowStockItems.length} Low Stock Item${lowStockItems.length > 1 ? "s" : ""}`,
      detail: lowStockItems.map((i) => i.name).slice(0, 3).join(", ") + (lowStockItems.length > 3 ? "…" : ""),
      navigate: "inventory",
    });
  }

  return (
    <div className="space-y-6" data-ocid="dashboard.page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onNavigate("projects")}
            data-ocid="dashboard.new_project.primary_button"
          >
            + New Project
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate("quotations")}
            data-ocid="dashboard.view_quotations.secondary_button"
          >
            Quotations
          </Button>
        </div>
      </div>

      {/* Factory Alerts */}
      {alerts.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" data-ocid="dashboard.alerts.section">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Factory Alerts</span>
            <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">{alerts.length} action{alerts.length > 1 ? "s" : ""} needed</span>
          </div>
          <div className="divide-y divide-amber-100 dark:divide-amber-900">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${alert.navigate ? "cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-900/30 transition-colors" : ""}`}
                onClick={() => alert.navigate && onNavigate(alert.navigate)}
                onKeyDown={(e) => e.key === "Enter" && alert.navigate && onNavigate(alert.navigate)}
                role={alert.navigate ? "button" : undefined}
                tabIndex={alert.navigate ? 0 : undefined}
              >
                <div className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${alert.level === "critical" ? "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"}`}>
                  {alert.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${alert.level === "critical" ? "text-red-700 dark:text-red-400" : "text-amber-800 dark:text-amber-300"}`}>{alert.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{alert.detail}</p>
                </div>
                {alert.navigate && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800" data-ocid="dashboard.no_alerts">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span className="text-sm text-green-700 dark:text-green-400 font-medium">All clear — no operational alerts</span>
        </div>
      )}

      {/* KPI Cards */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        data-ocid="dashboard.kpi.section"
      >
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate("projects")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Total Projects
                </p>
                <p className="text-3xl font-bold text-foreground mt-1">
                  {activeProjects}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate("projects")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Active Quotations
                </p>
                <p className="text-3xl font-bold text-foreground mt-1">
                  {activeQuotations}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate("invoices")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Pending Invoices
                </p>
                <p className="text-3xl font-bold text-foreground mt-1">
                  {pendingInvoices}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Total Received
                </p>
                <p className="text-xl font-bold text-green-600 mt-1">
                  {fmt(totalPaid)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Order Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            {pipeline.map((p) => (
              <div key={p.label} className="flex-1 text-center">
                <div className="text-lg font-bold">{p.count}</div>
                <div
                  className={`h-2 rounded-full ${p.color} mb-1`}
                  style={{ opacity: 0.7 + (p.count > 0 ? 0.3 : 0) }}
                />
                <div className="text-[10px] text-muted-foreground">
                  {p.label}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent Enquiries */}
        {/* Recent Projects */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Recent Projects</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6 px-2"
              onClick={() => onNavigate("projects")}
              data-ocid="dashboard.projects.link"
            >
              View all <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentProjects.map((p, i) => {
                const cust = customers.find((c) => c.id === p.customerId);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-4 py-2"
                    data-ocid={`dashboard.project.item.${i + 1}`}
                  >
                    <div>
                      <div className="text-xs font-mono font-semibold">
                        {p.projectNo}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-36">
                        {cust?.name}
                      </div>
                    </div>
                    <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">
                      Active
                    </span>
                  </div>
                );
              })}
              {recentProjects.length === 0 && (
                <div
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                  data-ocid="dashboard.projects.empty_state"
                >
                  No projects yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Quotations */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Recent Quotations</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6 px-2"
              onClick={() => onNavigate("quotations")}
              data-ocid="dashboard.quotations.link"
            >
              View all <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentQuotations.map((q, i) => {
                const cust = customers.find((c) => c.id === q.customerId);
                return (
                  <div
                    key={q.id}
                    className="flex items-center justify-between px-4 py-2"
                    data-ocid={`dashboard.quotation.item.${i + 1}`}
                  >
                    <div>
                      <div className="text-xs font-mono font-semibold">
                        {q.qtNo}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-36">
                        {cust?.name}
                      </div>
                    </div>
                    <StatusBadge status={q.status} />
                  </div>
                );
              })}
              {recentQuotations.length === 0 && (
                <div
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                  data-ocid="dashboard.quotations.empty_state"
                >
                  No quotations yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
