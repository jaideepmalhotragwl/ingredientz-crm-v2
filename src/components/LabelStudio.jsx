// src/components/LabelStudio.jsx
import { useEffect, useRef, useState } from "react";
import { LOGO } from "../templates.js";
import { listSuppliers, listBatches, uploadScan, saveBatch, extractLabelBatch } from "../lib/labelData.js";
import "./labelStudio.css";

const DEFAULT_ADDRESS =
  "Registered Office: 8 The Green, Ste A,\nDover, DE 19901, USA\n+1 270 721 5321 · www.ingredientz.co";

const EMPTY = {
  product_name: "",
  botanical_cas: "",
  activity: "",
  quantity: "",
  batch_no: "",
  mfg_label: "",
  exp_label: "",
  country_of_origin: "",
  responsibility_line: "Packed & Marketed by",
  company_line: "Ingredientz Inc.",
  address_block: DEFAULT_ADDRESS,
};

// Set the print page size at run time. Cleared = falls back to the 100×75 mm
// rule in the stylesheet (single label); set to A4 for a tiled sheet.
function setPrintPageSize(css) {
  let el = document.getElementById("ls-page-size");
  if (!el) {
    el = document.createElement("style");
    el.id = "ls-page-size";
    document.head.appendChild(el);
  }
  el.textContent = css || "";
}

