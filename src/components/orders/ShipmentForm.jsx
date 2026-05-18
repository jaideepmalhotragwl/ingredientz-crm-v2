import { useState } from "react";
import { C } from "../../constants.js";
import { SHIPMENT_STATUSES } from "../../lib/orderUtils.js";

/**
 * Log a shipment event for the order.
 *
 * Props:
 *  - order: parent order
 *  - supplierPOs: optional, lets user link the shipment to a supplier PO
 *  - existing: if editing an existing shipment, pre-fill from this row
 *  - onClose, onSave
 */
export function ShipmentForm({ order, supplierPOs, existing, onClose, onSave }) {
  const [supplierPOId, setSupplierPOId] = useState(existing?.supplier_po_id ? String(existing.supplier_po_id) : "");
  const [carrier, setCarrier] = useState(existing?.carrier || "");
  const [trackingNumber, setTrackingNumber] = useState(existing?.tracking_number || "");
  const [shippedDate, setShippedDate] = useState(existing?.shipped_date || "");
  const [estimatedArrival, setEstimatedArrival] = useState(existing?.estimated_arrival || "");
  const [actualArrival, setActualArrival] = useState(existing?.actual_arrival || "");
  const [originLocation, setOriginLocation] = useState(existing?.origin_location || "");
  const [destinationLocation, setDestinationLocation] = useState(existing?.destination_location || order?.ship_to_address || "");
  const [status, setStatus] = useState(existing?.status || "preparing");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function validate() {
    if (!carrier.trim()) return "Carrier is required.";
    if (!status) return "Status is required.";
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
        supplier_po_id: supplierPOId ? parseInt(supplierPOId) : null,
        carrier: carrier.trim(),
        tracking_number: trackingNumber.trim() || null,
        shipped_date: shippedDate || null,
        estimated_arrival: estimatedArrival || null,
        actual_arrival: actualArrival || null,
        origin_location: originLocation.trim() || null,
        destination_location: destinationLocation.trim() || null,
        status,
        notes: notes.trim() || null
      };

      const result = await onSave(row, existing?.id);
      if (result) onClose();
      else setError("Failed to save shipment.");
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
              {existing ? "Update shipment" : "Log shipment"}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Carrier, tracking, dates, route
            </div>
          </div>
          <button onClick={onClose} style={btnGhost}>✕</button>
        </div>

        <div style={body}>
          {(supplierPOs || []).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Linked supplier PO (optional)</label>
              <select style={input} value={supplierPOId} onChange={e => setSupplierPOId(e.target.value)}>
                <option value="">— Not specific to one supplier PO —</option>
                {supplierPOs.map(po => (
                  <option key={po.id} value={po.id}>{po.supplier_po_number}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>Carrier<span style={required}>*</span></label>
              <input style={input} placeholder="DHL, FedEx, Maersk…"
                     value={carrier} onChange={e => setCarrier(e.target.value)} />
            </div>
            <div>
              <label style={label}>Tracking number</label>
              <input style={input} value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
            </div>
            <div>
              <label style={label}>Shipped date</label>
              <input style={input} type="date" value={shippedDate} onChange={e => setShippedDate(e.target.value)} />
            </div>
            <div>
              <label style={label}>Status<span style={required}>*</span></label>
              <select style={input} value={status} onChange={e => setStatus(e.target.value)}>
                {SHIPMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Estimated arrival</label>
              <input style={input} type="date" value={estimatedArrival} onChange={e => setEstimatedArrival(e.target.value)} />
            </div>
            <div>
              <label style={label}>Actual arrival</label>
              <input style={input} type="date" value={actualArrival} onChange={e => setActualArrival(e.target.value)} />
            </div>
            <div>
              <label style={label}>Origin</label>
              <input style={input} value={originLocation} onChange={e => setOriginLocation(e.target.value)}
                     placeholder="e.g. Mumbai, IN" />
            </div>
            <div>
              <label style={label}>Destination</label>
              <input style={input} value={destinationLocation} onChange={e => setDestinationLocation(e.target.value)}
                     placeholder="e.g. New Jersey, US" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={label}>Notes</label>
              <textarea style={{ ...input, minHeight: 50, fontFamily: "inherit", resize: "vertical" }}
                        value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Customs notes, delays, special handling…" />
            </div>
          </div>

          {error && (
            <div style={{ background: "#FEE", color: C.red, padding: "8px 12px", borderRadius: 7, fontSize: 12 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        <div style={footer}>
          <div></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
            <button onClick={handleSubmit} style={btnPrimary} disabled={saving}>
              {saving ? "Saving…" : "✓ Save shipment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
