// Fills the two approved master SVG templates (assets/idCardTemplates/id_card_front.svg,
// id_card_back.svg) with live employee/company data. These SVG files are the single source of
// truth for the Employee ID Card design and are NEVER recreated, approximated, or redesigned
// anywhere in this codebase -- every coordinate, curve, gradient, stroke, radius, and
// decorative element in them is untouched master artwork. This module only ever does three
// things to a parsed copy of that artwork: (1) sets `textContent` on specific known element
// ids, (2) sets the `href` of the two `<image>` elements (photo, company logo), and (3)
// recolors a small fixed set of known accent hex fills for non-Permanent Employee Types. It
// never adds, removes, moves, or resizes any shape.
//
// Both the on-screen React preview (components/EmployeeIdCardPreview.tsx) and the PDF export
// (lib/generateEmployeeIdCardPdf.ts) call fillIdCardSvg() on these same two master files, so
// the preview and the exported PDF are guaranteed to be pixel-identical renders of the same
// markup -- not two independent re-implementations.
import idCardBackSvgRaw from "../assets/idCardTemplates/id_card_back.svg?raw";
import idCardFrontSvgRaw from "../assets/idCardTemplates/id_card_front.svg?raw";
import type { AppSettings, Employee, EmployeeType } from "../types";

export type IdCardSide = "front" | "back";

// The master artwork's own hand-shaded 10-value yellow ramp (Permanent) forms a bevel/highlight
// effect across the strip, pill, and footer -- not a single flat color. Recoloring for the
// other four Employee Types swaps every one of these exact hex values for its counterpart
// below, preserving that same shading pattern; it is never flattened to one color. Temporary
// and Visitor keep the original ramp's lightness/saturation and only shift hue. Supervisor and
// Management compress lightness into a darker band (a literal hue-only swap can't produce navy
// or black from a ramp whose lightest tone is 75% lightness) while preserving the same relative
// shading order -- confirmed with the user as the resolution for that specific limitation.
const ACCENT_RAMPS: Record<EmployeeType, Record<string, string>> = {
  Permanent: {}, // identity -- template's own colors, no substitution needed
  Temporary: {
    "#F0B814": "#F06F14",
    "#EAB024": "#EA7624",
    "#F5C43A": "#F5873A",
    "#E6A81C": "#E66F1C",
    "#F6D488": "#F6B588",
    "#F4C24E": "#F4934E",
    "#F2C24E": "#F2924E",
    "#EDB021": "#ED7521",
    "#D99E0A": "#D9600A",
    "#D69A08": "#D65D08",
  },
  Supervisor: {
    "#F0B814": "#06305A",
    "#EAB024": "#09335D",
    "#F5C43A": "#063E75",
    "#E6A81C": "#092F55",
    "#F6D488": "#0C57A1",
    "#F4C24E": "#08447F",
    "#F2C24E": "#09437D",
    "#EDB021": "#08335E",
    "#D99E0A": "#032547",
    "#D69A08": "#032445",
  },
  Management: {
    "#F0B814": "#121A2A",
    "#EAB024": "#151C2D",
    "#F5C43A": "#18233A",
    "#E6A81C": "#131A28",
    "#F6D488": "#263555",
    "#F4C24E": "#1C2740",
    "#F2C24E": "#1C273F",
    "#EDB021": "#141C2D",
    "#D99E0A": "#0D121F",
    "#D69A08": "#0C111D",
  },
  Visitor: {
    "#F0B814": "#1B8643",
    "#EAB024": "#208947",
    "#F5C43A": "#1FA350",
    "#E6A81C": "#208043",
    "#F6D488": "#2DD26A",
    "#F4C24E": "#23AE56",
    "#F2C24E": "#25AB56",
    "#EDB021": "#1F8B46",
    "#D99E0A": "#167338",
    "#D69A08": "#147036",
  },
};

function setText(doc: Document, id: string, value: string) {
  const el = doc.getElementById(id);
  if (el) el.textContent = value;
}

// employee_id's text node is literally "ID No : {{employee_id}}" in the master artwork -- the
// "ID No : " label is baked into the approved design, so only the {{token}} substring is
// replaced, never the whole node (which would also delete the label).
function setTokenWithinText(
  doc: Document,
  id: string,
  token: string,
  value: string,
) {
  const el = doc.getElementById(id);
  if (el) el.textContent = (el.textContent ?? "").replace(token, value);
}

