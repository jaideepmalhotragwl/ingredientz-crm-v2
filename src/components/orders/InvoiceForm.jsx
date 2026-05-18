import { useState } from "react";
import { C } from "../../constants.js";
import { CURRENCIES, INVOICE_STATUSES } from "../../lib/orderUtils.js";

/**
 * Generic invoice form — used for both customer-side and supplier-side invoices.
 *
 * Props:
 *  - order: the parent order
 *  - invoiceType: 'customer' | 'supplier'
 *  - supplierPOs: list of supplier_pos for this order (used when type='supplier' to link the invoice)
 *  - onClose: () => void
 *  - onSave: async (invoiceRow, file) => Promise<saved | null>
 */
export function InvoiceForm({ order, invoiceType, supplierPOs, onClose, onSave }) {
  const isCustomer = invoiceType === "customer";

  const [supplierPOId, setSupplierPOId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState(isCustomer ? String(order?.total_amount || "") : "");
  const [currency, setCurrency] = useState(order?.currency || "USD");
  const [status, setStatus] = useState("unpaid");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function validate() {
    if (!invoiceNumber.trim()) return "Invoice number is required.";
    if (!invoiceDate) return "Invoice date is required.";
    if (!amount || parseFloat(amount) <= 0) return "Amount must be greater than 0.";
    if (!isCustomer && !supplierPOId) return "Please select which supplier PO this invoice is for.";
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setSaving(true);

    try {
      const invoiceRow = {
        order_id: order.id,
        supplier_po_id: !isCustomer && supplierPOId ? parseInt(supplierPOId) : null,
        invoice_type: invoiceType,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        amount: parseFloat(amount),
        currency,
        status,
        notes: notes.trim() || null
      };

      const result = await onSave(invoiceRow, file);
      if (result) onClose();
      else setError("Failed to save invoice. Check the browser console.");
    } catch (e) {
      console.error(e);
      setError("Unexpected error.");
    } finally {
      setSaving(false);
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const overlay = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    zIndex: 250, display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: "30px 20px", overflowY: "auto"
  };
  const modal = {
    background: C.card, borderRadius: 12, width: "100%", maxWidth: 640,
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
              {isCustomer ? "Customer invoice" : "Supplier invoice"}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {isCustomer
                ? `Invoice you raised to ${order?.customer_po_number ? "the customer" : "your customer"}`
                : "Invoice received from a supplier"}
            </div>
          </div>
          <button onClick={onClose} style={btnGhost}>✕</button>
        </div>

        <div style={body}>
          {!isCustomer && (
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Linked supplier PO<span style={required}>*</span></label>
              <select style={input} value={supplierPOId} onChange={e => setSupplierPOId(e.target.value)}>
                <option value="">Select supplier PO…</option>
                {(supplierPOs || []).map(po => (
                  <option key={po.id} value={po.id}>{po.supplier_po_number}</option>
                ))}
              </select>
              {(supplierPOs || []).length === 0 && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                  Raise a supplier PO first before logging the supplier's invoice.
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>Invoice number<span style={required}>*</span></label>
              <input style={input} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                     placeholder={isCustomer ? "INV-2026-0042" : "SI-9023"} />
            </div>
            <div>
              <label style={label}>Invoice date<span style={required}>*</span></label>
              <input style={input} type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <label style={label}>Due date</label>
              <input style={input} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label style={label}>Status</label>
              <select style={input} value={status} onChange={e => setStatus(e.target.value)}>
                {INVOICE_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
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
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={label}>Invoice PDF (optional)</label>
            <input style={{ ...input, padding: 6 }} type="file" accept=".pdf,.png,.jpg,.jpeg"
                   onChange={e => setFile(e.target.files?.[0] || null)} />
            {file && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={label}>Notes</label>
            <textarea style={{ ...input, minHeight: 50, resize: "vertical", fontFamily: "inherit" }}
                      placeholder="Any reconciliation notes…"
                      value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {error && (
            <div style={{ background: "#FEE", color: C.red, padding: "8px 12px", borderRadius: 7, fontSize: 12, marginTop: 12 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        <div style={footer}>
          <div></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
            <button onClick={handleSubmit} style={btnPrimary} disabled={saving}>
              {saving ? "Saving…" : "✓ Save invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
