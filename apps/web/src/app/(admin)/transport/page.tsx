"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Truck, MapPin, CheckCircle, AlertTriangle, RefreshCw, Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { LegacyFreezeBanner } from "@/components/LegacyFreezeBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { crudApi } from "@/lib/api-client";
import s from "@/components/ui/admin-ui.module.css";

interface Dispatch { id:number; wave_no?:string; vehicle_no?:string; driver_id?:string; plan_date?:string; status?:string; stores?:string; created_at?:string; }

export default function TransportPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);

  // STATUS_MAP and QUICK moved inside component to use t()
  // 与 wave/page.tsx、order/loading/page.tsx 保持一致的规范枚举
  const STATUS_MAP: Record<string,{label:string;cls:string}> = {
    PENDING:    { label: t("status.pending",      "待出发"), cls: s.badgeWarning  },
    LOADING:    { label: t("ui.装车中",           "装车中"), cls: s.badgeInfo     },
    DISPATCHED: { label: t("ui.已发运",           "已发运"), cls: s.badgeInfo     },
    ARRIVED:    { label: t("ui.已到达",           "已到达"), cls: s.badgeSuccess  },
    CLOSED:     { label: t("ui.已关闭",           "已关闭"), cls: s.badgeNeutral  },
    CANCELLED:  { label: t("status.cancelled",    "已取消"), cls: s.badgeNeutral  },
  };

  const QUICK = [
    { path:"/order/loading",     icon:"🚚", label: t("ui.装车清单",   "装车清单"),   color:"#3b82f6" },
    { path:"/transport/wave",    icon:"🌊", label: t("ui.配送波次",   "配送波次"),   color:"#10b981" },
    { path:"/transport/tracking",icon:"📍", label: t("ui.实时追踪",   "实时追踪"),   color:"#f59e0b" },
    { path:"/transport/receipt", icon:"📝", label: t("ui.门店签收",   "门店签收"),   color:"#8b5cf6" },
    { path:"/transport/exceptions",icon:"⚠️",label: t("ui.异常处理", "异常处理"),   color:"#ef4444" },
    { path:"/transport/drivers", icon:"👤", label: t("ui.司机管理",   "司机管理"),   color:"#06b6d4" },
  ];

  const load = () => {
    setLoading(true);
    crudApi.list<Dispatch>("log_dispatch", { limit: 100 })
      .then(res => setDispatches(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(()=>{ load(); },[]);

  const today = new Date().toISOString().slice(0,10);
  const todayDispatches = useMemo(()=>dispatches.filter(d=>(d.plan_date||d.created_at||"").slice(0,10)===today),[dispatches,today]);

  const delivering = dispatches.filter(d => d.status === "DISPATCHED" || d.status === "LOADING").length;
  const done       = dispatches.filter(d => d.status === "ARRIVED" || d.status === "CLOSED").length;
  const exceptions = dispatches.filter(d => d.status === "CANCELLED").length;

  const kpis = [
    { label: t("ui.今日波次", "今日波次"), value:loading?"…":String(todayDispatches.length), unit: t("ui.趟", "趟"), accent:"#3b82f6", icon:<Truck size={18}/> },
    { label: t("ui.配送中",   "配送中"),   value:loading?"…":String(delivering),             unit: t("ui.单", "单"), accent:"#10b981", icon:<MapPin size={18}/> },
    { label: t("ui.今日完成", "今日完成"), value:loading?"…":String(done),                   unit: t("ui.单", "单"), accent:"#06b6d4", icon:<CheckCircle size={18}/> },
    { label: t("ui.配送异常", "配送异常"), value:loading?"…":String(exceptions),             unit: t("ui.件", "件"), accent:"#ef4444", icon:<AlertTriangle size={18}/> },
  ];

  const recent = useMemo(()=>[...dispatches].sort((a,b)=>(b.plan_date||b.created_at||"").localeCompare(a.plan_date||a.created_at||"")).slice(0,8),[dispatches]);

  return (
    <div className="animate-fade-in">
      {/* [LEGACY FREEZE] Sales V2 Phase 0 — 此页面已冻结，迁移至 sal_delivery_orders (Phase 4) */}
      <LegacyFreezeBanner newPath="/sales2/delivery" newModuleName="Sales V2 配送管理" migrationPhase="Phase 4" />
      <PageHeader
        title={t("ui.物流配送", "物流配送")}
        subtitle={t("ui.配送波次实时追踪门店签收", "配送波次·实时追踪·门店签收")}
        breadcrumb={[t("ui.物流配送", "物流配送")]}
        actions={
          <div style={{ display:"flex", gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
              style={{ display:"flex", alignItems:"center", gap:6 }}>
              <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> {t("common.refresh", "刷新")}
            </button>
            <button type="button" className={s.btnPrimary} onClick={()=>router.push("/order/loading")}
              style={{ display:"flex", alignItems:"center", gap:6 }}>
              <Plus size={14}/> {t("ui.新建波次", "新建波次")}
            </button>
          </div>
        }/>

      {/* KPI */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:12, marginBottom:24 }}>
        {kpis.map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)", border:"1px solid var(--border)",
            borderLeft:`4px solid ${k.accent}`, borderRadius:"var(--radius-lg)", padding:"16px 18px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:8, color:k.accent, fontSize:12, fontWeight:700, textTransform:"uppercase" }}>
              {k.icon}{k.label}
            </div>
            <div style={{ fontSize:26, fontWeight:800, color:k.accent }}>
              {String(k.value)}<span style={{ fontSize:12, marginLeft:3, color:"var(--text-secondary)" }}>{k.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
        {/* 快捷入口 */}
        <div>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, color:"var(--color-primary)" }}>{t("ui.物流功能入口", "物流功能入口")}</h3>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {QUICK.map(q=>(
              <button key={q.path} type="button" onClick={()=>router.push(q.path)}
                style={{ background:"var(--bg-card)", borderRadius:"var(--radius-lg)",
                  border:`1px solid ${q.color}25`, borderTop:`3px solid ${q.color}`,
                  padding:14, cursor:"pointer", textAlign:"center" }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-md)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.boxShadow="none";}}>
                <div style={{ fontSize:22, marginBottom:6 }}>{q.icon}</div>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)" }}>{q.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 近期派送单 */}
        <div>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, color:"var(--color-primary)" }}>{t("ui.近期派送单", "近期派送单")}</h3>
          <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", overflow:"hidden" }}>
            {recent.length===0&&!loading&&<div className={s.emptyState}>{t("common.no_data", "暂无派送记录")}</div>}
            {recent.map((d,i)=>{
              const st = STATUS_MAP[d.status||""] || {label:d.status||"—",cls:s.badgeNeutral};
              return (
                <div key={d.id} style={{ padding:"10px 14px", borderBottom:i<recent.length-1?"1px solid var(--border)":"none",
                  display:"flex", alignItems:"center", gap:10 }}>
                  <Truck size={14} color="var(--text-secondary)"/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, fontFamily:"monospace" }}>{d.wave_no||`#${d.id}`}</div>
                    <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{d.vehicle_no||"—"} · {(d.plan_date||d.created_at||"—").slice(0,10)}</div>
                  </div>
                  <span className={`${s.badge} ${st.cls}`}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
