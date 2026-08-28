import { useState, useEffect, useMemo } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Card } from "./ui/Card.jsx";

/**
 * ActivityAnalysis — who is active, how often, and who has gone quiet.
 *
 * One component, two modes. Orders and enquiries answer the same two
 * questions, so they share the code rather than drifting apart.
 *
 *   mode="enquiries"  records = enquiries, date = enquiry_date
 *   mode="orders"     records = orders,    date = order_date/created_at
 *                     and cells can show count or value
 *
 * Rows are COMPANIES, not contacts. "How many enquiries from this
 * customer" means the business — two buyers at one company is one
 * customer, which is exactly what the company split was for.
 *
 * ORDERS SHOW ORDERS PLACED, NOT CASH COLLECTED. Cash can go negative
 * in a refund month; orders placed cannot. The two never reconcile, so
 * mixing them in one view would produce a number nobody can defend.
 */

const HEAT = ["#EAF3FE", "#CFE3FC", "#A9CDF9", "#7FB3F5"];

const MS_DAY = 86400000;

function toDate(v) { return v ? new Date(v) : null; }

// Period key + label. Weeks are ISO-ish: the Monday of that week.
function periodOf(d, gran) {
  const y = d.getFullYear(), m = d.getMonth();
  if (gran === "day") {
    return { key: d.toISOString().slice(0, 10),
             label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) };
  }
  if (gran === "week") {
    const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return { key: t.toISOString().slice(0, 10),
             label: t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) };
  }
  if (gran === "quarter") {
    const q = Math.floor(m / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${String(y).slice(2)}` };
  }
  return { key: `${y}-${String(m + 1).padStart(2, "0")}`,
           label: d.toLocaleDateString("en-GB", { month: "short" }) };
}

function fmtMoney(n) {
  if (!n) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function fmtDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—";
}

function monthsSince(v) {
  const d = toDate(v);
  if (!d) return null;
  return (Date.now() - d.getTime()) / (MS_DAY * 30.44);
}

export function ActivityAnalysis({ mode = "enquiries", records = [], companies = [], onOpenCompany }) {
  const isOrders = mode === "orders";

  const [gran, setGran]     = useState("month");
  const [months, setMonths] = useState(6);
  const [route, setRoute]   = useState("");
  const [team, setTeam]     = useState("");
  const [metric, setMetric] = useState(isOrders ? "value" : "count");
  const [view, setView]     = useState("activity");     // activity | inactive
  const [silence, setSilence] = useState(3);            // months
  const [agents, setAgents] = useState([]);
  const [sortBy, setSortBy] = useState("total");

  useEffect(() => {
    supabase.from("agents").select("id,name").order("name")
      .then(({ data }) => setAgents(data || []));
  }, []);

  const coById = useMemo(() => {
    const m = {}; (companies || []).forEach(c => { m[c.id] = c; }); return m;
  }, [companies]);

  const agentName = useMemo(() => {
    const m = {}; agents.forEach(a => { m[a.id] = a.name; }); return m;
  }, [agents]);

  // Date and value differ between the two tables; resolve once here.
  function dateOf(r) {
    return isOrders ? (r.order_date || r.created_at) : (r.enquiry_date || r.created_at);
  }
  function valueOf(r) {
    if (!isOrders) return 1;
    return parseFloat(r.total_amount ?? r.grand_total ?? r.amount ?? 0) || 0;
  }
  // Archived orders are excluded from every total in the CRM, so they
  // must be excluded here too or this page will not reconcile.
  function counts(r) {
    return isOrders ? !r.archived_at : true;
  }

  const from = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - months); d.setHours(0,0,0,0); return d;
  }, [months]);

  // ── Periods across the window ────────────────────────────────
  const periods = useMemo(() => {
    const seen = new Map();
    const cur = new Date(from);
    const end = new Date();
    const step = gran === "day" ? 1 : gran === "week" ? 7 : 0;
    if (step) {
      while (cur <= end) { const p = periodOf(cur, gran); seen.set(p.key, p); cur.setDate(cur.getDate() + step); }
    } else {
      const bump = gran === "quarter" ? 3 : 1;
      cur.setDate(1);
      while (cur <= end) { const p = periodOf(cur, gran); seen.set(p.key, p); cur.setMonth(cur.getMonth() + bump); }
    }
    return [...seen.values()];
  }, [from, gran]);

  // ── The matrix ───────────────────────────────────────────────
  const { rows, colTotals, grand } = useMemo(() => {
    const byCo = {};
    const colT = {};
    let g = 0;

    (records || []).forEach(r => {
      if (!counts(r)) return;
      const d = toDate(dateOf(r));
      if (!d || d < from) return;
      const coId = r.company_id;
      if (!coId) return;                       // unlinked rows have their own banner
      const co = coById[coId];
      if (route === "direct" && co?.agent_id) return;
      if (route && route !== "direct" && String(co?.agent_id) !== String(route)) return;
      if (team && (r.assigned_to || "") !== team) return;

      const p = periodOf(d, gran);
      const v = metric === "value" ? valueOf(r) : 1;

      byCo[coId] = byCo[coId] || { co, cells: {}, total: 0, last: null, n: 0 };
      byCo[coId].cells[p.key] = (byCo[coId].cells[p.key] || 0) + v;
      byCo[coId].total += v;
      byCo[coId].n += 1;
      if (!byCo[coId].last || d > toDate(byCo[coId].last)) byCo[coId].last = dateOf(r);

      colT[p.key] = (colT[p.key] || 0) + v;
      g += v;
    });

    const list = Object.values(byCo).sort((a, b) =>
      sortBy === "name"
        ? (a.co?.name || "").localeCompare(b.co?.name || "")
        : sortBy === "recent"
          ? (toDate(b.last) - toDate(a.last))
          : b.total - a.total
    );
    return { rows: list, colTotals: colT, grand: g };
  }, [records, coById, from, gran, route, team, metric, sortBy, isOrders]);

  // Shading scale — quartiles of the non-zero cells in view.
  const heatFor = useMemo(() => {
    const vals = [];
    rows.forEach(r => Object.values(r.cells).forEach(v => { if (v > 0) vals.push(v); }));
    if (!vals.length) return () => null;
    vals.sort((a, b) => a - b);
    const q = p => vals[Math.floor((vals.length - 1) * p)];
    const cuts = [q(0.25), q(0.5), q(0.75)];
    return v => {
      if (!v) return null;
      if (v <= cuts[0]) return HEAT[0];
      if (v <= cuts[1]) return HEAT[1];
      if (v <= cuts[2]) return HEAT[2];
      return HEAT[3];
    };
  }, [rows]);

  // ── Gone quiet ───────────────────────────────────────────────
  const inactive = useMemo(() => {
    const last = {};
    (records || []).forEach(r => {
      if (!counts(r) || !r.company_id) return;
      const d = toDate(dateOf(r));
      if (!d) return;
      const k = r.company_id;
      last[k] = last[k] || { n: 0, last: null, lastStage: null };
      last[k].n += 1;
      if (!last[k].last || d > toDate(last[k].last)) {
        last[k].last = dateOf(r);
        last[k].lastStage = r.stage || r.status || null;
      }
    });

    return Object.entries(last)
      .map(([id, v]) => ({ co: coById[id], ...v, quiet: monthsSince(v.last) }))
      .filter(x => x.co && x.quiet != null && x.quiet >= silence)
      .filter(x => {
        if (route === "direct") return !x.co.agent_id;
        if (route) return String(x.co.agent_id) === String(route);
        return true;
      })
      .sort((a, b) => b.n - a.n);
  }, [records, coById, silence, route, isOrders]);

  const activeCount = rows.length;
  const totalCompanies = (companies || []).length;

  const sel = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 7,
                padding: "5px 10px", fontSize: 11, color: C.ink, cursor: "pointer" };
  const selOn = { ...sel, borderColor: C.blue, color: C.blue, fontWeight: 700, background: C.blueLt };
  const th = { padding: "8px 11px", textAlign: "left", fontSize: 9, letterSpacing: 1,
               textTransform: "uppercase", color: C.muted, fontWeight: 700,
               borderBottom: `1px solid ${C.border}`, background: C.bg, whiteSpace: "nowrap" };
  const thN = { ...th, textAlign: "right" };
  const tdN = { padding: "8px 11px", textAlign: "right", fontVariantNumeric: "tabular-nums",
                borderBottom: `1px solid ${C.border}` };

  const label = isOrders ? "orders" : "enquiries";
  const show = v => metric === "value" ? fmtMoney(v) : (v || "");

  return <div>
    {/* view switch */}
    <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
      {[["activity", "📊 Activity"], ["inactive", "💤 Gone quiet"]].map(([id, l]) => (
        <button key={id} onClick={() => setView(id)} style={{
          background: "transparent", border: "none",
          borderBottom: `2px solid ${view === id ? C.blue : "transparent"}`,
          padding: "8px 15px", cursor: "pointer", fontSize: 12.5,
          fontWeight: view === id ? 700 : 500, color: view === id ? C.blue : C.muted,
        }}>{l}</button>
      ))}
    </div>

    {view === "activity" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
        {[
          [isOrders ? "Orders" : "Enquiries", metric === "value" ? fmtMoney(grand) : rows.reduce((s,r)=>s+r.n,0), `last ${months} months`],
          ["Active companies", activeCount, `of ${totalCompanies} · ${totalCompanies ? Math.round(activeCount/totalCompanies*100) : 0}%`],
          ["Avg per company", activeCount ? (rows.reduce((s,r)=>s+r.n,0)/activeCount).toFixed(1) : "0", "over the window"],
          ["Gone quiet", inactive.length, `silent ${silence}+ months`],
        ].map(([l, v, h]) => (
          <div key={l} style={{ background: C.white, border: `1px solid ${C.border}`,
                                borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase",
                          color: C.muted, fontWeight: 700 }}>{l}</div>
            <div style={{ fontSize: 23, fontWeight: 700, margin: "4px 0 1px" }}>{v}</div>
            <div style={{ fontSize: 11, color: C.faded }}>{h}</div>
          </div>
        ))}
      </div>

      <Card style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", display: "flex", gap: 8, alignItems: "center",
                      borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {isOrders ? "Orders" : "Enquiries"} by company
            <span style={{ fontSize: 12, color: C.blue, fontWeight: 400, marginLeft: 5 }}>
              {activeCount} active
            </span>
          </div>
          <select value={gran} onChange={e => setGran(e.target.value)} style={selOn}>
            <option value="day">Daily</option><option value="week">Weekly</option>
            <option value="month">Monthly</option><option value="quarter">Quarterly</option>
          </select>
          <select value={months} onChange={e => setMonths(Number(e.target.value))} style={sel}>
            <option value={3}>Last 3 months</option><option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option><option value={24}>Last 24 months</option>
          </select>
          <select value={route} onChange={e => setRoute(e.target.value)} style={sel}>
            <option value="">All routes</option><option value="direct">Direct only</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {!isOrders && <select value={team} onChange={e => setTeam(e.target.value)} style={sel}>
            <option value="">All team</option>
            {[...new Set((records||[]).map(r => r.assigned_to).filter(Boolean))].sort()
              .map(n => <option key={n} value={n}>{n}</option>)}
          </select>}
          {isOrders && <select value={metric} onChange={e => setMetric(e.target.value)} style={selOn}>
            <option value="value">Show value (USD)</option><option value="count">Show count</option>
          </select>}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...sel, marginLeft: "auto" }}>
            <option value="total">Sort: highest total</option>
            <option value="recent">Sort: most recent</option>
            <option value="name">Sort: name</option>
          </select>
        </div>

        <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr>
                <th style={th}>Company</th>
                <th style={th}>Route</th>
                {periods.map(p => <th key={p.key} style={thN}>{p.label}</th>)}
                <th style={thN}>Total</th>
                <th style={thN}>Last</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.co?.id || i} style={{ background: i % 2 === 0 ? C.bg : "transparent" }}>
                  <td style={{ padding: "8px 11px", borderBottom: `1px solid ${C.border}`, maxWidth: 200 }}>
                    <span onClick={() => onOpenCompany && onOpenCompany(r.co)}
                      style={{ fontWeight: 600, color: C.ink, cursor: onOpenCompany ? "pointer" : "default",
                               overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                               display: "block" }}>{r.co?.name || "—"}</span>
                  </td>
                  <td style={{ padding: "8px 11px", borderBottom: `1px solid ${C.border}` }}>
                    {r.co?.agent_id
                      ? <span style={{ fontSize: 10, fontWeight: 700, color: "#4338CA",
                                       background: "#EEF2FF", border: "1px solid #C7D2FE",
                                       borderRadius: 99, padding: "2px 8px", whiteSpace: "nowrap" }}>
                          {agentName[r.co.agent_id] || "Agent"}</span>
                      : <span style={{ fontSize: 10, color: C.faded }}>Direct</span>}
                  </td>
                  {periods.map(p => {
                    const v = r.cells[p.key] || 0;
                    const bg = heatFor(v);
                    return <td key={p.key} style={{ ...tdN, background: bg || undefined,
                                                    color: v ? C.ink : "#D7D9DC" }}>
                      {v ? show(v) : "—"}
                    </td>;
                  })}
                  <td style={{ ...tdN, fontWeight: 700, background: C.blueLt, color: C.blue }}>
                    {show(r.total)}
                  </td>
                  <td style={{ ...tdN, fontSize: 10, color: C.faded }}>{fmtDate(r.last)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot>
              <tr>
                <td colSpan={2} style={{ padding: "8px 11px", fontWeight: 700, background: C.bg,
                                         borderTop: `2px solid ${C.border}` }}>All companies</td>
                {periods.map(p => (
                  <td key={p.key} style={{ ...tdN, fontWeight: 700, background: C.bg,
                                           borderTop: `2px solid ${C.border}` }}>
                    {show(colTotals[p.key] || 0)}
                  </td>
                ))}
                <td style={{ ...tdN, fontWeight: 700, background: C.bg, borderTop: `2px solid ${C.border}` }}>
                  {show(grand)}
                </td>
                <td style={{ ...tdN, background: C.bg, borderTop: `2px solid ${C.border}` }}></td>
              </tr>
            </tfoot>}
          </table>
          {rows.length === 0 && <div style={{ padding: 34, textAlign: "center", color: C.muted, fontSize: 12 }}>
            No {label} in this window.
          </div>}
        </div>
      </Card>

      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>
        Shading is relative to this view — darker means more. A row fading left to right is a
        customer going quiet before they reach the Gone quiet list.
      </div>
    </>}

    {view === "inactive" && <>
      <Card style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", display: "flex", gap: 8, alignItems: "center",
                      borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            Gone quiet <span style={{ fontSize: 12, color: C.blue, fontWeight: 400, marginLeft: 5 }}>
              {inactive.length} companies</span>
          </div>
          <select value={silence} onChange={e => setSilence(Number(e.target.value))} style={selOn}>
            <option value={1}>Silent 1+ month</option>
            <option value={2}>Silent 2+ months</option>
            <option value={3}>Silent 3+ months</option>
            <option value={6}>Silent 6+ months</option>
            <option value={12}>Silent 12+ months</option>
            <option value={24}>Silent 24+ months</option>
          </select>
          <select value={route} onChange={e => setRoute(e.target.value)} style={sel}>
            <option value="">All routes</option><option value="direct">Direct only</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr>
                <th style={th}>Company</th><th style={th}>Route</th>
                <th style={thN}>{isOrders ? "Orders" : "Enquiries"}</th>
                <th style={thN}>Last</th><th style={thN}>Silent</th>
                <th style={th}>Last outcome</th><th style={th}>Reachable</th>
              </tr>
            </thead>
            <tbody>
              {inactive.map((x, i) => {
                const excluded = x.co.status === "excluded";
                const q = x.quiet;
                const qc = q >= 6 ? [C.red, "#FFF0F0"] : [ "#8a5a08", "#FDF3E3" ];
                return <tr key={x.co.id} style={{ background: i % 2 === 0 ? C.bg : "transparent" }}>
                  <td style={{ padding: "8px 11px", borderBottom: `1px solid ${C.border}` }}>
                    <span onClick={() => onOpenCompany && onOpenCompany(x.co)}
                      style={{ fontWeight: 600, color: C.ink, cursor: onOpenCompany ? "pointer" : "default" }}>
                      {x.co.name}</span>
                  </td>
                  <td style={{ padding: "8px 11px", borderBottom: `1px solid ${C.border}` }}>
                    {x.co.agent_id
                      ? <span style={{ fontSize: 10, fontWeight: 700, color: "#4338CA", background: "#EEF2FF",
                                       border: "1px solid #C7D2FE", borderRadius: 99, padding: "2px 8px" }}>
                          {agentName[x.co.agent_id] || "Agent"}</span>
                      : <span style={{ fontSize: 10, color: C.faded }}>Direct</span>}
                  </td>
                  <td style={{ ...tdN, fontWeight: 700 }}>{x.n}</td>
                  <td style={{ ...tdN, fontSize: 11, color: C.muted }}>{fmtDate(x.last)}</td>
                  <td style={tdN}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: qc[0], background: qc[1],
                                   border: `1px solid ${qc[0]}44`, borderRadius: 99, padding: "2px 8px" }}>
                      {q.toFixed(1)} mo</span>
                  </td>
                  <td style={{ padding: "8px 11px", borderBottom: `1px solid ${C.border}`,
                               fontSize: 11, color: C.muted }}>{x.lastStage || "—"}</td>
                  <td style={{ padding: "8px 11px", borderBottom: `1px solid ${C.border}` }}>
                    {excluded
                      ? <span style={{ fontSize: 10, fontWeight: 700, color: C.red, background: "#FFF0F0",
                                       border: `1px solid ${C.red}44`, borderRadius: 99, padding: "2px 8px" }}>
                          Excluded</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, color: "#1E7A46", background: "#E6F4EC",
                                       border: "1px solid #B7E0C6", borderRadius: 99, padding: "2px 8px" }}>
                          OK</span>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
          {inactive.length === 0 && <div style={{ padding: 34, textAlign: "center", color: C.muted, fontSize: 12 }}>
            🎉 Nobody has been silent for {silence}+ months.
          </div>}
        </div>
      </Card>

      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>
        Companies marked <b>Excluded</b> stay visible for history but must never be emailed —
        that is the retired pharma book.
      </div>
    </>}
  </div>;
}
