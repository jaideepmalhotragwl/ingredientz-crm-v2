import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";

// ── SUPPLIERS TAB ────────────────────────────────────────────────────────────
function SuppliersTab() {
  const [suppliers,setSuppliers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [form,setForm]=useState({company:"",contact_name:"",contact_email:"",country:"",status:"active"});
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);

  useEffect(()=>{load();},[]);

  async function load(){
    setLoading(true);
    const {data}=await supabase.from("suppliers").select("*").order("created_at",{ascending:false});
    setSuppliers(data||[]);setLoading(false);
  }

  function setF(k,v){setForm(f=>({...f,[k]:v}));}

  function openAdd(){setForm({company:"",contact_name:"",contact_email:"",country:"",status:"active"});setModal("add");}
  function openEdit(s){setForm({company:s.company,contact_name:s.contact_name||"",contact_email:s.contact_email||"",country:s.country||"",status:s.status||"active"});setModal({type:"edit",id:s.id});}

  async function save(){
    if(!form.company.trim()){alert("Company name required.");return;}
    if(!form.contact_email.trim()){alert("Email required.");return;}
    setSaving(true);
    const slug=form.company.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    if(modal==="add"){await supabase.from("suppliers").insert({...form,slug});}
    else{await supabase.from("suppliers").update(form).eq("id",modal.id);}
    setSaving(false);setDone(true);
    setTimeout(()=>{setDone(false);setModal(null);load();},900);
  }

  async function del(id){
    if(!window.confirm("Delete this supplier?"))return;
    await supabase.from("suppliers").delete().eq("id",id);
    setSuppliers(p=>p.filter(s=>s.id!==id));
  }

  const STATUS_COLORS={active:C.green,inactive:C.muted,pending:C.amber};
  const inp={background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 11px",color:C.ink,fontFamily:"Arial,sans-serif",fontSize:13,outline:"none",width:"100%"};
  const filtered=suppliers.filter(s=>!search||[s.company,s.country,s.contact_name,s.contact_email].join(" ").toLowerCase().includes(search.toLowerCase()));

  return <div>
    {modal&&<Modal title={modal==="add"?"Add Supplier":"Edit Supplier"} onClose={()=>setModal(null)} width={540}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 2"}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Company Name *</label>
            <input value={form.company} onChange={e=>setF("company",e.target.value)} placeholder="e.g. Sabinsa Corporation" style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Contact Name</label>
            <input value={form.contact_name} onChange={e=>setF("contact_name",e.target.value)} placeholder="e.g. Rajesh Kumar" style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Email *</label>
            <input type="email" value={form.contact_email} onChange={e=>setF("contact_email",e.target.value)} placeholder="supplier@company.com" style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Country</label>
            <input value={form.country} onChange={e=>setF("country",e.target.value)} placeholder="e.g. India" style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Status</label>
            <select value={form.status} onChange={e=>setF("status",e.target.value)} style={inp}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
        <div style={{display:"flex",gap:10,paddingTop:6}}>
          <Btn label={saving?"Saving…":done?"✓ Saved!":modal==="add"?"Add Supplier":"Update Supplier"} onClick={save} disabled={saving}/>
          <Btn label="Cancel" onClick={()=>setModal(null)} variant="ghost"/>
        </div>
      </div>
    </Modal>}
    <Card style={{overflow:"hidden"}}>
      <div style={{padding:"14px 18px",display:"flex",gap:10,alignItems:"center",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap"}}>
        <div style={{fontSize:18,fontWeight:700,color:C.ink}}>Suppliers <span style={{fontSize:12,color:C.blue,fontWeight:400}}>{filtered.length} suppliers</span></div>
        <Btn label="+ Add Supplier" onClick={openAdd} size="sm"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{marginLeft:"auto",background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 12px",color:C.ink,fontSize:12,outline:"none",width:200}}/>
      </div>
      {loading?<div style={{padding:30,textAlign:"center",color:C.muted}}>Loading…</div>:
      <div style={{overflowX:"auto",maxHeight:520,overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead style={{position:"sticky",top:0,background:C.bg,zIndex:2}}>
            <tr>{["Company","Country","Contact","Email","Status","Products",""].map(h=><th key={h} style={{padding:"9px 14px",textAlign:"left",color:C.muted,borderBottom:`1px solid ${C.border}`,fontWeight:700,letterSpacing:1,fontSize:9,textTransform:"uppercase"}}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((s,i)=><tr key={s.id} style={{background:i%2===0?C.bg:"transparent"}}>
              <td style={{padding:"10px 14px",color:C.ink,fontWeight:600}}>{s.company}</td>
              <td style={{padding:"10px 14px",color:C.muted}}>{s.country||"—"}</td>
              <td style={{padding:"10px 14px",color:C.muted}}>{s.contact_name||"—"}</td>
              <td style={{padding:"10px 14px",color:C.muted}}>{s.contact_email||"—"}</td>
              <td style={{padding:"10px 14px"}}>
                <span style={{background:`${STATUS_COLORS[s.status]||C.muted}22`,color:STATUS_COLORS[s.status]||C.muted,border:`1px solid ${STATUS_COLORS[s.status]||C.muted}44`,borderRadius:20,padding:"2px 10px",fontSize:10,fontWeight:700,textTransform:"capitalize"}}>{s.status}</span>
              </td>
              <td style={{padding:"10px 14px",color:C.muted,fontSize:11}}>—</td>
              <td style={{padding:"10px 14px",display:"flex",gap:6}}>
                <Btn label="Edit" onClick={()=>openEdit(s)} size="sm" variant="ghost"/>
                <Btn label="✕" onClick={()=>del(s.id)} size="sm" variant="danger"/>
              </td>
            </tr>)}
          </tbody>
        </table>
        {filtered.length===0&&<div style={{padding:36,textAlign:"center",color:C.muted,fontSize:12}}>No suppliers yet — click + Add Supplier to get started</div>}
      </div>}
    </Card>
  </div>;
}


export { SuppliersTab };
