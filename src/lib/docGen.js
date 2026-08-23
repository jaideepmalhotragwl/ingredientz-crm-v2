// src/lib/docGen.js
// ─────────────────────────────────────────────────────────────────────────────
// Order-document generator: builds a branded Customer Invoice / Proforma and a
// Supplier PO from structured order data, renders on the shared letterhead, and
// stores it as a self-contained HTML file in the `order-documents` bucket.
//
// Why HTML (not PDF): the branded letterhead renders perfectly in a real browser
// (same engine as the reformatter). The stored page opens with a "Save as PDF"
// button (window.print → A4). No html2canvas, no rasterisation, no dependency.
//
// The letterhead itself lives in src/lib/letterhead.js. This file only builds
// the document body — do not put styling here.
//
// v2 changes:
//   · the issuing entity comes from orders.entity_code via entityForOrder(),
//     NOT from the customer's country. Country routing sent every EU invoice to
//     PROIN, which has no letterhead, so those invoices threw instead of
//     printing. Ingredientz Inc sells into the EU; that is normal, not an edge
//     case. `order.entity_country` — which the old supplier-PO path read — does
//     not exist as a column and always fell through to the default.
//   · the Bank details section prints the real block from the entity record.
//     It used to print the literal string "[Bank name · A/C · IBAN/SWIFT — pull
//     from entity settings]" onto the customer's invoice.
//   · every public entry point returns { ok } / { error } instead of throwing,
//     so a missing letterhead or bank block surfaces as a message rather than a
//     blank screen.
//
// FIELD ASSUMPTIONS — these now exist on `companies` after the billing-fields
// migration: address, city, state, postcode, country, tax_id, contact_person.
// A blank address block means the company record hasn't been filled in; the
// invoice will still render, minus the address lines.
// ─────────────────────────────────────────────────────────────────────────────

import { renderBrandedHtml, entityForOrder } from "./letterhead.js";
import { fmtMoney, slugify } from "./orderUtils.js";
import { fmtName } from "./nameFormat.js";
import { supabase } from "../config.js";

// Brand navy — keep in step with --inz-navy in letterheadPrintCss.js
const NAVY = "#10314F";

