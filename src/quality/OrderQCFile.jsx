// =====================================================================
// Quality Portal · one order's quality file
//
// Rows are grouped under the supplier who was assigned to them on the
// supplier PO. A line split between two suppliers appears twice, once
// under each, because each supplier owes its own certificate of analysis.
// =====================================================================

import { useState, useEffect, useMemo } from "react";
import { Q, DOC_TYPES, DOC_STATUS, qDate, productKey, profileTags, requiredDocsFor } from "./qualityConfig.js";
import { loadOrderQcFile, saveLotNumber, clearOrderQc, reopenOrderQc } from "./qualityData.js";
import { ProductProfileModal } from "./ProductProfileModal.jsx";
import { DocReviewModal } from "./DocReviewModal.jsx";
import { DocRequestModal } from "./DocRequestModal.jsx";

export function OrderQCFile({ orderId, actor, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profileFor, setProfileFor] = useState(null);   // product name being classified
  const [reviewDoc, setReviewDoc] = useState(null);     // qc_line_docs row being reviewed
  const [requestPo, setRequestPo] = useState(null);     // supplier PO being chased ("all" for everyone)
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setData(await loadOrderQcFile(orderId));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [orderId]);

  // ── Work out what is blocking clearance ──────────────────────────
  const analysis = useMemo(() => {
    if (!data) return null;
    const { items, pos, poItems, docs, profileByKey } = data;

    const assignedItemIds = new Set(poItems.map(pi => pi.order_item_id));
    const unassigned = items.filter(i => !assignedItemIds.has(i.id));
    const unprofiled = [...new Set(
      items.filter(i => !profileByKey[productKey(i.product_name)]).map(i => i.product_name)
    )];

    const live = docs.filter(d => d.required && !d.orphaned);
    const verified = live.filter(d => d.status === "verified").length;
    const toReview = live.filter(d => d.status === "received").length;
    const rejected = live.filter(d => d.status === "rejected").length;
    const outstanding = live.filter(d => d.status === "required" || d.status === "requested").length;

    const blockers = [];
    if (unprofiled.length) blockers.push(`${unprofiled.length} product${unprofiled.length > 1 ? "s have" : " has"} no profile set, so the required document list cannot be built: ${unprofiled.join(", ")}`);
    if (unassigned.length) blockers.push(`${unassigned.length} order line${unassigned.length > 1 ? "s have" : " has"} no supplier assigned — quality has nobody to request documents from`);
    if (rejected)   blockers.push(`${rejected} document${rejected > 1 ? "s were" : " was"} rejected and not yet resubmitted`);
    if (toReview)   blockers.push(`${toReview} document${toReview > 1 ? "s have" : " has"} been received and not yet reviewed`);
    if (outstanding) blockers.push(`${outstanding} document${outstanding > 1 ? "s are" : " is"} still outstanding from suppliers`);
    if (!live.length && !unassigned.length && !unprofiled.length) blockers.push("No documents have been built for this order yet");

    return { unassigned, unprofiled, verified, total: live.length, blockers };
  }, [data]);

  if (loading) return <Center>Loading the quality file…</Center>;
  if (error)   return <Center color={Q.fail}>Could not load this order: {error}</Center>;
  if (!data)   return null;

  const { order, customer, qcFile, items, pos, poItems, suppliers, profileByKey, docs, requests } = data;
  const cleared = qcFile.status === "cleared";
  const canClear = analysis.blockers.length === 0 && !cleared;

  const itemById = Object.fromEntries(items.map(i => [i.id, i]));
  const supById  = Object.fromEntries(suppliers.map(s => [s.id, s]));

  async function doClear() {
    setBusy(true);
    try { await clearOrderQc(qcFile, order.order_number, actor); await refresh(); }
    catch (e) { alert("Could not clear: " + (e.message || e)); }
    finally { setBusy(false); }
  }
  async function doReopen() {
    const reason = window.prompt("Why is clearance being withdrawn?");
    if (!reason) return;
    setBusy(true);
    try { await reopenOrderQc(qcFile, order.order_number, reason, actor); await refresh(); }
    catch (e) { alert("Could not reopen: " + (e.message || e)); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: Q.muted, marginBottom: 12, padding: 0, fontFamily: "inherit" }}>
        ← Back to order queue
      </button>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: Q.mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: Q.faint }}>
            Order quality file
          </div>
          <h2 style={{ fontFamily: Q.mono, fontSize: 22, fontWeight: 700, letterSpacing: "-.02em", margin: "2px 0 0" }}>
            {order.order_number}
          </h2>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 10 }}>
            <Meta k="Customer" v={customer?.company || "—"} />
            <Meta k="Customer PO" v={order.customer_po_number || "—"} mono />
            <Meta k="Expected delivery" v={qDate(order.expected_delivery_date)} mono />
            <Meta k="Order status" v={order.status} />
            <Meta k="Owner" v={order.owner || order.assigned_to || "—"} />
            <Meta k="Documents" v={analysis.total ? `${analysis.verified} / ${analysis.total} verified` : "not yet built"} mono />
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Btn ghost onClick={() => setRequestPo("all")}>✉ Chase all suppliers</Btn>
          {cleared ? (
            <Btn onClick={doReopen} disabled={busy}>Withdraw clearance</Btn>
          ) : (
            <Btn green onClick={doClear} disabled={!canClear || busy}
              title={canClear ? "" : `${analysis.blockers.length} item(s) outstanding`}>
              {busy ? "Working…" : "Clear order"}
            </Btn>
          )}
        </div>
      </div>

      {/* ── Cleared banner or blockers ─────────────────────────────── */}
      {cleared ? (
        <div style={{ background: Q.passBg, border: `1px solid ${Q.pass}44`, borderRadius: 10, padding: "12px 15px", marginBottom: 16, fontSize: 12.5, color: Q.pass }}>
          <b>Cleared by quality</b> — {qcFile.cleared_by || "unknown"} on {qDate(qcFile.cleared_at)}. Goods may ship.
        </div>
      ) : analysis.blockers.length > 0 && (
        <div style={{ background: "#FFFCF4", border: "1px solid #EFD9AC", borderRadius: 10, padding: "12px 15px", marginBottom: 16, fontSize: 12.5, color: "#7A5405" }}>
          <b style={{ color: "#5C3F04" }}>This order cannot be cleared yet</b>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {analysis.blockers.map((b, i) => <li key={i} style={{ margin: "2px 0" }}>{b}</li>)}
          </ul>
        </div>
      )}

      {/* ── One block per supplier PO ──────────────────────────────── */}
      {pos.map(po => {
        const myItems = poItems.filter(pi => pi.supplier_po_id === po.id);
        if (!myItems.length) return null;
        const supplier = supById[po.supplier_id];
        const sent = requests.filter(r => r.supplier_po_id === po.id);
        const outstanding = docs.filter(d =>
          d.supplier_po_id === po.id && d.required && !d.orphaned &&
          ["required", "requested", "rejected"].includes(d.status)).length;

        return (
          <div key={po.id} style={{ border: `1px solid ${Q.line}`, borderRadius: 13, overflow: "hidden", marginBottom: 16, background: "#fff" }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${Q.line}`, borderLeft: `4px solid ${Q.ink3}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {supplier?.company || "Unknown supplier"}
                  {supplier?.country && <span style={{ fontWeight: 400, fontSize: 12, color: Q.muted }}> · {supplier.country}</span>}
                </div>
                <div style={{ fontFamily: Q.mono, fontSize: 11.5, color: Q.muted, marginTop: 2 }}>
                  {po.supplier_po_number} · {myItems.length} line{myItems.length > 1 ? "s" : ""}
                  {sent.length > 0 && ` · last chased ${qDate(sent[0].sent_at)}, reminder ${sent[0].reminder_number}`}
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                {outstanding > 0 && <Pill bg={Q.waitBg} fg={Q.wait}>{outstanding} outstanding</Pill>}
                <Btn ghost small onClick={() => setRequestPo(po)}>✉ Request documents</Btn>
              </div>
            </div>

            <Matrix
              rows={myItems.map(pi => ({
                poItem: pi,
                item: itemById[pi.order_item_id],
                profile: profileByKey[productKey(itemById[pi.order_item_id]?.product_name)],
                docs: docs.filter(d => d.supplier_po_item_id === pi.id),
                splitCount: poItems.filter(x => x.order_item_id === pi.order_item_id).length
              }))}
              locked={false}
              orderId={order.id}
              actor={actor}
              onClassify={setProfileFor}
              onOpenDoc={setReviewDoc}
              onSaved={refresh}
            />
          </div>
        );
      })}

      {/* ── Lines with no supplier yet ─────────────────────────────── */}
      {analysis.unassigned.length > 0 && (
        <div style={{ border: `1px solid ${Q.line}`, borderRadius: 13, overflow: "hidden", marginBottom: 16, background: "#fff" }}>
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${Q.line}`, borderLeft: "4px solid #C6D2D4", background: "#FAFCFC", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: Q.muted }}>No supplier assigned</div>
              <div style={{ fontFamily: Q.mono, fontSize: 11.5, color: Q.muted, marginTop: 2 }}>
                {analysis.unassigned.length} line{analysis.unassigned.length > 1 ? "s" : ""} · waiting for a supplier PO to be raised in the Enquiry CRM
              </div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <Pill bg={Q.naBg} fg={Q.na}>Quality cannot act yet</Pill>
            </div>
          </div>
          <Matrix
            rows={analysis.unassigned.map(item => ({
              poItem: null,
              item,
              profile: profileByKey[productKey(item.product_name)],
              docs: [],
              splitCount: 1
            }))}
            locked
            orderId={order.id}
            actor={actor}
            onClassify={setProfileFor}
            onOpenDoc={setReviewDoc}
            onSaved={refresh}
          />
        </div>
      )}

      <Legend />

      {/* ── Modals ────────────────────────────────────────────────── */}
      {profileFor && (
        <ProductProfileModal
          productName={profileFor}
          existing={profileByKey[productKey(profileFor)]}
          actor={actor}
          onClose={() => setProfileFor(null)}
          onSaved={async () => { setProfileFor(null); await refresh(); }}
        />
      )}
      {reviewDoc && (
        <DocReviewModal
          doc={reviewDoc}
          actor={actor}
          onClose={() => setReviewDoc(null)}
          onSaved={async () => { setReviewDoc(null); await refresh(); }}
        />
      )}
      {requestPo && (
        <DocRequestModal
          target={requestPo}
          data={data}
          actor={actor}
          onClose={() => setRequestPo(null)}
          onSent={async () => { setRequestPo(null); await refresh(); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// The matrix itself
// =====================================================================
function Matrix({ rows, locked, orderId, actor, onClassify, onOpenDoc, onSaved }) {
  const th = {
    background: Q.ink2, color: "#9FC6C4", fontFamily: Q.mono, fontSize: 9,
    letterSpacing: ".09em", textTransform: "uppercase", padding: "9px 6px",
    textAlign: "center", verticalAlign: "bottom", fontWeight: 600
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left", width: "34%", paddingLeft: 16 }}>Product line</th>
            {DOC_TYPES.map(d => <th key={d.key} style={th}>{d.short}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <MatrixRow key={r.poItem?.id || `u${r.item?.id}` || idx}
              row={r} locked={locked} orderId={orderId} actor={actor}
              onClassify={onClassify} onOpenDoc={onOpenDoc} onSaved={onSaved} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixRow({ row, locked, orderId, actor, onClassify, onOpenDoc, onSaved }) {
  const { poItem, item, profile, docs, splitCount } = row;
  const [lot, setLot] = useState(poItem?.lot_number || "");
  const [savingLot, setSavingLot] = useState(false);

  useEffect(() => { setLot(poItem?.lot_number || ""); }, [poItem?.lot_number]);

  if (!item) return null;

  const rule = requiredDocsFor(profile);
  const byType = Object.fromEntries(docs.map(d => [d.doc_type, d]));

  async function commitLot() {
    if (!poItem) return;
    if ((poItem.lot_number || "") === lot) return;
    setSavingLot(true);
    try { await saveLotNumber(poItem.id, lot.trim(), actor, orderId); await onSaved(); }
    catch (e) { alert("Could not save the lot number: " + (e.message || e)); }
    finally { setSavingLot(false); }
  }

  const td = { padding: 0, textAlign: "center", borderBottom: `1px solid ${Q.line2}`, borderRight: `1px solid ${Q.line2}` };

  return (
    <tr>
      <td style={{ padding: "11px 16px", borderBottom: `1px solid ${Q.line2}`, borderRight: `1px solid ${Q.line}`, textAlign: "left" }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.product_name}</div>
        <div style={{ fontFamily: Q.mono, fontSize: 11, color: Q.muted, marginTop: 3 }}>
          line {item.line_number} · {poItem ? `${poItem.quantity} ${item.unit || ""}` : `${item.quantity} ${item.unit || ""}`}
          {splitCount > 1 && (
            <span style={{ background: Q.infoBg, color: Q.info, fontSize: 8.5, fontWeight: 700, padding: "2px 6px", borderRadius: 4, marginLeft: 6, letterSpacing: ".05em" }}>
              SPLIT {poItem?.quantity} OF {item.quantity} {item.unit || ""}
            </span>
          )}
        </div>
        {item.product_spec && (
          <div style={{ fontFamily: Q.mono, fontSize: 11, color: Q.faint, marginTop: 2 }}>{item.product_spec}</div>
        )}

        <div style={{ display: "flex", gap: 5, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
          {profile ? (
            <>
              {profileTags(profile).map(t => (
                <span key={t.label} style={{ fontFamily: Q.mono, fontSize: 8.5, fontWeight: 700, letterSpacing: ".06em", padding: "2px 6px", borderRadius: 4, background: t.bg, color: t.fg }}>
                  {t.label}
                </span>
              ))}
              <span onClick={() => onClassify(item.product_name)}
                style={{ fontFamily: Q.mono, fontSize: 8.5, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#F1F4F5", color: "#7A9094", cursor: "pointer" }}>
                edit
              </span>
            </>
          ) : (
            <span onClick={() => onClassify(item.product_name)}
              style={{ fontFamily: Q.mono, fontSize: 8.5, fontWeight: 700, letterSpacing: ".06em", padding: "2px 6px", borderRadius: 4, background: Q.failBg, color: Q.fail, cursor: "pointer" }}>
              SET PROFILE
            </span>
          )}

          {poItem && (
            <input
              value={lot}
              onChange={e => setLot(e.target.value)}
              onBlur={commitLot}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
              placeholder="enter lot…"
              disabled={savingLot}
              style={{
                fontFamily: Q.mono, fontSize: 11, borderRadius: 6, padding: "3px 7px", width: 120,
                color: Q.text, background: "#fff",
                border: `1px solid ${lot ? Q.line : "#EFD9AC"}`
              }} />
          )}
        </div>
      </td>

      {DOC_TYPES.map(t => {
        const required = rule ? rule.required.includes(t.key) : null;
        const doc = byType[t.key];

        // no profile yet, or no supplier yet
        if (locked || required === null) {
          return (
            <td key={t.key} style={td}>
              <div style={{ height: 48, display: "grid", placeItems: "center", background: "#FAFCFC", color: "#C3CFD1", fontSize: 13 }}>–</div>
            </td>
          );
        }
        if (!required) {
          return (
            <td key={t.key} style={td}>
              <div style={{
                height: 48, display: "grid", placeItems: "center",
                background: "repeating-linear-gradient(45deg,#F7F9F9,#F7F9F9 4px,#F1F4F5 4px,#F1F4F5 8px)",
                color: "#B7C4C6", fontFamily: Q.mono, fontSize: 9
              }}>n/a</div>
            </td>
          );
        }

        const st = DOC_STATUS[doc?.status || "required"];
        return (
          <td key={t.key} style={td}>
            <div
              onClick={() => doc && onOpenDoc(doc)}
              title={t.key === "additional" && doc?.requirement_note ? doc.requirement_note : t.label}
              style={{
                height: st.dashed ? 36 : 48, margin: st.dashed ? 6 : 0,
                display: "grid", placeItems: "center", gap: 1, cursor: doc ? "pointer" : "default",
                background: st.bg, color: st.fg,
                border: st.dashed ? "1px dashed #D5DEDF" : "none",
                borderRadius: st.dashed ? 6 : 0,
                fontFamily: Q.mono, fontSize: 10, fontWeight: 700
              }}>
              <span>{st.mark}</span>
              {!st.dashed && <span style={{ fontSize: 8.5, fontWeight: 600, opacity: .85 }}>{st.word}</span>}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

// =====================================================================
// Small pieces
// =====================================================================
function Legend() {
  const item = (bg, border, text) => (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <i style={{ width: 13, height: 13, borderRadius: 4, background: bg, border, display: "inline-block" }} />{text}
    </span>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, margin: "12px 0 4px", fontSize: 11.5, color: Q.muted }}>
      {item(Q.passBg, "1px solid #BDE5D4", "Verified")}
      {item(Q.waitBg, "1px solid #EFD9AC", "Received, needs review")}
      {item("#fff", "1px dashed #D5DEDF", "Requested, no reply")}
      {item(Q.failBg, "1px solid #F0C4BF", "Rejected")}
      {item("#F1F4F5", `1px solid ${Q.line}`, "Not applicable")}
      {item("#FAFCFC", `1px solid ${Q.line}`, "Locked — no supplier or no product profile")}
    </div>
  );
}

function Meta({ k, v, mono }) {
  return (
    <div>
      <div style={{ fontFamily: Q.mono, fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: Q.faint, marginBottom: 2 }}>{k}</div>
      <span style={{ fontSize: 12.5, fontFamily: mono ? Q.mono : "inherit" }}>{v}</span>
    </div>
  );
}

function Pill({ children, bg, fg }) {
  return <span style={{ background: bg, color: fg, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>{children}</span>;
}

function Btn({ children, onClick, ghost, green, small, disabled, title }) {
  const bg = disabled ? "#DCE3E4" : green ? Q.pass : ghost ? "#fff" : Q.ink3;
  const fg = disabled ? "#9AAEB2" : ghost ? Q.text : "#fff";
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        background: bg, color: fg, borderRadius: small ? 7 : 9,
        padding: small ? "5px 11px" : "8px 14px",
        fontSize: small ? 12 : 13, fontWeight: 600,
        border: ghost && !disabled ? `1px solid ${Q.line}` : "none",
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit"
      }}>
      {children}
    </button>
  );
}

function Center({ children, color }) {
  return <div style={{ padding: 60, textAlign: "center", color: color || Q.muted, fontSize: 13 }}>{children}</div>;
}
