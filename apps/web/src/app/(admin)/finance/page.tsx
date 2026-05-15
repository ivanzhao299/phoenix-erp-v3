"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, TrendingUp, TrendingDown, BarChart2, AlertTriangle, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

const QUICK_LINKS = [
  { title:"应收管理", path:"/finance/receivables", icon:"📥", color:"#10b981", desc:"客户欠款追踪" },
  { title:"应付管理", path:"/finance/payables",    icon:"📤", color:"#ef4444", desc:"供应商付款" },
  { title:"账龄分析", path:"/finance/aging",       icon:"📊", color:"#8b5cf6", desc:"逾期账款明细" },
  { title:"成本核算", path:"/finance/cost",        icon:"🧾", color:"#f59e0b", desc:"饲料·人工·折旧" },
  { title:"现金流量", path:"/finance/cashflow",    icon:"💰", color:"#3b82f6", desc:"资金流水报表" },
  { title:"收款管理", path:"/finance/payments",   icon:"✅", color:"#06b6d4", desc:"已收款记录" },
];

interface ARRow  { id:number; customer_name?:string; amount?:number; due_date?:string; status?:string; }
interface APRow  { id:number; supplier_name?:string; amount?:number; due_date?:string; status?:string; }
interface Order  { id:number; status?:string; total_amount?:number; }

export default function FinancePage() {
  const router = useRouter();
  const [ar, setAr]     = useState<ARRow[]>([]);
  const [ap, setAp]     = useState<APRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/crud/fin_ar?limit=200").then(r=>r.json()).catch(()=>({data:[]})),
      fetch("/api/crud/fin_ap?limit=200").then(r=>r.json()).catch(()=>({data:[]})),
      fetch("/api/crud/ord_orders?limit=200").then(r=>r.json()).catch(()=>({data:[]})),
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
    { label:"应收余额",  value:loading?"…":`¥${totalAR.toLocaleString()}`,   accent:"#10b981", icon:<TrendingUp size={18}/> },
    { label:"应付余额",  value:loading?"…":`¥${totalAP.toLocaleString()}`,   accent:"#ef4444", icon:<TrendingDown size={18}/> },
    { label:"逾期应收",  value:loading?"…":String(overdueAR),                accent:"#f59e0b", icon:<AlertTriangle size={18}/>, unit:"笔" },
    { label:"已对账营收",value:loading?"…":`¥${reconciledRevenue.toLocaleString()}`, accent:"#3b82f6", icon:<DollarSign size={18}/> },
  ];

  // 账龄分级（简单按 due_date 距今天数）
  const aging = useMemo(() => {
    const buckets: Record<string,number> = { "0-30天":0,"31-60天":0,"61-90天":0,"90天以上":0 };
    ar.filter(r=>r.status!=="paid").forEach(r=>{
      if (!r.due_date) return;
      const days = Math.floor((new Date(today).getTime()-new Date(r.due_date).getTime())/86400000);
      if (days<=0) return;
      if (days<=30) buckets["0-30天"] += Number(r.amount)||0;
      else if (days<=60) buckets["31-60天"] += Number(r.amount)||0;
      else if (days<=90) buckets["61-90天"] += Number(r.amount)||0;
      else buckets["90天以上"] += Number(r.amount)||0;
    });
    return buckets;
  }, [ar, today]);

  const maxAging = Math.max(...Object.values(aging), 1);

  return (
    <div className="animate-fade-in">
      <PageHeader title="财务管理" subtitle="应收应付·账龄分析·成本核算"
        breadcrumb={["财务管理"]}
        actions={<button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ display:"flex", alignItems:"center", gap:6 }}>
          <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> 刷新
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
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, color:"var(--color-primary)" }}>财务功能入口</h3>
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
            <BarChart2 size={14} color="#8b5cf6"/> 应收账龄分布
          </h4>
          {Object.entries(aging).map(([label, val])=>{
            const pct = (val/maxAging)*100;
            const color = label==="90天以上"?"#ef4444":label==="61-90天"?"#f59e0b":"#10b981";
            return (
              <div key={label} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                  <span style={{ fontWeight:600 }}>{label}</span>
                  <span style={{ color, fontWeight:700 }}>¥{val.toLocaleString()}</span>
                </div>
                <div className={s.progressWrap} style={{ height:8 }}>
                  <div className={`${s.progressBar} ${label==="90天以上"?s.progressBarDanger:label==="61-90天"?s.progressBarWarning:s.progressBarSuccess}`}
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
