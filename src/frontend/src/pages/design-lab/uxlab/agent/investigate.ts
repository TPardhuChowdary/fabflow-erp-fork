// Final Unified Prototype — AI Agent investigation/synthesis.
//
// Ported from the real agent/investigate.ts (see PARITY_TRACKER.md #30),
// adapted to this lab's own DataState — computed directly against the
// live store snapshot rather than through a separate async query layer
// (agent/queries.ts, 2,385 lines, is production's own read-model/
// permission-filtering layer over Supabase; this lab's `data` already IS
// the live, permission-free mock state every other screen reads, so
// there is nothing for a parallel query layer to add here). Same honesty
// as the real file: a deterministic template over real numbers, never a
// language model composing an answer, and it says so explicitly when a
// fact this lab doesn't track (per its own disclosed gaps) is asked
// about, rather than guessing.
import type { DataState, ProjectProductionStage } from "../data";

export interface InvestigationResult {
  ok: boolean;
  text: string;
  focusCustomerId?: string;
  focusProjectId?: string;
}

function stageBottleneck(
  stages: ProjectProductionStage[],
): { stage: ProjectProductionStage; index: number } | null {
  const idx = stages.findIndex((s) => s.status !== "Completed");
  return idx === -1 ? null : { stage: stages[idx], index: idx };
}

function completedCount(stages: ProjectProductionStage[]): number {
  const last = stages[stages.length - 1];
  return last ? last.receivedQuantity : 0;
}

function projectStatusLine(data: DataState, projectId: string): string[] {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) return ["I couldn't find that project."];
  const lines: string[] = [];
  const production = data.projectProductions.find(
    (pp) => pp.projectId === projectId,
  );
  const stages = production?.stages ?? [];
  const okTotal = completedCount(stages);
  lines.push(
    `${project.name}: ${okTotal}${project.qty ? ` of ${project.qty}` : ""} pieces completed so far.`,
  );
  const bottleneck = stageBottleneck(stages);
  if (bottleneck) {
    lines.push(
      `The main delay is currently at ${bottleneck.stage.stageName} — status is "${bottleneck.stage.status}".`,
    );
  } else if (stages.length > 0) {
    lines.push("No stage currently looks behind — every stage is Completed.");
  } else {
    lines.push(
      "No production stages have been configured for this project yet.",
    );
  }
  const qmsInsp = data.projectQmsInspections
    .filter((q) => q.projectId === projectId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (qmsInsp)
    lines.push(`QMS: ${qmsInsp.processName} inspection is ${qmsInsp.status}.`);
  return lines;
}

export function investigateProjectStatus(
  data: DataState,
  projectId: string,
): InvestigationResult {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) {
    return { ok: false, text: "I couldn't find that project." };
  }
  return {
    ok: true,
    text: projectStatusLine(data, projectId).join(" "),
    focusProjectId: projectId,
  };
}

export function investigateCustomerStatus(
  data: DataState,
  customerId: string,
): InvestigationResult {
  const customer = data.customers.find((c) => c.id === customerId);
  if (!customer) return { ok: false, text: "I couldn't find that customer." };
  const orders = data.projects.filter((p) => p.customerId === customerId);
  if (orders.length === 0) {
    return {
      ok: true,
      text: `${customer.name} has no projects/orders recorded yet.`,
      focusCustomerId: customerId,
    };
  }
  const lines: string[] = [];
  lines.push(
    `${customer.name} currently has ${orders.length} order${orders.length === 1 ? "" : "s"}.`,
  );
  const latest = orders[orders.length - 1];
  lines.push(`The latest is ${latest.name} — ${latest.qty} pieces.`);
  lines.push(...projectStatusLine(data, latest.id).slice(1));

  const openInvoices = data.invoices.filter(
    (i) => i.projectId === latest.id && i.status !== "Paid",
  );
  if (openInvoices.length > 0) {
    const totalDue = openInvoices.reduce(
      (sum, i) => sum + (i.amount - i.paidAmount),
      0,
    );
    lines.push(
      `${openInvoices.length} open invoice(s), ₹${totalDue.toLocaleString("en-IN")} outstanding.`,
    );
  }
  return {
    ok: true,
    text: lines.join(" "),
    focusCustomerId: customerId,
    focusProjectId: latest.id,
  };
}
