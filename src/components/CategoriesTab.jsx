import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";

// ── CATEGORIES TAB ───────────────────────────────────────────────────────────
function CategoriesTab() {
  const [cats,setCats]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({name:"",slug:"",description:"",sort_order:0,active:true});
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);

  useEffect(()=>{loadCats();},[]);

  async function loadCats(){
    setLoading(true);
    const {data}=await supabase.from("product_categories").select("*").order("sort_order");
    setCats(data||[]);setLoading(false);
  }

  function setF(k,v){setForm(f=>({...f,[k]:v}));}

  function genSlug(name){return name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}

  function openAdd(){setForm({name:"",slug:"",description:"",sort_order:(cats.length+1)*10,active:true});setModal("add");}
  function openEdit(c){setForm({name:c.name,slug:c.slug,description:c.description||"",sort_order:c.sort_order||0,active:c.active});setModal({type:"edit",id:c.id});}

  async function save(){
    if(!form.name.trim()){alert("Name required.");return;}
    const slug=form.slug||genSlug(form.name);
    setSaving(true);
    if(modal==="add"){
      await supabase.from("product_categories").insert({...form,slug});
    } else {
      await supabase.from("product_categories").update({...form,slug}).eq("id",modal.id);
    }
    setSaving(false);setDone(true);
    setTimeout(()=>{setDone(false);setModal(null);loadCats();},900);
  }

  async function toggle(c){
    await supabase.from("product_categories").update({active:!c.active}).eq("id",c.id);
    loadCats();
  }

  async function del(id){
    if(!window.confirm("Delete this category?"))return;
    await supabase.from("product_categories").delete().eq("id",id);
    loadCats();
  }

  const inp={background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 11px",color:C.ink,fontFamily:"Arial,sans-serif",fontSize:13,outline:"none",width:"100%"};

  return <div>
    {modal&&<Modal title={modal==="add"?"Add Category":"Edit Category"} onClose={()=>setModal(null)} width={520}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Category Name *</label>
          <input value={form.name} onChange={e=>{setF("name",e.target.value);if(!form.slug||modal==="add")setF("slug",genSlug(e.target.value));}} placeholder="e.g. Botanical Extracts" style={inp}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Slug (URL)</label>
          <input value={form.slug} onChange={e=>setF("slug",e.target.value)} placeholder="botanical-extracts" style={inp}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Description</label>
          <textarea value={form.description} onChange={e=>setF("description",e.target.value)} rows={3} placeholder="Category description for SEO…" style={{...inp,resize:"vertical"}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Sort Order</label>
            <input type="number" value={form.sort_order} onChange={e=>setF("sort_order",parseInt(e.target.value))} style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Status</label>
            <select value={form.active?"active":"inactive"} onChange={e=>setF("active",e.target.value==="active")} style={inp}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div style={{display:"flex",gap:10,paddingTop:6}}>
          <Btn label={saving?"Saving…":done?"✓ Saved!":"Save Category"} onClick={save} disabled={saving}/>
          <Btn label="Cancel" onClick={()=>setModal(null)} variant="ghost"/>
        </div>
      </div>
    </Modal>}
    <Card style={{overflow:"hidden"}}>
      <div style={{padding:"14px 18px",display:"flex",gap:10,alignItems:"center",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:18,fontWeight:700,color:C.ink}}>Product Categories <span style={{fontSize:12,color:C.blue,fontWeight:400}}>{cats.length} categories</span></div>
        <Btn label="+ Add Category" onClick={openAdd} size="sm"/>
      </div>
      {loading?<div style={{padding:30,textAlign:"center",color:C.muted}}>Loading…</div>:
      <div>
        <div style={{display:"grid",gridTemplateColumns:"40px 1fr 200px 80px 80px 100px",gap:0}}>
          {["#","Category Name","Slug","Products","Status",""].map((h,i)=><div key={i} style={{padding:"9px 14px",fontSize:9,fontWeight:700,letterSpacing:1,color:C.muted,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,background:C.bg}}>{h}</div>)}
        </div>
        {cats.map((c,i)=><div key={c.id} style={{display:"grid",gridTemplateColumns:"40px 1fr 200px 80px 80px 100px",background:i%2===0?C.bg:"transparent",borderBottom:`1px solid ${C.border}`}}>
          <div style={{padding:"11px 14px",color:C.muted,fontSize:11}}>{c.sort_order}</div>
          <div style={{padding:"11px 14px"}}>
            <div style={{fontSize:13,fontWeight:600,color:C.ink}}>{c.name}</div>
            {c.description&&<div style={{fontSize:11,color:C.muted,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:280}}>{c.description}</div>}
          </div>
          <div style={{padding:"11px 14px",fontSize:11,color:C.muted,fontFamily:"monospace"}}>{c.slug}</div>
          <div style={{padding:"11px 14px",fontSize:11,color:C.muted}}>—</div>
          <div style={{padding:"11px 14px"}}>
            <span style={{background:c.active?"#E6F4EA":C.bg,color:c.active?C.green:C.muted,border:`1px solid ${c.active?"#C3E6CB":C.border}`,borderRadius:20,padding:"2px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}} onClick={()=>toggle(c)}>{c.active?"Active":"Inactive"}</span>
          </div>
          <div style={{padding:"9px 14px",display:"flex",gap:6,alignItems:"center"}}>
            <Btn label="Edit" onClick={()=>openEdit(c)} size="sm" variant="ghost"/>
            <Btn label="✕" onClick={()=>del(c.id)} size="sm" variant="danger"/>
          </div>
        </div>)}
        {cats.length===0&&<div style={{padding:30,textAlign:"center",color:C.muted,fontSize:12}}>No categories yet</div>}
      </div>}
    </Card>
  </div>;
}


export { CategoriesTab };
