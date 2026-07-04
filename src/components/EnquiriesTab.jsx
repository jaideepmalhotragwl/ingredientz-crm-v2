import { useState, useMemo } from "react";
import { C, STAGES, STAGE_COLORS, PRIO_COLORS } from "../constants.js";
import { daysUntil, fmtDate } from "../utils.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";
import { StageBadge, PrioBadge } from "./ui/Badges.jsx";
import { EnquiryForm } from "./EnquiryForm.jsx";

// ── FX → USD-equivalent (keep in sync with OrdersTab). Update as rates move. ──
const FX = { USD: 1, EUR: 1.08, INR: 0.0117, "$": 1, "€": 1.08, "₹": 0.0117 };
function toUSD(amount, currency) {
  const r = FX[(currency || "USD").toString().toUpperCase()] ?? FX[currency] ?? 1;
  return (parseFloat(amount) || 0) * r;
}

// Deal-size bands (measured in USD). Order matters: first match wins.
const VALUE_BANDS = [
  { min: 1000000, color: "#1E7A46", bg: "#E6F4EC", label: "≥ $1M" },      // deep green — top priority
  { min: 100000,  color: "#42B72A", bg: "#EAF7E6", label: "$100K–1M" },   // green — high
  { min: 50000,   color: "#F5A623", bg: "#FDF3E3", label: "$50K–100K" },  // amber — medium
  { min: 10000,   color: "#1877F2", bg: "#E7F0FD", label: "$10K–50K" },   // blue — low
  { min: 0,       color: "#8A8D91", bg: "#F0F1F3", label: "< $10K" },     // grey — lowest
];
function bandFor(usd) {
  return VALUE_BANDS.find(b => usd >= b.min) || VALUE_BANDS[VALUE_BANDS.length - 1];
}

// Colour the FY-quarter tag by quarter, so Q1–Q4 are visually distinct in the list.
const QUARTER_COLORS = { "1": "#1E7A46", "2": "#1877F2", "3": "#F5A623", "4": "#9B59B6" };
function quarterColor(ref) {
  const m = /Q(\d)/.exec(ref || "");
  return (m && QUARTER_COLORS[m[1]]) || "#65676B";
}

