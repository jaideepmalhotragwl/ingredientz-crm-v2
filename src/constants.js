export const C = {
  blue:"#1877F2", blueDk:"#0D5ED1", blueLt:"#E7F0FD",
  green:"#42B72A", red:"#FA3E3E", amber:"#F5A623", purple:"#9B59B6",
  white:"#FFFFFF", bg:"#F0F2F5", card:"#FFFFFF", border:"#E4E6EB",
  ink:"#1c1e21", muted:"#65676B", faded:"#BCC0C4",
};

export const STAGES = [
  "New Enquiry","Sourcing Awaited","Quotation Sent","Documents Review",
  "Sample Under Process","Price Negotiation","Awaiting PO","PO Received",
  "Lost","No Response","Out of Scope","On Hold"
];

export const STAGE_COLORS = [
  C.muted, C.blue, C.blue, "#8E44AD", C.amber, "#E2C47A",
  C.amber, C.green, C.red, "#7F8C8D", "#BDC3C7", "#9B59B6"
];

export const PRIO_COLORS  = { High: C.red, Medium: C.amber, Low: C.green };

export const SOURCES = [
  "Email","Phone Call","WhatsApp","Trade Show","LinkedIn",
  "Website","Referral","Walk-in","Other"
];

export const UNITS = ["kg","MT","Litres","Pieces","Boxes","Bags","Other"];

export const TASK_STATUSES = ["Not Started","In Progress","On Hold","Done"];

export const TASK_STATUS_COLORS = {
  "Not Started": C.muted, "In Progress": C.blue, "On Hold": "#9B59B6", "Done": C.green
};

export const PAYMENT_TERMS = [
  "Advance Payment","50% Advance + 50% Before Shipment","Net 30","Net 45",
  "Net 60","Letter of Credit","Documents Against Payment","Other"
];

export const INCOTERMS = ["EXW","FCA","FOB","CFR","CIF","DAP","DDP","Other"];
