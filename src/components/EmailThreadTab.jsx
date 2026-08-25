import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";

/**
 * EmailThreadTab — the customer conversation and the supplier
 * conversation, kept apart.
 *
 * They must never share a view. 92% of logged email volume is supplier
 * RFQ traffic; mixed in, the customer conversation is unreadable — and
 * a careless reply-all would send supplier pricing to the buyer.
 */

const SEND_FN = "https://eytoryygkxjslfvsqanl.supabase.co/functions/v1/thread-send";

function fmt(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function nameOf(raw) {
  if (!raw) return "—";
  const m = String(raw).match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : String(raw).split("@")[0];
}

/**
 * What actually happened to a message we sent. Fed by the email-status
 * webhook, so it reflects Resend's own record rather than an assumption
 * that "sent" means "arrived".
 */
function DeliveryPill({ status, opened }) {
  const map = {
    sent:       ["#8A8D91", "#F0F1F3", "sent"],
    delivered:  ["#1E7A46", "#E6F4EC", opened ? "opened" : "delivered"],
    bounced:    ["#E41E3F", "#FFF0F0", "bounced"],
    complained: ["#E41E3F", "#FFF0F0", "spam"],
    failed:     ["#E41E3F", "#FFF0F0", "failed"],
  };
  const [c, b, label] = map[status || "sent"] || map.sent;
  const title = {
    sent:       "Handed to Resend — no delivery confirmation yet",
    delivered:  opened ? "Delivered and opened" : "Delivered to the recipient's server",
    bounced:    "Rejected. The address may be dead — check before resending.",
    complained: "Marked as spam by the recipient. Do not email again.",
    failed:     "Could not be sent",
  }[status || "sent"];
  return <span title={title} style={{
    fontSize: 8.5, fontWeight: 700, color: c, background: b,
    border: `1px solid ${c}44`, borderRadius: 4, padding: "1px 5px",
    textTransform: "uppercase", letterSpacing: 0.5,
  }}>{label}</span>;
}

function EmailThreadTab({ enq, threads = [], users = [], onThreadInserted }) {
  const [view, setView]       = useState("customer");   // customer | supplier
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr]         = useState("");
  const [replyAddr, setReplyAddr] = useState({ customer: "", supplier: "" });
  const [draft, setDraft] = useState({ to: "", subject: "", body: "" });
  const bottomRef = useRef(null);

  // Read from the DB rather than the threads prop: the prop is loaded
  // once at app start and would not show a reply that arrived since.
  useEffect(() => {
    if (!enq?.id) return;
    let dead = false;
    setLoading(true);
    supabase.from("email_threads")
      .select("*")
      .eq("enquiry_id", enq.id)
      .order("sent_at", { ascending: true })
      .then(({ data }) => { if (!dead) { setRows(data || []); setLoading(false); } });
    return () => { dead = true; };
  }, [enq?.id, threads.length]);

  useEffect(() => {
    if (!enq?.id) return;
    Promise.all([
      supabase.rpc("enquiry_reply_address", { p_enquiry_id: enq.id, p_party: "customer" }),
      supabase.rpc("enquiry_reply_address", { p_enquiry_id: enq.id, p_party: "supplier" }),
    ]).then(([c, s]) => setReplyAddr({ customer: c.data || "", supplier: s.data || "" }));
  }, [enq?.id]);

  const shown = useMemo(
    () => rows.filter(r => (r.party || "customer") === view),
    [rows, view]
  );

  const counts = useMemo(() => ({
    customer: rows.filter(r => (r.party || "customer") === "customer").length,
    supplier: rows.filter(r => r.party === "supplier").length,
    review:   rows.filter(r => r.needs_review).length,
  }), [rows]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ block: "nearest" });
  }, [shown.length, view]);

  function openCompose() {
    // Reply to whoever wrote last on this side, else the enquiry contact.
    const lastIn = [...shown].reverse().find(r => r.direction === "received");
    const to = lastIn
      ? (String(lastIn.from_email).match(/<([^>]+)>/)?.[1] || lastIn.from_email)
      : (view === "customer" ? (enq.email || "") : "");
    const last = shown[shown.length - 1];
    const base = last?.subject || `${enq.customer_name} — ${(enq.products?.[0]?.name) || "enquiry"}`;
    setDraft({ to, subject: base.replace(/^((re|fwd?):\s*)+/i, ""), body: "" });
    setErr("");
    setComposing(true);
  }

  async function send() {
    if (!draft.to.trim())   { setErr("Recipient is required"); return; }
    if (!draft.body.trim()) { setErr("Write a message first"); return; }
    setSending(true); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(SEND_FN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || supabase.supabaseKey}`,
        },
        body: JSON.stringify({
          enquiry_id: enq.id,
          party: view,
          to: draft.to.split(",").map(s => s.trim()).filter(Boolean),
          subject: draft.subject,
          body: draft.body,
          sent_by: enq.assigned_to || null,
        }),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "Send failed");
      if (out.logged === false) setErr("Sent, but could not be logged — tell Jaideep");

      const { data } = await supabase.from("email_threads")
        .select("*").eq("enquiry_id", enq.id).order("sent_at", { ascending: true });
      setRows(data || []);
      onThreadInserted && onThreadInserted({});
      setComposing(false);
      setDraft({ to: "", subject: "", body: "" });
    } catch (e) {
      setErr(e.message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (!enq) return null;

  const tabBtn = (id, label, n) => (
    <button key={id} onClick={() => { setView(id); setComposing(false); }}
      style={{
        flex: 1, background: view === id ? C.white : "transparent",
        border: `1px solid ${view === id ? C.border : "transparent"}`,
        borderBottom: view === id ? `2px solid ${id === "supplier" ? "#8E44AD" : C.blue}` : `1px solid ${C.border}`,
        borderRadius: view === id ? "8px 8px 0 0" : 0,
        padding: "8px 12px", cursor: "pointer", fontSize: 12,
        fontWeight: view === id ? 700 : 500,
        color: view === id ? (id === "supplier" ? "#8E44AD" : C.blue) : C.muted,
      }}>
      {label} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {n}</span>
    </button>
  );

  const inp = { width: "100%", background: C.white, border: `1px solid ${C.border}`,
                borderRadius: 7, padding: "8px 10px", fontSize: 13,
                fontFamily: "Arial,sans-serif", outline: "none" };

  return <div style={{ paddingTop: 14 }}>

    <div style={{ display: "flex", gap: 0, marginBottom: 12 }}>
      {tabBtn("customer", "💬 Customer", counts.customer)}
      {tabBtn("supplier", "🏭 Suppliers", counts.supplier)}
    </div>

    {counts.review > 0 && (
      <div style={{ background: "#FFF8E7", border: "1px solid #FFE0A3", borderRadius: 8,
                    padding: "8px 12px", marginBottom: 10, fontSize: 11.5, color: "#8a5a08" }}>
        ⚠ {counts.review} message{counts.review > 1 ? "s" : ""} on this enquiry could not be matched
        with confidence — check the sender before replying.
      </div>
    )}

    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "8px 11px", marginBottom: 12, fontSize: 10.5, color: C.muted }}>
      Replies to <b style={{ fontFamily: "monospace", color: C.ink }}>{replyAddr[view] || "…"}</b> land
      here automatically. {view === "supplier"
        ? "Suppliers see procurement@ingredientz.co."
        : "Customers see sales@ingredientz.co."}
    </div>

    {!composing && (
      <div style={{ marginBottom: 12 }}>
        <Btn label={view === "customer" ? "✉ Write to customer" : "✉ Write to supplier"}
             onClick={openCompose} size="sm"/>
      </div>
    )}

    {composing && (
      <div style={{ background: C.white, border: `1px solid ${C.blue}55`, borderRadius: 10,
                    padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: C.muted,
                            textTransform: "uppercase", display: "block", marginBottom: 4 }}>To</label>
            <input style={inp} value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))}
              placeholder="buyer@company.com — comma-separate for several"/>
          </div>
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: C.muted,
                            textTransform: "uppercase", display: "block", marginBottom: 4 }}>Subject</label>
            <input style={inp} value={draft.subject}
              onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))}/>
            <div style={{ fontSize: 9.5, color: C.faded, marginTop: 3 }}>
              {view === "supplier" ? `[RFQ-${enq.id}]` : `[ENQ-${enq.id}]`} is added automatically.
            </div>
          </div>
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: C.muted,
                            textTransform: "uppercase", display: "block", marginBottom: 4 }}>Message</label>
            <textarea style={{ ...inp, minHeight: 150, resize: "vertical", lineHeight: 1.6 }}
              value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
              placeholder="Write normally — blank lines become paragraphs."/>
          </div>
          {err && <div style={{ fontSize: 11.5, color: C.red }}>{err}</div>}
          <div style={{ display: "flex", gap: 9 }}>
            <Btn label={sending ? "Sending…" : "Send"} onClick={send} disabled={sending} size="sm"/>
            <Btn label="Cancel" onClick={() => setComposing(false)} variant="ghost" size="sm"/>
          </div>
        </div>
      </div>
    )}

    {loading && <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12 }}>Loading…</div>}

    {!loading && shown.length === 0 && (
      <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 12,
                    background: C.bg, borderRadius: 10, border: `1px dashed ${C.border}` }}>
        No {view} emails yet on this enquiry.
      </div>
    )}

    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {shown.map(m => {
        const out = m.direction !== "received";
        const accent = view === "supplier" ? "#8E44AD" : C.blue;
        return (
          <div key={m.id} style={{
            background: out ? C.white : "#F7FAFF",
            border: `1px solid ${out ? C.border : accent + "33"}`,
            borderLeft: `3px solid ${out ? C.border : accent}`,
            borderRadius: 9, padding: "11px 13px",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>
                {out ? "We sent" : nameOf(m.from_email)}
              </span>
              <span style={{ fontSize: 10, color: C.faded }}>
                {out ? `→ ${m.to_email}` : ""}
              </span>
              {out && <DeliveryPill status={m.delivery_status} opened={m.opened}/>}
              <span style={{ marginLeft: "auto", fontSize: 10, color: C.faded }}>{fmt(m.sent_at)}</span>
              {m.needs_review && <span style={{ fontSize: 8.5, fontWeight: 700, color: "#8a5a08",
                background: "#FFF8E7", border: "1px solid #FFE0A3", borderRadius: 4,
                padding: "1px 5px" }}>UNMATCHED</span>}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 5 }}>{m.subject}</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, whiteSpace: "pre-wrap",
                          maxHeight: 200, overflowY: "auto" }}>
              {(m.body || "").replace(/<[^>]+>/g, "").trim() || "—"}
            </div>
            {m.sent_by && <div style={{ fontSize: 9.5, color: C.faded, marginTop: 5 }}>by {m.sent_by}</div>}
          </div>
        );
      })}
      <div ref={bottomRef}/>
    </div>
  </div>;
}

export { EmailThreadTab };
