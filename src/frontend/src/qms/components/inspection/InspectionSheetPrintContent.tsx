// Plain, inline-styled print content — mirrors the exact technique
// lib/documentRenderers.tsx already uses for Invoices/Quotations/DCs: render
// this off-screen, grab its innerHTML, dump it into a new window with
// @page{size:A4} CSS, then window.print(). No Tailwind classes here — they
// would not be present in that plain new window.
import type React from "react";
import {
  INSPECTION_MODE_LABELS,
  INSPECTION_SHEET_STATUS_LABELS,
} from "../../constants";
import type {
  InspectionSheet,
  InspectionStageCompletion,
  InspectionStageDefinition,
  InspectionStageEntry,
  QualityCharacteristic,
} from "../../types";

const HIDDEN_STYLE: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: -9999,
  width: 800,
  background: "#fff",
  padding: 24,
  fontFamily: "Arial, sans-serif",
  color: "#111",
};

interface Props {
  id: string;
  companyName: string;
  companyAddress?: string;
  companyGstin?: string;
  projectNo: string;
  customerName: string;
  sheet: InspectionSheet;
  stages: InspectionStageDefinition[];
  characteristicsByStage: Record<string, QualityCharacteristic[]>;
  entriesByStage: Record<string, InspectionStageEntry[]>;
  completionsByStage: Record<string, InspectionStageCompletion | undefined>;
}

