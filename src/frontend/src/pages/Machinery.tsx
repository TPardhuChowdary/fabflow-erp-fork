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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Settings2,
  Wrench,
  XCircle,
  ZapOff,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { VendorSelect } from "../components/VendorSelect";
import { canCreate, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { Machine, MachineStatus, MachineType } from "../types";

const MACHINE_TYPES: MachineType[] = [
  "Laser Cutting", "CNC", "Welding", "Bending", "Powder Coating",
  "Compressor", "Generator", "Drilling", "Grinding", "Forklift",
  "Testing", "Air Tool", "Other",
];

const STATUS_CONFIG: Record<MachineStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  Operational: { label: "Operational", color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 },
  "Under Maintenance": { label: "Under Maintenance", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Settings2 },
  Breakdown: { label: "Breakdown", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  Idle: { label: "Idle", color: "bg-gray-100 text-gray-600 border-gray-200", icon: ZapOff },
  Decommissioned: { label: "Decommissioned", color: "bg-slate-100 text-slate-500 border-slate-200", icon: XCircle },
};

function ServiceDueBadge({ nextServiceDue }: { nextServiceDue?: string }) {
  if (!nextServiceDue) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextServiceDue);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
        <AlertTriangle className="w-3 h-3" />
        Service overdue {Math.abs(diffDays)}d
      </span>
    );
  }
  if (diffDays <= 14) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
        <Clock className="w-3 h-3" />
        Service in {diffDays}d
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      Next service: {new Date(nextServiceDue).toLocaleDateString("en-IN")}
    </span>
  );
}

interface Props {
  onViewMachine: (id: string) => void;
}

