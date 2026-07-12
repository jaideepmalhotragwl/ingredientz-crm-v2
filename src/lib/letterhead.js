// src/lib/letterhead.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared branded-document renderer.
// Extracted from DocumentsTab.jsx (the reformatter) so the order/sample document
// generators reuse the SAME letterhead, entity routing, and A4 print styling.
//
// Two ways to output a branded doc from a body-HTML string + an entity:
//   1. openBrandedDoc(bodyHtml, entity, { addStamp })  -> opens print-to-PDF window (no deps)
//   2. renderBrandedHtml(bodyHtml, entity, { addStamp }) -> returns the full A4 HTML string
//      (feed this to html2pdf.js to get a Blob you can upload to storage — see docGen.js)
// ─────────────────────────────────────────────────────────────────────────────

// Entities & routing — kept identical to the reformatter so branding stays consistent.
export const ENTITIES = {
  INC: {
    name: "Ingredientz Inc",
    address: "8 The Green, Ste A, Dover, DE 19901, USA",
    phone: "+1 702 472 8805",
    email: "support@ingredientz.co",
    web: "www.ingredientz.co",
    label: "Ingredientz Inc (USA)",
    headerImg: "/letterheads/header.png",
    footerImg: "/letterheads/footer.png",
    watermarkImg: "/letterheads/watermark.png",
    stampImg: "/letterheads/stamp.png",
  },
  PROIN: {
    name: "Proingredientz Connections Pvt. Ltd.",
    address: "Mumbai, India",
    phone: "+91 76666 01980",
    email: "support@ingredientz.co",
    web: "www.ingredientz.co",
    label: "Proingredientz (India)",
    headerImg: null,
    footerImg: null,
    watermarkImg: null,
    stampImg: null,
  },
};

const INC_COUNTRIES = new Set(["United States", "Canada"]);

// Customer country -> which entity's letterhead to bill from.
export function resolveLetterhead(country) {
  return INC_COUNTRIES.has(country) ? "INC" : "PROIN";
}
export function entityForCountry(country) {
  return ENTITIES[resolveLetterhead(country)];
}