// ── small helpers ────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function money(n, cur) { return esc(fmtMoney(n, cur)); }
function today() { return new Date().toISOString().slice(0, 10); }
function fmtDay(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function addressBlock(p) {
  return [p?.address, [p?.city, p?.state].filter(Boolean).join(", "), p?.postcode, p?.country]
    .filter(Boolean).map(esc).join("<br>");
}
function partiesHtml(fromLabel, from, toLabel, to) {
  return `<div class="parties">
    <div class="party">
      <div class="lbl">${esc(fromLabel)}</div>
      <strong>${esc(from.name || from.company)}</strong><br>${addressBlock(from)}
      ${from.tax_id ? `<br>Tax ID: ${esc(from.tax_id)}` : ""}
      ${from.email ? `<br>${esc(from.email)}` : ""}${from.phone ? ` · ${esc(from.phone)}` : ""}
    </div>
    <div class="party">
      <div class="lbl">${esc(toLabel)}</div>
      <strong>${esc(fmtName(to.company || to.name))}</strong><br>${addressBlock(to)}
      ${to.tax_id ? `<br>Tax ID: ${esc(to.tax_id)}` : ""}
      ${to.contact_person ? `<br>Attn: ${esc(to.contact_person)}` : ""}
    </div>
  </div>`;
}

// ── Bank details ───────────────────────────────────────────────────────
// Which rails print depends on the invoice currency, because they are not
// interchangeable. A USD invoice shows the domestic (ACH) and international-USD
// options. A EUR/GBP/CAD invoice shows the FX route instead — different bank,
// different SWIFT, and a mandatory remittance string without which the wire
// gets rejected or misapplied. Printing the USD block on a EUR invoice is a
// payment failure waiting to happen, so the two never appear together.
function kvTable(rows) {
  const body = rows.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="width:200px;color:#555;padding:1px 0;vertical-align:top">${esc(k)}</td><td style="padding:1px 0"><strong>${esc(v)}</strong></td></tr>`
  ).join("");
  return `<table style="font-size:8.5pt;border:0;margin:0 0 6px"><tbody>${body}</tbody></table>`;
}

function bankBlock(entity, reference, currency) {
  const b = entity && entity.bank;
  if (!b) {
    throw new Error(
      `${entity?.label || entity?.name || "This entity"} has no bank details configured. ` +
      `Add its \`bank\` block in src/lib/letterhead.js before issuing invoices.`
    );
  }
  const cur = String(currency || "USD").toUpperCase();
  const isUsd = cur === "USD";
  let out = `<h2 class="section">Bank details — payment in ${esc(cur)}</h2>`;

  if (isUsd) {
    const d = b.domestic || {};
    const w = b.wireUsd || {};
    if (d.routingAba || d.bankName) {
      out += `<p style="font-size:8.5pt;font-weight:600;color:${NAVY};margin:4px 0 2px">Domestic US transfer (ACH or domestic wire)</p>`;
      out += kvTable([
        ["Beneficiary", b.beneficiary],
        ["Beneficiary address", b.beneficiaryAddress],
        ["Bank", d.bankName],
        ["Bank address", d.bankAddress],
        ["ABA routing number", d.routingAba],
        ["Account number", b.accountNumber],
        ["Account type", b.accountKind],
      ]);
    }
    if (w.swift) {
      out += `<p style="font-size:8.5pt;font-weight:600;color:${NAVY};margin:6px 0 2px">International wire in USD</p>`;
      out += kvTable([
        ["SWIFT / BIC", w.swift],
        ["ABA routing number", w.routingAba],
        ["Bank", w.bankName],
        ["Bank address", w.bankAddress],
        ["Beneficiary", b.beneficiary],
        ["Account number", b.accountNumber],
        ["Beneficiary address", b.beneficiaryAddress],
      ]);
    }
  } else {
    const f = b.wireFx;
    if (!f || !f.swift) {
      throw new Error(
        `${entity.label || entity.name} has no foreign-currency wire details configured, ` +
        `so a ${cur} invoice cannot be issued. Add \`bank.wireFx\` in src/lib/letterhead.js, ` +
        `or invoice this order in USD.`
      );
    }
    out += `<p style="font-size:8.5pt;font-weight:600;color:${NAVY};margin:4px 0 2px">International wire in ${esc(cur)}</p>`;
    out += kvTable([
      ["SWIFT / BIC", f.swift],
      ["ABA routing number", f.routingAba],
      ["Bank", f.bankName],
      ["Bank address", f.bankAddress],
      ["Beneficiary", f.beneficiaryName],
      ["Account number", f.beneficiaryAccount],
      ["Beneficiary address", f.beneficiaryAddress],
    ]);
    if (f.remittanceReference) {
      out += `<p style="font-size:8.5pt;margin:2px 0 4px;padding:6px 8px;border:1px solid #d8b25a;background:#fdf8ec;color:#5a4306">
        <strong>Required in the payment reference / memo field:</strong><br>
        <span style="font-family:monospace;font-size:8.5pt">${esc(f.remittanceReference)}</span><br>
        Without this line the funds cannot be credited to our account.
      </p>`;
    }
    out += `<p style="font-size:7.5pt;color:#777;margin:2px 0">Foreign-currency wires may pass through intermediary banks that apply their own exchange rates and charges.</p>`;
  }

  if (reference) {
    out += `<p style="font-size:8.5pt;color:#555;margin:2px 0">Please also quote <strong>${esc(reference)}</strong> so we can match your payment.</p>`;
  }
  if (b.note) {
    out += `<p style="font-size:7.5pt;color:#777;margin:2px 0">${esc(b.note)}</p>`;
  }
  return out;
}

