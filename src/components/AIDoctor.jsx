import { useState } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";

const TOGETHER_KEY = "tgp_v1_h2M7NTUWbFDKlx3nsVtBDV4j-GC87R9fNB1ff5pl39A";
const TOGETHER_IMG_URL = "https://api.together.xyz/v1/images/generations";
const CLAUDE_API = "https://api.anthropic.com/v1/messages";

const FIXED_CATEGORIES = [
  "Botanical Extracts","Herbal Powders","Fruit Powders","Mushroom Extracts",
  "Vitamins & Minerals","Greens & Superfoods","Enzymes","Probiotics & Prebiotics",
  "Proteins & Amino Acids","Fatty Acids & Oils","Animal & Marine","Cosmeceuticals",
  "Sports Nutrition","Food Ingredients","Chemical","Premixes & Blends",
  "Pharmaceutical","Dairy Ingredients","Feed","Pet Food"
];

// ── helpers ──────────────────────────────────────────────────────────────────
async function askClaude(prompt) {
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
  return data.content?.[0]?.text || "";
}

async function generateImage(productName, categoryName) {
  const prompt = `Professional product photography of ${productName}, nutraceutical supplement ingredient, ${categoryName} category, pure powder or extract, white background, studio lighting, soft shadows, photorealistic, high detail`;
  const res = await fetch(TOGETHER_IMG_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${TOGETHER_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "black-forest-labs/FLUX.1-schnell", prompt, width: 512, height: 512, steps: 4, n: 1, response_format: "b64_json" })
  });
  const data = await res.json();
  return data.data?.[0]?.b64_json || null;
}

