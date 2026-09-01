// Design Lab — one Login screen per design direction.
// 9 structurally distinct archetypes (not 20 reskinned copies of one
// layout) — each concept is assigned the archetype that matches its own
// already-established personality (see loginAssignments.ts). Fully
// isolated: no dependency on the real app's auth, components, or tokens.
import {
  AlertCircle,
  Bot,
  Eye,
  EyeOff,
  Factory,
  Loader2,
  Terminal,
  User,
} from "lucide-react";
import { useState } from "react";
import type { LoginArchetype, LoginAssignment, LoginTheme } from "./loginTheme";

type Status = "idle" | "loading" | "error";

interface Ctx {
  t: LoginTheme;
  a: LoginAssignment;
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPw: boolean;
  setShowPw: (v: boolean) => void;
  status: Status;
  submit: () => void;
}

export function LoginScreen({
  theme,
  assignment,
}: { theme: LoginTheme; assignment: LoginAssignment }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  const submit = () => {
    setStatus("loading");
    window.setTimeout(() => {
      // Demonstrative: any non-empty username with password "demo" succeeds
      // silently (no real session), anything else shows the error state —
      // this evaluates the login INTERACTION, not real authentication.
      setStatus(password === "demo" ? "idle" : "error");
    }, 900);
  };

  const ctx: Ctx = {
    t: theme,
    a: assignment,
    username,
    setUsername,
    password,
    setPassword,
    showPw,
    setShowPw,
    status,
    submit,
  };
  const Archetype = archetypeRegistry[assignment.archetype];
  return <Archetype {...ctx} />;
}

// ── shared small pieces ────────────────────────────────────────────
function FieldGroup({ t, status }: { t: LoginTheme; status: Status }) {
  return status === "error" ? (
    <div
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 mb-2"
      style={{
        borderRadius: t.radiusSm,
        background: `${t.danger}15`,
        color: t.danger,
      }}
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Incorrect username or
      password. Try again.
    </div>
  ) : null;
}

function SubmitBtn({
  t,
  status,
  onClick,
  label = "Sign in",
}: { t: LoginTheme; status: Status; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "loading"}
      className="w-full flex items-center justify-center gap-2 font-semibold text-sm transition-opacity active:scale-[0.98]"
      style={{
        borderRadius: t.radiusSm,
        background: t.accent,
        color: t.accentText,
        padding: "10px 0",
        opacity: status === "loading" ? 0.75 : 1,
        cursor: status === "loading" ? "wait" : "pointer",
        textTransform: t.uppercaseLabels ? "uppercase" : "none",
        letterSpacing: t.uppercaseLabels ? "0.05em" : "0",
      }}
    >
      {status === "loading" ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : null}
      {status === "loading" ? "Signing in…" : label}
    </button>
  );
}

function PwInput({
  t,
  password,
  setPassword,
  showPw,
  setShowPw,
  id,
}: {
  t: LoginTheme;
  password: string;
  setPassword: (v: string) => void;
  showPw: boolean;
  setShowPw: (v: boolean) => void;
  id: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={showPw ? "text" : "password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (try: demo)"
        className="w-full text-sm px-3 py-2.5 pr-9 outline-none"
        style={{
          borderRadius: t.radiusSm,
          border: `${t.borderWidth} solid ${t.border}`,
          background: t.surface,
          color: t.text,
        }}
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
  );
}

function ForgotLink({ t }: { t: LoginTheme }) {
  return (
    <button
      type="button"
      className="text-xs font-medium"
      style={{ color: t.accent }}
    >
      Forgot password?
    </button>
  );
}

// ── archetype 1: split panel ────────────────────────────────────────
function SplitPanel({
  t,
  a,
  username,
  setUsername,
  password,
  setPassword,
  showPw,
  setShowPw,
  status,
  submit,
}: Ctx) {
  return (
    <div
      className="grid md:grid-cols-2 min-h-[520px]"
      style={{
        borderRadius: t.radius,
        overflow: "hidden",
        border: `${t.borderWidth} solid ${t.border}`,
      }}
    >
      <div
        className="p-8 flex flex-col justify-between"
        style={{ background: t.accent, color: t.accentText }}
      >
        <div className="flex items-center gap-2">
          <Factory className="w-5 h-5" />
          <span className="font-bold" style={{ fontFamily: t.fontDisplay }}>
            FabFlow
          </span>
        </div>
        <div>
          <h1
            className="text-2xl font-bold leading-tight"
            style={{
              fontFamily: t.fontDisplay,
              fontWeight: t.fontWeightDisplay,
            }}
          >
            {a.headline}
          </h1>
          <p className="text-sm mt-2 opacity-90">{a.subhead}</p>
        </div>
        <p className="text-xs opacity-70">© 2026 FabFlow ERP</p>
      </div>
      <div
        className="p-8 flex flex-col justify-center gap-3"
        style={{ background: t.surface }}
      >
        <h2 className="text-sm font-bold mb-1" style={{ color: t.text }}>
          Sign in
        </h2>
        <FieldGroup t={t} status={status} />
        <div className="relative">
          <User
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: t.textMuted }}
          />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full text-sm pl-9 pr-3 py-2.5 outline-none"
            style={{
              borderRadius: t.radiusSm,
              border: `${t.borderWidth} solid ${t.border}`,
              background: t.surface,
              color: t.text,
            }}
          />
        </div>
        <PwInput
          t={t}
          password={password}
          setPassword={setPassword}
          showPw={showPw}
          setShowPw={setShowPw}
          id="sp-pw"
        />
        <div className="flex justify-end">
          <ForgotLink t={t} />
        </div>
        <SubmitBtn t={t} status={status} onClick={submit} />
      </div>
    </div>
  );
}

