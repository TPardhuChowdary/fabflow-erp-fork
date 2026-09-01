// ERP Design Exploration — 14 concept definitions.
// SET A (practical, ids a1–a7): keeps the ERP's module structure and
// business logic recognizable; varies navigation architecture, dashboard
// composition, density, and interaction model.
// SET B (radical, ids b1–b7): rethinks the ERP's fundamental structure —
// different concepts share a dashboard/nav "engine" only where that reuse
// is itself part of the honest design (see report for what's shared vs.
// bespoke per concept).
export type NavShell =
  | "sidebar"
  | "rail"
  | "topbar-command"
  | "canvas"
  | "minimal-drawer";
export type DashboardKind =
  | "kpi-focus"
  | "dense-grid"
  | "command-center"
  | "editorial-timeline"
  | "ai-priority"
  | "manufacturing-monitor"
  | "work-queue"
  | "adaptive-modular"
  | "spatial-canvas"
  | "exception-only"
  | "conversational"
  | "context-threads"
  | "timeline-master"
  | "approval-queue"
  | "factory-twin";

export interface ConceptTheme {
  pageBg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderWidth: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  accent2: string;
  accent3: string;
  success: string;
  warning: string;
  danger: string;
  radius: string;
  radiusSm: string;
  radiusPill: string;
  shadow: string;
  fontDisplay: string;
  fontBody: string;
  fontWeightDisplay: number;
  hardEdges: boolean;
  uppercaseLabels: boolean;
  density: "airy" | "comfortable" | "dense";
}

export interface Concept {
  id: string;
  set: "A" | "B";
  number: number;
  name: string;
  philosophy: string;
  targetUser: string;
  differentiator: string;
  navModel: string;
  dashboardModel: string;
  dataHeavyHandling: string;
  formsHandling: string;
  detailPagesHandling: string;
  aiApproach: string;
  mobileApproach: string;
  whyBetter: string;
  weaknesses: string;
  strengths: string[];
  tradeoffs: string[];
  bestModules: string[];
  nav: NavShell;
  dashboard: DashboardKind;
  theme: ConceptTheme;
}

const t = (overrides: Partial<ConceptTheme>): ConceptTheme => ({
  pageBg: "#f5f5f4",
  surface: "#ffffff",
  surfaceAlt: "#f0efec",
  border: "#e2e0da",
  borderWidth: "1px",
  text: "#1c1b19",
  textMuted: "#7c7669",
  accent: "#c65a2e",
  accentText: "#ffffff",
  accent2: "#3a6ea5",
  accent3: "#4a8f6c",
  success: "#3f8a5b",
  warning: "#c0872f",
  danger: "#c14a3a",
  radius: "12px",
  radiusSm: "8px",
  radiusPill: "999px",
  shadow: "none",
  fontDisplay: "'Inter', system-ui, sans-serif",
  fontBody: "'Inter', system-ui, sans-serif",
  fontWeightDisplay: 700,
  hardEdges: false,
  uppercaseLabels: false,
  density: "comfortable",
  ...overrides,
});

