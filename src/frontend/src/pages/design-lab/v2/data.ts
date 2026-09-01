// ERP Design Exploration — shared realistic mock dataset.
// Isolated from the real ERP: no store, no Supabase, no live data. Names
// and figures are believable manufacturing-ERP content (not lorem ipsum),
// reused across all 14 concepts so every dashboard/table/detail view in
// this exploration is grounded in the same coherent "company".

export const projects = [
  {
    no: "PROJ-2026-013",
    name: "Bracket Assembly — Line 3 Retrofit",
    customer: "Meridian Fab Co.",
    qty: 240,
    value: 412000,
    status: "In Production",
    stage: "Powder Coating",
    health: "on-track",
    dueIn: 6,
  },
  {
    no: "PROJ-2026-012",
    name: "Chassis Panels — Q3 Run",
    customer: "Norwood Industrial",
    qty: 60,
    value: 186500,
    status: "In Production",
    stage: "Welding",
    health: "at-risk",
    dueIn: 2,
  },
  {
    no: "PROJ-2026-011",
    name: "Custom Enclosures",
    customer: "Ashfield Metalworks",
    qty: 12,
    status: "Quoted",
    value: 54200,
    stage: "Awaiting PO",
    health: "watch",
    dueIn: 14,
  },
  {
    no: "PROJ-2026-010",
    name: "Sheet Metal Cabinets — Batch 4",
    customer: "Delta Sheet Systems",
    qty: 500,
    value: 891000,
    status: "In Production",
    stage: "Laser Cutting",
    health: "on-track",
    dueIn: 9,
  },
  {
    no: "PROJ-2026-009",
    name: "Prototype Fixtures",
    customer: "Coastline Fixtures",
    qty: 8,
    value: 31800,
    status: "Blocked",
    stage: "Awaiting Material",
    health: "blocked",
    dueIn: -3,
  },
  {
    no: "PROJ-2026-008",
    name: "Ventilation Ducting — Phase 2",
    customer: "Highline Systems",
    qty: 180,
    value: 268400,
    status: "In Production",
    stage: "Assembly",
    health: "at-risk",
    dueIn: 4,
  },
] as const;

export const machines = [
  {
    id: "CNC-04",
    name: "Trumpf CNC Laser 04",
    status: "Running",
    job: "PROJ-2026-010",
    utilization: 87,
    nextService: 12,
  },
  {
    id: "PRS-02",
    name: "Amada Press Brake 02",
    status: "Running",
    job: "PROJ-2026-013",
    utilization: 74,
    nextService: 28,
  },
  {
    id: "WLD-06",
    name: "Robotic Weld Cell 06",
    status: "Down",
    job: null,
    utilization: 0,
    nextService: -2,
  },
  {
    id: "PWD-01",
    name: "Powder Coat Line 01",
    status: "Running",
    job: "PROJ-2026-013",
    utilization: 92,
    nextService: 45,
  },
  {
    id: "CNC-02",
    name: "Trumpf CNC Laser 02",
    status: "Idle",
    job: null,
    utilization: 31,
    nextService: 60,
  },
] as const;

export const purchaseOrders = [
  {
    no: "PO-2026-041",
    vendor: "SteelSource India",
    item: "Cold-rolled steel sheet 2mm",
    amount: 184200,
    status: "Pending Approval",
    eta: 3,
    blocking: "PROJ-2026-010",
  },
  {
    no: "PO-2026-040",
    vendor: "Precision Fasteners Ltd.",
    item: "M6 hex bolts (10,000 units)",
    amount: 22600,
    status: "Confirmed",
    eta: 5,
    blocking: null,
  },
  {
    no: "PO-2026-039",
    vendor: "Coatline Chemicals",
    item: "Powder coat — RAL 7016",
    amount: 41800,
    status: "Delayed",
    eta: 9,
    blocking: "PROJ-2026-013",
  },
  {
    no: "PO-2026-038",
    vendor: "Bharat Alloys",
    item: "Aluminum extrusion profile",
    amount: 96400,
    status: "Confirmed",
    eta: 6,
    blocking: null,
  },
] as const;

export const invoices = [
  {
    no: "INV-2026-091",
    customer: "Meridian Fab Co.",
    amount: 206000,
    status: "Unpaid",
    dueIn: -5,
  },
  {
    no: "INV-2026-090",
    customer: "Delta Sheet Systems",
    amount: 445500,
    status: "Unpaid",
    dueIn: 12,
  },
  {
    no: "INV-2026-089",
    customer: "Norwood Industrial",
    amount: 93200,
    status: "Paid",
    dueIn: null,
  },
  {
    no: "INV-2026-088",
    customer: "Highline Systems",
    amount: 134200,
    status: "Partially Paid",
    dueIn: 4,
  },
] as const;

export const inventory = [
  {
    sku: "MAT-CRS-2MM",
    name: "Cold-rolled steel sheet 2mm",
    qty: 340,
    unit: "sheets",
    reorderAt: 400,
    trend: "falling",
  },
  {
    sku: "MAT-AL-EXT",
    name: "Aluminum extrusion profile",
    qty: 1250,
    unit: "m",
    reorderAt: 500,
    trend: "stable",
  },
  {
    sku: "MAT-PWD-7016",
    name: "Powder coat — RAL 7016",
    qty: 18,
    unit: "kg",
    reorderAt: 40,
    trend: "falling",
  },
  {
    sku: "MAT-FAST-M6",
    name: "M6 hex bolts",
    qty: 42000,
    unit: "units",
    reorderAt: 15000,
    trend: "stable",
  },
] as const;

export const qmsAlerts = [
  {
    id: "NCR-118",
    project: "PROJ-2026-013",
    issue: "Powder coat thickness below spec (batch 4)",
    severity: "high",
  },
  {
    id: "NCR-117",
    project: "PROJ-2026-008",
    issue: "Weld porosity flagged on 3 units",
    severity: "medium",
  },
] as const;

export const attentionItems = [
  {
    title: "PROJ-2026-009 is blocked",
    detail: "Waiting on PO-2026-039 (powder coat), 3 days overdue",
    severity: "critical",
    module: "Projects",
  },
  {
    title: "WLD-06 is down",
    detail:
      "Robotic Weld Cell 06 offline since 6:40 AM — 2 jobs queued behind it",
    severity: "critical",
    module: "Machinery",
  },
  {
    title: "INV-2026-091 is 5 days overdue",
    detail: "₹2,06,000 outstanding from Meridian Fab Co.",
    severity: "high",
    module: "Invoices",
  },
  {
    title: "Powder coat stock below reorder level",
    detail: "18kg remaining, reorder threshold is 40kg",
    severity: "medium",
    module: "Inventory",
  },
  {
    title: "NCR-118 needs review",
    detail: "Powder coat thickness flagged on PROJ-2026-013, batch 4",
    severity: "medium",
    module: "QMS",
  },
] as const;

export const customerHistory = {
  name: "Meridian Fab Co.",
  since: "2022",
  lifetimeValue: 2840000,
  openProjects: 2,
  openInvoices: 1,
  lastContact: "3 days ago",
  notes:
    "Consistently pays net-30. Prefers powder coat over paint. Primary contact: Rakesh Iyer (Procurement).",
};
