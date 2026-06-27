// src/components/teamMetrics.js
// Pure helpers for Team Tracker — matched to the real daily_reports columns.

export const TARGETS = { linkedin_sent: 25, calls_connected: 30, enquiries: 5 };

export const NUMERIC = [
  "enquiries", "linkedin_sent", "linkedin_accepted", "linkedin_messages",
  "calls_connected", "calls_tried", "new_contacts",
];

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const num = (v) => Math.max(0, Math.round(Number(v) || 0));

export const daysAgo = (s) => {
  const a = new Date(todayISO() + "T12:00:00");
  const b = new Date(s + "T12:00:00");
  return Math.round((a - b) / 864e5);
};
export const relTime = (s) => {
  const d = daysAgo(s);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : d + "d ago";
};

export const emptySum = () => NUMERIC.reduce((a, k) => ((a[k] = 0), a), {});
export const sumReports = (rows) =>
  rows.reduce((acc, r) => { NUMERIC.forEach((k) => (acc[k] += Number(r[k]) || 0)); return acc; }, emptySum());

// LinkedIn X/Y: X = cumulative accepted, Y = sent-and-still-pending
export const runningXY = (reports, name) => {
  let x = 0, sent = 0;
  reports.filter((r) => r.user_name === name).forEach((r) => {
    x += Number(r.linkedin_accepted) || 0;
    sent += Number(r.linkedin_sent) || 0;
  });
  return { x, y: Math.max(0, sent - x) };
};

// stable colour per rep (table has no colour column)
const PALETTE = ["#2E7D6B", "#7A5BBD", "#C2603A", "#1877F2", "#B7791F", "#3B7A57", "#A23E48"];
export const colorFor = (name, reps) => {
  const i = Math.max(0, reps.findIndex((r) => r.name === name));
  return PALETTE[i % PALETTE.length];
};
export const initials = (name) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("");

// Nudge engine — what needs the supervisor's attention.
export function computeNudges(reports, reps) {
  const today = todayISO();
  const todays = reports.filter((r) => r.report_date === today);

  // duplicate call-screenshot detection (same hash used by >1 report today)
  const hashCount = {};
  todays.forEach((r) => { if (r.call_shot_hash) hashCount[r.call_shot_hash] = (hashCount[r.call_shot_hash] || 0) + 1; });

  const out = [];
  reps.forEach((u) => {
    const todayRow = todays.find((r) => r.user_name === u.name);

    if (!todayRow) {
      out.push({ name: u.name, severity: "high", title: "No report today",
        detail: `${u.name.split(" ")[0]} hasn't submitted a Daily Report for ${today}.` });
      return;
    }

    const missed = [];
    if (num(todayRow.linkedin_sent) < TARGETS.linkedin_sent)
      missed.push(`connections ${num(todayRow.linkedin_sent)}/${TARGETS.linkedin_sent}`);
    if (num(todayRow.calls_connected) < TARGETS.calls_connected)
      missed.push(`calls ${num(todayRow.calls_connected)}/${TARGETS.calls_connected}`);
    if (num(todayRow.enquiries) < TARGETS.enquiries)
      missed.push(`enquiries ${num(todayRow.enquiries)}/${TARGETS.enquiries}`);
    if (missed.length)
      out.push({ name: u.name, severity: "med", title: `${missed.length} target${missed.length > 1 ? "s" : ""} missed today`,
        detail: `Below target on ${missed.join(", ")}.` });

    if (todayRow.call_shot_hash && hashCount[todayRow.call_shot_hash] > 1)
      out.push({ name: u.name, severity: "high", title: "Duplicate call screenshot",
        detail: `${u.name.split(" ")[0]}'s call screenshot matches another report today — worth a check.` });
  });

  // high severity first
  return out.sort((a, b) => (a.severity === "high" ? -1 : 1) - (b.severity === "high" ? -1 : 1));
}

// Pipeline nudges from the real enquiries + quotations tables:
// "rep has enquiries logged but no quotation yet".
const CLOSED_STAGES = ["PO Received", "Lost", "No Response", "Out of Scope"];
export function computePipelineNudges(enquiries, quotations, reps) {
  if (!enquiries?.length) return [];
  const quoted = new Set((quotations || []).map((q) => q.enquiry_id));
  const out = [];
  reps.forEach((u) => {
    const active = enquiries.filter((e) => e.assigned_to === u.name && !CLOSED_STAGES.includes(e.stage));
    const unquoted = active.filter((e) => !quoted.has(e.id));
    if (unquoted.length) {
      const names = unquoted.slice(0, 4).map((e) => e.customer_name).filter(Boolean).join(", ");
      out.push({
        name: u.name,
        severity: unquoted.length >= 3 ? "high" : "med",
        title: `${unquoted.length} enquir${unquoted.length > 1 ? "ies" : "y"} not yet quoted`,
        detail: `Open enquiries with no quotation sent${names ? `: ${names}` : ""}.`,
      });
    }
  });
  return out;
}

export const mergeNudges = (a, b) =>
  [...a, ...b].sort((x, y) => (x.severity === "high" ? -1 : 1) - (y.severity === "high" ? -1 : 1));
