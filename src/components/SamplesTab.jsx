import { useState, useMemo } from "react";
import { C } from "../constants.js";
import { fmtDate } from "../utils.js";
const SAMPLE_STAGES = [
  "Awaiting Supplier",
  "Requested",
  "Supplier Shipped",
  "Received at Warehouse",
  "Dispatched to Customer",
  "Customer Received",
  "Feedback"
];
const STAGE_COLORS = {
  "Awaiting Supplier":      "#9b9b90",
  "Requested":              "#8E44AD",
  "Supplier Shipped":       "#F5A623",
  "Received at Warehouse":  "#1877F2",
  "Dispatched to Customer": "#16A085",
  "Customer Received":      "#42B72A",
  "Feedback":               "#34495E"
};
function isAwaiting(s) { return s.stage === "Awaiting Supplier" || !s.supplier_id; }
function stageLabel(s) {
  if (isAwaiting(s)) return "Awaiting Supplier";
  if (s.stage === "Feedback" && s.feedback_result) return s.feedback_result;
  return s.stage || "Requested";
}
function stageColor(s) {
  if (isAwaiting(s)) return STAGE_COLORS["Awaiting Supplier"];
  if (s.stage === "Feedback" && s.feedback_result === "Approved") return C.green;
  if (s.stage === "Feedback" && s.feedback_result === "Rejected") return C.red;
  return STAGE_COLORS[s.stage] || C.muted;
}
export function SamplesTab({ samples, onSelect, onNew }) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const metrics = useMemo(() => {
    const awaitingSupplier = samples.filter(isAwaiting).length;
    const open = samples.filter(s => s.stage !== "Feedback").length;
    const atWarehouse = samples.filter(s => s.stage === "Received at Warehouse").length;
    const withCustomer = samples.filter(s => ["Dispatched to Customer", "Customer Received"].includes(s.stage)).length;
    return { awaitingSupplier, open, atWarehouse, withCustomer };
  }, [samples]);
  const filtered = useMemo(() => {
    return samples.filter(s => {
      if (stageFilter === "Awaiting Supplier" && !isAwaiting(s)) return false;
      if (stageFilter !== "All" && stageFilter !== "Awaiting Supplier" && s.stage !== stageFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${s.sample_number || ""} ${s.enquiry_no || ""} ${s.customer_name || ""} ${s.supplier_name || ""} ${s.product_name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  }, [samples, search, stageFilter]);
  const card = { background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16 };
  const inputStyle = { padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: C.white, color: C.ink };
  const btnPrimary = { background: C.blue, color: "white", border: 0, padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
  const pill = (color) => ({ fontSize: 11, padding: "3px 9px", borderRadius: 99, fontWeight: 600, background: `${color}22`, color, display: "inline-block" });
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
        <Metric label="Awaiting supplier" value={metrics.awaitingSupplier} />
        <Metric label="Open samples" value={metrics.open} />
        <Metric label="At our warehouse" value={metrics.atWarehouse} />
        <Metric label="With customer" value={metrics.withCustomer} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} placeholder="Search by sample #, enquiry #, customer, supplier, product..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={inputStyle} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option>All</option>
          {SAMPLE_STAGES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button style={btnPrimary} onClick={onNew}>+ New sample enquiry</button>
      </div>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>
            {samples.length === 0 ? "No samples yet. Click + New sample enquiry to start one." : "No samples match the current filters."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <Th>Sample #</Th><Th>Enquiry</Th><Th>Customer</Th><Th>Supplier</Th><Th>Product</Th><Th>Stage</Th><Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} onClick={() => onSelect(s)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <Td><span style={{ fontFamily: "monospace", fontSize: 12 }}>{s.sample_number}</span></Td>
                  <Td><span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{s.enquiry_no || "—"}</span></Td>
                  <Td>{s.customer_name || "—"}</Td>
                  <Td style={{ color: C.muted }}>{s.supplier_name || <span style={{ fontStyle: "italic" }}>unassigned</span>}</Td>
                  <Td>{s.product_name || "—"}</Td>
                  <Td><span style={pill(stageColor(s))}>{stageLabel(s)}</span></Td>
                  <Td style={{ color: C.muted, fontSize: 12 }}>{fmtDate(s.updated_at || s.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 10, textAlign: "right" }}>Showing {filtered.length} of {samples.length} samples</div>
    </div>
  );
}
function Metric({ label, value }) {
  return (
    <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 16px" }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>{value}</div>
    </div>
  );
}
function Th({ children }) {
  return <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{children}</th>;
}
function Td({ children, style = {} }) {
  return <td style={{ padding: "12px 14px", ...style }}>{children}</td>;
}