export const concepts: Concept[] = [
  // ───────────────────────── SET A — PRACTICAL DIRECTIONS ─────────────────────────
  {
    id: "a1",
    set: "A",
    number: 7,
    name: "Calm Precision",
    philosophy:
      "Reduce cognitive load for people who sit in this ERP 8+ hours a day — generous whitespace, muted status color, one clear focal point per screen.",
    targetUser:
      "Ops managers and admins running long daily sessions who need low fatigue over raw density.",
    differentiator:
      "A 'Today's Focus' strip above the standard KPI row reframes the dashboard around what changed since yesterday, not just static totals.",
    navModel:
      "Light sidebar, thin borders, no bold color — the nav itself stays visually quiet so content carries the hierarchy.",
    dashboardModel:
      "KPI row + a calm 'what changed' strip + two content panels — familiar shape, quieter execution.",
    dataHeavyHandling:
      "Tables use generous row height and soft zebra striping rather than dense borders; sort/filter live in a slim toolbar, not a wall of controls.",
    formsHandling:
      "Multi-section forms with one section visible at a time (progressive disclosure), autosave on blur.",
    detailPagesHandling:
      "Header + tabs, but tabs persist scroll position and a slim right-hand 'at a glance' rail always shows status/health.",
    aiApproach:
      "AI surfaces one-line contextual notes ('this customer usually pays late') inline, never a separate chat-first surface.",
    mobileApproach:
      "Same visual language, single column, sticky action bar at the bottom for the 1–2 things a mobile user actually needs to do.",
    whyBetter:
      "Most ERP fatigue comes from visual noise, not lack of features — this direction removes noise without removing information.",
    weaknesses:
      "Power users who want maximum density on one screen will feel it's using more scroll than necessary.",
    strengths: [
      "Low fatigue over long sessions",
      "Familiar mental model — fast onboarding",
      "Strong accessibility contrast by default",
    ],
    tradeoffs: [
      "Trades some information density for calmness",
      "Fewer things visible without scrolling",
    ],
    bestModules: ["Customers", "Settings", "Employees"],
    nav: "sidebar",
    dashboard: "kpi-focus",
    theme: t({
      pageBg: "#f7f6f3",
      surface: "#ffffff",
      surfaceAlt: "#f1efe9",
      border: "#e6e3da",
      accent: "#5b7c99",
      accent2: "#8a9c7a",
      radius: "14px",
      density: "airy",
      fontDisplay: "'Inter', system-ui, sans-serif",
    }),
  },
  {
    id: "a2",
    set: "A",
    number: 8,
    name: "Dense Operations",
    philosophy:
      "Maximum information per screen for power users who live in the grid all day — every pixel works, nothing decorative.",
    targetUser:
      "Production planners and procurement staff cross-referencing dozens of rows per minute.",
    differentiator:
      "Tables default to a compact grid with inline editing and tabular figures; the whole app assumes keyboard-first navigation (arrow keys move between cells).",
    navModel:
      "Thin icon rail, no labels by default — screen width goes to content, not chrome.",
    dashboardModel:
      "A dense numeric grid: many small multiples (mini stat + trend) rather than a few big cards, so more signals fit above the fold.",
    dataHeavyHandling:
      "Column management (show/hide/reorder), saved views, bulk row selection with a persistent action bar, keyboard row navigation.",
    formsHandling:
      "Inline editing wherever possible instead of opening a separate form; a full form only for genuinely multi-field creation.",
    detailPagesHandling:
      "Split-pane: list stays visible on the left, detail renders on the right — no full navigation away from the list.",
    aiApproach:
      "AI is a keyboard-triggered inline autocomplete (e.g. suggesting a vendor while typing a PO) rather than a chat panel — it stays out of the way until useful.",
    mobileApproach:
      "Deliberately de-prioritized: mobile shows a simplified read-only queue view, since this direction is built for desktop power use.",
    whyBetter:
      "For expert daily users, clicking through pages is slower than seeing everything and editing in place — this design optimizes for the 80% of ERP time that's expert, repetitive work.",
    weaknesses:
      "Steep learning curve for new/occasional users; not mobile-friendly by design.",
    strengths: [
      "Extremely fast for expert users",
      "Handles thousands of rows comfortably",
      "Minimal clicks per task",
    ],
    tradeoffs: [
      "Intimidating for first-time users",
      "Mobile experience is intentionally limited",
    ],
    bestModules: ["Inventory", "Material Requisitions", "Production"],
    nav: "rail",
    dashboard: "dense-grid",
    theme: t({
      pageBg: "#f4f4f4",
      surface: "#ffffff",
      surfaceAlt: "#ececec",
      border: "#dcdcdc",
      accent: "#2f6f4f",
      accent2: "#33507a",
      radius: "6px",
      radiusSm: "4px",
      density: "dense",
      fontDisplay: "'JetBrains Mono', ui-monospace, monospace",
      fontBody: "'Inter', system-ui, sans-serif",
    }),
  },
  {
    id: "a3",
    set: "A",
    number: 9,
    name: "Command Center",
    philosophy:
      "Search and command are the primary way to move through the ERP — permanent nav chrome is minimized in favor of Cmd+K.",
    targetUser:
      "Fast-moving operators who already know what they want and don't want to hunt through menus.",
    differentiator:
      "A persistent command bar in the header opens a full palette (search + natural-language commands) that can navigate, filter, or create — traditional sidebar nav becomes a fallback, not the default path.",
    navModel:
      "Slim top bar only; the command palette (Cmd+K) is the real navigation system.",
    dashboardModel:
      "Operational Command Center: a live status feed of what's happening right now (jobs starting, POs confirmed, invoices paid) plus exception cards up top.",
    dataHeavyHandling:
      "Every table is reachable and filterable via the command bar ('show overdue invoices') in addition to its own UI controls.",
    formsHandling:
      "Command-driven creation ('new quotation for Ashfield') opens a minimal contextual form pre-filled from the command.",
    detailPagesHandling:
      "Action rail down the right side lists every possible next action as a single click, driven by the same command vocabulary.",
    aiApproach:
      "The command bar IS the AI surface — typing a question or a navigation intent is handled the same way, so users don't need to think about 'which box do I use'.",
    mobileApproach:
      "Command bar becomes the primary mobile interaction too — a persistent search/ask button replaces bottom navigation.",
    whyBetter:
      "Menu-hunting is one of the biggest hidden time costs in ERPs; a genuinely fast, reliable command system removes it entirely for trained users.",
    weaknesses:
      "Users who prefer browsing over searching may feel lost without a full always-visible menu.",
    strengths: [
      "Very fast once learned",
      "Scales gracefully as modules are added",
      "Unifies navigation and AI into one mental model",
    ],
    tradeoffs: [
      "Requires users to learn command vocabulary",
      "Discoverability is weaker for rarely-used features",
    ],
    bestModules: ["Quotations", "Purchase Orders", "AI Agent"],
    nav: "topbar-command",
    dashboard: "command-center",
    theme: t({
      pageBg: "#101114",
      surface: "#17181c",
      surfaceAlt: "#1e2025",
      border: "#2a2c33",
      text: "#e8e8ea",
      textMuted: "#8b8d96",
      accent: "#5fb3ff",
      accent2: "#9c7bff",
      radius: "10px",
      shadow: "0 1px 2px rgba(0,0,0,0.3)",
      density: "comfortable",
    }),
  },
  {
    id: "a4",
    set: "A",
    number: 10,
    name: "Editorial Enterprise",
    philosophy:
      "Present operational information the way a well-edited report presents a business — strong typographic hierarchy tells you what matters before you read a single number.",
    targetUser:
      "Leadership and account managers who want to understand the state of the business quickly, not just query it.",
    differentiator:
      "The dashboard reads top-to-bottom like a briefing, not a grid of cards — a large narrative headline ('6 projects in production, 1 blocked') leads, supporting data follows.",
    navModel:
      "Sidebar with clear section typography; navigation itself is treated as content, not just controls.",
    dashboardModel:
      "Editorial Timeline: today's operational story told chronologically with pull-quote-style callouts for the numbers that matter most.",
    dataHeavyHandling:
      "Tables are framed as 'lists with context' — each row carries a one-line human summary, not just columns of raw fields.",
    formsHandling:
      "Long forms are broken into clearly labeled sections with generous type, read more like a structured document than a form.",
    detailPagesHandling:
      "A project/customer page reads like a case file — headline status, then a narrated activity history, then supporting data tables.",
    aiApproach:
      "AI generates the narrative headline and summaries themselves ('Summarize this customer's history') — it's the writer, not a chatbot.",
    mobileApproach:
      "The editorial narrative format naturally works as a single scrolling column on mobile — this direction adapts unusually well.",
    whyBetter:
      "Executives and account managers often don't want to interpret a chart — they want to be told what it means; this direction does that by design.",
    weaknesses:
      "Less efficient for rapid, repetitive data entry — it's built for understanding, not high-throughput operation.",
    strengths: [
      "Fastest path to genuine understanding for non-power-users",
      "Naturally strong on mobile",
      "Memorable, distinctive identity",
    ],
    tradeoffs: [
      "Not optimized for high-speed repetitive tasks",
      "Requires good AI-generated or human-written summaries to shine",
    ],
    bestModules: ["Customers", "Reports", "Dashboard"],
    nav: "sidebar",
    dashboard: "editorial-timeline",
    theme: t({
      pageBg: "#faf8f4",
      surface: "#ffffff",
      surfaceAlt: "#f2efe6",
      border: "#e5e0d3",
      accent: "#8a3324",
      accent2: "#2b4a3f",
      radius: "4px",
      radiusSm: "2px",
      fontDisplay: "'Georgia', 'Iowan Old Style', serif",
      fontBody: "'Inter', system-ui, sans-serif",
      fontWeightDisplay: 700,
      density: "airy",
    }),
  },
  {
    id: "a5",
    set: "A",
    number: 11,
    name: "AI-Native Operations",
    philosophy:
      "AI is not a feature bolted onto the ERP — it's the layer that decides what you see first on every screen.",
    targetUser:
      "Operations leads managing many moving parts who want triage done for them before they open a module.",
    differentiator:
      "Every list/dashboard is pre-sorted and annotated by an always-visible AI panel that explains its ranking ('shown first because it's blocking production').",
    navModel:
      "Standard sidebar for familiarity — the innovation is entirely in what greets the user, not in how they get around.",
    dashboardModel:
      "AI-Prioritized: the AI's ranked 'what matters right now' list IS the dashboard; traditional KPI cards appear below it as supporting detail.",
    dataHeavyHandling:
      "Tables can be re-sorted by 'AI priority' as a first-class sort option alongside date/amount/status.",
    formsHandling:
      "AI pre-fills likely values (vendor, price, quantity) based on history, with every suggestion clearly marked and one-click to accept or reject.",
    detailPagesHandling:
      "Each detail page opens with an AI-generated status line answering 'what's the state of this and why' before any tabs or tables.",
    aiApproach:
      "This entire concept IS the AI approach — reasoning surfaces proactively everywhere rather than waiting to be asked in a chat box.",
    mobileApproach:
      "Mobile home screen is just the AI priority list — nothing else competes for the first screen.",
    whyBetter:
      "Most ERP users spend real time just figuring out what needs attention; putting AI triage first removes that step entirely instead of adding a chat window on top of the old workflow.",
    weaknesses:
      "Trust — users must be able to verify and override AI ranking easily, or they'll stop trusting the first screen.",
    strengths: [
      "Removes the 'what should I look at' problem entirely",
      "Naturally surfaces cross-module issues",
      "Scales well as data volume grows",
    ],
    tradeoffs: [
      "Requires visible, editable reasoning to earn trust",
      "Less useful for users who prefer to browse systematically",
    ],
    bestModules: ["Dashboard", "AI Agent", "Production"],
    nav: "sidebar",
    dashboard: "ai-priority",
    theme: t({
      pageBg: "#f3f5fb",
      surface: "#ffffff",
      surfaceAlt: "#eaeefa",
      border: "#dde3f2",
      accent: "#5b5bd6",
      accent2: "#2fa8a0",
      radius: "14px",
      density: "comfortable",
    }),
  },
  {
    id: "a6",
    set: "A",
    number: 12,
    name: "Premium Industrial",
    philosophy:
      "Built to be read at a glance from across a shop floor — bold contrast, oversized touch targets, rugged visual confidence.",
    targetUser:
      "Floor supervisors and machine operators working on tablets in a noisy, bright, physically demanding environment.",
    differentiator:
      "Status is communicated through large solid-color blocks and iconography rather than small text — legible at distance and in bright light.",
    navModel:
      "Sidebar with oversized icons and labels; every touch target is well above minimum size for gloved-hand or quick-glance use.",
    dashboardModel:
      "Manufacturing Monitor: a real machine-status grid (running/idle/down, utilization) is the literal front page — this is a factory-floor tool first, office tool second.",
    dataHeavyHandling:
      "Tables collapse into card-per-row on tablet by default — fewer, larger targets rather than dense grids.",
    formsHandling:
      "Forms are short, single-purpose, and often triggered by scanning/tapping a machine or job rather than typing.",
    detailPagesHandling:
      "Big status header first (running/down/blocked in huge type), details load below only if needed.",
    aiApproach:
      "AI flags anomalies proactively as a full-width banner ('WLD-06 has been down 40 min longer than average') rather than requiring a question.",
    mobileApproach:
      "This IS the mobile-first/tablet-first direction — the desktop view is the exception, not the rule.",
    whyBetter:
      "Most ERP UI assumes an office desk; this direction is honest about where manufacturing ERPs actually get used — on the floor.",
    weaknesses:
      "Feels oversized and low-density if used at a normal office desk on a large monitor.",
    strengths: [
      "Genuinely usable on the shop floor",
      "High-contrast, high-legibility by design",
      "Large touch targets reduce mis-taps",
    ],
    tradeoffs: [
      "Wastes space on large desktop monitors",
      "Lower information density than office-first directions",
    ],
    bestModules: ["Machinery", "Production", "Tools"],
    nav: "sidebar",
    dashboard: "manufacturing-monitor",
    theme: t({
      pageBg: "#16181c",
      surface: "#1f2227",
      surfaceAlt: "#262a30",
      border: "#343841",
      text: "#f2f2f0",
      textMuted: "#9a9ea8",
      accent: "#ff8a3d",
      accent2: "#3dd6b0",
      radius: "10px",
      borderWidth: "2px",
      fontWeightDisplay: 800,
      density: "comfortable",
    }),
  },
  {
    id: "a7",
    set: "A",
    number: 13,
    name: "Adaptive Modular",
    philosophy:
      "The ERP should adapt to how each person actually works, not force everyone through one fixed layout.",
    targetUser:
      "Mixed teams where a procurement lead, a QC inspector, and an accountant all use the same system very differently.",
    differentiator:
      "Navigation reorders itself by each user's real usage frequency; the dashboard's home surface is a personal work queue, not a shared static layout.",
    navModel:
      "Sidebar that visibly reorders over time (with a 'pin' override) — most-used modules float to the top for that specific person.",
    dashboardModel:
      "Work Queue: 'what's on your plate today' is the front page, assembled per-role from tasks across every module.",
    dataHeavyHandling:
      "Every table supports personal saved views, and the system suggests one based on what filters that user applies repeatedly.",
    formsHandling:
      "Forms remember and pre-fill a given user's typical values for repeat data entry.",
    detailPagesHandling:
      "Detail pages show role-relevant tabs first (QC sees inspection tabs first, accounts sees invoice tabs first) on the exact same underlying record.",
    aiApproach:
      "AI observes usage patterns quietly in the background to power the adaptive ordering — visible as 'because you use this often' explanations, not a chat feature.",
    mobileApproach:
      "Mobile home screen is that same personal work queue, so switching devices doesn't mean switching mental models.",
    whyBetter:
      "A one-size-fits-all ERP forces every role into the same navigation depth; adapting per-person removes friction without needing separate 'apps' per department.",
    weaknesses:
      "A moving navigation can feel disorienting to some users unless the reordering is gentle and explainable.",
    strengths: [
      "Genuinely reduces clicks for repeat workflows",
      "One system serves very different roles well",
      "Improves over time with use",
    ],
    tradeoffs: [
      "Personalization can feel unpredictable if not well-tuned",
      "Harder to write generic training material",
    ],
    bestModules: ["Production", "QMS", "Payments"],
    nav: "sidebar",
    dashboard: "adaptive-modular",
    theme: t({
      pageBg: "#f6f6f4",
      surface: "#ffffff",
      surfaceAlt: "#eeeee9",
      border: "#e0e0d8",
      accent: "#3f7a5f",
      accent2: "#a86b2f",
      radius: "10px",
      density: "comfortable",
    }),
  },

  // ───────────────────────── SET B — RADICAL REDESIGNS ─────────────────────────
  {
    id: "b1",
    set: "B",
    number: 16,
    name: "Spatial Data Workspace",
    philosophy:
      "Spatial memory beats menu memory — you go 'to a place', not 'to a page'. The business is a workspace you navigate like a map, not a tree of menus.",
    targetUser:
      "Users managing many concurrent workstreams who think in terms of 'areas of the business', not module names.",
    differentiator:
      "There is no sidebar. The home screen is a pannable canvas of large workstream tiles (Sales, Production, Finance, Quality) that expand in place when opened, instead of navigating to a new page.",
    navModel:
      "None in the traditional sense — the canvas itself is the navigation; zooming into a tile reveals its content inline.",
    dashboardModel:
      "Spatial Canvas: tile size and position encode importance/urgency; a tile with a problem visibly grows and pulses, not just changes color.",
    dataHeavyHandling:
      "Opening a tile reveals a focused, scoped table for just that workstream — never the whole ERP's data at once.",
    formsHandling:
      "Creation happens inside the relevant tile in place, so the user never loses their spatial context.",
    detailPagesHandling:
      "A record opens as a further zoom-in within its workstream tile, preserving the 'you are here' spatial sense at every depth.",
    aiApproach:
      "AI can reposition/resize tiles based on what needs attention right now — effectively curating the map, not answering questions in a box.",
    mobileApproach:
      "On mobile the canvas becomes a vertically stacked, swipeable set of the same tiles — spatial metaphor survives as a carousel.",
    whyBetter:
      "Traditional ERP nav trees grow linearly with feature count and become slower to scan; a spatial map scales by re-arranging importance instead of adding more menu items.",
    weaknesses:
      "A genuinely new interaction model requires real onboarding — this is the least immediately familiar concept in the set.",
    strengths: [
      "Scales gracefully as modules grow",
      "Naturally visualizes what's urgent across the whole business at a glance",
      "Distinctive, memorable identity",
    ],
    tradeoffs: [
      "Steepest learning curve of all 14 concepts",
      "Precise/dense data work still needs a 'zoom in' step",
    ],
    bestModules: ["Dashboard", "Production", "Projects"],
    nav: "canvas",
    dashboard: "spatial-canvas",
    theme: t({
      pageBg: "#0d0f14",
      surface: "#171a21",
      surfaceAlt: "#1e222b",
      border: "#2c313d",
      text: "#eef0f5",
      textMuted: "#8d93a3",
      accent: "#5fd0c9",
      accent2: "#e0a24a",
      radius: "18px",
      shadow: "0 8px 24px rgba(0,0,0,0.35)",
      density: "comfortable",
    }),
  },
  {
    id: "b2",
    set: "B",
    number: 17,
    name: "Exception-First ERP",
    philosophy:
      "Attention is the scarcest resource in an ERP. Don't show what's fine — show only what needs a human, and make 'fine' verifiably absent, not just quiet.",
    targetUser:
      "Overloaded operations managers responsible for far more than they can manually review every day.",
    differentiator:
      "The entire app defaults to an exceptions-only view of every module; a deliberate 'show everything' toggle exists but is never the default anywhere.",
    navModel:
      "Minimal drawer nav — modules are reached on demand, but the app assumes you rarely need to 'browse' since exceptions already surfaced what matters.",
    dashboardModel:
      "Exception-Only: literally nothing renders except items requiring action; an explicit 'all clear' state is a first-class, celebrated screen state, not just an empty list.",
    dataHeavyHandling:
      "Tables default to filtered-to-exceptions; a single click reveals the full unfiltered set for the rare audit need.",
    formsHandling:
      "Forms only appear in response to resolving a flagged exception (approve, escalate, fix) — there's no free-standing 'add record' flow competing for attention.",
    detailPagesHandling:
      "A record's detail page opens directly to the exception that caused it to surface, not a generic tab-1-by-default layout.",
    aiApproach:
      "AI defines 'exception' itself — thresholds and anomaly detection decide what counts as needing attention, explainable on demand ('why is this flagged').",
    mobileApproach:
      "Mobile is arguably the best-fit surface for this concept — a short, honest list of only what needs a decision, nothing to scroll past.",
    whyBetter:
      "Most dashboards show everything and hope the user notices what's wrong; this concept inverts that and only shows what's wrong, which is what 8-hour-a-day operators actually need most days.",
    weaknesses:
      "Requires very well-tuned thresholds — false positives erode trust fast, and it's a poor fit for users who need to browse healthy records too.",
    strengths: [
      "Directly optimizes for the scarcest resource (attention)",
      "Extremely fast to scan",
      "'All clear' becomes a genuinely satisfying, trustworthy state",
    ],
    tradeoffs: [
      "Needs excellent anomaly tuning to avoid alert fatigue",
      "Not suited to exploratory/browsing workflows",
    ],
    bestModules: ["QMS", "Payables", "Production"],
    nav: "minimal-drawer",
    dashboard: "exception-only",
    theme: t({
      pageBg: "#fbfaf8",
      surface: "#ffffff",
      surfaceAlt: "#f5f2ec",
      border: "#e8e3d8",
      accent: "#c1442c",
      accent2: "#2b6b4f",
      radius: "10px",
      density: "airy",
    }),
  },
  {
    id: "b3",
    set: "B",
    number: 18,
    name: "Conversational Command ERP",
    philosophy:
      "The ERP is operated like a very capable analyst you talk to — natural language is the primary interface, and every module is reachable through it.",
    targetUser:
      "Executives and generalists who want answers and actions, not screens to learn.",
    differentiator:
      "A persistent conversation is the home screen. Traditional module pages exist as a fallback drawer, but the expected path for most tasks is asking for it.",
    navModel:
      "A collapsed drawer holds the traditional module tree for when someone specifically wants to browse; it is not shown by default.",
    dashboardModel:
      "Conversational: the AI proactively opens with a spoken-style briefing ('Good morning — 3 things need you today...') and the user continues the thread.",
    dataHeavyHandling:
      "Large result sets render as an inline, filterable table WITHIN the conversation thread — so the answer to 'show overdue invoices' is both explained and immediately actionable.",
    formsHandling:
      "Forms are generated on the fly inside the conversation only for the fields a specific action genuinely needs — 'create a PO for 200 sheets of steel' surfaces a 3-field confirmation, not a 20-field form.",
    detailPagesHandling:
      "Asking about a specific record opens a compact card inline in the conversation with a 'expand to full record' option, not a forced page navigation.",
    aiApproach:
      "This concept doesn't 'add' AI — the whole interface is AI-mediated, with every deterministic action ultimately reachable underneath for trust and auditability.",
    mobileApproach:
      "This is a naturally mobile-first pattern — a chat thread with inline cards is exactly how people already use their phones.",
    whyBetter:
      "For a huge share of ERP tasks ('what's overdue', 'create a quick PO'), navigating multiple screens is pure overhead — a well-designed conversational layer removes it, while still keeping full manual control available underneath.",
    weaknesses:
      "High-volume structured data entry (dozens of line items) is genuinely faster in a dedicated form than in conversation — this concept must not force conversation where a form is truly better.",
    strengths: [
      "Fastest path for question-and-answer and simple actions",
      "Naturally auditable (the conversation IS the log)",
      "Excellent mobile fit",
    ],
    tradeoffs: [
      "Bulk/complex data entry still needs a real form escape hatch",
      "Requires very high AI reliability to be trustworthy at scale",
    ],
    bestModules: ["AI Agent", "Reports", "Customers"],
    nav: "minimal-drawer",
    dashboard: "conversational",
    theme: t({
      pageBg: "#faf9f7",
      surface: "#ffffff",
      surfaceAlt: "#f2f0ec",
      border: "#e6e2d8",
      accent: "#6a4fd6",
      accent2: "#2f9e8f",
      radius: "16px",
      density: "comfortable",
    }),
  },
  {
    id: "b4",
    set: "B",
    number: 19,
    name: "Context Threads",
    philosophy:
      "Real work crosses modules — a project's quotation, PO, production run, and invoice are one story, not four unrelated records in four separate places.",
    targetUser:
      "Project-centric teams who currently have to open 4–5 different modules to understand the state of one job.",
    differentiator:
      "Instead of Dashboard → Module → Detail, the ERP is organized around live 'threads' — one continuous feed per project/customer that pulls in every related record as it happens.",
    navModel:
      "Sidebar lists threads (active projects/customers), not modules — 'Quotations' or 'Invoices' as standalone destinations barely exist in the primary nav.",
    dashboardModel:
      "Context Threads: the home screen is a list of active threads ranked by recent activity/urgency, each with a one-line 'what just happened'.",
    dataHeavyHandling:
      "A thread's own table view (e.g. all its material requisitions) is scoped and small by construction — cross-thread bulk tables are still available one level down for audit/reporting.",
    formsHandling:
      "Creating a PO or invoice happens as a reply-in-thread action, automatically linked to that project's full context — no separate module to navigate to and manually link back.",
    detailPagesHandling:
      "There effectively is no separate 'detail page' — the thread itself, scrolled to any point, is the detail view.",
    aiApproach:
      "AI's main job is assembling and summarizing threads across modules — 'this project's story' is literally an AI-composed view over otherwise siloed tables.",
    mobileApproach:
      "Threads read naturally as a mobile feed — this concept ports to mobile almost unchanged, like a messaging app for your business.",
    whyBetter:
      "The current Dashboard → Projects → Project → Purchase Order → Vendor path forces a user to reconstruct context manually every time; threading removes that entirely.",
    weaknesses:
      "Cross-module reporting (e.g. 'all overdue invoices across every customer') needs a genuinely good secondary view, since threads are project/customer-centric by default.",
    strengths: [
      "Matches how work actually happens (cross-module)",
      "Drastically reduces context-switching",
      "Naturally produces a great audit trail",
    ],
    tradeoffs: [
      "Needs a strong secondary cross-thread reporting view",
      "A genuinely new mental model to learn",
    ],
    bestModules: ["Projects", "Customers", "Purchase Orders"],
    nav: "sidebar",
    dashboard: "context-threads",
    theme: t({
      pageBg: "#f4f6f5",
      surface: "#ffffff",
      surfaceAlt: "#eaeeec",
      border: "#dde3e0",
      accent: "#2f7a6b",
      accent2: "#9c6b2f",
      radius: "14px",
      density: "comfortable",
    }),
  },
  {
    id: "b5",
    set: "B",
    number: 20,
    name: "Timeline-Native ERP",
    philosophy:
      "Manufacturing is fundamentally a sequence of events over time — make time the primary axis of the whole product, not an afterthought chart.",
    targetUser:
      "Planners and managers who think in terms of 'what happens when' across the whole operation.",
    differentiator:
      "One master timeline (past → present → future) is the backbone of the app; every module (Projects, POs, Invoices, Machine schedules) is a filtered lens onto that same timeline, not a separate table.",
    navModel:
      "A persistent horizontal timeline scrubber replaces most of the traditional nav — filters (by module, customer, machine) narrow what the timeline shows.",
    dashboardModel:
      "Timeline Master: the dashboard IS 'now' on the master timeline, with the near future (next 7 days of commitments) and recent past (last 7 days of events) visible on either side.",
    dataHeavyHandling:
      "Dense record lists appear when the user zooms into a narrow time window — the timeline itself handles the 'too much data' problem by scoping to a period first.",
    formsHandling:
      "Creating a record (PO, invoice, production stage) places it directly on the timeline at the moment of creation, with due/scheduled dates as first-class, draggable fields.",
    detailPagesHandling:
      "A record's detail view keeps a mini-timeline of just its own history pinned at the top, so 'what happened to this and when' is always the first thing visible.",
    aiApproach:
      "AI forecasts forward on the timeline ('at current pace, this PO delay pushes the project 4 days') rather than just answering isolated questions.",
    mobileApproach:
      "Mobile shows a vertical version of the same timeline, scoped to 'today and this week' by default — the same mental model, just oriented for a small screen.",
    whyBetter:
      "Almost every ERP question is secretly a time question ('when will this be done', 'what's overdue', 'what's coming up') — making time the primary axis answers most questions before they're asked.",
    weaknesses:
      "Some data genuinely isn't time-shaped (a customer's static contact info, a machine's spec sheet) and needs a clearly-labeled non-timeline escape hatch.",
    strengths: [
      "Answers the most common ERP questions ('when') by default",
      "Naturally shows forecasted risk, not just current state",
      "Strong for capacity/scheduling-heavy work",
    ],
    tradeoffs: [
      "Not every record type is naturally time-shaped",
      "A genuinely new primary navigation metaphor to learn",
    ],
    bestModules: ["Production", "Purchase Orders", "Machinery"],
    nav: "minimal-drawer",
    dashboard: "timeline-master",
    theme: t({
      pageBg: "#f5f5f7",
      surface: "#ffffff",
      surfaceAlt: "#ececf1",
      border: "#dfdfe6",
      accent: "#3a5fc4",
      accent2: "#c46a3a",
      radius: "10px",
      density: "comfortable",
    }),
  },
  {
    id: "b6",
    set: "B",
    number: 21,
    name: "Approval & Action Queue OS",
    philosophy:
      "Most ERP time is spent making decisions, not browsing — optimize ruthlessly for the throughput of decisions, like a well-designed task inbox.",
    targetUser:
      "Approvers and managers whose real job inside the ERP is a stream of yes/no/escalate decisions.",
    differentiator:
      "The home screen is literally a swipeable decision queue (approve PO / confirm QC / release payment) — browsing modules is a secondary, explicitly separate mode.",
    navModel:
      "A mode switch between 'Queue' (default) and 'Browse' (traditional module list) — the two are kept deliberately distinct rather than blended.",
    dashboardModel:
      "Approval Queue: one decision at a time, full context shown inline, with clear approve/reject/escalate actions and instant undo.",
    dataHeavyHandling:
      "Bulk-approve is a first-class action (select similar low-risk items, approve as a batch) rather than forcing one-at-a-time review for everything.",
    formsHandling:
      "Most 'forms' in this concept are really just a decision plus an optional comment — heavy data entry still routes to Browse mode's full forms.",
    detailPagesHandling:
      "Each queue card can expand in place to full context before a decision, then collapses again — no forced navigation away from the queue.",
    aiApproach:
      "AI pre-recommends a decision with reasoning ('approve — this vendor and amount match historical pattern') that the human confirms or overrides, never auto-decides silently.",
    mobileApproach:
      "This concept was designed mobile-first — swipe right to approve, left to reject, tap to see more, is the native interaction model from the start.",
    whyBetter:
      "Buried approval buttons on a normal detail page are slow to find and easy to miss; a dedicated queue turns 'decisions I owe the business' into a fast, satisfying, completable list.",
    weaknesses:
      "Not a good fit for open-ended exploration or reporting — it deliberately optimizes for one job (deciding) at the cost of others.",
    strengths: [
      "Very high decision throughput",
      "Reduces approval backlog dramatically",
      "Excellent, natural mobile interaction",
    ],
    tradeoffs: [
      "Deliberately narrow — needs Browse mode for everything else",
      "Bulk approval needs careful safeguards against rubber-stamping",
    ],
    bestModules: ["Purchase Orders", "Payments", "QMS"],
    nav: "minimal-drawer",
    dashboard: "approval-queue",
    theme: t({
      pageBg: "#f6f5f3",
      surface: "#ffffff",
      surfaceAlt: "#eeece6",
      border: "#e2ded2",
      accent: "#2f8a5f",
      accent2: "#c1442c",
      radius: "18px",
      density: "comfortable",
    }),
  },
  {
    id: "b7",
    set: "B",
    number: 22,
    name: "Living Factory Twin",
    philosophy:
      "Manufacturing operators already think spatially about their factory — mirror that directly instead of abstracting everything into tables first.",
    targetUser:
      "Production and floor managers who mentally model 'what's happening where' physically, not as rows in a database.",
    differentiator:
      "The home screen is a literal floor-plan-style diagram of the factory (stages, machines, queues as physical positions); clicking any element opens its live data in place.",
    navModel:
      "The floor plan itself is the primary navigation; a conventional module list exists as a secondary index for anything not physically represented (Customers, Settings).",
    dashboardModel:
      "Factory Twin: real-time visual state of every stage and machine, jobs shown physically queued at the station they're waiting for, exactly like watching the floor from a gallery window.",
    dataHeavyHandling:
      "Selecting a station reveals its queue as a normal list/table scoped to just that station — the twin handles 'where', tables handle 'what'.",
    formsHandling:
      "Moving a job forward a stage is a direct manipulation on the diagram (drag or tap-to-advance) rather than a form with a status dropdown.",
    detailPagesHandling:
      "A machine or job's detail opens as an overlay anchored to its physical position on the twin, so context (what's near it, what's queued behind it) is never lost.",
    aiApproach:
      "AI predicts and highlights bottlenecks directly on the diagram before they fully form ('this station will back up in ~40 min at current pace').",
    mobileApproach:
      "Mobile shows a simplified, pannable version of the same twin — still spatial, just touch-optimized, for supervisors walking the floor with a phone.",
    whyBetter:
      "Forcing floor managers to translate their physical mental model into abstract module names and status dropdowns is unnecessary overhead; this concept removes the translation step entirely.",
    weaknesses:
      "Needs an accurate, maintained floor-plan model to stay trustworthy — a stale or wrong diagram would actively mislead users.",
    strengths: [
      "Matches operators' actual mental model directly",
      "Makes bottlenecks visually obvious before they're a crisis",
      "Highly memorable, genuinely novel for an ERP",
    ],
    tradeoffs: [
      "Requires an accurate, maintained physical layout to work",
      "Less useful for the non-physical parts of the business (Finance, HR)",
    ],
    bestModules: ["Production", "Machinery", "Tools"],
    nav: "minimal-drawer",
    dashboard: "factory-twin",
    theme: t({
      pageBg: "#10131a",
      surface: "#191d26",
      surfaceAlt: "#20242f",
      border: "#2d323e",
      text: "#eceef3",
      textMuted: "#8b90a0",
      accent: "#4ad6a8",
      accent2: "#ff9a4d",
      radius: "12px",
      shadow: "0 8px 24px rgba(0,0,0,0.4)",
      density: "comfortable",
    }),
  },
];

export function conceptById(id: string) {
  return concepts.find((c) => c.id === id);
}
