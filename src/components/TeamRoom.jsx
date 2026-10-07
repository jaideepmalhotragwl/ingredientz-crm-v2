// src/components/TeamRoom.jsx
// Team Room — one place where the team talks, assigns, and files its own MIS.
//
// Three rules the code enforces:
//   1. Identity is sticky. You pick yourself once per browser; every message,
//      task and report then carries your name. No "post as anyone" dropdown.
//   2. A report belongs to a SHIFT, not to a clock date. The team works US
//      hours from India and signs off at 04:00–05:00 IST. The shift starts the
//      first time you open the room that day and ends when you press "End my day".
//   3. Computed numbers are never stored. shift_mis(user, from, to) derives them
//      live from the CRM, so there is exactly one source of truth. Only the
//      numbers a human must type (LinkedIn, calls) live in daily_reports.

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { C } from "../constants.js";
import { Card } from "./ui/Card.jsx";
import { Btn } from "./ui/Btn.jsx";
import { colorFor, initials } from "./teamMetrics.js";

const LS_KEY   = "teamroom_user_id";
const SEEN_KEY = "teamroom_seen_at";

const lsGet = (k, d = "") => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

// Marking the room read is broadcast on the window so the sidebar badge, which
// lives in a different component tree, clears at the same moment.
const markSeen = () => {
  lsSet(SEEN_KEY, new Date().toISOString());
  window.dispatchEvent(new Event("teamroom:seen"));
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (n) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hhmm = (ts) =>
  ts ? new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
const dayLabel = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const dur = (a, b) => {
  const ms = new Date(b || Date.now()) - new Date(a);
  if (!Number.isFinite(ms) || ms < 60000) return "—";   // a shift under a minute is a bad record
  const h = Math.floor(ms / 3.6e6);
  const m = Math.round((ms - h * 3.6e6) / 6e4);
  return `${h}h ${m}m`;
};
const tomorrowISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
// Public half of the VAPID pair. Safe in client code — it only identifies the
// sender to the push service; the private key lives in Supabase secrets.
const VAPID_PUBLIC =
  "BOd_4nr_8XkXtI-nZ2bvfo0q5bVCnGZIFifKPt18wphXuqS3Gdkl8RKUcWXLoKfEXlMcdnbJukUX77UJBDfRh58";

const urlB64ToU8 = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

// Registers THIS device for push. One row per device, so a laptop and a phone
// both ring. Safe to call repeatedly — the endpoint is unique.
async function registerPush(supabase, userName) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToU8(VAPID_PUBLIC),
      }));
    const j = sub.toJSON();
    await supabase.from("push_subscriptions").upsert({
      user_name: userName,
      endpoint: j.endpoint,
      p256dh: j.keys?.p256dh,
      auth: j.keys?.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    }, { onConflict: "endpoint" });
    return "granted";
  } catch (e) {
    console.error("push subscribe failed", e);
    return "failed";
  }
}

// Who, if anyone, this message is addressed to. Used both to offer a task and
// to decide whether anybody's phone should ring.
function findMention(text, users) {
  const m = String(text || "").match(/@([A-Za-z][A-Za-z.'-]*)/);
  if (!m) return null;
  const needle = m[1].toLowerCase();
  return (
    users.find((u) => u.active !== false && u.name?.toLowerCase().split(/\s+/)[0] === needle) ||
    users.find((u) => u.active !== false && u.name?.toLowerCase().startsWith(needle)) ||
    null
  );
}

const isOpen = (t) => t.status !== "Done";
const isOverdue = (t) => isOpen(t) && t.due_date && t.due_date < todayISO();

// Overdue first, then soonest due, then undated, then newest.
const byUrgency = (a, b) => {
  const oa = isOverdue(a), ob = isOverdue(b);
  if (oa !== ob) return oa ? -1 : 1;
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return (b.id || 0) - (a.id || 0);
};

function useIsNarrow(px = 760) {
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < px : false
  );
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < px);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [px]);
  return narrow;
}

/* ══════════════════════════════════════════════════════════════════════════ */

