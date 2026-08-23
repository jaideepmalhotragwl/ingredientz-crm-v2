// src/lib/letterhead.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared branded-document renderer. Every module that produces a document —
// DocumentsTab (reformat + generate), docGen.js (invoices, proforma, supplier
// POs), and anything added later — renders through this file.
//
// v2.2 — entity is chosen by the ORDER, not by the customer's country:
//   · ENTITIES entries now carry a `bank` block, printed on invoices
//   · entityForOrder(order) reads orders.entity_code ('INC' | 'PROIN')
//   · entityForCountry / resolveLetterhead are UNCHANGED and still used by
//     DocumentsTab's reformat flow, where a CoA genuinely does follow the
//     customer's country. Do not point invoices at them: Ingredientz Inc sells
//     into the EU, and country routing would send those invoices to PROIN,
//     which throws because PROIN has no letterhead yet.
//
// v2.1 — shared Ingredientz letterhead, table-based pagination:
//   · header and footer are TEXT drawn from the entity record, not PNG images
//   · header, footer and watermark repeat on EVERY page
//   · styling comes from letterheadPrintCss.js — do not restyle here
// ─────────────────────────────────────────────────────────────────────────────

import { LETTERHEAD_CSS } from "../letterhead/letterheadPrintCss.js";
import { INZ_LOGO } from "../letterhead/logoBase64.js";

// ── Entities ─────────────────────────────────────────────────────────────────
// These values are printed on documents. Treat them as customer-facing.
export const ENTITIES = {
  INC: {
    code: "INC",
    name: "Ingredientz Inc",
    address: "8 The Green, Ste A, Dover, DE 19901, United States of America",
    phone: "+1 270 721 5321",
    email: "sales@ingredientz.co",
    web: "www.ingredientz.co",
    label: "Ingredientz Inc (USA)",
    logo: INZ_LOGO,
    watermarkImg: "/letterheads/watermark.png",
    stampImg: "/letterheads/stamp.png",

    // Printed in the "Bank details" section of every customer invoice.
    // Source: Mercury wire-details PDF for the Checking account.
    //
    // ⚠ ACCOUNT NUMBER CONFLICT — RESOLVE BEFORE INVOICING.
    // The Mercury/Choice verification letter dated 13 Nov 2025 states account
    // 202521216235. The wire-details PDF states 202501283000 (Checking). These
    // are different accounts. The number below is taken from the wire-details
    // PDF because that is the document that instructs senders. Confirm with
    // Mercury which account receives customer payments and correct it here if
    // needed — it appears in three places in this block, including inside the
    // FX remittance string.
    bank: {
      beneficiary: "Ingredientz Inc",
      beneficiaryAddress: "8 The Green, Suite A, Dover, DE 19901, USA",
      accountNumber: "202501283000",
      accountKind: "Checking",

      // Domestic US wires and ACH.
      domestic: {
        bankName: "Choice Financial Group",
        bankAddress: "4501 23rd Avenue S, Fargo, ND 58104, US",
        routingAba: "091311229",
      },

      // International wire sent IN USD. Funds reach Choice directly.
      wireUsd: {
        swift: "CHFGUS44021",
        bankName: "Choice Financial Group",
        bankAddress: "4501 23rd Avenue S, Fargo, ND 58104, USA",
        routingAba: "091311229",
      },

      // International wire sent in a FOREIGN CURRENCY (EUR, GBP, CAD…).
      // Structurally different: the receiving bank is JP Morgan Chase, the
      // beneficiary is Choice Financial Group, and the Ingredientz account
      // appears ONLY inside the mandatory remittance reference. A customer
      // given the USD details for a EUR wire will have it rejected or
      // misapplied, which is why these print separately.
      wireFx: {
        swift: "CHASUS33XXX",
        routingAba: "021000021",
        bankName: "JP Morgan Chase Bank, N.A. — New York",
        bankAddress: "383 Madison Avenue, Floor 23, New York, NY 10017, USA",
        beneficiaryName: "Choice Financial Group",
        beneficiaryAccount: "707567692",
        beneficiaryAddress: "4501 23rd Ave S, Fargo, ND 58104, USA",
        // Mercury marks this REQUIRED in the memo / reference field.
        remittanceReference: "/FFC/202501283000/Ingredientz Inc/Dover, USA",
      },

      note: "Banking services provided by Choice Financial Group, Member FDIC.",
    },
  },

  PROIN: {
    code: "PROIN",
    // NOT LIVE. Europe-direct POs will land here eventually — Proingredientz
    // receiving a PO straight from an EU customer is a real case, not a
    // hypothetical. To switch this entity on:
    //   1. replace `address` with the full registered address (street, area,
    //      city, state, PIN) — "Mumbai, India" is not a billable address
    //   2. confirm phone and email
    //   3. set `logo: INZ_LOGO`, and add watermark/stamp paths if they differ
    //   4. fill in the `bank` block below (INR + any EEFC/USD account), and add
    //      GSTIN / IEC — an Indian export invoice needs both
    // Nothing else needs to change; documents are drawn from these fields, and
    // orders already carry entity_code so the routing is ready for it.
    name: "Proingredientz Connections Pvt. Ltd.",
    address: "Mumbai, India",
    phone: "+91 76666 01980",
    email: "sales@ingredientz.co",
    web: "www.ingredientz.co",
    label: "Proingredientz (India)",
    logo: null,
    watermarkImg: null,
    stampImg: null,
    bank: null,
  },
};

