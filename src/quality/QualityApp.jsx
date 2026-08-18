// =====================================================================
// Quality Portal · the shell
//
// This is the only component you mount from your existing CRM. It draws
// the dark sidebar, holds which tab is open, and renders the right one.
//
// Mount it like this:
//     <QualityApp onExit={() => setActiveTab("dashboard")} />
//
// It asks who is using it the first time, then remembers. That name is
// what gets written into the audit trail against every verification and
// every order clearance.
// =====================================================================

import { useState, useEffect } from "react";
import { Q } from "./qualityConfig.js";
import { loadUnreadNotifications, markNotificationsRead, loadQualityUsers } from "./qualityData.js";
import { OrderQCTab } from "./OrderQCTab.jsx";
import {
  SupplierQualificationTab,
  ProductApprovalTab,
  CustomerClearanceTab,
  DocumentsTab,
  DocumentLibraryTab,
  RequirementRulesTab,
  ProductProfilesTab,
  AuditTrailTab
} from "./QualityPlaceholders.jsx";

const ACTOR_KEY = "ingredientz_quality_actor";

const TABS = [
  { group: "Review queues" },
  { id: "orders",     icon: "📦", label: "Order QC",               ready: true },
  { id: "suppliers",  icon: "🏭", label: "Supplier qualification", ready: false },
  { id: "products",   icon: "🧪", label: "Product approval",       ready: false },
  { id: "customers",  icon: "🏢", label: "Customer clearance",     ready: false },
  { group: "Documents" },
  { id: "documents",  icon: "📄", label: "Reformat & generate",    ready: false },
  { id: "library",    icon: "🗄️", label: "Document library",       ready: false },
  { group: "Configuration" },
  { id: "rules",      icon: "⚙️", label: "Requirement rules",      ready: false },
  { id: "profiles",   icon: "🏷️", label: "Product profiles",       ready: true },
  { id: "audit",      icon: "🕘", label: "Audit trail",            ready: true }
];

