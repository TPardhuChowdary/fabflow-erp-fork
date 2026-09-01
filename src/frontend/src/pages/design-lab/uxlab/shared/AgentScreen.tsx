// Final Unified Prototype — AI Agent, "Classic mode" (see
// PARITY_TRACKER.md #30). A real, working deterministic instruction
// parser + confirm-before-write execution pipeline — not a decorative
// chatbot. Every write goes through the same real store actions the
// dedicated screens use; every read/investigate answer is computed live
// from the same `data` every other screen reads.
//
// Disclosed gap (see the info panel below and PARITY_TRACKER.md): real
// production's PRIMARY experience is a real LLM chat panel
// (agent/llm/orchestrator.ts) that tool-calls 31 actions via natural-
// language understanding. That requires a live LLM API key held
// server-side — infrastructure this lab, a pure client-side mock store,
// has no path to at all (not even the Supabase Edge Function real
// production could theoretically add). What's built here is production's
// OWN disclosed fallback/debug path — "Classic mode" — which is a real,
// deterministic, non-LLM parser recognizing a fixed set of instruction
// shapes. Production's own intentParser.ts header explains exactly why
// that's the honest, working thing to ship instead of faking the LLM.
import { useState } from "react";
import { AGENT_ACTIONS, runAction } from "../agent/actions";
import type { AgentConversationContext } from "../agent/context";
import { emptyContext, pushTurn } from "../agent/context";
import { parseInstruction } from "../agent/intentParser";
import {
  investigateCustomerStatus,
  investigateProjectStatus,
} from "../agent/investigate";
import type { AgentIntent } from "../agent/types";
import { useUxLabStore } from "../store";

interface TranscriptEntry {
  id: string;
  instruction: string;
  intent: AgentIntent;
  status: "pending" | "done";
  answerText?: string;
  results?: Array<{ actionName: string; ok: boolean; message: string }>;
}

const WRITE_ACTION_LABELS: Record<string, string> = {
  createCustomer: "Create customer",
  createProject: "Create project",
  createRepeatOrder: "Create repeat order",
  attachDocument: "Attach document",
};

function describeStep(
  actionName: string,
  params: Record<string, unknown>,
): string {
  const label = WRITE_ACTION_LABELS[actionName] ?? actionName;
  const parts: string[] = [];
  if (actionName === "createCustomer" && params.name)
    parts.push(String(params.name));
  if (actionName === "createProject") {
    if (params.projectName) parts.push(String(params.projectName));
  }
  if (actionName === "createRepeatOrder" && params.quantity !== undefined) {
    parts.push(`${params.quantity} piece(s)`);
  }
  if (actionName === "attachDocument") parts.push("to selected project");
  return parts.length > 0 ? `${label} — ${parts.join(", ")}` : label;
}

let seq = 0;
const nextId = () => `agent-${Date.now()}-${seq++}`;

const EXAMPLE_INSTRUCTIONS = [
  "create Acme Fabricators",
  "create the Bracket Assembly project for Acme Fabricators",
  "repeat order for Bracket Assembly for 200 pieces",
  "what's the status of Acme Fabricators",
  "why is it delayed",
  "find customer Acme",
];

