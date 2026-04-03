import { C, STAGES, STAGE_COLORS, PRIO_COLORS } from "../../constants.js";

export function StageBadge({ stage }) {
  const i = STAGES.indexOf(stage);
  const col = STAGE_COLORS[i] || C.muted;
  return (
    <span style={{ background: `${col}22`, color: col, border: `1px solid ${col}44`, borderRadius: 20, padding: "3px 11px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      {stage}
    </span>
  );
}

export function PrioBadge({ priority }) {
  const col = PRIO_COLORS[priority] || C.muted;
  return (
    <span style={{ background: `${col}22`, color: col, border: `1px solid ${col}44`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
      {priority}
    </span>
  );
}
