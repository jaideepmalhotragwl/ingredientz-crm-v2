/* =========================================================================
   CompanyPicker.jsx — v2
   ---------------------------------------------------------------------------
   Place at: src/components/CompanyPicker.jsx   (Enquiry CRM repo)

   CHANGES FROM v1
     · Linked card now shows the AI snippet, product categories and the
       products the company makes. search_companies() was already returning
       all of it — v1 fetched and discarded it.
     · Dropdown z-index raised and the wrapper made position:relative, so
       results no longer cover the Country / Contact fields.
     · Dropdown rows show category chips, so a match can be judged before
       it is picked.

   WHAT company_products MEANS
     Products this company MAKES OR SELLS, scraped from their own website.
     NOT what they have enquired about. For a brand, their retail range tells
     you which ingredients they buy — that is the sales signal.
   ========================================================================= */

import { useState, useEffect, useRef } from 'react';
import { C } from '../constants.js';
import { searchCompanies, salesConfigured } from '../salesClient.js';

export function CompanyPicker({ value, onChange, onSelect, onClear, selected }) {
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const boxRef = useRef(null);

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
  const chip = (bg, fg, bd) => ({
    fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
    background: bg, color: fg, border: `1px solid ${bd}`, whiteSpace: 'nowrap',
  });

  // ── Linked ─────────────────────────────────────────────────────────────
  if (selected) {
    const cats  = selected.ai_categories || [];
    const prods = selected.ai_products   || [];
    const shown = showAll ? prods : prods.slice(0, 10);

    return (
      <div>
        <div style={label}>Company *</div>
        <div style={{
          border: `1px solid ${C.blue}`, borderRadius: 7,
          background: C.blueLt || '#EFF6FF', padding: '11px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{selected.name}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {[selected.company_type, selected.city, selected.country, selected.domain]
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
                  ⚠ May be two companies sharing a name — verify before relying on this
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

          {selected.ai_snippet && (
            <div style={{
              fontSize: 11, color: C.ink, lineHeight: 1.55, marginTop: 9,
              paddingTop: 9, borderTop: '1px solid #BFD6F6', fontStyle: 'italic',
            }}>
              {selected.ai_snippet}
            </div>
          )}

          {cats.length > 0 && (
            <div style={{ marginTop: 9 }}>
              <div style={{ ...label, marginBottom: 4 }}>Category</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {cats.map(c => <span key={c} style={chip('#FFFFFF', C.blue, '#BFD6F6')}>{c}</span>)}
              </div>
            </div>
          )}

          {prods.length > 0 && (
            <div style={{ marginTop: 9 }}>
              <div style={{ ...label, marginBottom: 4 }}>
                Sells / makes · {prods.length}
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: C.muted }}>
                  (their range — not what they have enquired about)
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {shown.map(p => <span key={p} style={chip('#FFFBEB', '#B45309', '#FDE68A')}>{p}</span>)}
                {prods.length > 10 && (
                  <button
                    onClick={() => setShowAll(s => !s)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: C.blue, fontSize: 10, fontWeight: 700, padding: '3px 6px',
                    }}
                  >{showAll ? '− less' : `+${prods.length - 10} more`}</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Searching ──────────────────────────────────────────────────────────
  return (
    <div ref={boxRef} style={{ position: 'relative', zIndex: open ? 60 : 'auto' }}>
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
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
          marginTop: 3, maxHeight: 340, overflowY: 'auto',
          boxShadow: '0 10px 30px rgba(13,31,60,.18)',
        }}>
          {results.map(co => {
            const cats = (co.ai_categories || []).slice(0, 3);
            return (
              <div
                key={co.id}
                onClick={() => { onSelect(co); setOpen(false); setShowAll(false); }}
                style={{
                  padding: '9px 12px', cursor: 'pointer',
                  borderBottom: `1px solid ${C.border}`,
                  opacity: co.excluded ? 0.72 : 1,
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{co.name}</span>
                  {co.excluded     && <span title={co.excluded_reason} style={{ color: C.red, fontSize: 11 }}>⊘</span>}
                  {co.needs_review && <span title={co.review_reason}   style={{ color: '#B45309', fontSize: 11 }}>⚠</span>}
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 20, flexShrink: 0,
                    background: co.match_tier === 1 ? '#DCFCE7' : co.match_tier === 2 ? '#EFF6FF' : C.bg,
                    color:      co.match_tier === 1 ? '#065F46' : co.match_tier === 2 ? '#1D4ED8' : C.muted,
                  }}>{co.match_label}</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {[co.company_type, co.country, co.domain].filter(Boolean).join(' · ') || 'not enriched yet'}
                  {co.contact_count > 0 && ` · ${co.contact_count} contact${co.contact_count > 1 ? 's' : ''}`}
                </div>
                {cats.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {cats.map(c => (
                      <span key={c} style={{
                        fontSize: 9, padding: '1px 7px', borderRadius: 20,
                        background: C.bg, color: C.muted, border: `1px solid ${C.border}`,
                      }}>{c}</span>
                    ))}
                    {(co.ai_categories || []).length > 3 && (
                      <span style={{ fontSize: 9, color: C.muted }}>+{co.ai_categories.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
