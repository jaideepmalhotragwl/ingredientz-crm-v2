// src/lib/nameFormat.js
// Single source of truth for displaying company names consistently across the app.
// Title Case, but preserve short all-caps acronyms (PT, AOS, USA, LLC, JHD).
//   "NUTRALAB CANADA CORP."  -> "Nutralab Canada Corp."
//   "AOS products"           -> "AOS Products"
//   "PT Moringa Indonesia"   -> "PT Moringa Indonesia"
export function fmtName(s) {
  return String(s || "").trim().replace(/\S+/g, w => {
    const bare = w.replace(/[^A-Za-z]/g, "");
    if (bare.length <= 3 && w === w.toUpperCase()) return w; // keep acronyms
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}
// Sort comparator by company name (case-insensitive).
export const byName = (a, b) =>
  (a.company || "").localeCompare(b.company || "", undefined, { sensitivity: "base" });
