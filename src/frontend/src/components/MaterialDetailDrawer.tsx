import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowUpDown,
  FileText,
  Package,
  Paperclip,
  ShoppingCart,
  TrendingDown,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { InventoryItem } from "../types";

interface MaterialDetailDrawerProps {
  item: InventoryItem | null;
  onClose: () => void;
}

export function MaterialDetailDrawer({
  item,
  onClose,
}: MaterialDetailDrawerProps) {
  const { inventoryPurchases, materialUsages, projects } = useStore();
  const [usageSortBy, setUsageSortBy] = useState<"date" | "project">("date");
  const [expandedPurchaseIds, setExpandedPurchaseIds] = useState<Set<string>>(
    new Set(),
  );

  const toggleExpand = (id: string) => {
    setExpandedPurchaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const data = useMemo(() => {
    if (!item)
      return { purchases: [], usages: [], totalPurchased: 0, totalUsed: 0 };

    const nameLower = item.name.toLowerCase();

    const purchases = inventoryPurchases
      .filter((p) => p.materialName.toLowerCase() === nameLower)
      .sort(
        (a, b) =>
          new Date(b.purchaseDate).getTime() -
          new Date(a.purchaseDate).getTime(),
      );

    const totalPurchased = purchases.reduce(
      (sum, p) => sum + p.quantityPurchased,
      0,
    );

    const rawUsages = materialUsages.filter(
      (u) => u.materialName.toLowerCase() === nameLower,
    );

    const totalUsed = rawUsages.reduce((sum, u) => sum + u.quantityUsed, 0);

    const usagesWithProject = rawUsages.map((u) => {
      const proj = projects.find((p) => p.id === u.projectId);
      return {
        ...u,
        projectName: proj
          ? `${proj.projectNo} – ${proj.projectName}`
          : u.projectId || "Unknown Project",
      };
    });

    const usages = [...usagesWithProject].sort((a, b) => {
      if (usageSortBy === "date") {
        return new Date(b.usedDate).getTime() - new Date(a.usedDate).getTime();
      }
      return a.projectName.localeCompare(b.projectName);
    });

    return { purchases, usages, totalPurchased, totalUsed };
  }, [item, inventoryPurchases, materialUsages, projects, usageSortBy]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
            data-ocid="inventory.drawer.backdrop"
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 h-full w-[480px] max-w-[95vw] bg-background border-l border-border shadow-2xl z-50 flex flex-col"
            data-ocid="inventory.detail.panel"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Package className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-base leading-tight">
                    {item.name}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Unit: {item.unit}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={onClose}
                data-ocid="inventory.detail.close_button"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 overflow-auto">
              <div className="px-5 py-4 space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Total Purchased
                    </p>
                    <p className="text-xl font-bold tabular-nums">
                      {data.totalPurchased}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.unit}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Total Used
                    </p>
                    <p className="text-xl font-bold tabular-nums text-orange-600 dark:text-orange-400">
                      {data.totalUsed}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.unit}
                    </p>
                  </div>
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Remaining
                    </p>
                    <p
                      className={`text-xl font-bold tabular-nums ${
                        item.quantityAvailable === 0
                          ? "text-destructive"
                          : item.quantityAvailable < 10
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-primary"
                      }`}
                    >
                      {item.quantityAvailable}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.unit}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Purchase History */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Purchase History</h3>
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {data.purchases.length} record
                      {data.purchases.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>

                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs font-semibold py-2">
                            Date
                          </TableHead>
                          <TableHead className="text-xs font-semibold py-2">
                            Supplier
                          </TableHead>
                          <TableHead className="text-xs font-semibold py-2">
                            Qty
                          </TableHead>
                          <TableHead className="text-xs font-semibold py-2">
                            Invoice No
                          </TableHead>
                          <TableHead className="text-xs font-semibold py-2">
                            Cost (₹)
                          </TableHead>
                          <TableHead className="text-xs font-semibold py-2 w-10">
                            Files
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.purchases.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center py-6 text-xs text-muted-foreground"
                              data-ocid="inventory.detail.purchases.empty_state"
                            >
                              No purchases recorded
                            </TableCell>
                          </TableRow>
                        ) : (
                          data.purchases.map((p, i) => {
                            const attachments = p.attachments ?? [];
                            const isExpanded = expandedPurchaseIds.has(p.id);
                            return (
                              <>
                                <TableRow
                                  key={p.id}
                                  data-ocid={`inventory.detail.purchase.item.${i + 1}`}
                                >
                                  <TableCell className="text-xs py-2">
                                    {formatDate(p.purchaseDate)}
                                  </TableCell>
                                  <TableCell className="text-xs py-2">
                                    {p.supplierName || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs py-2 font-medium">
                                    {p.quantityPurchased} {item.unit}
                                  </TableCell>
                                  <TableCell className="text-xs py-2 font-mono">
                                    {"—"}
                                  </TableCell>
                                  <TableCell className="text-xs py-2">
                                    {p.cost > 0
                                      ? `₹${p.cost.toLocaleString("en-IN")}`
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    {attachments.length > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => toggleExpand(p.id)}
                                        className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        data-ocid={`inventory.detail.purchase.attachments.${i + 1}`}
                                      >
                                        <Paperclip className="w-3 h-3" />
                                        <span>{attachments.length}</span>
                                      </button>
                                    ) : (
                                      <span className="text-xs text-muted-foreground/40">
                                        —
                                      </span>
                                    )}
                                  </TableCell>
                                </TableRow>
                                {isExpanded && attachments.length > 0 && (
                                  <TableRow
                                    key={`${p.id}-att`}
                                    className="bg-muted/20"
                                  >
                                    <TableCell
                                      colSpan={6}
                                      className="py-2 px-3"
                                    >
                                      <div className="flex flex-wrap gap-2">
                                        {attachments.map((att) =>
                                          att.type === "image" ? (
                                            <img
                                              key={att.ref}
                                              src={att.ref}
                                              alt={att.name}
                                              className="max-h-20 rounded border cursor-pointer object-cover"
                                              onClick={() =>
                                                window.open(att.ref)
                                              }
                                              onKeyDown={(e) =>
                                                e.key === "Enter" &&
                                                window.open(att.ref)
                                              }
                                              title={att.name}
                                            />
                                          ) : (
                                            <a
                                              key={att.ref}
                                              href={att.ref}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-xs text-blue-600 underline flex items-center gap-1"
                                            >
                                              <FileText className="w-3 h-3" />
                                              {att.name}
                                            </a>
                                          ),
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <Separator />

                {/* Usage History */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Usage History</h3>
                    <Badge variant="secondary" className="text-xs">
                      {data.usages.length} record
                      {data.usages.length !== 1 ? "s" : ""}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 text-xs gap-1 px-2"
                      onClick={() =>
                        setUsageSortBy((prev) =>
                          prev === "date" ? "project" : "date",
                        )
                      }
                      data-ocid="inventory.detail.usage.toggle"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                      {usageSortBy === "date" ? "By Date" : "By Project"}
                    </Button>
                  </div>

                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs font-semibold py-2">
                            Project
                          </TableHead>
                          <TableHead className="text-xs font-semibold py-2">
                            Qty Used
                          </TableHead>
                          <TableHead className="text-xs font-semibold py-2">
                            Date
                          </TableHead>
                          <TableHead className="text-xs font-semibold py-2">
                            Notes
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.usages.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-center py-6 text-xs text-muted-foreground"
                              data-ocid="inventory.detail.usage.empty_state"
                            >
                              No usage recorded across projects
                            </TableCell>
                          </TableRow>
                        ) : (
                          data.usages.map((u, i) => (
                            <TableRow
                              key={u.id}
                              data-ocid={`inventory.detail.usage.item.${i + 1}`}
                            >
                              <TableCell className="text-xs py-2 max-w-[140px] truncate">
                                {u.projectName}
                              </TableCell>
                              <TableCell className="text-xs py-2 font-medium">
                                {u.quantityUsed} {item.unit}
                              </TableCell>
                              <TableCell className="text-xs py-2">
                                {formatDate(u.usedDate)}
                              </TableCell>
                              <TableCell className="text-xs py-2 text-muted-foreground">
                                {u.notes || "—"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* bottom padding */}
                <div className="h-4" />
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
