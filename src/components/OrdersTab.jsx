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
// Owner of the order. NOTE: created_by is a bigint user id, not a name —
// it must NOT be used as a display fallback or you get a number in the cell.
const ownerOf = o => (o.owner || o.assigned_to || "").trim();
export function OrdersTab({ orders, customers, users = [], onSelect, onNew, onUpdateOrder }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [customerFilter, setCustomerFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [showArchived, setShowArchived] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [sort, setSort] = useState({ k: "customer_po_date", d: -1 });  // default: newest PO first
  // Archived orders are hidden everywhere unless explicitly shown.
  const liveOrders = useMemo(
    () => orders.filter(o => showArchived ? !!o.archived_at : !o.archived_at),
    [orders, showArchived]
  );
  const archivedCount = useMemo(() => orders.filter(o => !!o.archived_at).length, [orders]);
  const unattributedCount = useMemo(
    () => orders.filter(o => !o.archived_at && !ownerOf(o)).length,
    [orders]
  );
  const activeUsers = useMemo(
    () => (users || []).filter(u => u.active !== false && u.name)
      .slice().sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );
  // ── Metrics (archived excluded) ───────────────────────────────────────────
  const metrics = useMemo(() => {
    const live = orders.filter(o => !o.archived_at);
    const book = live.filter(o => o.status !== "Cancelled");
    const byCur = {};
    let bookUSD = 0;
    book.forEach(o => {
      const cur = (o.currency || "USD").toUpperCase();
      const amt = parseFloat(o.total_amount) || 0;
      byCur[cur] = (byCur[cur] || 0) + amt;
      bookUSD += toUSD(amt, cur);
    });
    const active = live.filter(o => !["Delivered", "Cancelled"].includes(o.status));
    const awaitingUSD = live
      .filter(o => ["Invoiced", "Confirmed", "Suppliers Assigned"].includes(o.status))
      .reduce((sum, o) => sum + toUSD(o.total_amount, o.currency), 0);
    const inTransit = live.filter(o => o.status === "Shipped").length;
    return { active: active.length, awaitingUSD, inTransit, bookUSD, byCur };
  }, [orders]);
  const converted = Object.keys(metrics.byCur).some(c => c !== "USD");
  const curBreakdown = Object.entries(metrics.byCur)
    .map(([c, v]) => `${c} ${Math.round(v).toLocaleString()}`)
    .join("  ·  ");
  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const rows = liveOrders.filter(o => {
      if (statusFilter !== "All" && o.status !== statusFilter) return false;
      if (sourceFilter !== "All" && o.source !== sourceFilter.toLowerCase()) return false;
      if (customerFilter !== "All" && String(o.customer_id) !== String(customerFilter)) return false;
      if (ownerFilter === "(unassigned)" && ownerOf(o)) return false;
      if (ownerFilter !== "All" && ownerFilter !== "(unassigned)" && ownerOf(o) !== ownerFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const cust = customers.find(c => c.id === o.customer_id);
        const hay = `${o.order_number} ${o.customer_po_number || ""} ${cust?.company || ""} ${o.job_name || ""} ${ownerOf(o)}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    const cust = id => customers.find(c => c.id === id)?.company || "";
    return rows.sort((a, b) => {
      let va, vb;
      if (sort.k === "value") { va = toUSD(a.total_amount, a.currency); vb = toUSD(b.total_amount, b.currency); }
      else if (sort.k === "customer") { va = cust(a.customer_id); vb = cust(b.customer_id); }
      else if (sort.k === "owner") { va = ownerOf(a); vb = ownerOf(b); }
      else { va = a[sort.k] ?? ""; vb = b[sort.k] ?? ""; }
      if (typeof va === "number") return (va - vb) * sort.d;
      // dates & strings — empty values sink to the bottom
      if (!va && vb) return 1;
      if (va && !vb) return -1;
      return String(va).localeCompare(String(vb)) * sort.d;
    });
  }, [liveOrders, search, statusFilter, customerFilter, sourceFilter, ownerFilter, customers, sort]);
  function toggleSort(k) { setSort(s => s.k === k ? { k, d: s.d * -1 } : { k, d: -1 }); }
  function getCustomerName(id) {
    return customers.find(c => c.id === id)?.company || "—";
  }
  // Inline owner save — writes the exact users.name string, so no Sid/Sidd drift.
  async function setOwner(order, name) {
    if (!onUpdateOrder) return;
    setSavingId(order.id);
    try { await onUpdateOrder(order.id, { owner: name || null }); }
    finally { setSavingId(null); }
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

      {/* Unattributed nudge */}
      {!showArchived && unattributedCount > 0 && (
        <div style={{ background: "#FFF8E7", border: `1px solid #FFE0A3`, borderRadius: 9, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#8a5a00", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span><b>{unattributedCount}</b> order{unattributedCount === 1 ? " has" : "s have"} no owner — set one in the Owner column to keep rep reporting accurate.</span>
          <button onClick={() => setOwnerFilter(ownerFilter === "(unassigned)" ? "All" : "(unassigned)")}
            style={{ background: "transparent", border: `1px solid #E0B25A`, borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#8a5a00", cursor: "pointer", whiteSpace: "nowrap" }}>
            {ownerFilter === "(unassigned)" ? "Show all" : "Show only these"}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          placeholder="Search by order #, customer, PO #, owner..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={inputStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option>All</option>
          {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select style={inputStyle} value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
          <option value="All">All owners</option>
          <option value="(unassigned)">— no owner —</option>
          {activeUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
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
        <button
          onClick={() => setShowArchived(v => !v)}
          title="Archived orders are hidden from all totals"
          style={{
            ...inputStyle, cursor: "pointer", fontWeight: showArchived ? 700 : 500,
            color: showArchived ? C.blue : C.muted,
            borderColor: showArchived ? C.blue : C.border
          }}>
          {showArchived ? "← Back to active" : `Archived (${archivedCount})`}
        </button>
        <button style={btnPrimary} onClick={onNew}>+ New order</button>
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>
            {showArchived
              ? "No archived orders."
              : orders.length === 0
                ? "No orders yet. Click + New order to add your first PO."
                : "No orders match the current filters."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <Th>#</Th>
                <ThSort k="order_number" label="Order #" sort={sort} onSort={toggleSort} />
                <ThSort k="customer" label="Customer" sort={sort} onSort={toggleSort} />
                <ThSort k="owner" label="Owner" sort={sort} onSort={toggleSort} />
                <ThSort k="customer_po_number" label="Customer PO" sort={sort} onSort={toggleSort} />
                <ThSort k="customer_po_date" label="PO Date" sort={sort} onSort={toggleSort} />
                <ThSort k="value" label="Value" sort={sort} onSort={toggleSort} />
                <ThSort k="source" label="Source" sort={sort} onSort={toggleSort} />
                <ThSort k="status" label="Status" sort={sort} onSort={toggleSort} />
                <ThSort k="updated_at" label="Updated" sort={sort} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => {
                const owner = ownerOf(o);
                return (
                  <tr
                    key={o.id}
                    onClick={() => onSelect(o)}
                    style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", opacity: o.archived_at ? 0.6 : 1 }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <Td style={{ color: C.faded, fontSize: 12, fontFamily: "monospace" }}>{i + 1}</Td>
                    <Td>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{o.order_number}</span>
                      {o.archived_at && <span style={{ ...pill(C.muted), marginLeft: 6, fontSize: 9 }}>archived</span>}
                    </Td>
                    <Td>{getCustomerName(o.customer_id)}</Td>
                    {/* Inline owner editor — click doesn't open the drawer */}
                    <Td onClick={ev => ev.stopPropagation()}>
                      {onUpdateOrder ? (
                        <select
                          value={owner}
                          disabled={savingId === o.id}
                          onChange={ev => setOwner(o, ev.target.value)}
                          title={owner ? `Owner: ${owner}` : "No owner set"}
                          style={{
                            background: owner ? "transparent" : "#FFF8E7",
                            border: `1px solid ${owner ? "transparent" : "#FFE0A3"}`,
                            borderRadius: 6, padding: "3px 6px", fontSize: 12,
                            color: owner ? C.ink : "#8a5a00",
                            fontWeight: owner ? 500 : 600,
                            cursor: "pointer", fontFamily: "inherit", maxWidth: 130
                          }}>
                          <option value="">— set owner —</option>
                          {activeUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                          {/* keep a legacy value visible if it isn't in the users list */}
                          {owner && !activeUsers.some(u => u.name === owner) &&
                            <option value={owner}>{owner} (legacy)</option>}
                        </select>
                      ) : (
                        <span style={{ color: owner ? C.ink : C.faded }}>{owner || "—"}</span>
                      )}
                    </Td>
                    <Td style={{ color: C.muted }}>{o.customer_po_number || "—"}</Td>
                    <Td style={{ color: C.muted, fontSize: 12 }}>{o.customer_po_date ? fmtDate(o.customer_po_date) : "—"}</Td>
                    <Td>{fmtMoney(o.total_amount, o.currency)}</Td>
                    <Td>
                      <span style={pill(getSourceColor(o.source))}>{getSourceLabel(o.source)}</span>
                    </Td>
                    <Td>
                      <span style={pill(ORDER_STATUS_COLORS[o.status] || C.muted)}>{o.status}</span>
                    </Td>
                    <Td style={{ color: C.muted, fontSize: 12 }}>{fmtDate(o.updated_at || o.created_at)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 10, textAlign: "right" }}>
        Showing {filtered.length} of {liveOrders.length} {showArchived ? "archived" : "active"} orders
        {!showArchived && archivedCount > 0 && ` · ${archivedCount} archived`}
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
function ThSort({ k, label, sort, onSort }) {
  const active = sort.k === k;
  return (
    <th
      onClick={() => onSort(k)}
      style={{
        textAlign: "left", padding: "10px 14px", fontWeight: 700,
        fontSize: 11, color: active ? C.blue : C.muted, textTransform: "uppercase",
        letterSpacing: 0.5, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap"
      }}
    >
      {label}{active ? (sort.d === 1 ? " ↑" : " ↓") : ""}
    </th>
  );
}
function Td({ children, style = {} }) {
  return <td style={{ padding: "12px 14px", ...style }}>{children}</td>;
}
