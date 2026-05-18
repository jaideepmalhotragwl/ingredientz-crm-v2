import { C } from "../constants.js";
import { supabase } from "../config.js";

// ── Order status workflow ────────────────────────────────────────────────────
export const ORDER_STATUSES = [
  "Received",
  "Suppliers Assigned",
  "Confirmed",
  "Invoiced",
  "Paid",
  "Shipped",
  "Delivered",
  "Cancelled"
];

export const ORDER_STATUS_COLORS = {
  "Received":            C.blue,
  "Suppliers Assigned":  "#8E44AD",
  "Confirmed":           C.amber,
  "Invoiced":            "#E2C47A",
  "Paid":                C.green,
  "Shipped":             C.green,
  "Delivered":           C.green,
  "Cancelled":           C.red
};

export const SUPPLIER_PO_STATUSES = ["draft", "sent", "confirmed", "shipped"];
export const SUPPLIER_PO_STATUS_COLORS = {
  "draft":     C.muted,
  "sent":      C.blue,
  "confirmed": C.amber,
  "shipped":   C.green
};

export const INVOICE_STATUSES = ["unpaid", "partial", "paid", "overdue"];
export const INVOICE_STATUS_COLORS = {
  "unpaid":  C.red,
  "partial": C.amber,
  "paid":    C.green,
  "overdue": C.red
};

export const SHIPMENT_STATUSES = ["preparing", "in_transit", "customs", "delivered", "delayed"];
export const SHIPMENT_STATUS_COLORS = {
  "preparing":  C.muted,
  "in_transit": C.blue,
  "customs":    C.amber,
  "delivered":  C.green,
  "delayed":    C.red
};

export const SHIPMENT_ROUTES = [
  { value: "direct_to_customer",   label: "Direct to customer" },
  { value: "via_warehouse",        label: "Via our warehouse" },
  { value: "direct_from_supplier", label: "Direct from supplier" }
];

export const CURRENCIES = ["USD", "EUR", "INR", "GBP"];

export const CURRENCY_SYMBOLS = {
  USD: "$", EUR: "€", INR: "₹", GBP: "£"
};

// ── Formatters ───────────────────────────────────────────────────────────────
export function fmtMoney(amount, currency = "USD") {
  if (amount === null || amount === undefined) return "—";
  const symbol = CURRENCY_SYMBOLS[currency] || "";
  const formatted = Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${symbol}${formatted}`;
}

export function fmtMoneyShort(amount, currency = "USD") {
  if (amount === null || amount === undefined) return "—";
  const symbol = CURRENCY_SYMBOLS[currency] || "";
  const n = Number(amount);
  if (n >= 1000000) return `${symbol}${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${symbol}${(n / 1000).toFixed(1)}K`;
  return `${symbol}${n.toFixed(0)}`;
}

// ── Calculations ─────────────────────────────────────────────────────────────
export function calcLineTotal(quantity, unitPrice) {
  const q = parseFloat(quantity) || 0;
  const p = parseFloat(unitPrice) || 0;
  return q * p;
}

export function calcOrderTotal(items) {
  if (!items || !items.length) return 0;
  return items.reduce((sum, item) => sum + calcLineTotal(item.quantity, item.customer_unit_price), 0);
}

export function calcSupplierPOTotal(poItems) {
  if (!poItems || !poItems.length) return 0;
  return poItems.reduce((sum, item) => sum + calcLineTotal(item.quantity, item.cost_per_unit), 0);
}

export function calcMargin(sellPrice, costPrice) {
  const s = parseFloat(sellPrice) || 0;
  const c = parseFloat(costPrice) || 0;
  if (s === 0) return { absolute: 0, percent: 0 };
  return {
    absolute: s - c,
    percent: ((s - c) / s) * 100
  };
}

// ── Display helpers ──────────────────────────────────────────────────────────
export function getRouteLabel(routeValue) {
  return SHIPMENT_ROUTES.find(r => r.value === routeValue)?.label || routeValue;
}

export function getSourceLabel(source) {
  return source === "enquiry" ? "From enquiry" : "Direct";
}

export function getSourceColor(source) {
  return source === "enquiry" ? "#8E44AD" : C.muted;
}

// ── Storage helpers (Supabase bucket: order-documents) ───────────────────────

/**
 * Make a string safe to use in a file path.
 */
export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Upload a File object to the order-documents bucket.
 * Returns { path, error }.
 *
 * Path convention:
 *   orders/{order_number}/customer_po/{timestamp}-{filename}
 *   orders/{order_number}/customer_invoice/{...}
 *   orders/{order_number}/supplier_po/{supplier_po_number}/{...}
 *   orders/{order_number}/supplier_invoice/{supplier_po_number}/{...}
 */
export async function uploadOrderDocument(file, pathPrefix) {
  if (!file) return { path: null, error: null };
  const timestamp = Date.now();
  const safeName = slugify(file.name.replace(/\.[^.]+$/, "")) +
                   (file.name.match(/\.[^.]+$/)?.[0] || "");
  const fullPath = `${pathPrefix}/${timestamp}-${safeName}`;
  const { error } = await supabase.storage
    .from("order-documents")
    .upload(fullPath, file, { cacheControl: "3600", upsert: false });
  if (error) {
    console.error("Upload error:", error);
    return { path: null, error };
  }
  return { path: fullPath, error: null };
}

/**
 * Get a signed URL for a stored document so it can be viewed/downloaded.
 * Returns { url, error }. URL valid for 1 hour.
 */
export async function getOrderDocumentUrl(path) {
  if (!path) return { url: null, error: null };
  const { data, error } = await supabase.storage
    .from("order-documents")
    .createSignedUrl(path, 3600);
  if (error) {
    console.error("Signed URL error:", error);
    return { url: null, error };
  }
  return { url: data.signedUrl, error: null };
}

/**
 * Delete a stored document by path.
 */
export async function deleteOrderDocument(path) {
  if (!path) return { error: null };
  const { error } = await supabase.storage
    .from("order-documents")
    .remove([path]);
  if (error) console.error("Delete error:", error);
  return { error };
}
