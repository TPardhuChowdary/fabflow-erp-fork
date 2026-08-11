# FabFlow QMS — Architecture Specification v1.0

Status: **Design only — no implementation yet**, per constraint in the originating request.
Scope: A standalone Quality Management System module for FabFlow ERP. Existing modules (Products, Inventory, Purchasing, Sales, CRM, Finance, HR, Production, Work Orders, Customers, Vendors) are not redesigned. This document is the pre-implementation review artifact — the 15 deliverables requested, in order.

**Architecture direction (per decision):** *Client-first now, backend-ready design.* The QMS ships entirely inside the browser today, matching FabFlow's offline-first philosophy, but every internal seam is drawn where a real backend will later slot in without a rewrite of call sites.

---

## 0. Required Integration Points (documented before any implementation, per constraint)

This is the complete list of every place QMS touches existing ERP code. Everything not listed here is untouched.

| # | Touch point | Existing file | Nature of touch | Why unavoidable |
|---|---|---|---|---|
| 1 | Read `Project`/`Product` fields (id, customerId, material, drawing rev, routing/stages) | `types.ts`, `store.ts` (read-only) | **Read-only reference**, no write | QMS plans are generated *from* product data |
| 2 | Read `Customer` fields (id, name) for customer-scoped overlays | `store.ts` (read-only) | **Read-only reference** | Customer-specific characteristics need a customer key |
| 3 | Read `Employee`/`AuthUser` fields (id, role) for inspector/approver assignment | `store.ts`, `AuthContext.tsx` (read-only) | **Read-only reference** | Inspection records need a real inspector identity |
| 4 | **Stage-progression guard** on the "Move Qty →" action in `ProjectDetail.tsx` (production movement) | `ProjectDetail.tsx`, `store.ts` (`addProductionMovement`) | **One additive guard call**: `if (!qmsApi.isGateOpen(projectId, stageId)) return;` before the existing movement logic runs | This is the *only* place a hard business-logic decision ("can production continue") must be enforced, and gating is explicitly required ("no bypass without authorization"). Everything else in `addProductionMovement` is unchanged. |
| 5 | Page routing registration | `App.tsx` (`Page` union type), `Layout.tsx` (sidebar entries) | **Additive only** — new page string values, new nav links | Same pattern every existing page already uses; no existing route logic is touched |
| 6 | `permissions.ts` | Add new module keys (`quality_characteristics`, `quality_gates`, `inspection_plans`, `inspection_execution`, `ncr`, `capa`) to the existing `PERMISSIONS` map | **Additive only** — new keys, existing modules/roles unchanged | Reuses the existing permission system rather than inventing a second one |

Everything else — the characteristic library, plans, inspection execution, defects, NCR, CAPA, analytics — lives in a **separate, isolated persistence layer** (Section 2) and a **separate module folder** (Section 8). It does not touch `store.ts`'s `Store` interface, `restoreFromBackup()`, or `merge()`, and it does not share the `"fabflow-erp-store"` localStorage key.

**Note on existing quality-adjacent fields:** `ProjectProductionStage` already has informal `okQty`/`rejectedQty`/`reworkQty`/`isRework` fields (types.ts:519-523). QMS treats these as **legacy Production-owned counters** — it may read them for dashboard context but never writes to them. QMS's `InspectionResult`/`Defect`/`NCR` records are the single source of truth for quality data going forward; migrating the legacy counters is out of scope here.

---

## 1. Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FabFlow ERP (existing)                      │
│  Zustand store → localStorage["fabflow-erp-store"]                   │
│  Projects · Customers · Employees · Production · Invoices · etc.     │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ read-only reference reads
                                 │ (productId, customerId, employeeId)
                                 │ + 1 guard call (Section 0, row 4)
