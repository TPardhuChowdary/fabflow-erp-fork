import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  type InspectionPdfInput,
  generateInspectionPdf,
} from "../../lib/generateInspectionPdf";
import { revisionToLetter } from "../../types";

type Props = InspectionPdfInput;

/** §11 — real binary PDF via jsPDF (not window.print()), suitable to send to
 * a customer or keep as an ISO audit record. Download pattern matches the
 * rest of the app (see Quotations.tsx / PurchaseOrders.tsx downloadFile). */
export function InspectionSheetPdfButton(props: Props) {
  const [generating, setGenerating] = useState(false);

  const handleClick = async () => {
    setGenerating(true);
    try {
      const blob = await generateInspectionPdf(props);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${props.sheet.inspectionNumber}-Rev${revisionToLetter(props.sheet.revision)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_err) {
      toast.error("Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 text-xs gap-1.5"
      disabled={generating}
      onClick={handleClick}
      data-ocid="qms.inspection.pdf_button"
    >
      {generating ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <FileDown className="w-3.5 h-3.5" />
      )}
      PDF
    </Button>
  );
}
