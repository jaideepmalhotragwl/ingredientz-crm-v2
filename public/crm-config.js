// crm-config.js — connection details for the meetings page.
//
// Put this next to meetings.html in the Enquiry CRM's public/ folder and nobody
// is ever asked for a key again: not a new phone, not a private window, not a
// teammate opening the link for the first time.
//
// The anon key is the PUBLIC one. It is already in the CRM's own JavaScript
// bundle and is safe to serve here. Never put the service_role key in this
// file — that one is full read-write on the whole database with no expiry.

window.IZ_CRM = {
  url: 'https://eytoryygkxjslfvsqanl.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dG9yeXlna3hqc2xmdnNxYW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDA5MTUsImV4cCI6MjA5MDMxNjkxNX0.txYTl0Q06mKSfWGmWc8cOTmCN46tLcxF9_7RhBUHBRY',
};
