import { useState } from "react";
import { C } from "../../constants.js";
import { CURRENCIES } from "../../lib/orderUtils.js";

/**
 * Log a payment event.
 *
 * Props:
 *  - order: parent order
 *  - paymentType: 'customer_payment_in' | 'supplier_payment_out'
 *  - invoices: list of invoices for this order (filtered to relevant type for dropdown)
 *  - supplierPOs: list of supplier_pos (for supplier payments)
 *  - onClose, onSave
 */
export function PaymentForm({ order, paymentType, invoices, supplierPOs, onClose, onSave }) {
  const isIncoming = paymentType === "customer_payment_in";

  const [invoiceId, setInvoiceId] = useState("");
  const [supplierPOId, setSupplierPOId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(order?.currency || "USD");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("Wire");
  const [bankReference, setBankReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Filter invoices by relevant type for the dropdown
  const relevantInvoices = (invoices || []).filter(inv =>
    isIncoming ? inv.invoice_type === "customer" : inv.invoice_type === "supplier"
  );

  function validate() {
    if (!amount || parseFloat(amount) <= 0) return "Amount must be greater than 0.";
    if (!paymentDate) return "Payment date is required.";
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setSaving(true);

    try {
      const row = {
        order_id: order.id,
        invoice_id: invoiceId ? parseInt(invoiceId) : null,
        supplier_po_id: !isIncoming && supplierPOId ? parseInt(supplierPOId) : null,
        payment_type: paymentType,
        amount: parseFloat(amount),
        currency,
        payment_date: paymentDate,
        payment_method: paymentMethod || null,
        bank_reference: bankReference.trim() || null,
        notes: notes.trim() || null
      };

      const result = await onSave(row);
      if (result) onClose();
      else setError("Failed to save payment.");
    } catch (e) {
      console.error(e);
      setError("Unexpected error.");
    } finally {
      setSaving(false);
    }
  }

  const overlay = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    zIndex: 250, display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: "30px 20px", overflowY: "auto"
  };
  const modal = {
    background: C.card, borderRadius: 12, width: "100%", maxWidth: 560,
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column"
  };
  const header = {
    padding: "16px 24px", borderBottom: `1px solid ${C.border}`,
    display: "flex", alignItems: "center", justifyContent: "space-between"
  };
  const body = { padding: "20px 24px", flex: 1 };
  const footer = {
    padding: "12px 24px", borderTop: `1px solid ${C.border}`,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: C.bg, borderRadius: "0 0 12px 12px"
  };
  const label = { fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4, display: "block" };
  const input = {
    width: "100%", padding: "8px 11px", border: `1px solid ${C.border}`,
    borderRadius: 7, fontSize: 13, fontFamily: "inherit", background: C.white, color: C.ink,
    boxSizing: "border-box"
  };
  const required = { color: C.red, marginLeft: 2 };
  const btnPrimary = {
    background: C.blue, color: "white", border: 0,
    padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1
  };
  const btnSecondary = {
    background: "transparent", color: C.ink, border: `1px solid ${C.border}`,
    padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer"
  };
  const btnGhost = {
    background: "transparent", color: C.muted, border: "none",
    padding: "4px 8px", fontSize: 13, cursor: "pointer"
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>
              {isIncoming ? "Payment received" : "Payment sent"}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {isIncoming ? "Log payment received from customer" : "Log payment sent to supplier"}
            </div>
          </div>
          <button onClick={onClose} style={btnGhost}>✕</button>
        </div>

        <div style={body}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={label}>Linked invoice (optional)</label>
              <select style={input} value={invoiceId} onChange={e => setInvoiceId(e.target.value)}>
                <option value="">— None / partial against multiple invoices —</option>
                {relevantInvoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} · {inv.amount} {inv.currency} · {inv.status}
                  </option>
                ))}
              </select>
            </div>

            {!isIncoming && (supplierPOs || []).length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Linked supplier PO (optional)</label>
                <select style={input} value={supplierPOId} onChange={e => setSupplierPOId(e.target.value)}>
                  <option value="">— Not specific to one supplier PO —</option>
                  {supplierPOs.map(po => (
                    <option key={po.id} value={po.id}>{po.supplier_po_number}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={label}>Amount<span style={required}>*</span></label>
              <input style={input} type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label style={label}>Currency</label>
              <select style={input} value={currency} onChange={e => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Payment date<span style={required}>*</span></label>
              <input style={input} type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div>
              <label style={label}>Method</label>
              <select style={input} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option>Wire</option>
                <option>ACH</option>
                <option>Check</option>
                <option>Credit card</option>
                <option>Other</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={label}>Bank / transaction reference</label>
              <input style={input} value={bankReference} onChange={e => setBankReference(e.target.value)}
                     placeholder="Wire ref, txn ID, check #…" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={label}>Notes</label>
              <textarea style={{ ...input, minHeight: 50, fontFamily: "inherit", resize: "vertical" }}
                        value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {error && (
            <div style={{ background: "#FEE", color: C.red, padding: "8px 12px", borderRadius: 7, fontSize: 12, marginTop: 8 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        <div style={footer}>
          <div></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
            <button onClick={handleSubmit} style={btnPrimary} disabled={saving}>
              {saving ? "Saving…" : "✓ Save payment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
