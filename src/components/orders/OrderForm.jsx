import { useState, useMemo, useEffect } from "react";
import { C, PAYMENT_TERMS, UNITS } from "../../constants.js";
import { dbGet } from "../../utils.js";
import {
  CURRENCIES,
  SHIPMENT_ROUTES,
  fmtMoney,
  calcLineTotal,
  calcOrderTotal
} from "../../lib/orderUtils.js";

const blankLine = () => ({
  product_id: null,
  product_name: "",
  product_spec: "",
  quantity: "",
  unit: "kg",
  customer_unit_price: ""
});

/**
 * Convert one item from enquiries.products JSONB into our line item shape.
 *
 * Enquiry shape:    { name, qty, unit }
 * Line item shape:  { product_id, product_name, product_spec, quantity, unit, customer_unit_price }
 *
 * - `qty` can be a string like "25", "100", or "MOQ" — we parseFloat and fall back to "" if non-numeric.
 * - `product_id` is null unless we find a catalog product with a matching name.
 */
function mapEnquiryProductToLine(p, products) {
  const qtyNum = parseFloat(p.qty);
  const qtyValue = Number.isFinite(qtyNum) ? String(qtyNum) : "";
  const match = products.find(
    cp => cp.name?.trim().toLowerCase() === p.name?.trim().toLowerCase()
  );
  return {
    product_id: match?.id || null,
    product_name: p.name || "",
    product_spec: match?.short_description || "",
    quantity: qtyValue,
    unit: p.unit || "kg",
    customer_unit_price: ""
  };
}

