// FabFlow AI Agent — Phase 4 UI.
//
// The real LLM chat (agent/llm/orchestrator.ts) is now the PRIMARY
// experience — a ChatGPT-style panel, always shown. The Phase 1/2
// deterministic parser is still here as a collapsed "Classic / debug
// mode" section below it: useful for verifying a specific tool call
// deterministically, or as a fallback when the LLM backend isn't
// configured, but it is not the thing a user sees first, and it is not
// being expanded with more patterns — see agent/intentParser.ts's own
// header comment for why.
//
// Classic mode's three execution paths, unchanged from Phase 2:
//   - "investigate" (status questions, follow-ups) and "read"-kind
//     actions (find*) execute immediately — no confirmation needed for
//     read-only operations.
//   - "action"/"plan" of kind "write" always show "Agent wants to
//     perform: ..." and wait for Confirm/Cancel.
//   - "clarify"/"unrecognized" are shown as-is; the Agent never guesses.
//
// Classic mode's conversation context (agent/context.ts) tracks which
// customer/project/employee the last few turns were about, purely in
// this component's own state — never persisted, never a substitute for
// re-reading real ERP data on every question (see that file's A/B/C
// boundary comment). The AI chat has its own, richer conversational
// memory — the full LLM message history — which needs no such tracking;
// the model itself resolves "it"/"that order"/"him" from context.

import { useAuth } from "@/AuthContext";
import { AGENT_ACTIONS, runAction } from "@/agent/actions";
import { logAgentEvent } from "@/agent/audit";
import {
  type AgentConversationContext,
  emptyContext,
  pushTurn,
} from "@/agent/context";
import {
  ALLOWED_AGENT_MIME_TYPES,
  MAX_AGENT_FILE_BYTES,
  uploadAgentDocument,
  validateAgentFile,
} from "@/agent/documentUpload";
import { type ParseContext, parseInstruction } from "@/agent/intentParser";
import {
  type InvestigationResult,
  answerExpectedQuantity,
  answerWhoIsWorkingOn,
  investigateCustomerStatus,
  investigateProjectStatus,
} from "@/agent/investigate";
import type { LlmContentBlock, LlmMessage } from "@/agent/llm/client";
import {
  type AgentTurnResult,
  type PendingToolCall,
  resumeAgentTurn,
  runAgentTurn,
} from "@/agent/llm/orchestrator";
import type { AgentIntent } from "@/agent/types";
import {
  DEFAULT_VOICE_LANGUAGE,
  type VoiceController,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speak,
  startListening,
  stopSpeaking,
  stripForSpeech,
} from "@/agent/voice";
import { SignaturePad } from "@/components/SignaturePad";
import { AgentMarkdown } from "@/components/agent/AgentMarkdown";
import {
  VoiceConversationOverlay,
  type VoiceState,
} from "@/components/agent/VoiceConversationOverlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/store";
import type { Page } from "@/types";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mic,
  Paperclip,
  PhoneCall,
  Send,
  Square,
  SquarePen,
  Volume2,
  X,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";

interface TranscriptEntry {
  id: string;
  instruction: string;
  intent: AgentIntent;
  status: "pending" | "done";
  /** Set for "investigate" and read-only find* answers — a plain
   * human-readable sentence, never re-parsed as structured data. */
  answerText?: string;
  results?: Array<{ actionName: string; ok: boolean; message: string }>;
}

async function runInvestigation(
  intent: Extract<AgentIntent, { kind: "investigate" }>,
  ctx: { currentUser: NonNullable<ReturnType<typeof useAuth>["currentUser"]> },
): Promise<InvestigationResult> {
  switch (intent.topic) {
    case "customerStatus":
      return investigateCustomerStatus(intent.customerId, ctx);
    case "projectStatus":
      return investigateProjectStatus(intent.projectId, ctx);
    case "whoIsWorking":
      return answerWhoIsWorkingOn(intent.projectId, ctx);
    case "expectedQuantity":
      return answerExpectedQuantity(intent.employeeId, ctx);
  }
}

/** Only updates context when a create/find action resolved to exactly
 * one unambiguous entity — never guesses which one the user meant. */
function contextUpdateFromOutcome(
  actionName: string,
  outcome: { ok: boolean; data?: Record<string, unknown> },
): Partial<AgentConversationContext> {
  if (!outcome.ok || !outcome.data) return {};
  if (actionName === "createCustomer" && typeof outcome.data.id === "string") {
    return { currentCustomerId: outcome.data.id };
  }
  if (
    (actionName === "createProject" || actionName === "createRepeatOrder") &&
    typeof outcome.data.id === "string"
  ) {
    return { currentProjectId: outcome.data.id };
  }
  if (actionName === "createEmployee" && typeof outcome.data.id === "string") {
    return { currentEmployeeId: outcome.data.id };
  }
  const matches = outcome.data.matches;
  if (Array.isArray(matches) && matches.length === 1 && matches[0]?.id) {
    if (actionName === "findCustomer")
      return { currentCustomerId: matches[0].id };
    if (actionName === "findProject")
      return { currentProjectId: matches[0].id };
    if (actionName === "findEmployee")
      return { currentEmployeeId: matches[0].id };
  }
  return {};
}

export interface AiChatEntry {
  id: string;
  role: "user" | "agent" | "error";
  text: string;
  pendingCalls?: PendingToolCall[];
  /** Set only on the agent's follow-up message that directly completed a
   * real confirmed write action (see handleAiConfirm) — lets the UI show
   * a distinct "done" marker instead of leaving a confirmed action's
   * outcome looking like an ordinary reply. Never set on a plain read-only
   * answer. */
  confirmedAction?: boolean;
}

/** AI Agent redesign (see chat) — the AI panel's conversation state,
 * lifted to App.tsx (same place selectedProjectId/selectedCustomerId/etc.
 * already live) so navigating away from and back to the Agent page keeps
 * the conversation, instead of losing it on unmount. Classic/debug
 * mode's own state (log/convo/busy/instruction) is deliberately NOT
 * lifted — it's a separate, lower-stakes debugging tool, not "the
 * conversation" this requirement is about. */
export interface AgentAiState {
  aiChat: AiChatEntry[];
  setAiChat: Dispatch<SetStateAction<AiChatEntry[]>>;
  aiMessages: LlmMessage[];
  setAiMessages: Dispatch<SetStateAction<LlmMessage[]>>;
  aiPending: { messages: LlmMessage[]; pendingCalls: PendingToolCall[] } | null;
  setAiPending: Dispatch<
    SetStateAction<{
      messages: LlmMessage[];
      pendingCalls: PendingToolCall[];
    } | null>
  >;
  aiBusy: boolean;
  setAiBusy: Dispatch<SetStateAction<boolean>>;
  aiInstruction: string;
  setAiInstruction: Dispatch<SetStateAction<string>>;
  pendingFiles: Array<{ id: string; file: File; rejected?: string }>;
  setPendingFiles: Dispatch<
    SetStateAction<Array<{ id: string; file: File; rejected?: string }>>
  >;
}

