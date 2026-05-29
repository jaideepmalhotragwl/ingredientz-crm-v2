import { useState, useMemo } from "react";
import { C } from "../constants.js";
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";

const MARKETS = [
  { code: "US", label: "USA" },
  { code: "UK", label: "UK" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "AE", label: "UAE" },
];

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

// Hardcoded Supabase URL + anon key (public values, same as in config.js).
// We hardcode because supabase.supabaseUrl/supabaseKey return empty in the
// built site — same issue we hit with the website acknowledgment email.
const SUPA_URL = "https://eytoryygkxjslfvsqanl.supabase.co";
const SUPA_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dG9yeXlna3hqc2xmdnNxYW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDA5MTUsImV4cCI6MjA5MDMxNjkxNX0.txYTl0Q06mKSfWGmWc8cOTmCN46tLcxF9_7RhBUHBRY";

// Call the Edge Function via direct fetch — matches the curl pattern.
async function fetchMarket(ingredient, marketCode) {
  try {
    const url = `${SUPA_URL}/functions/v1/dataforseo-keywords`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPA_ANON}`,
      },
      body: JSON.stringify({ mode: "discover", seed: ingredient, market: marketCode, limit: 25 }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 100)}`);
    }
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || "no data");
    const suggestions = data.suggestions || [];
    const seen = new Set();
    const cleaned = [];
    for (const s of suggestions) {
      const sig = `${s.search_volume}_${s.cpc}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      cleaned.push(s);
    }
    return { ok: true, top: cleaned[0] || null, all: cleaned };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export function ResearchConsoleTab() {
  const [ingredient, setIngredient] = useState("");
  const [results, setResults] = useState({});
  const [searched, setSearched] = useState(false);

  function handleSubmit() {
    const term = ingredient.trim();
    if (!term) return;
    setSearched(true);
    const initial = {};
    MARKETS.forEach((m) => { initial[m.code] = { state: "loading" }; });
    setResults(initial);
    MARKETS.forEach((m) => {
      fetchMarket(term, m.code).then((r) => {
        setResults((prev) => ({
          ...prev,
          [m.code]: r.ok
            ? { state: "done", top: r.top, all: r.all }
            : { state: "error", error: r.error },
        }));
      });
    });
  }

  function handleKey(e) {
    if (e.key === "Enter") handleSubmit();
  }

  const unified = useMemo(() => {
    const rows = [];
    MARKETS.forEach((m) => {
      const r = results[m.code];
      if (r?.state === "done" && Array.isArray(r.all)) {
        r.all.forEach((k) => rows.push({ ...k, market: m.code }));
      }
    });
    return rows
      .filter((r) => r.search_volume && r.search_volume > 0)
      .sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0))
      .slice(0, 20);
  }, [results]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 22, alignItems: "center" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8,
          border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 14px", background: C.card }}>
          <span style={{ fontSize: 16, color: C.muted }}>🔬</span>
          <input
            type="text"
            value={ingredient}
            onChange={(e) => setIngredient(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type an ingredient (e.g. papain, bromelain, NMN)…"
            style={{ border: "none", outline: "none", flex: 1, fontSize: 14, background: "transparent", color: C.ink }}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!ingredient.trim()}
          style={{ fontSize: 13, padding: "8px 20px", borderRadius: 9,
            background: ingredient.trim() ? C.blue : C.faded, color: "white",
            border: "none", fontWeight: 600, cursor: ingredient.trim() ? "pointer" : "not-allowed" }}
        >
          Research
        </button>
      </div>

      {!searched && (
        <div style={{ color: C.muted, fontSize: 13, padding: "40px 20px", textAlign: "center" }}>
          Type any ingredient above and press <b>Research</b>. We'll pull real Google search demand from all 5 markets (USA, UK, Germany, France, Spain) — usually takes about 8 seconds.
        </div>
      )}

      {searched && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10 }}>
            Search demand · 5 markets
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 24 }}>
            {MARKETS.map((m) => {
              const r = results[m.code];
              return (
                <div key={m.code} style={{ background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: "12px 14px", minHeight: 130 }}>
                  <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, marginBottom: 4 }}>{m.label.toUpperCase()}</div>

                  {!r || r.state === "loading" ? (
                    <div style={{ fontSize: 12, color: C.muted, padding: "20px 0", textAlign: "center" }}>
                      Loading…
                    </div>
                  ) : r.state === "error" ? (
                    <div style={{ fontSize: 12, color: C.red, padding: "10px 0" }}>
                      Couldn't fetch: {r.error?.slice(0, 60) || "unknown error"}
                    </div>
                  ) : !r.top ? (
                    <div style={{ fontSize: 12, color: C.muted, padding: "10px 0" }}>
                      No data for "{ingredient}" in this market.
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
                        {fmt(r.top.search_volume)}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.top.keyword} / month
                      </div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600,
                        color: trendColor(r.top.trend_yearly), background: trendColor(r.top.trend_yearly) + "1A",
                        padding: "2px 8px", borderRadius: 100, marginBottom: 6 }}>
                        {trendArrow(r.top.trend_yearly)} {r.top.trend_yearly > 0 ? "+" : ""}{r.top.trend_yearly ?? "—"}% yr
                      </div>
                      {toSpark(r.top.monthly_history).length > 0 && (
                        <div style={{ height: 32 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={toSpark(r.top.monthly_history)} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                              <defs>
                                <linearGradient id={`grc-${m.code}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={C.blue} stopOpacity={0.25} />
                                  <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <Tooltip
                                formatter={(v) => [fmt(v), "searches"]}
                                contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${C.border}` }}
                                labelStyle={{ color: C.muted }}
                              />
                              <Area type="monotone" dataKey="v" stroke={C.blue} strokeWidth={2} fill={`url(#grc-${m.code})`} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {unified.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10 }}>
                Top related search terms · ranked by volume
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, color: C.muted }}>Keyword</th>
                      <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 600, color: C.muted }}>Market</th>
                      <th style={{ textAlign: "right", padding: "10px 14px", fontWeight: 600, color: C.muted }}>Volume</th>
                      <th style={{ textAlign: "center", padding: "10px 14px", fontWeight: 600, color: C.muted }}>Comp.</th>
                      <th style={{ textAlign: "right", padding: "10px 14px", fontWeight: 600, color: C.muted }}>Yr trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unified.map((r, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "9px 14px", color: C.ink }}>{r.keyword}</td>
                        <td style={{ textAlign: "center", padding: "9px 14px", color: C.muted, fontSize: 11, fontWeight: 600 }}>{r.market}</td>
                        <td style={{ textAlign: "right", padding: "9px 14px", color: C.ink, fontWeight: 600 }}>{fmt(r.search_volume)}</td>
                        <td style={{ textAlign: "center", padding: "9px 14px" }}>{compBadge(r.competition)}</td>
                        <td style={{ textAlign: "right", padding: "9px 14px", color: trendColor(r.trend_yearly), fontWeight: 600 }}>
                          {r.trend_yearly > 0 ? "+" : ""}{r.trend_yearly ?? "—"}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div style={{ background: C.bg, borderRadius: 9, padding: "12px 16px", fontSize: 12, color: C.muted,
            display: "flex", gap: 18, flexWrap: "wrap" }}>
            <span>📰 News per country — coming Stage 2</span>
            <span>💬 Reddit threads — coming Stage 3</span>
            <span>🌍 Trade flows — coming Stage 4</span>
          </div>
        </>
      )}
    </div>
  );
}
