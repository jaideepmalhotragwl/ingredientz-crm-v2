import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";
import { ProductSupplierMapping } from "./ProductSupplierMapping.jsx";

// ── SPEC EDITOR — flexible key/value pairs ────────────────────────────────────
function SpecEditor({ value, onChange }) {
  const pairs = Object.entries(value || {});

  function updateKey(i, newKey) {
    const arr = [...pairs];
    arr[i] = [newKey, arr[i][1]];
    onChange(Object.fromEntries(arr));
  }

  function updateVal(i, newVal) {
    const arr = [...pairs];
    arr[i] = [arr[i][0], newVal];
    onChange(Object.fromEntries(arr));
  }

  function addRow() {
    onChange({ ...value, "": "" });
  }

  function removeRow(i) {
    const arr = [...pairs];
    arr.splice(i, 1);
    onChange(Object.fromEntries(arr));
  }

  const inp = {
    background: C.white, border: `1px solid ${C.border}`, borderRadius: 6,
    padding: "6px 9px", color: C.ink, fontSize: 12, outline: "none", width: "100%"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pairs.map(([k, v], i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 28px", gap: 6 }}>
          <input value={k} onChange={e => updateKey(i, e.target.value)} placeholder="e.g. Standardization" style={inp} />
          <input value={v} onChange={e => updateVal(i, e.target.value)} placeholder="e.g. 5% Withanolides" style={inp} />
          <button onClick={() => removeRow(i)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", color: C.muted, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
      ))}
      <button onClick={addRow} style={{ background: C.blueLt, border: `1px solid #BFD6F6`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", color: C.blue, fontSize: 11, fontWeight: 700, alignSelf: "flex-start" }}>+ Add Spec</button>
    </div>
  );
}

// ── TAG INPUT — chip-style ────────────────────────────────────────────────────
function TagInput({ tags, onChange }) {
  const [input, setInput] = useState("");

  function addTag(e) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      const newTag = input.trim().replace(/,$/, "");
      if (newTag && !tags.includes(newTag)) onChange([...tags, newTag]);
      setInput("");
    }
  }

  function removeTag(t) {
    onChange(tags.filter(x => x !== t));
  }

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", display: "flex", flexWrap: "wrap", gap: 5, minHeight: 38 }}>
      {tags.map(t => (
        <span key={t} style={{ background: C.blueLt, color: C.blue, border: `1px solid #BFD6F6`, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          {t}
          <span onClick={() => removeTag(t)} style={{ cursor: "pointer", fontWeight: 700, fontSize: 13, lineHeight: 1 }}>×</span>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={addTag}
        placeholder={tags.length === 0 ? "Type tag and press Enter…" : ""}
        style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, color: C.ink, minWidth: 120, flex: 1 }}
      />
    </div>
  );
}

// ── PRODUCTS TAB ──────────────────────────────────────────────────────────────
function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState([]);
  const [catCounts, setCatCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSync, setFilterSync] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState("basic");

  const emptyForm = {
    name: "", slug: "", category_id: "", short_description: "",
    description: "", cas_number: "", hsn_code: "", unit: "kg",
    min_order_qty: "", specifications: {}, tags: [], status: "active"
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from("products").select("*,product_categories(name)").order("name", { ascending: true }),
      supabase.from("product_categories").select("*").eq("active", true).order("sort_order")
    ]);
    const prods = p || [];
    setProducts(prods);
    setCats(c || []);
    // Build category counts
    const counts = {};
    prods.forEach(pr => {
      counts[pr.category_id] = (counts[pr.category_id] || 0) + 1;
    });
    setCatCounts(counts);
    setLoading(false);
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function genSlug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  function openAdd() {
    setForm(emptyForm);
    setActiveFormTab("basic");
    setModal("add");
  }

  function openEdit(p) {
    setForm({
      name: p.name, slug: p.slug, category_id: String(p.category_id || ""),
      short_description: p.short_description || "", description: p.description || "",
      cas_number: p.cas_number || "", hsn_code: p.hsn_code || "",
      unit: p.unit || "kg", min_order_qty: p.min_order_qty || "",
      specifications: p.specifications || {},
      tags: Array.isArray(p.tags) ? p.tags : [],
      status: p.status || "active"
    });
    setActiveFormTab("basic");
    setModal({ type: "edit", id: p.id });
  }

  async function save() {
    if (!form.name.trim()) { alert("Product name required."); return; }
    if (!form.category_id) { alert("Category required."); return; }
    setSaving(true);
    const slug = form.slug || genSlug(form.name);
    const row = {
      name: form.name, slug,
      category_id: parseInt(form.category_id),
      short_description: form.short_description,
      description: form.description,
      cas_number: form.cas_number,
      hsn_code: form.hsn_code,
      unit: form.unit,
      min_order_qty: form.min_order_qty ? parseFloat(form.min_order_qty) : null,
      specifications: form.specifications,
      tags: form.tags,
      status: form.status,
      created_by: "Jaideep"
    };
    if (modal === "add") {
      await supabase.from("products").insert(row);
    } else {
      await supabase.from("products").update(row).eq("id", modal.id);
    }
    setSaving(false); setDone(true);
    setTimeout(() => { setDone(false); setModal(null); loadAll(); }, 900);
  }

  async function del(id) {
    if (!window.confirm("Delete this product?")) return;
    await supabase.from("products").delete().eq("id", id);
    loadAll();
  }

  async function toggleStatus(p) {
    const next = p.status === "active" ? "inactive" : "active";
    await supabase.from("products").update({ status: next }).eq("id", p.id);
    loadAll();
  }

  const filtered = products
    .filter(p => (!filterCat || String(p.category_id) === filterCat))
    .filter(p => (!filterStatus || p.status === filterStatus))
    .filter(p => (!filterSync || (filterSync === "synced" ? !!p.synced_at : !p.synced_at)))
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.cas_number || "").toLowerCase().includes(search.toLowerCase()) || (p.tags || []).some(t => t.toLowerCase().includes(search.toLowerCase())));

  const STATUS_COLORS = { active: C.green, inactive: C.muted, pending: C.amber };
  const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.ink, fontFamily: "Arial,sans-serif", fontSize: 13, outline: "none", width: "100%" };

  const syncedCount = products.filter(p => p.synced_at).length;
  const notSyncedCount = products.filter(p => !p.synced_at).length;

  return <div>
    {modal && <Modal title={modal === "add" ? "Add Product" : "Edit Product"} onClose={() => setModal(null)} width={820}>
      {/* Form tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 18 }}>
        {[["basic", "Basic Info"], ["technical", "Technical"], ["portal", "Portal / SEO"]].map(([id, label]) => (
          <button key={id} onClick={() => setActiveFormTab(id)} style={{ background: "none", border: "none", borderBottom: activeFormTab === id ? `2px solid ${C.blue}` : "2px solid transparent", padding: "7px 16px", cursor: "pointer", fontSize: 12, fontWeight: activeFormTab === id ? 700 : 400, color: activeFormTab === id ? C.blue : C.muted, marginBottom: -1 }}>{label}</button>
        ))}
      </div>

      {activeFormTab === "basic" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "span 2" }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Product Name *</label>
          <input value={form.name} onChange={e => { setF("name", e.target.value); if (!form.slug || modal === "add") setF("slug", genSlug(e.target.value)); }} placeholder="e.g. Ashwagandha Extract KSM-66" style={inp} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Category *</label>
          <select value={form.category_id} onChange={e => setF("category_id", e.target.value)} style={{ ...inp, color: form.category_id ? C.ink : C.muted }}>
            <option value="">Select category…</option>
            {cats.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Status</label>
          <select value={form.status} onChange={e => setF("status", e.target.value)} style={inp}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending Review</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Unit</label>
          <select value={form.unit} onChange={e => setF("unit", e.target.value)} style={inp}>
            {["kg", "MT", "Litres", "Pieces", "Boxes", "Bags", "Other"].map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Min Order Qty</label>
          <input type="number" value={form.min_order_qty} onChange={e => setF("min_order_qty", e.target.value)} placeholder="e.g. 25" style={inp} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "span 2" }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Tags <span style={{ color: C.muted, fontWeight: 400, fontSize: 9 }}>press Enter after each tag</span></label>
          <TagInput tags={form.tags} onChange={v => setF("tags", v)} />
        </div>
      </div>}

      {activeFormTab === "technical" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>CAS Number</label>
          <input value={form.cas_number} onChange={e => setF("cas_number", e.target.value)} placeholder="e.g. 84687-43-4" style={inp} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>HSN Code</label>
          <input value={form.hsn_code} onChange={e => setF("hsn_code", e.target.value)} placeholder="e.g. 13021990" style={inp} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "span 2" }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>URL Slug</label>
          <input value={form.slug} onChange={e => setF("slug", e.target.value)} placeholder="auto-generated from name" style={inp} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "span 2" }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Specifications</label>
          <SpecEditor value={form.specifications} onChange={v => setF("specifications", v)} />
        </div>
      </div>}

      {activeFormTab === "portal" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Short Description <span style={{ color: C.muted, fontWeight: 400, fontSize: 9 }}>shown in catalogue listing</span></label>
          <input value={form.short_description} onChange={e => setF("short_description", e.target.value)} placeholder="One line summary…" style={inp} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Full Description <span style={{ color: C.muted, fontWeight: 400, fontSize: 9 }}>for SEO and product page</span></label>
          <textarea value={form.description} onChange={e => setF("description", e.target.value)} rows={6} placeholder="Detailed product description…" style={{ ...inp, resize: "vertical" }} />
        </div>
      </div>}

      <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: `1px solid ${C.border}`, marginTop: 16 }}>
        <Btn label={saving ? "Saving…" : done ? "✓ Saved & Synced!" : modal === "add" ? "Add Product" : "Update Product"} onClick={save} disabled={saving} />
        <Btn label="Cancel" onClick={() => setModal(null)} variant="ghost" />
        {modal !== "add" && modal?.synced_at && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.green, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, display: "inline-block" }} />
            Synced to Sales CRM
          </span>
        )}
      </div>
      {modal !== "add" && typeof modal === "object" && <ProductSupplierMapping productId={modal.id} productName={form.name} />}
    </Modal>}

    {/* ── KPI bar ── */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
      {[
        ["Total Products", products.length, C.blue],
        ["Active", products.filter(p => p.status === "active").length, C.green],
        ["Synced to Sales", syncedCount, C.green],
        ["Not Synced", notSyncedCount, notSyncedCount > 0 ? C.amber : C.muted],
      ].map(([label, val, color]) => (
        <div key={label} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
        </div>
      ))}
    </div>

    <Card style={{ overflow: "hidden" }}>
      {/* ── Toolbar ── */}
      <div style={{ padding: "12px 16px", display: "flex", gap: 8, alignItems: "center", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Product Master</div>
        <Btn label="+ Add Product" onClick={openAdd} size="sm" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, CAS, tag…" style={{ marginLeft: "auto", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 12px", color: C.ink, fontSize: 12, outline: "none", width: 200 }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px", color: C.ink, fontSize: 11 }}>
          <option value="">All Categories</option>
          {cats.map(c => <option key={c.id} value={String(c.id)}>{c.name} ({catCounts[c.id] || 0})</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px", color: C.ink, fontSize: 11 }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
        </select>
        <select value={filterSync} onChange={e => setFilterSync(e.target.value)} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px", color: C.ink, fontSize: 11 }}>
          <option value="">All Sync</option>
          <option value="synced">Synced</option>
          <option value="unsynced">Not Synced</option>
        </select>
        <span style={{ fontSize: 11, color: C.muted }}>{filtered.length} products</span>
      </div>

      {/* ── Table ── */}
      {loading ? <div style={{ padding: 30, textAlign: "center", color: C.muted }}>Loading…</div> :
        <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: C.bg, zIndex: 2 }}>
              <tr>
                {["Product Name", "Category", "CAS Number", "Specs", "MOQ", "Tags", "Status", "Sync", ""].map(h => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: C.muted, borderBottom: `1px solid ${C.border}`, fontWeight: 700, letterSpacing: 1, fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} style={{ background: i % 2 === 0 ? C.bg : "transparent", borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px 12px", minWidth: 180 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{p.name}</div>
                    {p.short_description && <div style={{ fontSize: 10, color: C.muted, marginTop: 1, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.short_description}</div>}
                  </td>
                  <td style={{ padding: "10px 12px", color: C.muted, fontSize: 11, whiteSpace: "nowrap" }}>{p.product_categories?.name || "—"}</td>
                  <td style={{ padding: "10px 12px", color: C.muted, fontSize: 11, fontFamily: "monospace" }}>{p.cas_number || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {p.specifications && Object.keys(p.specifications).length > 0
                      ? <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {Object.entries(p.specifications).slice(0, 2).map(([k, v]) => (
                          <div key={k} style={{ fontSize: 10, color: C.muted }}><span style={{ color: C.ink, fontWeight: 600 }}>{k}:</span> {v}</div>
                        ))}
                        {Object.keys(p.specifications).length > 2 && <div style={{ fontSize: 10, color: C.blue }}>+{Object.keys(p.specifications).length - 2} more</div>}
                      </div>
                      : <span style={{ color: C.muted, fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 12px", color: C.muted, fontSize: 11, whiteSpace: "nowrap" }}>{p.min_order_qty ? `${p.min_order_qty} ${p.unit}` : "—"}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 140 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {(p.tags || []).slice(0, 3).map(t => (
                        <span key={t} style={{ background: C.blueLt, color: C.blue, borderRadius: 20, padding: "1px 7px", fontSize: 9, fontWeight: 600 }}>{t}</span>
                      ))}
                      {(p.tags || []).length > 3 && <span style={{ fontSize: 9, color: C.muted }}>+{p.tags.length - 3}</span>}
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span onClick={() => toggleStatus(p)} style={{ background: `${STATUS_COLORS[p.status] || C.muted}22`, color: STATUS_COLORS[p.status] || C.muted, border: `1px solid ${STATUS_COLORS[p.status] || C.muted}44`, borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "capitalize", whiteSpace: "nowrap" }}>{p.status}</span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.synced_at ? C.green : C.amber, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: p.synced_at ? C.green : C.amber, fontWeight: 600, whiteSpace: "nowrap" }}>{p.synced_at ? "Synced" : "Pending"}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      <Btn label="Edit" onClick={() => openEdit(p)} size="sm" variant="ghost" />
                      <Btn label="✕" onClick={() => del(p.id)} size="sm" variant="danger" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ padding: 36, textAlign: "center", color: C.muted, fontSize: 12 }}>No products match your filters</div>}
        </div>}
    </Card>
  </div>;
}

export { ProductsTab };
