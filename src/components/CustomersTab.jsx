import { useState, useMemo } from "react";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";
import { FF, FTA } from "./ui/FormFields.jsx";
import { CompanyPicker } from "./CompanyPicker.jsx";
import { CountryPhoneFields } from "./CountryPhoneFields.jsx";

// ── CONTACTS TAB (was Customers) ──────────────────────────────────────────────
// One row per person. Company is pulled from the companies table, never typed —
// that is what stopped two buyers at one company creating two company records.
function CustomersTab({ customers, companies = [], onAdd, onUpdate, onDelete }) {
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [onlyNoEmail, setOnlyNoEmail] = useState(false);

  const coById = useMemo(() => {
    const m = {};
    (companies || []).forEach(c => { m[c.id] = c; });
    return m;
  }, [companies]);

  // How many people sit under each company — drives the "2 contacts" hint.
  const perCompany = useMemo(() => {
    const m = {};
    (customers || []).forEach(c => {
      if (!c.company_id_new) return;
      m[c.company_id_new] = (m[c.company_id_new] || 0) + 1;
    });
    return m;
  }, [customers]);

  const noEmailCount = useMemo(
    () => (customers || []).filter(c => !c.email || !String(c.email).trim()).length,
    [customers]
  );

  const filtered = useMemo(() => (customers || [])
    .slice()
    .sort((a, b) => {
      const ca = coById[a.company_id_new]?.name || a.company || "";
      const cb = coById[b.company_id_new]?.name || b.company || "";
      const byCo = ca.localeCompare(cb, undefined, { sensitivity: "base" });
      if (byCo !== 0) return byCo;
      // primary contact first within a company
      if (!!b.is_primary !== !!a.is_primary) return b.is_primary ? 1 : -1;
      return (a.contact || "").localeCompare(b.contact || "");
    })
    .filter(c => !onlyNoEmail || !c.email || !String(c.email).trim())
    .filter(c => !fCompany || String(c.company_id_new) === String(fCompany))
    .filter(c => !fStatus || (c.email_status || "ok") === fStatus)
    .filter(c => !search || [
      c.contact, c.email, c.role, c.phone,
      coById[c.company_id_new]?.name || c.company
    ].join(" ").toLowerCase().includes(search.toLowerCase())),
    [customers, coById, search, fCompany, fStatus, onlyNoEmail]);

  const th = { padding:"9px 14px", textAlign:"left", color:C.muted,
               borderBottom:`1px solid ${C.border}`, fontWeight:700, letterSpacing:1,
               fontSize:9, textTransform:"uppercase", whiteSpace:"nowrap" };
  const sel = { background:C.white, border:`1px solid ${C.border}`, borderRadius:7,
                padding:"6px 10px", color:C.ink, fontSize:11 };

  const STATUS_PILL = {
    ok:           ["#1E7A46", "#E6F4EC", "OK"],
    bounced:      [C.red, "#FFF0F0", "Bounced"],
    unsubscribed: [C.red, "#FFF0F0", "Unsubscribed"],
    invalid:      [C.faded, "#F0F1F3", "Invalid"],
  };

  return <div>
    {modal && <Modal title={modal.data ? "Edit Contact" : "Add Contact"} onClose={() => setModal(null)} width={720}>
      <ContactForm
        initial={modal.data}
        companies={companies}
        onSave={async (form, id) => { id ? await onUpdate(id, form) : await onAdd(form); setModal(null); }}
        onClose={() => setModal(null)}
      />
    </Modal>}

    {noEmailCount > 0 && !onlyNoEmail && <div style={{
      background:"#FFF0F0", border:`1px solid ${C.red}33`, borderLeft:`3px solid ${C.red}`,
      borderRadius:9, padding:"11px 15px", marginBottom:12,
      display:"flex", alignItems:"center", gap:11, flexWrap:"wrap" }}>
      <span style={{ fontSize:15 }}>✉️</span>
      <div style={{ flex:1, minWidth:220 }}>
        <div style={{ fontSize:12.5, fontWeight:700, color:C.red }}>
          {noEmailCount} contact{noEmailCount === 1 ? " has" : "s have"} no email address
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
          They can't be quoted, acknowledged or included in follow-ups. The address is usually
          sitting in someone's inbox.
        </div>
      </div>
      <button onClick={() => setOnlyNoEmail(true)} style={{
        background:C.red, color:"#fff", border:0, borderRadius:7, padding:"6px 13px",
        fontSize:11.5, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>Show them</button>
    </div>}

    <Card style={{ overflow:"hidden" }}>
      <div style={{ padding:"14px 18px", display:"flex", gap:9, alignItems:"center",
                    borderBottom:`1px solid ${C.border}`, flexWrap:"wrap" }}>
        <div style={{ fontSize:18, fontWeight:700, color:C.ink }}>
          Contacts <span style={{ fontSize:12, color:C.blue, fontWeight:400 }}>
            {filtered.length} of {customers.length} · {companies.length} companies
          </span>
        </div>
        <Btn label="+ Add Contact" onClick={() => setModal({ data:null })} size="sm"/>
        {noEmailCount > 0 && <button onClick={() => setOnlyNoEmail(v => !v)} style={{
          background: onlyNoEmail ? C.red : "#FFF0F0", color: onlyNoEmail ? "#fff" : C.red,
          border:`1px solid ${onlyNoEmail ? C.red : C.red + "55"}`, borderRadius:7,
          padding:"5px 11px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
          ✉️ No email · {noEmailCount}{onlyNoEmail ? "  ✕" : ""}
        </button>}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, company…"
          style={{ marginLeft:"auto", background:C.bg, border:`1px solid ${C.border}`,
                   borderRadius:7, padding:"6px 12px", fontSize:12, outline:"none", width:200 }}/>
        <select value={fCompany} onChange={e => setFCompany(e.target.value)} style={{ ...sel, maxWidth:190 }}>
          <option value="">All companies</option>
          {(companies || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""))
            .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={sel}>
          <option value="">All email status</option>
          <option value="ok">OK</option>
          <option value="bounced">Bounced</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="invalid">Invalid</option>
        </select>
      </div>

      <div style={{ overflowX:"auto", maxHeight:540, overflowY:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead style={{ position:"sticky", top:0, background:C.bg, zIndex:2 }}>
            <tr>
              <th style={{ ...th, width:44 }}>#</th>
              {["Contact","Role","Company","Email","Phone","Primary","Email status",""].map(h =>
                <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const co = coById[c.company_id_new];
              const siblings = perCompany[c.company_id_new] || 0;
              const noMail = !c.email || !String(c.email).trim();
              const [sc, sb, sl] = STATUS_PILL[c.email_status || "ok"] || STATUS_PILL.ok;
              return <tr key={c.id} style={{ background: i % 2 === 0 ? C.bg : "transparent" }}>
                <td style={{ padding:"9px 14px", color:C.faded, fontFamily:"monospace", fontSize:11 }}>{i+1}</td>
                <td style={{ padding:"9px 14px", color:C.ink, fontWeight:600 }}>{c.contact || "—"}</td>
                <td style={{ padding:"9px 14px", color:C.muted }}>{c.role || "—"}</td>
                <td style={{ padding:"9px 14px" }}>
                  {co
                    ? <div>
                        <div style={{ color:C.ink }}>{co.name}</div>
                        <div style={{ fontSize:10, color:C.faded, marginTop:1 }}>
                          {co.domain || "—"}{siblings > 1 ? ` · ${siblings} contacts` : ""}
                        </div>
                      </div>
                    : <span style={{ color:C.red, fontSize:11 }}>⚠ not linked</span>}
                </td>
                <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:11,
                             color: noMail ? C.red : C.muted }}>
                  {noMail ? "— missing —" : c.email}
                </td>
                <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:11, color:C.muted }}>{c.phone || "—"}</td>
                <td style={{ padding:"9px 14px" }}>
                  {c.is_primary
                    ? <span style={{ fontSize:10, fontWeight:700, color:C.blue, background:C.blueLt,
                                     border:`1px solid ${C.blue}44`, borderRadius:99, padding:"2px 8px" }}>Primary</span>
                    : <span style={{ color:C.faded }}>—</span>}
                </td>
                <td style={{ padding:"9px 14px" }}>
                  <span style={{ fontSize:10, fontWeight:700, color:sc, background:sb,
                                 border:`1px solid ${sc}44`, borderRadius:99, padding:"2px 8px" }}>{sl}</span>
                </td>
                <td style={{ padding:"9px 14px", display:"flex", gap:6 }}>
                  <Btn label="Edit" onClick={() => setModal({ data:c })} size="sm" variant="ghost"/>
                  <Btn label="✕" onClick={() => onDelete(c.id)} size="sm" variant="danger"/>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding:32, textAlign:"center", color:C.muted, fontSize:12 }}>
          {onlyNoEmail ? "🎉 Every contact has an email address" : "No contacts match your search"}
        </div>}
      </div>
    </Card>
  </div>;
}

// ── CONTACT FORM ──────────────────────────────────────────────────────────────
function ContactForm({ onSave, onClose, initial = null, companies = [] }) {
  const [form, setForm] = useState(initial || {
    company_id_new:"", company:"", contact:"", role:"", email:"",
    phone_dial:"", phone_national:"", country:"", country_iso2:"",
    is_primary:false, email_status:"ok", notes:"",
  });
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Picking a company copies its name and country down, so the denormalised
  // `company` column stays in step for anything still reading it.
  function pickCompany(id, row) {
    setForm(f => ({
      ...f,
      company_id_new: id || "",
      company: row?.name || f.company,
      country: row?.country || f.country,
      country_iso2: row?.country_iso2 || f.country_iso2,
    }));
  }

  const loc = { iso2: form.country_iso2 || null, name: form.country || "",
                dial: form.phone_dial || "", national: form.phone_national || "" };
  function setLoc(next) {
    setForm(f => ({ ...f, country_iso2: next.iso2 || null, country: next.name || "",
                    phone_dial: next.dial || "", phone_national: next.national || "" }));
  }

  async function save() {
    if (!form.company_id_new) { alert("Pick a company first."); return; }
    if (!form.email?.trim())  { alert("Email is required — without it this contact can't be quoted or followed up."); return; }
    setSaving(true);
    const phoneFull = [form.phone_dial, form.phone_national].filter(Boolean).join(" ").trim();
    const row = {
      company_id_new: form.company_id_new,
      company: form.company || null,
      contact: form.contact?.trim() || null,
      role: form.role?.trim() || null,
      email: form.email.trim().toLowerCase(),
      phone: phoneFull || null,
      country: form.country || null,
      is_primary: !!form.is_primary,
      email_status: form.email_status || "ok",
      notes: form.notes || null,
    };
    await onSave(row, initial?.id);
    setDone(true);
    setTimeout(() => { setDone(false); setSaving(false); }, 1100);
    if (initial) onClose();
  }

  return <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
      <CompanyPicker value={form.company_id_new} onChange={pickCompany} companies={companies}/>
      <FF label="Contact Person" k="contact" value={form.contact} onChange={set} placeholder="Full name"/>
      <FF label="Role" k="role" value={form.role} onChange={set} placeholder="e.g. Procurement Manager"/>
      <FF label="Email *" k="email" value={form.email} onChange={set} type="email" placeholder="buyer@company.com"/>
      <CountryPhoneFields value={loc} onChange={setLoc}/>
      <FF label="Email Status" k="email_status" value={form.email_status} onChange={set}
          options={[
            { v:"ok",           l:"OK — safe to email" },
            { v:"bounced",      l:"Bounced — do not email" },
            { v:"unsubscribed", l:"Unsubscribed — do not email" },
            { v:"invalid",      l:"Invalid address" },
          ]}/>
    </div>

    <div onClick={() => set("is_primary", !form.is_primary)}
      style={{ display:"inline-flex", alignItems:"center", gap:9, background:C.bg, borderRadius:9,
               padding:"10px 14px", border:`1px solid ${form.is_primary ? C.blue : C.border}`,
               cursor:"pointer", width:"fit-content" }}>
      <div style={{ width:16, height:16, borderRadius:4,
                    border:`2px solid ${form.is_primary ? C.blue : C.muted}`,
                    background: form.is_primary ? C.blue : "transparent",
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
        {form.is_primary && <span style={{ color:"#fff", fontSize:10, fontWeight:900 }}>✓</span>}
      </div>
      <span style={{ fontSize:12, color: form.is_primary ? C.ink : C.muted }}>
        Primary contact — receives follow-up campaigns for this company
      </span>
    </div>

    <FTA label="Notes" k="notes" value={form.notes} onChange={set} placeholder="Anything useful about this person…"/>

    <div style={{ display:"flex", gap:10 }}>
      <Btn label={saving ? "Saving…" : done ? "✓ Saved!" : initial ? "Update Contact" : "Add Contact"}
           onClick={save} disabled={saving}/>
      <Btn label="Cancel" onClick={onClose} variant="ghost"/>
    </div>
  </div>;
}

export { CustomersTab, ContactForm };
