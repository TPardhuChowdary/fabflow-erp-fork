// Provisional/name-only customer creation, callable from inside another
// module's own create flow (e.g. Add Project) without navigating away.
// Deliberately thin: reuses the exact same createCustomerRemote() write
// path and the exact same "only name is required" rule Customers.tsx's
// own Add Customer dialog already enforces (see that file's handleSave)
// — every other field is sent empty, which is already what makes
// isCustomerProfileComplete() return false and the real "Profile
// Pending" badge show up elsewhere in the app. No parallel customer
// entity, no parallel completeness rule, no separate table.
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
import { createCustomerRemote } from "@/lib/customersApi";
import { useStore } from "@/store";
import type { Customer } from "@/types";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the real, server-persisted Customer row once created —
   * the caller decides what to do with it (e.g. select it in a form). */
  onCreated: (customer: Customer) => void;
}

export function QuickAddCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const addCustomer = useStore((s) => s.addCustomer);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const reset = () => {
    setName("");
    setError("");
  };

  const handleSave = async () => {
    if (isSaving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Customer name is required");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      // Same shape as Customers.tsx's own empty() — every field besides
      // name sent blank, exactly the existing provisional-customer path.
      const result = await createCustomerRemote({
        name: trimmed,
        contactPerson: "",
        phone: "",
        email: "",
        address: "",
        gstin: "",
        stateName: "",
        stateCode: "",
        additionalDetails: [],
        emails: [],
        primaryEmail: "",
        deliveryAddresses: [],
      });
      if (result.status === "unauthenticated") {
        toast.error("Sign in required to create customers");
        return;
      }
      if (result.status === "error" || !result.data) {
        toast.error(result.error || "Failed to create customer");
        return;
      }
      addCustomer(result.data);
      toast.success(`"${result.data.name}" added — profile pending`);
      onCreated(result.data);
      reset();
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent data-ocid="quick_add_customer.dialog">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div className="space-y-1.5 py-2">
            <Label htmlFor="quick-add-customer-name">Customer Name *</Label>
            <Input
              id="quick-add-customer-name"
              autoFocus
              placeholder="e.g. Acme Fabrication Pvt Ltd"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              data-ocid="quick_add_customer.name_input"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Other details (GSTIN, address, contact) can be added later from
              the Customers page — this customer will show as{" "}
              <span className="font-medium">Profile Pending</span> until then.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Adding..." : "Add Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
