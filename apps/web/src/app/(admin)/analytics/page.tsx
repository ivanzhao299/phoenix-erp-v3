"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart2, TrendingUp, TrendingDown, Package, PackageCheck, PackageMinus,
  ShoppingCart, AlertTriangle, RefreshCw, Activity, Egg
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

// ── 纯 CSS 柱状图 ────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, color = "var(--color-primary)", height = 160, noDataLabel }: {
  data: { [key: string]: unknown }[]; valueKey: string; labelKey: string; color?: string; height?: number; noDataLabel?: string;
}) {
  if (!data.length) return (
    <div style={{ height, display:"flex", alignItems:"center", justifyContent:"center",
      color:"var(--text-secondary)", fontSize:13 }}>{noDataLabel ?? "暂无数据"}</div>
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
function AlertItem({ icon, label, value, color, items = [], noDetailLabel }: {
  icon: React.ReactNode; label: string; value: number; color: string; items?: { key: string; val: string }[]; noDetailLabel?: string;
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
            ? <div style={{ fontSize:12, color:"var(--text-secondary)", fontStyle:"italic" }}>{noDetailLabel ?? "暂无明细"}</div>
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

interface DashboardKpis {
  eggs_30d: number; today_inbound_qty: number; today_outbound_qty: number;
  stock_batches: number; pending_orders: number; expiry_batches: number;
}
interface TrendPoint { date: string; value: number; }
interface ExpiryBatch { sku_code?: string; qty_available?: number; expire_date?: string; }
interface PendingOrder { customer_name?: string; total_amount?: number; }
interface DashboardData {
  kpis: DashboardKpis;
  production_trend: TrendPoint[];
  outbound_trend: TrendPoint[];
  alerts: { expiry_batches: ExpiryBatch[]; pending_orders: PendingOrder[]; mortality_30d: number; };
}

const EMPTY_DASHBOARD: DashboardData = {
  kpis: { eggs_30d:0, today_inbound_qty:0, today_outbound_qty:0, stock_batches:0, pending_orders:0, expiry_batches:0 },
  production_trend: [], outbound_trend: [],
  alerts: { expiry_batches:[], pending_orders:[], mortality_30d:0 },
};

export default function AnalyticsDashboard() {
  const router = useRouter();
  const { t } = useLanguage();
  const [dash,    setDash]    = useState<DashboardData>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const QUICK = [
    { path:"/analytics/production",   label:t("ui.生产报表","生产报表"),   icon:<BarChart2 size={20}/>,     color:"#3b82f6" },
    { path:"/analytics/inventory",    label:t("ui.库存周转","库存周转"),   icon:<Package size={20}/>,       color:"#10b981" },
    { path:"/analytics/price-review", label:t("ui.价格复盘","价格复盘"),   icon:<TrendingUp size={20}/>,    color:"#f59e0b" },
    { path:"/analytics/feed",         label:t("ui.饲料用量","饲料用量"),   icon:<Activity size={20}/>,      color:"#8b5cf6" },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tok = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch("/api/analytics/dashboard", {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      const json = await res.json().catch(() => ({}));
      if (json?.data) setDash(json.data as DashboardData);
      setLastRefresh(new Date().toLocaleTimeString("zh-CN", { hour:"2-digit", minute:"2-digit" }));
    } catch { /* 网络异常保持空数据 */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { kpis: k, production_trend, outbound_trend, alerts } = dash;

  const kpis = [
    { label:t("ui.近30天集蛋","近30天集蛋"), value:loading?"…":Number(k.eggs_30d).toLocaleString(),           unit:t("ui.枚","枚"),   accent:"#f59e0b", icon:<Egg size={18}/> },
    { label:t("ui.今日入库","今日入库"),   value:loading?"…":String(k.today_inbound_qty),                    unit:t("ui.枚","枚"),   accent:"#10b981", icon:<PackageCheck size={18}/> },
    { label:t("ui.今日出库","今日出库"),   value:loading?"…":String(k.today_outbound_qty),                   unit:t("ui.枚","枚"),   accent:"#ef4444", icon:<PackageMinus size={18}/> },
    { label:t("ui.库存批次","库存批次"),   value:loading?"…":String(k.stock_batches),                        unit:t("ui.批","批"),   accent:"var(--color-primary)", icon:<Package size={18}/> },
    { label:t("ui.待审批订单","待审批订单"), value:loading?"…":String(k.pending_orders),                       unit:t("ui.单","单"),   accent:"#8b5cf6", icon:<ShoppingCart size={18}/> },
    { label:t("ui.临期批次","临期批次"),   value:loading?"…":String(k.expiry_batches),                       unit:t("ui.批","批"),   accent:"#dc2626", icon:<AlertTriangle size={18}/> },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("ui.BI经营驾驶舱","BI 经营驾驶舱")}
        subtitle={`${t("ui.五大数据域实时监控","五大数据域实时监控")}${lastRefresh ? ` · ${t("ui.更新于","更新于")} ${lastRefresh}` : ""}`}
        breadcrumb={[t("ui.数据分析","数据分析"), t("ui.经营驾驶舱","经营驾驶舱")]}
        actions={
          <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
            style={{ display:"flex", alignItems:"center", gap:6 }}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }}/> {t("common.refresh","刷新")}
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
          <h4 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📦 {t("ui.近7日集蛋趋势","近7日集蛋趋势")}</h4>
          <BarChart data={production_trend as unknown as { [key: string]: unknown }[]} valueKey="value" labelKey="date" color="#f59e0b" noDataLabel={t("ui.暂无数据","暂无数据")}/>
        </div>

        {/* 出库趋势 */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:18 }}>
          <h4 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>🚚 {t("ui.近7日出库趋势","近7日出库趋势")}</h4>
          <BarChart data={outbound_trend as unknown as { [key: string]: unknown }[]} valueKey="value" labelKey="date" color="#ef4444" noDataLabel={t("ui.暂无数据","暂无数据")}/>
        </div>

        {/* 预警中心 */}
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:18 }}>
          <h4 style={{ fontSize:13, fontWeight:700, marginBottom:14, display:"flex", alignItems:"center", gap:6 }}>
            <AlertTriangle size={14} color="#f59e0b"/> {t("ui.预警中心","预警中心")}
          </h4>
          <AlertItem icon={<AlertTriangle size={14}/>} label={t("ui.临期批次","临期批次")}
            value={k.expiry_batches} color="#ef4444"
            noDetailLabel={t("ui.暂无明细","暂无明细")}
            items={alerts.expiry_batches.slice(0,5).map(b=>({ key:b.sku_code||"—", val:`${b.qty_available}${t("ui.枚","枚")} ${t("ui.到期","到期")}${b.expire_date?.slice(5)}` }))}
          />
          <AlertItem icon={<ShoppingCart size={14}/>} label={t("ui.待审批订单","待审批订单")}
            value={k.pending_orders} color="#f59e0b"
            noDetailLabel={t("ui.暂无明细","暂无明细")}
            items={alerts.pending_orders.slice(0,5).map(o=>({ key:o.customer_name||"—", val:`¥${Number(o.total_amount||0).toLocaleString()}` }))}
          />
          <AlertItem icon={<TrendingDown size={14}/>} label={t("ui.近30天死淘","近30天死淘")}
            value={alerts.mortality_30d} color="#8b5cf6"
            noDetailLabel={t("ui.暂无明细","暂无明细")}
            items={[{ key:t("ui.累计死淘","累计死淘"), val:`${alerts.mortality_30d} ${t("ui.羽","羽")}` }]}
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
