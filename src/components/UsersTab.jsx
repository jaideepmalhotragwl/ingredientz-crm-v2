import { useState } from "react";
import { C } from "../constants.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { Modal } from "./ui/Modal.jsx";
import { UserForm } from "./EnquiryForm.jsx";

// ── USERS TAB ─────────────────────────────────────────────────────────────────
function UsersTab({users,onAdd,onUpdate,onDelete}) {
  const [modal,setModal]=useState(null);
  return <div>
    {modal&&<Modal title={modal.type==="edit"?"Edit User":"Add Team Member"} onClose={()=>setModal(null)}>
      <UserForm onSave={async(form,id)=>{id?await onUpdate(id,form):await onAdd(form);setModal(null);}} onClose={()=>setModal(null)} initial={modal.type==="edit"?modal.data:null}/>
    </Modal>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:18,fontWeight:700,color:C.ink}}>Team Members <span style={{fontSize:12,color:C.blue,fontWeight:400}}>{users.length} users</span></div>
      <Btn label="+ Add User" onClick={()=>setModal({type:"add"})} size="sm"/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
      {users.map(u=><Card key={u.id} style={{padding:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{width:42,height:42,borderRadius:"50%",background:C.blue,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"white"}}>{u.name.charAt(0)}</div>
          <span style={{background:u.active?"#E6F4EA":C.bg,color:u.active?C.green:C.muted,border:`1px solid ${u.active?"#C3E6CB":C.border}`,borderRadius:20,padding:"2px 10px",fontSize:10,fontWeight:700}}>{u.active?"Active":"Inactive"}</span>
        </div>
        <div style={{fontSize:14,fontWeight:700,color:C.ink,marginBottom:3}}>{u.name}</div>
        <div style={{fontSize:11,color:C.muted,marginBottom:2}}>{u.email}</div>
        <div style={{fontSize:10,color:C.blue,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{u.role}</div>
        <div style={{fontSize:10,color:C.muted,marginBottom:13}}>Sends from: {u.sender_email}</div>
        <div style={{display:"flex",gap:7}}>
          <Btn label="Edit" onClick={()=>setModal({type:"edit",data:u})} size="sm" variant="ghost"/>
          <Btn label="Remove" onClick={()=>onDelete(u.id)} size="sm" variant="danger"/>
        </div>
      </Card>)}
    </div>
  </div>;
}


export { UsersTab };
