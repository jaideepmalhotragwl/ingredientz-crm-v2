import { useState, useEffect, useMemo } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";

/**
 * FollowupsTab — review a run before it goes to customers.
 *
 * The notification email says "open the CRM to review, edit or hold".
 * This is that page. Without it the only way to stop a run is SQL,
 * which is not a control anyone will use at 8am on a Monday.
 */

const FN = "https://eytoryygkxjslfvsqanl.supabase.co/functions/v1";

const STATUS = {
  draft:     ["#8A8D91", "#F0F1F3", "Draft"],
  scheduled: ["#1877F2", "#E7F0FD", "Scheduled"],
  sending:   ["#F5A623", "#FDF3E3", "Sending"],
  complete:  ["#1E7A46", "#E6F4EC", "Complete"],
  held:      ["#E41E3F", "#FFF0F0", "Held"],
  failed:    ["#E41E3F", "#FFF0F0", "Failed"],
};

const SEGMENT = {
  active: ["#1E7A46", "#E6F4EC"],
  quiet:  ["#8a5a08", "#FDF3E3"],
  cold:   ["#E41E3F", "#FFF0F0"],
  agent:  ["#4338CA", "#EEF2FF"],
};

function Pill({ text, color, bg, title }) {
  return <span title={title} style={{
    display: "inline-block", padding: "2px 9px", borderRadius: 99, fontSize: 10,
    fontWeight: 700, whiteSpace: "nowrap", color, background: bg,
    border: `1px solid ${color}44`,
  }}>{text}</span>;
}

