import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";

// ── PRODUCT SUPPLIER MAPPING (inside ProductsTab drawer) ──────────────────────
function ProductSupplierMapping({productId,productName}) {
  const [mappings,setMappings]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [adding,setAdding]=useState(false);
  const [selectedSup,setSelectedSup]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{loadData();},[productId]);

  async function loadData(){
    setLoading(true);
    const [{data:m},{data:s}]=await Promise.all([
      supabase.from("supplier_products").select("*,suppliers(id,company,contact_name,contact_email,country,status)").eq("product_id",productId),
      supabase.from("suppliers").select("*").eq("status","active").order("company")
    ]);
    setMappings(m||[]);setSuppliers(s||[]);setLoading(false);
  }

  const mappedIds=new Set(mappings.map(m=>m.supplier_id));
  const available=suppliers.filter(s=>!mappedIds.has(s.id));

  async function addMapping(){
    if(!selectedSup){alert("Select a supplier.");return;}
    setSaving(true);
    await supabase.from("supplier_products").insert({supplier_id:parseInt(selectedSup),product_id:productId,status:"active",submitted_by_supplier:false});
    setSaving(false);setAdding(false);setSelectedSup("");loadData();
  }

  async function removeMapping(id){
    if(!window.confirm("Remove this supplier mapping?"))return;
    await supabase.from("supplier_products").delete().eq("id",id);
    loadData();
  }

  if(loading)return <div style={{padding:16,color:C.muted,fontSize:12}}>Loading…</div>;

  return <div style={{marginTop:16,borderTop:`1px solid ${C.border}`,paddingTop:14}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase"}}>Mapped Suppliers ({mappings.length})</div>
      {!adding&&available.length>0&&<button onClick={()=>setAdding(true)} style={{background:C.blueLt,border:`1px solid #BFD6F6`,borderRadius:6,padding:"4px 12px",cursor:"pointer",color:C.blue,fontSize:11,fontWeight:700}}>+ Link Supplier</button>}
    </div>
    {adding&&<div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
      <select value={selectedSup} onChange={e=>setSelectedSup(e.target.value)} style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",color:selectedSup?C.ink:C.muted,fontSize:12,outline:"none"}}>
        <option value="">Select supplier…</option>
        {available.map(s=><option key={s.id} value={String(s.id)}>{s.company} ({s.country||"?"})</option>)}
      </select>
      <Btn label={saving?"Saving…":"Add"} onClick={addMapping} size="sm" disabled={saving}/>
      <Btn label="Cancel" onClick={()=>{setAdding(false);setSelectedSup("");}} size="sm" variant="ghost"/>
    </div>}
    {mappings.length===0&&!adding&&<div style={{fontSize:11,color:C.muted,padding:"8px 0"}}>No suppliers mapped yet.</div>}
    {mappings.map(m=>(
      <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.bg,borderRadius:8,padding:"8px 12px",border:`1px solid ${C.border}`,marginBottom:6}}>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:C.ink}}>{m.suppliers?.company||"—"}</div>
          <div style={{fontSize:11,color:C.muted}}>{m.suppliers?.contact_email||"—"}{m.suppliers?.country?` · ${m.suppliers.country}`:""}</div>
        </div>
        <button onClick={()=>removeMapping(m.id)} style={{background:"transparent",border:`1px solid ${C.red}44`,borderRadius:6,padding:"3px 8px",cursor:"pointer",color:C.red,fontSize:10}}>✕</button>
      </div>
    ))}
  </div>;
}


export { ProductSupplierMapping };
