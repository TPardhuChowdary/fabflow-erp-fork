// Agent audit trail — reuses the existing security_audit_log table and its
// log_security_event(event_type, target_user_id, metadata) RPC (see
// database/phase-01/phase1_auth_permissions_rls_v5_FINAL.sql) rather than
// creating a parallel audit system. Every Agent action call — proposed,
// confirmed, executed, blocked, or failed — is logged as a
// self-event (target_user_id = the acting user's own id), which the
// function's own contract already allows unconditionally.
//
// Read access to this trail already exists too: Settings/wherever the app
// eventually renders security_audit_log is gated on
// has_permission('audit_log','view') — nothing new to build there.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export type AgentAuditStage =
  | "proposed"
  | "confirmed"
  | "executed"
  | "blocked"
  | "failed";

export interface AgentAuditEntry {
  stage: AgentAuditStage;
  instruction: string;
  actionName: string;
  params: Record<string, unknown>;
  result?: string;
}

/** Fire-and-forget by design (same pattern the rest of the app uses for
 * activity logging): a failure to WRITE the audit row must never block or
 * roll back the underlying ERP action itself, and never fabricates a
 * success the caller would branch on. Logs a console warning on failure
 * so a broken audit path is still visible during development. */
export async function logAgentEvent(
  userId: string,
  entry: AgentAuditEntry,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const client = getSupabase();
    const { error } = await client.rpc("log_security_event", {
      p_event_type: `agent_action_${entry.stage}`,
      p_target_user_id: userId,
      p_metadata: {
        instruction: entry.instruction,
        action: entry.actionName,
        params: entry.params,
        result: entry.result ?? null,
      },
    });
    if (error) console.warn("Agent audit log failed:", error.message);
  } catch (err) {
    console.warn("Agent audit log failed:", err);
  }
}
