import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const colorMap: Record<string, string> = {
  // Enquiry
  New: "bg-blue-100 text-blue-700 border-blue-200",
  InProgress: "bg-amber-100 text-amber-700 border-amber-200",
  Quoted: "bg-purple-100 text-purple-700 border-purple-200",
  Closed: "bg-gray-100 text-gray-600 border-gray-200",
  // Quotation
  Draft: "bg-gray-100 text-gray-600 border-gray-200",
  Sent: "bg-blue-100 text-blue-700 border-blue-200",
  Accepted: "bg-green-100 text-green-700 border-green-200",
  Rejected: "bg-red-100 text-red-700 border-red-200",
  // PO
  Received: "bg-blue-100 text-blue-700 border-blue-200",
  Confirmed: "bg-green-100 text-green-700 border-green-200",
  Cancelled: "bg-red-100 text-red-700 border-red-200",
  // SO
  Open: "bg-blue-100 text-blue-700 border-blue-200",
  InProduction: "bg-amber-100 text-amber-700 border-amber-200",
  ReadyToDispatch: "bg-purple-100 text-purple-700 border-purple-200",
  Dispatched: "bg-indigo-100 text-indigo-700 border-indigo-200",
  // Stage
  Pending: "bg-gray-100 text-gray-500 border-gray-200",
  Complete: "bg-green-100 text-green-700 border-green-200",
  // QC
  Pass: "bg-green-100 text-green-700 border-green-200",
  Fail: "bg-red-100 text-red-700 border-red-200",
  Rework: "bg-orange-100 text-orange-700 border-orange-200",
  // MR
  Approved: "bg-green-100 text-green-700 border-green-200",
  Ordered: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Fulfilled: "bg-green-100 text-green-700 border-green-200",
  Raised: "bg-blue-100 text-blue-700 border-blue-200",
  // DC
  Prepared: "bg-amber-100 text-amber-700 border-amber-200",
  Delivered: "bg-green-100 text-green-700 border-green-200",
  // Invoice
  Unpaid: "bg-red-100 text-red-700 border-red-200",
  PartiallyPaid: "bg-amber-100 text-amber-700 border-amber-200",
  Paid: "bg-green-100 text-green-700 border-green-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium px-2 py-0.5",
        colorMap[status] ?? "bg-gray-100 text-gray-600",
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