function setHref(doc: Document, id: string, href: string) {
  const el = doc.getElementById(id);
  if (el) el.setAttribute("href", href);
}

// Splits the single AppSettings.companyAddress field (free-form, newline-separated) across the
// artwork's four fixed address-line slots. Extra lines beyond 4 are dropped; missing lines are
// left blank. The artwork itself defines exactly four line slots -- this does not add or remove
// any.
function fillCompanyAddressLines(doc: Document, companyAddress: string) {
  const lines = companyAddress.split("\n").map((l) => l.trim());
  for (let i = 0; i < 4; i++) {
    setText(doc, `company_address_line${i + 1}`, lines[i] ?? "");
  }
}

function recolorAccent(doc: Document, employeeType: EmployeeType) {
  const ramp = ACCENT_RAMPS[employeeType];
  if (!ramp || Object.keys(ramp).length === 0) return; // Permanent = template's own colors, untouched
  const nodes = doc.querySelectorAll("[fill]");
  for (const node of nodes) {
    const fill = node.getAttribute("fill");
    if (!fill) continue;
    const replacement = ramp[fill.toUpperCase()];
    if (replacement) node.setAttribute("fill", replacement);
  }
}

function fillCommon(doc: Document, employee: Employee, settings: AppSettings) {
  const roleLabel = employee.designation || employee.role;
  const accentType: EmployeeType = employee.employeeType ?? "Permanent";

  // Company logo: the artwork's own vector "logo" group is left fully intact and visible by
  // default (this is the approved brand mark). When Settings.companyLogo is set, we instead
  // show the hidden `company_logo_slot` <image> (added once, non-destructively, right after
  // the vector group in the master file) and hide the vector group -- we never delete or
  // rewrite the vector artwork itself.
  const logoGroup = doc.getElementById("logo");
  const logoSlot = doc.getElementById("company_logo_slot");
  if (settings.companyLogo && logoSlot) {
    logoSlot.setAttribute("href", settings.companyLogo);
    logoSlot.setAttribute("style", "display:inline");
    logoGroup?.setAttribute("style", "display:none");
  }

  setText(doc, "company_name", settings.companyName);
  fillCompanyAddressLines(doc, settings.companyAddress);
  setText(doc, "company_phone", settings.companyPhone);
  setText(doc, "company_email", settings.companyEmail);
  // Back face uses id="company_website"; front face's footer uses id="website" for the same
  // value (the master artwork names them differently -- front's is even hardcoded literal text
  // today, not a {{token}}). getElementById no-ops harmlessly on whichever side lacks a given
  // id, so it's safe to set both unconditionally here rather than branch on `side`.
  setText(doc, "company_website", settings.companyWebsite ?? "");
  setText(doc, "website", settings.companyWebsite ?? "");

  setText(doc, "employee_name", employee.name);
  setText(doc, "designation", roleLabel);
  setText(doc, "role", employee.role);
  setTokenWithinText(
    doc,
    "employee_id",
    "{{employee_id}}",
    employee.employeeCode ?? "—",
  );
  setText(doc, "mobile", employee.phone || "—");
  setText(doc, "blood_group", employee.bloodGroup ?? "—");
  setText(doc, "emergency_name", employee.emergencyContactName ?? "—");
  setText(doc, "emergency_phone", employee.emergencyContactPhone ?? "—");

  // The employee_photo_label node is a design-time marker (literally "{{employee_photo}}" in
  // the master artwork) sitting at the center of the photo frame -- it must always be cleared,
  // never filled with photo data. A prior "filled example" from an earlier tool mistakenly
  // dumped the entire base64 photo string into this exact node; this is the deliberate fix.
  setText(doc, "employee_photo_label", "");
  setHref(doc, "employee_photo", employee.photoRef ?? "");

  recolorAccent(doc, accentType);
}

/**
 * Parses the master SVG for the given side, fills it with live employee/company data, and
 * returns the serialized SVG markup string. Every coordinate, shape, and decorative element
 * from the master artwork is preserved exactly -- only text content, image hrefs, and the
 * known accent-color fills are modified.
 */
export function fillIdCardSvg(
  side: IdCardSide,
  employee: Employee,
  settings: AppSettings,
): string {
  const raw = side === "front" ? idCardFrontSvgRaw : idCardBackSvgRaw;
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "image/svg+xml");
  fillCommon(doc, employee, settings);
  return new XMLSerializer().serializeToString(doc);
}
