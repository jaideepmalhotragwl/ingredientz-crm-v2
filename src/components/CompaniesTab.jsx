import { useState, useMemo, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";
import { FF, FTA } from "./ui/FormFields.jsx";
import { CountryPhoneFields } from "./CountryPhoneFields.jsx";

// Sales CRM taxonomy — keep in sync with the enrichment Edge Function
const COMPANY_TYPES = [
  "Nutraceutical Brand",
  "Cosmetics Brand",
  "Pharmaceutical Company",
  "CDMO / Contract Manufacturer",
  "Ingredients Manufacturer",
  "Distributor / Trader",
  "Retailer",
  "R&D / Formulation Lab",
  "Pet Nutrition Company",
  "Other / Unclear",
];

const STATUSES = ["active", "dormant", "excluded"];

// Violet = needs a human look. Same language as the enquiry list.
const UNV = "#7C3AED", UNV_BG = "#F5F3FF";

const byName = (a, b) =>
  (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base", numeric: true });

const TYPE_COLOR = {
  "CDMO / Contract Manufacturer": ["#1877F2", "#E7F0FD"],
  "Nutraceutical Brand":          ["#1E7A46", "#E6F4EC"],
  "Cosmetics Brand":              ["#1E7A46", "#E6F4EC"],
  "Distributor / Trader":         ["#8a5a08", "#FDF3E3"],
  "Pharmaceutical Company":       ["#9B59B6", "#F3E8FA"],
  "Ingredients Manufacturer":     ["#0EA5A0", "#E6F7F6"],
};

function Pill({ text, color, bg, title }) {
  return <span title={title} style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 10,
    fontWeight: 700, whiteSpace: "nowrap", color, background: bg,
    border: `1px solid ${color}44`,
  }}>{text}</span>;
}

function StatusPill({ status }) {
  const map = {
    active:   ["#1E7A46", "#E6F4EC"],
    dormant:  [C.faded, "#F0F1F3"],
    excluded: [C.red, "#FFF0F0"],
  };
  const [c, b] = map[status] || map.dormant;
  return <Pill text={status} color={c} bg={b}/>;
}

