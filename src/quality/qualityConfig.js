// =====================================================================
// Quality Portal · configuration
//
// Everything that decides how the portal looks and which documents are
// required lives in this one file. If you want to add a document type or
// change a colour later, this is the only file you touch.
// =====================================================================

// ── Colours ──────────────────────────────────────────────────────────
export const Q = {
  ink:     "#08262B",
  ink2:    "#0C3941",
  ink3:    "#134E58",
  paper:   "#F2F5F6",
  card:    "#FFFFFF",
  line:    "#E3E9EA",
  line2:   "#EDF1F2",
  text:    "#0F2226",
  muted:   "#6B8085",
  faint:   "#9AAEB2",
  pass:    "#0E8A5F",
  passBg:  "#E4F5EE",
  wait:    "#B0730B",
  waitBg:  "#FDF3E0",
  fail:    "#C1382E",
  failBg:  "#FCEBE9",
  info:    "#1F6FB2",
  infoBg:  "#E8F1FA",
  na:      "#96A7AB",
  naBg:    "#F1F4F5",
  mono:    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'
};

// ── The seven columns of the document matrix ─────────────────────────
export const DOC_TYPES = [
  { key: "coa",          label: "Certificate of Analysis",     short: "CoA" },
  { key: "micro",        label: "Microbiology report",         short: "Microbiology" },
  { key: "heavy_metals", label: "Heavy metals report",         short: "Heavy metals" },
  { key: "id_test",      label: "Identification test report",  short: "Identification" },
  { key: "pesticide",    label: "Pesticide residue report",    short: "Pesticide residue" },
  { key: "organic_cert", label: "Organic certificate",         short: "Organic certificate" },
  { key: "additional",   label: "Additional documents",        short: "Additional" }
];

export const DOC_LABEL = Object.fromEntries(DOC_TYPES.map(d => [d.key, d.label]));

// Required on every product, no exceptions.
const BASE_DOCS = ["coa", "micro", "heavy_metals", "id_test"];

// ── The rule that turns a product profile into a document list ───────
// Give it a profile row (or null) and it returns which of the seven
// documents are required, plus a note explaining the additional column.
export function requiredDocsFor(profile) {
  if (!profile) return null;              // no profile = we cannot decide yet

  const required = new Set(BASE_DOCS);
  const extras = [];

  if (profile.is_organic) {
    required.add("pesticide");
    required.add("organic_cert");
  }
  if (profile.is_animal_derived) { required.add("additional"); extras.push("BSE / TSE statement"); }
  if (profile.is_botanical)      { required.add("additional"); extras.push("Solvent residue, marker assay"); }
  if (profile.is_probiotic)      { required.add("additional"); extras.push("Viable count, strain identity"); }
  if (profile.has_allergen)      { required.add("additional"); extras.push("Allergen statement"); }

  return { required: [...required], note: extras.join(" · ") || null };
}

// ── Profile tags shown next to a product name ────────────────────────
export function profileTags(profile) {
  if (!profile) return [];
  const t = [];
  if (profile.is_organic)        t.push({ label: "ORGANIC",   bg: "#E4F5EE", fg: "#0E8A5F" });
  if (profile.is_animal_derived) t.push({ label: "ANIMAL",    bg: "#FFF3E0", fg: "#B0730B" });
  if (profile.is_botanical)      t.push({ label: "BOTANICAL", bg: "#EDE7F6", fg: "#5E35B1" });
  if (profile.is_probiotic)      t.push({ label: "PROBIOTIC", bg: "#E8F1FA", fg: "#1F6FB2" });
  if (profile.has_allergen)      t.push({ label: "ALLERGEN",  bg: "#FCEBE9", fg: "#C1382E" });
  if (t.length === 0)            t.push({ label: "STANDARD",  bg: "#F1F4F5", fg: "#6B8085" });
  return t;
}

// ── Document status appearance ───────────────────────────────────────
export const DOC_STATUS = {
  required:  { mark: "·", word: "not sent",  bg: "#FFFFFF",  fg: "#C3CFD1", dashed: true },
  requested: { mark: "·", word: "requested", bg: "#FFFFFF",  fg: "#C3CFD1", dashed: true },
  received:  { mark: "●", word: "review",    bg: "#FDF3E0",  fg: "#B0730B" },
  verified:  { mark: "✓", word: "verified",  bg: "#E4F5EE",  fg: "#0E8A5F" },
  rejected:  { mark: "✕", word: "rejected",  bg: "#FCEBE9",  fg: "#C1382E" }
};

// ── The product name key, used to look up a profile ──────────────────
// "Organic Ashwagandha " and "organic ashwagandha" are the same product.
export function productKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// ── Which orders the quality portal ignores ──────────────────────────
export const IGNORED_ORDER_STATUSES = ["Cancelled"];

// ── How long before a reminder is due ────────────────────────────────
export const REMINDER_HOURS = 48;
export const MAX_REMINDERS = 3;

// ── Small date helper, so this folder does not depend on your utils ──
export function qDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function qDaysAgo(d) {
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  return Math.floor(ms / 86400000);
}
