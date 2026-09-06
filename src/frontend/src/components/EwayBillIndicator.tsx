import { Badge } from "@/components/ui/badge";
import { openAttachmentPreview } from "@/lib/utils";
import type { Invoice, PurchaseAttachment } from "@/types";
import { AlertTriangle, CheckCircle2, Loader2, Paperclip } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { updateInvoiceEwayBillRemote } from "../lib/invoicesApi";
import { canEdit } from "../permissions";
import { useStore } from "../store";

const EWAY_BILL_THRESHOLD = 50000;

interface Props {
  /** undefined in the New-Invoice create form (no row exists yet to
   * attach a document to) - the indicator still shows "required" but
   * without an attach control until the invoice is actually saved. */
  invoiceId: string | undefined;
  /** The live total driving the >₹50,000 threshold check - the form's
   * in-progress computed total while editing, or the persisted
   * invoice.totalAmount everywhere else. Independent of whether a
   * document is attached (attachment status always comes from the
   * persisted record, never from this number). */
  totalAmount: number;
  ewayBillDocument?: PurchaseAttachment;
  /** Lets a caller holding its own copy of the invoice (e.g. the Edit
   * form's local state) stay in sync after a successful attach, so it
   * doesn't keep showing "required" from stale local state. */
  onAttached?: (invoice: Invoice) => void;
  className?: string;
}

/** Compact E-Way Bill status - replaces the old full-width alert banner
 * (§7). Below ₹50,000: renders nothing. Above, with no attachment: a
 * small "Required" pill plus an attach control. Above, attached: a small
 * "Attached" pill, clickable to open the document via the same
 * openAttachmentPreview used by CompanyPOs' own file attachment - no
 * outstanding action shown once a real document is on file (§8).
 * Completion is never inferred from clicking "Attach" - only from the
 * persisted invoice row this component re-fetches after a successful
 * write (see updateInvoiceEwayBillRemote). */
export function EwayBillIndicator({
  invoiceId,
  totalAmount,
  ewayBillDocument,
  onAttached,
  className,
}: Props) {
  const updateInvoice = useStore((s) => s.updateInvoice);
  const [isUploading, setIsUploading] = useState(false);
  const { currentUser } = useAuth();
  // Gate the Attach control on real edit permission - RLS already rejects
  // the write server-side either way (verified: a view-only user's PATCH
  // affects 0 rows), but the control shouldn't be offered to a user who
  // can't use it, matching every other edit-gated control in this app.
  const pEdit = canEdit(currentUser, "invoices");

  if (totalAmount <= EWAY_BILL_THRESHOLD) return null;

  if (ewayBillDocument) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!openAttachmentPreview(ewayBillDocument.ref)) {
            toast.error("File not available");
          }
        }}
        className={className}
        data-ocid="invoices.eway_bill.attached_badge"
      >
        <Badge
          variant="outline"
          className="gap-1 bg-success/10 text-success border-success/30 cursor-pointer hover:bg-success/20"
        >
          <CheckCircle2 className="w-3 h-3" /> E-Way Bill Attached
        </Badge>
      </button>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !invoiceId || !pEdit || isUploading) return;
    setIsUploading(true);
    try {
      const ref = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const doc: PurchaseAttachment = {
        ref,
        type: file.type === "application/pdf" ? "pdf" : "image",
        name: file.name,
      };
      const result = await updateInvoiceEwayBillRemote(invoiceId, doc);
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - E-Way Bill was not saved.");
        return;
      }
      if (
        result.status === "error" ||
        result.status === "denied" ||
        !result.data
      ) {
        toast.error(
          `Could not attach E-Way Bill: ${result.error ?? "unknown error"}`,
        );
        return;
      }
      updateInvoice(result.data);
      onAttached?.(result.data);
      toast.success("E-Way Bill attached");
    } catch {
      toast.error("Could not read that file");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Badge
        variant="outline"
        className="gap-1 bg-warning/15 text-warning border-warning/30"
      >
        <AlertTriangle className="w-3 h-3" /> E-Way Bill Required
      </Badge>
      {invoiceId && pEdit && (
        <label
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
          data-ocid="invoices.eway_bill.attach_label"
        >
          {isUploading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Paperclip className="w-3 h-3" />
          )}
          Attach
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            disabled={isUploading}
            onChange={handleFileChange}
            data-ocid="invoices.eway_bill.attach_input"
          />
        </label>
      )}
    </div>
  );
}
