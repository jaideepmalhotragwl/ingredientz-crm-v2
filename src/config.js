import { createClient } from "@supabase/supabase-js";

export const SUPA_URL   = "https://eytoryygkxjslfvsqanl.supabase.co";
export const SUPA_KEY   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dG9yeXlna3hqc2xmdnNxYW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDA5MTUsImV4cCI6MjA5MDMxNjkxNX0.txYTl0Q06mKSfWGmWc8cOTmCN46tLcxF9_7RhBUHBRY";
export const RESEND_KEY = "re_5zF5tNDR_759Q9NboE6v88NoCmRiDQtdY";

export const supabase = createClient(SUPA_URL, SUPA_KEY);
