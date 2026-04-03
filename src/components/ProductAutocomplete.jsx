import { useState, useEffect, useRef } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";

export function ProductAutocomplete({ value, onChange, onSelect, placeholder = "e.g. Ashwagandha Extract KSM-66" }) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => { setQuery(value || ""); }, [value]);

  async function search(q) {
    if (!q || q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("id, name, unit, status, product_categories(name)")
      .ilike("name", `%${q}%`)
      .order("name")
      .limit(12);
    setResults(data || []);
    setOpen(true);
    setLoading(false);
  }

  function handleChange(e) {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 220);
  }

  function handleSelect(product) {
    setQuery(product.name);
    onChange(product.name);
    onSelect(product);
    setOpen(false);
    setResults([]);
  }

  const STATUS_DOT = { active: C.green, pending: C.amber, inactive: C.muted };
  const inp = {
    background: C.white, border: `1px solid ${C.border}`, borderRadius: 7,
    padding: "7px 32px 7px 10px", color: C.ink, fontFamily: "Arial,sans-serif",
    fontSize: 13, outline: "none", width: "100%"
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative" }}>
        <input value={query} onChange={handleChange} onFocus={() => query.length >= 2 && search(query)} placeholder={placeholder} style={inp} />
        {loading && (
          <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 11 }}>⟳</div>
        )}
        {!loading && query && (
          <div onClick={() => { setQuery(""); onChange(""); setResults([]); setOpen(false); }}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</div>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 500, background: C.white, border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", marginTop: 4, maxHeight: 280, overflowY: "auto" }}>
          {results.map((p, i) => (
            <div key={p.id} onClick={() => handleSelect(p)}
              style={{ padding: "9px 13px", cursor: "pointer", borderBottom: i < results.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = C.blueLt}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{p.product_categories?.name || "Uncategorised"} · {p.unit || "kg"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_DOT[p.status] || C.muted }} />
                <span style={{ fontSize: 10, color: C.muted, textTransform: "capitalize" }}>{p.status}</span>
              </div>
            </div>
          ))}
          <div onClick={() => { setOpen(false); onChange(query); }}
            style={{ padding: "8px 13px", cursor: "pointer", background: C.bg, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.blue, fontWeight: 600 }}
            onMouseEnter={e => e.currentTarget.style.background = C.blueLt}
            onMouseLeave={e => e.currentTarget.style.background = C.bg}>
            + Use "{query}" as new product
          </div>
        </div>
      )}

      {open && results.length === 0 && query.length >= 2 && !loading && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 500, background: C.white, border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", marginTop: 4 }}>
          <div style={{ padding: "10px 13px", fontSize: 11, color: C.muted }}>No match — "{query}" will be saved as a new product</div>
        </div>
      )}
    </div>
  );
}
