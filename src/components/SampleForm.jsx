import { useState } from "react";
import { C, UNITS } from "../constants.js";

// New sample request — limited fields: customer, supplier, product.
export function SampleForm({ customers, suppliers, onClose, onSave }) {
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("g");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const activeSuppliers = (suppliers || []).filter(s => s.status === "active" || !s.status);

  async function handleSave() {
    const cust = (customers || []).find(c => String(c.id) === String(customerId));
    const sup = activeSuppliers.find(s => String(s.id) === String(supplierId));
    if (!cust) { alert("Pick a customer."); return; }
    if (!sup) { alert("Pick a supplier."); return; }
    if (!productName.trim()) { alert("Enter the product."); return; }

    setSaving(true);
    const row = {
      customer_id: String(cust.id),
      customer_name: cust.company,
      customer_contact: cust.contact_name || cust.contact_person || "",
      customer_email: cust.email || "",
      customer_country: cust.country || "",

      supplier_id: String(sup.id),
      supplier_name: sup.company,
      supplier_contact: sup.contact_name || "",
      supplier_email: sup.contact_email || sup.email || "",

      product_name: productName.trim(),
      quantity: quantity.trim(),
      unit,
      purpose: purpose.trim(),
      notes: notes.trim()
    };
    await onSave(row);
    setSaving(false);
    onClose();
  }

  // ── Styles ──
  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center" };
  const modal = { width: "min(560px, 94vw)", maxHeight: "90vh", overflowY: "auto", background: C.card, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", padding: 24 };
  const label = { fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", display: "block", marginBottom: 5 };
  const inp = { width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.ink, fontSize: 13, outline: "none", fontFamily: "inherit" };
  const field = { marginBottom: 14 };
  const btnPrimary = { background: C.blue, color: "white", border: 0, padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" };
  const btnGhost = { background: "transparent", color: C.ink, border: `1px solid ${C.border}`, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" };

  const selectedSupplier = activeSuppliers.find(s => String(s.id) === String(supplierId));
  const noSupplierEmail = selectedSupplier && !(selectedSupplier.contact_email || selectedSupplier.email);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.ink, margin: 0 }}>New sample request</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 18, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        <div style={field}>
          <label style={label}>Customer</label>
          <select style={{ ...inp, color: customerId ? C.ink : C.muted }} value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Select customer…</option>
            {(customers || []).map(c => <option key={c.id} value={String(c.id)}>{c.company}{c.country ? ` (${c.country})` : ""}</option>)}
          </select>
        </div>

        <div style={field}>
          <label style={label}>Supplier (sample requested from)</label>
          <select style={{ ...inp, color: supplierId ? C.ink : C.muted }} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">Select supplier…</option>
            {activeSuppliers.map(s => <option key={s.id} value={String(s.id)}>{s.company}{s.country ? ` (${s.country})` : ""}</option>)}
          </select>
          {noSupplierEmail && <div style={{ fontSize: 11, color: C.amber, marginTop: 5 }}>⚠ This supplier has no email on file — the request won't send until one is added.</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 10, ...field }}>
          <div>
            <label style={label}>Product</label>
            <input style={inp} value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Bovine Colostrum 30% IgG" />
          </div>
          <div>
            <label style={label}>Qty</label>
            <input style={inp} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="250" />
          </div>
          <div>
            <label style={label}>Unit</label>
            <select style={inp} value={unit} onChange={e => setUnit(e.target.value)}>
              {(UNITS || ["g", "kg"]).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div style={field}>
          <label style={label}>Purpose (optional)</label>
          <input style={inp} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. stability + spec trial" />
        </div>

        <div style={{ ...field, marginBottom: 20 }}>
          <label style={label}>Notes (optional)</label>
          <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything to include in the request" />
        </div>

        <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>
          On save, a sample-request email is sent to the supplier (from procurement@mail.ingredientz.co) and the journey starts at <b>Requested</b>.
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Create & send request"}
          </button>
        </div>
      </div>
    </div>
  );
}
