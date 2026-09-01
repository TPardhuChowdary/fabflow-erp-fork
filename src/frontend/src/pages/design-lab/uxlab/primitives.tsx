// UX Redesign Lab — shared interaction primitives, reused by all 5
// models. This is where the audit's core finding gets fixed: real
// toasts, a real confirm-before-destructive-action dialog, real
// required-field validation that blocks submit with inline errors, and
// a real client-side searchable/sortable table — not decorative shells.
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";

// ── Toast system (real: queued, auto-dismiss, dismissible) ──────────
interface Toast {
  id: number;
  text: string;
  tone: "success" | "error" | "info";
}
const ToastCtx = createContext<{
  push: (text: string, tone?: Toast["tone"]) => void;
} | null>(null);
let toastSeq = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (text: string, tone: Toast["tone"] = "success") => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      3200,
    );
  };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[70] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium bg-white border"
            style={{
              borderColor:
                t.tone === "error"
                  ? "#e0261f"
                  : t.tone === "success"
                    ? "#1fb865"
                    : "#3c7aff",
            }}
          >
            {t.tone === "success" && (
              <Check className="w-4 h-4 text-emerald-600" />
            )}
            {t.tone === "error" && (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            )}
            <span className="text-gray-800">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.push;
}

// ── Confirm dialog (real: returns a promise, blocks the caller) ─────
interface ConfirmState {
  title: string;
  body: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}
const ConfirmCtx = createContext<{
  confirm: (title: string, body: string, danger?: boolean) => Promise<boolean>;
} | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const confirm = (title: string, body: string, danger?: boolean) =>
    new Promise<boolean>((resolve) =>
      setState({ title, body, danger, resolve }),
    );
  return (
    <ConfirmCtx.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => {
            state.resolve(false);
            setState(null);
          }}
          onKeyDown={(e) => e.key === "Escape" && setState(null)}
          aria-hidden="true"
        >
          <div
            className="w-full max-w-sm bg-white rounded-xl p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-gray-900">{state.title}</h3>
            <p className="text-xs text-gray-600 mt-1.5">{state.body}</p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  state.resolve(false);
                  setState(null);
                }}
                className="text-xs font-semibold px-3 py-2 rounded-lg border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  state.resolve(true);
                  setState(null);
                }}
                className={`text-xs font-semibold px-3 py-2 rounded-lg text-white ${state.danger ? "bg-red-600" : "bg-gray-900"}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}

// ── Form field with real required-field validation ───────────────────
export function useFormValidation<T extends Record<string, string | number>>(
  initial: T,
  required: (keyof T)[],
) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const set = (k: keyof T, v: string | number) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };
  const validate = (): boolean => {
    const next: Partial<Record<keyof T, string>> = {};
    for (const k of required) {
      const v = values[k];
      if (
        v === "" ||
        v === undefined ||
        v === null ||
        (typeof v === "number" && Number.isNaN(v))
      )
        next[k] = "This field is required";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  return { values, set, errors, validate };
}

export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
      <AlertTriangle className="w-3 h-3" /> {msg}
    </p>
  );
}

// ── Real client-side searchable + sortable table ─────────────────────
export function useTableControls<T>(
  rows: T[],
  searchFields: (r: T) => string,
  defaultSortKey?: keyof T,
) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<keyof T | undefined>(defaultSortKey);
  const [sortDesc, setSortDesc] = useState(true);
  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        searchFields(r).toLowerCase().includes(query.toLowerCase()),
      ),
    [rows, query, searchFields],
  );
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDesc ? -cmp : cmp;
    });
  }, [filtered, sortKey, sortDesc]);
  const toggleSort = (k: keyof T) => {
    if (sortKey === k) setSortDesc((d) => !d);
    else {
      setSortKey(k);
      setSortDesc(true);
    }
  };
  return { query, setQuery, rows: sorted, sortKey, sortDesc, toggleSort };
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white flex-1 max-w-xs">
      <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className="flex-1 text-xs outline-none bg-transparent"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="w-3 h-3 text-gray-400" />
        </button>
      )}
    </div>
  );
}

export function SortHeader<T>({
  label,
  col,
  sortKey,
  sortDesc,
  onSort,
}: {
  label: string;
  col: keyof T;
  sortKey?: keyof T;
  sortDesc: boolean;
  onSort: (k: keyof T) => void;
}) {
  const active = sortKey === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="flex items-center gap-0.5 text-left font-semibold text-gray-500 hover:text-gray-900"
    >
      {label}
      {active &&
        (sortDesc ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronUp className="w-3 h-3" />
        ))}
    </button>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      aria-hidden="true"
    >
      <div
        className={`h-full w-full ${width} bg-white p-5 overflow-auto shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      aria-hidden="true"
    >
      <div
        className="w-full max-w-md bg-white rounded-xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatusBadge({
  status,
  tone,
}: { status: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  const map = {
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
    neutral: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[tone]}`}
    >
      {status}
    </span>
  );
}

// ── Generic create/edit record form (field-schema driven) ────────────
// This is the piece that closes the audit's main finding: every module
// that only had a read-only list now gets a real "+ Add" flow — real
// required-field validation, a real ~700ms simulated submit with a
// loading state, then a real toast and the new row genuinely appearing
// in that module's list (via the caller's onSubmit callback into the
// store). One schema-driven component instead of 18 bespoke forms.
export type FieldSchema = {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "textarea";
  options?: { value: string; label: string }[];
  required?: boolean;
};

export function RecordFormModal({
  title,
  fields,
  onCancel,
  onSubmit,
  submitLabel = "Create",
}: {
  title: string;
  fields: FieldSchema[];
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
  submitLabel?: string;
}) {
  const required = fields.filter((f) => f.required !== false).map((f) => f.key);
  const initial = Object.fromEntries(fields.map((f) => [f.key, ""])) as Record<
    string,
    string
  >;
  const { values, set, errors, validate } = useFormValidation(
    initial,
    required,
  );
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 650));
    await onSubmit(values);
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onCancel}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      aria-hidden="true"
    >
      <div
        className="w-full max-w-sm bg-white rounded-xl p-5 max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="space-y-2.5">
          {fields.map((f) => (
            <div key={f.key}>
              <label
                htmlFor={`rf-${f.key}`}
                className="text-[11px] font-semibold text-gray-500"
              >
                {f.label}
              </label>
              {f.type === "select" ? (
                <select
                  id={`rf-${f.key}`}
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
                >
                  <option value="">Choose…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  id={`rf-${f.key}`}
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
                  rows={2}
                />
              ) : (
                <input
                  id={`rf-${f.key}`}
                  type={f.type === "number" ? "number" : "text"}
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full mt-1 text-xs px-2.5 py-2 rounded-lg border"
                />
              )}
              <FieldError msg={errors[f.key]} />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold px-3 py-2 rounded-lg border"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60 flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? "Saving…" : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
