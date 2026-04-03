import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { sendEmail } from "../utils.js";
import { RFQ_TEMPLATE } from "../templates.js";

// ── SUPPLIER RFQ DRAWER (inside EnquiryDrawer) ────────────────────────────────
function RFQForwardPanel({enq,users}) {
  const [suppliers,setSuppliers]=useState([]);
  const [mappings,setMappings]=useState([]);
  const [sending,setSending]=useState({});
  const [sent,setSent]=useState({});

  useEffect(()=>{loadData();},[enq.id]);

  async function loadData(){
    const {data:sup}=await supabase.from("suppliers").select("*").eq("status","active");
    const {data:map}=await supabase.from("supplier_products").select("*,suppliers(id,company,contact_name,contact_email),products(id,name)").eq("status","active");
    setSuppliers(sup||[]);
    setMappings(map||[]);
  }

  const products=Array.isArray(enq.products)?enq.products:[];

  // For each product in enquiry, find mapped suppliers
  const productSupplierMap=products.map(p=>{
    const matched=mappings.filter(m=>m.products?.name?.toLowerCase()===p.name?.toLowerCase()||m.products?.name?.toLowerCase().includes(p.name?.toLowerCase())||p.name?.toLowerCase().includes(m.products?.name?.toLowerCase()));
    return {product:p,mappedSuppliers:matched.map(m=>m.suppliers).filter(Boolean)};
  });

  const hasAnyMapping=productSupplierMap.some(p=>p.mappedSuppliers.length>0);

  async function sendRFQ(supplier,productsForSupplier){
    if(!supplier?.contact_email){alert("Supplier has no email.");return;}
    const key=supplier.id;
    setSending(s=>({...s,[key]:true}));
    const sender="sales@mail.ingredientz.co";
    const subject=RFQ_TEMPLATE.subject(productsForSupplier,enq.id);
    const bodyText=RFQ_TEMPLATE.text(supplier,productsForSupplier,enq);
    const html=RFQ_TEMPLATE.html(supplier,productsForSupplier,enq);
    await sendEmail({from:`Ingredientz Sourcing <${sender}>`,to:supplier.contact_email,subject,html,text:bodyText,reply_to:"sales@ingredientz.co"});
    // Log it
    await supabase.from("email_threads").insert({enquiry_id:enq.id,customer_name:enq.customer_name,direction:"auto-sent",subject,body:bodyText,from_email:sender,to_email:supplier.contact_email,sent_at:new Date().toISOString()});
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

  return <div style={{paddingTop:14}}>
    <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase",marginBottom:12}}>Forward RFQ to Suppliers</div>
    {groups.length===0&&<div style={{background:C.bg,borderRadius:10,padding:16,border:`1px solid ${C.border}`,fontSize:12,color:C.muted,textAlign:"center"}}>
      <div style={{fontSize:20,marginBottom:8}}>🔗</div>
      No suppliers mapped to these products yet.<br/>
      <span style={{fontSize:11}}>Go to Products tab → select a product → map suppliers.</span>
    </div>}
    {groups.map(({supplier,products:prods})=>(
      <div key={supplier.id} style={{background:C.bg,borderRadius:10,padding:14,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.ink}}>{supplier.company}</div>
            <div style={{fontSize:11,color:C.muted}}>{supplier.contact_name||""}{supplier.contact_email?` · ${supplier.contact_email}`:""}</div>
          </div>
          <button onClick={()=>sendRFQ(supplier,prods)} disabled={sending[supplier.id]||sent[supplier.id]}
            style={{background:sent[supplier.id]?C.green:C.blue,color:"white",border:"none",borderRadius:7,padding:"6px 14px",cursor:(sending[supplier.id]||sent[supplier.id])?"not-allowed":"pointer",fontSize:11,fontWeight:700,opacity:(sending[supplier.id]||sent[supplier.id])?0.8:1,whiteSpace:"nowrap"}}>
            {sent[supplier.id]?"✓ RFQ Sent!":sending[supplier.id]?"Sending…":"📨 Send RFQ"}
          </button>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {prods.map((p,i)=><span key={i} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 10px",fontSize:11,color:C.ink}}>{p.name}{p.qty?` · ${p.qty} ${p.unit||"kg"}`:""}</span>)}
        </div>
      </div>
    ))}
    {/* Unmapped products */}
    {productSupplierMap.filter(p=>p.mappedSuppliers.length===0).map(({product},i)=>(
      <div key={i} style={{background:"#FFFBF0",borderRadius:10,padding:"10px 14px",border:`1px solid #FFE0A3`,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:12,color:C.ink}}><span style={{fontSize:10,color:C.amber,fontWeight:700,marginRight:8}}>⚠ No supplier</span>{product.name}</div>
        <span style={{fontSize:10,color:C.amber}}>Source needed</span>
      </div>
    ))}
  </div>;
}


export { RFQForwardPanel };
