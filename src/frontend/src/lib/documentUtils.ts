/**
 * Opens a new window with just the document content and triggers the browser print dialog.
 */
export async function printDocument(
  elementId = "document-content",
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    document.body.classList.add("print-mode");
    window.print();
    document.body.classList.remove("print-mode");
    return;
  }

  const content = element.innerHTML;
  const win = window.open("", "_blank", "width=900,height=650");
  if (!win) {
    document.body.classList.add("print-mode");
    window.print();
    document.body.classList.remove("print-mode");
    return;
  }

  win.document.write(`
    <html>
      <head>
        <title>Document</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            color: #000;
            background: #fff;
          }
          table { border-collapse: collapse; width: 100%; }
          img { max-width: 100%; height: auto; }
          @page { size: A4; margin: 15mm; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>${content}</body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 500);
}

function buildShareOverlay(modalId: string): HTMLDivElement {
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = modalId;
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;";

  const waId = `${modalId}-wa`;
  const emailId = `${modalId}-email`;
  const closeId = `${modalId}-close`;

  overlay.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:14px;padding:28px 24px;min-width:260px;box-shadow:0 12px 40px rgba(0,0,0,0.25);display:flex;flex-direction:column;gap:12px;">
      <h3 style="margin:0 0 4px;font-size:17px;font-weight:700;color:#111;">Share Document</h3>
      <button id="${waId}" style="padding:11px;background:#25D366;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:14px;font-weight:600;">📱 WhatsApp</button>
      <button id="${emailId}" style="padding:11px;background:#EA4335;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:14px;font-weight:600;">📧 Email</button>
      <button id="${closeId}" style="padding:9px;background:#f5f5f5;color:#555;border:1px solid #ddd;border-radius:9px;cursor:pointer;font-size:13px;">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);

  const waBtn = document.getElementById(waId);
  const emailBtn = document.getElementById(emailId);
  const closeBtn = document.getElementById(closeId);

  if (waBtn)
    waBtn.onclick = () => {
      window.open("https://wa.me/", "_blank");
      overlay.remove();
    };
  if (emailBtn)
    emailBtn.onclick = () => {
      window.location.href = "mailto:";
      overlay.remove();
    };
  if (closeBtn) closeBtn.onclick = () => overlay.remove();
  overlay.onclick = () => overlay.remove();

  return overlay;
}

/**
 * Shows a share modal popup with WhatsApp and Email options.
 */
export function openShareModal(): void {
  buildShareOverlay("share-modal");
}

/**
 * Shows a share modal popup with WhatsApp and Email options.
 * The getText param is accepted for backward compatibility but unused.
 */
export function openShareModalV2(_getText?: () => string): void {
  buildShareOverlay("share-modal-v2");
}

/**
 * Opens the document content in a new tab and triggers the browser print/save dialog.
 * User can select "Save as PDF" in the print dialog to download.
 */
export function handleDownload(
  elementId: string,
  fileName = "Document.pdf",
): void {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      alert("Document not found");
      return;
    }
    const win = window.open("", "_blank");
    if (!win) {
      alert("Please allow popups for this site to download documents.");
      return;
    }
    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${fileName}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body {
        font-family: Arial, Helvetica, sans-serif;
        background: #f0f0f0;
        margin: 0;
        padding: 20px;
        color: #000;
      }
      #save-hint {
        background: #1d4ed8;
        color: #fff;
        text-align: center;
        padding: 12px 20px;
        font-size: 15px;
        font-weight: 600;
        border-radius: 8px;
        margin-bottom: 20px;
        letter-spacing: 0.01em;
      }
      #save-hint span {
        opacity: 0.8;
        font-weight: 400;
        font-size: 13px;
        display: block;
        margin-top: 2px;
      }
      #page-wrapper {
        background: #fff;
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        padding: 15mm;
        box-shadow: 0 4px 24px rgba(0,0,0,0.15);
        border-radius: 4px;
      }
      table { border-collapse: collapse; width: 100%; }
      td, th { padding: 4px 8px; }
      img { max-width: 100%; height: auto; }
      button, .no-print, [data-no-print],
      .action-bar, .modal-actions, .print-hide { display: none !important; }
      @page { size: A4 portrait; margin: 15mm; }
      @media print {
        html, body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
        #save-hint { display: none !important; }
        #page-wrapper {
          width: 100% !important;
          min-height: unset !important;
          padding: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
      }
    </style>
  </head>
  <body>
    <div id="save-hint">
      Press <strong>Ctrl+P</strong> (or ⌘P on Mac) → choose <strong>Save as PDF</strong>
      <span>Your document will open automatically — just save it as PDF from the print dialog.</span>
    </div>
    <div id="page-wrapper">
      ${element.innerHTML}
    </div>
    <script>
      window.addEventListener("load", function() {
        setTimeout(function() { window.print(); }, 400);
      });
    </script>
  </body>
</html>`);
    win.document.close();
    win.focus();
  } catch (err) {
    console.error("Download error:", err);
    alert("Download failed");
  }
}
