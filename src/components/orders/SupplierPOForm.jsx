import { useState, useMemo, useEffect } from "react";
import { C, PAYMENT_TERMS, INCOTERMS } from "../../constants.js";
import { supabase } from "../../config.js";
import {
  CURRENCIES,
  fmtMoney,
  calcLineTotal
} from "../../lib/orderUtils.js";

/**
 * Form to raise a Supplier PO covering one or more line items of a customer order.
 *
 * Props:
 *  - order: the parent order object
 *  - orderItems: all line items for this order
 *  - suppliers: list of suppliers
 *  - existingPOItems: rows from supplier_po_items table for this order
 *                     (so we can grey out lines already in another supplier PO)
 *  - onClose: () => void
 *  - onSave: async (supplierPORow, supplierPOItems) => Promise<savedRow | null>
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
    // Map order_item_id => { selected, cost_per_unit }
    const init = {};
    (orderItems || []).forEach(it => {
      init[it.id] = { selected: false, cost_per_unit: "" };
    });
    return init;
  });
  const [poFile, setPoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Which order_item_ids are already assigned to another supplier PO?
  const alreadyAssignedIds = useMemo(() => {
    const s = new Set();
    (existingPOItems || []).forEach(p => s.add(p.order_item_id));
    return s;
  }, [existingPOItems]);

  function toggleLine(itemId) {
    if (alreadyAssignedIds.has(itemId)) return;
    setLineSelections(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], selected: !prev[itemId]?.selected }
    }));
  }

  function updateLineCost(itemId, cost) {
    setLineSelections(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], cost_per_unit: cost }
    }));
  }

  const selectedLines = useMemo(() => {
    return (orderItems || []).filter(it => lineSelections[it.id]?.selected);
  }, [orderItems, lineSelections]);

  const poTotal = useMemo(() => {
    return selectedLines.reduce((sum, it) => {
      const cost = parseFloat(lineSelections[it.id]?.cost_per_unit) || 0;
      return sum + calcLineTotal(it.quantity, cost);
    }, 0);
  }, [selectedLines, lineSelections]);

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
        status: "draft"
      };

      const poItems = selectedLines.map(it => ({
        order_item_id: it.id,
        quantity: parseFloat(it.quantity),
        cost_per_unit: parseFloat(lineSelections[it.id].cost_per_unit)
      }));

      const result = await onSave(supplierPORow, poItems, poFile);
      if (result) onClose();
      else setError("Failed to save supplier PO. Check the browser console.");
    } catch (e) {
      console.error(e);
      setError("Unexpected error. Check the browser console.");
    } finally {
      setSaving(false);
    }
  }

  // ── Styles (match OrderForm) ──────────────────────────────────────────────
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
  const body = { padding: "20px 24px", flex: 1 };
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
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>Raise supplier PO</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Order {order?.order_number} · select line items + supplier + commercials
            </div>
          </div>
          <button onClick={onClose} style={btnGhost}>✕</button>
        </div>

        <div style={body}>

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
                <div></div>
                <div>Line</div>
                <div>Product</div>
                <div>Qty</div>
                <div>Your cost</div>
                <div>Subtotal</div>
              </div>

              {(orderItems || []).map(it => {
                const isAssigned = alreadyAssignedIds.has(it.id);
                const isSelected = lineSelections[it.id]?.selected;
                const cost = lineSelections[it.id]?.cost_per_unit || "";
                const subtotal = calcLineTotal(it.quantity, cost);

                return (
                  <div
                    key={it.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "30px 40px 2fr 1fr 1fr 1fr",
                      gap: 10,
                      padding: "10px",
                      background: isSelected ? "#E7F0FD" : isAssigned ? "#F5F5F5" : "white",
                      borderRadius: 6,
                      marginBottom: 4,
                      alignItems: "center",
                      opacity: isAssigned ? 0.5 : 1,
                      cursor: isAssigned ? "not-allowed" : "pointer"
                    }}
                    onClick={() => toggleLine(it.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected || false}
                      disabled={isAssigned}
                      readOnly
                      style={{ cursor: isAssigned ? "not-allowed" : "pointer" }}
                    />
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>#{it.line_number}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{it.product_name}</div>
                      {it.product_spec && <div style={{ fontSize: 11, color: C.muted }}>{it.product_spec}</div>}
                      {isAssigned && (
                        <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>Already in another supplier PO</div>
                      )}
                    </div>
                    <div style={{ fontSize: 13 }}>{it.quantity} {it.unit}</div>
                    <div onClick={e => e.stopPropagation()}>
                      <input
                        style={{ ...input, padding: "5px 8px", fontSize: 12 }}
                        type="number"
                        step="0.0001"
                        placeholder="0.00"
                        value={cost}
                        disabled={isAssigned || !isSelected}
                        onChange={e => updateLineCost(it.id, e.target.value)}
                      />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {cost ? fmtMoney(subtotal, currency) : "—"}
                    </div>
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
            <textarea
              style={{ ...input, minHeight: 60, fontFamily: "inherit", resize: "vertical" }}
              placeholder="Quality specs, packing requirements, special instructions…"
              value={notesToSupplier}
              onChange={e => setNotesToSupplier(e.target.value)}
            />
          </div>

          {/* ── Optional: upload supplier PO PDF ─────────────────────── */}
          <div style={{ marginBottom: 6 }}>
            <div style={sectionTitle}>Supplier PO PDF (optional)</div>
            <input style={{ ...input, padding: 6 }} type="file" accept=".pdf,.png,.jpg,.jpeg"
                   onChange={e => setPoFile(e.target.files?.[0] || null)} />
            {poFile && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                Selected: {poFile.name} ({(poFile.size / 1024).toFixed(0)} KB)
              </div>
            )}
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Upload the PO you generated externally (Word, Excel, etc.). Auto-PDF generation coming in v1.1.
            </div>
          </div>

          {error && (
            <div style={{ background: "#FEE", color: C.red, padding: "8px 12px", borderRadius: 7, fontSize: 12, marginTop: 12 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        <div style={footer}>
          <div style={{ fontSize: 12, color: C.muted }}>
            This will create a supplier PO and lock the selected items to it.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
            <button onClick={handleSubmit} style={btnPrimary} disabled={saving}>
              {saving ? "Saving…" : "✓ Save supplier PO"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
