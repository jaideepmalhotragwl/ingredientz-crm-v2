import { SUPA_URL, SUPA_KEY, supabase } from "./config.js";

// ── Date helpers ──────────────────────────────────────────────────────────────
export function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / 86400000);
}

export function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function reminderDate(amount, unit) {
  if (!amount) return "";
  const d = new Date();
  if (unit === "hours") d.setHours(d.getHours() + parseInt(amount));
  else if (unit === "days") d.setDate(d.getDate() + parseInt(amount));
  else if (unit === "weeks") d.setDate(d.getDate() + parseInt(amount) * 7);
  return d.toISOString().split("T")[0];
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
export async function dbGet(table, filters = {}) {
  let q = supabase.from(table).select("*").order("created_at", { ascending: false });
  Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
  const { data, error } = await q;
  if (error) { console.error(table, error); return []; }
  return data || [];
}

export async function dbInsert(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) { console.error("insert", table, error); return null; }
  return data;
}

export async function dbUpdate(table, id, updates) {
  const { error } = await supabase.from(table).update(updates).eq("id", id);
  if (error) console.error("update", table, error);
}

export async function dbDelete(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) console.error("delete", table, error);
}

// ── Email helpers ─────────────────────────────────────────────────────────────
export async function sendEmail({ from, to, subject, html, text, reply_to }) {
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text, reply_to })
    });
    return await res.json();
  } catch (e) { console.error("Email error:", e); return null; }
}

export function getSenderEmail(assignedTo, users) {
  const u = users.find(x => x.name === assignedTo || x.name.split(" ")[0] === assignedTo);
  return u?.sender_email || "sales@mail.ingredientz.co";
}

export function buildEmailHtml(title, color, lines, footer) {
  const rows = lines.map(l =>
    `<tr><td style="padding:8px 0;color:#444;font-family:Arial,sans-serif;font-size:14px;border-bottom:1px solid #f0f0f0;">${l}</td></tr>`
  ).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:${color};padding:24px 28px;border-radius:10px 10px 0 0;">
      <div style="color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:2px;margin-bottom:6px;">INGREDIENTZ INC</div>
      <div style="color:#ffffff;font-size:20px;font-weight:bold;">${title}</div>
    </div>
    <div style="background:#ffffff;padding:20px 28px;border:1px solid #e8e8e8;border-top:none;">
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>
    <div style="background:#f9f9f9;padding:12px 28px;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 10px 10px;">
      <div style="color:#aaa;font-size:12px;">${footer}</div>
    </div>
  </div>`;
}