export function LabelStudio({ suppliers: suppliersProp = null }) {
  const [suppliersState, setSuppliersState] = useState([]);
  const suppliers = suppliersProp || suppliersState;

  const [supplierId, setSupplierId] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [scanFile, setScanFile] = useState(null);
  const [scanPreview, setScanPreview] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [status, setStatus] = useState(null); // {kind:'ok'|'err', msg}
  const [drag, setDrag] = useState(false);
  const [perSheet, setPerSheet] = useState(6);       // copies tiled on one page
  const [printMode, setPrintMode] = useState("single"); // 'single' | 'sheet'
  const fileInput = useRef(null);

  useEffect(() => {
    if (!suppliersProp) listSuppliers().then(setSuppliersState);
    refreshRecent();
    const reset = () => setPrintMode("single");
    window.addEventListener("afterprint", reset);
    return () => window.removeEventListener("afterprint", reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshRecent() {
    listBatches(24).then(setRecent).catch(() => {});
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const nameOf = (s) => s?.company || s?.name || "";
  const supplierName = nameOf(suppliers.find((s) => String(s.id) === String(supplierId)));

  function handleScan(file) {
    if (!file) return;
    setScanFile(file);
    const r = new FileReader();
    r.onload = () => setScanPreview(r.result);
    r.readAsDataURL(file);
  }

  async function autofill() {
    if (!scanFile) { setStatus({ kind: "err", msg: "Upload a scan first, then Auto-fill." }); return; }
    setExtracting(true);
    setStatus(null);
    try {
      const f = await extractLabelBatch(scanFile);
      setForm((prev) => ({
        ...prev,
        product_name:      f.product_name      ?? prev.product_name,
        botanical_cas:     f.botanical_cas      ?? prev.botanical_cas,
        activity:          f.activity           ?? prev.activity,
        quantity:          f.quantity           ?? prev.quantity,
        batch_no:          f.batch_no           ?? prev.batch_no,
        mfg_label:         f.mfg_label          ?? prev.mfg_label,
        exp_label:         f.exp_label          ?? prev.exp_label,
        country_of_origin: f.country_of_origin  ?? prev.country_of_origin,
      }));
      setStatus({ kind: "ok", msg: "Filled from scan — check each field, then Save & Print." });
    } catch (err) {
      setStatus({ kind: "err", msg: `Auto-fill failed: ${err.message}` });
    } finally {
      setExtracting(false);
    }
  }

  function loadForReprint(b) {
    setForm({
      product_name: b.product_name || "",
      botanical_cas: b.botanical_cas || "",
      activity: b.activity || "",
      quantity: b.quantity || "",
      batch_no: b.batch_no || "",
      mfg_label: b.mfg_label || "",
      exp_label: b.exp_label || "",
      country_of_origin: b.country_of_origin || "",
      responsibility_line: b.responsibility_line || "Packed & Marketed by",
      company_line: b.company_line || "Ingredientz Inc.",
      address_block: b.address_block || DEFAULT_ADDRESS,
    });
    setSupplierId(b.supplier_id ? String(b.supplier_id) : "");
    setScanPreview(b.scan_url || null);
    setScanFile(null);
    setStatus({ kind: "ok", msg: `Loaded ${b.product_name} · ${b.batch_no || "no batch"} — press Print` });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Print one label at exactly 100 × 75 mm.
  function printSingle() {
    setPrintMode("single");
    setPrintPageSize(""); // fall back to the 100×75 rule in the stylesheet
    setTimeout(() => window.print(), 60);
  }

  // Print `perSheet` copies of the current label, tiled on an A4 page.
  function printSheet() {
    setPrintMode("sheet");
    setPrintPageSize("@page{size:A4;margin:0}");
    setTimeout(() => window.print(), 60);
  }

  async function saveAndPrint() {
    if (!form.product_name.trim()) {
      setStatus({ kind: "err", msg: "Product name is required." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      let scan_url =
        typeof scanPreview === "string" && scanPreview.startsWith("http") ? scanPreview : null;
      if (scanFile) scan_url = await uploadScan(scanFile);

      await saveBatch({
        ...form,
        supplier_id: supplierId || null,
        supplier_name: supplierName || null,
        scan_url,
      });

      refreshRecent();
      setStatus({ kind: "ok", msg: "Saved. Opening print…" });
      printSingle();
    } catch (err) {
      setStatus({ kind: "err", msg: `Could not save: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  function clearBatch() {
    setForm((f) => ({
      ...EMPTY,
      responsibility_line: f.responsibility_line,
      company_line: f.company_line,
      address_block: f.address_block,
    }));
    setSupplierId("");
    setScanFile(null);
    setScanPreview(null);
    setStatus(null);
  }

  // One label — reused by the on-screen preview, the single print, and each
  // cell of the tiled sheet, so they always look identical.
  const LabelCard = () => (
    <div className="ls-label">
      <div className="ls-lhead">
        <img className="ls-brand" src={LOGO} alt="Ingredientz" />
        <div className="ls-packedby">{form.responsibility_line}</div>
      </div>
      <div className="ls-product">
        <div className="name">{form.product_name || "—"}</div>
        <div className="sub">
          {[form.botanical_cas, form.country_of_origin].filter(Boolean).join("  ·  ")}
        </div>
      </div>
      <div className="ls-data">
        <div className="ls-dl"><dt>Activity</dt><dd>{form.activity}</dd></div>
        <div className="ls-dl"><dt>MFG date</dt><dd>{form.mfg_label}</dd></div>
        <div className="ls-dl"><dt>Quantity</dt><dd>{form.quantity}</dd></div>
        <div className="ls-dl"><dt>EXP date</dt><dd>{form.exp_label}</dd></div>
        <div className="ls-dl wide"><dt>Batch no.</dt><dd>{form.batch_no}</dd></div>
      </div>
      <div className="ls-foot">
        <div className="co">{form.company_line}</div>
        <div className="addr">{form.address_block}</div>
      </div>
    </div>
  );

  return (
    <div className="ls-root" data-print={printMode}>
      <div className="ls-layout">
        {/* ---------------- form ---------------- */}
        <section className="ls-panel" aria-label="Batch details">
          <h2>Supplier</h2>
          <fieldset className="ls-set">
            <div className="ls-field">
              <label htmlFor="ls-sup">Linked supplier</label>
              <select id="ls-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— select supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{nameOf(s)}</option>
                ))}
              </select>
            </div>
          </fieldset>

          <h2>From supplier scan</h2>
          <fieldset className="ls-set">
            <div className="ls-field"><label>Product name</label>
              <input type="text" value={form.product_name} onChange={set("product_name")} /></div>
            <div className="ls-field"><label>Botanical / CAS no.</label>
              <input type="text" value={form.botanical_cas} onChange={set("botanical_cas")} /></div>
            <div className="ls-row">
              <div className="ls-field"><label>Activity</label>
                <input type="text" value={form.activity} onChange={set("activity")} /></div>
              <div className="ls-field"><label>Quantity</label>
                <input type="text" value={form.quantity} onChange={set("quantity")} /></div>
            </div>
            <div className="ls-row">
              <div className="ls-field"><label>MFG date</label>
                <input type="text" value={form.mfg_label} onChange={set("mfg_label")} /></div>
              <div className="ls-field"><label>EXP date</label>
                <input type="text" value={form.exp_label} onChange={set("exp_label")} /></div>
            </div>
            <div className="ls-field"><label>Batch no.</label>
              <input type="text" value={form.batch_no} onChange={set("batch_no")} /></div>
            <div className="ls-field"><label>Country of origin</label>
              <input type="text" value={form.country_of_origin} onChange={set("country_of_origin")}
                     placeholder="e.g. Made in India" /></div>
          </fieldset>

          <h2>Fixed — Ingredientz</h2>
          <fieldset className="ls-set">
            <div className="ls-field"><label>Responsibility line</label>
              <input type="text" value={form.responsibility_line} onChange={set("responsibility_line")} /></div>
            <div className="ls-field"><label>Company line</label>
              <input type="text" value={form.company_line} onChange={set("company_line")} /></div>
            <div className="ls-field"><label>Address block</label>
              <textarea value={form.address_block} onChange={set("address_block")} /></div>
          </fieldset>

          <div className="ls-btnrow">
            <button className="ls-btn accent" onClick={saveAndPrint} disabled={busy}>
              {busy ? "Saving…" : "Save & Print"}
            </button>
            <button className="ls-btn ghost" onClick={printSingle}>Print 1</button>
            <button className="ls-btn ghost" onClick={clearBatch}>Clear</button>
          </div>

          <div className="ls-sheetbar">
            <label htmlFor="ls-per">Copies per sheet</label>
            <select id="ls-per" value={perSheet} onChange={(e) => setPerSheet(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={6}>6</option>
            </select>
            <button className="ls-btn" onClick={printSheet}>Print sheet</button>
          </div>

          {status && <p className={`ls-status ${status.kind}`}>{status.msg}</p>}
          <p className="ls-hint">Print at 100% scale, margins none. "Print 1" = a single 100 × 75 mm label. "Print sheet" tiles your chosen number onto one A4 page (up to 6) to save paper. Every Save writes a lot to the batches table so you can reprint it below.</p>
        </section>

        {/* ---------------- work area ---------------- */}
        <div>
          <div className="ls-work">
            <div className="ls-col">
              {scanPreview ? (
                <img className="ls-scan" src={scanPreview} alt="Supplier label scan" />
              ) : (
                <div
                  className={`ls-drop ${drag ? "drag" : ""}`}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); handleScan(e.dataTransfer.files[0]); }}
                >
                  <div>
                    <div className="plus">+</div>
                    <p><strong>Drop the supplier's label scan here</strong><br />
                      or click to browse — then Auto-fill reads it for you</p>
                  </div>
                </div>
              )}
              <input ref={fileInput} type="file" accept="image/*" hidden
                     onChange={(e) => handleScan(e.target.files[0])} />

              {scanFile && (
                <button className="ls-btn accent ls-autofill" onClick={autofill} disabled={extracting}>
                  {extracting ? "Reading label…" : "✨ Auto-fill from scan"}
                </button>
              )}
              {scanPreview && (
                <button className="ls-btn ghost ls-autofill" onClick={() => fileInput.current?.click()}>
                  Replace scan
                </button>
              )}
              <p className="cap">Supplier reference</p>
            </div>

            <div className="ls-col">
              {/* single-label print target + on-screen preview */}
              <div className="ls-print-area">
                <LabelCard />
              </div>
              <p className="cap">Your label — true size, 100 × 75 mm</p>
            </div>
          </div>

          {/* tiled sheet — hidden on screen, revealed only when printing a sheet */}
          <div className="ls-sheet">
            <div className="ls-sheet-grid">
              {Array.from({ length: perSheet }).map((_, i) => (
                <div className="ls-sheet-cell" key={i}><LabelCard /></div>
              ))}
            </div>
          </div>

          {/* ---------------- reprint ---------------- */}
          {recent.length > 0 && (
            <div className="ls-recent">
              <h2>Recent batches — tap to reprint</h2>
              <div>
                {recent.map((b) => (
                  <button key={b.id} className="ls-chip" onClick={() => loadForReprint(b)}>
                    <b>{b.product_name}</b>
                    <small>{b.batch_no || "no batch"} · {b.supplier_name || "—"}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LabelStudio;