// ── Standard Terms & Conditions (printed on a second page of each document) ──
const CUSTOMER_TERMS = [
  { n: 1, title: "Product Specifications", text: "All products are supplied in accordance with the agreed specifications, Certificate of Analysis (COA), and any approved pre-shipment sample, where applicable." },
  { n: 2, title: "Delivery Schedule", text: "All delivery dates are estimates based on supplier commitments and logistics schedules. Ingredientz shall not be liable for delays caused by carriers, customs authorities, force majeure events, or circumstances beyond its reasonable control." },
  { n: 3, title: "Sample Approval", text: "For applicable orders, shipment will proceed after customer approval of the representative pre-shipment sample. Once approved, minor natural variations that remain within the agreed specification shall not constitute grounds for rejection." },
  { n: 4, title: "Expedited Orders", text: "Where the customer requests expedited shipment and elects to waive or shorten the standard sample-approval process, Ingredientz shall not be responsible for quality disputes arising from characteristics that would reasonably have been identified during standard approval, provided the goods conform to the agreed specifications. Return freight, replacement freight, and additional logistics costs resulting from such requests may be charged to the customer." },
  { n: 5, title: "Inspection Upon Receipt", text: "Customers shall inspect all goods immediately upon delivery. Any discrepancy in quantity, damage, or quality must be reported in writing within 7 calendar days of receipt, together with supporting documentation and photographs. Failure to notify within this period shall constitute acceptance of the goods." },
  { n: 6, title: "Returns", text: "Returns require prior written authorization. Products manufactured or sourced specifically for the customer may not be returned except where they materially fail to meet the agreed specifications." },
  { n: 7, title: "Storage", text: "After delivery, proper storage conditions are the customer's responsibility. Ingredientz shall not be responsible for deterioration caused by improper handling or storage." },
  { n: 8, title: "Limitation of Liability", text: "Ingredientz's maximum liability shall be limited to the invoice value of the affected goods. Ingredientz shall not be liable for indirect, consequential, incidental, or business-interruption losses." },
  { n: 9, title: "Force Majeure", text: "Ingredientz shall not be liable for delays or failure to perform resulting from events beyond its reasonable control, including natural disasters, pandemics, strikes, transportation disruptions, government actions, customs delays, or supplier force majeure." },
  { n: 10, title: "Governing Specifications", text: "In the event of any dispute, the mutually agreed product specification and COA shall govern product acceptance." }
];
const SUPPLIER_TERMS = [
  { n: 1, title: "Product Conformity", text: "Supplier warrants that all goods supplied shall conform to the agreed specifications, COA, approved sample (where applicable), and all applicable regulatory requirements." },
  { n: 2, title: "Documentation", text: "Each shipment shall include: COA, Batch Number, Manufacturing Date, Expiry Date, Packing List, and regulatory documents where applicable." },
  { n: 3, title: "Change Control", text: "Supplier shall not change raw materials, manufacturing processes, manufacturing site, packaging, or product specifications without prior written approval from Ingredientz." },
  { n: 4, title: "Notification of Delay", text: "Supplier shall immediately notify Ingredientz of any expected production or shipment delay." },
  { n: 5, title: "Packaging", text: "Supplier shall package goods appropriately for domestic and international transportation and shall be responsible for losses arising from inadequate packaging." },
  { n: 6, title: "Non-Conforming Material", text: "Supplier shall promptly replace or refund any material that fails to meet the agreed specifications and shall reimburse reasonable return freight and related costs where the non-conformance is attributable to the supplier." },
  { n: 7, title: "Traceability", text: "Supplier shall maintain complete batch traceability and retain production and quality records for a minimum of five years, or longer where required by applicable regulations." },
  { n: 8, title: "Confidentiality", text: "Supplier shall maintain the confidentiality of all commercial information, pricing, customer details, and product formulations shared by Ingredientz." },
  { n: 9, title: "Compliance", text: "Supplier warrants compliance with all applicable laws, regulations, and agreed certifications (such as FSSC 22000, ISO, GMP, HACCP, Halal, Kosher, Organic, USP, EP, FCC, or other agreed standards), where applicable." }
];
function termsBlock(heading, terms) {
  var items = terms.map(function (t) {
    return `<p style="margin:3px 0;font-size:8pt;line-height:1.35;color:#333"><strong style="color:${NAVY}">${t.n}. ${esc(t.title)}.</strong> ${esc(t.text)}</p>`;
  }).join("");
  return `<div style="page-break-before:always;padding-top:6px">
    <div class="doc-title" style="font-size:14pt;margin-bottom:8px">${esc(heading)}</div>
    ${items}
  </div>`;
}

