import { useState, useEffect, useMemo } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Card } from "./ui/Card.jsx";
import { Btn } from "./ui/Btn.jsx";
import { FF } from "./ui/FormFields.jsx";
import { TaskBoard } from "./TaskBoard.jsx";

// Daily targets
const TARGETS = { linkedin_sent: 25, calls_connected: 30, enquiries: 5 };
const todayStr = () => new Date().toISOString().slice(0, 10);
const num = v => Math.max(0, Math.round(Number(v) || 0));

async function sha256(file) {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function TeamActivity({ users, tasks, dailyReports, onTaskAdd, onTaskUpdate, onTaskDelete, onSaveReport }) {
  const reps = users.filter(u => u.active);
  const today = todayStr();
  const [rep, setRep] = useState(reps[0]?.name || "");
  const [form, setForm] = useState({});
  const [callFile, setCallFile] = useState(null);
  const [connFile, setConnFile] = useState(null);
  const [msgFile, setMsgFile]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const existing = useMemo(
    () => dailyReports.find(r => r.user_name === rep && r.report_date === today) || null,
    [dailyReports, rep, today]
  );

  // Load the selected rep's existing entry for today (so re-submitting edits, not duplicates)
  useEffect(() => {
    setForm({
      linkedin_sent:     existing?.linkedin_sent     ?? "",
      linkedin_accepted: existing?.linkedin_accepted ?? "",
      linkedin_messages: existing?.linkedin_messages ?? "",
      calls_connected:   existing?.calls_connected   ?? "",
      calls_tried:       existing?.calls_tried       ?? "",
      enquiries:         existing?.enquiries         ?? "",
      new_contacts:      existing?.new_contacts      ?? "",
      notes:             existing?.notes             ?? "",
    });
    setCallFile(null); setConnFile(null); setMsgFile(null); setMsg("");
  }, [rep, existing]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function uploadShot(file, kind) {
    if (!file) return null;
    const path = `${rep}/${today}/${kind}-${Date.now()}-${file.name}`.replace(/\s+/g, "_");
    try {
      const { error } = await supabase.storage.from("daily-reports").upload(path, file, { upsert: true });
      if (error) { console.error("screenshot upload failed:", error); return null; }
      return path;
    } catch (e) { console.error("screenshot upload error:", e); return null; }
  }

  async function submit() {
    if (!rep) { setMsg("Pick a rep first."); return; }
    setSaving(true); setMsg("");
    let callUrl = existing?.call_shot_url || null;
    let connUrl = existing?.conn_shot_url || null;
    let msgUrl  = existing?.msg_shot_url  || null;
    let callHash = existing?.call_shot_hash || null;
    try {
      if (callFile) { const u = await uploadShot(callFile, "call"); if (u) callUrl = u; callHash = await sha256(callFile); }
      if (connFile) { const u = await uploadShot(connFile, "conn"); if (u) connUrl = u; }
      if (msgFile)  { const u = await uploadShot(msgFile,  "msg");  if (u) msgUrl  = u; }
    } catch (e) { console.error("upload step error:", e); }

    const row = {
      report_date: today,
      user_name: rep,
      linkedin_sent:     num(form.linkedin_sent),
      linkedin_accepted: num(form.linkedin_accepted),
      linkedin_messages: num(form.linkedin_messages),
      calls_connected:   num(form.calls_connected),
      calls_tried:       num(form.calls_tried),
      enquiries:         num(form.enquiries),
      new_contacts:      num(form.new_contacts),
      call_shot_url: callUrl, call_shot_hash: callHash,
      conn_shot_url: connUrl, msg_shot_url: msgUrl,
      notes: form.notes ? form.notes.trim() : null,
    };
    const ok = await onSaveReport(row);
    setSaving(false);
    setMsg(ok === false ? "⚠ Could not save — try again." : "✓ Report saved");
    setTimeout(() => setMsg(""), 2500);
  }

  // ── Rollup helpers ───────────────────────────────────────────────────────────
  const todays = dailyReports.filter(r => r.report_date === today);
  const hashCount = {};
  todays.forEach(r => { if (r.call_shot_hash) hashCount[r.call_shot_hash] = (hashCount[r.call_shot_hash] || 0) + 1; });

  function runningXY(name) {
    let x = 0, sent = 0;
    dailyReports.filter(r => r.user_name === name).forEach(r => {
      x += (r.linkedin_accepted || 0); sent += (r.linkedin_sent || 0);
    });
    return { x, y: Math.max(0, sent - x) };
  }

  const met = (v, t) => num(v) >= t;
  const tdBase = { padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${C.border}` };
  const th = { ...tdBase, fontSize: 10, letterSpacing: 1, color: C.muted, textTransform: "uppercase", fontWeight: 700, textAlign: "left" };
  const dot = ok => <span style={{ color: ok ? C.green : C.muted, fontSize: 13 }}>{ok ? "✓" : "–"}</span>;

  // ── Field config for the entry form ───────────────────────────────────────────
  const numFields = [
    ["linkedin_sent",     "Connections sent (target 25)"],
    ["linkedin_accepted", "Connections accepted today"],
    ["calls_connected",   "Calls connected (target 30)"],
    ["calls_tried",       "Calls tried"],
    ["enquiries",         "Enquiries (target 5)"],
    ["linkedin_messages", "LinkedIn messages sent"],
    ["new_contacts",      "New contacts added"],
  ];

  const liveXY = (() => {
    const base = existing ? runningXY(rep) : runningXY(rep);
    // show projected totals including the unsaved form values, minus the existing row's contribution
    const baseX = base.x - (existing?.linkedin_accepted || 0);
    const baseSent = (base.x + base.y) - (existing?.linkedin_sent || 0);
    const x = baseX + num(form.linkedin_accepted);
    const y = Math.max(0, (baseSent + num(form.linkedin_sent)) - x);
    return { x, y };
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Daily report entry ── */}
      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>Daily Report <span style={{ fontSize: 12, color: C.blue, fontWeight: 400 }}>— {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></div>
          <select value={rep} onChange={e => setRep(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 11px", color: C.ink, fontSize: 13 }}>
            {reps.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 14 }}>
          {numFields.map(([k, label]) => (
            <FF key={k} label={label} k={k} value={form[k] ?? ""} onChange={setF} type="number" placeholder="0" />
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 14 }}>
          {[["Call history", callFile, setCallFile], ["Connections count", connFile, setConnFile], ["Messages sent", msgFile, setMsgFile]].map(([label, file, setFile]) => (
            <div key={label} style={{ border: `1px dashed ${C.border}`, borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
              <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 11, color: C.ink }} />
              <div style={{ fontSize: 11, color: file ? C.green : C.muted, marginTop: 5 }}>
                {file ? `✓ ${file.name}` : (label === "Call history" && existing?.call_shot_url) || (label === "Connections count" && existing?.conn_shot_url) || (label === "Messages sent" && existing?.msg_shot_url) ? "already uploaded" : "not uploaded"}
              </div>
            </div>
          ))}
        </div>

        <FF label="Notes (optional)" k="notes" value={form.notes ?? ""} onChange={setF} placeholder="Anything to flag…" />

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
          <Btn label={saving ? "Saving…" : existing ? "Update today's report" : "Submit today's report"} onClick={submit} disabled={saving} />
          <span style={{ fontSize: 12, color: C.muted }}>After saving: <b style={{ color: C.ink }}>X {liveXY.x}</b> accepted · <b style={{ color: C.ink }}>Y {liveXY.y}</b> sent &amp; pending</span>
          {msg && <span style={{ fontSize: 12, fontWeight: 700, color: msg.startsWith("✓") ? C.green : C.red }}>{msg}</span>}
        </div>
      </Card>

      {/* ── Team rollup (admin review) ── */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "13px 18px", borderBottom: `1px solid ${C.border}`, fontSize: 18, fontWeight: 700, color: C.ink }}>
          Team Activity — Today <span style={{ fontSize: 12, color: C.blue, fontWeight: 400 }}>{todays.length} of {reps.length} reported</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>Rep</th>
                <th style={{ ...th, textAlign: "center" }}>Conn (sent·acc)</th>
                <th style={{ ...th, textAlign: "center" }}>X / Y</th>
                <th style={{ ...th, textAlign: "center" }}>Calls (conn·tried)/30</th>
                <th style={{ ...th, textAlign: "center" }}>Enq /5</th>
                <th style={{ ...th, textAlign: "center" }}>Msgs</th>
                <th style={{ ...th, textAlign: "center" }}>New</th>
                <th style={{ ...th, textAlign: "center" }}>Shots</th>
                <th style={{ ...th, textAlign: "center" }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {reps.map(u => {
                const r = todays.find(x => x.user_name === u.name);
                const xy = runningXY(u.name);
                const dup = r?.call_shot_hash && hashCount[r.call_shot_hash] > 1;
                return (
                  <tr key={u.id}>
                    <td style={{ ...tdBase, fontWeight: 600, color: C.ink }}>{u.name.split(" ")[0]}</td>
                    {r ? <>
                      <td style={{ ...tdBase, textAlign: "center", color: met(r.linkedin_sent, TARGETS.linkedin_sent) ? C.green : C.ink }}>
                        {r.linkedin_sent} · {r.linkedin_accepted} {met(r.linkedin_sent, TARGETS.linkedin_sent) && "✓"}
                      </td>
                      <td style={{ ...tdBase, textAlign: "center", color: C.muted }}>{xy.x} / {xy.y}</td>
                      <td style={{ ...tdBase, textAlign: "center", color: met(r.calls_connected, TARGETS.calls_connected) ? C.green : C.ink }}>
                        {r.calls_connected} · {r.calls_tried} {met(r.calls_connected, TARGETS.calls_connected) && "✓"}
                      </td>
                      <td style={{ ...tdBase, textAlign: "center", color: met(r.enquiries, TARGETS.enquiries) ? C.green : C.ink }}>
                        {r.enquiries} {met(r.enquiries, TARGETS.enquiries) && "✓"}
                      </td>
                      <td style={{ ...tdBase, textAlign: "center" }}>{r.linkedin_messages}</td>
                      <td style={{ ...tdBase, textAlign: "center" }}>{r.new_contacts}</td>
                      <td style={{ ...tdBase, textAlign: "center" }}>{dot(!!r.call_shot_url)} {dot(!!r.conn_shot_url)} {dot(!!r.msg_shot_url)}</td>
                      <td style={{ ...tdBase, textAlign: "center" }}>{dup ? <span style={{ color: C.amber, fontWeight: 700, fontSize: 11 }}>⚠ dup?</span> : "—"}</td>
                    </> : <>
                      <td colSpan={7} style={{ ...tdBase, textAlign: "center", color: C.muted, fontStyle: "italic" }}>No report yet today</td>
                      <td style={{ ...tdBase }}></td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Existing task board, reused as-is ── */}
      <TaskBoard tasks={tasks} users={users} onAdd={onTaskAdd} onUpdate={onTaskUpdate} onDelete={onTaskDelete} />
    </div>
  );
}

export { TeamActivity };
