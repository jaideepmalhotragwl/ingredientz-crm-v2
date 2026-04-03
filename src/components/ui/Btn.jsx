import { C } from "../../constants.js";

export function Btn({ label, onClick, variant = "primary", size = "md", disabled = false }) {
  const bg  = variant === "primary" ? C.blue : variant === "danger" ? C.red : "transparent";
  const col = variant === "primary" || variant === "danger" ? "white" : C.blue;
  const pad = size === "sm" ? "5px 12px" : size === "lg" ? "12px 26px" : "9px 18px";
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: bg, color: col,
      border: variant === "ghost" ? `1px solid ${C.border}` : "none",
      borderRadius: 8, padding: pad, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "Arial,sans-serif", fontSize: size === "sm" ? 11 : 13,
      fontWeight: 700, opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap"
    }}>{label}</button>
  );
}
