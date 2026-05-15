import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";

const CLAUDE_API = "https://api.anthropic.com/v1/messages";

// ── GENERATE DESCRIPTION FOR A BATCH OF PRODUCTS ──────────────────────────
async function enrichBatch(products) {
  const prompt = `You are an expert nutraceutical ingredient copywriter. Write SEO-optimised product descriptions for each ingredient below.

For each product return ONLY a JSON array — no markdown, no preamble.

Rules:
- 120-180 words per description
- Start with what the ingredient IS and where it comes from
- Include key benefits and applications for supplement manufacturers
- Mention quality indicators (purity %, extraction method, grade) where relevant
- Include 3-5 natural long-tail SEO keywords buyers search for (e.g. "wholesale ashwagandha extract supplier", "bulk colostrum powder USA")
- Professional B2B tone — written for procurement managers and formulators
- Never mention price or "contact us"

Products:
${JSON.stringify(products.map(p => ({
  id: p.id,
  name: p.name,
  category: p.product_categories?.name || "Nutraceutical",
  cas: p.cas_number || "",
  tags: Array.isArray(p.tags) ? p.tags.join(", ") : ""
})))}

Return format (JSON array only):
[{"id":"...","description":"...","short_description":"..."}]

short_description = 1 sentence, max 25 words, used as meta description opener.`;

  const res = await fetch(CLAUDE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────
export function SEOEnrichment({ onDone }) {
  const [phase, setPhase] = useState("idle"); // idle | scanning | running | done | paused
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [currentBatch, setCurrentBatch] = useState([]);
  const [log, setLog] = useState([]);
  const [paused, setPaused] = useState(false);
  const pauseRef = { current: false };

  function addLog(msg, type = "info") {
    setLog(prev => [...prev.slice(-60), { msg, type, ts: new Date().toLocaleTimeString() }]);
  }

  async function startEnrichment() {
    setPhase("running");
    setProcessed(0);
    setFailed(0);
    setLog([]);
    pauseRef.current = false;

    // Fetch all products without descriptions
    addLog("Loading products without descriptions…");
    const { data: products, error } = await supabase
      .from("products")
      .select("id,name,product_categories(name),cas_number,tags,status")
      .or("description.is.null,description.eq.")
      .eq("status", "active")
      .order("name");

    if (error || !products?.length) {
      addLog("No products found or error loading.", "error");
      setPhase("idle");
      return;
    }

    setTotal(products.length);
    addLog(`Found ${products.length} products to enrich. Starting…`, "success");

    const BATCH_SIZE = 8;
    let done = 0;
    let fails = 0;

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      // Check pause
      while (pauseRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }

      const batch = products.slice(i, i + BATCH_SIZE);
      setCurrentBatch(batch.map(p => p.name));
      addLog(`Batch ${Math.ceil(i / BATCH_SIZE) + 1}: enriching ${batch.length} products…`);

      try {
        const results = await enrichBatch(batch);

        // Save to Supabase
        for (const r of results) {
          const { error: upErr } = await supabase
            .from("products")
            .update({
              description: r.description,
              short_description: r.short_description
            })
            .eq("id", r.id);

          if (upErr) {
            fails++;
            addLog(`✗ Save failed for ${r.id}: ${upErr.message}`, "error");
          } else {
            done++;
            addLog(`✓ ${batch.find(p => p.id === r.id)?.name || r.id}`, "success");
          }
        }
      } catch (e) {
        fails += batch.length;
        addLog(`✗ Batch error: ${e.message}`, "error");
      }

      setProcessed(done);
      setFailed(fails);

      // Small delay between batches to avoid rate limits
      await new Promise(r => setTimeout(r, 800));
    }

    setPhase("done");
    setCurrentBatch([]);
    addLog(`✅ Enrichment complete! ${done} products updated, ${fails} failed.`, "success");
  }

  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
  const busy = phase === "running";
  const eta = total > 0 && processed > 0
    ? Math.round(((total - processed) / processed) * (processed * 1.5))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <span style={{ fontSize: 28 }}>✍️</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>AI SEO Description Enrichment</div>
            <div style={{ fontSize: 12, color: C.muted }}>Generate SEO-optimised product descriptions for all {total || "751"} products using Claude AI</div>
          </div>
          {phase === "done" && (
            <div style={{ marginLeft: "auto", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#166534" }}>
              ✅ Complete
            </div>
          )}
        </div>

        {/* What it does */}
        {phase === "idle" && (
          <div style={{ background: C.bg, borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              ["📝", "120-180 word descriptions", "SEO-optimised for B2B buyers"],
              ["🔍", "Long-tail keywords", "Natural search terms embedded"],
              ["⚡", "8 products per batch", "~90 products/minute"],
              ["💾", "Auto-saves to Supabase", "Goes live on website instantly"],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.ink }}>{title}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {phase === "idle" && (
            <button onClick={startEnrichment} style={{ background: "#6366f1", color: "white", border: "none", borderRadius: 7, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              🚀 Start Enrichment
            </button>
          )}
          {phase === "running" && (
            <>
              <button onClick={() => { pauseRef.current = true; setPhase("paused"); }}
                style={{ background: C.amber, color: "white", border: "none", borderRadius: 7, padding: "10px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                ⏸ Pause
              </button>
              <div style={{ fontSize: 12, color: C.muted, alignSelf: "center" }}>
                Processing {currentBatch[0]} {currentBatch.length > 1 ? `and ${currentBatch.length - 1} more…` : "…"}
              </div>
            </>
          )}
          {phase === "paused" && (
            <>
              <button onClick={() => { pauseRef.current = false; setPhase("running"); }}
                style={{ background: "#6366f1", color: "white", border: "none", borderRadius: 7, padding: "10px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                ▶ Resume
              </button>
              <div style={{ fontSize: 12, color: C.amber, alignSelf: "center" }}>⏸ Paused at {processed}/{total}</div>
            </>
          )}
          {phase === "done" && (
            <>
              <button onClick={onDone} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.ink, borderRadius: 7, padding: "10px 20px", fontSize: 12, cursor: "pointer" }}>
                Back to Products
              </button>
              <button onClick={() => { setPhase("idle"); setTotal(0); setProcessed(0); setFailed(0); setLog([]); }}
                style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 7, padding: "10px 20px", fontSize: 12, cursor: "pointer" }}>
                Run Again (for failed)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress */}
      {(busy || phase === "paused" || phase === "done") && total > 0 && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              {processed} / {total} products enriched
              {failed > 0 && <span style={{ color: C.red, marginLeft: 8 }}>({failed} failed)</span>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1" }}>{progress}%</div>
          </div>

          {/* Progress bar */}
          <div style={{ background: C.bg, borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#6366f1,#8b5cf6)", borderRadius: 6, transition: "width 0.5s" }}/>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 12 }}>
            {[
              ["✅ Enriched", processed, "#22c55e"],
              ["❌ Failed", failed, C.red],
              ["⏳ Remaining", total - processed, "#94a3b8"],
              ["⚡ ETA", eta ? `~${eta}s` : "—", "#6366f1"],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: C.bg, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity log */}
      {log.length > 0 && (
        <div style={{ background: "#0D1F3C", borderRadius: 12, padding: 16, maxHeight: 280, overflowY: "auto" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>ACTIVITY LOG</div>
          {log.map((l, i) => (
            <div key={i} style={{
              fontSize: 11, fontFamily: "monospace", marginBottom: 3,
              color: l.type === "success" ? "#2dd4bf" : l.type === "error" ? "#f87171" : "rgba(255,255,255,0.55)"
            }}>
              <span style={{ color: "rgba(255,255,255,0.2)", marginRight: 8 }}>{l.ts}</span>{l.msg}
            </div>
          ))}
        </div>
      )}

      {/* SEO Preview - shows last enriched product */}
      {log.filter(l => l.type === "success" && l.msg.startsWith("✓")).length > 0 && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
            SEO Impact
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {[
              ["Pages with content", `${processed}/751`, "Google ranks pages with rich content higher"],
              ["Avg description length", "~150 words", "Optimal for Google snippet extraction"],
              ["Keywords per page", "3-5", "Long-tail B2B search terms embedded"],
            ].map(([label, val, desc]) => (
              <div key={label} style={{ background: C.bg, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#6366f1", marginBottom: 2 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
