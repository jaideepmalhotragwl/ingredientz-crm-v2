// src/components/TeamDesk.jsx
// Team Tracker — replaces the old Team Activity tab.
// Built on the real daily_reports schema + the existing "daily-reports" storage bucket.
// AI auto-reads the call / connection / message screenshots (extract-calls + extract-linkedin
// Edge Functions) to pre-fill the numbers — the rep can still edit before saving.

import { useState, useEffect, useMemo } from "react";
import { C } from "../constants.js";
import { Card } from "./ui/Card.jsx";
import { Btn } from "./ui/Btn.jsx";
import { FF } from "./ui/FormFields.jsx";
import { TaskBoard } from "./TaskBoard.jsx";
import {
  TARGETS, NUMERIC, todayISO, num, daysAgo, relTime,
  sumReports, runningXY, colorFor, initials, computeNudges,
} from "./teamMetrics.js";

const sha256 = async (file) => {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const fileToBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

const VIEWS = [
  ["feed", "Feed"], ["summary", "Summary"], ["nudges", "Nudges"],
  ["submit", "Submit report"], ["supervisor", "Supervisor"], ["tasks", "Tasks"],
];

export function TeamDesk({ supabase, users, dailyReports, onSaveReport, tasks, onTaskAdd, onTaskUpdate, onTaskDelete }) {
  const reps = useMemo(() => users.filter((u) => u.active), [users]);
  const [view, setView] = useState("feed");
  const nudges = useMemo(() => computeNudges(dailyReports, reps), [dailyReports, reps]);

  const pill = (active) => ({
    padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 500,
    border: `1px solid ${active ? C.blue : C.border}`, cursor: "pointer",
    background: active ? C.blue : "white", color: active ? "white" : C.muted,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {VIEWS.map(([id, label]) => (
          <button key={id} style={pill(view === id)} onClick={() => setView(id)}>
            {label}{id === "nudges" && nudges.length ? ` (${nudges.length})` : ""}
          </button>
        ))}
      </div>

      {view === "feed"       && <Feed supabase={supabase} reports={dailyReports} reps={reps} />}
      {view === "summary"    && <Summary reports={dailyReports} reps={reps} />}
      {view === "nudges"     && <Nudges nudges={nudges} reps={reps} />}
      {view === "submit"     && <Submit supabase={supabase} reps={reps} dailyReports={dailyReports} onSaveReport={onSaveReport} />}
      {view === "supervisor" && <Supervisor supabase={supabase} />}
      {view === "tasks"      && <TaskBoard tasks={tasks} users={users} onAdd={onTaskAdd} onUpdate={onTaskUpdate} onDelete={onTaskDelete} />}
    </div>
  );
}

/* ---------- shared bits ---------- */
function Avatar({ name, reps, size = 28 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: colorFor(name, reps),
      color: "white", display: "grid", placeItems: "center", fontWeight: 700, fontSize: size * 0.4, flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}
function Thumb({ supabase, path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let on = true;
    if (!path) return;
    supabase.storage.from("daily-reports").createSignedUrl(path, 3600)
      .then(({ data }) => { if (on && data?.signedUrl) setUrl(data.signedUrl); });
    return () => { on = false; };
  }, [path]);
  if (!path) return null;
  return (
    <a href={url || "#"} target="_blank" rel="noreferrer"
       style={{ display: "inline-block", width: 40, height: 40, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
      {url ? <img src={url} alt="proof" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
           : <div style={{ width: "100%", height: "100%", background: C.bg }} />}
    </a>
  );
}
const tickColor = (v, t) => (num(v) >= t ? C.green : C.ink);

/* ---------- FEED ---------- */
function Feed({ supabase, reports, reps }) {
  const sorted = [...reports].sort((a, b) =>
    (b.report_date || "").localeCompare(a.report_date || "") || (b.id || 0) - (a.id || 0));
  const groups = [];
  sorted.forEach((r) => {
    const last = groups[groups.length - 1];
    if (last && last.date === r.report_date) last.rows.push(r);
    else groups.push({ date: r.report_date, rows: [r] });
  });
  if (!reports.length)
    return <Card style={{ padding: 28, textAlign: "center", color: C.muted }}>No reports yet. Submit the first one from the Submit report tab.</Card>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {groups.map((g) => (
        <div key={g.date}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.muted, margin: "4px 2px 10px" }}>
            {relTime(g.date)} · {g.date}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {g.rows.map((r) => (
              <Card key={r.id || r.user_name + r.report_date} style={{ padding: 15 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 11 }}>
                  <Avatar name={r.user_name} reps={reps} />
                  <div style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>{r.user_name}</div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <Thumb supabase={supabase} path={r.call_shot_url} />
                    <Thumb supabase={supabase} path={r.conn_shot_url} />
                    <Thumb supabase={supabase} path={r.msg_shot_url} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
                  <Metric label="Enquiries" value={r.enquiries} target={TARGETS.enquiries} />
                  <Metric label="Conn sent" value={r.linkedin_sent} target={TARGETS.linkedin_sent} sub={`${num(r.linkedin_accepted)} accepted`} />
                  <Metric label="Calls conn" value={r.calls_connected} target={TARGETS.calls_connected} sub={`${num(r.calls_tried)} tried`} />
                  <Metric label="LI messages" value={r.linkedin_messages} />
                  <Metric label="New contacts" value={r.new_contacts} />
                </div>
                {r.notes && <div style={{ marginTop: 10, fontSize: 12.5, color: C.muted, fontStyle: "italic" }}>{`"${r.notes}"`}</div>}
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
function Metric({ label, value, target, sub }) {
  const hit = target != null && num(value) >= target;
  return (
    <div style={{ background: C.bg, borderRadius: 8, padding: "8px 11px" }}>
      <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 18, fontWeight: 700, color: target != null ? tickColor(value, target) : C.ink }}>
        {num(value)}{hit && " ✓"}{target != null && <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}> /{target}</span>}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

/* ---------- SUMMARY ---------- */
function Summary({ reports, reps }) {
  const [period, setPeriod] = useState("week");
  const filtered = useMemo(() => {
    if (period === "day") return reports.filter((r) => r.report_date === todayISO());
    if (period === "week") return reports.filter((r) => daysAgo(r.report_date) <= 7);
    return reports.filter((r) => (r.report_date || "").slice(0, 7) === todayISO().slice(0, 7));
  }, [reports, period]);
  const total = sumReports(filtered);
  const byRep = reps.map((u) => ({ u, ...sumReports(filtered.filter((r) => r.user_name === u.name)) }));

  const seg = (active) => ({ padding: "6px 13px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "none",
    background: active ? C.ink : "transparent", color: active ? "white" : C.muted, cursor: "pointer" });
  const tdBase = { padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${C.border}`, textAlign: "center" };
  const th = { ...tdBase, fontSize: 10, letterSpacing: 1, color: C.muted, textTransform: "uppercase", fontWeight: 700 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 8, padding: 4, background: "white", width: "fit-content" }}>
        {[["day", "Today"], ["week", "Last 7 days"], ["month", "This month"]].map(([id, l]) => (
          <button key={id} style={seg(period === id)} onClick={() => setPeriod(id)}>{l}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Tile label="Enquiries" value={total.enquiries} />
        <Tile label="Connections sent" value={total.linkedin_sent} sub={`${total.linkedin_accepted} accepted`} />
        <Tile label="Calls connected" value={total.calls_connected} sub={`${total.calls_tried} tried`} />
        <Tile label="LI messages" value={total.linkedin_messages} />
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 700, color: C.ink }}>By rep</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Rep</th>
              <th style={th}>Enq</th><th style={th}>Conn sent</th><th style={th}>Accepted</th>
              <th style={th}>Calls</th><th style={th}>Messages</th><th style={th}>New</th>
            </tr></thead>
            <tbody>
              {byRep.map((row) => (
                <tr key={row.u.id}>
                  <td style={{ ...tdBase, textAlign: "left" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={row.u.name} reps={reps} size={22} />
                      <b style={{ color: C.ink }}>{row.u.name.split(" ")[0]}</b>
                    </span>
                  </td>
                  <td style={tdBase}>{row.enquiries}</td>
                  <td style={tdBase}>{row.linkedin_sent}</td>
                  <td style={tdBase}>{row.linkedin_accepted}</td>
                  <td style={tdBase}>{row.calls_connected}</td>
                  <td style={tdBase}>{row.linkedin_messages}</td>
                  <td style={tdBase}>{row.new_contacts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
function Tile({ label, value, sub }) {
  return (
    <Card style={{ padding: 15 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 24, fontWeight: 700, color: C.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

/* ---------- NUDGES ---------- */
function Nudges({ nudges, reps }) {
  if (!nudges.length)
    return <Card style={{ padding: 28, textAlign: "center", color: C.muted }}>Nothing pending — everyone reported and hit targets.</Card>;
  const sev = { high: C.red, med: C.amber };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {nudges.map((n, i) => (
        <Card key={i} style={{ padding: 0, overflow: "hidden", display: "flex" }}>
          <div style={{ width: 4, background: sev[n.severity] || C.amber }} />
          <div style={{ padding: 14, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
              <Avatar name={n.name} reps={reps} size={24} />
              <b style={{ fontSize: 13, color: C.ink }}>{n.name.split(" ")[0]}</b>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: sev[n.severity] || C.amber }}>
                {n.severity === "high" ? "Needs action" : "Watch"}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{n.title}</div>
            <div style={{ fontSize: 13, color: C.muted }}>{n.detail}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------- SUBMIT (with AI screenshot read) ---------- */
function Submit({ supabase, reps, dailyReports, onSaveReport }) {
  const today = todayISO();
  const [rep, setRep] = useState(reps[0]?.name || "");
  const [form, setForm] = useState({});
  const [files, setFiles] = useState({ call: null, conn: null, msg: null });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const existing = useMemo(
    () => dailyReports.find((r) => r.user_name === rep && r.report_date === today) || null,
    [dailyReports, rep, today]);

  useEffect(() => {
    setForm({
      linkedin_sent: existing?.linkedin_sent ?? "", linkedin_accepted: existing?.linkedin_accepted ?? "",
      linkedin_messages: existing?.linkedin_messages ?? "", calls_connected: existing?.calls_connected ?? "",
      calls_tried: existing?.calls_tried ?? "", enquiries: existing?.enquiries ?? "",
      new_contacts: existing?.new_contacts ?? "", notes: existing?.notes ?? "",
    });
    setFiles({ call: null, conn: null, msg: null }); setMsg("");
  }, [rep, existing]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // AI read on pick: call -> calls_connected, conn -> linkedin_sent, msg -> linkedin_messages
  async function onPick(kind, file) {
    setFiles((f) => ({ ...f, [kind]: file }));
    if (!file) return;
    try {
      const imageBase64 = await fileToBase64(file);
      const fn = kind === "call" ? "extract-calls" : "extract-linkedin";
      const { data } = await supabase.functions.invoke(fn, { body: { imageBase64, mediaType: file.type } });
      if (!data) return;
      if (kind === "call" && data.calls != null) setF("calls_connected", data.calls);
      if (kind === "conn" && data.li_conn != null) setF("linkedin_sent", data.li_conn);
      if (kind === "msg" && data.li_msgs != null) setF("linkedin_messages", data.li_msgs);
      setMsg(`Read ${kind} screenshot`);
      setTimeout(() => setMsg(""), 1800);
    } catch (e) { console.error("extract:", e); }
  }

  async function uploadShot(file, kind) {
    if (!file) return null;
    const path = `${rep}/${today}/${kind}-${Date.now()}-${file.name}`.replace(/\s+/g, "_");
    const { error } = await supabase.storage.from("daily-reports").upload(path, file, { upsert: true });
    if (error) { console.error("upload:", error); return null; }
    return path;
  }

  async function submit() {
    if (!rep) { setMsg("Pick a rep first."); return; }
    setSaving(true); setMsg("");
    let callUrl = existing?.call_shot_url || null, connUrl = existing?.conn_shot_url || null, msgUrl = existing?.msg_shot_url || null;
    let callHash = existing?.call_shot_hash || null;
    try {
      if (files.call) { const u = await uploadShot(files.call, "call"); if (u) callUrl = u; callHash = await sha256(files.call); }
      if (files.conn) { const u = await uploadShot(files.conn, "conn"); if (u) connUrl = u; }
      if (files.msg)  { const u = await uploadShot(files.msg,  "msg");  if (u) msgUrl  = u; }
    } catch (e) { console.error(e); }

    const row = {
      report_date: today, user_name: rep,
      linkedin_sent: num(form.linkedin_sent), linkedin_accepted: num(form.linkedin_accepted),
      linkedin_messages: num(form.linkedin_messages), calls_connected: num(form.calls_connected),
      calls_tried: num(form.calls_tried), enquiries: num(form.enquiries), new_contacts: num(form.new_contacts),
      call_shot_url: callUrl, call_shot_hash: callHash, conn_shot_url: connUrl, msg_shot_url: msgUrl,
      notes: form.notes ? form.notes.trim() : null,
    };
    const ok = await onSaveReport(row);
    setSaving(false);
    setMsg(ok === false ? "Could not save — try again." : "Report saved");
    setTimeout(() => setMsg(""), 2500);
  }

  const numFields = [
    ["enquiries", "Enquiries (target 5)"], ["linkedin_sent", "Connections sent (target 25)"],
    ["linkedin_accepted", "Connections accepted"], ["calls_connected", "Calls connected (target 30)"],
    ["calls_tried", "Calls tried"], ["linkedin_messages", "LinkedIn messages sent"], ["new_contacts", "New contacts"],
  ];
  const shotMeta = [
    ["call", "Call history", existing?.call_shot_url],
    ["conn", "Connections sent", existing?.conn_shot_url],
    ["msg", "Messages sent", existing?.msg_shot_url],
  ];

  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>
          Daily Report <span style={{ fontSize: 12, color: C.blue, fontWeight: 400 }}>— {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
        <select value={rep} onChange={(e) => setRep(e.target.value)}
          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 11px", color: C.ink, fontSize: 13 }}>
          {reps.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 14 }}>
        {numFields.map(([k, label]) => (
          <FF key={k} label={label} k={k} value={form[k] ?? ""} onChange={setF} type="number" placeholder="0" />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 14 }}>
        {shotMeta.map(([kind, label, had]) => (
          <div key={kind} style={{ border: `1px dashed ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>
              {label} <span style={{ color: C.blue }}>· AI reads it</span>
            </div>
            <input type="file" accept="image/*" onChange={(e) => onPick(kind, e.target.files?.[0] || null)} style={{ fontSize: 11, color: C.ink }} />
            <div style={{ fontSize: 11, color: files[kind] ? C.green : C.muted, marginTop: 5 }}>
              {files[kind] ? `Selected: ${files[kind].name}` : had ? "already uploaded" : "not uploaded"}
            </div>
          </div>
        ))}
      </div>

      <FF label="Notes (optional)" k="notes" value={form.notes ?? ""} onChange={setF} placeholder="Anything to flag…" />

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
        <Btn label={saving ? "Saving…" : existing ? "Update today's report" : "Submit today's report"} onClick={submit} disabled={saving} />
        {msg && <span style={{ fontSize: 12, fontWeight: 700, color: msg.includes("Could not") ? C.red : C.green }}>{msg}</span>}
      </div>
    </Card>
  );
}

/* ---------- SUPERVISOR ---------- */
function Supervisor({ supabase }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text) {
    const history = messages;
    setMessages((m) => [...m, { role: "user", text }]); setInput(""); setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-supervisor", {
        body: { question: text, history: history.map((m) => ({ role: m.role, content: m.text })) },
      });
      if (error) throw error;
      setMessages((m) => [...m, { role: "assistant", text: data.reply || "(no response)" }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Couldn't reach the supervisor — check the team-supervisor function." }]);
    }
    setLoading(false);
  }
  const prompts = ["Review today and flag the biggest gap.", "Who missed target today?", "Draft questions for the rep furthest behind."];

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", minHeight: 420 }}>
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 10px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Supervisor</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Reviews the team's reports and asks the right questions on your behalf.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 360, margin: "0 auto" }}>
              {prompts.map((p) => (
                <button key={p} onClick={() => send(p)}
                  style={{ textAlign: "left", fontSize: 13, padding: "9px 13px", borderRadius: 8, border: `1px solid ${C.border}`, background: "white", color: C.ink, cursor: "pointer" }}>{p}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "82%", borderRadius: 14, padding: "9px 13px", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap",
                background: m.role === "user" ? C.blue : C.bg, color: m.role === "user" ? "white" : C.ink, border: m.role === "user" ? "none" : `1px solid ${C.border}` }}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && <div style={{ fontSize: 13, color: C.muted }}>Reviewing the team…</div>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the supervisor…"
          onKeyDown={(e) => { if (e.key === "Enter" && input.trim() && !loading) send(input.trim()); }}
          style={{ flex: 1, padding: "9px 13px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13.5, color: C.ink }} />
        <Btn label="Send" onClick={() => input.trim() && !loading && send(input.trim())} disabled={!input.trim() || loading} />
      </div>
    </Card>
  );
}
