import { useState } from "react";
import { C, STAGES, STAGE_COLORS } from "../constants.js";
import { daysUntil, fmtDate } from "../utils.js";
import { Btn } from "./ui/Btn.jsx";
import { StageBadge, PrioBadge } from "./ui/Badges.jsx";
import { EnquiryForm } from "./EnquiryForm.jsx";
import { QuotationTab } from "./QuotationTab.jsx";
import { EmailThreadTab } from "./EmailThreadTab.jsx";
import { RFQForwardPanel } from "./RFQForwardPanel.jsx";

// ── ENQUIRY DRAWER ────────────────────────────────────────────────────────────
function EnquiryDrawer({enq,onClose,onStageChange,onUpdate,customers,users,quotations,threads,onSaveQuotation,onSendQuotationEmail,onLogEmail,onThreadInserted}) {
  const [drawerTab,setDrawerTab]=useState("details");
  const [editing,setEditing]=useState(false);
  if(!enq)return null;
  const dClose=daysUntil(enq.expected_closure);
  const dRemind=daysUntil(enq.reminder_date);
  const products=Array.isArray(enq.products)?enq.products:[];
  const DTABS=[{id:"details",label:"Details"},{id:"quotation",label:"Quotation"},{id:"thread",label:"Email Thread"},{id:"rfq",label:"Forward RFQ"}];

  return <div style={{position:"fixed",top:0,right:0,bottom:0,width:520,background:C.white,boxShadow:"-4px 0 20px rgba(0,0,0,0.15)",zIndex:200,overflowY:"auto",borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column"}}>
    <div style={{padding:"20px 22px 0",flexShrink:0}}>
      {!editing&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <div style={{fontSize:19,fontWeight:700,color:C.ink}}>{enq.customer_name}</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>{enq.contact_person}{enq.country?` · ${enq.country}`:""}</div>
          <div style={{display:"flex",gap:7,marginTop:8,flexWrap:"wrap"}}><StageBadge stage={enq.stage}/><PrioBadge priority={enq.priority}/></div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <Btn label="Edit" onClick={()=>setEditing(true)} size="sm" variant="ghost"/>
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:"50%",width:32,height:32,cursor:"pointer",color:C.muted,fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
      </div>}
      {!editing&&<div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`}}>
        {DTABS.map(t=><button key={t.id} onClick={()=>setDrawerTab(t.id)} style={{background:"transparent",border:"none",borderBottom:drawerTab===t.id?`2px solid ${C.blue}`:"2px solid transparent",padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:drawerTab===t.id?700:400,color:drawerTab===t.id?C.blue:C.muted,marginBottom:-1}}>{t.label}</button>)}
      </div>}
    </div>
    <div style={{flex:1,overflowY:"auto",padding:"0 22px 22px"}}>
      {editing
        ?<div style={{paddingTop:16}}><EnquiryForm onSave={async(row)=>{await onUpdate(enq.id,row);setEditing(false);}} onClose={()=>setEditing(false)} customers={customers} users={users} initial={enq}/></div>
        :drawerTab==="details"
          ?<div style={{paddingTop:14}}>
            {dRemind!==null&&dRemind<=0&&<div style={{background:"#FFF0F0",border:`1px solid #FFDAD9`,borderRadius:9,padding:"9px 14px",marginBottom:10,fontSize:12,color:C.red,fontWeight:600}}>🔔 Reminder overdue by {Math.abs(dRemind)} day{Math.abs(dRemind)!==1?"s":""}</div>}
            {dClose!==null&&dClose<=7&&dClose>0&&<div style={{background:"#FFF8E7",border:`1px solid #FFE0A3`,borderRadius:9,padding:"9px 14px",marginBottom:10,fontSize:12,color:C.amber,fontWeight:600}}>⚡ Closes in {dClose} day{dClose!==1?"s":""}</div>}
            <div style={{background:C.bg,borderRadius:11,padding:14,border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{fontSize:9,color:C.blue,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:9}}>Products ({products.length})</div>
              {products.map((p,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:i<products.length-1?`1px solid ${C.border}`:"none"}}>
                <div style={{fontSize:12,color:C.ink}}><span style={{color:C.blue,fontSize:10,marginRight:7,fontWeight:700}}>#{i+1}</span>{p.name}</div>
                {p.qty&&<span style={{fontSize:11,color:C.muted,background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:"2px 9px"}}>{p.qty} {p.unit}</span>}
              </div>)}
              {enq.expected_value&&<div style={{marginTop:9,paddingTop:9,borderTop:`1px solid ${C.border}`,fontSize:12}}>
                <span style={{color:C.muted}}>Value: </span><span style={{color:C.blue,fontWeight:700}}>{enq.currency} {Number(enq.expected_value).toLocaleString()}</span>
              </div>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:12}}>
              {[["Date Received",fmtDate(enq.enquiry_date)],["Assigned To",enq.assigned_to],["Source",enq.source],["Closure",fmtDate(enq.expected_closure)],["Reminder",fmtDate(enq.reminder_date)],["Quotation",enq.quotation_sent?"Yes":"No"],["Created By",enq.created_by]].map(([k,v])=>(
                <div key={k} style={{background:C.bg,borderRadius:9,padding:"9px 12px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>{k}</div>
                  <div style={{fontSize:12,color:C.ink}}>{v||"—"}</div>
                </div>
              ))}
            </div>
            {enq.notes&&<div style={{background:C.bg,borderRadius:11,padding:12,border:`1px solid ${C.border}`,marginBottom:14}}>
              <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Notes</div>
              <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{enq.notes}</div>
            </div>}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
              <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:9}}>Update Stage</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {STAGES.map((s,i)=><button key={s} onClick={()=>onStageChange(enq.id,s)} style={{background:enq.stage===s?`${STAGE_COLORS[i]}22`:"transparent",color:enq.stage===s?STAGE_COLORS[i]:C.muted,border:`1px solid ${enq.stage===s?STAGE_COLORS[i]+"66":C.border}`,borderRadius:20,padding:"4px 12px",cursor:"pointer",fontSize:11,fontWeight:enq.stage===s?700:400}}>{s}</button>)}
              </div>
            </div>
          </div>
          :drawerTab==="quotation"
            ?<QuotationTab enq={enq} quotations={quotations} onSave={onSaveQuotation} onSendEmail={onSendQuotationEmail} users={users}/>
            :drawerTab==="rfq"
              ?<RFQForwardPanel enq={enq} users={users} onThreadInserted={onThreadInserted}/>
              :<EmailThreadTab enq={enq} threads={threads} onLogEmail={onLogEmail}/>
      }
    </div>
  </div>;
}


export { EnquiryDrawer };
