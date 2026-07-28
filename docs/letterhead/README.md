# Ingredientz Letterhead Kit

The official Ingredientz letterhead, as reusable files. Every module that
publishes a document — quotation, proforma, COA cover, MOU, LOI, supplier
agreement — should render it through these files rather than styling its own
header and footer.

**Rule: don't restyle the letterhead inside a module.** Change it here, push,
and every module that imports it updates.

---

## What's in here

| File | What it's for |
|---|---|
| `letterhead.css` | The stylesheet. Brand tokens, header, footer, print rules, document components. The single source of truth. |
| `Letterhead.jsx` | React component. Wrap content in `<Letterhead>` and it renders on the letterhead. |
| `logoBase64.js` | The logo as a data URI. No asset path, no CDN, no bundler config — it just works. |
| `letterhead.template.html` | Self-contained single-file HTML with `{{TITLE}}` `{{REFERENCE}}` `{{DATE}}` `{{BODY}}` placeholders. For Edge Functions and any non-React tool. |
| `example-quotation.html` | A filled example. Open it in Safari to see every building block. |
| `assets/ingredientz-logo.png` | The logo as a file (1100×192, transparent, 28 KB) if you'd rather link it. |
| `Ingredientz-Letterhead.docx` | Word version, for letters typed by hand. Header and footer repeat automatically. |

---

## Adding it to a React module

1. Copy `letterhead.css`, `Letterhead.jsx` and `logoBase64.js` into
   `src/letterhead/` in the module's repo.
2. Import and use:

```jsx
import Letterhead from "./letterhead/Letterhead";

export default function QuotationPreview({ enquiry }) {
  return (
    <Letterhead title="Quotation" reference={enquiry.ref}>
      <p>Dear {enquiry.contact_name},</p>
      <p>Further to your enquiry, we are pleased to quote as follows.</p>

      <table className="lh-table">
        <thead>
          <tr><th>Ingredient</th><th>Qty</th><th className="num">Rate</th></tr>
        </thead>
        <tbody>
          {enquiry.items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>{i.qty}</td>
              <td className="num">${i.rate}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="lh-sign">
        <b>Jaideep Malhotra</b>
        <span>Founder &amp; Chief Executive Officer</span>
      </div>
    </Letterhead>
  );
}
```

That's it. The grey preview background and the **Print / Save as PDF** button
come with it.

### Props

| Prop | Default | Notes |
|---|---|---|
| `title` | — | Document title, navy serif |
| `reference` | — | Enquiry / doc number, teal caps |
| `date` | today | Formatted `27 July 2026` |
| `paper` | `"letter"` | `"a4"` for EU customers |
| `screen` | `true` | Set `false` when rendering to PDF server-side — drops the preview chrome |
| `logoSrc` | embedded | Override only if you must |

Also exported: `INZ_COMPANY` (address and contacts), `INZ_BRAND` (colour and
font tokens for charts elsewhere in the module), `formatDate()`,
`printDocument()`.

---

## Using it in a Supabase Edge Function

```ts
const tpl  = await Deno.readTextFile("./letterhead.template.html");
const html = tpl
  .replaceAll("{{TITLE}}",     "Quotation")
  .replaceAll("{{REFERENCE}}", enquiry.ref)
  .replaceAll("{{DATE}}",      new Date().toLocaleDateString("en-GB",
                 { day: "numeric", month: "long", year: "numeric" }))
  .replaceAll("{{BODY}}",      rowsHtml);
```

Then either return the HTML, or hand it to a PDF service. Because the logo is
embedded as base64 and there are no external stylesheets, the output renders
identically without any network access.

---

## Building a document body

Anything inside the body is styled automatically. The house components:

| Markup | Result |
|---|---|
| `<h1>` `<h2>` | Navy Source Serif 4 headings |
| `<h3>` | Small navy Inter sub-heading |
| `<p>` `<ul>` `<ol>` | Body copy, Inter 11pt |
| `<table class="lh-table">` | Zebra table, navy header row. Add `class="num"` to a `<td>` for right-aligned figures. |
| `<div class="lh-callout">` | Teal callout box |
| `<div class="lh-sign">` | Signature block |
| `<span class="lh-ref">` | Teal reference line |
| `class="lh-no-print"` | Hidden when printing |

---

## Printing and PDF

Safari or Chrome → **File → Print → Save as PDF**. Set margins to **None** or
**Default** — the letterhead supplies its own margins.

Multi-page documents carry the logo and the footer on **every** page. This is
handled by `@page` reserving the margins and the header/footer being fixed —
verified across a five-page render.

If you change `--inz-top` or `--inz-bottom` in the tokens, change the `@page`
margin in section 8 of the CSS to match. `@page` cannot read CSS variables, so
those two numbers are written out and have to move together.

### A4

Add `paper="a4"` (React) or `class="lh-a4"` on `.lh-doc` (HTML), **and** add
this to the page:

```css
@media print {
  @page { size: A4; margin: 50mm 22mm 34mm; }
  .lh-header { top: -34mm; }
  .lh-footer { bottom: -20mm; }
}
```

---

## Fonts

Headings and the address use **Source Serif 4**; body and contacts use
**Inter**. `letterhead.css` pulls both from Google Fonts, so nothing needs
installing for web output. If a machine is offline the fallbacks are Georgia
and Helvetica — the layout holds, only the letterforms change.

The `.docx` references the fonts by name, so install both locally for Word to
match: Inter from `rsms.me/inter`, Source Serif 4 from Adobe's GitHub.

---

## Design reference

| Token | Value | Used for |
|---|---|---|
| `--inz-navy` | `#10314F` | Rules, headings, address |
| `--inz-teal` | `#1B9AD6` | Hairline, separators, callouts, references |
| `--inz-ink` | `#1C2733` | Body copy |
| `--inz-slate` | `#5A6875` | Contacts, meta lines |
| `--inz-hair` | `#D8DEE4` | Table borders |
| `--inz-tint` | `#F2F7FA` | Zebra rows, callout background |

Header and footer both use the same device: a 3px navy rule with a 1px teal
hairline beneath it. Logo is centred at 0.60in tall, 0.62in from the top edge.
Body sits 1.95in from the top and 1.35in from the bottom on US Letter.

---

## Dense mode

Technical documents — CoA, SDS, TDS, specification — add `lh-dense` alongside
`lh-doc`. Type drops to 9.5pt, tables tighten, and section bands become
available. Letters leave it off. One stylesheet, two densities.

---

*v1.0 · Ingredientz Inc*
