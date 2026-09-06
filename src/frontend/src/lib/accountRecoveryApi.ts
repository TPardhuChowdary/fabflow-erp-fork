// Admin-only self-service password recovery — thin client wrappers.
// Same WriteResult<T> contract and FunctionsHttpError-unwrapping pattern
// as resetUserPassword in settingsUsersApi.ts.

import type { WriteResult } from "@/lib/settingsUsersApi";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

function unauth<T>(): WriteResult<T> {
  return { status: "unauthenticated", error: "Not signed in." };
}

export interface RecoveryEmailStatus {
  recoveryEmail: string | null;
  recoveryEmailVerifiedAt: string | null;
  recoveryEmailPending: string | null;
}

/** Self-read only — profiles' own RLS already lets any signed-in user
 * read their own row, the same carve-out fetchMyRbacProfile relies on. */
export async function getMyRecoveryEmailStatus(
  userId: string,
): Promise<WriteResult<RecoveryEmailStatus>> {
  if (!isSupabaseConfigured) return unauth();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "recovery_email, recovery_email_verified_at, recovery_email_pending",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!data) return { status: "error", error: "Profile not found." };
  return {
    status: "success",
    data: {
      recoveryEmail: data.recovery_email,
      recoveryEmailVerifiedAt: data.recovery_email_verified_at,
      recoveryEmailPending: data.recovery_email_pending,
    },
  };
}

async function invoke<T extends { success?: boolean; error?: string }>(
  fn: string,
  body: Record<string, unknown>,
): Promise<WriteResult<T>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke<T>(fn, { body });

  if (error) {
    const context = (
      error as { context?: { json?: () => Promise<{ error?: string }> } }
    ).context;
    if (context?.json) {
      try {
        const errBody = await context.json();
        return { status: "error", error: errBody.error || error.message };
      } catch {
        // fall through
      }
    }
    return { status: "error", error: error.message };
  }
  if (!data || !data.success) {
    return { status: "error", error: data?.error || "Unknown error." };
  }
  return { status: "success", data };
}

/** Authenticated — the caller sets their OWN recovery email. Server
 * re-verifies the caller is an administrator; a non-admin session gets a
 * 403 from the function itself, not just a hidden UI control. */
export async function requestRecoveryEmailVerification(
  newRecoveryEmail: string,
): Promise<WriteResult<{ success: true }>> {
  if (!isSupabaseConfigured) return unauth();
  return invoke("recovery-email-setup", {
    action: "request",
    newRecoveryEmail,
  });
}

export async function confirmRecoveryEmail(
  code: string,
): Promise<WriteResult<{ success: true }>> {
  if (!isSupabaseConfigured) return unauth();
  return invoke("recovery-email-setup", { action: "verify", code });
}

/** Either a FabFlow username or a verified recovery email — exactly one,
 * never both. Mirrors password-recovery/index.ts's own Identifier type. */
export type RecoveryIdentifier =
  | { type: "username"; value: string }
  | { type: "recoveryEmail"; value: string };

function identifierBody(
  identifier: RecoveryIdentifier,
): Record<string, unknown> {
  return identifier.type === "username"
    ? { username: identifier.value }
    : { recoveryEmail: identifier.value };
}

/** Public/unauthenticated — the "Forgot password?" flow. Always resolves
 * to a generic success shape regardless of whether the account exists,
 * is an admin, or has a recovery email — that ambiguity is deliberate,
 * not a bug to "fix" by inspecting the response more closely. */
export async function requestPasswordRecovery(
  identifier: RecoveryIdentifier,
): Promise<WriteResult<{ success: true; message: string }>> {
  if (!isSupabaseConfigured) return unauth();
  return invoke("password-recovery", {
    action: "request",
    ...identifierBody(identifier),
  });
}

export async function completePasswordRecovery(
  identifier: RecoveryIdentifier,
  code: string,
  newPassword: string,
): Promise<WriteResult<{ success: true; username: string }>> {
  if (!isSupabaseConfigured) return unauth();
  return invoke("password-recovery", {
    action: "complete",
    ...identifierBody(identifier),
    code,
    newPassword,
  });
}