export function QualityApp({ actor: actorProp, onExit }) {
  const [actor, setActor] = useState(() => {
    if (actorProp) return actorProp;
    try { return window.localStorage.getItem(ACTOR_KEY) || null; } catch { return null; }
  });
  const [tab, setTab] = useState("orders");
  const [notifs, setNotifs] = useState([]);
  const [showBell, setShowBell] = useState(false);

  useEffect(() => {
    if (!actor) return;
    let alive = true;
    async function pull() {
      try {
        const n = await loadUnreadNotifications();
        if (alive) setNotifs(n);
      } catch { /* the bell is not important enough to break the page */ }
    }
    pull();
    const t = setInterval(pull, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [actor]);

  function chooseActor(name) {
    try { window.localStorage.setItem(ACTOR_KEY, name); } catch { /* ignore */ }
    setActor(name);
  }
  function switchActor() {
    try { window.localStorage.removeItem(ACTOR_KEY); } catch { /* ignore */ }
    setActor(null);
  }

  async function readAll() {
    const ids = notifs.map(n => n.id);
    setNotifs([]);
    setShowBell(false);
    try { await markNotificationsRead(ids); } catch { /* ignore */ }
  }

  // ── Ask who is using this, once ──────────────────────────────────
  if (!actor) return <ActorPicker onPick={chooseActor} onExit={onExit} />;

  const shell = {
    display: "grid", gridTemplateColumns: "248px 1fr",
    height: "100vh", overflow: "hidden",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif',
    background: Q.paper, color: Q.text, fontSize: 14
  };
  const side = {
    background: `linear-gradient(178deg, ${Q.ink3}, ${Q.ink} 62%, #061A1E)`,
    color: "#DCE9EA", display: "flex", flexDirection: "column", overflowY: "auto"
  };
  const navBtn = (on) => ({
    width: "100%", display: "flex", alignItems: "center", gap: 10,
    padding: "9px 10px", borderRadius: 9, border: "none", cursor: "pointer",
    background: on ? "#fff" : "transparent",
    color: on ? Q.text : "#C9DEDE",
    fontWeight: on ? 600 : 400, fontSize: 13.5, textAlign: "left",
    fontFamily: "inherit", marginBottom: 2
  });

  return (
    <div style={shell}>
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside style={side}>
        <div style={{ padding: "18px 16px 14px" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${Q.pass}, ${Q.ink3})`, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>QA</div>
            <div style={{ fontWeight: 800, letterSpacing: ".06em", fontSize: 14, color: Q.text }}>INGREDIENTZ</div>
          </div>
        </div>
        <div style={{ padding: "0 18px", fontFamily: Q.mono, fontSize: 10, letterSpacing: ".18em", color: "#7FB6AE", textTransform: "uppercase", marginBottom: 14 }}>
          Quality Portal
        </div>

        <nav style={{ flex: 1, padding: "0 10px" }}>
          {TABS.map((t, i) => t.group ? (
            <div key={"g" + i} style={{ fontFamily: Q.mono, fontSize: 9.5, letterSpacing: ".16em", color: "#5D8A8B", textTransform: "uppercase", padding: "12px 8px 6px" }}>
              {t.group}
            </div>
          ) : (
            <button key={t.id} style={navBtn(tab === t.id)} onClick={() => setTab(t.id)}>
              <span style={{ width: 18, textAlign: "center" }}>{t.icon}</span>
              {t.label}
              {!t.ready && (
                <span style={{
                  marginLeft: "auto", fontFamily: Q.mono, fontSize: 8.5, fontWeight: 700,
                  letterSpacing: ".08em", padding: "1px 6px", borderRadius: 4,
                  background: tab === t.id ? "#F1F4F5" : "rgba(255,255,255,.14)",
                  color: tab === t.id ? "#7A9094" : "#9FC6C4"
                }}>SOON</span>
              )}
            </button>
          ))}
        </nav>

        <div style={{ borderTop: "1px solid rgba(255,255,255,.09)", padding: "12px 18px 16px" }}>
          <div style={{ fontSize: 11.5, color: "#9DBFBE", marginBottom: 6 }}>
            Signed in as <b style={{ color: "#DCE9EA" }}>{actor}</b>
            <button onClick={switchActor}
              style={{ background: "none", border: "none", color: "#7FB6AE", fontSize: 11, cursor: "pointer", padding: "0 0 0 6px", fontFamily: "inherit", textDecoration: "underline" }}>
              switch
            </button>
          </div>
          {onExit && (
            <button onClick={onExit}
              style={{ background: "transparent", border: "none", color: "#9DBFBE", fontSize: 12.5, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
              ← Back to Enquiry CRM
            </button>
          )}
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────── */}
      <main style={{ overflowY: "auto", position: "relative" }}>
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          background: "rgba(242,245,246,.94)", backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${Q.line}`, padding: "14px 28px",
          display: "flex", alignItems: "center", gap: 14
        }}>
          <div>
            <div style={{ fontFamily: Q.mono, fontSize: 10.5, letterSpacing: ".13em", color: Q.faint, textTransform: "uppercase" }}>
              Quality · {TABS.find(t => t.id === tab)?.label}
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.01em", margin: 0 }}>
              {TABS.find(t => t.id === tab)?.label}
            </h1>
          </div>
          <div style={{ flex: 1 }} />

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowBell(v => !v)}
              style={{ width: 34, height: 34, borderRadius: 9, background: "#fff", border: `1px solid ${Q.line}`, display: "grid", placeItems: "center", cursor: "pointer", position: "relative" }}>
              🔔
              {notifs.length > 0 && (
                <span style={{ position: "absolute", top: -5, right: -5, background: Q.fail, color: "#fff", fontSize: 9.5, fontWeight: 700, borderRadius: 20, padding: "1px 5px", fontFamily: Q.mono }}>
                  {notifs.length}
                </span>
              )}
            </button>
            {showBell && (
              <div style={{
                position: "absolute", right: 0, top: 42, width: 340, background: "#fff",
                border: `1px solid ${Q.line}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(8,38,43,.16)",
                zIndex: 50, overflow: "hidden"
              }}>
                <div style={{ padding: "11px 14px", borderBottom: `1px solid ${Q.line}`, display: "flex", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>Notifications</span>
                  {notifs.length > 0 && (
                    <button onClick={readAll} style={{ marginLeft: "auto", background: "none", border: "none", color: Q.info, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {notifs.length === 0 ? (
                    <div style={{ padding: 22, textAlign: "center", color: Q.muted, fontSize: 12.5 }}>Nothing new.</div>
                  ) : notifs.map(n => (
                    <div key={n.id} style={{ padding: "11px 14px", borderBottom: `1px solid ${Q.line2}`, fontSize: 12.5 }}>
                      <div style={{ color: Q.text }}>{n.message}</div>
                      <div style={{ fontFamily: Q.mono, fontSize: 10.5, color: Q.faint, marginTop: 3 }}>
                        {new Date(n.created_at).toLocaleString("en-GB")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div title={actor} style={{ width: 34, height: 34, borderRadius: "50%", background: Q.ink3, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>
            {initials(actor)}
          </div>
        </header>

        <div style={{ padding: "22px 28px 70px", maxWidth: 1400 }}>
          {tab === "orders"    && <OrderQCTab actor={actor} />}
          {tab === "suppliers" && <SupplierQualificationTab />}
          {tab === "products"  && <ProductApprovalTab />}
          {tab === "customers" && <CustomerClearanceTab />}
          {tab === "documents" && <DocumentsTab />}
          {tab === "library"   && <DocumentLibraryTab />}
          {tab === "rules"     && <RequirementRulesTab />}
          {tab === "profiles"  && <ProductProfilesTab />}
          {tab === "audit"     && <AuditTrailTab />}
        </div>
      </main>
    </div>
  );
}

// =====================================================================
// Who is using the portal
// =====================================================================
function ActorPicker({ onPick, onExit }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    (async () => {
      try { setUsers(await loadQualityUsers()); }
      catch { setUsers([]); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: `linear-gradient(178deg, ${Q.ink3}, ${Q.ink} 70%, #061A1E)`,
      display: "grid", placeItems: "center", padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif'
    }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px", width: "100%", maxWidth: 440, boxShadow: "0 24px 60px rgba(8,38,43,.32)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${Q.pass}, ${Q.ink3})`, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>QA</div>
          <div>
            <div style={{ fontWeight: 800, letterSpacing: ".06em", fontSize: 15, color: Q.text }}>QUALITY PORTAL</div>
            <div style={{ fontFamily: Q.mono, fontSize: 9.5, letterSpacing: ".16em", color: Q.faint, textTransform: "uppercase" }}>Ingredientz</div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: Q.muted, lineHeight: 1.6, marginBottom: 18 }}>
          Who is working on quality today? Your name is recorded against every document you verify
          and every order you clear, so the audit trail names a person rather than a system.
          The portal will remember on this browser.
        </p>

        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: Q.muted, fontSize: 13 }}>Loading team…</div>
        ) : (
          <>
            {users.map(u => (
              <button key={u.id} onClick={() => onPick(u.name)}
                style={{
                  width: "100%", textAlign: "left", padding: "11px 14px", marginBottom: 8,
                  border: `1px solid ${Q.line}`, borderRadius: 10, background: "#fff",
                  fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 11
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = Q.ink3}
                onMouseLeave={e => e.currentTarget.style.borderColor = Q.line}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: Q.naBg, color: Q.ink3, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>
                  {initials(u.name)}
                </span>
                {u.name}
              </button>
            ))}

            <div style={{ borderTop: `1px solid ${Q.line2}`, marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontFamily: Q.mono, fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: Q.faint, marginBottom: 6 }}>
                Not on the list
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && typed.trim()) onPick(typed.trim()); }}
                  placeholder="Type a name"
                  style={{ flex: 1, border: `1px solid ${Q.line}`, borderRadius: 9, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", color: Q.text, boxSizing: "border-box" }} />
                <button onClick={() => typed.trim() && onPick(typed.trim())} disabled={!typed.trim()}
                  style={{
                    background: typed.trim() ? Q.ink3 : "#DCE3E4", color: typed.trim() ? "#fff" : "#9AAEB2",
                    border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600,
                    cursor: typed.trim() ? "pointer" : "not-allowed", fontFamily: "inherit"
                  }}>
                  Continue
                </button>
              </div>
            </div>
          </>
        )}

        {onExit && (
          <button onClick={onExit}
            style={{ background: "none", border: "none", color: Q.muted, fontSize: 12.5, cursor: "pointer", padding: "16px 0 0", fontFamily: "inherit" }}>
            ← Back to Enquiry CRM
          </button>
        )}
      </div>
    </div>
  );
}

function initials(name) {
  const parts = String(name || "QA").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default QualityApp;
