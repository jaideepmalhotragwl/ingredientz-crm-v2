// src/lib/labelData.js
// Data layer for the Labels module.
//
// >>> ADJUST THIS IMPORT to match your existing Supabase client in src/lib. <<<
// Open one of your other files (e.g. a file in src/components that already talks
// to Supabase) and copy exactly how it imports the client. It's usually one of:
//   import { supabase } from './supabase';
//   import supabase from './supabase';
import { supabase } from './supabase';

// Suppliers for the picker. Assumes columns id + name.
// If your supplier name column is different (e.g. company_name),
// change it in the .select() below.
export async function listSuppliers() {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) {
    console.warn('[labels] could not load suppliers:', error.message);
    return []; // fail soft — the form still works without a linked supplier
  }
  return data ?? [];
}

// Recent saved batches, for the reprint strip.
export async function listBatches(limit = 24) {
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Upload the supplier's scanned label to storage, return its public URL.
export async function uploadScan(file) {
  if (!file) return null;
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('batch-scans').upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('batch-scans').getPublicUrl(path);
  return data.publicUrl;
}

// Persist one batch record.
export async function saveBatch(payload) {
  const { data, error } = await supabase
    .from('batches')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}
