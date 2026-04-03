import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { fmtDate } from "../utils.js";

// ── EMAIL THREAD TAB ──────────────────────────────────────────────────────────
function EmailThreadTab({enq,threads,onLogEmail}) {
  const enqThreads=threads.filter(t=>t.enquiry_id===enq.id).sort((a,b)=>new Date(a.sent_at)-new Date(b.sent_at));
  const [showLog,setShowLog]=useState(false);
  const [logForm,setLogForm]=useState({direction:"received",subject:"",body:"",from_email:""});
  const [saving,setSaving]=useState(false);
  const [sequences,setSequences]=useState([]);
  const [loadingSeq,setLoadingSeq]=useState(false);

  useEffect(()=>{
    loadSequences();
  },[enq.id]);

  async function loadSequences(){
    setLoadingSeq(true);
    const {data}=await supabase.from("email_sequences")
      .select("*").eq("enquiry_id",enq.id)
      .is("cancelled_at",null)
      .order("scheduled_at",{ascending:true});
    setSequences(data||[]);
    setLoadingSeq(false);
  }

  async function cancelSequence(seqId){
    if(!confirm("Cancel this scheduled follow-up?"))return;
    await supabase.from("email_sequences").update({cancelled_at:new Date().toISOString()}).eq("id",seqId);
    setSequences(p=>p.filter(s=>s.id!==seqId));
  }

  async function cancelAllPending(type){
    if(!confirm("Cancel all pending " + type + " follow-ups for this enquiry?"))return;
    await supabase.from("email_sequences")
      .update({cancelled_at:new Date().toISOString()})
      .eq("enquiry_id",enq.id).eq("sequence_type",type)
      .is("sent_at",null).is("cancelled_at",null);
    loadSequences();
  }

  const pendingSeqs=sequences.filter(s=>!s.sent_at);
  const sentSeqs=sequences.filter(s=>s.sent_at);

  function setLF(k,v){setLogForm(f=>({...f,[k]:v}));}
  async function handleLog(){
    if(!logForm.subject.trim()||!logForm.body.trim()){alert("Subject and body required.");return;}
    setSaving(true);
    await onLogEmail({enquiry_id:enq.id,customer_name:enq.customer_name,direction:logForm.direction,subject:logForm.subject,body:logForm.body,from_email:logForm.direction==="received"?(logForm.from_email||enq.contact_person||enq.customer_name):"sales@mail.ingredientz.co",to_email:logForm.direction==="received"?"sales@mail.ingredientz.co":(enq.customer_email||enq.contact_person),sent_at:new Date().toISOString()});
    setLogForm({direction:"received",subject:"",body:"",from_email:""});
    setShowLog(false);setSaving(false);
  }

  const inp={background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 10px",color:C.ink,fontFamily:"Arial,sans-serif",fontSize:12,outline:"none",width:"100%"};

  return <div style={{padding:"16px 0"}}>
    {/* ── Scheduled Sequences Panel ─────────────────────────────────────── */}
    {pendingSeqs.length>0&&<div style={{background:"#FFFBF0",border:"1px solid #FFE0A3",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:"#F5A623",textTransform:"uppercase"}}>📅 Scheduled Follow-ups ({pendingSeqs.length})</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {pendingSeqs.map(s=>{
          const typeLabel=s.sequence_type==="quotation"?"Customer":"Supplier";
          const stepLabel=["1st","2nd","3rd"][s.step-1]||`Step ${s.step}`;
          const dueDate=new Date(s.scheduled_at);
          const isOverdue=dueDate<new Date();
          return <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"white",borderRadius:7,padding:"7px 10px",border:"1px solid #FFE0A3"}}>
            <div>
              <span style={{fontSize:11,fontWeight:700,color:"#F5A623",marginRight:6}}>{typeLabel} {stepLabel}</span>
              <span style={{fontSize:11,color:"#888"}}>→ {s.to_email}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:isOverdue?"#FA3E3E":"#888",fontWeight:isOverdue?700:400}}>
                {isOverdue?"Sending soon…":fmtDate(s.scheduled_at)}
              </span>
              <button onClick={()=>cancelSequence(s.id)} style={{background:"none",border:"1px solid #ddd",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:10,color:"#888"}}>✕ Cancel</button>
            </div>
          </div>;
        })}
      </div>
    </div>}

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase"}}>Email Thread ({enqThreads.length})</div>
      <button onClick={()=>setShowLog(!showLog)} style={{background:C.blue,color:"white",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Log Email</button>
    </div>
    {showLog&&<div style={{background:C.bg,borderRadius:10,padding:14,border:`1px solid ${C.border}`,marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:700,color:C.ink,marginBottom:12}}>Log an Email</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Direction</label>
          <select value={logForm.direction} onChange={e=>setLF("direction",e.target.value)} style={inp}>
            <option value="received">Received (from customer)</option>
            <option value="sent">Sent (by us)</option>
          </select>
        </div>
        {logForm.direction==="received"&&<div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>From</label>
          <input value={logForm.from_email} onChange={e=>setLF("from_email",e.target.value)} placeholder={enq.contact_person||"Customer name"} style={inp}/>
        </div>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:10}}>
        <label style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Subject</label>
        <input value={logForm.subject} onChange={e=>setLF("subject",e.target.value)} placeholder="e.g. Re: Quotation for Ashwagandha Extract" style={inp}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
        <label style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Email Body</label>
        <textarea value={logForm.body} onChange={e=>setLF("body",e.target.value)} rows={4} placeholder="Paste or type the email content here…"
          style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 10px",color:C.ink,fontSize:12,outline:"none",resize:"vertical"}}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={handleLog} disabled={saving} style={{background:C.blue,color:"white",border:"none",borderRadius:7,padding:"8px 16px",cursor:saving?"not-allowed":"pointer",fontSize:12,fontWeight:700}}>{saving?"Saving…":"Save Email"}</button>
        <button onClick={()=>setShowLog(false)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 14px",cursor:"pointer",color:C.muted,fontSize:12}}>Cancel</button>
      </div>
    </div>}
    {enqThreads.length===0
      ?<div style={{textAlign:"center",padding:"32px 16px",color:C.muted,fontSize:12}}>
        No emails yet. Emails sent from the Quotation tab are auto-logged here.<br/>
        <span style={{fontSize:11}}>Manually log received replies using + Log Email.</span>
      </div>
      :<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {enqThreads.map(t=>{
          const isSent=t.direction==="sent"||t.direction==="auto-sent";
          return <div key={t.id} style={{background:isSent?C.blueLt:C.bg,border:`1px solid ${isSent?"#BFD6F6":C.border}`,borderRadius:10,padding:"12px 14px",marginLeft:isSent?24:0,marginRight:isSent?0:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:isSent?C.blue:"#E4E6EB",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:isSent?"white":C.ink,flexShrink:0}}>
                  {isSent?"I":"C"}
                </div>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:C.ink}}>{isSent?(t.from_email||"sales@mail.ingredientz.co"):(t.from_email||enq.customer_name)}</div>
                  <div style={{fontSize:10,color:C.muted}}>to {isSent?(t.to_email||enq.contact_person||enq.customer_name):"sales@mail.ingredientz.co"}</div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                <div style={{fontSize:10,color:C.muted}}>{fmtDate(t.sent_at)} {t.sent_at?new Date(t.sent_at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):""}</div>
                {t.direction==="auto-sent"&&<span style={{background:C.blueLt,color:C.blue,border:`1px solid #BFD6F6`,borderRadius:20,padding:"1px 7px",fontSize:9,fontWeight:700}}>AUTO-SENT</span>}
                {t.direction==="received"&&<span style={{background:"#E4E6EB",color:C.muted,border:`1px solid ${C.border}`,borderRadius:20,padding:"1px 7px",fontSize:9,fontWeight:700}}>RECEIVED</span>}
              </div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:C.ink,marginBottom:6}}>{t.subject}</div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:100,overflow:"hidden"}}>{t.body}</div>
          </div>;
        })}
      </div>
    }
  </div>;
}


export { EmailThreadTab };
