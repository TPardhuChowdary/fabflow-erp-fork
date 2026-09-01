// Phase 2 — Application Shell (FINAL_UX_IMPLEMENTATION_BLUEPRINT.md §8).
//
// Extracted verbatim from Dashboard.tsx's existing "Factory Alerts" block —
// the alert computation itself (5 real sources: machine breakdowns, overdue
// invoices, overdue payables, machine service overdue, low stock checked
// against Available not raw Total) was already real, already correct, and
// already live in production before this phase touched anything. This pass
// changes two things only:
//   1. Extracts it into a reusable component so it's a real shell primitive
//      (blueprint component D), not Dashboard-only markup.
//   2. Replaces hardcoded Tailwind color literals (amber-50/red-100/etc,
//      which ignore the active theme) with the semantic success/warning/
//      destructive tokens already wired in tailwind.config.js, so severity
//      reads correctly in Instrument and every other theme preset — kept
//      fully independent from the accent color per the blueprint's own
//      Attention Layer spec (§8) and Instrument's category-tint rule (§4).
//
// Phase 9+ update: the two sources named above but deferred at the time
// ("blocked production stages", "high-severity open QMS issues") are now
// real and wired in. Both became derivable once Task #176's Production↔QMS
// gate (qms/lib/productionGate.ts) and Phase 32's insert-only attempts
// table shipped — all the underlying data (projectProductions,
// projectQmsInspections/Overrides/Characteristics/Attempts, the QMS
// characteristic library) is already hydrated app-wide (Task #172 /
// useSupabaseHydration.ts), so no new fetch was needed here, only reading
// what's already in the two stores.
import {
  AlertTriangle,
  CreditCard,
  Package,
  Receipt,
  ShieldAlert,
  Wrench,
  Zap,
} from "lucide-react";
import type React from "react";
import { getStageInspectionGate } from "../qms/lib/productionGate";
import { useQmsStore } from "../qms/store/useQmsStore";
import { useStore } from "../store";
import type { Page } from "../types";

interface Alert {
  id: string;
  level: "critical" | "warning";
  icon: React.ReactNode;
  title: string;
  detail: string;
  navigate?: Page;
}

const LEVEL_STYLES: Record<
  Alert["level"],
  { badge: string; text: string; hover: string }
> = {
  critical: {
    badge: "bg-destructive/10 text-destructive",
    text: "text-destructive",
    hover: "hover:bg-destructive/5",
  },
  warning: {
    badge: "bg-warning/15 text-warning",
    text: "text-warning",
    hover: "hover:bg-warning/10",
  },
};

interface Props {
  onNavigate: (p: Page) => void;
}

