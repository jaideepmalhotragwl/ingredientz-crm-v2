import { useState, useEffect, useMemo } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Card } from "./ui/Card.jsx";

/**
 * Dashboard — what happened, over any period, and who did it.
 *
 * Everything counts on enquiry_date rather than created_at. The lag
 * between a customer sending an enquiry and the team logging it
 * averages 0.1 days here, so the distinction is academic — and
 * enquiry_date is the honest reading of when demand arrived.
 *
 * Every period shows a comparison with the one before it. A number
 * on its own says nothing: 19 enquiries is good or bad only against
 * last month's 31.
 */

const PERIODS = [
  ["today",   "Today"],
  ["week",    "This week"],
  ["month",   "This month"],
  ["quarter", "This quarter"],
  ["year",    "This year"],
];

const CLOSED = ["Lost", "No Response", "Out of Scope"];

function bounds(period, offset = 0) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let from, to;
  if (period === "today") {
    from = new Date(now); from.setDate(from.getDate() - offset);
    to = new Date(from);
  } else if (period === "week") {
    from = new Date(now); from.setDate(from.getDate() - ((from.getDay() + 6) % 7) - offset * 7);
    to = new Date(from); to.setDate(to.getDate() + 6);
  } else if (period === "month") {
    from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
  } else if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3) - offset;
    from = new Date(now.getFullYear(), q * 3, 1);
    to = new Date(now.getFullYear(), q * 3 + 3, 0);
  } else {
    from = new Date(now.getFullYear() - offset, 0, 1);
    to = new Date(now.getFullYear() - offset, 11, 31);
  }
  // Format in LOCAL time. toISOString() converts to UTC, and at IST
  // (+5:30) local midnight lands on the previous day — so "this month"
  // was reading 31 Aug to 29 Sep instead of 1 to 30 Sep.
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  return { from: iso(from), to: iso(to) };
}

const inRange = (d, b) => d && d >= b.from && d <= b.to;
const money = n => n ? "$" + Math.round(n).toLocaleString() : "$0";

function Delta({ now, prev }) {
  if (prev === 0 && now === 0) return <span style={{ color: C.faded, fontSize: 11 }}>—</span>;
  if (prev === 0) return <span style={{ color: "#1E7A46", fontSize: 11, fontWeight: 700 }}>new</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  const up = pct >= 0;
  return <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#1E7A46" : C.red }}>
    {up ? "▲" : "▼"} {Math.abs(pct)}%
    <span style={{ color: C.faded, fontWeight: 400 }}> vs {prev}</span>
  </span>;
}

/** Daily trend. Hand-drawn SVG rather than a chart library — no
 *  dependency to install, and full control over the axis. */
function Trend({ series, days }) {
  const W = 900, H = 190, PAD = { t: 12, r: 12, b: 26, l: 34 };
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const x = i => PAD.l + (days.length <= 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = v => PAD.t + ih - (v / max) * ih;

  const ticks = [0, 0.5, 1].map(f => Math.round(max * f));
  const labelEvery = Math.max(1, Math.ceil(days.length / 12));

  return <div style={{ overflowX: "auto" }}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 560, height: H }}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={C.border} strokeWidth="1"/>
          <text x={PAD.l - 7} y={y(t) + 4} textAnchor="end" fontSize="9" fill={C.faded}>{t}</text>
        </g>
      ))}
      {series.map(s => (
        <g key={s.name}>
          <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"
            strokeDasharray={s.dash} strokeOpacity="0.9"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}/>
          {s.values.map((v, i) => v > 0 && (
            <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={s.color}>
              <title>{days[i]} · {s.name}: {v}</title>
            </circle>
          ))}
        </g>
      ))}
      {days.map((d, i) => i % labelEvery === 0 && (
        <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill={C.faded}>
          {new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </text>
      ))}
    </svg>
  </div>;
}

