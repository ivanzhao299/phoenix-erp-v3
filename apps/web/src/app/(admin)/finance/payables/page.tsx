"use client";
import { useState, useEffect, useMemo } from "react";
import { DollarSign, Clock, CheckCircle, AlertTriangle, RefreshCw, Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

const STATUS_CLS: Record<string,string> = {
  PAID:"badgeSuccess",paid:"badgeSuccess",
  PENDING:"badgeNeutral",pending:"badgeNeutral",
  OVERDUE:"badgeDanger",overdue:"badgeDanger",
};

interface APRow { id:number; invoice_no?:string; customer_or_supplier?:string; amount?:number; paid_amount?:number; due_date?:string; status?:string; created_at?:string; }
interface Form { supplier:string; amount:string; paid_amount:string; due_date:string; }
const DEF_FORM: Form = { supplier:"", amount:"", paid_amount:"0", due_date:"" };

export default function PayablesPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [data, setData]       = useState<APRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<APRow|null>(null);
  const [form, setForm]             = useState<Form>(DEF_FORM);
  const [saving, setSaving]         = useState(false);

  const STATUS_LABEL: Record<string,string> = {
    PAID:t('ui.已结清','已结清'),paid:t('ui.已结清','已结清'),
    PENDING:t('ui.待支付','待支付'),pending:t('ui.待支付','待支付'),
    OVERDUE:t('status.overdue','已逾期'),overdue:t('status.overdue','已逾期'),
  };

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"") : "";
  const hdr = { Authorization:`Bearer ${token}`,"Content-Type":"application/json" };

  const load = () => {
    setLoading(true);
    fetch("/api/crud/fin_ap?limit=300").then(r=>r.json())
      .then(d=>setData(d.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  const today = new Date().toISOString().slice(0,10);

  const rows = useMemo(()=>data.map(r=>{
    const isOverdue = r.due_date && r.due_date < today && (r.status||"").toLowerCase()!=="paid";
    const _status = (r.status?.toLowerCase()==="paid") ? "PAID" : isOverdue ? "OVERDUE" : "PENDING";
    const outstanding = (Number(r.amount)||0) - (Number(r.paid_amount)||0);
    return { ...r, _status, _outstanding: outstanding };
  }),[data,today]);

  const totalAP   = rows.reduce((s,r)=>s+(Number(r.amount)||0),0);
  const paidAP    = rows.filter(r=>r._status==="PAID").reduce((s,r)=>s+(Number(r.paid_amount||r.amount)||0),0);
  const overdueAP = rows.filter(r=>r._status==="OVERDUE").reduce((s,r)=>s+(Number(r.amount)||0),0);
  const outstanding= totalAP - paidAP;

  const save = async () => {
    if (!form.supplier||!form.amount) { toast.error(t('ui.请填写供应商和金额','请填写供应商和金额')); return; }
    setSaving(true);
    try {
      const payload = {
        customer_or_supplier: form.supplier,
        amount: Number(form.amount),
        paid_amount: Number(form.paid_amount)||0,
        due_date: form.due_date||null,
        status: Number(form.paid_amount)>= Number(form.amount) ? "PAID" : "PENDING",
      };
      if (editing?.id) {
        await fetch(`/api/crud/fin_ap/${editing.id}`,{ method:"PUT",headers:hdr,body:JSON.stringify(payload) });
      } else {
        await fetch("/api/crud/fin_ap",{ method:"POST",headers:hdr,body:JSON.stringify(payload) });
      }
      toast.success(editing ? t('ui.应付已更新','应付已更新') : t('ui.应付已新增','应付已新增'));
      setDrawerOpen(false); setEditing(null); setForm(DEF_FORM); load();
    } catch { toast.error(t('ui.操作失败','操作失败')); } finally { setSaving(false); }
  };

  const kpis = [
    { label:t('ui.应付总额','应付总额'),   value:`¥${totalAP.toLocaleString()}`,       accent:"#ef4444", icon:<DollarSign size={18}/> },
    { label:t('ui.未结款项','未结款项'),   value:`¥${outstanding.toLocaleString()}`,   accent:"#f59e0b", icon:<Clock size={18}/> },
    { label:t('ui.已结清','已结清'),       value:`¥${paidAP.toLocaleString()}`,        accent:"#10b981", icon:<CheckCircle size={18}/> },
    { label:t('ui.逾期应付','逾期应付'),   value:`¥${overdueAP.toLocaleString()}`,     accent:"#dc2626", icon:<AlertTriangle size={18}/> },
  ];

  const formFields = [
    {key:"supplier",label:t('ui.供应商名称','供应商名称'),type:"text",req:true,ph:t('ui.请填写供应商名称','请填写供应商名称')},
    {key:"amount",label:t('ui.应付金额（¥）','应付金额（¥）'),type:"number",req:true,ph:""},
    {key:"paid_amount",label:t('ui.已付金额（¥）','已付金额（¥）'),type:"number",req:false,ph:""},
    {key:"due_date",label:t('ui.到期日','到期日'),type:"date",req:false,ph:""},
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('ui.应付管理','应付管理')} subtitle={t('ui.供应商付款追踪与付款登记','供应商付款追踪与付款登记')} breadcrumb={[t('ui.财务管理','财务管理'),t('ui.应付管理','应付管理')]}
        actions={
          <div style={{ display:"flex",gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> {t('common.refresh','刷新')}
            </button>
            <button type="button" className={s.btnPrimary} onClick={()=>{setEditing(null);setForm(DEF_FORM);setDrawerOpen(true);}}
              style={{ display:"flex",alignItems:"center",gap:6 }}>
              <Plus size={14}/> {t('ui.新增应付','新增应付')}
            </button>
          </div>
        }/>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginBottom:20 }}>
        {kpis.map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`4px solid ${k.accent}`,borderRadius:"var(--radius-lg)",padding:"14px 18px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8,color:k.accent,fontSize:11,fontWeight:700,textTransform:"uppercase" }}>{k.icon}{k.label}</div>
            <div style={{ fontSize:22,fontWeight:800,color:k.accent }}>{String(k.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"hidden" }}>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
              {[t('ui.应付单号','应付单号'),t('ui.供应商','供应商'),t('ui.应付金额','应付金额'),t('ui.已付金额','已付金额'),t('ui.未结款','未结款'),t('ui.到期日','到期日'),t('common.status','状态'),t('common.operation','操作')].map(h=>(
                <th key={h} style={{ padding:"9px 14px",textAlign:"left",fontSize:12,fontWeight:700,color:"var(--text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t('common.loading','加载中…')}</td></tr>}
            {!loading&&rows.length===0&&<tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t('ui.暂无应付记录','暂无应付记录')}</td></tr>}
            {!loading&&rows.map((r,i)=>(
              <tr key={r.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                <td style={{ padding:"9px 14px",fontFamily:"monospace",fontSize:12,color:"var(--color-primary)" }}>{r.invoice_no||`AP-${r.id}`}</td>
                <td style={{ padding:"9px 14px",fontWeight:600 }}>{r.customer_or_supplier||"—"}</td>
                <td style={{ padding:"9px 14px" }}>¥{Number(r.amount||0).toLocaleString()}</td>
                <td style={{ padding:"9px 14px",color:"#10b981" }}>¥{Number(r.paid_amount||0).toLocaleString()}</td>
                <td style={{ padding:"9px 14px",fontWeight:700,color:r._outstanding>0?"#ef4444":"#10b981" }}>
                  ¥{(r._outstanding||0).toLocaleString()}
                </td>
                <td style={{ padding:"9px 14px",color:"var(--text-secondary)",fontSize:12 }}>{r.due_date?.slice(0,10)||"—"}</td>
                <td style={{ padding:"9px 14px" }}>
                  <span className={`${s.badge} ${s[STATUS_CLS[r._status!]??'badgeNeutral']}`}>{STATUS_LABEL[r._status!]||r._status}</span>
                </td>
                <td style={{ padding:"9px 14px" }}>
                  <button className={s.btnSecondary} style={{ padding:"4px 10px",fontSize:12 }}
                    onClick={()=>{setEditing(r);setForm({supplier:r.customer_or_supplier||"",amount:String(r.amount||""),paid_amount:String(r.paid_amount||0),due_date:r.due_date||""});setDrawerOpen(true);}}>
                    {t('common.edit','编辑')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RightDrawer open={drawerOpen} title={editing?t('ui.编辑应付','编辑应付'):t('ui.新增应付','新增应付')} onClose={()=>{setDrawerOpen(false);setEditing(null);setForm(DEF_FORM);}}>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          {formFields.map(f=>(
            <div key={f.key}>
              <label style={{ fontSize:13,color:"var(--text-secondary)",display:"block",marginBottom:6 }}>
                {f.label}{f.req&&<span className={s.textDanger}> *</span>}
              </label>
              <input type={f.type} value={form[f.key as keyof Form]} placeholder={f.ph}
                onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}
                style={{ width:"100%",padding:"10px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:14,outline:"none",boxSizing:"border-box" }}/>
            </div>
          ))}
          <div style={{ display:"flex",gap:10,paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }} onClick={()=>{setDrawerOpen(false);setEditing(null);setForm(DEF_FORM);}}>{t('common.cancel','取消')}</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }} disabled={saving} onClick={save}>{saving?t('ui.保存中…','保存中…'):t('common.save','保存')}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