export function OrderForm({ customers, enquiries, onClose, onSave }) {
  const [source, setSource] = useState("direct");
  const [enquiryId, setEnquiryId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerPoNumber, setCustomerPoNumber] = useState("");
  const [customerPoDate, setCustomerPoDate] = useState("");
  const [jobName, setJobName] = useState("");
  const [poFile, setPoFile] = useState(null);
  const [currency, setCurrency] = useState("USD");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [shipmentRoute, setShipmentRoute] = useState("direct_to_customer");
  const [shipToAddress, setShipToAddress] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [items, setItems] = useState([blankLine()]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dbGet("products").then(setProducts);
  }, []);

  const eligibleEnquiries = useMemo(() => {
    return (enquiries || []).filter(e => e.stage === "PO Received");
  }, [enquiries]);

  const selectedEnquiry = useMemo(() => {
    if (!enquiryId) return null;
    return eligibleEnquiries.find(e => String(e.id) === String(enquiryId)) || null;
  }, [enquiryId, eligibleEnquiries]);

  // Build the strict-mode list of allowed products (one entry per enquiry product)
  const enquiryProducts = useMemo(() => {
    if (!selectedEnquiry || !Array.isArray(selectedEnquiry.products)) return [];
    return selectedEnquiry.products.map((p, i) => {
      const match = products.find(
        cp => cp.name?.trim().toLowerCase() === p.name?.trim().toLowerCase()
      );
      return {
        idx: i,
        name: p.name,
        unit: p.unit,
        product_id: match?.id || null,
        short_description: match?.short_description || ""
      };
    });
  }, [selectedEnquiry, products]);

  function handleEnquirySelect(id) {
    setEnquiryId(id);
    const enq = eligibleEnquiries.find(e => String(e.id) === String(id));
    if (!enq) { setItems([blankLine()]); return; }
    if (enq.customer_id) setCustomerId(String(enq.customer_id));
    if (Array.isArray(enq.products) && enq.products.length > 0) {
      setItems(enq.products.map(p => mapEnquiryProductToLine(p, products)));
    } else {
      setItems([blankLine()]);
    }
  }

  function updateItem(idx, patch) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function addItem() {
    setItems(prev => [...prev, blankLine()]);
  }

  function removeItem(idx) {
    setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
  }

  // Product dropdown options depend on source
  function getProductOptionsForLine() {
    if (source === "enquiry" && selectedEnquiry) {
      // Strict: only enquiry products
      return enquiryProducts.map(ep => ({
        value: `enq-${ep.idx}`,
        label: ep.name,
        product_id: ep.product_id,
        name: ep.name,
        unit: ep.unit,
        short_description: ep.short_description
      }));
    }
    // Direct: full catalog + "type new"
    return [
      { value: "__new__", label: "— Type a new product name —", isNew: true },
      ...products.map(p => ({
        value: `cat-${p.id}`,
        label: p.name,
        product_id: p.id,
        name: p.name,
        unit: p.unit || "kg",
        short_description: p.short_description || ""
      }))
    ];
  }

  function handleProductSelect(idx, optValue) {
    const opts = getProductOptionsForLine();
    const opt = opts.find(o => o.value === optValue);
    if (!opt || opt.isNew) {
      updateItem(idx, { product_id: null, product_name: opt?.isNew ? "" : "" });
      return;
    }
    updateItem(idx, {
      product_id: opt.product_id || null,
      product_name: opt.name,
      product_spec: opt.short_description || "",
      unit: opt.unit || "kg"
    });
  }

  function getSelectedValueForLine(it) {
    if (source === "enquiry") {
      const i = enquiryProducts.findIndex(
        ep => ep.name?.trim().toLowerCase() === it.product_name?.trim().toLowerCase()
      );
      return i >= 0 ? `enq-${i}` : "";
    }
    if (it.product_id) return `cat-${it.product_id}`;
    if (it.product_name) return "__new__";
    return "";
  }

  const orderTotal = useMemo(() => calcOrderTotal(items), [items]);

  function validate() {
    if (source === "enquiry" && !enquiryId) return "Please select an enquiry.";
    if (!customerId) return "Please select a customer.";
    if (!customerPoNumber.trim()) return "Customer PO number is required.";
    if (items.length === 0) return "At least one line item is required.";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product_name?.trim()) return `Line ${i + 1}: product name is required.`;
      if (!it.quantity || parseFloat(it.quantity) <= 0) return `Line ${i + 1}: quantity must be greater than 0.`;
      if (!it.customer_unit_price || parseFloat(it.customer_unit_price) < 0) return `Line ${i + 1}: unit price is required.`;
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setSaving(true);

    try {
      const orderRow = {
        source,
        enquiry_id: source === "enquiry" && enquiryId ? parseInt(enquiryId) : null,
        customer_id: parseInt(customerId),
        customer_po_number: customerPoNumber.trim(),
        customer_po_date: customerPoDate || null,
        job_name: jobName.trim() || null,
        currency,
        payment_terms: paymentTerms,
        expected_delivery_date: expectedDelivery || null,
        shipment_route: shipmentRoute,
        ship_to_address: shipToAddress.trim() || null,
        internal_notes: internalNotes.trim() || null,
        status: "Received"
      };

      const itemRows = items.map((it, idx) => ({
        line_number: idx + 1,
        product_id: it.product_id || null,
        product_name: it.product_name.trim(),
        product_spec: it.product_spec?.trim() || null,
        quantity: parseFloat(it.quantity),
        unit: it.unit,
        customer_unit_price: parseFloat(it.customer_unit_price)
      }));

      const savedOrder = await onSave(orderRow, itemRows, poFile);
      if (savedOrder) onClose();
      else setError("Failed to save. Check the browser console for details.");
    } catch (e) {
      console.error(e);
      setError("Unexpected error. Check the browser console.");
    } finally {
      setSaving(false);
    }
  }

  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 20px", overflowY: "auto" };
  const modal = { background: C.card, borderRadius: 12, width: "100%", maxWidth: 920, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" };
  const header = { padding: "16px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" };
  const body = { padding: "20px 24px", flex: 1 };
  const footer = { padding: "12px 24px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bg, borderRadius: "0 0 12px 12px" };
  const sectionTitle = { fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 };
  const label = { fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4, display: "block" };
  const input = { width: "100%", padding: "8px 11px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, fontFamily: "inherit", background: C.white, color: C.ink, boxSizing: "border-box" };
  const required = { color: C.red, marginLeft: 2 };
  const btnPrimary = { background: C.blue, color: "white", border: 0, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 };
  const btnSecondary = { background: "transparent", color: C.ink, border: `1px solid ${C.border}`, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" };
  const btnGhost = { background: "transparent", color: C.muted, border: "none", padding: "4px 8px", fontSize: 13, cursor: "pointer" };
  const card = { background: C.bg, padding: 12, borderRadius: 8, marginBottom: 10, border: `1px solid ${C.border}` };

  const strictMode = source === "enquiry" && selectedEnquiry;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>New order</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {strictMode
                ? `Capturing PO for enquiry #${selectedEnquiry.id} — line items locked to enquiry products`
                : "Capture a customer PO — line items, file upload, commercials"}
            </div>
          </div>
          <button onClick={onClose} style={btnGhost}>✕</button>
        </div>

        <div style={body}>
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>Source</div>
            <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="radio" name="source" checked={source === "direct"} onChange={() => setSource("direct")} />
                Direct (PO received outside enquiry flow)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="radio" name="source" checked={source === "enquiry"} onChange={() => setSource("enquiry")} />
                From enquiry
              </label>
            </div>
            {source === "enquiry" && (
              <div style={{ marginTop: 10 }}>
                <label style={label}>Linked enquiry<span style={required}>*</span></label>
                <select style={input} value={enquiryId} onChange={e => handleEnquirySelect(e.target.value)}>
                  <option value="">Select enquiry (showing PO Received only)…</option>
                  {eligibleEnquiries.map(e => (
                    <option key={e.id} value={e.id}>
                      #{e.id} — {e.customer_name} ({e.country || "—"}) — {Array.isArray(e.products) ? e.products.length : 0} items
                    </option>
                  ))}
                </select>
                {eligibleEnquiries.length === 0 && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    No enquiries in "PO Received" stage yet.
                  </div>
                )}
                {strictMode && (
                  <div style={{ fontSize: 11, color: "#8E44AD", marginTop: 6, padding: "6px 10px", background: "#8E44AD11", borderRadius: 6 }}>
                    📋 Line items pre-filled from enquiry. Product dropdown restricted to {enquiryProducts.length} enquiry product{enquiryProducts.length === 1 ? "" : "s"}.
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>Customer & PO</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Customer<span style={required}>*</span></label>
                <select style={input} value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">Select customer…</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.company} {c.country ? `(${c.country})` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Customer PO number<span style={required}>*</span></label>
                <input style={input} value={customerPoNumber} onChange={e => setCustomerPoNumber(e.target.value)} placeholder="e.g. 2934" />
              </div>
              <div>
                <label style={label}>Customer PO date</label>
                <input style={input} type="date" value={customerPoDate} onChange={e => setCustomerPoDate(e.target.value)} />
              </div>
              <div>
                <label style={label}>Job / project name</label>
                <input style={input} value={jobName} onChange={e => setJobName(e.target.value)} placeholder="e.g. Skinny GLP" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Customer PO file (PDF)</label>
                <input style={{ ...input, padding: 6 }} type="file" accept=".pdf,.png,.jpg,.jpeg"
                       onChange={e => setPoFile(e.target.files?.[0] || null)} />
                {poFile && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    Selected: {poFile.name} ({(poFile.size / 1024).toFixed(0)} KB)
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>Commercials</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Currency<span style={required}>*</span></label>
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
                <label style={label}>Expected delivery</label>
                <input style={input} type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} />
              </div>
              <div>
                <label style={label}>Shipment route</label>
                <select style={input} value={shipmentRoute} onChange={e => setShipmentRoute(e.target.value)}>
                  {SHIPMENT_ROUTES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Ship-to address</label>
                <input style={input} value={shipToAddress} onChange={e => setShipToAddress(e.target.value)}
                       placeholder="e.g. 5060 S Charleston Pike, Springfield, OH 45502, USA" />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ ...sectionTitle, marginBottom: 0 }}>
                Line items <span style={{ color: C.muted, fontWeight: 400 }}>({items.length})</span>
              </div>
              {!strictMode && (
                <button type="button" onClick={addItem} style={{ ...btnSecondary, padding: "5px 10px", fontSize: 12 }}>
                  + Add line item
                </button>
              )}
            </div>

            {items.map((it, idx) => {
              const options = getProductOptionsForLine();
              const selectedValue = getSelectedValueForLine(it);
              return (
                <div key={idx} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Line {idx + 1}</div>
                    {!strictMode && items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} style={{ ...btnGhost, color: C.red }}>Remove</button>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.7fr 1fr 1.2fr", gap: 8 }}>
                    <div>
                      <label style={label}>Product<span style={required}>*</span></label>
                      <select
                        style={{ ...input, marginBottom: 6 }}
                        value={selectedValue}
                        onChange={e => handleProductSelect(idx, e.target.value)}
                      >
                        <option value="">{strictMode ? "Select an enquiry product…" : "Pick from catalog or type new..."}</option>
                        {options.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {!strictMode && (!it.product_id) && (
                        <input
                          style={{ ...input, fontSize: 12 }}
                          placeholder="Product name (free text)"
                          value={it.product_name}
                          onChange={e => updateItem(idx, { product_name: e.target.value })}
                        />
                      )}
                      {strictMode && it.product_name && (
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{it.product_name}</div>
                      )}
                    </div>
                    <div>
                      <label style={label}>Qty<span style={required}>*</span></label>
                      <input style={input} type="number" step="0.001" value={it.quantity}
                             onChange={e => updateItem(idx, { quantity: e.target.value })} />
                    </div>
                    <div>
                      <label style={label}>Unit</label>
                      <select style={input} value={it.unit} onChange={e => updateItem(idx, { unit: e.target.value })}>
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={label}>Unit price ({currency})<span style={required}>*</span></label>
                      <input style={input} type="number" step="0.0001" value={it.customer_unit_price}
                             onChange={e => updateItem(idx, { customer_unit_price: e.target.value })} />
                    </div>
                    <div>
                      <label style={label}>Line total</label>
                      <div style={{ ...input, background: C.white, fontWeight: 600, color: C.ink, paddingTop: 9 }}>
                        {fmtMoney(calcLineTotal(it.quantity, it.customer_unit_price), currency)}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <label style={label}>Spec (optional)</label>
                    <input style={input} placeholder="e.g. 25% IgG, 95% Curcuminoids, USP grade…"
                           value={it.product_spec} onChange={e => updateItem(idx, { product_spec: e.target.value })} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginBottom: 6 }}>
            <div style={sectionTitle}>Internal notes</div>
            <textarea
              style={{ ...input, minHeight: 60, fontFamily: "inherit", resize: "vertical" }}
              placeholder="Any context for the team — special requirements, customer relationship notes, etc."
              value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
            />
          </div>

          {error && (
            <div style={{ background: "#FEE", color: C.red, padding: "8px 12px", borderRadius: 7, fontSize: 12, marginTop: 12 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        <div style={footer}>
          <div style={{ fontSize: 13, color: C.ink }}>
            <span style={{ color: C.muted, fontSize: 12 }}>Order total:</span>{" "}
            <strong style={{ fontSize: 16 }}>{fmtMoney(orderTotal, currency)}</strong>{" "}
            <span style={{ color: C.muted, fontSize: 11 }}>{currency}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
            <button onClick={handleSubmit} style={btnPrimary} disabled={saving}>
              {saving ? "Saving…" : "✓ Save order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
