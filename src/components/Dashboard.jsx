import { C, STAGES, STAGE_COLORS, PRIO_COLORS } from "../constants.js";
import { daysUntil, fmtDate } from "../utils.js";
import { Card } from "./ui/Card.jsx";
import { KPI } from "./ui/KPI.jsx";
import { StageBadge } from "./ui/Badges.jsx";
import { TaskBoard } from "./TaskBoard.jsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({enquiries,users,tasks,onTaskAdd,onTaskUpdate,onTaskDelete}) {
  const active=enquiries.filter(e=>!["PO Received","Lost","No Response","Out of Scope"].includes(e.stage));
  const totalVal=enquiries.filter(e=>e.stage!=="Lost").reduce((s,e)=>s+(+e.expected_value||0),0);
  const poReceived=enquiries.filter(e=>e.stage==="PO Received").length;
  const overdueEnq=enquiries.filter(e=>{const d=daysUntil(e.reminder_date);return d!==null&&d<=0&&!["PO Received","Lost"].includes(e.stage);});
  const closingSoon=enquiries.filter(e=>{const d=daysUntil(e.expected_closure);return d!==null&&d<=7&&d>=0&&!["PO Received","Lost"].includes(e.stage);});
  const stageCounts=STAGES.map((s,i)=>({stage:s.split(" ")[0],count:enquiries.filter(e=>e.stage===s).length,color:STAGE_COLORS[i]})).filter(s=>s.count>0);
  const assigneeCounts=users.filter(u=>u.active).map(u=>({name:u.name.split(" ")[0],count:enquiries.filter(e=>e.assigned_to===u.name).length})).filter(u=>u.count>0);
  const CT=({active:a,payload})=>a&&payload?.length?<div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 12px",fontSize:11,color:C.ink,boxShadow:"0 2px 8px rgba(0,0,0,0.1)"}}>{payload[0].name||payload[0].dataKey}: <b style={{color:C.blue}}>{payload[0].value}</b></div>:null;

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
      <KPI label="Total Enquiries" value={enquiries.length} sub={`${active.length} active`}/>
      <KPI label="Pipeline Value" value={`$${Math.round(totalVal/1000)}K`} sub="Excl. lost" accent={C.blue}/>
      <KPI label="PO Received" value={poReceived} sub="Orders confirmed" accent={C.green}/>
      <KPI label="Overdue Follow-ups" value={overdueEnq.length} sub={`${closingSoon.length} closing this week`} accent={overdueEnq.length>0?C.red:C.green}/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
      <Card style={{padding:16}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase",marginBottom:14}}>Pipeline by Stage</div>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={stageCounts} margin={{top:4,right:8,bottom:4,left:-22}}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
            <XAxis dataKey="stage" tick={{fill:C.muted,fontSize:9}}/>
            <YAxis tick={{fill:C.muted,fontSize:9}}/>
            <Tooltip content={<CT/>}/>
            <Bar dataKey="count" radius={[4,4,0,0]}>{stageCounts.map((s,i)=><Cell key={i} fill={s.color}/>)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card style={{padding:16}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase",marginBottom:12}}>By Assignee</div>
        <ResponsiveContainer width="100%" height={150}>
          <PieChart><Pie data={assigneeCounts} cx="50%" cy="50%" outerRadius={58} dataKey="count" nameKey="name" paddingAngle={3}>{assigneeCounts.map((_,i)=><Cell key={i} fill={[C.blue,C.green,"#E2C47A",C.amber,"#9B59B6",C.muted][i%6]}/>)}</Pie><Tooltip content={<CT/>}/></PieChart>
        </ResponsiveContainer>
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {assigneeCounts.map((a,i)=><div key={a.name} style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
            <span style={{color:[C.blue,C.green,"#E2C47A",C.amber,"#9B59B6",C.muted][i%6]}}>● {a.name}</span>
            <span style={{color:C.ink,fontWeight:700}}>{a.count}</span>
          </div>)}
        </div>
      </Card>
    </div>
    {overdueEnq.length>0&&<Card style={{padding:16,border:`1px solid #FFDAD9`,background:"#FFF8F8"}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.red,textTransform:"uppercase",marginBottom:12}}>🔔 Overdue Follow-ups ({overdueEnq.length})</div>
      {overdueEnq.map(e=><div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.white,borderRadius:9,padding:"9px 14px",border:`1px solid #FFDAD9`,marginBottom:7}}>
        <div><div style={{fontSize:12,color:C.ink,fontWeight:600}}>{e.customer_name}</div><div style={{fontSize:11,color:C.muted}}>{(e.products||[])[0]?.name||"—"} · {e.assigned_to}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:11,color:C.red,fontWeight:700}}>Overdue {Math.abs(daysUntil(e.reminder_date))}d</div><StageBadge stage={e.stage}/></div>
      </div>)}
    </Card>}
    {closingSoon.length>0&&<Card style={{padding:16,border:`1px solid #FFE0A3`,background:"#FFFBF0"}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.amber,textTransform:"uppercase",marginBottom:12}}>⚡ Closing This Week ({closingSoon.length})</div>
      {closingSoon.map(e=><div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.white,borderRadius:9,padding:"9px 14px",border:`1px solid #FFE0A3`,marginBottom:7}}>
        <div><div style={{fontSize:12,color:C.ink,fontWeight:600}}>{e.customer_name}</div><div style={{fontSize:11,color:C.muted}}>{(e.products||[])[0]?.name||"—"} · {e.assigned_to}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:11,color:C.amber,fontWeight:700}}>{daysUntil(e.expected_closure)}d left</div><div style={{fontSize:12,color:C.blue,fontWeight:700}}>{e.currency} {Number(e.expected_value||0).toLocaleString()}</div></div>
      </div>)}
    </Card>}
    <TaskBoard tasks={tasks} users={users} onAdd={onTaskAdd} onUpdate={onTaskUpdate} onDelete={onTaskDelete}/>
  </div>;
}


export { Dashboard };
