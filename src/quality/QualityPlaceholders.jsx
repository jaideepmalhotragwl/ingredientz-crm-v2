// =====================================================================
// Quality Portal · the tabs we have not built yet
//
// Each one says plainly what it will do, so nobody clicks it expecting
// something and finds a blank screen. Two of them are already live,
// because they read data the Orders module is producing anyway:
// Product profiles, and the Audit trail.
// =====================================================================

import { useState, useEffect } from "react";
import { Q, qDate } from "./qualityConfig.js";
import { loadAllProfiles, loadAuditTrail } from "./qualityData.js";
import { ProductProfileModal } from "./ProductProfileModal.jsx";

// ── The shared "coming next" panel ───────────────────────────────────
function Coming({ title, blurb, bullets, when }) {
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ background: Q.card, border: `1px solid ${Q.line}`, borderRadius: 14, padding: "24px 26px" }}>
        <div style={{ fontFamily: Q.mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: Q.faint, marginBottom: 8 }}>
          Not built yet · {when}
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 10 }}>{title}</h2>
        <p style={{ fontSize: 13.5, color: Q.muted, lineHeight: 1.65, marginBottom: 16 }}>{blurb}</p>
        <div style={{ borderTop: `1px solid ${Q.line2}`, paddingTop: 14 }}>
          <div style={{ fontFamily: Q.mono, fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: Q.faint, marginBottom: 8 }}>
            What it will do
          </div>
          <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ fontSize: 13, color: Q.text, margin: "5px 0", lineHeight: 1.5 }}>{b}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function SupplierQualificationTab() {
  return <Coming
    when="next after Orders"
    title="Supplier qualification"
    blurb="When someone completes “Become a supplier” on the website, a qualification file opens here and the account stays pending until quality approves it. Approval is blocked until every mandatory document is on file and verified."
    bullets={[
      "Nine mandatory documents, plus conditional ones by country and product type",
      "Expiry dates captured on intake, so certificates can be chased before they lapse",
      "The approve button stays disabled until the file is complete — it is not a matter of discipline",
      "Supplier sees their own outstanding list on their portal page"
    ]} />;
}

export function ProductApprovalTab() {
  return <Coming
    when="after Supplier qualification"
    title="Product approval"
    blurb="The queue behind the Approved badge suppliers already see on their My Products page. Products stay hidden from the catalogue until the technical file is complete and quality signs it off."
    bullets={[
      "Specification, sample CoA, safety and technical data sheets, nutritional data",
      "Process flow chart, shelf-life study, packaging specification",
      "Conditional items pulled from the same product profile the Orders module already uses",
      "Approving a product is what publishes it to buyers"
    ]} />;
}

export function CustomerClearanceTab() {
  return <Coming
    when="later"
    title="Customer clearance"
    blurb="Most customers need nothing from quality. A file opens here only when the destination market, the ingredient, or the customer's own request brings a regulatory condition with it — so this stays a short list, not busywork on every account."
    bullets={[
      "Import licence and business registration checks",
      "Signed quality agreement tracking",
      "Restricted and regulated ingredient screening by destination",
      "Denied-party and sanctions screening record"
    ]} />;
}

export function DocumentsTab() {
  return <Coming
    when="move across from the Enquiry CRM"
    title="Reformat and generate"
    blurb="Your existing Documents feature, moved here with one addition: an “attach to order” field, so a reformatted certificate lands in the order's quality file instead of only downloading to somebody's laptop."
    bullets={[
      "Reformat a supplier document onto the right letterhead — the routing rule you already have",
      "Generate branded declarations from templates",
      "Anything produced here is attached to the order and appears in the customer pack",
      "Supplier originals are kept unaltered alongside the reformatted version"
    ]} />;
}

export function DocumentLibraryTab() {
  return <Coming
    when="later"
    title="Document library"
    blurb="Our own certificates, licences and procedures — the documents customers ask us for, and the ones an auditor asks to see. Expiry dates here drive the alerts on the dashboard."
    bullets={[
      "Company certificates and registrations for both entities",
      "Standard operating procedures with version and review dates",
      "Signed agreements, including the 3PL warehouse contracts",
      "Alerts at sixty, thirty and seven days before anything expires"
    ]} />;
}

