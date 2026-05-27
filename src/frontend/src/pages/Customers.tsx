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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit2, History, Plus, Search, Trash2 } from "lucide-react";
import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { canCreate, canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { Customer } from "../types";

const empty = (): Omit<Customer, "id" | "createdAt"> => ({
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  gstin: "",
  stateName: "",
  stateCode: "",
  additionalDetails: [] as Array<{ key: string; value: string }>,
  emails: [] as Array<{ email: string; type: string }>,
  primaryEmail: "",
});

interface Props {
  onViewHistory?: (customerId: string) => void;
}

export function Customers({ onViewHistory }: Props) {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useStore();
  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "customers");
  const pEdit = canEdit(currentUser, "customers");
  const pDelete = canDelete(currentUser, "customers");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(empty());

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.contactPerson.toLowerCase().includes(search.toLowerCase()),
  );

  const openCreate = () => {
    setEditing(null);
    setForm(empty());
    setOpen(true);
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      contactPerson: c.contactPerson,
      phone: c.phone,
      email: c.email,
      address: c.address,
      gstin: c.gstin,
      stateName: c.stateName || "",
      stateCode: c.stateCode || "",
      additionalDetails: c.additionalDetails || [],
      emails: c.emails || [],
      primaryEmail: c.primaryEmail || c.email || "",
    });
    setOpen(true);
  };

  const handleSave = () => {
    console.log("Saving customer:", form);
    if (!form.name || !form.name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    // Sync primaryEmail to legacy email field for backward compat
    const emailsArr =
      ((form as any).emails as Array<{ email: string; type: string }>) || [];
    const primaryEmail = ((form as any).primaryEmail as string) || "";
    const legacyEmail = primaryEmail || emailsArr[0]?.email || form.email;
    const saveData = {
      ...form,
      email: legacyEmail,
      emails: emailsArr,
      primaryEmail: primaryEmail || legacyEmail,
    };
    if (editing) {
      if (!pEdit) {
        toast.error("Access restricted: edit permission required");
        return;
      }
      updateCustomer({ ...editing, ...saveData });
      toast.success("Customer updated");
    } else {
      if (!pCreate) {
        toast.error("Access restricted: create permission required");
        return;
      }
      addCustomer({
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        ...saveData,
      });
      toast.success("Customer created");
    }
    setOpen(false);
  };

  const f =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  if (!canView(currentUser, "customers")) {
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

  return (
    <div className="space-y-4" data-ocid="customers.page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} registered customers
          </p>
        </div>
        {pCreate && (
          <Button
            size="sm"
            onClick={openCreate}
            data-ocid="customers.create.primary_button"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Customer
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          data-ocid="customers.search_input"
          className="pl-8 h-8 text-sm"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-wrapper">
        <div className="rounded-md border" data-ocid="customers.list.table">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">
                  Company Name
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Contact Person
                </TableHead>
                <TableHead className="text-xs font-semibold">Phone</TableHead>
                <TableHead className="text-xs font-semibold">Email</TableHead>
                <TableHead className="text-xs font-semibold">GSTIN</TableHead>
                <TableHead className="text-xs font-semibold">State</TableHead>
                <TableHead className="text-xs font-semibold w-24">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c, i) => (
                <TableRow key={c.id} data-ocid={`customers.list.row.${i + 1}`}>
                  <TableCell className="text-sm font-medium">
                    {c.name}
                  </TableCell>
                  <TableCell className="text-sm">{c.contactPerson}</TableCell>
                  <TableCell className="text-sm">{c.phone}</TableCell>
                  <TableCell className="text-sm">{c.email}</TableCell>
                  <TableCell className="text-xs font-mono">{c.gstin}</TableCell>
                  <TableCell className="text-xs">
                    {c.stateName
                      ? `${c.stateName} (${c.stateCode || "—"})`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {pEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => openEdit(c)}
                          data-ocid={`customers.edit_button.${i + 1}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {pDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => {
                            if (!canDelete(currentUser, "customers")) {
                              toast.error(
                                "Access restricted: delete permission required",
                              );
                              return;
                            }
                            if (
                              !window.confirm(
                                `Are you sure you want to delete customer "${c.name}"? This cannot be undone.`,
                              )
                            )
                              return;
                            deleteCustomer(c.id);
                            toast.success("Customer deleted");
                          }}
                          data-ocid={`customers.delete_button.${i + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                      {onViewHistory && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => onViewHistory(c.id)}
                          data-ocid={`customers.history_button.${i + 1}`}
                          title="View document history"
                        >
                          <History className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-sm text-muted-foreground"
                    data-ocid="customers.list.empty_state"
                  >
                    No customers found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-ocid="customers.dialog">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Customer" : "New Customer"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {(
                [
                  ["Company Name", "name"],
                  ["Contact Person", "contactPerson"],
                  ["Phone", "phone"],
                  ["Email", "email"],
                  ["GSTIN", "gstin"],
                  ["State Name", "stateName"],
                  ["State Code", "stateCode"],
                  ["Address", "address"],
                ] as [string, keyof typeof form][]
              ).map(([label, key]) => (
                <div
                  key={key}
                  className={key === "address" ? "col-span-2" : ""}
                >
                  <Label className="text-xs">{label}</Label>
                  <Input
                    data-ocid={`customers.form.${key}.input`}
                    className="mt-1 h-8 text-sm"
                    value={form[key] as string}
                    onChange={f(key)}
                  />
                </div>
              ))}
            </div>
            {/* Multi-Email System */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Email Addresses
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setForm((p: any) => ({
                      ...p,
                      emails: [
                        ...(p.emails || []),
                        { email: "", type: "Accounts" },
                      ],
                    }))
                  }
                  data-ocid="customers.form.add_email.button"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Email
                </Button>
              </div>
              {(
                ((form as any).emails as Array<{
                  email: string;
                  type: string;
                }>) || []
              ).map((entry, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable editable list
                  key={`email-${i}`}
                  className="flex gap-2 mb-1.5 items-center"
                >
                  <input
                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="email@company.com"
                    value={entry.email}
                    onChange={(e) =>
                      setForm((p: any) => {
                        const arr = [...(p.emails || [])];
                        arr[i] = { ...arr[i], email: e.target.value };
                        return { ...p, emails: arr };
                      })
                    }
                    data-ocid={`customers.form.email_address.${i + 1}`}
                  />
                  <select
                    className="flex h-7 rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={entry.type}
                    onChange={(e) =>
                      setForm((p: any) => {
                        const arr = [...(p.emails || [])];
                        arr[i] = { ...arr[i], type: e.target.value };
                        return { ...p, emails: arr };
                      })
                    }
                    data-ocid={`customers.form.email_type.${i + 1}`}
                  >
                    <option value="Purchase">Purchase</option>
                    <option value="Accounts">Accounts</option>
                    <option value="Sales">Sales</option>
                    <option value="Other">Other</option>
                  </select>
                  <Button
                    type="button"
                    variant={
                      entry.email === (form as any).primaryEmail
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    className="h-7 px-2 shrink-0 text-xs"
                    onClick={() =>
                      setForm((p: any) => ({
                        ...p,
                        primaryEmail: entry.email,
                        email: entry.email,
                      }))
                    }
                    data-ocid={`customers.form.set_primary.${i + 1}`}
                    title="Set as primary email"
                  >
                    {entry.email === (form as any).primaryEmail
                      ? "✓ Primary"
                      : "Set Primary"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 shrink-0"
                    onClick={() =>
                      setForm((p: any) => ({
                        ...p,
                        emails: (p.emails || []).filter(
                          (_: any, j: number) => j !== i,
                        ),
                      }))
                    }
                    data-ocid={`customers.form.remove_email.${i + 1}`}
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Additional Details */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Additional Details
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      additionalDetails: [
                        ...(p.additionalDetails || []),
                        { key: "", value: "" },
                      ],
                    }))
                  }
                  data-ocid="customers.form.add_detail.button"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Detail
                </Button>
              </div>
              {(form.additionalDetails || []).map((detail, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable editable list
                  key={`detail-${i}`}
                  className="flex gap-2 mb-1.5 items-center"
                >
                  <input
                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Field name (e.g. PAN Number)"
                    value={detail.key}
                    onChange={(e) =>
                      setForm((p) => {
                        const arr = [...(p.additionalDetails || [])];
                        arr[i] = { ...arr[i], key: e.target.value };
                        return { ...p, additionalDetails: arr };
                      })
                    }
                    data-ocid={`customers.form.detail_key.${i + 1}`}
                  />
                  <input
                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Value"
                    value={detail.value}
                    onChange={(e) =>
                      setForm((p) => {
                        const arr = [...(p.additionalDetails || [])];
                        arr[i] = { ...arr[i], value: e.target.value };
                        return { ...p, additionalDetails: arr };
                      })
                    }
                    data-ocid={`customers.form.detail_value.${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 shrink-0"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        additionalDetails: (p.additionalDetails || []).filter(
                          (_, j) => j !== i,
                        ),
                      }))
                    }
                    data-ocid={`customers.form.detail_remove.${i + 1}`}
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-4 min-h-[52px] items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                data-ocid="customers.form.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                data-ocid="customers.form.submit_button"
              >
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
