import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";

const PROXY = "https://eytoryygkxjslfvsqanl.supabase.co/functions/v1/claude-proxy";
const MODEL = "claude-sonnet-4-6";   // current model (claude-sonnet-4-20250514 retired 2026-04-20 → 404)

const THEMES = [
  { id:"buyers_guide",  label:"📋 Buyer's Guide",      desc:"Complete sourcing guide for B2B buyers" },
  { id:"science",       label:"🔬 Science & Benefits",  desc:"Deep-dive into research and mechanisms" },
  { id:"sourcing",      label:"🌍 Wholesale Sourcing",  desc:"How to source, what to check, pricing" },
  { id:"market_trends", label:"📈 Market Trends 2026",  desc:"Industry trends and market outlook" },
  { id:"formulation",   label:"⚗️ Formulation Tips",   desc:"How to use in supplement formulations" },
  { id:"supplier",      label:"🏭 Supplier Guide",      desc:"Choosing a reliable supplier" },
];

function slugify(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
}

// ── Split into 2 calls to avoid Edge Function timeout ──────────────────────
async function callProxy(payload) {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Proxy ${res.status}: ${t.slice(0,150)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.content?.[0]?.text || "";
}

async function generateArticle(productName, theme, customKeyword) {
  const topic = customKeyword || productName;
  const themeLabel = THEMES.find(t => t.id === theme)?.label || theme;

  // Call 1 — article content only (kept short for proxy timeout)
  const articlePrompt = `Write a B2B nutraceutical blog article for Ingredientz (global ingredients B2B platform).
Product: ${topic}
Theme: ${themeLabel}
Audience: procurement managers, formulators in USA, UK, EU.

Return ONLY valid JSON, no markdown:
{
  "title": "SEO title 55 chars max",
  "meta_description": "150 char meta",
  "excerpt": "2 sentence summary",
  "keywords": ["kw1","kw2","kw3","kw4","kw5"],
  "content": "HTML 600-800 words. Use h2,h3,p,ul,li,strong. Intro + 3 sections + brief Ingredientz mention at end."
}`;

  const articleRaw = await callProxy({
    model: MODEL,
    max_tokens: 2500,
    messages: [{ role: "user", content: articlePrompt }]
  });
  const article = JSON.parse(articleRaw.replace(/```json|```/g,"").trim());

  // Call 2 — social posts only (fast, separate call)
  const socialPrompt = `Write social media posts for this nutraceutical article titled: "${article.title}"
About: ${topic}

Return ONLY valid JSON:
{
  "linkedin_post": "130 word professional LinkedIn post with 3 hashtags",
  "whatsapp_message": "50 word WhatsApp message with [LINK]",
  "twitter_post": "200 char tweet with 2 hashtags and [LINK]"
}`;

  const socialRaw = await callProxy({
    model: MODEL,
    max_tokens: 800,
    messages: [{ role: "user", content: socialPrompt }]
  });
  const social = JSON.parse(socialRaw.replace(/```json|```/g,"").trim());

  return { ...article, ...social };
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────
export function ContentEngine() {
  const [tab, setTab]               = useState("generate");
  const [productName, setProductName] = useState("");
  const [theme, setTheme]           = useState("buyers_guide");
  const [customKeyword, setCustomKeyword] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep]       = useState(""); // "article" | "social" | ""
  const [result, setResult]         = useState(null);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [selectedSites, setSelectedSites] = useState(["ingredientz"]);
  const [activeSocial, setActiveSocial]   = useState("linkedin");
  const [copied, setCopied]         = useState("");
  const [posts, setPosts]           = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [error, setError]           = useState("");

  useEffect(() => { if (tab === "posts") loadPosts(); }, [tab]);

  async function loadPosts() {
    setLoadingPosts(true);
    const { data } = await supabase
      .from("blog_posts")
      .select("id,title,slug,status,theme,product_name,source,site,created_at,excerpt")
      .order("created_at", { ascending: false })
      .limit(50);
    setPosts(data || []);
    setLoadingPosts(false);
  }

  function toggleSite(site) {
    setSelectedSites(prev =>
      prev.includes(site) ? prev.filter(s => s !== site) : [...prev, site]
    );
  }

  async function generate() {
    if (!productName && !customKeyword) return;
    setGenerating(true);
    setResult(null);
    setSaved(false);
    setError("");
    try {
      setGenStep("article");
      const article = await generateArticle(productName, theme, customKeyword);
      setGenStep("social");
      setResult(article);
    } catch(e) {
      setError("Generation failed: " + e.message);
    } finally {
      setGenerating(false);
      setGenStep("");
    }
  }

  async function savePost(status = "draft") {
    if (!result) return;
    if (selectedSites.length === 0) { alert("Select at least one website."); return; }
    setSaving(true);
    try {
      const slug = slugify(result.title) + "-" + Date.now();
      const { error: err } = await supabase.from("blog_posts").insert({
        title: result.title,
        slug,
        meta_description: result.meta_description,
        content: result.content,
        excerpt: result.excerpt,
        product_name: productName || customKeyword,
        theme,
        keywords: result.keywords,
        status,
        source: "manual",
        site: selectedSites,
        trending_topic: customKeyword || null,
        linkedin_post: result.linkedin_post,
        whatsapp_message: result.whatsapp_message,
        twitter_post: result.twitter_post,
        published_at: status === "published" ? new Date().toISOString() : null,
      });
      if (err) throw new Error(err.message);
      setSaved(true);
    } catch(e) {
      alert("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(post) {
    const newStatus = post.status === "published" ? "draft" : "published";
    await supabase.from("blog_posts").update({
      status: newStatus,
      published_at: newStatus === "published" ? new Date().toISOString() : null
    }).eq("id", post.id);
    loadPosts();
  }

  async function deletePost(id) {
    if (!confirm("Delete this article?")) return;
    await supabase.from("blog_posts").delete().eq("id", id);
    loadPosts();
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  const T = (active) => ({
    padding: "7px 16px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600,
    cursor: "pointer", background: active ? C.blue : C.bg, color: active ? "white" : C.muted
  });

  const SITE_OPTIONS = [
    { id: "ingredientz",   label: "🌐 Ingredientz.co" },
    { id: "purecolostrum", label: "💧 PureColostrum.co" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>📰</span>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:C.ink }}>Content Engine</div>
            <div style={{ fontSize:11, color:C.muted }}>AI articles · Auto-publish to ingredientz.co + purecolostrum.co</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {[["generate","✍️ Generate"],["posts","📋 All Posts"],["autopilot","🤖 Auto-Pilot"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={T(tab===id)}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── GENERATE TAB ── */}
      {tab==="generate" && (
        <div style={{ display:"grid", gridTemplateColumns: result ? "360px 1fr" : "480px", gap:16, justifyContent: result ? "stretch" : "flex-start" }}>

          {/* Form */}
          <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.ink }}>Generate Article</div>

            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>PRODUCT NAME *</label>
              <input value={productName} onChange={e=>setProductName(e.target.value)}
                placeholder="e.g. Ashwagandha Extract, Shilajit…"
                style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:7, padding:"9px 12px", fontSize:13, outline:"none" }}/>
            </div>

            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>TRENDING KEYWORD (optional)</label>
              <input value={customKeyword} onChange={e=>setCustomKeyword(e.target.value)}
                placeholder="Paste a trending topic from Google Trends…"
                style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:7, padding:"9px 12px", fontSize:13, outline:"none" }}/>
            </div>

            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:8 }}>ARTICLE THEME</label>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {THEMES.map(t=>(
                  <label key={t.id} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", padding:"7px 10px", borderRadius:7, background:theme===t.id?"#EEF4FF":C.bg, border:`1px solid ${theme===t.id?C.blue:C.border}` }}>
                    <input type="radio" value={t.id} checked={theme===t.id} onChange={()=>setTheme(t.id)}/>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:theme===t.id?C.blue:C.ink }}>{t.label}</div>
                      <div style={{ fontSize:10, color:C.muted }}>{t.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:7, padding:"8px 12px", fontSize:12, color:"#DC2626" }}>{error}</div>}

            <button onClick={generate} disabled={generating||(!productName&&!customKeyword)}
              style={{ background:generating?C.muted:C.blue, border:"none", color:"white", borderRadius:8, padding:"11px", fontSize:13, fontWeight:600, cursor:generating?"not-allowed":"pointer" }}>
              {generating
                ? genStep==="article" ? "✨ Writing article…" : "✨ Generating social posts…"
                : "🚀 Generate Article"}
            </button>

            {generating && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>
                  {genStep==="article" ? "Step 1/2 — Writing article (15-20s)…" : "Step 2/2 — Writing social posts…"}
                </div>
                <div style={{ background:C.bg, borderRadius:4, height:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", background:C.blue, borderRadius:4, width:genStep==="article"?"50%":"90%", transition:"width 0.5s" }}/>
                </div>
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

              {/* Article preview */}
              <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Generated Article</div>
                <div style={{ fontFamily:"Georgia,serif", fontSize:19, fontWeight:700, color:C.ink, marginBottom:6, lineHeight:1.3 }}>{result.title}</div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:10, lineHeight:1.6 }}>{result.meta_description}</div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
                  {result.keywords?.map(k=>(
                    <span key={k} style={{ background:"#EEF4FF", border:`1px solid ${C.blue}30`, color:C.blue, borderRadius:4, padding:"2px 8px", fontSize:10 }}>{k}</span>
                  ))}
                </div>
                <div style={{ background:C.bg, borderRadius:8, padding:14, maxHeight:300, overflowY:"auto", fontSize:12, lineHeight:1.8 }}
                  dangerouslySetInnerHTML={{ __html:result.content }}/>
              </div>

              {/* Social media */}
              <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>Social Media Pack</div>
                <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                  {[["linkedin","💼 LinkedIn"],["whatsapp","📱 WhatsApp"],["twitter","🐦 Twitter/X"]].map(([id,label])=>(
                    <button key={id} onClick={()=>setActiveSocial(id)} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${activeSocial===id?C.blue:C.border}`, background:activeSocial===id?"#EEF4FF":C.bg, color:activeSocial===id?C.blue:C.muted, fontSize:11, fontWeight:600, cursor:"pointer" }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ background:C.bg, borderRadius:8, padding:12, fontSize:12, lineHeight:1.7, whiteSpace:"pre-wrap", marginBottom:8, minHeight:80 }}>
                  {activeSocial==="linkedin"&&result.linkedin_post}
                  {activeSocial==="whatsapp"&&result.whatsapp_message}
                  {activeSocial==="twitter"&&result.twitter_post}
                </div>
                <button onClick={()=>copy(activeSocial==="linkedin"?result.linkedin_post:activeSocial==="whatsapp"?result.whatsapp_message:result.twitter_post, activeSocial)}
                  style={{ background:copied===activeSocial?"#10B981":C.bg, border:`1px solid ${C.border}`, color:copied===activeSocial?"white":C.muted, borderRadius:6, padding:"5px 14px", fontSize:11, cursor:"pointer" }}>
                  {copied===activeSocial?"✓ Copied!":"📋 Copy"}
                </button>
              </div>

              {/* Publish */}
              {!saved ? (
                <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:12 }}>PUBLISH TO</div>
                  <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                    {SITE_OPTIONS.map(({id,label})=>(
                      <label key={id} onClick={()=>toggleSite(id)}
                        style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", padding:"10px 16px", borderRadius:8, border:`2px solid ${selectedSites.includes(id)?C.blue:C.border}`, background:selectedSites.includes(id)?"#EEF4FF":"white", flex:1, justifyContent:"center" }}>
                        <input type="checkbox" checked={selectedSites.includes(id)} onChange={()=>{}} style={{ accentColor:C.blue }}/>
                        <span style={{ fontSize:12, fontWeight:700, color:selectedSites.includes(id)?C.blue:C.muted }}>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    <button onClick={()=>savePost("published")} disabled={saving||selectedSites.length===0}
                      style={{ flex:1, background:C.blue, border:"none", color:"white", borderRadius:8, padding:"11px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                      {saving?"Saving…":"🌐 Publish Now"}
                    </button>
                    <button onClick={()=>savePost("draft")} disabled={saving}
                      style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, color:C.ink, borderRadius:8, padding:"11px", fontSize:13, cursor:"pointer" }}>
                      💾 Save as Draft
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:12, padding:18, textAlign:"center" }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#166534", marginBottom:4 }}>✅ Article saved!</div>
                  <div style={{ fontSize:12, color:"#15803d" }}>
                    Published to: {selectedSites.map(s=>s==="ingredientz"?"ingredientz.co/blog":"purecolostrum.co/blog").join(" + ")}
                  </div>
                  <button onClick={()=>{ setResult(null); setSaved(false); setProductName(""); setCustomKeyword(""); setSelectedSites(["ingredientz"]); }}
                    style={{ marginTop:12, background:"none", border:`1px solid #BBF7D0`, color:"#166534", borderRadius:6, padding:"6px 16px", fontSize:12, cursor:"pointer" }}>
                    + Generate Another
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ALL POSTS TAB ── */}
      {tab==="posts" && (
        <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.ink }}>All Articles ({posts.length})</div>
            <button onClick={()=>setTab("generate")} style={{ background:C.blue, border:"none", color:"white", borderRadius:6, padding:"7px 16px", fontSize:12, fontWeight:600, cursor:"pointer" }}>+ New Article</button>
          </div>
          {loadingPosts?(
            <div style={{ textAlign:"center", padding:40, color:C.muted }}>Loading…</div>
          ):posts.length===0?(
            <div style={{ textAlign:"center", padding:40, color:C.muted }}>
              <div style={{ fontSize:32, marginBottom:10 }}>📝</div>
              <div>No articles yet. Generate your first one!</div>
            </div>
          ):(
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {posts.map(p=>(
                <div key={p.id} style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.ink, marginBottom:2 }}>{p.title}</div>
                    <div style={{ fontSize:11, color:C.muted }}>
                      {p.product_name} · {THEMES.find(t=>t.id===p.theme)?.label||p.theme} · {new Date(p.created_at).toLocaleDateString()}
                    </div>
                    {p.site&&(
                      <div style={{ display:"flex", gap:4, marginTop:4 }}>
                        {p.site.map(s=>(
                          <span key={s} style={{ background:s==="ingredientz"?"#EEF4FF":"#e7f0fd", color:C.blue, border:`1px solid ${C.blue}30`, borderRadius:20, padding:"1px 8px", fontSize:9, fontWeight:600 }}>
                            {s==="ingredientz"?"🌐 Ingredientz":"💧 PureColostrum"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ background:p.status==="published"?"#DCFCE7":"#FEF9C3", color:p.status==="published"?"#166534":"#854D0E", border:`1px solid ${p.status==="published"?"#BBF7D0":"#FDE68A"}`, borderRadius:20, padding:"2px 10px", fontSize:10, fontWeight:600 }}>
                      {p.status==="published"?"✓ Published":"Draft"}
                    </span>
                    <button onClick={()=>toggleStatus(p)} style={{ background:C.bg, border:`1px solid ${C.border}`, color:C.muted, borderRadius:5, padding:"4px 10px", fontSize:10, cursor:"pointer" }}>
                      {p.status==="published"?"Unpublish":"Publish"}
                    </button>
                    <a href={`https://www.ingredientz.co/blog/${p.slug}`} target="_blank" style={{ background:"#EEF4FF", border:"none", color:C.blue, borderRadius:5, padding:"4px 10px", fontSize:10, cursor:"pointer", textDecoration:"none" }}>View</a>
                    <button onClick={()=>deletePost(p.id)} style={{ background:"#FEF2F2", border:"none", color:"#EF4444", borderRadius:5, padding:"4px 10px", fontSize:10, cursor:"pointer" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AUTOPILOT TAB ── */}
      {tab==="autopilot" && (
        <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:24 }}>
          <div style={{ fontSize:15, fontWeight:700, color:C.ink, marginBottom:6 }}>🤖 Auto-Pilot Mode</div>
          <div style={{ fontSize:12, color:C.muted, lineHeight:1.8, marginBottom:20 }}>
            The Content Engine Google Apps Script runs on a weekly trigger, pulls trending nutraceutical news, generates a draft, and emails you to review + publish. (See your deployed <strong>ContentEngine.gs</strong> for the live version.)
          </div>
          <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:8, padding:14 }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#1E40AF", marginBottom:4 }}>ℹ️ Note</div>
            <div style={{ fontSize:11, color:"#1D4ED8", lineHeight:1.8 }}>
              The autopilot is managed in Google Apps Script (not here). This tab is just a reference.
              The live script uses model <strong>claude-sonnet-4-6</strong> and posts drafts to the All Posts tab for review.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
