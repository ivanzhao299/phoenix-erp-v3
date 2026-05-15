"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Package, AlertTriangle, TrendingUp, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

const QUICK = [
  { path:"/store/receiving",  icon:"📦", label:"门店收货",   desc:"核收来自仓库的补货", color:"#3b82f6" },
  { path:"/store/inventory",  icon:"🗃️",  label:"门店库存",   desc:"本店当前库存状态",   color:"#10b981" },
  { path:"/store/daily",      icon:"📋", label:"日结作业",   desc:"当日营业汇总结账",   color:"#f59e0b" },
  { path:"/store/replenish",  icon:"🔄", label:"补货申请",   desc:"向仓库发起补货请求", color:"#8b5cf6" },
  { path:"/store/losses",     icon:"⚠️", label:"损耗上报",   desc:"破损·临期损耗记录", color:"#ef4444" },
];

// B1 + 子修：pos_sales 真实列 net_amount；store_receiving PK 是 order_no（无 id）；
//             inv_batches 没有 qty_available（用 qty 替代）
interface PosSale    { id:number; created_at?:string; total_amount?:number; net_amount?:number; }
interface StoreRecv  { order_no:string; wave_no?:string; status?:string; created_at?:string; store_code?:string; operator?:string; }
interface InvBatch   { id:number; qty?:number; expire_date?:string; }

export default function StorePage() {
  const router = useRouter();
  const [sales,     setSales]    = useState<PosSale[]>([]);
  const [receiving, setReceiving]= useState<StoreRecv[]>([]);
  const [batches,   setBatches]  = useState<InvBatch[]>([]);
  const [loading,   setLoading]  = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/crud/pos_sales?limit=200").then(r=>r.json()).catch(()=>({data:[]})),
      fetch("/api/crud/store_receiving?limit=100").then(r=>r.json()).catch(()=>({data:[]})),
      fetch("/api/crud/inv_batches?limit=300").then(r=>r.json()).catch(()=>({data:[]})),
    ]).then(([s,r,b])=>{ setSales(s.data||[]); setReceiving(r.data||[]); setBatches(b.data||[]); })
      .finally(()=>setLoading(false));
  };

  useEffect(()=>{ load(); },[]);

  const today = new Date().toISOString().slice(0,10);
  const in7   = new Date(Date.now()+7*86400000).toISOString().slice(0,10);

  const todaySales   = useMemo(()=>sales.filter(s=>(s.created_at||"").slice(0,10)===today),[sales,today]);
  // B1: 优先 net_amount (实收) 兜底 total_amount；旧 amount 字段 DB 不存在
  const todayRevenue = todaySales.reduce((sum,s)=>sum+(Number(s.net_amount)||Number(s.total_amount)||0),0);
  const pendingRecv  = receiving.filter(r=>r.status==="PENDING").length;
  const lowStock     = batches.filter(b=>Number(b.qty||0)<50).length;
  const nearExpiry   = batches.filter(b=>b.expire_date&&b.expire_date<=in7&&b.expire_date>=today).length;

  const kpis = [
    { label:"今日销售额", value:loading?"…":`¥${todayRevenue.toLocaleString()}`, accent:"#10b981", icon:<TrendingUp size={18}/> },
    { label:"今日单数",   value:loading?"…":String(todaySales.length), unit:"单", accent:"#3b82f6", icon:<ShoppingCart size={18}/> },
    { label:"待收货",     value:loading?"…":String(pendingRecv),       unit:"批", accent:"#f59e0b", icon:<Package size={18}/> },
    { label:"近效期库存", value:loading?"…":String(nearExpiry),        unit:"批", accent:"#ef4444", icon:<AlertTriangle size={18}/> },
  ];

  const recentRecv = useMemo(()=>
    [...receiving].sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).slice(0,5)
  ,[receiving]);

  return (
    <div className="animate-fade-in">
      <PageHeader title="门店工作台" subtitle="收货·库存·日结·补货·损耗" breadcrumb={["门店管理"]}
        actions={<button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ display:"flex", alignItems:"center", gap:6 }}>
          <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> 刷新
        </button>}/>

      {/* KPI */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:12, marginBottom:24 }}>
        {kpis.map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)", border:"1px solid var(--border)",
            borderLeft:`4px solid ${k.accent}`, borderRadius:"var(--radius-lg)", padding:"16px 18px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:8, color:k.accent, fontSize:12, fontWeight:700, textTransform:"uppercase" }}>
              {k.icon}{k.label}
            </div>
            <div style={{ fontSize:24, fontWeight:800, color:k.accent }}>
              {String(k.value)}{k.unit&&<span style={{ fontSize:12, marginLeft:3, color:"var(--text-secondary)" }}>{k.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:20 }}>
        {/* 功能入口 */}
        <div>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, color:"var(--color-primary)" }}>门店功能入口</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {QUICK.map(q=>(
              <button key={q.path} type="button" onClick={()=>router.push(q.path)}
                style={{ background:"var(--bg-card)", borderRadius:"var(--radius-lg)",
                  border:`1px solid ${q.color}25`, borderTop:`3px solid ${q.color}`,
                  padding:14, cursor:"pointer", textAlign:"left" }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-md)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.boxShadow="none";}}>
                <div style={{ fontSize:22, marginBottom:6 }}>{q.icon}</div>
                <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)", marginBottom:2 }}>{q.label}</div>
                <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{q.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 近期收货动态 */}
        <div>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, color:"var(--color-primary)" }}>近期收货动态</h3>
          <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", overflow:"hidden" }}>
            {recentRecv.length===0&&!loading&&<div className={s.emptyState}>暂无收货记录</div>}
            {recentRecv.map((r,i)=>{
              const isPending = r.status==="PENDING";
              return (
                <div key={r.order_no} style={{ padding:"10px 14px", borderBottom:i<recentRecv.length-1?"1px solid var(--border)":"none",
                  display:"flex", alignItems:"center", gap:10 }}>
                  <Package size={14} color="var(--text-secondary)"/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:700 }}>收货单 {r.order_no}</div>
                    <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{(r.created_at||"—").slice(0,10)} · {r.wave_no || r.store_code || "—"}</div>
                  </div>
                  <span className={`${s.badge} ${isPending?s.badgeWarning:s.badgeSuccess}`}>
                    {isPending?"待确认":"已完成"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