export function AgentScreen() {
  const {
    data,
    addCustomer,
    createProjectDirect,
    addDrawingLinkFull,
    logAgentAuditFull,
  } = useUxLabStore();
  const [instruction, setInstruction] = useState("");
  const [drawingId, setDrawingId] = useState("");
  const [convo, setConvo] = useState<AgentConversationContext>(emptyContext());
  const [log, setLog] = useState<TranscriptEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const store = { data, addCustomer, createProjectDirect, addDrawingLinkFull };

  const contextUpdateFromOutcome = (
    actionName: string,
    outcome: { ok: boolean; data?: Record<string, unknown> },
  ): Partial<AgentConversationContext> => {
    if (!outcome.ok || !outcome.data) return {};
    if (
      actionName === "createCustomer" &&
      typeof outcome.data.id === "string"
    ) {
      return { currentCustomerId: outcome.data.id };
    }
    if (
      (actionName === "createProject" || actionName === "createRepeatOrder") &&
      typeof outcome.data.id === "string"
    ) {
      return { currentProjectId: outcome.data.id };
    }
    const matches = outcome.data.matches as Array<{ id: string }> | undefined;
    if (Array.isArray(matches) && matches.length === 1) {
      if (actionName === "findCustomer")
        return { currentCustomerId: matches[0].id };
      if (actionName === "findProject")
        return { currentProjectId: matches[0].id };
    }
    return {};
  };

  const handleSubmit = async () => {
    const text = instruction.trim();
    if (!text || busy) return;
    const intent = parseInstruction(data, text, {
      drawingId: drawingId || undefined,
      projectId: convo.currentProjectId,
      currentCustomerId: convo.currentCustomerId,
    });
    setInstruction("");

    const first =
      intent.kind === "action"
        ? intent.actionName
        : intent.kind === "plan"
          ? intent.steps.map((s) => s.actionName).join("+")
          : intent.kind;
    logAgentAuditFull("agent_action_proposed", {
      instruction: text,
      action: first,
    });

    if (intent.kind === "investigate") {
      setBusy(true);
      const result =
        intent.topic === "customerStatus"
          ? investigateCustomerStatus(data, intent.customerId)
          : investigateProjectStatus(data, intent.projectId);
      logAgentAuditFull(
        result.ok ? "agent_action_executed" : "agent_action_failed",
        {
          instruction: text,
          action: `investigate:${intent.topic}`,
        },
      );
      setLog((l) => [
        ...l,
        {
          id: nextId(),
          instruction: text,
          intent,
          status: "done",
          answerText: result.text,
        },
      ]);
      setConvo((c) =>
        pushTurn(
          {
            ...c,
            currentCustomerId: result.focusCustomerId ?? c.currentCustomerId,
            currentProjectId: result.focusProjectId ?? c.currentProjectId,
          },
          { instruction: text, summary: result.text },
        ),
      );
      setBusy(false);
      return;
    }

    if (
      intent.kind === "action" &&
      AGENT_ACTIONS[intent.actionName]?.kind === "read"
    ) {
      setBusy(true);
      const outcome = await runAction(intent.actionName, intent.params, store);
      logAgentAuditFull(
        outcome.ok ? "agent_action_executed" : "agent_action_failed",
        {
          instruction: text,
          action: intent.actionName,
        },
      );
      setLog((l) => [
        ...l,
        {
          id: nextId(),
          instruction: text,
          intent,
          status: "done",
          results: [
            {
              actionName: intent.actionName,
              ok: outcome.ok,
              message: outcome.message,
            },
          ],
        },
      ]);
      setConvo((c) =>
        pushTurn(
          { ...c, ...contextUpdateFromOutcome(intent.actionName, outcome) },
          { instruction: text, summary: outcome.message },
        ),
      );
      setBusy(false);
      return;
    }

    setLog((l) => [
      ...l,
      { id: nextId(), instruction: text, intent, status: "pending" },
    ]);
  };

  const handleConfirm = async (entryId: string) => {
    const entry = log.find((e) => e.id === entryId);
    if (
      !entry ||
      entry.intent.kind === "clarify" ||
      entry.intent.kind === "unrecognized" ||
      entry.intent.kind === "investigate"
    ) {
      return;
    }
    setBusy(true);
    const steps =
      entry.intent.kind === "plan"
        ? entry.intent.steps
        : [
            {
              actionName: entry.intent.actionName,
              params: entry.intent.params,
            },
          ];

    logAgentAuditFull("agent_action_confirmed", {
      instruction: entry.instruction,
      action: steps.map((s) => s.actionName).join("+"),
    });

    const results: Array<{ actionName: string; ok: boolean; message: string }> =
      [];
    let contextUpdates: Partial<AgentConversationContext> = {};
    for (const step of steps) {
      const outcome = await runAction(step.actionName, step.params, store);
      results.push({
        actionName: step.actionName,
        ok: outcome.ok,
        message: outcome.message,
      });
      contextUpdates = {
        ...contextUpdates,
        ...contextUpdateFromOutcome(step.actionName, outcome),
      };
      logAgentAuditFull(
        outcome.ok ? "agent_action_executed" : "agent_action_failed",
        {
          instruction: entry.instruction,
          action: step.actionName,
        },
      );
      if (!outcome.ok) break;
    }
    setLog((l) =>
      l.map((e) => (e.id === entryId ? { ...e, status: "done", results } : e)),
    );
    setConvo((c) =>
      pushTurn(
        { ...c, ...contextUpdates },
        {
          instruction: entry.instruction,
          summary: results.map((r) => r.message).join(" "),
        },
      ),
    );
    setBusy(false);
  };

  const handleCancel = (entryId: string) => {
    const entry = log.find((e) => e.id === entryId);
    if (entry) {
      logAgentAuditFull("agent_action_blocked", {
        instruction: entry.instruction,
        action:
          entry.intent.kind === "action"
            ? entry.intent.actionName
            : entry.intent.kind,
        reason: "cancelled by user",
      });
    }
    setLog((l) => l.filter((e) => e.id !== entryId));
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <div>
        <h2 className="text-sm font-bold">AI Agent — Classic mode</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          A real, deterministic instruction parser — reads and writes real ERP
          data. Type an instruction below.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-700 space-y-1">
        <p>
          <strong>Disclosed gap:</strong> real production's PRIMARY experience
          is a real LLM chat panel that tool-calls 31 actions via natural-
          language understanding — this needs a live LLM API key held
          server-side, infrastructure this client-only mock-store lab has no
          path to at all. What's built here is production's own honest fallback:
          "Classic mode," a real deterministic parser recognizing a fixed set of
          instruction shapes — 7 of the real 31 actions are reachable this way
          (the other 24 are only reachable via the real LLM's tool-calling in
          production too). See PARITY_TRACKER.md #30.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div>
          <label
            htmlFor="agent-drawing"
            className="text-[11px] font-semibold text-gray-500"
          >
            Current drawing context (for "attach this drawing to..."
            instructions)
          </label>
          <select
            id="agent-drawing"
            value={drawingId}
            onChange={(e) => setDrawingId(e.target.value)}
            className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
          >
            <option value="">(none selected)</option>
            {data.drawings.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fileName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder='Try: "create the Panel Cover project for Acme Fabricators"'
            className="flex-1 text-xs px-2.5 py-2 rounded-lg border"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !instruction.trim()}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_INSTRUCTIONS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setInstruction(ex)}
              className="text-[10px] px-2 py-1 rounded-full border text-gray-500 hover:bg-gray-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {log.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">
            No instructions yet — try one of the examples above.
          </p>
        )}
        {[...log].reverse().map((entry) => (
          <div
            key={entry.id}
            className="rounded-xl border bg-white p-3.5 space-y-2"
          >
            <p className="text-xs font-semibold text-gray-900">
              "{entry.instruction}"
            </p>
            {entry.intent.kind === "clarify" && (
              <p className="text-xs text-amber-700">
                {entry.intent.question}
                {entry.intent.options && (
                  <span className="block text-gray-500 mt-1">
                    Options: {entry.intent.options.join(", ")}
                  </span>
                )}
              </p>
            )}
            {entry.intent.kind === "unrecognized" && (
              <p className="text-xs text-gray-500">{entry.intent.reason}</p>
            )}
            {entry.answerText && (
              <p className="text-xs text-gray-700">{entry.answerText}</p>
            )}
            {entry.status === "pending" &&
              (entry.intent.kind === "action" ||
                entry.intent.kind === "plan") && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 space-y-2">
                  <p className="text-[11px] font-semibold text-blue-800">
                    Agent wants to perform — confirm to proceed:
                  </p>
                  <ul className="text-[11px] text-blue-700 list-disc list-inside">
                    {(entry.intent.kind === "plan"
                      ? entry.intent.steps
                      : [
                          {
                            actionName: entry.intent.actionName,
                            params: entry.intent.params,
                          },
                        ]
                    ).map((s, i) => (
                      <li key={`${entry.id}-${i}`}>
                        {describeStep(s.actionName, s.params)}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleConfirm(entry.id)}
                      disabled={busy}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-gray-900 text-white disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancel(entry.id)}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            {entry.results && (
              <ul className="text-xs space-y-0.5">
                {entry.results.map((r, i) => (
                  <li
                    key={`${entry.id}-r${i}`}
                    className={r.ok ? "text-emerald-700" : "text-red-600"}
                  >
                    {r.ok ? "✓" : "✗"} {r.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
