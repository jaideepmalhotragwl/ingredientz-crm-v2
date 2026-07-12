import { useState, useMemo, useEffect } from "react";
import { C, PAYMENT_TERMS, INCOTERMS } from "../../constants.js";
import { supabase } from "../../config.js";
import {
  CURRENCIES,
  fmtMoney,
  calcLineTotal
} from "../../lib/orderUtils.js";
import { previewSupplierPO } from "../../lib/docGen.js";
/**
 * Form to raise a Supplier PO covering one or more line items of a customer order.
 *
 * Props:
 *  - order, orderItems, suppliers, existingPOItems, onClose
 *  - onSave: async (supplierPORow, supplierPOItems, poFile) => Promise<savedRow | null>
 *            IMPORTANT: onSave must return the inserted supplier_pos row (with `id`
 *            and `supplier_po_number`) so we can attach the generated PDF.
 */
export function SupplierPOForm({ order, orderItems, suppliers, existingPOItems, onClose, onSave }) {
  const [supplierId, setSupplierId] = useState("");
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedShipDate, setExpectedShipDate] = useState("");
  const [currency, setCurrency] = useState(order?.currency || "USD");
  const [paymentTerms, setPaymentTerms] = useState("Advance Payment");
  const [incoterms, setIncoterms] = useState("FOB");
  const [shipToType, setShipToType] = useState("customer");
  const [shipToAddress, setShipToAddress] = useState(order?.ship_to_address || "");
  const [carrierPreference, setCarrierPreference] = useState("");
  const [notesToSupplier, setNotesToSupplier] = useState("");
  const [lineSelections, setLineSelections] = useState(() => {
    const init = {};
    (orderItems || []).forEach(it => { init[it.id] = { selected: false, cost_per_unit: "" }; });
    return init;
  });
  const [poFile, setPoFile] = useState(null);
  const [autoPdf, setAutoPdf] = useState(true);   // NEW: auto-generate branded supplier PO
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = saving;

  const alreadyAssignedIds = useMemo(() => {
    const s = new Set();
    (existingPOItems || []).forEach(p => s.add(p.order_item_id));
    return s;
  }, [existingPOItems]);
  function toggleLine(itemId) {
    if (alreadyAssignedIds.has(itemId)) return;
    setLineSelections(prev => ({ ...prev, [itemId]: { ...prev[itemId], selected: !prev[itemId]?.selected } }));
  }
  function updateLineCost(itemId, cost) {
    setLineSelections(prev => ({ ...prev, [itemId]: { ...prev[itemId], cost_per_unit: cost } }));
  }
  const selectedLines = useMemo(
    () => (orderItems || []).filter(it => lineSelections[it.id]?.selected),
    [orderItems, lineSelections]
  );
  const poTotal = useMemo(() => selectedLines.reduce((sum, it) =>
    sum + calcLineTotal(it.quantity, parseFloat(lineSelections[it.id]?.cost_per_unit) || 0), 0),
    [selectedLines, lineSelections]);

  const supplier = useMemo(
    () => (suppliers || []).find(s => String(s.id) === String(supplierId)),
    [suppliers, supplierId]
  );
  // Supplier PO items enriched with product info (supplier_po_items itself only stores the FK).
  function enrichedPoItems() {
    return selectedLines.map(it => ({
      order_item_id: it.id,
      product_name: it.product_name,
      product_spec: it.product_spec,
      unit: it.unit,
      quantity: parseFloat(it.quantity),
      cost_per_unit: parseFloat(lineSelections[it.id]?.cost_per_unit) || 0
    }));
  }
  function draftPo() {
    return {
      supplier_po_number: `${order?.order_number || ""} · DRAFT`,
      po_date: poDate, expected_ship_date: expectedShipDate || null,
      currency, payment_terms: paymentTerms, incoterms, total_amount: poTotal
    };
  }
  function handlePreview() {
    if (!supplierId) { setError("Select a supplier to preview."); return; }
    if (selectedLines.length === 0) { setError("Select at least one line item to preview."); return; }
    const res = previewSupplierPO({ order, po: draftPo(), poItems: enrichedPoItems(), supplier });
    if (res && res.ok === false) setError(res.error);
  }

  function validate() {
    if (!supplierId) return "Please select a supplier.";
    if (selectedLines.length === 0) return "Select at least one line item to include in this PO.";
    for (const it of selectedLines) {
      const cost = parseFloat(lineSelections[it.id]?.cost_per_unit);
      if (!cost || cost < 0) return `Line ${it.line_number}: your cost per unit is required.`;
    }
    return null;
  }
  async function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setSaving(true);
    try {
      const supplierPORow = {
        order_id: order.id,
        supplier_id: parseInt(supplierId),
        po_date: poDate || null,
        expected_ship_date: expectedShipDate || null,
        currency,
        payment_terms: paymentTerms,
        incoterms,
        ship_to_type: shipToType,
        ship_to_address: shipToAddress.trim() || null,
        carrier_preference: carrierPreference.trim() || null,
        notes_to_supplier: notesToSupplier.trim() || null,
        total_amount: poTotal,
        status: "draft"
      };
      const poItems = selectedLines.map(it => ({
        order_item_id: it.id,
        quantity: parseFloat(it.quantity),
        cost_per_unit: parseFloat(lineSelections[it.id].cost_per_unit)
      }));
      // App.addSupplierPO handles PDF generation + attach when autoPdf is set.
      const opts = { autoPdf: autoPdf && !poFile };
      const result = await onSave(supplierPORow, poItems, poFile, opts);
      if (!result) { setError("Failed to save supplier PO. Check the browser console."); return; }
      onClose();
    } catch (e) {
      console.error(e);
      setError("Unexpected error. Check the browser console.");
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
    background: C.card, borderRadius: 12, width: "100%", maxWidth: 880,
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column"
  };
  const header = {
    padding: "16px 24px", borderBottom: `1px solid ${C.border}`,
    display: "flex", alignItems: "center", justifyContent: "space-between"
  };
  const bodyS = { padding: "20px 24px", flex: 1 };
  const footer = {
    padding: "12px 24px", borderTop: `1px solid ${C.border}`,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: C.bg, borderRadius: "0 0 12px 12px"
  };
  const sectionTitle = {
    fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 10,
    textTransform: "uppercase", letterSpacing: 1
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
    cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1
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
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>Raise supplier PO</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Order {order?.order_number} · select line items + supplier + commercials
            </div>
          </div>
          <button onClick={onClose} style={btnGhost}>✕</button>
        </div>
        <div style={bodyS}>
          {/* ── Supplier ────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>Supplier</div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Supplier<span style={required}>*</span></label>
                <select style={input} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                  <option value="">Select supplier…</option>
                  {(suppliers || []).map(s => (
                    <option key={s.id} value={s.id}>{s.company} {s.country ? `(${s.country})` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>PO date</label>
                <input style={input} type="date" value={poDate} onChange={e => setPoDate(e.target.value)} />
              </div>
              <div>
                <label style={label}>Expected ship date</label>
                <input style={input} type="date" value={expectedShipDate} onChange={e => setExpectedShipDate(e.target.value)} />
              </div>
            </div>
          </div>
          {/* ── Commercials ─────────────────────────────────────────────── */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>Commercials</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Currency</label>
                <select style={input} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Payment terms</label>
                <select style={input} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}>
                  {PAYMENT_TERMS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Incoterms</label>
                <select style={input} value={incoterms} onChange={e => setIncoterms(e.target.value)}>
                  {INCOTERMS.map(i => <option key={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Carrier preference</label>
                <input style={input} placeholder="DHL, FedEx, sea freight…"
                       value={carrierPreference} onChange={e => setCarrierPreference(e.target.value)} />
              </div>
            </div>
          </div>
          {/* ── Shipping ────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>Ship to</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
              <div>
                <label style={label}>Destination type</label>
                <select style={input} value={shipToType} onChange={e => setShipToType(e.target.value)}>
                  <option value="customer">Customer (drop-ship)</option>
                  <option value="warehouse_us">Our US warehouse</option>
                  <option value="warehouse_in">Our India warehouse</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={label}>Address</label>
                <input style={input} value={shipToAddress} onChange={e => setShipToAddress(e.target.value)} />
              </div>
            </div>
          </div>
          {/* ── Line item selection ─────────────────────────────────────── */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>
              Line items to include<span style={required}>*</span>
              <span style={{ color: C.muted, fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 8, fontSize: 11 }}>
                Check items to assign · enter your cost per unit
              </span>
            </div>
            <div style={{ background: C.bg, borderRadius: 8, padding: 8, border: `1px solid ${C.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "30px 40px 2fr 1fr 1fr 1fr", gap: 10, padding: "6px 10px", fontSize: 10, color: C.muted, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>
                <div></div><div>Line</div><div>Product</div><div>Qty</div><div>Your cost</div><div>Subtotal</div>
              </div>
              {(orderItems || []).map(it => {
                const isAssigned = alreadyAssignedIds.has(it.id);
                const isSelected = lineSelections[it.id]?.selected;
                const cost = lineSelections[it.id]?.cost_per_unit || "";
                const subtotal = calcLineTotal(it.quantity, cost);
                return (
                  <div key={it.id}
                    style={{ display: "grid", gridTemplateColumns: "30px 40px 2fr 1fr 1fr 1fr", gap: 10, padding: "10px",
                      background: isSelected ? "#E7F0FD" : isAssigned ? "#F5F5F5" : "white", borderRadius: 6, marginBottom: 4,
                      alignItems: "center", opacity: isAssigned ? 0.5 : 1, cursor: isAssigned ? "not-allowed" : "pointer" }}
                    onClick={() => toggleLine(it.id)}>
                    <input type="checkbox" checked={isSelected || false} disabled={isAssigned} readOnly
                      style={{ cursor: isAssigned ? "not-allowed" : "pointer" }} />
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>#{it.line_number}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{it.product_name}</div>
                      {it.product_spec && <div style={{ fontSize: 11, color: C.muted }}>{it.product_spec}</div>}
                      {isAssigned && <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>Already in another supplier PO</div>}
                    </div>
                    <div style={{ fontSize: 13 }}>{it.quantity} {it.unit}</div>
                    <div onClick={e => e.stopPropagation()}>
                      <input style={{ ...input, padding: "5px 8px", fontSize: 12 }} type="number" step="0.0001" placeholder="0.00"
                        value={cost} disabled={isAssigned || !isSelected} onChange={e => updateLineCost(it.id, e.target.value)} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{cost ? fmtMoney(subtotal, currency) : "—"}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px", marginTop: 8, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, color: C.muted, marginRight: 12 }}>
                {selectedLines.length} item{selectedLines.length === 1 ? "" : "s"} selected · Supplier PO total
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{fmtMoney(poTotal, currency)} {currency}</div>
            </div>
          </div>
          {/* ── Notes ───────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>Notes to supplier</div>
            <textarea style={{ ...input, minHeight: 60, fontFamily: "inherit", resize: "vertical" }}
              placeholder="Quality specs, packing requirements, special instructions…"
              value={notesToSupplier} onChange={e => setNotesToSupplier(e.target.value)} />
          </div>
          {/* ── Auto-generate / upload ─────────────────────────────────── */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: C.ink }}>
              <input type="checkbox" checked={autoPdf} disabled={!!poFile} onChange={e => setAutoPdf(e.target.checked)} />
              Auto-generate branded supplier PO PDF on save
            </label>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              Renders this PO on your Ingredientz letterhead and attaches it to the order. Uploading a file below turns this off.
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={label}>Or upload your own PO PDF (optional)</label>
              <input style={{ ...input, padding: 6 }} type="file" accept=".pdf,.png,.jpg,.jpeg"
                onChange={e => { const f = e.target.files?.[0] || null; setPoFile(f); if (f) setAutoPdf(false); }} />
              {poFile && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                  Selected: {poFile.name} ({(poFile.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </div>
          </div>
          {error && (
            <div style={{ background: "#FEE", color: C.red, padding: "8px 12px", borderRadius: 7, fontSize: 12, marginTop: 12 }}>
              ⚠ {error}
            </div>
          )}
        </div>
        <div style={footer}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={handlePreview} style={btnSecondary} disabled={busy}>Preview</button>
            <span style={{ fontSize: 12, color: C.muted }}>Creates a supplier PO and locks the selected items to it.</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnSecondary} disabled={busy}>Cancel</button>
            <button onClick={handleSubmit} style={btnPrimary} disabled={busy}>
              {saving ? "Saving…" : "✓ Save supplier PO"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