// ── TEMPLATE: Customer Invoice / Proforma ────────────────────────────────────
export function buildInvoiceHtml({ order, items, customer, entity, invoice, proforma = false }) {
  const cur = invoice?.currency || order.currency || "USD";
  const ref = invoice?.invoice_number || order.order_number;
  const rows = (items || []).map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(it.product_name)}</strong>${it.product_spec ? `<br><span style="color:#666">${esc(it.product_spec)}</span>` : ""}</td>
      <td class="num">${esc(it.quantity)} ${esc(it.unit || "")}</td>
      <td class="num">${money(it.customer_unit_price, cur)}</td>
      <td class="num">${money(it.line_total ?? (Number(it.quantity) * Number(it.customer_unit_price)), cur)}</td>
    </tr>`).join("");
  const subtotal = (items || []).reduce((s, it) =>
    s + (Number(it.line_total) || Number(it.quantity) * Number(it.customer_unit_price) || 0), 0);
  const grand = order.total_amount != null ? Number(order.total_amount) : subtotal;

  return `
    <div class="doc-title">${proforma ? "PROFORMA INVOICE" : "INVOICE"}</div>
    <div class="doc-ref">${esc(ref)} · Date: ${fmtDay(invoice?.invoice_date || today())}${invoice?.due_date ? ` · Due: ${fmtDay(invoice.due_date)}` : ""}</div>
    ${partiesHtml("From", entity, "Bill To", customer || {})}
    <div style="font-size:8.5pt;color:#555;margin:4px 0 8px">
      Order Ref: <strong>${esc(order.order_number)}</strong>${order.customer_po_number ? ` · Customer PO: ${esc(order.customer_po_number)}` : ""}
    </div>
    ${order.ship_to_address ? `<div style="font-size:8.5pt;color:#555;margin:0 0 8px"><strong>Ship to:</strong> ${esc(order.ship_to_address)}</div>` : ""}
    <table>
      <thead><tr><th style="width:34px">#</th><th>Product</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#888">No line items</td></tr>`}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${money(subtotal, cur)}</td></tr>
      <tr class="grand"><td>Total (${esc(cur)})</td><td class="num">${money(grand, cur)}</td></tr>
    </table>
    ${order.payment_terms ? `<p><strong>Payment terms:</strong> ${esc(order.payment_terms)}</p>` : ""}
    ${bankBlock(entity, ref, cur)}
    ${termsBlock("Standard Terms & Conditions", CUSTOMER_TERMS)}
  `;
}

// ── TEMPLATE: Supplier Purchase Order ────────────────────────────────────────
export function buildSupplierPOHtml({ order, po, poItems, supplier, entity }) {
  const cur = po?.currency || "USD";
  const rows = (poItems || []).map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(it.product_name)}</strong>${it.product_spec ? `<br><span style="color:#666">${esc(it.product_spec)}</span>` : ""}</td>
      <td class="num">${esc(it.quantity)} ${esc(it.unit || "")}</td>
      <td class="num">${money(it.cost_per_unit, cur)}</td>
      <td class="num">${money((Number(it.quantity) || 0) * (Number(it.cost_per_unit) || 0), cur)}</td>
    </tr>`).join("");
  const total = po?.total_amount != null ? Number(po.total_amount)
    : (poItems || []).reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.cost_per_unit) || 0), 0);

  return `
    <div class="doc-title">PURCHASE ORDER</div>
    <div class="doc-ref">${esc(po?.supplier_po_number || "")} · Date: ${fmtDay(po?.po_date || po?.created_at || today())}${po?.expected_ship_date ? ` · Ship by: ${fmtDay(po.expected_ship_date)}` : ""}</div>
    ${partiesHtml("Buyer", entity, "Supplier", supplier || {})}
    <div style="font-size:8.5pt;color:#555;margin:4px 0 8px">
      Against Order: <strong>${esc(order.order_number)}</strong>
    </div>
    <table>
      <thead><tr><th style="width:34px">#</th><th>Product</th><th class="num">Qty</th><th class="num">Unit Cost</th><th class="num">Line Total</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#888">No line items</td></tr>`}</tbody>
    </table>
    <table class="totals">
      <tr class="grand"><td>Total (${esc(cur)})</td><td class="num">${money(total, cur)}</td></tr>
    </table>
    ${po?.payment_terms ? `<p><strong>Payment terms:</strong> ${esc(po.payment_terms)}</p>` : ""}
    ${po?.incoterms ? `<p><strong>Incoterms:</strong> ${esc(po.incoterms)}</p>` : ""}
    ${supplier && (supplier.bank_name || supplier.bank_account_number || supplier.bank_iban || supplier.bank_swift) ? `
    <h2 class="section">Remit to (supplier bank)</h2>
    <p style="font-size:8.5pt;color:#555;line-height:1.5">${[
      supplier.bank_name && ("Bank: " + esc(supplier.bank_name)),
      supplier.bank_account_name && ("A/C name: " + esc(supplier.bank_account_name)),
      supplier.bank_account_number && ("A/C: " + esc(supplier.bank_account_number)),
      supplier.bank_iban && ("IBAN: " + esc(supplier.bank_iban)),
      supplier.bank_swift && ("SWIFT: " + esc(supplier.bank_swift)),
      supplier.bank_ifsc && ("IFSC: " + esc(supplier.bank_ifsc)),
      supplier.bank_address && ("Bank address: " + esc(supplier.bank_address))
    ].filter(Boolean).join(" · ")}</p>` : ""}
    ${termsBlock("Purchase Order — Terms & Conditions", SUPPLIER_TERMS)}
  `;
}

// ── Wrap the branded doc with a floating "Save as PDF" toolbar (hidden on print)
function withToolbar(fullHtml) {
  const toolbar = `
