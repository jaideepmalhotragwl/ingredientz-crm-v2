// =====================================================================
// Quality Portal · request documents from a supplier
//
// Writes one email per supplier, listing only that supplier's own lines.
// A supplier never sees the rest of the order or who else is on it.
//
// In V1 you send it from your own mail client — the button opens it, and
// the portal records that it went out. In V1.1 an Edge Function sends it
// through Resend without leaving the page.
// =====================================================================

import { useState, useMemo } from "react";
import { Q, DOC_LABEL, qDate } from "./qualityConfig.js";
import { logDocRequest } from "./qualityData.js";
import { Scrim } from "./ProductProfileModal.jsx";

const FROM_LINE = "Quality Assurance · Ingredientz";

export function DocRequestModal({ target, data, actor, onClose, onSent }) {
  const { order, qcFile, pos, poItems, items, suppliers, docs, requests } = data;
  const supById = Object.fromEntries(suppliers.map(s => [s.id, s]));
  const itemById = Object.fromEntries(items.map(i => [i.id, i]));

  // Which supplier POs are we chasing?
  const targets = target === "all" ? pos : [target];

  // Build one draft per supplier PO that actually owes something
  const drafts = useMemo(() => {
    return targets.map(po => {
      const supplier = supById[po.supplier_id];
      const myPoItems = poItems.filter(pi => pi.supplier_po_id === po.id);

      const lines = myPoItems.map(pi => {
        const item = itemById[pi.order_item_id];
        const owed = docs.filter(d =>
          d.supplier_po_item_id === pi.id && d.required && !d.orphaned &&
          ["required", "requested", "rejected"].includes(d.status));
        return { item, poItem: pi, owed };
      }).filter(l => l.owed.length > 0);

      const docCount = lines.reduce((n, l) => n + l.owed.length, 0);
      const prior = requests.filter(r => r.supplier_po_id === po.id);
      const reminderNumber = prior.length;   // 0 = first request

      const subject = reminderNumber === 0
        ? `Documents required — our purchase order ${po.supplier_po_number}`
        : `Documents required — our purchase order ${po.supplier_po_number} · reminder ${reminderNumber}`;

      const body = buildBody({ supplier, po, order, lines, reminderNumber });

      return { po, supplier, lines, docCount, reminderNumber, subject, body };
    }).filter(d => d.docCount > 0);
  }, [target, data]);

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editedBody, setEditedBody] = useState(null);

  if (drafts.length === 0) {
    return (
      <Scrim onClose={onClose}>
        <div style={{ padding: 26, textAlign: "center" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Nothing outstanding</h3>
          <p style={{ fontSize: 12.5, color: Q.muted, marginBottom: 16 }}>
            Every document from this supplier is already in. There is nothing to chase.
          </p>
          <button onClick={onClose}
            style={{ background: Q.ink3, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Close
          </button>
        </div>
      </Scrim>
    );
  }

  const d = drafts[index];
  const toEmail = d.supplier?.contact_email || d.supplier?.email || "";
  const body = editedBody ?? d.body;

  function openMailClient() {
    const url = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank");
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(`Subject: ${d.subject}\n\n${body}`);
      alert("Copied. Paste it into your mail client.");
    } catch {
      alert("Could not copy automatically — select the text and copy it manually.");
    }
  }

  async function markSent() {
    setBusy(true); setError(null);
    try {
      await logDocRequest({
        qcFile, order, po: d.po,
        supplierName: d.supplier?.company,
        toEmail, subject: d.subject, body,
        docCount: d.docCount,
        reminderNumber: d.reminderNumber,
        actor
      });
      if (index < drafts.length - 1) {
        setIndex(index + 1);
        setEditedBody(null);
        setBusy(false);
      } else {
        await onSent();
      }
    } catch (e) {
      setError(e.message || String(e));
      setBusy(false);
    }
  }

  return (
    <Scrim onClose={onClose} wide>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${Q.line}`, display: "flex", alignItems: "center" }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
            {d.reminderNumber === 0 ? "Request documents" : `Reminder ${d.reminderNumber}`}
          </h3>
          <div style={{ fontSize: 12, color: Q.muted, marginTop: 2 }}>
            {d.supplier?.company || "Unknown supplier"} · {d.docCount} document{d.docCount > 1 ? "s" : ""}
            {drafts.length > 1 && ` · email ${index + 1} of ${drafts.length}`}
          </div>
        </div>
        <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: Q.faint, fontSize: 18, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ padding: "18px 20px" }}>
        {!toEmail && (
          <div style={{ background: Q.waitBg, border: "1px solid #EFD9AC", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: Q.wait, marginBottom: 14 }}>
            No email address on file for this supplier. Add one on the supplier record, or copy the text below and send it yourself.
          </div>
        )}

        <div style={{ border: `1px solid ${Q.line}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ background: "#FAFCFC", padding: "10px 14px", borderBottom: `1px solid ${Q.line2}`, display: "grid", gap: 3, fontSize: 12.5, color: Q.muted }}>
            <span>To <b style={{ color: Q.text }}>{toEmail || "— no address —"}</b></span>
            <span>Subject <b style={{ color: Q.text }}>{d.subject}</b></span>
          </div>
          <textarea
            value={body}
            onChange={e => setEditedBody(e.target.value)}
            rows={16}
            style={{
              width: "100%", border: "none", padding: 14, fontSize: 12.5, lineHeight: 1.6,
              fontFamily: "inherit", color: "#2C4145", boxSizing: "border-box", resize: "vertical", outline: "none"
            }} />
        </div>

        <p style={{ fontSize: 11.5, color: Q.muted }}>
          Sending this marks every outstanding document for {d.supplier?.company || "this supplier"} as requested,
          and records the reminder count so nobody has to remember where the chase got to.
        </p>

        {error && (
          <div style={{ background: Q.failBg, color: Q.fail, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginTop: 12 }}>{error}</div>
        )}
      </div>

      <div style={{ padding: "14px 20px", borderTop: `1px solid ${Q.line}`, display: "flex", gap: 8, justifyContent: "flex-end", background: "#FAFCFC", flexWrap: "wrap" }}>
        <button onClick={onClose} disabled={busy}
          style={{ background: "#fff", border: `1px solid ${Q.line}`, borderRadius: 7, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
        <button onClick={copyBody}
          style={{ background: "#fff", border: `1px solid ${Q.line}`, borderRadius: 7, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Copy text
        </button>
        <button onClick={openMailClient} disabled={!toEmail}
          style={{ background: "#fff", border: `1px solid ${Q.line}`, borderRadius: 7, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: toEmail ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: toEmail ? 1 : .5 }}>
          Open in mail
        </button>
        <button onClick={markSent} disabled={busy}
          style={{ background: busy ? "#DCE3E4" : Q.ink3, color: busy ? "#9AAEB2" : "#fff", border: "none", borderRadius: 7, padding: "6px 15px", fontSize: 12.5, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {busy ? "Saving…" : index < drafts.length - 1 ? "Mark sent, next supplier →" : "Mark sent"}
        </button>
      </div>
    </Scrim>
  );
}

// ── The email text ───────────────────────────────────────────────────
function buildBody({ supplier, po, order, lines, reminderNumber }) {
  const parts = [];
  parts.push("Dear Quality team,");
  parts.push("");
  parts.push(reminderNumber === 0
    ? `We are preparing the release file for our purchase order ${po.supplier_po_number} and require the documents listed below.`
    : `The documents listed below are still outstanding against our purchase order ${po.supplier_po_number}. This is reminder ${reminderNumber}.`);
  parts.push("");
  parts.push("Please reply with attachments, or upload them through your supplier portal.");
  parts.push("");

  lines.forEach(l => {
    const lot = l.poItem.lot_number ? ` — lot ${l.poItem.lot_number}` : "";
    parts.push(`${l.item?.product_name || "Product"} — ${l.poItem.quantity} ${l.item?.unit || ""}${lot}`);
    l.owed.forEach(d => {
      let line = `  - ${DOC_LABEL[d.doc_type]}`;
      if (d.doc_type === "heavy_metals") line += ", stating method and limit of quantification";
      if (d.doc_type === "organic_cert") line += ", naming this product in the scope";
      if (d.doc_type === "additional" && d.requirement_note) line += `: ${d.requirement_note}`;
      if (d.status === "rejected" && d.reject_reason) line += `  [previously returned: ${d.reject_reason}]`;
      parts.push(line);
    });
    parts.push("");
  });

  if (order.expected_delivery_date) {
    parts.push(`Goods are scheduled against a delivery date of ${qDate(order.expected_delivery_date)}. We cannot release them until these documents are received and verified.`);
    parts.push("");
  }
  parts.push("Regards,");
  parts.push(FROM_LINE);

  return parts.join("\n");
}