// ── archetype 2: centered card, light ───────────────────────────────
function CenteredCardLight({
  t,
  a,
  username,
  setUsername,
  password,
  setPassword,
  showPw,
  setShowPw,
  status,
  submit,
}: Ctx) {
  return (
    <div
      className="min-h-[520px] flex items-center justify-center p-8"
      style={{
        background: t.pageBg,
        borderRadius: t.radius,
        border: `${t.borderWidth} solid ${t.border}`,
      }}
    >
      <div
        className="w-full max-w-sm p-6"
        style={{
          background: t.surface,
          borderRadius: t.radius,
          border: `${t.borderWidth} solid ${t.border}`,
          boxShadow: t.shadow,
        }}
      >
        <div className="flex flex-col items-center text-center mb-5">
          <div
            className="w-10 h-10 flex items-center justify-center mb-3"
            style={{
              borderRadius: t.radiusSm,
              background: t.accent,
              color: t.accentText,
            }}
          >
            <Factory className="w-5 h-5" />
          </div>
          <h1
            className="text-lg font-bold"
            style={{ fontFamily: t.fontDisplay, color: t.text }}
          >
            {a.headline}
          </h1>
          <p className="text-xs mt-1" style={{ color: t.textMuted }}>
            {a.subhead}
          </p>
        </div>
        <FieldGroup t={t} status={status} />
        <div className="space-y-2.5">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full text-sm px-3 py-2.5 outline-none"
            style={{
              borderRadius: t.radiusSm,
              border: `${t.borderWidth} solid ${t.border}`,
              background: t.surface,
              color: t.text,
            }}
          />
          <PwInput
            t={t}
            password={password}
            setPassword={setPassword}
            showPw={showPw}
            setShowPw={setShowPw}
            id="cc-pw"
          />
          <div className="flex justify-end">
            <ForgotLink t={t} />
          </div>
          <SubmitBtn t={t} status={status} onClick={submit} />
        </div>
      </div>
    </div>
  );
}

