"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Truck, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

const STATUS_CLS: Record<string,string> = {
  DRAFT:"badgeNeutral", PENDING:"badgeWarning", CONFIRMED:"badgeInfo",
  APPROVED:"badgeInfo", ARRIVING:"badgeInfo", RECEIVED:"badgeSuccess",
  CANCELLED:"badgeDanger",
};

interface PO { id:number; po_no?:string; supplier_code?:string; supplier_name?:string; total_amount?:number; currency_code?:string; status?:string; expected_date?:string; created_at?:string; }

export default function ProcurementPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [orders, setOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);

  // QUICK and STATUS_LABEL moved inside component to use t()
  const QUICK = [
    { path:"/procurement/requests",  icon:"📝", label: t("ui.采购申请",   "采购申请"),   desc: t("ui.提交新的采购需求待审批", "提交新的采购需求，待审批"), color:"#3b82f6" },
    { path:"/procurement/order",     icon:"📦", label: t("ui.采购订单",   "采购订单"),   desc: t("ui.查看和管理全部采购订单", "查看和管理全部采购订单"),   color:"#8b5cf6" },
    { path:"/procurement/arrival",   icon:"🚛", label: t("ui.到货收货",   "到货收货"),   desc: t("ui.核实入库确认三单一致",   "核实入库，确认三单一致"),   color:"#10b981" },
    { path:"/procurement/suppliers", icon:"🏢", label: t("ui.供应商管理", "供应商管理"), desc: t("ui.供应商档案与评级维护",   "供应商档案与评级维护"),     color:"#f59e0b" },
    { path:"/procurement/payments",  icon:"💳", label: t("ui.付款管理",   "付款管理"),   desc: t("ui.应付账款与付款记录",     "应付账款与付款记录"),       color:"#ef4444" },
    { path:"/procurement/reconcile", icon:"⚖️",  label: t("ui.三单对账",   "三单对账"),   desc: t("ui.采购单入库单发票比对",   "采购单·入库单·发票比对"),   color:"#14b8a6" },
  ];

  const STATUS_LABEL: Record<string,string> = {
    DRAFT:     t("status.draft",     "草稿"),
    PENDING:   t("status.pending",   "待审批"),
    CONFIRMED: t("ui.已确认",        "已确认"),
    APPROVED:  t("status.approved",  "已批准"),
    ARRIVING:  t("status.in_transit","在途"),
    RECEIVED:  t("status.received",  "已收货"),
    CANCELLED: t("status.cancelled", "已取消"),
  };

  const load = () => {
    setLoading(true);
    fetch("/api/crud/prc_purchase_orders?limit=200")
      .then(r=>r.json()).then(d=>setOrders(d.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  const thisMonth = new Date().toISOString().slice(0,7);

  const monthOrders  = useMemo(()=>orders.filter(o=>(o.created_at||"").startsWith(thisMonth)),[orders,thisMonth]);
  const pendingAppr  = orders.filter(o=>["DRAFT","PENDING"].includes(o.status?.toUpperCase()||"")).length;
  const inTransit    = orders.filter(o=>["CONFIRMED","APPROVED","ARRIVING"].includes(o.status?.toUpperCase()||"")).length;
  const monthlyAmt   = monthOrders.reduce((s,o)=>s+(Number(o.total_amount)||0),0);
  const receivedCnt  = orders.filter(o=>o.status?.toUpperCase()==="RECEIVED").length;

  const recentOrders = useMemo(()=>
    [...orders].sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).slice(0,5)
  ,[orders]);

  const kpis = [
    { label: t("ui.本月采购额",   "本月采购额"),   value:`¥${monthlyAmt.toLocaleString()}`, accent:"var(--color-primary)", icon:<ShoppingBag size={18}/> },
    { label: t("ui.在途订单",     "在途订单"),     value:String(inTransit), unit: t("ui.单", "单"),       accent:"#3b82f6",             icon:<Truck size={18}/> },
    { label: t("ui.已收货",       "已收货"),       value:String(receivedCnt), unit: t("ui.单", "单"),     accent:"#10b981",             icon:<CheckCircle size={18}/> },
    { label: t("ui.待审批申请",   "待审批申请"),   value:String(pendingAppr), unit: t("ui.笔", "笔"),     accent:"#f59e0b",             icon:<AlertTriangle size={18}/> },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("ui.采购管理", "采购管理")} subtitle={t("ui.供应商采购订单到货收货三单对账", "供应商·采购订单·到货收货·三单对账")} breadcrumb={[t("ui.采购管理", "采购管理")]}
        actions={<button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ display:"flex",alignItems:"center",gap:6 }}>
          <RefreshCw size={14} style={{ animation:loading?"spin 1s linear infinite":"none" }}/> {t("common.refresh", "刷新")}
        </button>}/>

      {/* KPI */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginBottom:24 }}>
        {kpis.map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`4px solid ${k.accent}`,borderRadius:"var(--radius-lg)",padding:"14px 18px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8,color:k.accent,fontSize:11,fontWeight:700,textTransform:"uppercase" }}>{k.icon}{k.label}</div>
            <div style={{ fontSize:22,fontWeight:800,color:k.accent }}>
              {String(k.value)}{k.unit&&<span style={{ fontSize:12,marginLeft:3,color:"var(--text-secondary)" }}>{k.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 300px",gap:20 }}>
        {/* 功能入口 */}
        <div>
          <h3 style={{ fontSize:14,fontWeight:700,marginBottom:12,color:"var(--color-primary)" }}>{t("ui.采购功能入口", "采购功能入口")}</h3>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10 }}>
            {QUICK.map(q=>(
              <button key={q.path} type="button" onClick={()=>router.push(q.path)}
                style={{ background:"var(--bg-card)",borderRadius:"var(--radius-lg)",border:`1px solid ${q.color}25`,borderTop:`3px solid ${q.color}`,padding:14,cursor:"pointer",textAlign:"left",transition:"box-shadow 0.15s" }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.boxShadow="var(--shadow-md)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.boxShadow="none";}}>
                <div style={{ fontSize:22,marginBottom:6 }}>{q.icon}</div>
                <div style={{ fontSize:13,fontWeight:700,color:"var(--text-primary)",marginBottom:2 }}>{q.label}</div>
                <div style={{ fontSize:11,color:"var(--text-secondary)" }}>{q.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 近期采购订单 */}
        <div>
          <h3 style={{ fontSize:14,fontWeight:700,marginBottom:12,color:"var(--color-primary)" }}>{t("ui.近期采购订单", "近期采购订单")}</h3>
          <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"hidden" }}>
            {recentOrders.length===0&&!loading&&<div className={s.emptyState}>{t("common.no_data", "暂无采购记录")}</div>}
            {loading&&<div style={{ padding:20,textAlign:"center",color:"var(--text-secondary)",fontSize:13 }}>{t("common.loading", "加载中…")}</div>}
            {recentOrders.map((o,i)=>{
              const st = o.status?.toUpperCase()||"DRAFT";
              return (
                <div key={o.id} style={{ padding:"10px 14px",borderBottom:i<recentOrders.length-1?"1px solid var(--border)":"none",display:"flex",alignItems:"center",gap:10 }}>
                  <ShoppingBag size={13} color="var(--text-secondary)"/>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:12,fontWeight:700,fontFamily:"monospace" }}>{o.po_no||`PO-${o.id}`}</div>
                    <div style={{ fontSize:11,color:"var(--text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                      {o.supplier_name||o.supplier_code||"—"} · ¥{Number(o.total_amount||0).toLocaleString()}
                    </div>
                  </div>
                  <span className={`${s.badge} ${s[STATUS_CLS[st]||'badgeNeutral']}`}>{STATUS_LABEL[st]||st}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