// ── COMPANIES TAB ─────────────────────────────────────────────────────────────
function CompaniesTab({ companies, customers, enquiries, onAdd, onUpdate, onDelete, onOpenEnquiries }) {
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fAgent, setFAgent] = useState("");
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    supabase.from("agents").select("id,name").eq("active", true).order("name")
      .then(({ data }) => setAgents(data || []));
  }, []);

  const agentName = useMemo(() => {
    const m = {};
    agents.forEach(a => { m[a.id] = a.name; });
    return m;
  }, [agents]);

  // Contacts and enquiry history per company, computed once.
  const stats = useMemo(() => {
    const m = {};
    (customers || []).forEach(c => {
      const k = c.company_id_new;
      if (!k) return;
      m[k] = m[k] || { contacts: 0, enquiries: 0, last: null, noEmail: 0 };
      m[k].contacts++;
      if (!c.email || !String(c.email).trim()) m[k].noEmail++;
    });
    (enquiries || []).forEach(e => {
      const k = e.company_id;
      if (!k) return;
      m[k] = m[k] || { contacts: 0, enquiries: 0, last: null, noEmail: 0 };
      m[k].enquiries++;
      if (!m[k].last || (e.enquiry_date && e.enquiry_date > m[k].last)) m[k].last = e.enquiry_date;
    });
    return m;
  }, [customers, enquiries]);

  const unverifiedCount = useMemo(
    () => (companies || []).filter(c => c.verified === false).length,
    [companies]
  );

  const filtered = useMemo(() => (companies || [])
    .slice().sort(byName)
    .filter(c => !onlyUnverified || c.verified === false)
    .filter(c => !fType   || c.company_type === fType)
    .filter(c => !fStatus || c.status === fStatus)
    .filter(c => {
      if (!fAgent) return true;
      if (fAgent === "direct") return !c.agent_id;
      return String(c.agent_id) === String(fAgent);
    })
    .filter(c => !search || [c.name, c.domain, c.country, c.company_type]
      .join(" ").toLowerCase().includes(search.toLowerCase())),
    [companies, search, fType, fStatus, fAgent, onlyUnverified]);

  const th = { padding: "9px 13px", textAlign: "left", color: C.muted,
               borderBottom: `1px solid ${C.border}`, fontWeight: 700, letterSpacing: 1,
               fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" };
  const sel = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 7,
                padding: "6px 10px", color: C.ink, fontSize: 11 };

  return <div>
    {modal && <Modal title={modal.data ? "Edit Company" : "Add Company"} onClose={() => setModal(null)} width={720}>
      <CompanyForm
        initial={modal.data}
        agents={agents}
        onSave={async (form, id) => { id ? await onUpdate(id, form) : await onAdd(form); setModal(null); }}
        onClose={() => setModal(null)}
      />
    </Modal>}

    {/* Auto-created companies waiting for a human to confirm */}
    {unverifiedCount > 0 && !onlyUnverified && <div style={{
      background: UNV_BG, border: `1px solid ${UNV}33`, borderLeft: `3px solid ${UNV}`,
      borderRadius: 9, padding: "11px 15px", marginBottom: 12,
      display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
      <span style={{ fontSize: 15 }}>🔎</span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: UNV }}>
          {unverifiedCount} compan{unverifiedCount === 1 ? "y was" : "ies were"} created automatically
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          Created from an enquiry without a match. Check the name, type and country, then mark verified.
        </div>
      </div>
      <button onClick={() => setOnlyUnverified(true)} style={{
        background: UNV, color: "#fff", border: 0, borderRadius: 7, padding: "6px 13px",
        fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
        Review them
      </button>
    </div>}

    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", display: "flex", gap: 9, alignItems: "center",
                    borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>
          Companies <span style={{ fontSize: 12, color: C.blue, fontWeight: 400 }}>{filtered.length} of {companies.length}</span>
        </div>
        <Btn label="+ Add Company" onClick={() => setModal({ data: null })} size="sm"/>
        {unverifiedCount > 0 && <button onClick={() => setOnlyUnverified(v => !v)} style={{
          background: onlyUnverified ? UNV : UNV_BG, color: onlyUnverified ? "#fff" : UNV,
          border: `1px solid ${onlyUnverified ? UNV : UNV + "55"}`, borderRadius: 7,
          padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          🔎 Unverified · {unverifiedCount}{onlyUnverified ? "  ✕" : ""}
        </button>}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or domain…"
          style={{ marginLeft: "auto", background: C.bg, border: `1px solid ${C.border}`,
                   borderRadius: 7, padding: "6px 12px", fontSize: 12, outline: "none", width: 190 }}/>
        <select value={fType} onChange={e => setFType(e.target.value)} style={sel}>
          <option value="">All types</option>
          {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={sel}>
          <option value="">All status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fAgent} onChange={e => setFAgent(e.target.value)} style={sel}>
          <option value="">All routes</option>
          <option value="direct">Direct only</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div style={{ overflowX: "auto", maxHeight: 540, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, background: C.bg, zIndex: 2 }}>
            <tr>
              {["Company","Domain","Type","Country","Route","Contacts","Enquiries","Last enquiry","Status",""]
                .map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const s = stats[c.id] || { contacts: 0, enquiries: 0, last: null, noEmail: 0 };
              const unv = c.verified === false;
              const rowBg = unv ? UNV_BG : (i % 2 === 0 ? C.bg : "transparent");
              const [tc, tb] = TYPE_COLOR[c.company_type] || [C.muted, "#F0F1F3"];
              return <tr key={c.id} style={{ background: rowBg,
                        borderLeft: `3px solid ${unv ? UNV : "transparent"}` }}>
                <td style={{ padding: "10px 13px", maxWidth: 220 }}>
                  <div style={{ fontWeight: 600, color: C.ink, overflow: "hidden",
                                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  {unv && <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: UNV,
                    borderRadius: 5, padding: "1px 6px", marginTop: 3, display: "inline-block" }}>UNVERIFIED</span>}
                  {s.noEmail > 0 && <span style={{ fontSize: 9, color: C.red, marginLeft: 5 }}>
                    {s.noEmail} contact{s.noEmail > 1 ? "s" : ""} without email</span>}
                </td>
                <td style={{ padding: "10px 13px", fontFamily: "monospace", fontSize: 11, color: C.muted }}>
                  {c.domain || <span style={{ color: C.faded }}>—</span>}
                </td>
                <td style={{ padding: "10px 13px" }}>
                  {c.company_type ? <Pill text={c.company_type} color={tc} bg={tb}/>
                                  : <span style={{ color: C.faded }}>—</span>}
                </td>
                <td style={{ padding: "10px 13px", color: C.muted }}>{c.country || "—"}</td>
                <td style={{ padding: "10px 13px" }}>
                  {c.agent_id
                    ? <Pill text={agentName[c.agent_id] || "Agent"} color="#4338CA" bg="#EEF2FF"
                            title="Enquiries arrive through this agent's mailbox"/>
                    : <span style={{ fontSize: 10, color: C.faded }}>Direct</span>}
                </td>
                <td style={{ padding: "10px 13px", fontWeight: 700 }}>{s.contacts || "—"}</td>
                <td style={{ padding: "10px 13px" }}>
                  {s.enquiries
                    ? <span onClick={() => onOpenEnquiries && onOpenEnquiries(c)}
                        style={{ fontWeight: 700, color: C.blue, cursor: onOpenEnquiries ? "pointer" : "default" }}>
                        {s.enquiries}</span>
                    : <span style={{ color: C.faded }}>—</span>}
                </td>
                <td style={{ padding: "10px 13px", color: C.muted }}>{s.last || "—"}</td>
                <td style={{ padding: "10px 13px" }}><StatusPill status={c.status}/></td>
                <td style={{ padding: "10px 13px", display: "flex", gap: 6 }}>
                  <Btn label="Edit" onClick={() => setModal({ data: c })} size="sm" variant="ghost"/>
                  {s.enquiries === 0 && s.contacts === 0 &&
                    <Btn label="✕" onClick={() => onDelete(c.id)} size="sm" variant="danger"/>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 34, textAlign: "center", color: C.muted, fontSize: 12 }}>
          {onlyUnverified ? "🎉 Every company has been verified" : "No companies match your filters"}
        </div>}
      </div>
    </Card>
  </div>;
}

// ── COMPANY FORM ──────────────────────────────────────────────────────────────
function CompanyForm({ onSave, onClose, initial = null, agents = [] }) {
  const [form, setForm] = useState(initial || {
    name: "", domain: "", website: "", company_type: "", country: "", country_iso2: "",
    city: "", agent_id: "", status: "active", verified: true, notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Country picker writes name + ISO together; phone fields are ignored here.
  const loc = { iso2: form.country_iso2 || null, name: form.country || "", dial: "", national: "" };
  function setLoc(next) {
    setForm(f => ({ ...f, country_iso2: next.iso2 || null, country: next.name || "" }));
  }

  async function save() {
    if (!form.name.trim()) { alert("Company name required."); return; }
    setSaving(true);
    const row = {
      name: form.name.trim(),
      // Domain is the match key — store it lowercase and stripped of any scheme.
      domain: form.domain ? form.domain.trim().toLowerCase()
                 .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null,
      website: form.website?.trim() || null,
      company_type: form.company_type || null,
      country: form.country || null,
      country_iso2: form.country_iso2 || null,
      city: form.city?.trim() || null,
      agent_id: form.agent_id || null,
      status: form.status || "active",
      verified: true,               // saving through this form IS the verification
      notes: form.notes || null,
    };
    await onSave(row, initial?.id);
    setDone(true);
    setTimeout(() => { setDone(false); setSaving(false); }, 1100);
    if (initial) onClose();
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {initial?.verified === false && <div style={{
      background: UNV_BG, border: `1px solid ${UNV}44`, borderRadius: 9, padding: "10px 14px",
      fontSize: 12, color: UNV }}>
      🔎 Created automatically from an enquiry. Saving this form marks it verified.
    </div>}

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      <FF label="Company Name *" k="name" value={form.name} onChange={set} placeholder="e.g. Impact Products"/>
      <FF label="Domain" k="domain" value={form.domain} onChange={set} placeholder="impactproducts.life"/>
      <FF label="Website" k="website" value={form.website} onChange={set} placeholder="https://…"/>
      <FF label="Type" k="company_type" value={form.company_type} onChange={set} options={COMPANY_TYPES}/>
      <CountryPhoneFields value={loc} onChange={setLoc}/>
    </div>

    <div style={{ fontSize: 10, color: C.muted, marginTop: -6 }}>
      Leave domain blank for companies reached through an agent, or where only a personal
      address (gmail, etc.) is on file — a wrong domain matches the wrong company.
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      <FF label="City" k="city" value={form.city} onChange={set} placeholder="e.g. Tempe"/>
      <FF label="Agent / Route" k="agent_id" value={form.agent_id} onChange={set}
          options={[{ v: "", l: "Direct — no agent" }, ...agents.map(a => ({ v: String(a.id), l: a.name }))]}/>
      <FF label="Status" k="status" value={form.status} onChange={set}
          options={[
            { v: "active",   l: "Active — include in follow-ups" },
            { v: "dormant",  l: "Dormant — keep, don't chase" },
            { v: "excluded", l: "Excluded — never email" },
          ]}/>
    </div>

    <FTA label="Notes" k="notes" value={form.notes} onChange={set} placeholder="Anything the team should know…"/>

    <div style={{ display: "flex", gap: 10 }}>
      <Btn label={saving ? "Saving…" : done ? "✓ Saved!" : initial ? "Update Company" : "Add Company"}
           onClick={save} disabled={saving}/>
      <Btn label="Cancel" onClick={onClose} variant="ghost"/>
    </div>
  </div>;
}

export { CompaniesTab, CompanyForm, COMPANY_TYPES };
