// =====================================================================
// Quality Portal · Order QC queue
//
// The list of orders waiting on quality. Click a row to open its file.
// Order values, payment terms and margins are deliberately not shown.
// =====================================================================

import { useState, useEffect, useMemo } from "react";
import { Q, qDate } from "./qualityConfig.js";
import { loadQualityQueue } from "./qualityData.js";
import { OrderQCFile } from "./OrderQCFile.jsx";

const BUCKETS = [
  { id: "all",   label: "All open" },
  { id: "work",  label: "Needs quality work" },
  { id: "wait",  label: "Waiting on suppliers" },
  { id: "ready", label: "Ready to clear" },
  { id: "done",  label: "Cleared" }
];

const TAG = {
  work:  { bg: Q.failBg, fg: Q.fail },
  wait:  { bg: Q.naBg,   fg: Q.na },
  ready: { bg: Q.infoBg, fg: Q.info },
  done:  { bg: Q.passBg, fg: Q.pass }
};

export function OrderQCTab({ actor }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bucket, setBucket] = useState("all");
  const [search, setSearch] = useState("");
  const [openOrderId, setOpenOrderId] = useState(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setRows(await loadQualityQueue());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const counts = useMemo(() => {
    const c = { all: 0, work: 0, wait: 0, ready: 0, done: 0 };
    rows.forEach(r => { c[r.qc]++; if (r.qc !== "done") c.all++; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .filter(r => bucket === "all" ? r.qc !== "done" : r.qc === bucket)
      .filter(r => !s || `${r.order.order_number} ${r.customer?.company || ""} ${r.order.customer_po_number || ""} ${r.supplierNames.join(" ")}`.toLowerCase().includes(s))
      .sort((a, b) => {
        const da = a.order.expected_delivery_date || "9999";
        const db = b.order.expected_delivery_date || "9999";
        return String(da).localeCompare(String(db));
      });
  }, [rows, bucket, search]);

  // ── One order open ─────────────────────────────────────────────────
  if (openOrderId) {
    return (
      <OrderQCFile
        orderId={openOrderId}
        actor={actor}
        onBack={() => { setOpenOrderId(null); refresh(); }}
      />
    );
  }

  const card = { background: Q.card, border: `1px solid ${Q.line}`, borderRadius: 14 };
  const th = {
    fontFamily: Q.mono, fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase",
    color: Q.faint, textAlign: "left", padding: "11px 14px",
    borderBottom: `1px solid ${Q.line}`, fontWeight: 600, background: "#FAFCFC"
  };
  const td = { padding: "12px 14px", borderBottom: `1px solid ${Q.line2}`, fontSize: 13 };

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <Kpi n={counts.work}  label="Needs quality work" color={Q.fail} />
        <Kpi n={counts.wait}  label="Waiting on supplier assignment" />
        <Kpi n={counts.ready} label="Ready to clear" color={Q.info} />
        <Kpi n={counts.done}  label="Cleared" color={Q.pass} />
      </div>

      <div style={{
        background: "#FAFCFC", border: `1px solid ${Q.line}`, borderLeft: `3px solid ${Q.ink3}`,
        borderRadius: 8, padding: "12px 14px", fontSize: 12.5, color: Q.muted, marginBottom: 16
      }}>
        Orders arrive here from the Enquiry CRM. Cancelled and archived orders never appear.
        An order sits in <b style={{ color: Q.text }}>waiting on supplier assignment</b> until the first supplier PO is raised —
        quality can see it coming, but there is nobody to chase yet.
      </div>

      {/* Tabs + search */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {BUCKETS.map(b => (
          <button key={b.id} onClick={() => setBucket(b.id)}
            style={{
              padding: "7px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: bucket === b.id ? Q.ink : "#fff",
              color: bucket === b.id ? "#fff" : Q.muted,
              border: `1px solid ${bucket === b.id ? Q.ink : Q.line}`, fontFamily: "inherit"
            }}>
            {b.label} ({counts[b.id] ?? 0})
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search order #, customer, PO #, supplier…"
          style={{
            marginLeft: "auto", background: "#fff", border: `1px solid ${Q.line}`,
            borderRadius: 9, padding: "7px 12px", width: 280, fontSize: 13,
            fontFamily: "inherit", color: Q.text
          }} />
        <button onClick={refresh} title="Reload"
          style={{ background: "#fff", border: `1px solid ${Q.line}`, borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontSize: 13 }}>
          ↻
        </button>
      </div>

      {error && (
        <div style={{ background: Q.failBg, border: `1px solid ${Q.fail}44`, color: Q.fail, borderRadius: 10, padding: "12px 15px", fontSize: 12.5, marginBottom: 14 }}>
          Could not load the queue: {error}
        </div>
      )}

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Order #</th>
                <th style={th}>Customer</th>
                <th style={th}>Customer PO</th>
                <th style={th}>Lines</th>
                <th style={th}>Suppliers</th>
                <th style={th}>Documents</th>
                <th style={th}>Expected delivery</th>
                <th style={th}>Owner</th>
                <th style={th}>Order status</th>
                <th style={th}>QC status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ padding: 44, textAlign: "center", color: Q.muted, fontSize: 13 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: 44, textAlign: "center", color: Q.muted, fontSize: 13 }}>Nothing in this queue.</td></tr>
              ) : filtered.map(r => {
                const t = TAG[r.qc];
                return (
                  <tr key={r.order.id}
                    onClick={() => setOpenOrderId(r.order.id)}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#F7FAFA"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...td, fontFamily: Q.mono, fontWeight: 600 }}>{r.order.order_number}</td>
                    <td style={td}>
                      {r.customer?.company || "—"}
                      {r.customer?.country && <div style={{ fontSize: 12, color: Q.muted }}>{r.customer.country}</div>}
                    </td>
                    <td style={{ ...td, fontFamily: Q.mono, fontSize: 12, color: Q.muted }}>{r.order.customer_po_number || "—"}</td>
                    <td style={{ ...td, fontFamily: Q.mono }}>{r.lineCount}</td>
                    <td style={{ ...td, fontSize: 12, color: Q.muted }}>
                      {r.supplierCount === 0 ? "none yet" : `${r.supplierCount} assigned`}
                    </td>
                    <td style={{ ...td, fontFamily: Q.mono, fontSize: 12, color: Q.muted }}>
                      {r.docsTotal === 0 ? "—" : `${r.docsVerified} / ${r.docsTotal}`}
                    </td>
                    <td style={{ ...td, fontFamily: Q.mono, fontSize: 12, color: Q.muted }}>{qDate(r.order.expected_delivery_date)}</td>
                    <td style={{ ...td, fontSize: 12, color: Q.muted }}>{r.order.owner || r.order.assigned_to || "—"}</td>
                    <td style={{ ...td, fontSize: 12, color: Q.muted }}>{r.order.status}</td>
                    <td style={td}>
                      <span style={{ background: t.bg, color: t.fg, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>
                        {r.qcLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: Q.muted, marginTop: 10, textAlign: "right" }}>
        Showing {filtered.length} order{filtered.length === 1 ? "" : "s"} · order values are not shown in the quality portal
      </p>
    </div>
  );
}

function Kpi({ n, label, color }) {
  return (
    <div style={{ background: Q.card, border: `1px solid ${Q.line}`, borderRadius: 14, padding: "15px 16px" }}>
      <div style={{ fontFamily: Q.mono, fontSize: 26, fontWeight: 700, lineHeight: 1.1, color: color || Q.text }}>{n}</div>
      <div style={{ fontSize: 12, color: Q.muted, marginTop: 3 }}>{label}</div>
    </div>
  );
}
