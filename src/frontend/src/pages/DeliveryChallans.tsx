import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Download,
  Eye,
  Pencil,
  Plus,
  Printer,
  Share2,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { DeliveryChallanPrintView } from "../components/DeliveryChallanPrintView";
import { StatusBadge } from "../components/StatusBadge";
import { ChallanDocContent } from "../lib/documentRenderers";
import {
  openShareModalV2,
  printDocument,
  handleDownload as triggerDownload,
} from "../lib/documentUtils";

import {
  canCreate,
  canDelete,
  canDownload,
  canEdit,
  canPrint,
  canShare,
  canView,
} from "../permissions";
import { useStore } from "../store";
import type {
  DCProjectEntry,
  DCStatus,
  DeliveryChallan,
  Project,
} from "../types";

interface DCForm {
  selectedProjectIds: string[];
  customerId: string;
  vehicleNo: string;
  driverName: string;
  dispatchDate: string;
  receiverName: string;
  dispatchQtys: Record<string, number>;
  useCustomerAddress: boolean;
  customDeliveryAddress: string;
}

const emptyForm = (): DCForm => ({
  selectedProjectIds: [],
  customerId: "",
  vehicleNo: "",
  driverName: "",
  dispatchDate: new Date().toISOString().split("T")[0],
  receiverName: "",
  dispatchQtys: {},
  useCustomerAddress: true,
  customDeliveryAddress: "",
});

