// Starter master data so the Characteristic Library is demonstrable on first load.
// Runs once — guarded by ensureSeeded() in qms/api checking processRepo.count() === 0.

import type {
  InspectionMethod,
  InspectionStageDefinition,
  ManufacturingProcess,
  Operation,
  QmsTemplate,
  QualityCharacteristic,
} from "../types";
import {
  characteristicRepo,
  inspectionMethodRepo,
  inspectionStageRepo,
  operationRepo,
  processRepo,
  templateRepo,
} from "./repositories";

const PROCESS_NAMES = [
  "Material Receiving",
  "Cutting",
  "Laser Cutting",
  "Punching",
  "Drilling",
  "Tapping",
  "Bending",
  "Machining",
  "Welding",
  "Grinding",
  "Surface Preparation",
  "Powder Coating",
  "Painting",
  "Assembly",
  "Testing",
  "Packaging",
  "Dispatch",
];

const METHODS: Array<Omit<InspectionMethod, "id" | "createdAt">> = [
  { name: "Pass / Fail Check", type: "PassFail", active: true },
  { name: "Numeric Measurement", type: "Numeric", active: true },
  { name: "Multiple Numeric Measurements", type: "MultiNumeric", active: true },
  { name: "Text Entry", type: "Text", active: true },
  { name: "Dropdown Selection", type: "Dropdown", active: true },
  { name: "Checkbox Confirmation", type: "Checkbox", active: true },
  { name: "Photo Capture", type: "Photo", active: true },
  { name: "File Upload", type: "File", active: true },
  { name: "Certificate Upload", type: "Certificate", active: true },
  { name: "Barcode Scan", type: "BarcodeScan", active: true },
  { name: "QR Code Scan", type: "QRScan", active: true },
];

