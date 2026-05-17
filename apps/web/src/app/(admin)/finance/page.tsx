"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, TrendingUp, TrendingDown, BarChart2, AlertTriangle, RefreshCw } from "lucide-react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

interface ARRow  { id:number; customer_name?:string; amount?:number; due_date?:string; status?:string; }
interface APRow  { id:number; supplier_name?:string; amount?:number; due_date?:string; status?:string; }
interface Order  { id:number; status?:string; total_amount?:number; }

export default function FinancePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [ar, setAr]     = useState<ARRow[]>([]);
  const [ap, setAp]     = useState<APRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const QUICK_LINKS = [
    { title:t('ui.应收管理', '应收管理'), path:"/finance/receivables", icon:"📥", color:"#10b981", desc:t('ui.客户欠款追踪', '客户欠款追踪') },
    { title:t('ui.应付管理', '应付管理'), path:"/finance/payables",    icon:"📤", color:"#ef4444", desc:t('ui.供应商付款', '供应商付款') },
    { title:t('ui.账龄分析', '账龄分析'), path:"/finance/aging",       icon:"📊", color:"#8b5cf6", desc:t('ui.逾期账款明细', '逾期账款明细') },
    { title:t('ui.成本核算', '成本核算'), path:"/finance/cost",        icon:"🧾", color:"#f59e0b", desc:t('ui.饲料·人工·折旧', '饲料·人工·折旧') },
    { title:t('ui.现金流量', '现金流量'), path:"/finance/cashflow",    icon:"💰", color:"#3b82f6", desc:t('ui.资金流水报表', '资金流水报表') },
    { title:t('ui.收款管理', '收款管理'), path:"/finance/payments",   icon:"✅", color:"#06b6d4", desc:t('ui.已收款记录', '已收款记录') },
  ];

  const load = () => {
    setLoading(true);
    Promise.all([
      crudApi.list<ARRow>("fin_transactions", { type:"AR", limit:200 } as never).catch(()=>({ data:[] as ARRow[] })),
      crudApi.list<APRow>("fin_transactions", { type:"AP", limit:200 } as never).catch(()=>({ data:[] as APRow[] })),
      crudApi.list<Order>("ord_orders", { limit:200 } as never).catch(()=>({ data:[] as Order[] })),
    ]).then(([arD, apD, orD]) => {
      setAr(arD.data||[]); setAp(apD.data||[]); setOrders(orD.data||[]);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const today = new Date().toISOString().slice(0,10);
  const totalAR      = ar.reduce((s,r)=>s+(Number(r.amount)||0),0);
  const totalAP      = ap.reduce((s,r)=>s+(Number(r.amount)||0),0);
  const overdueAR    = ar.filter(r => r.due_date && r.due_date < today && r.status !== "paid").length;
  const reconciledRevenue = orders.filter(o=>o.status==="reconciled").reduce((s,o)=>s+(Number(o.total_amount)||0),0);

  const kpis = [
    { label:t('ui.应收余额', '应收余额'),  value:loading?"…":`¥${totalAR.toLocaleString()}`,   accent:"#10b981", icon:<TrendingUp size={18}/> },
    { label:t('ui.应付余额', '应付余额'),  value:loading?"…":`¥${totalAP.toLocaleString()}`,   accent:"#ef4444", icon:<TrendingDown size={18}/> },
    { label:t('ui.逾期应收', '逾期应收'),  value:loading?"…":String(overdueAR),                accent:"#f59e0b", icon:<AlertTriangle size={18}/>, unit:t('ui.笔', '笔') },
    { label:t('ui.已对账营收', '已对账营收'),value:loading?"…":`¥${reconciledRevenue.toLocaleString()}`, accent:"#3b82f6", icon:<DollarSign size={18}/> },
  ];

  // 账龄分级（简单按 due_date 距今天数）
  const AGING_BUCKETS = [
    { key:"0-30",  label: t('ui.0-30天', '0-30天'),   color:"#10b981" },
    { key:"31-60", label: t('ui.31-60天','31-60天'),  color:"#10b981" },
    { key:"61-90", label: t('ui.61-90天','61-90天'),  color:"#f59e0b" },
    { key:"90+",   label: t('ui.90天以上','90天以上'), color:"#ef4444" },
  ];
  const aging = useMemo(() => {
    const buckets: Record<string,number> = { "0-30":0,"31-60":0,"61-90":0,"90+":0 };
    ar.filter(r=>r.status!=="paid").forEach(r=>{
      if (!r.due_date) return;
      const days = Math.floor((new Date(today).getTime()-new Date(r.due_date).getTime())/86400000);
      if (days<=0) return;
      if (days<=30) buckets["0-30"] += Number(r.amount)||0;
      else if (days<=60) buckets["31-60"] += Number(r.amount)||0;
      else if (days<=90) buckets["61-90"] += Number(r.amount)||0;
      else buckets["90+"] += Number(r.amount)||0;
    });
    return buckets;
  }, [ar, today]);

  const maxAging = Math.max(...Object.values(aging), 1);

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('ui.财务管理', '财务管理')} subtitle={t('ui.应收应付·账龄分析·成本核算', '应收应付·账龄分析·成本核算')}
        breadcrumb={[t('ui.财务管理', '财务管理')]}
        actions={<button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ display:"flex", alignItems:"center", gap:6 }}>
          <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> {t('common.refresh', '刷新')}
        </button>}/>

      {/* KPI */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14, marginBottom:24 }}>
        {kpis.map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)", border:"1px solid var(--border)",
            borderLeft:`4px solid ${k.accent}`, borderRadius:"var(--radius-lg)", padding:"16px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10, color:k.accent, fontSize:12, fontWeight:700, textTransform:"uppercase" }}>
              {k.icon}{k.label}
            </div>
            <div style={{ fontSize:24, fontWeight:800, color:k.accent }}>
              {String(k.value)}{k.unit&&<span style={{ fontSize:13, marginLeft:3, color:"var(--text-secondary)" }}>{k.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:20, marginBottom:24 }}>
        {/* 快捷入口 */}
        <div>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, color:"var(--color-primary)" }}>{t('ui.财务功能入口', '财务功能入口')}</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {QUICK_LINKS.map(q=>(
              <button key={q.path} type="button" onClick={()=>router.push(q.path)}
                style={{ background:"var(--bg-card)", borderRadius:"var(--radius-lg)",
                  border:`1px solid ${q.color}25`, borderTop:`3px solid ${q.color}`,
                  padding:16, cursor:"pointer", textAlign:"left" }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-md)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.boxShadow="none";}}>
                <div style={{ fontSize:24, marginBottom:6 }}>{q.icon}</div>
                <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)", marginBottom:2 }}>{q.title}</div>
                <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{q.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 账龄分布 */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:18 }}>
          <h4 style={{ fontSize:13, fontWeight:700, marginBottom:14, display:"flex", alignItems:"center", gap:6 }}>
            <BarChart2 size={14} color="#8b5cf6"/> {t('ui.应收账龄分布', '应收账龄分布')}
          </h4>
          {AGING_BUCKETS.map(({ key, label, color })=>{
            const val = aging[key] ?? 0;
            const pct = (val/maxAging)*100;
            return (
              <div key={key} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                  <span style={{ fontWeight:600 }}>{label}</span>
                  <span style={{ color, fontWeight:700 }}>¥{val.toLocaleString()}</span>
                </div>
                <div className={s.progressWrap} style={{ height:8 }}>
                  <div className={`${s.progressBar} ${key==="90+"?s.progressBarDanger:key==="61-90"?s.progressBarWarning:s.progressBarSuccess}`}
                    style={{ width:`${pct}%` }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
