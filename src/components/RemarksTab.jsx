import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";

function fmtDateTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

// ── REMARKS TAB — append-only remark history with timestamps + author ─────────
function RemarksTab({ enq, users = [] }) {
  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [by, setBy] = useState(enq?.assigned_to || "Jaideep");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!enq?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("enquiry_remarks")
      .select("*")
      .eq("enquiry_id", enq.id)
      .order("created_at", { ascending: false });
    setRemarks(data || []);
    setLoading(false);
  }, [enq?.id]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const t = text.trim();
    if (!t) return;
    setSaving(true);
    const { error } = await supabase
      .from("enquiry_remarks")
      .insert({ enquiry_id: enq.id, remark: t, created_by: by || null });
    setSaving(false);
    if (error) { alert(error.message); return; }
    setText("");
    load();
  }

  const last = remarks[0];
  const userOpts = (users || []).filter(u => u.active).map(u => u.name);

  return <div style={{ paddingTop: 14 }}>
    {/* last-updated banner */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 13px", marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.muted }}>{remarks.length} remark{remarks.length !== 1 ? "s" : ""}</div>
      <div style={{ fontSize: 11, color: C.muted }}>Last updated: <span style={{ color: C.ink, fontWeight: 600 }}>{last ? fmtDateTime(last.created_at) : "never"}</span></div>
    </div>

    {/* add a remark */}
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 11, padding: 12, marginBottom: 14 }}>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add a remark…" rows={3}
        style={{ width: "100%", boxSizing: "border-box", background: C.white, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 12px", fontFamily: "inherit", fontSize: 13, color: C.ink, outline: "none", resize: "vertical" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 9 }}>
        <select value={by} onChange={e => setBy(e.target.value)} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 12, color: C.ink }}>
          {[by, ...userOpts.filter(n => n !== by)].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <Btn label={saving ? "Saving…" : "Add Remark"} onClick={add} size="sm" disabled={saving || !text.trim()} />
      </div>
    </div>

    {/* history — newest first */}
    {loading
      ? <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12 }}>Loading…</div>
      : remarks.length === 0
        ? <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12 }}>No remarks yet</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {remarks.map((r, i) => <div key={r.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 12px", borderLeft: `3px solid ${i === 0 ? C.blue : C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.ink }}>{r.created_by || "—"}{i === 0 && <span style={{ marginLeft: 6, fontSize: 9, color: C.blue, fontWeight: 700 }}>LATEST</span>}</span>
              <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{fmtDateTime(r.created_at)}</span>
            </div>
            <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{r.remark}</div>
          </div>)}
        </div>}
  </div>;
}
export { RemarksTab };