function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function FollowupsTab({ onOpenCompany }) {
  const [runs, setRuns]         = useState([]);
  const [settings, setSettings] = useState(null);
  const [preview, setPreview]   = useState(null);
  const [held, setHeld]         = useState([]);
  const [openRun, setOpenRun]   = useState(null);
  const [sends, setSends]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState("");
  const [msg, setMsg]           = useState(null);
  const [editing, setEditing]   = useState(null);
  const [filter, setFilter]     = useState("");

  function flash(text, err = false) {
    setMsg({ text, err });
    setTimeout(() => setMsg(null), 4000);
  }

  async function load() {
    setLoading(true);
    const [r, s, p, h] = await Promise.all([
      supabase.from("followup_runs").select("*").order("period", { ascending: false }).limit(24),
      supabase.from("followup_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("followup_preview_v").select("*").maybeSingle(),
      supabase.from("followup_held_v").select("*"),
    ]);
    setRuns(r.data || []);
    setSettings(s.data || null);
    setPreview(p.data || null);
    setHeld(h.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function openRunDetail(run) {
    setOpenRun(run);
    const { data } = await supabase.from("followup_sends")
      .select("*").eq("run_id", run.id).order("segment").order("to_email");
    setSends(data || []);
  }

  async function call(fn, body, label) {
    setBusy(label);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${FN}/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || supabase.supabaseKey}`,
        },
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || out.skipped || "failed");
      return out;
    } finally {
      setBusy("");
    }
  }

  async function holdRun(run) {
    const reason = window.prompt("Why hold this run?", "Reviewing before send");
    if (reason === null) return;
    await supabase.from("followup_runs").update({
      status: "held", held_reason: reason || "held", held_by: "Jaideep",
      held_at: new Date().toISOString(),
    }).eq("id", run.id);
    flash(`Run ${run.period} held — nothing will send`);
    load(); if (openRun?.id === run.id) setOpenRun(null);
  }

  async function releaseRun(run) {
    // Releasing schedules it for the next window rather than sending
    // immediately, so a mis-click cannot start 158 emails.
    const when = new Date(Date.now() + 60 * 60 * 1000);
    if (!window.confirm(
      `Release ${run.period}?\n\n${run.audience_count} emails will start going out from ` +
      `${fmt(when)}, paced at ${settings ? (60 / settings.wave_gap_minutes) * settings.wave_size : 40}/hour.`
    )) return;
    await supabase.from("followup_runs").update({
      status: "scheduled", scheduled_send_at: when.toISOString(),
      held_reason: null, held_by: null, held_at: null, auto_hold_reason: null,
    }).eq("id", run.id);
    flash(`Run ${run.period} released — starts ${fmt(when)}`);
    load();
  }

  async function buildRun() {
    const period = window.prompt("Period to build (YYYY-MM):",
      new Date().toISOString().slice(0, 7));
    if (!period) return;
    try {
      const out = await call("build-followup-run", { force: true, period }, "build");
      flash(out.skipped ? out.skipped : `Built ${period}: ${out.to_send} to send, ${out.held} held`);
      load();
    } catch (e) { flash(e.message, true); }
  }

  async function testSend(run) {
    const to = window.prompt("Send every email in this run to which address?",
      settings?.notify_email || "");
    if (!to) return;
    if (!window.confirm(
      `${run.audience_count} test emails will arrive at ${to}.\n\n` +
      `No customer receives anything, and the run stays as it is.`
    )) return;
    try {
      const out = await call("send-followup-run",
        { run_id: run.id, test_mode: true, test_to: to }, "test");
      flash(`${out.sent} test emails sent to ${to}`);
    } catch (e) { flash(e.message, true); }
  }

  async function snoozeCompany(send) {
    const months = window.prompt(
      `Skip ${send.to_email} in follow-ups for how many months?`, "3");
    if (!months) return;
    const until = new Date();
    until.setMonth(until.getMonth() + parseInt(months, 10));
    await supabase.from("companies")
      .update({ followup_snooze_until: until.toISOString().slice(0, 10) })
      .eq("id", send.company_id);
    await supabase.from("followup_sends")
      .update({ held_reason: `snoozed ${months} months` }).eq("id", send.id);
    flash(`Snoozed until ${until.toLocaleDateString("en-GB")}`);
    openRunDetail(openRun);
  }

  async function saveEdit() {
    await supabase.from("followup_sends")
      .update({ subject: editing.subject, body: editing.body })
      .eq("id", editing.id);
    setEditing(null);
    flash("Draft updated");
    openRunDetail(openRun);
  }

  const shown = useMemo(() => !filter ? sends
    : sends.filter(s => [s.to_email, s.subject, s.segment, s.rep_name]
        .join(" ").toLowerCase().includes(filter.toLowerCase())),
    [sends, filter]);

  const th = { padding: "9px 13px", textAlign: "left", fontSize: 9, letterSpacing: 1,
               textTransform: "uppercase", color: C.muted, fontWeight: 700,
               borderBottom: `1px solid ${C.border}`, background: C.bg, whiteSpace: "nowrap" };

  if (loading) return <div style={{ padding: 30, color: C.muted, fontSize: 12 }}>Loading…</div>;

  const pace = settings ? (60 / settings.wave_gap_minutes) * settings.wave_size : 0;

  return <div>
    {msg && <div style={{
      background: msg.err ? "#FFF0F0" : "#E6F4EC",
      border: `1px solid ${msg.err ? C.red : "#B7E0C6"}44`,
      color: msg.err ? C.red : "#1E7A46",
      borderRadius: 8, padding: "9px 14px", marginBottom: 12, fontSize: 12.5, fontWeight: 600,
    }}>{msg.text}</div>}

    {/* ── Next run at a glance ─────────────────────────────── */}
    <Card style={{ marginBottom: 14 }}>
      <div style={{ padding: "14px 18px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase",
                        color: C.muted, fontWeight: 700 }}>If a run were built now</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 3 }}>
            {preview?.would_send ?? "—"} <span style={{ fontSize: 13, color: C.muted, fontWeight: 400 }}>
              emails · {preview?.held ?? 0} held back</span>
          </div>
          <div style={{ fontSize: 11, color: C.faded, marginTop: 3 }}>
            {preview?.seg_active ?? 0} active · {preview?.seg_quiet ?? 0} quiet ·
            {" "}{preview?.seg_cold ?? 0} cold · {preview?.seg_agents ?? 0} agent rollups
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            {settings?.enabled
              ? <>Sending {settings.wave_size} every {settings.wave_gap_minutes} min
                  · ~{pace}/hour · {settings.send_from_hour}:00–{settings.send_to_hour}:00 UTC</>
              : <span style={{ color: C.red, fontWeight: 700 }}>Follow-ups are switched OFF</span>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
            <Btn label={busy === "build" ? "Building…" : "+ Build a run"} onClick={buildRun} size="sm" disabled={!!busy}/>
            <Btn label={settings?.enabled ? "Switch off" : "Switch on"} variant="ghost" size="sm"
              onClick={async () => {
                await supabase.from("followup_settings")
                  .update({ enabled: !settings.enabled }).eq("id", 1);
                flash(settings.enabled ? "Follow-ups switched off" : "Follow-ups switched on");
                load();
              }}/>
          </div>
        </div>
      </div>
      {held.length > 0 && <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.border}`,
                                        display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11 }}>
        <span style={{ color: C.muted, fontWeight: 700 }}>Held back:</span>
        {held.map(h => <span key={h.held_reason} style={{ color: C.muted }}>
          {h.held_reason} <b style={{ color: C.ink }}>{h.companies}</b>
        </span>)}
      </div>}
    </Card>

    {/* ── Runs ─────────────────────────────────────────────── */}
    <Card style={{ overflow: "hidden", marginBottom: 14 }}>
      <div style={{ padding: "13px 18px", borderBottom: `1px solid ${C.border}`,
                    fontSize: 16, fontWeight: 700 }}>
        Runs <span style={{ fontSize: 12, color: C.blue, fontWeight: 400 }}>{runs.length}</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>
          {["Period","Status","Audience","Held","Sent","Scheduled",""].map(h =>
            <th key={h} style={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {runs.map((r, i) => {
            const [c, b, l] = STATUS[r.status] || STATUS.draft;
            return <tr key={r.id} style={{ background: i % 2 === 0 ? C.bg : "transparent" }}>
              <td style={{ padding: "10px 13px", fontWeight: 600 }}>{r.period}</td>
              <td style={{ padding: "10px 13px" }}>
                <Pill text={l} color={c} bg={b} title={r.held_reason || r.auto_hold_reason || ""}/>
                {r.auto_hold_reason && <div style={{ fontSize: 9, color: C.red, marginTop: 3 }}>
                  auto: {r.auto_hold_reason.replace("_", " ")}</div>}
              </td>
              <td style={{ padding: "10px 13px", fontWeight: 700 }}>{r.audience_count}</td>
              <td style={{ padding: "10px 13px", color: C.muted }}>{r.held_count}</td>
              <td style={{ padding: "10px 13px", color: C.muted }}>{r.sent_count || "—"}</td>
              <td style={{ padding: "10px 13px", color: C.muted, fontSize: 11 }}>{fmt(r.scheduled_send_at)}</td>
              <td style={{ padding: "10px 13px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Btn label="Review" onClick={() => openRunDetail(r)} size="sm" variant="ghost"/>
                <Btn label="Test" onClick={() => testSend(r)} size="sm" variant="ghost" disabled={!!busy}/>
                {["scheduled","draft"].includes(r.status) &&
                  <Btn label="Hold" onClick={() => holdRun(r)} size="sm" variant="danger"/>}
                {r.status === "held" &&
                  <Btn label="Release" onClick={() => releaseRun(r)} size="sm"/>}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
      {runs.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 12 }}>
        No runs yet. Build one to see what would go out.
      </div>}
    </Card>

    {/* ── The drafts ───────────────────────────────────────── */}
    {openRun && <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "13px 18px", borderBottom: `1px solid ${C.border}`,
                    display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          {openRun.period} <span style={{ fontSize: 12, color: C.blue, fontWeight: 400 }}>
            {shown.length} of {sends.length}</span>
        </div>
        <input value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Search recipient, subject, rep…"
          style={{ marginLeft: "auto", background: C.bg, border: `1px solid ${C.border}`,
                   borderRadius: 7, padding: "6px 12px", fontSize: 12, outline: "none", width: 220 }}/>
        <Btn label="Close" onClick={() => setOpenRun(null)} size="sm" variant="ghost"/>
      </div>
      <div style={{ maxHeight: 520, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr>{["To","Segment","Subject","Rep","Enq","Sent",""].map(h =>
              <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((s, i) => {
              const [sc, sb] = SEGMENT[s.segment] || SEGMENT.active;
              return <tr key={s.id} style={{
                background: s.held_reason ? "#FFF7F7" : (i % 2 === 0 ? C.bg : "transparent") }}>
                <td style={{ padding: "9px 13px", fontFamily: "monospace", fontSize: 11 }}>
                  {s.to_email}
                  {s.held_reason && <div style={{ fontSize: 9.5, color: C.red, marginTop: 2 }}>
                    {s.held_reason}</div>}
                </td>
                <td style={{ padding: "9px 13px" }}><Pill text={s.segment} color={sc} bg={sb}/></td>
                <td style={{ padding: "9px 13px", maxWidth: 260, overflow: "hidden",
                             textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.subject}</td>
                <td style={{ padding: "9px 13px", color: C.muted }}>{s.rep_name || "—"}</td>
                <td style={{ padding: "9px 13px", color: C.muted }}>{s.enquiry_count}</td>
                <td style={{ padding: "9px 13px", fontSize: 11, color: s.sent_at ? "#1E7A46" : C.faded }}>
                  {s.sent_at ? fmt(s.sent_at) : "—"}
                </td>
                <td style={{ padding: "9px 13px", display: "flex", gap: 5 }}>
                  <Btn label="Read" onClick={() => setEditing({ ...s })} size="sm" variant="ghost"/>
                  {!s.sent_at && !s.held_reason && s.company_id &&
                    <Btn label="Skip" onClick={() => snoozeCompany(s)} size="sm" variant="ghost"/>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </Card>}

    {/* ── Read / edit one draft ────────────────────────────── */}
    {editing && <Modal title={`To ${editing.to_email}`} onClose={() => setEditing(null)} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: C.muted,
                          textTransform: "uppercase", display: "block", marginBottom: 4 }}>Subject</label>
          <input value={editing.subject || ""} disabled={!!editing.sent_at}
            onChange={e => setEditing(x => ({ ...x, subject: e.target.value }))}
            style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7,
                     padding: "8px 11px", fontSize: 13, outline: "none",
                     background: editing.sent_at ? C.bg : C.white }}/>
        </div>
        <div>
          <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: C.muted,
                          textTransform: "uppercase", display: "block", marginBottom: 4 }}>Message</label>
          <textarea value={editing.body || ""} disabled={!!editing.sent_at}
            onChange={e => setEditing(x => ({ ...x, body: e.target.value }))}
            style={{ width: "100%", minHeight: 260, border: `1px solid ${C.border}`,
                     borderRadius: 7, padding: "10px 12px", fontSize: 13, lineHeight: 1.6,
                     outline: "none", resize: "vertical", fontFamily: "Arial,sans-serif",
                     background: editing.sent_at ? C.bg : C.white }}/>
        </div>
        <div style={{ fontSize: 10.5, color: C.muted }}>
          {editing.sent_at
            ? "Already sent — read only."
            : "The unsubscribe footer and address are added when it sends. Editing here changes only this one email."}
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          {!editing.sent_at && <Btn label="Save" onClick={saveEdit}/>}
          <Btn label="Close" onClick={() => setEditing(null)} variant="ghost"/>
        </div>
      </div>
    </Modal>}
  </div>;
}

export { FollowupsTab };
