import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { sendEmail } from "../utils.js";
import { RFQ_TEMPLATE } from "../templates.js";


// ── SUPPLIER RFQ DRAWER (inside EnquiryDrawer) ────────────────────────────────
function RFQForwardPanel({ enq, users, onThreadInserted }) {
  const [suppliers, setSuppliers] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [sending, setSending] = useState({});
  const [sent, setSent] = useState({});
  const [excludedIds, setExcludedIds] = useState(new Set());
  const [addedSuppliers, setAddedSuppliers] = useState([]);
  const [pickSup, setPickSup] = useState("");


  const PROCUREMENT_SENDER = "procurement@mail.ingredientz.co";
  const PROCUREMENT_REPLY  = "procurement@ingredientz.co";


  useEffect(() => {
    async function load() {
      const { data: sup } = await supabase.from("suppliers").select("*").eq("status", "active").order("company");
      const { data: map } = await supabase
        .from("supplier_products")
        .select("*,suppliers(id,company,contact_name,contact_email),products(id,name)")
        .eq("status", "active");
      setSuppliers(sup || []);
      setMappings(map || []);
    }
    load();
  }, []);


  const norm = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const products = Array.isArray(enq.products) ? enq.products : [];


  // For each product in the enquiry, find mapped suppliers (normalised name match, or product_id)
  const productSupplierMap = products.map(p => {
    const matched = mappings.filter(m =>
      (m.products?.name && norm(m.products.name) === norm(p.name)) ||
      (p.product_id && m.products?.id === p.product_id)
    );
    return { product: p, mappedSuppliers: matched.map(m => m.suppliers).filter(Boolean) };
  });


  // Build supplier -> products groups from the mappings
  const groupMap = {};
  productSupplierMap.forEach(({ product, mappedSuppliers }) => {
    mappedSuppliers.forEach(sup => {
      if (!groupMap[sup.id]) groupMap[sup.id] = { supplier: sup, products: [] };
      if (!groupMap[sup.id].products.some(x => norm(x.name) === norm(product.name))) {
        groupMap[sup.id].products.push(product);
      }
    });
  });
  // Ad-hoc suppliers added for this RFQ receive all enquiry products
  addedSuppliers.forEach(sup => {
    if (!groupMap[sup.id]) groupMap[sup.id] = { supplier: sup, products: [...products] };
  });


  const groups = Object.values(groupMap).filter(g => !excludedIds.has(g.supplier.id));


  // Products not covered by any included supplier
  const coveredNames = new Set();
  groups.forEach(g => g.products.forEach(p => coveredNames.add(norm(p.name))));
  const unmatched = products.filter(p => !coveredNames.has(norm(p.name)));


  // Suppliers available to add (active, not already shown)
  const shownIds = new Set(groups.map(g => g.supplier.id));
  const available = suppliers.filter(s => !shownIds.has(s.id));


  function excludeSupplier(id) {
    setExcludedIds(prev => { const n = new Set(prev); n.add(id); return n; });
    setAddedSuppliers(prev => prev.filter(s => s.id !== id));
  }
  function addSupplier() {
    if (!pickSup) return;
    const sup = suppliers.find(s => String(s.id) === String(pickSup));
    if (sup) {
      setExcludedIds(prev => { const n = new Set(prev); n.delete(sup.id); return n; });
      setAddedSuppliers(prev => prev.some(s => s.id === sup.id) ? prev : [...prev, sup]);
    }
    setPickSup("");
  }


  async function sendRFQ(supplier, productsForSupplier) {
    if (!supplier?.contact_email) { alert("Supplier has no email."); return; }
    const key = supplier.id;
    setSending(s => ({ ...s, [key]: true }));
    const subject = RFQ_TEMPLATE.subject(productsForSupplier, enq.id);
    const bodyText = RFQ_TEMPLATE.text(supplier, productsForSupplier, enq);
    const html = RFQ_TEMPLATE.html(supplier, productsForSupplier, enq);
    await sendEmail({
      from: `Ingredientz Procurement <${PROCUREMENT_SENDER}>`,
      to: supplier.contact_email,
      subject, html, text: bodyText,
      reply_to: PROCUREMENT_REPLY,
      bcc: ["sales@ingredientz.co", "procurement@ingredientz.co"]
    });
    // Log it
    const threadRow = { enquiry_id: enq.id, customer_name: enq.customer_name, direction: "auto-sent", subject, body: bodyText, from_email: PROCUREMENT_SENDER, to_email: supplier.contact_email, sent_at: new Date().toISOString() };
    const { data: tData } = await supabase.from("email_threads").insert(threadRow).select().single();
    if (tData && onThreadInserted) onThreadInserted(tData);
    // Schedule RFQ follow-up sequence: day 1, 3, 7
    const now = new Date();
    const seqRows = [1, 3, 7].map((days, idx) => ({
      enquiry_id: enq.id, customer_name: enq.customer_name, sequence_type: "rfq", step: idx + 1,
      supplier_contact_name: supplier.contact_name || null,
      supplier_company: supplier.company || null,
      scheduled_at: new Date(now.getTime() + days * 86400000).toISOString(),
      to_email: supplier.contact_email, from_email: PROCUREMENT_SENDER,
      body_preview: productsForSupplier.map(p => p.name).join(", ")
    }));
    await supabase.from("email_sequences")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("enquiry_id", enq.id).eq("sequence_type", "rfq")
      .eq("to_email", supplier.contact_email)
      .is("sent_at", null).is("cancelled_at", null);
    await supabase.from("email_sequences").insert(seqRows);
    setSending(s => ({ ...s, [key]: false }));
    setSent(s => ({ ...s, [key]: true }));
    setTimeout(() => setSent(s => ({ ...s, [key]: false })), 4000);
  }


  async function sendAll() {
    for (const g of groups) {
      await sendRFQ(g.supplier, g.products);
    }
  }


  return <div style={{ padding: "16px 0" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: C.blue, textTransform: "uppercase" }}>Forward RFQ to Suppliers</div>
      {groups.length > 1 && <button onClick={sendAll} style={{ background: C.blue, color: "white", border: "none", borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>Send all ({groups.length})</button>}
    </div>
    <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>Sending from: <span style={{ color: C.ink, fontWeight: 600 }}>{PROCUREMENT_SENDER}</span> · one email per supplier · customer hidden</div>


    {groups.map(({ supplier, products: prods }) => (
      <div key={supplier.id} style={{ background: C.bg, borderRadius: 10, padding: 14, border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{supplier.company}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{supplier.contact_name || ""}{supplier.contact_email ? ` · ${supplier.contact_email}` : ""}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button onClick={() => sendRFQ(supplier, prods)} disabled={sending[supplier.id] || sent[supplier.id]}
              style={{ background: sent[supplier.id] ? C.green : C.blue, color: "white", border: "none", borderRadius: 7, padding: "6px 14px", cursor: (sending[supplier.id] || sent[supplier.id]) ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, opacity: (sending[supplier.id] || sent[supplier.id]) ? 0.8 : 1, whiteSpace: "nowrap" }}>
              {sent[supplier.id] ? "✓ Sent!" : sending[supplier.id] ? "Sending…" : "📨 Send RFQ"}
            </button>
            <button onClick={() => excludeSupplier(supplier.id)} title="Remove from this RFQ"
              style={{ background: "transparent", border: `1px solid ${C.red}44`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: C.red, fontSize: 11 }}>✕</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {prods.map((product, i) => (
            <div key={i} style={{ fontSize: 12, color: C.ink }}><span style={{ fontSize: 10, color: C.amber, fontWeight: 700, marginRight: 8 }}>▸</span>{product.name}{product.qty ? ` — ${product.qty} ${product.unit || "kg"}` : ""}</div>
          ))}
        </div>
      </div>
    ))}


    {groups.length === 0 && <div style={{ textAlign: "center", padding: "24px 16px", color: C.muted, fontSize: 12 }}>
      No suppliers selected for this RFQ.<br />
      <span style={{ fontSize: 11 }}>Add one below, or map suppliers in the Products tab.</span>
    </div>}


    {unmatched.length > 0 && <div style={{ background: "#FFF8E6", border: `1px solid ${C.amber}55`, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 4 }}>No supplier mapped for:</div>
      {unmatched.map((p, i) => (<div key={i} style={{ fontSize: 12, color: C.ink }}>• {p.name}</div>))}
      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Add a supplier below to include these, or map one in the Products tab.</div>
    </div>}


    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
      <select value={pickSup} onChange={e => setPickSup(e.target.value)} style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", color: pickSup ? C.ink : C.muted, fontSize: 12, outline: "none" }}>
        <option value="">Add another supplier…</option>
        {available.map(s => <option key={s.id} value={String(s.id)}>{s.company}{s.country ? ` (${s.country})` : ""}</option>)}
      </select>
      <button onClick={addSupplier} disabled={!pickSup} style={{ background: C.blueLt || "#E7F0FE", border: `1px solid #BFD6F6`, borderRadius: 7, padding: "7px 13px", cursor: pickSup ? "pointer" : "not-allowed", color: C.blue, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>+ Add</button>
    </div>
  </div>;
}


export { RFQForwardPanel };