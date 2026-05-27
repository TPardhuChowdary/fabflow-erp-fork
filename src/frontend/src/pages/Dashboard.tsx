import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  CreditCard,
  FileText,
  Package,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { useStore } from "../store";
import type { Page } from "../types";

interface Props {
  onNavigate: (p: Page) => void;
}

export function Dashboard({ onNavigate }: Props) {
  const { invoices, payments, customers, projects, quotations } = useStore();

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
