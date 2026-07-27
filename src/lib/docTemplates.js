/* =========================================================================
   docTemplates.js — Document Generator templates (Group A + Group B)
   ---------------------------------------------------------------------------
   ⚠ COMPLIANCE WORDING: these are EDITABLE DEFAULTS. Your QA / regulatory team
     must review and approve each declaration before it is issued to customers.
   Body HTML uses the SAME letterhead CSS classes as the reformatter
   (.doc-title, .doc-ref, h2.section, tables, .conclusion, .stamp-placeholder),
   so generated docs render identically via renderLetterhead().
   Place at: src/lib/docTemplates.js  (or wherever your DocumentsTab imports from)
   ========================================================================= */

function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function today() { return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }

// ── shared building blocks ──────────────────────────────────────────────────
function head(title, f) {
  return `<div class="doc-title">${esc(title)}</div>
<div class="doc-ref">Ref: ${esc(f.ref || "—")} &nbsp;·&nbsp; Date: ${esc(f.date || today())}${f.customer ? ` &nbsp;·&nbsp; To: ${esc(f.customer)}` : ""}</div>`;
}
function idLine(f) {
  const bits = [];
  bits.push(`<strong>Product:</strong> ${esc(f.product || "—")}${f.botanical ? ` <em>(${esc(f.botanical)})</em>` : ""}`);
  if (f.batch)  bits.push(`<strong>Batch / Lot:</strong> ${esc(f.batch)}`);
  if (f.origin) bits.push(`<strong>Origin:</strong> ${esc(f.origin)}`);
  return `<p>${bits.join(" &nbsp;·&nbsp; ")}</p>`;
}
function sign(f) {
  return `<div class="stamp-placeholder"></div>
<p style="margin-top:6px">Yours faithfully,<br><br>
<strong>${esc(f.signatory || "")}</strong><br>${esc(f.sigTitle || "Quality Assurance")}<br>${esc(f.entityName || "Ingredientz Inc")}</p>`;
}
// generic table from rows + columns
function table(cols, rows) {
  const head = `<tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr>`;
  const body = (rows || []).map(r => `<tr>${cols.map(c => `<td>${esc(r[c.key])}</td>`).join("")}</tr>`).join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// ── FIELD DEFINITIONS (for the generator form) ───────────────────────────────
export const FIELDS = {
  product:   { label: "Product name", type: "text", required: true },
  botanical: { label: "Botanical / INCI name", type: "text" },
  batch:     { label: "Batch / Lot no.", type: "text" },
  mfg:       { label: "Mfg date", type: "date" },
  exp:       { label: "Expiry / Best-before", type: "date" },
  origin:    { label: "Country of origin", type: "text" },
  shelf:     { label: "Shelf life", type: "text", placeholder: "e.g. 24 months" },
  storage:   { label: "Storage conditions", type: "text", placeholder: "cool, dry, below 25°C" },
  qty:       { label: "Quantity", type: "text" },
  customer:  { label: "Customer / Addressee", type: "text" },
  allergens: { label: "Allergens present (if any)", type: "text", placeholder: "None" },
  flow:      { label: "Process steps", type: "textarea" },
  signatory: { label: "Signatory name", type: "text" },
  sigTitle:  { label: "Signatory title", type: "text", placeholder: "QA Manager" },
};

// ── GROUP A — boilerplate declaration letters (13) ───────────────────────────
const A = (id, name, fields, para, opts = {}) => ({
  id, name, group: "A",
  fields: ["product", "botanical", "batch", ...fields, "customer", "signatory", "sigTitle"],
  body: (f) => `${head(name, f)}${idLine(f)}${para(f)}${opts.conclusion ? `<div class="conclusion">${opts.conclusion(f)}</div>` : ""}${sign(f)}`,
});

export const GROUP_A = [
  A("gras", "GRAS Statement", [],
    f => `<p>This is to certify that <strong>${esc(f.product || "the product")}</strong> supplied by ${esc(f.entityName || "Ingredientz Inc")} is composed of ingredients that are Generally Recognized As Safe (GRAS) for their intended use in foods and dietary supplements, consistent with the US Federal Food, Drug &amp; Cosmetic Act and 21 CFR.</p>
<p>The material is produced under GMP conditions and is suitable for use in food and nutraceutical applications at customary levels of use.</p>`,
    { conclusion: () => "The above product is considered GRAS for its intended use." }),

  A("bse_tse", "BSE / TSE Statement", [],
    f => `<p>We hereby declare that <strong>${esc(f.product || "the product")}</strong> does not contain and is not manufactured using specified risk materials of bovine, ovine or caprine origin, and complies with the EMA Note for Guidance EMA/410/01 (rev. 3) on minimising the risk of transmitting animal spongiform encephalopathy agents.</p>
<p>Where any animal-derived component is used, it originates from healthy animals from countries of negligible BSE risk and is fit for human consumption.</p>`,
    { conclusion: () => "The product is free from BSE/TSE risk for its intended use." }),

  A("allergen", "Allergen Declaration", ["allergens"],
    f => `<p>Declaration regarding the major food allergens listed under EU Regulation 1169/2011 (Annex II) and the US FALCPA.</p>
<p>Unless stated below, <strong>${esc(f.product || "the product")}</strong> does not contain, and is not manufactured on a line knowingly handling, any of the declarable allergens (cereals containing gluten, crustaceans, eggs, fish, peanuts, soybeans, milk, tree nuts, celery, mustard, sesame, sulphites &gt; 10 ppm, lupin, molluscs).</p>
<p><strong>Allergens present / cross-contamination risk:</strong> ${esc(f.allergens || "None")}</p>`),

  A("gmo", "GMO / Non-GMO Statement", [],
    f => `<p><strong>${esc(f.product || "The product")}</strong> is not produced from and does not contain genetically modified organisms (GMO), and is not subject to labelling under EU Regulations 1829/2003 and 1830/2003.</p>`),

  A("vegan", "Vegan / Vegetarian Statement", [],
    f => `<p><strong>${esc(f.product || "The product")}</strong> contains no ingredients of animal origin and no animal-derived processing aids, and is therefore suitable for vegetarians and vegans.</p>`),

  A("gluten", "Gluten-Free Statement", [],
    f => `<p><strong>${esc(f.product || "The product")}</strong> contains gluten at a level below 20 ppm and may be considered gluten-free in accordance with Codex Standard 118-1979, EU Regulation 828/2014 and US FDA 21 CFR 101.91.</p>`),

  A("irradiation", "Irradiation Statement", [],
    f => `<p><strong>${esc(f.product || "The product")}</strong> has not been subjected to ionizing radiation, and none of its ingredients have been irradiated, consistent with EU Directive 1999/2/EC.</p>`),

  A("heavy_metals", "Heavy Metals Statement", [],
    f => `<p><strong>${esc(f.product || "The product")}</strong> conforms to the limits for elemental impurities (lead, arsenic, cadmium, mercury) established under USP &lt;232&gt;/&lt;233&gt; and applicable EU limits. Batch-specific results are provided in the Certificate of Analysis.</p>`),

  A("pesticide", "Pesticide Residue Statement", [],
    f => `<p><strong>${esc(f.product || "The product")}</strong> complies with the maximum pesticide residue limits set out in EU Regulation 396/2005 and applicable pharmacopoeial requirements.</p>`),

  A("origin", "Country of Origin Declaration", ["origin"],
    f => `<p>We hereby declare that the country of origin of <strong>${esc(f.product || "the product")}</strong> is <strong>${esc(f.origin || "—")}</strong>.</p>`),

  A("shelf_life", "Shelf-Life / Stability Statement", ["shelf", "storage"],
    f => `<p><strong>${esc(f.product || "The product")}</strong> has a shelf life of <strong>${esc(f.shelf || "—")}</strong> from the date of manufacture when stored ${esc(f.storage || "in a cool, dry place away from direct sunlight")} in its original sealed packaging.</p>`),

  A("mfg_flow", "Manufacturing Flow / Process", ["flow"],
    f => `<p>The following describes the manufacturing process for <strong>${esc(f.product || "the product")}</strong>:</p>
<p>${esc(f.flow || "Raw-material intake → identity & quality testing → processing → in-process QC → drying / blending → finished-product testing → packaging → QA release.")}</p>`),

  A("melamine", "Melamine-Free Statement", [],
    f => `<p><strong>${esc(f.product || "The product")}</strong> is free from melamine and its analogues (cyanuric acid, ammelide, ammeline). No melamine is used at any stage of manufacture.</p>`),
];

// ── GROUP B — data documents (4): header fields + editable tables/sections ────
export const GROUP_B = [
  {
    id: "coa", name: "Certificate of Analysis", group: "B",
    fields: ["product", "botanical", "batch", "mfg", "exp", "qty", "customer", "signatory", "sigTitle"],
    rowKey: "rows",
    columns: [
      { key: "parameter", label: "Parameter" },
      { key: "spec", label: "Specification" },
      { key: "method", label: "Method" },
      { key: "result", label: "Result" },
    ],
    defaultRows: [
      { parameter: "Appearance", spec: "", method: "Visual", result: "" },
      { parameter: "Identification", spec: "Conforms", method: "", result: "" },
      { parameter: "Assay", spec: "", method: "HPLC", result: "" },
      { parameter: "Loss on drying", spec: "≤ 5.0%", method: "Gravimetric", result: "" },
      { parameter: "Total ash", spec: "", method: "", result: "" },
      { parameter: "Heavy metals", spec: "≤ 10 ppm", method: "ICP-MS", result: "" },
      { parameter: "Total plate count", spec: "≤ 10^4 CFU/g", method: "USP <2021>", result: "" },
      { parameter: "Yeast & mould", spec: "≤ 10^3 CFU/g", method: "USP <2021>", result: "" },
      { parameter: "E. coli", spec: "Absent / g", method: "USP <2022>", result: "" },
      { parameter: "Salmonella", spec: "Absent / 25 g", method: "USP <2022>", result: "" },
    ],
    body: (f) => `${head("Certificate of Analysis", f)}
<p><strong>Product:</strong> ${esc(f.product || "—")}${f.botanical ? ` <em>(${esc(f.botanical)})</em>` : ""} &nbsp;·&nbsp; <strong>Batch:</strong> ${esc(f.batch || "—")} &nbsp;·&nbsp; <strong>Qty:</strong> ${esc(f.qty || "—")}</p>
<p><strong>Mfg date:</strong> ${esc(f.mfg || "—")} &nbsp;·&nbsp; <strong>Expiry:</strong> ${esc(f.exp || "—")}</p>
<h2 class="section">Analytical Results</h2>
${table([{ key: "parameter", label: "Parameter" }, { key: "spec", label: "Specification" }, { key: "method", label: "Method" }, { key: "result", label: "Result" }], f.rows)}
<div class="conclusion">The above batch complies with the stated specification and is released for supply.</div>
${sign(f)}`,
  },
  {
    id: "tds", name: "Technical Data Sheet / Specification", group: "B",
    fields: ["product", "botanical", "origin", "shelf", "storage", "signatory", "sigTitle"],
    rowKey: "rows",
    columns: [{ key: "attribute", label: "Attribute" }, { key: "spec", label: "Specification" }],
    defaultRows: [
      { attribute: "Appearance", spec: "" },
      { attribute: "Odour / Taste", spec: "" },
      { attribute: "Solubility", spec: "" },
      { attribute: "Particle size", spec: "" },
      { attribute: "Assay / Active", spec: "" },
      { attribute: "Loss on drying", spec: "≤ 5.0%" },
      { attribute: "Bulk density", spec: "" },
      { attribute: "pH (1% solution)", spec: "" },
    ],
    body: (f) => `${head("Technical Data Sheet", f)}${idLine(f)}
<h2 class="section">Specification</h2>
${table([{ key: "attribute", label: "Attribute" }, { key: "spec", label: "Specification" }], f.rows)}
<h2 class="section">Storage &amp; Shelf Life</h2>
<p>${esc(f.shelf || "—")} when stored ${esc(f.storage || "in a cool, dry place")}.</p>
${sign(f)}`,
  },
  {
    id: "nutrition", name: "Nutritional Information", group: "B",
    fields: ["product", "batch", "signatory", "sigTitle"],
    rowKey: "rows",
    columns: [{ key: "nutrient", label: "Nutrient" }, { key: "per100", label: "Per 100 g" }, { key: "perServe", label: "Per serving" }],
    defaultRows: [
      { nutrient: "Energy (kcal)", per100: "", perServe: "" },
      { nutrient: "Protein (g)", per100: "", perServe: "" },
      { nutrient: "Carbohydrate (g)", per100: "", perServe: "" },
      { nutrient: "  of which sugars (g)", per100: "", perServe: "" },
      { nutrient: "Fat (g)", per100: "", perServe: "" },
      { nutrient: "  of which saturates (g)", per100: "", perServe: "" },
      { nutrient: "Fibre (g)", per100: "", perServe: "" },
      { nutrient: "Sodium (mg)", per100: "", perServe: "" },
    ],
    body: (f) => `${head("Nutritional Information", f)}${idLine(f)}
<h2 class="section">Typical Values</h2>
${table([{ key: "nutrient", label: "Nutrient" }, { key: "per100", label: "Per 100 g" }, { key: "perServe", label: "Per serving" }], f.rows)}
${sign(f)}`,
  },
  {
    id: "sds", name: "Safety Data Sheet (SDS)", group: "B",
    fields: ["product", "botanical", "signatory", "sigTitle"],
    sectionKey: "sections",
    defaultSections: [
      { heading: "1. Identification", text: "" },
      { heading: "2. Hazard identification", text: "Not classified as hazardous under GHS." },
      { heading: "3. Composition / information on ingredients", text: "" },
      { heading: "4. First-aid measures", text: "" },
      { heading: "5. Fire-fighting measures", text: "" },
      { heading: "6. Accidental release measures", text: "" },
      { heading: "7. Handling and storage", text: "" },
      { heading: "8. Exposure controls / personal protection", text: "" },
      { heading: "9. Physical and chemical properties", text: "" },
      { heading: "10. Stability and reactivity", text: "" },
      { heading: "11. Toxicological information", text: "" },
      { heading: "12. Ecological information", text: "" },
      { heading: "13. Disposal considerations", text: "" },
      { heading: "14. Transport information", text: "Not regulated as dangerous goods." },
      { heading: "15. Regulatory information", text: "" },
      { heading: "16. Other information", text: "" },
    ],
    body: (f) => `${head("Safety Data Sheet", f)}${idLine(f)}
${(f.sections || []).map(s => `<h2 class="section">${esc(s.heading)}</h2><p>${esc(s.text || "—")}</p>`).join("")}
${sign(f)}`,
  },
];

export const ALL_DOCS = [...GROUP_A, ...GROUP_B];
export function findDoc(id) { return ALL_DOCS.find(d => d.id === id) || null; }
