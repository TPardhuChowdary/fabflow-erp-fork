import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Every raw hue collapses onto the app's 5 semantic tokens (success /
// warning / destructive / info / muted) — purple/indigo statuses (Quoted,
// ReadyToDispatch, Dispatched, Ordered) read as "communicated/in transit"
// so they share the info token with the blue statuses; each status list
// renders in its own view, so token reuse across unrelated flows never
// puts two same-colored badges side by side.
const colorMap: Record<string, string> = {
  // Enquiry
  New: "bg-info/10 text-info border-info/30",
  InProgress: "bg-warning/15 text-warning border-warning/30",
  Quoted: "bg-info/10 text-info border-info/30",
  Closed: "bg-muted text-muted-foreground border-border",
  // Quotation
  Draft: "bg-muted text-muted-foreground border-border",
  Sent: "bg-info/10 text-info border-info/30",
  Accepted: "bg-success/10 text-success border-success/30",
  Rejected: "bg-destructive/10 text-destructive border-destructive/30",
  // PO
  Received: "bg-info/10 text-info border-info/30",
  Confirmed: "bg-success/10 text-success border-success/30",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  // SO
  Open: "bg-info/10 text-info border-info/30",
  InProduction: "bg-warning/15 text-warning border-warning/30",
  ReadyToDispatch: "bg-info/10 text-info border-info/30",
  Dispatched: "bg-info/10 text-info border-info/30",
  // Stage
  Pending: "bg-muted text-muted-foreground border-border",
  Complete: "bg-success/10 text-success border-success/30",
  // QC
  Pass: "bg-success/10 text-success border-success/30",
  Fail: "bg-destructive/10 text-destructive border-destructive/30",
  Rework: "bg-warning/15 text-warning border-warning/30",
  // MR
  Approved: "bg-success/10 text-success border-success/30",
  Ordered: "bg-info/10 text-info border-info/30",
  Fulfilled: "bg-success/10 text-success border-success/30",
  Raised: "bg-info/10 text-info border-info/30",
  // DC
  Prepared: "bg-warning/15 text-warning border-warning/30",
  Delivered: "bg-success/10 text-success border-success/30",
  // Invoice
  Unpaid: "bg-destructive/10 text-destructive border-destructive/30",
  PartiallyPaid: "bg-warning/15 text-warning border-warning/30",
  Paid: "bg-success/10 text-success border-success/30",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium px-2 py-0.5",
        colorMap[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status === "InProgress"
        ? "In Progress"
        : status === "ReadyToDispatch"
          ? "Ready to Dispatch"
          : status === "PartiallyPaid"
            ? "Partially Paid"
            : status === "InProduction"
              ? "In Production"
              : status}
    </Badge>
  );
}
