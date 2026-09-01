// UX Consolidation / Decision Lab — structured content mirroring
// UX_CONSOLIDATION.md (the written source of truth for this phase).
// Kept as data, not inline JSX, so UxDecisionLab.tsx stays a renderer,
// not a second copy of the analysis. If the two ever disagree, the .md
// is authoritative — update both together.

export type Decision = "KEEP" | "ADOPT" | "HYBRID" | "REJECT";

export interface MatrixRow {
  n: string;
  module: string;
  category: string;
  winner: string;
  decision: Decision;
  reason: string;
  preserve: string;
}

export const MATRIX: MatrixRow[] = [
  {
    n: "1",
    module: "Customers",
    category: "Sales",
    winner: "Prototype (workspace) / tie (form)",
    decision: "HYBRID",
    reason:
      "Multi-email + Additional-Details dialog is identical either way. The workspace-vs-page question is real.",
    preserve: "Linked-record delete guard; multi-email/type model",
  },
  {
    n: "2",
    module: "Vendors",
    category: "Procurement",
    winner: "Prototype",
    decision: "ADOPT",
    reason:
      "Full workspace page vs. an inline slide-over reduces context loss when Purchase History + Payables both need checking, which they usually do together.",
    preserve: "The deliberately-permissive delete rule (warns, doesn't block)",
  },
  {
    n: "3",
    module: "Projects (list)",
    category: "Sales",
    winner: "Tie",
    decision: "KEEP",
    reason:
      "List/search/create pattern is already 1:1. No real difference to adjudicate.",
    preserve:
      "Repeat-order badge (prototype doesn't show it yet); mobile card layout",
  },
  {
    n: "3d",
    module: "Project Detail / Workspace",
    category: "Sales",
    winner: "Neither, by design",
    decision: "HYBRID",
    reason: "Flagship case — see Blueprint §4.1. Neither is the answer alone.",
    preserve:
      "All 12 tabs' real capability, esp. Production Summary breakdown, Internal Costing, Items",
  },
  {
    n: "4",
    module: "Quotations",
    category: "Sales",
    winner: "Tie (core) / Prototype (dialog spacing)",
    decision: "HYBRID",
    reason:
      "Real-time GST math and revision history are identical. Production's modal is visibly cramped for a 6+ line-item quote.",
    preserve: "Line-item auto-matching on Record PO (prototype skips it)",
  },
  {
    n: "5",
    module: "Customer POs",
    category: "Sales",
    winner: "Tie",
    decision: "KEEP",
    reason: "Identical status workflow, no real UX delta.",
    preserve: "File attachment viewing (not in prototype)",
  },
  {
    n: "6",
    module: "Invoices",
    category: "Finance",
    winner: "Tie",
    decision: "KEEP",
    reason: "Same tax model, same actions.",
    preserve: "Real PDF output; reminder scheduling",
  },
  {
    n: "7",
    module: "Payments",
    category: "Finance",
    winner: "Tie",
    decision: "KEEP",
    reason: "Identical overpayment guard, identical flow.",
    preserve: "Receivables reminder tab (not in prototype)",
  },
  {
    n: "8",
    module: "Payables",
    category: "Finance",
    winner: "Tie",
    decision: "KEEP",
    reason: "Identical status computation and guard.",
    preserve: "Payment-attachment upload",
  },
  {
    n: "9",
    module: "Inventory",
    category: "Production",
    winner: "Production",
    decision: "HYBRID",
    reason:
      "Production's Reserved/Available split and inline \"stock can't be edited manually\" banner are real guardrails — confirmed live. Now restored in the prototype (see this pass's own fix).",
    preserve: "Reserved/Available split — now restored",
  },
  {
    n: "10",
    module: "Machinery",
    category: "Production",
    winner: "Tie (list)",
    decision: "KEEP",
    reason:
      "List parity is solid; MachineDetail not yet audited on either side.",
    preserve:
      "MachineDetail subsystem (unaudited — flag, don't assume gap is safe)",
  },
  {
    n: "11",
    module: "Tools",
    category: "Production",
    winner: "Tie",
    decision: "KEEP",
    reason: "Full History panel already matches.",
    preserve: "Photo compression (perf, not UX)",
  },
  {
    n: "12",
    module: "Tooling / Dies",
    category: "Production",
    winner: "Tie",
    decision: "KEEP",
    reason: 'The "must link a drawing" rule is reproduced verbatim already.',
    preserve:
      "Purchase cost/vendor fields (present on type, missing from dialog in prototype)",
  },
  {
    n: "13",
    module: "Employees",
    category: "HR",
    winner: "Production",
    decision: "KEEP",
    reason:
      "List/duplicate-warning UX is fine either way. EmployeeDetail's payroll/ID-card/advances subsystem is real, used, and entirely absent from the prototype — not a UX call, a missing feature.",
    preserve: "Entire EmployeeDetail.tsx subsystem",
  },
  {
    n: "14",
    module: "Delivery Challans",
    category: "Logistics",
    winner: "Tie",
    decision: "KEEP",
    reason: "Multi-project dispatch-cap logic identical.",
    preserve: "Real PDF/share output",
  },
  {
    n: "15",
    module: "Company PO (vendor)",
    category: "Procurement",
    winner: "Production",
    decision: "HYBRID",
    reason:
      "The real per-line-item Receive flow (find-or-create Inventory/Tools/Machines/Dies) is genuine cross-module value production has and the prototype doesn't attempt.",
    preserve: "Per-line-item Receive → resource-creation flow",
  },
  {
    n: "16",
    module: "Petty Expenses",
    category: "Finance",
    winner: "Production",
    decision: "HYBRID",
    reason:
      "The itemized Settle-Float flow (5 conditional sub-forms fanning out to 4 other modules) is real, frequent, and entirely missing from the prototype. See Blueprint §4.2 for the specified design.",
    preserve: "Itemized Settle-Float flow — designed, not yet built",
  },
  {
    n: "17",
    module: "Machine Revenue",
    category: "Production",
    winner: "Tie",
    decision: "KEEP",
    reason:
      "Insert-only rate history, frozen rateApplied — already correct in both conceptually.",
    preserve: "Rate-history display panel; dashboard period filter",
  },
  {
    n: "18",
    module: "Scrap",
    category: "Production",
    winner: "Prototype",
    decision: "ADOPT",
    reason:
      "Explicit Edit button over row-click-to-edit fixes a real keyboard-accessibility gap production has. Smallest, cleanest case in the whole audit.",
    preserve: "Nothing — full parity already",
  },
  {
    n: "19",
    module: "Ledger",
    category: "Finance",
    winner: "Tie",
    decision: "KEEP",
    reason: "Aggregation engine ported exactly; both correct.",
    preserve: "Real export files; custom date-range picker",
  },
  {
    n: "20",
    module: "Production",
    category: "Production",
    winner: "Production (depth) / Prototype (hub summary)",
    decision: "HYBRID",
    reason:
      "Sequential-lock UI is identical. Production's QMS-gate check and rework flow are real safety mechanisms the prototype doesn't have.",
    preserve:
      "QMS inspection gate before stage completion; rework flow; material-availability check",
  },
  {
    n: "21",
    module: "Material Requisitions",
    category: "Production",
    winner: "Tie",
    decision: "KEEP",
    reason: "Filter-tab-with-count pattern already matches.",
    preserve: "BOM auto-generation (neither side has it)",
  },
  {
    n: "22-26",
    module: "QMS suite",
    category: "Quality (QMS)",
    winner: "Production (audit trail) / Prototype (unified dashboard)",
    decision: "HYBRID",
    reason:
      "The 11-status legal-transition table is identical. Production's insert-only attempts audit trail is a real compliance mechanism, not a nice-to-have.",
    preserve:
      "Insert-only audit trail — currently only latest-result is kept in prototype",
  },
  {
    n: "27",
    module: "Drawing Repository / Editor",
    category: "Production",
    winner: "Production (Editor) / Prototype (Repository nav)",
    decision: "HYBRID",
    reason:
      "Repository metadata/linking UX is a wash. The canvas annotation Editor is real, heavily used, and confirmed infeasible to rebuild in this stack.",
    preserve:
      "Entire Editor engine — fabric.js/pdf.js annotation, dimensioning",
  },
  {
    n: "28",
    module: "Export Engine",
    category: "System",
    winner: "Tie",
    decision: "KEEP",
    reason: "Section manifest and defaults match exactly.",
    preserve: "Real file generation",
  },
  {
    n: "29",
    module: "Settings",
    category: "System",
    winner: "Tie",
    decision: "KEEP",
    reason:
      "Prototype already matches production's flat single-scroll layout and its real permission-matrix editor — no divergence to adjudicate.",
    preserve:
      "Appearance/theming (out of scope this phase); migration tools (inapplicable to a prototype)",
  },
  {
    n: "30",
    module: "AI Agent",
    category: "AI",
    winner: "Production (architecture intent)",
    decision: "KEEP",
    reason:
      "Not a UX call — the prototype's Classic-mode-only state is an infrastructure limit (no LLM key holder), not a design decision.",
    preserve:
      "The full 31-action registry; the real LLM chat panel as the primary surface once a backend exists",
  },
  {
    n: "—",
    module: "Dashboard",
    category: "Cross-cutting",
    winner: "Neither",
    decision: "HYBRID",
    reason:
      "Prototype already has an Active Projects list (unbounded, no Quotations equivalent) — not a clean win either way. Exception list is a real gain production lacks entirely.",
    preserve: "A Recent Quotations equivalent; bound the Active Projects list",
  },
];

