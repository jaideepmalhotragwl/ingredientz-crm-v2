/* ==========================================================================
   INGREDIENTZ — letterhead CSS as a JavaScript string
   v2.0

   Why this file exists: the document renderer writes into a new window with
   document.write(). A CSS import can't reach that window, so the stylesheet
   travels as a string and is written into the popup's <style> tag.

   ── v2.0: HOW THE LETTERHEAD REPEATS ON EVERY PRINTED PAGE ──────────────────
   The document is a single <table>. Its <thead> holds the logo and rules, its
   <tfoot> holds the address block. Browsers repeat a table's header and footer
   groups on every printed page, and @page reserves the margin they sit in.

   Do NOT go back to `position: fixed` with negative offsets. Chrome clips
   painting to the page content box, so a header at `top:-34mm` disappears
   completely and a footer at `bottom:-20mm` prints across the body text.
   The watermark stays fixed on purpose — it sits inside the content box, so
   it is not clipped, and Chrome repeats it on every page.

   LEGACY SELECTORS: plain <table>, .doc-title, .doc-ref, .section,
   .conclusion, blockquote, .stamp-placeholder, .parties and .totals are all
   styled, so HTML from docTemplates.js and the reformat-document Edge Function
   keeps working untouched. Do not remove them.
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

  /* A4 geometry. These must match the @page margin at the end of the file —
     @page cannot read CSS variables, so the numbers are written twice. */
  --inz-page-w:210mm;
  --inz-page-h:297mm;
  --inz-side:18mm;
  --inz-head-t:16mm;
  --inz-foot-b:14mm;
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
  padding:var(--inz-head-t) var(--inz-side) var(--inz-foot-b);
  box-sizing:border-box;
  font-size:11pt;
  line-height:1.62;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}

.lh-grid{ width:100%; border-collapse:collapse; }
.lh-grid > thead > tr > td,
.lh-grid > tfoot > tr > td,
.lh-grid > tbody > tr > td{ padding:0; border:0; }

/* ---------- header (repeats on every printed page) ---------- */
.lh-head-cell{ text-align:center; padding-bottom:10mm; }
.lh-logo{ height:15mm; width:auto; display:inline-block; }
.lh-rule{ height:3px; background:var(--inz-navy); }
.lh-rule-thin{ height:1px; background:var(--inz-teal); margin-top:3px; }
.lh-head-cell .lh-rule{ margin-top:7.5mm; }

/* ---------- footer (repeats on every printed page) ---------- */
.lh-foot-cell{ text-align:center; padding-top:8mm; vertical-align:bottom; }
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

/* ---------- body ----------
   The height keeps the footer at the foot of the sheet on screen even when the
   document is only a few lines long — on a table cell, height acts as a
   minimum. It is released for print, where pagination handles it. */
.lh-body-cell{ vertical-align:top; height:calc(var(--inz-page-h) - 90mm); }
.lh-body{ position:relative; z-index:1; }

/* ---------- watermark ---------- */
.lh-watermark{
  position:absolute; top:50%; left:50%;
  transform:translate(-50%,-50%);
  width:130mm; opacity:.07;
  pointer-events:none; z-index:0;
}

/* ==========================================================================
   DENSE MODE — technical documents (CoA, SDS, TDS, spec)
   ========================================================================== */
.lh-dense{ font-size:9.5pt; line-height:1.38; }
.lh-dense .lh-body p{ margin:5px 0; }
.lh-dense .lh-body ul,.lh-dense .lh-body ol{ font-size:9pt; margin:5px 0; padding-left:18px; }
.lh-dense .lh-body li{ margin:2px 0; }

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
.lh-dense .lh-body h2{ font-size:12pt; margin:12px 0 5px; }
.lh-dense .lh-body h3{ font-size:10pt; margin:9px 0 3px; }

/* section band */
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

/* commercial-document blocks (invoice / PO) — emitted by docGen.js */
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
  .lh-doc{ box-shadow:0 4px 24px rgba(0,0,0,.12); margin:20px auto; }
}

/* ==========================================================================
   PRINT / PDF

   @page reserves the margin on EVERY sheet; thead and tfoot repeat the
   letterhead into it. These margins must match --inz-head-t / --inz-side /
   --inz-foot-b above.
   ========================================================================== */
@media print{
  @page{ size:A4; margin:16mm 18mm 14mm; }

  html,body{ background:#fff; }

  .lh-doc{
    width:auto; min-height:0; margin:0;
    padding:0; box-shadow:none;
  }

  thead{ display:table-header-group; }
  tfoot{ display:table-footer-group; }

  /* A minimum, not a fixed height: it pushes the footer to the foot of the
     sheet on short documents, and is simply exceeded on longer ones.
     Tuned against a rendered A4 sheet so the footer lands on the 14mm baseline. */
  .lh-body-cell{ height:210mm; }

  /* fixed is correct here: the watermark sits inside the page content box, so
     it is not clipped, and it repeats on every page */
  .lh-watermark{ position:fixed; top:50%; left:50%; }

  /* Scope these to body content ONLY. Applying page-break-inside:avoid to a
     a bare tr selector also hits the wrapper table's own header and footer rows, and
     the engine then drops the letterhead from the page entirely. */
  .lh-body tr,.lh-body img,
  .lh-body .lh-callout,.lh-body .conclusion,.lh-body blockquote,
  .lh-body .lh-stamp,.lh-body .stamp-placeholder{ page-break-inside:avoid; }
  .lh-body h1,.lh-body h2,.lh-body h3,.lh-body .section{ page-break-after:avoid; }

  *{
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }
}
`;
