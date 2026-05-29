import { useState, useEffect } from "react";
import { supabase } from "./config.js";
import { C, STAGES } from "./constants.js";
import { dbGet, dbInsert, dbUpdate, dbDelete, sendEmail, getSenderEmail, buildEmailHtml, daysUntil } from "./utils.js";
import { uploadOrderDocument } from "./lib/orderUtils.js";
import { LOGO, QUOTATION_TEMPLATE } from "./templates.js";
import { Dashboard }       from "./components/Dashboard.jsx";
import { EnquiriesTab }    from "./components/EnquiriesTab.jsx";
import { OrdersTab }       from "./components/OrdersTab.jsx";
import { OrderForm }       from "./components/orders/OrderForm.jsx";
import { OrderDrawer }     from "./components/OrderDrawer.jsx";
import { RemindersTab }    from "./components/RemindersTab.jsx";
import { CustomersTab }    from "./components/CustomersTab.jsx";
import { ProductsTab }     from "./components/ProductsTab.jsx";
import { CategoriesTab }   from "./components/CategoriesTab.jsx";
import { SuppliersTab }    from "./components/SuppliersTab.jsx";
import { UsersTab }        from "./components/UsersTab.jsx";
import { DocumentsTab }    from "./components/DocumentsTab.jsx";
import { EnquiryDrawer }   from "./components/EnquiryDrawer.jsx";
import { ContentEngine }   from "./components/ContentEngine.jsx";
import { MarketIntelTab }  from "./components/MarketIntelTab.jsx";
import { ResearchConsoleTab } from "./components/ResearchConsoleTab.jsx";

