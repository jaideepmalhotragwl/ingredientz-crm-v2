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