export function InspectionSheetPrintContent({
  id,
  companyName,
  companyAddress,
  companyGstin,
  projectNo,
  customerName,
  sheet,
  stages,
  characteristicsByStage,
  entriesByStage,
  completionsByStage,
}: Props) {
  return (
    <div id={id} style={HIDDEN_STYLE}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "2px solid #1a1a1a",
          paddingBottom: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            {companyName || "YOUR COMPANY NAME"}
          </div>
          {companyAddress && (
            <div style={{ fontSize: 10, color: "#555" }}>{companyAddress}</div>
          )}
          {companyGstin && (
            <div style={{ fontSize: 10, color: "#555" }}>
              GSTIN: {companyGstin}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>
            QUALITY INSPECTION SHEET
          </div>
          <div style={{ fontSize: 11 }}>
            Inspection No: {sheet.inspectionNumber}
          </div>
          <div style={{ fontSize: 11 }}>Revision: {sheet.revision}</div>
        </div>
      </div>

      <table
        style={{
          width: "100%",
          fontSize: 11,
          marginBottom: 14,
          borderCollapse: "collapse",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                padding: "3px 6px 3px 0",
                fontWeight: 700,
                width: "16%",
              }}
            >
              Project
            </td>
            <td style={{ padding: "3px 0" }}>{projectNo}</td>
            <td
              style={{
                padding: "3px 6px 3px 0",
                fontWeight: 700,
                width: "16%",
              }}
            >
              Customer
            </td>
            <td style={{ padding: "3px 0" }}>{customerName}</td>
          </tr>
          <tr>
            <td style={{ padding: "3px 6px 3px 0", fontWeight: 700 }}>
              Drawing No
            </td>
            <td style={{ padding: "3px 0" }}>
              {sheet.drawingReference || "—"}
            </td>
            <td style={{ padding: "3px 6px 3px 0", fontWeight: 700 }}>
              Drawing Rev
            </td>
            <td style={{ padding: "3px 0" }}>{sheet.drawingRevision || "—"}</td>
          </tr>
          <tr>
            <td style={{ padding: "3px 6px 3px 0", fontWeight: 700 }}>Mode</td>
            <td style={{ padding: "3px 0" }}>
              {INSPECTION_MODE_LABELS[sheet.mode]}
            </td>
            <td style={{ padding: "3px 6px 3px 0", fontWeight: 700 }}>
              Status
            </td>
            <td style={{ padding: "3px 0" }}>
              {INSPECTION_SHEET_STATUS_LABELS[sheet.status]}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "3px 6px 3px 0", fontWeight: 700 }}>
              Generated
            </td>
            <td style={{ padding: "3px 0" }} colSpan={3}>
              {new Date(sheet.generatedAt).toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>

      {stages.map((stage) => {
        const chars = characteristicsByStage[stage.id] ?? [];
        const entries = entriesByStage[stage.id] ?? [];
        const completion = completionsByStage[stage.id];
        return (
          <div
            key={stage.id}
            style={{ marginBottom: 16, breakInside: "avoid" }}
          >
            <div
              style={{
                background: "#f0f0f0",
                padding: "5px 8px",
                fontWeight: 700,
                fontSize: 12,
                border: "1px solid #ccc",
              }}
            >
              {stage.name}
            </div>
            <table
              style={{
                width: "100%",
                fontSize: 10,
                borderCollapse: "collapse",
                border: "1px solid #ccc",
              }}
            >
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={th}>Characteristic</th>
                  <th style={{ ...th, width: 70 }}>Result</th>
                  <th style={{ ...th, width: 90 }}>Value</th>
                  <th style={th}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {chars.length === 0 && (
                  <tr>
                    <td style={td} colSpan={4}>
                      No characteristics defined for this stage in the library
                      yet.
                    </td>
                  </tr>
                )}
                {chars.map((c) => {
                  const entry = entries.find(
                    (e) => e.characteristicId === c.id,
                  );
                  return (
                    <tr key={c.id}>
                      <td style={td}>
                        {c.name}
                        {c.evidenceRequired && (
                          <span style={{ color: "#555" }}>
                            {" "}
                            (evidence required)
                          </span>
                        )}
                        {c.photoRequired && (
                          <span style={{ color: "#555" }}>
                            {" "}
                            (photo required)
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        {entry?.result ?? "☐ P ☐ F ☐ NA"}
                      </td>
                      <td style={td}>{entry?.measuredValue ?? ""}</td>
                      <td style={td}>{entry?.remarks ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <table style={{ width: "100%", fontSize: 10, marginTop: 4 }}>
              <tbody>
                <tr>
                  <td style={{ width: "25%", padding: "10px 6px 0 0" }}>
                    Inspector Name:{" "}
                    {completion?.inspectorName || "________________"}
                  </td>
                  <td style={{ width: "25%", padding: "10px 6px 0 0" }}>
                    Signature:{" "}
                    {completion?.signatureDataUrl ? (
                      <img
                        src={completion.signatureDataUrl}
                        alt="signature"
                        style={{ height: 24, verticalAlign: "middle" }}
                      />
                    ) : (
                      "________________"
                    )}
                  </td>
                  <td style={{ width: "25%", padding: "10px 6px 0 0" }}>
                    Date:{" "}
                    {completion?.completedAt
                      ? new Date(completion.completedAt).toLocaleDateString()
                      : "________"}
                  </td>
                  <td style={{ width: "25%", padding: "10px 0 0 0" }}>
                    Time:{" "}
                    {completion?.completedAt
                      ? new Date(completion.completedAt).toLocaleTimeString()
                      : "________"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      <table
        style={{
          width: "100%",
          fontSize: 10,
          marginTop: 20,
          breakInside: "avoid",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                width: "33%",
                borderTop: "1px solid #999",
                padding: "20px 6px 0 0",
              }}
            >
              Inspected By / Date
            </td>
            <td
              style={{
                width: "33%",
                borderTop: "1px solid #999",
                padding: "20px 6px 0 0",
              }}
            >
              Reviewed By (Supervisor) / Date
            </td>
            <td
              style={{
                width: "34%",
                borderTop: "1px solid #999",
                padding: "20px 0 0 0",
              }}
            >
              Approved By (QA) / Date
            </td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          fontSize: 9,
          color: "#777",
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          Revision {sheet.revision} · Inspection No {sheet.inspectionNumber}
        </span>
        <span>Printed {new Date().toLocaleString()}</span>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 6px",
  border: "1px solid #ccc",
};
const td: React.CSSProperties = {
  padding: "4px 6px",
  border: "1px solid #ccc",
  verticalAlign: "top",
};
