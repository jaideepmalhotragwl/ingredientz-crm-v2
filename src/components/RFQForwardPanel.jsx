import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { sendEmail } from "../utils.js";
import { RFQ_TEMPLATE } from "../templates.js";

// ── SUPPLIER RFQ DRAWER (inside EnquiryDrawer) ────────────────────────────────
function RFQForwardPanel({enq,users,onThreadInserted}) {
  const [suppliers,setSuppliers]=useState([]);
  const [mappings,setMappings]=useState([]);
  const [sending,setSending]=useState({});
  const [sent,setSent]=useState({});

  const PROCUREMENT_SENDER = "procurement@mail.ingredientz.co";
  const PROCUREMENT_REPLY  = "procurement@ingredientz.co";

  useEffect(()=>{
    async function load(){
      const {data:sup}=await supabase.from("suppliers").select("*").eq("status","active");
      const {data:map}=await supabase.from("supplier_products").select("*,suppliers(id,company,contact_name,contact_email),products(id,name)").eq("status","active");
      setSuppliers(sup||[]);setMappings(map||[]);
    }
    load();
  },[]);

  const products=Array.isArray(enq.products)?enq.products:[];

  // For each product in enquiry, find mapped suppliers
  const productSupplierMap=products.map(p=>{
    const matched=mappings.filter(m=>m.products?.name===p.name||m.products?.id===p.product_id);
    return {product:p,mappedSuppliers:matched.map(m=>m.suppliers).filter(Boolean)};
  });

  async function sendRFQ(supplier,productsForSupplier){
    if(!supplier?.contact_email){alert("Supplier has no email.");return;}
    const key=supplier.id;
    setSending(s=>({...s,[key]:true}));
    const subject=RFQ_TEMPLATE.subject(productsForSupplier,enq.id);
    const bodyText=RFQ_TEMPLATE.text(supplier,productsForSupplier,enq);
    const html=RFQ_TEMPLATE.html(supplier,productsForSupplier,enq);
    await sendEmail({
      from:`Ingredientz Procurement <${PROCUREMENT_SENDER}>`,
      to:supplier.contact_email,
      subject,html,text:bodyText,
      reply_to:PROCUREMENT_REPLY
    });
    // Log it
    const threadRow={enquiry_id:enq.id,customer_name:enq.customer_name,direction:"auto-sent",subject,body:bodyText,from_email:PROCUREMENT_SENDER,to_email:supplier.contact_email,sent_at:new Date().toISOString()};
    const {data:tData}=await supabase.from("email_threads").insert(threadRow).select().single();
    if(tData&&onThreadInserted)onThreadInserted(tData);
    // Schedule RFQ follow-up sequence: day 1, 3, 7
    const now=new Date();
    const seqRows=[1,3,7].map((days,idx)=>({
      enquiry_id:enq.id,customer_name:enq.customer_name,sequence_type:"rfq",step:idx+1,
      scheduled_at:new Date(now.getTime()+days*86400000).toISOString(),
      to_email:supplier.contact_email,from_email:PROCUREMENT_SENDER,
      body_preview:productsForSupplier.map(p=>p.name).join(", ")
    }));
    await supabase.from("email_sequences")
      .update({cancelled_at:new Date().toISOString()})
      .eq("enquiry_id",enq.id).eq("sequence_type","rfq")
      .eq("to_email",supplier.contact_email)
      .is("sent_at",null).is("cancelled_at",null);
    await supabase.from("email_sequences").insert(seqRows);
    setSending(s=>({...s,[key]:false}));
    setSent(s=>({...s,[key]:true}));
    setTimeout(()=>setSent(s=>({...s,[key]:false})),4000);
  }

  // Group: which suppliers cover which products
  const supplierProductGroups={};
  productSupplierMap.forEach(({product,mappedSuppliers})=>{
    mappedSuppliers.forEach(sup=>{
      if(!supplierProductGroups[sup.id]){supplierProductGroups[sup.id]={supplier:sup,products:[]};}
      supplierProductGroups[sup.id].products.push(product);
    });
  });

  const groups=Object.values(supplierProductGroups);

  return <div style={{padding:"16px 0"}}>
    <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase",marginBottom:4}}>Forward RFQ to Suppliers</div>
    <div style={{fontSize:11,color:C.muted,marginBottom:14}}>Sending from: <span style={{color:C.ink,fontWeight:600}}>{PROCUREMENT_SENDER}</span></div>
    {groups.length===0
      ?<div style={{textAlign:"center",padding:"32px 16px",color:C.muted,fontSize:12}}>
        No suppliers mapped to these products yet.<br/>
        <span style={{fontSize:11}}>Go to Products tab → select a product → map suppliers.</span>
      </div>
      :groups.map(({supplier,products:prods})=>(
      <div key={supplier.id} style={{background:C.bg,borderRadius:10,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.ink}}>{supplier.company}</div>
            <div style={{fontSize:11,color:C.muted}}>{supplier.contact_name||""}{supplier.contact_email?` · ${supplier.contact_email}`:""}</div>
          </div>
          <button onClick={()=>sendRFQ(supplier,prods)} disabled={sending[supplier.id]||sent[supplier.id]}
            style={{background:sent[supplier.id]?C.green:C.blue,color:"white",border:"none",borderRadius:7,padding:"6px 14px",cursor:(sending[supplier.id]||sent[supplier.id])?"not-allowed":"pointer",fontSize:11,fontWeight:700,opacity:(sending[supplier.id]||sent[supplier.id])?0.8:1,whiteSpace:"nowrap"}}>
            {sent[supplier.id]?"✓ RFQ Sent!":sending[supplier.id]?"Sending…":"📨 Send RFQ"}
          </button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {prods.map((product,i)=>(
            <div key={i} style={{fontSize:12,color:C.ink}}><span style={{fontSize:10,color:C.amber,fontWeight:700,marginRight:8}}>▸</span>{product.name}{product.qty?` — ${product.qty} ${product.unit||"kg"}`:""}</div>
          ))}
        </div>
        {productSupplierMap.filter(({mappedSuppliers})=>mappedSuppliers.length===0).map(({product},i)=>(
          <div key={i} style={{fontSize:12,color:C.ink}}><span style={{fontSize:10,color:C.amber,fontWeight:700,marginRight:8}}>⚠ No supplier</span>{product.name}</div>
        ))}
      </div>
    ))}
  </div>;
}

export { RFQForwardPanel };