export interface CrossCuttingDecision {
  area: string;
  decision: Decision | "HYBRID + NEW";
  summary: string;
  detail: string;
}

export const CROSS_CUTTING: CrossCuttingDecision[] = [
  {
    area: "Navigation",
    decision: "ADOPT",
    summary:
      "Grouped, collapsible, role-reordered sidebar over production's one long always-expanded list.",
    detail:
      "Production's sidebar shows 9 groups, all expanded, all the time — reaching Settings requires scrolling past 8 groups first, for every role. The prototype's Role Layer promotes primary items per role without hiding any real capability. Nothing becomes unreachable, it just stops being first.",
  },
  {
    area: "Dashboard",
    decision: "HYBRID",
    summary:
      "Keep the exception list and role-tailored KPIs; fix the Active Projects list and add a matching Quotations panel.",
    detail: "See Final UX Blueprint §4.3.",
  },
  {
    area: "Role-based UX",
    decision: "ADOPT",
    summary:
      "Role Layer reorders and emphasizes — it never enforces. Enforcement stays server-side.",
    detail:
      "The Role Layer's dashboard/nav emphasis is real value with no functionality cost. Permission gating itself is presentation-level in the prototype today (a real gap, tracked separately) — the Role Layer must never become the actual enforcement mechanism.",
  },
  {
    area: "Attention / exception system",
    decision: "ADOPT",
    summary:
      "The strongest single case in this audit — production has a static banner, the prototype computes a real list.",
    detail:
      "Production's \"All clear\" is not computed from live thresholds. The prototype's exception list already reads the same real data every list screen uses. Keep it exactly as built; the only requirement is that it never drifts stale again (already happened once this session with Project Workspace, already fixed).",
  },
  {
    area: "Command / search",
    decision: "ADOPT",
    summary:
      "Zero equivalent in production — confirmed live, ⌘K does nothing there.",
    detail:
      "For an app this large, a command surface is a real efficiency and discoverability gain. No functionality risk: additive, not a replacement for any existing nav path.",
  },
  {
    area: "Project Workspace",
    decision: "HYBRID",
    summary: "The flagship case — see Final UX Blueprint §4.1.",
    detail: "See Final UX Blueprint §4.1.",
  },
  {
    area: "Tables",
    decision: "HYBRID + NEW",
    summary:
      "Neither icon-only clusters nor unlimited text buttons — 1-2 primary actions explicit, the rest collapse into one labeled overflow menu.",
    detail:
      "Production's icon-only row-action clusters (up to 7 icons, no visible labels, confirmed live on Quotations) fail discoverability for anyone who hasn't memorized them. The prototype's explicit text buttons fix that but don't scale past 2-3 actions before rows get unreasonably wide.",
  },
  {
    area: "Forms",
    decision: "HYBRID",
    summary:
      "Keep production's real-time computed totals and inline validation; give dialogs more room before internal scroll kicks in.",
    detail:
      "Both use the same real validation and field sets. Production's modal-in-page dialogs (confirmed live: Quotations) are visibly cramped past ~4 line items.",
  },
  {
    area: "Dialogs",
    decision: "HYBRID",
    summary:
      "One shared confirm-dialog primitive, production's exact copy per action, no exceptions.",
    detail:
      "Confirm-before-destroy copy is identical and correct in both. The prototype's dialogs are consistent because they route through one shared primitive; production's are built per-page and occasionally diverge in small ways.",
  },
  {
    area: "Notifications",
    decision: "ADOPT",
    summary:
      "Every state-changing action gets a toast, no exceptions — the prototype's consistency, applied universally.",
    detail:
      "The prototype's toast pattern is consistent everywhere; production's is the same pattern but not universally applied.",
  },
  {
    area: "Responsive behavior",
    decision: "HYBRID + NEW",
    summary:
      "Real shared gap, not a decision between two solutions — see Final UX Blueprint §4.4 for the target pattern.",
    detail:
      "Production has one narrow mobile card layout (Projects list only). The prototype has had zero responsive testing this session. Neither side has a real answer to extend.",
  },
  {
    area: "Accessibility",
    decision: "ADOPT",
    summary:
      "Adopt the prototype's explicit-action default; a dedicated audit is still owed on both sides.",
    detail:
      "Prototype defaults to explicit-button actions (a real a11y win over icon-only clusters). Neither app has had a systematic accessibility audit this session — this should not be read as a completed audit.",
  },
];

