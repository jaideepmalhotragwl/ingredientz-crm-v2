import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";

// ── CATEGORIES TAB ───────────────────────────────────────────────────────────
function CategoriesTab() {
  const [cats, setCats] = useState([]);
  const [catCounts, setCatCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", sort_order: 0, active: true });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("product_categories").select("*").order("sort_order"),
      supabase.from("products").select("category_id, status")
    ]);
    setCats(c || []);
    // Build counts
    const counts = {};
    (p || []).forEach(pr => {
      if (!counts[pr.category_id]) counts[pr.category_id] = { total: 0, active: 0 };
      counts[pr.category_id].total++;
      if (pr.status === "active") counts[pr.category_id].active++;
    });
    setCatCounts(counts);
    setLoading(false);
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function genSlug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  function openAdd() {
    setForm({ name: "", slug: "", description: "", sort_order: (cats.length + 1) * 10, active: true });
    setModal("add");
  }

  function openEdit(c) {
    setForm({ name: c.name, slug: c.slug, description: c.description || "", sort_order: c.sort_order || 0, active: c.active });
    setModal({ type: "edit", id: c.id });
  }

  async function save() {
    if (!form.name.trim()) { alert("Name required."); return; }
    const slug = form.slug || genSlug(form.name);
    setSaving(true);
    if (modal === "add") {
      await supabase.from("product_categories").insert({ ...form, slug });
    } else {
      await supabase.from("product_categories").update({ ...form, slug }).eq("id", modal.id);
    }
    setSaving(false); setDone(true);
    setTimeout(() => { setDone(false); setModal(null); loadAll(); }, 900);
  }

  async function toggle(c) {
    await supabase.from("product_categories").update({ active: !c.active }).eq("id", c.id);
    loadAll();
  }

  async function del(id) {
    const count = catCounts[id]?.total || 0;
    if (count > 0) { alert(`Cannot delete — ${count} product(s) are in this category. Reassign them first.`); return; }
    if (!window.confirm("Delete this category?")) return;
    await supabase.from("product_categories").delete().eq("id", id);
    loadAll();
  }

  const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.ink, fontFamily: "Arial,sans-serif", fontSize: 13, outline: "none", width: "100%" };

  const totalProducts = Object.values(catCounts).reduce((s, c) => s + c.total, 0);
  const activeCategories = cats.filter(c => c.active).length;

  return <div>
    {modal && <Modal title={modal === "add" ? "Add Category" : "Edit Category"} onClose={() => setModal(null)} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Category Name *</label>
          <input value={form.name} onChange={e => { setF("name", e.target.value); if (!form.slug || modal === "add") setF("slug", genSlug(e.target.value)); }} placeholder="e.g. Botanical Extracts" style={inp} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Slug (URL)</label>
          <input value={form.slug} onChange={e => setF("slug", e.target.value)} placeholder="botanical-extracts" style={inp} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Description <span style={{ fontWeight: 400, fontSize: 9 }}>shown on portal and for SEO</span></label>
          <textarea value={form.description} onChange={e => setF("description", e.target.value)} rows={3} placeholder="Category description…" style={{ ...inp, resize: "vertical" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Sort Order</label>
            <input type="number" value={form.sort_order} onChange={e => setF("sort_order", parseInt(e.target.value))} style={inp} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>Status</label>
            <select value={form.active ? "active" : "inactive"} onChange={e => setF("active", e.target.value === "active")} style={inp}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, paddingTop: 6 }}>
          <Btn label={saving ? "Saving…" : done ? "✓ Saved!" : "Save Category"} onClick={save} disabled={saving} />
          <Btn label="Cancel" onClick={() => setModal(null)} variant="ghost" />
        </div>
      </div>
    </Modal>}

    {/* ── KPI bar ── */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
      {[
        ["Total Categories", cats.length, C.blue],
        ["Active", activeCategories, C.green],
        ["Total Products", totalProducts, C.ink],
      ].map(([label, val, color]) => (
        <div key={label} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
        </div>
      ))}
    </div>

    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Product Categories</div>
        <Btn label="+ Add Category" onClick={openAdd} size="sm" />
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>{cats.length} categories</span>
      </div>

      {loading ? <div style={{ padding: 30, textAlign: "center", color: C.muted }}>Loading…</div> :
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: C.bg }}>
              <tr>
                {["#", "Category Name", "Slug", "Products", "Active Products", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", color: C.muted, borderBottom: `1px solid ${C.border}`, fontWeight: 700, letterSpacing: 1, fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cats.map((c, i) => {
                const count = catCounts[c.id] || { total: 0, active: 0 };
                return <tr key={c.id} style={{ background: i % 2 === 0 ? C.bg : "transparent", borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "11px 14px", color: C.muted, fontSize: 11 }}>{c.sort_order}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{c.name}</div>
                    {c.description && <div style={{ fontSize: 11, color: C.muted, marginTop: 2, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.description}</div>}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{c.slug}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: count.total > 0 ? C.ink : C.muted }}>{count.total}</span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    {count.total > 0
                      ? <span style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44`, borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>{count.active} active</span>
                      : <span style={{ color: C.muted, fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span onClick={() => toggle(c)} style={{ background: c.active ? "#E6F4EA" : C.bg, color: c.active ? C.green : C.muted, border: `1px solid ${c.active ? "#C3E6CB" : C.border}`, borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Btn label="Edit" onClick={() => openEdit(c)} size="sm" variant="ghost" />
                      <Btn label="✕" onClick={() => del(c.id)} size="sm" variant="danger" />
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
          {cats.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 12 }}>No categories yet</div>}
        </div>}
    </Card>
  </div>;
}

export { CategoriesTab };
