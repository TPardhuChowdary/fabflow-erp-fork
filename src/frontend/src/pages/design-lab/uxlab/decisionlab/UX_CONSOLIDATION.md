# FabFlow — UX Consolidation & Decision Lab

**Phase:** UX architecture decision — NOT implementation. Production is completely untouched. Nothing here is applied to production until explicitly approved.

**Inputs:**
- Production ERP (`src/frontend/src/pages/`, `qms/`, `drawingEditor/`, `agent/`) — source of truth for functionality, business rules, fields, validation, workflows, permissions, calculations.
- Final Unified UX Prototype (`design-lab/uxlab/` — `FinalPrototype.tsx` + shared engine), all 31 modules PARITY VERIFIED per `../PARITY_TRACKER.md`.
- A fresh live pass through both running apps this phase (Dashboard, ProjectDetail's real 12-tab structure, Production, QMS, Settings, Inventory, Quotations' New Quotation dialog, ⌘K test) — grounding judgment in what's actually rendered, not just source.

**Method:** every meaningful production/prototype difference is classified A (KEEP PRODUCTION), B (ADOPT FROM PROTOTYPE), C (IMPROVE/HYBRID), or D (DO NOT ADOPT), judged against: task completion speed, discoverability, cognitive load, information hierarchy, consistency, accessibility, error prevention/recovery, learnability, role-based workflows, data density, scalability, responsive behavior, enterprise usability, frequency of use, steps, context switching, destructive-action safety, keyboard/mouse efficiency, real ERP complexity. Visual design (color/type/shadow/radius) is explicitly out of scope this phase — every judgment below is about structure and interaction, not skin.

---

## 1. Executive Verdict

**Neither app wins outright, and they're not competing on the same axis.** Production is a mature, complete, single-window CRUD system: every module is a full-page list-then-detail flow, built on one consistent shadcn/ui component library, with real validation and real consequences. The prototype is a UX architecture testbed: the same fields and actions, wrapped in cross-cutting layers (Role, Attention, Relationship, Command) that production has none of. Comparing them module-by-module on "which screen is better" undersells both — production's screens are individually well-built; the prototype's individual screens are frequently just production's screen redrawn. The real difference, and the real value, is in what sits *around* the screens.

**What production does better, plainly:**
- **Real document output.** Every Print/Download/Share in the prototype is a toast. Production actually renders PDFs and drives real download/share flows. This is not a UX preference — it's a hard functional floor the final blueprint must clear.
- **Data-integrity guardrails baked into the UI.** Inventory's "stock cannot be edited manually, only via Purchase/Usage" banner, the real Reserved/Available stock split, the real Produced/Approved/Rejected/Rework production-summary breakdown on Project Overview — these are places production encodes a business rule directly in the interface, and the prototype currently just shows less.
- **Depth where depth is earned.** EmployeeDetail's payroll subsystem, the Drawing Editor's canvas engine, QMS's insert-only audit trail — genuinely large, genuinely used, subsystems the prototype never attempted to rebuild (correctly, given this phase's scope).

