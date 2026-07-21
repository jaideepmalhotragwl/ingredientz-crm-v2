import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { fmtName } from "../lib/nameFormat.js";

// Shared with the public website: same tables + the public `supplier-docs` bucket.
const BUCKET = "supplier-docs";
const TABS = [
  { id: "profile", label: "Profile" },
  { id: "certs", label: "Certificates" },
  { id: "products", label: "Products" },
  { id: "bank", label: "Bank" },
  { id: "docs", label: "Documents" },
];
const CERT_STANDARDS = ["ISO 9001", "ISO 22000", "FSSC 22000", "GMP", "HACCP", "Halal", "Kosher", "Organic", "USP", "EP", "FCC", "BRC", "Other"];
const DOC_TYPES = [{ v: "profile", l: "Company profile" }, { v: "price_list", l: "Price list" }, { v: "other", l: "Other" }];
const NON_CERT = ["profile", "price_list", "other"];
const STATUS_COLORS = { active: C.green, inactive: C.muted, pending: C.amber };

export function SupplierDrawer({ supplier, onClose, onSaved }) {
  const [tab, setTab] = useState("profile");
  const [prof, setProf] = useState(() => seedProfile(supplier));
  const [savingProf, setSavingProf] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [docs, setDocs] = useState([]);
  const [supProducts, setSupProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (supplier?.id) loadAll(); /* eslint-disable-next-line */ }, [supplier?.id]);
  useEffect(() => { setProf(seedProfile(supplier)); }, [supplier?.id]);

  function seedProfile(s) {
    s = s || {};
    return {
      company: s.company || "", contact_name: s.contact_name || "",
      email: s.contact_email || s.email || "",
      phone: s.phone || "", website: s.website || "", country: s.country || "", city: s.city || "",
      state: s.state || "", postcode: s.postcode || "", address: s.address || "", tax_id: s.tax_id || "",
      description: s.description || "", status: s.status || "active",
      bank_name: s.bank_name || "", bank_account_name: s.bank_account_name || "", bank_account_number: s.bank_account_number || "",
      bank_iban: s.bank_iban || "", bank_swift: s.bank_swift || "", bank_ifsc: s.bank_ifsc || "",
      bank_address: s.bank_address || "", payment_currency: s.payment_currency || "",
    };
  }
  function setP(k, v) { setProf(f => ({ ...f, [k]: v })); }

  async function loadAll() {
    const [{ data: d }, { data: sp }, { data: ap }] = await Promise.all([
      supabase.from("supplier_documents").select("*").eq("supplier_id", supplier.id).order("id", { ascending: false }),
      supabase.from("supplier_products").select("id, status, product_id, products(name)").eq("supplier_id", supplier.id),
      supabase.from("products").select("id, name").order("name", { ascending: true }).limit(2000),
    ]);
    setDocs(d || []); setSupProducts(sp || []); setAllProducts(ap || []);
  }

  async function saveProfile() {
    setSavingProf(true);
    const patch = {
      company: prof.company.trim(), contact_name: prof.contact_name,
      email: prof.email, contact_email: prof.email,   // keep website + CRM in sync
      phone: prof.phone, website: prof.website, country: prof.country, city: prof.city, state: prof.state,
      postcode: prof.postcode, address: prof.address, tax_id: prof.tax_id, description: prof.description, status: prof.status,
    };
    const { error } = await supabase.from("suppliers").update(patch).eq("id", supplier.id);
    setSavingProf(false);
    if (error) { alert("Could not save profile: " + error.message); return; }
    onSaved && onSaved();
  }
  async function saveBank() {
    setSavingBank(true);
    const patch = {
      bank_name: prof.bank_name, bank_account_name: prof.bank_account_name, bank_account_number: prof.bank_account_number,
      bank_iban: prof.bank_iban, bank_swift: prof.bank_swift, bank_ifsc: prof.bank_ifsc,
      bank_address: prof.bank_address, payment_currency: prof.payment_currency,
    };
    const { error } = await supabase.from("suppliers").update(patch).eq("id", supplier.id);
    setSavingBank(false);
    if (error) { alert("Could not save bank details: " + error.message); return; }
    onSaved && onSaved();
  }

  async function uploadDoc(file, docType, extra = {}) {
    if (!file) return;
    setBusy(true);
    const path = `company/${supplier.id}/${Date.now()}-${file.name}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file);
    if (up.error) { setBusy(false); alert("Upload failed: " + up.error.message); return; }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const row = { supplier_id: supplier.id, doc_type: docType, file_url: pub.publicUrl, file_name: file.name, uploaded_by: "crm", ...extra };
    const { data, error } = await supabase.from("supplier_documents").insert(row).select().single();
    setBusy(false);
    if (error) { alert("Saved file but could not record it: " + error.message); return; }
    setDocs(p => [data, ...p]);
  }
  async function removeDoc(d) {
    if (!window.confirm("Remove this document?")) return;
    // best-effort storage cleanup — parse the path after the bucket name from the public URL
    if (d.file_url && d.file_url.indexOf(`/${BUCKET}/`) !== -1) {
      const p = d.file_url.split(`/${BUCKET}/`)[1];
      if (p) { try { await supabase.storage.from(BUCKET).remove([decodeURIComponent(p)]); } catch (e) {} }
    }
    await supabase.from("supplier_documents").delete().eq("id", d.id);
    setDocs(p => p.filter(x => x.id !== d.id));
  }
  function download(url) { if (url) window.open(url, "_blank"); }

  async function addProduct(productId) {
    if (!productId) return;
    if (supProducts.some(sp => String(sp.product_id) === String(productId))) return;
    const { data, error } = await supabase.from("supplier_products")
      .insert({ supplier_id: supplier.id, product_id: Number(productId), status: "active" })
      .select("id, status, product_id, products(name)").single();
    if (error) { alert("Could not add product: " + error.message); return; }
    setSupProducts(p => [data, ...p]);
  }
  async function removeProduct(sp) {
    await supabase.from("supplier_products").delete().eq("id", sp.id);
    setSupProducts(p => p.filter(x => x.id !== sp.id));
  }

  if (!supplier) return null;
  const certs = docs.filter(d => NON_CERT.indexOf(d.doc_type) === -1);
  const otherDocs = docs.filter(d => NON_CERT.indexOf(d.doc_type) !== -1);
  const headEmail = supplier.contact_email || supplier.email || "";

  // styles
  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", justifyContent: "flex-end" };
  const drawer = { width: "min(720px, 94vw)", height: "100vh", background: C.bg, display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.2)" };
  const header = { background: C.white || "#fff", padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 };
  const card = { background: C.white || "#fff", borderRadius: 10, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12 };
  const label = { fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: C.muted, textTransform: "uppercase", display: "block", marginBottom: 4 };
  const inp = { width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.ink, fontSize: 12.5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const btnP = { background: C.blue, color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
  const btnG = { background: "transparent", color: C.blue, border: `1px solid ${C.blue}55`, borderRadius: 7, padding: "5px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer" };
  const tabBtn = a => ({ padding: "10px 15px", background: "transparent", border: "none", fontSize: 13, fontWeight: a ? 700 : 500, color: a ? C.blue : C.muted, cursor: "pointer", borderBottom: a ? `2px solid ${C.blue}` : "2px solid transparent", marginBottom: -1 });
  const link = { fontSize: 11.5, fontWeight: 700, color: C.blue, cursor: "pointer", background: "transparent", border: 0 };
  function Field({ k, l, ph, type, area, wide }) {
    return <div style={{ gridColumn: wide ? "1 / -1" : "auto" }}>
      <label style={label}>{l}</label>
      {area
        ? <textarea style={{ ...inp, minHeight: 54, resize: "vertical" }} value={prof[k]} onChange={e => setP(k, e.target.value)} placeholder={ph} />
        : <input style={inp} type={type || "text"} value={prof[k]} onChange={e => setP(k, e.target.value)} placeholder={ph} />}
    </div>;
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={drawer} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{fmtName(supplier.company)}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              {supplier.country || "—"}{headEmail ? ` · ${headEmail}` : ""}
              <span style={{ marginLeft: 8, background: `${STATUS_COLORS[supplier.status] || C.muted}22`, color: STATUS_COLORS[supplier.status] || C.muted, borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700, textTransform: "capitalize" }}>{supplier.status}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 17, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ background: C.white || "#fff", padding: "0 24px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 4 }}>
          {TABS.map(t => <button key={t.id} style={tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}{t.id === "products" && supProducts.length ? ` (${supProducts.length})` : ""}{t.id === "certs" && certs.length ? ` (${certs.length})` : ""}</button>)}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {tab === "profile" && (
            <div style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field k="company" l="Company *" ph="Company name" wide />
                <Field k="contact_name" l="Contact name" ph="Full name" />
                <Field k="email" l="Email" ph="supplier@company.com" type="email" />
                <Field k="phone" l="Phone" ph="+91 …" />
                <Field k="website" l="Website" ph="https://…" />
                <Field k="address" l="Address" ph="Street / building" wide />
                <Field k="city" l="City" />
                <Field k="state" l="State / region" />
                <Field k="postcode" l="Postcode" />
                <Field k="country" l="Country" ph="e.g. India" />
                <Field k="tax_id" l="Tax ID (GST/VAT)" />
                <div>
                  <label style={label}>Status</label>
                  <select style={inp} value={prof.status} onChange={e => setP("status", e.target.value)}>
                    <option value="active">Active</option><option value="inactive">Inactive</option><option value="pending">Pending</option>
                  </select>
                </div>
                <Field k="description" l="Description / capabilities" ph="What they supply, MOQ, strengths…" area wide />
              </div>
              <div style={{ marginTop: 12 }}>
                <button style={btnP} onClick={saveProfile} disabled={savingProf}>{savingProf ? "Saving…" : "Save profile"}</button>
              </div>
            </div>
          )}

          {tab === "certs" && (
            <div style={card}>
              <AddCert onAdd={(file, standard, expiry) => uploadDoc(file, "certificate", { label: standard, cert_standard: standard, expiry_date: expiry || null })} busy={busy} inp={inp} label={label} btnG={btnG} />
              <div style={{ marginTop: 12 }}>
                {certs.length === 0 ? <Empty C={C}>No certificates yet.</Empty> : certs.map(d => (
                  <Row key={d.id} C={C}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{d.cert_standard || d.label || "Certificate"}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{d.file_name || d.name || d.doc_type}{d.expiry_date ? ` · expires ${d.expiry_date}` : ""}</div>
                    </div>
                    <span style={{ display: "flex", gap: 12 }}>
                      <button style={link} onClick={() => download(d.file_url)}>Download</button>
                      <button style={{ ...link, color: C.red }} onClick={() => removeDoc(d)}>Remove</button>
                    </span>
                  </Row>
                ))}
              </div>
            </div>
          )}

          {tab === "products" && (
            <div style={card}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <select style={{ ...inp, flex: 1 }} defaultValue="" onChange={e => { addProduct(e.target.value); e.target.value = ""; }}>
                  <option value="">+ Add a product this supplier offers…</option>
                  {allProducts.filter(p => !supProducts.some(sp => String(sp.product_id) === String(p.id))).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {supProducts.length === 0 ? <Empty C={C}>No products mapped yet.</Empty> : supProducts.map(sp => (
                <Row key={sp.id} C={C}>
                  <div style={{ fontSize: 13, color: C.ink }}>{sp.products?.name || `#${sp.product_id}`}
                    {sp.status && sp.status !== "active" && <span style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}>({sp.status})</span>}
                  </div>
                  <button style={{ ...link, color: C.red }} onClick={() => removeProduct(sp)}>Remove</button>
                </Row>
              ))}
            </div>
          )}

          {tab === "bank" && (
            <div style={card}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Remittance details — used to pre-fill the Supplier PO where relevant.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field k="bank_name" l="Bank name" />
                <Field k="bank_account_name" l="Account name" />
                <Field k="bank_account_number" l="Account number" />
                <Field k="payment_currency" l="Currency" ph="USD / EUR / INR" />
                <Field k="bank_iban" l="IBAN" />
                <Field k="bank_swift" l="SWIFT / BIC" />
                <Field k="bank_ifsc" l="IFSC (India)" />
                <Field k="bank_address" l="Bank address" wide />
              </div>
              <div style={{ marginTop: 12 }}>
                <button style={btnP} onClick={saveBank} disabled={savingBank}>{savingBank ? "Saving…" : "Save bank details"}</button>
              </div>
            </div>
          )}

          {tab === "docs" && (
            <div style={card}>
              <AddDoc onAdd={(file, docType) => uploadDoc(file, docType, { label: (DOC_TYPES.find(x => x.v === docType) || {}).l })} busy={busy} inp={inp} label={label} btnG={btnG} />
              <div style={{ marginTop: 12 }}>
                {otherDocs.length === 0 ? <Empty C={C}>No documents yet.</Empty> : otherDocs.map(d => (
                  <Row key={d.id} C={C}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{d.label || (DOC_TYPES.find(x => x.v === d.doc_type) || {}).l || d.doc_type}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{d.file_name || d.name}</div>
                    </div>
                    <span style={{ display: "flex", gap: 12 }}>
                      <button style={link} onClick={() => download(d.file_url)}>Download</button>
                      <button style={{ ...link, color: C.red }} onClick={() => removeDoc(d)}>Remove</button>
                    </span>
                  </Row>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ children, C }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 7, background: C.bg }}>{children}</div>;
}
function Empty({ children, C }) {
  return <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 12 }}>{children}</div>;
}
function AddCert({ onAdd, busy, inp, label, btnG }) {
  const [standard, setStandard] = useState("ISO 9001");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState(null);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
      <div><label style={label}>Standard</label>
        <select style={inp} value={standard} onChange={e => setStandard(e.target.value)}>{CERT_STANDARDS.map(s => <option key={s}>{s}</option>)}</select></div>
      <div><label style={label}>Expiry (optional)</label><input style={inp} type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></div>
      <div><label style={label}>File</label><input style={{ ...inp, padding: 5 }} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
      <button style={{ ...btnG, padding: "8px 12px" }} disabled={busy || !file} onClick={() => { onAdd(file, standard, expiry); setFile(null); setExpiry(""); }}>{busy ? "…" : "+ Add"}</button>
    </div>
  );
}
function AddDoc({ onAdd, busy, inp, label, btnG }) {
  const [docType, setDocType] = useState("profile");
  const [file, setFile] = useState(null);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
      <div><label style={label}>Type</label>
        <select style={inp} value={docType} onChange={e => setDocType(e.target.value)}>{DOC_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
      <div><label style={label}>File</label><input style={{ ...inp, padding: 5 }} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
      <button style={{ ...btnG, padding: "8px 12px" }} disabled={busy || !file} onClick={() => { onAdd(file, docType); setFile(null); }}>{busy ? "…" : "+ Add"}</button>
    </div>
  );
}
