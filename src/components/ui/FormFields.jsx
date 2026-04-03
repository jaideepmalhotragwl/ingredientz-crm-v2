import { C } from "../../constants.js";

const baseStyle = {
  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: "9px 11px", color: C.ink, fontFamily: "Arial,sans-serif",
  fontSize: 13, outline: "none", width: "100%", colorScheme: "light"
};

export function FF({ label, k, value, onChange, type = "text", options = null, placeholder = "", required = false, span = 1 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: `span ${span}` }}>
      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: C.blue }}> *</span>}
      </label>
      {options
        ? <select value={value} onChange={e => onChange(k, e.target.value)} style={{ ...baseStyle, color: value ? C.ink : C.muted }}>
            <option value="">Select…</option>
            {options.map(o => <option key={o.v || o} value={o.v || o}>{o.l || o}</option>)}
          </select>
        : <input type={type} value={value} onChange={e => onChange(k, e.target.value)} placeholder={placeholder} style={baseStyle} />
      }
    </div>
  );
}

export function FTA({ label, k, value, onChange, placeholder = "", rows = 3, span = 1 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: `span ${span}` }}>
      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>{label}</label>
      <textarea value={value} onChange={e => onChange(k, e.target.value)} placeholder={placeholder} rows={rows}
        style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", color: C.ink, fontFamily: "Arial,sans-serif", fontSize: 13, outline: "none", resize: "vertical" }} />
    </div>
  );
}

export function TF({ label, k, value, onChange, type = "text", options = null, placeholder = "" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>{label}</label>
      {options
        ? <select value={value} onChange={e => onChange(k, e.target.value)} style={{ ...baseStyle, color: value ? C.ink : C.muted }}>
            <option value="">Select…</option>
            {options.map(o => <option key={o.v || o} value={o.v || o}>{o.l || o}</option>)}
          </select>
        : <input type={type} value={value} onChange={e => onChange(k, e.target.value)} placeholder={placeholder} style={baseStyle} />
      }
    </div>
  );
}
