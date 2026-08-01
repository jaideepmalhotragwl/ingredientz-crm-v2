/* =========================================================================
   CompanyPicker.jsx — type a company name, resolve it against the Sales CRM
   ---------------------------------------------------------------------------
   Place at: src/components/CompanyPicker.jsx   (Enquiry CRM repo)

   Debounced search against search_companies() in the Sales CRM project.
   Results are ranked by match quality and each carries a badge:

     exact        company_name_key match — case/spacing/punctuation collapsed
     close        legal suffix stripped — 'Natura-Pro Kft.' → 'Natura-Pro'
     starts with  prefix match
     contains     name or domain substring

   Flags surfaced rather than hidden:
     ⊘  excluded     — off-ICP in the Sales CRM (hospital, retail, big pharma).
                       Still selectable. Someone who sends an enquiry is a
                       different signal from someone on a scraped list.
     ⚠  needs review — contacts under this name had conflicting domains, so
                       it may be two companies (Merck US vs Merck KGaA).

   Degrades gracefully: if the Sales CRM is unreachable or env vars are
   missing, the input still works as a plain text field.

   Props
     value         current company name string
     onChange(str) called as the user types
     onSelect(co)  called with the full company record when one is picked
     onClear()     called when a linked company is detached
     selected      the currently linked company record, or null
   ========================================================================= */

import { useState, useEffect, useRef } from 'react';
import { C } from '../constants.js';
import { searchCompanies, salesConfigured } from '../salesClient.js';

export function CompanyPicker({ value, onChange, onSelect, onClear, selected }) {
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  // Debounced lookup — skipped entirely once a company is linked
  useEffect(() => {
    if (selected || !value || value.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchCompanies(value, 8);
      if (cancelled) return;
      setResults(rows);
      setLoading(false);
      setOpen(rows.length > 0);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); setLoading(false); };
  }, [value, selected]);

  // Close on outside click
  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const inp = {
    background: C.white, border: `1px solid ${C.border}`, borderRadius: 7,
    padding: '7px 10px', color: C.ink, fontFamily: 'Arial,sans-serif',
    fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const label = {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
    color: C.muted, textTransform: 'uppercase', marginBottom: 5,
  };

  // ── Linked state ───────────────────────────────────────────────────────
  if (selected) {
    return (
      <div>
        <div style={label}>Company *</div>
        <div style={{
          border: `1px solid ${C.blue}`, borderRadius: 7,
          background: C.blueLt || '#EFF6FF', padding: '9px 11px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                {selected.name}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {[selected.company_type, selected.country, selected.domain]
                  .filter(Boolean).join(' · ') || 'no details yet'}
              </div>
              {selected.contact_count > 0 && (
                <div style={{ fontSize: 10, color: C.blue, marginTop: 3 }}>
                  {selected.contact_count} contact{selected.contact_count > 1 ? 's' : ''} already in the Sales CRM
                </div>
              )}
              {selected.excluded && (
                <div style={{ fontSize: 10, color: C.red, marginTop: 4, fontWeight: 600 }}>
                  ⊘ Flagged off-ICP{selected.excluded_reason ? ` — ${selected.excluded_reason}` : ''}
                </div>
              )}
              {selected.needs_review && (
                <div style={{ fontSize: 10, color: '#B45309', marginTop: 4, fontWeight: 600 }}>
                  ⚠ May be two companies sharing a name — check before relying on this
                </div>
              )}
            </div>
            <button
              onClick={onClear}
              title="Detach and type manually"
              style={{
                background: 'transparent', border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
                color: C.muted, fontSize: 11, flexShrink: 0,
              }}
            >Change</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Search state ───────────────────────────────────────────────────────
  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div style={label}>
        Company *
        {!salesConfigured && (
          <span style={{ color: C.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
            (company lookup unavailable — manual entry)
          </span>
        )}
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        placeholder={salesConfigured ? 'Start typing — e.g. Nexira' : 'e.g. Nexira SAS'}
        style={inp}
        autoComplete="off"
      />

      {loading && (
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Searching company master…</div>
      )}

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
          marginTop: 3, maxHeight: 300, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(13,31,60,.14)',
        }}>
          {results.map(co => (
            <div
              key={co.id}
              onClick={() => { onSelect(co); setOpen(false); }}
              style={{
                padding: '9px 12px', cursor: 'pointer',
                borderBottom: `1px solid ${C.border}`,
                opacity: co.excluded ? 0.72 : 1,
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.bg}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {co.name}
                </span>
                {co.excluded     && <span title={co.excluded_reason} style={{ color: C.red, fontSize: 11 }}>⊘</span>}
                {co.needs_review && <span title={co.review_reason}   style={{ color: '#B45309', fontSize: 11 }}>⚠</span>}
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                  background: co.match_tier === 1 ? '#DCFCE7' : co.match_tier === 2 ? '#EFF6FF' : C.bg,
                  color:      co.match_tier === 1 ? '#065F46' : co.match_tier === 2 ? '#1D4ED8' : C.muted,
                  flexShrink: 0,
                }}>{co.match_label}</span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                {[co.company_type, co.country, co.domain].filter(Boolean).join(' · ') || 'not enriched yet'}
                {co.contact_count > 0 && ` · ${co.contact_count} contact${co.contact_count > 1 ? 's' : ''}`}
              </div>
            </div>
          ))}
          <div
            onClick={() => setOpen(false)}
            style={{
              padding: '8px 12px', cursor: 'pointer', fontSize: 11,
              color: C.blue, textAlign: 'center', background: C.bg,
            }}
          >
            None of these — keep "{value}" as typed
          </div>
        </div>
      )}
    </div>
  );
}
