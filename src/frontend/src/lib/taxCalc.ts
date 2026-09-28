// Shared GST/IGST calculation — extracted from Quotations.tsx (§29-31)
// so Company PO (Task 2, IGST support) reuses the exact same tax logic
// instead of a second competing implementation. GST/IGST are opt-in and
// mutually exclusive; neither applies unless its flag is true. Rates are
// fixed standard rates (18% GST split evenly as 9% CGST + 9% SGST for
// intra-state, 18% IGST for inter-state), never user-edited.
export const GST_HALF_RATE = 9;
export const IGST_RATE = 18;

export function computeGstIgstTax(
  applyGST: boolean,
  applyIGST: boolean,
  subtotal: number,
) {
  const cgstRate = applyGST ? GST_HALF_RATE : 0;
  const sgstRate = applyGST ? GST_HALF_RATE : 0;
  const igstRate = applyIGST ? IGST_RATE : 0;
  const cgstAmt = Math.round((subtotal * cgstRate) / 100);
  const sgstAmt = Math.round((subtotal * sgstRate) / 100);
  const igstAmt = Math.round((subtotal * igstRate) / 100);
  return {
    cgstRate,
    sgstRate,
    igstRate,
    cgstAmt,
    sgstAmt,
    igstAmt,
    total: subtotal + cgstAmt + sgstAmt + igstAmt,
  };
}
