// UX Redesign Lab — shared login, real idle/loading/error states.
import { AlertCircle, Factory, Loader2 } from "lucide-react";
import { useState } from "react";

export function UxLoginScreen({
  modelName,
  onSuccess,
}: { modelName: string; onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const submit = () => {
    setStatus("loading");
    window.setTimeout(() => {
      if (password === "demo") onSuccess();
      else setStatus("error");
    }, 800);
  };

  return (
    <div className="min-h-[600px] flex items-center justify-center bg-gray-50 rounded-xl">
      <div className="w-full max-w-sm bg-white rounded-xl border p-6 shadow-sm">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-white mb-3">
            <Factory className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Sign in</h1>
          <p className="text-xs text-gray-500 mt-1">
            {modelName} — FabFlow ERP
          </p>
        </div>
        {status === "error" && (
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 mb-3 rounded-lg bg-red-50 text-red-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Incorrect username
            or password. Try again.
          </div>
        )}
        <div className="space-y-2.5">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full text-sm px-3 py-2.5 rounded-lg border outline-none"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password (try: demo)"
            className="w-full text-sm px-3 py-2.5 rounded-lg border outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={status === "loading"}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-lg bg-gray-900 text-white disabled:opacity-60"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