const INC_COUNTRIES = new Set(["United States", "Canada"]);

// ── Country routing — for REFORMATTED documents only ─────────────────────────
// A CoA or SDS reformatted for a customer follows that customer's country.
// Invoices and POs do NOT use this. See entityForOrder below.
export function resolveLetterhead(country) {
  return INC_COUNTRIES.has(country) ? "INC" : "PROIN";
}
export function entityForCountry(country) {
  return ENTITIES[resolveLetterhead(country)];
}

// ── Order routing — for INVOICES and SUPPLIER POs ────────────────────────────
// The issuing entity is a commercial decision recorded on the order, not
// something derived from where the customer happens to sit. Defaults to INC so
// every existing order keeps working.
export function entityForOrder(order) {
  const code = (order && order.entity_code) || "INC";
  return ENTITIES[code] || ENTITIES.INC;
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

<div class="lh-doc lh-dense">

  ${watermarkSrc ? `<img class="lh-watermark" src="${watermarkSrc}" alt="">` : ""}

  <table class="lh-grid">

    <!-- HEADER — thead repeats on every printed page -->
    <thead>
      <tr><td class="lh-head-cell">
        <img class="lh-logo" src="${entity.logo}" alt="${entity.name}">
        <div class="lh-rule"></div>
        <div class="lh-rule-thin"></div>
      </td></tr>
    </thead>

    <!-- FOOTER — tfoot repeats on every printed page -->
    <tfoot>
      <tr><td class="lh-foot-cell">
        <div class="lh-rule"></div>
        <div class="lh-rule-thin"></div>
        <div class="lh-addr">${entity.name}, ${entity.address}</div>
        <div class="lh-contacts">${entity.email}<span class="lh-sep">&bull;</span>${entity.web}<span class="lh-sep">&bull;</span>${entity.phone}</div>
      </td></tr>
    </tfoot>

    <tbody>
      <tr><td class="lh-body-cell">
        <div class="lh-body">${withStamps}</div>
      </td></tr>
    </tbody>

  </table>

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
<div class="lh-doc lh-dense">
  <table class="lh-grid">
    <thead><tr><td class="lh-head-cell">
      <img class="lh-logo" src="${logo}" alt="">
      <div class="lh-rule"></div><div class="lh-rule-thin"></div>
    </td></tr></thead>
    <tfoot><tr><td class="lh-foot-cell">
      <div class="lh-rule"></div><div class="lh-rule-thin"></div>
      <div class="lh-addr">${entity.name}, ${entity.address}</div>
      <div class="lh-contacts">${entity.email}<span class="lh-sep">&bull;</span>${entity.web}<span class="lh-sep">&bull;</span>${entity.phone}</div>
    </td></tr></tfoot>
    <tbody><tr><td class="lh-body-cell">
      <div class="lh-body">${bodyHtml}
        ${addStamp && stampSrc ? `<div class="lh-stamp"><img src="${stampSrc}" alt=""></div>` : ""}
      </div>
    </td></tr></tbody>
  </table>
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