export function TeamRoom({ supabase, users, tasks = [], onTaskAdd, onTaskUpdate }) {
  const [meId, setMeId] = useState(() => {
    try { return localStorage.getItem(LS_KEY) || ""; } catch { return ""; }
  });
  const me = useMemo(
    () => users.find((u) => String(u.id) === String(meId)) || null,
    [users, meId]
  );

  const pickMe = (id) => {
    try { localStorage.setItem(LS_KEY, String(id)); } catch { /* private mode */ }
    setMeId(String(id));
  };

  if (!me) return <IdentityGate users={users} onPick={pickMe} />;

  return (
    <Room
      supabase={supabase}
      users={users}
      me={me}
      tasks={tasks}
      onTaskAdd={onTaskAdd}
      onTaskUpdate={onTaskUpdate}
      onSwitchUser={() => { try { localStorage.removeItem(LS_KEY); } catch {} setMeId(""); }}
    />
  );
}

/* ─────────────────────────── who are you ─────────────────────────── */

function IdentityGate({ users, onPick }) {
  const active = users.filter((u) => u.active !== false);
  return (
    <Card style={{ padding: 28, maxWidth: 440, margin: "40px auto" }}>
      <div style={{ fontSize: 19, fontWeight: 700, color: C.ink, marginBottom: 5 }}>Who are you</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.5 }}>
        Pick yourself once. This browser will remember you, and everything you post,
        assign or report will be filed under your name.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {active.map((u) => (
          <button
            key={u.id}
            onClick={() => onPick(u.id)}
            style={{
              display: "flex", alignItems: "center", gap: 11, textAlign: "left",
              padding: "10px 13px", borderRadius: 9, border: `1px solid ${C.border}`,
              background: "white", cursor: "pointer",
            }}
          >
            <Avatar name={u.name} users={users} />
            <span>
              <b style={{ color: C.ink, fontSize: 14 }}>{u.name}</b>
              {u.role && <span style={{ color: C.muted, fontSize: 12, marginLeft: 7 }}>{u.role}</span>}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function Avatar({ name, users, size = 30 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: colorFor(name, users), color: "white",
      display: "grid", placeItems: "center", fontWeight: 700, fontSize: size * 0.38,
    }}>
      {initials(name)}
    </div>
  );
}

/* ─────────────────────────────── the room ─────────────────────────────── */

function Room({ supabase, users, me, tasks, onTaskAdd, onTaskUpdate, onSwitchUser }) {
  const [messages, setMessages] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const bottomRef = useRef(null);
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const [m, s, r] = await Promise.all([
      supabase.from("room_messages").select("*").gte("created_at", since).order("created_at", { ascending: true }),
      supabase.from("shifts").select("*").gte("report_date", since.slice(0, 10)),
      supabase.from("daily_reports").select("*").gte("report_date", since.slice(0, 10)),
    ]);
    setMessages(m.data || []);
    setShifts(s.data || []);
    setReports(r.data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Live messages
  useEffect(() => {
    const ch = supabase
      .channel("team-room")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages" }, (p) => {
        setMessages((prev) => (prev.some((x) => x.id === p.new.id) ? prev : [...prev, p.new]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  // Having the room open IS reading it. Mark seen on arrival and on every new
  // message, but only while the tab is actually in front.
  useEffect(() => {
    if (loading) return;
    if (document.visibilityState === "visible") markSeen();
    const on = () => { if (document.visibilityState === "visible") markSeen(); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [loading, messages.length]);

  const myShift = useMemo(
    () => shifts.find((s) => s.user_name === me.name && !s.ended_at) || null,
    [shifts, me.name]
  );

  // Opening the room starts your shift — nobody has to remember to clock in.
  //
  // INSERT, never upsert. An upsert on (user_name, report_date) rewrites
  // started_at every time the component remounts, so a shift that has already
  // been filed gets a start time LATER than its end — a zero-length window,
  // and every computed figure comes out as 0. started_at is written once a day
  // and never touched again.
  useEffect(() => {
    if (loading || startedRef.current) return;
    startedRef.current = true;
    const today = todayISO();
    if (shifts.some((s) => s.user_name === me.name && s.report_date === today)) return;
    (async () => {
      const { data, error } = await supabase
        .from("shifts")
        .insert({ user_name: me.name, report_date: today, started_at: new Date().toISOString() })
        .select().single();
      if (data) { setShifts((p) => [data, ...p]); return; }
      if (error) {
        // Another tab won the race — take whatever is already there.
        const { data: existing } = await supabase.from("shifts").select("*")
          .eq("user_name", me.name).eq("report_date", today).single();
        if (existing) setShifts((p) => [existing, ...p.filter((x) => x.id !== existing.id)]);
      }
    })();
  }, [loading, shifts, supabase, me.name]);

  async function post(row) {
    const { data } = await supabase.from("room_messages").insert(row).select().single();
    if (data) setMessages((p) => (p.some((x) => x.id === data.id) ? p : [...p, data]));
    return data;
  }

  // One message, one row in the feed. When a message also creates a task the
  // SAME row carries it — printing the text twice made the room unreadable.
  // Push goes out ONLY for a mention or an assignment. Ordinary chat never
  // rings a phone — that is the difference between a tool people keep and one
  // they mute.
  async function ping(toName, title, bodyText) {
    if (!toName || toName === me.name) return;
    try {
      await supabase.functions.invoke("notify-push", {
        body: { to: [toName], title, body: bodyText.slice(0, 140), url: "/?view=room" },
      });
    } catch (e) { console.error("notify-push", e); }
  }

  async function sendMessage(body, assignTo, dueDate) {
    const text = body.trim();
    if (!text) return;
    const mention = findMention(text, users);
    if (!assignTo) {
      await post({ user_name: me.name, body: text, kind: "chat" });
      if (mention) ping(mention.name, `${me.name} mentioned you`, text);
      return;
    }
    const t = await onTaskAdd?.({
      task: text, owner: assignTo.name, assigned_by: me.name,
      priority: "Medium", status: "Not Started",
      due_date: dueDate || tomorrowISO(), source: "team-room",
    });
    await post({
      user_name: me.name, body: text,
      kind: t?.id ? "task" : "chat",
      ref_table: t?.id ? "tasks" : null,
      ref_id: t?.id ?? null,
    });
    ping(assignTo.name, `${me.name} assigned you a task`, text);
  }

  async function endDay(manual) {
    if (!myShift) return;
    setClosing(true);
    const endedAt = new Date().toISOString();
    try {
      await supabase.from("daily_reports").upsert({
        report_date: myShift.report_date, user_name: me.name,
        linkedin_messages: num(manual.linkedin_messages),
        linkedin_sent: num(manual.linkedin_sent),
        calls_connected: num(manual.calls_connected),
        notes: manual.notes?.trim() || null,
      }, { onConflict: "user_name,report_date" });

      const { data: shift } = await supabase.from("shifts")
        .update({ ended_at: endedAt, confirmed: true })
        .eq("id", myShift.id).select().single();
      if (shift) setShifts((p) => p.map((s) => (s.id === shift.id ? shift : s)));

      await post({ user_name: me.name, kind: "mis", ref_table: "shifts", ref_id: myShift.id });
      await load();
    } finally {
      setClosing(false);
    }
  }

  const byId = (id) => tasks.find((t) => String(t.id) === String(id));

  const mine = tasks.filter((t) => t.owner === me.name && isOpen(t));
  const myOverdue = mine.filter(isOverdue).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Avatar name={me.name} users={users} size={26} />
        <span style={{ fontSize: 13, color: C.ink }}>
          You are <b>{me.name}</b>
        </span>
        <button onClick={onSwitchUser}
          style={{ background: "none", border: "none", color: C.blue, fontSize: 12, cursor: "pointer", padding: 0 }}>
          not you?
        </button>

        <AlertToggle supabase={supabase} me={me} />

        <button
          onClick={() => setDrawer(true)}
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7,
            background: "white", border: `1px solid ${myOverdue ? C.red : C.border}`,
            borderRadius: 8, padding: "5px 11px", cursor: "pointer",
            fontSize: 12.5, fontWeight: 600, color: C.ink,
          }}>
          My tasks
          <span style={{
            minWidth: 19, textAlign: "center", borderRadius: 10, padding: "1px 6px",
            fontSize: 11, fontWeight: 700, color: "white",
            background: myOverdue ? C.red : mine.length ? C.blue : C.muted,
          }}>
            {mine.length}
          </span>
        </button>
      </div>

      <div style={{ fontSize: 12, color: C.muted, marginTop: -8 }}>
        {myShift
          ? `Shift started ${hhmm(myShift.started_at)} · ${dur(myShift.started_at)} ago`
          : "No open shift"}
      </div>

      {drawer && (
        <TaskDrawer tasks={tasks} users={users} me={me}
                    onTaskUpdate={onTaskUpdate} onClose={() => setDrawer(false)} />
      )}

      {loading && <Card style={{ padding: 24, textAlign: "center", color: C.muted }}>Loading the room…</Card>}

      {!loading && (
        <>
          <MyBrief supabase={supabase} me={me} />
          <Feed
            supabase={supabase} messages={messages} users={users} me={me}
            shifts={shifts} reports={reports} taskById={byId} onTaskUpdate={onTaskUpdate}
          />
          <div ref={bottomRef} />
          {myShift
            ? <EndOfDay supabase={supabase} me={me} shift={myShift} onSubmit={endDay} closing={closing} />
            : <Card style={{ padding: 14, fontSize: 13, color: C.muted }}>
                Today's shift is filed. Reopen the room tomorrow and a new one starts.
              </Card>}
          <Composer users={users} me={me} onSend={sendMessage} />
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────── feed ──────────────────────────────── */

function Feed({ supabase, messages, users, me, shifts, reports, taskById, onTaskUpdate }) {
  if (!messages.length)
    return (
      <Card style={{ padding: 26, textAlign: "center", color: C.muted, fontSize: 13 }}>
        Nothing here yet. Say something, or assign someone a task with <b>@name</b>.
      </Card>
    );

  const groups = [];
  messages.forEach((m) => {
    const d = (m.created_at || "").slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === d) last.rows.push(m);
    else groups.push({ day: d, rows: [m] });
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {groups.map((g) => (
        <div key={g.day} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase",
                        color: C.muted, textAlign: "center" }}>
            {g.day === todayISO() ? "Today" : dayLabel(g.day)}
          </div>
          {g.rows.map((m) => {
            if (m.kind === "mis") {
              const shift = shifts.find((s) => String(s.id) === String(m.ref_id));
              const report = reports.find(
                (r) => r.user_name === m.user_name && r.report_date === shift?.report_date
              );
              return <MisCard key={m.id} supabase={supabase} users={users}
                              shift={shift} report={report} who={m.user_name} />;
            }
            return (
              <MsgRow key={m.id} msg={m} users={users} me={me}
                      task={m.kind === "task" ? taskById(m.ref_id) : null}
                      onTaskUpdate={onTaskUpdate} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// One row per message. A message that carries a task grows a thin bar under the
// text — it is never reprinted as a second card.
function MsgRow({ msg, users, me, task, onTaskUpdate }) {
  const done = task?.status === "Done";
  const overdue = task && !done && task.due_date && task.due_date < todayISO();
  const mine = task?.owner === me.name;

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Avatar name={msg.user_name} users={users} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <b style={{ fontSize: 13.5, color: C.ink }}>{msg.user_name}</b>
          <span style={{ fontSize: 11, color: C.muted }}>{hhmm(msg.created_at)}</span>
        </div>
        <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                      textDecoration: done ? "line-through" : "none",
                      opacity: done ? 0.6 : 1 }}>
          {msg.body}
        </div>

        {task && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginTop: 5,
                        paddingLeft: 9, borderLeft: `3px solid ${done ? C.green : overdue ? C.red : C.blue}` }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
                           color: done ? C.green : overdue ? C.red : C.blue }}>
              {done ? "done" : overdue ? "overdue" : "task"}
            </span>
            <span style={{ fontSize: 11.5, color: C.muted }}>
              {task.owner}{task.due_date ? ` · due ${dayLabel(task.due_date)}` : ""}
            </span>
            {mine && !done && (
              <button
                onClick={() => onTaskUpdate?.(task.id, { status: "Done", completed_at: new Date().toISOString() })}
                style={{ fontSize: 11, fontWeight: 600, color: C.green, background: "none",
                         border: `1px solid ${C.green}`, borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>
                Mark done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────── what's waiting for you ───────────────────── */
// Private to the person reading it. Posting seven of these into the feed every
// morning would bury the conversation, and nobody needs to see each other's
// backlog — the MIS cards already handle transparency.
//
// Counted, not generated. These are facts in the database; an LLM here would
// only add latency and a chance of inventing a number.

function MyBrief({ supabase, me }) {
  const [w, setW] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let on = true;
    supabase.rpc("my_open_work", { p_u: me.name }).then(({ data, error }) => {
      if (on && !error) setW(Array.isArray(data) ? data[0] : data);
    });
    return () => { on = false; };
  }, [supabase, me.name]);

  if (!w || hidden) return null;

  const h = new Date().getHours();
  const greet = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  const nothing = !num(w.needs_you) && !num(w.tasks_open) && !num(w.awaiting_customer);

  const Chip = ({ n, label, tone }) => {
    if (!num(n)) return null;
    const col = tone === "bad" ? C.red : tone === "warn" ? C.amber : C.ink;
    return (
      <span style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>
        <b style={{ color: col, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 14 }}>{n}</b>{" "}
        {label}
      </span>
    );
  };

  return (
    <Card style={{ padding: "12px 15px", borderLeft: `3px solid ${C.blue}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5, color: C.ink }}>
          {greet}, {me.name.split(" ")[0]}.
        </b>
        {nothing ? (
          <span style={{ fontSize: 12.5, color: C.muted }}>Nothing waiting on you. Clear desk.</span>
        ) : (
          <>
            <Chip n={w.needs_you} label="enquiries need you" />
            <Chip n={w.no_quote} label="never quoted" tone="warn" />
            <Chip n={w.awaiting_customer} label="awaiting customer" />
            <Chip n={w.tasks_open} label="tasks open" />
            <Chip n={w.tasks_overdue} label="overdue" tone="bad" />
          </>
        )}
        <button onClick={() => setHidden(true)}
          style={{ marginLeft: "auto", background: "none", border: "none", color: C.muted,
                   fontSize: 16, lineHeight: 1, cursor: "pointer", padding: "0 2px" }}>
          ×
        </button>
      </div>
    </Card>
  );
}

/* ───────────────────────── alerts ─────────────────────────── */
// Browsers only grant notification permission from a real click, so this has to
// be a button. It disappears once the answer is given, either way — a prompt
// that keeps reappearing is how people learn to ignore an app.

function AlertToggle({ supabase, me }) {
  const [state, setState] = useState(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [busy, setBusy] = useState(false);

  // Already granted: make sure THIS device is registered, then stay quiet.
  useEffect(() => {
    if (state === "granted") registerPush(supabase, me.name);
  }, [state, supabase, me.name]);

  if (state !== "default") return null;

  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setState(await registerPush(supabase, me.name));
        setBusy(false);
      }}
      style={{ background: "none", border: "none", color: C.blue, fontSize: 12,
               cursor: "pointer", padding: 0 }}>
      {busy ? "…" : "turn on alerts"}
    </button>
  );
}

/* ───────────────────────── task drawer ─────────────────────────── */
// Work that has been handed to someone has to stay visible. In WhatsApp a task
// scrolls away in ten minutes; here it sits behind one button until it's closed.
// Everyone can see everyone's list — same choice as the MIS cards — but it
// opens on Mine, because that is what you act on.

function TaskDrawer({ tasks, users, me, onTaskUpdate, onClose }) {
  const [tab, setTab] = useState("mine");
  const narrow = useIsNarrow();

  const lists = useMemo(() => ({
    mine:     tasks.filter((t) => t.owner === me.name && isOpen(t)).sort(byUrgency),
    assigned: tasks.filter((t) => t.assigned_by === me.name && t.owner !== me.name && isOpen(t)).sort(byUrgency),
    everyone: tasks.filter(isOpen).sort(byUrgency),
  }), [tasks, me.name]);

  const rows = lists[tab];

  const TABS = [
    ["mine", "Mine", lists.mine.length],
    ["assigned", "I assigned", lists.assigned.length],
    ["everyone", "Everyone", lists.everyone.length],
  ];

  const panel = narrow
    ? { position: "fixed", inset: 0, borderRadius: 0 }
    : { position: "fixed", top: 0, right: 0, bottom: 0, width: 380, borderRadius: 0,
        boxShadow: "-8px 0 28px rgba(0,0,0,0.14)" };

  return (
    <>
      <div onClick={onClose}
           style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 60 }} />
      <div style={{ ...panel, zIndex: 61, background: "white", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
                      borderBottom: `1px solid ${C.border}` }}>
          <b style={{ fontSize: 15, color: C.ink }}>Tasks</b>
          <button onClick={onClose}
            style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20,
                     lineHeight: 1, color: C.muted, cursor: "pointer", padding: "0 4px" }}>
            ×
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderBottom: `1px solid ${C.border}`,
                      overflowX: "auto" }}>
          {TABS.map(([id, label, n]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ whiteSpace: "nowrap", padding: "6px 11px", borderRadius: 8, cursor: "pointer",
                       fontSize: 12.5, fontWeight: tab === id ? 700 : 500,
                       border: `1px solid ${tab === id ? C.blue : C.border}`,
                       background: tab === id ? C.blue : "white",
                       color: tab === id ? "white" : C.muted }}>
              {label} {n > 0 && <span style={{ opacity: 0.75 }}>({n})</span>}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px 20px" }}>
          {!rows.length && (
            <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "34px 10px" }}>
              {tab === "mine" ? "Nothing open. Clear." : "Nothing here."}
            </div>
          )}
          {rows.map((t) => (
            <TaskCard key={t.id} task={t} users={users} me={me} onTaskUpdate={onTaskUpdate} />
          ))}
        </div>
      </div>
    </>
  );
}

function TaskCard({ task, users, me, onTaskUpdate }) {
  const over = isOverdue(task);
  const mine = task.owner === me.name;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 2px",
                  borderBottom: `1px solid ${C.border}` }}>
      <Avatar name={task.owner} users={users} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.45, wordBreak: "break-word" }}>
          {task.task}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 5 }}>
          <span style={{ fontSize: 11.5, color: over ? C.red : C.muted, fontWeight: over ? 700 : 400 }}>
            {task.due_date ? (over ? `overdue · ${dayLabel(task.due_date)}` : `due ${dayLabel(task.due_date)}`) : "no due date"}
          </span>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            {mine ? (task.assigned_by ? `from ${task.assigned_by.split(" ")[0]}` : "") : task.owner.split(" ")[0]}
          </span>
          {mine && (
            <button
              onClick={() => onTaskUpdate?.(task.id, { status: "Done", completed_at: new Date().toISOString() })}
              style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: C.green,
                       background: "none", border: `1px solid ${C.green}`, borderRadius: 6,
                       padding: "3px 10px", cursor: "pointer" }}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── the MIS card ───────────────────────── */
// Derives its own numbers. Nothing here was stored at close time, so an edit in
// the CRM later shows up here too — the card can never drift from the CRM.

function MisCard({ supabase, users, shift, report, who }) {
  const [mis, setMis] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!shift?.started_at) return;
    let on = true;
    supabase.rpc("shift_mis", {
      p_u: who,
      p_a: shift.started_at,
      p_b: shift.ended_at || new Date().toISOString(),
    }).then(({ data, error }) => {
      if (!on) return;
      if (error) { setErr(true); return; }
      setMis(Array.isArray(data) ? data[0] : data);
    });
    return () => { on = false; };
  }, [supabase, who, shift?.started_at, shift?.ended_at]);

  if (!shift) return null;

  const shot = (r, k) => (r?.[k] ? "from screenshot" : "entered");

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px",
                    borderBottom: `1px solid ${C.border}`, background: C.bg, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: C.blue }}>
          MIS
        </span>
        <Avatar name={who} users={users} size={22} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{who}</span>
        <span style={{ fontSize: 12, color: C.muted }}>
          {dayLabel(shift.report_date)} · {hhmm(shift.started_at)} → {hhmm(shift.ended_at)} IST ·{" "}
          {dur(shift.started_at, shift.ended_at)}
        </span>
        {!shift.confirmed && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: C.amber }}>unconfirmed</span>
        )}
      </div>

      <div style={{ padding: "6px 15px 13px" }}>
        {err && <div style={{ fontSize: 12, color: C.red, padding: "8px 0" }}>Could not compute — check shift_mis.</div>}
        {!err && !mis && <div style={{ fontSize: 12, color: C.muted, padding: "8px 0" }}>Computing…</div>}
        {mis && (
          <>
            <Row label="Enquiries generated" src="from CRM" value={mis.enquiries} />
            <Row label="Quotations sent"     src="from CRM" value={mis.quotations} />
            <Row label="Quotation value"     src="from CRM" value={money(mis.quotation_value)} />
            <Row label="POs generated"       src="from CRM" value={mis.pos} />
            <Row label="PO value"            src="from CRM" value={money(mis.po_value)} />
            <Row label="LinkedIn messages"   src={shot(report, "msg_shot_url")}  value={num(report?.linkedin_messages)} />
            <Row label="Connection requests" src={shot(report, "conn_shot_url")} value={num(report?.linkedin_sent)} />
            <Row label="Calls"               src={shot(report, "call_shot_url")} value={num(report?.calls_connected)} />
            <Row label="Tasks closed"        src="from tasks" value={mis.tasks_closed} />
            <Row label="Still open"          src="from tasks" value={mis.tasks_open} />
            <Row label="Overdue"             src="from tasks" value={mis.tasks_overdue} warn={num(mis.tasks_overdue) > 0} />
            {report?.notes && (
              <div style={{ marginTop: 9, fontSize: 12.5, color: C.muted, fontStyle: "italic" }}>
                {`"${report.notes}"`}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Row({ label, src, value, warn }) {
  const auto = src === "from CRM" || src === "from tasks" || src === "from screenshot";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0",
                  borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.ink }}>{label}</span>
      <span style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
        padding: "2px 6px", borderRadius: 4,
        color: auto ? C.green : C.amber,
        background: auto ? "rgba(66,183,42,0.10)" : "rgba(245,166,35,0.13)",
      }}>
        {src}
      </span>
      <span style={{ marginLeft: "auto", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 14,
                     fontWeight: 700, color: warn ? C.red : C.ink, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

/* ───────────────────────── end of day ───────────────────────── */

function EndOfDay({ supabase, me, shift, onSubmit, closing }) {
  const [open, setOpen] = useState(false);
  const [mis, setMis] = useState(null);
  const [f, setF] = useState({ linkedin_messages: "", linkedin_sent: "", calls_connected: "", notes: "" });

  async function openPanel() {
    setOpen(true);
    const { data } = await supabase.rpc("shift_mis", {
      p_u: me.name, p_a: shift.started_at, p_b: new Date().toISOString(),
    });
    setMis(Array.isArray(data) ? data[0] : data);
  }

  if (!open)
    return (
      <Card style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: C.ink }}>
          Your shift · {dayLabel(shift.report_date)} · started {hhmm(shift.started_at)} IST
        </span>
        <Btn label="End my day" onClick={openPanel} />
        <span style={{ fontSize: 11.5, color: C.muted }}>
          If you forget, it posts at 07:00 marked unconfirmed.
        </span>
      </Card>
    );

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const input = {
    width: "100%", padding: "8px 11px", borderRadius: 8, border: `1px solid ${C.border}`,
    fontSize: 13, color: C.ink, boxSizing: "border-box",
  };

  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 3 }}>End of shift</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>
        Everything below the line is already counted. Fill in only what the CRM cannot see.
      </div>

      {mis && (
        <div style={{ marginBottom: 14 }}>
          <Row label="Enquiries generated" src="from CRM" value={mis.enquiries} />
          <Row label="Quotations sent"     src="from CRM" value={mis.quotations} />
          <Row label="Quotation value"     src="from CRM" value={money(mis.quotation_value)} />
          <Row label="POs generated"       src="from CRM" value={mis.pos} />
          <Row label="PO value"            src="from CRM" value={money(mis.po_value)} />
          <Row label="Tasks closed"        src="from tasks" value={mis.tasks_closed} />
          <Row label="Overdue"             src="from tasks" value={mis.tasks_overdue}
               warn={num(mis.tasks_overdue) > 0} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 11 }}>
        {[["linkedin_messages", "LinkedIn messages"], ["linkedin_sent", "Connection requests"],
          ["calls_connected", "Calls"]].map(([k, label]) => (
          <label key={k} style={{ fontSize: 11.5, color: C.muted }}>
            {label}
            <input type="number" value={f[k]} onChange={(e) => set(k, e.target.value)}
                   placeholder="0" style={{ ...input, marginTop: 4 }} />
          </label>
        ))}
      </div>

      <label style={{ fontSize: 11.5, color: C.muted, display: "block", marginTop: 11 }}>
        Anything to flag
        <input value={f.notes} onChange={(e) => set("notes", e.target.value)}
               placeholder="Optional" style={{ ...input, marginTop: 4 }} />
      </label>

      <div style={{ display: "flex", gap: 10, marginTop: 15, alignItems: "center" }}>
        <Btn label={closing ? "Filing…" : "File it and sign off"}
             onClick={() => onSubmit(f)} disabled={closing} />
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: C.muted, fontSize: 12.5, cursor: "pointer" }}>
          not yet
        </button>
      </div>
    </Card>
  );
}

/* ───────────────────────── composer ───────────────────────── */

function Composer({ users, me, onSend }) {
  const [text, setText] = useState("");
  const [due, setDue] = useState(tomorrowISO());
  const [dismissed, setDismissed] = useState(false);

  // An @mention OFFERS a task. It never creates one silently — most chat is
  // just chat, and a room that turns every sentence into a task gets ignored.
  // A bare "@shraddha" with nothing after it is calling someone's name, not
  // giving them work, so it offers nothing.
  const mentioned = useMemo(() => {
    const m = text.match(/@([A-Za-z][A-Za-z.'-]*)/);
    if (!m) return null;
    const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length))
      .replace(/[\s,:;.\-–—]/g, "");
    if (rest.length < 4) return null;          // nothing was actually asked
    const needle = m[1].toLowerCase();
    return (
      users.find((u) => u.active !== false && u.name?.toLowerCase().split(/\s+/)[0] === needle) ||
      users.find((u) => u.active !== false && u.name?.toLowerCase().startsWith(needle)) ||
      null
    );
  }, [text, users]);

  const target = mentioned && mentioned.name !== me.name && !dismissed ? mentioned : null;

  function send(withTask) {
    onSend(text, withTask ? target : null, due);
    setText(""); setDismissed(false); setDue(tomorrowISO());
  }

  return (
    <Card style={{ padding: 12, position: "sticky", bottom: 0 }}>
      {target && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 9,
                      padding: "7px 10px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 12.5, color: C.ink }}>
            Make this a task for <b>{mentioned.name.split(" ")[0]}</b>
          </span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
                 style={{ fontSize: 12, padding: "3px 7px", borderRadius: 6, border: `1px solid ${C.border}`, color: C.ink }} />
          <Btn label="Assign" onClick={() => send(true)} />
          <button onClick={() => setDismissed(true)}
            style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>
            just a message
          </button>
        </div>
      )}
      <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setDismissed(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim()) send(false); }
          }}
          rows={2}
          placeholder="Say something, or @name to assign a task…"
          style={{ flex: 1, minWidth: 0, resize: "vertical", padding: "9px 12px", borderRadius: 9,
                   border: `1px solid ${C.border}`, fontSize: 13.5, lineHeight: 1.5,
                   color: C.ink, fontFamily: "inherit" }}
        />
        <Btn label="Send" onClick={() => text.trim() && send(false)} disabled={!text.trim()} />
      </div>
    </Card>
  );
}

/* ───────────────────── unread badge, for the sidebar ───────────────────── */
// Lives here because it needs the same "who am I" and the same table. App.jsx
// calls it to put a count on the Team Room tab:
//
//   const roomUnread = useRoomUnread(supabase, users);
//   { id: "room", label: "Team Room", icon: "💬", badge: roomUnread }
//
// It also raises a desktop alert when a message lands while you are looking at
// another tab — nothing fires while the room is actually on screen.

export function useRoomUnread(supabase, users = []) {
  const [count, setCount] = useState(0);

  const myName = useMemo(() => {
    const id = lsGet(LS_KEY);
    return users.find((u) => String(u.id) === String(id))?.name || "";
  }, [users]);

  // Recount from the server whenever the room is marked read, and on mount.
  useEffect(() => {
    if (!myName) return;
    let on = true;
    const recount = async () => {
      const since = lsGet(SEEN_KEY) || new Date(Date.now() - 864e5).toISOString();
      const { count: n } = await supabase
        .from("room_messages")
        .select("id", { count: "exact", head: true })
        .gt("created_at", since)
        .neq("user_name", myName);
      if (on) setCount(n || 0);
    };
    recount();
    const onSeen = () => { if (on) setCount(0); };
    window.addEventListener("teamroom:seen", onSeen);
    return () => { on = false; window.removeEventListener("teamroom:seen", onSeen); };
  }, [supabase, myName]);

  // Live increment, plus a desktop alert when the tab is in the background.
  useEffect(() => {
    if (!myName) return;
    const ch = supabase
      .channel("team-room-unread")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages" }, (p) => {
        const m = p.new;
        if (m.user_name === myName) return;
        setCount((c) => c + 1);
        if (typeof Notification === "undefined") return;
        if (Notification.permission !== "granted") return;
        if (document.visibilityState === "visible" && !document.hidden) {
          // The room may still be on screen; only alert when the tab is hidden.
          return;
        }
        try {
          new Notification(m.user_name, {
            body: m.kind === "mis" ? "filed their daily report" : (m.body || "sent a message"),
            icon: "/icons/icon-192.png",
            tag: "team-room",
          });
        } catch { /* some browsers require the service worker instead */ }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, myName]);

  return count;
}
