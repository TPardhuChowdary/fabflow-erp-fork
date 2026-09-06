// Phase 56 (Group 2) / Phase 19 — Tender Management list page. Mirrors
// the list+dialog convention CompanyDocuments.tsx/Vendors.tsx already
// use. Row click opens TenderDetail.tsx (the real hub — requirements
// checklist, readiness, document pack all live there).

import { CustomerSelect } from "@/components/CustomerSelect";
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
import { createTenderRemote } from "@/lib/tendersApi";
import { canCreate, canView } from "@/permissions";
import { useStore } from "@/store";
import type { TenderStatus } from "@/types";
import { ClipboardList, Plus, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";

const STATUS_COLOR: Record<TenderStatus, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  "In Progress": "bg-info/10 text-info border-info/30",
  Submitted: "bg-warning/15 text-warning border-warning/30",
  Won: "bg-success/10 text-success border-success/30",
  Lost: "bg-destructive/10 text-destructive border-destructive/30",
  Withdrawn: "bg-muted text-muted-foreground border-border",
};

const emptyForm = () => ({
  tenderNumber: "",
  title: "",
  customerId: "",
  authorityName: "",
  portal: "",
  bidType: "",
  submissionDeadline: "",
  emdAmount: "",
  status: "Draft" as TenderStatus,
});

interface TenderManagementProps {
  onViewTender?: (id: string) => void;
}

export function TenderManagement({ onViewTender }: TenderManagementProps) {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "tenders");
  const pCreate = canCreate(currentUser, "tenders");

  const { tenders, tenderRequirements, addTenderLocal } = useStore();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    if (isSaving) return;
    if (!form.tenderNumber.trim() || !form.title.trim()) {
      toast.error("Tender Number and Title are required");
      return;
    }
    setIsSaving(true);
    try {
      const result = await createTenderRemote({
        tenderNumber: form.tenderNumber.trim(),
        title: form.title.trim(),
        customerId: form.customerId || undefined,
        authorityName: form.authorityName || undefined,
        portal: form.portal || undefined,
        bidType: form.bidType || undefined,
        submissionDeadline: form.submissionDeadline || undefined,
        emdAmount: form.emdAmount ? Number(form.emdAmount) : undefined,
        status: form.status,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - tender was not created");
        return;
      }
      if (
        result.status === "denied" ||
        result.status === "error" ||
        !result.data
      ) {
        toast.error(result.error ?? "Could not create tender");
        return;
      }
      addTenderLocal(result.data);
      toast.success("Tender created");
      setForm(emptyForm());
      setAddOpen(false);
      onViewTender?.(result.data.id);
    } finally {
      setIsSaving(false);
    }
  };

  if (!pView) {
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

  const mandatoryOutstanding = (tenderId: string) =>
    (tenderRequirements || []).filter(
      (r) =>
        r.tenderId === tenderId && r.isMandatory && r.status !== "AVAILABLE",
    ).length;

  return (
    <div className="p-6 space-y-4" data-ocid="tenders.panel">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Tender Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Track tenders, requirement checklists, and submission readiness.
          </p>
        </div>
        {pCreate && (
          <Button
            onClick={() => setAddOpen(true)}
            data-ocid="tenders.add_button"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Tender
          </Button>
        )}
      </div>

      {(tenders || []).length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          No tenders tracked yet.
        </div>
      ) : (
        <div className="rounded-lg border divide-y" data-ocid="tenders.table">
          {(tenders || []).map((t) => {
            const outstanding = mandatoryOutstanding(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onViewTender?.(t.id)}
                className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/40"
                data-ocid="tenders.row"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {t.tenderNumber}
                    </span>
                    <span className="font-medium text-sm">{t.title}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_COLOR[t.status]}`}
                    >
                      {t.status}
                    </Badge>
                    {outstanding > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-destructive/10 text-destructive border-destructive/30"
                      >
                        {outstanding} mandatory outstanding
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.authorityName || "—"}
                    {t.submissionDeadline
                      ? ` · Deadline ${new Date(t.submissionDeadline).toLocaleString("en-IN")}`
                      : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Tender</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tender Number *</Label>
              <Input
                value={form.tenderNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tenderNumber: e.target.value }))
                }
                placeholder="e.g. GEM/2026/B/1234567"
                data-ocid="tenders.form.tender_number"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                data-ocid="tenders.form.title"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Customer (optional)</Label>
              <CustomerSelect
                value={form.customerId}
                onChange={(id) => setForm((f) => ({ ...f, customerId: id }))}
                data-ocid="tenders.form.customer"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Authority (if not an existing customer)
              </Label>
              <Input
                value={form.authorityName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, authorityName: e.target.value }))
                }
                placeholder="e.g. Municipal Corporation"
                data-ocid="tenders.form.authority"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Portal</Label>
                <Input
                  value={form.portal}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, portal: e.target.value }))
                  }
                  placeholder="e.g. GeM"
                  data-ocid="tenders.form.portal"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bid Type</Label>
                <Input
                  value={form.bidType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bidType: e.target.value }))
                  }
                  placeholder="e.g. Open"
                  data-ocid="tenders.form.bid_type"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Submission Deadline</Label>
                <Input
                  type="datetime-local"
                  value={form.submissionDeadline}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      submissionDeadline: e.target.value,
                    }))
                  }
                  data-ocid="tenders.form.deadline"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">EMD Amount (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.emdAmount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, emdAmount: e.target.value }))
                  }
                  data-ocid="tenders.form.emd"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as TenderStatus }))
                }
              >
                <SelectTrigger data-ocid="tenders.form.status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Submitted">Submitted</SelectItem>
                  <SelectItem value="Won">Won</SelectItem>
                  <SelectItem value="Lost">Lost</SelectItem>
                  <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={isSaving}
              data-ocid="tenders.form.save"
            >
              {isSaving ? "Saving…" : "Add Tender"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