// Human-readable label + one-line summary for a pending write, shown in
// the confirmation "Details" disclosure — an ordinary ERP user never
// sees a tool name or raw JSON, only "Create project — AGENT-TEST for
// Test Customer, 5 pieces" (Phase 6-Continued UI requirement: the
// disclosure can stay for transparency, but its contents must read like
// plain FabFlow language, not an API payload).
const WRITE_ACTION_LABELS: Record<string, string> = {
  createCustomer: "Create customer",
  createProject: "Create project",
  createRepeatOrder: "Create repeat order",
  createWorkCard: "Create work assignment",
  recordStageTransaction: "Record stage material movement",
  updateProductionStageStatus: "Update production stage status",
  assignQmsInspectionStage: "Assign QMS inspection stage",
  attachDocument: "Attach document",
  createEmployee: "Add employee",
  recordPayment: "Record payment",
  recordInventoryPurchase: "Record inventory purchase",
  recordInventoryUsage: "Record inventory usage",
  recordMaterialPurchase: "Record material purchase",
  completeMaterialRequisition: "Complete material requisition",
  createScrapRecord: "Log scrap record",
  createDeliveryChallan: "Create delivery challan",
  createInvoice: "Create invoice",
  createQuotation: "Create quotation",
  recordCustomerPO: "Record customer PO",
  createVendor: "Create vendor",
  createPayable: "Create payable",
  updatePayable: "Edit payable",
  recordPayablePayment: "Record vendor payment",
  deletePayablePayment: "Delete vendor payment",
  createCompanyPO: "Create company PO",
  createExpenseFloat: "Issue expense float",
  createPettyExpense: "Record petty expense",
  createMachine: "Register machine",
  createTool: "Register tool",
  createDie: "Register die",
  createBillableService: "Create billable service",
  recordMachineServiceUsage: "Record machine/service usage",
  createSalaryAdvance: "Record salary advance",
};

