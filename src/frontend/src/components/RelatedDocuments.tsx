// Phase 4 — Related Documents (read-only traceability).
// Compact, read-only list of documents connected via the Phase 1
// lineage tables (delivery_challan_quotations / quotation_invoices /
// invoice_delivery_challans) — fetched fresh via documentConversionApi
// every time it mounts, never cached, never inferred from doc
// numbers/customer/dates/quantities. No conversion controls here — see
// ConversionDialogs.tsx for that. Styling matches Quotations.tsx's
// existing "Revisions & Purchase Orders" detail-dialog section (same
// uppercase label + bordered row pattern) rather than inventing a new
// visual language.

import { FileText, Loader2, Receipt, Truck } from "lucide-react";
import { Fragment } from "react";
import type { RelatedDocument } from "../lib/documentConversionApi";

const TYPE_ICON: Record<RelatedDocument["type"], typeof FileText> = {
  quotation: FileText,
  delivery_challan: Truck,
  invoice: Receipt,
};

export interface RelatedDocumentGroup {
  label: string;
  docs: RelatedDocument[];
}

interface RelatedDocumentsProps {
  loading: boolean;
  groups: RelatedDocumentGroup[];
  /** Opens the related document via the existing cross-module
   * navigation mechanism. Omitted where a caller has nowhere to
   * navigate to — rows render as plain (non-clickable) info then. */
  onOpen?: (doc: RelatedDocument) => void;
  className?: string;
}

export function RelatedDocuments({
  loading,
  groups,
  onOpen,
  className,
}: RelatedDocumentsProps) {
  const nonEmptyGroups = groups.filter((g) => g.docs.length > 0);

  return (
    <div className={className} data-ocid="related-documents.section">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Related Documents
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </div>
      ) : nonEmptyGroups.length === 0 ? (
        <p
          className="text-xs text-muted-foreground italic"
          data-ocid="related-documents.empty_state"
        >
          No related documents
        </p>
      ) : (
        <div className="space-y-3">
          {nonEmptyGroups.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">
                {g.label}
              </p>
              <div className="space-y-1">
                {g.docs.map((doc) => {
                  const Icon = TYPE_ICON[doc.type];
                  const content = (
                    <Fragment key={doc.id}>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Icon className="w-3 h-3 shrink-0 text-muted-foreground" />
                        <span className="font-mono font-semibold truncate">
                          {doc.docNo}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0 text-muted-foreground">
                        {doc.relationshipQty !== undefined && (
                          <span data-ocid="related-documents.item.quantity">
                            Qty: {doc.relationshipQty}
                          </span>
                        )}
                        {doc.date && <span>{doc.date}</span>}
                        {doc.status && (
                          <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
                            {doc.status}
                          </span>
                        )}
                      </span>
                    </Fragment>
                  );
                  const rowClass =
                    "w-full flex items-center justify-between gap-2 text-xs bg-background border rounded px-2 py-1.5";
                  return onOpen ? (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => onOpen(doc)}
                      className={`${rowClass} text-left hover:bg-muted/40 cursor-pointer`}
                      data-ocid={`related-documents.item.${doc.type}`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div
                      key={doc.id}
                      className={rowClass}
                      data-ocid={`related-documents.item.${doc.type}`}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
