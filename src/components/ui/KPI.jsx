import { C } from "../../constants.js";

export function KPI({ label, value, sub, accent }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: "uppercase", marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: accent || C.blue, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}
