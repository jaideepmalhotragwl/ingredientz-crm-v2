import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";

/**
 * CompanyPicker — search and select a company, or create one inline.
 *
 * Props:
 *   value      company id (string|number) or "" 
 *   onChange   (id, companyRow|null) => void
 *   companies  optional preloaded array; fetched if omitted
 *   allowCreate  default true — offers "Create …" when nothing matches
 *   label      default "Company *"
 *
 * Never blocks the user: if the company genuinely doesn't exist yet,
 * they create it here rather than abandoning the enquiry.
 */
export function CompanyPicker({ value, onChange, companies: preload, allowCreate = true, label = "Company *" }) {
  const [rows, setRows] = useState(preload || []);
  const [loading, setLoading] = useState(!preload);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [creating, setCreating] = useState(false);
  // Inline create asks for country up front. Creating a company with only
  // a name means every enquiry under it inherits no country — which is
  // how 30-odd companies ended up blank and their enquiries with them.
  const [newCo, setNewCo] = useState(null);   // { name, iso2, countryName, type }
  const [countries, setCountries] = useState([]);
  const boxRef = useRef(null), searchRef = useRef(null), listRef = useRef(null);

  useEffect(() => {
    if (preload) { setRows(preload); setLoading(false); return; }
    let dead = false;
    supabase.from("companies")
      .select("id,name,domain,country,country_iso2,company_type,agent_id,status,verified")
      .order("name")
      .then(({ data }) => { if (!dead) { setRows(data || []); setLoading(false); } });
    return () => { dead = true; };
  }, [preload]);

  useEffect(() => {
    supabase.from("countries")
      .select("iso2,name,flag").eq("is_active", true)
      .order("sort_order").order("name")
      .then(({ data }) => setCountries(data || []));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => { if (open && searchRef.current) searchRef.current.focus(); }, [open]);
  useEffect(() => { setCursor(0); }, [q]);
  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.children[cursor];
    if (row) row.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows.slice(0, 400);
    return rows.filter(c =>
      (c.name || "").toLowerCase().includes(s) ||
      (c.domain || "").toLowerCase().includes(s)
    ).slice(0, 400);
  }, [rows, q]);

  const selected = rows.find(c => String(c.id) === String(value)) || null;
  const exact = filtered.some(c => (c.name || "").toLowerCase() === q.trim().toLowerCase());

  function pick(c) {
    onChange(c ? c.id : "", c);
    setOpen(false); setQ("");
  }

  // Step 1 — open the small form rather than creating straight away.
  function beginCreate() {
    setNewCo({ name: q.trim(), iso2: "", type: "" });
  }

  // Step 2 — country is required. It costs one click and saves the
  // company, its contacts and every future enquiry from being blank.
  async function createNow() {
    const name = (newCo?.name || "").trim();
    if (!name) return;
    if (!newCo?.iso2) { alert("Pick a country — enquiries inherit it from the company."); return; }
    setCreating(true);
    const country = countries.find(c => c.iso2 === newCo.iso2);
    const { data, error } = await supabase.from("companies")
      .insert({
        name,
        country_iso2: newCo.iso2,
        country: country?.name || null,
        company_type: newCo.type || null,
        verified: false,
        created_by: "crm-inline",
        status: "active",
      })
      .select().single();
    setCreating(false);
    if (error) { alert("Could not create company: " + error.message); return; }
    setRows(r => [...r, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    setNewCo(null);
    pick(data);
  }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[cursor]) pick(filtered[cursor]);
      else if (allowCreate && q.trim() && !exact) beginCreate();
    }
    else if (e.key === "Escape") setOpen(false);
  }

  const LABEL = { fontSize:10, fontWeight:700, letterSpacing:1.5, color:C.muted,
                  textTransform:"uppercase", display:"block", marginBottom:5 };
  const INP = { background:C.white, border:`1px solid ${C.border}`, borderRadius:7,
                padding:"7px 10px", color:C.ink, fontFamily:"Arial,sans-serif",
                fontSize:13, outline:"none", width:"100%" };

  return (
    <div ref={boxRef} style={{ position:"relative" }}>
      <label style={LABEL}>{label}</label>
      <button type="button" onClick={() => setOpen(o => !o)} disabled={loading}
        style={{ ...INP, textAlign:"left", cursor: loading ? "wait" : "pointer",
                 display:"flex", alignItems:"center", gap:7,
                 color: selected ? C.ink : C.muted }}>
        <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {selected ? selected.name : (loading ? "Loading…" : "Select company")}
        </span>
        {selected?.verified === false &&
          <span style={{ fontSize:9, fontWeight:700, color:"#fff", background:"#7C3AED",
                         borderRadius:4, padding:"1px 5px" }}>UNVERIFIED</span>}
        <span style={{ color:C.faded, fontSize:9 }}>▾</span>
      </button>

      {selected && (
        <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>
          {selected.domain || "no domain"} · {selected.country || "no country"}
          {selected.status !== "active" && <span style={{ color:C.red, fontWeight:700 }}> · {selected.status}</span>}
        </div>
      )}

      {open && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:400, marginTop:4,
                      background:C.white, border:`1px solid ${C.border}`, borderRadius:9,
                      boxShadow:"0 8px 24px rgba(0,0,0,0.14)", overflow:"hidden", minWidth:280 }}>
          <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search company or domain…"
            style={{ width:"100%", border:"none", borderBottom:`1px solid ${C.border}`,
                     padding:"8px 10px", fontSize:13, outline:"none", fontFamily:"Arial,sans-serif" }}/>
          <div ref={listRef} style={{ maxHeight:240, overflowY:"auto" }}>
            {filtered.map((c, i) => (
              <div key={c.id} onMouseEnter={() => setCursor(i)} onClick={() => pick(c)}
                style={{ padding:"7px 10px", fontSize:12.5, cursor:"pointer",
                         display:"flex", alignItems:"center", gap:8,
                         background: i === cursor ? C.blueLt : C.white }}>
                <span style={{ flex:1, color:C.ink, overflow:"hidden",
                               textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</span>
                {c.verified === false &&
                  <span style={{ fontSize:8.5, fontWeight:700, color:"#7C3AED" }}>UNV</span>}
                <span style={{ fontSize:10.5, color:C.faded }}>{c.domain || c.country || ""}</span>
              </div>
            ))}
            {filtered.length === 0 && !q.trim() &&
              <div style={{ padding:11, fontSize:12, color:C.faded }}>No companies yet</div>}
          </div>
          {allowCreate && q.trim() && !exact && !newCo && (
            <div onClick={beginCreate}
              style={{ padding:"9px 10px", fontSize:12.5, cursor:"pointer", color:C.blue,
                       fontWeight:600, borderTop:`1px solid ${C.border}`, background:"#FAFBFC" }}>
              + Create "{q.trim()}"
            </div>
          )}

          {newCo && (
            <div style={{ borderTop:`1px solid ${C.border}`, background:"#FAFBFC", padding:"11px 10px" }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:1.2, color:C.muted,
                            textTransform:"uppercase", marginBottom:7 }}>New company</div>
              <input value={newCo.name} autoFocus
                onChange={e => setNewCo(n => ({ ...n, name: e.target.value }))}
                placeholder="Company name"
                style={{ ...INP, marginBottom:7 }}/>
              <select value={newCo.iso2}
                onChange={e => setNewCo(n => ({ ...n, iso2: e.target.value }))}
                style={{ ...INP, marginBottom:7, cursor:"pointer",
                         borderColor: newCo.iso2 ? C.border : C.red + "88" }}>
                <option value="">Country * — required</option>
                {countries.map(c => <option key={c.iso2} value={c.iso2}>{c.flag} {c.name}</option>)}
              </select>
              <select value={newCo.type}
                onChange={e => setNewCo(n => ({ ...n, type: e.target.value }))}
                style={{ ...INP, marginBottom:9, cursor:"pointer" }}>
                <option value="">Type — optional, set later</option>
                {["Nutraceutical Brand","Cosmetics Brand","Pharmaceutical Company",
                  "CDMO / Contract Manufacturer","Ingredients Manufacturer",
                  "Distributor / Trader","Retailer","R&D / Formulation Lab",
                  "Pet Nutrition Company","Other / Unclear"]
                  .map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div style={{ display:"flex", gap:7 }}>
                <button type="button" onClick={createNow} disabled={creating}
                  style={{ background:C.blue, color:"#fff", border:0, borderRadius:7,
                           padding:"6px 14px", fontSize:11.5, fontWeight:700,
                           cursor: creating ? "wait" : "pointer" }}>
                  {creating ? "Creating…" : "Create"}
                </button>
                <button type="button" onClick={() => setNewCo(null)}
                  style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:7,
                           padding:"6px 12px", fontSize:11.5, color:C.muted, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
              <div style={{ fontSize:9.5, color:C.faded, marginTop:7, lineHeight:1.5 }}>
                Saved as unverified — check the domain and details in the Companies tab.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
