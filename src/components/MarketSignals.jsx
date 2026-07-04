import { useState, useEffect } from "react";
import { C } from "../constants.js";
import { supabase } from "../config.js";

// Colour a signal by its relevance score
function scoreColor(s) {
  if (s >= 40) return "#1E7A46";   // strong — deep green
  if (s >= 25) return "#42B72A";   // good — green
  if (s >= 15) return "#1877F2";   // fair — blue
  return "#8A8D91";                 // weak — grey
}

export function MarketSignals() {
  const [signals, setSignals] = useState([]);
  const [batchAt, setBatchAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const { data: latest, error: e1 } = await supabase
        .from("market_signals").select("batch_at")
        .order("batch_at", { ascending: false }).limit(1);
      if (e1) throw e1;
      const b = latest?.[0]?.batch_at;
      if (!b) { setSignals([]); setBatchAt(null); setLoading(false); return; }
      setBatchAt(b);
      const { data, error } = await supabase
        .from("market_signals").select("*")
        .eq("batch_at", b).order("score", { ascending: false });
      if (error) throw error;
      setSignals(data || []);
    } catch (e) { setErr(String(e.message || e)); }
    setLoading(false);
  }

  const card = { background: C.card, borderRadius: 10, border: `1px solid ${C.border}` };
  const fmt = d => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>
            Market Signals {signals.length > 0 && <span style={{ fontSize: 12, color: C.blue, fontWeight: 400 }}>{signals.length} this week</span>}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            Nutraceutical news across 5 markets · powers the Content Engine{batchAt ? ` · updated ${fmt(batchAt)}` : ""}
          </div>
        </div>
        <button onClick={load} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: C.ink, cursor: "pointer" }}>↻ Refresh</button>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading signals…</div>
      ) : err ? (
        <div style={{ ...card, padding: 24, color: C.red, fontSize: 13 }}>Couldn't load signals: {err}</div>
      ) : signals.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          No signals yet.<br />
          The Content Engine saves them every Sunday — or run <b style={{ fontFamily: "monospace", color: C.ink }}>refreshSignalsNow()</b> in Apps Script to populate now.
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          {signals.map((s, i) => {
            const col = scoreColor(s.score);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 8, background: `${col}18`, border: `1px solid ${col}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: col }}>
                  {s.score}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.ink, fontWeight: 500, lineHeight: 1.4 }}>{s.term}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    <span style={{ fontWeight: 600 }}>{s.market}</span>{s.source ? ` · ${s.source}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
        Score reflects how nutraceutical-relevant each headline is. The top signal each week seeds the auto-generated draft article (see the Content tab).
      </div>
    </div>
  );
}