export function Machinery({ onViewMachine }: Props) {
  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "machinery");
  const pEdit = canEdit(currentUser, "machinery");

  const {
    machines,
    addMachine,
    updateMachine,
    deleteMachine,
    generateMachineCode,
  } = useStore();

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  // form state
  const [form, setForm] = useState<Partial<Machine>>({});

  const activeMachines = useMemo(
    () => (machines || []).filter((m) => m.isActive !== false),
    [machines],
  );

  const filtered = useMemo(() => {
    return activeMachines.filter((m) => {
      if (filterStatus !== "all" && m.currentStatus !== filterStatus) return false;
      if (filterType !== "all" && m.type !== filterType) return false;
      if (search && !m.name.toLowerCase().includes(search.toLowerCase()) &&
          !m.machineCode.toLowerCase().includes(search.toLowerCase()) &&
          !(m.brand || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [activeMachines, filterStatus, filterType, search]);

  // KPI counts
  const kpis = useMemo(() => ({
    total: activeMachines.length,
    operational: activeMachines.filter((m) => m.currentStatus === "Operational").length,
    breakdown: activeMachines.filter((m) => m.currentStatus === "Breakdown").length,
    serviceOverdue: activeMachines.filter((m) => {
      if (!m.nextServiceDue) return false;
      return new Date(m.nextServiceDue) < new Date();
    }).length,
  }), [activeMachines]);

  function openNew() {
    setForm({});
    setEditingMachine(null);
    setShowForm(true);
  }

  function openEdit(m: Machine) {
    setForm({ ...m });
    setEditingMachine(m);
    setShowForm(true);
  }

  function handleSave() {
    if (!form.name?.trim()) { toast.error("Machine name is required"); return; }
    if (!form.type) { toast.error("Machine type is required"); return; }
    if (!form.currentStatus) { toast.error("Status is required"); return; }

    if (editingMachine) {
      updateMachine({ ...editingMachine, ...form, updatedAt: Date.now() } as Machine);
      toast.success("Machine updated");
    } else {
      const newMachine: Machine = {
        id: crypto.randomUUID(),
        machineCode: generateMachineCode(),
        name: form.name!,
        type: form.type!,
        brand: form.brand,
        model: form.model,
        serialNumber: form.serialNumber,
        assetId: form.assetId,
        purchaseDate: form.purchaseDate,
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
        purchaseVendorId: form.purchaseVendorId,
        purchaseVendorName: form.purchaseVendorName,
        currentStatus: form.currentStatus || "Operational",
        location: form.location,
        department: form.department,
        warrantyExpiry: form.warrantyExpiry,
        warrantyVendor: form.warrantyVendor,
        warrantyNotes: form.warrantyNotes,
        amcVendorId: form.amcVendorId,
        amcVendorName: form.amcVendorName,
        amcStartDate: form.amcStartDate,
        amcEndDate: form.amcEndDate,
        amcCost: form.amcCost ? Number(form.amcCost) : undefined,
        amcCoverage: form.amcCoverage,
        serviceIntervalDays: form.serviceIntervalDays ? Number(form.serviceIntervalDays) : undefined,
        totalRunningHours: 0,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
        notes: form.notes,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addMachine(newMachine);
      toast.success(`Machine ${newMachine.machineCode} added`);
    }
    setShowForm(false);
  }

  function handleDelete(m: Machine) {
    if (!confirm(`Delete "${m.name}"? This cannot be undone.`)) return;
    deleteMachine(m.id);
    toast.success("Machine removed");
  }

  if (!canView(currentUser, "machinery")) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Access restricted.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-orange-100 text-orange-600">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Machinery</h1>
            <p className="text-sm text-muted-foreground">{activeMachines.length} machine{activeMachines.length !== 1 ? "s" : ""} registered</p>
          </div>
        </div>
        {pCreate && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Add Machine
          </Button>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Machines", value: kpis.total, color: "text-foreground" },
          { label: "Operational", value: kpis.operational, color: "text-green-600" },
          { label: "Breakdown", value: kpis.breakdown, color: "text-red-600" },
          { label: "Service Overdue", value: kpis.serviceOverdue, color: "text-amber-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search machines..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.keys(STATUS_CONFIG).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {MACHINE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterStatus !== "all" || filterType !== "all" || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("all"); setFilterType("all"); setSearch(""); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Machine Card Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg bg-muted/20">
          <Wrench className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {activeMachines.length === 0 ? "No machines added yet." : "No machines match your filters."}
          </p>
          {pCreate && activeMachines.length === 0 && (
            <Button variant="outline" className="mt-3 gap-2" onClick={openNew}>
              <Plus className="w-4 h-4" /> Add First Machine
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((machine) => {
            const sc = STATUS_CONFIG[machine.currentStatus] || STATUS_CONFIG.Idle;
            const StatusIcon = sc.icon;
            return (
              <div
                key={machine.id}
                className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow group"
              >
                {/* Machine image / placeholder */}
                <div
                  className="relative h-40 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center cursor-pointer"
                  onClick={() => onViewMachine(machine.id)}
                  onKeyDown={(e) => e.key === "Enter" && onViewMachine(machine.id)}
                  role="button"
                  tabIndex={0}
                >
                  {machine.primaryImageData ? (
                    <img
                      src={machine.primaryImageData}
                      alt={machine.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Wrench className="w-10 h-10" />
                      <span className="text-xs">{machine.type}</span>
                    </div>
                  )}
                  {/* Status badge overlay */}
                  <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sc.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {sc.label}
                  </div>
                </div>

                {/* Card body */}
                <div className="p-3 space-y-2">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h3
                        className="font-semibold text-sm leading-tight cursor-pointer hover:text-primary"
                        onClick={() => onViewMachine(machine.id)}
                        onKeyDown={(e) => e.key === "Enter" && onViewMachine(machine.id)}
                        role="button"
                        tabIndex={0}
                      >
                        {machine.name}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground">{machine.machineCode} · {machine.department || machine.type}</p>
                  </div>

                  {/* Service status */}
                  <div className="pt-1 border-t">
                    <ServiceDueBadge nextServiceDue={machine.nextServiceDue} />
                    {machine.lastServiceDate && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Last service: {new Date(machine.lastServiceDate).toLocaleDateString("en-IN")}
                      </p>
                    )}
                    {machine.totalRunningHours > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {machine.totalRunningHours.toLocaleString("en-IN")} hrs total
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      onClick={() => onViewMachine(machine.id)}
                    >
                      View
                    </Button>
                    {pEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2"
                        onClick={() => openEdit(machine)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Machine Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMachine ? "Edit Machine" : "Add New Machine"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Basic Info */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Basic Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Machine Name *</Label>
                  <Input
                    value={form.name || ""}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Bystronic Fiber Laser 3015"
                  />
                </div>
                <div>
                  <Label>Type *</Label>
                  <Select value={form.type || ""} onValueChange={(v) => setForm({ ...form, type: v as MachineType })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {MACHINE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status *</Label>
                  <Select value={form.currentStatus || "Operational"} onValueChange={(v) => setForm({ ...form, currentStatus: v as MachineStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(STATUS_CONFIG).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input value={form.brand || ""} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Bystronic" />
                </div>
                <div>
                  <Label>Model</Label>
                  <Input value={form.model || ""} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="e.g. ByStar Fiber 3015" />
                </div>
                <div>
                  <Label>Serial Number</Label>
                  <Input value={form.serialNumber || ""} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
                </div>
                <div>
                  <Label>Asset ID / Tag</Label>
                  <Input value={form.assetId || ""} onChange={(e) => setForm({ ...form, assetId: e.target.value })} placeholder="Internal asset code" />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Bay 1 - Cutting Section" />
                </div>
                <div>
                  <Label>Department</Label>
                  <Input value={form.department || ""} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Cutting" />
                </div>
              </div>
            </div>

            {/* Purchase Info */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Purchase Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Purchase Date</Label>
                  <Input type="date" value={form.purchaseDate || ""} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
                </div>
                <div>
                  <Label>Purchase Cost (₹)</Label>
                  <Input type="number" value={form.purchaseCost || ""} onChange={(e) => setForm({ ...form, purchaseCost: Number(e.target.value) })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Purchase Vendor</Label>
                  <VendorSelect
                    value={form.purchaseVendorId || ""}
                    onChange={(id, name) => setForm({ ...form, purchaseVendorId: id, purchaseVendorName: name })}
                    placeholder="Select or add vendor"
                  />
                  {!form.purchaseVendorId && (
                    <Input
                      className="mt-1"
                      value={form.purchaseVendorName || ""}
                      onChange={(e) => setForm({ ...form, purchaseVendorName: e.target.value })}
                      placeholder="Or type vendor name manually"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Warranty */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Warranty</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Warranty Expiry</Label>
                  <Input type="date" value={form.warrantyExpiry || ""} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} />
                </div>
                <div>
                  <Label>Warranty Vendor</Label>
                  <Input value={form.warrantyVendor || ""} onChange={(e) => setForm({ ...form, warrantyVendor: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Warranty Notes</Label>
                  <Textarea rows={2} value={form.warrantyNotes || ""} onChange={(e) => setForm({ ...form, warrantyNotes: e.target.value })} />
                </div>
              </div>
            </div>

            {/* AMC */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Annual Maintenance Contract (AMC)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>AMC Vendor</Label>
                  <VendorSelect
                    value={form.amcVendorId || ""}
                    onChange={(id, name) => setForm({ ...form, amcVendorId: id, amcVendorName: name })}
                    placeholder="Select or add vendor"
                  />
                  {!form.amcVendorId && (
                    <Input
                      className="mt-1"
                      value={form.amcVendorName || ""}
                      onChange={(e) => setForm({ ...form, amcVendorName: e.target.value })}
                      placeholder="Or type vendor name manually"
                    />
                  )}
                </div>
                <div>
                  <Label>AMC Start</Label>
                  <Input type="date" value={form.amcStartDate || ""} onChange={(e) => setForm({ ...form, amcStartDate: e.target.value })} />
                </div>
                <div>
                  <Label>AMC End</Label>
                  <Input type="date" value={form.amcEndDate || ""} onChange={(e) => setForm({ ...form, amcEndDate: e.target.value })} />
                </div>
                <div>
                  <Label>AMC Cost (₹/year)</Label>
                  <Input type="number" value={form.amcCost || ""} onChange={(e) => setForm({ ...form, amcCost: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Coverage</Label>
                  <Input value={form.amcCoverage || ""} onChange={(e) => setForm({ ...form, amcCoverage: e.target.value })} placeholder="What the AMC covers" />
                </div>
              </div>
            </div>

            {/* Service / Operational */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Service & Operations</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Service Interval (days)</Label>
                  <Input type="number" value={form.serviceIntervalDays || ""} onChange={(e) => setForm({ ...form, serviceIntervalDays: Number(e.target.value) })} placeholder="e.g. 90" />
                </div>
                <div>
                  <Label>Next Service Due</Label>
                  <Input type="date" value={form.nextServiceDue || ""} onChange={(e) => setForm({ ...form, nextServiceDue: e.target.value })} />
                </div>
                <div>
                  <Label>Hourly Rate (₹/hr)</Label>
                  <Input type="number" value={form.hourlyRate || ""} onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })} placeholder="For internal cost allocation" />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingMachine ? "Save Changes" : "Add Machine"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