┌───────────────────────────────▼───────────────────────────────────────┐
│                         QMS Module (new, isolated)                    │
│                                                                        │
│  ┌──────────────┐   ┌───────────────┐   ┌────────────────────────┐   │
│  │  qms/pages    │   │  qms/store     │   │  qms/api (adapter)     │   │
│  │  (UI, React)  │──▶│  (Zustand,     │──▶│  pure async functions,  │   │
│  │               │   │   QMS-only)    │   │  today: IndexedDB       │   │
│  └──────────────┘   └───────┬───────┘   │  tomorrow: HTTP/backend │   │
│                              │            └────────────────────────┘   │
│                              ▼                                         │
│                    IndexedDB ("fabflow-qms" DB, Dexie.js)              │
│                    (separate from localStorage, own quota,             │
│                     scales to 100s of MB — required for 10k+ chars)    │
└─────────────────────────────────────────────────────────────────────┘
```

**Why a second store, contrary to the existing "one store" rule:** FabFlow's convention is one Zustand store for the whole ERP. QMS deliberately breaks that pattern, and this is a documented exception, not an oversight:
1. The originating request requires QMS to be a **standalone module** that cannot modify existing modules — folding thousands of characteristics/plans/inspection records into the existing 2,313-line store would itself be a modification (bloats `merge()`, `restoreFromBackup()`, and every backup/restore cycle for all existing users).
2. localStorage has a practical ~5-10MB ceiling shared by the *entire* existing store. A characteristic library alone, at photo-evidence scale, blows past that. Isolating QMS in its own IndexedDB database means the existing ERP's storage budget is untouched and existing users see zero risk from this addition.
3. It is the cleanest seam for the backend migration in Section 9 — swap the `qms/api` implementation, not the whole app's state management.

If this exception is unacceptable, the fallback is Section 12's "MVP-lite" tier, which accepts the localStorage ceiling and a hard cap on characteristic count.

---

## 2. Database Schema (Client-side today, relational-equivalent for the future backend)

### 2a. Client-side schema (IndexedDB via Dexie.js, database name `fabflow-qms`)

```typescript
// qms/db/schema.ts
interface QmsDB {
  manufacturingProcesses: ManufacturingProcess[];   // idx: id
  operations: Operation[];                          // idx: id, processId
  qualityGates: QualityGate[];                       // idx: id, operationId
  inspectionMethods: InspectionMethod[];             // idx: id
  qualityCharacteristics: QualityCharacteristic[];   // idx: id, [processId+operationId], criticality, customerScope, status
  ruleDefinitions: RuleDefinition[];                 // idx: id, targetCharacteristicId
  templates: Template[];                             // idx: id, category
  customerOverlays: CustomerOverlay[];               // idx: id, customerId
  productInspectionPlans: ProductInspectionPlan[];   // idx: id, productId, [productId+status]
  productInspectionPlanItems: ProductInspectionPlanItem[]; // idx: id, planId, characteristicId
  inspectionRecords: InspectionRecord[];             // idx: id, workOrderId, productId, [productId+status], serialNumber, lotNumber
  inspectionResults: InspectionResult[];             // idx: id, recordId, characteristicId
  defects: Defect[];                                 // idx: id, resultId, category
  ncrs: NCR[];                                       // idx: id, defectId, status, ncrNumber
  capas: CAPA[];                                     // idx: id, status
  traceabilityEvents: TraceabilityEvent[];           // idx: id, serialNumber, lotNumber, workOrderId (append-only log)
  auditLogs: QmsAuditLog[];                          // idx: id, entityType, entityId, changedAt (append-only)
  favorites: { userId: string; characteristicIds: string[] }[];
  recentlyUsed: { userId: string; characteristicId: string; usedAt: number }[];
}
```

Why Dexie/IndexedDB and not `localStorage` for this module specifically: IndexedDB is indexed (the compound indexes above are what make 10,000-item search instant, Section 14), has no realistic size ceiling for this use case, and supports async/non-blocking reads so the UI thread never freezes on a large library scan.

### 2b. Relational-equivalent schema (for the future backend, Postgres-flavored — not built now, documented so migration is mechanical)

```sql
-- Master data (low write volume, high read volume, cacheable)
manufacturing_processes(id PK, name, sequence, active)
operations(id PK, process_id FK, name, sequence, department, required_skills JSONB, required_machines JSONB, active)
inspection_methods(id PK, name, method_type, config JSONB)
quality_characteristics(id PK, name, description, category, process_id FK, operation_id FK,
  criticality, inspection_method_id FK, acceptance_criteria, tolerance_nominal, tolerance_plus,
  tolerance_minus, unit, measuring_instrument, standard_reference, drawing_reference,
  evidence_required BOOL, photo_required BOOL, customer_scope FK NULL, sampling_method,
  sampling_params JSONB, version INT, status, tags TEXT[], created_at, updated_at)
