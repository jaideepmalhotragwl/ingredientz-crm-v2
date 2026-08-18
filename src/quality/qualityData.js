// =====================================================================
// Quality Portal · all database access
//
// Every conversation with Supabase happens in this file. Nothing else in
// the quality folder talks to the database directly, so if a table name
// is ever wrong there is exactly one place to fix it.
//
// The import below points at src/config.js, which is where your Enquiry
// CRM already keeps its Supabase client. Confirmed from App.jsx.
// =====================================================================

import { supabase } from "../config.js";

import {
  productKey,
  requiredDocsFor,
  DOC_TYPES,
  IGNORED_ORDER_STATUSES
} from "./qualityConfig.js";

// =====================================================================
// AUDIT — fire and forget, never blocks the screen
// =====================================================================
export function logQcAudit(actor, action, objectType, objectRef, detail) {
  supabase
    .from("qc_audit")
    .insert({
      actor: actor || "unknown",
      action,
      object_type: objectType || null,
      object_ref: objectRef || null,
      detail: detail || null
    })
    .then(() => {}, () => {});
}

// =====================================================================
// THE QUEUE — every open order with its quality position
// =====================================================================
export async function loadQualityQueue() {
  const [ordersRes, customersRes, itemsRes, posRes, poItemsRes, suppliersRes, filesRes, docsRes] =
    await Promise.all([
      supabase.from("orders")
        .select("id, order_number, customer_id, customer_po_number, customer_po_date, expected_delivery_date, status, owner, assigned_to, archived_at, created_at")
        .is("archived_at", null),
      supabase.from("customers").select("id, company, country"),
      supabase.from("order_items").select("id, order_id, line_number, product_name, product_spec, quantity, unit"),
      supabase.from("supplier_pos").select("id, order_id, supplier_id, supplier_po_number, status, expected_ship_date"),
      supabase.from("supplier_po_items").select("id, supplier_po_id, order_item_id, quantity, lot_number"),
      supabase.from("suppliers").select("id, company, country"),
      supabase.from("qc_files").select("id, order_id, status, cleared_at, cleared_by"),
      supabase.from("qc_line_docs").select("id, order_id, status, required, orphaned")
    ]);

  const err = [ordersRes, customersRes, itemsRes, posRes, poItemsRes, suppliersRes, filesRes, docsRes]
    .find(r => r.error);
  if (err) throw err.error;

  const customers = customersRes.data || [];
  const items     = itemsRes.data || [];
  const pos       = posRes.data || [];
  const poItems   = poItemsRes.data || [];
  const suppliers = suppliersRes.data || [];
  const files     = filesRes.data || [];
  const docs      = (docsRes.data || []).filter(d => d.required && !d.orphaned);

  const custById = Object.fromEntries(customers.map(c => [c.id, c]));
  const supById  = Object.fromEntries(suppliers.map(s => [s.id, s]));

  const rows = (ordersRes.data || [])
    .filter(o => !IGNORED_ORDER_STATUSES.includes(o.status))
    .map(o => {
      const myItems   = items.filter(i => i.order_id === o.id);
      const myPos     = pos.filter(p => p.order_id === o.id);
      const myPoIds   = myPos.map(p => p.id);
      const myPoItems = poItems.filter(pi => myPoIds.includes(pi.supplier_po_id));
      const myDocs    = docs.filter(d => d.order_id === o.id);
      const file      = files.find(f => f.order_id === o.id) || null;

      const verified  = myDocs.filter(d => d.status === "verified").length;
      const rejected  = myDocs.filter(d => d.status === "rejected").length;
      const toReview  = myDocs.filter(d => d.status === "received").length;
      const total     = myDocs.length;

      // Which bucket does this order sit in?
      let qc = "work";
      let qcLabel = "Needs quality work";

      if (file?.status === "cleared") {
        qc = "done"; qcLabel = "Cleared";
      } else if (myPoItems.length === 0) {
        qc = "wait"; qcLabel = "Waiting on suppliers";
      } else if (rejected > 0) {
        qc = "work"; qcLabel = rejected + " rejected";
      } else if (total > 0 && verified === total) {
        qc = "ready"; qcLabel = "Ready to clear";
      } else if (toReview > 0) {
        qc = "work"; qcLabel = toReview + " to review";
      } else if (total === 0) {
        qc = "work"; qcLabel = "Not yet built";
      } else {
        qc = "work"; qcLabel = "Awaiting suppliers";
      }

      const supplierNames = [...new Set(
        myPos.map(p => supById[p.supplier_id]?.company).filter(Boolean)
      )];

      return {
        order: o,
        qcFile: file,
        customer: custById[o.customer_id] || null,
        lineCount: myItems.length,
        supplierCount: supplierNames.length,
        supplierNames,
        docsVerified: verified,
        docsTotal: total,
        qc,
        qcLabel
      };
    });

  return rows;
}

