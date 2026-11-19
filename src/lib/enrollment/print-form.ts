/*
 * Author: Gian Mandac
 * Created Date: 20261116
 * Print A4 Verification Form. The form is printed from its own standalone A4 document
 * instead of hiding the rest of the dashboard, so every browser prints only the form,
 * on one page where possible, with no blank pages or cut-off content.
 */

const printStyles = `
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { color: #000; font: 10pt/1.35 Arial, "Helvetica Neue", sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-form { width: 100%; max-width: 182mm; margin: 0 auto; }
  .print-head { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6pt; margin-bottom: 6pt; }
  .print-head h1 { margin: 0; font-size: 15pt; }
  .print-head p { margin: 2pt 0; }
  .print-meta { display: flex; justify-content: space-between; gap: 8pt; font-size: 9pt; text-align: left; }
  h2 { margin: 8pt 0 3pt; font-size: 10.5pt; text-transform: uppercase; letter-spacing: .03em; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; break-inside: avoid; }
  th, td { padding: 3pt 5pt; border: 1px solid #555; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { width: 19%; background: #eee; font-weight: 700; }
  .guardians th { width: auto; }
  .capitalize { text-transform: capitalize; }
  .print-checklist { margin: 0; padding: 0; list-style: none; columns: 2; column-gap: 12pt; font-size: 9.5pt; }
  .print-checklist li { break-inside: avoid; margin-bottom: 2pt; }
  .print-remarks { min-height: 28pt; margin: 0; padding: 4pt; border: 1px solid #555; white-space: pre-wrap; }
  .print-signatures { display: flex; justify-content: space-between; gap: 30pt; margin-top: 30pt; break-inside: avoid; }
  .print-signatures div { flex: 1; display: grid; gap: 3pt; font-size: 9pt; text-align: center; }
  .print-signatures span { border-top: 1px solid #000; }
  .screen-actions { display: flex; justify-content: center; gap: 8px; margin: 0 0 16px; font: 14px Arial, sans-serif; }
  .screen-actions button { padding: 8px 16px; border: 1px solid #8f170e; border-radius: 4px; background: #8f170e; color: #fff; font-weight: 700; cursor: pointer; }
  @media screen { body { padding: 16px; background: #f3f3f3; } .print-form { padding: 14mm; background: #fff; box-shadow: 0 2px 12px rgb(0 0 0 / 15%); } }
  @media print { .screen-actions { display: none; } }
`;

/** Builds the standalone A4 document. formHtml is markup Vue already rendered and escaped. */
export function buildPrintDocument(formHtml: string, title: string, withPrintButton = false) {
  const safeTitle = title.replace(/[<>&"]/g, "");
  const actions = withPrintButton
    ? `<div class="screen-actions"><button type="button" onclick="window.print()">Print or save as PDF</button></div>`
    : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${safeTitle}</title>`
    + `<style>${printStyles}</style></head><body>${actions}<article class="print-form">${formHtml}</article></body></html>`;
}

/** Prints the document from a hidden frame, so only the form is sent to the printer. */
export function printDocument(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const remove = () => setTimeout(() => frame.remove(), 1000);
  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) { remove(); return; }
    view.addEventListener("afterprint", remove, { once: true });
    view.focus();
    view.print();
    // Some browsers do not fire afterprint for frames; clean up after a minute regardless.
    setTimeout(() => frame.remove(), 60_000);
  };
  frame.srcdoc = html;
  return frame;
}

/** Opens the form by itself in a new tab, for browsers whose print dialog has no preview. */
export function openPrintableDocument(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
