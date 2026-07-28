/* ==========================================================================
   INGREDIENTZ — letterhead CSS as a JavaScript string
   v1.0

   Why this file exists: the Documents module renders into a new window with
   document.write(). A CSS import can't reach that window, so the stylesheet
   has to travel as a string and be written into the popup's <style> tag.

   It is the same letterhead as letterhead.css, plus:
     · .lh-dense  — tighter typography for technical documents (CoA, SDS, TDS)
     · watermark and stamp support
     · A4 print geometry
     · LEGACY SELECTORS — plain <table>, .doc-title, .doc-ref, .section,
       .conclusion, blockquote and .stamp-placeholder are all styled, so HTML
       coming out of docTemplates.js and the reformat-document Edge Function
       keeps working untouched. Do not remove these; nothing tells you they
       broke except a customer receiving an unstyled CoA.

   If you change letterhead.css, mirror the change here.
   ========================================================================== */

export const LETTERHEAD_CSS = `
/* ---------- brand tokens ---------- */
:root{
  --inz-navy:#10314F;
  --inz-teal:#1B9AD6;
  --inz-ink:#1C2733;
  --inz-slate:#5A6875;
  --inz-hair:#D8DEE4;
  --inz-tint:#F2F7FA;
  --inz-serif:'Source Serif 4', Georgia, 'Times New Roman', serif;
  --inz-sans:'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;

  /* A4 geometry */
  --inz-page-w:210mm;
  --inz-page-h:297mm;
  --inz-side:18mm;
  --inz-head-t:16mm;
  --inz-foot-b:14mm;
  --inz-top:50mm;
  --inz-bottom:34mm;
}

html,body{ margin:0; padding:0; }
body{ background:#e5e7eb; font-family:var(--inz-sans); color:var(--inz-ink); }

/* ---------- the sheet ---------- */
.lh-doc{
  position:relative;
  width:var(--inz-page-w);
  min-height:var(--inz-page-h);
  margin:0 auto;
  background:#fff;
  font-size:11pt;
  line-height:1.62;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}

/* ---------- header ---------- */
.lh-header{
  position:absolute;
  top:var(--inz-head-t); left:var(--inz-side); right:var(--inz-side);
  text-align:center;
}
.lh-logo{ height:15mm; width:auto; display:inline-block; }
.lh-rule{ height:3px; background:var(--inz-navy); }
.lh-rule-thin{ height:1px; background:var(--inz-teal); margin-top:3px; }
.lh-header .lh-rule{ margin-top:7.5mm; }

/* ---------- footer ---------- */
.lh-footer{
  position:absolute;
  bottom:var(--inz-foot-b); left:var(--inz-side); right:var(--inz-side);
  text-align:center;
}
.lh-addr{
  font-family:var(--inz-serif);
  font-size:9pt; color:var(--inz-navy);
  letter-spacing:.02em; margin-top:12px;
}
.lh-contacts{
  margin-top:6px; font-size:8pt;
  letter-spacing:.08em; color:var(--inz-slate);
}
.lh-sep{ color:var(--inz-teal); margin:0 9px; font-weight:600; }

/* ---------- body ---------- */
.lh-body{
  padding:var(--inz-top) var(--inz-side) var(--inz-bottom);
  position:relative; z-index:1;
}

/* ---------- watermark ---------- */
.lh-watermark{
  position:absolute; top:50%; left:50%;
  transform:translate(-50%,-50%);
  width:130mm; opacity:.07;
  pointer-events:none; z-index:0;
}

/* ==========================================================================
   DENSE MODE — technical documents
   ========================================================================== */
.lh-dense{ font-size:9.5pt; line-height:1.38; }
.lh-dense p{ margin:5px 0; }
.lh-dense ul,.lh-dense ol{ font-size:9pt; margin:5px 0; padding-left:18px; }
.lh-dense li{ margin:2px 0; }

/* document title + reference — new and legacy class names */
.lh-body .lh-body-title,
.lh-body .doc-title,
.lh-body > h1:first-child,
.lh-body > h2:first-child{
  font-family:var(--inz-serif);
  font-size:16pt; font-weight:600; color:var(--inz-navy);
  text-align:center; margin:0 0 3px; letter-spacing:-.005em;
}
.lh-body .lh-body-ref,
.lh-body .doc-ref{
  text-align:center; font-size:8.5pt; color:var(--inz-slate);
  letter-spacing:.05em; margin-bottom:14px; font-family:var(--inz-sans);
}

/* headings */
.lh-body h1,.lh-body h2,.lh-body h3{
  font-family:var(--inz-serif); color:var(--inz-navy);
  font-weight:600; margin:0;
}
.lh-dense h2{ font-size:12pt; margin:12px 0 5px; }
.lh-dense h3{ font-size:10pt; margin:9px 0 3px; }

/* section band — legacy .section and h2.section both supported */
.lh-body .section,
.lh-body h2.section{
  font-family:var(--inz-sans);
  font-size:9.5pt; font-weight:600;
  background:var(--inz-tint); color:var(--inz-navy);
  padding:4px 10px; margin:12px 0 6px;
  border-left:3px solid var(--inz-teal);
  text-transform:uppercase; letter-spacing:.06em;
}

/* tables — plain <table> is styled, so legacy output keeps working */
.lh-body table,
.lh-body .lh-table{
  width:100%; border-collapse:collapse;
  font-size:9pt; margin:5px 0 10px;
}
.lh-body th{
  background:var(--inz-navy); color:#fff;
  padding:5px 8px; text-align:left;
  font-weight:600; font-size:8pt;
  letter-spacing:.05em; text-transform:uppercase;
  border:1px solid var(--inz-navy);
}
.lh-body td{
  padding:4px 8px; border:1px solid var(--inz-hair);
  vertical-align:top;
}
.lh-body tbody tr:nth-child(even) td{ background:var(--inz-tint); }
.lh-body td.num,.lh-body th.num{ text-align:right; font-variant-numeric:tabular-nums; }

/* ---- commercial-document blocks (invoice / PO) ----
   docGen.js emits these. Without them the From/Bill-To block stacks into one
   column and the totals table goes full width. */
.lh-body .parties{ display:flex; gap:18px; margin:10px 0; }
.lh-body .party{ flex:1; font-size:8.8pt; line-height:1.45; }
.lh-body .party .lbl{
  font-family:var(--inz-sans); font-size:7.5pt;
  text-transform:uppercase; letter-spacing:.07em;
  color:var(--inz-slate); margin-bottom:3px; font-weight:600;
}
.lh-body .party strong{ color:var(--inz-navy); font-weight:600; }

.lh-body table.totals,
.lh-body .totals{ width:45%; margin-left:55%; }
.lh-body .totals td{ border:none; padding:3px 8px; background:none !important; }
.lh-body .totals tr:nth-child(even) td{ background:none !important; }
.lh-body .totals tr.grand td{
  border-top:2px solid var(--inz-navy);
  font-weight:700; color:var(--inz-navy); font-size:10.5pt;
}

/* emphasis */
.lh-body strong,.lh-body b{ font-weight:600; color:var(--inz-navy); }
.lh-body em{ font-style:italic; color:var(--inz-slate); }
.lh-body a{ color:var(--inz-teal); text-decoration:none; }

/* callouts — .lh-callout is the kit name, .conclusion/blockquote are legacy.
   Green is deliberate: on a CoA it means released, not decorative. */
.lh-body .lh-callout,
.lh-body .conclusion,
.lh-body blockquote{
  margin:10px 0; padding:8px 12px;
  background:var(--inz-tint);
  border-left:3px solid var(--inz-teal);
  font-size:9pt; font-style:normal;
}
.lh-body .conclusion,
.lh-body .lh-callout.lh-pass{
  background:#ECFDF5; border-left-color:#059669;
}

/* stamp — <img> not background-image, because printing strips backgrounds */
.lh-body .lh-stamp,
.lh-body .stamp-placeholder{
  display:block; position:relative;
  height:34mm; margin-top:8mm;
}
.lh-body .lh-stamp img,
.lh-body .stamp-placeholder img{
  position:absolute; right:0; top:0;
  width:58mm; height:auto; opacity:.85;
  transform:rotate(-3deg);
}

/* ---------- screen preview ---------- */
@media screen{
  .lh-doc{ box-shadow:0 4px 24px rgba(0,0,0,.12); }
}

/* ==========================================================================
   PRINT / PDF
   @page reserves header + footer space on EVERY page; the header, footer and
   watermark are fixed, so browsers repeat them on each printed page.
   These margins must match --inz-top / --inz-bottom / --inz-side above;
   @page cannot read CSS variables.
   ========================================================================== */
@media print{
  @page{ size:A4; margin:50mm 18mm 34mm; }

  html,body{ background:#fff; }
  .lh-doc{ width:auto; min-height:0; box-shadow:none; margin:0; }
  .lh-body{ padding:0; }

  .lh-header   { position:fixed; top:-34mm;    left:0; right:0; }
  .lh-footer   { position:fixed; bottom:-20mm; left:0; right:0; }
  .lh-watermark{ position:fixed; top:50%; left:50%; }

  tr,img,.lh-callout,.conclusion,blockquote,
  .lh-stamp,.stamp-placeholder{ page-break-inside:avoid; }
  h1,h2,h3,.section{ page-break-after:avoid; }

  *{
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }
}
`;
