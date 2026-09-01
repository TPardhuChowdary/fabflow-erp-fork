# FabFlow — Visual System Decision

**Phase 3 of the ongoing redesign** (see `../decisionlab/UX_CONSOLIDATION.md` for Phase 2, the approved UX architecture this visual system is being designed FOR). Production stays completely untouched; nothing here is applied until explicitly approved. Explicitly out of scope: re-litigating the UX architecture itself — navigation shape, the Attention Layer, the Project Workspace hub, etc. are treated as decided.

**Inputs:**
- The 6 existing Design Lab visual directions (`../../themes.ts`), each pointed at a real source reference, evaluated exactly as they already exist — none were altered for this evaluation.
- Current (Aug 2026) research on enterprise/SaaS dashboard and ERP design trends — searched live, not recalled from training data; sources at the bottom of this file.
- The approved Final UX Blueprint's actual demands: dense multi-column tables (Inventory), real-time-computed forms (Quotations), a grouped role-aware sidebar, an Attention Layer needing genuine severity color, a Command Palette, a 4-section Project Workspace hub, all-day daily use by shop-floor and office staff alike.

## 1. The six directions, judged against what this specific app needs

| Style | Core idea | Fit for a dense, all-day, real ERP | Verdict |
|---|---|---|---|
| **01 — Warm Clinical** | Cream backdrop, black floating sidebar, pastel category coding, bold Jakarta Sans display type | Pastel fills reduce table legibility at real column counts (Inventory has 10). Bold display type is right for headlines, wrong for data. The floating dark sidebar is genuinely handsome but doesn't match the approved grouped/collapsible nav shape as directly as Style 02. | Borrow the category color-coding idea; don't adopt the surface treatment wholesale. |
| **02 — Quiet Utility** | Thin icon rail (collapsed by default), single accent, near-zero visual noise, subtle shadow, quiet type | This is the closest fit in the set. The rail-by-default nav is *more* aggressive than the Blueprint's own "collapse below 1024px" recommendation — in a good way, given how many modules this app has. Restraint matches "used 8 hours a day" better than any other style here. | **Strongest single-direction fit — the base this system builds from.** |
| **03 — Flat Signal** | Flat pastel block fills, no shadow, moderate radius, blue accent | Confident, modern, but "color carries category meaning" as a *primary* surface treatment collides with the Attention Layer's need for a *separate* severity-color system (critical/warning/success). Two color systems fighting for the same visual channel is a real usability risk, not a style preference. | Borrow the flat-fill confidence for status chips only; reject as the primary surface language. |
| **04 — Radical Minimal** | No sidebar, huge type, near-monochrome, hairline borders | Directly **incompatible** with the approved architecture — the Blueprint's own Navigation decision (Phase 2) is a grouped, collapsible sidebar; a topbar-only layout would mean re-opening a decision already made. Its typographic principle (bigger type doing real hierarchy work, fewer/wider table columns) is worth keeping independent of the layout shape. | Reject as a full system. Keep the typographic discipline. |
| **05 — Raw Brutalist** | Zero radius, thick black borders, monospace body copy throughout, stark B/W + one red | Monospace for *body copy* — not just data — is a real readability cost for anyone reading a workDescription field or a QMS note for more than a few seconds. Thick borders on every container would make a 10-column table look like a spreadsheet fighting itself. This is the weakest functional fit in the set; its own aesthetic commitment (raw, unstyled) actively works against the calm, scannable surface a daily-use tool needs. | **Reject.** The one direction not worth adopting any part of, including for accents — being honest that "different" isn't automatically "better" here (this style earns exactly that judgment). |
| **06 — Sketchbook** | Warm paper tones, hand-drawn/rounded feel, playful accent shapes | The style's own principles admit it: *"this is the direction most at odds with dense daily data entry."* Correctly self-scoped to accents and illustration in the original design — that scoping is the right call, not a weakness to fix. | Reject as a system; the instinct to keep personality out of data-dense surfaces is worth carrying forward as a rule, not a screen. |

