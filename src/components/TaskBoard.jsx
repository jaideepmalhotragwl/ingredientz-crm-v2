import { useState } from "react";
import { C, TASK_STATUSES, TASK_STATUS_COLORS, PRIO_COLORS } from "../constants.js";
import { daysUntil, fmtDate } from "../utils.js";
import { Btn } from "./ui/Btn.jsx";
import { Card } from "./ui/Card.jsx";
import { TF } from "./ui/FormFields.jsx";

// ── TASK BOARD ────────────────────────────────────────────────────────────────
function TaskBoard({tasks,users,onAdd,onUpdate,onDelete}) {
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({task:"",owner:"",priority:"Medium",status:"Not Started",due_date:"",notes:""});
  const [done,setDone]=useState(false);
  const [filterOwner,setFilterOwner]=useState("");
  const [filterStatus,setFilterStatus]=useState("");

  function setF(k,v){setForm(f=>({...f,[k]:v}));}
  function openAdd(){setEditing(null);setForm({task:"",owner:"",priority:"Medium",status:"Not Started",due_date:"",notes:""});setShowForm(true);}
  function openEdit(t){setEditing(t);setForm({task:t.task,owner:t.owner,priority:t.priority,status:t.status,due_date:t.due_date||"",notes:t.notes||""});setShowForm(true);}
  function cancelForm(){setShowForm(false);setEditing(null);}
  async function save(){
    if(!form.task.trim()){alert("Task required.");return;}
    if(!form.owner){alert("Owner required.");return;}
    editing?await onUpdate(editing.id,form):await onAdd(form);
    setDone(true);setTimeout(()=>{setDone(false);cancelForm();},900);
  }
  function cycleStatus(t){onUpdate(t.id,{status:TASK_STATUSES[(TASK_STATUSES.indexOf(t.status)+1)%TASK_STATUSES.length]});}

  const userOpts=users.filter(u=>u.active).map(u=>({v:u.name,l:u.name}));
  const filtered=tasks.filter(t=>(!filterOwner||t.owner===filterOwner)&&(!filterStatus||t.status===filterStatus))
    .sort((a,b)=>{if(a.status==="Done"&&b.status!=="Done")return 1;if(b.status==="Done"&&a.status!=="Done")return -1;return ({"High":0,"Medium":1,"Low":2}[a.priority]||1)-({"High":0,"Medium":1,"Low":2}[b.priority]||1);});
  const overdue=tasks.filter(t=>t.status!=="Done"&&t.due_date&&daysUntil(t.due_date)<0);
  const dueToday=tasks.filter(t=>t.status!=="Done"&&t.due_date&&daysUntil(t.due_date)===0);

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    {showForm&&<Card style={{padding:20,border:`1px solid ${C.blue}44`}}>
      <div style={{fontSize:18,fontWeight:700,color:C.ink,marginBottom:16}}>{editing?"Edit Task":"New Task"}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:14}}>
        <div style={{gridColumn:"span 4"}}><TF label="Task Description *" k="task" value={form.task} onChange={setF} placeholder="e.g. Send quotation to BASF Nutrition"/></div>
        <TF label="Owner *" k="owner" value={form.owner} onChange={setF} options={userOpts}/>
        <TF label="Priority" k="priority" value={form.priority} onChange={setF} options={["High","Medium","Low"]}/>
        <TF label="Due Date" k="due_date" value={form.due_date} onChange={setF} type="date"/>
        <TF label="Status" k="status" value={form.status} onChange={setF} options={TASK_STATUSES}/>
        <div style={{gridColumn:"span 4"}}><TF label="Notes" k="notes" value={form.notes} onChange={setF} placeholder="Optional notes…"/></div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn label={done?"✓ Saved!":editing?"Update Task":"Add Task"} onClick={save} disabled={done}/>
        <Btn label="Cancel" onClick={cancelForm} variant="ghost"/>
      </div>
    </Card>}
    <Card style={{overflow:"hidden"}}>
      <div style={{padding:"13px 18px",display:"flex",gap:10,alignItems:"center",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap"}}>
        <div style={{fontSize:18,fontWeight:700,color:C.ink}}>Tasks <span style={{fontSize:12,color:C.blue,fontWeight:400}}>{tasks.filter(t=>t.status!=="Done").length} open</span></div>
        {!showForm&&<Btn label="+ New Task" onClick={openAdd} size="sm"/>}
        <select value={filterOwner} onChange={e=>setFilterOwner(e.target.value)} style={{marginLeft:"auto",background:C.white,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",color:C.ink,fontSize:11}}>
          <option value="">All Team</option>
          {users.filter(u=>u.active).map(u=><option key={u.id} value={u.name}>{u.name.split(" ")[0]}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 10px",color:C.ink,fontSize:11}}>
          <option value="">All Status</option>
          {TASK_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {(overdue.length>0||dueToday.length>0)&&<div style={{padding:"8px 18px",background:"#FFF0F0",borderBottom:`1px solid #FFDAD9`,display:"flex",gap:14}}>
        {overdue.length>0&&<span style={{fontSize:11,color:C.red,fontWeight:700}}>⚠ {overdue.length} task{overdue.length>1?"s":""} overdue</span>}
        {dueToday.length>0&&<span style={{fontSize:11,color:C.amber,fontWeight:700}}>⚡ {dueToday.length} due today</span>}
      </div>}
      {filtered.length===0
        ?<div style={{padding:30,textAlign:"center",color:C.muted,fontSize:12}}>No tasks — click + New Task to add one</div>
        :filtered.map((t,i)=>{
          const d=daysUntil(t.due_date);
          const isOver=t.status!=="Done"&&t.due_date&&d<0;
          const isToday=t.status!=="Done"&&t.due_date&&d===0;
          const isDone=t.status==="Done";
          const sc=TASK_STATUS_COLORS[t.status]||C.muted;
          const pc=PRIO_COLORS[t.priority]||C.muted;
          return <div key={t.id} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 18px",background:i%2===0?C.bg:"transparent",borderBottom:`1px solid ${C.border}`}}>
            <div onClick={()=>cycleStatus(t)} style={{width:13,height:13,borderRadius:"50%",background:sc,flexShrink:0,cursor:"pointer"}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,color:isDone?C.faded:C.ink,fontWeight:isDone?400:600,textDecoration:isDone?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.task}</div>
              {t.notes&&<div style={{fontSize:11,color:C.muted,marginTop:1}}>{t.notes}</div>}
            </div>
            <span style={{fontSize:11,color:C.muted,minWidth:50,textAlign:"right"}}>{(t.owner||"").split(" ")[0]}</span>
            <span style={{background:`${pc}22`,color:pc,border:`1px solid ${pc}44`,borderRadius:20,padding:"2px 9px",fontSize:10,fontWeight:700}}>{t.priority}</span>
            <span style={{background:`${sc}22`,color:sc,border:`1px solid ${sc}44`,borderRadius:20,padding:"2px 9px",fontSize:10,fontWeight:700,minWidth:88,textAlign:"center"}}>{t.status}</span>
            <span style={{fontSize:11,color:isOver?C.red:isToday?C.amber:C.muted,fontWeight:isOver||isToday?700:400,minWidth:86,textAlign:"right"}}>
              {t.due_date?(isOver?`⚠ ${Math.abs(d)}d ago`:isToday?"⚡ Today":fmtDate(t.due_date)):"—"}
            </span>
            <button onClick={()=>openEdit(t)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 9px",cursor:"pointer",color:C.blue,fontSize:10}}>Edit</button>
            <button onClick={()=>onDelete(t.id)} style={{background:"transparent",border:`1px solid ${C.red}44`,borderRadius:6,padding:"3px 7px",cursor:"pointer",color:C.red,fontSize:10}}>✕</button>
          </div>;
        })
      }
    </Card>
  </div>;
}


export { TaskBoard };
