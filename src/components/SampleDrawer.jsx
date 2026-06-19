import { useState } from "react";
import { C } from "../constants.js";
import { fmtDate } from "../utils.js";

const STAGES = [
  "Requested",
  "Supplier Shipped",
  "Received at Warehouse",
  "Dispatched to Customer",
  "Customer Received",
  "Feedback"
];

const STAGE_COLORS = {
  "Requested":              "#8E44AD",
  "Supplier Shipped":       "#F5A623",
  "Received at Warehouse":  "#1877F2",
  "Dispatched to Customer": "#16A085",
  "Customer Received":      "#42B72A",
  "Feedback":               "#34495E"
};

// timestamp field that records when each stage was reached
const STAGE_STAMP = {
  "Requested":              "requested_at",
  "Supplier Shipped":       "supplier_shipped_at",
  "Received at Warehouse":  "received_warehouse_at",
  "Dispatched to Customer": "dispatched_customer_at",
  "Customer Received":      "customer_received_at",
  "Feedback":               "feedback_at"
};

export function SampleDrawer({ sample, onClose, onAdvance, onUpdate, onChase, onResend }) {
  const [tracking, setTracking] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (!sample) return null;

  const curIdx = Math.max(0, STAGES.indexOf(sample.stage || "Requested"));
  const headColor =
    sample.stage === "Feedback" && sample.feedback_result === "Approved" ? C.green :
    sample.stage === "Feedback" && sample.feedback_result === "Rejected" ? C.red :
    STAGE_COLORS[sample.stage] || C.muted;
  const headLabel = sample.stage === "Feedback" && sample.feedback_result ? sample.feedback_result : (sample.stage || "Requested");

  // follow-up loop state
  const supplierLoopActive = ["Requested", "Supplier Shipped"].includes(sample.stage);
  const customerLoopActive = ["Dispatched to Customer", "Customer Received"].includes(sample.stage);

  async function advance(toStage, extra = {}) {
    setBusy(true);
    await onAdvance(sample, toStage, extra);
    setTracking("");
    setBusy(false);
  }
  async function recordFeedback(result) {
    setBusy(true);
    await onAdvance(sample, "Feedback", { feedback_result: result, feedback_notes: feedbackNotes });
    setBusy(false);
  }
  async function chase(who) {
    setBusy(true);
    await onChase(sample, who);
    setBusy(false);
  }

  // ── Styles ──
  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", justifyContent: "flex-end" };
  const drawer = { width: "min(760px, 94vw)", height: "100vh", background: C.bg, display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.2)" };
  const header = { background: C.card, padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 };
  const pill = (color) => ({ fontSize: 11, padding: "3px 9px", borderRadius: 99, fontWeight: 600, background: `${color}22`, color, display: "inline-block" });
  const card = { background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12 };
  const sectionTitle = { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, margin: "0 0 12px" };
  const btnPrimary = { background: C.blue, color: "white", border: 0, padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" };
  const btnGhost = { background: "transparent", color: C.ink, border: `1px solid ${C.border}`, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" };
  const inp = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", color: C.ink, fontSize: 12, outline: "none" };

  function Block({ title, lines }) {
    return (
      <div style={{ ...card, marginBottom: 0 }}>
        <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{title}</div>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: 13, marginBottom: 5, color: l.muted ? C.muted : C.ink, fontWeight: l.bold ? 600 : 400 }}>{l.text}</div>
        ))}
      </div>
    );
  }

  // current-step action control
  function StepAction() {
    const stage = sample.stage;
    if (stage === "Requested") {
      return (
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input style={{ ...inp, width: 170 }} placeholder="Tracking # (optional)" value={tracking} onChange={e => setTracking(e.target.value)} />
          <button style={btnPrimary} disabled={busy} onClick={() => advance("Supplier Shipped", { supplier_tracking: tracking })}>Mark supplier shipped →</button>
        </div>
      );
    }
    if (stage === "Supplier Shipped") {
      return <div style={{ marginTop: 8 }}><button style={btnPrimary} disabled={busy} onClick={() => advance("Received at Warehouse")}>Mark received at warehouse →</button></div>;
    }
    if (stage === "Received at Warehouse") {
      return (
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input style={{ ...inp, width: 170 }} placeholder="Tracking # (optional)" value={tracking} onChange={e => setTracking(e.target.value)} />
          <button style={btnPrimary} disabled={busy} onClick={() => advance("Dispatched to Customer", { customer_tracking: tracking })}>Mark dispatched to customer →</button>
        </div>
      );
    }
    if (stage === "Dispatched to Customer") {
      return <div style={{ marginTop: 8 }}><button style={btnPrimary} disabled={busy} onClick={() => advance("Customer Received")}>Mark customer received →</button></div>;
    }
    if (stage === "Customer Received") {
      return (
        <div style={{ marginTop: 8 }}>
          <textarea style={{ ...inp, width: "100%", resize: "vertical", marginBottom: 8 }} rows={2} placeholder="Feedback notes (optional)" value={feedbackNotes} onChange={e => setFeedbackNotes(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btnPrimary, background: C.green }} disabled={busy} onClick={() => recordFeedback("Approved")}>✓ Approved</button>
            <button style={{ ...btnPrimary, background: C.red }} disabled={busy} onClick={() => recordFeedback("Rejected")}>✕ Rejected</button>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={drawer} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={header}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: C.ink }}>{sample.sample_number}</span>
              <span style={pill(headColor)}>{headLabel}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>{sample.product_name}{sample.quantity ? <span style={{ color: C.muted, fontWeight: 400, fontSize: 13 }}> · {sample.quantity} {sample.unit || ""}</span> : null}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Created {fmtDate(sample.created_at)}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 16, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>

          {/* three blocks */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Block title="Customer" lines={[
              { text: sample.customer_name || "—", bold: true },
              { text: sample.customer_contact || "—", muted: true },
              { text: sample.customer_email || "—", muted: true },
              { text: sample.customer_country || "—", muted: true }
            ]} />
            <Block title="Supplier" lines={[
              { text: sample.supplier_name || "—", bold: true },
              { text: sample.supplier_contact || "—", muted: true },
              { text: sample.supplier_email || "—", muted: true }
            ]} />
            <Block title="Product" lines={[
              { text: sample.product_name || "—", bold: true },
              { text: `Qty: ${sample.quantity || "—"} ${sample.unit || ""}`, muted: true },
              { text: sample.purpose ? `For: ${sample.purpose}` : "—", muted: true }
            ]} />
          </div>

          {/* Journey */}
          <div style={card}>
            <div style={sectionTitle}>Journey</div>
            {STAGES.map((st, i) => {
              const done = i < curIdx || (sample.stage === "Feedback" && i <= curIdx);
              const now = i === curIdx && sample.stage !== "Feedback";
              const stampField = STAGE_STAMP[st];
              const stamp = sample[stampField];
              let meta = "";
              if (st === "Supplier Shipped" && sample.supplier_tracking) meta = ` · tracking ${sample.supplier_tracking}`;
              if (st === "Dispatched to Customer" && sample.customer_tracking) meta = ` · tracking ${sample.customer_tracking}`;
              if (st === "Feedback" && sample.feedback_result) meta = ` · ${sample.feedback_result}${sample.feedback_notes ? ` — ${sample.feedback_notes}` : ""}`;
              return (
                <div key={st} style={{ display: "flex", gap: 14, position: "relative", paddingBottom: i === STAGES.length - 1 ? 0 : 18 }}>
                  {i !== STAGES.length - 1 && <div style={{ position: "absolute", left: 13, top: 26, bottom: -2, width: 2, background: C.border }} />}
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, zIndex: 1,
                    background: done ? C.green : now ? C.blue : C.card,
                    color: done || now ? "#fff" : C.muted,
                    border: done || now ? "none" : `2px solid ${C.border}`,
                    boxShadow: now ? `0 0 0 4px ${C.blue}22` : "none"
                  }}>{done ? "✓" : i + 1}</div>
                  <div style={{ paddingTop: 3, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: (done || now) ? C.ink : C.muted }}>{st}</div>
                    {stamp && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fmtDate(stamp)}{meta}</div>}
                    {!stamp && meta && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{meta}</div>}
                    {now && <StepAction />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Follow-ups */}
          <div style={card}>
            <div style={sectionTitle}>Auto follow-ups</div>
            <FollowupLoop
              title="Supplier chase"
              active={supplierLoopActive}
              closed={["Received at Warehouse", "Dispatched to Customer", "Customer Received", "Feedback"].includes(sample.stage)}
              activeText={`Chasing the supplier until the sample reaches our warehouse.${sample.next_followup_at ? ` Next due ${fmtDate(sample.next_followup_at)}.` : ""}${sample.followup_count ? ` ${sample.followup_count} sent so far.` : ""}`}
              closedText="Sample reached our warehouse — supplier loop closed."
              onChase={() => chase("supplier")}
              busy={busy}
              C={C}
            />
            <FollowupLoop
              title="Customer chase"
              active={customerLoopActive}
              closed={sample.stage === "Feedback"}
              activeText={`Chasing the customer for feedback.${sample.next_followup_at ? ` Next due ${fmtDate(sample.next_followup_at)}.` : ""}`}
              pendingText="Starts once the sample is dispatched to the customer."
              closedText="Feedback received — customer loop closed."
              onChase={() => chase("customer")}
              busy={busy}
              C={C}
            />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6, fontStyle: "italic" }}>
              The schedule is tracked here and "Send chase now" sends immediately. Hands-off automatic sending switches on once the sequence runner is wired for samples.
            </div>
          </div>

          {/* Request email */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ ...sectionTitle, margin: 0 }}>Sample-request email</div>
              <button style={btnGhost} disabled={busy} onClick={() => onResend(sample)}>Resend request</button>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>To: {sample.supplier_email || "—"} · From: procurement@mail.ingredientz.co</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Sample request — {sample.product_name}{sample.quantity ? ` (${sample.quantity} ${sample.unit || ""})` : ""} [{sample.sample_number}]</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, borderLeft: `2px solid ${C.border}`, paddingLeft: 12 }}>
              We'd like to request a sample of {sample.product_name} for a customer evaluation. Please confirm availability, lead time and share the CoA, and we'll coordinate shipment to our warehouse.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function FollowupLoop({ title, active, closed, activeText, pendingText, closedText, onChase, busy, C }) {
  const status = closed ? "closed" : active ? "active" : "pending";
  const color = closed ? C.green : active ? C.amber : C.muted;
  const text = closed ? closedText : active ? activeText : (pendingText || "");
  return (
    <div style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 10, background: C.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          {title}
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, background: `${color}22`, color }}>{status}</span>
        </div>
        {active && <button onClick={onChase} disabled={busy} style={{ background: C.blue, color: "white", border: 0, borderRadius: 7, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}>📨 Send chase now</button>}
      </div>
      {text && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{text}</div>}
    </div>
  );
}
