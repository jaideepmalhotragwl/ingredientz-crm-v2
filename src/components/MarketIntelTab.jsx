import { useState, useEffect, useMemo } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";

const MOLECULES = ["shilajit", "turmeric", "colostrum", "enzymes"];
const MARKETS = [
  { code: "US", label: "USA" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
];

// month number -> short label
const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Turn the stored monthly_history (newest-first) into oldest-first points for the chart.
function toSpark(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice()
    .reverse()
    .map((h) => ({ label: `${MONTHS[h.month] || h.month} ${String(h.year).slice(2)}`, v: h.search_volume || 0 }));
}

function trendColor(yearly) {
  if (yearly === null || yearly === undefined) return C.muted;
  if (yearly > 5) return C.green;
  if (yearly < -5) return C.red;
  return C.amber;
}

function trendArrow(yearly) {
  if (yearly === null || yearly === undefined) return "→";
  if (yearly > 5) return "▲";
  if (yearly < -5) return "▼";
  return "→";
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US");
}

function compBadge(comp) {
  const map = { HIGH: C.red, MEDIUM: C.amber, LOW: C.green };
  const col = map[comp] || C.muted;
  return (
    <span style={{ fontSize: 11, color: col, background: col + "1A", padding: "2px 8px", borderRadius: 100, fontWeight: 600 }}>
      {comp || "—"}
    </span>
  );
}

export function MarketIntelTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [market, setMarket] = useState("US");
  const [openMolecule, setOpenMolecule] = useState(null);
  const [pulledAt, setPulledAt] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("market_intel")
      .select("*")
      .order("search_volume", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { console.error("market_intel fetch:", error); setRows([]); }
        else {
          setRows(data || []);
          if (data && data.length) {
            const latest = data.reduce((a, b) => (a.pulled_at > b.pulled_at ? a : b));
            setPulledAt(latest.pulled_at);
          }
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  // rows for the currently selected market
  const marketRows = useMemo(() => rows.filter((r) => r.market === market), [rows, market]);

  // top (highest-volume) row per molecule = the card headline
  function topRow(mol) {
    const list = marketRows.filter((r) => r.molecule === mol && r.row_type === "tracked");
    return list.length ? list[0] : null; // already sorted desc by search_volume
  }

  // all keyword rows for a molecule (for the detail table)
  function moleculeRows(mol) {
    return marketRows.filter((r) => r.molecule === mol && r.row_type === "tracked");
  }

  // trending rows (fastest rising), top 8
  const trendingRows = useMemo(
    () =>
      marketRows
        .filter((r) => r.row_type === "trending")
        .slice()
        .sort((a, b) => (b.trend_yearly || 0) - (a.trend_yearly || 0))
        .slice(0, 8),
    [marketRows]
  );

  if (loading) {
    return <div style={{ color: C.muted, fontSize: 13, padding: 40, textAlign: "center" }}>Loading market intelligence…</div>;
  }

  if (!rows.length) {
    return (
      <div style={{ color: C.muted, fontSize: 13, padding: 40, textAlign: "center" }}>
        No market intelligence data yet. Run the collector to populate it.
      </div>
    );
  }

  return (
    <div>
      {/* header row: market switch + last updated */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 7 }}>
          {MARKETS.map((m) => (
            <button
              key={m.code}
              onClick={() => { setMarket(m.code); setOpenMolecule(null); }}
              style={{
                fontSize: 13, padding: "7px 16px", borderRadius: 100, cursor: "pointer",
                background: market === m.code ? C.blue : C.card,
                color: market === m.code ? C.white : C.muted,
                border: `1px solid ${market === m.code ? C.blue : C.border}`,
                fontWeight: market === m.code ? 700 : 500,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        {pulledAt && (
          <div style={{ fontSize: 11, color: C.muted }}>
            Updated {new Date(pulledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        )}
      </div>

      {/* molecule cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14, marginBottom: 28 }}>
        {MOLECULES.map((mol) => {
          const top = topRow(mol);
          const spark = top ? toSpark(top.monthly_history) : [];
          const isOpen = openMolecule === mol;
          return (
            <div
              key={mol}
              onClick={() => setOpenMolecule(isOpen ? null : mol)}
              style={{
                background: C.card, border: `1px solid ${isOpen ? C.blue : C.border}`,
                borderRadius: 16, padding: "16px 18px", cursor: "pointer",
                boxShadow: isOpen ? `0 0 0 1px ${C.blue}` : "none", transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, textTransform: "capitalize" }}>{mol}</span>
                <span style={{ fontSize: 11, color: C.faded }}>{isOpen ? "▲" : "▼"}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
                {top ? fmt(top.search_volume) : "—"}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>core monthly searches</div>
              {top && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600,
                  color: trendColor(top.trend_yearly), background: trendColor(top.trend_yearly) + "1A",
                  padding: "2px 9px", borderRadius: 100, marginBottom: 10 }}>
                  {trendArrow(top.trend_yearly)} {top.trend_yearly > 0 ? "+" : ""}{top.trend_yearly}% yr
                </div>
              )}
              {spark.length > 0 && (
                <div style={{ height: 46, marginTop: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id={`g-${mol}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.blue} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Tooltip
                        formatter={(v) => [fmt(v), "searches"]}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${C.border}` }}
                        labelStyle={{ color: C.muted }}
                      />
                      <Area type="monotone" dataKey="v" stroke={C.blue} strokeWidth={2} fill={`url(#g-${mol})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* detail table for the open molecule */}
      {openMolecule && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 10, textTransform: "capitalize" }}>
            {openMolecule} — top search terms ({MARKETS.find((m) => m.code === market)?.label})
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: C.muted }}>Keyword</th>
                  <th style={{ textAlign: "right", padding: "10px 16px", fontWeight: 600, color: C.muted }}>Volume</th>
                  <th style={{ textAlign: "center", padding: "10px 16px", fontWeight: 600, color: C.muted }}>Comp.</th>
                  <th style={{ textAlign: "right", padding: "10px 16px", fontWeight: 600, color: C.muted }}>CPC</th>
                  <th style={{ textAlign: "right", padding: "10px 16px", fontWeight: 600, color: C.muted }}>Yr trend</th>
                </tr>
              </thead>
              <tbody>
                {moleculeRows(openMolecule).map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px 16px", color: C.ink }}>{r.keyword}</td>
                    <td style={{ textAlign: "right", padding: "10px 16px", color: C.ink, fontWeight: 600 }}>{fmt(r.search_volume)}</td>
                    <td style={{ textAlign: "center", padding: "10px 16px" }}>{compBadge(r.competition)}</td>
                    <td style={{ textAlign: "right", padding: "10px 16px", color: C.muted }}>{r.cpc ? `$${r.cpc}` : "—"}</td>
                    <td style={{ textAlign: "right", padding: "10px 16px", color: trendColor(r.trend_yearly), fontWeight: 600 }}>
                      {r.trend_yearly > 0 ? "+" : ""}{r.trend_yearly ?? "—"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* rising now strip */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 10 }}>
          Rising now — {MARKETS.find((m) => m.code === market)?.label}
        </div>
        {trendingRows.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted }}>No trending data for this market.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            {trendingRows.map((r) => (
              <div key={r.id} style={{ background: C.bg, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 3 }}>{r.keyword}</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{fmt(r.search_volume)}/mo</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: trendColor(r.trend_yearly) }}>
                  {trendArrow(r.trend_yearly)} {r.trend_yearly > 0 ? "+" : ""}{r.trend_yearly}% yr
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
