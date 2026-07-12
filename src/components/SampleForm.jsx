import { useState } from "react";
import { C, UNITS } from "../constants.js";
// Customer sample ENQUIRY — one customer, one or more products.
// Each product becomes its own sample request (own supplier + own journey),
// grouped under a shared enquiry_no. Supplier is optional per product here
// and can be assigned later in the drawer.
export function SampleForm({ customers, suppliers, onClose, onSave }) {
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState([blankRow()]);
  const [saving, setSaving] = useState(false);
  const activeSuppliers = (suppliers || []).filter(s => s.status === "active" || !s.status);

  function blankRow() { return { product_name: "", quantity: "", unit: "g", supplier_id: "", purpose: "" }; }
  function setRow(i, patch) { setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r)); }
  function addRow() { setRows(rs => [...rs, blankRow()]); }
  function removeRow(i) { setRows(rs => rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    const cust = (customers || []).find(c => String(c.id) === String(customerId));
    if (!cust) { alert("Pick a customer."); return; }
    const products = rows.filter(r => r.product_name.trim()).map(r => {
      const sup = activeSuppliers.find(s => String(s.id) === String(r.supplier_id));
      return {
        product_name: r.product_name.trim(),
        quantity: (r.quantity || "").trim(),
        unit: r.unit,
        purpose: (r.purpose || "").trim(),
        supplier_id: sup ? String(sup.id) : "",
        supplier_name: sup ? sup.company : "",
        supplier_contact: sup ? (sup.contact_name || "") : "",
        supplier_email: sup ? (sup.contact_email || sup.email || "") : ""
      };
    });
    if (products.length === 0) { alert("Add at least one product."); return; }
    setSaving(true);
    await onSave({
      customer_id: String(cust.id),
      customer_name: cust.company,
      customer_contact: cust.contact_name || cust.contact_person || "",
      customer_email: cust.email || "",
      customer_country: cust.country || "",
      enquiry_notes: notes.trim(),
      products
    });
    setSaving(false);
    onClose();
  }
  // ── Styles ──
  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 120, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "28px 20px", overflowY: "auto" };
  const modal = { width: "min(760px, 96vw)", background: C.card, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", padding: 24 };
  const label = { fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", display: "block", marginBottom: 5 };
  const inp = { width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.ink, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const field = { marginBottom: 14 };
  const btnPrimary = { background: C.blue, color: "white", border: 0, padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" };
  const btnGhost = { background: "transparent", color: C.ink, border: `1px solid ${C.border}`, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" };
  const unitList = UNITS || ["g", "kg"];

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.ink, margin: 0 }}>New sample enquiry</h2>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>One customer · one or more products — each becomes its own request</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 18, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        <div style={field}>
          <label style={label}>Customer</label>
          <select style={{ ...inp, color: customerId ? C.ink : C.muted }} value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Select customer…</option>
            {(customers || []).map(c => <option key={c.id} value={String(c.id)}>{c.company}{c.country ? ` (${c.country})` : ""}</option>)}
          </select>
        </div>

        <label style={label}>Products requested</label>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 8, background: C.bg }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 70px 70px 1.4fr 1.4fr 28px", gap: 8, padding: "0 4px 6px", fontSize: 9, color: C.muted, textTransform: "uppercase", fontWeight: 700, letterSpacing: .5 }}>
            <div>Product</div><div>Qty</div><div>Unit</div><div>Supplier (optional)</div><div>Purpose</div><div></div>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 70px 70px 1.4fr 1.4fr 28px", gap: 8, marginBottom: 6, alignItems: "center" }}>
              <input style={inp} value={r.product_name} onChange={e => setRow(i, { product_name: e.target.value })} placeholder="e.g. Bovine Colostrum 30% IgG" />
              <input style={inp} value={r.quantity} onChange={e => setRow(i, { quantity: e.target.value })} placeholder="250" />
              <select style={inp} value={r.unit} onChange={e => setRow(i, { unit: e.target.value })}>
                {unitList.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <select style={{ ...inp, color: r.supplier_id ? C.ink : C.muted }} value={r.supplier_id} onChange={e => setRow(i, { supplier_id: e.target.value })}>
                <option value="">— assign later —</option>
                {activeSuppliers.map(s => <option key={s.id} value={String(s.id)}>{s.company}{s.country ? ` (${s.country})` : ""}</option>)}
              </select>
              <input style={inp} value={r.purpose} onChange={e => setRow(i, { purpose: e.target.value })} placeholder="stability + spec" />
              <button onClick={() => removeRow(i)} title="Remove" style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, color: C.muted, cursor: rows.length === 1 ? "not-allowed" : "pointer", fontSize: 13, height: 34 }} disabled={rows.length === 1}>✕</button>
            </div>
          ))}
          <button onClick={addRow} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12, marginTop: 4 }}>+ Add product</button>
        </div>

        <div style={{ ...field, marginTop: 12 }}>
          <label style={label}>Enquiry notes (optional)</label>
          <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything to include across the request(s)" />
        </div>

        <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>
          Products with a supplier chosen get a request email now (from procurement@mail.ingredientz.co) and start at <b>Requested</b>. Products left as "assign later" wait at <b>Awaiting Supplier</b> until you assign one in the drawer.
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Create enquiry"}
          </button>
        </div>
      </div>
    </div>
  );
}
