import { useState, useEffect } from "react";
import { supabase } from "../config.js";
import { C, UNITS } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";
import { ProductSupplierMapping } from "./ProductSupplierMapping.jsx";

// ── PRODUCTS TAB ──────────────────────────────────────────────────────────────
function ProductsTab() {
  const [products,setProducts]=useState([]);
  const [cats,setCats]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [filterCat,setFilterCat]=useState("");
  const [filterStatus,setFilterStatus]=useState("");
  const [form,setForm]=useState({name:"",slug:"",category_id:"",short_description:"",description:"",cas_number:"",hsn_code:"",unit:"kg",min_order_qty:"",specifications:"{}",tags:"",status:"active"});
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);

  useEffect(()=>{loadAll();},[]);

  async function loadAll(){
    setLoading(true);
    const [{data:p},{data:c}]=await Promise.all([
      supabase.from("products").select("*,product_categories(name)").order("created_at",{ascending:false}),
      supabase.from("product_categories").select("*").eq("active",true).order("sort_order")
    ]);
    setProducts(p||[]);setCats(c||[]);setLoading(false);
  }

  function setF(k,v){setForm(f=>({...f,[k]:v}));}
  function genSlug(name){return name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}

  function openAdd(){
    setForm({name:"",slug:"",category_id:"",short_description:"",description:"",cas_number:"",hsn_code:"",unit:"kg",min_order_qty:"",specifications:"{}",tags:"",status:"active"});
    setModal("add");
  }

  function openEdit(p){
    setForm({
      name:p.name,slug:p.slug,category_id:String(p.category_id||""),
      short_description:p.short_description||"",description:p.description||"",
      cas_number:p.cas_number||"",hsn_code:p.hsn_code||"",
      unit:p.unit||"kg",min_order_qty:p.min_order_qty||"",
      specifications:JSON.stringify(p.specifications||{}),
      tags:(p.tags||[]).join(", "),status:p.status||"active"
    });
    setModal({type:"edit",id:p.id});
  }

  async function save(){
    if(!form.name.trim()){alert("Product name required.");return;}
    if(!form.category_id){alert("Category required.");return;}
    setSaving(true);
    let specs={};
    try{specs=JSON.parse(form.specifications||"{}");}catch(e){specs={};}
    const tags=form.tags?form.tags.split(",").map(t=>t.trim()).filter(Boolean):[];
    const slug=form.slug||genSlug(form.name);
    const row={
      name:form.name,slug,category_id:parseInt(form.category_id),
      short_description:form.short_description,description:form.description,
      cas_number:form.cas_number,hsn_code:form.hsn_code,
      unit:form.unit,min_order_qty:form.min_order_qty?parseFloat(form.min_order_qty):null,
      specifications:specs,tags,status:form.status,created_by:"Jaideep"
    };
    if(modal==="add"){
      await supabase.from("products").insert(row);
    } else {
      await supabase.from("products").update(row).eq("id",modal.id);
    }
    setSaving(false);setDone(true);
    setTimeout(()=>{setDone(false);setModal(null);loadAll();},900);
  }

  async function del(id){
    if(!window.confirm("Delete this product?"))return;
    await supabase.from("products").delete().eq("id",id);
    loadAll();
  }

  async function toggleStatus(p){
    const next=p.status==="active"?"inactive":"active";
    await supabase.from("products").update({status:next}).eq("id",p.id);
    loadAll();
  }

  const filtered=products
    .filter(p=>(!filterCat||String(p.category_id)===filterCat)&&(!filterStatus||p.status===filterStatus))
    .filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase())||(p.cas_number||"").toLowerCase().includes(search.toLowerCase()));

  const STATUS_COLORS={active:C.green,inactive:C.muted,pending:C.amber};
  const inp={background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 11px",color:C.ink,fontFamily:"Arial,sans-serif",fontSize:13,outline:"none",width:"100%"};

  return <div>
    {modal&&<Modal title={modal==="add"?"Add Product":"Edit Product"} onClose={()=>setModal(null)} width={780}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 2"}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Product Name *</label>
            <input value={form.name} onChange={e=>{setF("name",e.target.value);if(!form.slug||modal==="add")setF("slug",genSlug(e.target.value));}} placeholder="e.g. Ashwagandha Extract KSM-66" style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Category *</label>
            <select value={form.category_id} onChange={e=>setF("category_id",e.target.value)} style={{...inp,color:form.category_id?C.ink:C.muted}}>
              <option value="">Select category…</option>
              {cats.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>URL Slug</label>
            <input value={form.slug} onChange={e=>setF("slug",e.target.value)} placeholder="auto-generated" style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 2"}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Short Description</label>
            <input value={form.short_description} onChange={e=>setF("short_description",e.target.value)} placeholder="One line summary for catalogue listing…" style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 2"}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Full Description</label>
            <textarea value={form.description} onChange={e=>setF("description",e.target.value)} rows={3} placeholder="Detailed product description for SEO and customer portal…" style={{...inp,resize:"vertical"}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>CAS Number</label>
            <input value={form.cas_number} onChange={e=>setF("cas_number",e.target.value)} placeholder="e.g. 84687-43-4" style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>HSN Code</label>
            <input value={form.hsn_code} onChange={e=>setF("hsn_code",e.target.value)} placeholder="e.g. 13021990" style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Unit</label>
            <select value={form.unit} onChange={e=>setF("unit",e.target.value)} style={inp}>
              {["kg","MT","Litres","Pieces","Boxes","Bags","Other"].map(u=><option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Min Order Qty</label>
            <input type="number" value={form.min_order_qty} onChange={e=>setF("min_order_qty",e.target.value)} placeholder="e.g. 25" style={inp}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 2"}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Specifications (JSON) <span style={{color:C.muted,fontWeight:400,fontSize:9}}>e.g. {"{"}"standardization":"5% Withanolides"{"}"}</span></label>
            <textarea value={form.specifications} onChange={e=>setF("specifications",e.target.value)} rows={3} placeholder='{"standardization":"5% Withanolides","form":"Powder"}' style={{...inp,fontFamily:"monospace",fontSize:12,resize:"vertical"}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"span 2"}}>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.muted,textTransform:"uppercase"}}>Tags <span style={{color:C.muted,fontWeight:400,fontSize:9}}>comma separated</span></label>
            <input value={form.tags} onChange={e=>setF("tags",e.target.value)} placeholder="e.g. adaptogen, ayurvedic, stress-relief" style={inp}/>
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
          <Btn label={saving?"Saving…":done?"✓ Saved!":modal==="add"?"Add Product":"Update Product"} onClick={save} disabled={saving}/>
          <Btn label="Cancel" onClick={()=>setModal(null)} variant="ghost"/>
        </div>
        {modal!=="add"&&typeof modal==="object"&&<ProductSupplierMapping productId={modal.id} productName={form.name}/>}
      </div>
    </Modal>}
    <Card style={{overflow:"hidden"}}>
      <div style={{padding:"14px 18px",display:"flex",gap:10,alignItems:"center",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap"}}>
        <div style={{fontSize:18,fontWeight:700,color:C.ink}}>Product Master <span style={{fontSize:12,color:C.blue,fontWeight:400}}>{filtered.length} products</span></div>
        <Btn label="+ Add Product" onClick={openAdd} size="sm"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, CAS…" style={{marginLeft:"auto",background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 12px",color:C.ink,fontSize:12,outline:"none",width:180}}/>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",color:C.ink,fontSize:11}}>
          <option value="">All Categories</option>
          {cats.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",color:C.ink,fontSize:11}}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
        </select>
      </div>
      {loading?<div style={{padding:30,textAlign:"center",color:C.muted}}>Loading…</div>:
      <div style={{overflowX:"auto",maxHeight:520,overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead style={{position:"sticky",top:0,background:C.bg,zIndex:2}}>
            <tr>{["Product Name","Category","CAS Number","Unit","MOQ","Status",""].map(h=><th key={h} style={{padding:"9px 14px",textAlign:"left",color:C.muted,borderBottom:`1px solid ${C.border}`,fontWeight:700,letterSpacing:1,fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((p,i)=><tr key={p.id} style={{background:i%2===0?C.bg:"transparent"}}>
              <td style={{padding:"10px 14px"}}>
                <div style={{fontSize:12,fontWeight:600,color:C.ink}}>{p.name}</div>
                {p.short_description&&<div style={{fontSize:11,color:C.muted,marginTop:1,maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.short_description}</div>}
              </td>
              <td style={{padding:"10px 14px",color:C.muted,fontSize:11}}>{p.product_categories?.name||"—"}</td>
              <td style={{padding:"10px 14px",color:C.muted,fontSize:11,fontFamily:"monospace"}}>{p.cas_number||"—"}</td>
              <td style={{padding:"10px 14px",color:C.muted,fontSize:11}}>{p.unit||"kg"}</td>
              <td style={{padding:"10px 14px",color:C.muted,fontSize:11}}>{p.min_order_qty?`${p.min_order_qty} ${p.unit}`:"—"}</td>
              <td style={{padding:"10px 14px"}}>
                <span onClick={()=>toggleStatus(p)} style={{background:`${STATUS_COLORS[p.status]||C.muted}22`,color:STATUS_COLORS[p.status]||C.muted,border:`1px solid ${STATUS_COLORS[p.status]||C.muted}44`,borderRadius:20,padding:"2px 10px",fontSize:10,fontWeight:700,cursor:"pointer",textTransform:"capitalize"}}>{p.status}</span>
              </td>
              <td style={{padding:"10px 14px",display:"flex",gap:6}}>
                <Btn label="Edit" onClick={()=>openEdit(p)} size="sm" variant="ghost"/>
                <Btn label="✕" onClick={()=>del(p.id)} size="sm" variant="danger"/>
              </td>
            </tr>)}
          </tbody>
        </table>
        {filtered.length===0&&<div style={{padding:36,textAlign:"center",color:C.muted,fontSize:12}}>No products yet — click + Add Product to start building your catalogue</div>}
      </div>}
    </Card>
  </div>;
}


export { ProductsTab };
