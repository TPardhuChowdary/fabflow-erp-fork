import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Factory, Lock, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";

export function LoginPage() {
  const { login, authNotice, clearAuthNotice } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} FabFlow ERP. All rights reserved.
        </p>
      </div>
    </div>
  );
}
