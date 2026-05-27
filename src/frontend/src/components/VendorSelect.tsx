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
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "../store";
import type { Vendor } from "../types";

const ADD_NEW_SENTINEL = "__add_new__";

interface Props {
  value: string | undefined;
  onChange: (vendorId: string, vendorName: string) => void;
  placeholder?: string;
  "data-ocid"?: string;
}

export function VendorSelect({
  value,
  onChange,
  placeholder = "Select vendor",
  "data-ocid": dataOcid,
}: Props) {
  const { vendors, addVendor } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    gstNumber: "",
  });

  const selected = vendors.find((v) => v.id === value);

  const handleSelect = (val: string) => {
    if (val === ADD_NEW_SENTINEL) {
      setModalOpen(true);
      return;
    }
    const vendor = vendors.find((v) => v.id === val);
    if (vendor) onChange(vendor.id, vendor.name);
  };

  const handleSave = () => {
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
    const newVendor: Vendor = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      gstNumber: form.gstNumber.trim() || undefined,
      createdAt: Date.now(),
    };
    addVendor(newVendor);
    onChange(newVendor.id, newVendor.name);
    toast.success("Vendor added");
    setModalOpen(false);
    setForm({ name: "", phone: "", address: "", gstNumber: "" });
  };

  return (
    <>
      <Select value={value ?? ""} onValueChange={handleSelect}>
        <SelectTrigger data-ocid={dataOcid}>
          <SelectValue placeholder={placeholder}>
            {selected ? (
              selected.name
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {vendors.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name}
            </SelectItem>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <SelectItem value={ADD_NEW_SENTINEL}>
              <span className="flex items-center gap-1.5 text-primary font-medium">
                <Plus className="w-3.5 h-3.5" /> Add New Vendor
              </span>
            </SelectItem>
          </div>
        </SelectContent>
      </Select>

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
