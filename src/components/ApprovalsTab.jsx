import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { sendEmail, buildEmailHtml } from "../utils.js";
import { Card } from "./ui/Card.jsx";

// ── SUPPLIER APPROVALS ──────────────────────────────────────────────────────────
// Two queues:
//   • New suppliers (suppliers.status = 'pending')  → Approve sets 'active', Reject sets 'inactive'
//   • New products  (supplier_products.status = 'pending_approval') → Approve sets both 'active', Request changes sets 'rejected'
// Approving emails the supplier. The sidebar badge counts both queues.
export function ApprovalsTab({ onChange }) {
  const [sups, setSups] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  async function load() {
    setLoading(true);
    const [sup, prod] = await Promise.all([
      supabase.from("suppliers")
        .select("*, supplier_documents(doc_type, label, file_url, file_name)")
        .eq("status", "pending").order("id", { ascending: false }),
      supabase.from("supplier_products")
        .select("*, products(name, unit, cas_number, hsn_code, short_description, product_categories(name)), suppliers(company, email), supplier_product_documents(doc_type, file_url, file_name)")
        .eq("status", "pending_approval").order("created_at", { ascending: false }),
    ]);
    setSups(sup.data || []);
    setRows(prod.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function emailSupplier(to, kind, name, reason) {
    if (!to) return;
    const variants = {
      sup_ok:  ["Supplier account approved ✓", C.green,
                [`Welcome aboard! Your supplier account <b>${name}</b> has been approved.`,
                 `Any products you've added that we've approved are now live to buyers. Log in to manage your listings.`]],
      sup_no:  ["Supplier application update", C.amber,
                [`Thanks for applying to supply Ingredientz as <b>${name}</b>.`,
                 `We're not able to approve the account yet: <b>${reason || "please get in touch for details."}</b>`]],
      prod_ok: ["Product approved ✓", C.green,
                [`Good news — your product <b>${name}</b> has been approved and is now visible to buyers.`]],
      prod_no: ["Changes needed", C.amber,
                [`Thanks for submitting <b>${name}</b>. Before we can publish it: <b>${reason || "please review and resubmit."}</b>`,
                 `Open your supplier portal to update and resubmit.`]],
    };
    const [subj, color, lines] = variants[kind];
    sendEmail({
      from: "Ingredientz <sales@mail.ingredientz.co>", to, reply_to: "sales@ingredientz.co",
      subject: subj, html: buildEmailHtml(subj, color, lines, "Ingredientz"),
      text: lines.join(" ").replace(/<[^>]+>/g, ""),
    });
  }

  async function approveSupplier(s) {
    setBusy("s" + s.id);
    try {
      const { error } = await supabase.from("suppliers").update({ status: "active" }).eq("id", s.id);
      if (error) throw error;
      emailSupplier(s.email, "sup_ok", s.company);
      await load(); onChange?.();
    } catch (e) { alert("Could not approve: " + e.message); }
    finally { setBusy(null); }
  }
  async function rejectSupplier(s) {
    const reason = window.prompt(`Reason for not approving "${s.company}" (the supplier will see this):`);
    if (reason === null) return;
    setBusy("s" + s.id);
    try {
      const { error } = await supabase.from("suppliers").update({ status: "inactive" }).eq("id", s.id);
      if (error) throw error;
      emailSupplier(s.email, "sup_no", s.company, reason);
      await load(); onChange?.();
    } catch (e) { alert("Could not update: " + e.message); }
    finally { setBusy(null); }
  }

  async function approveProduct(sp) {
    setBusy("p" + sp.id);
    try {
      const { error: e1 } = await supabase.from("supplier_products")
        .update({ status: "active", approved_at: new Date().toISOString() }).eq("id", sp.id);
      if (e1) throw e1;
      if (sp.product_id) await supabase.from("products").update({ status: "active" }).eq("id", sp.product_id);
      emailSupplier(sp.suppliers?.email, "prod_ok", sp.products?.name);
      await load(); onChange?.();
    } catch (e) { alert("Could not approve: " + e.message); }
    finally { setBusy(null); }
  }
  async function requestChanges(sp) {
    const reason = window.prompt(`What changes are needed for "${sp.products?.name}"?\nThe supplier will see this message.`);
    if (reason === null) return;
    setBusy("p" + sp.id);
    try {
      const { error } = await supabase.from("supplier_products")
        .update({ status: "rejected", rejection_reason: reason }).eq("id", sp.id);
      if (error) throw error;
      emailSupplier(sp.suppliers?.email, "prod_no", sp.products?.name, reason);
      await load(); onChange?.();
    } catch (e) { alert("Could not update: " + e.message); }
    finally { setBusy(null); }
  }

  const docLabel = (t) => ({ coa: "CoA", msds: "MSDS", spec: "Spec", gmp: "GMP certificate", manufacturing_license: "Manufacturing licence" }[t] || "Document");

  if (loading) return <div style={{ color: C.muted, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Loading…</div>;

  if (sups.length === 0 && rows.length === 0) return (
    <Card style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Nothing waiting for approval</div>
      <div style={{ fontSize: 12, color: C.muted }}>New supplier applications and products will appear here for review.</div>
    </Card>
  );

  const field = (l, v) => (
    <div><div style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div>
    <div style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>{v}</div></div>
  );
  const docLink = (d, i) => (
    <a key={i} href={d.file_url} target="_blank" rel="noreferrer"
      style={{ fontSize: 11, color: C.blue, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 9px", textDecoration: "none" }}>
      📄 {docLabel(d.doc_type)}{d.file_name ? ` · ${d.file_name}` : ""}
    </a>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── New suppliers ── */}
      {sups.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.blue }}>
            New suppliers · {sups.length}
          </div>
          {sups.map((s) => {
            const b = busy === "s" + s.id;
            return (
              <Card key={"s" + s.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{s.company || "—"}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.email || "—"}</div>
                    {s.description && <div style={{ fontSize: 12, color: C.ink, marginTop: 8 }}>{s.description}</div>}
                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
                      {field("Contact", s.contact_name || "—")}
                      {field("Country", s.country || "—")}
                      {field("Phone", s.phone || "—")}
                      {field("Website", s.website || "—")}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                      {(s.supplier_documents || []).length === 0
                        ? <span style={{ fontSize: 11, color: C.muted }}>No document attached</span>
                        : (s.supplier_documents || []).map(docLink)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 150 }}>
                    <button onClick={() => approveSupplier(s)} disabled={b}
                      style={{ background: C.green, color: "white", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: b ? "not-allowed" : "pointer", opacity: b ? 0.6 : 1 }}>
                      {b ? "Working…" : "✓ Approve supplier"}
                    </button>
                    <button onClick={() => rejectSupplier(s)} disabled={b}
                      style={{ background: "none", color: C.red, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: b ? "not-allowed" : "pointer" }}>
                      Reject
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      )}

      {/* ── New products ── */}
      {rows.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.blue, marginTop: sups.length ? 8 : 0 }}>
            New products · {rows.length}
          </div>
          {rows.map((sp) => {
            const p = sp.products || {};
            const docs = sp.supplier_product_documents || [];
            const b = busy === "p" + sp.id;
            return (
              <Card key={"p" + sp.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{p.name || "—"}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      from <b style={{ color: C.ink }}>{sp.suppliers?.company || "Unknown supplier"}</b>
                      {sp.suppliers?.email ? ` · ${sp.suppliers.email}` : ""}
                    </div>
                    {p.short_description && <div style={{ fontSize: 12, color: C.ink, marginTop: 8 }}>{p.short_description}</div>}
                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
                      {field("Category", p.product_categories?.name || "—")}
                      {field("CAS", p.cas_number || "—")}
                      {field("HSN", p.hsn_code || "—")}
                      {field("Price", sp.price_usd != null ? `$${sp.price_usd}/${sp.unit || "kg"}` : "—")}
                      {field("Lead", sp.lead_time_days != null ? `${sp.lead_time_days}d` : "—")}
                      {field("MOQ", sp.min_order_qty != null ? `${sp.min_order_qty} ${sp.unit || "kg"}` : "—")}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                      {docs.length === 0 ? <span style={{ fontSize: 11, color: C.muted }}>No documents attached</span> : docs.map(docLink)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 150 }}>
                    <button onClick={() => approveProduct(sp)} disabled={b}
                      style={{ background: C.green, color: "white", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: b ? "not-allowed" : "pointer", opacity: b ? 0.6 : 1 }}>
                      {b ? "Working…" : "✓ Approve & publish"}
                    </button>
                    <button onClick={() => requestChanges(sp)} disabled={b}
                      style={{ background: "none", color: C.red, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: b ? "not-allowed" : "pointer" }}>
                      Request changes
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
