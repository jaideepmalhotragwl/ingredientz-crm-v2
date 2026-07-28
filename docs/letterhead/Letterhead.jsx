/* ==========================================================================
   INGREDIENTZ — <Letterhead /> React component
   v1.0

   Wrap any document content in this component and it comes out on the
   official letterhead — on screen and in the PDF.

   Basic use:

     import Letterhead from "./letterhead/Letterhead";

     <Letterhead title="Letter of Intent" reference="INZ/2026/0142">
       <p>Dear Mr. Anderson,</p>
       <p>Thank you for your enquiry…</p>
     </Letterhead>

   Props
     title      string   document title (optional)
     reference  string   ref / enquiry number, shown in teal caps (optional)
     date       string   defaults to today, formatted "27 July 2026"
     paper      string   "letter" (default) or "a4"
     screen     bool     default true — shows the grey preview background
                         and a Print / Save as PDF button. Set false when
                         you are rendering to PDF server-side.
     logoSrc    string   override the logo (defaults to the embedded one)
     children   node     the document body
   ========================================================================== */

import React from "react";
import "./letterhead.css";
import { INZ_LOGO } from "./logoBase64";

/* Company details — single source of truth. Change here, not in a module. */
export const INZ_COMPANY = {
  legalName: "Ingredientz Inc",
  address: "8 The Green, Ste A, Dover, DE 19901, United States of America",
  email: "sales@ingredientz.co",
  website: "www.ingredientz.co",
  phone: "+1 270 721 5321",
};

/* Brand tokens, for charts / inline styles elsewhere in a module */
export const INZ_BRAND = {
  navy: "#10314F",
  teal: "#1B9AD6",
  ink: "#1C2733",
  slate: "#5A6875",
  hairline: "#D8DEE4",
  tint: "#F2F7FA",
  serif: "'Source Serif 4', Georgia, serif",
  sans: "'Inter', -apple-system, Helvetica, Arial, sans-serif",
};

export function formatDate(d = new Date()) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function printDocument() {
  window.print();
}

export default function Letterhead({
  title,
  reference,
  date,
  paper = "letter",
  screen = true,
  logoSrc = INZ_LOGO,
  children,
}) {
  const shownDate = date || formatDate();

  const sheet = (
    <div className={"lh-doc" + (paper === "a4" ? " lh-a4" : "")}>

      {/* HEADER — repeats on every printed page */}
      <header className="lh-header">
        <img className="lh-logo" src={logoSrc} alt="Ingredientz" />
        <div className="lh-rule" />
        <div className="lh-rule-thin" />
      </header>

      {/* FOOTER — repeats on every printed page */}
      <footer className="lh-footer">
        <div className="lh-rule" />
        <div className="lh-rule-thin" />
        <div className="lh-addr">
          {INZ_COMPANY.legalName}, {INZ_COMPANY.address}
        </div>
        <div className="lh-contacts">
          {INZ_COMPANY.email}
          <span className="lh-sep">&bull;</span>
          {INZ_COMPANY.website}
          <span className="lh-sep">&bull;</span>
          {INZ_COMPANY.phone}
        </div>
      </footer>

      {/* BODY */}
      <main className="lh-body">
        {shownDate && (
          <div className="lh-meta">
            <span>{shownDate}</span>
          </div>
        )}
        {title && <h1>{title}</h1>}
        {reference && <div className="lh-ref">Ref: {reference}</div>}
        {children}
      </main>

    </div>
  );

  if (!screen) return sheet;

  return (
    <div className="lh-screen">
      <div className="lh-toolbar lh-no-print">
        <button className="lh-btn" onClick={printDocument}>
          Print / Save as PDF
        </button>
      </div>
      {sheet}
    </div>
  );
}
