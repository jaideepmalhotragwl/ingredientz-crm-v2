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
const EMPTY_FILTERS = {
  order_number: "", customer: "", owner: "All", po_number: "",
  po_from: "", po_to: "", value_min: "", value_max: "",
  source: "All", status: "All"
};
export function OrdersTab({ orders, customers, users = [], onSelect, onNew, onUpdateOrder }) {
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ ...EMPTY_FILTERS });
  const [showArchived, setShowArchived] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [sort, setSort] = useState({ k: "customer_po_date", d: -1 });  // default: newest PO first
  function setFilter(k, v) { setF(prev => ({ ...prev, [k]: v })); }
  const activeFilterCount = useMemo(
    () => Object.keys(EMPTY_FILTERS).filter(k => f[k] !== EMPTY_FILTERS[k]).length,
    [f]
  );
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
  // Owner strings already on orders that aren't in the users list (legacy spellings)
  const legacyOwners = useMemo(() => {
    const known = new Set(activeUsers.map(u => u.name));
    return [...new Set(orders.map(ownerOf).filter(n => n && !known.has(n)))].sort();
  }, [orders, activeUsers]);
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
  function getCustomerName(id) {
    return customers.find(c => c.id === id)?.company || "—";
  }
  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const has = (hay, needle) => String(hay || "").toLowerCase().includes(needle.toLowerCase().trim());
    const rows = liveOrders.filter(o => {
      // per-column filters
      if (f.order_number && !has(o.order_number, f.order_number)) return false;
      if (f.customer && !has(getCustomerName(o.customer_id), f.customer)) return false;
      if (f.po_number && !has(o.customer_po_number, f.po_number)) return false;
      if (f.owner === "(none)" && ownerOf(o)) return false;
      if (f.owner !== "All" && f.owner !== "(none)" && ownerOf(o) !== f.owner) return false;
      if (f.status !== "All" && o.status !== f.status) return false;
      if (f.source !== "All" && o.source !== f.source) return false;
      if (f.po_from || f.po_to) {
        const d = o.customer_po_date ? String(o.customer_po_date).split("T")[0] : "";
        if (!d) return false;                       // no PO date = excluded once a range is set
        if (f.po_from && d < f.po_from) return false;
        if (f.po_to   && d > f.po_to)   return false;
      }
      if (f.value_min || f.value_max) {
        const v = toUSD(o.total_amount, o.currency);
        if (f.value_min && v < parseFloat(f.value_min)) return false;
        if (f.value_max && v > parseFloat(f.value_max)) return false;
      }
      // global search box
      if (search) {
        const s = search.toLowerCase();
        const hay = `${o.order_number} ${o.customer_po_number || ""} ${getCustomerName(o.customer_id)} ${o.job_name || ""} ${ownerOf(o)}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      let va, vb;
      if (sort.k === "value") { va = toUSD(a.total_amount, a.currency); vb = toUSD(b.total_amount, b.currency); }
      else if (sort.k === "customer") { va = getCustomerName(a.customer_id); vb = getCustomerName(b.customer_id); }
      else if (sort.k === "owner") { va = ownerOf(a); vb = ownerOf(b); }
      else { va = a[sort.k] ?? ""; vb = b[sort.k] ?? ""; }
      if (typeof va === "number") return (va - vb) * sort.d;
      // dates & strings — empty values sink to the bottom
      if (!va && vb) return 1;
      if (va && !vb) return -1;
      return String(va).localeCompare(String(vb)) * sort.d;
    });
  }, [liveOrders, search, f, customers, sort]);
  // Value of what's currently on screen — useful when filtering by rep or period.
  const filteredUSD = useMemo(
    () => filtered.reduce((s, o) => s + toUSD(o.total_amount, o.currency), 0),
    [filtered]
  );
  function toggleSort(k) { setSort(s => s.k === k ? { k, d: s.d * -1 } : { k, d: -1 }); }
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
    padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8,
    fontSize: 13, fontFamily: "inherit", background: C.white, color: C.ink
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
  // compact controls used inside the filter row
  const fInp = (active) => ({
    width: "100%", boxSizing: "border-box",
    padding: "4px 6px", fontSize: 11, fontFamily: "inherit",
    border: `1px solid ${active ? C.blue : C.border}`,
    background: active ? C.blueLt : C.white,
    color: C.ink, borderRadius: 5, outline: "none"
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
          <button onClick={() => setFilter("owner", f.owner === "(none)" ? "All" : "(none)")}
            style={{ background: "transparent", border: `1px solid #E0B25A`, borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#8a5a00", cursor: "pointer", whiteSpace: "nowrap" }}>
            {f.owner === "(none)" ? "Show all" : "Show only these"}
          </button>
        </div>
      )}

      {/* Toolbar — per-column filters live in the table header below */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          placeholder="Search across order #, customer, PO #, job, owner..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {(activeFilterCount > 0 || search) && (
          <button
            onClick={() => { setF({ ...EMPTY_FILTERS }); setSearch(""); }}
            style={{ ...inputStyle, cursor: "pointer", fontWeight: 700, color: C.red, borderColor: `${C.red}55` }}>
            ✕ Clear {activeFilterCount + (search ? 1 : 0)} filter{activeFilterCount + (search ? 1 : 0) === 1 ? "" : "s"}
          </button>
        )}
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
        <div style={{ overflowX: "auto" }}>
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
              {/* ── Filter row ── */}
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                <Fd />
                <Fd>
                  <input style={fInp(!!f.order_number)} placeholder="0034"
                    value={f.order_number} onChange={e => setFilter("order_number", e.target.value)} />
                </Fd>
                <Fd>
                  <input style={fInp(!!f.customer)} placeholder="company…"
                    value={f.customer} onChange={e => setFilter("customer", e.target.value)} />
                </Fd>
                <Fd>
                  <select style={fInp(f.owner !== "All")} value={f.owner} onChange={e => setFilter("owner", e.target.value)}>
                    <option value="All">all</option>
                    <option value="(none)">— no owner —</option>
                    {activeUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    {legacyOwners.map(n => <option key={n} value={n}>{n} (legacy)</option>)}
                  </select>
                </Fd>
                <Fd>
                  <input style={fInp(!!f.po_number)} placeholder="PO #"
                    value={f.po_number} onChange={e => setFilter("po_number", e.target.value)} />
                </Fd>
                <Fd>
                  <input type="date" title="PO date from" style={{ ...fInp(!!f.po_from), marginBottom: 3 }}
                    value={f.po_from} onChange={e => setFilter("po_from", e.target.value)} />
                  <input type="date" title="PO date to" style={fInp(!!f.po_to)}
                    value={f.po_to} onChange={e => setFilter("po_to", e.target.value)} />
                </Fd>
                <Fd>
                  <input style={{ ...fInp(!!f.value_min), marginBottom: 3 }} placeholder="min $"
                    value={f.value_min} onChange={e => setFilter("value_min", e.target.value)} />
                  <input style={fInp(!!f.value_max)} placeholder="max $"
                    value={f.value_max} onChange={e => setFilter("value_max", e.target.value)} />
                </Fd>
                <Fd>
                  <select style={fInp(f.source !== "All")} value={f.source} onChange={e => setFilter("source", e.target.value)}>
                    <option value="All">all</option>
                    <option value="enquiry">From enquiry</option>
                    <option value="direct">Direct</option>
                  </select>
                </Fd>
                <Fd>
                  <select style={fInp(f.status !== "All")} value={f.status} onChange={e => setFilter("status", e.target.value)}>
                    <option value="All">all</option>
                    {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Fd>
                <Fd />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>
                    {showArchived
                      ? "No archived orders match."
                      : orders.length === 0
                        ? "No orders yet. Click + New order to add your first PO."
                        : "No orders match the current filters."}
                  </td>
                </tr>
              ) : filtered.map((o, i) => {
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
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 10, textAlign: "right" }}>
        Showing {filtered.length} of {liveOrders.length} {showArchived ? "archived" : "active"} orders
        {filtered.length > 0 && <> · <b style={{ color: C.ink }}>{converted ? "≈ " : ""}{fmtMoneyShort(filteredUSD)}</b> on screen</>}
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
// Filter-row cell
function Fd({ children }) {
  return <th style={{ padding: "4px 8px 8px", verticalAlign: "top", minWidth: 90 }}>{children}</th>;
}
function Td({ children, style = {} }) {
  return <td style={{ padding: "12px 14px", ...style }}>{children}</td>;
}
