# FabFlow — Final UX Implementation Blueprint

**Phase 4 — planning and specification only.** Production is untouched. This document does not authorize implementation; see the companion `FINAL_UX_DECISION.md` for the concise version and the explicit sign-off gate at the end of this file.

---

## 1. Executive Decision

Three prior phases produced three separate artifacts. This phase does not add a fourth competing decision — it synthesizes the three into one buildable plan, re-grounded against production source where the record needed checking, and specifies exactly what changes, what doesn't, and in what order.

**One correction surfaced by re-grounding, before anything else:** Phase 1/2 listed "Design Files" as an unbuilt real ProjectDetail tab. Reading production's actual tab content (`pages/ProjectDetail.tsx:2645`) shows it is not an active gap — production itself retired this tab ("*This tab is retired and no longer accepts new uploads... Use Drawing Repository*"), and the successor capability is the Drawing Repository this project already built in Module 27. The blueprint below reflects this: Design Files is a **legacy read-only list**, not a build target.

Everything else re-checked against source (BOM, Items, Internal Costing, Outsourced, Profit & Costing, Timeline, EmployeeDetail's five tabs, Company PO's Receive flow, Petty Expenses' Settle dialog) confirmed the prior audits' characterization — see §14 for the field-level specifics that grounding surfaced.

## 2. The Final UX Formula

```
FINAL UX =
    REAL PRODUCTION FUNCTIONALITY          (source of truth: fields, rules, calculations)
  + APPROVED UX ARCHITECTURE               (source of truth: decisionlab/UX_CONSOLIDATION.md)
  + INSTRUMENT VISUAL SYSTEM               (source of truth: visuallab/VISUAL_SYSTEM.md)
  + ONLY PROVEN UX IMPROVEMENTS            (verified live, not asserted)
```

Not "the prototype, reskinned." Not "production, reskinned." A specific, itemized combination — every module below states which of the four sources wins for which specific piece of it, never a blanket answer.

## 3. Source-of-Truth Hierarchy

1. **Real production ERP** — functionality, business rules, fields, calculations, validation, workflows, permissions, data relationships, deep subsystems. Nothing here is discarded because a prior prototype didn't build it.
2. **UX Consolidation / Decision Lab** — the approved UX architecture (navigation shape, Attention Layer, Command Palette, Project Workspace pattern, Tables/Forms/Dialogs rules). Not re-opened in this phase.
3. **Visual System Lab** — the approved visual system, "Instrument" (light + dark token pair). Not re-opened in this phase.
4. **Original 6-direction Design Lab** — reference material only, already fully accounted for inside Instrument's own reasoning (see `visuallab/VISUAL_SYSTEM.md` §1). Not consulted independently in this phase.

---

## 4. Instrument Visual System (locked)

Full token spec: `../visuallab/tokens.ts` / `../visuallab/VISUAL_SYSTEM.md`. Restated here only as the load-bearing facts an implementer needs without cross-referencing:

- **Structural base:** Style 02 (Quiet Utility) — collapsed-by-default icon rail, one accent used sparingly, subtle-not-absent shadow.
- **Accent:** `#1f6f78` deep steel-teal (light) / `#5fb0b8` (dark) — deliberately not purple, not generic SaaS blue.
- **Neutrals:** elevated warm neutral page background (`#f4f3f0` light / `#14171a` dark), never stark white/black.
- **Severity colors** (success/warning/danger) are a fully independent set from the accent and from category tints — never conflated.
- **Category tints** (Sales/Procurement/Production/Finance/Quality) exist only on badges identifying module ownership — never a primary surface fill.
- **Type:** IBM Plex Sans (UI, headings, body) + IBM Plex Mono (every quantity, currency amount, project/PO/SKU code) with `tabular-nums`.
- **Radius:** 10px cards / 6px inputs+badges / pill for status chips only.
- **Dark mode:** a genuinely independent palette, not an inversion — surfaces step up in lightness from the page background.
- **Motion:** the Command Palette opens/closes with effectively zero animation, in both palettes, regardless of anything else in this document — a keyboard-driven surface used hundreds of times a day must never wait on a transition.

**Explicitly excluded**, per the approved system: gradients, glassmorphism, "AI-purple" SaaS aesthetics, generic blue SaaS styling, decorative illustrations, unnecessary animation, novelty that competes with data.

---

## 5. Application Shell

A three-region shell, present on every authenticated screen:

- **Rail** (left, 56px collapsed / 224px expanded on hover-or-click) — icon-only by default per Instrument's structural base, matching the approved Navigation decision's intent taken to its natural conclusion given how many modules this app has.
- **Content region** — the page itself; owns its own scroll, never the whole viewport.
- **Command surface** — invoked by ⌘K/Ctrl+K from anywhere, an overlay above the shell, never a permanent region.

No top bar in the traditional sense — search lives in the Command Palette trigger (a persistent, always-visible affordance at the top of the rail's expanded state and reachable via keyboard from anywhere), notifications/user menu live in a compact top-right cluster inside the content region's own header, not a separate global bar. This keeps vertical space for content, which matters more in a data-dense ERP than a persistent chrome bar.

## 6. Navigation Architecture (locked, from Phase 2)

- Grouped by the app's own real functional categories (Sales/Procurement/Production/Logistics/Quality/Finance/Accounts/HR/System) — the same 9 groups production already has, not invented.
- **Role Layer** reorders and promotes — a role's primary modules surface first in the expanded rail; secondary modules are present, not hidden; admin sees the unmodified full set.
- Server-side permissions remain the only enforcement — the Role Layer is presentation, never authorization. No real functionality becomes unreachable because of role personalization; a demoted item is still one click away.
- The full real module inventory must be re-verified against `components/Layout.tsx`'s live sidebar config before implementation — Phase 2 flagged Machinery/MachineDetail as "unaudited"; that must close before Phase 9 module work starts on it (see §19).

## 7. Role Layer

| Aspect | Spec |
|---|---|
| Purpose | Reduce time-to-first-relevant-action for a specific job function, without hiding capability. |
| Mechanism | Reorders sidebar groups/items and dashboard KPI emphasis based on the signed-in role's real primary/secondary module set (already modeled in `shared/roleAccess.ts`). |
| What it must never do | Gate a server-permitted action. Invent access a role doesn't really have. Silently drop a module from the rail (demote, don't remove). |
| States | Per-role variant × light/dark — 16 role/theme combinations minimum to visually verify before sign-off. |

## 8. Attention Layer

| Aspect | Spec |
|---|---|
| Purpose | Replace production's static "All clear" banner with a real, itemized, severity-ranked exception list computed from the same live data every list screen already reads. |
| Sources (from the prototype's real `attentionItems` computation, re-verifiable against production's own real thresholds at implementation time) | Blocked production stages, machine breakdowns, overdue invoices, inventory below reorder (checked against **Available**, not raw Total Stock — a real bug this project already found and fixed once), high-severity open QMS issues. |
| Severity | Exactly two levels surfaced (critical/warning) with color kept fully separate from the accent — critical uses danger-red, warning uses warning-amber, never the steel-teal accent. |
| Interaction | Each item deep-links to the exact record; the list itself never edits anything. |
| Staleness risk | Named explicitly because it already happened once this project (Project Workspace's `projectContext` went stale relative to newer real entities) — any new real data source added later must be wired into this computation at the same time, not after. |

## 9. Command Palette

| Aspect | Spec |
|---|---|
| Purpose | Production has no global search or command surface at all — confirmed live (⌘K does nothing). This is pure addition, not a replacement for the rail. |
| Trigger | ⌘K / Ctrl+K from anywhere; a persistent, labeled affordance in the rail's expanded state for discoverability. |
| Behavior | Fuzzy match on real record identifiers (project no., customer name, PO number) plus a small fixed command grammar (open X, approve X, show X) — not a natural-language parser; that ambition belongs to the AI Agent module, not this surface. |
| Motion | Zero-to-near-zero open/close animation, unconditionally — see §4. |
| Escape | Always closes the overlay; never intercepted by anything inside it. |
| Accessibility | Full keyboard operation (arrow keys, Enter, Escape); focus moves into the input on open via a programmatic focus call, never a static `autoFocus` attribute (a real a11y distinction — static autoFocus disorients screen-reader users mid-page; a focus call in direct response to the same user action that opened the dialog is the accessible way to do it — already built this way in the Visual System Lab's demo). |

## 10. Project Workspace Architecture — the flagship

This is the single most scrutinized piece of this blueprint, per the user's explicit direction. Full reasoning: `decisionlab/UX_CONSOLIDATION.md` §4.1. What's new in this pass is the field-level grounding from re-reading production's actual tab bodies (§1, §14) and the resulting, more precise integration plan.

### 10.1 What it must answer

*"Is this order on track?"* — the single highest-frequency real task in the app — in one scroll, not the 3-4 page loads production's own 12-tab structure currently costs.

### 10.2 Structure

A single-scroll hub with **restored section-anchor jump-links** mirroring production's own real 4-group IA (Planning / Materials / Execution / Closure) — the grouping is good information architecture and is kept; only the "must load a new page per group" cost is removed.

| Section | Content | Source of truth | Integration |
|---|---|---|---|
| Header | Project No., name, customer, qty/value, **Repeat Order** and **Generate Report** actions | Production `ProjectDetail.tsx` header | Inline in hub, both actions real (Repeat Order already wired to a real store action; Generate Report stays simulated per the whole app's disclosed document-generation gap, §16) |
| Planning → Overview | Total/Dispatched/Remaining qty, **Production Summary** (Produced/Approved/Rejected/Rework/Dispatched) | `ProjectDetail.tsx` Overview tab | Inline, real — this specific breakdown was the concrete gap Phase 2 named and is now computed from real stage + QMS data |
| Planning → Design Files | Legacy read-only file list | `ProjectDetail.tsx` Design Files tab (**retired in production itself**, see §1) | **Do not build as a hub section.** Show a single "Legacy files, superseded by Drawing Repository" link into the real Drawing Repository (already built) instead of reproducing a tab production itself is phasing out. |
| Planning → BOM | Material / Required Qty / Available Stock / Shortage / Est. Price / Est. Cost | `ProjectDetail.tsx` BOM tab, `5184` | Inline summary (shortage count, total est. cost) + deep-link to a full BOM editor screen — this is a real, non-trivial engine (feeds Material Requisitions' shortage detection) and belongs behind the same reuse-boundary pattern as Production/QMS, not fully inlined |
| Planning → Items | Multi-item project line items, via real `ProjectItemsTab` component | `ProjectDetail.tsx` Items tab, `5551`, delegates to `components/ProjectItemsTab.tsx` | **Foundational blocker, not a UI task** — see §16; this prototype's `Project` entity is single-item by original design decision, predating this whole redesign effort. Cannot be added to the hub without first deciding whether to extend the core `Project` model. Flagged as an open decision, §20. |
| Planning → Internal Costing | 13 real cost-category fields + dynamic Extra Costs table, admin-only visibility | `ProjectDetail.tsx` Internal Costing tab, `2848` | Deep-link only — this is real, sensitive (internal-use-only, explicitly not customer-visible), and its own permission boundary; a hub summary card showing just the computed total is reasonable, the editing surface stays a dedicated screen |
| Materials → Requisitions | Real, already built (Module 21) | — | Inline, already correct |
| Materials → Material Usage | Not yet modeled anywhere in this project | `ProjectDetail.tsx` Material Usage tab, `4785` | New gap surfaced by this pass — feeds Internal Costing's `materialCost` calculation; flagged §16/§20 |
| Execution → Production | Real per-project stages, sequential lock | Module 20 | Inline live status + one action (advance), deep-link for the full editor — already the pattern, keep it |
| Execution → Outsourced | Vendor / Material Sent / Qty / Date Sent / Date Received / **Cost** | `ProjectDetail.tsx` Outsourced tab, `3511` | New gap — feeds Profit & Costing's `outsourceCost`; genuinely distinct from Production's internal stage-level vendor send/receive (confirmed: this one tracks cost, that one doesn't); flagged §16/§20 |
| Execution → QMS | Real per-project inspections | Modules 22-26 | Inline live status, deep-link for recording — already the pattern |
| Closure → Delivery | Real, already built (Module 14, filtered) | — | Inline, already correct |
| Closure → Profit & Costing | Revenue − Adjusted Cost (material + labour + outsource + transport + custom + petty-expense, plus manual Add/Reduce adjustments) | `ProjectDetail.tsx` Profit & Costing tab, `5567` | A genuinely deep, real calculation engine spanning 6 other data sources — deep-link only, never inlined; a hub summary card (profit %, one number) is reasonable |
| Closure → Timeline | `project.activityLog`, 16 typed event kinds + manual notes | `ProjectDetail.tsx` Timeline tab, `6066` | **Lower effort than the rest of this list** — a real but simple entity (an array with a type/timestamp/message shape); genuinely feasible to inline as a compact recent-activity strip once built, not just deep-linked |
| — | Invoice/Payment | Real, already built | — | Inline, already correct |
| — | Drawings | Real, already built (Module 27) | — | Inline, already correct |
| — | Originating Quotation | Real, already built | — | Inline, already correct |

### 10.3 The reuse boundary rule (unchanged from Phase 2, restated precisely)

A section is inlined with live status + the single most common action when: the underlying data is already real and built, AND the full edit surface is genuinely large enough to need its own screen's room. A section is summary-card-plus-deep-link when: the data is real but sensitive/permission-scoped (Internal Costing), or the calculation is deep enough that a full page is the honest way to show it (Profit & Costing). A section is explicitly **not** reproduced when: production itself has retired it (Design Files) or the underlying entity doesn't exist yet at the data-model level (Items/multi-item projects, Material Usage, Outsourced cost log) — those are named as open foundational decisions, not UI tasks to schedule casually.

---

## 11. Component System

Every component below: purpose, hierarchy, behavior, states, responsive behavior, accessibility behavior, when to use, when not to. Token references are to `visuallab/tokens.ts`'s `LabTheme.tokens` shape.

### A. Application Shell
**Purpose:** frame every authenticated screen consistently. **Hierarchy:** rail < content < command overlay (z-order). **Behavior:** rail persists across navigation; content region owns its own scroll. **States:** rail collapsed/expanded/mobile-drawer. **Responsive:** rail → icon rail (unchanged) below 1024px, → full drawer triggered by a hamburger below 768px. **Accessibility:** landmark roles (`nav`, `main`) on rail/content; skip-to-content link before the rail. **Use:** always. **Don't:** never nest a second shell inside a dialog or drawer.

### B. Sidebar / Navigation Rail
**Purpose:** module access. **Hierarchy:** group label (uppercase, muted) → item (icon + label on expand). **Behavior:** click icon in collapsed state expands + navigates in one action; active item gets `sidebarActive`/`sidebarActiveText` tokens. **States:** default / active / hover / role-demoted (still visible, unstyled difference — demotion is ordering, not appearance). **Responsive:** see Shell. **Accessibility:** each item has a real `aria-label` (icon-only collapsed state), tab order matches visual order, active item exposed via `aria-current="page"`. **Use:** primary navigation only. **Don't:** never duplicate a rail item as a dashboard shortcut with different behavior — same destination, same result, everywhere.

### C. Role Layer
See §7. Not a separate visual component — an ordering/emphasis function applied to Sidebar and Dashboard KPIs.

### D. Attention Layer
See §8. Renders as a Card (component I) containing a list of Attention Rows: severity icon (danger/warning token color) + title + detail + click-to-navigate, no other affordance.

### E. Command Palette
See §9. A centered Dialog (component P) variant: input + result list, arrow-key navigable, zero-animation.

### F. Top Bar
Not a persistent global element (see §5) — each page's own header (component G) carries what a top bar would.

### G. Page Headers
**Purpose:** identify the page and surface its 1-2 primary actions. **Hierarchy:** title (fontDisplay, fontWeightDisplay) + optional subtitle/breadcrumb, actions right-aligned. **Behavior:** primary action uses the accent-filled Button variant; secondary actions outline. **States:** static. **Responsive:** actions wrap below title on narrow viewports rather than shrinking illegibly. **Accessibility:** `h1` per page, real breadcrumb `nav` with `aria-label="Breadcrumb"`. **Use:** every page. **Don't:** more than 2 primary-looking actions in a header — anything else goes in an overflow menu (component J's pattern, reused here).

### H. KPI / Metric Surfaces
**Purpose:** at-a-glance numeric state. **Hierarchy:** label (small, muted, uppercase) above value (large, fontDisplay). **Behavior:** static display, optionally clickable through to the filtered list it summarizes. **States:** default / warning-toned (when the metric itself signals a problem, e.g. "Needs attention" count > 0) — tone is the success/warning/danger set, never the accent. **Responsive:** grid 4-up desktop → 2-up tablet → 1-up mobile. **Accessibility:** value and label both in the accessible name, not just visually adjacent. **Use:** dashboards, module summary headers. **Don't:** don't put more than 4-5 KPIs in one row — beyond that, it's a table, use component I.

### I. Tables
**Purpose:** the primary data-density surface. **Hierarchy:** header row (muted, uppercase-per-Instrument's-labelClass rule) → data rows, tabular-nums for every numeric column via IBM Plex Mono. **Behavior:** 1-2 explicit primary actions per row (View/Edit as text or icon+label); 3rd+ action collapses into one labeled "More ▾" overflow menu — never bare unlabeled icons, this is the specific fix for the real icon-soup problem confirmed live in production's Quotations screen. Row hover uses `surfaceAlt`. **States:** default / loading (skeleton rows, not a spinner) / empty (icon + message + primary action) / error (icon + message + retry). **Responsive:** below 768px, rows become stacked cards (production's own existing Projects-list mobile pattern, extended to every table) rather than horizontal scroll. **Accessibility:** real `<table>` semantics, `scope="col"` headers, sortable columns expose `aria-sort`. **Use:** any list of 3+ records. **Don't:** don't use a table for fewer than ~5 rows of genuinely tabular data — a card list often reads better at low counts.

### J. Filters
**Purpose:** narrow a table/list. **Hierarchy:** filter row above the table, chips or a compact form. **Behavior:** every filter is reflected in the empty state's message ("No materials match your filters" vs. generic "No materials"). **States:** applied filters show as removable chips. **Responsive:** collapse into a "Filters (n)" button opening a drawer below 768px. **Accessibility:** filter controls are real `<select>`/`<input>`, not custom widgets without keyboard support unless a real one is warranted. **Use:** any table with real, common secondary axes (status, category, date range). **Don't:** don't filter what a search box already covers well.

### K. Search
Two distinct surfaces, never conflated: **inline table search** (component J's sibling, scoped to one list) and the **Command Palette** (global, §9). Inline search is a plain text input with a search icon, debounced, no dropdown suggestions unless the list is large enough to need them.

### L. Forms
**Purpose:** create/edit real records. **Hierarchy:** grouped fields (related fields visually clustered, matching production's own real field grouping — e.g. Company Profile's Bank Details subsection). **Behavior:** production's exact validation and real-time computation (GST math, totals) preserved byte-for-byte; conditional fields use progressive disclosure (reveal only once the governing field is set — e.g. Petty Expenses' 5-category conditional field sets, Employees' employment-type conditional fields) rather than showing every possible field always. **States:** default / field-error (inline, below the field, never a top-of-form-only summary) / saving (button shows a real loading state, disabled) / saved (toast). **Responsive:** dialogs go full-screen below 640px (see component P). **Accessibility:** every input has a visible `<label>` with `for`, required fields marked, errors linked via `aria-describedby`. **Use:** always, for any record creation/edit. **Don't:** never remove a real field to make a form visually shorter — see §17.

### M. Inputs
Text/number/textarea — Instrument's `radiusSm`, `border`, `surface` background, focus state uses a visible outline in the accent color (never `outline: none` without a replacement). Currency/quantity inputs right-align with tabular-nums.

### N. Selects
Native `<select>` by default (matches production, keeps full OS-level accessibility and mobile picker behavior) unless a real search-within-options need exists (e.g. picking from 200+ customers) — only then a custom combobox, and only with full keyboard support.

### O. Date/Time Controls
Native `<input type="date">`/`<input type="time">` — no custom calendar widget unless a specific real workflow needs range-picking (Ledger's date-range filter is the one real candidate already identified in Phase 2).

### P. Dialogs
**Purpose:** focused create/edit/confirm without leaving context. **Hierarchy:** title + close (X) + body + footer actions (Cancel outline, primary action filled). **Behavior:** one shared dialog primitive everywhere — production's exact copy and business behavior preserved per-instance, the chrome is what's unified. **States:** default / saving / error. **Responsive:** full-screen below 640px, centered modal above it. **Accessibility:** focus trapped inside while open, focus returns to the trigger on close, Escape always closes (unless mid-save), `role="dialog"` + `aria-labelledby` the title. **Use:** any focused single-record action. **Don't:** don't stack a second dialog on top of an open one — close the first, or use a drawer (component U) for a genuinely secondary in-context task.

### Q. Confirmation Dialogs
A stricter Dialog variant: no body content beyond the question + consequence text, two actions only (Cancel / Confirm, Confirm styled `danger` for destructive actions). **Critical rule from §17:** only shown where production itself shows one. Payments' real absence of an Edit/Delete confirm (because those actions don't exist there at all) and Petty Expenses' real no-confirm delete (production deletes directly, no dialog) are both preserved exactly — adding an unrequested confirmation step is not a safety improvement, it's an inconsistency with what this same team already decided elsewhere in this same app.

### R. Toasts
**Purpose:** confirm a state-changing action completed. **Hierarchy:** bottom-right, stacked, auto-dismiss 3-5s. **Behavior:** every real state change gets one, no exceptions (Phase 2's Notifications decision) — **and never for a simulated action dressed as real**: "Export generated" must not read identically to a real file download completing; simulated document generation (§16) needs its own honest copy, not a toast indistinguishable from a real success state. **States:** success / error tone (success/danger tokens). **Accessibility:** `role="status"`, `aria-live="polite"`. **Use:** after any create/update/delete/status-change. **Don't:** don't use a toast for anything requiring the user to take a further action — that's a dialog or an inline message.

### S. Status Badges
**Purpose:** show a record's state at a glance. **Hierarchy:** pill shape (`radiusPill`), tinted background + colored text from the success/warning/danger set — **never** the category-tint set, which is reserved for module identity, not record state. **Behavior:** static, non-interactive (clicking the row, not the badge, opens the record). **States:** one per real status value — badges never invent a status the underlying entity doesn't have. **Accessibility:** status conveyed by text, not color alone (color is reinforcement). **Use:** any record with a real status field. **Don't:** don't use a badge for binary yes/no flags — a checkbox or icon reads faster.

### T. Tabs
**Purpose:** switch between views of the same record without navigating away, for the genuinely deep screens that stay dedicated (Production's full editor, QMS's full inspection flow, EmployeeDetail, the Drawing Editor). **Hierarchy:** production's real grouped-tab pattern (e.g. ProjectDetail's own Planning/Materials/Execution/Closure clusters) where a screen has enough tabs to need it. **Behavior:** underline-style active indicator in the accent color. **States:** active / inactive / disabled (permission-gated tab, shown but visibly inert, not hidden — matches the Role Layer's own "demote don't remove" principle). **Responsive:** horizontal scroll on narrow viewports rather than wrapping into two rows. **Accessibility:** `role="tablist"`/`tab`/`tabpanel`, arrow-key navigation between tabs. **Use:** dedicated deep-editor screens only — the Project Workspace hub explicitly does NOT use this pattern (see §10), that's the whole point of the hub.

### U. Drawers
**Purpose:** a secondary, in-context panel that doesn't warrant a full navigation (e.g. a record's linked-item list, a quick filter panel on mobile). **Hierarchy:** slides from the right on desktop, from the bottom on mobile. **Behavior:** dismiss on backdrop click or Escape. **States:** as Dialog. **Accessibility:** as Dialog. **Use:** genuinely secondary content that doesn't need a full Dialog's focus-trap weight. **Don't:** don't use a drawer for the primary create/edit flow — that's a Dialog.

### V. Empty States
**Purpose:** tell the user why a list is empty and what to do about it. **Hierarchy:** icon (muted) + one-line message + primary action if one exists. **Behavior:** message reflects active filters (component J) when relevant, not a generic message that ignores context. **Use:** every list/table, always. **Don't:** don't show a bare "No data" with no next step where a real action exists.

### W. Loading States
**Purpose:** communicate work in progress without a jarring layout shift. **Hierarchy:** skeleton shapes matching the eventual content's real layout (not a generic spinner) for anything taking > ~300ms; a real spinner only for sub-second, genuinely brief waits. **Use:** table loads, dialog saves. **Don't:** don't flash a loading state for < 150ms operations — it reads as noise, not information.

### X. Error States
**Purpose:** communicate what went wrong and how to recover. **Hierarchy:** icon (danger token) + specific message (not "Something went wrong") + retry action where retrying is meaningful. **Use:** failed data loads, failed saves. **Don't:** don't swallow an error into a silent no-op — this app's error states must always be visible.

### Y. Tooltips
**Purpose:** supplementary context for an icon-only control or a truncated value. **Behavior:** appear on hover/focus after a short delay (~500ms) on first use; instant on subsequent tooltips in the same interaction (matches production's own general nicety, if present, or a straightforward addition since it's a real, well-understood pattern). **Accessibility:** available on keyboard focus, not hover-only — this is the specific rule that makes tooltips acceptable at all, since a hover-only affordance fails keyboard users by definition. **Use:** icon-only controls, truncated table cells. **Don't:** don't put essential information only in a tooltip — it must be discoverable without hovering for anything decision-critical.

### Z. Mobile Layouts
See §12.

### AA. Accessibility States
See §13.

### AB. Dark Mode
Both Instrument palettes are complete and independently tuned (§4). Every component above must be verified in both — not just "does it not break," but "is contrast still real" (WCAG AA minimum on every text/background pairing, both palettes, checked independently rather than assuming dark inherits light's correctness).

---

## 12. Responsive System

| Breakpoint | Shell | Tables | Project Workspace | Dialogs |
|---|---|---|---|---|
| Desktop (≥1024px) | Icon rail, hover-to-expand | Full table | Full hub, section anchors as a horizontal chip row | Centered modal |
| Tablet (768-1023px) | Icon rail (unchanged — Instrument's rail is already collapsed-first) | Full table, horizontal scroll if needed | Full hub | Centered modal |
| Mobile (<768px) | Hamburger → full drawer | Stacked cards (production's own existing Projects-list pattern, extended everywhere) | **Priority screen** — single column, KPIs stack vertically, section anchors as a horizontal scroll strip, bottom tab bar replaces the rail entirely (already prototyped live in `visuallab`'s Mobile Demo) | Full-screen |

The Project Workspace is called out explicitly per the user's own instruction: "check on an order" is exactly the task most likely to happen from a phone on a shop floor, so this screen gets first-class mobile treatment, not a shrunk desktop layout.

## 13. Accessibility System

- **Explicit actions everywhere** — no interaction that depends solely on hover (a real fix already applied once, Scrap's row-click-to-edit → explicit Edit button, Phase 1).
- **Full keyboard operability** — every action reachable via Tab/Enter/Escape/Arrow keys; tab order matches visual order.
- **Visible focus** — a real focus ring on every interactive element, never `outline: none` without a replacement.
- **Correct labels** — every form input has a real `<label>`; every icon-only button has a real `aria-label`.
- **Color is reinforcement, never the sole signal** — status badges pair color with text; severity icons pair color with an icon shape (triangle vs. circle) as well as hue.
- **A systematic accessibility pass is scheduled explicitly as Phase 6** (§18) — not assumed to fall out of following the rules above; a real audit (contrast ratios measured, keyboard-only walkthrough, screen-reader spot-check) is required before this ships, not optional polish.

---

## 14. All 31 Modules — Implementation Map

Legend for the **Decision** column carries over from Phase 2 unchanged: **KEEP** (production's UX as-is) / **ADOPT** (prototype's reorganization) / **HYBRID** (combine specific pieces). Columns below add the implementation-specific dimensions this phase asked for; where a module follows the general pattern exactly (same interaction, moved under the approved shell/Instrument skin, no progressive disclosure or workspace integration applicable), that's stated once here rather than repeated 20 times: **unless a row says otherwise, assume — unchanged validation/business logic, Instrument-skinned, table row actions per component I's overflow rule, mobile per §12's stacked-card pattern, no new progressive disclosure beyond what production already has.**

| # | Module | Decision | Deviates from the general pattern how | Belongs in Project Workspace? | Stays a dedicated screen? | Must-preserve (business-critical) | Open decision |
|---|---|---|---|---|---|---|---|
| 1 | Customers | HYBRID | Workspace page (not slide-over) for the 360-view | — | Yes, own workspace | Linked-record delete guard; multi-email/type model | none |
| 2 | Vendors | ADOPT | — | — | Yes, own workspace | Permissive delete rule (warns, doesn't block) | none |
| 3 | Projects (list) | KEEP | — | Entry point to Workspace | Yes, list | Repeat-order badge display; assigned-employee visibility rule | none |
| 3d | Project Detail / Workspace | HYBRID | **The flagship — full spec §10** | — | Hub + deep-links | All 12 tabs' capability per §10.2's table | Multi-item Project model (§20) |
| 4 | Quotations | HYBRID | Dialog gets more room for 6+ line items (component L) | Summary card only | Yes, full editor | Real-time GST math; revision history; PO auto-matching on Record PO | none |
| 5 | Customer POs | KEEP | — | Summary in Workspace | Yes, list | Status workflow; file attachment viewing | none |
| 6 | Invoices | KEEP | — | Inline, already correct | Yes, full editor | Tax model; real PDF output; reminder scheduling | Real document generation (§16) |
| 7 | Payments | KEEP | Real absence of Edit/Delete preserved exactly (see component Q) | Inline, already correct | Yes, list | Overpayment guard; Receivables reminder tab | none |
| 8 | Payables | KEEP | — | — | Yes, list | Status computation; overpayment guard; payment-attachment upload | none |
| 9 | Inventory | HYBRID | Reserved/Available split (already restored Phase 2/3) | Summary in BOM section | Yes, dense table (component I reference implementation) | **Reserved/Available split** — now real | none |
| 10 | Machinery | KEEP | — | — | Yes, list | MachineDetail subsystem — **still unaudited, close before implementing** | Audit MachineDetail.tsx (§19) |
| 11 | Tools | KEEP | — | — | Yes, list + History drawer | Full History panel (Issue/Reassign/Return) | none |
| 12 | Tooling / Dies | KEEP | — | — | Yes, list | "Must link a drawing" create rule; purchase cost/vendor fields | none |
| 13 | Employees | KEEP (list) / **DO NOT REDESIGN** (detail) | — | — | Yes, EmployeeDetail unchanged | **Entire payroll/ID-card/Advances/Documents subsystem — see §17** | none |
| 14 | Delivery Challans | KEEP | — | Inline, already correct | Yes, full editor | Multi-project dispatch-cap logic; real PDF/share output | Real document generation (§16) |
| 15 | Company PO (vendor) | HYBRID | — | — | Yes, full editor | **Real per-line-item Receive → resourceType(inventory/tool/machine/die) creation flow — see §17** | none |
| 16 | Petty Expenses | HYBRID | **Settle-Float flow now built as a representative screen, §15** | Feeds Internal Costing's `pettyExpenseCost` | Yes, list + Settle dialog | Itemized Settle-Float flow, 5 conditional category forms | none |
| 17 | Machine Revenue | KEEP | — | — | Yes, list | Insert-only rate history; frozen `rateApplied` | none |
| 18 | Scrap | ADOPT | — | — | Yes, list | Full parity already; explicit Edit button (real a11y fix) | none |
| 19 | Ledger | KEEP | — | — | Yes, aggregation view | Aggregation engine exactness | Real export files (§16); custom date-range picker |
| 20 | Production | HYBRID | Inline summary + deep-link, per §10 | Inline, live status + advance action | Yes, full stage editor | Sequential lock; **QMS gate check; rework flow; material-availability check — not yet built anywhere, real safety mechanisms** | Build QMS↔Production gate wiring (§20) |
| 21 | Material Requisitions | KEEP | — | Inline in Materials section | Yes, list | Filter-tab-with-count; feeds from real BOM shortage (§10.2) | Build real BOM engine (§20) |
| 22-26 | QMS suite | HYBRID | Inline summary + deep-link, per §10 | Inline, live status | Yes, full inspection flow | 11-status legal-transition table; **insert-only audit trail — currently only latest result kept, real compliance gap** | Insert-only attempts table (§20) |
| 27 | Drawing Repository / Editor | HYBRID (Repository) / **DO NOT REDESIGN** (Editor) | — | Inline, already correct | Yes, both halves | **Entire Editor canvas engine — fabric.js/pdf.js, confirmed infeasible to rebuild, see §17** | none |
| 28 | Export Engine | KEEP | — | — | Yes, standalone | Section manifest and defaults | Real file generation (§16) |
| 29 | Settings | KEEP | — | — | Yes, standalone | Real permission-matrix editor | none |
| 30 | AI Agent | **DO NOT REDESIGN (architecture)** | — | — | Yes, standalone | **Full 31-action registry; real LLM chat as primary surface once backend exists — see §17** | LLM backend infrastructure, outside this project's scope entirely |
| — | Dashboard | HYBRID | Bounded Recent Projects (was unbounded) + new Recent Quotations panel | — | Yes, home | Exception list; role-tailored KPIs; Order Pipeline | none |

---

## 15. Representative-Screen Specifications

Built this phase in a new isolated **UX Implementation Lab** (`uxlab/implementationlab/`), Instrument-skinned, using the same real mutable mock store as every prior lab — not a disconnected duplicate. Design validation screens, explicitly not production implementation.

| Screen | What it demonstrates | Source |
|---|---|---|
| Dashboard | §8 Attention Layer + Role Layer KPIs + bounded Recent panels, Instrument-skinned | Reused from `decisionlab/screens/FinalDashboard.tsx`, reskinned |
| Projects list | New this phase — real store data, Instrument table (component I) | New |
| Project Workspace | §10's flagship, Instrument-skinned | Reused from `decisionlab/screens/FinalProjectWorkspace.tsx`, reskinned |
| Quotations | Component L's dialog-room fix, real GST math | Reused via `ModuleRouter`, reskinned |
| Inventory | Component I reference implementation — the dense table | Reused, reskinned |
| Production | §10.3 reuse-boundary pattern | Reused, reskinned |
| QMS | §10.3 reuse-boundary pattern | Reused, reskinned |
| **Petty Expenses** | **New this phase — the real Settle-Float flow, built for real, not just specified** | New, §16 |
| Finance (Invoices) | KEEP decision demonstrated | Reused, reskinned |
| Settings | Real permission-matrix editor, KEEP decision demonstrated | Reused, reskinned |
| AI Agent | Classic-mode parser, KEEP-intent decision demonstrated | Reused, reskinned |
| Complex dialog | QMS inspection recording | Reused, reskinned |
| Dense table | Inventory (same as above, called out per the user's explicit list) | Reused, reskinned |
| Mobile screen | §12's target pattern, Project Workspace | Reused from `decisionlab/screens/MobileDemo.tsx`, reskinned |
| Dark mode | A light/dark toggle across every screen above, not a separate screen | New — toggle added to the lab shell |

## 16. Production Functionality Preservation Matrix

Every item below is a specific, named piece of real functionality this blueprint commits to not losing, cross-referenced to where it's addressed:

| Capability | Where it's real | Where it's addressed in this blueprint |
|---|---|---|
| Real document generation (PDF/print for Quotations, Invoices, Delivery Challans, Company PO, Ledger, Export Engine) | Production's `documentRenderers.tsx`/`documentUtils.ts` | **Not solved by this phase.** Every document-producing module across all 3 prior phases has used a toast simulation. This must become a real implementation concern before Phase 9 touches any of those 6 modules — flagged as the single largest cross-module functional gap in the entire project. |
| Multi-item projects | `components/ProjectItemsTab.tsx` | Blocked on a core data-model decision (§20) — cannot be added to the Project Workspace hub without first deciding whether `Project` becomes multi-item at the schema level. |
| Real BOM shortage-detection engine | `ProjectDetail.tsx` BOM tab, `5184` | Not yet built; Material Requisitions currently assumes shortages exist rather than deriving them. §20. |
| Internal Costing's 13-category cost sheet | `ProjectDetail.tsx`, `2848` | Real, admin-only, feeds Profit & Costing — deep-link only in the hub (§10.2), not simplified. |
| Outsourced Work's real cost log | `ProjectDetail.tsx`, `3511` | Not yet built anywhere; feeds Profit & Costing's `outsourceCost`. §20. |
| Profit & Costing's real 6-source calculation engine | `ProjectDetail.tsx`, `5567` | Not yet built anywhere; deep-link only, never a simplified inline summary standing in for the real math. §10.2. |
| Company PO's real per-line-item Receive flow (resourceType-aware creation across Inventory/Tools/Machines/Dies) | `components/ReceiveCompanyPoItemDialog.tsx` | Not yet built; §17, must not be simplified to a plain status toggle. |
| EmployeeDetail's full payroll/ID-card/Advances/Documents subsystem | `pages/EmployeeDetail.tsx`, 5 real tabs | **Do not redesign or rebuild** — §17. |
| Drawing Editor's canvas annotation engine | `drawingEditor/pages/DrawingEditorPage.tsx` | **Confirmed infeasible to rebuild in this stack** — §17. |
| QMS's insert-only audit trail (attempt rounds, rectification tracking, photo evidence) | `qms/store/useQmsStore.ts` | Not yet built; current state is real, history is not. §20. |
| AI Agent's full 31-action registry behind a real LLM | `agent/actions.ts`, `agent/llm/orchestrator.ts` | **Architecturally blocked on backend infrastructure outside this project's scope** — §17. |
| Inventory Reserved/Available split | `pages/Inventory.tsx` | **Already restored** (Phase 2/3) — confirmed matches production's real `quantityAvailable` field naming, verified by this pass's re-grounding. |
| Real permission enforcement (server-side) | RLS + `permissions.ts` | Untouched by this entire project — the Role Layer is presentation-only by explicit design, §7. |

## 17. "Do Not Redesign" List

Explicit, not implied. A mature enterprise interaction that already works survives:

1. **EmployeeDetail's entire subsystem** — ID Card, attendance-driven payroll calculation, e-signed Advances, categorized Documents. Real, used daily, no prototype equivalent exists across 3 phases of trying, and it shouldn't — this is a specialist payroll interface, not a generic CRUD screen.
2. **Drawing Editor's canvas annotation engine** — fabric.js/pdf.js-based, confirmed categorically infeasible to rebuild in a React/mock-store context across two separate audit passes. The Repository half (metadata, linking) is real and already redesigned; the Editor half is not touched.
3. **QMS's deep compliance mechanisms** once built (§20) — an insert-only audit trail is a regulatory/compliance pattern, not a UX preference; when implemented, it must be append-only at the data layer, and no visual redesign should compromise that property.
4. **Company PO's Receive flow's real cross-module resource creation** — the four-way resourceType branch (inventory/tool/machine/die) is complex because the real underlying operation is complex; simplifying the UI must not simplify away any of the four paths.
5. **Real document generation, once built** — whatever renders the actual PDF/print output must not be redesigned into a preview-only or lower-fidelity experience for the sake of a cleaner-looking button.
6. **The AI Agent's real LLM-first architecture intent** — Classic mode is production's own honest fallback for a missing backend, not a design choice to preserve as the final state; when a backend exists, the real target is the LLM chat surface, and this blueprint's job was never to design a permanent alternative to it.
7. **Production's exact validation/business-rule copy and confirm-dialog wording**, everywhere — component Q's rule; consistency of chrome, not homogenization of business logic.

## 18. Implementation Phases (order, not authorization)

| Phase | Scope | Depends on |
|---|---|---|
| 1 | Design tokens / foundations — Instrument tokens as real CSS custom properties in the production build, not inline-style-per-component | §4 |
| 2 | Application shell (rail, content region, command overlay skeleton) | Phase 1 |
| 3 | Navigation / Role Layer wired to real production permissions | Phase 2, §6-7 |
| 4 | Attention Layer wired to real production data sources | Phase 3, §8 |
| 5 | Command Palette | Phase 2, §9 |
| 6 | Shared components (I-Y) + **the systematic accessibility pass**, once, for every shared primitive before it's used 31 times | Phase 1 |
| 7 | Dashboard | Phases 4, 6 |
| 8 | Project Workspace — built in the order §10.2's table lists (already-real sections first, then Timeline as the lowest-effort new addition, then the genuinely deep new engines) | Phases 6-7, and resolves the open decisions in §20 as each section is reached, not all at once up front |
| 9+ | Module-by-module migration, in the order of §14's table — KEEP modules first (lowest risk, validates the shell/component system against real screens fastest), HYBRID modules next, the "do not redesign" modules (§17) last and touched only for shell/theme integration, never their internals |

Complex specialist systems (EmployeeDetail, Drawing Editor, AI Agent) are migrated for shell/theme consistency only, never reimplemented, matching §17.

## 19. Migration / Risk Strategy

- **Machinery/MachineDetail is still unaudited** across all 4 phases of this project. Close that audit before Phase 9 reaches it — implementing against an unverified module risks silently dropping something nobody has checked yet.
- **Every KEEP-decision module** (15 of 31, per Phase 2's matrix) is the safest migration order precisely because its interaction pattern is already proven identical to production — these validate the shell/token system against real screens with the least risk of a functional regression, and should go first for that reason, not because they're easiest.
- **Real document generation** (§16) is the single largest cross-cutting functional gap; it blocks true completion of 6 modules (Quotations, Invoices, Delivery Challans, Company PO, Ledger, Export Engine) and should be scoped as its own infrastructure workstream, not bundled into any one module's migration.
- **Rollback:** because this phase builds nothing inside production, there is nothing to roll back yet — the actual migration-phase risk strategy (feature flags, staged rollout, per-module rollback) is Phase 9+'s own concern and should be specified when that phase is authorized, not guessed at here.

## 20. Open Decisions (require the user's input before the relevant module can be implemented)

1. **Multi-item projects** — does `Project` become multi-item at the schema level, or does Items stay a secondary line-item list attached to a still-single-item project record? This is a real data-model decision, not a UX one, and blocks the Items section of the Project Workspace hub.
2. **BOM auto-generation engine** — build the real shortage-detection engine (watches Inventory against a project's material list), or keep Material Requisitions as a manually-curated list indefinitely?
3. **Outsourced Work + Internal Costing + Profit & Costing** — build all three real calculation engines (they're interdependent — Outsourced feeds Costing feeds Profit), or scope a reduced version first? These are genuinely large, genuinely real, and this blueprint does not have the authority to simplify them unilaterally.
4. **QMS insert-only audit trail** — build the real append-only attempts table with photo evidence, or accept current-state-only as the long-term shape? This has compliance implications outside a pure UX decision.
5. **Production↔QMS gate wiring** — should completing a production stage actually check QMS pass/fail status once both sides are real, closing the loop Phase 1/2 both disclosed as unwired?
6. **Real document generation infrastructure** — what's the actual rendering approach (server-side PDF service, client-side library, existing `documentRenderers.tsx` reused as-is)? This is an infrastructure decision this UX blueprint cannot make alone.
7. **AI Agent backend** — entirely outside this project's scope (needs a server-side LLM key holder), named here only so it's not silently forgotten as "someday."

---

## 21. QA / Acceptance Criteria

Before any module is considered migrated (Phase 9+), it must pass:

- [ ] **Functionality:** every field, action, validation rule, and calculation from the production source matches, verified against the actual production screen, not the audit document alone.
- [ ] **UX:** the specific workflow named in §14's table is measurably faster or equally fast — never slower — for its real primary task.
- [ ] **Discoverability:** a new user can identify the primary action without hunting, verified by a fresh-eyes walkthrough, not assumed from the design.
- [ ] **Efficiency:** click/navigation count for the module's top 1-2 real tasks is counted before and after — regressions are not acceptable trade-offs for visual cleanliness (§17's explicit rule).
- [ ] **Density:** an experienced operator can complete a real batch of the module's core task at least as fast as in production.
- [ ] **Error prevention:** every real guard (overpayment, linked-record delete blocks, duplicate warnings) is verified present and firing correctly.
- [ ] **Accessibility:** keyboard-only walkthrough completed; contrast checked in both Instrument palettes; screen-reader spot-check on the module's primary flow.
- [ ] **Responsive:** verified at the three breakpoints in §12, not just "doesn't visually break."
- [ ] **Consistency:** uses the shared component system (§11) exclusively — no one-off styling that diverges from Instrument's tokens.
- [ ] **tsc / lint / build:** clean, matching this whole project's established baseline discipline.
- [ ] **Live verification:** checked in a genuinely fresh browser tab, not a tab with accumulated HMR history — the specific anti-false-positive discipline this project has used since Phase 1.

---

## Sign-off gate

This document, its companion `FINAL_UX_DECISION.md`, and the representative screens in `uxlab/implementationlab/` are the complete Phase 4 deliverable. Production has not been modified. No module migration has begun.

**Do not begin implementation until the user says exactly: "APPROVED — BEGIN PRODUCTION IMPLEMENTATION."**