**Read plainly:** one direction (02) is a strong base. Three directions (01, 03, 04) each contribute one real, specific idea worth keeping. Two directions (05, 06) are correctly rejected — not because they're unfamiliar, but because their own core commitments (monospace-everywhere; deliberately reduced information density) work against a tool used for hours a day to run a fabrication shop.

## 2. What August 2026 research actually says

Searched live (not recalled) — enterprise SaaS/dashboard design trends and typography/color/accessibility trends, both dated 2026. Four findings that changed this recommendation, not just decorated it:

1. **Dark-mode-first is now the enterprise default for all-day tools**, light mode treated as the variant, not the primary. None of the 6 existing directions define a dark variant at all — this is a genuine gap this phase closes, not an aesthetic add-on.
2. **Elevated, "soothing" neutrals are replacing stark white/black** — reduces visual fatigue over long sessions. This directly argues against Radical Minimal's pure `#ffffff`/`#0a0a0a` and validates Quiet Utility's and Warm Clinical's warmer-neutral instinct, applied more restrainedly than either.
3. **Progressive disclosure is the load-bearing pattern for real information density** (not more chrome, not smaller text) — validates the Blueprint's own Tables decision (1-2 explicit actions, the rest behind one overflow menu) as the right call, and extends it: dense tables should default to showing less, with a clear, discoverable way to reveal more.
4. **Variable fonts are now universally supported** and are doing more structural work — one font family, many weights/widths, instead of separate display/body families fighting for consistency. **Role-aware layouts** and **AI output as a first-class surface, not a floating widget** were also named as 2026 differentiators — both already exactly match the Blueprint's Role Layer and AI Briefing/Agent decisions from Phase 2, which is a genuine validation of that architecture, not a new visual finding.