export function AttentionLayer({ onNavigate }: Props) {
  const {
    invoices,
    machines,
    inventoryItems,
    payables,
    projects,
    projectProductions,
  } = useStore();
  const {
    projectQmsInspections,
    projectQmsInspectionOverrides,
    projectQmsInspectionCharacteristics,
    projectQmsInspectionAttempts,
    characteristics: characteristicLibrary,
  } = useQmsStore();

  const today = new Date();
  const todayMs = today.getTime();

  const overdueInvoices = (invoices || []).filter(
    (i) =>
      i.status !== "Paid" &&
      i.invoiceType !== "proforma" &&
      i.dueDate &&
      new Date(i.dueDate).getTime() < todayMs,
  );

  const overduePayables = (payables || []).filter(
    (p) =>
      p.paidAmount < p.totalAmount &&
      p.dueDate &&
      new Date(p.dueDate).getTime() < todayMs,
  );

  const breakdownMachines = (machines || []).filter(
    (m) => m.currentStatus === "Breakdown",
  );

  const serviceOverdueMachines = (machines || []).filter((m) => {
    if (!m.nextServiceDue || m.currentStatus === "Decommissioned") return false;
    return new Date(m.nextServiceDue).getTime() < todayMs;
  });

  const lowStockItems = (inventoryItems || []).filter((item) => {
    const reorder = (item as any).reorderLevel;
    return reorder != null && (item.quantityAvailable ?? 0) <= reorder;
  });

  const projectName = (projectId: string) =>
    (projects || []).find((p) => p.id === projectId)?.projectName ??
    "Unknown project";

  // Blocked production stages — a stage still in progress whose linked QMS
  // inspection hasn't passed (and hasn't been overridden). Same pure gate
  // function Production.tsx/ProjectDetail.tsx use to block "Mark Completed".
  const blockedStages = (projectProductions || []).flatMap((pp) =>
    (pp.stages || [])
      .filter((s) => s.stageId && s.status !== "Completed")
      .map((s) => {
        const gate = getStageInspectionGate(
          s.stageId,
          (projectQmsInspections || []).filter(
            (i) => i.projectId === pp.projectId,
          ),
          (projectQmsInspectionOverrides || []).filter(
            (o) =>
              (projectQmsInspections || []).find(
                (i) => i.id === o.projectQmsInspectionId,
              )?.projectId === pp.projectId,
          ),
        );
        return gate.linked && !gate.canProceed
          ? { projectId: pp.projectId, stageName: s.stageName, gate }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  );

  // High-severity open QMS issues — a Safety/Regulatory-critical
  // characteristic whose latest recorded attempt (highest roundNumber,
  // insert-only per Phase 32) is a Fail. Rectification records a new
  // attempt rather than editing the old one, so "latest is Fail" is the
  // correct "still failing" check.
  const latestAttemptByCharacteristic = new Map<
    string,
    (typeof projectQmsInspectionAttempts)[number]
  >();
  for (const a of projectQmsInspectionAttempts || []) {
    const prev = latestAttemptByCharacteristic.get(a.characteristicId);
    if (!prev || a.roundNumber > prev.roundNumber) {
      latestAttemptByCharacteristic.set(a.characteristicId, a);
    }
  }
  const HIGH_SEVERITY: Array<string> = ["SafetyCritical", "RegulatoryCritical"];
  const highSeverityQmsIssues = (projectQmsInspectionCharacteristics || [])
    .map((c) => {
      const latest = latestAttemptByCharacteristic.get(c.id);
      if (!latest || latest.result !== "Fail") return null;
      const libChar = (characteristicLibrary || []).find(
        (lc) => lc.id === c.libraryCharacteristicId,
      );
      if (!libChar || !HIGH_SEVERITY.includes(libChar.criticality)) return null;
      const inspection = (projectQmsInspections || []).find(
        (i) => i.id === c.projectQmsInspectionId,
      );
      return inspection
        ? { characteristicName: c.nameSnapshot, inspection }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);

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
    const total = overdueInvoices.reduce(
      (s, i) => s + ((i.totalAmount ?? 0) - (i.paidAmount ?? 0)),
      0,
    );
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
    const total = overduePayables.reduce(
      (s, p) => s + ((p.totalAmount ?? 0) - (p.paidAmount ?? 0)),
      0,
    );
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
      detail:
        lowStockItems
          .map((i) => i.name)
          .slice(0, 3)
          .join(", ") + (lowStockItems.length > 3 ? "…" : ""),
      navigate: "inventory",
    });
  }

  if (blockedStages.length > 0) {
    alerts.push({
      id: "blocked-stages",
      level: "critical",
      icon: <ShieldAlert className="w-4 h-4" />,
      title: `${blockedStages.length} Production Stage${blockedStages.length > 1 ? "s" : ""} Blocked by QMS`,
      detail: blockedStages
        .map((b) => `${projectName(b.projectId)} — ${b.stageName}`)
        .slice(0, 3)
        .join(", "),
      navigate: "production",
    });
  }

  if (highSeverityQmsIssues.length > 0) {
    alerts.push({
      id: "high-severity-qms",
      level: "critical",
      icon: <AlertTriangle className="w-4 h-4" />,
      title: `${highSeverityQmsIssues.length} High-Severity QMS Issue${highSeverityQmsIssues.length > 1 ? "s" : ""}`,
      detail: highSeverityQmsIssues
        .map(
          (i) =>
            `${projectName(i.inspection.projectId)} — ${i.characteristicName}`,
        )
        .slice(0, 3)
        .join(", "),
      navigate: "quality",
    });
  }

  if (alerts.length === 0) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-xl border border-success/30 bg-success/10"
        data-ocid="dashboard.no_alerts"
      >
        <svg
          className="w-4 h-4 shrink-0 text-success"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="M22 4 12 14.01l-3-3" />
        </svg>
        <span className="text-sm text-success font-medium">
          All clear — no operational alerts
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-warning/30 bg-warning/10"
      data-ocid="dashboard.alerts.section"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-warning/30">
        <svg
          className="w-4 h-4 text-warning"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <span className="text-sm font-semibold text-warning">
          Needs Attention
        </span>
        <span className="ml-auto text-xs text-warning/80">
          {alerts.length} action{alerts.length > 1 ? "s" : ""} needed
        </span>
      </div>
      <div className="divide-y divide-warning/15">
        {alerts.map((alert) => {
          const styles = LEVEL_STYLES[alert.level];
          return (
            <button
              type="button"
              key={alert.id}
              className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${alert.navigate ? styles.hover : "cursor-default"}`}
              onClick={() => alert.navigate && onNavigate(alert.navigate)}
              disabled={!alert.navigate}
            >
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${styles.badge}`}
              >
                {alert.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${styles.text}`}>
                  {alert.title}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {alert.detail}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