// ── archetype 3: centered card, dark ────────────────────────────────
function CenteredCardDark({
  t,
  a,
  username,
  setUsername,
  password,
  setPassword,
  showPw,
  setShowPw,
  status,
  submit,
}: Ctx) {
  return (
    <div
      className="min-h-[520px] flex items-center justify-center p-8 relative overflow-hidden"
      style={{
        background: t.pageBg,
        borderRadius: t.radius,
        border: `${t.borderWidth} solid ${t.border}`,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${t.accent}22, transparent 60%)`,
        }}
      />
      <div
        className="w-full max-w-sm p-6 relative"
        style={{
          background: t.surface,
          borderRadius: t.radius,
          border: `${t.borderWidth} solid ${t.border}`,
          boxShadow: t.shadow || "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex items-center gap-2 mb-5">
          <div
            className="w-8 h-8 flex items-center justify-center"
            style={{
              borderRadius: t.radiusSm,
              background: t.accent,
              color: t.accentText,
            }}
          >
            <Factory className="w-4 h-4" />
          </div>
          <span
            className="font-bold text-sm"
            style={{ color: t.text, fontFamily: t.fontDisplay }}
          >
            FabFlow
          </span>
        </div>
        <h1 className="text-base font-bold" style={{ color: t.text }}>
          {a.headline}
        </h1>
        <p className="text-xs mt-1 mb-4" style={{ color: t.textMuted }}>
          {a.subhead}
        </p>
        <FieldGroup t={t} status={status} />
        <div className="space-y-2.5">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full text-sm px-3 py-2.5 outline-none"
            style={{
              borderRadius: t.radiusSm,
              border: `${t.borderWidth} solid ${t.border}`,
              background: t.surfaceAlt,
              color: t.text,
            }}
          />
          <PwInput
            t={t}
            password={password}
            setPassword={setPassword}
            showPw={showPw}
            setShowPw={setShowPw}
            id="cd-pw"
          />
          <div className="flex justify-end">
            <ForgotLink t={t} />
          </div>
          <SubmitBtn t={t} status={status} onClick={submit} />
        </div>
      </div>
    </div>
  );
}

// ── archetype 4: command terminal ───────────────────────────────────
function CommandTerminal({
  t,
  a,
  username,
  setUsername,
  password,
  setPassword,
  status,
  submit,
}: Ctx) {
  return (
    <div
      className="min-h-[520px] flex items-center justify-center p-8"
      style={{
        background: t.pageBg,
        borderRadius: t.radius,
        border: `${t.borderWidth} solid ${t.border}`,
      }}
    >
      <div
        className="w-full max-w-md p-5"
        style={{
          background: t.surface,
          border: `${t.borderWidth} solid ${t.border}`,
          borderRadius: t.radius,
          fontFamily: t.fontBody,
        }}
      >
        <div
          className="flex items-center gap-2 mb-3"
          style={{ color: t.textMuted }}
        >
          <Terminal className="w-4 h-4" />{" "}
          <span className="text-xs">{a.subhead}</span>
        </div>
        <p
          className="text-lg font-bold mb-4"
          style={{
            color: t.text,
            letterSpacing: t.uppercaseLabels ? "0.05em" : "0",
          }}
        >
          {a.headline}
        </p>
        <FieldGroup t={t} status={status} />
        <div className="space-y-2">
          <label
            className="block text-[10px] font-bold uppercase"
            htmlFor="ct-user"
            style={{ color: t.textMuted }}
          >
            username
          </label>
          <input
            id="ct-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="operator_id"
            className="w-full text-sm px-3 py-2 outline-none"
            style={{
              borderRadius: t.radiusSm,
              border: `${t.borderWidth} solid ${t.border}`,
              background: t.surfaceAlt,
              color: t.text,
            }}
          />
          <label
            className="block text-[10px] font-bold uppercase"
            htmlFor="ct-pw"
            style={{ color: t.textMuted }}
          >
            password
          </label>
          <input
            id="ct-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full text-sm px-3 py-2 outline-none"
            style={{
              borderRadius: t.radiusSm,
              border: `${t.borderWidth} solid ${t.border}`,
              background: t.surfaceAlt,
              color: t.text,
            }}
          />
        </div>
        <div className="flex justify-end mt-1">
          <ForgotLink t={t} />
        </div>
        <div className="mt-3">
          <SubmitBtn
            t={t}
            status={status}
            onClick={submit}
            label="> AUTHENTICATE"
          />
        </div>
      </div>
    </div>
  );
}

// ── archetype 5: hero narrative ─────────────────────────────────────
function HeroNarrative({
  t,
  a,
  username,
  setUsername,
  password,
  setPassword,
  showPw,
  setShowPw,
  status,
  submit,
}: Ctx) {
  return (
    <div
      className="min-h-[520px] flex flex-col justify-center p-10"
      style={{
        background: t.pageBg,
        borderRadius: t.radius,
        border: `${t.borderWidth} solid ${t.border}`,
      }}
    >
      <p className="text-xs font-semibold mb-3" style={{ color: t.accent }}>
        FABFLOW ERP
      </p>
      <h1
        className="max-w-lg leading-tight mb-8"
        style={{
          fontFamily: t.fontDisplay,
          fontWeight: t.fontWeightDisplay,
          fontSize: "32px",
          color: t.text,
        }}
      >
        {a.headline}
      </h1>
      <div className="max-w-xs">
        <p className="text-xs mb-3" style={{ color: t.textMuted }}>
          {a.subhead}
        </p>
        <FieldGroup t={t} status={status} />
        <div className="space-y-2.5">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full text-sm px-3 py-2.5 outline-none border-0 border-b"
            style={{
              borderColor: t.border,
              background: "transparent",
              color: t.text,
            }}
          />
          <PwInput
            t={t}
            password={password}
            setPassword={setPassword}
            showPw={showPw}
            setShowPw={setShowPw}
            id="hn-pw"
          />
          <div className="flex justify-end">
            <ForgotLink t={t} />
          </div>
          <SubmitBtn t={t} status={status} onClick={submit} />
        </div>
      </div>
    </div>
  );
}

// ── archetype 6: conversational ─────────────────────────────────────
function Conversational({
  t,
  a,
  username,
  setUsername,
  password,
  setPassword,
  showPw,
  setShowPw,
  status,
  submit,
}: Ctx) {
  return (
    <div
      className="min-h-[520px] flex items-center justify-center p-8"
      style={{
        background: t.pageBg,
        borderRadius: t.radius,
        border: `${t.borderWidth} solid ${t.border}`,
      }}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-start gap-2.5 mb-4">
          <div
            className="w-8 h-8 flex items-center justify-center shrink-0"
            style={{
              borderRadius: t.radiusPill,
              background: t.accent,
              color: t.accentText,
            }}
          >
            <Bot className="w-4 h-4" />
          </div>
          <div
            className="px-3.5 py-2.5"
            style={{
              borderRadius: t.radius,
              background: t.surface,
              border: `${t.borderWidth} solid ${t.border}`,
            }}
          >
            <p className="text-sm" style={{ color: t.text }}>
              {a.headline}
            </p>
            <p className="text-xs mt-1" style={{ color: t.textMuted }}>
              {a.subhead}
            </p>
          </div>
        </div>
        <FieldGroup t={t} status={status} />
        <div className="ml-10 space-y-2.5">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full text-sm px-3 py-2.5 outline-none"
            style={{
              borderRadius: t.radius,
              border: `${t.borderWidth} solid ${t.border}`,
              background: t.surface,
              color: t.text,
            }}
          />
          <PwInput
            t={t}
            password={password}
            setPassword={setPassword}
            showPw={showPw}
            setShowPw={setShowPw}
            id="cv-pw"
          />
          <div className="flex justify-end">
            <ForgotLink t={t} />
          </div>
          <SubmitBtn t={t} status={status} onClick={submit} label="Reply" />
        </div>
      </div>
    </div>
  );
}

// ── archetype 7: factory floor ──────────────────────────────────────
function FactoryFloor({
  t,
  a,
  username,
  setUsername,
  password,
  setPassword,
  status,
  submit,
}: Ctx) {
  return (
    <div
      className="min-h-[520px] flex items-center justify-center p-8"
      style={{
        background: t.pageBg,
        borderRadius: t.radius,
        border: `${t.borderWidth} solid ${t.border}`,
      }}
    >
      <div
        className="w-full max-w-sm p-6"
        style={{
          background: t.surface,
          borderRadius: t.radius,
          border: `${t.borderWidth} solid ${t.accent}`,
        }}
      >
        <div className="flex items-center gap-2 mb-5">
          <div
            className="w-10 h-10 flex items-center justify-center"
            style={{
              borderRadius: t.radiusSm,
              background: t.accent,
              color: t.accentText,
            }}
          >
            <Factory className="w-5 h-5" />
          </div>
          <span
            className="text-lg font-black"
            style={{ color: t.text, fontFamily: t.fontDisplay }}
          >
            {a.headline}
          </span>
        </div>
        <p className="text-xs mb-4" style={{ color: t.textMuted }}>
          {a.subhead}
        </p>
        <FieldGroup t={t} status={status} />
        <div className="space-y-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Employee ID"
            className="w-full text-base px-4 py-3.5 outline-none font-semibold"
            style={{
              borderRadius: t.radiusSm,
              border: `${t.borderWidth} solid ${t.border}`,
              background: t.surfaceAlt,
              color: t.text,
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="PIN"
            className="w-full text-base px-4 py-3.5 outline-none font-semibold"
            style={{
              borderRadius: t.radiusSm,
              border: `${t.borderWidth} solid ${t.border}`,
              background: t.surfaceAlt,
              color: t.text,
            }}
          />
        </div>
        <div className="mt-4">
          <SubmitBtn
            t={t}
            status={status}
            onClick={submit}
            label="CLOCK IN & SIGN IN"
          />
        </div>
        <div className="flex justify-center mt-3">
          <ForgotLink t={t} />
        </div>
      </div>
    </div>
  );
}

// ── archetype 8: minimal huge type ──────────────────────────────────
function MinimalHugeType({
  t,
  username,
  setUsername,
  password,
  setPassword,
  status,
  submit,
}: Ctx) {
  return (
    <div
      className="min-h-[520px] flex flex-col justify-center px-10"
      style={{
        background: t.pageBg,
        borderRadius: t.radius,
        border: `${t.borderWidth} solid ${t.border}`,
      }}
    >
      <h1
        style={{
          fontFamily: t.fontDisplay,
          fontWeight: t.fontWeightDisplay,
          fontSize: "56px",
          color: t.text,
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        Sign in.
      </h1>
      <div className="max-w-xs mt-8 space-y-3">
        <FieldGroup t={t} status={status} />
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full text-sm py-2 outline-none border-0 border-b"
          style={{
            borderColor: t.border,
            background: "transparent",
            color: t.text,
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full text-sm py-2 outline-none border-0 border-b"
          style={{
            borderColor: t.border,
            background: "transparent",
            color: t.text,
          }}
        />
        <div className="flex items-center justify-between pt-2">
          <ForgotLink t={t} />
          <button
            type="button"
            onClick={submit}
            disabled={status === "loading"}
            className="text-sm font-bold flex items-center gap-1.5"
            style={{ color: t.text }}
          >
            {status === "loading" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}{" "}
            Enter →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── archetype 9: sketchy / playful ──────────────────────────────────
function SketchyPlayful({
  t,
  a,
  username,
  setUsername,
  password,
  setPassword,
  showPw,
  setShowPw,
  status,
  submit,
}: Ctx) {
  return (
    <div
      className="min-h-[520px] flex items-center justify-center p-8"
      style={{
        background: t.pageBg,
        borderRadius: t.radius,
        border: `${t.borderWidth} dashed ${t.border}`,
      }}
    >
      <div
        className="w-full max-w-sm p-6"
        style={{
          background: t.surface,
          borderRadius: "28px 12px 28px 12px",
          border: `${t.borderWidth} solid ${t.border}`,
          boxShadow: `4px 4px 0 ${t.accent2}`,
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">✏️</span>
          <h1
            className="text-lg font-bold"
            style={{ fontFamily: t.fontDisplay, color: t.text }}
          >
            {a.headline}
          </h1>
        </div>
        <p className="text-xs mb-4" style={{ color: t.textMuted }}>
          {a.subhead}
        </p>
        <FieldGroup t={t} status={status} />
        <div className="space-y-2.5">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your name…"
            className="w-full text-sm px-3 py-2.5 outline-none"
            style={{
              borderRadius: "14px",
              border: `${t.borderWidth} solid ${t.border}`,
              background: t.surfaceAlt,
              color: t.text,
            }}
          />
          <PwInput
            t={t}
            password={password}
            setPassword={setPassword}
            showPw={showPw}
            setShowPw={setShowPw}
            id="sk-pw"
          />
          <div className="flex justify-end">
            <ForgotLink t={t} />
          </div>
          <SubmitBtn
            t={t}
            status={status}
            onClick={submit}
            label="Let's go! →"
          />
        </div>
      </div>
    </div>
  );
}

const archetypeRegistry: Record<LoginArchetype, React.ComponentType<Ctx>> = {
  "split-panel": SplitPanel,
  "centered-card-light": CenteredCardLight,
  "centered-card-dark": CenteredCardDark,
  "command-terminal": CommandTerminal,
  "hero-narrative": HeroNarrative,
  conversational: Conversational,
  "factory-floor": FactoryFloor,
  "minimal-huge-type": MinimalHugeType,
  "sketchy-playful": SketchyPlayful,
};