Sources: [Dashboard Design Trends 2026 (Fuselab)](https://fuselabcreative.com/top-dashboard-design-trends-2025/), [Enterprise UX Design Guide 2026 (Fuselab)](https://fuselabcreative.com/enterprise-ux-design-guide-2026-best-practices/), [UI Color Trends to Watch in 2026 (Updivision)](https://updivision.com/blog/post/ui-color-trends-to-watch-in-2026), [The Modern Color Palette: UI/UX Color Trends That Define 2026 (Recursion)](https://recursion.software/blog/ui-color-trends-2026), [UI Design Trends You Will See Everywhere in 2026 (Medium/AcmeMinds)](https://medium.com/@ampldm2025/ui-design-trends-you-will-see-everywhere-in-2026-1aef9a9d2736).

## 3. The recommendation: "Instrument"

Named for what the app actually is underneath the screens — a precision instrument panel for a fabrication shop, not a consumer product. Built as an evolution of Style 02 (Quiet Utility), not a from-scratch 7th direction — the base was already the strongest fit; this phase's job was closing its real gaps, not replacing it.

**What it keeps from Quiet Utility:** the collapsed-by-default icon rail, one restrained accent, subtle-not-absent shadow, quiet type with hierarchy from weight rather than size jumps.

**What it adds, and why:**
- **A real dark mode, designed first, not inverted after the fact.** Both palettes below are complete, independent token sets — dark is not `light` with the lightness values flipped; contrast and hue were re-tuned for each surface independently, matching the 2026 finding that dark-mode-first tools need their own considered palette.
- **Warm Clinical's category color-coding, scoped correctly.** A small set of soft, low-saturation module tints (Sales/Procurement/Production/Finance/Quality) exists ONLY for badges and tags identifying which part of the app a record belongs to — never for primary surface fills, never competing with the Attention Layer's severity colors (success/warning/danger stay a completely separate, higher-saturation set, exactly per the Blueprint's own Tables/Attention reasoning).
- **Radical Minimal's typographic discipline, without its layout.** Real hierarchy comes from a deliberate type scale and weight, not decoration — dense tables get real line-height and column width, not just smaller text crammed tighter.
- **One accent, chosen away from the two most over-used enterprise defaults.** Not the "AI-purple" gradient cliché, not another generic SaaS blue — a deep steel-teal, chosen because it reads as precision/instrumentation (the literal subject matter: gauges, calibration, steel) without tipping into a themed or juvenile palette. Used sparingly — active nav state, primary buttons, links — exactly as Quiet Utility's own principle already argued for.
- **IBM Plex Sans / IBM Plex Mono**, both genuine variable-font families with real engineering/technical design heritage (IBM Plex was designed as IBM's own technical-documentation typeface) — a considered choice for a fabrication-shop ERP, not a default reach. Plex Mono carries every tabular figure (quantities, currency, project/PO/SKU codes) with `font-variant-numeric: tabular-nums`, so columns of numbers actually align.
- **A tightened radius scale** (10px cards / 6px inputs+badges / pill for status chips only) — softer than Brutalist's zero, tighter than Sketchbook's or Warm Clinical's rounded-friendly scale, landing on "precise" rather than "playful" or "harsh."

## 4. Concrete token spec

See `tokens.ts` for the full machine-readable spec (both palettes, in the same `LabTheme` shape as the original 6, so they render through the identical preview mechanism). Named values, light mode:

| Token | Value | Note |
|---|---|---|
| Page background | `#f4f3f0` | Elevated warm neutral, not stark white — 2026 finding #2 |
| Surface | `#ffffff` | Cards/tables |
| Border | `#e2e0d8` | Hairline, 1px |
| Text | `#1a1917` | Warm near-black |
| Text muted | `#69665d` | |
| Accent | `#1f6f78` | Deep steel-teal — deliberately not purple, not generic SaaS blue |
| Success / Warning / Danger | `#2f8f5b` / `#c98a2c` / `#c1443a` | Kept fully separate from the accent and from category tints |
| Radius (card / input / pill) | `10px` / `6px` / `999px` | |
| Type | IBM Plex Sans (UI) + IBM Plex Mono (data) | Both variable |

Dark mode is a complete second palette in `tokens.ts`, not a mechanical inversion — surfaces step up in lightness from the page background rather than down, matching how real dark-mode-first tools (the kind named in the 2026 research) are built.

## 5. What this phase built to prove the recommendation

Two layers, both switchable across all 8 systems (the 6 originals + Instrument light/dark) so the recommendation is checkable against the alternatives, not just asserted:

- **The existing Design Lab harness** (`../../ShowcaseTemplate.tsx`), reused unmodified rather than rebuilt: dashboard KPI row, a real project-shaped dense table with status badges, tabs, a New Project dialog with real form fields, and loading/empty/error states. This is what makes the 8-way comparison fair — same renderer, only the theme differs.
- **`InstrumentExtras.tsx`**, new this phase, covering the specific Blueprint content that harness doesn't: the Attention Layer exception list with real severity color kept separate from the accent, the real Inventory field set (Material/Category/Total/Reserved/Available/Reorder At) with the Reserved/Available split restored in this same pass, and a Command Palette overlay — verified live to open/close with zero animation delay and close on Escape, independent of which theme is active (a keyboard-driven surface used hundreds of times a day should never wait on a transition).

## Status

- [x] Six existing directions evaluated against the approved architecture's actual demands
- [x] Live 2026 research incorporated (dark-mode-first, elevated neutrals, progressive disclosure, variable type)
- [x] Final recommendation ("Instrument") specified as a complete light + dark token pair
- [x] Representative screens built, switchable across all 8 systems (6 originals + Instrument light/dark) for direct comparison — verified live, including the Command Palette's open/Escape-close behavior
- [x] `VisualSystemLab.tsx` wired into `App.tsx`/`Layout.tsx`/`types.ts` (additive nav entry, same pattern as every other Design Lab page)
- [x] tsc/Biome/`vite build` clean; live-verified
- [x] Published readable artifact

This file is the working source of truth for this phase, mirroring how `PARITY_TRACKER.md` and `decisionlab/UX_CONSOLIDATION.md` worked for the prior two phases.
