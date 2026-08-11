import { useMemo } from "react";
import { fillIdCardSvg } from "../lib/idCardTemplate";
import type { AppSettings, Employee } from "../types";

interface Props {
  employee: Employee;
  settings: AppSettings;
  side: "front" | "back";
}

/** Renders one face of the approved master SVG ID card template (see
 * assets/idCardTemplates/id_card_front.svg, id_card_back.svg), filled with the live
 * employee/company data via lib/idCardTemplate.ts's fillIdCardSvg(). This component does not
 * draw, approximate, or redesign any part of the card -- it parses the master artwork, sets
 * text/image values by element id, and injects the resulting markup verbatim. It is used both
 * as the always-current on-screen live preview and, via its stable wrapping container id in
 * EmployeeDetail.tsx, as the exact content the Print action prints (see lib/documentUtils.ts
 * printDocument). The real downloadable PDF (lib/generateEmployeeIdCardPdf.ts) renders this
 * same filled SVG markup through svg2pdf.js, so preview / print / PDF are all the same source
 * artwork, not three separate re-implementations.
 *
 * Note: the master artwork's front face is authored at a different native height than the back
 * face (viewBox 572x913 vs 572x809 -- an inconsistency in the approved template files
 * themselves, not something normalized here per "preserve every coordinate exactly as they
 * exist in the SVG"). Each face is rendered at its own native aspect ratio. */
export function EmployeeIdCardPreview({ employee, settings, side }: Props) {
  const filledSvgMarkup = useMemo(
    () => fillIdCardSvg(side, employee, settings),
    [side, employee, settings],
  );

  return (
    <div
      className="[&_svg]:block [&_svg]:h-auto [&_svg]:w-full [&_svg]:rounded-xl [&_svg]:shadow-sm w-[240px]"
      data-ocid={`employee-idcard.${side}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: our own master SVG template (not user input), only text/attribute values substituted by fillIdCardSvg -- see lib/idCardTemplate.ts
      dangerouslySetInnerHTML={{ __html: filledSvgMarkup }}
    />
  );
}
