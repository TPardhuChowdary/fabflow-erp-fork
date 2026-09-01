// Phase 40 — Machine/Service Revenue (master scope §17-28). Revenue is
// revenue-only, never profit/costing: every total on this page sums
// billable_service usage revenue, never a machine's cost/depreciation/
// electricity/labour (none of those columns exist anywhere in this
// scope). Every list/total here is keyed and labeled by *service*
// name, never by machine asset name alone (§17) - a service optionally
// references a machine, but the machine is shown as supplementary
// context, not the primary key.

import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActions } from "@/components/ui/row-actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Banknote,
  History,
  Pencil,
  Plus,
  ShieldOff,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import {
  addServiceRateRemote,
  createBillableServiceRemote,
  createServiceUsageRemote,
  deleteBillableServiceRemote,
  deleteServiceUsageRemote,
  getCurrentServiceRate,
  updateBillableServiceRemote,
  updateServiceUsageRemote,
} from "../lib/machineRevenueApi";
import {
  canCreate,
  canDelete,
  canEdit,
  canView,
  hasPermission,
} from "../permissions";
import { useStore } from "../store";
import type {
  BillableService,
  ChargingMethod,
  MachineServiceUsage,
} from "../types";

const CHARGING_METHODS: ChargingMethod[] = [
  "hour",
  "piece",
  "bend",
  "kg",
  "other",
];

const CHARGING_METHOD_LABEL: Record<ChargingMethod, string> = {
  hour: "Per Hour",
  piece: "Per Piece",
  bend: "Per Bend",
  kg: "Per Kg",
  other: "Other",
};

const DEFAULT_UNIT_LABEL: Record<ChargingMethod, string> = {
  hour: "hrs",
  piece: "pcs",
  bend: "bends",
  kg: "kg",
  other: "",
};

const PERIODS = [
  { value: "all", label: "All Time" },
  { value: "this_month", label: "This Month" },
  { value: "last_30", label: "Last 30 Days" },
] as const;

function fmt(n: number) {
  return (Number(n) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function inPeriod(dateStr: string, period: string): boolean {
  if (period === "all") return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === "this_month") {
    return (
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    );
  }
  if (period === "last_30") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return d >= cutoff;
  }
  return true;
}

