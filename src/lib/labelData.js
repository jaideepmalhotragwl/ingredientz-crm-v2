// src/lib/labelData.js
// Data layer for the Labels module. Uses the same Supabase client as the rest
// of the app (exported from config.js).
import { supabase } from "../config.js";

// Suppliers for the picker. Your suppliers table stores the name in `company`.
// (Only used if the component isn't given a suppliers list as a prop.)
export async function listSuppliers() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, company")
    .order("company", { ascending: true });
  if (error) {
    console.warn("[labels] could not load suppliers:", error.message);
    return [];
  }
  return data ?? [];
}

// Recent saved batches, for the reprint strip.
export async function listBatches(limit = 24) {
  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Upload the supplier's scanned label to storage, return its public URL.
export async function uploadScan(file) {
  if (!file) return null;
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("batch-scans").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("batch-scans").getPublicUrl(path);
  return data.publicUrl;
}

// Persist one batch record.
export async function saveBatch(payload) {
  const { data, error } = await supabase
    .from("batches")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Read the supplier scan with Claude vision and return the six label fields.
// Uses the dedicated `extract-batch-label` edge function (separate from the
// website's `extract-label` Supplement-Facts reader).
export async function extractLabelBatch(file) {
  if (!file) throw new Error("no scan to read");
  const file_base64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke("extract-batch-label", {
    body: { file_base64, media_type: file.type || "image/jpeg" },
  });
  if (error) throw new Error(error.message || "vision call failed");
  if (!data?.ok) throw new Error(data?.error || "could not read the label");
  return data.fields || {};
}

// Read a File as raw base64 (strips the "data:...;base64," prefix).
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("could not read file"));
    r.readAsDataURL(file);
  });
}
