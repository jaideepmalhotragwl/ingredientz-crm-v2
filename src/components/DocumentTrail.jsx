import { useState, useEffect, useMemo } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { dbInsert, dbDelete, fmtDate } from "../utils.js";
import {
  uploadOrderDocument,
  getOrderDocumentUrl,
  deleteOrderDocument,
  getRouteLabel
} from "../lib/orderUtils.js";

// ── Stage model ────────────────────────────────────────────────────────────────
const SELL = "sell", BUY = "buy", LOG = "log";
const SIDE = {
  sell: { label: "Sell", color: C.blue },
  buy:  { label: "Buy",  color: "#8E44AD" },
  log:  { label: "Logistics", color: "#16A085" }
};

// auto = pull the file from an existing record (customer PO / invoice / supplier PO)
function buildStages(route) {
  const base = [
    { key: "customer_po",      side: SELL, name: "Customer PO received",        slots: [{ type: "po",            label: "Customer PO",            auto: "customer_po" }] },
    { key: "customer_invoice", side: SELL, name: "Invoice raised to customer",  slots: [{ type: "invoice",       label: "Customer Invoice",       auto: "customer_invoice" }] },
    { key: "customer_payment", side: SELL, name: "Customer payment received",   slots: [{ type: "payment_proof", label: "Payment receipt / advice" }] },
    { key: "supplier_po",      side: BUY,  name: "PO raised to supplier(s)",    slots: [{ type: "po",            label: "Supplier PO",            auto: "supplier_po" }] },
    { key: "supplier_invoice", side: BUY,  name: "Supplier invoice received",   slots: [{ type: "invoice",       label: "Supplier Invoice",       auto: "supplier_invoice" }] },
    { key: "supplier_payment", side: BUY,  name: "Payment made to supplier",    slots: [{ type: "payment_proof", label: "Payment proof" }] },
    { key: "supplier_goods",   side: BUY,  name: "Supplier prepares goods",     slots: [
        { type: "packing_list", label: "Packing List" },
        { type: "bl",           label: "Bill of Lading (BL)" },
        { type: "label",        label: "Label" },
        { type: "coa",          label: "CoA / MSDS" }
    ] }
  ];
  let delivery = [];
  if (route === "via_warehouse") {
    delivery = [
      { key: "warehouse_inbound",  side: LOG, name: "Goods arrive at our warehouse",        slots: [{ type: "grn", label: "GRN / inbound doc" }] },
      { key: "warehouse_dispatch", side: LOG, name: "Dispatch — our warehouse → customer",  slots: [
          { type: "packing_list", label: "Our Packing List" },
          { type: "invoice",      label: "Our Invoice" },
          { type: "bl",           label: "BL / AWB" },
          { type: "label",        label: "Label" }
      ] }
    ];
  } else if (route === "direct_from_supplier") {
    delivery = [
      { key: "direct_dispatch", side: LOG, name: "Direct dispatch — supplier → customer", slots: [
          { type: "bl",           label: "BL (to customer)" },
          { type: "packing_list", label: "Packing List (to customer)" },
          { type: "label",        label: "Label" }
      ] }
    ];
  } else { // direct_to_customer or unset
    delivery = [
      { key: "customer_dispatch", side: LOG, name: "Dispatch to customer", slots: [
          { type: "packing_list", label: "Our Packing List" },
          { type: "invoice",      label: "Our Invoice" },
          { type: "bl",           label: "BL / AWB" },
          { type: "label",        label: "Label" }
      ] }
    ];
  }
  return base.concat(delivery);
}

const SHARED_BY = [
  { v: "us",       l: "Us" },
  { v: "supplier", l: "Supplier" },
  { v: "customer", l: "Customer" }
];