export default function App() {
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState(null);
  const [enquiries, setEnquiries]   = useState([]);
  const [customers, setCustomers]   = useState([]);
  const [suppliers, setSuppliers]   = useState([]);
  const [users, setUsers]           = useState([]);
  const [tasks, setTasks]           = useState([]);
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
  const [activeTab, setActiveTab]   = useState("dashboard");
  const [selectedEnq, setSelectedEnq] = useState(null);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

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
      dbGet("order_shipments"), dbGet("order_status_history"), dbGet("suppliers")
    ]).then(([enqs, custs, usrs, tsks, quots, thrs, ords, oItems, spos, spoItems, invs, pays, ships, hist, sups]) => {
      setEnquiries(enqs); setCustomers(custs); setUsers(usrs);
      setTasks(tsks); setQuotations(quots); setThreads(thrs);
      setOrders(ords); setOrderItems(oItems);
      setSupplierPOs(spos); setSupplierPOItems(spoItems);
      setInvoices(invs); setPayments(pays); setShipments(ships);
      setStatusHistory(hist); setSuppliers(sups);
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

  async function addSupplierPO(poRow, poItemRows, pdfFile) {
    try {
      const newPO = await dbInsert("supplier_pos", poRow);
      if (!newPO) { showToast("✗ Failed to create supplier PO", true); return null; }
      if (pdfFile) {
        const order = orders.find(o => o.id === poRow.order_id);
        const { path, error } = await uploadOrderDocument(pdfFile, `orders/${order?.order_number || poRow.order_id}/supplier_po/${newPO.supplier_po_number}`);
        if (!error && path) {
          await dbUpdate("supplier_pos", newPO.id, { pdf_url: path });
          newPO.pdf_url = path;
        }
      }
      const itemsToInsert = poItemRows.map(it => ({ ...it, supplier_po_id: newPO.id }));
      const { data: savedItems } = await supabase.from("supplier_po_items").insert(itemsToInsert).select();
      setSupplierPOs(p => [newPO, ...p]);
      if (savedItems) setSupplierPOItems(p => [...savedItems, ...p]);
      if (poRow.order_id) {
        const order = orders.find(o => o.id === poRow.order_id);
        if (order?.status === "Received") {
          await updateOrderStatus(poRow.order_id, "Suppliers Assigned");
        }
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

  async function addInvoice(invoiceRow, file) {
    try {
      const newInv = await dbInsert("order_invoices", invoiceRow);
      if (!newInv) { showToast("✗ Failed to create invoice", true); return null; }
      if (file) {
        const order = orders.find(o => o.id === invoiceRow.order_id);
        const subfolder = invoiceRow.type === "customer" ? "customer_invoice" : "supplier_invoice";
        const { path, error } = await uploadOrderDocument(file, `orders/${order?.order_number || invoiceRow.order_id}/${subfolder}/${newInv.invoice_number}`);
        if (!error && path) {
          await dbUpdate("order_invoices", newInv.id, { file_url: path });
          newInv.file_url = path;
        }
      }
      setInvoices(p => [newInv, ...p]);
      if (invoiceRow.type === "customer" && invoiceRow.order_id) {
        const order = orders.find(o => o.id === invoiceRow.order_id);
        if (order?.status === "Confirmed" || order?.status === "Suppliers Assigned") {
          await updateOrderStatus(invoiceRow.order_id, "Invoiced");
        }
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
    const [enqs, custs, usrs, tsks, quots, thrs, ords, oItems, spos, spoItems, invs, pays, ships, hist, sups] = await Promise.all([
      dbGet("enquiries"), dbGet("customers"), dbGet("users"),
      dbGet("tasks"), dbGet("quotations"), dbGet("email_threads"),
      dbGet("orders"), dbGet("order_items"), dbGet("supplier_pos"),
      dbGet("supplier_po_items"), dbGet("order_invoices"), dbGet("order_payments"),
      dbGet("order_shipments"), dbGet("order_status_history"), dbGet("suppliers")
    ]);
    setEnquiries(enqs); setCustomers(custs); setUsers(usrs);
    setTasks(tsks); setQuotations(quots); setThreads(thrs);
    setOrders(ords); setOrderItems(oItems);
    setSupplierPOs(spos); setSupplierPOItems(spoItems);
    setInvoices(invs); setPayments(pays); setShipments(ships);
    setStatusHistory(hist); setSuppliers(sups);
    setLoading(false);
    showToast("✓ Synced from Supabase");
  }

  const overdueTaskCount = tasks.filter(t => t.status !== "Done" && t.due_date && daysUntil(t.due_date) < 0).length;
  const overdueReminderCount = enquiries.filter(e => {
    const d = daysUntil(e.reminder_date);
    return d !== null && d <= 0 && !["PO Received", "Lost"].includes(e.stage);
  }).length;
  const TABS = [
    { id: "dashboard",  label: "Dashboard",  icon: "◈",  badge: overdueTaskCount > 0 ? overdueTaskCount : 0 },
    { id: "enquiries",  label: "Enquiries",  icon: "📋", badge: 0 },
    { id: "orders",     label: "Orders",     icon: "📦", badge: 0 },
    { id: "reminders",  label: "Reminders",  icon: "🔔", badge: overdueReminderCount },
    { id: "customers",  label: "Customers",  icon: "🏢", badge: 0 },
    { id: "products",   label: "Products",   icon: "🧪", badge: 0 },
    { id: "categories", label: "Categories", icon: "📂", badge: 0 },
    { id: "suppliers",  label: "Suppliers",  icon: "🏭", badge: 0 },
    { id: "documents",  label: "Documents",  icon: "📄", badge: 0 },
    { id: "content",    label: "Content",    icon: "✍️", badge: 0 },
    { id: "marketintel", label: "Market Intel", icon: "📈", badge: 0 },
    { id: "research",   label: "Research",   icon: "🔬", badge: 0 },
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
        {activeTab === "dashboard"  && <Dashboard enquiries={enquiries} users={users} tasks={tasks} onTaskAdd={addTask} onTaskUpdate={updateTask} onTaskDelete={deleteTask} />}
        {activeTab === "enquiries"  && <EnquiriesTab enquiries={enquiries} customers={customers} users={users} onSelect={setSelectedEnq} onStageChange={stageChange} onDelete={deleteEnquiry} onAdd={addEnquiry} />}
        {activeTab === "orders"     && <OrdersTab orders={orders} customers={customers} onSelect={o => setSelectedOrder(o)} onNew={() => setOrderFormOpen(true)} />}
        {activeTab === "reminders"  && <RemindersTab enquiries={enquiries} onSelect={e => { setSelectedEnq(e); setActiveTab("enquiries"); }} />}
        {activeTab === "customers"  && <CustomersTab customers={customers} onAdd={addCustomer} onUpdate={updateCustomer} onDelete={deleteCustomer} />}
        {activeTab === "products"   && <ProductsTab />}
        {activeTab === "categories" && <CategoriesTab />}
        {activeTab === "suppliers"  && <SuppliersTab />}
        {activeTab === "documents"  && <DocumentsTab />}
        {activeTab === "content"    && <ContentEngine onDone={() => setActiveTab("dashboard")} />}
        {activeTab === "marketintel" && <MarketIntelTab />}
        {activeTab === "research"   && <ResearchConsoleTab />}
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
          onAddInvoice={addInvoice}
          onUpdateInvoice={updateInvoice}
          onAddPayment={addPayment}
          onAddShipment={addShipment}
          onUpdateShipment={updateShipment}
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