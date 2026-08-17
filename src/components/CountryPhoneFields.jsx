import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";

/**
 * CountryPhoneFields — Enquiry CRM version.
 *
 * Renders two grid cells (Country, Phone) to drop into EnquiryForm's
 * existing 3-column grid. Picking a country sets the phone dial prefix.
 *
 * Props:
 *   value    { iso2, name, dial, national }
 *   onChange (next) => void
 *
 * Reads the `countries` table (242 rows, seeded by countries.sql).
 * Optional by design — the CRM captures enquiries from channels where
 * phone/country may genuinely be unknown at entry time.
 */

export function CountryPhoneFields({ value, onChange }) {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(0);

  const boxRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const LABEL = {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted,
    textTransform: "uppercase", display: "block", marginBottom: 5,
  };
  const INP = {
    background: C.white, border: `1px solid ${C.border}`, borderRadius: 7,
    padding: "7px 10px", color: C.ink, fontFamily: "Arial,sans-serif",
    fontSize: 13, outline: "none", width: "100%",
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("countries")
        .select("iso2, name, dial_code, flag")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error || !data) setLoadFailed(true);
      else setCountries(data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => { if (open && searchRef.current) searchRef.current.focus(); }, [open]);
  useEffect(() => { setCursor(0); }, [search]);
  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.children[cursor];
    if (row) row.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.iso2.toLowerCase() === q ||
      c.dial_code.replace("+", "").startsWith(q.replace("+", ""))
    );
  }, [countries, search]);

  function pick(c) {
    onChange({ iso2: c.iso2, name: c.name, dial: c.dial_code, national: value?.national || "" });
    setOpen(false);
    setSearch("");
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[cursor]) pick(filtered[cursor]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  const hasIso = !!value?.iso2;
  // Legacy rows have free-text country with no ISO code — show it, marked unverified,
  // so editing an old enquiry doesn't look like the country was lost.
  const legacyName = !hasIso && value?.name ? value.name : null;
  const flag = hasIso ? countries.find(c => c.iso2 === value.iso2)?.flag : null;

  if (loadFailed) {
    return (
      <>
        <div>
          <label style={LABEL}>Country</label>
          <input style={INP} placeholder="e.g. Germany" value={value?.name || ""}
            onChange={e => onChange({ ...value, name: e.target.value, iso2: null })}/>
        </div>
        <div>
          <label style={LABEL}>Phone</label>
          <input style={INP} placeholder="+49 30 123456" value={value?.national || ""}
            onChange={e => onChange({ ...value, national: e.target.value })}/>
        </div>
      </>
    );
  }

  return (
    <>
      <div ref={boxRef} style={{ position: "relative" }}>
        <label style={LABEL}>Country</label>
        <button type="button" onClick={() => setOpen(o => !o)} disabled={loading}
          style={{ ...INP, textAlign: "left", cursor: loading ? "wait" : "pointer",
                   display: "flex", alignItems: "center", gap: 7,
                   color: hasIso ? C.ink : (legacyName ? C.ink : C.muted) }}>
          {hasIso && <span>{flag}</span>}
          <span>{hasIso ? value.name : (legacyName || (loading ? "Loading…" : "Select country"))}</span>
          {legacyName && <span style={{ fontSize: 9, color: C.amber, fontWeight: 700 }}>unverified</span>}
          <span style={{ marginLeft: "auto", color: C.muted, fontSize: 9 }}>▾</span>
        </button>

        {open && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 300,
                        marginTop: 4, background: C.white, border: `1px solid ${C.border}`,
                        borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", overflow: "hidden" }}>
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={onKeyDown} placeholder="Search country or code"
              style={{ width: "100%", border: "none", borderBottom: `1px solid ${C.border}`,
                       padding: "8px 10px", fontSize: 13, outline: "none", fontFamily: "Arial,sans-serif" }}/>
            <div ref={listRef} role="listbox" style={{ maxHeight: 230, overflowY: "auto" }}>
              {filtered.length === 0 && (
                <div style={{ padding: 11, fontSize: 12, color: C.muted }}>
                  No match. Try the country name or dial code.
                </div>
              )}
              {filtered.map((c, i) => (
                <div key={c.iso2} role="option" aria-selected={value?.iso2 === c.iso2}
                  onMouseEnter={() => setCursor(i)} onClick={() => pick(c)}
                  style={{ padding: "7px 10px", fontSize: 13, cursor: "pointer",
                           display: "flex", alignItems: "center", gap: 7,
                           background: i === cursor ? C.blueLt : C.white }}>
                  <span>{c.flag}</span>
                  <span style={{ flex: 1, color: C.ink }}>{c.name}</span>
                  <span style={{ color: C.muted, fontSize: 12 }}>{c.dial_code}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <label style={LABEL}>Phone</label>
        <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.border}`,
                      borderRadius: 7, background: C.white, overflow: "hidden" }}>
          <span style={{ padding: "7px 8px 7px 10px", fontSize: 13,
                         color: hasIso ? C.muted : C.faded,
                         borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
            {value?.dial || "+—"}
          </span>
          <input type="tel" inputMode="tel" value={value?.national || ""}
            onChange={e => onChange({ ...value, national: e.target.value.replace(/[^\d\s-]/g, "") })}
            placeholder={hasIso ? "30 123456" : "Select country first"}
            style={{ flex: 1, border: "none", padding: "7px 10px", fontSize: 13,
                     outline: "none", fontFamily: "Arial,sans-serif" }}/>
        </div>
      </div>
    </>
  );
}
