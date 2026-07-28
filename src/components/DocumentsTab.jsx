import { useState, useEffect } from "react";
import { C } from "../constants.js";
import { SUPA_URL, SUPA_KEY } from "../config.js";
import { GROUP_A, FIELDS, findDoc } from "../lib/docTemplates.js";
import { ENTITIES, resolveLetterhead, openBrandedDoc } from "../lib/letterhead.js";
// ── COUNTRY LIST ──────────────────────────────────────────────────────────
const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Argentina","Armenia","Australia","Austria",
  "Azerbaijan","Bahrain","Bangladesh","Belarus","Belgium","Bolivia","Bosnia and Herzegovina",
  "Botswana","Brazil","Brunei","Bulgaria","Cambodia","Cameroon","Canada","Chile","China",
  "Colombia","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Estonia","Ethiopia","Finland","France","Georgia","Germany",
  "Ghana","Greece","Guatemala","Honduras","Hong Kong","Hungary","Iceland","India","Indonesia",
  "Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya",
  "Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Libya","Liechtenstein","Lithuania",
  "Luxembourg","Macao","Malaysia","Maldives","Malta","Mauritius","Mexico","Moldova","Mongolia",
  "Montenegro","Morocco","Myanmar","Nepal","Netherlands","New Zealand","Nicaragua","Nigeria",
  "North Macedonia","Norway","Oman","Pakistan","Panama","Paraguay","Peru","Philippines","Poland",
  "Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Singapore",
  "Slovakia","Slovenia","South Africa","South Korea","Spain","Sri Lanka","Sweden","Switzerland",
  "Syria","Taiwan","Tajikistan","Tanzania","Thailand","Tunisia","Turkey","Turkmenistan","Uganda",
  "Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan",
  "Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"
];
// Entities, country routing and the letterhead itself now live in
// src/lib/letterhead.js — the same renderer used by invoices and supplier POs.
// Change an address there and every document in the app follows.

