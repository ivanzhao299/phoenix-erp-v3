"use client";
import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

const STATUS_CLS: Record<string,string> = {
  open:"badgeDanger", OPEN:"badgeDanger",
  closed:"badgeSuccess", CLOSED:"badgeSuccess",
  PENDING:"badgeWarning", pending:"badgeWarning",
};
const STATUS_LABEL: Record<string,string> = {
  open:"待处置",OPEN:"待处置",closed:"已关闭",CLOSED:"已关闭",PENDING:"待处置",pending:"待处置",
};
const SEVERITY_CLS: Record<string,string> = {
  HIGH:"badgeDanger",CRITICAL:"badgeDanger",MEDIUM:"badgeWarning",LOW:"badgeNeutral",
};

interface NCRow { id:number; nc_no?:string; source?:string; issue_desc?:string; qty?:number; handler?:string; action_taken?:string; severity?:string; batch_no?:string; status?:string; created_at?:string; }
interface Form { source:string; issue_desc:string; qty:string; handler:string; action_taken:string; severity:string; batch_no:string; }
const DEF: Form = { source:"", issue_desc:"", qty:"", handler:"", action_taken:"评估封存", severity:"MEDIUM", batch_no:"" };

export default function NonconformancePage() {
  const toast = useToast();
  const [data, setData]       = useState<NCRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<NCRow|null>(null);
  const [form, setForm]             = useState<Form>(DEF);
  const [saving, setSaving]         = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"") : "";
  const hdr = { Authorization:`Bearer ${token}`,"Content-Type":"application/json" };

  const load = () => {
    setLoading(true);
    fetch("/api/crud/qa_non_conformance?limit=200").then(r=>r.json())
      .then(d=>setData(d.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  const open   = data.filter(r=>(r.status||"").toLowerCase()!=="closed").length;
  const closed  = data.filter(r=>(r.status||"").toLowerCase()==="closed").length;
  const high    = data.filter(r=>r.severity==="HIGH"||r.severity==="CRITICAL").length;
  const today   = new Date().toISOString().slice(0,10);
  const todayNcr= data.filter(r=>(r.created_at||"").slice(0,10)===today).length;

  const close_ncr = async (id: number) => {
    await fetch(`/api/crud/qa_non_conformance/${id}`,{ method:"PUT",headers:hdr,body:JSON.stringify({status:"CLOSED",updated_at:new Date().toISOString()}) });
    toast.success("已关闭"); load();
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, qty:Number(form.qty)||0, status:"OPEN" };
      if (editing?.id) {
        await fetch(`/api/crud/qa_non_conformance/${editing.id}`,{method:"PUT",headers:hdr,body:JSON.stringify(payload)});
      } else {
        const nc_no = `NCR-${Date.now().toString().slice(-8)}`;
        await fetch("/api/crud/qa_non_conformance",{method:"POST",headers:hdr,body:JSON.stringify({...payload,nc_no})});
      }
      toast.success("保存成功"); setDrawerOpen(false); setEditing(null); setForm(DEF); load();
    } catch { toast.error("操作失败"); } finally { setSaving(false); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="不合格品处置" subtitle="不合格品追踪、评估与关闭" breadcrumb={["品质追溯","不合格品"]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> 刷新
            </button>
            <button type="button" className={s.btnDanger} onClick={()=>{setEditing(null);setForm(DEF);setDrawerOpen(true);}}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <Plus size={14}/> 新增 NCR
            </button>
          </div>
        }/>

      {/* KPI */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginBottom:20 }}>
        {[
          {label:"待处置",value:String(open),accent:"#ef4444",icon:<AlertTriangle size={18}/>},
          {label:"已关闭",value:String(closed),accent:"#10b981",icon:<CheckCircle size={18}/>},
          {label:"高严重性",value:String(high),accent:"#dc2626",icon:<AlertTriangle size={18}/>},
          {label:"今日新增",value:String(todayNcr),accent:"#f59e0b",icon:<Clock size={18}/>},
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`4px solid ${k.accent}`,borderRadius:"var(--radius-lg)",padding:"14px 18px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8,color:k.accent,fontSize:11,fontWeight:700,textTransform:"uppercase" }}>{k.icon}{k.label}</div>
            <div style={{ fontSize:26,fontWeight:800,color:k.accent }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"hidden" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {["NCR单号","来源","问题描述","数量","严重性","处置","状态","操作"].map(h=>(
                <th key={h} style={{ padding:"9px 14px",textAlign:"left",fontSize:12,fontWeight:700,color:"var(--text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading&&data.length===0&&<tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>暂无不合格品记录</td></tr>}
            {!loading&&data.map((r,i)=>{
              const st = r.status||"OPEN";
              const isClosed = st.toLowerCase()==="closed";
              return (
                <tr key={r.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                  <td style={{ padding:"9px 14px",fontFamily:"monospace",fontSize:12,color:"var(--color-primary)" }}>{r.nc_no||`NCR-${r.id}`}</td>
                  <td style={{ padding:"9px 14px",color:"var(--text-secondary)" }}>{r.source||"—"}</td>
                  <td style={{ padding:"9px 14px",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{r.issue_desc||"—"}</td>
                  <td style={{ padding:"9px 14px" }}>{r.qty||0}</td>
                  <td style={{ padding:"9px 14px" }}>
                    <span className={`${s.badge} ${s[SEVERITY_CLS[r.severity||""]??'badgeNeutral']}`}>{r.severity||"—"}</span>
                  </td>
                  <td style={{ padding:"9px 14px",color:"var(--text-secondary)",fontSize:12 }}>{r.action_taken||"—"}</td>
                  <td style={{ padding:"9px 14px" }}>
                    <span className={`${s.badge} ${s[STATUS_CLS[st]??'badgeNeutral']}`}>{STATUS_LABEL[st]||st}</span>
                  </td>
                  <td style={{ padding:"9px 14px",display:"flex",gap:6 }}>
                    <button className={s.btnSecondary} style={{ padding:"4px 8px",fontSize:12 }}
                      onClick={()=>{setEditing(r);setForm({source:r.source||"",issue_desc:r.issue_desc||"",qty:String(r.qty||""),handler:r.handler||"",action_taken:r.action_taken||"评估封存",severity:r.severity||"MEDIUM",batch_no:r.batch_no||""});setDrawerOpen(true);}}>
                      编辑
                    </button>
                    {!isClosed&&<button className={s.btnSuccess} style={{ padding:"4px 8px",fontSize:12 }} onClick={()=>close_ncr(r.id)}>关闭</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RightDrawer open={drawerOpen} title={editing?"编辑NCR":"新增不合格品"} onClose={()=>{setDrawerOpen(false);setEditing(null);setForm(DEF);}}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          {([
            {key:"batch_no",label:"关联批次号",type:"text",ph:"如 BT-123456-A"},
            {key:"source",label:"问题来源",type:"text",ph:"如：客诉、巡检"},
            {key:"issue_desc",label:"问题描述",type:"textarea",ph:"详细描述不合格情况"},
            {key:"qty",label:"不合格数量",type:"number",ph:""},
            {key:"handler",label:"责任人",type:"text",ph:""},
          ] as {key:string;label:string;type:string;ph:string}[]).map(f=>(
            <div key={f.key}>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>{f.label}</label>
              {f.type==="textarea"
                ? <textarea value={form[f.key as keyof Form]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} rows={3} placeholder={f.ph}
                    style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",resize:"vertical",boxSizing:"border-box" }}/>
                : <input type={f.type} value={form[f.key as keyof Form]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                    style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" }}/>
              }
            </div>
          ))}
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>严重性</label>
            <select value={form.severity} onChange={e=>setForm(p=>({...p,severity:e.target.value}))}
              style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}>
              {["LOW","MEDIUM","HIGH","CRITICAL"].map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>处置方式</label>
            <select value={form.action_taken} onChange={e=>setForm(p=>({...p,action_taken:e.target.value}))}
              style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}>
              {["评估封存","降级使用","销毁处理","退货供应商","其他"].map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{setDrawerOpen(false);setEditing(null);setForm(DEF);}}>取消</button>
            <button type="button" className={s.btnDanger} style={{ flex:2 }} disabled={saving} onClick={save}>{saving?"保存中…":"保存"}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}