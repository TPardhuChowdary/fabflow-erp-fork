import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Eye, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { MasterPO, ProjectPOStatus } from "../types";

type MasterPOStatus = MasterPO["status"];

export function PurchaseOrders() {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "purchase_orders");
  const pEdit = canEdit(currentUser, "purchase_orders");
  const pDelete = canDelete(currentUser, "purchase_orders");
  const {
    masterPOs,
    updateMasterPO,
    deleteMasterPO,
    customers,
    quotations,
    projects,
  } = useStore();

  const sorted = [...(masterPOs || [])].sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  // Derive linked projects for a masterPO via sharedPoId
  const getLinkedProjects = (sharedPoId: string) =>
    (projects || []).filter((proj) =>
      (proj.pos || []).some((po) => po.sharedPoId === sharedPoId),
    );

  const updateStatus = (id: string, status: MasterPOStatus) => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    const po = (masterPOs || []).find((x) => x.id === id);
    if (po) {
      updateMasterPO({ ...po, status });
      toast.success("Status updated");
    }
  };

  const openFile = (file: { ref?: string; type?: string; name?: string }) => {
    if (!file?.ref) {
      alert("File not available");
      return;
    }
    const byteString = atob(file.ref.split(",")[1]);
    const mimeType = file.type === "pdf" ? "application/pdf" : "image/jpeg";
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++)
      ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeType });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const downloadFile = (ref: string, name: string) => {
    const a = document.createElement("a");
    a.href = ref;
    a.download = name;
    a.click();
  };

  const statusColor = (status: MasterPOStatus) => {
    if (status === "Completed") return "default";
    if (status === "In Progress") return "secondary";
    return "outline";
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

  return (
    <div className="space-y-4" data-ocid="purchase_orders.page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">
            {sorted.length} customer POs &mdash; recorded from quotations
          </p>
        </div>
      </div>

      <div className="table-wrapper">
        <div
          className="rounded-md border"
          data-ocid="purchase_orders.list.table"
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">
                  PO Number
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Customer
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Quotation Ref
                </TableHead>
                <TableHead className="text-xs font-semibold">PO Date</TableHead>
                <TableHead className="text-xs font-semibold">
                  Linked Projects
                </TableHead>
                <TableHead className="text-xs font-semibold">Files</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold w-32">
                  Update
                </TableHead>
                <TableHead className="text-xs font-semibold w-16">
                  Delete
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((po, i) => {
                const cust = (customers || []).find(
                  (c) => c.id === po.customerId,
                );
                const qt = (quotations || []).find(
                  (q) => q.id === po.quotationId,
                );
                const linked = getLinkedProjects(po.sharedPoId);
                return (
                  <TableRow
                    key={po.id}
                    data-ocid={`purchase_orders.list.row.${i + 1}`}
                  >
                    <TableCell className="text-xs font-mono font-semibold">
                      {po.poNumber}
                    </TableCell>
                    <TableCell className="text-sm">
                      {cust?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {qt?.qtNo ? (
                        <span className="font-semibold text-blue-700">
                          {qt.qtNo}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {po.poDate || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {linked.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        ) : (
                          linked.map((proj) => (
                            <Badge
                              key={proj.id}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {proj.projectName}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {(po.files || []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        ) : (
                          (po.files || []).map((f, fi) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: file list
                            <div key={fi} className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                                {f.name}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() => openFile(f)}
                                title="View"
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() => downloadFile(f.ref, f.name)}
                                title="Download"
                              >
                                <Download className="w-3 h-3" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusColor(po.status)}
                        className="text-xs"
                      >
                        {po.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {pEdit ? (
                        <Select
                          value={po.status}
                          onValueChange={(v) =>
                            updateStatus(po.id, v as MasterPOStatus)
                          }
                          disabled={!pEdit}
                        >
                          <SelectTrigger
                            className="h-6 text-xs w-28"
                            disabled={!pEdit}
                            data-ocid={`purchase_orders.status.select.${i + 1}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              [
                                "Open",
                                "In Progress",
                                "Completed",
                              ] as ProjectPOStatus[]
                            ).map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {pDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Are you sure you want to delete PO "${po.poNumber}"? This cannot be undone.`,
                              )
                            )
                              return;
                            deleteMasterPO(po.id);
                            toast.success("Purchase order deleted");
                          }}
                          data-ocid={`purchase_orders.delete_button.${i + 1}`}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-10 text-sm text-muted-foreground"
                    data-ocid="purchase_orders.list.empty_state"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">No Purchase Orders yet</p>
                      <p className="text-xs">
                        Record a PO from an Accepted quotation in the Quotations
                        module.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
