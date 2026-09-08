// Phase 8 Email Operations — the monitor's entire tool surface: 8
// read-only lookups (see erpLookups.ts) plus the 2 conclusion tools
// (see analysis.ts). Nothing here can write to an ERP record or send
// anything — there is no tool shaped like one, so there is nothing for
// a prompt-injected instruction to escalate into even in principle.

import type { ChatToolSchema } from "../_shared/provider.ts";
import { CONFIDENCES, ISSUE_TYPES, SEVERITIES } from "./analysis.ts";

function lookupTool(name: string, description: string): ChatToolSchema {
  return {
    name,
    description,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search — a name, number, or identifier." },
      },
      required: ["query"],
    },
  };
}

export const MONITOR_TOOLS: ChatToolSchema[] = [
  lookupTool("search_customers", "Search customers by name, email, or GSTIN. Read-only."),
  lookupTool("search_vendors", "Search vendors by name or GSTIN. Read-only."),
  lookupTool("search_projects", "Search projects by name or project number. Read-only."),
  lookupTool("search_customer_pos", "Search customer purchase orders by PO number. Read-only."),
  lookupTool("search_company_pos", "Search FabFlow's own POs to vendors by CPO number or vendor name. Read-only."),
  lookupTool("search_invoices", "Search invoices by invoice number. Read-only."),
  lookupTool("search_quotations", "Search quotations by quotation number. Read-only."),
  lookupTool("search_delivery_challans", "Search delivery challans by DC number. Read-only."),
  {
    name: "create_alert",
    description:
      "Record a durable operational alert for this email. Call this exactly once, only when the email genuinely warrants a human's attention.",
    input_schema: {
      type: "object",
      properties: {
        issueType: { type: "string", description: `One of: ${ISSUE_TYPES.join(", ")}.` },
        severity: { type: "string", description: `One of: ${SEVERITIES.join(", ")}.` },
        confidence: { type: "string", description: `One of: ${CONFIDENCES.join(", ")}.` },
        summary: { type: "string", description: "Concise plain-language description of the detected issue." },
        matchedRecords: {
          type: "array",
          description: "Only records an actual search tool returned in this conversation.",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              id: { type: "string" },
              label: { type: "string" },
              confidence: { type: "string" },
            },
            required: ["type", "id", "label", "confidence"],
          },
        },
        details: { type: "object", description: "Only fields you actually compared, e.g. {emailQty, erpQty}." },
        recommendedAction: { type: "string", description: "Optional plain-language next step." },
      },
      required: ["issueType", "severity", "confidence", "summary"],
    },
  },
  {
    name: "mark_no_alert",
    description:
      "Record that this email was analyzed and does not warrant an operational alert. Call this exactly once for an email that needs no attention.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One line on why no alert is needed." },
      },
      required: ["summary"],
    },
  },
];
