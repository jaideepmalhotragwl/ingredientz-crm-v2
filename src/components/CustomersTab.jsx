import { useState, useMemo } from "react";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";
import { CustomerForm } from "./EnquiryForm.jsx";
// ── Alphabetical company sort, case- and accent-insensitive. ──
const byCompany = (a, b) =>
  (a.company || "").localeCompare(b.company || "", undefined, { sensitivity: "base", numeric: true });
// ── CUSTOMERS TAB ─────────────────────────────────────────────────────────────
function CustomersTab({customers,onAdd,onUpdate,onDelete}) {
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  // Sorted A–Z, then filtered — so the numbering stays stable as you search.
  const filtered=useMemo(()=>(customers||[])
    .slice()
    .sort(byCompany)
    .filter(c=>!search||[c.company,c.country,c.contact,c.email].join(" ").toLowerCase().includes(search.toLowerCase())),
    [customers,search]);
  const th={padding:"9px 14px",textAlign:"left",color:C.muted,borderBottom:`1px solid ${C.border}`,fontWeight:700,letterSpacing:1,fontSize:9,textTransform:"uppercase"};
  return <div>
    {modal&&<Modal title={modal.type==="edit"?"Edit Customer":"Add Customer"} onClose={()=>setModal(null)}>
      <CustomerForm onSave={async(form,id)=>{id?await onUpdate(id,form):await onAdd(form);setModal(null);}} onClose={()=>setModal(null)} initial={modal.type==="edit"?modal.data:null}/>
    </Modal>}
    <Card style={{overflow:"hidden"}}>
      <div style={{padding:"14px 18px",display:"flex",gap:10,alignItems:"center",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:18,fontWeight:700,color:C.ink}}>Customers <span style={{fontSize:12,color:C.blue,fontWeight:400}}>{customers.length} companies</span></div>
        <Btn label="+ Add Customer" onClick={()=>setModal({type:"add"})} size="sm"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{marginLeft:"auto",background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 12px",color:C.ink,fontSize:12,outline:"none",width:200}}/>
      </div>
      <div style={{overflowX:"auto",maxHeight:500,overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead style={{position:"sticky",top:0,background:C.bg,zIndex:2}}>
            <tr>
              <th style={{...th,width:44}}>#</th>
              {["Company","Country","Contact","Email","Phone",""].map(h=><th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c,i)=><tr key={c.id} style={{background:i%2===0?C.bg:"transparent"}}>
              <td style={{padding:"9px 14px",color:C.faded,fontFamily:"monospace",fontSize:11}}>{i+1}</td>
              <td style={{padding:"9px 14px",color:C.ink,fontWeight:600}}>{c.company}</td>
              <td style={{padding:"9px 14px",color:C.muted}}>{c.country||"—"}</td>
              <td style={{padding:"9px 14px",color:C.muted}}>{c.contact||"—"}</td>
              <td style={{padding:"9px 14px",color:C.muted}}>{c.email||"—"}</td>
              <td style={{padding:"9px 14px",color:C.muted}}>{c.phone||"—"}</td>
              <td style={{padding:"9px 14px",display:"flex",gap:6}}>
                <Btn label="Edit" onClick={()=>setModal({type:"edit",data:c})} size="sm" variant="ghost"/>
                <Btn label="✕" onClick={()=>onDelete(c.id)} size="sm" variant="danger"/>
              </td>
            </tr>)}
          </tbody>
        </table>
        {filtered.length===0&&<div style={{padding:30,textAlign:"center",color:C.muted,fontSize:12}}>No customers match your search</div>}
      </div>
      {search&&<div style={{padding:"8px 18px",fontSize:11,color:C.muted,textAlign:"right",borderTop:`1px solid ${C.border}`}}>
        Showing {filtered.length} of {customers.length} companies
      </div>}
    </Card>
  </div>;
}
export { CustomersTab };
