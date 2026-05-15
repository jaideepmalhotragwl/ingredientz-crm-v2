import { useState } from "react";
import { C } from "../constants.js";
import { SUPA_URL, SUPA_KEY } from "../config.js";

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

const INC_COUNTRIES = new Set(["United States", "Canada"]);

const ENTITIES = {
  INC: {
    name: "Ingredientz Inc",
    address: "8 The Green, Ste A, Dover, DE 19901, USA",
    phone: "+1 702 472 8805",
    email: "support@ingredientz.co",
    web: "www.ingredientz.co",
    label: "Ingredientz Inc (USA)",
    headerImg: "/letterheads/header.png",
    footerImg: "/letterheads/footer.png",
    watermarkImg: "/letterheads/watermark.png",
    stampImg: "/letterheads/stamp.png",
  },
  PROIN: {
    name: "Proingredientz Connections Pvt. Ltd.",
    address: "Mumbai, India",
    phone: "+91 76666 01980",
    email: "support@ingredientz.co",
    web: "www.ingredientz.co",
    label: "Proingredientz (India)",
    headerImg: null,
    footerImg: null,
    watermarkImg: null,
    stampImg: null,
  },
};

const DOC_TYPES = [
  { id: "coa",     label: "Certificate of Analysis" },
  { id: "tds",     label: "Technical Data Sheet" },
  { id: "spec",    label: "Product Specification" },
  { id: "invoice", label: "Invoice / Proforma" },
  { id: "po",      label: "Purchase Order" },
  { id: "letter",  label: "General Letter" },
];

const REFORMAT_ENDPOINT = `${SUPA_URL}/functions/v1/reformat-document`;

