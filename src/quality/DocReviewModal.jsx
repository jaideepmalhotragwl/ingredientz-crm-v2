// =====================================================================
// Quality Portal · review one document
//
// Upload what the supplier sent, open it, then accept it or send it back
// with a reason. The reason is what the supplier receives, word for word.
// =====================================================================

import { useState } from "react";
import { Q, DOC_LABEL, qDate } from "./qualityConfig.js";
import { uploadDocFile, getDocDownloadUrl, verifyDoc, rejectDoc } from "./qualityData.js";
import { Scrim } from "./ProductProfileModal.jsx";

const COMMON_REASONS = [
  "Method and limit of quantification not stated",
  "Lot number does not match the goods being shipped",
  "Document is not signed or stamped",
  "Results are outside our agreed specification",
  "Certificate has expired",
  "Organic certificate does not name this product in its scope",
  "Illegible or incomplete scan"
];

export function DocReviewModal({ doc, actor, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null);
    try { await uploadDocFile(doc, file, actor); await onSaved(); }
    catch (err) { setError(err.message || String(err)); setBusy(false); }
  }

  async function openFile() {
    try {
      const url = await getDocDownloadUrl(doc.file_url);
      window.open(url, "_blank", "noopener");
    } catch (err) { setError("Could not open the file: " + (err.message || err)); }
  }

  async function accept() {
    setBusy(true); setError(null);
    try { await verifyDoc(doc, actor); await onSaved(); }
    catch (err) { setError(err.message || String(err)); setBusy(false); }
  }

  async function sendBack() {
    if (!reason.trim()) return;
    setBusy(true); setError(null);
    try { await rejectDoc(doc, reason.trim(), actor); await onSaved(); }
    catch (err) { setError(err.message || String(err)); setBusy(false); }
  }

  const label = { fontFamily: Q.mono, fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: Q.faint, marginBottom: 4 };

  return (
    <Scrim onClose={onClose}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${Q.line}`, display: "flex", alignItems: "center" }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{DOC_LABEL[doc.doc_type]}</h3>
          <div style={{ fontSize: 12, color: Q.muted, marginTop: 2 }}>
            {doc.product_name}{doc.lot_number ? ` · lot ${doc.lot_number}` : ""}
          </div>
        </div>
        <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: Q.faint, fontSize: 18, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ padding: "18px 20px" }}>
        {doc.requirement_note && (
          <div style={{ background: "#FAFCFC", border: `1px solid ${Q.line}`, borderLeft: `3px solid ${Q.ink3}`, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: Q.muted, marginBottom: 14 }}>
            This column must cover: {doc.requirement_note}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div>
            <div style={label}>Current status</div>
            <StatusPill status={doc.status} />
          </div>
          <div>
            <div style={label}>Received</div>
            <span style={{ fontFamily: Q.mono, fontSize: 12.5 }}>{doc.received_at ? qDate(doc.received_at) : "—"}</span>
          </div>
          {doc.reviewed_by && (
            <div>
              <div style={label}>Last reviewed by</div>
              <span style={{ fontSize: 12.5 }}>{doc.reviewed_by} · {qDate(doc.reviewed_at)}</span>
            </div>
          )}
          {doc.requested_at && (
            <div>
              <div style={label}>Requested</div>
              <span style={{ fontFamily: Q.mono, fontSize: 12.5 }}>{qDate(doc.requested_at)}</span>
            </div>
          )}
        </div>

        {doc.reject_reason && (
          <div style={{ background: Q.failBg, border: `1px solid ${Q.fail}33`, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: Q.fail, marginBottom: 14 }}>
            <b>Sent back:</b> {doc.reject_reason}
          </div>
        )}

        {/* The file */}
        <div style={{ border: `1.5px dashed #CFDADC`, borderRadius: 10, padding: 16, textAlign: "center", background: "#FAFCFC", marginBottom: 16 }}>
          {doc.file_url ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{doc.file_name}</div>
              <button onClick={openFile}
                style={{ background: Q.ink3, color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Open document
              </button>
              <div style={{ fontSize: 11.5, color: Q.muted, marginTop: 10 }}>
                Replace it by choosing another file below.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: Q.muted, marginBottom: 10 }}>
              Nothing uploaded yet. Attach what the supplier sent.
            </div>
          )}
          <input type="file" onChange={onUpload} disabled={busy}
            style={{ marginTop: 10, fontSize: 12.5, fontFamily: "inherit" }} />
        </div>

        {/* Reject box */}
        {rejecting && (
          <div style={{ border: `1px solid ${Q.line}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={label}>Reason — this is sent to the supplier exactly as written</div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Say precisely what is wrong and what you need instead."
              style={{ width: "100%", border: `1px solid ${Q.line}`, borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", color: Q.text, boxSizing: "border-box", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {COMMON_REASONS.map(r => (
                <button key={r} onClick={() => setReason(r)}
                  style={{ background: "#F7FAFA", border: `1px solid ${Q.line}`, borderRadius: 20, padding: "4px 10px", fontSize: 11.5, color: Q.muted, cursor: "pointer", fontFamily: "inherit" }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: Q.failBg, color: Q.fail, borderRadius: 8, padding: "10px 12px", fontSize: 12.5 }}>{error}</div>
        )}
      </div>

      <div style={{ padding: "14px 20px", borderTop: `1px solid ${Q.line}`, display: "flex", gap: 8, justifyContent: "flex-end", background: "#FAFCFC", flexWrap: "wrap" }}>
        <button onClick={onClose} disabled={busy}
          style={{ background: "#fff", border: `1px solid ${Q.line}`, borderRadius: 7, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Close
        </button>
        {rejecting ? (
          <>
            <button onClick={() => { setRejecting(false); setReason(""); }} disabled={busy}
              style={{ background: "#fff", border: `1px solid ${Q.line}`, borderRadius: 7, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Back
            </button>
            <button onClick={sendBack} disabled={busy || !reason.trim()}
              style={{ background: reason.trim() && !busy ? Q.fail : "#DCE3E4", color: reason.trim() && !busy ? "#fff" : "#9AAEB2", border: "none", borderRadius: 7, padding: "6px 15px", fontSize: 12.5, fontWeight: 600, cursor: reason.trim() && !busy ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Send back to supplier
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setRejecting(true)} disabled={busy || !doc.file_url}
              title={doc.file_url ? "" : "Nothing has been uploaded to reject"}
              style={{ background: "#fff", border: `1px solid ${Q.fail}55`, color: Q.fail, borderRadius: 7, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: doc.file_url ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: doc.file_url ? 1 : .5 }}>
              Reject
            </button>
            <button onClick={accept} disabled={busy || !doc.file_url}
              title={doc.file_url ? "" : "Upload the document before verifying it"}
              style={{ background: doc.file_url && !busy ? Q.pass : "#DCE3E4", color: doc.file_url && !busy ? "#fff" : "#9AAEB2", border: "none", borderRadius: 7, padding: "6px 15px", fontSize: 12.5, fontWeight: 600, cursor: doc.file_url && !busy ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              {busy ? "Working…" : "Verify"}
            </button>
          </>
        )}
      </div>
    </Scrim>
  );
}

function StatusPill({ status }) {
  const map = {
    required:  { bg: Q.naBg,   fg: Q.na,   text: "Not requested yet" },
    requested: { bg: Q.waitBg, fg: Q.wait, text: "Requested, no reply" },
    received:  { bg: Q.waitBg, fg: Q.wait, text: "Received, needs review" },
    verified:  { bg: Q.passBg, fg: Q.pass, text: "Verified" },
    rejected:  { bg: Q.failBg, fg: Q.fail, text: "Rejected" }
  };
  const s = map[status] || map.required;
  return <span style={{ background: s.bg, color: s.fg, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20 }}>{s.text}</span>;
}
