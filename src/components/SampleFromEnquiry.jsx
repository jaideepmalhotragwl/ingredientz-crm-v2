import { useState } from "react";
import { C } from "../constants.js";
import { fmtName } from "./SampleForm.jsx";

// Sample-sized units — deliberately includes g/ml, which the enquiry-level
// UNITS list doesn't, because samples ship far smaller than orders.
const SAMPLE_UNITS = ["g", "kg", "ml", "Litres", "Pieces", "Boxes", "Bags", "Other"];

const byName = (a, b) => (a.company || "").localeCompare(b.company || "", undefined, { sensitivity: "base" });

// ── SAMPLE DETAILS (from an enquiry) ──────────────────────────────────────────
// Opens when an enquiry is moved to "Sample Under Process". Pre-fills the
// customer and every product already on the enquiry. Each ticked product becomes
// its own sample row, all sharing enquiry_id + enquiry_no (ENQ-123).
// NOTHING is emailed here — the supplier request is sent manually from the
// sample drawer once the team is ready.
export function SampleFromEnquiry({ enq, suppliers = [], onClose, onSave }) {
  const enqProducts = Array.isArray(enq?.products) ? enq.products : [];
  const [rows, setRows] = useState(() =>
    (enqProducts.length ? enqProducts : [{ name: "", qty: "", unit: "kg" }]).map(p => ({
      include: true,
      product_name: p.name || "",
      quantity: p.qty || "",
      unit: SAMPLE_UNITS.includes(p.unit) ? p.unit : "kg",
      supplier_id: "",
      purpose: ""
    }))
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (!enq) return null;

  const activeSuppliers = (suppliers || [])
    .filter(s => s.status === "active" || !s.status).slice().sort(byName);
  const chosen = rows.filter(r => r.include && r.product_name.trim());

  function setRow(i, patch) { setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r)); }
  function addRow() { setRows(rs => [...rs, { include: true, product_name: "", quantity: "", unit: "kg", supplier_id: "", purpose: "" }]); }
  function removeRow(i) { setRows(rs => rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    if (chosen.length === 0) { alert("Tick at least one product to request a sample for."); return; }
    setSaving(true);
    try {
      await onSave({
        enquiry_id: enq.id,
        enquiry_no: `ENQ-${enq.id}`,
        customer_id: enq.customer_id || null,
        customer_name: enq.customer_name || "",
        customer_contact: enq.contact_person || "",
        customer_email: enq.customer_email || "",
        customer_country: enq.country || "",
        enquiry_notes: notes.trim(),
        products: chosen.map(r => {
          const sup = activeSuppliers.find(s => String(s.id) === String(r.supplier_id));
          return {
            product_name: r.product_name.trim(),
            quantity: String(r.quantity || "").trim(),
            unit: r.unit,
            purpose: (r.purpose || "").trim(),
            supplier_id: sup ? String(sup.id) : "",
            supplier_name: sup ? sup.company : "",
            supplier_contact: sup ? (sup.contact_name || "") : "",
            supplier_email: sup ? (sup.contact_email || sup.email || "") : ""
          };
        })
      });
      onClose();
    } catch (e) {
      console.error("SampleFromEnquiry save:", e);
      setSaving(false);
    }
  }

  // ── Styles ──
  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 350, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "28px 20px", overflowY: "auto" };
  const modal = { width: "min(860px, 96vw)", background: C.card, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" };
  const head = { padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 };
  const body = { padding: "18px 22px" };
  const foot = { padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };
  const label = { fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", display: "block", marginBottom: 6 };
  const inp = { width: "100%", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.ink, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const btnPrimary = { background: C.blue, color: "white", border: 0, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" };
  const btnGhost = { background: "transparent", color: C.muted, border: `1px solid ${C.border}`, padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" };
  const gridCols = "26px 1.5fr 66px 78px 1.3fr 1.2fr 28px";
  const tag = (color) => ({ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 5, padding: "2px 6px" });

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>

        <div style={head}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>Sample details</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 5, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={tag(C.muted)}>ENQ-{enq.id}</span>
              {enq.quarter_ref && <span style={tag(C.blue)}>{enq.quarter_ref}</span>}
              <span>{enq.customer_name}{enq.country ? ` · ${enq.country}` : ""}{enq.assigned_to ? ` · ${enq.assigned_to.split(" ")[0]}` : ""}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 18, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        <div style={body}>
          <div style={{ background: C.blueLt, border: `1px solid #BFD6F6`, borderRadius: 9, padding: "10px 13px", fontSize: 12, lineHeight: 1.5, color: "#0b4ea2", marginBottom: 16 }}>
            Stage is already saved as <b>Sample Under Process</b>. Tick the products you need samples for — each becomes its own sample request with its own journey, all linked back to ENQ-{enq.id}.
          </div>

          <span style={label}>Customer — pulled from the enquiry</span>
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
            {[["Company", enq.customer_name], ["Contact", enq.contact_person], ["Email", enq.customer_email], ["Country", enq.country]].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.muted, fontWeight: 700, marginBottom: 3 }}>{k}</div>
                <div style={{ fontSize: 12, color: v ? C.ink : C.faded, overflow: "hidden", textOverflow: "ellipsis" }}>{v || "—"}</div>
              </div>
            ))}
          </div>

          <span style={label}>Products on this enquiry ({rows.length})</span>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, padding: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, padding: "0 4px 7px", fontSize: 9, fontWeight: 700, letterSpacing: .5, color: C.muted, textTransform: "uppercase" }}>
              <div></div><div>Product</div><div>Qty</div><div>Unit</div><div>Supplier (optional)</div><div>Purpose</div><div></div>
            </div>

            {rows.map((r, i) => {
              const off = !r.include;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, marginBottom: 7, alignItems: "center", opacity: off ? 0.45 : 1 }}>
                  <div onClick={() => setRow(i, { include: !r.include })} title={r.include ? "Skip this product" : "Include this product"}
                    style={{ width: 16, height: 16, margin: "0 auto", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "white", background: r.include ? C.blue : "transparent", border: `2px solid ${r.include ? C.blue : C.faded}` }}>
                    {r.include ? "✓" : ""}
                  </div>
                  <input style={inp} disabled={off} value={r.product_name} onChange={e => setRow(i, { product_name: e.target.value })} placeholder="Product name" />
                  <input style={inp} disabled={off} value={r.quantity} onChange={e => setRow(i, { quantity: e.target.value })} placeholder="250" />
                  <select style={inp} disabled={off} value={r.unit} onChange={e => setRow(i, { unit: e.target.value })}>
                    {SAMPLE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <select style={{ ...inp, color: r.supplier_id ? C.ink : C.muted }} disabled={off} value={r.supplier_id} onChange={e => setRow(i, { supplier_id: e.target.value })}>
                    <option value="">— assign later —</option>
                    {activeSuppliers.map(s => <option key={s.id} value={String(s.id)}>{fmtName(s.company)}{s.country ? ` (${s.country})` : ""}</option>)}
                  </select>
                  <input style={inp} disabled={off} value={r.purpose} onChange={e => setRow(i, { purpose: e.target.value })} placeholder="stability + spec" />
                  <button onClick={() => removeRow(i)} disabled={rows.length === 1} title="Remove row"
                    style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, color: C.muted, height: 32, cursor: rows.length === 1 ? "not-allowed" : "pointer", fontSize: 12, opacity: rows.length === 1 ? 0.3 : 1 }}>✕</button>
                </div>
              );
            })}

            <button onClick={addRow} style={{ ...btnGhost, padding: "6px 12px", fontSize: 11, marginTop: 4, color: C.blue, borderColor: "#BFD6F6", background: C.blueLt }}>
              + Add a product not on the enquiry
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <span style={label}>Notes for the sample request (optional)</span>
            <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything the supplier should know…" />
          </div>
        </div>

        <div style={foot}>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, maxWidth: 430 }}>
            🔕 <b>No email is sent now.</b> Open the sample and press <b>Send request to supplier</b> when you're ready.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={btnGhost} onClick={onClose}>Cancel</button>
            <button style={{ ...btnPrimary, opacity: saving || chosen.length === 0 ? 0.55 : 1, cursor: saving || chosen.length === 0 ? "not-allowed" : "pointer" }}
              disabled={saving || chosen.length === 0} onClick={handleSave}>
              {saving ? "Saving…" : `Create ${chosen.length} sample${chosen.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
