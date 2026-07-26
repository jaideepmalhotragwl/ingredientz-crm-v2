// src/components/LabelStudio.jsx
import { useEffect, useRef, useState } from 'react';
import { INGREDIENTZ_LOGO } from '../lib/ingredientzLogo';
import { listSuppliers, listBatches, uploadScan, saveBatch } from '../lib/labelData';
import './labelStudio.css';

const DEFAULT_ADDRESS =
  'Registered Office: 8 The Green, Ste A,\nDover, DE 19901, USA\n+1 270 721 5321 · www.ingredientz.co';

const EMPTY = {
  product_name: '',
  botanical_cas: '',
  activity: '',
  quantity: '',
  batch_no: '',
  mfg_label: '',
  exp_label: '',
  country_of_origin: '',
  responsibility_line: 'Packed & Marketed by',
  company_line: 'Ingredientz Inc.',
  address_block: DEFAULT_ADDRESS,
};

export default function LabelStudio() {
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [scanFile, setScanFile] = useState(null);
  const [scanPreview, setScanPreview] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // {kind:'ok'|'err', msg}
  const [drag, setDrag] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    listSuppliers().then(setSuppliers);
    refreshRecent();
  }, []);

  function refreshRecent() {
    listBatches(24).then(setRecent).catch(() => {});
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const supplierName =
    suppliers.find((s) => String(s.id) === String(supplierId))?.name || '';

  function handleScan(file) {
    if (!file) return;
    setScanFile(file);
    const r = new FileReader();
    r.onload = () => setScanPreview(r.result);
    r.readAsDataURL(file);
  }

  function loadForReprint(b) {
    setForm({
      product_name: b.product_name || '',
      botanical_cas: b.botanical_cas || '',
      activity: b.activity || '',
      quantity: b.quantity || '',
      batch_no: b.batch_no || '',
      mfg_label: b.mfg_label || '',
      exp_label: b.exp_label || '',
      country_of_origin: b.country_of_origin || '',
      responsibility_line: b.responsibility_line || 'Packed & Marketed by',
      company_line: b.company_line || 'Ingredientz Inc.',
      address_block: b.address_block || DEFAULT_ADDRESS,
    });
    setSupplierId(b.supplier_id || '');
    setScanPreview(b.scan_url || null);
    setScanFile(null);
    setStatus({ kind: 'ok', msg: `Loaded ${b.product_name} · ${b.batch_no || 'no batch'} — press Print` });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveAndPrint() {
    if (!form.product_name.trim()) {
      setStatus({ kind: 'err', msg: 'Product name is required.' });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      let scan_url =
        typeof scanPreview === 'string' && scanPreview.startsWith('http') ? scanPreview : null;
      if (scanFile) scan_url = await uploadScan(scanFile);

      await saveBatch({
        ...form,
        supplier_id: supplierId || null,
        supplier_name: supplierName || null,
        scan_url,
      });

      refreshRecent();
      setStatus({ kind: 'ok', msg: 'Saved. Opening print…' });
      setTimeout(() => window.print(), 250);
    } catch (err) {
      setStatus({ kind: 'err', msg: `Could not save: ${err.message}` });
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
    setSupplierId('');
    setScanFile(null);
    setScanPreview(null);
    setStatus(null);
  }

  return (
    <div className="ls-root">
      <header className="ls-head">
        <h1>Labels</h1>
        <span>Re-label · 100 × 75 mm</span>
      </header>

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
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </fieldset>

          <h2>From supplier scan</h2>
          <fieldset className="ls-set">
            <div className="ls-field"><label>Product name</label>
              <input type="text" value={form.product_name} onChange={set('product_name')} /></div>
            <div className="ls-field"><label>Botanical / CAS no.</label>
              <input type="text" value={form.botanical_cas} onChange={set('botanical_cas')} /></div>
            <div className="ls-row">
              <div className="ls-field"><label>Activity</label>
                <input type="text" value={form.activity} onChange={set('activity')} /></div>
              <div className="ls-field"><label>Quantity</label>
                <input type="text" value={form.quantity} onChange={set('quantity')} /></div>
            </div>
            <div className="ls-row">
              <div className="ls-field"><label>MFG date</label>
                <input type="text" value={form.mfg_label} onChange={set('mfg_label')} /></div>
              <div className="ls-field"><label>EXP date</label>
                <input type="text" value={form.exp_label} onChange={set('exp_label')} /></div>
            </div>
            <div className="ls-field"><label>Batch no.</label>
              <input type="text" value={form.batch_no} onChange={set('batch_no')} /></div>
            <div className="ls-field"><label>Country of origin</label>
              <input type="text" value={form.country_of_origin} onChange={set('country_of_origin')}
                     placeholder="e.g. Made in India" /></div>
          </fieldset>

          <h2>Fixed — Ingredientz</h2>
          <fieldset className="ls-set">
            <div className="ls-field"><label>Responsibility line</label>
              <input type="text" value={form.responsibility_line} onChange={set('responsibility_line')} /></div>
            <div className="ls-field"><label>Company line</label>
              <input type="text" value={form.company_line} onChange={set('company_line')} /></div>
            <div className="ls-field"><label>Address block</label>
              <textarea value={form.address_block} onChange={set('address_block')} /></div>
          </fieldset>

          <div className="ls-btnrow">
            <button className="ls-btn accent" onClick={saveAndPrint} disabled={busy}>
              {busy ? 'Saving…' : 'Save & Print'}
            </button>
            <button className="ls-btn ghost" onClick={() => window.print()}>Print only</button>
            <button className="ls-btn ghost" onClick={clearBatch}>Clear</button>
          </div>
          {status && <p className={`ls-status ${status.kind}`}>{status.msg}</p>}
          <p className="ls-hint">Print at 100% scale with margins set to none. Every Save writes a lot to the batches table so you can reprint it below.</p>
        </section>

        {/* ---------------- work area ---------------- */}
        <div>
          <div className="ls-work">
            <div className="ls-col">
              {scanPreview ? (
                <img className="ls-scan" src={scanPreview} alt="Supplier label scan" />
              ) : (
                <div
                  className={`ls-drop ${drag ? 'drag' : ''}`}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); handleScan(e.dataTransfer.files[0]); }}
                >
                  <div>
                    <div className="plus">+</div>
                    <p><strong>Drop the supplier's label scan here</strong><br />
                      or click to browse — keep it beside your label while you transcribe</p>
                  </div>
                </div>
              )}
              <input ref={fileInput} type="file" accept="image/*" hidden
                     onChange={(e) => handleScan(e.target.files[0])} />
              <p className="cap">Supplier reference</p>
            </div>

            <div className="ls-col">
              {/* print-isolated label */}
              <div className="ls-print-area">
                <div className="ls-label">
                  <div className="ls-lhead">
                    <img className="ls-brand" src={INGREDIENTZ_LOGO} alt="Ingredientz" />
                    <div className="ls-packedby">{form.responsibility_line}</div>
                  </div>
                  <div className="ls-product">
                    <div className="name">{form.product_name || '—'}</div>
                    <div className="sub">
                      {[form.botanical_cas, form.country_of_origin].filter(Boolean).join('  ·  ')}
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
              </div>
              <p className="cap">Your label — true size, 100 × 75 mm</p>
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
                    <small>{b.batch_no || 'no batch'} · {b.supplier_name || '—'}</small>
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