<div class="doc-toolbar" style="position:fixed;top:14px;right:14px;z-index:99999;display:flex;gap:8px;font-family:Arial,sans-serif">
  <button onclick="window.print()" style="background:#1877F2;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)">🖨 Save as PDF</button>
</div>
<style>@media print{.doc-toolbar{display:none!important}}</style>`;
  return fullHtml.replace("</body>", toolbar + "</body>");
}

// ── Build a stored HTML File from a body + entity ────────────────────────────
async function storeDoc(body, entity, prefix, fileName) {
  let fullHtml;
  try {
    fullHtml = withToolbar(renderBrandedHtml(body, entity, { addStamp: true }));
  } catch (e) {
    // Entity has no letterhead configured — better to fail here than to store
    // and send an unbranded document.
    console.error("storeDoc render:", e);
    return { error: e };
  }
  const base = slugify(fileName.replace(/\.html$/i, ""));
  const path = `${prefix}/${Date.now()}-${base}.html`;
  const blob = new Blob([fullHtml], { type: "text/html; charset=utf-8" });
  // Explicit contentType so Supabase serves it as a rendered page (not raw text).
  const { error } = await supabase.storage
    .from("order-documents")
    .upload(path, blob, { cacheControl: "3600", upsert: true, contentType: "text/html; charset=utf-8" });
  if (error) { console.error("storeDoc upload:", error); return { error }; }
  return { path };
}

// ── PUBLIC: generate + store a Customer Invoice (returns { path, error }) ─────
export async function generateCustomerInvoice({ order, items, customer, invoice, proforma = false }) {
  const entity = entityForOrder(order);
  let body;
  try {
    body = buildInvoiceHtml({ order, items, customer, entity, invoice, proforma });
  } catch (e) {
    // Missing bank block, most likely. Surface it instead of throwing into the
    // caller's save path and losing the invoice row.
    console.error("generateCustomerInvoice:", e);
    return { error: e };
  }
  const fileName = `${slugify(invoice?.invoice_number || order.order_number)}-invoice.html`;
  return storeDoc(body, entity, `orders/${order.order_number}/customer_invoice`, fileName);
  // Caller (App.addInvoice) persists file_url on invoices + updates state.
}

// ── PUBLIC: generate + store a Supplier PO (returns { path, error }) ──────────
export async function generateSupplierPO({ order, po, poItems, supplier, entity: entityOverride }) {
  // POs are issued from the buying entity, recorded on the order.
  const entity = entityOverride || entityForOrder(order);
  let body;
  try {
    body = buildSupplierPOHtml({ order, po, poItems, supplier, entity });
  } catch (e) {
    console.error("generateSupplierPO:", e);
    return { error: e };
  }
  const fileName = `${slugify(po?.supplier_po_number || order.order_number)}-po.html`;
  return storeDoc(body, entity, `orders/${order.order_number}/supplier_po/${slugify(po?.supplier_po_number)}`, fileName);
  // Caller (App.addSupplierPO) persists pdf_url on supplier_pos + updates state.
}

// ── PUBLIC: live view — renders the branded doc in a new tab (no storage, no
// auto-print). The page carries a "Save as PDF" button.
function openRenderedDoc(body, entity) {
  let html;
  try {
    html = withToolbar(renderBrandedHtml(body, entity, { addStamp: true }));
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const win = window.open("", "_blank");
  if (!win) return { ok: false, error: "Popup blocked. Allow popups for this site." };
  win.document.open(); win.document.write(html); win.document.close();
  return { ok: true };
}
export function previewInvoice({ order, items, customer, invoice, proforma = false }) {
  const entity = entityForOrder(order);
  let body;
  try {
    body = buildInvoiceHtml({ order, items, customer, entity, invoice, proforma });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return openRenderedDoc(body, entity);
}
export function previewSupplierPO({ order, po, poItems, supplier }) {
  const entity = entityForOrder(order);
  let body;
  try {
    body = buildSupplierPOHtml({ order, po, poItems, supplier, entity });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return openRenderedDoc(body, entity);
}