export interface BlueprintSection {
  id: string;
  title: string;
  body: string[];
}

export const BLUEPRINT: BlueprintSection[] = [
  {
    id: "4.1",
    title: "Project Workspace — the flagship hybrid",
    body: [
      "Production's ProjectDetail.tsx puts 12 tabs (grouped Planning/Materials/Execution/Closure) behind a dense tab bar, then one full page per tab. Checking \"is this order on track\" costs a page load into Overview, then usually another into Production, then another into QMS — three navigations for one question, for what's very likely the single most frequent action in the entire app.",
      "The prototype's Project Workspace collapses Production/QMS/Requisitions/Delivery/Drawings/Invoice status onto one scrollable page with the single most common action inline, and a deep-link to the full module screen for anything deeper. Confirmed live this session: advancing a stage in the hub correctly updated the standalone Production module's own counter — one shared entity, not a snapshot. But it currently drops real capability: the Production Summary's Produced/Approved/Rejected/Rework/Dispatched breakdown (confirmed live on production's real Overview tab, absent from the prototype's hub), and 6 of the real 12 tabs.",
      "Final design: keep the single-scroll hub as the default landing view. Restore the grouped section anchors (Planning / Materials / Execution / Closure) as jump-links, mirroring production's own real IA. Add the Production Summary breakdown to the hub's header. Fold the 6 unbuilt tabs' real capability into the hub's format rather than returning to 12 separate page loads. Keep the deep-link-out pattern for Production's full multi-stage editor and QMS's full inspection-recording flow — the honest reuse boundary, not a shortcut. Restore \"Repeat Order\" and \"Generate Report\" as always-visible header actions.",
    ],
  },
  {
    id: "4.2",
    title: "Petty Expenses' Settle-Float flow — specified, not yet built",
    body: [
      "Production's real Settle Float flow has no prototype equivalent at all — the prototype's \"Return Remaining\" only records a plain amount. Target design: a single Settle dialog with a category selector (Inventory Purchase / Machine Service / Vehicle Expense / Employee Personal Expense / Courier-Delivery) that reveals the matching conditional field set inline, and on submit fans out to the same store actions the standalone modules already use — adds inventory stock through the real Inventory action, links a machine-service record through the real Machine Revenue action, etc. — rather than a parallel, disconnected settlement record.",
    ],
  },
  {
    id: "4.3",
    title: "Dashboard — hybrid",
    body: [
      'Correction from an earlier draft: the prototype\'s dashboard was not found to have dropped a Recent Projects panel — it already renders an "Active Projects" list. What it actually gets wrong: that list is unbounded (every project, not the 5 most recent) and unlabeled as recency-sorted. And there is genuinely no Quotations equivalent at all.',
      "Keep: production's concept of a bounded, recency-sorted quick-access panel — apply it correctly to Projects (bound to 5, sort by createdAt descending) and add the missing Quotations equivalent. Adopt: the Attention Layer's exception list (already correct) and Role Layer's KPI emphasis (already correct). Result: exception list, role-tailored KPIs, Order Pipeline (unchanged), and two bounded Recent-records panels.",
    ],
  },
  {
    id: "4.4",
    title: "Responsive behavior — target pattern",
    body: [
      "Neither app has solved this. Recommended pattern: sidebar collapses to an icon rail below ~1024px, full drawer below ~768px. Dense tables get the real mobile card-layout treatment production already has for exactly one screen (Projects), extended to every list screen. The Project Workspace hub is the one screen most worth getting right on a phone — checking on an order is exactly the kind of task done from a phone on a shop floor. Dialogs/forms go full-screen below ~640px rather than a centered modal.",
      "This is a specification for the next phase, not a claim that it's implemented — one representative mobile screen is built in this pass to make the pattern concrete, not to complete it.",
    ],
  },
  {
    id: "4.5",
    title: "What stays exactly as production has it, full stop",
    body: [
      "EmployeeDetail's payroll/ID-card/advances subsystem. The Drawing Editor's canvas annotation engine. QMS's insert-only audit trail with photo evidence. The BOM engine and Internal Costing/Profit & Costing calculations. Multi-item projects. Real PDF/document generation for every Print/Download/Share action. The AI Agent's full 31-action registry behind a real LLM once backend infrastructure exists. None of these were UX judgment calls — they're real functionality with no prototype equivalent, and the correct final-blueprint answer is \"reproduce production's version,\" not \"redesign something that was never built.\"",
    ],
  },
];

