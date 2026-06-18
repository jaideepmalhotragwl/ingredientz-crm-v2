import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { sendEmail, buildEmailHtml } from "../utils.js";
import { Card } from "./ui/Card.jsx";

// ── SUPPLIER APPROVALS ──────────────────────────────────────────────────────────
// Lists supplier-submitted products awaiting review (supplier_products.status = 'pending_approval').
// Approve  -> supplier_products + products both go 'active' (live to buyers) + email supplier.
// Request changes -> supplier_products 'rejected' + reason saved + email supplier.
export function ApprovalsTab({ onChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("supplier_products")
      .select("*, products(name, unit, cas_number, hsn_code, short_description, product_categories(name)), suppliers(company, email), supplier_product_documents(doc_type, file_url, file_name)")
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function notifySupplier(sp, kind, reason) {
    const email = sp.suppliers?.email;
    if (!email) return;
    const name = sp.products?.name || "your product";
    if (kind === "approved") {
      sendEmail({
        from: "Ingredientz <sales@mail.ingredientz.co>",
        to: email, reply_to: "sales@ingredientz.co",
        subject: `Approved — ${name} is now live`,
        html: buildEmailHtml("Product Approved ✓", C.green, [
          `Good news — your product <b>${name}</b> has been approved and is now visible to buyers on Ingredientz.`,
          `You can manage it anytime in your supplier portal.`
        ], "Ingredientz"),
        text: `${name} approved and live on Ingredientz.`
      });
    } else {
      sendEmail({
        from: "Ingredientz <sales@mail.ingredientz.co>",
        to: email, reply_to: "sales@ingredientz.co",
        subject: `Changes needed — ${name}`,
        html: buildEmailHtml("Changes Requested", C.amber, [
          `Thanks for submitting <b>${name}</b>. Before we can publish it, a few changes are needed:`,
          `<b>${reason || "Please review and resubmit."}</b>`,
          `Open your supplier portal to update and resubmit.`
        ], "Ingredientz"),
        text: `Changes needed for ${name}: ${reason || ""}`
      });
    }
  }

  async function approve(sp) {
    setBusy(sp.id);
    try {
      const { error: e1 } = await supabase.from("supplier_products")
        .update({ status: "active", approved_at: new Date().toISOString() }).eq("id", sp.id);
      if (e1) throw e1;
      if (sp.product_id) {
        await supabase.from("products").update({ status: "active" }).eq("id", sp.product_id);
      }
      notifySupplier(sp, "approved");
      await load();
      onChange?.();
    } catch (e) { alert("Could not approve: " + e.message); }
    finally { setBusy(null); }
  }

  async function requestChanges(sp) {
    const reason = window.prompt(`What changes are needed for "${sp.products?.name}"?\nThe supplier will see this message.`);
    if (reason === null) return; // cancelled
    setBusy(sp.id);
    try {
      const { error } = await supabase.from("supplier_products")
        .update({ status: "rejected", rejection_reason: reason }).eq("id", sp.id);
      if (error) throw error;
      notifySupplier(sp, "rejected", reason);
      await load();
      onChange?.();
    } catch (e) { alert("Could not update: " + e.message); }
    finally { setBusy(null); }
  }

  if (loading) return <div style={{ color: C.muted, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Loading…</div>;

  if (rows.length === 0) return (
    <Card style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Nothing waiting for approval</div>
      <div style={{ fontSize: 12, color: C.muted }}>New supplier products will appear here for review.</div>
    </Card>
  );

  const docLabel = (t) => ({ coa: "CoA", msds: "MSDS", spec: "Spec" }[t] || "Doc");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, color: C.muted }}>{rows.length} product{rows.length > 1 ? "s" : ""} awaiting your review.</div>
      {rows.map((sp) => {
        const p = sp.products || {};
        const docs = sp.supplier_product_documents || [];
        const isBusy = busy === sp.id;
        return (
          <Card key={sp.id} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{p.name || "—"}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  from <b style={{ color: C.ink }}>{sp.suppliers?.company || "Unknown supplier"}</b>
                  {sp.suppliers?.email ? ` · ${sp.suppliers.email}` : ""}
                </div>
                {p.short_description && <div style={{ fontSize: 12, color: C.ink, marginTop: 8 }}>{p.short_description}</div>}

                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
                  {[
                    ["Category", p.product_categories?.name || "—"],
                    ["CAS", p.cas_number || "—"],
                    ["HSN", p.hsn_code || "—"],
                    ["Price", sp.price_usd != null ? `$${sp.price_usd}/${sp.unit || "kg"}` : "—"],
                    ["Lead", sp.lead_time_days != null ? `${sp.lead_time_days}d` : "—"],
                    ["MOQ", sp.min_order_qty != null ? `${sp.min_order_qty} ${sp.unit || "kg"}` : "—"],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div>
                      <div style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                  {docs.length === 0 && <span style={{ fontSize: 11, color: C.muted }}>No documents attached</span>}
                  {docs.map((d, i) => (
                    <a key={i} href={d.file_url} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: C.blue, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 9px", textDecoration: "none" }}>
                      📄 {docLabel(d.doc_type)}{d.file_name ? ` · ${d.file_name}` : ""}
                    </a>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 150 }}>
                <button onClick={() => approve(sp)} disabled={isBusy}
                  style={{ background: C.green, color: "white", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: isBusy ? "not-allowed" : "pointer", opacity: isBusy ? 0.6 : 1 }}>
                  {isBusy ? "Working…" : "✓ Approve & publish"}
                </button>
                <button onClick={() => requestChanges(sp)} disabled={isBusy}
                  style={{ background: "none", color: C.red, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: isBusy ? "not-allowed" : "pointer" }}>
                  Request changes
                </button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
