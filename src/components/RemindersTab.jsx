import { C } from "../constants.js";
import { daysUntil, fmtDate } from "../utils.js";
import { Card } from "./ui/Card.jsx";
import { StageBadge } from "./ui/Badges.jsx";

// ── REMINDERS TAB ─────────────────────────────────────────────────────────────
function RemindersTab({enquiries,onSelect}) {
  const active=enquiries.filter(e=>!["PO Received","Lost","No Response","Out of Scope"].includes(e.stage)&&e.reminder_date);
  const sorted=[...active].sort((a,b)=>new Date(a.reminder_date)-new Date(b.reminder_date));
  const overdue=sorted.filter(e=>daysUntil(e.reminder_date)<=0);
  const upcoming=sorted.filter(e=>daysUntil(e.reminder_date)>0);
  function Row({e,over}){
    const d=daysUntil(e.reminder_date);
    return <div onClick={()=>onSelect(e)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:over?"#FFF8F8":C.bg,borderRadius:10,padding:"12px 16px",border:`1px solid ${over?"#FFDAD9":C.border}`,cursor:"pointer",marginBottom:7}}
      onMouseEnter={ev=>ev.currentTarget.style.background=C.blueLt}
      onMouseLeave={ev=>ev.currentTarget.style.background=over?"#FFF8F8":C.bg}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:38,height:38,borderRadius:"50%",background:over?"#FFDAD9":C.blueLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{over?"⚠":"🔔"}</div>
        <div>
          <div style={{fontSize:13,color:C.ink,fontWeight:600}}>{e.customer_name}</div>
          <div style={{fontSize:11,color:C.muted}}>{(e.products||[])[0]?.name||"—"} · {e.assigned_to}</div>
        </div>
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:12,color:over?C.red:C.amber,fontWeight:700}}>{over?`${Math.abs(d)}d overdue`:`In ${d} day${d!==1?"s":""}`}</div>
        <div style={{marginTop:4}}><StageBadge stage={e.stage}/></div>
      </div>
    </div>;
  }
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    {overdue.length>0&&<Card style={{padding:16,border:`1px solid #FFDAD9`}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.red,textTransform:"uppercase",marginBottom:12}}>⚠ Overdue ({overdue.length})</div>
      {overdue.map(e=><Row key={e.id} e={e} over={true}/>)}
    </Card>}
    <Card style={{padding:16}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.blue,textTransform:"uppercase",marginBottom:12}}>Upcoming ({upcoming.length})</div>
      {upcoming.length>0?upcoming.map(e=><Row key={e.id} e={e} over={false}/>):<div style={{fontSize:12,color:C.muted,textAlign:"center",padding:20}}>No upcoming reminders</div>}
    </Card>
  </div>;
}


export { RemindersTab };
