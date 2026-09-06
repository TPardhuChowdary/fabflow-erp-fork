import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import {
  type RecoveryIdentifier,
  completePasswordRecovery,
  requestPasswordRecovery,
} from "@/lib/accountRecoveryApi";
import { Factory, Lock, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";

// Admin-only self-service password recovery (see chat) — this whole
// sub-flow is deliberately available to anyone on the login screen
// (never gated by anything the frontend knows), because the backend is
// the actual eligibility boundary: password-recovery/index.ts silently
// no-ops for a nonexistent/non-admin/no-verified-recovery-email/-email
// account and returns the exact same generic response either way. This
// UI never tries to guess or reveal eligibility - it just always offers
// the flow and always shows the one generic message afterward,
// regardless of which identifier (username or recovery email) was used.
//
// Single combined input, not a toggle: a FabFlow username can never
// contain "@" (see the username charset in permissions/admin-create-user),
// so "does the typed value contain @" is an unambiguous, zero-cost way
// to classify it client-side before calling the SAME two-shape backend
// request ({username} or {recoveryEmail}) that already existed — no new
// backend behavior, no parallel recovery system.
type Mode = "login" | "recover-request" | "recover-verify";

function classifyRecoveryInput(value: string): RecoveryIdentifier {
  const trimmed = value.trim();
  return trimmed.includes("@")
    ? { type: "recoveryEmail", value: trimmed }
    : { type: "username", value: trimmed };
}

export function LoginPage() {
  const { login, authNotice, clearAuthNotice } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [recoverValue, setRecoverValue] = useState("");
  const [recoverMessage, setRecoverMessage] = useState("");
  const [recoverLoading, setRecoverLoading] = useState(false);
  // The exact identifier the request was made with — carried forward to
  // the complete step so it resolves the same account, independent of
  // whatever's later typed into recoverValue.
  const [activeIdentifier, setActiveIdentifier] =
    useState<RecoveryIdentifier | null>(null);

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [completeError, setCompleteError] = useState("");
  const [completeLoading, setCompleteLoading] = useState(false);
  const [recoveredUsername, setRecoveredUsername] = useState<string | null>(
    null,
  );

  // Show whatever passive-sign-out notice (deactivated account, config
  // error) triggered a bounce back to this screen exactly once, then
  // clear it from context so it doesn't reappear on a later remount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once
  useEffect(() => {
    return () => clearAuthNotice();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(username.trim(), password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || "Invalid username or password.");
    }
  };

  const resetRecoveryState = () => {
    setRecoverValue("");
    setRecoverMessage("");
    setActiveIdentifier(null);
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setCompleteError("");
    setRecoveredUsername(null);
  };

  const backToLogin = () => {
    resetRecoveryState();
    setMode("login");
  };

  const handleRequestRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoverLoading(true);
    setRecoverMessage("");
    const identifier = classifyRecoveryInput(recoverValue);
    const result = await requestPasswordRecovery(identifier);
    setRecoverLoading(false);
    setActiveIdentifier(identifier);
    // Always the same generic message, success or not — the backend is
    // the eligibility boundary, not this screen.
    setRecoverMessage(
      result.data?.message ||
        "If that account exists and is eligible for self-service recovery, a code has been sent to its registered recovery email.",
    );
    setMode("recover-verify");
  };

  const handleCompleteRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompleteError("");
    if (!activeIdentifier) return;
    if (newPassword.length < 8) {
      setCompleteError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setCompleteError("Passwords do not match.");
      return;
    }
    setCompleteLoading(true);
    const result = await completePasswordRecovery(
      activeIdentifier,
      code.trim(),
      newPassword,
    );
    setCompleteLoading(false);
    if (result.status !== "success") {
      setCompleteError(result.error || "Invalid or expired code.");
      return;
    }
    setRecoveredUsername(result.data?.username ?? null);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background"
      data-ocid="login.page"
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary text-primary-foreground mb-3 shadow-md">
            <Factory className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">FabFlow ERP</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manufacturing Management System
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          {mode === "login" && (
            <>
              <h2 className="text-base font-semibold mb-4">Sign In</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="login-username"
                      className="pl-8"
                      placeholder="Enter username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      data-ocid="login.input"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      className="pl-8"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      data-ocid="login.input"
                    />
                  </div>
                </div>

                {(error || authNotice) && (
                  <p
                    className="text-sm text-destructive"
                    data-ocid="login.error_state"
                  >
                    {error || authNotice}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                  data-ocid="login.submit_button"
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>

                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setMode("recover-request")}
                  data-ocid="login.forgot_password_link"
                >
                  Forgot password?
                </button>
              </form>
            </>
          )}

          {mode === "recover-request" && (
            <>
              <h2 className="text-base font-semibold mb-1">
                Recover your account
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Self-service recovery is available for administrator accounts
                with a verified recovery email.
              </p>
              <form onSubmit={handleRequestRecovery} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="relative">
                    <User className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="recover-value"
                      className="pl-8"
                      type="text"
                      placeholder="Username / Recovery email"
                      aria-label="Username or recovery email"
                      value={recoverValue}
                      onChange={(e) => setRecoverValue(e.target.value)}
                      autoComplete="username"
                      data-ocid="login.recover.value_input"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={recoverLoading || !recoverValue.trim()}
                  data-ocid="login.recover.request_button"
                >
                  {recoverLoading ? "Sending..." : "Send recovery code"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={backToLogin}
                  data-ocid="login.recover.back_button"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {mode === "recover-verify" &&
            (recoveredUsername ? (
              <div className="text-center space-y-4">
                <h2 className="text-base font-semibold">Password updated</h2>
                <p className="text-sm text-muted-foreground">
                  Recovered account:{" "}
                  <span
                    className="font-medium text-foreground"
                    data-ocid="login.recover.recovered_username"
                  >
                    {recoveredUsername}
                  </span>
                  <br />
                  Sign in with your new password using this username.
                </p>
                <Button
                  className="w-full"
                  onClick={backToLogin}
                  data-ocid="login.recover.done_button"
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <>
                <h2 className="text-base font-semibold mb-1">
                  Enter recovery code
                </h2>
                <p
                  className="text-xs text-muted-foreground mb-4"
                  data-ocid="login.recover.generic_message"
                >
                  {recoverMessage}
                </p>
                <form onSubmit={handleCompleteRecovery} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>6-digit code</Label>
                    <InputOTP
                      maxLength={6}
                      value={code}
                      onChange={setCode}
                      data-ocid="login.recover.code_input"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="recover-new-password">New password</Label>
                    <Input
                      id="recover-new-password"
                      type="password"
                      placeholder="At least 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      data-ocid="login.recover.new_password_input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="recover-confirm-password">
                      Confirm password
                    </Label>
                    <Input
                      id="recover-confirm-password"
                      type="password"
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      data-ocid="login.recover.confirm_password_input"
                    />
                  </div>

                  {completeError && (
                    <p
                      className="text-sm text-destructive"
                      data-ocid="login.recover.error_state"
                    >
                      {completeError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={completeLoading || code.length !== 6}
                    data-ocid="login.recover.complete_button"
                  >
                    {completeLoading ? "Resetting..." : "Reset password"}
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={backToLogin}
                    data-ocid="login.recover.cancel_button"
                  >
                    Back to sign in
                  </button>
                </form>
              </>
            ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} FabFlow ERP. All rights reserved.
        </p>
      </div>
    </div>
  );
}