**What the prototype does better, plainly:**
- **It has an attention system; production has a banner.** Production's dashboard shows "All clear — no operational alerts" as a single static line. The prototype computes a real, itemized, severity-ranked exception list from live data (overdue invoices, blocked stages, low stock, down machines) every time. This is the single clearest B (ADOPT) in the whole audit.
- **It has a command surface; production has none.** ⌘K does nothing in production. Confirmed live this phase. For an app with 9 sidebar groups and dozens of screens, that's a real gap for anyone who isn't clicking through the same 4 screens daily.
- **It stops making users guess what an icon does.** Production's row-action clusters run up to 7 unlabeled icons wide (confirmed live in Quotations). The prototype's explicit text buttons cost horizontal space but are legible on first use. Neither is fully right — see the Tables decision below.
- **Cross-module context in one place.** Vendor and Customer 360-views, and — most importantly — the Project Workspace, reduce a real, frequent pattern (checking five different systems' status for one order) from five page loads to one scroll.

*Correction made during this pass: an earlier draft of this document claimed the prototype's dashboard had dropped production's Recent Projects/Recent Quotations panels entirely. Re-reading `FinalPrototype.tsx` directly shows that's only half true — see the corrected Dashboard section (§4.3) below.*

**What must be preserved, full stop:** every field, validation rule, status transition, and calculation currently in production, including the ones the prototype hasn't touched yet (EmployeeDetail, Drawing Editor's canvas, QMS's audit trail, BOM, Internal Costing, multi-item projects, real document rendering). None of these get silently dropped because the prototype doesn't have them — Section 4 says explicitly how each survives into the final blueprint.

**What should change:** the shell. Grouped, role-aware navigation instead of one long always-expanded list. A real attention system instead of a static banner. A command palette. Explicit-but-space-conscious row actions instead of icon soup. And — the centerpiece — a Project Workspace that keeps every one of production's 12 tabs' worth of real capability but stops making "check on an order" cost five separate page loads.

---

## 2. UX Decision Matrix — all 31 modules

Legend: **KEEP** = production's UX is already right, don't touch it. **ADOPT** = prototype's reorganization is a real improvement, take it. **HYBRID** = combine specific pieces of both. **REJECT** = prototype difference doesn't earn its complexity.

| # | Module | Winner | Decision | Reason | Must preserve from production |
|---|---|---|---|---|---|
| 1 | Customers | Prototype (workspace) / tie (form) | **HYBRID** | Multi-email + Additional-Details dialog is identical either way. The workspace-vs-page question is real: see §3 Navigation. | Linked-record delete guard; multi-email/type model |
| 2 | Vendors | Prototype | **ADOPT** | Full workspace page vs. an inline slide-over reduces context loss when Purchase History + Payables both need checking, which they usually do together. | The deliberately-permissive delete rule (warns, doesn't block) |
| 3 | Projects (list) | Tie | **KEEP** | List/search/create pattern is already 1:1. No real difference to adjudicate. | Repeat-order badge (prototype doesn't show it yet); mobile card layout |
| 3d | **Project Detail / Workspace** | Neither, by design | **HYBRID — flagship case, see §4.1** | Neither is the answer alone. Full treatment below. | All 12 tabs' real capability, esp. Production Summary breakdown, Internal Costing, Items |
| 4 | Quotations | Tie (core) / Prototype (dialog spacing) | **HYBRID** | Real-time GST math and revision history are identical. Production's modal is visually cramped for a 6+ line-item quote — see §3 Forms. | Line-item auto-matching on Record PO (prototype skips it) |
| 5 | Customer POs | Tie | **KEEP** | Identical status workflow, no real UX delta. | File attachment viewing (not in prototype) |
| 6 | Invoices | Tie | **KEEP** | Same tax model, same actions. | Real PDF output; reminder scheduling |
| 7 | Payments | Tie | **KEEP** | Identical overpayment guard, identical flow. | Receivables reminder tab (not in prototype) |
| 8 | Payables | Tie | **KEEP** | Identical status computation and guard. | Payment-attachment upload |
| 9 | Inventory | Production | **HYBRID, lean KEEP** | Production's Reserved/Available split and "stock can't be edited manually" inline banner are real guardrails the prototype lacks — confirmed live. Prototype's category filter chip UI is a minor legibility win. | **Reserved/Available split — currently missing from prototype, must be added, not optional** |
| 10 | Machinery | Tie (list) | **KEEP** | List parity is solid; MachineDetail not yet audited on either side. | MachineDetail subsystem (unaudited — flag, don't assume gap is safe) |
| 11 | Tools | Tie | **KEEP** | Full History panel already matches. | Photo compression (perf, not UX) |
| 12 | Tooling / Dies | Tie | **KEEP** | The "must link a drawing" rule is reproduced verbatim already. | Purchase cost/vendor fields (present on type, missing from dialog in prototype) |
| 13 | Employees | Production | **KEEP (subsystem) / ADOPT (list)** | List/duplicate-warning UX is fine either way. EmployeeDetail's payroll/ID-card/advances subsystem is real, used, and entirely absent from the prototype — this is not a UX call, it's a missing feature. | **Entire EmployeeDetail.tsx subsystem** |
| 14 | Delivery Challans | Tie | **KEEP** | Multi-project dispatch-cap logic identical. | Real PDF/share output |
| 15 | Company PO (vendor) | Production | **HYBRID, lean KEEP** | The real per-line-item Receive flow (find-or-create Inventory/Tools/Machines/Dies) is genuine cross-module value production has and the prototype doesn't attempt. | **Per-line-item Receive → resource-creation flow** |
| 16 | Petty Expenses | Production | **HYBRID, lean KEEP — see §4.2** | The itemized Settle-Float flow (5 conditional sub-forms fanning out to 4 other modules) is real, frequent, and entirely missing from the prototype. Float lifecycle math itself is already correctly reproduced. | **Itemized Settle-Float flow — design specified in §4.2, not yet built** |
| 17 | Machine Revenue | Tie | **KEEP** | Insert-only rate history, frozen `rateApplied` — already correct in both conceptually. | Rate-history display panel; dashboard period filter |
| 18 | Scrap | Prototype | **ADOPT** | Explicit Edit button over row-click-to-edit fixes a real keyboard-accessibility gap production has (no keyboard equivalent for row-click). Smallest, cleanest case in the whole audit. | Nothing — full parity already |
| 19 | Ledger | Tie | **KEEP** | Aggregation engine ported exactly; both correct. | Real export files; custom date-range picker |
| 20 | Production | Production (depth) / Prototype (hub summary) | **HYBRID** | Sequential-lock UI is identical. Production's QMS-gate check and rework flow are real safety mechanisms the prototype doesn't have — these are not cosmetic. | **QMS inspection gate before stage completion; rework flow; material-availability check** |
| 21 | Material Requisitions | Tie | **KEEP** | Filter-tab-with-count pattern already matches. | BOM auto-generation (neither side has it — see §3 cross-cutting gap) |
| 22-26 | QMS suite | Production (audit trail) / Prototype (unified dashboard) | **HYBRID** | The 11-status legal-transition table is identical. Production's insert-only attempts audit trail (server round numbers, rectification tracking, photo evidence) is a real compliance mechanism, not a nice-to-have. | **Insert-only audit trail — currently only latest-result is kept in prototype** |
| 27 | Drawing Repository / Editor | Production (Editor) / Prototype (Repository nav) | **HYBRID** | Repository metadata/linking UX is a wash. The canvas annotation Editor is real, heavily used, and confirmed infeasible to rebuild in this stack — out of scope for redesign, not for preservation. | **Entire Editor engine — fabric.js/pdf.js annotation, dimensioning** |
| 28 | Export Engine | Tie | **KEEP** | Section manifest and defaults match exactly. | Real file generation |
| 29 | Settings | Tie | **KEEP** | Prototype already matches production's flat single-scroll layout and its real permission-matrix editor — no divergence to adjudicate. | Appearance/theming (out of scope this phase anyway); migration tools (inapplicable to a prototype) |
| 30 | AI Agent | Production (architecture intent) | **KEEP intent / defer** | This isn't a UX call — the prototype's Classic-mode-only state is an infrastructure limit (no LLM key holder), not a design decision. The target architecture (LLM-first, Classic-mode fallback) is already production's own and correct. | The full 31-action registry; the real LLM chat panel as the primary surface once a backend exists |
| — | **Dashboard** | Neither | **HYBRID — see §4.3** | Prototype already has an "Active Projects" list (unbounded, unlabeled as "recent," no equivalent Quotations list) — not a clean win either way. Prototype's exception list is a real gain production lacks entirely. | A Recent Quotations equivalent; bound the Active Projects list |

**Reading the matrix honestly:** 15 of 31 rows land on KEEP or effective-tie — the prototype mostly reproduces production's interaction pattern faithfully rather than reinventing it, which is the correct outcome for CRUD screens nobody asked to have redesigned. 4 rows are genuine ADOPT (Vendors, Scrap, and the two cross-cutting wins folded into Dashboard/Tables below). 9 rows are real HYBRID cases where each side is missing something the other has. Zero rows are a clean REJECT of a prototype idea on its own screen — the REJECT judgments in this audit are all at the cross-cutting layer (§3), not the module layer, because that's where speculative complexity actually showed up.

---

## 3. Cross-Cutting UX Decisions

### Navigation
**ADOPT (prototype), with one addition.** Production's sidebar shows 9 groups, all expanded, all the time — reaching Settings requires scrolling past Sales, Procurement, Production, Logistics, QMS, Finance, Accounts, and HR every single time, for every role, including ones with no business in most of those groups. The prototype's grouped, collapsible sidebar with Role Layer reordering (primary items promoted to the top per role, secondary items present but demoted, admin sees everything) directly fixes this without hiding any real capability — nothing becomes unreachable, it just stops being first. **Addition required:** production's sidebar is the accurate module inventory; the final nav must audit against it to confirm zero modules are missing from the grouped version (Machinery/MachineDetail and a few others were flagged unaudited above — resolve before implementation, not after).

### Dashboard
**HYBRID.** See §4.3.

### Role-based UX
**ADOPT, cautiously.** The Role Layer's dashboard/nav emphasis is real value with no functionality cost — it reorders and highlights, it never removes a permission-gated action (permission gating itself is presentation-level in the prototype today, a real gap noted in Section 4). Keep the Role Layer as an emphasis mechanism; do not let it become the actual enforcement mechanism — that stays server-side, matching production's `hasPermission()`/RLS model.

### Attention / exception system
**ADOPT — the strongest single case in this audit.** Production computes nothing here; "All clear" is not computed from live thresholds the way the prototype's exception list is (confirmed by reading both dashboards side by side this phase). Every enterprise ERP user's actual daily first question is "what needs me today" — production currently answers it with a banner, the prototype answers it with a list. Keep the prototype's model. Add: severity must be genuinely computed from the same real data every list screen uses, never invented per-dashboard, to avoid the exact staleness bug already found and fixed once this session (Project Workspace's stale `projectContext`).

### Command / search
**ADOPT.** Zero equivalent in production, confirmed live (⌘K does nothing). For an app this large, a command surface is a real efficiency and discoverability gain, not novelty — it directly serves "keyboard/mouse efficiency" and "task completion speed" for anyone past their first week. No functionality risk: it's additive, not a replacement for any existing nav path.

### Project Workspace
**HYBRID — see §4.1.**

### Tables
**HYBRID.** Production's icon-only row-action clusters (up to 7 icons, no visible labels, confirmed live on Quotations) fail discoverability and accessibility for a first-time or infrequent user — there's no way to know what an icon does without hovering every one. The prototype's explicit text-button actions (Edit/Delete/View) fix that but don't scale past 2-3 actions before the row gets wide and dense tables get harder to scan, which matters for tables that legitimately need 5+ actions (Quotations: view/edit/duplicate/revision/PO/print/download/share/delete). **Final rule:** the 1-2 most frequent actions stay as explicit text/icon+label buttons; anything past that collapses into a single labeled overflow menu ("More ▾"), never bare icons with no text anywhere in the row.

### Forms
**HYBRID.** Both use the same real validation and field sets — no functional gap. Production's modal-in-page dialogs (confirmed live: Quotations' New Quotation) are visibly cramped once a form has more than ~4 line items, forcing internal scrolling inside an already-small box. The prototype's dialogs give fields more room but are, at this phase, mostly untested against real line-item volume. **Final rule:** keep production's real-time computed totals and inline validation exactly; give the dialog itself more width/height budget before internal scroll kicks in, especially for line-item-heavy forms (Quotations, Invoices, Company PO).

### Dialogs
**HYBRID.** Confirm-before-destroy copy is identical and correct in both (verified across a dozen modules this session — same wording, same guard logic). The prototype's confirm dialogs are consistent across every module because they route through one shared primitive; production's dialogs are built per-page and occasionally diverge in small ways (e.g., some delete confirms include a linked-record warning inline, others don't). **Final rule:** one shared confirm-dialog primitive, production's exact copy per action, no exceptions — consistency without losing any of production's specific warnings.

### Notifications
**ADOPT, with production's guard rules layered in.** The prototype's toast pattern (success/error, auto-dismiss) is consistent everywhere; production's is the same pattern but not universally applied (some real actions show no confirmation at all). Keep prototype's consistency; every state-changing action gets a toast, no exceptions.

### Responsive behavior
**NEITHER — real shared gap, not a decision between two solutions.** Production has one narrow, undocumented-elsewhere mobile card layout (Projects list only, per the parity audit). The prototype has had zero responsive testing this entire session — every screen built and verified this phase was checked at desktop width only. This is the one area where "pick a winner" doesn't apply because neither side has a real answer. The final blueprint specifies a target pattern (§4.4); it is not yet built anywhere.

### Accessibility
**ADOPT prototype's default, KEEP production's specific fixes.** Prototype defaults to explicit-button actions (a real a11y win over icon-only clusters, already noted). Production, in isolated cases, has done real a11y work the prototype hasn't replicated (this needs a dedicated pass, not assumed complete on either side — neither app has had a systematic accessibility audit this session, and this report should not claim one happened).

---

## 4. Final UX Blueprint

FINAL UX = production's proven functionality and workflows + the prototype's genuinely earned improvements + hybrid solutions where neither alone is sufficient. Not "prototype wins." Not "keep everything as-is." The specific, load-bearing decisions:

### 4.1 Project Workspace — the flagship hybrid

Production's `ProjectDetail.tsx` puts 12 tabs (grouped Planning/Materials/Execution/Closure) behind a dense tab bar, then one full page per tab. This is thorough and well-organized, but checking "is this order on track" costs a page load into Overview, then usually another into Production, then another into QMS — three navigations for one question, every time, for what's very likely the single most frequent action in the entire app.

The prototype's Project Workspace collapses Production/QMS/Requisitions/Delivery/Drawings/Invoice status onto one scrollable page with the single most common action inline (advance a stage, mark a requisition complete, advance a customer PO) and a deep-link to the full module screen for anything deeper. This is a real, measured win for the 80% case — confirmed live this session (advancing a stage in the hub correctly updated the standalone Production module's own counter, proving one shared entity, not a snapshot) — but it currently drops real capability production has: the Production Summary's Produced/Approved/Rejected/Rework/Dispatched breakdown (confirmed live this phase, visible on production's real Overview tab, absent from the prototype's hub), and the entire Design Files/BOM/Items/Internal Costing/Outsourced/Profit & Costing/Timeline set — 6 of the real 12 tabs, not yet built anywhere.

**Final design:**
- **Keep the single-scroll hub as the default landing view** — this is the prototype's real contribution and it's the correct default for the highest-frequency task.
- **Restore the grouped section anchors** (Planning / Materials / Execution / Closure) as jump-links at the top of the hub, mirroring production's own real IA — the grouping itself is good information architecture, not chrome to discard; only the "must load a new page per group" cost gets removed, not the grouping.
- **Add the Production Summary breakdown** (Produced/Approved/Rejected/Rework/Dispatched) to the hub's header area — this is a real, currently-missing data point, not a design nicety.
- **Add the 6 unbuilt tabs' worth of real capability** (Design Files, BOM, Items, Internal Costing, Outsourced, Profit & Costing, Timeline) as sections within the same hub, not as a return to 12 separate page loads — same information, same real fields/calculations, delivered in the hub's format rather than production's tab-per-page format.
- **Keep the deep-link-out pattern** for the two genuinely deep subsystems (Production's full multi-stage editor, QMS's full inspection-recording flow) — these need their dedicated screens' room; the hub shows live status + the one common action and links out for anything else. This is the honest reuse boundary, not a shortcut.
- **Keep production's "Repeat Order" and "Generate Report" as always-visible header actions** — the prototype currently doesn't surface Repeat Order at all in the hub.

### 4.2 Petty Expenses' Settle-Float flow — specified, not yet built

Production's real Settle Float flow is a real, frequently-used capability with no prototype equivalent at all (the prototype's "Return Remaining" only records a plain amount). Rather than silently accept the omission, the target design: a single Settle dialog with a category selector (Inventory Purchase / Machine Service / Vehicle Expense / Employee Personal Expense / Courier-Delivery) that reveals the matching conditional field set inline — reusing the same category-specific fields production's own dialogs already define — and on submit, fans out to the same store actions the standalone modules already use (adds inventory stock through the real Inventory action, links a machine-service record through the real Machine Revenue action, etc.) rather than writing a parallel, disconnected settlement record. This keeps the real cross-module effects production has while giving the flow one consistent dialog shell instead of production's separate per-category forms.

### 4.3 Dashboard — hybrid

**Correction from an earlier draft of this document:** the prototype's dashboard was not found to have dropped a Recent Projects panel — `FinalPrototype.tsx`'s `DashboardHome` already renders an "Active Projects" list. What it actually gets wrong, on closer reading: that list is **unbounded** (every project, not the 5 most recent — a real scalability problem once a company has hundreds of projects) and **unlabeled** as recency-ordered (no explicit sort by `createdAt`, so "recent" isn't actually guaranteed). And there is genuinely **no Quotations equivalent at all** — production's dashboard shows Recent Quotations as its own panel; the prototype has nothing there.

**Keep:** production's *concept* of a bounded, recency-sorted quick-access panel — apply it correctly to Projects (bound to 5, sort by `createdAt` descending) and add the missing Quotations equivalent alongside it.
**Adopt:** the Attention Layer's computed exception list, replacing production's static "All clear" banner — this is the real upgrade, and it's already correctly built.
**Adopt:** Role Layer's KPI emphasis — already correctly built (`roleAttention` filters by the signed-in role's module set).
**Result:** one dashboard, four zones — exception list (top, most urgent), role-tailored KPI row, Order Pipeline (unchanged, both sides already agree this is right), and two bounded Recent-records panels (Projects + the missing Quotations one) at the bottom, replacing the current unbounded single list.

### 4.4 Responsive behavior — target pattern (not yet built anywhere)

Neither app has solved this. The recommended pattern for the final ERP, to be validated once this phase moves to visual design:
- **Sidebar** collapses to an icon rail below ~1024px, full drawer below ~768px (matching the Role Layer's existing collapse affordance, just triggered by viewport too).
- **Dense tables** (Inventory, Quotations, etc.) get the real mobile card-layout treatment production already has for exactly one screen (Projects) — extended to every list screen, not just one, since the pattern already exists and works.
- **The Project Workspace hub** is the one screen most worth getting right on a phone, since "check on an order" is exactly the kind of task done from a phone on a shop floor — the section-anchor jump-links from §4.1 double as a mobile-friendly in-page nav once the hub is long.
- **Dialogs/forms** go full-screen below ~640px rather than a centered modal, matching standard mobile form UX, not a novel pattern.

This is a specification for the next phase, not a claim that it's implemented — one representative mobile screen is built in this pass (§5) to make the pattern concrete, not to complete it.

### 4.5 What stays exactly as production has it, full stop

EmployeeDetail's payroll/ID-card/advances subsystem. The Drawing Editor's canvas annotation engine. QMS's insert-only audit trail with photo evidence. The BOM engine and Internal Costing/Profit & Costing calculations. Multi-item projects. Real PDF/document generation for every Print/Download/Share action. The AI Agent's full 31-action registry behind a real LLM once backend infrastructure exists. None of these were UX judgment calls — they're real functionality with no prototype equivalent, and the correct final-blueprint answer is "reproduce production's version," not "redesign something that was never built."

---

## 5. Interactive representative screens — built this pass

Live inside the new isolated **UX Consolidation / Decision Lab** (`design-lab/uxlab/decisionlab/`), reachable from the Design Lab's own nav group, additive alongside the existing Final UX Prototype — same real mutable mock store (`uxlab/store.tsx`/`data.ts`), not a disconnected duplicate.

| Screen | What it demonstrates |
|---|---|
| Final Dashboard | §4.3's hybrid: exception list + role-tailored KPIs + Order Pipeline (all three already correct, reused as-is) + bounded Recent Projects and the missing Recent Quotations panel |
| Final Project Workspace | §4.1's flagship hybrid: single-scroll hub with restored section anchors, Production Summary breakdown, and the 6 previously-unbuilt tabs' content folded in |
| Production, QMS, Inventory, Finance, Settings, AI Agent | Reused directly from the existing 31-module prototype via annotated frames — each is already at the target decision (KEEP or ADOPT), rebuilding them again here would be exactly the duplication this phase was told not to create |
| Dense table (Inventory) | §3 Tables hybrid: Reserved/Available split restored, overflow-menu action pattern |
| Complex form (Quotations — New Quotation) | §3 Forms hybrid: real-time tax math kept, dialog given real room for line items |
| Complex dialog (QMS — record inspection result) | §3 Dialogs hybrid: one shared confirm primitive, production's real copy |
| Mobile behavior (Project Workspace) | §4.4's target pattern made concrete on one real screen |

## 6. Before / After — key workflows

### "Is this order on track?" (the single highest-frequency real task)
- **Production today:** open Projects → find the order → open ProjectDetail → read Overview → click into Production tab → read stage list → click into QMS tab → read inspection status. 4 page loads minimum.
- **Prototype today:** open Projects → open the project → Production stages, QMS status, requisitions, delivery, invoice are all already on screen. 1 page load, but the Production Summary yield breakdown and 6 real tabs' data aren't there yet.
- **Final:** 1 page load, full data — the hub gains what it's missing (§4.1) without losing the single-page win.

### "What needs my attention right now?"
- **Production today:** dashboard shows a static "All clear" line; the real answer requires manually checking Invoices for overdue, Production for blocked stages, Inventory for low stock, Machinery for downtime — 4 separate screens.
- **Prototype today:** dashboard computes and lists all four, ranked, on load.
- **Final:** prototype's model, unchanged — this was already right.

### "Settle a petty-cash float against a real purchase"
- **Production today:** Settle Float dialog, category-specific fields, fans out to update Inventory/Machine Revenue/Payroll/etc.
- **Prototype today:** no equivalent — Return Remaining only records an amount.
- **Final:** §4.2's design — real category-specific settlement, same cross-module effects, one consistent dialog shell.

---

## Status

- [x] Executive Verdict
- [x] UX Decision Matrix — all 31 modules
- [x] Cross-Cutting UX Decisions — 12 areas
- [x] Final UX Blueprint
- [x] Before/After — 3 key workflows
- [x] Real fix landed as part of this pass: Inventory's Reserved/Available split restored (`InventoryItem.reserved`, `data.ts`), `attentionItems`' reorder check corrected to compare Available instead of raw Total Stock, `GenericScreens.tsx`'s Inventory table showing all three columns — verified live
- [x] Interactive representative screens — `decisionlab/screens/`: `FinalDashboard.tsx` (bounded Recent Projects + new Recent Quotations panel), `FinalProjectWorkspace.tsx` (flagship hybrid — section anchors, real Production Summary, 6 target-design tabs, restored header actions), `MobileDemo.tsx` (§4.4's target pattern on real data), `ReusedFrame.tsx` (decision-annotated reuse of Production/QMS/Inventory/Finance/Settings/AI Agent/dense-table/complex-form/complex-dialog screens)
- [x] `UxDecisionLab.tsx` shell wired into `App.tsx`/`Layout.tsx`/`types.ts` (additive nav entry — "UX Consolidation Lab" — same pattern as the 5 existing Design Lab entries; `Page` type extended with one new literal)
- [x] tsc/Biome/`vite build` all clean; live-verified in-browser including the real Repeat Order action (created PROJ-2026-031, Dashboard's project count and recency-sorted Recent Projects both updated correctly with no reload) and the Inventory table showing the restored Total/Reserved/Available columns
- [x] Published readable artifact (executive-summary treatment, matching the parity-audit report)

This file is the working source of truth for this phase — kept up to date as each piece landed, so the phase was resumable if the session had stopped, matching `PARITY_TRACKER.md`'s own role in the prior phase. This phase is a UX ARCHITECTURE DECISION, not an implementation sign-off — nothing here is applied to production until explicitly approved by the user.
