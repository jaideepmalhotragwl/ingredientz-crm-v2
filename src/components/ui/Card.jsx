import { C } from "../../constants.js";

export function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, ...style }}>
      {children}
    </div>
  );
}