function describePendingCall(call: PendingToolCall): {
  label: string;
  detail: string;
} {
  const label = WRITE_ACTION_LABELS[call.name] ?? call.name;
  const p = call.input as Record<string, unknown>;
  const parts: string[] = [];
  switch (call.name) {
    case "createCustomer":
      if (p.name) parts.push(String(p.name));
      break;
    case "createProject":
    case "createRepeatOrder":
      if (p.projectName) parts.push(String(p.projectName));
      if (p.totalQty !== undefined) parts.push(`${p.totalQty} piece(s)`);
      break;
    case "createWorkCard":
      if (p.task) parts.push(String(p.task));
      if (p.allocatedHours !== undefined)
        parts.push(`${p.allocatedHours} hr(s)`);
      break;
    case "recordStageTransaction": {
      if (p.type) parts.push(String(p.type));
      if (p.quantity !== undefined) parts.push(`${p.quantity} unit(s)`);
      if (p.stageName) parts.push(String(p.stageName));
      break;
    }
    case "updateProductionStageStatus": {
      if (p.stageName) parts.push(String(p.stageName));
      if (p.status) parts.push(`→ ${String(p.status)}`);
      break;
    }
    case "assignQmsInspectionStage": {
      if (p.stageName) parts.push(String(p.stageName));
      if (p.assigneeId) {
        const employee = useStore
          .getState()
          .employees.find((e) => e.id === p.assigneeId);
        parts.push(employee ? `→ ${employee.name}` : String(p.assigneeId));
      }
      break;
    }
    case "attachDocument":
      parts.push("link existing document to this project");
      break;
    case "createEmployee":
      if (p.name) parts.push(String(p.name));
      break;
    case "recordPayment": {
      if (p.amount !== undefined) parts.push(`amount ${p.amount}`);
      if (p.mode) parts.push(String(p.mode));
      try {
        const files =
          typeof p.filesJson === "string" ? JSON.parse(p.filesJson) : [];
        if (Array.isArray(files) && files.length > 0) {
          parts.push(`${files.length} evidence file(s)`);
        }
      } catch {
        // malformed filesJson — omit the file count from the summary rather than fail the whole label
      }
      break;
    }
    case "recordInventoryPurchase":
      if (p.quantityPurchased !== undefined)
        parts.push(`${p.quantityPurchased} unit(s)`);
      if (p.supplierName) parts.push(`from ${p.supplierName}`);
      break;
    case "recordInventoryUsage": {
      if (p.quantityUsed !== undefined) parts.push(`${p.quantityUsed} unit(s)`);
      break;
    }
    case "recordMaterialPurchase": {
      if (p.quantity !== undefined && p.unit) {
        parts.push(`${p.quantity} ${p.unit}`);
      }
      if (p.materialType) parts.push(String(p.materialType));
      break;
    }
    case "completeMaterialRequisition": {
      if (p.requisitionId) {
        const req = useStore
          .getState()
          .bomRequisitions.find((r) => r.id === p.requisitionId);
        parts.push(req ? req.materialName : String(p.requisitionId));
      }
      break;
    }
    case "createScrapRecord": {
      if (p.materialType) parts.push(String(p.materialType));
      if (p.generatedQty !== undefined && p.unit) {
        parts.push(`${p.generatedQty} ${p.unit}`);
      }
      break;
    }
    case "createDeliveryChallan": {
      if (p.receiverName) parts.push(`to ${p.receiverName}`);
      if (p.status) parts.push(String(p.status));
      try {
        const entries =
          typeof p.projectEntriesJson === "string"
            ? JSON.parse(p.projectEntriesJson)
            : [];
        if (Array.isArray(entries) && entries.length > 0) {
          const total = entries.reduce(
            (sum: number, e: { dispatchQty?: number }) =>
              sum + (Number(e.dispatchQty) || 0),
            0,
          );
          parts.push(`${total} piece(s) across ${entries.length} project(s)`);
        }
      } catch {
        // malformed projectEntriesJson — omit the quantity summary rather than fail the whole label
      }
      break;
    }
    case "createInvoice": {
      try {
        const items =
          typeof p.lineItemsJson === "string"
            ? JSON.parse(p.lineItemsJson)
            : [];
        if (Array.isArray(items) && items.length > 0) {
          const subtotal = items.reduce(
            (sum: number, it: { qty?: number; rate?: number }) =>
              sum + (Number(it.qty) || 0) * (Number(it.rate) || 0),
            0,
          );
          parts.push(`~₹${subtotal.toLocaleString("en-IN")}`);
          parts.push(`${items.length} item(s)`);
        }
      } catch {
        // malformed lineItemsJson — omit the item/amount summary rather than fail the whole label
      }
      if (p.dcId) parts.push("linked to a delivery challan");
      break;
    }
    case "createQuotation": {
      try {
        const items =
          typeof p.lineItemsJson === "string"
            ? JSON.parse(p.lineItemsJson)
            : [];
        if (Array.isArray(items) && items.length > 0) {
          const subtotal = items.reduce(
            (sum: number, it: { qty?: number; unitPrice?: number }) =>
              sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
            0,
          );
          parts.push(`~₹${subtotal.toLocaleString("en-IN")}`);
          parts.push(`${items.length} item(s)`);
        }
      } catch {
        // malformed lineItemsJson — omit the item/amount summary rather than fail the whole label
      }
      parts.push("Draft");
      break;
    }
    case "recordCustomerPO": {
      if (p.poNumber) parts.push(String(p.poNumber));
      try {
        const entries =
          typeof p.projectEntriesJson === "string"
            ? JSON.parse(p.projectEntriesJson)
            : [];
        if (Array.isArray(entries) && entries.length > 0) {
          parts.push(`${entries.length} project(s)`);
        }
      } catch {
        // malformed projectEntriesJson — omit the project count rather than fail the whole label
      }
      break;
    }
    case "createVendor": {
      if (p.name) parts.push(String(p.name));
      if (p.phone) parts.push(String(p.phone));
      if (p.address) parts.push(String(p.address));
      if (p.gstin) parts.push(`GSTIN ${p.gstin}`);
      break;
    }
    case "createPayable": {
      if (p.vendorName) parts.push(String(p.vendorName));
      if (p.totalAmount !== undefined) {
        parts.push(`₹${Number(p.totalAmount).toLocaleString("en-IN")}`);
      }
      if (p.paymentType) parts.push(String(p.paymentType));
      break;
    }
    case "updatePayable": {
      if (p.payableId) {
        const payable = useStore
          .getState()
          .payables.find((pa) => pa.id === p.payableId);
        if (payable) parts.push(payable.vendorName);
      }
      if (p.totalAmount !== undefined) {
        parts.push(`→ ₹${Number(p.totalAmount).toLocaleString("en-IN")}`);
      }
      if (p.dueDate) parts.push(`due ${String(p.dueDate)}`);
      break;
    }
    case "recordPayablePayment": {
      if (p.amount !== undefined) {
        parts.push(`₹${Number(p.amount).toLocaleString("en-IN")}`);
      }
      if (p.mode) parts.push(String(p.mode));
      break;
    }
    case "deletePayablePayment": {
      if (p.paymentId) {
        const payment = useStore
          .getState()
          .payablePayments.find((pp) => pp.id === p.paymentId);
        if (payment) {
          parts.push(`₹${payment.amount.toLocaleString("en-IN")}`);
          parts.push(payment.paymentDate);
        } else {
          parts.push(String(p.paymentId));
        }
      }
      break;
    }
    case "createCompanyPO": {
      try {
        const items =
          typeof p.itemsJson === "string" ? JSON.parse(p.itemsJson) : [];
        if (Array.isArray(items) && items.length > 0) {
          const subtotal = items.reduce(
            (sum: number, it: { quantity?: number; rate?: number }) =>
              sum + (Number(it.quantity) || 0) * (Number(it.rate) || 0),
            0,
          );
          const gstPercent =
            p.gstPercent !== undefined ? Number(p.gstPercent) : 0;
          const grandTotal = subtotal * (1 + gstPercent / 100);
          parts.push(`~₹${grandTotal.toLocaleString("en-IN")}`);
          parts.push(`${items.length} item(s)`);
        }
      } catch {
        // malformed itemsJson — omit the item/amount summary rather than fail the whole label
      }
      parts.push(String(p.status || "Draft"));
      break;
    }
    case "createExpenseFloat": {
      if (p.employeeId) {
        const employee = useStore
          .getState()
          .employees.find((e) => e.id === p.employeeId);
        parts.push(employee ? employee.name : String(p.employeeId));
      }
      if (p.issuedAmount !== undefined) {
        parts.push(`₹${Number(p.issuedAmount).toLocaleString("en-IN")}`);
      }
      if (p.purpose) parts.push(String(p.purpose));
      break;
    }
    case "createPettyExpense": {
      if (p.employeeId) {
        const employee = useStore
          .getState()
          .employees.find((e) => e.id === p.employeeId);
        parts.push(employee ? employee.name : String(p.employeeId));
      }
      if (p.amount !== undefined) {
        parts.push(`₹${Number(p.amount).toLocaleString("en-IN")}`);
      }
      parts.push(String(p.expenseType || "Misc"));
      if (p.notes) parts.push(String(p.notes));
      break;
    }
    case "createMachine": {
      if (p.name) parts.push(String(p.name));
      if (p.type) parts.push(String(p.type));
      if (p.brand) parts.push(String(p.brand));
      break;
    }
    case "createTool": {
      if (p.name) parts.push(String(p.name));
      if (p.quantity !== undefined) parts.push(`qty ${p.quantity}`);
      break;
    }
    case "createDie": {
      if (p.name) parts.push(String(p.name));
      if (p.drawingIds) {
        const n = String(p.drawingIds)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean).length;
        if (n > 0) parts.push(`${n} drawing(s) linked`);
      }
      break;
    }
    case "createBillableService": {
      if (p.name) parts.push(String(p.name));
      if (p.chargingMethod) parts.push(`per ${p.chargingMethod}`);
      break;
    }
    case "recordMachineServiceUsage": {
      if (p.quantity !== undefined) parts.push(`${p.quantity} unit(s)`);
      if (p.usageDate) parts.push(String(p.usageDate));
      break;
    }
    case "createSalaryAdvance": {
      if (p.employeeId) {
        const employee = useStore
          .getState()
          .employees.find((e) => e.id === p.employeeId);
        parts.push(employee ? employee.name : String(p.employeeId));
      }
      if (p.amount !== undefined) {
        parts.push(`₹${Number(p.amount).toLocaleString("en-IN")}`);
      }
      parts.push(p.signatureData ? "signed" : "signature required");
      break;
    }
  }
  return {
    label,
    detail: parts.length > 0 ? parts.join(" — ") : JSON.stringify(p),
  };
}

// Phase L — chat messages render as plain text (see the .map below); a
// signed export URL returned by exportLedger would otherwise show up as
// an inert, unclickable string. This is the one additive UI change this
// phase needs: detect a URL substring in an agent message and render it
// as a real link, everything else stays plain text exactly as before.
function renderMessageText(text: string) {
  const regex = /https?:\/\/\S+/g;
  const nodes: Array<
    { key: number; text: string } | { key: number; url: string }
  > = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match !== null) {
    let url = match[0];
    // trim common trailing punctuation that's part of the sentence, not
    // the URL (e.g. "...here: https://x.co/y." or "(https://x.co/y)")
    const trailing = url.match(/[.,;:)\]]+$/);
    if (trailing) url = url.slice(0, -trailing[0].length);
    if (match.index > lastIndex) {
      nodes.push({ key: key++, text: text.slice(lastIndex, match.index) });
    }
    nodes.push({ key: key++, url });
    lastIndex = match.index + url.length;
    match = regex.exec(text);
  }
  if (lastIndex < text.length) {
    nodes.push({ key: key++, text: text.slice(lastIndex) });
  }
  return nodes.map((n) =>
    "url" in n ? (
      <a
        key={n.key}
        href={n.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--primary, #2563eb)", wordBreak: "break-all" }}
      >
        {n.url}
      </a>
    ) : (
      <span key={n.key}>{n.text}</span>
    ),
  );
}

