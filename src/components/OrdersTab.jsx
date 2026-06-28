import { useState, useMemo } from "react";
import { C } from "../constants.js";
import { fmtDate } from "../utils.js";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  fmtMoney,
  fmtMoneyShort,
  getSourceLabel,
  getSourceColor
} from "../lib/orderUtils.js";

// ── FX: USD-equivalent rates. Update these as rates move. ───────────────────
// (1 unit of the currency = this many USD)
const FX = { USD: 1, EUR: 1.08, INR: 0.0117 };
function toUSD(amount, currency) {
  const r = FX[(currency || "USD").toUpperCase()] ?? 1;
  return (parseFloat(amount) || 0) * r;
}

export function OrdersTab({ orders, customers, onSelect, onNew }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [customerFilter, setCustomerFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");

  // ── Metrics ───────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    // Order book = every order except Cancelled, summed currency-aware.
    const book = orders.filter(o => o.status !== "Cancelled");
    const byCur = {};
    let bookUSD = 0;
    book.forEach(o => {
      const cur = (o.currency || "USD").toUpperCase();
      const amt = parseFloat(o.total_amount) || 0;
      byCur[cur] = (byCur[cur] || 0) + amt;
      bookUSD += toUSD(amt, cur);
    });

    const active = orders.filter(o => !["Delivered", "Cancelled"].includes(o.status));
    const awaitingUSD = orders
      .filter(o => ["Invoiced", "Confirmed", "Suppliers Assigned"].includes(o.status))
      .reduce((sum, o) => sum + toUSD(o.total_amount, o.currency), 0);
    const inTransit = orders.filter(o => o.status === "Shipped").length;

    return { active: active.length, awaitingUSD, inTransit, bookUSD, byCur };
  }, [orders]);

  const converted = Object.keys(metrics.byCur).some(c => c !== "USD");
  const curBreakdown = Object.entries(metrics.byCur)
    .map(([c, v]) => `${c} ${Math.round(v).toLocaleString()}`)
    .join("  ·  ");

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (statusFilter !== "All" && o.status !== statusFilter) return false;
      if (sourceFilter !== "All" && o.source !== sourceFilter.toLowerCase()) return false;
      if (customerFilter !== "All" && String(o.customer_id) !== String(customerFilter)) return false;
      if (search) {
        const s = search.toLowerCase();
        const cust = customers.find(c => c.id === o.customer_id);
        const hay = `${o.order_number} ${o.customer_po_number || ""} ${cust?.company || ""} ${o.job_name || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter, customerFilter, sourceFilter, customers]);

  function getCustomerName(id) {
    return customers.find(c => c.id === id)?.company || "—";
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const card = { background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16 };
  const inputStyle = {
    padding: "8px 12px",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "inherit",
    background: C.white,
    color: C.ink
  };
  const btnPrimary = {
    background: C.blue, color: "white", border: 0,
    padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6
  };
  const pill = (color) => ({
    fontSize: 11, padding: "3px 9px", borderRadius: 99, fontWeight: 600,
    background: `${color}22`, color: color, display: "inline-block"
  });

  return (
    <div>
      {/* Metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
        <Metric label="Active orders" value={metrics.active} />
        <Metric label="Awaiting payment" value={fmtMoneyShort(metrics.awaitingUSD)} />
        <Metric label="In transit" value={metrics.inTransit} />
        <Metric
          label="Order book (all orders)"
          value={
            <span style={{ display: "block" }}>
              <span>{converted ? "≈ " : ""}{fmtMoneyShort(metrics.bookUSD)}</span>
              {Object.keys(metrics.byCur).length > 1 && (
                <span style={{ display: "block", fontSize: 10, color: C.muted, fontWeight: 500, marginTop: 3, letterSpacing: 0 }}>
                  {curBreakdown}
                </span>
              )}
            </span>
          }
        />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          placeholder="Search by order #, customer, PO #..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={inputStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option>All</option>
          {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select style={inputStyle} value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
          <option value="All">All customers</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
        </select>
        <select style={inputStyle} value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option>All</option>
          <option value="enquiry">From enquiry</option>
          <option value="direct">Direct</option>
        </select>
        <button style={btnPrimary} onClick={onNew}>+ New order</button>
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>
            {orders.length === 0
              ? "No orders yet. Click + New order to add your first PO."
              : "No orders match the current filters."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <Th>Order #</Th>
                <Th>Customer</Th>
                <Th>Customer PO</Th>
                <Th>Value</Th>
                <Th>Source</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr
                  key={o.id}
                  onClick={() => onSelect(o)}
                  style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Td>
                    <span style={{ fontFamily: "monospace", fontSize: 12 }}>{o.order_number}</span>
                  </Td>
                  <Td>{getCustomerName(o.customer_id)}</Td>
                  <Td style={{ color: C.muted }}>{o.customer_po_number || "—"}</Td>
                  <Td>{fmtMoney(o.total_amount, o.currency)}</Td>
                  <Td>
                    <span style={pill(getSourceColor(o.source))}>{getSourceLabel(o.source)}</span>
                  </Td>
                  <Td>
                    <span style={pill(ORDER_STATUS_COLORS[o.status] || C.muted)}>{o.status}</span>
                  </Td>
                  <Td style={{ color: C.muted, fontSize: 12 }}>{fmtDate(o.updated_at || o.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginTop: 10, textAlign: "right" }}>
        Showing {filtered.length} of {orders.length} orders
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 16px" }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>{value}</div>
    </div>
  );
}

function Th({ children }) {
  return (
    <th style={{
      textAlign: "left", padding: "10px 14px", fontWeight: 600,
      fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5
    }}>{children}</th>
  );
}

function Td({ children, style = {} }) {
  return <td style={{ padding: "12px 14px", ...style }}>{children}</td>;
}
