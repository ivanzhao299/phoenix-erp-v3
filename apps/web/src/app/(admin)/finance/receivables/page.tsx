"use client";
import { useState, useEffect, useMemo } from "react";
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle, RefreshCw, Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

const STATUS_CLS: Record<string,string> = {
  paid:"badgeSuccess", PAID:"badgeSuccess",
  pending:"badgeNeutral", PENDING:"badgeNeutral",
  overdue:"badgeDanger", OVERDUE:"badgeDanger",
  partial:"badgeWarning", PARTIAL:"badgeWarning",
};

interface ARRow { id:number; invoice_no?:string; order_no?:string; customer_or_supplier?:string; amount?:number; paid_amount?:number; due_date?:string; status?:string; created_at?:string; }

export default function ReceivablesPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [data, setData]       = useState<ARRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected]     = useState<ARRow | null>(null);
  const [payAmt, setPayAmt] = useState("");
  const [saving, setSaving] = useState(false);

  const emptyForm = { customer:"", amount:"", due_date:"", invoice_no:"", note:"" };
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
  const hdr = { Authorization:`Bearer ${token}`, "Content-Type":"application/json" };

  const STATUS_LABEL: Record<string,string> = {
    paid:t('status.paid','已收款'),PAID:t('status.paid','已收款'),
    pending:t('ui.未到期','未到期'),PENDING:t('ui.未到期','未到期'),
    overdue:t('status.overdue','已逾期'),OVERDUE:t('status.overdue','已逾期'),
    partial:t('status.partial','部分收款'),PARTIAL:t('status.partial','部分收款'),
  };

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

  const createAR = async () => {
    if (!newForm.customer || !newForm.amount) { toast.error(t('ui.请填写客户和金额', '请填写客户和金额')); return; }
    setCreating(true);
    try {
      await fetch("/api/crud/fin_ar", {
        method:"POST", headers:hdr,
        body: JSON.stringify({
          customer_or_supplier: newForm.customer,
          amount: Number(newForm.amount),
          due_date: newForm.due_date || null,
          invoice_no: newForm.invoice_no || null,
          note: newForm.note || null,
          status: "pending",
          paid_amount: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      toast.success(t('ui.应收单已创建', '应收单已创建')); setNewOpen(false); setNewForm(emptyForm); load();
    } catch { toast.error(t('ui.创建失败', '创建失败')); } finally { setCreating(false); }
  };

  const recordPayment = async () => {
    if (!selected||!payAmt) { toast.error(t('ui.请填写收款金额', '请填写收款金额')); return; }
    setSaving(true);
    try {
      await fetch(`/api/crud/fin_ar/${selected.id}`, {
        method:"PUT", headers:hdr,
        body: JSON.stringify({ paid_amount: Number(payAmt), status:"paid", updated_at:new Date().toISOString() }),
      });
      toast.success(t('ui.收款已记录', '收款已记录')); setDrawerOpen(false); load();
    } catch { toast.error(t('ui.操作失败', '操作失败')); } finally { setSaving(false); }
  };

  const kpis = [
    { label:t('ui.应收总额', '应收总额'), value:`¥${totalAmt.toLocaleString()}`, accent:"var(--color-primary)", icon:<DollarSign size={18}/> },
    { label:t('ui.已收金额', '已收金额'), value:`¥${paidAmt.toLocaleString()}`,  accent:"#10b981", icon:<CheckCircle size={18}/> },
    { label:t('ui.逾期金额', '逾期金额'), value:`¥${overdueAmt.toLocaleString()}`,accent:"#ef4444", icon:<AlertTriangle size={18}/> },
    { label:t('ui.回款率',   '回款率'),   value:`${collectRate}%`,               accent:"#3b82f6", icon:<TrendingUp size={18}/> },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('ui.应收管理', '应收管理')} subtitle={t('ui.客户欠款追踪与回款登记', '客户欠款追踪与回款登记')} breadcrumb={[t('ui.财务管理', '财务管理'),t('ui.应收管理', '应收管理')]}
        actions={<div style={{ display:"flex",gap:8 }}>
          <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
            style={{ display:"flex",alignItems:"center",gap:6 }}>
            <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> {t('common.refresh', '刷新')}
          </button>
          <button type="button" className={s.btnPrimary} onClick={()=>{ setNewForm(emptyForm); setNewOpen(true); }}
            style={{ display:"flex",alignItems:"center",gap:6 }}>
            <Plus size={14}/> {t('ui.新建应收单', '新建应收单')}
          </button>
        </div>}/>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginBottom:20 }}>
        {kpis.map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`4px solid ${k.accent}`,borderRadius:"var(--radius-lg)",padding:"14px 18px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8,color:k.accent,fontSize:11,fontWeight:700,textTransform:"uppercase" }}>{k.icon}{k.label}</div>
            <div style={{ fontSize:22,fontWeight:800,color:k.accent }}>{String(k.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ position:"relative",marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('ui.搜索单号 / 客户名称...', '搜索单号 / 客户名称...')}
          style={{ width:"100%",boxSizing:"border-box",padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none" }}/>
      </div>

      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"hidden" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {[t('ui.应收单号','应收单号'),t('ui.客户','客户'),t('common.amount','金额'),t('ui.到期日','到期日'),t('common.status','状态'),t('common.operation','操作')].map(h=>(
                <th key={h} style={{ padding:"9px 14px",textAlign:"left",fontSize:12,fontWeight:700,color:"var(--text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={6} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t('common.loading','加载中…')}</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={6} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t('ui.暂无应收记录','暂无应收记录')}</td></tr>}
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
                      {t('ui.录收款', '录收款')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RightDrawer open={newOpen} title={t('ui.新建应收单', '新建应收单')} onClose={()=>setNewOpen(false)}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>{t('ui.客户 / 单位', '客户 / 单位')} <span className={s.textDanger}>*</span></label>
            <input value={newForm.customer} onChange={e=>setNewForm(f=>({...f,customer:e.target.value}))} placeholder={t('ui.输入客户名称', '输入客户名称')}
              style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" as const }}/>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>{t('ui.应收金额（¥）', '应收金额（¥）')} <span className={s.textDanger}>*</span></label>
            <input type="number" value={newForm.amount} onChange={e=>setNewForm(f=>({...f,amount:e.target.value}))} placeholder="0.00"
              style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" as const }}/>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>{t('ui.到期日', '到期日')}</label>
            <input type="date" value={newForm.due_date} onChange={e=>setNewForm(f=>({...f,due_date:e.target.value}))}
              style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" as const }}/>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>{t('ui.应收单号（可选）', '应收单号（可选）')}</label>
            <input value={newForm.invoice_no} onChange={e=>setNewForm(f=>({...f,invoice_no:e.target.value}))} placeholder={t('ui.留空系统自动编号', '留空系统自动编号')}
              style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" as const }}/>
          </div>
          <div>
            <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>{t('common.remark', '备注')}</label>
            <textarea value={newForm.note} onChange={e=>setNewForm(f=>({...f,note:e.target.value}))} rows={3} placeholder={t('ui.可选说明...', '可选说明...')}
              style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" as const,resize:"vertical" }}/>
          </div>
          <div style={{ display:"flex",gap:10 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>setNewOpen(false)}>{t('common.cancel', '取消')}</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={creating||!newForm.customer||!newForm.amount} onClick={createAR}>
              {creating?t('ui.提交中…','提交中…'):t('ui.确认创建','确认创建')}
            </button>
          </div>
        </div>
      </RightDrawer>

      <RightDrawer open={drawerOpen} title={t('ui.登记收款', '登记收款')} onClose={()=>setDrawerOpen(false)}>
        {selected&&(
          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
            <div style={{ background:"var(--bg-page)",borderRadius:"var(--radius-md)",padding:14 }}>
              <div style={{ fontSize:13,fontWeight:700 }}>{selected.invoice_no||`#${selected.id}`}</div>
              <div style={{ fontSize:12,color:"var(--text-secondary)" }}>{selected.customer_or_supplier||"—"} · {t('ui.应收','应收')} ¥{Number(selected.amount||0).toLocaleString()}</div>
            </div>
            <div>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>{t('ui.实收金额（¥）','实收金额（¥）')}<span className={s.textDanger}>*</span></label>
              <input type="number" value={payAmt} onChange={e=>setPayAmt(e.target.value)}
                style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" }}/>
            </div>
            <div style={{ display:"flex",gap:10 }}>
              <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>setDrawerOpen(false)}>{t('common.cancel', '取消')}</button>
              <button type="button" className={s.btnSuccess} style={{ flex:2 }} disabled={saving||!payAmt} onClick={recordPayment}>
                {saving?t('ui.保存中…','保存中…'):t('ui.确认收款','确认收款')}
              </button>
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}
