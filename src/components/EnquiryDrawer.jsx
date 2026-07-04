import { useState } from "react";
import { C, STAGES, STAGE_COLORS } from "../constants.js";
import { daysUntil, fmtDate } from "../utils.js";
import { Btn } from "./ui/Btn.jsx";
import { StageBadge, PrioBadge } from "./ui/Badges.jsx";
import { EnquiryForm } from "./EnquiryForm.jsx";
import { QuotationTab } from "./QuotationTab.jsx";
import { EmailThreadTab } from "./EmailThreadTab.jsx";
import { RFQForwardPanel } from "./RFQForwardPanel.jsx";

// Stages that REQUIRE a reason before an enquiry can be closed there.
const REASON_STAGES = ["Lost", "No Response", "Out of Scope"];
const CLOSE_REASONS = [
  "Price couldn't be met",
  "Costing-only / budgetary project",
  "Project on hold",
  "Went with a competitor",
  "No response from customer",
  "Out of scope / can't supply",
  "Other",
];

// ── ENQUIRY DRAWER ────────────────────────────────────────────────────────────
function EnquiryDrawer({enq,onClose,onStageChange,onUpdate,customers,users,quotations,threads,onSaveQuotation,onSendQuotationEmail,onLogEmail,onThreadInserted}) {
  const [drawerTab,setDrawerTab]=useState("details");
  const [editing,setEditing]=useState(false);
  const [pendingStage,setPendingStage]=useState(null);   // stage awaiting a close reason

  if(!enq)return null;
  const dClose=daysUntil(enq.expected_closure);
  const dRemind=daysUntil(enq.reminder_date);
  const products=Array.isArray(enq.products)?enq.products:[];
  const DTABS=[{id:"details",label:"Details"},{id:"quotation",label:"Quotation"},{id:"thread",label:"Email Thread"},{id:"rfq",label:"Forward RFQ"}];

  // Intercept stage clicks: closing stages must collect a reason first.
  function handleStage(stage){
    if(REASON_STAGES.includes(stage)){ setPendingStage(stage); return; }
    onStageChange(enq.id,stage);
  }
  async function confirmClose(reason,note){
    // Save the reason on the enquiry, then apply the stage.
    await onUpdate(enq.id,{ close_reason:reason, close_reason_note:note||null, closed_at:new Date().toISOString() });
    await onStageChange(enq.id,pendingStage);
    setPendingStage(null);
  }

  return <div style={{position:"fixed",top:0,right:0,bottom:0,width:520,background:C.white,boxShadow:"-4px 0 20px rgba(0,0,0,0.15)",zIndex:200,overflowY:"auto",borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column"}}>
    {pendingStage && <CloseReasonModal stage={pendingStage} onCancel={()=>setPendingStage(null)} onConfirm={confirmClose}/>}
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

            {/* Show the close reason if this enquiry was closed */}
            {enq.close_reason && <div style={{background:"#FFF6F6",borderRadius:11,padding:12,border:`1px solid #FFDAD9`,marginBottom:12}}>
              <div style={{fontSize:9,color:C.red,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Close reason</div>
              <div style={{fontSize:12,color:C.ink,fontWeight:600}}>{enq.close_reason}</div>
              {enq.close_reason_note&&<div style={{fontSize:12,color:C.muted,marginTop:3,lineHeight:1.5}}>{enq.close_reason_note}</div>}
            </div>}

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
                {STAGES.map((s,i)=><button key={s} onClick={()=>handleStage(s)} style={{background:enq.stage===s?`${STAGE_COLORS[i]}22`:"transparent",color:enq.stage===s?STAGE_COLORS[i]:C.muted,border:`1px solid ${enq.stage===s?STAGE_COLORS[i]+"66":C.border}`,borderRadius:20,padding:"4px 12px",cursor:"pointer",fontSize:11,fontWeight:enq.stage===s?700:400}}>{s}</button>)}
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

// ── CLOSE REASON MODAL ────────────────────────────────────────────────────────
function CloseReasonModal({stage,onCancel,onConfirm}) {
  const [reason,setReason]=useState("");
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);
  const needsNote = reason === "Other";
  const canSave = reason && (!needsNote || note.trim());

  async function save(){
    if(!canSave)return;
    setSaving(true);
    try{ await onConfirm(reason, note.trim()); }
    catch(e){ setSaving(false); }
  }

  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{background:C.white,borderRadius:14,width:440,maxWidth:"100%",boxShadow:"0 12px 40px rgba(0,0,0,0.25)",overflow:"hidden"}}>
      <div style={{padding:"18px 22px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:16,fontWeight:700,color:C.ink}}>Mark as “{stage}”</div>
        <div style={{fontSize:12,color:C.muted,marginTop:3}}>Please record why — this helps us learn why deals don’t close.</div>
      </div>
      <div style={{padding:"18px 22px",display:"flex",flexDirection:"column",gap:8}}>
        {CLOSE_REASONS.map(r=>(
          <button key={r} onClick={()=>setReason(r)} style={{
            textAlign:"left",background:reason===r?C.blueLt:"transparent",
            border:`1px solid ${reason===r?C.blue:C.border}`,borderRadius:9,padding:"10px 13px",
            cursor:"pointer",fontSize:13,color:reason===r?C.blue:C.ink,fontWeight:reason===r?600:400,
            display:"flex",alignItems:"center",gap:9
          }}>
            <span style={{width:15,height:15,borderRadius:"50%",border:`2px solid ${reason===r?C.blue:C.faded}`,background:reason===r?C.blue:"transparent",flexShrink:0}}/>
            {r}
          </button>
        ))}
        {needsNote && <textarea value={note} onChange={e=>setNote(e.target.value)} autoFocus placeholder="Tell us the specific reason…" rows={3}
          style={{marginTop:2,background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 12px",fontFamily:"inherit",fontSize:13,color:C.ink,outline:"none",resize:"vertical"}}/>}
      </div>
      <div style={{padding:"14px 22px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end",gap:9}}>
        <button onClick={onCancel} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:9,padding:"8px 16px",cursor:"pointer",fontSize:13,color:C.muted,fontWeight:600}}>Cancel</button>
        <button onClick={save} disabled={!canSave||saving} style={{background:canSave?C.red:C.faded,border:0,borderRadius:9,padding:"8px 18px",cursor:canSave?"pointer":"not-allowed",fontSize:13,color:"white",fontWeight:700}}>
          {saving?"Saving…":`Confirm ${stage}`}
        </button>
      </div>
    </div>
  </div>;
}

export { EnquiryDrawer };
