// Phase 8 Email Operations — runnable check for the safety-critical
// parts of analysis.ts (ponytail: non-trivial branching logic gets one
// runnable check, not a full suite). Run with:
//   deno test supabase/functions/email-monitor/analysis.test.ts
// (Deno was not available in the environment this was written in — see
// the Phase 8 report's TESTING section for how this was instead
// exercised via a Node/tsx script against the same source file.)

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CREATE_ALERT_TOOL,
  MARK_NO_ALERT_TOOL,
  validateAnalysisToolCall,
} from "./analysis.ts";

Deno.test("valid create_alert is accepted", () => {
  const r = validateAnalysisToolCall(
    CREATE_ALERT_TOOL,
    JSON.stringify({
      issueType: "quantity_change",
      severity: "high",
      confidence: "high_confidence",
      summary: "Vendor says quantity changed from 500 to 450.",
      matchedRecords: [{ type: "company_po", id: "abc", label: "CPO-1", confidence: "high_confidence" }],
    }),
  );
  assertEquals(r.ok, true);
});

Deno.test("valid mark_no_alert is accepted", () => {
  const r = validateAnalysisToolCall(MARK_NO_ALERT_TOOL, JSON.stringify({ summary: "Routine newsletter." }));
  assertEquals(r.ok, true);
});

Deno.test("ambiguous confidence is a legal create_alert value", () => {
  const r = validateAnalysisToolCall(
    CREATE_ALERT_TOOL,
    JSON.stringify({
      issueType: "ambiguous_match",
      severity: "medium",
      confidence: "ambiguous",
      summary: "Two customers plausibly match.",
      matchedRecords: [
        { type: "customer", id: "1", label: "A", confidence: "ambiguous" },
        { type: "customer", id: "2", label: "B", confidence: "ambiguous" },
      ],
    }),
  );
  assertEquals(r.ok, true);
});

Deno.test("invalid JSON fails closed", () => {
  const r = validateAnalysisToolCall(CREATE_ALERT_TOOL, "{not json");
  assertEquals(r.ok, false);
});

Deno.test("unknown issueType fails closed", () => {
  const r = validateAnalysisToolCall(
    CREATE_ALERT_TOOL,
    JSON.stringify({ issueType: "send_payment", severity: "high", confidence: "high_confidence", summary: "x" }),
  );
  assertEquals(r.ok, false);
});

Deno.test("unknown severity fails closed", () => {
  const r = validateAnalysisToolCall(
    CREATE_ALERT_TOOL,
    JSON.stringify({ issueType: "other", severity: "urgent", confidence: "high_confidence", summary: "x" }),
  );
  assertEquals(r.ok, false);
});

Deno.test("malformed matchedRecords fails closed", () => {
  const r = validateAnalysisToolCall(
    CREATE_ALERT_TOOL,
    JSON.stringify({
      issueType: "other",
      severity: "low",
      confidence: "no_match",
      summary: "x",
      matchedRecords: [{ type: "customer" }],
    }),
  );
  assertEquals(r.ok, false);
});

Deno.test("empty summary fails closed", () => {
  const r = validateAnalysisToolCall(MARK_NO_ALERT_TOOL, JSON.stringify({ summary: "" }));
  assertEquals(r.ok, false);
});

Deno.test("unknown tool name fails closed", () => {
  const r = validateAnalysisToolCall("send_email", JSON.stringify({ summary: "x" }));
  assertEquals(r.ok, false);
});

Deno.test("non-object arguments fail closed", () => {
  const r = validateAnalysisToolCall(MARK_NO_ALERT_TOOL, JSON.stringify(["not", "an", "object"]));
  assertEquals(r.ok, false);
});