quality_gates(id PK, operation_id FK, name, gate_type, block_next_operation BOOL, active)
quality_gate_characteristics(gate_id FK, characteristic_id FK, mandatory BOOL)   -- join table
rule_definitions(id PK, name, target_type, target_characteristic_id FK, condition JSONB, active)
templates(id PK, name, category, characteristic_ids JSONB)
customer_overlays(id PK, customer_id FK, base_characteristic_id FK NULL, overrides JSONB, active)

-- Product-specific master data
product_inspection_plans(id PK, product_id FK, drawing_revision_id FK, version INT, status,
  effective_from, created_by FK, approved_by FK NULL, created_at)
product_inspection_plan_items(id PK, plan_id FK, characteristic_id FK, characteristic_version INT,
  gate_id FK, mandatory BOOL, sampling_override JSONB NULL, tolerance_override JSONB NULL,
  customer_overlay_id FK NULL, excluded_reason TEXT NULL)

-- Execution data (high write volume, append-mostly, partition by date/plant at enterprise scale)
inspection_records(id PK, work_order_id FK, product_id FK, operation_id FK, gate_id FK,
  plan_id FK, plan_version INT, status, inspector_id FK, machine_id FK NULL,
  instrument_id FK NULL, lot_number, serial_number, heat_number, started_at, completed_at)
inspection_results(id PK, record_id FK, plan_item_id FK, characteristic_id FK,
  characteristic_version INT, method_type, value JSONB, pass BOOL, evidence JSONB,
  comments TEXT, instrument_calibration_status, created_at)
defects(id PK, result_id FK, category, description, quantity, severity, created_at)
ncrs(id PK, ncr_number, defect_id FK, status, disposition, approved_by FK NULL,
  customer_approval_ref TEXT NULL, opened_at, closed_at NULL)
capas(id PK, root_cause TEXT, corrective_action TEXT, preventive_action TEXT, status,
  owner_id FK, due_date, opened_at, closed_at NULL)
capa_ncr_links(capa_id FK, ncr_id FK)   -- join table (CAPA can span multiple NCRs)
traceability_events(id PK, event_type, serial_number, lot_number, heat_number, work_order_id FK,
  inspection_record_id FK NULL, payload JSONB, created_at)   -- append-only
qms_audit_logs(id PK, entity_type, entity_id, version, changed_by FK, changed_at, diff JSONB)
```

Indexes to add at backend-build time: `quality_characteristics(process_id, operation_id, status)`, `inspection_records(product_id, status)`, `inspection_records(serial_number)`, `ncrs(status)`, `traceability_events(serial_number)`. Execution tables (`inspection_records`, `inspection_results`, `traceability_events`) should be partitioned by month once volume justifies it (enterprise tier, Section 12).

**Migration mechanics:** the client-side entity shapes in 2a are field-identical to the backend tables in 2b (camelCase ↔ snake_case is the only transform). This is intentional — `qms/api` functions serialize/deserialize between the two without any entity redesign.

---

## 3. Entity Definitions

| Entity | Owns | Never stores |
|---|---|---|
| `ManufacturingProcess` | Reusable top-level process name (e.g. "Welding") | Product-specific data |
| `Operation` | Reusable step within a process, with skills/machines/inputs/outputs | Execution data |
| `QualityGate` | A checkpoint attached to an operation; groups characteristics; mandatory/optional/conditional; gates next-operation | Results |
| `QualityCharacteristic` | The reusable master definition (**"Master Inspection Library" from the prior discussion**) | **Never** execution data — this is a hard rule per your spec |
| `InspectionMethod` | Reusable data-entry method (Pass/Fail, Numeric, Photo, etc.) | Values |
| `RuleDefinition` | Conditional-inclusion logic (Section 6) | — |
| `CustomerOverlay` | Customer-specific overrides/additions | — |
| `Template` | Named bundles of characteristics for common product families | — |
| `ProductInspectionPlan` | Version-controlled, product-specific selection of characteristics | Execution data |
| `ProductInspectionPlanItem` | One line of a plan — pins a characteristic **version** + gate + overrides | — |
| `InspectionRecord` | One inspection *event* at one operation for one work order/lot/serial | — |
| `InspectionResult` | One measured/observed value against one plan item | — |
| `Defect` | A failure captured on a result | — |
| `NCR` | Formal non-conformance + disposition | — |
| `CAPA` | Root-cause/corrective/preventive action, can span multiple NCRs | — |
| `TraceabilityEvent` | Append-only log entry tying identifiers together for fast lookup | — |
| `QmsAuditLog` | Append-only change log for master data and plans | — |

Full field lists are in Section 2a/2b — not duplicated here.

---

## 4. State Machines

**InspectionRecord**
```
Draft → Pending → InProgress → Completed (terminal, immutable)
                             → Failed → ReInspection → Completed
                                                      → Failed (loop back to ReInspection)
