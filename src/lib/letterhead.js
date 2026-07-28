// src/lib/letterhead.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared branded-document renderer. Every module that produces a document —
// DocumentsTab (reformat + generate), docGen.js (invoices, proforma, supplier
// POs), and anything added later — renders through this file.
//
// v2.0 — now uses the shared Ingredientz letterhead:
//   · header and footer are TEXT drawn from the entity record, not PNG images,
//     so the address is selectable and searchable in the PDF and a phone number
//     changes in exactly one place
//   · header, footer and watermark repeat on EVERY page. The old version used
//     position:absolute inside the sheet, so a two-page invoice lost its
//     letterhead and ran off the bottom edge from page 2 onward
//   · styling comes from letterheadPrintCss.js — do not restyle here
//
// Public API is unchanged, so docGen.js needs no edits:
//   ENTITIES, resolveLetterhead, entityForCountry,
//   renderBrandedHtml, renderCaptureHtml, openBrandedDoc
// ─────────────────────────────────────────────────────────────────────────────

import { LETTERHEAD_CSS } from "../letterhead/letterheadPrintCss.js";
import { INZ_LOGO } from "../letterhead/logoBase64.js";

// ── Entities ─────────────────────────────────────────────────────────────────
// These values are printed on the document footer. Treat them as customer-facing.
export const ENTITIES = {
  INC: {
    name: "Ingredientz Inc",
    address: "8 The Green, Ste A, Dover, DE 19901, United States of America",
    phone: "+1 270 721 5321",
    email: "sales@ingredientz.co",
    web: "www.ingredientz.co",
    label: "Ingredientz Inc (USA)",
    logo: INZ_LOGO,
    watermarkImg: "/letterheads/watermark.png",
    stampImg: "/letterheads/stamp.png",
  },
  PROIN: {
    // NOT LIVE. To switch the India entity on:
    //   1. replace `address` with the full registered address (street, area,
    //      city, state, PIN) — "Mumbai, India" is not a billable address
    //   2. confirm phone and email
    //   3. set `logo: INZ_LOGO`
    // Nothing else needs to change; the letterhead is drawn from these fields.
    name: "Proingredientz Connections Pvt. Ltd.",
    address: "Mumbai, India",
    phone: "+91 76666 01980",
    email: "sales@ingredientz.co",
    web: "www.ingredientz.co",
    label: "Proingredientz (India)",
    logo: null,
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

// ── The A4 branded shell ─────────────────────────────────────────────────────
// `bodyHtml` is your document markup. Use .doc-title, .doc-ref, h2.section,
// <table>, .totals, .parties, .conclusion — all styled by the shared CSS.
//
// Throws if the entity has no letterhead configured. That is deliberate: the
// old behaviour rendered a page with no header and no footer at all, which is
// worse than failing, because an unbranded invoice can reach a customer.
export function renderBrandedHtml(bodyHtml, entity, { addStamp = true } = {}) {
  if (!entity) throw new Error("renderBrandedHtml: no entity supplied.");
  if (!entity.logo) {
    throw new Error(
      `${entity.label || entity.name} letterhead is not configured yet. ` +
      `Add its address and logo in src/lib/letterhead.js before issuing documents for this entity.`
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const watermarkSrc = entity.watermarkImg ? `${origin}${entity.watermarkImg}` : "";
  const stampSrc     = entity.stampImg     ? `${origin}${entity.stampImg}`     : "";

  // Some templates (docTemplates.js `sign()`) already place their own stamp
  // slot. Only append one if the body doesn't have a slot, or the document
  // comes out with two stamps on it.
  const hasOwnStamp = /class=["'][^"']*(?:stamp-placeholder|lh-stamp)/i.test(bodyHtml);

  const body = addStamp && stampSrc && !hasOwnStamp
    ? `${bodyHtml}<div class="lh-stamp"><img src="${stampSrc}" alt="Stamp"></div>`
    : bodyHtml;

  // Fill any placeholder the template emitted with a real <img>; background
  // images are stripped when a browser prints to PDF.
  const withStamps = stampSrc && addStamp
    ? body.replace(
        /<div([^>]*class=["'][^"']*(?:stamp-placeholder|lh-stamp)[^"']*["'][^>]*)>(\s*)<\/div>/gi,
        (_m, attrs) => `<div${attrs}><img src="${stampSrc}" alt="Stamp"></div>`
      )
    : body;

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>${entity.name} — Document</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>${LETTERHEAD_CSS}</style>
</head><body>

<div class="lh-doc lh-a4 lh-dense">

  <header class="lh-header">
    <img class="lh-logo" src="${entity.logo}" alt="${entity.name}">
    <div class="lh-rule"></div>
    <div class="lh-rule-thin"></div>
  </header>

  ${watermarkSrc ? `<img class="lh-watermark" src="${watermarkSrc}" alt="">` : ""}

  <footer class="lh-footer">
    <div class="lh-rule"></div>
    <div class="lh-rule-thin"></div>
    <div class="lh-addr">${entity.name}, ${entity.address}</div>
    <div class="lh-contacts">${entity.email}<span class="lh-sep">&bull;</span>${entity.web}<span class="lh-sep">&bull;</span>${entity.phone}</div>
  </footer>

  <main class="lh-body">${withStamps}</main>

</div>

</body></html>`;
}

// ── Capture-friendly renderer ────────────────────────────────────────────────
// Legacy, for an html2canvas path that is not currently wired up. Kept so that
// if anything still calls it, the output is on-brand rather than off-brand.
export function renderCaptureHtml(bodyHtml, entity, { addStamp = true } = {}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const stampSrc = entity?.stampImg ? `${origin}${entity.stampImg}` : "";
  const logo = entity?.logo || INZ_LOGO;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>${LETTERHEAD_CSS}
  .lh-doc{ width:794px; min-height:1123px; }
</style></head><body>
<div class="lh-doc lh-a4 lh-dense">
  <header class="lh-header">
    <img class="lh-logo" src="${logo}" alt="">
    <div class="lh-rule"></div><div class="lh-rule-thin"></div>
  </header>
  <footer class="lh-footer">
    <div class="lh-rule"></div><div class="lh-rule-thin"></div>
    <div class="lh-addr">${entity.name}, ${entity.address}</div>
    <div class="lh-contacts">${entity.email}<span class="lh-sep">&bull;</span>${entity.web}<span class="lh-sep">&bull;</span>${entity.phone}</div>
  </footer>
  <main class="lh-body">${bodyHtml}
    ${addStamp && stampSrc ? `<div class="lh-stamp"><img src="${stampSrc}" alt=""></div>` : ""}
  </main>
</div>
</body></html>`;
}

// ── Open a print-to-PDF window ───────────────────────────────────────────────
export function openBrandedDoc(bodyHtml, entity, { addStamp = true, autoPrint = true } = {}) {
  let html;
  try {
    html = renderBrandedHtml(bodyHtml, entity, { addStamp });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const win = window.open("", "_blank");
  if (!win) return { ok: false, error: "Popup blocked. Allow popups for this site." };
  if (autoPrint) {
    // Print once fonts and images are ready. The old fixed 1500ms timeout fired
    // while the sheet was still half-rendered.
    html = html.replace("</body></html>", `<script>
  window.addEventListener('load', function () {
    var go = function () { window.print(); };
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(go).catch(go); }
    else { go(); }
  });
<\/script></body></html>`);
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  return { ok: true };
}