// =====================================================================
// COUNTS for the sidebar and the bell
// =====================================================================
export async function loadUnreadNotifications() {
  const { data, error } = await supabase
    .from("qc_notifications")
    .select("id, kind, order_id, ref, message, created_at")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data || [];
}

export async function markNotificationsRead(ids) {
  if (!ids?.length) return;
  await supabase
    .from("qc_notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids);
}

// =====================================================================
// ONE ORDER — everything needed to draw the quality file
// =====================================================================
export async function loadOrderQcFile(orderId) {
  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select("id, order_number, customer_id, customer_po_number, customer_po_date, expected_delivery_date, status, owner, assigned_to, created_at")
    .eq("id", orderId)
    .single();
  if (oErr) throw oErr;

  const [customerRes, itemsRes, posRes, poItemsRes, suppliersRes, fileRes, reqRes] =
    await Promise.all([
      supabase.from("customers").select("id, company, country").eq("id", order.customer_id).maybeSingle(),
      supabase.from("order_items")
        .select("id, order_id, line_number, product_name, product_spec, quantity, unit")
        .eq("order_id", orderId).order("line_number"),
      supabase.from("supplier_pos")
        .select("id, order_id, supplier_id, supplier_po_number, status, expected_ship_date")
        .eq("order_id", orderId),
      supabase.from("supplier_po_items").select("id, supplier_po_id, order_item_id, quantity, lot_number"),
      supabase.from("suppliers").select("id, company, country, contact_email, email"),
      supabase.from("qc_files").select("*").eq("order_id", orderId).maybeSingle(),
      supabase.from("qc_doc_requests")
        .select("id, supplier_po_id, supplier_name, reminder_number, sent_at, doc_count")
        .eq("order_id", orderId).order("sent_at", { ascending: false })
    ]);

  const items   = itemsRes.data || [];
  const pos     = posRes.data || [];
  const poIds   = pos.map(p => p.id);
  const poItems = (poItemsRes.data || []).filter(pi => poIds.includes(pi.supplier_po_id));

  // Make sure a quality file row exists (normally the trigger did this)
  let qcFile = fileRes.data;
  if (!qcFile) {
    const { data, error } = await supabase
      .from("qc_files").insert({ order_id: orderId }).select().single();
    if (error) throw error;
    qcFile = data;
  }

  // Product profiles for every product on this order
  const keys = [...new Set(items.map(i => productKey(i.product_name)))];
  const { data: profiles } = keys.length
    ? await supabase.from("qc_product_profiles").select("*").in("product_key", keys)
    : { data: [] };
  const profileByKey = Object.fromEntries((profiles || []).map(p => [p.product_key, p]));

  // Build any document rows that are missing, then read them all back
  await ensureLineDocs({ qcFile, order, items, pos, poItems, profileByKey });

  const { data: docs, error: dErr } = await supabase
    .from("qc_line_docs").select("*").eq("qc_file_id", qcFile.id);
  if (dErr) throw dErr;

  return {
    order,
    customer: customerRes.data || null,
    qcFile,
    items,
    pos,
    poItems,
    suppliers: suppliersRes.data || [],
    profileByKey,
    docs: docs || [],
    requests: reqRes.data || []
  };
}

// =====================================================================
// BUILD THE MATRIX
//
// For every order line that has a supplier assigned, and whose product
// has a profile, make sure one document row exists per required type.
// Runs every time the file is opened. Existing rows are never touched,
// so nothing you have already verified can be overwritten.
// =====================================================================
export async function ensureLineDocs({ qcFile, order, items, pos, poItems, profileByKey }) {
  const { data: existing } = await supabase
    .from("qc_line_docs")
    .select("id, order_item_id, supplier_po_item_id, doc_type")
    .eq("qc_file_id", qcFile.id);

  const have = new Set(
    (existing || []).map(d => `${d.order_item_id}|${d.supplier_po_item_id}|${d.doc_type}`)
  );

  const itemById = Object.fromEntries(items.map(i => [i.id, i]));
  const poById   = Object.fromEntries(pos.map(p => [p.id, p]));
  const toInsert = [];

  for (const pi of poItems) {
    const item = itemById[pi.order_item_id];
    const po   = poById[pi.supplier_po_id];
    if (!item || !po) continue;

    const profile = profileByKey[productKey(item.product_name)];
    const rule = requiredDocsFor(profile);
    if (!rule) continue;                      // no profile yet, nothing to build

    for (const t of DOC_TYPES) {
      const isRequired = rule.required.includes(t.key);
      if (!isRequired) continue;
      const sig = `${item.id}|${pi.id}|${t.key}`;
      if (have.has(sig)) continue;

      toInsert.push({
        qc_file_id: qcFile.id,
        order_id: order.id,
        order_item_id: item.id,
        supplier_po_id: po.id,
        supplier_po_item_id: pi.id,
        supplier_id: po.supplier_id,
        product_name: item.product_name,
        doc_type: t.key,
        status: "required",
        required: true,
        requirement_note: t.key === "additional" ? rule.note : null,
        lot_number: pi.lot_number || null
      });
    }
  }

  if (toInsert.length) {
    await supabase.from("qc_line_docs").insert(toInsert);
  }
  return toInsert.length;
}

// =====================================================================
// PRODUCT PROFILE — set once, reused forever
// =====================================================================
export async function saveProductProfile(productName, flags, actor) {
  const key = productKey(productName);
  const row = {
    product_key: key,
    product_name: productName,
    is_organic:        !!flags.is_organic,
    is_animal_derived: !!flags.is_animal_derived,
    is_botanical:      !!flags.is_botanical,
    is_probiotic:      !!flags.is_probiotic,
    has_allergen:      !!flags.has_allergen,
    set_by: actor || null,
    set_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("qc_product_profiles")
    .upsert(row, { onConflict: "product_key" })
    .select()
    .single();
  if (error) throw error;

  logQcAudit(actor, "Product profile set", "product", productName,
    Object.keys(flags).filter(k => flags[k]).join(", ") || "standard");
  return data;
}

export async function loadAllProfiles() {
  const { data, error } = await supabase
    .from("qc_product_profiles").select("*").order("product_name");
  if (error) throw error;
  return data || [];
}

// =====================================================================
// ONE DOCUMENT — upload, verify, reject
// =====================================================================
export async function uploadDocFile(docRow, file, actor) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `order-${docRow.order_id}/${docRow.id}-${Date.now()}-${safe}`;

  const { error: upErr } = await supabase.storage
    .from("qc-docs").upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("qc_line_docs")
    .update({
      file_url: path,
      file_name: file.name,
      status: "received",
      received_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", docRow.id)
    .select()
    .single();
  if (error) throw error;

  logQcAudit(actor, "Document uploaded", "order", String(docRow.order_id),
    `${docRow.doc_type} · ${docRow.product_name} · ${file.name}`);
  return data;
}

export async function getDocDownloadUrl(path) {
  const { data, error } = await supabase.storage
    .from("qc-docs").createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function verifyDoc(docRow, actor) {
  const { data, error } = await supabase
    .from("qc_line_docs")
    .update({
      status: "verified",
      reviewed_by: actor || null,
      reviewed_at: new Date().toISOString(),
      reject_reason: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", docRow.id).select().single();
  if (error) throw error;

  logQcAudit(actor, "Document verified", "order", String(docRow.order_id),
    `${docRow.doc_type} · ${docRow.product_name}`);
  return data;
}

export async function rejectDoc(docRow, reason, actor) {
  const { data, error } = await supabase
    .from("qc_line_docs")
    .update({
      status: "rejected",
      reject_reason: reason,
      reviewed_by: actor || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", docRow.id).select().single();
  if (error) throw error;

  logQcAudit(actor, "Document rejected", "order", String(docRow.order_id),
    `${docRow.doc_type} · ${docRow.product_name} — ${reason}`);
  return data;
}

// =====================================================================
// LOT NUMBER — entered by your team, saved on the supplier PO line
// =====================================================================
export async function saveLotNumber(poItemId, lot, actor, orderId) {
  const { error } = await supabase
    .from("supplier_po_items")
    .update({ lot_number: lot || null })
    .eq("id", poItemId);
  if (error) throw error;

  await supabase
    .from("qc_line_docs")
    .update({ lot_number: lot || null, updated_at: new Date().toISOString() })
    .eq("supplier_po_item_id", poItemId);

  logQcAudit(actor, "Lot number entered", "order", String(orderId), lot || "(cleared)");
}

// =====================================================================
// CHASING SUPPLIERS
// =====================================================================
export async function logDocRequest({ qcFile, order, po, supplierName, toEmail, subject, body, docCount, reminderNumber, actor }) {
  const next = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

  const { error } = await supabase.from("qc_doc_requests").insert({
    qc_file_id: qcFile.id,
    order_id: order.id,
    supplier_po_id: po?.id || null,
    supplier_id: po?.supplier_id || null,
    supplier_name: supplierName || null,
    to_email: toEmail || null,
    subject, body,
    doc_count: docCount || 0,
    reminder_number: reminderNumber || 0,
    sent_by: actor || null,
    next_reminder_at: next
  });
  if (error) throw error;

  // Anything still sitting at "required" becomes "requested"
  await supabase
    .from("qc_line_docs")
    .update({ status: "requested", requested_at: new Date().toISOString() })
    .eq("qc_file_id", qcFile.id)
    .eq("supplier_po_id", po?.id)
    .eq("status", "required");

  logQcAudit(actor, reminderNumber ? `Reminder ${reminderNumber} sent` : "Documents requested",
    "order", order.order_number, `${supplierName} · ${docCount} document(s)`);
}

// =====================================================================
// CLEARING AN ORDER
// =====================================================================
export async function clearOrderQc(qcFile, orderNumber, actor) {
  const { error } = await supabase
    .from("qc_files")
    .update({
      status: "cleared",
      cleared_by: actor || null,
      cleared_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", qcFile.id);
  if (error) throw error;

  logQcAudit(actor, "Order cleared by quality", "order", orderNumber, null);
}

export async function reopenOrderQc(qcFile, orderNumber, reason, actor) {
  const { error } = await supabase
    .from("qc_files")
    .update({
      status: "open", cleared_by: null, cleared_at: null,
      notes: reason, updated_at: new Date().toISOString()
    })
    .eq("id", qcFile.id);
  if (error) throw error;

  logQcAudit(actor, "Quality clearance withdrawn", "order", orderNumber, reason);
}

// =====================================================================
// AUDIT TRAIL for the audit tab
// =====================================================================
export async function loadAuditTrail(limit = 200) {
  const { data, error } = await supabase
    .from("qc_audit").select("*")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

// =====================================================================
// WHO IS USING THE PORTAL
//
// The Enquiry CRM has no logged-in user — it reads a users table but
// never tracks who is sitting at the screen. The quality portal asks
// once, then remembers, so the audit trail names a person rather than
// saying "unknown" against every verification.
// =====================================================================
export async function loadQualityUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, active")
    .order("name");
  if (error) throw error;
  return (data || []).filter(u => u.active !== false && u.name);
}