```
Rule: `Completed` records are never edited — a correction creates a new `InspectionRecord` linked via `supersedes` and both remain in history (Section 11).

**QualityGate (per work-order/operation instance)**
```
Locked → Evaluating → Open              (all mandatory characteristic results = pass)
                    → Locked            (any mandatory result = fail; blocks Section 0 row 4 guard)
Locked → Open(Override)                 (Administrator/QA Manager only, reason logged to QmsAuditLog)
```

**NCR**
```
Open → Dispositioned ┬─ Rework  ──────┐
                      ├─ Repair ──────┤─▶ PendingReInspection ─▶ Closed (pass)
                      │                                        └▶ Open (fail, loop)
                      ├─ Scrap ───────────────────────────────▶ Closed
                      ├─ Concession ──▶ PendingInternalApproval ▶ Closed
                      └─ CustomerDeviation ▶ PendingCustomerApproval ▶ Closed
```

**CAPA**
```
Open → RootCauseAnalysis → ActionPlanned → Implemented → VerifyingEffectiveness → Closed
                                                                                 └▶ Reopened → Open
```
CAPA auto-suggested (not auto-created) when: `criticality IN [SafetyCritical, RegulatoryCritical]` on any NCR, OR the same `characteristicId` produces ≥N NCRs within a rolling window (N configurable per criticality tier).

---

## 5. Workflow Diagrams

**Plan generation → execution → dispatch (end-to-end)**
```
Drawing received → Product created (reads: Products module)
       │
       ▼