export async function seedQmsData(): Promise<void> {
  const now = Date.now();

  const processes: ManufacturingProcess[] = PROCESS_NAMES.map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    sequence: i + 1,
    active: true,
    createdAt: now,
  }));
  await processRepo.putMany(processes);
  const pid = (name: string) => processes.find((p) => p.name === name)!.id;

  const operations: Operation[] = processes.map((p) => ({
    id: crypto.randomUUID(),
    processId: p.id,
    name: p.name,
    sequence: p.sequence,
    requiredSkills: [],
    requiredMachines: [],
    active: true,
    createdAt: now,
  }));
  await operationRepo.putMany(operations);
  const oid = (processName: string) =>
    operations.find((o) => o.processId === pid(processName))!.id;

  const methods: InspectionMethod[] = METHODS.map((m) => ({
    ...m,
    id: crypto.randomUUID(),
    createdAt: now,
  }));
  await inspectionMethodRepo.putMany(methods);
  const mid = (type: InspectionMethod["type"]) =>
    methods.find((m) => m.type === type)!.id;

  const charDefs: Array<
    Omit<
      QualityCharacteristic,
      | "id"
      | "processId"
      | "operationId"
      | "inspectionMethodId"
      | "version"
      | "status"
      | "createdAt"
      | "updatedAt"
    > & {
      process: string;
      method: InspectionMethod["type"];
    }
  > = [
    {
      process: "Material Receiving",
      method: "Certificate",
      name: "Material Certificate Verification",
      description:
        "Verify mill test certificate matches PO grade/spec before material is accepted.",
      category: "Documentation",
      criticality: "RegulatoryCritical",
      acceptanceCriteria: "MTC present, grade matches PO, no discrepancy",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["incoming", "mtc", "traceability"],
    },
    {
      process: "Cutting",
      method: "Numeric",
      name: "Cut Length Accuracy",
      description: "Verify cut piece length against drawing dimension.",
      category: "Dimensional",
      criticality: "FunctionalCritical",
      acceptanceCriteria: "Within tolerance of drawing dimension",
      toleranceNominal: 0,
      tolerancePlus: 0.5,
      toleranceMinus: 0.5,
      unit: "mm",
      measuringInstrument: "Steel tape / digital caliper",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["cutting", "length"],
    },
    {
      process: "Laser Cutting",
      method: "PassFail",
      name: "Laser Cut Edge Quality",
      description:
        "Visual check for dross, burn marks, and clean edge on laser-cut profile.",
      category: "Visual",
      criticality: "Cosmetic",
      acceptanceCriteria: "No visible dross, burn marks, or edge tearing",
      evidenceRequired: false,
      photoRequired: true,
      tags: ["laser", "edge", "visual"],
    },
    {
      process: "Punching",
      method: "Numeric",
      name: "Hole Diameter Tolerance",
      description: "Verify punched hole diameter against drawing.",
      category: "Dimensional",
      criticality: "FunctionalCritical",
      acceptanceCriteria: "Within tolerance of drawing dimension",
      tolerancePlus: 0.1,
      toleranceMinus: 0.1,
      unit: "mm",
      measuringInstrument: "Pin gauge / caliper",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["punching", "hole"],
    },
    {
      process: "Drilling",
      method: "Numeric",
      name: "Hole Position Accuracy",
      description: "Verify drilled hole center position against drawing datum.",
      category: "Dimensional",
      criticality: "FunctionalCritical",
      acceptanceCriteria: "Within positional tolerance of drawing",
      tolerancePlus: 0.2,
      toleranceMinus: 0.2,
      unit: "mm",
      measuringInstrument: "CMM / height gauge",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["drilling", "position"],
    },
    {
      process: "Tapping",
      method: "PassFail",
      name: "Thread Gauge Check",
      description: "Go/No-Go thread gauge check on tapped holes.",
      category: "Functional",
      criticality: "FunctionalCritical",
      acceptanceCriteria: "Go gauge passes, No-Go gauge does not enter",
      measuringInstrument: "Go/No-Go thread gauge",
      evidenceRequired: false,
      photoRequired: false,
      tags: ["tapping", "thread"],
    },
    {
      process: "Bending",
      method: "Numeric",
      name: "Bend Angle Tolerance",
      description:
        "Verify bend angle against drawing using angle gauge/protractor.",
      category: "Dimensional",
      criticality: "FunctionalCritical",
      acceptanceCriteria: "Within tolerance of drawing angle",
      tolerancePlus: 1,
      toleranceMinus: 1,
      unit: "deg",
      measuringInstrument: "Digital angle gauge",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["bending", "angle"],
    },
    {
      process: "Bending",
      method: "Numeric",
      name: "Bend Radius Check",
      description:
        "Verify inside bend radius meets drawing requirement for material thickness.",
      category: "Dimensional",
      criticality: "ProcessCritical",
      acceptanceCriteria:
        "Bend radius within specified range for material grade/thickness",
      unit: "mm",
      measuringInstrument: "Radius gauge",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["bending", "radius"],
    },
    {
      process: "Machining",
      method: "Numeric",
      name: "Surface Finish (Ra)",
      description: "Measure surface roughness on machined face.",
      category: "Visual",
      criticality: "CustomerCritical",
      acceptanceCriteria: "Ra within customer-specified range",
      unit: "µm",
      measuringInstrument: "Surface roughness tester",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["machining", "finish"],
    },
    {
      process: "Welding",
      method: "PassFail",
      name: "Weld Penetration",
      description:
        "Verify full penetration weld per WPS — visual or NDT as specified.",
      category: "Functional",
      criticality: "SafetyCritical",
      acceptanceCriteria: "Full penetration, no incomplete fusion",
      standardReference: "AWS D1.1",
      evidenceRequired: true,
      photoRequired: true,
      tags: ["welding", "penetration", "structural"],
    },
    {
      process: "Welding",
      method: "PassFail",
      name: "Weld Visual Appearance",
      description: "Visual check for uniform bead, no undercut or overlap.",
      category: "Visual",
      criticality: "Cosmetic",
      acceptanceCriteria: "Uniform bead profile, no visible undercut/overlap",
      standardReference: "AWS D1.1",
      evidenceRequired: false,
      photoRequired: true,
      tags: ["welding", "visual"],
    },
    {
      process: "Welding",
      method: "Numeric",
      name: "Weld Size",
      description: "Measure fillet weld leg size against drawing callout.",
      category: "Dimensional",
      criticality: "FunctionalCritical",
      acceptanceCriteria: "Within tolerance of drawing weld symbol",
      tolerancePlus: 0.5,
      toleranceMinus: 0,
      unit: "mm",
      measuringInstrument: "Weld gauge",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["welding", "size"],
    },
    {
      process: "Welding",
      method: "PassFail",
      name: "Spatter Check",
      description: "Verify weld area is free of excessive spatter.",
      category: "Visual",
      criticality: "Cosmetic",
      acceptanceCriteria: "No excessive spatter on or around weld",
      evidenceRequired: false,
      photoRequired: true,
      tags: ["welding", "spatter"],
    },
    {
      process: "Grinding",
      method: "PassFail",
      name: "Grinding Surface Smoothness",
      description:
        "Visual/tactile check that ground weld/surface is smooth and flush.",
      category: "Visual",
      criticality: "Cosmetic",
      acceptanceCriteria: "Smooth, flush surface, no gouging",
      evidenceRequired: false,
      photoRequired: true,
      tags: ["grinding", "finish"],
    },
    {
      process: "Surface Preparation",
      method: "PassFail",
      name: "Surface Cleanliness (Sa 2.5)",
      description: "Verify blast cleanliness grade before coating.",
      category: "Process",
      criticality: "ProcessCritical",
      acceptanceCriteria: "Meets Sa 2.5 near-white blast standard",
      standardReference: "ISO 8501-1",
      evidenceRequired: true,
      photoRequired: true,
      tags: ["surface prep", "blasting"],
    },
    {
      process: "Powder Coating",
      method: "Numeric",
      name: "Dry Film Thickness (DFT)",
      description: "Measure coating thickness using DFT gauge.",
      category: "Dimensional",
      criticality: "CustomerCritical",
      acceptanceCriteria: "Within customer-specified DFT range",
      unit: "µm",
      measuringInstrument: "DFT gauge",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["powder coating", "dft"],
    },
    {
      process: "Powder Coating",
      method: "PassFail",
      name: "Coating Adhesion Test",
      description: "Cross-hatch adhesion test on coated surface.",
      category: "Functional",
      criticality: "FunctionalCritical",
      acceptanceCriteria: "No flaking/peeling per cross-hatch test",
      standardReference: "ASTM D3359",
      evidenceRequired: true,
      photoRequired: true,
      tags: ["powder coating", "adhesion"],
    },
    {
      process: "Painting",
      method: "PassFail",
      name: "Paint Colour Match",
      description: "Verify paint colour matches approved RAL/customer sample.",
      category: "Visual",
      criticality: "CustomerCritical",
      acceptanceCriteria:
        "Visual match to RAL/approved sample under standard light",
      evidenceRequired: false,
      photoRequired: true,
      tags: ["painting", "colour"],
    },
    {
      process: "Assembly",
      method: "Numeric",
      name: "Fastener Torque Check",
      description: "Verify critical fasteners are torqued to specification.",
      category: "Functional",
      criticality: "SafetyCritical",
      acceptanceCriteria:
        "Torque within specified range, verified with calibrated wrench",
      unit: "Nm",
      measuringInstrument: "Calibrated torque wrench",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["assembly", "torque", "safety"],
    },
    {
      process: "Assembly",
      method: "Checkbox",
      name: "Assembly Completeness",
      description: "Confirm all BOM items are fitted per assembly drawing.",
      category: "Functional",
      criticality: "FunctionalCritical",
      acceptanceCriteria: "All BOM line items present and correctly fitted",
      evidenceRequired: false,
      photoRequired: false,
      tags: ["assembly", "bom"],
    },
    {
      process: "Testing",
      method: "PassFail",
      name: "Functional Test — Power On",
      description:
        "Power-on functional test of assembled unit before dispatch.",
      category: "Functional",
      criticality: "SafetyCritical",
      acceptanceCriteria:
        "Unit powers on and passes functional checklist with no faults",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["testing", "electrical"],
    },
    {
      process: "Testing",
      method: "Numeric",
      name: "Insulation Resistance Test",
      description:
        "Megger test to verify insulation resistance meets regulatory minimum.",
      category: "Safety",
      criticality: "RegulatoryCritical",
      acceptanceCriteria: "Insulation resistance above regulatory minimum",
      unit: "MΩ",
      measuringInstrument: "Insulation resistance tester (Megger)",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["testing", "electrical", "safety"],
    },
    {
      process: "Packaging",
      method: "PassFail",
      name: "Packaging Integrity Check",
      description:
        "Verify packaging is intact and adequate for transit before dispatch.",
      category: "Visual",
      criticality: "Cosmetic",
      acceptanceCriteria:
        "No damage, adequate protective packaging for transit mode",
      evidenceRequired: false,
      photoRequired: true,
      tags: ["packaging"],
    },
    {
      process: "Dispatch",
      method: "Certificate",
      name: "Final Dispatch Documentation",
      description:
        "Verify all dispatch documents (DC, COC, test certificates) are complete before release.",
      category: "Documentation",
      criticality: "RegulatoryCritical",
      acceptanceCriteria: "All required documents present and correct",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["dispatch", "documentation"],
    },
  ];

  const characteristics: QualityCharacteristic[] = charDefs.map((def) => {
    const { process, method, ...rest } = def;
    return {
      ...rest,
      id: crypto.randomUUID(),
      processId: pid(process),
      operationId: oid(process),
      inspectionMethodId: mid(method),
      version: 1,
      status: "Active",
      createdAt: now,
      updatedAt: now,
    };
  });
  await characteristicRepo.putMany(characteristics);

  const byName = (name: string) =>
    characteristics.find((c) => c.name === name)!.id;

  const templates: QmsTemplate[] = [
    {
      id: crypto.randomUUID(),
      name: "Electrical Enclosure",
      category: "Product Family",
      description:
        "Standard checkpoints for sheet-metal electrical enclosures.",
      characteristicIds: [
        byName("Cut Length Accuracy"),
        byName("Bend Angle Tolerance"),
        byName("Weld Visual Appearance"),
        byName("Dry Film Thickness (DFT)"),
        byName("Assembly Completeness"),
        byName("Functional Test — Power On"),
        byName("Insulation Resistance Test"),
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Bracket",
      category: "Product Family",
      description: "Standard checkpoints for simple structural brackets.",
      characteristicIds: [
        byName("Cut Length Accuracy"),
        byName("Bend Angle Tolerance"),
        byName("Bend Radius Check"),
        byName("Hole Position Accuracy"),
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Control Panel",
      category: "Product Family",
      description:
        "Standard checkpoints for welded/painted control panel enclosures.",
      characteristicIds: [
        byName("Weld Penetration"),
        byName("Weld Size"),
        byName("Surface Cleanliness (Sa 2.5)"),
        byName("Paint Colour Match"),
        byName("Fastener Torque Check"),
        byName("Final Dispatch Documentation"),
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
  await templateRepo.putMany(templates);
}

// ── Phase 2 — Inspection Stages ──────────────────────────────────
// Gated independently of seedQmsData() above (via its own count() check in
// qms/api/inspections.ts) so it also backfills browsers that already ran
// Phase 1 seeding before this stage list existed — no existing process,
// operation, or characteristic row is touched.

const STAGE_NAMES: Array<{ name: string; processName: string }> = [
  { name: "Material Inspection", processName: "Material Receiving" },
  { name: "Cutting Inspection", processName: "Cutting" },
  { name: "Bending Inspection", processName: "Bending" },
  { name: "Welding Inspection", processName: "Welding" },
  { name: "Grinding Inspection", processName: "Grinding" },
  { name: "Powder Coating Inspection", processName: "Powder Coating" },
  { name: "Assembly Inspection", processName: "Assembly" },
  { name: "Testing Inspection", processName: "Testing" },
  { name: "Final Inspection", processName: "Final Inspection" },
];

export async function seedInspectionStages(): Promise<void> {
  const now = Date.now();
  const existingProcesses = await processRepo.getAll();

  let finalInspectionProcess = existingProcesses.find(
    (p) => p.name === "Final Inspection",
  );
  if (!finalInspectionProcess) {
    const maxSequence = existingProcesses.reduce(
      (max, p) => Math.max(max, p.sequence),
      0,
    );
    finalInspectionProcess = {
      id: crypto.randomUUID(),
      name: "Final Inspection",
      sequence: maxSequence + 1,
      active: true,
      createdAt: now,
    };
    await processRepo.put(finalInspectionProcess);

    const finalInspectionOperation: Operation = {
      id: crypto.randomUUID(),
      processId: finalInspectionProcess.id,
      name: "Final Inspection",
      sequence: finalInspectionProcess.sequence,
      requiredSkills: [],
      requiredMachines: [],
      active: true,
      createdAt: now,
    };
    await operationRepo.put(finalInspectionOperation);
  }

  const allProcesses = [...existingProcesses, finalInspectionProcess].filter(
    (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
  );

  const stages: InspectionStageDefinition[] = STAGE_NAMES.map((s, i) => ({
    id: crypto.randomUUID(),
    name: s.name,
    processId: allProcesses.find((p) => p.name === s.processName)?.id,
    sequence: i + 1,
    active: true,
    createdAt: now,
  }));
  await inspectionStageRepo.putMany(stages);
}
