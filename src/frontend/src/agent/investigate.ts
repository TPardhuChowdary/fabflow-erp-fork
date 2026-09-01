// FabFlow AI Agent — investigation / synthesis (Phase 2).
//
// This is the "REASON" step: turn the structured facts agent/queries.ts
// pulled into the kind of short, human-style paragraph the product
// vision asks for ("Big Electronics currently has 3 active orders...").
//
// Be honest about what this is: a deterministic template over real
// numbers, not a language model composing an answer. It never states a
// number it didn't get from a query result, and it says so explicitly
// when a fact FabFlow doesn't track yet (see caveats). This is
// deliberately the seam where a real LLM would later replace the
// templating in `formatCustomerStatusReport` with actual generation —
// it would still call `getCustomerOverview` etc. for its facts, unchanged.

import type {
  AgentQueryContext,
  CustomerOverview,
  EmployeeWorkloadEntry,
  ProjectStatusData,
} from "./queries";
import { runQuery } from "./queries";

/** How many pieces have cleared the WHOLE pipeline so far. A stage's own
 * okQty only means "OK at that stage" — summing every stage's okQty
 * double-counts a piece that passed Cutting AND Box Welding. The last
 * stage's okQty is the honest "fully completed" count; with no stages
 * recorded yet there's nothing to report. */
function finalStageOkQty(stages: Array<{ okQty: number }>): number {
  return stages.length > 0 ? stages[stages.length - 1].okQty : 0;
}

export interface InvestigationResult {
  ok: boolean;
  text: string;
  /** The customer/project this investigation was about, for the caller
   * to fold into conversation context. */
  focusCustomerId?: string;
  focusProjectId?: string;
  focusEmployeeId?: string;
}

export async function investigateCustomerStatus(
  customerId: string,
  ctx: AgentQueryContext,
): Promise<InvestigationResult> {
  const result = await runQuery("getCustomerOverview", { customerId }, ctx);
  if (!result.ok || !result.data) {
    return { ok: false, text: result.message };
  }
  const data = result.data as CustomerOverview;
  const text = formatCustomerStatusReport(data, result.caveats);
  return {
    ok: true,
    text,
    focusCustomerId: data.customer.id,
    focusProjectId: data.orders[data.orders.length - 1]?.id,
  };
}

/** Answers "why is it delayed" / "what's the status of this order" for a
 * single already-known project — the follow-up half of the conversation
 * example in the product brief, once "it" has resolved via conversation
 * context (see agent/context.ts). */
export async function investigateProjectStatus(
  projectId: string,
  ctx: AgentQueryContext,
): Promise<InvestigationResult> {
  const result = await runQuery("getProjectStatus", { projectId }, ctx);
  if (!result.ok || !result.data) return { ok: false, text: result.message };
  const data = result.data as ProjectStatusData;
  const lines: string[] = [];
  const okTotal = finalStageOkQty(data.production.stages);
  lines.push(
    `${data.project.label}: ${okTotal}${data.project.totalQty ? ` of ${data.project.totalQty}` : ""} pieces completed so far.`,
  );
  if (data.production.bottleneckStage) {
    lines.push(
      `The main delay is currently in ${data.production.bottleneckStage} — received quantity is ahead of what's passed OK there.`,
    );
  } else {
    lines.push(
      "No stage currently looks behind based on sent/received/OK quantities.",
    );
  }
  if (data.qms.sheetStatus) lines.push(`QMS: ${data.qms.sheetStatus}.`);
  return { ok: true, text: lines.join(" "), focusProjectId: data.project.id };
}

export async function answerWhoIsWorkingOn(
  projectId: string,
  ctx: AgentQueryContext,
): Promise<InvestigationResult> {
  const result = await runQuery("getProjectStatus", { projectId }, ctx);
  if (!result.ok || !result.data) return { ok: false, text: result.message };
  const data = result.data as ProjectStatusData;
  if (data.assignedEmployees.length === 0) {
    return {
      ok: true,
      text: `No employees are currently assigned to ${data.project.label}.`,
      focusProjectId: projectId,
    };
  }
  return {
    ok: true,
    text: `${data.assignedEmployees.map((e) => e.name).join(", ")} ${data.assignedEmployees.length === 1 ? "is" : "are"} assigned to ${data.project.label}.`,
    focusProjectId: projectId,
    focusEmployeeId:
      data.assignedEmployees.length === 1
        ? data.assignedEmployees[0].id
        : undefined,
  };
}

export async function answerExpectedQuantity(
  employeeId: string,
  ctx: AgentQueryContext,
): Promise<InvestigationResult> {
  const result = await runQuery("getEmployeeWorkload", { employeeId }, ctx);
  if (!result.ok || !result.data) return { ok: false, text: result.message };
  const data = result.data as {
    employee: { id: string; name: string };
    assignments: EmployeeWorkloadEntry[];
  };
  if (data.assignments.length === 0) {
    return {
      ok: true,
      text: `${data.employee.name} has no recorded work assignments.`,
      focusEmployeeId: employeeId,
    };
  }
  const latest = data.assignments[data.assignments.length - 1];
  return {
    ok: true,
    text:
      `Based on ${data.employee.name}'s assignment of ${latest.durationHours}h at ${latest.piecesPerHour} pcs/hr on ${latest.task}, ` +
      `the expected quantity is ${latest.targetQuantity} pieces. FabFlow doesn't track actual quantity produced yet, so I can't tell you how many pieces have actually been completed.`,
    focusEmployeeId: employeeId,
  };
}

function formatCustomerStatusReport(
  data: CustomerOverview,
  caveats?: string[],
): string {
  const { customer, orders, openInvoices } = data;
  if (orders.length === 0) {
    return `${customer.name} has no projects/orders recorded in FabFlow yet.`;
  }

  const lines: string[] = [];
  lines.push(
    `${customer.name} currently has ${orders.length} order${orders.length === 1 ? "" : "s"}.`,
  );

  const latest = orders[orders.length - 1];
  const qtyPart = latest.totalQty
    ? `${latest.totalQty} pieces`
    : "an unspecified quantity";
  const okTotal = finalStageOkQty(latest.production.stages);
  lines.push(
    `The latest is ${latest.label} — ${qtyPart}${
      latest.production.stages.length > 0
        ? `, ${okTotal} completed so far.`
        : "."
    }`,
  );

  if (latest.production.bottleneckStage) {
    lines.push(
      `The current bottleneck appears to be ${latest.production.bottleneckStage}, where received quantity is ahead of what's been passed OK.`,
    );
  }

  if (latest.qms.sheetStatus) {
    lines.push(`QMS inspection status: ${latest.qms.sheetStatus}.`);
  } else if (latest.qms.gateInspectionCount > 0) {
    lines.push(
      `${latest.qms.gatePendingCount} of ${latest.qms.gateInspectionCount} QMS inspection(s) still pending.`,
    );
  }

  if (latest.assignedEmployees.length > 0) {
    lines.push(
      `Assigned: ${latest.assignedEmployees.map((e) => e.name).join(", ")}.`,
    );
  }

  if (openInvoices.length > 0) {
    const totalDue = openInvoices.reduce(
      (sum, i) => sum + (i.totalAmount - i.paidAmount),
      0,
    );
    lines.push(
      `${openInvoices.length} open invoice(s), ₹${totalDue.toLocaleString("en-IN")} outstanding.`,
    );
  }

  if (caveats && caveats.length > 0) {
    lines.push(`(Not tracked by FabFlow: ${caveats.join(" ")})`);
  }

  return lines.join(" ");
}