export function MachineRevenue() {
  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "machine_revenue");
  const pEdit = canEdit(currentUser, "machine_revenue");
  const pDelete = canDelete(currentUser, "machine_revenue");
  const pManageRates = hasPermission(
    currentUser,
    "machine_revenue.manage_rates",
  );

  const {
    billableServices,
    machineServiceRates,
    machineServiceUsage,
    machines,
    projects,
    addBillableServiceLocal,
    updateBillableServiceLocal,
    deleteBillableServiceLocal,
    addMachineServiceRateLocal,
    addMachineServiceUsageLocal,
    updateMachineServiceUsageLocal,
    deleteMachineServiceUsageLocal,
  } = useStore();

  const [tab, setTab] = useState<"dashboard" | "services">("dashboard");
  const [period, setPeriod] = useState<string>("all");

  // Billable Services CRUD
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingService, setEditingService] = useState<BillableService | null>(
    null,
  );
  const [serviceForm, setServiceForm] = useState<Partial<BillableService>>({});
  const [initialRate, setInitialRate] = useState("");
  const [deleteServiceTarget, setDeleteServiceTarget] =
    useState<BillableService | null>(null);
  const [isSavingService, setIsSavingService] = useState(false);

  // Change Rate
  const [rateTarget, setRateTarget] = useState<BillableService | null>(null);
  const [newRate, setNewRate] = useState("");
  const [isSavingRate, setIsSavingRate] = useState(false);

  // Record / Edit Usage
  const [usageServiceTarget, setUsageServiceTarget] =
    useState<BillableService | null>(null);
  const [editingUsage, setEditingUsage] = useState<MachineServiceUsage | null>(
    null,
  );
  const [usageForm, setUsageForm] = useState<{
    projectId: string;
    usageDate: string;
    quantity: string;
    notes: string;
  }>({ projectId: "", usageDate: "", quantity: "", notes: "" });
  const [isSavingUsage, setIsSavingUsage] = useState(false);
  const [deleteUsageTarget, setDeleteUsageTarget] =
    useState<MachineServiceUsage | null>(null);

  // Drill-down
  const [drillDown, setDrillDown] = useState<BillableService | null>(null);

  const activeServices = useMemo(
    () => (billableServices || []).filter((s) => s.isActive !== false),
    [billableServices],
  );

  const currentRate = (serviceId: string): number =>
    getCurrentServiceRate(serviceId, machineServiceRates || []);

  // Phase 43 — Rate History UX. Pure derivation over the already-loaded,
  // insert-only machineServiceRates: never a new fetch, never a new
  // table. Each historical row's "To" is 1ms before the next (later)
  // row's effectiveFrom — floors to the same calendar day when two
  // changes happen on the same day (never displays a "To" date earlier
  // than the row's own "From"), and to the previous calendar day when
  // the next change was on a genuinely later day, matching the user's
  // own example (01-Aug -> 16-Aug, 17-Aug -> Present). The latest row's
  // "To" is "Present". Never recomputes/mutates past rows - only reads.
  const rateHistoryFor = (serviceId: string) => {
    const rows = (machineServiceRates || [])
      .filter((r) => r.billableServiceId === serviceId)
      .sort((a, b) => a.effectiveFrom - b.effectiveFrom);
    return rows
      .map((r, i) => {
        const next = rows[i + 1];
        return {
          id: r.id,
          rate: r.rate,
          from: r.effectiveFrom,
          to: next ? next.effectiveFrom - 1 : null, // null = Present
          isCurrent: i === rows.length - 1,
        };
      })
      .sort((a, b) => b.from - a.from); // newest first for display
  };

  const fmtDate = (ts: number) =>
    new Date(ts)
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(/ /g, "-");

  const machineName = (id?: string) =>
    id ? (machines || []).find((m) => m.id === id)?.name : undefined;
  const projectName = (id: string) =>
    (projects || []).find((p) => p.id === id)?.projectName ?? "—";

  const usageForService = (serviceId: string) =>
    (machineServiceUsage || [])
      .filter((u) => u.billableServiceId === serviceId)
      .filter((u) => inPeriod(u.usageDate, period))
      .sort((a, b) => b.usageDate.localeCompare(a.usageDate));

  // Plain computation, not useMemo - usageForService closes over
  // machineServiceUsage/period already, and re-deriving this on every
  // render is cheap for the realistic size of this table.
  const serviceStats = activeServices.map((s) => {
    const rows = usageForService(s.id);
    const totalQty = rows.reduce((sum, u) => sum + u.quantity, 0);
    const totalRevenue = rows.reduce((sum, u) => sum + u.revenueAmount, 0);
    return { service: s, totalQty, totalRevenue, usageCount: rows.length };
  });

  const grandTotalRevenue = serviceStats.reduce(
    (sum, s) => sum + s.totalRevenue,
    0,
  );

  function openNewService() {
    setServiceForm({ chargingMethod: "hour", isActive: true });
    setInitialRate("");
    setEditingService(null);
    setShowServiceForm(true);
  }

  function openEditService(s: BillableService) {
    setServiceForm({ ...s });
    setEditingService(s);
    setShowServiceForm(true);
  }

  async function handleSaveService() {
    if (isSavingService) return;
    if (!serviceForm.name?.trim()) {
      toast.error("Service name is required");
      return;
    }
    if (!serviceForm.chargingMethod) {
      toast.error("Charging method is required");
      return;
    }
    setIsSavingService(true);
    try {
      if (editingService) {
        const result = await updateBillableServiceRemote({
          ...editingService,
          ...serviceForm,
          updatedAt: Date.now(),
        } as BillableService);
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to Supabase - service was not saved.");
          return;
        }
        if (
          result.status === "error" ||
          result.status === "denied" ||
          !result.data
        ) {
          toast.error(
            `Could not save service: ${result.error ?? "unknown error"}`,
          );
          return;
        }
        updateBillableServiceLocal(result.data);
        toast.success("Billable service updated");
      } else {
        const result = await createBillableServiceRemote({
          name: serviceForm.name,
          machineId: serviceForm.machineId,
          chargingMethod: serviceForm.chargingMethod as ChargingMethod,
          unitLabel:
            serviceForm.unitLabel ||
            DEFAULT_UNIT_LABEL[serviceForm.chargingMethod as ChargingMethod],
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to Supabase - service was not saved.");
          return;
        }
        if (result.status === "error" || !result.data) {
          toast.error(
            `Could not save service: ${result.error ?? "unknown error"}`,
          );
          return;
        }
        addBillableServiceLocal(result.data);
        toast.success(`Billable service "${result.data.name}" added`);

        const rateNum = Number(initialRate);
        if (pManageRates && initialRate.trim() && rateNum >= 0) {
          const rateResult = await addServiceRateRemote(
            result.data.id,
            rateNum,
          );
          if (rateResult.status === "success" && rateResult.data) {
            addMachineServiceRateLocal(rateResult.data);
          } else {
            toast.error(
              `Service created, but initial rate could not be saved: ${rateResult.error ?? "unknown error"}`,
            );
          }
        }
      }
      setShowServiceForm(false);
    } finally {
      setIsSavingService(false);
    }
  }

  async function handleConfirmDeleteService() {
    if (!deleteServiceTarget) return;
    const s = deleteServiceTarget;
    const result = await deleteBillableServiceRemote(s.id);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - service was not deleted.");
      setDeleteServiceTarget(null);
      return;
    }
    if (result.status === "error" || result.status === "denied") {
      toast.error(
        `Could not delete service: ${result.error ?? "unknown error"}`,
      );
      setDeleteServiceTarget(null);
      return;
    }
    deleteBillableServiceLocal(s.id);
    toast.success("Billable service removed");
    setDeleteServiceTarget(null);
  }

  function openChangeRate(s: BillableService) {
    setRateTarget(s);
    setNewRate(String(currentRate(s.id) || ""));
  }

  async function handleSaveRate() {
    if (!rateTarget || isSavingRate) return;
    const rateNum = Number(newRate);
    if (!newRate.trim() || Number.isNaN(rateNum) || rateNum < 0) {
      toast.error("Enter a valid rate");
      return;
    }
    setIsSavingRate(true);
    try {
      const result = await addServiceRateRemote(rateTarget.id, rateNum);
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to Supabase - rate was not saved.");
        return;
      }
      if (
        result.status === "error" ||
        result.status === "denied" ||
        !result.data
      ) {
        toast.error(`Could not save rate: ${result.error ?? "unknown error"}`);
        return;
      }
      addMachineServiceRateLocal(result.data);
      toast.success(
        `New rate ₹${fmt(rateNum)} set for "${rateTarget.name}" — past revenue is unaffected`,
      );
      setRateTarget(null);
    } finally {
      setIsSavingRate(false);
    }
  }

  function openRecordUsage(s: BillableService) {
    setUsageServiceTarget(s);
    setEditingUsage(null);
    setUsageForm({
      projectId: "",
      usageDate: new Date().toISOString().slice(0, 10),
      quantity: "",
      notes: "",
    });
  }

  function openEditUsage(s: BillableService, u: MachineServiceUsage) {
    setUsageServiceTarget(s);
    setEditingUsage(u);
    setUsageForm({
      projectId: u.projectId,
      usageDate: u.usageDate,
      quantity: String(u.quantity),
      notes: u.notes || "",
    });
  }

  const usageQuantityNum = Number(usageForm.quantity) || 0;
  const usageRateForForm = usageServiceTarget
    ? editingUsage
      ? editingUsage.rateApplied
      : currentRate(usageServiceTarget.id)
    : 0;
  const usageRevenuePreview = usageQuantityNum * usageRateForForm;

  async function handleSaveUsage() {
    if (!usageServiceTarget || isSavingUsage) return;
    if (!editingUsage && !usageForm.projectId) {
      toast.error("Select a project");
      return;
    }
    if (usageQuantityNum <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    if (!usageForm.usageDate) {
      toast.error("Usage date is required");
      return;
    }
    setIsSavingUsage(true);
    try {
      if (editingUsage) {
        const result = await updateServiceUsageRemote({
          ...editingUsage,
          usageDate: usageForm.usageDate,
          quantity: usageQuantityNum,
          notes: usageForm.notes || undefined,
          revenueAmount: usageRevenuePreview,
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to Supabase - usage was not saved.");
          return;
        }
        if (
          result.status === "error" ||
          result.status === "denied" ||
          !result.data
        ) {
          toast.error(
            `Could not save usage: ${result.error ?? "unknown error"}`,
          );
          return;
        }
        updateMachineServiceUsageLocal(result.data);
        toast.success("Usage updated");
      } else {
        const rate = currentRate(usageServiceTarget.id);
        const result = await createServiceUsageRemote({
          projectId: usageForm.projectId,
          billableServiceId: usageServiceTarget.id,
          usageDate: usageForm.usageDate,
          quantity: usageQuantityNum,
          unit: usageServiceTarget.unitLabel,
          rateApplied: rate,
          revenueAmount: usageQuantityNum * rate,
          notes: usageForm.notes || undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to Supabase - usage was not saved.");
          return;
        }
        if (result.status === "error" || !result.data) {
          toast.error(
            `Could not save usage: ${result.error ?? "unknown error"}`,
          );
          return;
        }
        addMachineServiceUsageLocal(result.data);
        toast.success(
          `Usage recorded — ₹${fmt(result.data.revenueAmount)} revenue`,
        );
      }
      setUsageServiceTarget(null);
      setEditingUsage(null);
    } finally {
      setIsSavingUsage(false);
    }
  }

  async function handleConfirmDeleteUsage() {
    if (!deleteUsageTarget) return;
    const u = deleteUsageTarget;
    const result = await deleteServiceUsageRemote(u.id);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - usage was not deleted.");
      setDeleteUsageTarget(null);
      return;
    }
    if (result.status === "error" || result.status === "denied") {
      toast.error(`Could not delete usage: ${result.error ?? "unknown error"}`);
      setDeleteUsageTarget(null);
      return;
    }
    deleteMachineServiceUsageLocal(u.id);
    toast.success("Usage removed");
    setDeleteUsageTarget(null);
  }

  if (!canView(currentUser, "machine_revenue")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <ShieldOff className="w-8 h-8 text-destructive" />
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

  const ServiceRowActions = ({
    s,
    i,
  }: {
    s: BillableService;
    i: number;
  }) => (
    <RowActions
      primary={[
        ...(pManageRates
          ? [
              {
                label: "Change Rate",
                icon: SlidersHorizontal,
                onClick: () => openChangeRate(s),
                "data-ocid": `machine_revenue.change_rate_button.${i + 1}`,
              },
            ]
          : []),
        ...(pEdit
          ? [
              {
                label: "Edit",
                icon: Pencil,
                onClick: () => openEditService(s),
                "data-ocid": `machine_revenue.edit_service_button.${i + 1}`,
              },
            ]
          : []),
      ]}
      overflow={[
        ...(pDelete
          ? [
              {
                label: "Delete",
                icon: Trash2,
                destructive: true,
                onClick: () => setDeleteServiceTarget(s),
                "data-ocid": `machine_revenue.delete_service_button.${i + 1}`,
              },
            ]
          : []),
      ]}
    />
  );

  return (
    <div className="p-6 space-y-6" data-ocid="machine_revenue.panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Banknote className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Machine / Service Revenue
            </h1>
            <p className="text-xs text-muted-foreground">
              Revenue from billable services — never machine profit, cost, or
              depreciation
            </p>
          </div>
        </div>
        {tab === "services" && pCreate && (
          <Button
            size="sm"
            onClick={openNewService}
            data-ocid="machine_revenue.add_service_button"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Billable Service
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger
            value="dashboard"
            data-ocid="machine_revenue.tab.dashboard"
          >
            Dashboard
          </TabsTrigger>
          <TabsTrigger
            value="services"
            data-ocid="machine_revenue.tab.services"
          >
            Billable Services
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1">
              <div className="rounded-lg border p-4">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  Billable Services
                </div>
                <div className="text-2xl font-bold mt-1">
                  {activeServices.length}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  Total Revenue
                </div>
                <div className="text-2xl font-bold mt-1 text-success">
                  ₹{fmt(grandTotalRevenue)}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  Usage Records
                </div>
                <div className="text-2xl font-bold mt-1">
                  {serviceStats.reduce((n, s) => n + s.usageCount, 0)}
                </div>
              </div>
            </div>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger
                className="w-40"
                data-ocid="machine_revenue.period_filter.select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {activeServices.length === 0 ? (
            <div className="rounded-md border p-10 text-center">
              <Banknote className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm mb-3">
                No billable services configured yet.
              </p>
              {pCreate && (
                <Button size="sm" onClick={openNewService}>
                  <Plus className="w-4 h-4 mr-1.5" /> Add First Billable Service
                </Button>
              )}
            </div>
          ) : (
            <div className="table-wrapper">
              <div
                className="rounded-md border"
                data-ocid="machine_revenue.dashboard.table"
              >
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2 text-xs font-semibold">
                        Service
                      </th>
                      <th className="text-left p-2 text-xs font-semibold">
                        Machine
                      </th>
                      <th className="text-left p-2 text-xs font-semibold">
                        Current Rate
                      </th>
                      <th className="text-left p-2 text-xs font-semibold">
                        Usage (period)
                      </th>
                      <th className="text-left p-2 text-xs font-semibold">
                        Revenue (period)
                      </th>
                      <th className="text-left p-2 text-xs font-semibold w-52">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceStats.map(
                      (
                        { service: s, totalQty, totalRevenue, usageCount },
                        i,
                      ) => (
                        <tr
                          key={s.id}
                          className="border-t hover:bg-muted/30"
                          data-ocid={`machine_revenue.dashboard.row.${i + 1}`}
                        >
                          <td className="p-2 font-medium">{s.name}</td>
                          <td className="p-2 text-muted-foreground">
                            {machineName(s.machineId) || "— (process-level)"}
                          </td>
                          <td className="p-2">
                            ₹{fmt(currentRate(s.id))} /{" "}
                            {s.unitLabel ||
                              CHARGING_METHOD_LABEL[s.chargingMethod]}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {totalQty} {s.unitLabel} ({usageCount})
                          </td>
                          <td className="p-2 font-semibold text-success">
                            ₹{fmt(totalRevenue)}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              {pCreate && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openRecordUsage(s)}
                                  data-ocid={`machine_revenue.record_usage_button.${i + 1}`}
                                >
                                  Record Usage
                                </Button>
                              )}
                              <button
                                type="button"
                                className="p-1 rounded hover:bg-muted transition-colors"
                                onClick={() => setDrillDown(s)}
                                title="View usage log"
                                data-ocid={`machine_revenue.drilldown_button.${i + 1}`}
                              >
                                <History className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="services" className="mt-4 space-y-4">
          {activeServices.length === 0 ? (
            <div className="rounded-md border p-10 text-center">
              <Banknote className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm mb-3">
                No billable services added yet.
              </p>
              {pCreate && (
                <Button size="sm" onClick={openNewService}>
                  <Plus className="w-4 h-4 mr-1.5" /> Add First Billable Service
                </Button>
              )}
            </div>
          ) : (
            <div className="table-wrapper">
              <div
                className="rounded-md border"
                data-ocid="machine_revenue.services.table"
              >
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2 text-xs font-semibold">
                        Service
                      </th>
                      <th className="text-left p-2 text-xs font-semibold">
                        Machine
                      </th>
                      <th className="text-left p-2 text-xs font-semibold">
                        Charging Method
                      </th>
                      <th className="text-left p-2 text-xs font-semibold">
                        Current Rate
                      </th>
                      <th className="text-left p-2 text-xs font-semibold w-40">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeServices.map((s, i) => (
                      <tr
                        key={s.id}
                        className="border-t hover:bg-muted/30"
                        data-ocid={`machine_revenue.services.row.${i + 1}`}
                      >
                        <td className="p-2 font-medium">{s.name}</td>
                        <td className="p-2 text-muted-foreground">
                          {machineName(s.machineId) || (
                            <Badge variant="outline" className="text-xs">
                              Process-level
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {CHARGING_METHOD_LABEL[s.chargingMethod]}
                        </td>
                        <td className="p-2">₹{fmt(currentRate(s.id))}</td>
                        <td className="p-2">
                          <ServiceRowActions s={s} i={i} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit Billable Service Dialog */}
      <Dialog open={showServiceForm} onOpenChange={setShowServiceForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingService
                ? "Edit Billable Service"
                : "Add Billable Service"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Service Name *</Label>
              <Input
                value={serviceForm.name || ""}
                onChange={(e) =>
                  setServiceForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Laser Cutting, Powder Coating, Bending"
                data-ocid="machine_revenue.service_form.name.input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Machine{" "}
                <span className="text-muted-foreground font-normal">
                  (optional — leave as None for a process-level service)
                </span>
              </Label>
              <SearchableSelect
                value={serviceForm.machineId || "none"}
                onChange={(v) =>
                  setServiceForm((p) => ({
                    ...p,
                    machineId: v === "none" ? undefined : v,
                  }))
                }
                options={[
                  { value: "none", label: "None" },
                  ...(machines || []).map((m) => ({
                    value: m.id,
                    label: `${m.name} (${m.machineCode})`,
                    searchText: `${m.machineCode ?? ""} ${m.type ?? ""}`,
                  })),
                ]}
                placeholder="None"
                searchPlaceholder="Search by name, code, or type…"
                emptyText="No machines found."
                className="w-full"
                data-ocid="machine_revenue.service_form.machine.select"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Charging Method *</Label>
                <Select
                  value={serviceForm.chargingMethod || "hour"}
                  onValueChange={(v) =>
                    setServiceForm((p) => ({
                      ...p,
                      chargingMethod: v as ChargingMethod,
                      unitLabel:
                        p.unitLabel || DEFAULT_UNIT_LABEL[v as ChargingMethod],
                    }))
                  }
                >
                  <SelectTrigger data-ocid="machine_revenue.service_form.charging_method.select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHARGING_METHODS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CHARGING_METHOD_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unit Label</Label>
                <Input
                  value={serviceForm.unitLabel || ""}
                  onChange={(e) =>
                    setServiceForm((p) => ({ ...p, unitLabel: e.target.value }))
                  }
                  placeholder="e.g. hrs, pcs, bends, kg"
                  data-ocid="machine_revenue.service_form.unit_label.input"
                />
              </div>
            </div>
            {!editingService && pManageRates && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Initial Rate (₹){" "}
                  <span className="text-muted-foreground font-normal">
                    (optional — can be set later via Change Rate)
                  </span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={initialRate}
                  onChange={(e) => setInitialRate(e.target.value)}
                  placeholder="0.00"
                  data-ocid="machine_revenue.service_form.initial_rate.input"
                />
              </div>
            )}
            {editingService && (
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  checked={serviceForm.isActive ?? true}
                  onCheckedChange={(v) =>
                    setServiceForm((p) => ({ ...p, isActive: v }))
                  }
                  data-ocid="machine_revenue.service_form.is_active.switch"
                />
                <Label className="text-xs">Active</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowServiceForm(false)}
              data-ocid="machine_revenue.service_form.cancel_button"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSavingService}
              onClick={handleSaveService}
              data-ocid="machine_revenue.service_form.save_button"
            >
              {isSavingService
                ? "Saving..."
                : editingService
                  ? "Save Changes"
                  : "Add Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Rate Dialog */}
      <Dialog
        open={!!rateTarget}
        onOpenChange={(o) => !o && setRateTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Rate — {rateTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {rateTarget && rateHistoryFor(rateTarget.id).length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Rate History</Label>
                <div
                  className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2"
                  data-ocid="machine_revenue.rate_dialog.history_list"
                >
                  {rateHistoryFor(rateTarget.id).map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between text-xs gap-2"
                    >
                      <span>
                        ₹{fmt(h.rate)} — From {fmtDate(h.from)} → To{" "}
                        {h.to ? fmtDate(h.to) : "Present"}
                      </span>
                      {h.isCurrent && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px]"
                        >
                          Current
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Current rate: ₹
              {rateTarget ? fmt(currentRate(rateTarget.id)) : "0.00"}. Setting a
              new rate does not change any past usage revenue — it only applies
              going forward.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">New Rate (₹) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                data-ocid="machine_revenue.rate_dialog.rate.input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRateTarget(null)}
              data-ocid="machine_revenue.rate_dialog.cancel_button"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSavingRate}
              onClick={handleSaveRate}
              data-ocid="machine_revenue.rate_dialog.save_button"
            >
              {isSavingRate ? "Saving..." : "Set Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record / Edit Usage Dialog */}
      <Dialog
        open={!!usageServiceTarget}
        onOpenChange={(o) => {
          if (!o) {
            setUsageServiceTarget(null);
            setEditingUsage(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingUsage ? "Edit Usage" : "Record Usage"} —{" "}
              {usageServiceTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Project *</Label>
              <SearchableSelect
                value={usageForm.projectId}
                onChange={(v) => setUsageForm((p) => ({ ...p, projectId: v }))}
                options={(projects || []).map((p) => ({
                  value: p.id,
                  label: `${p.projectName} (${p.projectNo})`,
                }))}
                placeholder="Select project"
                searchPlaceholder="Search projects…"
                emptyText="No projects found."
                disabled={!!editingUsage}
                className="w-full"
                data-ocid="machine_revenue.usage_form.project.select"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Usage Date *</Label>
                <Input
                  type="date"
                  value={usageForm.usageDate}
                  onChange={(e) =>
                    setUsageForm((p) => ({ ...p, usageDate: e.target.value }))
                  }
                  data-ocid="machine_revenue.usage_form.date.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Quantity ({usageServiceTarget?.unitLabel || "units"}) *
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={usageForm.quantity}
                  onChange={(e) =>
                    setUsageForm((p) => ({ ...p, quantity: e.target.value }))
                  }
                  data-ocid="machine_revenue.usage_form.quantity.input"
                />
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Rate applied{" "}
                  {editingUsage ? "(frozen at recording time)" : ""}
                </span>
                <span className="font-medium">₹{fmt(usageRateForForm)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>Revenue</span>
                <span
                  className="text-success"
                  data-ocid="machine_revenue.usage_form.revenue_preview"
                >
                  ₹{fmt(usageRevenuePreview)}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={usageForm.notes}
                onChange={(e) =>
                  setUsageForm((p) => ({ ...p, notes: e.target.value }))
                }
                rows={2}
                data-ocid="machine_revenue.usage_form.notes.input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setUsageServiceTarget(null);
                setEditingUsage(null);
              }}
              data-ocid="machine_revenue.usage_form.cancel_button"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSavingUsage}
              onClick={handleSaveUsage}
              data-ocid="machine_revenue.usage_form.save_button"
            >
              {isSavingUsage
                ? "Saving..."
                : editingUsage
                  ? "Save Changes"
                  : "Record Usage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drill-down: Usage Log for a service */}
      <Dialog open={!!drillDown} onOpenChange={(o) => !o && setDrillDown(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Usage Log — {drillDown?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {drillDown && usageForService(drillDown.id).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No usage recorded for this service
                {period !== "all" ? " in this period" : ""}.
              </p>
            ) : (
              <div className="table-wrapper">
                <div
                  className="rounded-md border"
                  data-ocid="machine_revenue.drilldown.table"
                >
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left p-2 text-xs font-semibold">
                          Date
                        </th>
                        <th className="text-left p-2 text-xs font-semibold">
                          Project
                        </th>
                        <th className="text-left p-2 text-xs font-semibold">
                          Qty
                        </th>
                        <th className="text-left p-2 text-xs font-semibold">
                          Rate
                        </th>
                        <th className="text-left p-2 text-xs font-semibold">
                          Revenue
                        </th>
                        <th className="text-left p-2 text-xs font-semibold w-20">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillDown &&
                        usageForService(drillDown.id).map((u, i) => (
                          <tr
                            key={u.id}
                            className="border-t hover:bg-muted/30"
                            data-ocid={`machine_revenue.drilldown.row.${i + 1}`}
                          >
                            <td className="p-2">{u.usageDate}</td>
                            <td className="p-2 text-muted-foreground">
                              {projectName(u.projectId)}
                            </td>
                            <td className="p-2">
                              {u.quantity} {u.unit}
                            </td>
                            <td className="p-2">₹{fmt(u.rateApplied)}</td>
                            <td className="p-2 font-medium text-success">
                              ₹{fmt(u.revenueAmount)}
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-1">
                                {pEdit && (
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-muted transition-colors"
                                    onClick={() => {
                                      if (drillDown)
                                        openEditUsage(drillDown, u);
                                    }}
                                    title="Edit usage"
                                    data-ocid={`machine_revenue.drilldown.edit.${i + 1}`}
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                                  </button>
                                )}
                                {pDelete && (
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-muted transition-colors"
                                    onClick={() => setDeleteUsageTarget(u)}
                                    title="Delete usage"
                                    data-ocid={`machine_revenue.drilldown.delete.${i + 1}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteServiceTarget}
        onOpenChange={(open) => !open && setDeleteServiceTarget(null)}
        title="Delete Billable Service"
        description={
          deleteServiceTarget
            ? `Delete "${deleteServiceTarget.name}"? Services with recorded usage cannot be deleted.`
            : ""
        }
        onConfirm={handleConfirmDeleteService}
      />

      <ConfirmDeleteDialog
        open={!!deleteUsageTarget}
        onOpenChange={(open) => !open && setDeleteUsageTarget(null)}
        title="Delete Usage Record"
        description={
          deleteUsageTarget
            ? `Delete this usage record dated ${deleteUsageTarget.usageDate} (₹${fmt(deleteUsageTarget.revenueAmount)})? This will remove it from all revenue totals.`
            : ""
        }
        onConfirm={handleConfirmDeleteUsage}
      />
    </div>
  );
}