// AI Agent redesign (see chat) — reuses the exact same navigation
// callbacks App.tsx already defines for Layout/CommandPalette
// (navigateToRecord), not a new navigation mechanism.
interface AgentPageProps {
  onNavigate?: (page: Page) => void;
  onNavigateToRecord?: (
    type: "project" | "customer" | "employee",
    id: string,
  ) => void;
  /** AI Agent redesign (see chat) — lifted from App.tsx so the
   * conversation survives navigating away from and back to this page
   * (see AgentAiState's own comment). */
  aiState: AgentAiState;
}

export function AgentPage({
  onNavigate,
  onNavigateToRecord,
  aiState,
}: AgentPageProps) {
  const { currentUser } = useAuth();
  const projects = useStore((s) => s.projects);
  const customers = useStore((s) => s.customers);
  const employees = useStore((s) => s.employees);
  const vendors = useStore((s) => s.vendors);
  const invoices = useStore((s) => s.invoices);
  const jobCards = useStore((s) => s.jobCards);
  const inventoryItems = useStore((s) => s.inventoryItems);
  const settings = useStore((s) => s.settings);
  const assistantName = settings.aiAssistantName?.trim() || "FabFlow Copilot";
  const [instruction, setInstruction] = useState("");
  const [projectContextId, setProjectContextId] = useState<string>("");
  const [convo, setConvo] = useState<AgentConversationContext>(emptyContext());
  const [log, setLog] = useState<TranscriptEntry[]>([]);
  const [busy, setBusy] = useState(false);

  // ── AI mode (Phase 3/4) — the primary experience; see the panel below
  // and agent/llm/orchestrator.ts. Kept as its own small state machine
  // rather than reusing `log`/`convo`, since the LLM conversation history
  // (aiMessages) has its own shape (the LLM provider's message format)
  // that the Classic path below has no use for. Now lifted to App.tsx
  // (aiState) rather than local useState, so it survives this
  // component unmounting when the user navigates elsewhere and back.
  const [showClassic, setShowClassic] = useState(false);
  const {
    aiInstruction,
    setAiInstruction,
    aiMessages,
    setAiMessages,
    aiChat,
    setAiChat,
    aiPending,
    setAiPending,
    aiBusy,
    setAiBusy,
    pendingFiles,
    setPendingFiles,
  } = aiState;

  // Voice (see chat) — real browser capability, checked once per render;
  // gates whether any mic/speaker UI renders at all (never a control for
  // a capability the browser genuinely lacks). Deliberately local state,
  // not lifted to App.tsx's aiState — unlike the conversation itself,
  // losing mid-listen state on navigating away is fine (recognition is
  // stopped by the browser automatically when this component unmounts).
  const sttSupported = isSpeechRecognitionSupported();
  const ttsSupported = isSpeechSynthesisSupported();
  const voiceUiEnabled =
    (settings.voiceEnabled ?? false) && (sttSupported || ttsSupported);
  const voiceInputLang = settings.voiceInputLanguage || DEFAULT_VOICE_LANGUAGE;
  const voiceOutputLang =
    settings.voiceOutputLanguage || DEFAULT_VOICE_LANGUAGE;

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceInterim, setVoiceInterim] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speakingEntryId, setSpeakingEntryId] = useState<string | null>(null);
  const listenControllerRef = useRef<VoiceController | null>(null);
  const finalTranscriptRef = useRef("");
  // Production audit (see chat) — a plain ref, not `aiBusy` state, guards
  // re-entrancy: `aiBusy` only becomes true after React flushes the
  // setAiBusy(true) below, so several synchronous clicks arriving in the
  // same tick (e.g. a fast real double-click, or repeated programmatic
  // clicks) all still see `aiBusy === false` and each pass the guard —
  // confirmed live, sending the same message 2-3x with 2-3 real LLM
  // calls. A ref is updated synchronously and closes that gap.
  const aiSubmitInFlightRef = useRef(false);

  // Master directive — Salary Advance signature capture. A pending call
  // whose action declares requiresSignature must have signatureData
  // captured via the same SignaturePad component EmployeeDetail.tsx uses
  // before Confirm is allowed to run it; the LLM never sees or supplies
  // this field itself (see agent/actions.ts's createSalaryAdvance).
  const unsignedCall = aiPending?.pendingCalls.find(
    (c) => AGENT_ACTIONS[c.name]?.requiresSignature && !c.input.signatureData,
  );

  const handleSignatureSave = (signatureData: string) => {
    if (!aiPending || !unsignedCall) return;
    setAiPending({
      ...aiPending,
      pendingCalls: aiPending.pendingCalls.map((c) =>
        c.toolUseId === unsignedCall.toolUseId
          ? { ...c, input: { ...c.input, signatureData } }
          : c,
      ),
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Agent redesign (see chat) — `confirmedAction` marks the message as
  // the real outcome of a confirmed write, so the UI can show a distinct
  // "done" indicator instead of it reading like an ordinary reply. Only
  // ever true when this is called from handleAiConfirm (below), which is
  // the sole caller passing it — every call from handleAiSubmit leaves it
  // unset, since that path never resumes a confirmed write.
  const applyAiTurnResult = (
    result: AgentTurnResult,
    opts?: { confirmedAction?: boolean },
  ) => {
    if (result.status === "done") {
      setAiMessages(result.messages);
      setAiChat((c) => [
        ...c,
        {
          id: crypto.randomUUID(),
          role: "agent",
          text: result.text,
          confirmedAction: opts?.confirmedAction,
        },
      ]);
      setAiPending(null);
    } else if (result.status === "awaiting_confirmation") {
      setAiMessages(result.messages);
      setAiPending({
        messages: result.messages,
        pendingCalls: result.pendingCalls,
      });
      setAiChat((c) => [
        ...c,
        {
          id: crypto.randomUUID(),
          role: "agent",
          text: "",
          pendingCalls: result.pendingCalls,
        },
      ]);
    } else {
      setAiChat((c) => [
        ...c,
        { id: crypto.randomUUID(), role: "error", text: result.message },
      ]);
      setAiPending(null);
    }
  };

  // AI Agent redesign (see chat) — accepts an optional override so a
  // suggested-prompt click can submit its own text directly rather than
  // going through the async setAiInstruction()-then-read-stale-state
  // trap; the default (no argument) call from the composer is unchanged.
  const handleAiSubmit = async (overrideText?: string) => {
    if (aiSubmitInFlightRef.current) return;
    const text = (overrideText ?? aiInstruction).trim();
    const filesToSend = pendingFiles.filter((f) => !f.rejected);
    if ((!text && filesToSend.length === 0) || !currentUser) return;
    aiSubmitInFlightRef.current = true;
    setAiInstruction("");
    setPendingFiles([]);

    const displayText =
      text ||
      (filesToSend.length === 1
        ? `Attached ${filesToSend[0].file.name}.`
        : `Attached ${filesToSend.length} files.`);
    setAiChat((c) => [
      ...c,
      { id: crypto.randomUUID(), role: "user", text: displayText },
    ]);
    setAiBusy(true);

    try {
      // Each file uploads independently — one failure must never block or
      // silently drop another (Phase 8 requirement). Failures are shown
      // in the transcript before the Agent ever sees the instruction, not
      // hidden or retried automatically.
      const attachedFiles: LlmContentBlock[] = [];
      const uploadFailures: string[] = [];
      for (const pf of filesToSend) {
        const uploaded = await uploadAgentDocument(pf.file);
        if (uploaded.ok) {
          attachedFiles.push({
            type: "image",
            url: uploaded.signedUrl,
            fileName: uploaded.fileName,
            mimeType: uploaded.mimeType,
            sizeBytes: uploaded.sizeBytes,
          });
        } else {
          uploadFailures.push(`${uploaded.fileName} — ${uploaded.error}`);
        }
      }
      if (uploadFailures.length > 0) {
        setAiChat((c) => [
          ...c,
          {
            id: crypto.randomUUID(),
            role: "error",
            text: `Upload failed for:\n${uploadFailures.join("\n")}`,
          },
        ]);
      }

      const effectiveText =
        text ||
        (attachedFiles.length > 0
          ? "I've attached the file(s) above."
          : "(no files uploaded successfully)");
      const result = await runAgentTurn(
        effectiveText,
        aiMessages,
        { currentUser },
        attachedFiles,
      );
      applyAiTurnResult(result);
    } finally {
      // Production audit (see chat) — `finally` so a thrown error (e.g. an
      // unexpected upload rejection) can never leave the guard stuck true,
      // permanently blocking every future submit.
      aiSubmitInFlightRef.current = false;
      setAiBusy(false);
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).map((file) => {
      const validation = validateAgentFile(file);
      return {
        id: crypto.randomUUID(),
        file,
        rejected: validation.ok ? undefined : validation.reason,
      };
    });
    setPendingFiles((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Voice (see chat) — plays one message's text aloud. A second tap on
  // the SAME message's speaker button stops it (toggle); starting
  // playback for a different message, or starting a new mic turn,
  // interrupts whatever is currently playing (speak()/stopSpeaking() in
  // agent/voice.ts already enforce single-utterance-at-a-time).
  const handleSpeak = (entryId: string, text: string) => {
    if (speakingEntryId === entryId) {
      stopSpeaking();
      setSpeakingEntryId(null);
      setVoiceState("idle");
      return;
    }
    const spoken = stripForSpeech(text);
    if (!spoken) return;
    setSpeakingEntryId(entryId);
    setVoiceState("speaking");
    speak(spoken, voiceOutputLang, {
      onEnd: () => {
        setSpeakingEntryId(null);
        setVoiceState((s) => (s === "speaking" ? "idle" : s));
      },
      onError: (message) => {
        setVoiceError(message);
        setSpeakingEntryId(null);
        setVoiceState("idle");
      },
    });
  };

  // Voice (see chat) — the composer mic control and Voice Conversation
  // mode both call this. Tapping again while listening stops recognition
  // early (same as the engine's own silence detection firing). On a
  // genuine final transcript, sends it through the EXACT SAME
  // handleAiSubmit() a typed message uses — voice is only ever an input
  // modality for the one existing agent pipeline, never a second one.
  const handleMicToggle = () => {
    // Production audit (see chat) — checked against the REF, not
    // `voiceState`: the state update from the branch below only lands
    // after React flushes, so several rapid taps arriving before that
    // flush would otherwise all read the pre-tap "idle" state and each
    // start a brand-new recognizer (confirmed live). The ref is set
    // synchronously a few lines down, closing that gap.
    if (listenControllerRef.current) {
      listenControllerRef.current.stop();
      return;
    }
    if (voiceState === "processing") return;
    // A new voice turn always interrupts whatever is currently being
    // spoken (requirement: stop automatically when the user starts
    // another voice turn).
    stopSpeaking();
    setSpeakingEntryId(null);
    setVoiceError(null);
    finalTranscriptRef.current = "";
    setVoiceInterim("");
    setVoiceState("listening");
    listenControllerRef.current = startListening(voiceInputLang, {
      onInterim: (text) => {
        setVoiceInterim(text);
        setAiInstruction(
          finalTranscriptRef.current
            ? `${finalTranscriptRef.current} ${text}`
            : text,
        );
      },
      onFinal: (text) => {
        finalTranscriptRef.current = finalTranscriptRef.current
          ? `${finalTranscriptRef.current} ${text}`
          : text;
        setVoiceInterim("");
        setAiInstruction(finalTranscriptRef.current);
      },
      onEnd: () => {
        listenControllerRef.current = null;
        setVoiceInterim("");
        const transcript = finalTranscriptRef.current.trim();
        finalTranscriptRef.current = "";
        if (transcript) {
          setVoiceState("processing");
          void handleAiSubmit(transcript);
        } else {
          setVoiceState("idle");
        }
      },
      onError: (message) => {
        setVoiceError(message);
        setVoiceState("idle");
        listenControllerRef.current = null;
      },
    });
  };

  // Voice (see chat) — "End Voice Conversation" must stop anything
  // in-flight, not just close the overlay: leaving a long reply speaking
  // in the background after the user has visually left voice mode (or a
  // recognition turn silently listening) is not "ended". Bug found and
  // fixed during the production acceptance test — App.tsx acceptance test
  // §8.
  const handleEndVoiceMode = () => {
    listenControllerRef.current?.stop();
    stopSpeaking();
    setSpeakingEntryId(null);
    setVoiceState("idle");
    setVoiceInterim("");
    setVoiceMode(false);
  };

  const handleAiConfirm = async (approved: boolean) => {
    if (!aiPending || !currentUser) return;
    setAiBusy(true);
    const result = await resumeAgentTurn(
      aiPending.messages,
      aiPending.pendingCalls,
      approved,
      { currentUser },
    );
    setAiPending(null);
    applyAiTurnResult(result, { confirmedAction: approved });
    setAiBusy(false);
  };

  const buildParseContext = (): ParseContext => ({
    projectId: projectContextId || convo.currentProjectId,
    currentCustomerId: convo.currentCustomerId,
    currentEmployeeId: convo.currentEmployeeId,
  });

  const handleSubmit = async () => {
    const text = instruction.trim();
    if (!text || !currentUser) return;
    const intent = parseInstruction(text, buildParseContext());
    setInstruction("");

    const first =
      intent.kind === "action"
        ? intent.actionName
        : intent.kind === "plan"
          ? intent.steps.map((s) => s.actionName).join("+")
          : intent.kind;
    void logAgentEvent(currentUser.id, {
      stage: "proposed",
      instruction: text,
      actionName: first,
      params: intent.kind === "action" ? intent.params : {},
    });

    // Read-only paths execute immediately — no confirmation for reads.
    if (intent.kind === "investigate") {
      setBusy(true);
      const result = await runInvestigation(intent, { currentUser });
      void logAgentEvent(currentUser.id, {
        stage: result.ok ? "executed" : "failed",
        instruction: text,
        actionName: `investigate:${intent.topic}`,
        params: intent,
        result: result.text,
      });
      setLog((l) => [
        ...l,
        {
          id: crypto.randomUUID(),
          instruction: text,
          intent,
          status: "done",
          answerText: result.text,
        },
      ]);
      setConvo((c) => {
        const next = {
          ...c,
          currentCustomerId: result.focusCustomerId ?? c.currentCustomerId,
          currentProjectId: result.focusProjectId ?? c.currentProjectId,
          currentEmployeeId: result.focusEmployeeId ?? c.currentEmployeeId,
        };
        return pushTurn(next, { instruction: text, summary: result.text });
      });
      setBusy(false);
      return;
    }

    if (
      intent.kind === "action" &&
      AGENT_ACTIONS[intent.actionName]?.kind === "read"
    ) {
      setBusy(true);
      const outcome = await runAction(intent.actionName, intent.params, {
        currentUser,
      });
      void logAgentEvent(currentUser.id, {
        stage: outcome.ok ? "executed" : "failed",
        instruction: text,
        actionName: intent.actionName,
        params: intent.params,
        result: outcome.message,
      });
      setLog((l) => [
        ...l,
        {
          id: crypto.randomUUID(),
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
      setConvo((c) => {
        const updates = contextUpdateFromOutcome(intent.actionName, outcome);
        return pushTurn(
          { ...c, ...updates },
          { instruction: text, summary: outcome.message },
        );
      });
      setBusy(false);
      return;
    }

    // Everything else (write actions, plans, clarify, unrecognized) goes
    // through the normal propose -> confirm -> execute flow below.
    setLog((l) => [
      ...l,
      { id: crypto.randomUUID(), instruction: text, intent, status: "pending" },
    ]);
  };

  const handleConfirm = async (entryId: string) => {
    if (!currentUser) return;
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

    void logAgentEvent(currentUser.id, {
      stage: "confirmed",
      instruction: entry.instruction,
      actionName: steps.map((s) => s.actionName).join("+"),
      params: {},
    });

    const results: Array<{ actionName: string; ok: boolean; message: string }> =
      [];
    let contextUpdates: Partial<AgentConversationContext> = {};
    for (const step of steps) {
      const outcome = await runAction(step.actionName, step.params, {
        currentUser,
      });
      results.push({
        actionName: step.actionName,
        ok: outcome.ok,
        message: outcome.message,
      });
      contextUpdates = {
        ...contextUpdates,
        ...contextUpdateFromOutcome(step.actionName, outcome),
      };
      void logAgentEvent(currentUser.id, {
        stage: outcome.ok ? "executed" : "failed",
        instruction: entry.instruction,
        actionName: step.actionName,
        params: step.params,
        result: outcome.message,
      });
      // Sequential, and stop the chain on the first failure — a later
      // step in a plan may depend on an earlier one having succeeded
      // (e.g. createRepeatOrder's new project id feeding createWorkCard).
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
    setLog((l) => l.filter((e) => e.id !== entryId));
  };

  // AI Agent redesign (see chat) — "New Chat" resets only the AI panel's
  // own state (aiChat/aiMessages/aiPending/pendingFiles/aiInstruction).
  // Classic mode's log/convo are a separate, independent state machine
  // (see the header comment at the top of this file) and are
  // deliberately left untouched — a debug-mode conversation isn't part
  // of "the conversation" this button is about.
  const handleNewChat = () => {
    stopSpeaking();
    listenControllerRef.current?.stop();
    setSpeakingEntryId(null);
    setVoiceState("idle");
    setVoiceInterim("");
    setVoiceError(null);
    setAiChat([]);
    setAiMessages([]);
    setAiPending(null);
    setPendingFiles([]);
    setAiInstruction("");
  };

  // AI Agent redesign (see chat) — auto-scroll to the newest message.
  const chatEndRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs on every message/status change to re-scroll to bottom; none of the three are read inside the effect body itself.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [aiChat, aiBusy, aiPending]);

  // Voice (see chat) — a voice-initiated turn sets "processing" right
  // before the request goes out (see handleMicToggle's onEnd); once the
  // turn genuinely completes (aiBusy back to false), leave that state.
  // Runs BEFORE the auto-speak effect below in source order so, within
  // the same render, "processing" resolves to "idle" first and the
  // auto-speak effect can then move it to "speaking" for the new reply —
  // never the reverse.
  useEffect(() => {
    if (!aiBusy && voiceState === "processing") setVoiceState("idle");
  }, [aiBusy, voiceState]);

  // Voice (see chat) — Auto-Speak Responses: reads every NEW assistant
  // message with real text aloud automatically, regardless of whether
  // the turn was typed or spoken — the setting is a general "read replies
  // to me" preference, not limited to voice-initiated turns. Never fires
  // for the empty placeholder message that carries a pending-confirmation
  // card (entry.text is "" there — see applyAiTurnResult) since there is
  // nothing genuine to read yet.
  // Starts at the CURRENT length, not 0 — aiChat is lifted to App.tsx and
  // survives this component unmounting (navigating away and back), so a
  // fresh 0 here would replay the entire prior conversation's audio on
  // every remount instead of only ever-new messages.
  const lastSpokenIndexRef = useRef(aiChat.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: handleSpeak is intentionally excluded — it's redefined every render but only reads state via closure at call time, and including it would re-run this effect on every keystroke-driven re-render for no reason.
  useEffect(() => {
    if (
      !settings.autoSpeakResponses ||
      !settings.voiceEnabled ||
      !ttsSupported
    ) {
      lastSpokenIndexRef.current = aiChat.length;
      return;
    }
    for (let i = lastSpokenIndexRef.current; i < aiChat.length; i++) {
      const entry = aiChat[i];
      if (entry.role === "agent" && entry.text.trim() && !entry.pendingCalls) {
        handleSpeak(entry.id, entry.text);
      }
    }
    lastSpokenIndexRef.current = aiChat.length;
  }, [
    aiChat,
    settings.autoSpeakResponses,
    settings.voiceEnabled,
    ttsSupported,
  ]);

  // Voice (see chat) — stop any recognition/playback in flight if the
  // user navigates away from this page entirely (component unmount),
  // rather than leaving the microphone or speech synthesis running
  // silently in the background.
  useEffect(() => {
    return () => {
      listenControllerRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  const erpReferenceStore = {
    projects,
    customers,
    employees,
    vendors,
    invoices,
    jobCards,
    inventoryItems,
  };

  // AI Agent redesign (see chat) — requirement #3's exact suggested
  // prompts. Generic, real ERP questions (not tied to any specific
  // seeded record name), so they work identically on any organization's
  // real data — each one actually runs the same runAgentTurn() path a
  // typed question would.
  const SUGGESTED_PROMPTS = [
    "What's the status of all active projects?",
    "Which projects are at risk?",
    "What inventory needs attention?",
    "Show me unpaid invoices.",
    "Who is working on the current production jobs?",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-11rem)] min-h-[520px]">
      {/* Conversation header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border mb-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary shrink-0">
            <Bot className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate">{assistantName}</h1>
            <p className="text-xs text-muted-foreground truncate">
              Your AI coworker for FabFlow ERP
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {voiceUiEnabled && !voiceMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVoiceMode(true)}
              disabled={aiBusy || Boolean(aiPending)}
              data-ocid="agent.voice_mode.enter_button"
            >
              <PhoneCall className="w-3.5 h-3.5 mr-1.5" />
              Voice
            </Button>
          )}
          {aiChat.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              disabled={aiBusy || Boolean(aiPending)}
              data-ocid="agent.new_chat.button"
            >
              <SquarePen className="w-3.5 h-3.5 mr-1.5" />
              New Chat
            </Button>
          )}
        </div>
      </div>

      {/* Voice Conversation mode (see chat, requirement #7B) — the SAME
          conversation/confirmation state, presented full-focus. Exiting
          returns to the normal view below without losing anything. */}
      {voiceMode ? (
        <div className="flex-1 overflow-y-auto" data-ocid="agent.conversation">
          <VoiceConversationOverlay
            assistantName={assistantName}
            voiceState={voiceState}
            interimText={voiceInterim}
            lastAssistantText={(() => {
              const last = [...aiChat]
                .reverse()
                .find((e) => e.role === "agent" && e.text.trim());
              return last ? stripForSpeech(last.text) : null;
            })()}
            error={voiceError}
            micSupported={sttSupported}
            onMicToggle={handleMicToggle}
            onEnd={handleEndVoiceMode}
            pendingConfirm={
              aiPending
                ? {
                    lines: aiPending.pendingCalls.map((c) => {
                      const { label, detail } = describePendingCall(c);
                      return detail ? `${label} — ${detail}` : label;
                    }),
                    onConfirm: () => void handleAiConfirm(true),
                    onCancel: () => void handleAiConfirm(false),
                    busy: aiBusy,
                    disabled: Boolean(unsignedCall),
                  }
                : null
            }
          />
        </div>
      ) : (
        /* Conversation body */
        <div className="flex-1 overflow-y-auto" data-ocid="agent.conversation">
          <div className="max-w-2xl mx-auto px-1 pb-2">
            {aiChat.length === 0 ? (
              <div className="flex flex-col items-center text-center py-10 px-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/15 text-primary mb-4">
                  <Bot className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-semibold mb-1">{assistantName}</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  Your AI coworker for FabFlow ERP.
                </p>
                <p className="text-sm text-muted-foreground max-w-md mb-6 italic">
                  "Ask me about your projects, production, inventory, vendors,
                  invoices, employees, quality, or anything else in your ERP.
                  Questions are answered right away; anything that would change
                  your data is shown to you before it happens."
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void handleAiSubmit(prompt)}
                      disabled={aiBusy}
                      className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      data-ocid="agent.suggested_prompt"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5 py-2">
                {aiChat.map((entry) => (
                  <div
                    key={entry.id}
                    className={
                      entry.role === "user"
                        ? "flex justify-end"
                        : "flex items-start gap-2.5"
                    }
                  >
                    {entry.role !== "user" && (
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div
                      className={
                        entry.role === "user"
                          ? "max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm whitespace-pre-wrap"
                          : entry.role === "error"
                            ? "max-w-[85%] rounded-lg bg-destructive/10 text-destructive border border-destructive/20 px-3 py-2 text-sm"
                            : "min-w-0 flex-1 text-sm"
                      }
                    >
                      {entry.confirmedAction && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-success mb-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Action completed
                        </div>
                      )}
                      {entry.role === "agent" ? (
                        <>
                          <AgentMarkdown
                            text={entry.text}
                            store={erpReferenceStore}
                            onNavigate={onNavigate}
                            onNavigateToRecord={onNavigateToRecord}
                          />
                          {voiceUiEnabled &&
                            ttsSupported &&
                            entry.text.trim() && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleSpeak(entry.id, entry.text)
                                }
                                className="inline-flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                aria-label={
                                  speakingEntryId === entry.id
                                    ? "Stop reading this reply aloud"
                                    : "Read this reply aloud"
                                }
                                data-ocid="agent.message.speak_button"
                              >
                                {speakingEntryId === entry.id ? (
                                  <>
                                    <Square className="w-3 h-3" /> Stop
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="w-3 h-3" /> Listen
                                  </>
                                )}
                              </button>
                            )}
                        </>
                      ) : (
                        <span>{renderMessageText(entry.text)}</span>
                      )}
                      {/* AI Agent redesign (see chat) — the pending-write
                        proposal, shown directly (not hidden behind a
                        collapsed <details>), naming the affected entity
                        and action clearly. Confirm/Cancel live attached to
                        THIS specific proposal (reference-equality against
                        the live aiPending, since a resolved proposal
                        stays in history without live buttons on it). */}
                      {entry.pendingCalls && (
                        <div className="mt-1 rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            AI is suggesting {entry.pendingCalls.length} change
                            {entry.pendingCalls.length === 1 ? "" : "s"} —
                            nothing has been done yet
                          </div>
                          <div className="space-y-1.5 text-sm">
                            {entry.pendingCalls.map((c, i) => {
                              const { label, detail } = describePendingCall(c);
                              return (
                                <div
                                  key={`${c.toolUseId}-${i}`}
                                  className="flex gap-1.5"
                                >
                                  <span className="text-warning font-medium shrink-0">
                                    {i + 1}.
                                  </span>
                                  <span>
                                    <span className="font-medium">{label}</span>
                                    {detail ? ` — ${detail}` : ""}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {aiPending?.pendingCalls === entry.pendingCalls && (
                            <div className="flex gap-2 pt-0.5">
                              <Button
                                size="sm"
                                onClick={() => handleAiConfirm(true)}
                                disabled={aiBusy || Boolean(unsignedCall)}
                                title={
                                  unsignedCall
                                    ? "Capture the required signature first"
                                    : undefined
                                }
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleAiConfirm(false)}
                                disabled={aiBusy}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {aiBusy && !aiPending && (
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary shrink-0">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Checking FabFlow…
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Composer + confirmation area */}
      <div className="max-w-2xl w-full mx-auto shrink-0 pt-3">
        {aiPending && unsignedCall && (
          <SignaturePad
            open
            onClose={() => handleAiConfirm(false)}
            onSave={handleSignatureSave}
            employeeName={
              useStore
                .getState()
                .employees.find((e) => e.id === unsignedCall.input.employeeId)
                ?.name ?? "Employee"
            }
            amount={Number(unsignedCall.input.amount) || 0}
            date={
              (unsignedCall.input.date as string) ||
              new Date().toISOString().slice(0, 10)
            }
          />
        )}

        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingFiles.map((pf) => (
              <div
                key={pf.id}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border ${
                  pf.rejected
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-border bg-muted/50"
                }`}
              >
                <span>
                  {pf.file.name} ({(pf.file.size / 1024).toFixed(0)}KB)
                  {pf.rejected ? ` — ${pf.rejected}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => removePendingFile(pf.id)}
                  aria-label={`Remove ${pf.file.name}`}
                  className="hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {voiceUiEnabled && voiceState !== "idle" && !voiceMode && (
          <div
            className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5"
            aria-live="polite"
          >
            {voiceState === "listening" && (
              <>
                <Mic className="w-3 h-3 text-primary" /> Listening…
              </>
            )}
            {voiceState === "processing" && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
              </>
            )}
            {voiceState === "speaking" && (
              <>
                <Volume2 className="w-3 h-3 text-success" /> Speaking…
              </>
            )}
          </div>
        )}
        {voiceError && (
          <p className="text-xs text-destructive mb-1.5">{voiceError}</p>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-xs focus-within:ring-2 focus-within:ring-ring/50">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={Array.from(ALLOWED_AGENT_MIME_TYPES).join(",")}
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={() => fileInputRef.current?.click()}
            disabled={aiBusy || Boolean(aiPending)}
            title={`Attach a PDF, JPG, or PNG (up to ${MAX_AGENT_FILE_BYTES / (1024 * 1024)}MB each)`}
            aria-label="Attach a file"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          {voiceUiEnabled && sttSupported && (
            <Button
              type="button"
              variant={voiceState === "listening" ? "default" : "ghost"}
              size="icon"
              className="shrink-0 h-9 w-9"
              onClick={handleMicToggle}
              disabled={aiBusy || Boolean(aiPending)}
              title={
                voiceState === "listening"
                  ? "Stop listening"
                  : `Talk to ${assistantName}`
              }
              aria-label={
                voiceState === "listening" ? "Stop listening" : "Start talking"
              }
              data-ocid="agent.composer.mic_button"
            >
              {voiceState === "listening" ? (
                <Square className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>
          )}
          <Textarea
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleAiSubmit();
              }
            }}
            placeholder={
              voiceState === "listening"
                ? "Listening…"
                : `Message ${assistantName}…`
            }
            disabled={aiBusy || Boolean(aiPending)}
            rows={1}
            className="min-h-9 max-h-48 overflow-y-auto resize-none border-0 shadow-none focus-visible:ring-0 px-1.5 py-1.5"
            data-ocid="agent.composer.input"
          />
          <Button
            size="icon"
            className="shrink-0 h-9 w-9 rounded-full"
            onClick={() => void handleAiSubmit()}
            disabled={
              aiBusy ||
              Boolean(aiPending) ||
              (!aiInstruction.trim() &&
                pendingFiles.filter((f) => !f.rejected).length === 0)
            }
            aria-label="Send message"
            data-ocid="agent.composer.send_button"
          >
            {aiBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setShowClassic((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2.5 mb-1"
          data-ocid="agent.classic_toggle"
        >
          {showClassic ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          Advanced / debugging view
        </button>

        {showClassic && (
          <div className="border-t border-border pt-3 mt-1 max-h-72 overflow-y-auto">
            <p className="text-xs text-muted-foreground mb-3">
              Deterministic pattern matching, not the LLM — useful for testing a
              specific tool call directly. Reads (status/who/ how-much
              questions) answer immediately; anything that changes data shows
              "Agent wants to perform..." and waits for your confirmation.
            </p>

            <div className="mb-4">
              <Label htmlFor="agent-project-ctx" className="text-xs">
                Current project (optional context)
              </Label>
              <Select
                value={projectContextId}
                onValueChange={setProjectContextId}
              >
                <SelectTrigger
                  id="agent-project-ctx"
                  className="h-8 text-sm mt-1"
                >
                  <SelectValue placeholder="None selected" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {`${p.customerVisibleName || p.projectName} (${p.projectNo})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Overrides the conversation's own tracked project. The Agent also
                picks up "it"/"that order"/"him"/"her" automatically from what
                you were just talking about — see the facts strip below.
              </p>
              {(convo.currentCustomerId ||
                convo.currentProjectId ||
                convo.currentEmployeeId) && (
                <p className="text-xs text-muted-foreground mt-1">
                  Talking about: {convo.currentCustomerId && "a customer "}
                  {convo.currentProjectId && "an order "}
                  {convo.currentEmployeeId && "an employee "}
                  (resolved from recent turns).
                </p>
              )}
            </div>

            <div className="flex gap-2 mb-5">
              <Input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSubmit();
                }}
                placeholder='e.g. "What is the status of Big Electronics?"'
                disabled={busy}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                onClick={() => void handleSubmit()}
                disabled={busy || !instruction.trim()}
              >
                Send
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {log.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Try: "Create ABC Industries.", then "Create the Metal Rods
                  project for ABC Industries.", then "What is the status of ABC
                  Industries?", then a follow-up like "Who is working on it?"
                </p>
              )}
              {log.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="text-xs font-semibold mb-1.5">
                    You: {entry.instruction}
                  </div>

                  {entry.answerText && (
                    <div className="text-xs">{entry.answerText}</div>
                  )}

                  {entry.intent.kind === "unrecognized" && (
                    <div className="text-xs text-warning">
                      {entry.intent.reason}
                    </div>
                  )}

                  {entry.intent.kind === "clarify" && (
                    <div className="text-xs">
                      <div>{entry.intent.question}</div>
                      {entry.intent.options && (
                        <ul className="mt-1 pl-4 list-disc">
                          {entry.intent.options.map((o) => (
                            <li key={o}>{o}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {(entry.intent.kind === "action" ||
                    entry.intent.kind === "plan") && (
                    <div>
                      {entry.status === "pending" && (
                        <div className="rounded-md bg-muted/50 p-2 text-xs font-mono mb-2 space-y-1">
                          <div className="font-semibold">
                            Agent wants to perform:
                          </div>
                          {(entry.intent.kind === "action"
                            ? [
                                {
                                  actionName: entry.intent.actionName,
                                  params: entry.intent.params,
                                },
                              ]
                            : entry.intent.steps
                          ).map((step, i) => (
                            <div key={`${step.actionName}-${i}`}>
                              {i + 1}. {step.actionName}(
                              {JSON.stringify(step.params)})
                              <div className="text-muted-foreground">
                                {AGENT_ACTIONS[step.actionName]?.description}
                                {" — permission: "}
                                {AGENT_ACTIONS[step.actionName]?.permission}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {entry.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleConfirm(entry.id)}
                            disabled={busy}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleCancel(entry.id)}
                            disabled={busy}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}

                      {entry.status === "done" && entry.results && (
                        <div className="flex flex-col gap-1">
                          {entry.results.map((r, i) => (
                            <div
                              key={`${r.actionName}-${i}`}
                              className={`text-xs ${r.ok ? "text-success" : "text-destructive"}`}
                            >
                              {r.ok ? "✓" : "✗"} {r.actionName}: {r.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
