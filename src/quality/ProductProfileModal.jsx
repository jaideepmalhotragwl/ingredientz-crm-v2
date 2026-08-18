// =====================================================================
// Quality Portal · set a product profile
//
// Answered once per product, then reused on every future order.
// This is what decides which test reports are required.
// =====================================================================

import { useState } from "react";
import { Q } from "./qualityConfig.js";
import { saveProductProfile } from "./qualityData.js";

const FLAGS = [
  { key: "is_organic",        title: "Organic",
    detail: "Adds a pesticide residue report, and an organic certificate that names this product in its scope." },
  { key: "is_animal_derived", title: "Animal-derived",
    detail: "Adds a BSE / TSE statement." },
  { key: "is_botanical",      title: "Botanical extract",
    detail: "Adds solvent residue and marker assay to the additional column." },
  { key: "is_probiotic",      title: "Probiotic or live culture",
    detail: "Adds viable count and strain identity." },
  { key: "has_allergen",      title: "Allergens handled on the production line",
    detail: "Adds an allergen statement." }
];

export function ProductProfileModal({ productName, existing, actor, onClose, onSaved }) {
  const [flags, setFlags] = useState({
    is_organic:        existing?.is_organic        || false,
    is_animal_derived: existing?.is_animal_derived || false,
    is_botanical:      existing?.is_botanical      || false,
    is_probiotic:      existing?.is_probiotic      || false,
    has_allergen:      existing?.has_allergen      || false
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveProductProfile(productName, flags, actor);
      await onSaved();
    } catch (e) {
      setError(e.message || String(e));
      setBusy(false);
    }
  }

  return (
    <Scrim onClose={onClose}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${Q.line}`, display: "flex", alignItems: "center" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          {existing ? "Edit product profile" : "Set product profile"}
        </h3>
        <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: Q.faint, fontSize: 18, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ padding: "18px 20px" }}>
        <p style={{ fontSize: 12.5, color: Q.muted, marginBottom: 14, lineHeight: 1.6 }}>
          <b style={{ color: Q.text }}>{productName}</b><br />
          Tick what applies. This decides which reports are required — and it is saved against the
          product name, so nobody will be asked again on any future order containing it.
          Tick nothing if it is a standard ingredient.
        </p>

        {FLAGS.map(f => (
          <label key={f.key}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 13px",
              border: `1px solid ${flags[f.key] ? Q.ink3 : Q.line}`,
              background: flags[f.key] ? "#FAFCFC" : "#fff",
              borderRadius: 10, marginBottom: 8, fontSize: 13, cursor: "pointer"
            }}>
            <input
              type="checkbox"
              checked={flags[f.key]}
              onChange={e => setFlags({ ...flags, [f.key]: e.target.checked })}
              style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600 }}>{f.title}</div>
              <div style={{ fontSize: 11.5, color: Q.muted, marginTop: 2 }}>{f.detail}</div>
            </div>
          </label>
        ))}

        {existing && (
          <p style={{ fontSize: 11.5, color: Q.muted, marginTop: 12 }}>
            Last set by {existing.set_by || "unknown"} on {new Date(existing.set_at).toLocaleDateString("en-GB")}.
            Changing it here updates the required documents on every open order containing this product.
          </p>
        )}

        {error && (
          <div style={{ background: Q.failBg, color: Q.fail, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ padding: "14px 20px", borderTop: `1px solid ${Q.line}`, display: "flex", gap: 8, justifyContent: "flex-end", background: "#FAFCFC" }}>
        <button onClick={onClose} disabled={busy}
          style={{ background: "#fff", border: `1px solid ${Q.line}`, borderRadius: 7, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
        <button onClick={save} disabled={busy}
          style={{ background: busy ? "#DCE3E4" : Q.ink3, color: busy ? "#9AAEB2" : "#fff", border: "none", borderRadius: 7, padding: "6px 15px", fontSize: 12.5, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </Scrim>
  );
}

export function Scrim({ children, onClose, wide }) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(8,38,43,.42)",
        display: "grid", placeItems: "center", zIndex: 200, padding: 24
      }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%",
        maxWidth: wide ? 680 : 560, maxHeight: "86vh", overflowY: "auto",
        boxShadow: "0 24px 60px rgba(8,38,43,.28)"
      }}>
        {children}
      </div>
    </div>
  );
}
