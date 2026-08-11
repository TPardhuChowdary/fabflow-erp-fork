import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FileText, Upload } from "lucide-react";
import { useRef } from "react";
import type {
  InspectionDocument,
  InspectionStageDefinition,
} from "../../types";

interface Props {
  documents: InspectionDocument[];
  stages: InspectionStageDefinition[];
  onUpload: (file: File) => void;
  canUpload: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUploadPanel({
  documents,
  stages,
  onUpload,
  canUpload,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageName = (id?: string) =>
    id ? (stages.find((s) => s.id === id)?.name ?? "Stage") : "Whole Sheet";

  return (
    <Card data-ocid="qms.inspection.documents_panel">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">
          Signed Documents — the official evidence
        </CardTitle>
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
              data-ocid="qms.inspection.whole_sheet_upload_input"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              data-ocid="qms.inspection.whole_sheet_upload_button"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Signed Sheet
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {documents.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No documents uploaded yet. The structured digital data above is
            never a substitute for the signed original — upload it here once
            available.
          </p>
        )}
        <div className="space-y-1.5">
          {documents.map((doc, i) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs"
              data-ocid={`qms.inspection.document_row.${i + 1}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{doc.fileName}</div>
                  <div className="text-muted-foreground">
                    {stageName(doc.stageId)} · {formatSize(doc.fileSize)} ·{" "}
                    {new Date(doc.uploadedAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 shrink-0"
                onClick={() => {
                  const url = URL.createObjectURL(doc.blob);
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
                data-ocid={`qms.inspection.document_view.${i + 1}`}
                title="View / Download"
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
