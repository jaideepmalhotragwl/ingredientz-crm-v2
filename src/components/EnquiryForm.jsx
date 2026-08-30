import { useState, useEffect, useMemo } from "react";
import { supabase } from "../config.js";
import { C, STAGES, UNITS, SOURCES } from "../constants.js";
import { reminderDate } from "../utils.js";
import { FF, FTA } from "./ui/FormFields.jsx";
import { Btn } from "./ui/Btn.jsx";
import { ProductAutocomplete } from "./ProductAutocomplete.jsx";
import { CompanyPicker } from "./CompanyPicker.jsx";
// ── Reason the enquiry is being raised (required at creation). Edit freely. ──
const ENQUIRY_REASONS = ["New requirement","Repeat / re-order","Sample request","Price / budgetary","Tender / RFQ","Referral","Other"];
// ── Feature #8: Indian FY (Apr–Mar) quarter tag. Returns { fy:"2627", q:1, qStart, qEnd }. ──
function fyQuarter(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const m = d.getMonth(), y = d.getFullYear();
  const startYear = m >= 3 ? y : y - 1;                       // FY starts 1 April
  const fy = `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;  // e.g. 2627
  const q = (m >= 3 && m <= 5) ? 1 : (m >= 6 && m <= 8) ? 2 : (m >= 9 && m <= 11) ? 3 : 4;
  const qStartMonth = [3, 6, 9, 0][q - 1];
  const qYear = q === 4 ? startYear + 1 : startYear;          // Q4 = Jan–Mar of next calendar year
  const iso = dd => dd.toISOString().split("T")[0];
  const qStart = new Date(qYear, qStartMonth, 1);
  const qEnd = new Date(qYear, qStartMonth + 3, 0);           // last day of the quarter
  return { fy, q, qStart: iso(qStart), qEnd: iso(qEnd) };
}
const EMPTY_ENQ = {
  company_id:"", customer_id:"", customer_name:"", contact_person:"",
  country:"", country_iso2:"", email:"", phone_dial:"", phone_national:"",
  enquiry_reason:"",
  products:[{name:"",qty:"",unit:"kg"}],
  expected_value:"", currency:"USD",
  source:"", assigned_to:"", priority:"Medium", stage:"New Enquiry",
  expected_closure:"", reminder_amount:"2", reminder_unit:"days",
  quotation_sent:false, customer_response:"", purchase_order:"", notes:"",
  enquiry_date: new Date().toISOString().split("T")[0],
};

// Read-only field — shows a value that comes from the company record.
function Derived({ label, value, hint }) {
  return <div>
    <label style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, color:C.muted,
                    textTransform:"uppercase", display:"block", marginBottom:5 }}>{label}</label>
    <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:7,
                  padding:"7px 10px", fontSize:13, color: value ? C.ink : C.faded,
                  minHeight:33, display:"flex", alignItems:"center" }}>
      {value || "—"}
    </div>
    {hint && <div style={{ fontSize:9.5, color:C.faded, marginTop:3 }}>{hint}</div>}
  </div>;
}

function EnquiryForm({onSave,onClose,customers,users,initial=null}) {
  const [form,setForm]=useState(()=>initial?{
    ...EMPTY_ENQ,...initial,
    company_id: initial.company_id || "",
    email: initial.email || initial.customer_email || "",
    products:Array.isArray(initial.products)?initial.products:[{name:"",qty:"",unit:"kg"}],
    expected_closure:initial.expected_closure?initial.expected_closure.split("T")[0]:"",
    enquiry_date:initial.enquiry_date?initial.enquiry_date.split("T")[0]:new Date().toISOString().split("T")[0],
  }:{...EMPTY_ENQ});
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);
  const [companies,setCompanies]=useState([]);
  const [addingContact,setAddingContact]=useState(false);
  const [newContact,setNewContact]=useState({ contact:"", email:"", role:"" });

  // Loaded here rather than passed down, so no prop chain through
  // EnquiriesTab and EnquiryDrawer has to change.
  useEffect(()=>{
    supabase.from("companies")
      .select("id,name,domain,country,country_iso2,company_type,agent_id,status,verified")
      .order("name")
      .then(({data})=>setCompanies(data||[]));
  },[]);

  const company = useMemo(
    ()=>companies.find(c=>String(c.id)===String(form.company_id))||null,
    [companies, form.company_id]
  );

  // Only people at the selected company. This is what stops an enquiry being
  // filed against a contact who works somewhere else entirely.
  const contactOpts = useMemo(()=>{
    if(!form.company_id) return [];
    return (customers||[])
      .filter(c=>String(c.company_id_new)===String(form.company_id))
      .sort((a,b)=>(b.is_primary?1:0)-(a.is_primary?1:0));
  },[customers, form.company_id]);

  function set(k,v){setForm(f=>({...f,[k]:v}));}

  function pickCompany(id,row){
    setForm(f=>({
      ...f,
      company_id: id||"",
      customer_name: row?.name || "",
      country: row?.country || "",
      country_iso2: row?.country_iso2 || "",
      // changing company invalidates the contact
      customer_id:"", contact_person:"", email:"", phone_dial:"", phone_national:"",
    }));
  }

  function pickContact(id){
    const c=(customers||[]).find(x=>String(x.id)===String(id));
    setForm(f=>({
      ...f,
      customer_id:id||"",
      contact_person:c?.contact||"",
      email:c?.email||"",
      phone_dial:c?.phone_dial||"",
      phone_national:c?.phone_national||"",
    }));
  }

  async function saveNewContact(){
    if(!form.company_id){alert("Pick a company first.");return;}
    if(!newContact.email.trim()){alert("Email is required.");return;}
    const {data,error}=await supabase.from("customers").insert({
      company_id_new: form.company_id,
      company: company?.name || null,
      contact: newContact.contact.trim()||null,
      role: newContact.role.trim()||null,
      email: newContact.email.trim().toLowerCase(),
      country: form.country||null,
      is_primary: contactOpts.length===0,
    }).select().single();
    if(error){alert("Could not add contact: "+error.message);return;}
    // customers is a prop, so reflect the new row locally for this form only
    customers.push(data);
    pickContact(data.id);
    setAddingContact(false);
    setNewContact({contact:"",email:"",role:""});
  }

  function setProduct(i,field,val){setForm(f=>({...f,products:f.products.map((p,idx)=>idx===i?{...p,[field]:val}:p)}));}
  function addProduct(){setForm(f=>({...f,products:[...f.products,{name:"",qty:"",unit:"kg"}]}));}
  function removeProduct(i){setForm(f=>({...f,products:f.products.length>1?f.products.filter((_,idx)=>idx!==i):f.products}));}

  async function save(){
    if(!form.company_id){alert("Pick a company. Create one from the picker if it's new.");return;}
    if(!initial && !form.enquiry_reason){alert("Please select a reason for this enquiry.");return;}
    if(!form.products[0]?.name?.trim()){alert("At least one product required.");return;}
    setSaving(true);
    const phoneFull=[form.phone_dial,form.phone_national].filter(Boolean).join(" ").trim();
    const row={
      company_id: form.company_id,
      customer_id: form.customer_id||null,
      customer_name: company?.name || form.customer_name,
      contact_person: form.contact_person||null,
      country: form.country||null,
      country_iso2: form.country_iso2||null,
      // NOTE: `email`, not the legacy `customer_email` — notify_new_enquiry()
      // reads NEW.email, so writing the old column silently sends nothing.
      email: form.email?.trim()||null,
      phone: phoneFull||null,
      phone_dial: form.phone_dial||null,
      phone_national: form.phone_national||null,
      enquiry_reason:form.enquiry_reason||null,
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
    // ── Link every line to the catalogue ────────────────────────────────────
    // ensure_product() returns the id of the existing product, or creates
    // one and returns that. The id is written back onto the line, which is
    // what makes product-level reporting possible at all.
    //
    // This previously read the whole products table and compared names in
    // the browser. PostgREST caps a select at 1,000 rows, so with ~2,000
    // products everything after roughly "L" looked missing and was
    // re-inserted on every enquiry — "vitamin c" ended up in the table six
    // times, "xanthan gum" five. The duplication was alphabetical.
    const linked = [];
    for (const p of row.products) {
      const trimmed = p.name?.trim();
      if (!trimmed) continue;
      try {
        const { data: pid, error } = await supabase.rpc("ensure_product", {
          p_name: trimmed,
          p_unit: p.unit || "kg",
          p_created_by: row.assigned_to || "system",
        });
        if (error) throw error;
        linked.push({ ...p, name: trimmed, product_id: pid ?? p.product_id ?? null });
      } catch (e) {
        // A failed lookup must not lose the enquiry. Save the line
        // unlinked and let the 3% be cleaned up later.
        console.error("ensure_product failed for", trimmed, e);
        linked.push({ ...p, name: trimmed });
      }
    }
    row.products = linked;
    // ── Feature #8: FY-quarter review tag (running ENQ id is kept separately) ──
    if (!initial) {
      const { fy, q, qStart, qEnd } = fyQuarter(row.enquiry_date);
      let seq = 1;
      try {
        const { count } = await supabase.from("enquiries")
          .select("id", { count: "exact", head: true })
          .gte("enquiry_date", qStart).lte("enquiry_date", qEnd);
        seq = (count || 0) + 1;
      } catch (e) { console.error("quarter count", e); }
      row.quarter_ref = `${fy}Q${q}-${seq}`;
    } else if (initial.quarter_ref) {
      row.quarter_ref = initial.quarter_ref;
    }
    await onSave(row, initial?.id);
    setDone(true);
    setTimeout(()=>{setDone(false);setSaving(false);if(!initial)setForm(EMPTY_ENQ);},1200);
    if(initial)onClose();
  }

  const userOpts=(users||[]).filter(u=>u.active)
    .slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"",undefined,{sensitivity:"base"}))
    .map(u=>({v:u.name,l:u.name}));
  const inp={background:C.white,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",color:C.ink,fontFamily:"Arial,sans-serif",fontSize:13,outline:"none"};

  return <div style={{display:"flex",flexDirection:"column",gap:18}}>
    <div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase",marginBottom:10}}>Company</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <CompanyPicker value={form.company_id} onChange={pickCompany} companies={companies}/>
        <Derived label="Type" value={company?.company_type} hint="from company record"/>
        <Derived label="Country" value={company?.country} hint="from company record"/>
      </div>
      {company?.status && company.status !== "active" && (
        <div style={{marginTop:8,background:"#FFF0F0",border:`1px solid ${C.red}33`,borderRadius:8,
                     padding:"8px 12px",fontSize:11.5,color:C.red}}>
          ⚠ This company is marked <b>{company.status}</b> — it is excluded from follow-up campaigns.
        </div>
      )}
    </div>

    <div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase",marginBottom:10}}>Contact person</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <div>
          <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase",display:"block",marginBottom:5}}>Contact</label>
          <select value={form.customer_id} onChange={e=>pickContact(e.target.value)}
            disabled={!form.company_id} style={{...inp,width:"100%",cursor:form.company_id?"pointer":"not-allowed"}}>
            <option value="">{form.company_id?(contactOpts.length?"Select contact":"No contacts yet"):"Pick a company first"}</option>
            {contactOpts.map(c=><option key={c.id} value={c.id}>
              {c.contact||c.email}{c.is_primary?" · primary":""}{c.role?` — ${c.role}`:""}
            </option>)}
          </select>
          {form.company_id && <button type="button" onClick={()=>setAddingContact(v=>!v)}
            style={{background:"none",border:"none",color:C.blue,fontSize:11,fontWeight:600,
                    cursor:"pointer",padding:"4px 0 0",fontFamily:"inherit"}}>
            {addingContact?"✕ Cancel":"+ Add a new contact"}
          </button>}
        </div>
        <Derived label="Email" value={form.email} hint={form.customer_id?"from contact record":""}/>
        <Derived label="Phone" value={[form.phone_dial,form.phone_national].filter(Boolean).join(" ")}/>
      </div>

      {addingContact && <div style={{marginTop:10,background:C.bg,border:`1px solid ${C.border}`,
                                      borderRadius:9,padding:"12px 14px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
          <div><label style={{fontSize:9,fontWeight:700,letterSpacing:1.2,color:C.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Name</label>
            <input value={newContact.contact} onChange={e=>setNewContact(n=>({...n,contact:e.target.value}))} placeholder="Full name" style={{...inp,width:"100%"}}/></div>
          <div><label style={{fontSize:9,fontWeight:700,letterSpacing:1.2,color:C.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Email *</label>
            <input value={newContact.email} onChange={e=>setNewContact(n=>({...n,email:e.target.value}))} placeholder="buyer@company.com" style={{...inp,width:"100%"}}/></div>
          <div><label style={{fontSize:9,fontWeight:700,letterSpacing:1.2,color:C.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>Role</label>
            <input value={newContact.role} onChange={e=>setNewContact(n=>({...n,role:e.target.value}))} placeholder="Procurement" style={{...inp,width:"100%"}}/></div>
          <Btn label="Add" onClick={saveNewContact} size="sm"/>
        </div>
        <div style={{fontSize:10,color:C.muted,marginTop:7}}>
          Added under <b>{company?.name}</b>. Several buyers from one company is normal — each gets their own row.
        </div>
      </div>}

      {form.company_id && company?.agent_id && !form.customer_id && (
        <div style={{marginTop:8,background:"#EEF2FF",border:"1px solid #C7D2FE",borderRadius:8,
                     padding:"8px 12px",fontSize:11.5,color:"#4338CA"}}>
          This company is reached through an agent, so it may have no individual contact.
          Leaving Contact blank is fine.
        </div>
      )}
    </div>

    <div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase",marginBottom:10}}>Enquiry</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <FF label="Reason *" k="enquiry_reason" value={form.enquiry_reason} onChange={set} options={ENQUIRY_REASONS}/>
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

    <div style={{fontSize:10,color:C.muted}}>
      The customer receives an automatic acknowledgement when the contact has an email address.
    </div>

    <div style={{display:"flex",gap:10,paddingTop:6}}>
      <Btn label={saving?"Saving…":done?"✓ Saved!":initial?"Update Enquiry":"Save Enquiry"} onClick={save} size="lg" disabled={saving}/>
      <Btn label="Cancel" onClick={onClose} variant="ghost"/>
    </div>
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
// CustomerForm now lives in CustomersTab.jsx as ContactForm — re-exported so
// any existing import of CustomerForm keeps working.
export { ContactForm as CustomerForm } from "./CustomersTab.jsx";
export { EnquiryForm, UserForm };
