// Priority 1 — blocks the rest of the app until a user created with a
// temporary password (profiles.must_change_password, set true by
// supabase/functions/admin-create-user) sets their own. Mirrors
// LoginPage.tsx's visual shape since, like LoginPage, there's no app UI
// behind it yet to overlay as a dialog.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Lock } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../AuthContext";

export function ForcePasswordChangeScreen() {
  const { completePasswordChange, logout, currentUser } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const result = await completePasswordChange(newPassword);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || "Could not change password.");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background"
      data-ocid="force_password_change.page"
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary text-primary-foreground mb-3 shadow-md">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Set a New Password
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Welcome, {currentUser?.username}. Your account was created with a
            temporary password - set your own before continuing.
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  id="new-password"
                  type="password"
                  className="pl-8"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  data-ocid="force_password_change.new_password_input"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type="password"
                  className="pl-8"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  data-ocid="force_password_change.confirm_password_input"
                />
              </div>
            </div>

            {error && (
              <p
                className="text-sm text-destructive"
                data-ocid="force_password_change.error_state"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-ocid="force_password_change.submit_button"
            >
              {loading ? "Saving..." : "Set Password & Continue"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => logout()}
              data-ocid="force_password_change.cancel_button"
            >
              Sign out instead
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
