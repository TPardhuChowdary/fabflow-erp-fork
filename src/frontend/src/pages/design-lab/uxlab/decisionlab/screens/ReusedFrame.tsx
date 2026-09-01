// UX Consolidation / Decision Lab — reused-screen frame.
//
// For every module whose decision is KEEP or a straightforward ADOPT,
// rebuilding it a second time inside this lab would be exactly the
// "disconnected duplicate prototype" this phase was told not to create.
// This wraps the EXISTING real screen (via ModuleRouter, same store) in
// a decision-annotation header instead — same component, same live
// data, just labeled with what was decided about it and why.
import type { Decision } from "../content";

const DECISION_STYLE: Record<Decision, string> = {
  KEEP: "bg-gray-100 text-gray-700",
  ADOPT: "bg-emerald-100 text-emerald-700",
  HYBRID: "bg-amber-100 text-amber-700",
  REJECT: "bg-red-100 text-red-700",
};

export function ReusedFrame({
  decision,
  reason,
  children,
}: {
  decision: Decision;
  reason: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-violet-50 border-violet-200 p-3 flex items-start gap-2.5">
        <span
          className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${DECISION_STYLE[decision]}`}
        >
          {decision}
        </span>
        <p className="text-xs text-violet-800">
          {reason}{" "}
          <span className="text-violet-500">
            Reused directly from the existing prototype — same real screen, same
            live store, not rebuilt.
          </span>
        </p>
      </div>
      {children}
    </div>
  );
}
