// Internal Costing — repeatable line-item table (Master ERP Architecture,
// Phase 1). One shared component for Raw Materials / Hardware /
// Manufacturing / Finishing rather than four near-duplicate blocks —
// each category only differs in its label fields (material+size,
// item+specification, process, process); quantity/rate/amount and the
// edit/delete/total behavior are identical across all four, so that
// behavior lives here once.
//
// This component renders rows only — no title, no "Add" button. The
// small "+" beside each cost field's own label (in ProjectDetail.tsx)
// is what appends a row, via createBlankLineItemRow below, so the
// category name is never repeated as a second heading and there is
// never a separate "Add Raw Material"-style button.
//
// Amount is always computed as quantity * rate and is never itself an
// editable cell (matches the audit's explicit "Amount: automatically
// calculated" requirement) — editing quantity or rate recomputes it
// immediately, in the UI only; ProjectDetail.tsx's own handleSaveCosting
// is what persists it to Supabase.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2 } from "lucide-react";

export interface CostingLineItemRow {
  id: string;
  quantity: number;
  rate: number;
  amount: number;
  [labelField: string]: string | number | undefined;
}

export interface CostingLineItemField {
  /** Property name on the row, e.g. "material", "specification". */
  key: string;
  label: string;
  placeholder?: string;
}

/** A row is worth keeping the moment ANY user-editable cell has a value —
 * no single field (not even the label field, e.g. Material) is mandatory.
 * A row where the user has typed nothing at all (every label field blank,
 * quantity/rate both at their untouched-default 0) is a draft and must be
 * dropped before persisting. Exported so ProjectDetail.tsx's
 * handleSaveCosting can filter each of the four line-item arrays with the
 * exact same rule this table itself uses. */
export function isLineItemRowMeaningful(
  row: CostingLineItemRow,
  fields: CostingLineItemField[],
): boolean {
  const hasLabelValue = fields.some(
    (f) => String(row[f.key] ?? "").trim() !== "",
  );
  return hasLabelValue || Number(row.quantity) > 0 || Number(row.rate) > 0;
}

/** A fresh, blank row for the given field set — quantity/rate start at 0
 * (not 1), since a nonzero default would make a completely untouched row
 * look "meaningful" to isLineItemRowMeaningful above and wrongly survive
 * the empty-row save filter. The small "+" beside a cost field's label in
 * ProjectDetail.tsx calls this directly to append a row; this component
 * no longer has its own internal "Add" trigger. */
export function createBlankLineItemRow(
  fields: CostingLineItemField[],
): CostingLineItemRow {
  const blank: CostingLineItemRow = {
    id: crypto.randomUUID(),
    quantity: 0,
    rate: 0,
    amount: 0,
  };
  for (const f of fields) blank[f.key] = "";
  return blank;
}

interface CostingLineItemsTableProps {
  fields: CostingLineItemField[];
  rows: CostingLineItemRow[];
  onChange: (rows: CostingLineItemRow[]) => void;
  disabled?: boolean;
  dataOcidPrefix: string;
}

export function CostingLineItemsTable({
  fields,
  rows,
  onChange,
  disabled,
  dataOcidPrefix,
}: CostingLineItemsTableProps) {
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // No line items yet for this category — the "+" beside the field label
  // is the only affordance; nothing to render underneath it (Collapse /
  // Visibility requirement: never show an empty table by default).
  if (rows.length === 0) return null;

  const updateRow = (id: string, patch: Partial<CostingLineItemRow>) => {
    onChange(
      rows.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        next.amount = (Number(next.quantity) || 0) * (Number(next.rate) || 0);
        return next;
      }),
    );
  };

  const deleteRow = (id: string) => {
    onChange(rows.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-1.5" data-ocid={`${dataOcidPrefix}.section`}>
      <div className="flex items-center justify-end">
        <span className="text-xs text-muted-foreground">
          Total: ₹{total.toLocaleString("en-IN")}
        </span>
      </div>
      <div className="table-wrapper">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {fields.map((f) => (
                  <TableHead key={f.key} className="text-xs font-semibold">
                    {f.label}
                  </TableHead>
                ))}
                <TableHead className="text-xs font-semibold w-20">
                  Qty
                </TableHead>
                <TableHead className="text-xs font-semibold w-24">
                  Rate
                </TableHead>
                <TableHead className="text-xs font-semibold w-24">
                  Amount
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow
                  key={row.id}
                  data-ocid={`${dataOcidPrefix}.row.${i + 1}`}
                >
                  {fields.map((f) => (
                    <TableCell key={f.key} className="py-1.5">
                      <Input
                        className="h-7 text-xs"
                        value={String(row[f.key] ?? "")}
                        placeholder={f.placeholder}
                        disabled={disabled}
                        onChange={(e) =>
                          updateRow(row.id, { [f.key]: e.target.value })
                        }
                        data-ocid={`${dataOcidPrefix}.row.${i + 1}.${f.key}`}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="py-1.5">
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={row.quantity}
                      disabled={disabled}
                      onChange={(e) =>
                        updateRow(row.id, {
                          quantity: Number(e.target.value) || 0,
                        })
                      }
                      data-ocid={`${dataOcidPrefix}.row.${i + 1}.quantity`}
                    />
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={row.rate}
                      disabled={disabled}
                      onChange={(e) =>
                        updateRow(row.id, {
                          rate: Number(e.target.value) || 0,
                        })
                      }
                      data-ocid={`${dataOcidPrefix}.row.${i + 1}.rate`}
                    />
                  </TableCell>
                  <TableCell className="py-1.5 text-xs font-medium">
                    ₹{(Number(row.amount) || 0).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="py-1.5">
                    {!disabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => deleteRow(row.id)}
                        data-ocid={`${dataOcidPrefix}.row.${i + 1}.delete`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
