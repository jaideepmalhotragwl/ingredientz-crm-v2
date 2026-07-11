// src/lib/docGen.js
// ─────────────────────────────────────────────────────────────────────────────
// Order-document generator: builds a branded Customer Invoice / Proforma and a
// Supplier PO from structured order data, renders on the shared letterhead, turns
// it into a PDF, uploads to the `order-documents` bucket, and writes the file URL
// back to the record so DocumentTrail's auto-slot lights up (green + Download).
//
// Requires one dependency:  npm i html2pdf.js
// Falls back to print-to-PDF (openBrandedDoc) if html2pdf isn't available.
//
// FIELD ASSUMPTIONS (adjust to your real `customers` / `suppliers` columns):
//   customer.company, customer.country, customer.address, customer.city,
//   customer.state, customer.postcode, customer.tax_id, customer.contact_person
//   supplier.company, supplier.country, supplier.address, supplier.tax_id
// Everything else uses columns already confirmed in the codebase.
// ─────────────────────────────────────────────────────────────────────────────

import { renderBrandedHtml, openBrandedDoc, entityForCountry } from "./letterhead.js";
import { fmtMoney, uploadOrderDocument, slugify } from "./orderUtils.js";
import { supabase } from "../config.js";

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
      <strong>${esc(to.company || to.name)}</strong><br>${addressBlock(to)}
      ${to.tax_id ? `<br>Tax ID: ${esc(to.tax_id)}` : ""}
      ${to.contact_person ? `<br>Attn: ${esc(to.contact_person)}` : ""}
    </div>
  </div>`;
}

// ── TEMPLATE: Customer Invoice / Proforma ────────────────────────────────────
export function buildInvoiceHtml({ order, items, customer, entity, invoice, proforma = false }) {
  const cur = invoice?.currency || order.currency || "USD";
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
    <div class="doc-ref">${esc(invoice?.invoice_number || order.order_number)} · Date: ${fmtDay(invoice?.invoice_date || today())}${invoice?.due_date ? ` · Due: ${fmtDay(invoice.due_date)}` : ""}</div>
    ${partiesHtml("From", entity, "Bill To", customer || {})}
    <div style="font-size:8.5pt;color:#555;margin:4px 0 8px">
      Order Ref: <strong>${esc(order.order_number)}</strong>${order.customer_po_number ? ` · Customer PO: ${esc(order.customer_po_number)}` : ""}
    </div>
    <table>
      <thead><tr><th style="width:34px">#</th><th>Product</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#888">No line items</td></tr>`}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${money(subtotal, cur)}</td></tr>
      <tr class="grand"><td>Total (${esc(cur)})</td><td class="num">${money(grand, cur)}</td></tr>
    </table>
    ${order.payment_terms ? `<p><strong>Payment terms:</strong> ${esc(order.payment_terms)}</p>` : ""}
    <h2 class="section">Bank details</h2>
    <p style="font-size:8.5pt;color:#555">[Bank name · A/C · IBAN/SWIFT — pull from entity settings]</p>
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
  `;
}

// ── ENGINE: render branded HTML -> PDF blob (via hidden iframe so fonts/images load)
async function htmlToPdfBlob(fullHtml, filename) {
  let html2pdf;
  try { html2pdf = (await import("html2pdf.js")).default; }
  catch { throw new Error("html2pdf.js not installed. Run: npm i html2pdf.js"); }

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:820px;height:1160px;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open(); doc.write(fullHtml); doc.close();

  await new Promise(r => setTimeout(r, 1800)); // let fonts + letterhead images load
  const el = doc.querySelector(".a4");
  const blob = await html2pdf().set({
    margin: 0,
    filename,
    image: { type: "jpeg", quality: 0.96 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 820 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  }).from(el).outputPdf("blob");

  document.body.removeChild(iframe);
  return blob;
}

// ── PUBLIC: generate + store a Customer Invoice, then link it to the record ───
export async function generateCustomerInvoice({ order, items, customer, invoice, proforma = false }) {
  const entity = entityForCountry(customer?.country);
  const body = buildInvoiceHtml({ order, items, customer, entity, invoice, proforma });
  const fullHtml = renderBrandedHtml(body, entity, { addStamp: true });
  const fileName = `${slugify(invoice?.invoice_number || order.order_number)}-invoice.pdf`;

  const blob = await htmlToPdfBlob(fullHtml, fileName);
  const file = new File([blob], fileName, { type: "application/pdf" });
  const { path, error } = await uploadOrderDocument(file, `orders/${order.order_number}/customer_invoice`);
  if (error) return { error };

  // DocumentTrail's customer_invoice auto-slot reads invoices.file_url
  if (invoice?.id) {
    await supabase.from("invoices").update({ file_url: path }).eq("id", invoice.id);
  }
  return { path };
}

// ── PUBLIC: generate + store a Supplier PO, then link it to the record ────────
export async function generateSupplierPO({ order, po, poItems, supplier, entity: entityOverride }) {
  // POs are issued from the buying entity. Default Ingredientz Inc (US); pass `entity` to override.
  const entity = entityOverride || entityForCountry(order?.entity_country || "United States");
  const body = buildSupplierPOHtml({ order, po, poItems, supplier, entity });
  const fullHtml = renderBrandedHtml(body, entity, { addStamp: true });
  const fileName = `${slugify(po?.supplier_po_number || order.order_number)}-po.pdf`;

  const blob = await htmlToPdfBlob(fullHtml, fileName);
  const file = new File([blob], fileName, { type: "application/pdf" });
  const { path, error } = await uploadOrderDocument(file, `orders/${order.order_number}/supplier_po/${slugify(po?.supplier_po_number)}`);
  if (error) return { error };

  // DocumentTrail's supplier_po auto-slot reads supplier_pos.pdf_url
  if (po?.id) {
    await supabase.from("supplier_pos").update({ pdf_url: path }).eq("id", po.id);
  }
  return { path };
}

// ── PUBLIC: instant preview (no dependency) — opens print-to-PDF window ───────
export function previewInvoice({ order, items, customer, invoice, proforma = false }) {
  const entity = entityForCountry(customer?.country);
  return openBrandedDoc(buildInvoiceHtml({ order, items, customer, entity, invoice, proforma }), entity, { addStamp: true });
}
export function previewSupplierPO({ order, po, poItems, supplier }) {
  const entity = entityForCountry(order?.entity_country || "United States");
  return openBrandedDoc(buildSupplierPOHtml({ order, po, poItems, supplier, entity }), entity, { addStamp: true });
}
