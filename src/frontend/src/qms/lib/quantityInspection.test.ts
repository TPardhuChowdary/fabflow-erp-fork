// Framework-free tests (run via `npx tsx`) — same convention as
// agent/jsonImport/*.test.ts elsewhere in this repo.
import assert from "node:assert/strict";
import {
  computeRequiredQuantityPoints,
  getQuantityInspectionSummary,
  isDuplicateCheckpoint,
} from "./quantityInspection";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${err instanceof Error ? err.message : err}`);
  }
}

// ── Exactly the audit's own worked examples ─────────────────────────
test("100 pieces / every 25 -> [25, 50, 75, 100]", () => {
  assert.deepEqual(computeRequiredQuantityPoints(100, 25), [25, 50, 75, 100]);
});

test("100 pieces / every 50 -> [50, 100]", () => {
  assert.deepEqual(computeRequiredQuantityPoints(100, 50), [50, 100]);
});

test("frequency not a clean divisor still ends with the exact final quantity", () => {
  assert.deepEqual(computeRequiredQuantityPoints(100, 30), [30, 60, 90, 100]);
});

test("no frequency configured -> no quantity checkpoints (plain pass/fail unaffected)", () => {
  assert.deepEqual(computeRequiredQuantityPoints(100, null), []);
  assert.deepEqual(computeRequiredQuantityPoints(100, undefined), []);
});

test("frequency exactly equal to expected quantity -> single final point, not duplicated", () => {
  assert.deepEqual(computeRequiredQuantityPoints(100, 100), [100]);
});

test("zero or negative frequency is rejected (treated as not configured)", () => {
  assert.deepEqual(computeRequiredQuantityPoints(100, 0), []);
  assert.deepEqual(computeRequiredQuantityPoints(100, -5), []);
});

test("zero expected quantity has nothing to inspect yet", () => {
  assert.deepEqual(computeRequiredQuantityPoints(0, 25), []);
});

// ── Summary: due / completed / overdue / final pending ──────────────
test("nothing produced yet -> next due is the first point, not yet due", () => {
  const s = getQuantityInspectionSummary({
    expectedQuantity: 100,
    frequencyQty: 25,
    actualCompletedQty: 0,
    checkpoints: [],
  });
  assert.equal(s.nextDueQuantity, 25);
  assert.equal(s.due, false);
  assert.equal(s.allCompleted, false);
  assert.equal(s.finalInspectionPending, true);
});

test("production reached the first checkpoint quantity -> due", () => {
  const s = getQuantityInspectionSummary({
    expectedQuantity: 100,
    frequencyQty: 25,
    actualCompletedQty: 25,
    checkpoints: [],
  });
  assert.equal(s.nextDueQuantity, 25);
  assert.equal(s.due, true);
});

test("first checkpoint recorded -> next due advances to the second", () => {
  const s = getQuantityInspectionSummary({
    expectedQuantity: 100,
    frequencyQty: 25,
    actualCompletedQty: 40,
    checkpoints: [{ quantity: 25, completedAt: 1, result: "Pass" }],
  });
  assert.equal(s.nextDueQuantity, 50);
  assert.equal(s.due, false); // produced 40, next due point is 50
  assert.equal(s.allCompleted, false);
});

test("every required point recorded -> allCompleted true, nothing due, final not pending", () => {
  const s = getQuantityInspectionSummary({
    expectedQuantity: 100,
    frequencyQty: 25,
    actualCompletedQty: 100,
    checkpoints: [25, 50, 75, 100].map((q) => ({
      quantity: q,
      completedAt: q,
      result: "Pass" as const,
    })),
  });
  assert.equal(s.nextDueQuantity, null);
  assert.equal(s.due, false);
  assert.equal(s.allCompleted, true);
  assert.equal(s.finalInspectionPending, false);
});

test("intermediate points done but final point not yet -> finalInspectionPending true even though not 'due' until qty reached", () => {
  const s = getQuantityInspectionSummary({
    expectedQuantity: 100,
    frequencyQty: 25,
    actualCompletedQty: 90,
    checkpoints: [25, 50, 75].map((q) => ({
      quantity: q,
      completedAt: q,
      result: "Pass" as const,
    })),
  });
  assert.equal(s.nextDueQuantity, 100);
  assert.equal(s.due, false); // only produced 90 of 100, final point not reached yet
  assert.equal(s.finalInspectionPending, true);
});

test("no frequency configured -> allCompleted true (nothing to complete), never blocks", () => {
  const s = getQuantityInspectionSummary({
    expectedQuantity: 100,
    frequencyQty: null,
    actualCompletedQty: 40,
    checkpoints: [],
  });
  assert.deepEqual(s.requiredPoints, []);
  assert.equal(s.allCompleted, true);
  assert.equal(s.due, false);
  assert.equal(s.finalInspectionPending, false);
});

// ── Duplicate prevention ─────────────────────────────────────────────
test("a quantity already recorded is detected as a duplicate", () => {
  const existing = [{ quantity: 25, completedAt: 1, result: "Pass" as const }];
  assert.equal(isDuplicateCheckpoint(existing, 25), true);
  assert.equal(isDuplicateCheckpoint(existing, 50), false);
  assert.equal(isDuplicateCheckpoint(undefined, 25), false);
});

// ── Realistic quantity/frequency matrix (completion-audit follow-up) ──
// Explicit combinations requested for this audit: quantities 1, 10, 23,
// 25, 100 x frequencies 5, 10, 25 — including the "freq >= qty" edge
// (single final point, never duplicated) and the "qty not a clean
// multiple of freq" edge (23 with 5/10) already partly covered above,
// re-verified here against the full matrix plus the final-point
// invariant every combination must satisfy.
const MATRIX: Array<{ qty: number; freq: number; expected: number[] }> = [
  { qty: 1, freq: 5, expected: [1] },
  { qty: 1, freq: 10, expected: [1] },
  { qty: 1, freq: 25, expected: [1] },
  { qty: 10, freq: 5, expected: [5, 10] },
  { qty: 10, freq: 10, expected: [10] },
  { qty: 10, freq: 25, expected: [10] },
  { qty: 23, freq: 5, expected: [5, 10, 15, 20, 23] },
  { qty: 23, freq: 10, expected: [10, 20, 23] },
  { qty: 23, freq: 25, expected: [23] },
  { qty: 25, freq: 5, expected: [5, 10, 15, 20, 25] },
  { qty: 25, freq: 10, expected: [10, 20, 25] },
  { qty: 25, freq: 25, expected: [25] },
  {
    qty: 100,
    freq: 5,
    expected: [
      5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
      100,
    ],
  },
  { qty: 100, freq: 10, expected: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] },
  { qty: 100, freq: 25, expected: [25, 50, 75, 100] },
];

for (const { qty, freq, expected } of MATRIX) {
  test(`qty=${qty} freq=${freq} -> [${expected.join(",")}]`, () => {
    const points = computeRequiredQuantityPoints(qty, freq);
    assert.deepEqual(points, expected);
    // Final-quantity invariant: the last required point is always the
    // exact expected quantity, and never appears twice even when freq
    // divides qty exactly (qty=10/freq=10, qty=25/freq=25, etc.).
    assert.equal(points[points.length - 1], qty);
    assert.equal(points.filter((p) => p === qty).length, 1);
    // freq >= qty always collapses to the single final point.
    if (freq >= qty) assert.deepEqual(points, [qty]);
  });

  test(`qty=${qty} freq=${freq}: summary due/complete transitions correctly`, () => {
    const beforeAny = getQuantityInspectionSummary({
      expectedQuantity: qty,
      frequencyQty: freq,
      actualCompletedQty: 0,
      checkpoints: [],
    });
    assert.equal(beforeAny.due, false);
    assert.equal(beforeAny.allCompleted, false);
    assert.equal(beforeAny.finalInspectionPending, true);

    const allDone = getQuantityInspectionSummary({
      expectedQuantity: qty,
      frequencyQty: freq,
      actualCompletedQty: qty,
      checkpoints: expected.map((q) => ({
        quantity: q,
        completedAt: q,
        result: "Pass" as const,
      })),
    });
    assert.equal(allDone.allCompleted, true);
    assert.equal(allDone.nextDueQuantity, null);
    assert.equal(allDone.finalInspectionPending, false);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
