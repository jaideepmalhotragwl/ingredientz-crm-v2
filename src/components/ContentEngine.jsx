import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";

const CLAUDE_PROXY = "https://eytoryygkxjslfvsqanl.supabase.co/functions/v1/claude-proxy";

const THEMES = [
  { id: "buyers_guide", label: "📋 Buyer's Guide", desc: "Complete sourcing guide for B2B buyers" },
  { id: "science", label: "🔬 Science & Benefits", desc: "Deep-dive into research and mechanisms" },
  { id: "sourcing", label: "🌍 Wholesale Sourcing", desc: "How to source, what to check, pricing" },
  { id: "market_trends", label: "📈 Market Trends 2026", desc: "Industry trends and market outlook" },
  { id: "formulation", label: "⚗️ Formulation Tips", desc: "How to use in supplement formulations" },
  { id: "supplier", label: "🏭 Supplier Guide", desc: "Choosing a reliable supplier" },
];

const SOCIAL_PLATFORMS = ["linkedin", "whatsapp", "twitter"];

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function callClaude(prompt, maxTokens = 4000) {
  const res = await fetch(CLAUDE_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// ── ARTICLE GENERATOR ──────────────────────────────────────────────────────
async function generateArticle({ productName, theme, trendingTopic, customKeyword }) {
  const topic = trendingTopic || customKeyword || productName;
  const themeLabel = THEMES.find(t => t.id === theme)?.label || theme;

  const prompt = `You are an expert nutraceutical industry content writer for Ingredientz — a global B2B nutraceutical ingredients platform.

Write a comprehensive SEO-optimised blog article. Return ONLY valid JSON, no markdown.

Topic: ${topic}
Product focus: ${productName || topic}
Article theme: ${themeLabel}
${trendingTopic ? `Trending context: This topic is trending in nutraceutical industry right now — ${trendingTopic}` : ""}

Write the article targeting procurement managers, supplement formulators and nutraceutical brand owners in USA, UK, Germany, France, Spain and Canada.

Return this exact JSON structure:
{
  "title": "SEO-optimised title, 50-60 chars, includes primary keyword",
  "meta_description": "155-160 char meta description with CTA",
  "excerpt": "2-3 sentence article summary for listing page",
  "keywords": ["keyword1","keyword2","keyword3","keyword4","keyword5"],
  "content": "Full HTML article body (no <html>/<body> tags). Use <h2>, <h3>, <p>, <ul>, <li>, <strong> tags. 900-1200 words. Include: introduction, 4-5 main sections with subheadings, practical B2B advice, subtle mention of Ingredientz as a trusted supplier at the end.",
  "linkedin_post": "Professional LinkedIn post 150-200 words with 3-4 hashtags. Shares key insight from article.",
  "whatsapp_message": "Short WhatsApp message 50-80 words with article link placeholder [LINK]. Casual but professional.",
  "twitter_post": "Tweet max 250 chars with 2-3 hashtags and [LINK] placeholder."
}`;

  const raw = await callClaude(prompt, 6000);
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────
export function ContentEngine({ onDone }) {
  const [tab, setTab] = useState("generate"); // generate | autopilot | posts
  const [productName, setProductName] = useState("");
  const [theme, setTheme] = useState("buyers_guide");
  const [customKeyword, setCustomKeyword] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [activeSocial, setActiveSocial] = useState("linkedin");
  const [copied, setCopied] = useState("");

  useEffect(() => { if (tab === "posts") loadPosts(); }, [tab]);

  async function loadPosts() {
    setLoadingPosts(true);
    const { data } = await supabase.from("blog_posts").select("id,title,slug,status,theme,product_name,source,created_at,excerpt").order("created_at", { ascending: false }).limit(50);
    setPosts(data || []);
    setLoadingPosts(false);
  }

  async function generate() {
    if (!productName && !customKeyword) return;
    setGenerating(true);
    setResult(null);
    setSaved(false);
    try {
      const article = await generateArticle({ productName, theme, customKeyword });
      setResult(article);
    } catch (e) {
      alert("Generation failed: " + e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function savePost(status = "draft") {
    if (!result) return;
    setSaving(true);
    try {
      const slug = slugify(result.title);
      await supabase.from("blog_posts").insert({
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
        trending_topic: customKeyword || null,
        linkedin_post: result.linkedin_post,
        whatsapp_message: result.whatsapp_message,
        twitter_post: result.twitter_post,
        published_at: status === "published" ? new Date().toISOString() : null,
      });
      setSaved(true);
    } catch (e) {
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

  function copyToClipboard(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  const TAB_STYLE = (active) => ({
    padding: "8px 18px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600,
    cursor: "pointer", background: active ? C.blue : C.bg, color: active ? "white" : C.muted
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>📰</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Content Engine</div>
            <div style={{ fontSize: 11, color: C.muted }}>AI-powered blog articles + social media content for ingredientz.co</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[["generate","✍️ Generate"],["posts","📋 All Posts"],["autopilot","🤖 Auto-Pilot"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={TAB_STYLE(tab === id)}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── GENERATE TAB ── */}
      {tab === "generate" && (
        <div style={{ display: "grid", gridTemplateColumns: result ? "380px 1fr" : "1fr", gap: 16 }}>

          {/* Form */}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 16 }}>Generate Article</div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 0.5, display: "block", marginBottom: 5 }}>PRODUCT NAME</label>
              <input value={productName} onChange={e => setProductName(e.target.value)}
                placeholder="e.g. Ashwagandha Extract, Colostrum Powder…"
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "9px 12px", fontSize: 13, outline: "none" }}/>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 0.5, display: "block", marginBottom: 5 }}>TRENDING KEYWORD (optional)</label>
              <input value={customKeyword} onChange={e => setCustomKeyword(e.target.value)}
                placeholder="e.g. colostrum powder immune health 2026…"
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "9px 12px", fontSize: 13, outline: "none" }}/>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Paste a trending topic from Google Trends or News</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 0.5, display: "block", marginBottom: 8 }}>ARTICLE THEME</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {THEMES.map(t => (
                  <label key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "8px 10px", borderRadius: 7, background: theme === t.id ? "#EEF4FF" : C.bg, border: `1px solid ${theme === t.id ? C.blue : C.border}` }}>
                    <input type="radio" value={t.id} checked={theme === t.id} onChange={() => setTheme(t.id)} style={{ marginTop: 2 }}/>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: theme === t.id ? C.blue : C.ink }}>{t.label}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{t.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button onClick={generate} disabled={generating || (!productName && !customKeyword)}
              style={{ width: "100%", background: generating ? C.muted : C.blue, border: "none", color: "white", borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 600, cursor: generating ? "not-allowed" : "pointer" }}>
              {generating ? "✨ Generating article…" : "🚀 Generate Article"}
            </button>

            {generating && (
              <div style={{ marginTop: 12, textAlign: "center", fontSize: 11, color: C.muted }}>
                Writing article + social media posts…<br/>usually takes 20-30 seconds
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Title + meta */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Generated Article</div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: C.ink, marginBottom: 6, lineHeight: 1.3 }}>{result.title}</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.6 }}>{result.meta_description}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {result.keywords?.map(k => (
                    <span key={k} style={{ background: "#EEF4FF", border: `1px solid ${C.blue}20`, color: C.blue, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 500 }}>{k}</span>
                  ))}
                </div>
                {/* Article preview */}
                <div style={{ background: C.bg, borderRadius: 8, padding: 16, maxHeight: 320, overflowY: "auto", fontSize: 12, color: C.ink, lineHeight: 1.8 }}
                  dangerouslySetInnerHTML={{ __html: result.content }}/>
              </div>

              {/* Social media */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Social Media Pack</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {[["linkedin","💼 LinkedIn"],["whatsapp","📱 WhatsApp"],["twitter","🐦 Twitter/X"]].map(([id, label]) => (
                    <button key={id} onClick={() => setActiveSocial(id)} style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${activeSocial === id ? C.blue : C.border}`, background: activeSocial === id ? "#EEF4FF" : C.bg, color: activeSocial === id ? C.blue : C.muted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ background: C.bg, borderRadius: 8, padding: 14, fontSize: 12, color: C.ink, lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 10 }}>
                  {activeSocial === "linkedin" && result.linkedin_post}
                  {activeSocial === "whatsapp" && result.whatsapp_message}
                  {activeSocial === "twitter" && result.twitter_post}
                </div>
                <button onClick={() => copyToClipboard(
                  activeSocial === "linkedin" ? result.linkedin_post :
                  activeSocial === "whatsapp" ? result.whatsapp_message : result.twitter_post,
                  activeSocial
                )} style={{ background: copied === activeSocial ? C.green : C.bg, border: `1px solid ${C.border}`, color: copied === activeSocial ? "white" : C.muted, borderRadius: 6, padding: "6px 14px", fontSize: 11, cursor: "pointer" }}>
                  {copied === activeSocial ? "✓ Copied!" : "📋 Copy"}
                </button>
              </div>

              {/* Save actions */}
              {!saved ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => savePost("published")} disabled={saving}
                    style={{ flex: 1, background: C.blue, border: "none", color: "white", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    {saving ? "Saving…" : "🌐 Publish to Website"}
                  </button>
                  <button onClick={() => savePost("draft")} disabled={saving}
                    style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.ink, borderRadius: 8, padding: "11px", fontSize: 13, cursor: "pointer" }}>
                    💾 Save as Draft
                  </button>
                </div>
              ) : (
                <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#166534", marginBottom: 4 }}>✅ Article saved!</div>
                  <div style={{ fontSize: 11, color: "#15803d" }}>It will appear on ingredientz.co/blog once published</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ALL POSTS TAB ── */}
      {tab === "posts" && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>All Articles ({posts.length})</div>
            <button onClick={() => setTab("generate")} style={{ background: C.blue, border: "none", color: "white", borderRadius: 6, padding: "7px 16px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>+ New Article</button>
          </div>
          {loadingPosts ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading…</div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
              <div>No articles yet. Generate your first one!</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {posts.map(p => (
                <div key={p.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{p.product_name} · {THEMES.find(t => t.id === p.theme)?.label || p.theme} · {new Date(p.created_at).toLocaleDateString()}</div>
                    {p.excerpt && <div style={{ fontSize: 11, color: C.muted, marginTop: 3, fontStyle: "italic" }}>{p.excerpt.slice(0, 100)}…</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ background: p.status === "published" ? "#DCFCE7" : "#FEF9C3", color: p.status === "published" ? "#166534" : "#854D0E", border: `1px solid ${p.status === "published" ? "#BBF7D0" : "#FDE68A"}`, borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 600 }}>
                      {p.status === "published" ? "✓ Published" : "Draft"}
                    </span>
                    <span style={{ background: p.source === "autopilot" ? "#EDE9FE" : "#E0F2FE", color: p.source === "autopilot" ? "#6D28D9" : "#0369A1", borderRadius: 20, padding: "2px 8px", fontSize: 9, fontWeight: 600 }}>
                      {p.source === "autopilot" ? "🤖 Auto" : "✍️ Manual"}
                    </span>
                    <button onClick={() => toggleStatus(p)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "4px 10px", fontSize: 10, cursor: "pointer" }}>
                      {p.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                    <a href={`https://www.ingredientz.co/blog/${p.slug}`} target="_blank" style={{ background: "#EEF4FF", border: "none", color: C.blue, borderRadius: 5, padding: "4px 10px", fontSize: 10, cursor: "pointer", textDecoration: "none" }}>View</a>
                    <button onClick={() => deletePost(p.id)} style={{ background: "#FEF2F2", border: "none", color: "#EF4444", borderRadius: 5, padding: "4px 10px", fontSize: 10, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AUTOPILOT TAB ── */}
      {tab === "autopilot" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>🤖 Auto-Pilot Mode</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.8, marginBottom: 20 }}>
              Set up Google Apps Script to automatically generate and save blog articles every week — even when no one from the team generates one manually.
            </div>

            {[
              ["How it works", [
                "Every Monday at 8AM IST, the script runs automatically",
                "Checks if any article was published in the last 7 days",
                "If not — fetches trending nutraceutical topics from Google News RSS",
                "Picks the most relevant topic for your business",
                "Calls Claude via your Supabase proxy to generate a full article",
                "Saves as draft to blog_posts table",
                "Emails you: 'New article ready for review'",
              ]],
              ["What you need", [
                "Google account (for Apps Script)",
                "Your Supabase anon key (already in your CRM)",
                "Your email address for notifications",
                "5 minutes to set up — runs forever after",
              ]],
            ].map(([title, items]) => (
              <div key={title} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 8 }}>{title}</div>
                {items.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, color: C.muted }}>
                    <span style={{ color: C.blue, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>{item}
                  </div>
                ))}
              </div>
            ))}

            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#166534", marginBottom: 4 }}>📋 Setup Instructions</div>
              <div style={{ fontSize: 11, color: "#15803d", lineHeight: 1.7 }}>
                1. Go to <strong>script.google.com</strong> → New project<br/>
                2. Paste the Apps Script code below<br/>
                3. Replace YOUR_EMAIL with your email<br/>
                4. Run once manually to authorize<br/>
                5. Set trigger: Time-driven → Week timer → Monday → 8AM IST
              </div>
            </div>

            <div style={{ background: "#0D1F3C", borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>GOOGLE APPS SCRIPT — AUTOPILOT</div>
              <pre style={{ fontSize: 10, color: "#2dd4bf", fontFamily: "monospace", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{`const SUPABASE_URL = "https://eytoryygkxjslfvsqanl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dG9yeXlna3hqc2xmdnNxYW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDA5MTUsImV4cCI6MjA5MDMxNjkxNX0.txYTl0Q06mKSfWGmWc8cOTmCN46tLcxF9_7RhBUHBRY";
const NOTIFY_EMAIL = "YOUR_EMAIL@gmail.com";
const CLAUDE_PROXY = SUPABASE_URL + "/functions/v1/claude-proxy";

const TOP_PRODUCTS = [
  "Ashwagandha Extract","Bovine Colostrum Powder","Berberine HCl",
  "Lion's Mane Mushroom","Magnesium Glycinate","Vitamin D3",
  "Omega-3 Fish Oil","L-Theanine","Quercetin","NMN",
  "Shilajit Extract","Turmeric Curcumin","Probiotics","Creatine"
];

const THEMES = [
  "buyers_guide","science","sourcing","market_trends","formulation"
];

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,80);
}

function checkRecentPost() {
  const sevenDaysAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString();
  const url = SUPABASE_URL + "/rest/v1/blog_posts?created_at=gte." + sevenDaysAgo + "&limit=1";
  const res = UrlFetchApp.fetch(url, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
  });
  const data = JSON.parse(res.getContentText());
  return data.length > 0;
}

function getTrendingTopic() {
  try {
    const rss = UrlFetchApp.fetch(
      "https://news.google.com/rss/search?q=nutraceutical+ingredients+supplement&hl=en-US&gl=US&ceid=US:en"
    );
    const xml = rss.getContentText();
    const titles = xml.match(/<title>(.*?)<\/title>/g) || [];
    const topics = titles.slice(1,6).map(t => t.replace(/<\/?title>/g,""));
    return topics[0] || null;
  } catch(e) {
    return null;
  }
}

function generateAndSave() {
  // Skip if recent post exists
  if (checkRecentPost()) {
    Logger.log("Recent post found — skipping autopilot");
    return;
  }

  const product = TOP_PRODUCTS[Math.floor(Math.random()*TOP_PRODUCTS.length)];
  const theme = THEMES[Math.floor(Math.random()*THEMES.length)];
  const trending = getTrendingTopic();

  const prompt = "Write an SEO blog article for a nutraceutical B2B platform about: " + product +
    ". Theme: " + theme + (trending ? ". Trending context: " + trending : "") +
    ". Return JSON: {title,meta_description,excerpt,keywords:[],content,linkedin_post,whatsapp_message,twitter_post}";

  const claudeRes = UrlFetchApp.fetch(CLAUDE_PROXY, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const claudeData = JSON.parse(claudeRes.getContentText());
  const text = claudeData.content[0].text.replace(/\`\`\`json|\`\`\`/g,"").trim();
  const article = JSON.parse(text);

  // Save to Supabase
  UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/blog_posts", {
    method: "post",
    contentType: "application/json",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Prefer": "return=minimal"
    },
    payload: JSON.stringify({
      title: article.title,
      slug: slugify(article.title) + "-" + Date.now(),
      meta_description: article.meta_description,
      content: article.content,
      excerpt: article.excerpt,
      product_name: product,
      theme: theme,
      keywords: article.keywords,
      status: "draft",
      source: "autopilot",
      trending_topic: trending,
      linkedin_post: article.linkedin_post,
      whatsapp_message: article.whatsapp_message,
      twitter_post: article.twitter_post
    })
  });

  // Email notification
  GmailApp.sendEmail(NOTIFY_EMAIL,
    "🤖 Auto-generated article ready: " + article.title,
    "A new blog article has been auto-generated and saved as draft.\\n\\nTitle: " + article.title +
    "\\nProduct: " + product + "\\nTheme: " + theme +
    "\\n\\nReview and publish at: https://ingredientz-crm-v2.vercel.app/content"
  );

  Logger.log("Article generated: " + article.title);
}

// Entry point — set this as your weekly trigger
function weeklyAutopilot() { generateAndSave(); }`}</pre>
            </div>
            <button onClick={() => {
              navigator.clipboard.writeText(document.querySelector("pre").textContent);
              alert("Code copied! Paste into Google Apps Script.");
            }} style={{ background: C.blue, border: "none", color: "white", borderRadius: 7, padding: "9px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              📋 Copy Apps Script Code
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
