/* =========================================================================
   salesClient.js — read-only connection to the Sales CRM project
   ---------------------------------------------------------------------------
   Place at: src/salesClient.js   (Enquiry CRM repo)

   WHY THIS EXISTS
     `companies` (22,487 enriched records) lives in the Sales CRM Supabase
     project — a DIFFERENT database from this app's. No foreign keys, no
     joins. This second client calls the search_companies() RPC over there.

   CRITICAL — WHY persistSession IS FALSE
     Two Supabase clients in one browser share localStorage. With default
     settings the second client overwrites the first client's auth token
     under the same key, silently logging the user out of the Enquiry CRM.
     persistSession:false plus a distinct storageKey keeps them apart.

   ENV VARS — add BOTH in AWS Amplify → App settings → Environment variables
     VITE_SALES_SUPABASE_URL       https://gjkwzgcvpkllougwtlif.supabase.co
     VITE_SALES_SUPABASE_ANON_KEY  <Sales CRM anon key>

     Then redeploy — Vite bakes env vars in at BUILD time, so a running app
     will not pick them up.

     WATCH FOR TRAILING SPACES in the variable NAME when pasting into
     Amplify. A trailing space produces a Vite build that transforms 0
     modules in ~15ms and fails with no useful error.

   SCOPE
     Read-only. Only search_companies() is called, and that function returns
     company-level fields only — no contacts, no emails, no lead rows.
   ========================================================================= */

import { createClient } from '@supabase/supabase-js';

const SALES_URL = import.meta.env.VITE_SALES_SUPABASE_URL;
const SALES_KEY = import.meta.env.VITE_SALES_SUPABASE_ANON_KEY;

export const salesConfigured = Boolean(SALES_URL && SALES_KEY);

export const salesDb = salesConfigured
  ? createClient(SALES_URL, SALES_KEY, {
      auth: {
        persistSession:   false,          // do not touch this app's session
        autoRefreshToken: false,
        storageKey:       'ingredientz-sales-readonly',
      },
    })
  : null;

/**
 * Search the Sales CRM company master.
 * Returns [] rather than throwing, so the form degrades to manual entry
 * if the Sales CRM is unreachable or the env vars are missing.
 */
export async function searchCompanies(term, limit = 8) {
  if (!salesConfigured || !term || term.trim().length < 2) return [];
  try {
    const { data, error } = await salesDb.rpc('search_companies', {
      p_term:  term.trim(),
      p_limit: limit,
    });
    if (error) {
      console.warn('[salesClient] search_companies failed:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('[salesClient] unreachable:', e.message);
    return [];
  }
}
