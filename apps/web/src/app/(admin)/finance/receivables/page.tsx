"use client";
import { useState, useEffect, useMemo } from "react";
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

const STATUS_CLS: Record<string,string> = {
  paid:"badgeSuccess", PAID:"badgeSuccess",
  pending:"badgeNeutral", PENDING:"badgeNeutral",
  overdue:"badgeDanger", OVERDUE:"badgeDanger",
  partial:"badgeWarning", PARTIAL:"badgeWarning",
};
const STATUS_LABEL: Record<string,string> = {
  paid:"已收款",PAID:"已收款",pending:"未到期",PENDING:"未到期",
  overdue:"已逾期",OVERDUE:"已逾期",partial:"部分收款",PARTIAL:"部分收款",
};

interface ARRow { id:number; invoice_no?:string; order_no?:string; customer_or_supplier?:string; amount?:number; paid_amount?:number; due_date?:string; status?:string; created_at?:string; }

export default function ReceivablesPage() {
  const toast = useToast();
  const [data, setData]       = useState<ARRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected]     = useState<ARRow | null>(null);
  const [payAmt, setPayAmt] = useState("");
  const [saving, setSaving] = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
  const hdr = { Authorization:`Bearer ${token}`, "Content-Type":"application/json" };

  const load = () => {
    setLoading(true);
    fetch("/api/crud/fin_ar?limit=300").then(r=>r.json())
      .then(d => setData(d.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  const today = new Date().toISOString().slice(0,10);

  const rows = useMemo(() => data.map(r => {
    const isOverdue = r.due_date && r.due_date < today && (r.status||"").toLowerCase() !== "paid";
    return { ...r, _status: isOverdue ? "overdue" : (r.status||"pending").toLowerCase() };
  }), [data, today]);

  const filtered = useMemo(() => rows.filter(r =>
    !search || (r.invoice_no||"").includes(search) || (r.customer_or_supplier||"").includes(search) || (r.order_no||"").includes(search)
  ), [rows, search]);

  const totalAmt   = rows.reduce((s,r)=>s+(Number(r.amount)||0),0);
  const paidAmt    = rows.filter(r=>r._status==="paid").reduce((s,r)=>s+(Number(r.paid_amount||r.amount)||0),0);
  const overdueAmt = rows.filter(r=>r._status==="overdue").reduce((s,r)=>s+(Number(r.amount)||0),0);
  const collectRate= totalAmt > 0 ? ((paidAmt/totalAmt)*100).toFixed(1) : "0.0";

  const recordPayment = async () => {
    if (!selected||!payAmt) { toast.error("请填写收款金额"); return; }
    setSaving(true);
    try {
      await fetch(`/api/crud/fin_ar/${selected.id}`, {
        method:"PUT", headers:hdr,
        body: JSON.stringify({ paid_amount: Number(payAmt), status:"paid", updated_at:new Date().toISOString() }),
      });
      toast.success("收款已记录"); setDrawerOpen(false); load();
    } catch { toast.error("操作失败"); } finally { setSaving(false); }
  };

  const kpis = [
    { label:"应收总额", value:`¥${totalAmt.toLocaleString()}`, accent:"var(--color-primary)", icon:<DollarSign size={18}/> },
    { label:"已收金额", value:`¥${paidAmt.toLocaleString()}`,  accent:"#10b981", icon:<CheckCircle size={18}/> },
    { label:"逾期金额", value:`¥${overdueAmt.toLocaleString()}`,accent:"#ef4444", icon:<AlertTriangle size={18}/> },
    { label:"回款率",   value:`${collectRate}%`,               accent:"#3b82f6", icon:<TrendingUp size={18}/> },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="应收管理" subtitle="客户欠款追踪与回款登记" breadcrumb={["财务管理","应收管理"]}
        actions={<button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ display:"flex",alignItems:"center",gap:6 }}>
          <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> 刷新
        </button>}/>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginBottom:20 }}>
        {kpis.map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`4px solid ${k.accent}`,borderRadius:"var(--radius-lg)",padding:"14px 18px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8,color:k.accent,fontSize:11,fontWeight:700,textTransform:"uppercase" }}>{k.icon}{k.label}</div>
            <div style={{ fontSize:22,fontWeight:800,color:k.accent }}>{String(k.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ position:"relative",marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索单号 / 客户名称..."
          style={{ width:"100%",boxSizing:"border-box",padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}/>
      </div>

      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"hidden" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {["应收单号","客户","金额","到期日","状态","操作"].map(h=>(
                <th key={h} style={{ padding:"9px 14px",textAlign:"left",fontSize:12,fontWeight:700,color:"var(--text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={6} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={6} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>暂无应收记录</td></tr>}
            {!loading&&filtered.map((r,i)=>(
              <tr key={r.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                <td style={{ padding:"9px 14px",fontFamily:"monospace",fontSize:12,color:"var(--color-primary)" }}>{r.invoice_no||`#${r.id}`}</td>
                <td style={{ padding:"9px 14px" }}>{r.customer_or_supplier||r.order_no||"—"}</td>
                <td style={{ padding:"9px 14px",fontWeight:700 }}>¥{Number(r.amount||0).toLocaleString()}</td>
                <td style={{ padding:"9px 14px",color:"var(--text-secondary)",fontSize:12 }}>{r.due_date?.slice(0,10)||"—"}</td>
                <td style={{ padding:"9px 14px" }}>
                  <span className={`${s.badge} ${s[STATUS_CLS[r._status!]??'badgeNeutral']}`}>{STATUS_LABEL[r._status!]||r._status}</span>
                </td>
                <td style={{ padding:"9px 14px" }}>
                  {r._status!=="paid"&&(
                    <button className={s.btnSuccess} style={{ padding:"4px 10px",fontSize:12 }}
                      onClick={()=>{ setSelected(r); setPayAmt(String(r.amount||"")); setDrawerOpen(true); }}>
                      录收款
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RightDrawer open={drawerOpen} title="登记收款" onClose={()=>setDrawerOpen(false)}>
        {selected&&(
          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
            <div style={{ background:"var(--bg-page)",borderRadius:"var(--radius-md)",padding:14 }}>
              <div style={{ fontSize:13,fontWeight:700 }}>{selected.invoice_no||`#${selected.id}`}</div>
              <div style={{ fontSize:12,color:"var(--text-secondary)" }}>{selected.customer_or_supplier||"—"} · 应收 ¥{Number(selected.amount||0).toLocaleString()}</div>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>实收金额（¥）<span className={s.textDanger}>*</span></label>
              <input type="number" value={payAmt} onChange={e=>setPayAmt(e.target.value)}
                style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div style={{ display:"flex",gap:10 }}>
              <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>setDrawerOpen(false)}>取消</button>
              <button type="button" className={s.btnSuccess} style={{ flex:2 }} disabled={saving||!payAmt} onClick={recordPayment}>
                {saving?"保存中…":"确认收款"}
              </button>
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}