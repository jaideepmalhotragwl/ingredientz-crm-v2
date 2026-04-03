import { useState } from "react";
import { supabase } from "../config.js";
import { C, STAGES, UNITS, SOURCES, PAYMENT_TERMS, INCOTERMS } from "../constants.js";
import { reminderDate } from "../utils.js";
import { FF, FTA } from "./ui/FormFields.jsx";
import { Btn } from "./ui/Btn.jsx";
import { ProductAutocomplete } from "./ProductAutocomplete.jsx";

const EMPTY_ENQ = {
  customer_id:"", customer_name:"", contact_person:"", country:"",
  products:[{name:"",qty:"",unit:"kg"}],
  expected_value:"", currency:"USD",
  source:"", assigned_to:"", priority:"Medium", stage:"New Enquiry",
  expected_closure:"", reminder_amount:"2", reminder_unit:"days",
  quotation_sent:false, customer_response:"", purchase_order:"", notes:"",
  enquiry_date: new Date().toISOString().split("T")[0],
};


function EnquiryForm({onSave,onClose,customers,users,initial=null}) {
  const [form,setForm]=useState(()=>initial?{
    ...EMPTY_ENQ,...initial,
    products:Array.isArray(initial.products)?initial.products:[{name:"",qty:"",unit:"kg"}],
    expected_closure:initial.expected_closure?initial.expected_closure.split("T")[0]:"",
    enquiry_date:initial.enquiry_date?initial.enquiry_date.split("T")[0]:new Date().toISOString().split("T")[0],
  }:{...EMPTY_ENQ});
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);

  function set(k,v){setForm(f=>{const u={...f,[k]:v};if(k==="customer_id"){const c=customers.find(x=>String(x.id)===String(v));if(c){u.customer_name=c.company;u.country=c.country||"";u.contact_person=c.contact||"";}}return u;});}
  function setProduct(i,field,val){setForm(f=>({...f,products:f.products.map((p,idx)=>idx===i?{...p,[field]:val}:p)}));}
  function addProduct(){setForm(f=>({...f,products:[...f.products,{name:"",qty:"",unit:"kg"}]}));}
  function removeProduct(i){setForm(f=>({...f,products:f.products.length>1?f.products.filter((_,idx)=>idx!==i):f.products}));}

  async function save(){
    if(!form.customer_name.trim()){alert("Customer name required.");return;}
    if(!form.products[0]?.name?.trim()){alert("At least one product required.");return;}
    setSaving(true);
    const row={
      customer_id:form.customer_id||null,
      customer_name:form.customer_name,
      contact_person:form.contact_person,
      country:form.country,
      products:form.products.filter(p=>p.name.trim()),
      expected_value:form.expected_value?parseFloat(form.expected_value):null,
      currency:form.currency,
      source:form.source,
      assigned_to:form.assigned_to,
      priority:form.priority,
      stage:form.stage,
      expected_closure:form.expected_closure||null,
      reminder_amount:form.reminder_amount?parseInt(form.reminder_amount):null,
      reminder_unit:form.reminder_unit,
      reminder_date:reminderDate(form.reminder_amount,form.reminder_unit)||null,
      quotation_sent:form.quotation_sent,
      customer_response:form.customer_response,
      purchase_order:form.purchase_order,
      notes:form.notes,
      enquiry_date:form.enquiry_date||new Date().toISOString().split("T")[0],
      created_by:form.assigned_to||"Jaideep",
    };
    // Auto-create any products not yet in DB
    const { data: existingProducts } = await supabase.from("products").select("name");
    const existingNames = new Set((existingProducts || []).map(p => p.name.toLowerCase().trim()));
    for (const p of row.products) {
      const trimmed = p.name?.trim();
      if (!trimmed) continue;
      if (!existingNames.has(trimmed.toLowerCase())) {
        const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now();
        await supabase.from("products").insert({ name: trimmed, slug, unit: p.unit || "kg", status: "pending", created_by: row.assigned_to || "system" });
      }
    }
    await onSave(row, initial?.id);
    setDone(true);
    setTimeout(()=>{setDone(false);setSaving(false);if(!initial)setForm(EMPTY_ENQ);},1200);
    if(initial)onClose();
  }

  const custOpts=customers.map(c=>({v:String(c.id),l:c.company}));
  const userOpts=users.filter(u=>u.active).map(u=>({v:u.name,l:u.name}));
  const inp={background:C.white,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",color:C.ink,fontFamily:"Arial,sans-serif",fontSize:13,outline:"none"};

  return <div style={{display:"flex",flexDirection:"column",gap:18}}>
    <div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase",marginBottom:10}}>Customer Details</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <FF label="Customer" k="customer_id" value={form.customer_id} onChange={set} options={custOpts}/>
        <FF label="Or type company *" k="customer_name" value={form.customer_name} onChange={set} placeholder="Company name"/>
        <FF label="Contact Person" k="contact_person" value={form.contact_person} onChange={set} placeholder="Full name"/>
        <FF label="Country" k="country" value={form.country} onChange={set} placeholder="e.g. Germany"/>
        <FF label="Source" k="source" value={form.source} onChange={set} options={SOURCES}/>
        <FF label="Assigned To" k="assigned_to" value={form.assigned_to} onChange={set} options={userOpts}/>
      </div>
    </div>
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase"}}>Products ({form.products.length})</div>
        <button onClick={addProduct} style={{background:C.blueLt,border:`1px solid #BFD6F6`,borderRadius:7,padding:"4px 12px",cursor:"pointer",color:C.blue,fontSize:11,fontWeight:700}}>+ Add Product</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"grid",gridTemplateColumns:"26px 1fr 110px 90px 32px",gap:7,padding:"0 4px"}}>
          {["#","Product Name","Qty","Unit",""].map((h,i)=><div key={i} style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>{h}</div>)}
        </div>
        {form.products.map((p,idx)=>(
          <div key={idx} style={{display:"grid",gridTemplateColumns:"26px 1fr 110px 90px 32px",gap:7,alignItems:"center",background:C.bg,borderRadius:9,padding:"9px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:14,color:C.blue,fontWeight:700,textAlign:"center"}}>{idx+1}</div>
            <ProductAutocomplete
                value={p.name}
                onChange={val => setProduct(idx, "name", val)}
                onSelect={product => setForm(f => ({
                  ...f,
                  products: f.products.map((pr, i) =>
                    i === idx ? { ...pr, name: product.name, unit: product.unit || pr.unit } : pr
                  )
                }))}
              />
            <input value={p.qty} onChange={e=>setProduct(idx,"qty",e.target.value)} placeholder="500" style={inp}/>
            <select value={p.unit} onChange={e=>setProduct(idx,"unit",e.target.value)} style={{...inp,padding:"7px 8px"}}>
              {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
            <button onClick={()=>removeProduct(idx)} disabled={form.products.length===1}
              style={{background:"transparent",border:`1px solid ${C.red}44`,borderRadius:7,width:30,height:30,cursor:form.products.length===1?"not-allowed":"pointer",color:C.red,fontSize:15,opacity:form.products.length===1?0.3:1,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        ))}
        <button onClick={addProduct} style={{border:`1px dashed ${C.border}`,borderRadius:9,padding:"9px",cursor:"pointer",color:C.blue,fontSize:11,background:"transparent",width:"100%",textAlign:"center"}}>+ Add Another Product</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
      <FF label="Expected Value" k="expected_value" value={form.expected_value} onChange={set} placeholder="e.g. 12000"/>
      <FF label="Currency" k="currency" value={form.currency} onChange={set} options={["USD","EUR","GBP","INR","AED"]}/>
      <FF label="Stage" k="stage" value={form.stage} onChange={set} options={STAGES}/>
      <FF label="Priority" k="priority" value={form.priority} onChange={set} options={["High","Medium","Low"]}/>
      <FF label="Date of Enquiry" k="enquiry_date" value={form.enquiry_date} onChange={set} type="date"/>
      <FF label="Expected Closure" k="expected_closure" value={form.expected_closure} onChange={set} type="date"/>
      <FF label="Remind After" k="reminder_amount" value={form.reminder_amount} onChange={set} placeholder="e.g. 2"/>
      <FF label="Remind Unit" k="reminder_unit" value={form.reminder_unit} onChange={set} options={["hours","days","weeks"]}/>
    </div>
    <div onClick={()=>set("quotation_sent",!form.quotation_sent)}
      style={{display:"inline-flex",alignItems:"center",gap:9,background:C.bg,borderRadius:9,padding:"10px 14px",border:`1px solid ${form.quotation_sent?C.blue:C.border}`,cursor:"pointer",width:"fit-content"}}>
      <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${form.quotation_sent?C.blue:C.muted}`,background:form.quotation_sent?C.blue:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {form.quotation_sent&&<span style={{color:"white",fontSize:10,fontWeight:900}}>✓</span>}
      </div>
      <span style={{fontSize:12,color:form.quotation_sent?C.ink:C.muted}}>Quotation Sent</span>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <FTA label="Customer Response" k="customer_response" value={form.customer_response} onChange={set} placeholder="What did the customer say?"/>
      <FTA label="Notes / Follow-up" k="notes" value={form.notes} onChange={set} placeholder="Internal notes…"/>
    </div>
    <FF label="Purchase Order #" k="purchase_order" value={form.purchase_order} onChange={set} placeholder="PO number if received"/>
    <div style={{display:"flex",gap:10,paddingTop:6}}>
      <Btn label={saving?"Saving…":done?"✓ Saved!":initial?"Update Enquiry":"Save Enquiry"} onClick={save} size="lg" disabled={saving}/>
      <Btn label="Cancel" onClick={onClose} variant="ghost"/>
    </div>
  </div>;
}

// ── CUSTOMER FORM ─────────────────────────────────────────────────────────────
function CustomerForm({onSave,onClose,initial=null}) {
  const [form,setForm]=useState(initial||{company:"",country:"",contact:"",email:"",phone:"",notes:""});
  const [done,setDone]=useState(false);
  function set(k,v){setForm(f=>({...f,[k]:v}));}
  async function save(){if(!form.company.trim()){alert("Company name required.");return;}await onSave(form,initial?.id);setDone(true);setTimeout(()=>{setDone(false);if(!initial)setForm({company:"",country:"",contact:"",email:"",phone:"",notes:""});},1200);if(initial)onClose();}
  return <div style={{display:"flex",flexDirection:"column",gap:12}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <FF label="Company Name *" k="company" value={form.company} onChange={set} placeholder="e.g. Nexira SAS"/>
      <FF label="Country" k="country" value={form.country} onChange={set} placeholder="e.g. France"/>
      <FF label="Primary Contact" k="contact" value={form.contact} onChange={set} placeholder="Full name"/>
      <FF label="Email" k="email" value={form.email} onChange={set} type="email" placeholder="procurement@company.com"/>
      <FF label="Phone" k="phone" value={form.phone} onChange={set} placeholder="+33 1 23 45 67"/>
    </div>
    <FTA label="Notes" k="notes" value={form.notes} onChange={set} placeholder="Any relevant info…"/>
    <div style={{display:"flex",gap:10}}><Btn label={done?"✓ Saved!":initial?"Update":"Add Customer"} onClick={save}/><Btn label="Cancel" onClick={onClose} variant="ghost"/></div>
  </div>;
}

// ── USER FORM ─────────────────────────────────────────────────────────────────
function UserForm({onSave,onClose,initial=null}) {
  const [form,setForm]=useState(initial||{name:"",email:"",role:"Sales",sender_email:"sales@mail.ingredientz.co",active:true});
  const [done,setDone]=useState(false);
  function set(k,v){setForm(f=>({...f,[k]:v}));}
  async function save(){if(!form.name.trim()||!form.email.trim()){alert("Name and email required.");return;}await onSave(form,initial?.id);setDone(true);setTimeout(()=>setDone(false),1200);if(initial)onClose();}
  return <div style={{display:"flex",flexDirection:"column",gap:12}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <FF label="Full Name *" k="name" value={form.name} onChange={set} placeholder="e.g. Param Sharma"/>
      <FF label="Email *" k="email" value={form.email} onChange={set} type="email" placeholder="param@ingredientz.com"/>
      <FF label="Role" k="role" value={form.role} onChange={set} options={["Admin","Sales","Manager","Support"]}/>
      <FF label="Sender Email" k="sender_email" value={form.sender_email} onChange={set} options={[{v:"sales@mail.ingredientz.co",l:"sales@mail.ingredientz.co"}]}/>
      <FF label="Active" k="active" value={form.active?"Yes":"No"} onChange={(k,v)=>set("active",v==="Yes")} options={["Yes","No"]}/>
    </div>
    <div style={{display:"flex",gap:10}}><Btn label={done?"✓ Saved!":initial?"Update":"Add User"} onClick={save}/><Btn label="Cancel" onClick={onClose} variant="ghost"/></div>
  </div>;
}


export { EnquiryForm, CustomerForm, UserForm };