export function Dashboard({ users = [] }) {
  const [period, setPeriod] = useState("month");
  const [enquiries, setEnq] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [newCust, setNewCust] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Paged. A plain select stops at 1,000 rows, which silently halved
    // the product analysis until it was caught — every figure here would
    // be wrong the same way.
    async function all(table, cols, order) {
      const PAGE = 1000, out = [];
      for (let f = 0; ; f += PAGE) {
        const { data, error } = await supabase.from(table).select(cols)
          .order(order).range(f, f + PAGE - 1);
        if (error) { console.error(table, error); break; }
        out.push(...(data || []));
        if (!data || data.length < PAGE) break;
        if (f > 50000) break;
      }
      return out;
    }
    Promise.all([
      all("enquiries", "id,enquiry_date,assigned_to,stage,company_id,expected_value", "id"),
      all("quotations", "id,enquiry_id,created_at,grand_total", "id"),
      // NOT order_date — that column does not exist, and PostgREST fails
      // the whole select on an unknown column, so orders came back empty
      // and every order figure read zero.
      all("orders", "id,created_at,total_amount,archived_at,company_id", "id"),
      all("new_customers_v", "company_id,company_name,first_enquiry_date,assigned_to,verified", "company_id"),
    ]).then(([e, q, o, n]) => {
      setEnq(e); setQuotes(q); setOrders(o); setNewCust(n); setLoading(false);
    });
  }, []);

  const repOf = useMemo(() => {
    const m = {}; enquiries.forEach(e => { m[e.id] = e.assigned_to; }); return m;
  }, [enquiries]);

  const dateOf = {
    enquiry: e => e.enquiry_date,
    quote:   q => (q.created_at || "").slice(0, 10),
    order:   o => (o.created_at || "").slice(0, 10),
  };

  function totals(b) {
    const enq = enquiries.filter(e => inRange(e.enquiry_date, b));
    const qs  = quotes.filter(q => inRange(dateOf.quote(q), b));
    const os  = orders.filter(o => !o.archived_at && inRange(dateOf.order(o), b));
    const nc  = newCust.filter(n => inRange(n.first_enquiry_date, b));
    return {
      enquiries: enq.length,
      quotations: qs.length,
      quotedEnquiries: new Set(qs.map(q => q.enquiry_id)).size,
      orders: os.length,
      orderValue: os.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0),
      newCustomers: nc.length,
      newUnverified: nc.filter(n => n.verified === false).length,
      won: enq.filter(e => e.stage === "PO Received").length,
      open: enq.filter(e => !CLOSED.includes(e.stage) && e.stage !== "PO Received").length,
    };
  }

  const b    = useMemo(() => bounds(period, 0), [period]);
  const bPrev= useMemo(() => bounds(period, 1), [period]);
  const now  = useMemo(() => totals(b),     [b, enquiries, quotes, orders, newCust]);
  const prev = useMemo(() => totals(bPrev), [bPrev, enquiries, quotes, orders, newCust]);

  // ── Daily series across the period ──────────────────────────
  const { days, series } = useMemo(() => {
    const out = [];
    const cur = new Date(b.from + "T00:00:00"), end = new Date(b.to + "T00:00:00");
    const today = new Date(); today.setHours(0,0,0,0);
    const local = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    while (cur <= end && cur <= today) { out.push(local(cur)); cur.setDate(cur.getDate()+1); }
    const count = (arr, fn) => out.map(d => arr.filter(r => fn(r) === d).length);
    return {
      days: out,
      // Dashed patterns, not just colour. On 14 Sep enquiries and
      // quotations were both 10, so the orange line painted exactly over
      // the blue one and it looked as though enquiries were missing.
      // Identical values are common here; the pattern makes the line
      // underneath visible.
      series: [
        { name: "Enquiries",  color: C.blue,    dash: "",      values: count(enquiries, dateOf.enquiry) },
        { name: "Quotations", color: "#F5A623", dash: "7 4",   values: count(quotes, dateOf.quote) },
        { name: "Orders",     color: "#1E7A46", dash: "2 4",   values: count(orders.filter(o => !o.archived_at), dateOf.order) },
      ],
    };
  }, [b, enquiries, quotes, orders]);

  // ── Per rep ─────────────────────────────────────────────────
  const byRep = useMemo(() => {
    const names = [...new Set([
      ...users.filter(u => u.active !== false).map(u => u.name),
      ...enquiries.map(e => e.assigned_to),
    ].filter(Boolean))];
    return names.map(name => {
      const enq = enquiries.filter(e => e.assigned_to === name && inRange(e.enquiry_date, b));
      const qs  = quotes.filter(q => repOf[q.enquiry_id] === name && inRange(dateOf.quote(q), b));
      const won = enq.filter(e => e.stage === "PO Received").length;
      const nc  = newCust.filter(n => n.assigned_to === name && inRange(n.first_enquiry_date, b));
      return {
        name,
        enquiries: enq.length,
        quotations: qs.length,
        newCustomers: nc.length,
        won,
        // Of the enquiries raised in this period, how many have reached a
        // quotation — whenever that quotation was sent. Dividing this
        // period's quotations by this period's enquiries produced "450%":
        // Deepak sent 10 quotations against enquiries raised weeks earlier,
        // on a base of 2 new ones. A rate over 100% is the giveaway that
        // numerator and denominator counted different populations.
        quoteRate: enq.length
          ? Math.round((new Set(quotes.filter(q => enq.some(e => e.id === q.enquiry_id))
              .map(q => q.enquiry_id)).size / enq.length) * 100)
          : 0,
        value: enq.reduce((s, e) => s + (parseFloat(e.expected_value) || 0), 0),
      };
    }).filter(r => r.enquiries || r.quotations).sort((a, b2) => b2.enquiries - a.enquiries);
  }, [users, enquiries, quotes, newCust, repOf, b]);

  if (loading) return <div style={{ padding: 30, color: C.muted, fontSize: 12 }}>Loading…</div>;

  const kpi = [
    ["New customers", now.newCustomers, prev.newCustomers,
      now.newUnverified ? `${now.newUnverified} awaiting review` : "first enquiry in period"],
    ["Enquiries", now.enquiries, prev.enquiries, `${now.open} still open`],
    ["Quotations", now.quotations, prev.quotations, `${now.quotedEnquiries} enquiries quoted`],
    ["Orders", now.orders, prev.orders, money(now.orderValue)],
  ];

  const th = { padding: "8px 12px", textAlign: "left", fontSize: 9, letterSpacing: 1,
               textTransform: "uppercase", color: C.muted, fontWeight: 700,
               borderBottom: `1px solid ${C.border}`, background: C.bg, whiteSpace: "nowrap" };
  const thN = { ...th, textAlign: "right" };
  const tdN = { padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums",
                borderBottom: `1px solid ${C.border}` };

  return <div>
    <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
      {PERIODS.map(([id, label]) => (
        <button key={id} onClick={() => setPeriod(id)} style={{
          background: period === id ? C.blueLt : "transparent",
          border: `1px solid ${period === id ? C.blue : C.border}`,
          borderRadius: 8, padding: "6px 15px", cursor: "pointer", fontSize: 12,
          fontWeight: period === id ? 700 : 500,
          color: period === id ? C.blue : C.muted,
        }}>{label}</button>
      ))}
      <span style={{ marginLeft: "auto", fontSize: 11, color: C.faded, alignSelf: "center" }}>
        {new Date(b.from).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        {b.from !== b.to && ` – ${new Date(b.to).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
      </span>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
      {kpi.map(([label, v, p, hint]) => (
        <div key={label} style={{ background: C.white, border: `1px solid ${C.border}`,
                                  borderRadius: 10, padding: "13px 15px" }}>
          <div style={{ fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase",
                        color: C.muted, fontWeight: 700 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, margin: "5px 0 3px" }}>{v}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <Delta now={v} prev={p}/>
          </div>
          <div style={{ fontSize: 10.5, color: C.faded, marginTop: 3 }}>{hint}</div>
        </div>
      ))}
    </div>

    <Card style={{ marginBottom: 14 }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Daily activity</div>
        {series.map(s => (
          <span key={s.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.muted }}>
            <span style={{ width: 14, height: 0, display: "inline-block",
                           borderTop: `3px ${s.dash ? "dashed" : "solid"} ${s.color}` }}/>
            {s.name}
          </span>
        ))}
      </div>
      <div style={{ padding: "14px 16px 6px" }}>
        {days.length ? <Trend series={series} days={days}/>
          : <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 12 }}>
              Nothing in this period yet.</div>}
      </div>
    </Card>

    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                    fontSize: 15, fontWeight: 700 }}>
        By salesperson
        <span style={{ fontSize: 11, color: C.faded, fontWeight: 400, marginLeft: 8 }}>
          enquiries assigned in this period
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr>
          <th style={th}>Salesperson</th>
          <th style={thN}>Enquiries</th>
          <th style={thN}>New customers</th>
          <th style={thN}>Quotations</th>
          <th style={thN}>Quoted</th>
          <th style={thN}>PO received</th>
          <th style={thN}>Pipeline value</th>
        </tr></thead>
        <tbody>
          {byRep.map((r, i) => (
            <tr key={r.name} style={{ background: i % 2 === 0 ? C.bg : "transparent" }}>
              <td style={{ padding: "9px 12px", fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>{r.name}</td>
              <td style={{ ...tdN, fontWeight: 700 }}>{r.enquiries}</td>
              <td style={tdN}>{r.newCustomers || "—"}</td>
              <td style={tdN}>{r.quotations || "—"}</td>
              <td style={tdN}>
                <span style={{ fontSize: 10.5, fontWeight: 700,
                  color: r.quoteRate >= 50 ? "#1E7A46" : r.quoteRate >= 25 ? "#8a5a08" : C.faded,
                  background: r.quoteRate >= 50 ? "#E6F4EC" : r.quoteRate >= 25 ? "#FDF3E3" : "transparent",
                  borderRadius: 99, padding: "2px 8px" }}>{r.quoteRate}%</span>
              </td>
              <td style={tdN}>{r.won || "—"}</td>
              <td style={{ ...tdN, color: C.muted }}>{r.value ? money(r.value) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr>
          <td style={{ padding: "9px 12px", fontWeight: 700, background: C.bg, borderTop: `2px solid ${C.border}` }}>Total</td>
          <td style={{ ...tdN, fontWeight: 700, background: C.bg, borderTop: `2px solid ${C.border}` }}>{now.enquiries}</td>
          <td style={{ ...tdN, fontWeight: 700, background: C.bg, borderTop: `2px solid ${C.border}` }}>{now.newCustomers}</td>
          <td style={{ ...tdN, fontWeight: 700, background: C.bg, borderTop: `2px solid ${C.border}` }}>{now.quotations}</td>
          <td style={{ ...tdN, background: C.bg, borderTop: `2px solid ${C.border}` }}></td>
          <td style={{ ...tdN, fontWeight: 700, background: C.bg, borderTop: `2px solid ${C.border}` }}>{now.won}</td>
          <td style={{ ...tdN, background: C.bg, borderTop: `2px solid ${C.border}` }}></td>
        </tr></tfoot>
      </table>
      {byRep.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 12 }}>
        No activity in this period.</div>}
    </Card>

    <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>
      Everything counts on the date the customer enquired, not the date it was logged —
      the two differ by 0.1 days on average here. <b>Quotations</b> counts what was sent in
      this period, which may be against older enquiries. <b>Quoted</b> is the share of this
      period's enquiries that have reached a quotation, whenever it was sent — so it cannot
      exceed 100%.
    </div>
  </div>;
}