export function DocumentTrail({ order, supplierPOs = [], invoices = [], suppliers = [] }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null); // {stageKey, docType, label, side}
  const [form, setForm] = useState({ file: null, shared_by: "us", shared_by_name: "", supplier_po_id: "", shared_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [saving, setSaving] = useState(false);

  const stages = useMemo(() => buildStages(order?.shipment_route), [order?.shipment_route]);

  useEffect(() => { if (order?.id) load(); /* eslint-disable-next-line */ }, [order?.id]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("order_documents").select("*").eq("order_id", order.id).order("created_at", { ascending: true });
    if (error) console.error("load order_documents", error);
    setDocs(data || []);
    setLoading(false);
  }

  // ── Auto docs (read-only, from existing records) ──────────────────────────────
  function autoDocs(autoKey) {
    if (autoKey === "customer_po") {
      return order.customer_po_file_url
        ? [{ label: order.customer_po_number || "Customer PO", meta: "from PO record", path: order.customer_po_file_url }]
        : [];
    }
    if (autoKey === "customer_invoice") {
      return invoices.filter(i => i.invoice_type === "customer" && i.file_url)
        .map(i => ({ label: i.invoice_number, meta: i.status, path: i.file_url }));
    }
    if (autoKey === "supplier_po") {
      return supplierPOs.filter(po => po.pdf_url).map(po => {
        const s = suppliers.find(x => x.id === po.supplier_id);
        return { label: po.supplier_po_number, meta: s?.company || "supplier", path: po.pdf_url };
      });
    }
    if (autoKey === "supplier_invoice") {
      return invoices.filter(i => i.invoice_type === "supplier" && i.file_url)
        .map(i => ({ label: i.invoice_number, meta: i.status, path: i.file_url }));
    }
    return [];
  }

  function manualDocs(stageKey, docType) {
    return docs.filter(d => d.stage === stageKey && d.doc_type === docType);
  }

  // slot filled if it has at least one doc (auto file or a manual upload)
  function slotFilled(stageKey, slot) {
    if (slot.auto && autoDocs(slot.auto).length > 0) return true;
    return manualDocs(stageKey, slot.type).length > 0;
  }
  function stageState(stage) {
    const filled = stage.slots.filter(s => slotFilled(stage.key, s)).length;
    if (filled === 0) return "none";
    if (filled === stage.slots.length) return "done";
    return "partial";
  }

  async function download(path) {
    if (!path) return;
    const { url, error } = await getOrderDocumentUrl(path);
    if (error || !url) { alert("Could not open the file."); return; }
    window.open(url, "_blank");
  }

  function openAdd(stage, slot) {
    setForm({ file: null, shared_by: stage.side === BUY ? "supplier" : stage.side === LOG ? "us" : "us", shared_by_name: "", supplier_po_id: "", shared_date: new Date().toISOString().slice(0, 10), notes: "" });
    setAdding({ stageKey: stage.key, docType: slot.type, label: slot.label, side: stage.side });
  }

  async function saveDoc() {
    if (!form.file) { alert("Pick a file first."); return; }
    setSaving(true);
    const prefix = `orders/${order.order_number}/${adding.stageKey}/${adding.docType}`;
    const { path, error } = await uploadOrderDocument(form.file, prefix);
    if (error || !path) { setSaving(false); alert("Upload failed — please try again."); return; }
    const row = {
      order_id: order.id,
      supplier_po_id: form.supplier_po_id ? Number(form.supplier_po_id) : null,
      stage: adding.stageKey,
      doc_type: adding.docType,
      label: adding.label,
      file_url: path,
      file_name: form.file.name,
      shared_by: form.shared_by,
      shared_by_name: form.shared_by_name ? form.shared_by_name.trim() : null,
      shared_date: form.shared_date || null,
      notes: form.notes ? form.notes.trim() : null
    };
    const saved = await dbInsert("order_documents", row);
    setSaving(false);
    if (!saved) { alert("Could not save the document record — please try again."); return; }
    setAdding(null);
    await load();
  }

  async function removeDoc(d) {
    if (!window.confirm("Remove this document?")) return;
    if (d.file_url) await deleteOrderDocument(d.file_url);
    await dbDelete("order_documents", d.id);
    setDocs(p => p.filter(x => x.id !== d.id));
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "13px 15px" };
  const chip = (bg, col) => ({ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", padding: "2px 7px", borderRadius: 99, background: bg, color: col, whiteSpace: "nowrap" });
  const link = { fontSize: 11.5, fontWeight: 700, color: C.blue, cursor: "pointer", whiteSpace: "nowrap", background: "transparent", border: 0 };

  if (loading) return <div style={{ padding: 24, color: C.muted, fontSize: 12 }}>Loading documents…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Document trail</div>
        <span style={chip(`${SIDE.log.color}18`, SIDE.log.color)}>{getRouteLabel(order.shipment_route) || "Route not set"}</span>
      </div>

      {/* Add panel */}
      {adding && (
        <div style={{ ...card, border: `1px solid ${C.blue}55`, marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, marginBottom: 10 }}>Add: {adding.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: "span 2" }}>
              <Lbl>File</Lbl>
              <input type="file" onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))} style={{ fontSize: 12 }} />
            </div>
            <div>
              <Lbl>Shared by</Lbl>
              <select value={form.shared_by} onChange={e => setForm(f => ({ ...f, shared_by: e.target.value }))} style={inp}>
                {SHARED_BY.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Date</Lbl>
              <input type="date" value={form.shared_date} onChange={e => setForm(f => ({ ...f, shared_date: e.target.value }))} style={inp} />
            </div>
            <div>
              <Lbl>Name (optional)</Lbl>
              <input value={form.shared_by_name} onChange={e => setForm(f => ({ ...f, shared_by_name: e.target.value }))} placeholder="Person / company" style={inp} />
            </div>
            {adding.side === BUY && supplierPOs.length > 0 && (
              <div>
                <Lbl>Link to supplier PO (optional)</Lbl>
                <select value={form.supplier_po_id} onChange={e => setForm(f => ({ ...f, supplier_po_id: e.target.value }))} style={inp}>
                  <option value="">—</option>
                  {supplierPOs.map(po => <option key={po.id} value={po.id}>{po.supplier_po_number}</option>)}
                </select>
              </div>
            )}
            <div style={{ gridColumn: "span 2" }}>
              <Lbl>Notes (optional)</Lbl>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anything to note" style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveDoc} disabled={saving} style={{ background: C.blue, color: "#fff", border: 0, padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{saving ? "Saving…" : "Save document"}</button>
            <button onClick={() => setAdding(null)} style={{ background: "transparent", color: C.ink, border: `1px solid ${C.border}`, padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Trail */}
      {stages.map((stage, idx) => {
        const st = stageState(stage);
        const node = st === "done" ? C.green : st === "partial" ? C.amber : C.muted;
        const side = SIDE[stage.side];
        return (
          <div key={stage.key} style={{ position: "relative", paddingLeft: 34, marginBottom: 12 }}>
            {idx < stages.length - 1 && <div style={{ position: "absolute", left: 11, top: 24, bottom: -12, width: 2, background: C.border }} />}
            <div style={{ position: "absolute", left: 0, top: 4, width: 24, height: 24, borderRadius: "50%", background: node, border: `3px solid ${C.bg}`, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {st === "done" ? "✓" : idx + 1}
            </div>
            <div style={{ ...card, borderLeft: `4px solid ${side.color}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{stage.name}</div>
                <span style={chip(`${side.color}1d`, side.color)}>{side.label}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {stage.slots.map(slot => {
                  const autos = slot.auto ? autoDocs(slot.auto) : [];
                  const mans = manualDocs(stage.key, slot.type);
                  const has = autos.length > 0 || mans.length > 0;
                  return (
                    <div key={slot.type} style={{ border: `1px ${has ? "solid" : "dashed"} ${C.border}`, borderRadius: 7, padding: "8px 10px", background: has ? "#fff" : "#fafbfc" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: has ? C.ink : C.muted }}>
                          {slot.label}{slot.auto && <span style={{ ...chip(`${C.blue}15`, C.blue), marginLeft: 6, border: `1px solid ${C.blue}30` }}>Auto</span>}
                        </div>
                        {!has && <span style={chip("#e9eaee", C.muted)}>Pending</span>}
                      </div>

                      {/* auto files */}
                      {autos.map((a, i) => (
                        <div key={"a" + i} style={rowLine}>
                          <span style={{ fontSize: 11.5, color: C.ink }}>📄 {a.label} <span style={{ color: C.muted }}>· {a.meta}</span></span>
                          <button style={link} onClick={() => download(a.path)}>Download ↓</button>
                        </div>
                      ))}

                      {/* manual files */}
                      {mans.map(d => (
                        <div key={d.id} style={rowLine}>
                          <span style={{ fontSize: 11.5, color: C.ink }}>
                            📄 {d.file_name || d.label}
                            <span style={{ color: C.muted }}> · {d.shared_by}{d.shared_by_name ? ` (${d.shared_by_name})` : ""}{d.shared_date ? ` · ${fmtDate(d.shared_date)}` : ""}</span>
                          </span>
                          <span style={{ display: "flex", gap: 10 }}>
                            <button style={link} onClick={() => download(d.file_url)}>Download ↓</button>
                            <button style={{ ...link, color: C.red }} onClick={() => removeDoc(d)}>Remove</button>
                          </span>
                        </div>
                      ))}

                      {/* add (manual slots only; auto slots are filled from the PO/Invoice forms) */}
                      {!slot.auto && (
                        <div style={{ marginTop: has ? 6 : 4 }}>
                          <button style={link} onClick={() => openAdd(stage, slot)}>+ Add file</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const inp = { width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 9px", fontSize: 12, color: C.ink, outline: "none" };
const rowLine = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 };
function Lbl({ children }) {
  return <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.muted, marginBottom: 3 }}>{children}</div>;
}