Routing resolved (reads: Production module's stage list)
       │
       ▼
Candidate QualityCharacteristics filtered (process+operation+material+customer match)
       │
       ▼
Mandatory characteristics force-included (criticality/regulatory)
       │
       ▼
RuleDefinitions evaluated → conditional characteristics added
       │
       ▼
CustomerOverlay applied (overrides or customer-only characteristics)
       │
       ▼
Engineering review (manual add/remove of optional items, reason required for removing a
       normally-common item)
       │
       ▼
Plan released → version locked, immutable, effective-dated
       │
       ▼
Work Order executes operation → InspectionRecord created →
       QualityGate evaluated → Open (continue) | Locked (Section 10 failure workflow)
       │
       ▼
Final Inspection → Disposition → Dispatch readiness →
       TraceabilityEvent sealed → Dispatch document references plan version + records
```

**Failure workflow** (detailed in Section 10) is the branch triggered whenever any `InspectionResult.pass = false` on a mandatory characteristic.

---

## 6. Rule Engine Design

Conditional inclusion must be **data**, not code — no `eval()`/`new Function()` on stored strings (security requirement: rule definitions could otherwise become an injection vector if ever synced from a shared/backend source).

```typescript
interface RuleCondition {
  op: "AND" | "OR" | "field";
  // for op = "field":
  field?: string;            // e.g. "product.materialThicknessMm", "product.customerId", "product.finish"
  comparator?: "=" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "contains";
  value?: string | number | string[];
  // for op = "AND"/"OR":
  children?: RuleCondition[];
}

interface RuleDefinition {
  id: string;
  name: string;
  targetType: "IncludeCharacteristic" | "MarkMandatory" | "SetSampling";
  targetCharacteristicId: string;
  condition: RuleCondition;
  active: boolean;
}
```

Evaluation is a small pure recursive interpreter (`evaluateRule(condition, productContext): boolean`) — no dynamic code execution, fully unit-testable, and safe to eventually expose in an "Engineering can author rules via a UI" screen without turning it into an arbitrary-code-execution surface.

Example: *"If material thickness > 3mm on a Bending operation, include bend-radius characteristic"*:
```json
{
  "targetType": "IncludeCharacteristic",
  "targetCharacteristicId": "char_bend_radius",
  "condition": { "op": "field", "field": "product.materialThicknessMm", "comparator": ">", "value": 3 }
}
```

---

## 7. API Architecture (module-internal today, HTTP-shaped for tomorrow)

The QMS exposes exactly one seam to the rest of the app: `qms/api`, a set of pure async functions. Pages never touch IndexedDB directly; they call this layer. This is what makes Section 9's backend migration a swap, not a rewrite.

```typescript
// qms/api/index.ts — every function returns a Promise today (IndexedDB), HTTP later
getCharacteristicLibrary(filters: LibraryFilters): Promise<QualityCharacteristic[]>
searchCharacteristics(query: string): Promise<QualityCharacteristic[]>
createCharacteristic(input): Promise<QualityCharacteristic>
generatePlan(productId: string, drawingRevisionId: string): Promise<ProductInspectionPlan>   // Section 6 flow
releasePlan(planId: string, approverId: string): Promise<ProductInspectionPlan>
startInspection(workOrderId: string, operationId: string): Promise<InspectionRecord>
submitResults(recordId: string, results: InspectionResultInput[]): Promise<InspectionRecord>
isGateOpen(productId: string, operationId: string): Promise<boolean>          // ← used by Section 0 row 4
raiseNCR(resultId: string): Promise<NCR>
dispositionNCR(ncrId: string, disposition, notes): Promise<NCR>
closeNCR(ncrId: string): Promise<NCR>
createOrUpdateCAPA(input): Promise<CAPA>
getTraceability(identifier: { serialNumber?: string; lotNumber?: string }): Promise<TraceabilityEvent[]>
getAnalytics(kind: AnalyticsKind, filters): Promise<AnalyticsResult>
```

**Auth today:** functions take an already-resolved `AuthUser` (from FabFlow's existing `useAuth()`), no separate QMS login.
**Auth tomorrow:** same functions, but the implementation attaches a bearer token and calls `fetch()` against the backend service in Section 9. Call sites in `qms/pages` do not change.

---

## 8. Frontend Module Architecture

```
src/frontend/src/
├── qms/                              # everything new lives here — isolated
│   ├── db/
│   │   ├── schema.ts                 # Dexie schema (Section 2a)
│   │   └── migrations.ts
│   ├── api/                          # Section 7 — the only seam other code calls
│   │   └── index.ts
│   ├── store/
│   │   └── useQmsStore.ts            # QMS-only Zustand store (UI state, not persistence —
│   │                                 #   Dexie is the source of truth, store is a thin cache)
│   ├── rules/
│   │   └── evaluateRule.ts           # Section 6 interpreter
│   ├── components/
│   │   ├── CharacteristicLibraryTable.tsx
│   │   ├── CharacteristicSearchBar.tsx
│   │   ├── CharacteristicFilters.tsx
│   │   ├── BulkSelectToolbar.tsx
│   │   ├── TemplatePicker.tsx
│   │   ├── PlanBuilder.tsx
│   │   ├── GateStatusBadge.tsx
│   │   ├── InspectionExecutionForm.tsx
│   │   ├── NCRWorkflowPanel.tsx
│   │   └── TraceabilityTimeline.tsx
│   └── pages/
│       ├── QualityCharacteristicLibrary.tsx
│       ├── QualityGateBuilder.tsx
│       ├── ProductInspectionPlans.tsx
│       ├── InspectionExecution.tsx
│       ├── NCRManagement.tsx
│       ├── CAPAManagement.tsx
│       └── QualityAnalyticsDashboard.tsx
├── App.tsx        # +7 new Page union values, +7 setPage() cases — additive only
├── Layout.tsx      # +1 "Quality Management" nav section with 7 links — additive only
└── permissions.ts  # +6 module keys — additive only
```

Pages follow FabFlow's existing conventions exactly (shadcn `Card`/`Table`/`Dialog`, `cn()`, `sonner` toasts, controlled `useState` forms, no `react-hook-form`) — QMS should be visually and structurally indistinguishable from the rest of the app, only its persistence is separate.

---

## 9. Backend Service Architecture (future-state — not built in this phase)

Documented now so the client-first build doesn't paint itself into a corner.

```
API Gateway (REST or GraphQL)
  ├── CharacteristicLibraryService   (CRUD + search over quality_characteristics)
  ├── PlanGenerationService          (Section 5/6 flow, server-side rule evaluation)
  ├── InspectionExecutionService     (records/results, gate evaluation)
  ├── NCRService / CAPAService
  ├── TraceabilityService            (graph queries over traceability_events)
  └── AnalyticsService                (SPC, Pareto, yield — server-side aggregation
                                        once volume exceeds what client aggregation
                                        can do responsively, Section 12)
Postgres (schema: Section 2b)
Object storage (S3-compatible) for photo/file evidence — never store binary blobs in Postgres or IndexedDB long-term
```

Auth extends FabFlow's existing `AuthContext` pattern with JWT once this exists; the client's `qms/api` layer switches its transport from Dexie calls to `fetch()`, one function at a time — a phased cutover, not a big-bang migration.

---

## 10. Failure Workflow (enforced, not advisory)

```
InspectionResult.pass = false (on a mandatory characteristic)
        │
        ▼
Defect auto-created
        │
        ▼
Gate → Locked (Section 4 state machine) — Section 0 row 4 guard now blocks production
        │
        ▼
NCR auto-drafted, referencing Defect + InspectionResult
        │
        ▼
Disposition (QA Engineer/QA Manager role only — never the inspector who found it):
   Rework / Repair → back to ReInspection
   Scrap           → NCR closes, unit removed from traceable inventory
   Concession      → internal approval required (documented rationale)
   Customer Deviation → external approval required before closure
        │
        ▼
Re-inspection (new InspectionRecord, `supersedes` link to the failed one)
        │
        ▼
NCR closes only on pass or approved concession/deviation
        │
        ▼
CAPA evaluation (Section 4 trigger rule)
        │
        ▼
Gate → Open(Override justified) only through the disposition path above — never silently
```

---

## 11. Revision Strategy

- `QualityCharacteristic.version` increments on any field change to an **Active** characteristic; the old version row is kept, flagged with an `until` date, never deleted.
- `ProductInspectionPlan` is never edited once `status = Released`. A change creates plan version N+1; `ProductInspectionPlanItem.characteristicVersion` pins the exact characteristic version used, so a plan remains meaningful even after the master characteristic changes later.
- Drawing revision changes (read from the Products module) raise a **review task**, not an automatic obsolescence — a human confirms impact before a new plan version is generated.
- `InspectionRecord`/`InspectionResult` rows are immutable once `Completed`; corrections are new rows with a `supersedes` pointer, per Section 4.
- Every write to a `QualityCharacteristic`, `QualityGate`, `RuleDefinition`, or `ProductInspectionPlan` writes a `QmsAuditLog` row (who, when, diff) — append-only, queryable per entity.
- Effectivity dates (`effectiveFrom`) on plans let the system answer "which plan revision governed lot X" even years later — required for the traceability model below.

---

## 12. Traceability Model

```
        Product ──┐
                   ├──▶ WorkOrder ──▶ InspectionRecord ──▶ InspectionResult ──┬──▶ Defect ──▶ NCR ──▶ CAPA
DrawingRevision ───┘         │              │                                 │
                              │              ├──▶ Operation / QualityGate     └── (pass) sealed evidence
                              │              ├──▶ Inspector (Employee ref)
                              │              ├──▶ Instrument + calibration status
                              │              └──▶ Machine ref
                              │
                    SerialNumber / LotNumber / HeatNumber (from raw material lot, read from Inventory)
```

Every `InspectionRecord` is append-only-logged to `TraceabilityEvent` at creation and at each state transition. A traceability query (`getTraceability({serialNumber})`) is a single indexed lookup on `traceabilityEvents`, not a live join across every table — this is what keeps recall/warranty lookups fast even at enterprise volume. Historical records are never deleted; only `active`/`obsolete` status flags change.

---

## 13. Reporting / Analytics Architecture

Client-first tier: analytics are pure functions over the IndexedDB dataset, computed on-demand with memoization, not pre-aggregated:
```
getAnalytics("firstPassYield", { productId?, dateRange })
getAnalytics("defectPareto", { operationId?, dateRange })
getAnalytics("ncrTrend", { dateRange })
getAnalytics("spc", { characteristicId, dateRange })         // X-bar/R or I-MR charts
getAnalytics("processCapability", { characteristicId })       // Cp/Cpk
getAnalytics("costOfQuality", { dateRange })                  // scrap+rework cost, reads Inventory/Finance read-only
```
This is honest about its ceiling: responsive up to roughly tens of thousands of `InspectionResult` rows client-side (IndexedDB + in-memory reduce). Beyond that — true enterprise, multi-factory, high-volume — this tier moves to `AnalyticsService` (Section 9) doing the aggregation server-side and the client just renders the result. The `getAnalytics()` function signature does not change between tiers.

---

## 14. UI — Quality Characteristic Library (key screen, wireframe)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Quality Characteristic Library                        [+ New Characteristic]│
├─────────────────────────────────────────────────────────────────────────┤
│ 🔍 [ search name, description, category, process, standard, tags...    ]│
├─────────────────────────────────────────────────────────────────────────┤
│ Filters: [Process ▾] [Operation ▾] [Category ▾] [Criticality ▾]         │
│          [Method ▾] [Customer ▾] [● Active ○ Obsolete] [☐ Mandatory only]│
│          [Templates ▾: Electrical Enclosure / Control Panel / Bracket…] │
├─────────────────────────────────────────────────────────────────────────┤
│ ★ Favorites (4)   🕐 Recently Used (12)   🔥 Frequently Used (8)         │
├─────────────────────────────────────────────────────────────────────────┤
│ [☐ Select All]  1,247 of 10,382 shown   [Show: Selected|Unselected|All] │
│ [Bulk Assign to Plan] [Bulk Remove] [Bulk Set Sampling] [Bulk Tag]       │
├──┬──────────────────────┬──────────┬───────────┬────────────┬──────────┤
│☐★│ Name                 │ Process  │ Operation │ Criticality│ Status   │
├──┼──────────────────────┼──────────┼───────────┼────────────┼──────────┤
│☑★│ Weld Penetration     │ Welding  │ Welding   │ Critical   │ Active   │
│☑ │ Weld Visual Appearance│ Welding  │ Welding   │ Major      │ Active   │
│☐ │ Bend Radius ±0.2mm   │ Bending  │ Bending   │ Major      │ Active   │
│☐ │ DFT (Powder Coat)    │ Coating  │ Powder Ct.│ Major      │ Active   │
│☐ │ Flatness — CustomerX │ Cutting  │ Laser Cut │ Customer   │ Active   │
├──┴──────────────────────┴──────────┴───────────┴────────────┴──────────┤
│                                                    ‹ 1 2 3 … 210 ›       │
└─────────────────────────────────────────────────────────────────────────┘
```
Performance note (Section 14 requirement — 10,000+ items, instant search): search/filter runs against IndexedDB's compound indexes (Section 2a), the table virtualizes rows (render only the visible ~30), and results are debounced at 150ms — no full-table scan ever happens client-side.

**Inspection Execution (operator view, wireframe)**
```
┌─────────────────────────────────────────────────────────┐
│ Work Order WO-2026-0412  ·  Operation: Welding  ·  Gate: Open │
├─────────────────────────────────────────────────────────┤
│ 1. Weld Penetration        [Pass ●  Fail ○]   Critical    │
│ 2. Weld Visual Appearance  [Pass ●  Fail ○]   Major       │
│ 3. Weld Size (mm)          [____ ] tol 5.0±0.3            │
│    📷 Photo required — [Capture]                          │
├─────────────────────────────────────────────────────────┤
│ Inspector: J. Rao   Instrument: Cal-0042 (valid to 03/27) │
│                                    [Submit Inspection]     │
└─────────────────────────────────────────────────────────┘
```

**NCR Workflow (wireframe)**
```
┌─────────────────────────────────────────────────────────┐
│ NCR-2026-0088  ·  Status: Dispositioned                  │
├─────────────────────────────────────────────────────────┤
│ Defect: Weld porosity, qty 3, Operation: Welding          │
│ Disposition: [Rework ▾]   Approved by: QA Manager S. Iyer │
│ [Send to Re-inspection]           [View Traceability →]   │
└─────────────────────────────────────────────────────────┘
```

---

## 15. Implementation Roadmap — MVP to Enterprise

| Phase | Scope | Storage tier | Gate on |
|---|---|---|---|
| **Phase 0 — Foundations** | `qms/db` schema, `qms/api` skeleton, permission keys, page routing shells (Section 0/8) | IndexedDB | This document approved |
| **Phase 1 — MVP: Library + Manual Plans** | Characteristic library CRUD, search/filter/bulk-select UI (Section 14), manual plan generation (selection only, no rule engine yet), basic inspection execution (Pass/Fail + Numeric methods only) | IndexedDB | Phase 0 |
| **Phase 2 — Gating + Failure Workflow** | QualityGate entity, Section 0 row-4 guard wired into Production, Defect/NCR/CAPA full state machines (Section 4/10) | IndexedDB | Phase 1, gate guard reviewed with Production module owner |
| **Phase 3 — Rule Engine + Overlays** | Conditional rule evaluation (Section 6), customer overlays, templates, revision control (Section 11) | IndexedDB | Phase 2 |
| **Phase 4 — Traceability + Analytics** | TraceabilityEvent log, SPC/Pareto/yield dashboards computed client-side (Section 13) | IndexedDB | Phase 3 |
| **Phase 5 — Scale validation** | Load-test at 10k characteristics / 1k products / thousands of plans in IndexedDB; identify where client aggregation breaks down | IndexedDB | Phase 4, real usage data |
| **Phase 6 — Backend cutover (enterprise)** | Stand up Postgres + services (Section 9), migrate `qms/api` function-by-function from Dexie to HTTP, multi-factory sync, object storage for evidence photos | Backend | Business case for multi-factory/enterprise scale confirmed |

Phases 0-5 deliver a fully functional, single-factory, offline-first QMS with zero new infrastructure — matching where FabFlow is today. Phase 6 is the explicit, planned exit from client-only when/if the business actually needs multi-factory or true high-volume scale; nothing before Phase 6 needs to be rewritten to get there, only re-pointed.

---

## Review — Weaknesses Identified & Resolved Before Implementation

| Risk | Resolution in this doc |
|---|---|
| Second Zustand store violates existing "one store" rule | Explicitly flagged (Section 1) as a deliberate, scoped exception with rationale; open for your veto before Phase 0 |
| localStorage can't hold 10k+ characteristics | Moved QMS persistence to IndexedDB entirely, isolated database |
| Gating requires *some* change to existing Production code | Minimized to one guard-call addition (Section 0, row 4), not a refactor |
| Rule engine could become an arbitrary-code-execution risk if ever fed from an external source | Designed as a structured condition AST with a pure interpreter, no `eval`/`Function` (Section 6) |
| Client-side analytics won't hold up at true enterprise volume | Explicitly capped and documented (Section 13), with an unchanged API surface for the Phase 6 backend swap |
| Existing informal quality counters (`okQty`/`rejectedQty` on production stages) could conflict with new Defect/NCR data | QMS treats them as legacy read-only context, never writes to them (Section 0 note) |

**Open decision for you before Phase 0 starts:** confirm the second-store exception (Section 1) is acceptable, or tell me to instead fit QMS inside the existing single store at reduced scale (localStorage tier, Section 12's rejected fallback).
