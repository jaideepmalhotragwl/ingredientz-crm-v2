import { useState } from "react";
import { C, UNITS, PAYMENT_TERMS, INCOTERMS } from "../constants.js";
import { fmtDate } from "../utils.js";
import { QUOTATION_TEMPLATE } from "../templates.js";

// ── QUOTATION TAB ─────────────────────────────────────────────────────────────
function QuotationTab({enq,quotations,onSave,onSendEmail,users}) {
  const enqQuots=quotations.filter(q=>q.enquiry_id===enq.id).sort((a,b)=>b.version-a.version);
  const latest=enqQuots[0];
  const recalcItems = (items) => (items||[]).map(it => {
    const q = parseFloat(it.qty)||0;
    const p = parseFloat(it.unitPrice)||0;
    return {...it, totalPrice: q&&p ? (q*p).toFixed(2) : (it.totalPrice||"")};
  });
  const [form,setForm]=useState(()=>latest?{
    validity_days:latest.validity_days||30,paymentTerms:latest.payment_terms||"",
    incoterms:latest.incoterms||"CIF",notes:latest.notes||"",
    items:recalcItems(Array.isArray(latest.items)?latest.items:[]),
  }:{validity_days:30,paymentTerms:"",incoterms:"CIF",notes:"",
    items:(Array.isArray(enq.products)?enq.products:[]).map(p=>({name:p.name||"",qty:String(p.qty||""),unit:p.unit||"kg",unitPrice:"",totalPrice:""}))});
  const [saving,setSaving]=useState(false);
  const [sending,setSending]=useState(false);
  const [sent,setSent]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [attachments,setAttachments]=useState([]);

  async function handleAttachmentChange(e){
    const files=Array.from(e.target.files);
    const encoded=await Promise.all(files.map(f=>new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=()=>res({filename:f.name,content:r.result.split(",")[1]});
      r.onerror=rej;
      r.readAsDataURL(f);
    })));
    setAttachments(p=>[...p,...encoded]);
    e.target.value="";
  }
  function removeAttachment(idx){setAttachments(p=>p.filter((_,i)=>i!==idx));}

  function setF(k,v){setForm(f=>({...f,[k]:v}));}
  function setItem(i,field,val){
    setForm(f=>{
      const items=f.items.map((it,idx)=>{
        if(idx!==i)return it;
        const u={...it,[field]:val};
        const q=parseFloat(field==="qty"?val:u.qty)||0;
        const p=parseFloat(field==="unitPrice"?val:u.unitPrice)||0;
        u.totalPrice=q&&p?(q*p).toFixed(2):"";
        return u;
      });
      return {...f,items};
    });
  }
  function addItem(){setForm(f=>({...f,items:[...f.items,{name:"",qty:"",unit:"kg",unitPrice:"",totalPrice:""}]}));}
  function removeItem(i){setForm(f=>({...f,items:f.items.filter((_,idx)=>idx!==i)}));}

  const grandTotal=form.items.reduce((s,it)=>s+(parseFloat(it.totalPrice)||0),0);

  async function handleSave(){
    if(!form.items.length||!form.items[0].name){alert("Add at least one product.");return;}
    setSaving(true);
    const newVer=(latest?.version||0)+1;
    await onSave({enquiry_id:enq.id,customer_name:enq.customer_name,version:newVer,items:form.items,grand_total:grandTotal,currency:enq.currency||"USD",validity_days:form.validity_days,payment_terms:form.paymentTerms,incoterms:form.incoterms,notes:form.notes,status:"Draft"});
    setSaving(false);
  }

  async function handleSend(){
    setSending(true);
    await onSendEmail(enq,form,grandTotal,users,attachments.length>0?attachments:undefined);
    setSent(true);setTimeout(()=>setSent(false),3000);setSending(false);
  }

  const inp={background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",color:C.ink,fontFamily:"Arial,sans-serif",fontSize:12,outline:"none",width:"100%"};

  return <div style={{padding:"16px 0"}}>
    {enqQuots.length>0&&<div style={{marginBottom:14}}>
      <button onClick={()=>setShowHistory(!showHistory)} style={{background:C.blueLt,border:`1px solid #BFD6F6`,borderRadius:7,padding:"5px 12px",cursor:"pointer",color:C.blue,fontSize:11,fontWeight:700}}>
        {showHistory?"▲ Hide":"▼ Show"} Version History ({enqQuots.length})
      </button>
      {showHistory&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
        {enqQuots.map(q=><div key={q.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.bg,borderRadius:8,padding:"8px 12px",border:`1px solid ${C.border}`}}>
          <div>
            <span style={{fontSize:12,fontWeight:700,color:C.ink}}>v{q.version}</span>
            <span style={{fontSize:11,color:C.muted,marginLeft:8}}>{fmtDate(q.created_at)}</span>
            <span style={{fontSize:11,color:C.muted,marginLeft:8}}>{q.currency} {Number(q.grand_total||0).toLocaleString()}</span>
          </div>
          <span style={{background:q.status==="Sent"?"#E6F4EA":C.bg,color:q.status==="Sent"?C.green:C.muted,border:`1px solid ${q.status==="Sent"?"#C3E6CB":C.border}`,borderRadius:20,padding:"2px 9px",fontSize:10,fontWeight:700}}>{q.status}</span>
        </div>)}
      </div>}
    </div>}
    <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase",marginBottom:12}}>
      {latest?`v${(latest.version||0)+1} — Edit Quotation`:"Create Quotation"}
    </div>
    <div style={{marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 80px 70px 90px 90px 28px",gap:6,marginBottom:6}}>
        {["Product","Qty","Unit","Unit Price","Total",""].map((h,i)=><div key={i} style={{fontSize:9,fontWeight:700,letterSpacing:1,color:C.muted,textTransform:"uppercase"}}>{h}</div>)}
      </div>
      {form.items.map((it,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 80px 70px 90px 90px 28px",gap:6,marginBottom:6,alignItems:"center"}}>
        <input value={it.name} onChange={e=>setItem(i,"name",e.target.value)} placeholder="Product name" style={inp}/>
        <input value={it.qty} onChange={e=>setItem(i,"qty",e.target.value)} placeholder="500" style={inp}/>
        <select value={it.unit} onChange={e=>setItem(i,"unit",e.target.value)} style={{...inp,padding:"7px 4px"}}>
          {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
        </select>
        <input value={it.unitPrice} onChange={e=>setItem(i,"unitPrice",e.target.value)} placeholder="0.00" style={inp}/>
        <div style={{background:C.blueLt,border:`1px solid #BFD6F6`,borderRadius:7,padding:"7px 10px",fontSize:12,color:C.blue,fontWeight:700}}>
          {it.totalPrice&&parseFloat(it.totalPrice)>0?Number(it.totalPrice).toLocaleString():"—"}
        </div>
        <button onClick={()=>removeItem(i)} disabled={form.items.length===1}
          style={{background:"transparent",border:`1px solid ${C.red}44`,borderRadius:6,width:26,height:30,cursor:form.items.length===1?"not-allowed":"pointer",color:C.red,fontSize:14,opacity:form.items.length===1?0.3:1,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>)}
      <button onClick={addItem} style={{border:`1px dashed ${C.border}`,borderRadius:8,padding:"7px",cursor:"pointer",color:C.blue,fontSize:11,background:"transparent",width:"100%",textAlign:"center",marginTop:4}}>+ Add Product</button>
      {grandTotal>0&&<div style={{display:"flex",justifyContent:"flex-end",marginTop:10,paddingTop:10,borderTop:`2px solid ${C.border}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.ink}}>Grand Total: <span style={{color:C.blue}}>{enq.currency||"USD"} {grandTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
      </div>}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <label style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Validity (days)</label>
        <input value={form.validity_days} onChange={e=>setF("validity_days",e.target.value)} style={inp}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <label style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Payment Terms</label>
        <select value={form.paymentTerms} onChange={e=>setF("paymentTerms",e.target.value)} style={{...inp,color:form.paymentTerms?C.ink:C.muted}}>
          <option value="">Select…</option>{PAYMENT_TERMS.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <label style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Incoterms</label>
        <select value={form.incoterms} onChange={e=>setF("incoterms",e.target.value)} style={inp}>
          {INCOTERMS.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:16}}>
      <label style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Notes / Special Conditions</label>
      <textarea value={form.notes} onChange={e=>setF("notes",e.target.value)} rows={3} placeholder="e.g. Price subject to exchange rate fluctuation. Samples available on request."
        style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.ink,fontSize:12,outline:"none",resize:"vertical"}}/>
    </div>
    <div style={{marginBottom:16}}>
      <label style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase",display:"block",marginBottom:6}}>Attachments (optional)</label>
      <label style={{display:"inline-flex",alignItems:"center",gap:6,background:C.bg,border:`1px dashed ${C.border}`,borderRadius:7,padding:"7px 14px",cursor:"pointer",fontSize:12,color:C.blue,fontWeight:600}}>
        📎 Attach Files
        <input type="file" multiple onChange={handleAttachmentChange} style={{display:"none"}} accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg"/>
      </label>
      {attachments.length>0&&<div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:6}}>
        {attachments.map((a,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:5,background:C.blueLt,border:`1px solid #BFD6F6`,borderRadius:6,padding:"3px 8px",fontSize:11,color:C.blue}}>
          <span>{a.filename}</span>
          <button onClick={()=>removeAttachment(i)} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontWeight:700,fontSize:13,padding:0,lineHeight:1}}>×</button>
        </div>)}
      </div>}
    </div>
    <div style={{display:"flex",gap:10}}>
      <button onClick={handleSave} disabled={saving} style={{background:C.blue,color:"white",border:"none",borderRadius:8,padding:"9px 18px",cursor:saving?"not-allowed":"pointer",fontSize:13,fontWeight:700,opacity:saving?0.6:1}}>
        {saving?"Saving…":"💾 Save Quotation"}
      </button>
      <button onClick={handleSend} disabled={sending||sent} style={{background:sent?C.green:C.green,color:"white",border:"none",borderRadius:8,padding:"9px 18px",cursor:(sending||sent)?"not-allowed":"pointer",fontSize:13,fontWeight:700,opacity:(sending||sent)?0.8:1}}>
        {sent?"✓ Email Sent!":sending?"Sending…":"📧 Send to Customer"}
      </button>
    </div>
  </div>;
}


export { QuotationTab };
