// Framework-free test (run via `npx tsx`) — same convention as
// qms/lib/quantityInspection.test.ts. Guards against prompt/tool drift:
// the PRODUCTION PLANNING and CROSS-MODULE REASONING sections of
// AGENT_SYSTEM_PROMPT (Master ERP Architecture, Parts 5-6) name specific
// tools by their exact registry key — if one of those tools is ever
// renamed or removed from QUERIES/AGENT_ACTIONS, the prompt would
// silently start referencing a tool the LLM can't actually call. This
// doesn't parse the prompt text; it just pins the exact names this
// session's prompt additions used, so a rename anywhere breaks this
// test instead of breaking silently in production.
import assert from "node:assert/strict";
import { AGENT_ACTIONS } from "../actions";
import { QUERIES } from "../queries";
import { AGENT_SYSTEM_PROMPT } from "./orchestrator";

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

// Every tool name the PRODUCTION PLANNING / CROSS-MODULE REASONING
// sections tell the LLM to call by name.
const REFERENCED_TOOLS = [
  "getProjectStatus",
  "listJobCardsByStatus",
  "findPendingQmsInspections",
  "getProjectMaterials",
  "searchInventoryItems",
  "getEmployeeWorkload",
  "getEmployeeOverload",
  "getProjectProfitability",
  "getCustomerOverview",
  "findCustomersWithOverdueBalanceAndActiveQuotation",
  "findAttentionItems",
  "getCustomerLedger",
];

const ALL_TOOL_NAMES = new Set([
  ...Object.keys(QUERIES),
  ...Object.keys(AGENT_ACTIONS),
]);

for (const name of REFERENCED_TOOLS) {
  test(`prompt-referenced tool "${name}" exists in the tool registry`, () => {
    assert.ok(
      ALL_TOOL_NAMES.has(name),
      `"${name}" is named in AGENT_SYSTEM_PROMPT but is not a registered query or action`,
    );
  });
}

test("AGENT_SYSTEM_PROMPT actually contains the new planning/reasoning sections", () => {
  assert.ok(AGENT_SYSTEM_PROMPT.includes("PRODUCTION PLANNING"));
  assert.ok(AGENT_SYSTEM_PROMPT.includes("CROSS-MODULE REASONING"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
