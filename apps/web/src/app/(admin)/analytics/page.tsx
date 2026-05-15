"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart2, TrendingUp, TrendingDown, Package, PackageCheck, PackageMinus,
  ShoppingCart, AlertTriangle, RefreshCw, Activity, Egg
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

// ── 纯 CSS 柱状图 ────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, color = "var(--color-primary)", height = 160 }: {
  data: Record<string,unknown>[]; valueKey: string; labelKey: string; color?: string; height?: number;
}) {
  if (!data.length) return (
    <div style={{ height, display:"flex", alignItems:"center", justifyContent:"center",
      color:"var(--text-secondary)", fontSize:13 }}>暂无数据</div>
  );
  const max = Math.max(...data.map(d => Number(d[valueKey] || 0)), 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:6, height, paddingBottom:22, position:"relative" }}>
      {[0, 50, 100].map(p => (
        <div key={p} style={{ position:"absolute", left:0, right:0,
          bottom:`${(p / 100) * (height - 22)}px`,
          borderTop: p === 0 ? "2px solid var(--border)" : "1px dashed var(--border)", opacity:0.5 }}/>
      ))}
      {data.map((d, i) => {
        const v   = Number(d[valueKey] || 0);
        const pct = Math.min((v / max) * 100, 100);
        const lbl = String(d[labelKey] || "").slice(5);
        return (
          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
            height:"100%", justifyContent:"flex-end", gap:4 }}>
            <div title={`${lbl}: ${v.toLocaleString()}`}
              style={{ width:"100%", maxWidth:32, height:`${pct}%`, background:color,
                borderRadius:"4px 4px 0 0", minHeight:3, transition:"height .3s ease" }}/>
            <span style={{ fontSize:10, color:"var(--text-secondary)", whiteSpace:"nowrap",
              transform:"rotate(-30deg)", transformOrigin:"top center" }}>{lbl}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── 可展开告警项 ──────────────────────────────────────────────
function AlertItem({ icon, label, value, color, items = [] }: {
  icon: React.ReactNode; label: string; value: number; color: string; items?: { key: string; val: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border:`1px solid ${color}30`, borderRadius:"var(--radius-md)", marginBottom:10, overflow:"hidden" }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ padding:"12px 16px", background:`${color}08`, display:"flex",
          alignItems:"center", gap:10, cursor:"pointer" }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{label}</span>
        <span style={{ background:color, color:"white", borderRadius:12, padding:"2px 10px",
          fontSize:12, fontWeight:700 }}>{value}</span>
        <span style={{ color:"var(--text-secondary)", fontSize:11 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding:"12px 16px", borderTop:`1px solid ${color}20` }}>
          {items.length === 0
            ? <div style={{ fontSize:12, color:"var(--text-secondary)", fontStyle:"italic" }}>暂无明细</div>
            : items.map((it, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12,
                padding:"4px 0", borderBottom: i < items.length-1 ? "1px solid var(--border)" : "none" }}>
                <span style={{ fontFamily:"monospace", color:"var(--color-primary)" }}>{it.key}</span>
                <span style={{ fontWeight:600, color }}>{it.val}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

interface DayLog { record_date?: string; created_at?: string; egg_count?: number; mortality?: number; }
interface Batch   { expire_date?: string; qty_available?: number; sku_code?: string; }
interface Order   { created_at?: string; status?: string; total_amount?: number; customer_name?: string; }
interface Inbound { created_at?: string; qty?: number; }
interface Outbound{ created_at?: string; qty?: number; }

const QUICK = [
  { path:"/analytics/production",   label:"生产报表",   icon:<BarChart2 size={20}/>,     color:"#3b82f6" },
  { path:"/analytics/inventory",    label:"库存周转",   icon:<Package size={20}/>,       color:"#10b981" },
  { path:"/analytics/price-review", label:"价格复盘",   icon:<TrendingUp size={20}/>,    color:"#f59e0b" },
  { path:"/analytics/feed",         label:"饲料用量",   icon:<Activity size={20}/>,      color:"#8b5cf6" },
];

export default function AnalyticsDashboard() {
  const router = useRouter();
  const [dailyLogs, setDailyLogs] = useState<DayLog[]>([]);
  const [batches,   setBatches]   = useState<Batch[]>([]);
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [inbounds,  setInbounds]  = useState<Inbound[]>([]);
  const [outbounds, setOutbounds] = useState<Outbound[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dlRes, btRes, orRes, ibRes, obRes] = await Promise.all([
        fetch("/api/crud/brd_daily_logs?limit=60").then(r=>r.json()).catch(()=>({data:[]})),
        fetch("/api/crud/inv_batches?limit=500").then(r=>r.json()).catch(()=>({data:[]})),
        fetch("/api/crud/ord_orders?limit=200").then(r=>r.json()).catch(()=>({data:[]})),
        fetch("/api/crud/wms_inbound?limit=200").then(r=>r.json()).catch(()=>({data:[]})),
        fetch("/api/crud/wms_outbound?limit=200").then(r=>r.json()).catch(()=>({data:[]})),
      ]);
      setDailyLogs(dlRes.data || []);
      setBatches(btRes.data || []);
      setOrders(orRes.data || []);
      setInbounds(ibRes.data || []);
      setOutbounds(obRes.data || []);
      setLastRefresh(new Date().toLocaleTimeString("zh-CN", { hour:"2-digit", minute:"2-digit" }));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today  = new Date().toISOString().slice(0, 10);
  const in14   = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const totalEggs30  = dailyLogs.reduce((s, l) => s + (Number(l.egg_count)||0), 0);
  const totalDeath30 = dailyLogs.reduce((s, l) => s + (Number(l.mortality)||0), 0);
  const totalStock   = batches.filter(b => b.qty_available && Number(b.qty_available)>0).length;
  const expiryBatches= batches.filter(b => b.expire_date && b.expire_date <= in14 && b.expire_date >= today);
  const pendingOrders= orders.filter(o => o.status === "pending").length;
  const todayInQty   = inbounds.filter(i => (i.created_at||"").slice(0,10)===today).reduce((s,i)=>s+(Number(i.qty)||0),0);
  const todayOutQty  = outbounds.filter(o => (o.created_at||"").slice(0,10)===today).reduce((s,o)=>s+(Number(o.qty)||0),0);

  // 生产趋势 — 按日聚合 egg_count（最近7天）
  const productionTrend = (() => {
    const map: Record<string,number> = {};
    dailyLogs.forEach(l => { const d = (l.record_date || l.created_at || "").slice(0,10); if(d) map[d]=(map[d]||0)+(Number(l.egg_count)||0); });
    return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0])).slice(-7).map(([d,v])=>({ date:d, value:v }));
  })();

  // 出库趋势 — 按日聚合 qty（最近7天）
  const outboundTrend = (() => {
    const map: Record<string,number> = {};
    outbounds.forEach(o => { const d = (o.created_at||"").slice(0,10); if(d) map[d]=(map[d]||0)+(Number(o.qty)||0); });
    return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0])).slice(-7).map(([d,v])=>({ date:d, value:v }));
  })();

  const kpis = [
    { label:"近30天集蛋", value:loading?"…":totalEggs30.toLocaleString(), unit:"枚", accent:"#f59e0b", icon:<Egg size={18}/> },
    { label:"今日入库",   value:loading?"…":String(todayInQty||inbounds.filter(i=>(i.created_at||"").slice(0,10)===today).length), unit:"枚/单", accent:"#10b981", icon:<PackageCheck size={18}/> },
    { label:"今日出库",   value:loading?"…":String(todayOutQty||outbounds.filter(o=>(o.created_at||"").slice(0,10)===today).length), unit:"枚/单", accent:"#ef4444", icon:<PackageMinus size={18}/> },
    { label:"库存批次",   value:loading?"…":String(totalStock), unit:"批", accent:"var(--color-primary)", icon:<Package size={18}/> },
    { label:"待审批订单", value:loading?"…":String(pendingOrders), unit:"单", accent:"#8b5cf6", icon:<ShoppingCart size={18}/> },
    { label:"临期批次",   value:loading?"…":String(expiryBatches.length), unit:"批", accent:"#dc2626", icon:<AlertTriangle size={18}/> },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="BI 经营驾驶舱"
        subtitle={`五大数据域实时监控${lastRefresh ? ` · 更新于 ${lastRefresh}` : ""}`}
        breadcrumb={["数据分析", "经营驾驶舱"]}
        actions={
          <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
            style={{ display:"flex", alignItems:"center", gap:6 }}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }}/> 刷新
          </button>
        }
      />

      {/* KPI 卡片行 */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:12, marginBottom:24 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background:"var(--bg-card)", border:"1px solid var(--border)",
            borderLeft:`4px solid ${k.accent}`, borderRadius:"var(--radius-lg)", padding:"16px 18px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
              <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.6px",
                color:k.accent, display:"flex", alignItems:"center", gap:5 }}>{k.icon}{k.label}</p>
            </div>
            <div style={{ fontSize:26, fontWeight:800, color:k.accent, lineHeight:1 }}>
              {String(k.value)}
              <span style={{ fontSize:12, fontWeight:500, marginLeft:3, color:"var(--text-secondary)" }}>{k.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 趋势图区 + 告警区 */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 280px", gap:20, marginBottom:24 }}>
        {/* 生产趋势 */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:18 }}>
          <h4 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📦 近7日集蛋趋势</h4>
          <BarChart data={productionTrend} valueKey="value" labelKey="date" color="#f59e0b"/>
        </div>

        {/* 出库趋势 */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:18 }}>
          <h4 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>🚚 近7日出库趋势</h4>
          <BarChart data={outboundTrend} valueKey="value" labelKey="date" color="#ef4444"/>
        </div>

        {/* 预警中心 */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:18 }}>
          <h4 style={{ fontSize:13, fontWeight:700, marginBottom:14, display:"flex", alignItems:"center", gap:6 }}>
            <AlertTriangle size={14} color="#f59e0b"/> 预警中心
          </h4>
          <AlertItem icon={<AlertTriangle size={14}/>} label="临期批次"
            value={expiryBatches.length} color="#ef4444"
            items={expiryBatches.slice(0,5).map(b=>({ key:b.sku_code||"—", val:`${b.qty_available}枚 到期${b.expire_date?.slice(5)}` }))}
          />
          <AlertItem icon={<ShoppingCart size={14}/>} label="待审批订单"
            value={pendingOrders} color="#f59e0b"
            items={orders.filter(o=>o.status==="pending").slice(0,5).map(o=>({ key:o.customer_name||"—", val:`¥${Number(o.total_amount||0).toLocaleString()}` }))}
          />
          <AlertItem icon={<TrendingDown size={14}/>} label="近30天死淘"
            value={totalDeath30} color="#8b5cf6"
            items={[{ key:"累计死淘", val:`${totalDeath30} 羽` }]}
          />
        </div>
      </div>

      {/* 子模块快捷入口 */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
        {QUICK.map(q => (
          <button key={q.path} type="button" onClick={() => router.push(q.path)}
            style={{ background:"var(--bg-card)", border:"1px solid var(--border)",
              borderRadius:"var(--radius-lg)", padding:"18px 14px",
              display:"flex", flexDirection:"column", alignItems:"center", gap:8,
              cursor:"pointer", fontWeight:600, fontSize:13, transition:"border-color 0.15s,box-shadow 0.15s",
              color:q.color }}
            onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.borderColor=q.color; (e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-md)"; }}
            onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.borderColor="var(--border)"; (e.currentTarget as HTMLElement).style.boxShadow="none"; }}>
            <div style={{ color:q.color, background:`color-mix(in srgb,${q.color} 12%,transparent)`,
              borderRadius:"var(--radius-md)", padding:10 }}>{q.icon}</div>
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