function resolveLetterhead(country) {
  return INC_COUNTRIES.has(country) ? "INC" : "PROIN";
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────
export function DocumentsTab() {
  const [country, setCountry] = useState("");
  const [docType, setDocType] = useState("coa");
  const [file, setFile]       = useState(null);
  const [addStamp, setAddStamp] = useState(true);
  const [addDate, setAddDate]   = useState(false);
  const [status, setStatus]   = useState(null);
  const [busy, setBusy]       = useState(false);

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

  // ── Render the AI-extracted HTML inside an A4 letterhead in a new window
  // STYLE A — PHARMA CLASSIC typography baked in
  function renderLetterhead(bodyHtml, ent, withStamp) {
    const win = window.open("", "_blank");
    if (!win) {
      setStatus({ type: "error", msg: "Popup blocked. Allow popups for this site." });
      return;
    }
    const baseUrl = window.location.origin;
    const headerSrc    = `${baseUrl}${ent.headerImg}`;
    const footerSrc    = `${baseUrl}${ent.footerImg}`;
    const watermarkSrc = `${baseUrl}${ent.watermarkImg}`;
    const stampSrc     = `${baseUrl}${ent.stampImg}`;

    win.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${ent.name} — Reformatted Document</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&family=Source+Serif+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  body {
    margin: 0;
    font-family: 'Inter', -apple-system, Arial, sans-serif;
    color: #1a1a1a;
    background: #e5e7eb;
  }
  .a4 {
    width: 210mm; min-height: 297mm;
    margin: 0 auto; position: relative;
    background: white;
    box-shadow: 0 4px 24px rgba(0,0,0,0.12);
    page-break-after: always;
  }
  .lh-header img, .lh-footer img { width: 100%; display: block; }
  .lh-header { position: absolute; top: 0; left: 0; right: 0; }
  .lh-footer { position: absolute; bottom: 0; left: 0; right: 0; }
  .lh-watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 140mm; opacity: 0.07;
    pointer-events: none;
  }
  .lh-content {
    padding: 50mm 18mm 35mm 18mm;
    position: relative; z-index: 2;
    font-size: 9.5pt;
    line-height: 1.35;
  }

  /* ─── STYLE A — PHARMA CLASSIC ─────────────────────────────────────── */
  .lh-content h1,
  .lh-content h2,
  .lh-content h3,
  .lh-content .doc-title {
    font-family: 'Source Serif Pro', Georgia, serif;
    color: #0A2540;
    margin: 0;
    font-weight: 600;
    letter-spacing: -0.005em;
  }
  .lh-content .doc-title,
  .lh-content > h1:first-child,
  .lh-content > h2:first-child {
    font-size: 16pt;
    text-align: center;
    margin-bottom: 4px;
  }
  .lh-content h2 { font-size: 14pt; margin: 12px 0 6px; }
  .lh-content h3 { font-size: 11pt; margin: 8px 0 4px; }

  .lh-content .doc-ref,
  .lh-content > p:first-of-type {
    text-align: center;
    font-size: 8.5pt;
    color: #555;
    margin-bottom: 14px;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.5px;
  }

  /* Section bands — Claude is instructed to emit h2.section */
  .lh-content h2.section,
  .lh-content .section {
    font-family: 'Inter Tight', sans-serif;
    font-size: 10pt;
    font-weight: 600;
    background: #F0F4F8;
    color: #0A2540;
    padding: 4px 10px;
    margin: 12px 0 6px;
    border-left: 3px solid #0A2540;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  /* Tables */
  .lh-content table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    margin: 6px 0 10px;
  }
  .lh-content th {
    background: #0A2540;
    color: white;
    padding: 5px 8px;
    text-align: left;
    font-weight: 600;
    font-family: 'Inter Tight', sans-serif;
    font-size: 8pt;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    border: 1px solid #0A2540;
  }
  .lh-content td {
    padding: 4px 8px;
    border: 1px solid #D5DCE2;
    vertical-align: top;
  }
  .lh-content tbody tr:nth-child(even) td { background: #F9FAFB; }

  /* Emphasis */
  .lh-content strong, .lh-content b { font-weight: 600; color: #0A2540; }
  .lh-content em { font-style: italic; color: #555; }
  .lh-content p { margin: 6px 0; }

  /* Conclusion / approval callout */
  .lh-content .conclusion,
  .lh-content blockquote {
    margin: 10px 0;
    padding: 8px 12px;
    background: #ECFDF5;
    border-left: 3px solid #059669;
    font-size: 9pt;
    font-style: normal;
  }

  /* Lists */
  .lh-content ul, .lh-content ol {
    margin: 6px 0;
    padding-left: 20px;
    font-size: 9pt;
  }
  .lh-content li { margin: 2px 0; }

  /* Stamp placement */
  .stamp-placeholder {
    display: block;
    height: 110px;
    margin-top: 24px;
    position: relative;
  }
  .stamp-placeholder::before {
    content: "";
    position: absolute;
    right: 0; top: 0;
    width: 230px; height: 130px;
    background-image: url('${stampSrc}');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: right center;
    opacity: 0.85;
    transform: rotate(-3deg);
  }

  @media print {
    body { background: white; }
    .a4 { box-shadow: none; }
  }
</style>
</head><body>
<div class="a4">
  <div class="lh-header"><img src="${headerSrc}"></div>
  <img class="lh-watermark" src="${watermarkSrc}">
  <div class="lh-content">${bodyHtml}</div>
  <div class="lh-footer"><img src="${footerSrc}"></div>
</div>
<script>setTimeout(() => window.print(), 1200);<\/script>
</body></html>`);
    win.document.close();
  }

  return (
    <div style={{ maxWidth: 720 }}>

      <div style={{
        background: "white", border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 18, marginBottom: 18,
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
            Document Reformatter
          </div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Upload any supplier document (CoA, TDS, spec sheet, invoice) and we'll re-render it on your branded Ingredientz letterhead.
            Pick the customer's country — the right entity letterhead is applied automatically.
          </div>
        </div>
      </div>

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
            <Badge color="#1E40AF" bg="#DBEAFE">
              ● Will use: Ingredientz Inc letterhead
            </Badge>
          )}
          {entity && lh === "PROIN" && (
            <Badge color="#9A3412" bg="#FED7AA">
              ● Proingredientz letterhead — coming soon (only USA + Canada live right now)
            </Badge>
          )}
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Document Type">
            <select value={docType} onChange={e => setDocType(e.target.value)} style={inputStyle}>
              {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Source File">
            <input
              type="file" accept=".pdf,image/*"
              onChange={handleFile}
              style={{ ...inputStyle, padding: "7px 10px" }}
            />
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

        <button
          onClick={handleConvert}
          disabled={!canConvert}
          style={{
            width: "100%", marginTop: 18,
            padding: "12px 16px",
            background: canConvert ? "#1877F2" : "#BCC0C4",
            color: "white", border: "none", borderRadius: 8,
            fontSize: 13, fontWeight: 700,
            cursor: canConvert ? "pointer" : "not-allowed",
            fontFamily: "Arial,sans-serif"
          }}
        >
          {busy ? "Converting…" : "Reformat Document →"}
        </button>

        {status && (
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            fontSize: 12, fontWeight: 500,
            background:
              status.type === "error"   ? "#FEE2E2" :
              status.type === "success" ? "#D1FAE5" : "#DBEAFE",
            color:
              status.type === "error"   ? "#991B1B" :
              status.type === "success" ? "#065F46" : "#1E40AF",
            border: `1px solid ${
              status.type === "error"   ? "#FCA5A5" :
              status.type === "success" ? "#86EFAC" : "#93C5FD"}`
          }}>
            {status.msg}
          </div>
        )}

      </div>

      <div style={{
        marginTop: 14, padding: "10px 14px",
        fontSize: 11, color: C.muted, textAlign: "center"
      }}>
        Letterhead routing: USA &amp; Canada → Ingredientz Inc · Rest of World → Proingredientz
      </div>

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
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block",
        fontSize: 11, fontWeight: 600,
        color: C.ink, marginBottom: 5,
        letterSpacing: 0.3, textTransform: "uppercase"
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Badge({ color, bg, children }) {
  return (
    <div style={{
      marginTop: 8,
      display: "inline-block",
      background: bg, color,
      padding: "5px 10px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600
    }}>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 6,
      fontSize: 12, cursor: "pointer", color: C.ink
    }}>
      <input
        type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 14, height: 14, cursor: "pointer" }}
      />
      {label}
    </label>
  );
}
