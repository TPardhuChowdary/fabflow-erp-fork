# FabFlow — Final UX Decision (concise)

For an engineer/agent picking up implementation. Full reasoning: `FINAL_UX_IMPLEMENTATION_BLUEPRINT.md`. Full UX reasoning: `../decisionlab/UX_CONSOLIDATION.md`. Full visual reasoning: `../visuallab/VISUAL_SYSTEM.md`.

**Status: NOT APPROVED FOR PRODUCTION.** Wait for the exact phrase "APPROVED — BEGIN PRODUCTION IMPLEMENTATION" from the user before touching `src/frontend/src/pages/` (outside `design-lab/`), `components/`, `store.ts`, or any production file.

## The formula

```
FINAL UX = real production functionality + approved UX architecture + Instrument visual system + only proven UX improvements
```

## What's locked (do not re-decide)

- **UX architecture:** grouped role-aware sidebar, Attention Layer (real exception list, not a static banner), Command Palette (⌘K, zero-animation, Escape closes), Project Workspace as a single-scroll hub with restored section anchors, Tables use 1-2 explicit actions + one overflow menu (never bare icon clusters), production's exact validation/confirm copy everywhere.
- **Visual system:** "Instrument" — steel-teal accent (`#1f6f78` light / `#5fb0b8` dark), elevated warm neutrals (never stark white/black), IBM Plex Sans + Mono, 10/6/pill radius, two independently-tuned palettes (dark is not an inversion). Full spec: `visuallab/tokens.ts`.

## What changed this pass (re-grounding correction)

**"Design Files" is not a gap.** Production itself retired that tab in favor of the Drawing Repository (already built, Module 27). Don't build a "Design Files" section — link to Drawing Repository instead.

## The flagship: Project Workspace

Single scroll, section anchors (Planning/Materials/Execution/Closure) instead of 12 separate page loads. Reuse boundary: inline + one action for already-real, already-sized-right data (Production, QMS, Requisitions, Delivery, Invoice, Drawings, Quotation); summary card + deep-link for real-but-sensitive-or-deep data (Internal Costing, Profit & Costing); explicitly not built where production itself retired it (Design Files) or the data model doesn't exist yet (Items/multi-item, Material Usage, Outsourced cost log, BOM engine). Full table: Blueprint §10.2.

## Do not redesign, at all

EmployeeDetail (payroll/ID-card/Advances/Documents). Drawing Editor's canvas engine (confirmed infeasible to rebuild). QMS's audit trail once built (compliance pattern, not a UX preference). Company PO's 4-way Receive resourceType branch (don't simplify away any of the 4 paths). Real document generation, once built (don't downgrade fidelity for a cleaner button). AI Agent's LLM-first intent (Classic mode is production's own fallback, not the target end state).

## Biggest cross-cutting gap

**Real document generation.** Every Print/Download/Share across 3 phases has been a simulated toast. Blocks true completion of Quotations, Invoices, Delivery Challans, Company PO, Ledger, Export Engine. Scope as its own infrastructure workstream, not bundled into any one module.

## 7 open decisions that need the user, not an engineer's judgment call

1. Multi-item projects — does `Project` become multi-item at the schema level?
2. Build the real BOM shortage-detection engine, or keep Requisitions manually-curated?
3. Build Outsourced Work + Internal Costing + Profit & Costing (interdependent, genuinely large), or scope reduced first?
4. Build QMS's real insert-only audit trail, or accept current-state-only long-term?
5. Wire Production↔QMS gate (stage completion checks QMS pass/fail)?
6. Real document generation approach — server PDF service vs. client-side vs. reuse existing `documentRenderers.tsx`?
7. AI Agent backend (LLM key holder) — outside this project's scope; named so it isn't forgotten.

## Implementation order (once approved)

Tokens → Shell → Nav/Role Layer → Attention Layer → Command Palette → shared components + one systematic a11y pass → Dashboard → Project Workspace → module-by-module (KEEP modules first — lowest risk, validates the shell fastest — then HYBRID, "do not redesign" modules touched for shell/theme only, last).

## Acceptance bar for every migrated module

Functionality matches production (verified against the actual screen, not the audit doc). Never slower for the module's real primary task. tsc/lint/build clean. Verified live in a genuinely fresh tab. Full checklist: Blueprint §21.
