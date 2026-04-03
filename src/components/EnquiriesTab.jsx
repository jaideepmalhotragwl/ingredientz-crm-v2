import { useState } from "react";
import { C, STAGES, STAGE_COLORS, PRIO_COLORS } from "../constants.js";
import { daysUntil, fmtDate } from "../utils.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";
import { StageBadge, PrioBadge } from "./ui/Badges.jsx";
import { EnquiryForm } from "./EnquiryForm.jsx";

// ── ENQUIRIES TAB ─────────────────────────────────────────────────────────────
function EnquiriesTab({enquiries,customers,users,onSelect,onStageChange,onDelete,onAdd}) {
  const [showForm,setShowForm]=useState(false);
  const [search,setSearch]=useState("");
  const [filterStage,setFilterStage]=useState("");
  const [filterAssignee,setFilterAssignee]=useState("");
  const [sort,setSort]=useState({k:"created_at",d:-1});

  const filtered=enquiries
    .filter(e=>(!filterStage||e.stage===filterStage)&&(!filterAssignee||e.assigned_to===filterAssignee))
    .filter(e=>!search||[e.customer_name,(e.products||[])[0]?.name||"",e.assigned_to,e.country].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{const va=a[sort.k]??"",vb=b[sort.k]??"";return typeof va==="number"?(va-vb)*sort.d:String(va).localeCompare(String(vb))*sort.d;});

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
              return <tr key={e.id} onClick={()=>onSelect(e)}
                style={{background:overR?"#FFF8F8":closeS?"#FFFBF0":i%2===0?C.bg:"transparent",cursor:"pointer"}}
                onMouseEnter={ev=>ev.currentTarget.style.background=C.blueLt}
                onMouseLeave={ev=>ev.currentTarget.style.background=overR?"#FFF8F8":closeS?"#FFFBF0":i%2===0?C.bg:"transparent"}>
                <td style={{padding:"9px 13px",color:C.muted,whiteSpace:"nowrap"}}>{fmtDate(e.enquiry_date)}</td>
                <td style={{padding:"9px 13px",color:C.ink,fontWeight:600,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.customer_name}</td>
                <td style={{padding:"9px 13px",color:C.muted,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{prod}{prod2?`, ${prod2}`:""}</td>
                <td style={{padding:"9px 13px",color:C.muted}}>{e.country||"—"}</td>
                <td style={{padding:"9px 13px",color:C.muted}}>{(e.assigned_to||"").split(" ")[0]||"—"}</td>
                <td style={{padding:"9px 13px"}}><PrioBadge priority={e.priority}/></td>
                <td style={{padding:"9px 13px"}} onClick={ev=>ev.stopPropagation()}>
                  <select value={e.stage} onChange={ev=>onStageChange(e.id,ev.target.value)} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:11,color:STAGE_COLORS[STAGES.indexOf(e.stage)]||C.muted,padding:0}}>
                    {STAGES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{padding:"9px 13px",color:C.blue,fontWeight:700}}>{e.expected_value?`${e.currency||"$"}${Number(e.expected_value).toLocaleString()}`:"—"}</td>
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