// ── The A4 branded shell (verbatim styling from the reformatter) ──────────────
// Returns the full <html> document as a string. `bodyHtml` is your invoice / PO
// markup — use <h2 class="section">, <table>, etc. and it inherits pharma-classic styling.
export function renderBrandedHtml(bodyHtml, entity, { addStamp = true } = {}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const headerSrc    = entity.headerImg    ? `${origin}${entity.headerImg}`    : "";
  const footerSrc    = entity.footerImg    ? `${origin}${entity.footerImg}`    : "";
  const watermarkSrc = entity.watermarkImg ? `${origin}${entity.watermarkImg}` : "";
  const stampSrc     = entity.stampImg     ? `${origin}${entity.stampImg}`     : "";

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${entity.name} — Document</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&family=Source+Serif+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  body { margin: 0; font-family: 'Inter', -apple-system, Arial, sans-serif; color: #1a1a1a; background: #e5e7eb; }
  .a4 { width: 210mm; min-height: 297mm; margin: 0 auto; position: relative; background: white; box-shadow: 0 4px 24px rgba(0,0,0,0.12); page-break-after: always; }
  .lh-header img, .lh-footer img { width: 100%; display: block; }
  .lh-header { position: absolute; top: 0; left: 0; right: 0; }
  .lh-footer { position: absolute; bottom: 0; left: 0; right: 0; }
  .lh-watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 140mm; opacity: 0.07; pointer-events: none; }
  .lh-content { padding: 50mm 18mm 35mm 18mm; position: relative; z-index: 2; font-size: 9.5pt; line-height: 1.35; }
  .lh-content h1, .lh-content h2, .lh-content h3, .lh-content .doc-title { font-family: 'Source Serif Pro', Georgia, serif; color: #0A2540; margin: 0; font-weight: 600; letter-spacing: -0.005em; }
  .lh-content .doc-title { font-size: 16pt; text-align: center; margin-bottom: 4px; }
  .lh-content h2 { font-size: 14pt; margin: 12px 0 6px; }
  .lh-content h3 { font-size: 11pt; margin: 8px 0 4px; }
  .lh-content .doc-ref { text-align: center; font-size: 8.5pt; color: #555; margin-bottom: 14px; font-family: 'Inter', sans-serif; letter-spacing: 0.5px; }
  .lh-content h2.section, .lh-content .section { font-family: 'Inter Tight', sans-serif; font-size: 10pt; font-weight: 600; background: #F0F4F8; color: #0A2540; padding: 4px 10px; margin: 12px 0 6px; border-left: 3px solid #0A2540; text-transform: uppercase; letter-spacing: 0.6px; }
  .lh-content table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 6px 0 10px; }
  .lh-content th { background: #0A2540; color: white; padding: 5px 8px; text-align: left; font-weight: 600; font-family: 'Inter Tight', sans-serif; font-size: 8pt; letter-spacing: 0.3px; text-transform: uppercase; border: 1px solid #0A2540; }
  .lh-content td { padding: 4px 8px; border: 1px solid #D5DCE2; vertical-align: top; }
  .lh-content tbody tr:nth-child(even) td { background: #F9FAFB; }
  .lh-content td.num, .lh-content th.num { text-align: right; }
  .lh-content strong, .lh-content b { font-weight: 600; color: #0A2540; }
  .lh-content em { font-style: italic; color: #555; }
  .lh-content p { margin: 6px 0; }
  .lh-content .totals { width: 45%; margin-left: 55%; }
  .lh-content .totals td { border: none; padding: 3px 8px; }
  .lh-content .totals tr.grand td { border-top: 2px solid #0A2540; font-weight: 700; color: #0A2540; font-size: 10.5pt; }
  .lh-content .parties { display: flex; gap: 18px; margin: 10px 0; }
  .lh-content .party { flex: 1; font-size: 8.8pt; line-height: 1.4; }
  .lh-content .party .lbl { font-family: 'Inter Tight', sans-serif; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.6px; color: #7a8794; margin-bottom: 2px; }
  .lh-content .conclusion, .lh-content blockquote { margin: 10px 0; padding: 8px 12px; background: #ECFDF5; border-left: 3px solid #059669; font-size: 9pt; font-style: normal; }
  .lh-content ul, .lh-content ol { margin: 6px 0; padding-left: 20px; font-size: 9pt; }
  .lh-content li { margin: 2px 0; }
  .stamp-placeholder { display: block; height: 130px; margin-top: 24px; position: relative; }
  .stamp-placeholder img { position: absolute; right: 0; top: 0; width: 230px; height: auto; opacity: 0.85; transform: rotate(-3deg); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  @media print { body { background: white; } .a4 { box-shadow: none; } }
</style>
</head><body>
<div class="a4">
  ${headerSrc ? `<div class="lh-header"><img src="${headerSrc}"></div>` : ""}
  ${watermarkSrc ? `<img class="lh-watermark" src="${watermarkSrc}">` : ""}
  <div class="lh-content">${bodyHtml}${addStamp && stampSrc ? `<div class="stamp-placeholder"></div>` : ""}</div>
  ${footerSrc ? `<div class="lh-footer"><img src="${footerSrc}"></div>` : ""}
</div>
<script>
  (function(){
    var stamps = document.querySelectorAll('.stamp-placeholder');
    for (var i=0;i<stamps.length;i++){
      if(!stamps[i].querySelector('img')){
        var img=document.createElement('img'); img.src='${stampSrc}'; img.alt='Stamp'; stamps[i].appendChild(img);
      }
    }
  })();
<\/script>
</body></html>`;
}

// ── Capture-friendly renderer (for html2canvas → stored PDF) ──────────────────
// Pixel units, normal document flow, logo constrained. html2canvas renders this
// reliably (unlike the mm/absolute print layout above). Reuses the same doc-body
// classes (doc-title, section, table, totals, parties) so templates are shared.
export function renderCaptureHtml(bodyHtml, entity, { addStamp = true } = {}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const headerSrc = entity.headerImg ? `${origin}${entity.headerImg}` : "";
  const stampSrc  = entity.stampImg  ? `${origin}${entity.stampImg}`  : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;}
  body{margin:0;background:#fff;font-family:'Inter',Arial,sans-serif;color:#1a1a1a;}
  .a4{width:794px;min-height:1123px;margin:0 auto;background:#fff;padding:40px 48px;position:relative;font-size:12px;line-height:1.4;}
  .doc-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0A2540;padding-bottom:14px;margin-bottom:18px;}
  .doc-head img{height:56px;width:auto;display:block;}
  .doc-head .ent{text-align:right;font-size:10.5px;color:#555;line-height:1.45;}
  .doc-head .ent b{color:#0A2540;font-size:13px;}
  .doc-title{font-family:'Source Serif Pro',Georgia,serif;font-size:22px;text-align:center;color:#0A2540;font-weight:600;margin:6px 0 4px;}
  .doc-ref{text-align:center;font-size:11px;color:#555;margin-bottom:16px;letter-spacing:.4px;}
  h2.section,.section{background:#F0F4F8;color:#0A2540;padding:5px 12px;border-left:3px solid #0A2540;text-transform:uppercase;font-size:11.5px;font-weight:600;letter-spacing:.6px;margin:14px 0 6px;font-family:'Inter',sans-serif;}
  table{width:100%;border-collapse:collapse;font-size:11.5px;margin:8px 0 12px;}
  th{background:#0A2540;color:#fff;padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.3px;border:1px solid #0A2540;}
  td{padding:6px 9px;border:1px solid #D5DCE2;vertical-align:top;}
  td.num,th.num{text-align:right;}
  tbody tr:nth-child(even) td{background:#F9FAFB;}
  strong,b{color:#0A2540;}
  p{margin:6px 0;}
  .parties{display:flex;gap:24px;margin:12px 0;}
  .party{flex:1;font-size:11.5px;line-height:1.5;}
  .party .lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:#7a8794;margin-bottom:3px;}
  .totals{width:46%;margin-left:54%;}
  .totals td{border:none;padding:4px 9px;}
  .totals tr.grand td{border-top:2px solid #0A2540;font-weight:700;color:#0A2540;font-size:14px;}
</style></head><body>
<div class="a4">
  <div class="doc-head">
    ${headerSrc ? `<img src="${headerSrc}" alt="">` : `<div style="font-weight:700;font-size:20px;color:#0A2540">${entity.name}</div>`}
    <div class="ent"><b>${entity.name}</b><br>${entity.address}<br>${entity.phone} · ${entity.email}<br>${entity.web}</div>
  </div>
  ${bodyHtml}
  ${addStamp && stampSrc ? `<div style="margin-top:28px;text-align:right"><img src="${stampSrc}" style="width:150px;opacity:.85;transform:rotate(-3deg)" alt=""></div>` : ""}
</div>
</body></html>`;
}

// Option 1 — open a print-to-PDF window (zero dependencies, works today).
export function openBrandedDoc(bodyHtml, entity, { addStamp = true, autoPrint = true } = {}) {
  const win = window.open("", "_blank");
  if (!win) return { ok: false, error: "Popup blocked. Allow popups for this site." };
  let html = renderBrandedHtml(bodyHtml, entity, { addStamp });
  if (autoPrint) {
    html = html.replace("</body></html>",
      `<script>setTimeout(function(){window.print();},1500);<\/script></body></html>`);
  }
  win.document.write(html);
  win.document.close();
  return { ok: true };
}
