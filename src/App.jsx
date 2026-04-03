import { useState, useEffect } from "react";
import { supabase } from "./config.js";
import { C, STAGES } from "./constants.js";
import { dbGet, dbInsert, dbUpdate, dbDelete, sendEmail, getSenderEmail, buildEmailHtml, daysUntil } from "./utils.js";
import { LOGO, QUOTATION_TEMPLATE } from "./templates.js";

import { Dashboard }       from "./components/Dashboard.jsx";
import { EnquiriesTab }    from "./components/EnquiriesTab.jsx";
import { RemindersTab }    from "./components/RemindersTab.jsx";
import { CustomersTab }    from "./components/CustomersTab.jsx";
import { ProductsTab }     from "./components/ProductsTab.jsx";
import { CategoriesTab }   from "./components/CategoriesTab.jsx";
import { SuppliersTab }    from "./components/SuppliersTab.jsx";
import { UsersTab }        from "./components/UsersTab.jsx";
import { EnquiryDrawer }   from "./components/EnquiryDrawer.jsx";

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState(null);
  const [enquiries, setEnquiries]   = useState([]);
  const [customers, setCustomers]   = useState([]);
  const [users, setUsers]           = useState([]);
  const [tasks, setTasks]           = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [threads, setThreads]       = useState([]);
  const [activeTab, setActiveTab]   = useState("dashboard");
  const [selectedEnq, setSelectedEnq] = useState(null);

  function showToast(msg, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    Promise.all([
      dbGet("enquiries"), dbGet("customers"), dbGet("users"),
      dbGet("tasks"), dbGet("quotations"), dbGet("email_threads")
    ]).then(([enqs, custs, usrs, tsks, quots, thrs]) => {
      setEnquiries(enqs); setCustomers(custs); setUsers(usrs);
      setTasks(tsks); setQuotations(quots); setThreads(thrs);
    }).finally(() => setLoading(false));
  }, []);

  // ── Enquiry ops ──────────────────────────────────────────────────────────────
  async function addEnquiry(row) {
    const data = await dbInsert("enquiries", row);
    if (data) {
      setEnquiries(p => [data, ...p]);
      showToast(`✓ Enquiry saved — ${row.customer_name}`);
      const sender = getSenderEmail(row.assigned_to, users);
      const u = users.find(x => x.name === row.assigned_to);
      if (u?.email) {
        sendEmail({
          from: `Ingredientz CRM <${sender}>`, to: u.email,
          subject: `New Enquiry Assigned — ${row.customer_name}`,
          html: buildEmailHtml("New Enquiry Assigned", "#1877F2", [
            `<b>Hi ${row.assigned_to?.split(" ")[0]},</b> a new enquiry has been assigned to you.`,
            `<b>Customer:</b> ${row.customer_name} (${row.country || "—"})`,
            `<b>Product:</b> ${(row.products || [])[0]?.name || "—"}`,
            `<b>Priority:</b> ${row.priority}`,
            `<b>Stage:</b> ${row.stage}`
          ], "Ingredientz CRM · Auto-notification"),
          text: `New enquiry assigned: ${row.customer_name}`
        });
      }
    }
  }

  async function updateEnquiry(id, row) {
    await dbUpdate("enquiries", id, row);
    setEnquiries(p => p.map(e => e.id === id ? { ...e, ...row } : e));
    if (selectedEnq?.id === id) setSelectedEnq(s => ({ ...s, ...row }));
    showToast("✓ Enquiry updated");
  }

  async function deleteEnquiry(id) {
    await dbDelete("enquiries", id);
    setEnquiries(p => p.filter(e => e.id !== id));
    if (selectedEnq?.id === id) setSelectedEnq(null);
  }

  async function stageChange(id, stage) {
    await dbUpdate("enquiries", id, { stage });
    setEnquiries(p => p.map(e => e.id === id ? { ...e, stage } : e));
    if (selectedEnq?.id === id) setSelectedEnq(s => s ? { ...s, stage } : s);
    const enq = enquiries.find(e => e.id === id);
    if (enq) {
      const sender = getSenderEmail(enq.assigned_to, users);
      const u = users.find(x => x.name === enq.assigned_to);
      if (u?.email) {
        sendEmail({
          from: `Ingredientz CRM <${sender}>`, to: u.email,
          subject: `Stage Updated — ${enq.customer_name} — ${stage}`,
          html: buildEmailHtml("Enquiry Stage Updated", "#1877F2", [
            `<b>Hi ${(enq.assigned_to || "").split(" ")[0]},</b> an enquiry stage has been updated.`,
            `<b>Customer:</b> ${enq.customer_name}`,
            `<b>New Stage:</b> ${stage}`
          ], "Ingredientz CRM · Auto-notification"),
          text: `Stage updated: ${enq.customer_name} → ${stage}`
        });
      }
    }
  }

  // ── Task ops ─────────────────────────────────────────────────────────────────
  async function addTask(row) {
    const data = await dbInsert("tasks", row);
    if (data) {
      setTasks(p => [data, ...p]);
      const sender = getSenderEmail(row.owner, users);
      const u = users.find(x => x.name === row.owner);
      if (u?.email) {
        sendEmail({
          from: `Ingredientz CRM <${sender}>`, to: u.email,
          subject: `New Task Assigned — ${row.task.slice(0, 50)}`,
          html: buildEmailHtml("New Task Assigned", "#1877F2", [
            `<b>Hi ${row.owner?.split(" ")[0]},</b> a new task has been assigned.`,
            `<b>Task:</b> ${row.task}`,
            `<b>Priority:</b> ${row.priority}`,
            `<b>Due:</b> ${row.due_date || "—"}`
          ], "Ingredientz CRM"),
          text: `New task: ${row.task}`
        });
      }
    }
  }

  async function updateTask(id, row) {
    await dbUpdate("tasks", id, row);
    setTasks(p => p.map(t => t.id === id ? { ...t, ...row } : t));
  }

  async function deleteTask(id) {
    await dbDelete("tasks", id);
    setTasks(p => p.filter(t => t.id !== id));
  }

  // ── Customer ops ─────────────────────────────────────────────────────────────
  async function addCustomer(row)    { const data = await dbInsert("customers", row); if (data) { setCustomers(p => [data, ...p]); showToast(`✓ ${row.company} added`); } }
  async function updateCustomer(id, row) { await dbUpdate("customers", id, row); setCustomers(p => p.map(c => c.id === id ? { ...c, ...row } : c)); }
  async function deleteCustomer(id)  { await dbDelete("customers", id); setCustomers(p => p.filter(c => c.id !== id)); }

  // ── User ops ─────────────────────────────────────────────────────────────────
  async function addUser(row)    { const data = await dbInsert("users", row); if (data) { setUsers(p => [data, ...p]); showToast(`✓ ${row.name} added`); } }
  async function updateUser(id, row) { await dbUpdate("users", id, row); setUsers(p => p.map(u => u.id === id ? { ...u, ...row } : u)); }
  async function deleteUser(id)  { await dbDelete("users", id); setUsers(p => p.filter(u => u.id !== id)); }

  // ── Quotation ops ─────────────────────────────────────────────────────────────
  async function saveQuotation(row) {
    const data = await dbInsert("quotations", row);
    if (data) {
      setQuotations(p => [data, ...p]);
      showToast(`✓ Quotation v${row.version} saved`);
      await stageChange(row.enquiry_id, "Quotation Sent");
    }
  }

  async function sendQuotationEmail(enq, form, grandTotal, users) {
    const sender = getSenderEmail(enq.assigned_to, users);
    const custEmail = customers.find(c => c.id === enq.customer_id)?.email || "";
    const subject = QUOTATION_TEMPLATE.subject(enq.products || [], enq.customer_name, enq.id);
    const bodyText = QUOTATION_TEMPLATE.text(enq, form.items, grandTotal, form);
    const html = QUOTATION_TEMPLATE.html(enq, form.items, grandTotal, form);
    if (custEmail) {
      const res = await sendEmail({ from: `Ingredientz Sales <${sender}>`, to: custEmail, subject, html, text: bodyText, reply_to: "sales@ingredientz.co" });
      showToast(res?.id ? `✓ Quotation sent to ${custEmail}` : `✓ Quotation logged (check customer email)`);
    } else {
      showToast("⚠ No customer email — quotation logged only");
    }
    const threadRow = { enquiry_id: enq.id, customer_name: enq.customer_name, direction: "auto-sent", subject, body: bodyText, from_email: sender, to_email: custEmail || enq.contact_person, sent_at: new Date().toISOString() };
    const data = await dbInsert("email_threads", threadRow);
    if (data) setThreads(p => [data, ...p]);
  }

  async function logEmail(row) {
    const data = await dbInsert("email_threads", row);
    if (data) { setThreads(p => [data, ...p]); showToast("✓ Email logged"); }
  }

  async function handleRefresh() {
    setLoading(true);
    const [enqs, custs, usrs, tsks, quots, thrs] = await Promise.all([
      dbGet("enquiries"), dbGet("customers"), dbGet("users"),
      dbGet("tasks"), dbGet("quotations"), dbGet("email_threads")
    ]);
    setEnquiries(enqs); setCustomers(custs); setUsers(usrs);
    setTasks(tsks); setQuotations(quots); setThreads(thrs);
    setLoading(false);
    showToast("✓ Synced from Supabase");
  }

  // ── Nav ──────────────────────────────────────────────────────────────────────
  const overdueTaskCount = tasks.filter(t => t.status !== "Done" && t.due_date && daysUntil(t.due_date) < 0).length;
  const overdueReminderCount = enquiries.filter(e => {
    const d = daysUntil(e.reminder_date);
    return d !== null && d <= 0 && !["PO Received", "Lost"].includes(e.stage);
  }).length;

  const TABS = [
    { id: "dashboard",  label: "Dashboard",  icon: "◈",  badge: overdueTaskCount > 0 ? overdueTaskCount : 0 },
    { id: "enquiries",  label: "Enquiries",  icon: "📋", badge: 0 },
    { id: "reminders",  label: "Reminders",  icon: "🔔", badge: overdueReminderCount },
    { id: "customers",  label: "Customers",  icon: "🏢", badge: 0 },
    { id: "products",   label: "Products",   icon: "🧪", badge: 0 },
    { id: "categories", label: "Categories", icon: "📂", badge: 0 },
    { id: "suppliers",  label: "Suppliers",  icon: "🏭", badge: 0 },
    { id: "users",      label: "Team",       icon: "👥", badge: 0 },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Arial,sans-serif" }}>
      {toast && (
        <div style={{ position: "fixed", top: 18, right: 18, zIndex: 999, background: toast.err ? C.red : C.green, color: "white", borderRadius: 9, padding: "9px 18px", fontSize: 12, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
          {toast.msg}
        </div>
      )}

      {loading && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(24,119,242,0.96)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14 }}>
          <img src={LOGO} alt="Ingredientz" style={{ height: 50, objectFit: "contain", background: "white", borderRadius: 8, padding: "6px 16px" }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", letterSpacing: 3, textTransform: "uppercase" }}>Loading from Supabase…</div>
          <div style={{ width: 180, height: 3, background: "rgba(255,255,255,0.3)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "white", borderRadius: 2, animation: "loadBar 1.4s ease-in-out infinite" }} />
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 215, background: "#1877F2", borderRight: "1px solid rgba(255,255,255,0.1)", zIndex: 10, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
          <img src={LOGO} alt="Ingredientz" style={{ width: "100%", height: 44, objectFit: "contain", objectPosition: "left center", background: "white", borderRadius: 7, padding: "5px 10px" }} />
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", letterSpacing: 3, textTransform: "uppercase", marginTop: 7 }}>Enquiry CRM</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: loading ? "#F5A623" : "#42B72A" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{loading ? "Loading…" : "Supabase Live"}</span>
            </div>
            <button onClick={handleRefresh} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, padding: "2px 8px", cursor: "pointer", color: "white", fontSize: 11 }}>↻</button>
          </div>
        </div>
        <nav style={{ padding: "12px 10px", flex: 1 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              width: "100%", textAlign: "left",
              background: activeTab === tab.id ? "rgba(255,255,255,0.2)" : "transparent",
              border: activeTab === tab.id ? "1px solid rgba(255,255,255,0.3)" : "1px solid transparent",
              borderRadius: 9, padding: "10px 13px", cursor: "pointer",
              color: activeTab === tab.id ? "white" : "rgba(255,255,255,0.75)",
              fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500,
              marginBottom: 3, display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <span>{tab.icon} {tab.label}</span>
              {tab.badge > 0 && <span style={{ background: C.red, color: "white", borderRadius: 20, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{tab.badge}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
          {[
            ["Enquiries", enquiries.length, "white"],
            ["Active", enquiries.filter(e => !["PO Received","Lost","No Response","Out of Scope"].includes(e.stage)).length, "#86efac"],
            ["Overdue", overdueReminderCount, overdueReminderCount > 0 ? C.red : "#86efac"]
          ].map(([l, v, col]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>{l}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: col }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: 215, padding: "24px 28px" }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, lineHeight: 1 }}>
            {TABS.find(t => t.id === activeTab)?.label}
          </h1>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        {activeTab === "dashboard"  && <Dashboard enquiries={enquiries} users={users} tasks={tasks} onTaskAdd={addTask} onTaskUpdate={updateTask} onTaskDelete={deleteTask} />}
        {activeTab === "enquiries"  && <EnquiriesTab enquiries={enquiries} customers={customers} users={users} onSelect={setSelectedEnq} onStageChange={stageChange} onDelete={deleteEnquiry} onAdd={addEnquiry} />}
        {activeTab === "reminders"  && <RemindersTab enquiries={enquiries} onSelect={e => { setSelectedEnq(e); setActiveTab("enquiries"); }} />}
        {activeTab === "customers"  && <CustomersTab customers={customers} onAdd={addCustomer} onUpdate={updateCustomer} onDelete={deleteCustomer} />}
        {activeTab === "products"   && <ProductsTab />}
        {activeTab === "categories" && <CategoriesTab />}
        {activeTab === "suppliers"  && <SuppliersTab />}
        {activeTab === "users"      && <UsersTab users={users} onAdd={addUser} onUpdate={updateUser} onDelete={deleteUser} />}
      </div>

      <EnquiryDrawer
        enq={selectedEnq}
        onClose={() => setSelectedEnq(null)}
        onStageChange={stageChange}
        onUpdate={updateEnquiry}
        customers={customers}
        users={users}
        quotations={quotations}
        threads={threads}
        onSaveQuotation={saveQuotation}
        onSendQuotationEmail={sendQuotationEmail}
        onLogEmail={logEmail}
      />

      <style>{`
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:#F0F2F5;}
        ::-webkit-scrollbar-thumb{background:#BCC0C4;border-radius:3px;}
        input[type="date"]::-webkit-calendar-picker-indicator{cursor:pointer;opacity:0.7;}
        @keyframes loadBar{0%{width:0%;margin-left:0}50%{width:60%;margin-left:20%}100%{width:0%;margin-left:100%}}
      `}</style>
    </div>
  );
}
