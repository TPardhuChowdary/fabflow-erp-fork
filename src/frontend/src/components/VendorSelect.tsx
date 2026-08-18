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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { createVendorRemote } from "../lib/vendorsApi";
import { canCreate } from "../permissions";
import { useStore } from "../store";

const ADD_NEW_SENTINEL = "__add_new__";

interface Props {
  value: string | undefined;
  onChange: (vendorId: string, vendorName: string) => void;
  placeholder?: string;
  className?: string;
  "data-ocid"?: string;
}

export function VendorSelect({
  value,
  onChange,
  placeholder = "Select vendor",
  className,
  "data-ocid": dataOcid,
}: Props) {
  const { vendors, addVendor } = useStore();
  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "vendors");
  const [modalOpen, setModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    gstNumber: "",
  });

  const handleSelect = (val: string) => {
    if (val === ADD_NEW_SENTINEL) {
      if (!pCreate) return;
      setModalOpen(true);
      return;
    }
    const vendor = vendors.find((v) => v.id === val);
    if (vendor) onChange(vendor.id, vendor.name);
  };

  const handleSave = async () => {
    // Phase 21A — defensive re-check, mirrors the trigger-hiding gate
    // below. The UI already hides the trigger for a non-vendors.create
    // user, but the handler itself must not trust that alone.
    if (!pCreate) {
      toast.error("You do not have permission to add vendors");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Vendor name is required");
      return;
    }
    // Deduplicate by normalized name
    const exists = vendors.find(
      (v) => v.name.trim().toLowerCase() === form.name.trim().toLowerCase(),
    );
    if (exists) {
      onChange(exists.id, exists.name);
      toast.success(`Using existing vendor: ${exists.name}`);
      setModalOpen(false);
      setForm({ name: "", phone: "", address: "", gstNumber: "" });
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Phase 21A — remote-first, same contract as Vendors.tsx.
      const result = await createVendorRemote({
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        gstNumber: form.gstNumber.trim() || undefined,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - vendor was not saved");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save vendor");
        return;
      }
      if (!result.data) {
        toast.error("Could not save vendor");
        return;
      }
      addVendor(result.data);
      onChange(result.data.id, result.data.name);
      toast.success("Vendor added");
      setModalOpen(false);
      setForm({ name: "", phone: "", address: "", gstNumber: "" });
    } finally {
      setIsSaving(false);
    }
  };

  const options = [
    ...vendors.map((v) => ({
      value: v.id,
      label: v.name,
      searchText: `${v.phone ?? ""} ${v.gstNumber ?? ""} ${v.address ?? ""}`,
    })),
    ...(pCreate
      ? [{ value: ADD_NEW_SENTINEL, label: "+ Add New Vendor" }]
      : []),
  ];

  return (
    <>
      <SearchableSelect
        value={value ?? ""}
        onChange={handleSelect}
        options={options}
        placeholder={placeholder}
        className={className}
        searchPlaceholder="Search by name, phone, or GST…"
        emptyText="No vendors found."
        data-ocid={dataOcid}
        renderOption={(o) =>
          o.value === ADD_NEW_SENTINEL ? (
            <span className="flex items-center gap-1.5 text-primary font-medium">
              <Plus className="w-3.5 h-3.5" /> {o.label}
            </span>
          ) : (
            <span className="flex-1 truncate">{o.label}</span>
          )
        }
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent data-ocid="vendor_select.dialog">
          <DialogHeader>
            <DialogTitle>Add New Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Vendor Name *</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Steel India Pvt Ltd"
                data-ocid="vendor_select.name.input"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="e.g. 9876543210"
                data-ocid="vendor_select.phone.input"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Address</Label>
              <Input
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                placeholder="City / Area"
                data-ocid="vendor_select.address.input"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">GST Number (optional)</Label>
              <Input
                value={form.gstNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gstNumber: e.target.value }))
                }
                placeholder="27ABCDE1234F1Z5"
                data-ocid="vendor_select.gst.input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              data-ocid="vendor_select.dialog.cancel_button"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              data-ocid="vendor_select.dialog.submit_button"
            >
              Add Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
