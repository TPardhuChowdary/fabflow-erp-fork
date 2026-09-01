// Style Lab — one login screen shape, rendered through each style's own
// primitives — the technique differences (emboss/extrude/blur/puff/raw/
// sheen/elevation) already make these visually distinct without needing
// a separate layout archetype per style, since this lab's whole point is
// the rendering technique, not information architecture.
import { AlertCircle, Eye, EyeOff, Factory, Loader2 } from "lucide-react";
import { useState } from "react";
import { Btn, Card, inputStyle } from "./primitives";
import type { StyleDef } from "./styles";

export function LoginScreen({ t }: { t: StyleDef }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const submit = () => {
    setStatus("loading");
    window.setTimeout(
      () => setStatus(password === "demo" ? "idle" : "error"),
      900,
    );
  };

  return (
    <div
      className="min-h-[480px] flex items-center justify-center p-8"
      style={{ background: t.pageBg, borderRadius: t.radius }}
    >
      <Card t={t} className="w-full max-w-sm p-6">
        <div className="flex flex-col items-center text-center mb-5">
          <div
            className="w-10 h-10 flex items-center justify-center mb-3"
            style={{
              borderRadius: t.radius === "0px" ? "4px" : t.radius,
              background: t.accent,
              color: t.accentText,
            }}
          >
            <Factory className="w-5 h-5" />
          </div>
          <h1
            style={{
              fontFamily: t.fontDisplay,
              fontWeight: t.fontWeightDisplay,
              fontSize: "20px",
              color: t.text,
              textTransform: t.technique === "brutalist" ? "uppercase" : "none",
            }}
          >
            {t.technique === "brutalist" ? "AUTHENTICATE" : "Sign in"}
          </h1>
          <p className="text-xs mt-1" style={{ color: t.textMuted }}>
            {t.name} — FabFlow ERP
          </p>
        </div>
        {status === "error" && (
          <div
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 mb-3"
            style={{
              borderRadius: t.radius === "0px" ? "4px" : "8px",
              background: `${t.danger}18`,
              color: t.danger,
            }}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Incorrect username
            or password. Try again.
          </div>
        )}
        <div className="space-y-2.5">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full text-sm px-3 py-2.5 outline-none"
            style={inputStyle(t)}
          />
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (try: demo)"
              className="w-full text-sm px-3 py-2.5 pr-9 outline-none"
              style={inputStyle(t)}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? (
                <EyeOff className="w-4 h-4" style={{ color: t.textMuted }} />
              ) : (
                <Eye className="w-4 h-4" style={{ color: t.textMuted }} />
              )}
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="text-xs font-medium"
              style={{ color: t.accent }}
            >
              Forgot password?
            </button>
          </div>
          <Btn t={t} full onClick={submit} disabled={status === "loading"}>
            {status === "loading" ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
              </span>
            ) : (
              "Sign in"
            )}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