export interface BeforeAfter {
  workflow: string;
  before: string;
  prototype: string;
  final: string;
}

export const BEFORE_AFTER: BeforeAfter[] = [
  {
    workflow:
      '"Is this order on track?" — the single highest-frequency real task',
    before:
      "Open Projects → find the order → open ProjectDetail → read Overview → click into Production tab → read stage list → click into QMS tab → read inspection status. 4 page loads minimum.",
    prototype:
      "Open Projects → open the project → Production stages, QMS status, requisitions, delivery, invoice are all already on screen. 1 page load, but the Production Summary yield breakdown and 6 real tabs' data aren't there yet.",
    final:
      "1 page load, full data — the hub gains what it's missing (§4.1) without losing the single-page win.",
  },
  {
    workflow: '"What needs my attention right now?"',
    before:
      'Dashboard shows a static "All clear" line; the real answer requires manually checking Invoices for overdue, Production for blocked stages, Inventory for low stock, Machinery for downtime — 4 separate screens.',
    prototype: "Dashboard computes and lists all four, ranked, on load.",
    final: "Prototype's model, unchanged — this was already right.",
  },
  {
    workflow: "Settle a petty-cash float against a real purchase",
    before:
      "Settle Float dialog, category-specific fields, fans out to update Inventory/Machine Revenue/Payroll/etc.",
    prototype: "No equivalent — Return Remaining only records an amount.",
    final:
      "§4.2's design — real category-specific settlement, same cross-module effects, one consistent dialog shell.",
  },
];
