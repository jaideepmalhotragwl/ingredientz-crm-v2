import { useState, useEffect, useMemo } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Card } from "./ui/Card.jsx";
import { Btn } from "./ui/Btn.jsx";

/**
 * ProductAnalysis — what people actually ask for.
 *
 * Two levels, because they answer different questions:
 *   FAMILY  "Turmeric"                     → is there demand at all?
 *   VARIANT "Turmeric Extract 95%"         → which spec do they want?
 *
 * Merging the two would hide the thing that matters most. A buyer
 * wanting turmeric powder is not a lead for curcumin extract — a
 * different product, a different price, a different supplier.
 *
 * Only families above a threshold are shown. Of 1,263 families,
 * roughly 1,100 were asked for exactly once; a table of those is
 * noise, so the tail is counted rather than listed.
 */

const HEAT = ["#EAF3FE", "#CFE3FC", "#A9CDF9", "#7FB3F5"];

function periodOf(d, gran) {
  const y = d.getFullYear(), m = d.getMonth();
  if (gran === "quarter") {
    const q = Math.floor(m / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${String(y).slice(2)}` };
  }
  if (gran === "week") {
    const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return { key: t.toISOString().slice(0, 10),
             label: t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) };
  }
  return { key: `${y}-${String(m + 1).padStart(2, "0")}`,
           label: d.toLocaleDateString("en-GB", { month: "short" }) };
}

const fmtDate = v => v
  ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })
  : "—";

export function ProductAnalysis({ onOpenCompany }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [gran, setGran]       = useState("month");
  const [months, setMonths]   = useState(6);
  const [minEnq, setMinEnq]   = useState(2);
  const [search, setSearch]   = useState("");
  const [expanded, setExp]    = useState(null);
  const [merging, setMerging] = useState(null);
  const [msg, setMsg]         = useState(null);

  function flash(t, err = false) { setMsg({ t, err }); setTimeout(() => setMsg(null), 4000); }

  async function load() {
    setLoading(true);
    // The view is one row per product line, so this is ~2,000 rows —
    // small enough to pivot in the browser and avoids a round trip
    // every time someone changes the granularity.
    const { data } = await supabase
      .from("product_demand_v")
      .select("family_key,family_name,variant_key,raw_name,enquiry_id,company_id,customer_name,enquiry_date,stage,qty,unit");
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const from = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - months); d.setHours(0,0,0,0); return d;
  }, [months]);

  const periods = useMemo(() => {
    const out = new Map();
    const cur = new Date(from), end = new Date();
    if (gran === "week") {
      while (cur <= end) { const p = periodOf(cur, gran); out.set(p.key, p); cur.setDate(cur.getDate() + 7); }
    } else {
      const bump = gran === "quarter" ? 3 : 1;
      cur.setDate(1);
      while (cur <= end) { const p = periodOf(cur, gran); out.set(p.key, p); cur.setMonth(cur.getMonth() + bump); }
    }
    return [...out.values()];
  }, [from, gran]);

  // ── Pivot ──────────────────────────────────────────────────
  const { families, tail, totals, grand } = useMemo(() => {
    const fam = {};
    const colT = {};
    let g = 0;

    rows.forEach(r => {
      const d = r.enquiry_date ? new Date(r.enquiry_date) : null;
      if (!d || d < from) return;
      const p = periodOf(d, gran);

      fam[r.family_key] = fam[r.family_key] || {
        key: r.family_key, name: r.family_name,
        cells: {}, total: 0, companies: new Set(),
        variants: {}, last: null,
      };
      const f = fam[r.family_key];
      f.cells[p.key] = (f.cells[p.key] || 0) + 1;
      f.total += 1;
      if (r.company_id) f.companies.add(r.company_id);
      if (!f.last || r.enquiry_date > f.last) f.last = r.enquiry_date;

      const vk = r.variant_key || r.raw_name;
      f.variants[vk] = f.variants[vk] || {
        key: vk, cells: {}, total: 0, companies: new Set(),
        spellings: new Set(), last: null, qtys: [],
      };
      const v = f.variants[vk];
      v.cells[p.key] = (v.cells[p.key] || 0) + 1;
      v.total += 1;
      if (r.company_id) v.companies.add(r.company_id);
      v.spellings.add(r.raw_name);
      if (!v.last || r.enquiry_date > v.last) v.last = r.enquiry_date;
      if (r.qty && /^[0-9]/.test(String(r.qty))) v.qtys.push(`${r.qty} ${r.unit || "kg"}`);

      colT[p.key] = (colT[p.key] || 0) + 1;
      g += 1;
    });

    let list = Object.values(fam);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.name.toLowerCase().includes(q) ||
        Object.values(f.variants).some(v =>
          [...v.spellings].some(s => s.toLowerCase().includes(q))));
    }

    // Everything below the threshold is counted, not listed. A table
    // of a thousand one-off products tells you nothing you can act on.
    const kept = list.filter(f => f.total >= minEnq).sort((a, b) => b.total - a.total);
    const rest = list.filter(f => f.total < minEnq);

    return {
      families: kept,
      tail: { count: rest.length, lines: rest.reduce((s, f) => s + f.total, 0) },
      totals: colT,
      grand: g,
    };
  }, [rows, from, gran, minEnq, search]);

  const heatFor = useMemo(() => {
    const vals = [];
    families.forEach(f => Object.values(f.cells).forEach(v => { if (v) vals.push(v); }));
    if (!vals.length) return () => null;
    vals.sort((a, b) => a - b);
    const q = p => vals[Math.floor((vals.length - 1) * p)];
    const cuts = [q(0.5), q(0.75), q(0.9)];
    return v => !v ? null : v <= cuts[0] ? HEAT[0] : v <= cuts[1] ? HEAT[1] : v <= cuts[2] ? HEAT[2] : HEAT[3];
  }, [families]);

  // ── Merge two families ─────────────────────────────────────
  async function doMerge(intoKey) {
    if (!merging || merging.key === intoKey) return;
    // Every spelling in the losing family is aliased to the winner, so
    // future enquiries using those words land in the right place too.
    const spellings = new Set();
    rows.filter(r => r.family_key === merging.key)
        .forEach(r => spellings.add(r.raw_name.toLowerCase().trim()));

    const payload = [...spellings].map(s => ({
      raw_name: s, family_key: intoKey, note: `merged from ${merging.key}`,
    }));
    const { error } = await supabase.from("product_family_aliases").upsert(payload);
    if (error) { flash(error.message, true); return; }
    flash(`${merging.name} merged into ${families.find(f => f.key === intoKey)?.name || intoKey}`);
    setMerging(null);
    load();
  }

  const th = { padding: "8px 11px", textAlign: "left", fontSize: 9, letterSpacing: 1,
               textTransform: "uppercase", color: C.muted, fontWeight: 700,
               borderBottom: `1px solid ${C.border}`, background: C.bg, whiteSpace: "nowrap" };
  const thN = { ...th, textAlign: "right" };
  const tdN = { padding: "7px 11px", textAlign: "right", fontVariantNumeric: "tabular-nums",
                borderBottom: `1px solid ${C.border}` };
  const sel = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 7,
                padding: "5px 10px", fontSize: 11, color: C.ink, cursor: "pointer" };
  const selOn = { ...sel, borderColor: C.blue, color: C.blue, fontWeight: 700, background: C.blueLt };

  if (loading) return <div style={{ padding: 30, color: C.muted, fontSize: 12 }}>Loading…</div>;

  return <div>
    {msg && <div style={{
      background: msg.err ? "#FFF0F0" : "#E6F4EC",
      border: `1px solid ${msg.err ? C.red : "#B7E0C6"}44`,
      color: msg.err ? C.red : "#1E7A46", borderRadius: 8,
      padding: "9px 14px", marginBottom: 12, fontSize: 12.5, fontWeight: 600,
    }}>{msg.t}</div>}

    {merging && <div style={{
      background: "#F9F7FF", border: "1px solid #7C3AED44", borderLeft: "3px solid #7C3AED",
      borderRadius: 8, padding: "11px 15px", marginBottom: 12, fontSize: 12.5,
    }}>
      Merging <b>{merging.name}</b> — click the family it belongs to.
      {" "}<button onClick={() => setMerging(null)} style={{
        background: "transparent", border: 0, color: C.blue, cursor: "pointer",
        fontSize: 12, textDecoration: "underline" }}>cancel</button>
    </div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
      {[
        ["Product lines", grand, `last ${months} months`],
        ["Families shown", families.length, `${minEnq}+ enquiries`],
        ["One-off products", tail.count, "asked for once — not listed"],
        ["Top family", families[0]?.name || "—", families[0] ? `${families[0].total} enquiries` : ""],
      ].map(([l, v, h]) => (
        <div key={l} style={{ background: C.white, border: `1px solid ${C.border}`,
                              borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase",
                        color: C.muted, fontWeight: 700 }}>{l}</div>
          <div style={{ fontSize: typeof v === "string" && v.length > 12 ? 15 : 22,
                        fontWeight: 700, margin: "4px 0 1px" }}>{v}</div>
          <div style={{ fontSize: 11, color: C.faded }}>{h}</div>
        </div>
      ))}
    </div>

    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", display: "flex", gap: 8, alignItems: "center",
                    borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Product demand</div>
        <select value={gran} onChange={e => setGran(e.target.value)} style={selOn}>
          <option value="week">Weekly</option><option value="month">Monthly</option>
          <option value="quarter">Quarterly</option>
        </select>
        <select value={months} onChange={e => setMonths(Number(e.target.value))} style={sel}>
          <option value={3}>Last 3 months</option><option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option><option value={24}>Last 24 months</option>
        </select>
        <select value={minEnq} onChange={e => setMinEnq(Number(e.target.value))} style={sel}>
          <option value={1}>Show everything</option>
          <option value={2}>2+ enquiries</option>
          <option value={3}>3+ enquiries</option>
          <option value={5}>5+ enquiries</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search product…"
          style={{ marginLeft: "auto", background: C.bg, border: `1px solid ${C.border}`,
                   borderRadius: 7, padding: "6px 12px", fontSize: 12, outline: "none", width: 200 }}/>
      </div>

      <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr>
              <th style={th}>Product</th>
              <th style={thN}>Cos</th>
              {periods.map(p => <th key={p.key} style={thN}>{p.label}</th>)}
              <th style={thN}>Total</th>
              <th style={thN}>Last</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {families.map((f, i) => {
              const open = expanded === f.key;
              const variants = Object.values(f.variants).sort((a, b) => b.total - a.total);
              return <>
                <tr key={f.key} style={{ background: open ? C.blueLt : (i % 2 === 0 ? C.bg : "transparent"),
                                         cursor: merging ? "pointer" : "default" }}
                    onClick={() => merging && doMerge(f.key)}>
                  <td style={{ padding: "8px 11px", borderBottom: `1px solid ${C.border}` }}>
                    <span onClick={e => { if (!merging) { e.stopPropagation(); setExp(open ? null : f.key); } }}
                      style={{ cursor: "pointer", fontWeight: 700, color: C.ink }}>
                      <span style={{ color: C.blue, marginRight: 6, fontSize: 10 }}>
                        {variants.length > 1 ? (open ? "▼" : "▶") : "\u00A0\u00A0"}
                      </span>
                      {f.name}
                    </span>
                    {variants.length > 1 && <span style={{ fontSize: 10, color: C.faded, marginLeft: 7 }}>
                      {variants.length} variants</span>}
                  </td>
                  <td style={{ ...tdN, color: C.muted }}>{f.companies.size}</td>
                  {periods.map(p => {
                    const v = f.cells[p.key] || 0;
                    return <td key={p.key} style={{ ...tdN, background: heatFor(v) || undefined,
                                                    color: v ? C.ink : "#D7D9DC" }}>{v || "—"}</td>;
                  })}
                  <td style={{ ...tdN, fontWeight: 700, background: C.blueLt, color: C.blue }}>{f.total}</td>
                  <td style={{ ...tdN, fontSize: 10, color: C.faded }}>{fmtDate(f.last)}</td>
                  <td style={{ padding: "8px 11px", borderBottom: `1px solid ${C.border}` }}>
                    {!merging && <button onClick={e => { e.stopPropagation(); setMerging(f); }}
                      title="Merge this into another family"
                      style={{ background: "transparent", border: `1px solid ${C.border}`,
                               borderRadius: 6, padding: "2px 7px", fontSize: 10,
                               color: C.muted, cursor: "pointer" }}>⇄</button>}
                  </td>
                </tr>

                {open && variants.map(v => (
                  <tr key={f.key + v.key} style={{ background: "#FAFBFC" }}>
                    <td style={{ padding: "6px 11px 6px 34px", borderBottom: `1px solid ${C.border}`,
                                 fontSize: 11.5, color: C.muted }}>
                      {[...v.spellings][0]}
                      {v.spellings.size > 1 && <span style={{ fontSize: 9.5, color: C.faded, marginLeft: 6 }}
                        title={[...v.spellings].join(" · ")}>+{v.spellings.size - 1} spellings</span>}
                      {v.qtys.length > 0 && <div style={{ fontSize: 9.5, color: C.faded, marginTop: 2 }}>
                        {v.qtys.slice(0, 3).join(" · ")}</div>}
                    </td>
                    <td style={{ ...tdN, fontSize: 11, color: C.faded }}>{v.companies.size}</td>
                    {periods.map(p => (
                      <td key={p.key} style={{ ...tdN, fontSize: 11,
                                               color: v.cells[p.key] ? C.muted : "#E4E6EB" }}>
                        {v.cells[p.key] || "·"}
                      </td>
                    ))}
                    <td style={{ ...tdN, fontSize: 11, fontWeight: 600, color: C.muted }}>{v.total}</td>
                    <td style={{ ...tdN, fontSize: 10, color: C.faded }}>{fmtDate(v.last)}</td>
                    <td style={{ borderBottom: `1px solid ${C.border}` }}></td>
                  </tr>
                ))}
              </>;
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ padding: "8px 11px", fontWeight: 700, background: C.bg,
                                       borderTop: `2px solid ${C.border}` }}>All products</td>
              {periods.map(p => (
                <td key={p.key} style={{ ...tdN, fontWeight: 700, background: C.bg,
                                         borderTop: `2px solid ${C.border}` }}>{totals[p.key] || "—"}</td>
              ))}
              <td style={{ ...tdN, fontWeight: 700, background: C.bg, borderTop: `2px solid ${C.border}` }}>{grand}</td>
              <td colSpan={2} style={{ background: C.bg, borderTop: `2px solid ${C.border}` }}></td>
            </tr>
          </tfoot>
        </table>

        {tail.count > 0 && <div style={{ padding: "11px 16px", borderTop: `1px solid ${C.border}`,
                                         fontSize: 11.5, color: C.muted, background: "#FAFBFC" }}>
          Plus <b style={{ color: C.ink }}>{tail.count}</b> products asked for fewer than {minEnq} times
          ({tail.lines} lines). Mostly one-off requests — set the filter to "Show everything" to see them.
        </div>}
      </div>
    </Card>

    <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>
      Expand a row to see the variants beneath it — powder and extract are different products,
      so they are counted separately. Use ⇄ to merge a family that has been split by a spelling
      the rule did not catch.
    </div>
  </div>;
}
