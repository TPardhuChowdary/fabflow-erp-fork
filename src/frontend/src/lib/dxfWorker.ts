// Web Worker: parses a DXF file's raw text into dxf-parser's entity/layer
// tree off the main thread, so large CAD files never block the preview UI.
// Geometry conversion into fabric.Object instances (dxfPreview.ts) happens
// back on the main thread — fabric needs a real DOM canvas, but DxfParser
// itself has no DOM dependency and runs fine here.
import DxfParser from "dxf-parser";

self.onmessage = (e: MessageEvent<string>) => {
  try {
    const parser = new DxfParser();
    const dxf = parser.parseSync(e.data);
    postMessage({ ok: true, dxf });
  } catch (err) {
    postMessage({
      ok: false,
      error: err instanceof Error ? err.message : "Failed to parse DXF file",
    });
  }
};