const DOC_TYPES = [
  { id: "coa",       label: "Certificate of Analysis" },
  { id: "sds",       label: "Safety Data Sheet (SDS / MSDS)" },
  { id: "tds",       label: "Technical Data Sheet" },
  { id: "spec",      label: "Product Specification" },
  { id: "nutrition", label: "Nutritional Information" },
  { id: "invoice",   label: "Invoice / Proforma" },
  { id: "po",        label: "Purchase Order" },
  { id: "letter",    label: "General Letter" },
];
const REFORMAT_ENDPOINT = `${SUPA_URL}/functions/v1/reformat-document`;
// ── MAIN COMPONENT ────────────────────────────────────────────────────────
export function DocumentsTab() {
  const [mode, setMode]       = useState("reformat");   // "reformat" | "generate"
  const [country, setCountry] = useState("");
  const [docType, setDocType] = useState("coa");
  const [file, setFile]       = useState(null);
  const [addStamp, setAddStamp] = useState(true);
  const [addDate, setAddDate]   = useState(false);
  const [status, setStatus]   = useState(null);
  const [busy, setBusy]       = useState(false);
  // ── Generate-mode state ───────────────────────────────────────────────────
  const [genType, setGenType]         = useState("gras");
  const [genFields, setGenFields]     = useState({});
  const [genRows, setGenRows]         = useState([]);
  const [genSections, setGenSections] = useState([]);
  const genDoc = findDoc(genType);
  useEffect(() => {
    const d = findDoc(genType);
    setGenRows(d && d.defaultRows ? d.defaultRows.map(r => ({ ...r })) : []);
    setGenSections(d && d.defaultSections ? d.defaultSections.map(s => ({ ...s })) : []);
  }, [genType]);
  const setF        = (k, v) => setGenFields(f => ({ ...f, [k]: v }));
  const setRowCell  = (i, key, v) => setGenRows(rs => rs.map((r, idx) => idx === i ? { ...r, [key]: v } : r));
  const addRow      = () => setGenRows(rs => [...rs, Object.fromEntries((genDoc.columns || []).map(c => [c.key, ""]))]);
  const delRow      = (i) => setGenRows(rs => rs.filter((_, idx) => idx !== i));
  const setSecText  = (i, v) => setGenSections(ss => ss.map((s, idx) => idx === i ? { ...s, text: v } : s));

  const lh = country ? resolveLetterhead(country) : null;
  const entity = lh ? ENTITIES[lh] : null;
  const canConvert = country && file && !busy && lh === "INC";
  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) {
      setStatus({ type: "error", msg: "File too large. Max 4 MB." });
      return;
    }
    setFile(f);
    setStatus(null);
  }
  async function readFileAsBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = () => rej(new Error("File read failed"));
      r.readAsDataURL(file);
    });
  }
  async function handleConvert() {
    if (!canConvert) return;
    setBusy(true);
    setStatus({ type: "working", msg: "Reading document and extracting content…" });
    try {
      const fileB64 = await readFileAsBase64(file);
      const res = await fetch(REFORMAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPA_KEY}`,
          "apikey": SUPA_KEY,
        },
        body: JSON.stringify({
          letterhead: lh,
          docType,
          fileB64,
          mediaType: file.type,
          addStamp,
          addDate,
          country,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const { html, error } = await res.json();
      if (error) throw new Error(error);
      setStatus({ type: "success", msg: "Conversion complete. Opening for preview…" });
      renderLetterhead(html, entity, addStamp);
    } catch (err) {
      setStatus({ type: "error", msg: "Conversion failed: " + err.message });
    } finally {
      setBusy(false);
    }
  }
  // ── Generate a document from a template (always Ingredientz Inc) ────────────
  function handleGenerate() {
    const doc = findDoc(genType);
    if (!doc) return;
    if (!genFields.product || !genFields.product.trim()) {
      setStatus({ type: "error", msg: "Product name is required." });
      return;
    }
    const ent = ENTITIES.INC;
    const f = { ...genFields, entityName: ent.name };
    if (doc.rowKey)     f.rows = genRows;
    if (doc.sectionKey) f.sections = genSections;
    setStatus({ type: "success", msg: "Opening document for preview…" });
    renderLetterhead(doc.body(f), ent, addStamp);
  }

  // ── Render a document on the shared Ingredientz letterhead ────────────────
  // All the work — letterhead, watermark, stamp, A4 print geometry, repeating
  // header/footer — happens in src/lib/letterhead.js. Do not restyle here.
  function renderLetterhead(bodyHtml, ent, withStamp) {
    const res = openBrandedDoc(bodyHtml, ent, { addStamp: withStamp, autoPrint: true });
    if (res && res.ok === false) setStatus({ type: "error", msg: res.error });
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  const modeBtn = (id, label) => (
    <button onClick={() => { setMode(id); setStatus(null); }}
      style={{
        padding: "8px 16px", border: `1px solid ${mode === id ? "#1877F2" : C.border}`,
        borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
        background: mode === id ? "#1877F2" : "white", color: mode === id ? "white" : C.muted,
        fontFamily: "Arial,sans-serif",
      }}>{label}</button>
  );
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{
        background: "white", border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 18, marginBottom: 14,
        display: "flex", alignItems: "flex-start", gap: 14
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: "#E7F0FE", color: "#1877F2",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0
        }}>📄</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
            Documents
          </div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            <b>Reformat</b> supplier data documents (CoA, SDS, TDS, Nutritional) onto your letterhead, or <b>generate</b> branded compliance declarations (GRAS, BSE/TSE, allergen, etc.) from templates.
          </div>
        </div>
      </div>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {modeBtn("reformat", "↻ Reformat upload")}
        {modeBtn("generate", "✦ Generate document")}
      </div>
      {/* ── REFORMAT MODE ─────────────────────────────────────────────────── */}
      {mode === "reformat" && (
        <div style={{
          background: "white", border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 22
        }}>
          <Field label="Customer Country">
            <select
              value={country}
              onChange={e => { setCountry(e.target.value); setStatus(null); }}
              style={inputStyle}
            >
              <option value="">Select a country…</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {entity && lh === "INC" && (
              <Badge color="#1E40AF" bg="#DBEAFE">● Will use: Ingredientz Inc letterhead</Badge>
            )}
            {entity && lh === "PROIN" && (
              <Badge color="#9A3412" bg="#FED7AA">● Proingredientz letterhead — coming soon (only USA + Canada live right now)</Badge>
            )}
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Document Type">
              <select value={docType} onChange={e => setDocType(e.target.value)} style={inputStyle}>
                {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Source File">
              <input type="file" accept=".pdf,image/*" onChange={handleFile} style={{ ...inputStyle, padding: "7px 10px" }} />
              {file && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
                  ✓ {file.name} ({Math.round(file.size / 1024)} KB)
                </div>
              )}
            </Field>
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 14, marginBottom: 4 }}>
            <Toggle checked={addStamp} onChange={setAddStamp} label="Add company stamp" />
            <Toggle checked={addDate} onChange={setAddDate} label="Add today's date" />
          </div>
          <button onClick={handleConvert} disabled={!canConvert}
            style={{
              width: "100%", marginTop: 18, padding: "12px 16px",
              background: canConvert ? "#1877F2" : "#BCC0C4",
              color: "white", border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 700,
              cursor: canConvert ? "pointer" : "not-allowed", fontFamily: "Arial,sans-serif"
            }}>
            {busy ? "Converting…" : "Reformat Document →"}
          </button>
          {status && <StatusMsg status={status} />}
          <div style={{ marginTop: 14, fontSize: 11, color: C.muted, textAlign: "center" }}>
            Letterhead routing: USA &amp; Canada → Ingredientz Inc · Rest of World → Proingredientz
          </div>
        </div>
      )}
      {/* ── GENERATE MODE ─────────────────────────────────────────────────── */}
      {mode === "generate" && genDoc && (
        <div style={{
          background: "white", border: `1px solid ${C.border}`, borderRadius: 10, padding: 22
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Document">
              <select value={genType} onChange={e => setGenType(e.target.value)} style={inputStyle}>
                {GROUP_A.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Reference no. (optional)">
              <input value={genFields.ref || ""} onChange={e => setF("ref", e.target.value)} style={inputStyle} placeholder="e.g. IZ-GRAS-0042" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {genDoc.fields.map(k => {
              const fd = FIELDS[k]; if (!fd) return null;
              return (
                <Field key={k} label={fd.label + (fd.required ? " *" : "")}>
                  {fd.type === "textarea"
                    ? <textarea value={genFields[k] || ""} onChange={e => setF(k, e.target.value)} placeholder={fd.placeholder || ""} style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} />
                    : <input type={fd.type === "date" ? "date" : "text"} value={genFields[k] || ""} onChange={e => setF(k, e.target.value)} placeholder={fd.placeholder || ""} style={inputStyle} />}
                </Field>
              );
            })}
          </div>
          {/* Group B — editable rows table */}
          {genDoc.columns && (
            <div style={{ marginTop: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.ink, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>{genDoc.name} rows</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: `${genDoc.columns.map(() => "1fr").join(" ")} 34px`, gap: 0, background: C.bg, padding: "6px 8px", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>
                  {genDoc.columns.map(c => <div key={c.key}>{c.label}</div>)}
                  <div />
                </div>
                {genRows.map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: `${genDoc.columns.map(() => "1fr").join(" ")} 34px`, gap: 6, padding: "5px 8px", borderTop: `1px solid ${C.border}`, alignItems: "center" }}>
                    {genDoc.columns.map(c => (
                      <input key={c.key} value={r[c.key] || ""} onChange={e => setRowCell(i, c.key, e.target.value)} style={{ ...inputStyle, padding: "5px 7px", fontSize: 12 }} />
                    ))}
                    <button onClick={() => delRow(i)} style={{ background: "transparent", border: `1px solid ${C.red}44`, borderRadius: 6, color: C.red, cursor: "pointer", height: 28 }}>×</button>
                  </div>
                ))}
              </div>
              <button onClick={addRow} style={{ marginTop: 8, border: `1px dashed ${C.border}`, borderRadius: 8, padding: "7px 12px", background: "transparent", color: "#1877F2", fontSize: 12, cursor: "pointer" }}>+ Add row</button>
            </div>
          )}
          {/* SDS — editable 16 sections */}
          {genDoc.sectionKey && (
            <div style={{ marginTop: 6, marginBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              {genSections.map((s, i) => (
                <div key={i}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.ink }}>{s.heading}</label>
                  <textarea value={s.text || ""} onChange={e => setSecText(i, e.target.value)} style={{ ...inputStyle, minHeight: 48, resize: "vertical", marginTop: 4 }} />
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 22, marginTop: 8, marginBottom: 4 }}>
            <Toggle checked={addStamp} onChange={setAddStamp} label="Add company stamp" />
          </div>
          <button onClick={handleGenerate}
            style={{
              width: "100%", marginTop: 14, padding: "12px 16px",
              background: "#1877F2", color: "white", border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Arial,sans-serif"
            }}>
            Generate &amp; Preview →
          </button>
          {status && <StatusMsg status={status} />}
          <div style={{ marginTop: 14, fontSize: 11, color: C.muted, textAlign: "center" }}>
            Issued on Ingredientz Inc letterhead · review wording with QA before sending
          </div>
        </div>
      )}
    </div>
  );
}
const inputStyle = {
  width: "100%",
  padding: "9px 11px",
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  fontSize: 13,
  fontFamily: "Arial,sans-serif",
  background: "white",
  boxSizing: "border-box",
};
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", fontSize: 11, fontWeight: 600,
        color: C.ink, marginBottom: 5, letterSpacing: 0.3, textTransform: "uppercase"
      }}>{label}</label>
      {children}
    </div>
  );
}
function StatusMsg({ status }) {
  return (
    <div style={{
      marginTop: 14, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
      background: status.type === "error" ? "#FEE2E2" : status.type === "success" ? "#D1FAE5" : "#DBEAFE",
      color: status.type === "error" ? "#991B1B" : status.type === "success" ? "#065F46" : "#1E40AF",
      border: `1px solid ${status.type === "error" ? "#FCA5A5" : status.type === "success" ? "#86EFAC" : "#93C5FD"}`
    }}>{status.msg}</div>
  );
}
function Badge({ color, bg, children }) {
  return (
    <div style={{
      marginTop: 8, display: "inline-block", background: bg, color,
      padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600
    }}>{children}</div>
  );
}
function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: C.ink }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 14, height: 14, cursor: "pointer" }} />
      {label}
    </label>
  );
}
