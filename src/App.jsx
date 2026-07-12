import { useState, useEffect } from "react";
import { supabase } from "./config.js";
import { C, STAGES } from "./constants.js";
import { dbGet, dbInsert, dbUpdate, dbDelete, sendEmail, getSenderEmail, buildEmailHtml, daysUntil } from "./utils.js";
import { uploadOrderDocument } from "./lib/orderUtils.js";
import { generateCustomerInvoice, generateSupplierPO } from "./lib/docGen.js";
import { LOGO, QUOTATION_TEMPLATE } from "./templates.js";
import { Dashboard }       from "./components/Dashboard.jsx";
import { EnquiriesTab }    from "./components/EnquiriesTab.jsx";
import { OrdersTab }       from "./components/OrdersTab.jsx";
import { OrderForm }       from "./components/orders/OrderForm.jsx";
import { OrderDrawer }     from "./components/OrderDrawer.jsx";
import { SamplesTab }      from "./components/SamplesTab.jsx";
import { SampleForm }      from "./components/SampleForm.jsx";
import { SampleDrawer }    from "./components/SampleDrawer.jsx";
import { RemindersTab }    from "./components/RemindersTab.jsx";
import { CustomersTab }    from "./components/CustomersTab.jsx";
import { ProductsTab }     from "./components/ProductsTab.jsx";
import { CategoriesTab }   from "./components/CategoriesTab.jsx";
import { SuppliersTab }    from "./components/SuppliersTab.jsx";
import { ApprovalsTab }    from "./components/ApprovalsTab.jsx";
import { UsersTab }        from "./components/UsersTab.jsx";
import { DocumentsTab }    from "./components/DocumentsTab.jsx";
import { EnquiryDrawer }   from "./components/EnquiryDrawer.jsx";
import { ContentEngine }   from "./components/ContentEngine.jsx";
import { MarketIntelTab }  from "./components/MarketIntelTab.jsx";
import { MarketSignals }   from "./components/MarketSignals.jsx";
import { ResearchConsoleTab } from "./components/ResearchConsoleTab.jsx";
import { TeamDesk }        from "./components/TeamDesk.jsx";   // ── Team Tracker (replaces Team Activity) ──
export default function App() {
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState(null);
  const [enquiries, setEnquiries]   = useState([]);
  const [customers, setCustomers]   = useState([]);
  const [suppliers, setSuppliers]   = useState([]);
  const [users, setUsers]           = useState([]);
  const [tasks, setTasks]           = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [threads, setThreads]       = useState([]);
  const [orders, setOrders]         = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [supplierPOs, setSupplierPOs] = useState([]);
  const [supplierPOItems, setSupplierPOItems] = useState([]);
  const [invoices, setInvoices]     = useState([]);
  const [payments, setPayments]     = useState([]);
  const [shipments, setShipments]   = useState([]);
  const [statusHistory, setStatusHistory] = useState([]);
  const [samples, setSamples]       = useState([]);
  const [activeTab, setActiveTab]   = useState("dashboard");
  const [selectedEnq, setSelectedEnq] = useState(null);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [sampleFormOpen, setSampleFormOpen] = useState(false);
  const [selectedSample, setSelectedSample] = useState(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  async function refreshPendingApprovals() {
    const [sup, prod] = await Promise.all([
      supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("supplier_products").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    ]);
    setPendingApprovals((sup.count || 0) + (prod.count || 0));
  }
  useEffect(() => { refreshPendingApprovals(); }, []);
  function showToast(msg, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  }
  useEffect(() => {
    Promise.all([
      dbGet("enquiries"), dbGet("customers"), dbGet("users"),
      dbGet("tasks"), dbGet("quotations"), dbGet("email_threads"),
      dbGet("orders"), dbGet("order_items"), dbGet("supplier_pos"),
      dbGet("supplier_po_items"), dbGet("order_invoices"), dbGet("order_payments"),
      dbGet("order_shipments"), dbGet("order_status_history"), dbGet("suppliers"),
      dbGet("daily_reports"), dbGet("samples")
    ]).then(([enqs, custs, usrs, tsks, quots, thrs, ords, oItems, spos, spoItems, invs, pays, ships, hist, sups, drpts, smpls]) => {
      setEnquiries(enqs); setCustomers(custs); setUsers(usrs);
      setTasks(tsks); setQuotations(quots); setThreads(thrs);
      setOrders(ords); setOrderItems(oItems);
      setSupplierPOs(spos); setSupplierPOItems(spoItems);
      setInvoices(invs); setPayments(pays); setShipments(ships);
      setStatusHistory(hist); setSuppliers(sups);
      setDailyReports(drpts || []);
      setSamples(smpls || []);
    }).finally(() => setLoading(false));
  }, []);
  // ── Enquiry ops ──────────────────────────────────────────────────────────────
  async function addEnquiry(row) {
    const data = await dbInsert("enquiries", row);
    if (data) {
      setEnquiries(p => [data, ...p]);
      showToast(`✓ Enquiry saved — ${row.customer_name}`);
      // Find suppliers mapped to this enquiry's products (normalised name match)
      const norm = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
      const enqProducts = Array.isArray(row.products) ? row.products : [];
      let supplierNames = [];
      try {
        const { data: maps } = await supabase
          .from("supplier_products")
          .select("suppliers(company,status),products(name)")
          .eq("status", "active");
        const wanted = new Set(enqProducts.map(p => norm(p.name)));
        const found = new Set();
        (maps || []).forEach(m => {
          if (m.products?.name && wanted.has(norm(m.products.name)) &&
              m.suppliers?.status === "active" && m.suppliers?.company) {
            found.add(m.suppliers.company);
          }
        });
        supplierNames = [...found];
      } catch (e) { console.error("RFQ supplier lookup:", e); }
      // "RFQ ready to send" alert → assigned rep + business addresses
      const repUser = users.find(x => x.name === row.assigned_to);
      const recipients = [
        repUser?.email,
        "jaideep.malhotra@gmail.com",
        "sales@ingredientz.co",
        "procurement@ingredientz.co"
      ].filter(Boolean);
      const to = [...new Set(recipients)].join(", ");
      const supplierLine = supplierNames.length
        ? supplierNames.join(", ")
        : "No mapped supplier yet — open the enquiry to add one";
      sendEmail({
        from: `Ingredientz CRM <sales@mail.ingredientz.co>`,
        to,
        subject: `RFQ ready to send — ${row.customer_name} [ENQ-${data.id}]`,
        html: buildEmailHtml("RFQ Ready to Send", "#1877F2", [
          `A new enquiry has been logged and an RFQ is ready to send.`,
          `<b>Ref:</b> ENQ-${data.id}${row.quarter_ref ? ` · ${row.quarter_ref}` : ""}`,
          `<b>Customer:</b> ${row.customer_name} (${row.country || "—"})`,
          `<b>Customer email:</b> ${row.customer_email || "—"}`,
          `<b>Products:</b> ${enqProducts.map(p => p.name).join(", ") || "—"}`,
          `<b>Suppliers:</b> ${supplierLine}`,
          `<b>Assigned to:</b> ${row.assigned_to || "—"}`,
          `Open the enquiry in the CRM → Forward RFQ to Suppliers → review and send.`
        ], "Ingredientz CRM · Auto-notification"),
        text: `RFQ ready for ${row.customer_name} (ENQ-${data.id}). Suppliers: ${supplierLine}. Open the enquiry to review and send.`
      });
      // ── Auto-acknowledgement to the customer (if we have their email) ──
      const custEmail = row.customer_email
        || customers.find(c => String(c.id) === String(row.customer_id))?.email
        || "";
      if (custEmail) {
        const firstName = (row.contact_person || "").split(" ")[0];
        sendEmail({
          from: `Ingredientz <sales@mail.ingredientz.co>`,
          to: custEmail,
          subject: `Thank you for your enquiry — Ingredientz`,
          html: buildEmailHtml("Thank you for your enquiry", "#1877F2", [
            `${firstName ? `Dear ${firstName},` : "Hello,"}`,
            `Thank you for reaching out to <b>Ingredientz</b>. We've received your enquiry${enqProducts.length ? ` for <b>${enqProducts.map(p => p.name).join(", ")}</b>` : ""} and our team is already looking into it.`,
            `One of our specialists will get back to you shortly with the next steps. If you'd like to add anything in the meantime, simply reply to this email.`,
            `Warm regards,<br>Team Ingredientz`
          ], "Ingredientz · Nutraceutical Ingredients"),
          text: `${firstName ? `Dear ${firstName},` : "Hello,"}\n\nThank you for reaching out to Ingredientz. We've received your enquiry and our team is already looking into it. We'll get back to you shortly with next steps.\n\nWarm regards,\nTeam Ingredientz`,
          reply_to: "sales@ingredientz.co"
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
  // ── Daily report ops (Team Activity / Team Desk) ───────────────────────────────
  // Upsert one row per rep per day (table has unique(user_name, report_date)).
  async function saveDailyReport(row) {
    try {
      const { data, error } = await supabase
        .from("daily_reports")
        .upsert(row, { onConflict: "user_name,report_date" })
        .select()
        .single();
      if (error) {
        console.error("saveDailyReport:", error);
        showToast("✗ Could not save report", true);
        return false;
      }
      setDailyReports(p => {
        const without = p.filter(r => !(r.user_name === data.user_name && r.report_date === data.report_date));
        return [data, ...without];
      });
      showToast("✓ Daily report saved");
      return true;
    } catch (e) {
      console.error("saveDailyReport error:", e);
      showToast("✗ Could not save report", true);
      return false;
    }
  }
  async function addCustomer(row)    { const data = await dbInsert("customers", row); if (data) { setCustomers(p => [data, ...p]); showToast(`✓ ${row.company} added`); } }
  async function updateCustomer(id, row) { await dbUpdate("customers", id, row); setCustomers(p => p.map(c => c.id === id ? { ...c, ...row } : c)); }
  async function deleteCustomer(id)  { await dbDelete("customers", id); setCustomers(p => p.filter(c => c.id !== id)); }
  async function addUser(row)    { const data = await dbInsert("users", row); if (data) { setUsers(p => [data, ...p]); showToast(`✓ ${row.name} added`); } }
  async function updateUser(id, row) { await dbUpdate("users", id, row); setUsers(p => p.map(u => u.id === id ? { ...u, ...row } : u)); }
  async function deleteUser(id)  { await dbDelete("users", id); setUsers(p => p.filter(u => u.id !== id)); }
  async function saveQuotation(row) {
    const data = await dbInsert("quotations", row);
    if (data) {
      setQuotations(p => [data, ...p]);
      showToast(`✓ Quotation v${row.version} saved`);
      await stageChange(row.enquiry_id, "Quotation Sent");
    }
  }
  async function sendQuotationEmail(enq, form, grandTotal, users, attachments) {
    const sender = getSenderEmail(enq.assigned_to, users);
    const custEmail = customers.find(c => c.id === enq.customer_id)?.email || "";
    const subject = QUOTATION_TEMPLATE.subject(enq.products || [], enq.customer_name, enq.id);
    const bodyText = QUOTATION_TEMPLATE.text(enq, form.items, grandTotal, form);
    const html = QUOTATION_TEMPLATE.html(enq, form.items, grandTotal, form);
    const emailPayload = { from: `Ingredientz Sales <${sender}>`, to: custEmail, subject, html, text: bodyText, reply_to: "sales@ingredientz.co" };
    if (attachments && attachments.length > 0) emailPayload.attachments = attachments;
    if (custEmail) {
      const res = await sendEmail(emailPayload);
      showToast(res?.id ? `✓ Quotation sent to ${custEmail}` : `✓ Quotation logged (check customer email)`);
      await scheduleSequence(enq, "quotation", custEmail, sender, [3, 7, 14]);
    } else {
      showToast("⚠ No customer email — quotation logged only");
    }
    const threadRow = { enquiry_id: enq.id, customer_name: enq.customer_name, direction: "auto-sent", subject, body: bodyText, from_email: sender, to_email: custEmail || enq.contact_person, sent_at: new Date().toISOString() };
    const data = await dbInsert("email_threads", threadRow);
    if (data) setThreads(p => [data, ...p]);
  }
  async function scheduleSequence(enq, type, toEmail, fromEmail, delayDays) {
    try {
      await supabase.from("email_sequences")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("enquiry_id", enq.id).eq("sequence_type", type)
        .is("sent_at", null).is("cancelled_at", null);
      const now = new Date();
      const rows = delayDays.map((days, idx) => {
        const sendAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        return {
          enquiry_id: enq.id, customer_name: enq.customer_name,
          sequence_type: type, step: idx + 1,
          scheduled_at: sendAt.toISOString(),
          to_email: toEmail, from_email: fromEmail,
          body_preview: (Array.isArray(enq.products) ? enq.products.map(p => p.name).join(", ") : "") || enq.customer_name
        };
      });
      await supabase.from("email_sequences").insert(rows);
      showToast(`✓ ${delayDays.length} follow-up reminders scheduled`);
    } catch(e) { console.error("scheduleSequence error:", e); }
  }
  async function logEmail(row) {
    const data = await dbInsert("email_threads", row);
    if (data) { setThreads(p => [data, ...p]); showToast("✓ Email logged"); }
  }
  // ── SAMPLE OPS ─────────────────────────────────────────────────────────────
  async function addSample(row) {
    const sample_number = `SR-${Date.now().toString().slice(-6)}`;
    const seed = {
      ...row,
      sample_number,
      stage: "Requested",
      requested_at: new Date().toISOString(),
      followup_loop: "supplier",
      next_followup_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      followup_count: 0
    };
    const data = await dbInsert("samples", seed);
    if (!data) { showToast("✗ Failed to create sample", true); return null; }
    setSamples(p => [data, ...p]);
    showToast(`✓ Sample ${sample_number} created`);
    await sendSampleRequest(data);
    return data;
  }
  // Fires the sample-request email to the supplier (same engine as the RFQ alert)
  async function sendSampleRequest(sample) {
    if (!sample?.supplier_email) { showToast("⚠ Sample saved — supplier has no email", true); return; }
    const lines = [
      `We'd like to request a sample for a customer evaluation.`,
      `<b>Product:</b> ${sample.product_name}`,
      `<b>Quantity:</b> ${sample.quantity || "—"} ${sample.unit || ""}`,
      sample.purpose ? `<b>Purpose:</b> ${sample.purpose}` : null,
      `<b>Ship to:</b> Ingredientz warehouse (address to follow on confirmation).`,
      `Please confirm availability, lead time and share the CoA. Reply here and we'll coordinate shipment.`
    ].filter(Boolean);
    const res = await sendEmail({
      from: `Ingredientz Procurement <procurement@mail.ingredientz.co>`,
      to: sample.supplier_email,
      subject: `Sample request — ${sample.product_name}${sample.quantity ? ` (${sample.quantity} ${sample.unit || ""})` : ""} [${sample.sample_number}]`,
      html: buildEmailHtml("Sample Request", "#8E44AD", lines, "Ingredientz Procurement"),
      text: `Sample request: ${sample.product_name} ${sample.quantity || ""} ${sample.unit || ""}. Please confirm availability, lead time and CoA, and ship to our warehouse.`,
      reply_to: "procurement@ingredientz.co",
      bcc: ["sales@ingredientz.co", "procurement@ingredientz.co"]
    });
    showToast(res?.id ? `✓ Sample request sent to ${sample.supplier_name}` : `✓ Sample request sent`);
  }
  async function updateSample(id, patch) {
    await dbUpdate("samples", id, { ...patch, updated_at: new Date().toISOString() });
    setSamples(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
    if (selectedSample?.id === id) setSelectedSample(s => ({ ...s, ...patch }));
  }
  // Advance to a stage, stamping the right timestamp + setting the follow-up loop
  async function advanceSample(sample, toStage, extra = {}) {
    const now = new Date().toISOString();
    const in3 = new Date(Date.now() + 3 * 86400000).toISOString();
    const stamp = {
      "Supplier Shipped":       { supplier_shipped_at: now },
      "Received at Warehouse":  { received_warehouse_at: now, followup_loop: null, next_followup_at: null },
      "Dispatched to Customer": { dispatched_customer_at: now, followup_loop: "customer", next_followup_at: in3, followup_count: 0 },
      "Customer Received":      { customer_received_at: now },
      "Feedback":               { feedback_at: now, followup_loop: null, next_followup_at: null }
    }[toStage] || {};
    await updateSample(sample.id, { stage: toStage, ...stamp, ...extra });
    showToast(`✓ ${sample.sample_number} → ${toStage}`);
  }
  // Manual chase — sends immediately and bumps the schedule
  async function sendSampleChase(sample, who) {
    const to = who === "supplier" ? sample.supplier_email : sample.customer_email;
    const name = who === "supplier" ? sample.supplier_name : sample.customer_name;
    if (!to) { showToast(`⚠ No ${who} email on file`, true); return; }
    const lines = who === "supplier"
      ? [`Following up on our sample request for <b>${sample.product_name}</b>${sample.quantity ? ` (${sample.quantity} ${sample.unit || ""})` : ""}.`,
         `Could you share dispatch status, tracking and the CoA? We're ready to receive at our warehouse.`]
      : [`Following up on the <b>${sample.product_name}</b> sample we sent over.`,
         `Have you had a chance to evaluate it? Your feedback helps us move things forward.`];
    const res = await sendEmail({
      from: who === "supplier" ? `Ingredientz Procurement <procurement@mail.ingredientz.co>` : `Ingredientz Sales <sales@mail.ingredientz.co>`,
      to,
      subject: who === "supplier"
        ? `Following up — sample request ${sample.product_name} [${sample.sample_number}]`
        : `Following up — your ${sample.product_name} sample [${sample.sample_number}]`,
      html: buildEmailHtml(who === "supplier" ? "Sample Follow-up" : "Sample Feedback Request", "#F5A623", lines, "Ingredientz"),
      text: lines.join(" ").replace(/<[^>]+>/g, ""),
      reply_to: who === "supplier" ? "procurement@ingredientz.co" : "sales@ingredientz.co"
    });
    const count = (sample.followup_count || 0) + 1;
    await updateSample(sample.id, {
      followup_count: count,
      last_followup_at: new Date().toISOString(),
      next_followup_at: new Date(Date.now() + (count >= 2 ? 7 : 3) * 86400000).toISOString()
    });
    showToast(res?.id ? `✓ Chase sent to ${name}` : `✓ Chase sent`);
  }
  // ── ORDER OPS ────────────────────────────────────────────────────────────────
  async function addOrder(orderRow, itemRows, poFile) {
    try {
      const newOrder = await dbInsert("orders", orderRow);
      if (!newOrder) { showToast("✗ Failed to create order", true); return null; }
      if (poFile) {
        const { path, error } = await uploadOrderDocument(poFile, `orders/${newOrder.order_number}/customer_po`);
        if (error) { showToast("⚠ Order saved but PDF upload failed", true); }
        else if (path) {
          await dbUpdate("orders", newOrder.id, { customer_po_file_url: path });
          newOrder.customer_po_file_url = path;
        }
      }
      const linesToInsert = itemRows.map(it => ({ ...it, order_id: newOrder.id }));
      const { data: savedItems, error: itemsError } = await supabase.from("order_items").insert(linesToInsert).select();
      if (itemsError) {
        console.error("order_items insert error:", itemsError);
        showToast("⚠ Order saved but line items failed", true);
      } else if (savedItems) {
        setOrderItems(p => [...savedItems, ...p]);
      }
      const { data: refreshed } = await supabase.from("orders").select("*").eq("id", newOrder.id).single();
      const finalOrder = refreshed || newOrder;
      setOrders(p => [finalOrder, ...p.filter(o => o.id !== finalOrder.id)]);
      const { data: newHist } = await supabase.from("order_status_history").select("*").eq("order_id", newOrder.id);
      if (newHist) setStatusHistory(p => [...newHist, ...p]);
      showToast(`✓ Order ${finalOrder.order_number} created`);
      return finalOrder;
    } catch (e) {
      console.error("addOrder error:", e);
      showToast("✗ Unexpected error creating order", true);
      return null;
    }
  }
  async function updateOrder(id, patch) {
    await dbUpdate("orders", id, patch);
    setOrders(p => p.map(o => o.id === id ? { ...o, ...patch } : o));
    if (selectedOrder?.id === id) setSelectedOrder(s => ({ ...s, ...patch }));
    showToast("✓ Order updated");
  }
  async function updateOrderStatus(id, status) {
    await dbUpdate("orders", id, { status });
    setOrders(p => p.map(o => o.id === id ? { ...o, status } : o));
    if (selectedOrder?.id === id) setSelectedOrder(s => ({ ...s, status }));
    const { data: hist } = await supabase.from("order_status_history").select("*").eq("order_id", id).order("changed_at", { ascending: false });
    if (hist) setStatusHistory(p => [...hist, ...p.filter(h => h.order_id !== id)]);
    showToast(`✓ Status → ${status}`);
  }
  async function addSupplierPO(poRow, poItemRows, pdfFile, opts = {}) {
    try {
      const newPO = await dbInsert("supplier_pos", poRow);
      if (!newPO) { showToast("✗ Failed to create supplier PO", true); return null; }

      const order = orders.find(o => o.id === poRow.order_id);
      let pdfPath = null;
      if (pdfFile) {
        const { path, error } = await uploadOrderDocument(pdfFile, `orders/${order?.order_number || poRow.order_id}/supplier_po/${newPO.supplier_po_number}`);
        if (!error && path) pdfPath = path;
      } else if (opts.autoPdf) {
        const supplier = suppliers.find(s => s.id === poRow.supplier_id);
        const enriched = (poItemRows || []).map(r => {
          const oi = orderItems.find(i => i.id === r.order_item_id) || {};
          return { ...r, product_name: oi.product_name, product_spec: oi.product_spec, unit: oi.unit };
        });
        try {
          const { path, error } = await generateSupplierPO({ order, po: newPO, poItems: enriched, supplier });
          if (!error && path) pdfPath = path; else showToast("⚠ PO saved — PDF generation failed", true);
        } catch (e) { console.error("generateSupplierPO:", e); showToast("⚠ PO saved — PDF generation failed", true); }
      }
      if (pdfPath) { await dbUpdate("supplier_pos", newPO.id, { pdf_url: pdfPath }); newPO.pdf_url = pdfPath; }

      const itemsToInsert = poItemRows.map(it => ({ ...it, supplier_po_id: newPO.id }));
      const { data: savedItems } = await supabase.from("supplier_po_items").insert(itemsToInsert).select();
      setSupplierPOs(p => [newPO, ...p]);
      if (savedItems) setSupplierPOItems(p => [...savedItems, ...p]);
      if (poRow.order_id && order?.status === "Received") {
        await updateOrderStatus(poRow.order_id, "Suppliers Assigned");
      }
      showToast(`✓ Supplier PO ${newPO.supplier_po_number} created`);
      return newPO;
    } catch (e) {
      console.error("addSupplierPO error:", e);
      showToast("✗ Failed to create supplier PO", true);
      return null;
    }
  }
  async function updateSupplierPO(id, patch) {
    await dbUpdate("supplier_pos", id, patch);
    setSupplierPOs(p => p.map(po => po.id === id ? { ...po, ...patch } : po));
    showToast("✓ Supplier PO updated");
  }
  async function addInvoice(invoiceRow, file, opts = {}) {
    try {
      const newInv = await dbInsert("order_invoices", invoiceRow);
      if (!newInv) { showToast("✗ Failed to create invoice", true); return null; }

      const order = orders.find(o => o.id === invoiceRow.order_id);
      const isCustomer = invoiceRow.invoice_type === "customer";
      let filePath = null;
      if (file) {
        const subfolder = isCustomer ? "customer_invoice" : "supplier_invoice";
        const { path, error } = await uploadOrderDocument(file, `orders/${order?.order_number || invoiceRow.order_id}/${subfolder}/${newInv.invoice_number}`);
        if (!error && path) filePath = path;
      } else if (isCustomer && opts.autoPdf) {
        const items = orderItems.filter(i => i.order_id === invoiceRow.order_id);
        const customer = customers.find(c => c.id === order?.customer_id);
        try {
          const { path, error } = await generateCustomerInvoice({ order, items, customer, invoice: newInv, proforma: opts.proforma });
          if (!error && path) filePath = path; else showToast("⚠ Invoice saved — PDF generation failed", true);
        } catch (e) { console.error("generateCustomerInvoice:", e); showToast("⚠ Invoice saved — PDF generation failed", true); }
      }
      if (filePath) { await dbUpdate("order_invoices", newInv.id, { file_url: filePath }); newInv.file_url = filePath; }

      setInvoices(p => [newInv, ...p]);
      if (isCustomer && invoiceRow.order_id && (order?.status === "Confirmed" || order?.status === "Suppliers Assigned")) {
        await updateOrderStatus(invoiceRow.order_id, "Invoiced");
      }
      showToast(`✓ Invoice ${newInv.invoice_number} logged`);
      return newInv;
    } catch (e) {
      console.error("addInvoice error:", e);
      showToast("✗ Failed to log invoice", true);
      return null;
    }
  }
  async function updateInvoice(id, patch) {
    await dbUpdate("order_invoices", id, patch);
    setInvoices(p => p.map(i => i.id === id ? { ...i, ...patch } : i));
    showToast("✓ Invoice updated");
  }
  // Rebuild the branded PDF for an existing supplier PO (no new record).
  async function regenerateSupplierPODoc(po) {
    try {
      const order = orders.find(o => o.id === po.order_id);
      const supplier = suppliers.find(s => s.id === po.supplier_id);
      const items = supplierPOItems.filter(pi => pi.supplier_po_id === po.id).map(pi => {
        const oi = orderItems.find(i => i.id === pi.order_item_id) || {};
        return { order_item_id: pi.order_item_id, quantity: pi.quantity, cost_per_unit: pi.cost_per_unit, product_name: oi.product_name, product_spec: oi.product_spec, unit: oi.unit };
      });
      showToast("Generating PO PDF…");
      const { path, error } = await generateSupplierPO({ order, po, poItems: items, supplier });
      if (error || !path) { showToast("✗ PDF generation failed", true); return; }
      await dbUpdate("supplier_pos", po.id, { pdf_url: path });
      setSupplierPOs(p => p.map(x => x.id === po.id ? { ...x, pdf_url: path } : x));
      showToast("✓ PO PDF regenerated");
    } catch (e) { console.error("regenerateSupplierPODoc:", e); showToast("✗ PDF generation failed", true); }
  }
  // Rebuild the branded PDF for an existing customer invoice.
  async function regenerateInvoiceDoc(inv) {
    try {
      if (inv.invoice_type !== "customer") { showToast("Only customer invoices are auto-generated", true); return; }
      const order = orders.find(o => o.id === inv.order_id);
      const items = orderItems.filter(i => i.order_id === inv.order_id);
      const customer = customers.find(c => c.id === order?.customer_id);
      showToast("Generating invoice PDF…");
      const { path, error } = await generateCustomerInvoice({ order, items, customer, invoice: inv });
      if (error || !path) { showToast("✗ PDF generation failed", true); return; }
      await dbUpdate("order_invoices", inv.id, { file_url: path });
      setInvoices(p => p.map(x => x.id === inv.id ? { ...x, file_url: path } : x));
      showToast("✓ Invoice PDF regenerated");
    } catch (e) { console.error("regenerateInvoiceDoc:", e); showToast("✗ PDF generation failed", true); }
  }
  async function addPayment(paymentRow) {
    try {
      const newPay = await dbInsert("order_payments", paymentRow);
      if (!newPay) { showToast("✗ Failed to log payment", true); return null; }
      setPayments(p => [newPay, ...p]);
      if (paymentRow.invoice_id) {
        const inv = invoices.find(i => i.id === paymentRow.invoice_id);
        if (inv) {
          const allPaymentsForInv = [...payments, newPay].filter(p => p.invoice_id === paymentRow.invoice_id);
          const totalPaid = allPaymentsForInv.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
          const invTotal = parseFloat(inv.total_amount || 0);
          let newStatus = "unpaid";
          if (totalPaid >= invTotal) newStatus = "paid";
          else if (totalPaid > 0) newStatus = "partial";
          if (newStatus !== inv.status) await updateInvoice(inv.id, { status: newStatus });
        }
      }
      if (paymentRow.type === "customer_payment_in" && paymentRow.order_id) {
        const order = orders.find(o => o.id === paymentRow.order_id);
        if (order && order.status === "Invoiced") {
          const allCustPayments = [...payments, newPay].filter(p => p.order_id === paymentRow.order_id && p.type === "customer_payment_in");
          const totalReceived = allCustPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
          if (totalReceived >= parseFloat(order.total_amount || 0)) {
            await updateOrderStatus(paymentRow.order_id, "Paid");
          }
        }
      }
      showToast("✓ Payment logged");
      return newPay;
    } catch (e) {
      console.error("addPayment error:", e);
      showToast("✗ Failed to log payment", true);
      return null;
    }
  }
  async function addShipment(shipmentRow) {
    try {
      const newShip = await dbInsert("order_shipments", shipmentRow);
      if (!newShip) { showToast("✗ Failed to log shipment", true); return null; }
      setShipments(p => [newShip, ...p]);
      if (shipmentRow.order_id) {
        const order = orders.find(o => o.id === shipmentRow.order_id);
        if (order) {
          if (shipmentRow.status === "delivered" && order.status !== "Delivered") {
            await updateOrderStatus(shipmentRow.order_id, "Delivered");
          } else if (shipmentRow.status === "in_transit" && !["Shipped", "Delivered"].includes(order.status)) {
            await updateOrderStatus(shipmentRow.order_id, "Shipped");
          }
        }
      }
      showToast("✓ Shipment logged");
      return newShip;
    } catch (e) {
      console.error("addShipment error:", e);
      showToast("✗ Failed to log shipment", true);
      return null;
    }
  }
  async function updateShipment(id, patch) {
    await dbUpdate("order_shipments", id, patch);
    setShipments(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
    showToast("✓ Shipment updated");
  }
  async function handleRefresh() {
    setLoading(true);
    const [enqs, custs, usrs, tsks, quots, thrs, ords, oItems, spos, spoItems, invs, pays, ships, hist, sups, drpts, smpls] = await Promise.all([
      dbGet("enquiries"), dbGet("customers"), dbGet("users"),
      dbGet("tasks"), dbGet("quotations"), dbGet("email_threads"),
      dbGet("orders"), dbGet("order_items"), dbGet("supplier_pos"),
      dbGet("supplier_po_items"), dbGet("order_invoices"), dbGet("order_payments"),
      dbGet("order_shipments"), dbGet("order_status_history"), dbGet("suppliers"),
      dbGet("daily_reports"), dbGet("samples")
    ]);
    setEnquiries(enqs); setCustomers(custs); setUsers(usrs);
    setTasks(tsks); setQuotations(quots); setThreads(thrs);
    setOrders(ords); setOrderItems(oItems);
    setSupplierPOs(spos); setSupplierPOItems(spoItems);
    setInvoices(invs); setPayments(pays); setShipments(ships);
    setStatusHistory(hist); setSuppliers(sups);
    setDailyReports(drpts || []);
    setSamples(smpls || []);
    refreshPendingApprovals();
    setLoading(false);
    showToast("✓ Synced from Supabase");
  }
  const overdueTaskCount = tasks.filter(t => t.status !== "Done" && t.due_date && daysUntil(t.due_date) < 0).length;
  const overdueReminderCount = enquiries.filter(e => {
    const d = daysUntil(e.reminder_date);
    return d !== null && d <= 0 && !["PO Received", "Lost"].includes(e.stage);
  }).length;
  // ── Team Desk: count reps who haven't filed today's Daily MIS (drives the tab badge) ──
  const todayStr = new Date().toISOString().slice(0, 10);
  const reportedTodaySet = new Set(
    dailyReports.filter(r => r.report_date === todayStr).map(r => r.user_name)
  );
  const missingReportCount = users.filter(
    u => (u.active !== false) && u.name && !reportedTodaySet.has(u.name)
  ).length;
  const TABS = [
    { id: "dashboard",  label: "Dashboard",  icon: "◈",  badge: 0 },
    { id: "enquiries",  label: "Enquiries",  icon: "📋", badge: 0 },
    { id: "orders",     label: "Orders",     icon: "📦", badge: 0 },
    { id: "samples",    label: "Samples",    icon: "🧫", badge: 0 },
    { id: "reminders",  label: "Reminders",  icon: "🔔", badge: overdueReminderCount },
    { id: "customers",  label: "Customers",  icon: "🏢", badge: 0 },
    { id: "products",   label: "Products",   icon: "🧪", badge: 0 },
    { id: "categories", label: "Categories", icon: "📂", badge: 0 },
    { id: "suppliers",  label: "Suppliers",  icon: "🏭", badge: 0 },
    { id: "approvals",  label: "Approvals",  icon: "✅", badge: pendingApprovals },
    { id: "documents",  label: "Documents",  icon: "📄", badge: 0 },
    { id: "content",    label: "Content",    icon: "✍️", badge: 0 },
    { id: "marketintel", label: "Market Intel", icon: "📈", badge: 0 },
    { id: "signals",    label: "Signals",    icon: "📡", badge: 0 },
    { id: "research",   label: "Research",   icon: "🔬", badge: 0 },
    { id: "teamdesk",   label: "Team Tracker", icon: "🎯", badge: missingReportCount },   // ── Team Tracker (replaces Team Activity) ──
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
        <nav style={{ padding: "12px 10px", flex: 1, overflowY: "auto" }}>
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
            ["Orders", orders.length, "#86efac"]
          ].map(([l, v, col]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>{l}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: col }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginLeft: 215, padding: "24px 28px" }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, lineHeight: 1 }}>
            {TABS.find(t => t.id === activeTab)?.label}
          </h1>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
        {activeTab === "dashboard"  && <Dashboard enquiries={enquiries} users={users} orders={orders} />}
        {activeTab === "enquiries"  && <EnquiriesTab enquiries={enquiries} customers={customers} users={users} quotations={quotations} onSelect={setSelectedEnq} onStageChange={stageChange} onDelete={deleteEnquiry} onAdd={addEnquiry} />}
        {activeTab === "orders"     && <OrdersTab orders={orders} customers={customers} onSelect={o => setSelectedOrder(o)} onNew={() => setOrderFormOpen(true)} />}
        {activeTab === "samples"    && <SamplesTab samples={samples} onSelect={s => setSelectedSample(s)} onNew={() => setSampleFormOpen(true)} />}
        {activeTab === "reminders"  && <RemindersTab enquiries={enquiries} onSelect={e => { setSelectedEnq(e); setActiveTab("enquiries"); }} />}
        {activeTab === "customers"  && <CustomersTab customers={customers} onAdd={addCustomer} onUpdate={updateCustomer} onDelete={deleteCustomer} />}
        {activeTab === "products"   && <ProductsTab />}
        {activeTab === "categories" && <CategoriesTab />}
        {activeTab === "suppliers"  && <SuppliersTab />}
        {activeTab === "approvals"  && <ApprovalsTab onChange={refreshPendingApprovals} />}
        {activeTab === "documents"  && <DocumentsTab />}
        {activeTab === "content"    && <ContentEngine onDone={() => setActiveTab("dashboard")} />}
        {activeTab === "marketintel" && <MarketIntelTab />}
        {activeTab === "signals"    && <MarketSignals />}
        {activeTab === "research"   && <ResearchConsoleTab />}
        {activeTab === "teamdesk"   && <TeamDesk supabase={supabase} users={users} dailyReports={dailyReports} onSaveReport={saveDailyReport} tasks={tasks} onTaskAdd={addTask} onTaskUpdate={updateTask} onTaskDelete={deleteTask} enquiries={enquiries} quotations={quotations} />}
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
        onThreadInserted={row => setThreads(p => [row, ...p])}
      />
      {orderFormOpen && (
        <OrderForm
          customers={customers}
          enquiries={enquiries}
          onClose={() => setOrderFormOpen(false)}
          onSave={addOrder}
        />
      )}
      {selectedOrder && (
        <OrderDrawer
          order={selectedOrder}
          orderItems={orderItems.filter(i => i.order_id === selectedOrder.id)}
          supplierPOs={supplierPOs.filter(po => po.order_id === selectedOrder.id)}
          supplierPOItems={supplierPOItems.filter(spi => supplierPOs.some(po => po.order_id === selectedOrder.id && po.id === spi.supplier_po_id))}
          invoices={invoices.filter(i => i.order_id === selectedOrder.id)}
          payments={payments.filter(p => p.order_id === selectedOrder.id)}
          shipments={shipments.filter(s => s.order_id === selectedOrder.id)}
          statusHistory={statusHistory.filter(h => h.order_id === selectedOrder.id)}
          customers={customers}
          suppliers={suppliers}
          onClose={() => setSelectedOrder(null)}
          onUpdateOrder={updateOrder}
          onUpdateStatus={updateOrderStatus}
          onAddSupplierPO={addSupplierPO}
          onUpdateSupplierPO={updateSupplierPO}
          onRegenPO={regenerateSupplierPODoc}
          onRegenInvoice={regenerateInvoiceDoc}
          onAddInvoice={addInvoice}
          onUpdateInvoice={updateInvoice}
          onAddPayment={addPayment}
          onAddShipment={addShipment}
          onUpdateShipment={updateShipment}
        />
      )}
      {sampleFormOpen && (
        <SampleForm
          customers={customers}
          suppliers={suppliers}
          onClose={() => setSampleFormOpen(false)}
          onSave={addSample}
        />
      )}
      {selectedSample && (
        <SampleDrawer
          sample={selectedSample}
          onClose={() => setSelectedSample(null)}
          onAdvance={advanceSample}
          onUpdate={updateSample}
          onChase={sendSampleChase}
          onResend={sendSampleRequest}
        />
      )}
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
