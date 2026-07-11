import { useState, useMemo, useEffect } from "react";
import { C } from "../constants.js";
import { fmtDate } from "../utils.js";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  SUPPLIER_PO_STATUS_COLORS,
  INVOICE_STATUS_COLORS,
  SHIPMENT_STATUS_COLORS,
  fmtMoney,
  getRouteLabel,
  getSourceLabel,
  getSourceColor
} from "../lib/orderUtils.js";
import { SupplierPOForm }  from "./orders/SupplierPOForm.jsx";
import { InvoiceForm }     from "./orders/InvoiceForm.jsx";
import { PaymentForm }     from "./orders/PaymentForm.jsx";
import { ShipmentForm }    from "./orders/ShipmentForm.jsx";
import { DocumentTrail }   from "./DocumentTrail.jsx";
const TABS = [
  { id: "items",     label: "Items & suppliers" },
  { id: "documents", label: "Documents" },
  { id: "payments",  label: "Payments" },
  { id: "shipments", label: "Shipments" },
  { id: "activity",  label: "Activity" }
];
const SUPPLIER_PO_COLORS = ["#1877F2", "#42B72A", "#F5A623", "#8E44AD", "#E74C3C", "#16A085", "#E67E22", "#34495E"];
export function OrderDrawer({
  order, orderItems, supplierPOs, supplierPOItems, invoices, payments, shipments, statusHistory,
  customers, suppliers,
  onClose, onStatusChange,
  onAddSupplierPO, onAddInvoice, onAddPayment, onAddShipment, onUpdateShipment
}) {
  const [activeTab, setActiveTab] = useState("items");
  const [showSupplierPOForm, setShowSupplierPOForm] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(null); // 'customer' | 'supplier' | null
  const [showPaymentForm, setShowPaymentForm] = useState(null); // 'customer_payment_in' | 'supplier_payment_out' | null
  const [showShipmentForm, setShowShipmentForm] = useState(false);
  const [editingShipment, setEditingShipment] = useState(null);
  if (!order) return null;
  // ── Computed values ──────────────────────────────────────────────────────
  const customer = customers?.find(c => c.id === order.customer_id);
  const orderItemsForThisOrder = useMemo(
    () => (orderItems || []).filter(it => it.order_id === order.id).sort((a, b) => a.line_number - b.line_number),
    [orderItems, order.id]
  );
  const supplierPOsForThisOrder = useMemo(
    () => (supplierPOs || []).filter(po => po.order_id === order.id),
    [supplierPOs, order.id]
  );
  const supplierPOItemsForThisOrder = useMemo(() => {
    const poIds = supplierPOsForThisOrder.map(po => po.id);
    return (supplierPOItems || []).filter(pi => poIds.includes(pi.supplier_po_id));
  }, [supplierPOItems, supplierPOsForThisOrder]);
  const invoicesForThisOrder = useMemo(
    () => (invoices || []).filter(inv => inv.order_id === order.id),
    [invoices, order.id]
  );
  const paymentsForThisOrder = useMemo(
    () => (payments || []).filter(p => p.order_id === order.id),
    [payments, order.id]
  );
  const shipmentsForThisOrder = useMemo(
    () => (shipments || []).filter(s => s.order_id === order.id),
    [shipments, order.id]
  );
  const statusHistoryForThisOrder = useMemo(
    () => (statusHistory || []).filter(h => h.order_id === order.id).sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at)),
    [statusHistory, order.id]
  );
  // Map: supplier_po_id -> color
  const supplierPOColorMap = useMemo(() => {
    const m = {};
    supplierPOsForThisOrder.forEach((po, idx) => {
      m[po.id] = SUPPLIER_PO_COLORS[idx % SUPPLIER_PO_COLORS.length];
    });
    return m;
  }, [supplierPOsForThisOrder]);
  // Map: order_item_id -> supplier_po (or null if unassigned)
  const itemToSupplierPO = useMemo(() => {
    const m = {};
    supplierPOItemsForThisOrder.forEach(pi => {
      const po = supplierPOsForThisOrder.find(p => p.id === pi.supplier_po_id);
      if (po) m[pi.order_item_id] = { ...pi, po };
    });
    return m;
  }, [supplierPOItemsForThisOrder, supplierPOsForThisOrder]);
  // Money in / money out totals
  const totalIn = paymentsForThisOrder
    .filter(p => p.payment_type === "customer_payment_in")
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const totalOut = paymentsForThisOrder
    .filter(p => p.payment_type === "supplier_payment_out")
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const customerInvoiced = invoicesForThisOrder
    .filter(i => i.invoice_type === "customer")
    .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
  const supplierInvoiced = invoicesForThisOrder
    .filter(i => i.invoice_type === "supplier")
    .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
  // ── Styles ───────────────────────────────────────────────────────────────
  const overlay = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100,
    display: "flex", justifyContent: "flex-end"
  };
  const drawer = {
    width: "min(1000px, 92vw)", height: "100vh", background: C.bg,
    display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.2)"
  };
  const header = {
    background: C.card, padding: "18px 24px", borderBottom: `1px solid ${C.border}`,
    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16
  };
  const btnGhost = {
    background: "transparent", color: C.muted, border: "none",
    padding: "4px 10px", fontSize: 16, cursor: "pointer"
  };
  const pill = (color) => ({
    fontSize: 11, padding: "3px 9px", borderRadius: 99, fontWeight: 600,
    background: `${color}22`, color, display: "inline-block"
  });
  const tabBtn = (active) => ({
    padding: "10px 16px", background: "transparent", border: "none",
    fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? C.blue : C.muted, cursor: "pointer",
    borderBottom: active ? `2px solid ${C.blue}` : "2px solid transparent",
    marginBottom: -1
  });
  const card = {
    background: C.card, borderRadius: 10, border: `1px solid ${C.border}`,
    padding: 16, marginBottom: 12
  };
  const btnPrimary = {
    background: C.blue, color: "white", border: 0,
    padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer"
  };
  const btnSecondary = {
    background: "transparent", color: C.ink, border: `1px solid ${C.border}`,
    padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer"
  };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={drawer} onClick={e => e.stopPropagation()}>
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={header}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: C.ink }}>
                {order.order_number}
              </span>
              <span style={pill(getSourceColor(order.source))}>{getSourceLabel(order.source)}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
              {customer?.company || "—"} {customer?.country && <span style={{ color: C.muted, fontSize: 13, fontWeight: 400 }}>· {customer.country}</span>}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Customer PO: <strong>{order.customer_po_number || "—"}</strong>
              {order.customer_po_date && <span> · {fmtDate(order.customer_po_date)}</span>}
              {order.job_name && <span> · {order.job_name}</span>}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <select
              value={order.status}
              onChange={e => onStatusChange(order.id, e.target.value)}
              style={{
                padding: "6px 12px", border: `2px solid ${ORDER_STATUS_COLORS[order.status] || C.muted}`,
                borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: `${ORDER_STATUS_COLORS[order.status] || C.muted}11`,
                color: ORDER_STATUS_COLORS[order.status] || C.ink,
                cursor: "pointer"
              }}
            >
              {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={onClose} style={btnGhost}>✕</button>
          </div>
        </div>
        {/* ── Stat strip ──────────────────────────────────────────────────── */}
        <div style={{ background: C.card, padding: "10px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 32 }}>
          <Stat label="Order value" value={`${fmtMoney(order.total_amount, order.currency)} ${order.currency}`} />
          <Stat label="Payment terms" value={order.payment_terms || "—"} />
          <Stat label="Expected delivery" value={order.expected_delivery_date ? fmtDate(order.expected_delivery_date) : "—"} />
          <Stat label="Shipment route" value={getRouteLabel(order.shipment_route)} />
          <Stat label="Money in / out" value={`${fmtMoney(totalIn, order.currency)} / ${fmtMoney(totalOut, order.currency)}`} />
        </div>
        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div style={{ background: C.card, padding: "0 24px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} style={tabBtn(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {/* ─── Items & Suppliers tab ─── */}
          {activeTab === "items" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                  Line items ({orderItemsForThisOrder.length}) · {supplierPOsForThisOrder.length} supplier PO{supplierPOsForThisOrder.length === 1 ? "" : "s"}
                </div>
                <button style={btnPrimary} onClick={() => setShowSupplierPOForm(true)}>+ Raise supplier PO</button>
              </div>
              <div style={card}>
                {orderItemsForThisOrder.length === 0 ? (
                  <div style={{ color: C.muted, fontSize: 12, padding: 12 }}>No line items.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: C.bg }}>
                        <Th>Line</Th>
                        <Th>Product</Th>
                        <Th>Qty</Th>
                        <Th>Unit price</Th>
                        <Th>Line total</Th>
                        <Th>Supplier PO</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItemsForThisOrder.map(it => {
                        const assignment = itemToSupplierPO[it.id];
                        const poColor = assignment ? supplierPOColorMap[assignment.po.id] : C.muted;
                        return (
                          <tr key={it.id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <Td style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>#{it.line_number}</Td>
                            <Td>
                              <div style={{ fontWeight: 500 }}>{it.product_name}</div>
                              {it.product_spec && <div style={{ fontSize: 11, color: C.muted }}>{it.product_spec}</div>}
                            </Td>
                            <Td>{it.quantity} {it.unit}</Td>
                            <Td>{fmtMoney(it.customer_unit_price, order.currency)}</Td>
                            <Td style={{ fontWeight: 600 }}>{fmtMoney(it.line_total, order.currency)}</Td>
                            <Td>
                              {assignment ? (
                                <span style={{
                                  ...pill(poColor),
                                  fontFamily: "monospace", fontSize: 10
                                }}>
                                  {assignment.po.supplier_po_number}
                                </span>
                              ) : (
                                <span style={{ color: C.muted, fontSize: 11, fontStyle: "italic" }}>Unassigned</span>
                              )}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {supplierPOsForThisOrder.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 8px" }}>
                    Supplier POs
                  </div>
                  {supplierPOsForThisOrder.map(po => {
                    const supplier = suppliers?.find(s => s.id === po.supplier_id);
                    const linkedItems = supplierPOItemsForThisOrder.filter(pi => pi.supplier_po_id === po.id);
                    const poColor = supplierPOColorMap[po.id];
                    return (
                      <div key={po.id} style={{ ...card, borderLeft: `4px solid ${poColor}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.ink }}>
                              {po.supplier_po_number}
                            </div>
                            <div style={{ fontSize: 13, color: C.ink, marginTop: 2 }}>
                              {supplier?.company || "—"} {supplier?.country && <span style={{ color: C.muted, fontSize: 11 }}>· {supplier.country}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <span style={pill(SUPPLIER_PO_STATUS_COLORS[po.status] || C.muted)}>{po.status}</span>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMoney(po.total_amount, po.currency)} {po.currency}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                          {linkedItems.length} line item{linkedItems.length === 1 ? "" : "s"}
                          {po.payment_terms && <span> · {po.payment_terms}</span>}
                          {po.incoterms && <span> · {po.incoterms}</span>}
                          {po.expected_ship_date && <span> · Ships {fmtDate(po.expected_ship_date)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
          {/* ─── Documents tab (stage-by-stage trail) ─── */}
          {activeTab === "documents" && (
            <DocumentTrail
              order={order}
              supplierPOs={supplierPOsForThisOrder}
              invoices={invoicesForThisOrder}
              suppliers={suppliers}
            />
          )}
          {/* ─── Payments tab ─── */}
          {activeTab === "payments" && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button style={btnPrimary} onClick={() => setShowInvoiceForm("customer")}>+ Customer invoice</button>
                <button style={btnSecondary} onClick={() => setShowInvoiceForm("supplier")}>+ Supplier invoice</button>
                <button style={btnSecondary} onClick={() => setShowPaymentForm("customer_payment_in")}>+ Payment received</button>
                <button style={btnSecondary} onClick={() => setShowPaymentForm("supplier_payment_out")}>+ Payment sent</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <Metric label="Customer invoiced" value={`${fmtMoney(customerInvoiced, order.currency)} ${order.currency}`} sub={`Received: ${fmtMoney(totalIn, order.currency)}`} />
                <Metric label="Supplier invoiced" value={`${fmtMoney(supplierInvoiced, order.currency)} ${order.currency}`} sub={`Paid: ${fmtMoney(totalOut, order.currency)}`} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, margin: "8px 0" }}>Invoices ({invoicesForThisOrder.length})</div>
              {invoicesForThisOrder.length === 0 ? (
                <div style={{ ...card, color: C.muted, fontSize: 12, padding: 20, textAlign: "center" }}>No invoices yet.</div>
              ) : (
                invoicesForThisOrder.map(inv => (
                  <div key={inv.id} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {inv.invoice_type === "customer" ? "→ Customer" : "← Supplier"} · {inv.invoice_number}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                          {fmtDate(inv.invoice_date)} {inv.due_date && <span>· Due {fmtDate(inv.due_date)}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMoney(inv.amount, inv.currency)}</div>
                        <span style={pill(INVOICE_STATUS_COLORS[inv.status] || C.muted)}>{inv.status}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 8px" }}>Payments ({paymentsForThisOrder.length})</div>
              {paymentsForThisOrder.length === 0 ? (
                <div style={{ ...card, color: C.muted, fontSize: 12, padding: 20, textAlign: "center" }}>No payments logged.</div>
              ) : (
                paymentsForThisOrder.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)).map(p => (
                  <div key={p.id} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: p.payment_type === "customer_payment_in" ? C.green : C.red }}>
                          {p.payment_type === "customer_payment_in" ? "↓ Received" : "↑ Sent"}
                          {p.payment_method && <span style={{ color: C.muted, fontWeight: 400 }}> via {p.payment_method}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                          {fmtDate(p.payment_date)} {p.bank_reference && <span>· Ref: {p.bank_reference}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: p.payment_type === "customer_payment_in" ? C.green : C.red }}>
                        {p.payment_type === "customer_payment_in" ? "+" : "−"}{fmtMoney(p.amount, p.currency)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
          {/* ─── Shipments tab ─── */}
          {activeTab === "shipments" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Shipments ({shipmentsForThisOrder.length})</div>
                <button style={btnPrimary} onClick={() => { setEditingShipment(null); setShowShipmentForm(true); }}>+ Log shipment</button>
              </div>
              {shipmentsForThisOrder.length === 0 ? (
                <div style={{ ...card, color: C.muted, fontSize: 12, padding: 20, textAlign: "center" }}>No shipments logged yet.</div>
              ) : (
                shipmentsForThisOrder.map(s => (
                  <div key={s.id} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{s.carrier}</div>
                        {s.tracking_number && (
                          <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginTop: 2 }}>{s.tracking_number}</div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <span style={pill(SHIPMENT_STATUS_COLORS[s.status] || C.muted)}>{s.status}</span>
                        <button onClick={() => { setEditingShipment(s); setShowShipmentForm(true); }} style={{ ...btnGhost, fontSize: 11, padding: "2px 8px" }}>Edit</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {s.origin_location && <span>{s.origin_location} → </span>}
                      {s.destination_location || "—"}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                      {s.shipped_date && <span>Shipped: {fmtDate(s.shipped_date)} </span>}
                      {s.estimated_arrival && <span>· ETA: {fmtDate(s.estimated_arrival)} </span>}
                      {s.actual_arrival && <span>· Arrived: {fmtDate(s.actual_arrival)}</span>}
                    </div>
                    {s.notes && <div style={{ fontSize: 12, color: C.ink, marginTop: 6, fontStyle: "italic" }}>{s.notes}</div>}
                  </div>
                ))
              )}
            </>
          )}
          {/* ─── Activity tab ─── */}
          {activeTab === "activity" && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 10 }}>Status history</div>
              {statusHistoryForThisOrder.length === 0 ? (
                <div style={{ ...card, color: C.muted, fontSize: 12, padding: 20, textAlign: "center" }}>No status changes yet.</div>
              ) : (
                statusHistoryForThisOrder.map(h => (
                  <div key={h.id} style={{ ...card, padding: 12 }}>
                    <div style={{ fontSize: 13 }}>
                      <span style={pill(ORDER_STATUS_COLORS[h.from_status] || C.muted)}>{h.from_status || "—"}</span>
                      <span style={{ margin: "0 8px", color: C.muted }}>→</span>
                      <span style={pill(ORDER_STATUS_COLORS[h.to_status] || C.muted)}>{h.to_status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                      {fmtDate(h.changed_at)} {h.notes && <span>· {h.notes}</span>}
                    </div>
                  </div>
                ))
              )}
              <div style={{ fontSize: 11, color: C.muted, marginTop: 16, fontStyle: "italic", padding: "0 4px" }}>
                Created {fmtDate(order.created_at)}
                {order.updated_at && order.updated_at !== order.created_at && (
                  <span> · Last updated {fmtDate(order.updated_at)}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {/* ── Sub-modals ──────────────────────────────────────────────────────── */}
      {showSupplierPOForm && (
        <SupplierPOForm
          order={order}
          orderItems={orderItemsForThisOrder}
          suppliers={suppliers}
          existingPOItems={supplierPOItemsForThisOrder}
          onClose={() => setShowSupplierPOForm(false)}
          onSave={onAddSupplierPO}
        />
      )}
      {showInvoiceForm && (
        <InvoiceForm
          order={order}
          invoiceType={showInvoiceForm}
          supplierPOs={supplierPOsForThisOrder}
          orderItems={orderItemsForThisOrder}
          customer={customer}
          onClose={() => setShowInvoiceForm(null)}
          onSave={onAddInvoice}
        />
      )}
      {showPaymentForm && (
        <PaymentForm
          order={order}
          paymentType={showPaymentForm}
          invoices={invoicesForThisOrder}
          supplierPOs={supplierPOsForThisOrder}
          onClose={() => setShowPaymentForm(null)}
          onSave={onAddPayment}
        />
      )}
      {showShipmentForm && (
        <ShipmentForm
          order={order}
          supplierPOs={supplierPOsForThisOrder}
          existing={editingShipment}
          onClose={() => { setShowShipmentForm(false); setEditingShipment(null); }}
          onSave={editingShipment ? onUpdateShipment : onAddShipment}
        />
      )}
    </div>
  );
}
// ── Sub-components ─────────────────────────────────────────────────────────────
function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
function Th({ children }) {
  return <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{children}</th>;
}
function Td({ children, style = {} }) {
  return <td style={{ padding: "10px", fontSize: 12, ...style }}>{children}</td>;
}
function Metric({ label, value, sub }) {
  return (
    <div style={{ background: C.card, padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