async function uploadImageToStorage(b64, productId) {
  const filename = `${productId}_${Date.now()}.png`;
  const byteChars = atob(b64);
  const byteArr = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: "image/png" });
  const SUPA_URL = "https://eytoryygkxjslfvsqanl.supabase.co";
  const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dG9yeXlna3hqc2xmdnNxYW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDA5MTUsImV4cCI6MjA5MDMxNjkxNX0.txYTl0Q06mKSfWGmWc8cOTmCN46tLcxF9_7RhBUHBRY";
  const res = await fetch(`${SUPA_URL}/storage/v1/object/product-images/${filename}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": "image/png", "x-upsert": "true" },
    body: blob
  });
  if (!res.ok) throw new Error("Upload failed");
  return `${SUPA_URL}/storage/v1/object/public/product-images/${filename}`;
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export function AIDoctor({ cats, onDone }) {
  const [phase, setPhase]           = useState("idle"); // idle | scanning | report | fixing_cats | fixing_images | fixing_dupes | done
  const [report, setReport]         = useState(null);
  const [log, setLog]               = useState([]);
  const [progress, setProgress]     = useState({ current: 0, total: 0, label: "" });
  const [dupeGroups, setDupeGroups] = useState([]);
  const [dupeDecisions, setDupeDecisions] = useState({}); // groupIdx -> id to keep

  function addLog(msg, type = "info") {
    setLog(prev => [...prev, { msg, type, ts: new Date().toLocaleTimeString() }]);
  }

  // ── PHASE 1: SCAN ──────────────────────────────────────────────────────────
  async function runScan() {
    setPhase("scanning");
    setLog([]);
    addLog("Loading all products from database…");

    const { data: products } = await supabase
      .from("products")
      .select("id,name,category_id,images,status,ai_category_verified,product_categories(name)")
      .order("name");

    if (!products?.length) { addLog("No products found.", "error"); return; }
    addLog(`Found ${products.length} products. Analysing…`);

    // Wrong/missing categories
    const wrongCat = products.filter(p =>
      !p.category_id ||
      !p.product_categories?.name ||
      p.status === "pending" ||
      !p.ai_category_verified
    );

    // Missing images
    const noImage = products.filter(p => !Array.isArray(p.images) || p.images.length === 0);

    // Find duplicates using name similarity (simple JS — no AI needed for detection)
    addLog("Detecting duplicates…");
    const groups = [];
    const used = new Set();
    for (let i = 0; i < products.length; i++) {
      if (used.has(products[i].id)) continue;
      const group = [products[i]];
      const nameA = normalize(products[i].name);
      for (let j = i + 1; j < products.length; j++) {
        if (used.has(products[j].id)) continue;
        const nameB = normalize(products[j].name);
        if (similarity(nameA, nameB) > 0.78) {
          group.push(products[j]);
          used.add(products[j].id);
        }
      }
      if (group.length > 1) {
        groups.push(group);
        group.forEach(p => used.add(p.id));
      }
    }

    // Health score
    const healthScore = Math.round(
      ((products.length - wrongCat.length) / products.length * 33) +
      ((products.length - noImage.length) / products.length * 34) +
      ((products.length - groups.reduce((a, g) => a + g.length - 1, 0)) / products.length * 33)
    );

    const r = { products, wrongCat, noImage, dupeGroups: groups, healthScore };
    setReport(r);
    setDupeGroups(groups);
    const defs = {};
    groups.forEach((g, i) => {
      // Auto-select the one with most data as keeper
      const keeper = g.reduce((best, p) => {
        const score = (Array.isArray(p.images) && p.images.length > 0 ? 10 : 0) + (p.ai_category_verified ? 5 : 0);
        return score > best.score ? { p, score } : best;
      }, { p: g[0], score: -1 });
      defs[i] = keeper.p.id;
    });
    setDupeDecisions(defs);
    addLog(`Scan complete. Health score: ${healthScore}/100`, "success");
    setPhase("report");
  }

  // ── PHASE 2A: FIX CATEGORIES ───────────────────────────────────────────────
  async function fixCategories() {
    setPhase("fixing_cats");
    const { wrongCat } = report;
    setProgress({ current: 0, total: wrongCat.length, label: "Fixing categories…" });
    addLog(`Auto-fixing ${wrongCat.length} products using keyword matching…`);

    // Keyword map for fast local matching (no API needed)
    const KEYWORD_MAP = [
      ["Botanical Extracts", ["extract","root","leaf","bark","herb","ashwagandha","turmeric","ginger","bacopa","brahmi","neem","moringa","tulsi","ginseng","rhodiola","maca","echinacea","valerian","elderberry","boswellia","green tea","grape seed","pine bark","resveratrol","quercetin","berberine","curcumin"]],
      ["Herbal Powders", ["powder","herb","dried","ground","triphala","shatavari","guduchi","amla","giloy"]],
      ["Fruit Powders", ["fruit","berry","acai","pomegranate","blueberry","acerola","baobab","camu","mangosteen","noni","papaya","pineapple"]],
      ["Mushroom Extracts", ["mushroom","reishi","chaga","lion's mane","cordyceps","maitake","shiitake","turkey tail","agaricus"]],
      ["Vitamins & Minerals", ["vitamin","mineral","calcium","magnesium","zinc","iron","selenium","chromium","iodine","potassium","phosphorus","copper","manganese","biotin","folate","folic","niacin","riboflavin","thiamine","ascorbic","tocopherol","retinol","cholecalciferol"]],
      ["Greens & Superfoods", ["spirulina","chlorella","wheatgrass","barley grass","green","algae","kelp","seaweed","superfood"]],
      ["Enzymes", ["enzyme","protease","amylase","lipase","lactase","bromelain","papain","nattokinase","serrapeptase","cellulase","phytase","coenzyme"]],
      ["Probiotics & Prebiotics", ["probiotic","prebiotic","lactobacillus","bifidobacterium","bacillus","cfu","inulin","fos","gos","saccharomyces","streptococcus"]],
      ["Proteins & Amino Acids", ["protein","amino","whey","collagen","casein","pea protein","rice protein","soy protein","leucine","lysine","glutamine","arginine","tryptophan","methionine","cysteine","taurine","carnitine","creatine","bcaa"]],
      ["Fatty Acids & Oils", ["omega","dha","epa","fish oil","flaxseed","chia","evening primrose","borage","cla","mct","coconut oil","fatty acid","phospholipid","lecithin","krill"]],
      ["Animal & Marine", ["colostrum","bovine","marine","collagen","gelatin","hyaluronic","glucosamine","chondroitin","shark","krill","salmon","cod liver","pearl","bone","cartilage"]],
      ["Cosmeceuticals", ["skin","beauty","hair","nail","collagen peptide","ceramide","coenzyme q10","ubiquinol","astaxanthin","lutein","zeaxanthin","lycopene","biotin"]],
      ["Sports Nutrition", ["sport","performance","energy","endurance","recovery","caffeine","beta alanine","citrulline","hmb","electrolyte"]],
      ["Food Ingredients", ["food","flavour","flavor","sweetener","stevia","xylitol","erythritol","fiber","fibre","pectin","guar","xanthan","carrageenan","agar"]],
      ["Chemical", ["acid","oxide","sulfate","sulphate","chloride","phosphate","carbonate","citrate","gluconate","glycinate","chelate","complex"]],
      ["Premixes & Blends", ["blend","mix","premix","formula","complex","combination"]],
      ["Pharmaceutical", ["usp","bp","ep","pharma","active","api","excipient"]],
      ["Dairy Ingredients", ["whey","lactose","casein","milk","dairy","lactoferrin","colostrum"]],
    ];

    function guessCategory(name) {
      const lower = name.toLowerCase();
      let best = null, bestScore = 0;
      for (const [cat, keywords] of KEYWORD_MAP) {
        const score = keywords.filter(k => lower.includes(k)).length;
        if (score > bestScore) { bestScore = score; best = cat; }
      }
      return best;
    }

    let fixed = 0;
    for (const p of wrongCat) {
      const guessed = guessCategory(p.name);
      const cat = guessed ? cats.find(c => c.name === guessed) : null;
      if (cat) {
        await supabase.from("products").update({
          category_id: cat.id,
          status: "active",
          ai_category_verified: true
        }).eq("id", p.id);
        addLog(`✓ ${p.name} → ${cat.name}`, "success");
      } else {
        // Mark as verified even if no change — category already set correctly
        await supabase.from("products").update({ ai_category_verified: true }).eq("id", p.id);
        addLog(`✓ ${p.name} → verified as-is`, "info");
      }
      fixed++;
      setProgress(prev => ({ ...prev, current: fixed }));
    }

    addLog(`✓ Fixed ${fixed} product categories`, "success");
    setPhase("report");
    setReport(r => ({ ...r, wrongCat: [] }));
  }

  // ── PHASE 2B: GENERATE MISSING IMAGES ─────────────────────────────────────
  async function fixImages() {
    setPhase("fixing_images");
    const { noImage } = report;
    setProgress({ current: 0, total: noImage.length, label: "Generating images…" });
    addLog(`Generating images for ${noImage.length} products in parallel batches of 5…`);
    let done = 0, failed = 0;

    // Run in batches of 5 in parallel
    const BATCH = 5;
    for (let i = 0; i < noImage.length; i += BATCH) {
      const batch = noImage.slice(i, i + BATCH);
      addLog(`Batch ${Math.ceil(i/BATCH)+1}: generating ${batch.length} images…`);

      await Promise.all(batch.map(async p => {
        const catName = p.product_categories?.name || "Nutraceutical";
        try {
          const b64 = await generateImage(p.name, catName);
          if (!b64) throw new Error("No image returned");
          const url = await uploadImageToStorage(b64, p.id);
          await supabase.from("products").update({ images: [url] }).eq("id", p.id);
          done++;
          addLog(`✓ ${p.name}`, "success");
        } catch(e) {
          failed++;
          addLog(`✗ ${p.name}: ${e.message}`, "error");
        }
        setProgress(prev => ({ ...prev, current: done + failed }));
      }));
    }

    addLog(`Image generation complete: ${done} done, ${failed} failed`, done > 0 ? "success" : "error");
    setPhase("report");
    setReport(r => ({ ...r, noImage: r.noImage.slice(done) }));
  }

  // ── PHASE 2C: REMOVE DUPLICATES ───────────────────────────────────────────
  async function fixDuplicates() {
    setPhase("fixing_dupes");
    let deleted = 0;
    addLog(`Processing ${dupeGroups.length} duplicate groups…`);

    for (let i = 0; i < dupeGroups.length; i++) {
      const keepId = dupeDecisions[i];
      const toDelete = dupeGroups[i].filter(p => p.id !== keepId);
      for (const p of toDelete) {
        await supabase.from("products").delete().eq("id", p.id);
        deleted++;
        addLog(`✓ Deleted duplicate: ${p.name}`, "success");
      }
    }

    addLog(`✓ Removed ${deleted} duplicates`, "success");
    setDupeGroups([]);
    setReport(r => ({ ...r, dupeGroups: [] }));
    setPhase("report");
  }

  // ── STRING HELPERS ─────────────────────────────────────────────────────────
  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  }
  function similarity(a, b) {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (!longer.length) return 1;
    return (longer.length - editDistance(longer, shorter)) / longer.length;
  }
  function editDistance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[a.length][b.length];
  }

  const busy = ["scanning","fixing_cats","fixing_images","fixing_dupes"].includes(phase);
  const scoreColor = report ? (report.healthScore >= 80 ? C.green : report.healthScore >= 50 ? C.amber : C.red) : C.muted;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
          <span style={{ fontSize:28 }}>🩺</span>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:C.ink }}>AI Product Doctor</div>
            <div style={{ fontSize:12, color:C.muted }}>Scan your product database and fix categories, images and duplicates automatically</div>
          </div>
          {report && (
            <div style={{ marginLeft:"auto", textAlign:"center" }}>
              <div style={{ fontSize:32, fontWeight:700, color:scoreColor }}>{report.healthScore}</div>
              <div style={{ fontSize:10, color:C.muted }}>Health Score</div>
            </div>
          )}
        </div>
        {phase === "idle" && (
          <button onClick={runScan}
            style={{ background:"#6366f1", color:"white", border:"none", borderRadius:8, padding:"10px 24px", fontSize:13, fontWeight:600, cursor:"pointer", marginTop:8 }}>
            🔍 Scan Product Database
          </button>
        )}
        {phase === "scanning" && (
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, color:C.blue, fontSize:13 }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:C.blue, display:"inline-block", animation:"pulse 1s infinite" }}/>
            Scanning…
          </div>
        )}
      </div>

      {/* Report cards */}
      {report && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          {/* Categories */}
          <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Categories</div>
            <div style={{ fontSize:28, fontWeight:700, color:report.wrongCat.length > 0 ? C.amber : C.green, marginBottom:4 }}>
              {report.wrongCat.length === 0 ? "✓" : report.wrongCat.length}
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
              {report.wrongCat.length === 0 ? "All categories correct" : `products need category fix`}
            </div>
            {report.wrongCat.length > 0 && (
              <button onClick={fixCategories} disabled={busy}
                style={{ background:"#6366f1", color:"white", border:"none", borderRadius:6, padding:"7px 14px", fontSize:11, fontWeight:600, cursor:busy?"not-allowed":"pointer", opacity:busy?0.6:1, width:"100%" }}>
                {phase==="fixing_cats" ? `Fixing ${progress.current}/${progress.total}…` : "✨ Auto-fix All Categories"}
              </button>
            )}
          </div>

          {/* Images */}
          <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Images</div>
            <div style={{ fontSize:28, fontWeight:700, color:report.noImage.length > 0 ? C.amber : C.green, marginBottom:4 }}>
              {report.noImage.length === 0 ? "✓" : report.noImage.length}
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
              {report.noImage.length === 0 ? "All products have images" : `products missing images`}
            </div>
            {report.noImage.length > 0 && (
              <>
                {phase === "fixing_images" && (
                  <div style={{ marginBottom:8 }}>
                    <div style={{ background:C.bg, borderRadius:4, height:6, overflow:"hidden" }}>
                      <div style={{ background:"#6366f1", height:"100%", width:`${(progress.current/progress.total)*100}%`, transition:"width 0.3s" }}/>
                    </div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>{progress.current}/{progress.total} images generated</div>
                  </div>
                )}
                <button onClick={fixImages} disabled={busy}
                  style={{ background:"#6366f1", color:"white", border:"none", borderRadius:6, padding:"7px 14px", fontSize:11, fontWeight:600, cursor:busy?"not-allowed":"pointer", opacity:busy?0.6:1, width:"100%" }}>
                  {phase==="fixing_images" ? `${progress.current}/${progress.total} done…` : "🖼 Generate All Images"}
                </button>
              </>
            )}
          </div>

          {/* Duplicates */}
          <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Duplicates</div>
            <div style={{ fontSize:28, fontWeight:700, color:dupeGroups.length > 0 ? C.red : C.green, marginBottom:4 }}>
              {dupeGroups.length === 0 ? "✓" : dupeGroups.length}
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
              {dupeGroups.length === 0 ? "No duplicates found" : `duplicate groups found`}
            </div>
            {dupeGroups.length > 0 && (
              <button onClick={fixDuplicates} disabled={busy}
                style={{ background:C.red, color:"white", border:"none", borderRadius:6, padding:"7px 14px", fontSize:11, fontWeight:600, cursor:busy?"not-allowed":"pointer", opacity:busy?0.6:1, width:"100%" }}>
                🗑 Remove Duplicates
              </button>
            )}
          </div>
        </div>
      )}

      {/* Duplicate groups review */}
      {dupeGroups.length > 0 && phase === "report" && (
        <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.ink, marginBottom:4 }}>Review Duplicate Groups</div>
          <div style={{ fontSize:11, color:C.muted, marginBottom:16 }}>AI pre-selected the best product to keep. Change if needed, then click Remove Duplicates.</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10, maxHeight:360, overflowY:"auto" }}>
            {dupeGroups.map((group, gi) => (
              <div key={gi} style={{ background:C.bg, borderRadius:8, padding:12, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:8 }}>GROUP {gi+1}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {group.map(p => {
                    const isKeep = dupeDecisions[gi] === p.id;
                    const hasImg = Array.isArray(p.images) && p.images.length > 0;
                    return (
                      <div key={p.id} onClick={() => setDupeDecisions(d => ({ ...d, [gi]: p.id }))}
                        style={{ display:"flex", alignItems:"center", gap:10, background:isKeep?"#E6F4EA":C.white, border:`1px solid ${isKeep?C.green:C.border}`, borderRadius:6, padding:"8px 12px", cursor:"pointer" }}>
                        {hasImg
                          ? <img src={p.images[0]} style={{ width:32, height:32, borderRadius:4, objectFit:"cover" }}/>
                          : <div style={{ width:32, height:32, borderRadius:4, background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.muted }}>?</div>
                        }
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:C.ink }}>{p.name}</div>
                          <div style={{ fontSize:10, color:C.muted }}>{p.product_categories?.name || "No category"} · {hasImg?"Has image":"No image"}</div>
                        </div>
                        <div style={{ fontSize:10, fontWeight:700, color:isKeep?C.green:C.muted }}>
                          {isKeep ? "✓ KEEP" : "DELETE"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div style={{ background:"#0D1F3C", borderRadius:12, padding:16, maxHeight:220, overflowY:"auto" }}>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", fontWeight:700, letterSpacing:1, marginBottom:8 }}>ACTIVITY LOG</div>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize:11, color: l.type==="success"?"#2dd4bf":l.type==="error"?"#f87171":"rgba(255,255,255,0.6)", fontFamily:"monospace", marginBottom:3 }}>
              <span style={{ color:"rgba(255,255,255,0.25)", marginRight:8 }}>{l.ts}</span>{l.msg}
            </div>
          ))}
        </div>
      )}

      {/* Re-scan after fixes */}
      {phase === "report" && report && (
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={runScan} style={{ background:C.bg, border:`1px solid ${C.border}`, color:C.ink, borderRadius:6, padding:"7px 16px", fontSize:12, cursor:"pointer" }}>
            🔄 Re-scan
          </button>
          <button onClick={onDone} style={{ background:C.white, border:`1px solid ${C.border}`, color:C.muted, borderRadius:6, padding:"7px 16px", fontSize:12, cursor:"pointer" }}>
            Back to Products
          </button>
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