export function DeliveryChallans() {
  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "delivery_challans");
  const pEdit = canEdit(currentUser, "delivery_challans");
  const pDelete = canDelete(currentUser, "delivery_challans");
  const pPrint = canPrint(currentUser, "delivery_challans");
  const pDownload = canDownload(currentUser, "delivery_challans");
  const pShare = canShare(currentUser, "delivery_challans");

  const {
    deliveryChallans,
    projects,
    customers,
    addDeliveryChallan,
    updateDeliveryChallan,
    deleteDeliveryChallan,
    settings,
  } = useStore();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DCForm>(emptyForm());
  const [qtyErrors, setQtyErrors] = useState<Record<string, string>>({});

  // Preview state
  const [selectedChallan, setSelectedChallan] =
    useState<DeliveryChallan | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  // Edit dialog state (separate from preview)
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingChallan, setEditingChallan] = useState<DeliveryChallan | null>(
    null,
  );
  const [editForm, setEditForm] = useState<{
    qtys: Record<string, number>;
    vehicleNo: string;
    driverName: string;
    receiverName: string;
    useCustomerAddress: boolean;
    customDeliveryAddress: string;
  }>({
    qtys: {},
    vehicleNo: "",
    driverName: "",
    receiverName: "",
    useCustomerAddress: true,
    customDeliveryAddress: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isEditSaving, setIsEditSaving] = useState(false);

  // ── DC Number system (same pattern as Invoice) ───────────────────
  function previewDcNo(): string {
    const year = new Date().getFullYear();
    const maxNum = (deliveryChallans || []).reduce((max, dc) => {
      const match = (dc.dcNo ?? "").match(/DC-\d{4}-(\d+)/);
      return match ? Math.max(max, Number.parseInt(match[1])) : max;
    }, 0);
    return `DC-${year}-${String(maxNum + 1).padStart(3, "0")}`;
  }

  const [dcNumber, setDcNumber] = useState<string>("");

  const safeProjects = projects || [];
  const safeCustomers = customers || [];
  const safeChallans = deliveryChallans || [];

  const sorted = [...safeChallans].sort((a, b) => b.createdAt - a.createdAt);

  // ── Helpers ──────────────────────────────────────────────────────

  function getProjectTotalQty(project: Project): number {
    return project.totalQty ?? 0;
  }

  function getAlreadyDispatched(projectId: string): number {
    return safeChallans.reduce((sum, dc) => {
      const entry = (dc.projectEntries || []).find(
        (e) => e.projectId === projectId,
      );
      return sum + (entry ? entry.dispatchQty : 0);
    }, 0);
  }

  function getOtherDispatched(
    projectId: string,
    excludeChallanId: string,
  ): number {
    return safeChallans
      .filter((c) => c.id !== excludeChallanId)
      .reduce((sum, c) => {
        const entry = (c.projectEntries || []).find(
          (e) => e.projectId === projectId,
        );
        return sum + (entry?.dispatchQty || 0);
      }, 0);
  }

  function getRemaining(project: Project): number {
    return getProjectTotalQty(project) - getAlreadyDispatched(project.id);
  }

  // ── Preview handlers ─────────────────────────────────────────────

  const openPreview = (challan: DeliveryChallan) => {
    setSelectedChallan(challan);
    setShowPreview(true);
  };

  function handleClosePreview() {
    setShowPreview(false);
  }

  async function handleDownload(dc: DeliveryChallan) {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `pdf-content-${dc.id}`;
    const cust = safeCustomers.find((c) => c.id === dc.customerId) ?? null;
    flushSync(() => {
      root.render(
        <ChallanDocContent
          id={docId}
          challan={dc}
          customer={cust}
          projects={safeProjects}
          settings={settings as unknown as Record<string, string>}
        />,
      );
    });
    try {
      triggerDownload(docId, `DC_${dc.dcNo ?? dc.id}.pdf`);
    } catch (e) {
      console.error("DOWNLOAD FAILED", e);
    } finally {
      root.unmount();
      container.remove();
    }
  }

  function handleShare(dc) {
    openShareModalV2(
      () => `Document No: ${dc.dcNo}\nLink: ${window.location.href}`,
    );
  }

  async function handlePrint(dc: DeliveryChallan) {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `pdf-content-${dc.id}`;
    const cust = safeCustomers.find((c) => c.id === dc.customerId) ?? null;
    flushSync(() => {
      root.render(
        <ChallanDocContent
          id={docId}
          challan={dc}
          customer={cust}
          projects={safeProjects}
          settings={settings as unknown as Record<string, string>}
        />,
      );
    });
    const el = document.getElementById(docId);
    const content = el?.innerHTML || "";
    root.unmount();
    container.remove();
    if (!content) return;
    const win = window.open("", "_blank", "width=900,height=650");
    if (!win) return;
    win.document.write(
      `<html><head><title>Delivery Challan</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;}table{border-collapse:collapse;width:100%;}@page{size:A4;margin:15mm;}@media print{body{padding:0;}}</style></head><body>${content}</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  // ── Edit handlers ────────────────────────────────────────────────

  function handleOpenEdit(challan: DeliveryChallan) {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    const qtys: Record<string, number> = {};
    for (const entry of challan.projectEntries || []) {
      qtys[entry.projectId] = entry.dispatchQty;
    }
    setEditForm({
      qtys,
      vehicleNo: challan.vehicleNo || "",
      driverName: challan.driverName || "",
      receiverName: challan.receiverName || "",
      useCustomerAddress: challan.deliveryAddress?.type !== "custom",
      customDeliveryAddress:
        challan.deliveryAddress?.type === "custom"
          ? challan.deliveryAddress.value
          : "",
    });
    setEditErrors({});
    setEditingChallan(challan);
    setShowEditDialog(true);
  }

  function handleEditQtyChange(projectId: string, qty: number) {
    setEditForm((prev) => ({
      ...prev,
      qtys: { ...prev.qtys, [projectId]: qty },
    }));
    if (!editingChallan) return;
    const project = safeProjects.find((p) => p.id === projectId);
    if (!project) return;
    const otherDispatched = getOtherDispatched(projectId, editingChallan.id);
    const maxAllowed = (project.totalQty ?? 0) - otherDispatched;
    if (qty < 0) {
      setEditErrors((prev) => ({
        ...prev,
        [projectId]: "Quantity cannot be negative",
      }));
    } else if (qty > maxAllowed) {
      setEditErrors((prev) => ({
        ...prev,
        [projectId]: `Max allowed: ${maxAllowed}`,
      }));
    } else {
      setEditErrors((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
    }
  }

  function handleSaveEdit() {
    console.log("FORM SUBMITTED");
    if (isEditSaving) return;
    setIsEditSaving(true);
    try {
      if (!editingChallan) return;
      if (!pEdit) {
        toast.error("Access restricted: edit permission required");
        return;
      }
      const errors: Record<string, string> = {};

      for (const entry of editingChallan.projectEntries || []) {
        const project = safeProjects.find((p) => p.id === entry.projectId);
        if (!project) continue;
        const otherDispatched = getOtherDispatched(
          entry.projectId,
          editingChallan.id,
        );
        const maxAllowed = (project.totalQty ?? 0) - otherDispatched;
        const qty = editForm.qtys[entry.projectId] ?? entry.dispatchQty;
        if (qty < 0) {
          errors[entry.projectId] = "Quantity cannot be negative";
        } else if (qty > maxAllowed) {
          errors[entry.projectId] = `Max allowed: ${maxAllowed}`;
        }
      }

      if (Object.keys(errors).length > 0) {
        setEditErrors(errors);
        toast.error("Fix quantity errors before saving");
        return;
      }

      const updatedEntries: DCProjectEntry[] = (
        editingChallan.projectEntries || []
      ).map((entry) => ({
        ...entry,
        dispatchQty: editForm.qtys[entry.projectId] ?? entry.dispatchQty,
      }));

      const updated: DeliveryChallan = {
        ...editingChallan,
        projectEntries: updatedEntries,
        vehicleNo: editForm.vehicleNo,
        driverName: editForm.driverName,
        receiverName: editForm.receiverName,
        deliveryAddress: {
          type: editForm.useCustomerAddress ? "customer" : "custom",
          value: editForm.useCustomerAddress
            ? safeCustomers.find((c) => c.id === editingChallan.customerId)
                ?.address || ""
            : editForm.customDeliveryAddress,
        },
      };

      updateDeliveryChallan(updated);
      setShowEditDialog(false);
      setEditingChallan(null);
      toast.success("Delivery Challan updated");
      console.log("SAVE COMPLETE");
    } finally {
      setIsEditSaving(false);
    }
  }

  // ── Status update ────────────────────────────────────────────────

  const updateStatus = (id: string, status: DCStatus) => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    const dc = safeChallans.find((x) => x.id === id);
    if (dc) {
      updateDeliveryChallan({ ...dc, status });
      toast.success("Status updated");
    }
  };

  // ── Project selection ────────────────────────────────────────────

  function handleAddProject(projectId: string) {
    if (form.selectedProjectIds.includes(projectId)) return;

    const project = safeProjects.find((p) => p.id === projectId);
    if (!project) return;

    if (
      form.selectedProjectIds.length > 0 &&
      project.customerId !== form.customerId
    ) {
      toast.error("All projects must belong to the same customer");
      return;
    }

    const newCustomerId =
      form.selectedProjectIds.length === 0
        ? project.customerId
        : form.customerId;

    setForm((prev) => ({
      ...prev,
      selectedProjectIds: [...prev.selectedProjectIds, projectId],
      customerId: newCustomerId,
      dispatchQtys: { ...prev.dispatchQtys, [projectId]: 0 },
    }));
  }

  function handleRemoveProject(projectId: string) {
    setForm((prev) => {
      const newIds = prev.selectedProjectIds.filter((id) => id !== projectId);
      const newQtys = { ...prev.dispatchQtys };
      delete newQtys[projectId];
      const newErrors = { ...qtyErrors };
      delete newErrors[projectId];
      setQtyErrors(newErrors);
      return {
        ...prev,
        selectedProjectIds: newIds,
        customerId: newIds.length === 0 ? "" : prev.customerId,
        dispatchQtys: newQtys,
      };
    });
  }

  function handleDispatchQtyChange(projectId: string, raw: string) {
    const value = Number(raw);
    const project = safeProjects.find((p) => p.id === projectId);
    if (!project) return;
    const remaining = getRemaining(project);

    if (value > remaining) {
      setQtyErrors((prev) => ({
        ...prev,
        [projectId]: `Cannot exceed remaining qty (${remaining})`,
      }));
    } else {
      setQtyErrors((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
    }

    setForm((prev) => ({
      ...prev,
      dispatchQtys: { ...prev.dispatchQtys, [projectId]: value },
    }));
  }

  // ── Save new challan ─────────────────────────────────────────────

  function handleSave() {
    console.log("FORM SUBMITTED");
    if (isSaving) return;
    setIsSaving(true);
    try {
      console.log("Creating challan:", form);
      if (form.selectedProjectIds.length === 0) {
        toast.error("Select at least one project");
        return;
      }
      const projectsMissingQty = form.selectedProjectIds.filter((id) => {
        const p = safeProjects.find((x) => x.id === id);
        return p?.totalQty == null;
      });
      if (projectsMissingQty.length > 0) {
        toast.error(
          "Some selected projects do not have Total Quantity set. Please update those projects first.",
        );
        return;
      }
      if (!form.dispatchDate) {
        toast.error("Dispatch date is required");
        return;
      }
      if (Object.keys(qtyErrors).length > 0) {
        toast.error("Fix quantity errors before saving");
        return;
      }
      const hasDispatch = form.selectedProjectIds.some(
        (pid) => (form.dispatchQtys[pid] || 0) > 0,
      );
      if (!hasDispatch) {
        toast.error("Enter dispatch quantity for at least one project");
        return;
      }

      for (const pid of form.selectedProjectIds) {
        const project = safeProjects.find((p) => p.id === pid);
        if (!project) continue;
        const remaining = getRemaining(project);
        const qty = form.dispatchQtys[pid] || 0;
        if (qty > remaining) {
          toast.error(
            `Dispatch qty for "${project.projectName}" exceeds remaining (${remaining})`,
          );
          return;
        }
      }

      const projectEntries: DCProjectEntry[] = form.selectedProjectIds.map(
        (pid) => ({
          projectId: pid,
          dispatchQty: form.dispatchQtys[pid] || 0,
        }),
      );

      // Use editable dcNumber; fall back to previewDcNo() if empty
      const dcNoToUse = dcNumber.trim() || previewDcNo();
      const duplicate = (deliveryChallans || []).find(
        (d) => d.dcNo === dcNoToUse,
      );
      if (duplicate) {
        toast.error(
          `Challan number ${dcNoToUse} already exists. Please use a different number.`,
        );
        setIsSaving(false);
        return;
      }
      const dcNo = dcNoToUse;
      addDeliveryChallan({
        id: crypto.randomUUID(),
        dcNo,
        customerId: form.customerId,
        projectEntries,
        vehicleNo: form.vehicleNo,
        driverName: form.driverName,
        dispatchDate: form.dispatchDate,
        receiverName: form.receiverName,
        status: "Prepared",
        createdAt: Date.now(),
        items: [],
        deliveryAddress: {
          type: form.useCustomerAddress ? "customer" : "custom",
          value: form.useCustomerAddress
            ? selectedCustomer?.address || ""
            : form.customDeliveryAddress,
        },
      });

      toast.success(`Delivery Challan ${dcNo} created`);
      setOpen(false);
      setForm(emptyForm());
      setDcNumber("");
      setQtyErrors({});
      console.log("SAVE COMPLETE");
    } finally {
      setIsSaving(false);
    }
  }

  const availableProjects = safeProjects.filter(
    (p) => !form.selectedProjectIds.includes(p.id),
  );

  const selectedCustomer = safeCustomers.find((c) => c.id === form.customerId);

  if (!canView(currentUser, "delivery_challans")) {
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

  // Derive customer for selected challan preview
  const previewCustomer = selectedChallan
    ? safeCustomers.find((c) => c.id === selectedChallan.customerId) || null
    : null;

  return (
    <div className="space-y-4" data-ocid="delivery_challans.page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Delivery Challans</h1>
          <p className="text-sm text-muted-foreground">
            {safeChallans.length} challan{safeChallans.length !== 1 ? "s" : ""}
          </p>
        </div>
        {pCreate && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            data-ocid="delivery_challans.create.primary_button"
          >
            <Plus className="w-4 h-4 mr-1" /> New DC
          </Button>
        )}
      </div>

      {/* List Table */}
      <div className="table-wrapper">
        <div
          className="rounded-md border"
          data-ocid="delivery_challans.list.table"
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">DC No.</TableHead>
                <TableHead className="text-xs font-semibold">
                  Customer
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Projects
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Dispatch Date
                </TableHead>
                <TableHead className="text-xs font-semibold">Vehicle</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold w-52">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((dc, i) => {
                const cust = safeCustomers.find((c) => c.id === dc.customerId);
                const projectNames =
                  (dc.projectEntries || []).length > 0
                    ? (dc.projectEntries || [])
                        .map(
                          (e) =>
                            safeProjects.find((p) => p.id === e.projectId)
                              ?.projectName || e.projectId,
                        )
                        .join(", ")
                    : "N/A";
                return (
                  <TableRow
                    key={dc.id}
                    className="hover:bg-muted/30"
                    data-ocid={`delivery_challans.list.row.${i + 1}`}
                  >
                    <TableCell className="text-xs font-mono font-semibold">
                      {dc.dcNo}
                    </TableCell>
                    <TableCell className="text-sm">
                      {cust?.name ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">
                      {projectNames}
                    </TableCell>
                    <TableCell className="text-xs">{dc.dispatchDate}</TableCell>
                    <TableCell className="text-xs">{dc.vehicleNo}</TableCell>
                    <TableCell>
                      <StatusBadge status={dc.status} />
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {/* Eye — View */}
                        <button
                          type="button"
                          title="View"
                          className="p-1 rounded hover:bg-muted text-blue-600"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openPreview(dc);
                          }}
                          data-ocid={`delivery_challans.view.button.${i + 1}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Edit */}
                        {pEdit && (
                          <button
                            type="button"
                            title="Edit"
                            className="p-1 rounded hover:bg-muted text-gray-600"
                            onClick={() => handleOpenEdit(dc)}
                            data-ocid={`delivery_challans.edit_button.${i + 1}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}

                        {/* Print */}
                        {pPrint && (
                          <button
                            type="button"
                            title="Print"
                            className="p-1 rounded hover:bg-muted text-gray-600"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handlePrint(dc);
                            }}
                            data-ocid={`delivery_challans.print.button.${i + 1}`}
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        )}

                        {/* Download */}
                        {pDownload && (
                          <button
                            type="button"
                            title="Download PDF"
                            className="p-1 rounded hover:bg-muted text-gray-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(dc);
                            }}
                            data-ocid={`delivery_challans.download.button.${i + 1}`}
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}

                        {/* Share */}
                        {pShare && (
                          <button
                            type="button"
                            title="Share"
                            className="p-1 rounded hover:bg-muted text-green-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShare(dc);
                            }}
                            data-ocid={`delivery_challans.share.button.${i + 1}`}
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Status */}
                        <Select
                          value={dc.status}
                          disabled={!pEdit}
                          onValueChange={(v) =>
                            updateStatus(dc.id, v as DCStatus)
                          }
                        >
                          <SelectTrigger
                            className="h-6 text-xs w-28"
                            disabled={!pEdit}
                            data-ocid={`delivery_challans.status.select.${i + 1}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              [
                                "Prepared",
                                "Dispatched",
                                "Delivered",
                              ] as DCStatus[]
                            ).map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Delete */}
                        {pDelete && (
                          <button
                            type="button"
                            title="Delete"
                            className="p-1 rounded hover:bg-muted text-red-500"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Are you sure you want to delete challan "${dc.dcNo}"? This cannot be undone.`,
                                )
                              )
                                return;
                              deleteDeliveryChallan(dc.id);
                              toast.success("Delivery challan deleted");
                            }}
                            data-ocid={`delivery_challans.delete_button.${i + 1}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-sm text-muted-foreground"
                    data-ocid="delivery_challans.list.empty_state"
                  >
                    No delivery challans
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Preview Modal (view-only) ─────────────────────────────── */}
      <DeliveryChallanPrintView
        challan={selectedChallan}
        customer={previewCustomer}
        projects={safeProjects}
        open={showPreview}
        onClose={handleClosePreview}
      />

      {/* ── Edit Dialog ──────────────────────────────────────────── */}
      <Dialog
        open={showEditDialog}
        onOpenChange={(v) => {
          if (!v) {
            setShowEditDialog(false);
            setEditingChallan(null);
            setEditErrors({});
          }
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          data-ocid="delivery_challans.edit.dialog"
        >
          <DialogHeader>
            <DialogTitle>
              Edit Delivery Challan
              {editingChallan && (
                <span className="ml-2 font-mono text-sm text-muted-foreground">
                  {editingChallan.dcNo}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {editingChallan && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                console.log("FORM SUBMITTED");
                handleSaveEdit();
              }}
            >
              <div className="modal-body">
                <div className="space-y-4">
                  {/* Logistics fields */}
                  <div className="form-grid">
                    <div>
                      <Label className="text-xs">Vehicle No</Label>
                      <Input
                        value={editForm.vehicleNo}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            vehicleNo: e.target.value,
                          }))
                        }
                        className="h-8 text-sm mt-1"
                        data-ocid="delivery_challans.edit.vehicle.input"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Driver Name</Label>
                      <Input
                        value={editForm.driverName}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            driverName: e.target.value,
                          }))
                        }
                        className="h-8 text-sm mt-1"
                        data-ocid="delivery_challans.edit.driver.input"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Receiver Name</Label>
                      <Input
                        value={editForm.receiverName}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            receiverName: e.target.value,
                          }))
                        }
                        className="h-8 text-sm mt-1"
                        data-ocid="delivery_challans.edit.receiver.input"
                      />
                    </div>
                    <div className="col-span-3">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs">Delivery Address</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Use Customer Address
                          </span>
                          <Switch
                            checked={editForm.useCustomerAddress}
                            onCheckedChange={(v) =>
                              setEditForm((p) => ({
                                ...p,
                                useCustomerAddress: v,
                              }))
                            }
                          />
                        </div>
                      </div>
                      {!editForm.useCustomerAddress && (
                        <Textarea
                          placeholder="Enter delivery address..."
                          value={editForm.customDeliveryAddress}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              customDeliveryAddress: e.target.value,
                            }))
                          }
                          className="text-sm min-h-[60px]"
                        />
                      )}
                    </div>
                  </div>

                  {/* Qty editing */}
                  {(editingChallan.projectEntries || []).length > 0 && (
                    <div className="table-wrapper">
                      <div className="table-wrapper rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40">
                              <TableHead className="text-xs">Project</TableHead>
                              <TableHead className="text-xs text-right">
                                Dispatch Qty
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(editingChallan.projectEntries || []).map(
                              (entry) => {
                                const proj = safeProjects.find(
                                  (p) => p.id === entry.projectId,
                                );
                                return (
                                  <TableRow key={entry.projectId}>
                                    <TableCell className="text-xs font-medium">
                                      {proj?.projectName || entry.projectId}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex flex-col items-end gap-1">
                                        <Input
                                          type="number"
                                          min={0}
                                          value={
                                            editForm.qtys[entry.projectId] ??
                                            entry.dispatchQty
                                          }
                                          onChange={(e) =>
                                            handleEditQtyChange(
                                              entry.projectId,
                                              Number(e.target.value),
                                            )
                                          }
                                          className="h-7 w-20 text-xs text-right"
                                          style={{
                                            color: "#000",
                                            backgroundColor: "#fff",
                                            caretColor: "#000",
                                          }}
                                        />
                                        {editErrors[entry.projectId] && (
                                          <span className="text-xs text-destructive">
                                            {editErrors[entry.projectId]}
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              },
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
                {/* end space-y-4 */}
              </div>
              {/* end modal-body */}
              <div className="modal-footer">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingChallan(null);
                    setEditErrors({});
                  }}
                  data-ocid="delivery_challans.edit.cancel_button"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  disabled={isEditSaving}
                  data-ocid="delivery_challans.edit.save_button"
                >
                  {isEditSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── New DC Dialog ────────────────────────────────────────── */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setForm(emptyForm());
            setQtyErrors({});
            setDcNumber("");
          }
        }}
      >
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
          data-ocid="delivery_challans.dialog"
        >
          <DialogHeader>
            <DialogTitle>New Delivery Challan</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log("FORM SUBMITTED");
              handleSave();
            }}
          >
            <div className="modal-body">
              <div className="space-y-4">
                {/* Project Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">
                    Select Projects *
                  </Label>
                  <div className="flex gap-2">
                    <Select value="" onValueChange={handleAddProject}>
                      <SelectTrigger
                        className="h-8 text-sm flex-1"
                        data-ocid="delivery_challans.form.project.select"
                      >
                        <SelectValue placeholder="Add a project\u2026" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProjects.length === 0 ? (
                          <div className="py-2 px-3 text-xs text-muted-foreground">
                            No more projects available
                          </div>
                        ) : (
                          availableProjects.map((p) => (
                            <SelectItem
                              key={p.id}
                              value={p.id}
                              className="text-sm"
                            >
                              {p.projectName}
                              {p.projectNo ? ` (${p.projectNo})` : ""}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {form.selectedProjectIds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {form.selectedProjectIds.map((pid) => {
                        const p = safeProjects.find((x) => x.id === pid);
                        return (
                          <Badge
                            key={pid}
                            variant="secondary"
                            className="flex items-center gap-1 text-xs"
                          >
                            {p?.projectName || pid}
                            <button
                              type="button"
                              onClick={() => handleRemoveProject(pid)}
                              className="ml-0.5 hover:text-destructive"
                              data-ocid={
                                "delivery_challans.form.remove_project.button"
                              }
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>

                {form.customerId && (
                  <div>
                    <Label className="text-xs">Customer (auto-filled)</Label>
                    <div className="mt-1 h-8 px-3 flex items-center rounded-md border bg-muted/50 text-sm">
                      {selectedCustomer?.name ?? form.customerId}
                    </div>
                  </div>
                )}

                {/* Delivery Address */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      Delivery Address
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Use Customer Address
                      </span>
                      <Switch
                        checked={form.useCustomerAddress}
                        onCheckedChange={(v) =>
                          setForm((prev) => ({
                            ...prev,
                            useCustomerAddress: v,
                          }))
                        }
                        data-ocid="delivery_challans.form.use_customer_address.toggle"
                      />
                    </div>
                  </div>
                  {!form.useCustomerAddress && (
                    <Textarea
                      placeholder="Enter delivery address..."
                      value={form.customDeliveryAddress}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          customDeliveryAddress: e.target.value,
                        }))
                      }
                      className="text-sm min-h-[80px]"
                      data-ocid="delivery_challans.form.custom_delivery_address.input"
                    />
                  )}
                  {form.useCustomerAddress && selectedCustomer?.address && (
                    <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2 whitespace-pre-line">
                      {selectedCustomer.address}
                    </div>
                  )}
                </div>

                {form.selectedProjectIds.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">
                      Dispatch Quantities
                    </Label>
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="text-xs">Project</TableHead>
                            <TableHead className="text-xs text-right">
                              Total Qty
                            </TableHead>
                            <TableHead className="text-xs text-right">
                              Dispatched
                            </TableHead>
                            <TableHead className="text-xs text-right">
                              Remaining
                            </TableHead>
                            <TableHead className="text-xs text-right">
                              Dispatch Now
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {form.selectedProjectIds.map((pid) => {
                            const p = safeProjects.find((x) => x.id === pid);
                            if (!p) return null;
                            const totalQty = getProjectTotalQty(p);
                            const dispatched = getAlreadyDispatched(pid);
                            const remaining = getRemaining(p);
                            return (
                              <TableRow key={pid}>
                                <TableCell className="text-xs font-medium">
                                  {p.projectName}
                                  {p.totalQty == null && (
                                    <span className="ml-1 text-amber-600">
                                      (\u26A0 no total qty)
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {totalQty}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {dispatched}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {remaining}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex flex-col items-end gap-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={remaining}
                                      value={form.dispatchQtys[pid] ?? ""}
                                      onChange={(e) =>
                                        handleDispatchQtyChange(
                                          pid,
                                          e.target.value,
                                        )
                                      }
                                      className="h-7 w-20 text-xs text-right"
                                      style={{
                                        color: "#000",
                                        backgroundColor: "#fff",
                                        caretColor: "#000",
                                      }}
                                      data-ocid="delivery_challans.form.dispatch_qty.input"
                                    />
                                    {qtyErrors[pid] && (
                                      <span className="text-xs text-destructive">
                                        {qtyErrors[pid]}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Logistics */}
                <div className="form-grid">
                  <div>
                    <Label className="text-xs">Challan Number</Label>
                    <Input
                      value={dcNumber || previewDcNo()}
                      onChange={(e) => setDcNumber(e.target.value)}
                      placeholder={previewDcNo()}
                      className="h-8 text-sm mt-1 font-mono"
                      data-ocid="delivery_challans.form.dc_number.input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Dispatch Date *</Label>
                    <Input
                      type="date"
                      value={form.dispatchDate}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          dispatchDate: e.target.value,
                        }))
                      }
                      className="h-8 text-sm mt-1"
                      data-ocid="delivery_challans.form.dispatch_date.input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Vehicle Number</Label>
                    <Input
                      value={form.vehicleNo}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          vehicleNo: e.target.value,
                        }))
                      }
                      placeholder="MH01AB1234"
                      className="h-8 text-sm mt-1"
                      data-ocid="delivery_challans.form.vehicle_no.input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Driver Name</Label>
                    <Input
                      value={form.driverName}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          driverName: e.target.value,
                        }))
                      }
                      className="h-8 text-sm mt-1"
                      data-ocid="delivery_challans.form.driver_name.input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Receiver Name</Label>
                    <Input
                      value={form.receiverName}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          receiverName: e.target.value,
                        }))
                      }
                      className="h-8 text-sm mt-1"
                      data-ocid="delivery_challans.form.receiver_name.input"
                    />
                  </div>
                </div>
              </div>
              {/* end space-y-4 */}
            </div>
            {/* end modal-body */}
            <div className="modal-footer">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setForm(emptyForm());
                  setDcNumber("");
                  setQtyErrors({});
                }}
                data-ocid="delivery_challans.form.cancel_button"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                type="submit"
                disabled={isSaving}
                data-ocid="delivery_challans.form.submit_button"
              >
                {isSaving ? "Saving..." : "Create Challan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