export function RequirementRulesTab() {
  return <Coming
    when="later"
    title="Requirement rules"
    blurb="Right now the rule that turns a product profile into a document list lives in the code, in qualityConfig.js. This tab will move it into the database so you can change it without a deployment."
    bullets={[
      "Add or remove a required report per product type",
      "Set conditions by destination market, not only by product",
      "Changing a rule updates every open order",
      "Every change recorded in the audit trail with who made it"
    ]} />;
}

// =====================================================================
// PRODUCT PROFILES — live already
// =====================================================================
export function ProductProfilesTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  async function refresh() {
    setLoading(true);
    try { setRows(await loadAllProfiles()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  const th = { fontFamily: Q.mono, fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: Q.faint, textAlign: "left", padding: "11px 14px", borderBottom: `1px solid ${Q.line}`, fontWeight: 600, background: "#FAFCFC" };
  const td = { padding: "12px 14px", borderBottom: `1px solid ${Q.line2}`, fontSize: 13 };

  return (
    <div>
      <div style={{ background: "#FAFCFC", border: `1px solid ${Q.line}`, borderLeft: `3px solid ${Q.ink3}`, borderRadius: 8, padding: "12px 14px", fontSize: 12.5, color: Q.muted, marginBottom: 16 }}>
        Every product quality has classified. This list builds itself out of real orders — you never sit down and fill it in.
        Editing a profile here changes the required documents on every open order containing that product.
      </div>

      <div style={{ background: Q.card, border: `1px solid ${Q.line}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Product</th>
              <th style={th}>Profile</th>
              <th style={th}>Set by</th>
              <th style={th}>Set on</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: Q.muted }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: Q.muted, fontSize: 13 }}>
                Nothing yet. Profiles appear here as quality classifies products on real orders.
              </td></tr>
            ) : rows.map(p => {
              const tags = [
                p.is_organic && "Organic",
                p.is_animal_derived && "Animal-derived",
                p.is_botanical && "Botanical",
                p.is_probiotic && "Probiotic",
                p.has_allergen && "Allergen"
              ].filter(Boolean);
              return (
                <tr key={p.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.product_name}</td>
                  <td style={{ ...td, color: Q.muted }}>{tags.length ? tags.join(" · ") : "Standard"}</td>
                  <td style={{ ...td, color: Q.muted, fontSize: 12 }}>{p.set_by || "—"}</td>
                  <td style={{ ...td, color: Q.muted, fontFamily: Q.mono, fontSize: 12 }}>{qDate(p.set_at)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <button onClick={() => setEditing(p)}
                      style={{ background: "#fff", border: `1px solid ${Q.line}`, borderRadius: 7, padding: "4px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <ProductProfileModal
          productName={editing.product_name}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refresh(); }} />
      )}
    </div>
  );
}

// =====================================================================
// AUDIT TRAIL — live already
// =====================================================================
export function AuditTrailTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setRows(await loadAuditTrail(300)); }
      catch { setRows([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const th = { fontFamily: Q.mono, fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: Q.faint, textAlign: "left", padding: "11px 14px", borderBottom: `1px solid ${Q.line}`, fontWeight: 600, background: "#FAFCFC" };
  const td = { padding: "11px 14px", borderBottom: `1px solid ${Q.line2}`, fontSize: 13 };

  return (
    <div>
      <div style={{ background: "#FAFCFC", border: `1px solid ${Q.line}`, borderLeft: `3px solid ${Q.ink3}`, borderRadius: 8, padding: "12px 14px", fontSize: 12.5, color: Q.muted, marginBottom: 16 }}>
        Every quality action, with who did it and when. Nothing here can be edited or deleted, by anyone.
        This is the answer the first time a customer or an auditor asks how a release decision was made.
      </div>

      <div style={{ background: Q.card, border: `1px solid ${Q.line}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>When</th><th style={th}>Who</th><th style={th}>Action</th><th style={th}>Object</th><th style={th}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: Q.muted }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: Q.muted, fontSize: 13 }}>Nothing recorded yet.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ ...td, fontFamily: Q.mono, fontSize: 12, color: Q.muted, whiteSpace: "nowrap" }}>
                  {new Date(r.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td style={{ ...td, fontSize: 12.5 }}>{r.actor || "System"}</td>
                <td style={{ ...td, fontWeight: 600 }}>{r.action}</td>
                <td style={{ ...td, fontFamily: Q.mono, fontSize: 12, color: Q.muted }}>{r.object_ref || "—"}</td>
                <td style={{ ...td, color: Q.muted, fontSize: 12.5 }}>{r.detail || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