// ── ENQUIRIES TAB ─────────────────────────────────────────────────────────────
function EnquiriesTab({enquiries,customers,users,quotations=[],onSelect,onStageChange,onDelete,onAdd}) {
  const [showForm,setShowForm]=useState(false);
  const [search,setSearch]=useState("");
  const [filterStage,setFilterStage]=useState("");
  const [filterAssignee,setFilterAssignee]=useState("");
  const [sort,setSort]=useState({k:"created_at",d:-1});

  // Latest quotation total per enquiry_id (fallback when no manual value is set)
  const latestQuoteByEnq = useMemo(() => {
    const m = {};
    (quotations || []).forEach(q => {
      const eid = q.enquiry_id;
      if (eid == null) return;
      const amt = parseFloat(q.grand_total ?? q.total ?? q.amount ?? q.value) || 0;
      const when = new Date(q.created_at || q.updated_at || 0).getTime();
      if (!m[eid] || when >= m[eid].when) m[eid] = { amt, cur: q.currency, when };
    });
    return m;
  }, [quotations]);

  // Resolve the value to show for an enquiry: manual first, else latest quotation.
  function resolveValue(e) {
    if (e.expected_value != null && e.expected_value !== "" && Number(e.expected_value) > 0) {
      return { amount: Number(e.expected_value), currency: e.currency || "USD", source: "manual" };
    }
    const q = latestQuoteByEnq[e.id];
    if (q && q.amt > 0) return { amount: q.amt, currency: q.cur || e.currency || "USD", source: "quote" };
    return null;
  }

  const filtered=enquiries
    .filter(e=>(!filterStage||e.stage===filterStage)&&(!filterAssignee||e.assigned_to===filterAssignee))
    .filter(e=>!search||[e.customer_name,(e.products||[])[0]?.name||"",e.assigned_to,e.country].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{
      // Value column sorts by USD-equivalent of the resolved value
      if (sort.k === "expected_value") {
        const va = resolveValue(a) ? toUSD(resolveValue(a).amount, resolveValue(a).currency) : -1;
        const vb = resolveValue(b) ? toUSD(resolveValue(b).amount, resolveValue(b).currency) : -1;
        return (va - vb) * sort.d;
      }
      const va=a[sort.k]??"",vb=b[sort.k]??"";
      return typeof va==="number"?(va-vb)*sort.d:String(va).localeCompare(String(vb))*sort.d;
    });

  function toggleSort(k){setSort(s=>s.k===k?{k,d:s.d*-1}:{k,d:-1});}
  const selStyle={background:C.white,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",color:C.ink,fontSize:11};

  return <div>
    {showForm&&<Modal title="New Enquiry" sub="Saves to Supabase · Unlimited products" onClose={()=>setShowForm(false)} width={880}>
      <EnquiryForm onSave={async(row)=>{await onAdd(row);setShowForm(false);}} onClose={()=>setShowForm(false)} customers={customers} users={users}/>
    </Modal>}
    <Card style={{overflow:"hidden"}}>
      <div style={{padding:"14px 18px",display:"flex",gap:10,alignItems:"center",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap"}}>
        <div style={{fontSize:18,fontWeight:700,color:C.ink}}>Enquiries <span style={{fontSize:12,color:C.blue,fontWeight:400}}>{filtered.length} records</span></div>
        <Btn label="+ New Enquiry" onClick={()=>setShowForm(true)} size="sm"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{marginLeft:"auto",background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 12px",color:C.ink,fontSize:12,outline:"none",width:170}}/>
        <select value={filterStage} onChange={e=>setFilterStage(e.target.value)} style={selStyle}><option value="">All Stages</option>{STAGES.map(s=><option key={s} value={s}>{s}</option>)}</select>
        <select value={filterAssignee} onChange={e=>setFilterAssignee(e.target.value)} style={selStyle}><option value="">All Team</option>{users.filter(u=>u.active).map(u=><option key={u.id} value={u.name}>{u.name.split(" ")[0]}</option>)}</select>
      </div>
      <div style={{overflowX:"auto",maxHeight:500,overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead style={{position:"sticky",top:0,background:C.bg,zIndex:2}}>
            <tr>{[["enquiry_date","Date"],["customer_name","Customer"],["products","Product"],["country","Country"],["assigned_to","Assigned"],["priority","Priority"],["stage","Stage"],["expected_value","Value"],["expected_closure","Closure"],["reminder_date","Reminder"]].map(([k,l])=>(
              <th key={k} onClick={()=>toggleSort(k)} style={{padding:"9px 13px",textAlign:"left",cursor:"pointer",color:sort.k===k?C.blue:C.muted,borderBottom:`1px solid ${C.border}`,fontWeight:700,letterSpacing:1,fontSize:9,textTransform:"uppercase",userSelect:"none",whiteSpace:"nowrap"}}>
                {l}{sort.k===k?(sort.d===1?" ↑":" ↓"):""}
              </th>))}
              <th style={{padding:"9px 13px",borderBottom:`1px solid ${C.border}`}}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e,i)=>{
              const dR=daysUntil(e.reminder_date);
              const dC=daysUntil(e.expected_closure);
              const overR=dR!==null&&dR<=0&&!["PO Received","Lost"].includes(e.stage);
              const closeS=dC!==null&&dC<=7&&dC>=0&&!["PO Received","Lost"].includes(e.stage);
              const prod=(e.products||[])[0]?.name||"—";
              const prod2=(e.products||[])[1]?.name;
              const val=resolveValue(e);
              const band=val?bandFor(toUSD(val.amount,val.currency)):null;
              const qc=e.quarter_ref?quarterColor(e.quarter_ref):null;
              const rowBg=band?band.bg:(i%2===0?C.bg:"transparent");
              const edge=overR?C.red:closeS?C.amber:"transparent";
              return <tr key={e.id} onClick={()=>onSelect(e)}
                style={{background:rowBg,cursor:"pointer",borderLeft:`3px solid ${edge}`}}
                onMouseEnter={ev=>ev.currentTarget.style.background=C.blueLt}
                onMouseLeave={ev=>ev.currentTarget.style.background=rowBg}>
                <td style={{padding:"9px 13px",color:C.muted,whiteSpace:"nowrap"}}>{fmtDate(e.enquiry_date)}</td>
                <td style={{padding:"9px 13px",maxWidth:170}}>
                  <div style={{color:C.ink,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.customer_name}</div>
                  <div style={{marginTop:3,display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:9,fontFamily:"monospace",fontWeight:600,color:C.muted,background:C.bg,border:`1px solid ${C.border}`,borderRadius:5,padding:"1px 5px",whiteSpace:"nowrap"}}>ENQ-{e.id}</span>
                    {e.quarter_ref&&<span style={{fontSize:9,fontFamily:"monospace",fontWeight:700,color:qc,background:`${qc}18`,border:`1px solid ${qc}44`,borderRadius:5,padding:"1px 5px",whiteSpace:"nowrap"}}>{e.quarter_ref}</span>}
                  </div>
                </td>
                <td style={{padding:"9px 13px",color:C.muted,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{prod}{prod2?`, ${prod2}`:""}</td>
                <td style={{padding:"9px 13px",color:C.muted}}>{e.country||"—"}</td>
                <td style={{padding:"9px 13px",color:C.muted}}>{(e.assigned_to||"").split(" ")[0]||"—"}</td>
                <td style={{padding:"9px 13px"}}><PrioBadge priority={e.priority}/></td>
                <td style={{padding:"9px 13px"}} onClick={ev=>ev.stopPropagation()}>
                  <select value={e.stage} onChange={ev=>onStageChange(e.id,ev.target.value)} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:11,color:STAGE_COLORS[STAGES.indexOf(e.stage)]||C.muted,padding:0}}>
                    {STAGES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{padding:"9px 13px"}}>
                  {val ? (
                    <span title={val.source==="quote" ? "From latest quotation" : "Manually entered"}
                      style={{display:"inline-block",fontWeight:700,fontSize:11,color:band.color,background:C.white,border:`1px solid ${band.color}66`,borderRadius:99,padding:"3px 9px",whiteSpace:"nowrap"}}>
                      {val.currency==="USD"||val.currency==="$"?"$":`${val.currency} `}{Number(val.amount).toLocaleString()}
                      {val.source==="quote" && <span style={{opacity:0.6,fontWeight:500}}> ·q</span>}
                    </span>
                  ) : <span style={{color:C.muted}}>—</span>}
                </td>
                <td style={{padding:"9px 13px",color:closeS?C.amber:C.muted,fontWeight:closeS?700:400}}>{fmtDate(e.expected_closure)}</td>
                <td style={{padding:"9px 13px",color:overR?C.red:C.muted,fontWeight:overR?700:400}}>{overR?`⚠ ${Math.abs(dR)}d overdue`:fmtDate(e.reminder_date)}</td>
                <td style={{padding:"9px 13px"}} onClick={ev=>ev.stopPropagation()}>
                  <button onClick={()=>onDelete(e.id)} style={{background:"transparent",border:`1px solid ${C.red}44`,borderRadius:5,padding:"3px 7px",cursor:"pointer",color:C.red,fontSize:10}}>✕</button>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {filtered.length===0&&<div style={{padding:36,textAlign:"center",color:C.muted,fontSize:12}}>No enquiries match your filters</div>}
      </div>
    </Card>
  </div>;
}


export { EnquiriesTab };
