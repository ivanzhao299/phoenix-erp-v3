"use client";
import { useState, useMemo } from "react";
import { Search, CheckCircle, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

// V3 三单对账：prc_purchase_orders vs wms_inbound

interface PORow {
  id:number; po_no:string; supplier_code?:string; supplier_name?:string;
  plan_qty?:number; received_qty?:number; total_amount?:number;
  currency_code?:string; status?:string; expected_date?:string; created_at?:string;
}

export default function ReconcilePage() {
  const toast = useToast();
  const { t } = useLanguage();

  const RECON_STATUS = {
    OK:             { label:t("ui.平衡","平衡"),     color:"#16a34a", bg:"#dcfce7", icon:<CheckCircle size={14}/> },
    OVER_RECEIVED:  { label:t("ui.超量收货","超量收货"), color:"#f59e0b", bg:"#fef3c7", icon:<TrendingUp size={14}/> },
    UNDER_RECEIVED: { label:t("ui.少量收货","少量收货"), color:"#ef4444", bg:"#fee2e2", icon:<TrendingDown size={14}/> },
    NO_INBOUND:     { label:t("ui.无入库单","无入库单"), color:"#6b7280", bg:"#f3f4f6", icon:<AlertTriangle size={14}/> },
  };

  const [startDate, setStartDate] = useState(()=>new Date(Date.now()-30*864e5).toISOString().slice(0,10));
  const [endDate,   setEndDate]   = useState(()=>new Date().toISOString().slice(0,10));
  const [supplier,  setSupplier]  = useState("");
  const [orders,    setOrders]    = useState<PORow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [queried,   setQueried]   = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token")||localStorage.getItem("phoenix_token")||"") : "";

  const query = async () => {
    setLoading(true); setQueried(false);
    try {
      const url = `/api/crud/prc_purchase_orders?limit=200`;
      const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      let data: PORow[] = d.data||[];
      data = data.filter(o=>{
        const dt = (o.created_at||"").slice(0,10);
        return dt>=startDate && dt<=endDate;
      });
      if (supplier) data = data.filter(o=>(o.supplier_name||o.supplier_code||"").includes(supplier));
      setOrders(data);
      setQueried(true);
    } catch { toast.error(t("ui.查询失败","查询失败")); } finally { setLoading(false); }
  };

  const getReconStatus = (row: PORow) => {
    const plan = Number(row.plan_qty||0);
    const recv = Number(row.received_qty||0);
    if (recv===0) return "NO_INBOUND";
    if (Math.abs(recv-plan)<0.001) return "OK";
    if (recv>plan) return "OVER_RECEIVED";
    return "UNDER_RECEIVED";
  };

  const summary = useMemo(()=>{
    const ok=orders.filter(o=>getReconStatus(o)==="OK").length;
    const over=orders.filter(o=>getReconStatus(o)==="OVER_RECEIVED").length;
    const under=orders.filter(o=>getReconStatus(o)==="UNDER_RECEIVED").length;
    const none=orders.filter(o=>getReconStatus(o)==="NO_INBOUND").length;
    const totalPlan=orders.reduce((s,o)=>s+(Number(o.plan_qty)||0),0);
    const totalRecv=orders.reduce((s,o)=>s+(Number(o.received_qty)||0),0);
    return { ok,over,under,none,totalPlan,totalRecv,diff:totalRecv-totalPlan };
  },[orders]);

  const inp = { padding:"8px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",color:"var(--text-primary)",fontSize:13,outline:"none",boxSizing:"border-box" } as React.CSSProperties;

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("ui.三单对账","三单对账")} subtitle={t("ui.三单对账副标题","采购订单 · 入库单 · 财务凭证 — 差异核验")} breadcrumb={[t("ui.采购管理","采购管理"),t("ui.三单对账","三单对账")]}/>

      {/* 查询条件 */}
      <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",padding:20,marginBottom:20,display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end" }}>
        <div>
          <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.开始日期","开始日期")}</label>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={{ ...inp }}/>
        </div>
        <div>
          <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.结束日期","结束日期")}</label>
          <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={{ ...inp }}/>
        </div>
        <div>
          <label style={{ fontSize:12,color:"var(--text-secondary)",display:"block",marginBottom:4 }}>{t("ui.供应商可选","供应商（可选）")}</label>
          <input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder={t("ui.供应商名称或编码","供应商名称或编码")} style={{ ...inp,width:180 }}/>
        </div>
        <button type="button" className={s.btnPrimary} onClick={query} disabled={loading}
          style={{ display:"flex",alignItems:"center",gap:6,alignSelf:"flex-end" }}>
          <Search size={14}/> {loading?t("ui.查询中","查询中…"):t("ui.开始对账","开始对账")}
        </button>
      </div>

      {/* 对账汇总 */}
      {queried&&(
        <>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:16 }}>
            {[
              { label:t("ui.数量平衡","数量平衡"),   value:summary.ok,        accent:"#16a34a" },
              { label:t("ui.超量收货","超量收货"),   value:summary.over,       accent:"#f59e0b" },
              { label:t("ui.少量收货","少量收货"),   value:summary.under,      accent:"#ef4444" },
              { label:t("ui.无入库单","无入库单"),   value:summary.none,       accent:"#6b7280" },
              { label:t("ui.计划总量","计划总量"),   value:String(summary.totalPlan), accent:"#3b82f6" },
              { label:t("ui.实收总量","实收总量"),   value:String(summary.totalRecv), accent:"var(--color-primary)" },
              { label:t("ui.差异量","差异量"),     value:`${summary.diff>0?"+":""}${summary.diff}`, accent:summary.diff===0?"#16a34a":summary.diff>0?"#f59e0b":"#ef4444" },
            ].map(k=>(
              <div key={k.label} style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderLeft:`3px solid ${k.accent}`,borderRadius:"var(--radius-md)",padding:"10px 14px" }}>
                <div style={{ fontSize:10,color:k.accent,fontWeight:700,marginBottom:2 }}>{k.label}</div>
                <div style={{ fontSize:18,fontWeight:800,color:k.accent }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* 明细对账表 */}
          <div style={{ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",overflow:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
              <thead>
                <tr style={{ background:"var(--bg-page)",borderBottom:"1px solid var(--border)" }}>
                  {[t("ui.采购单号","采购单号"),t("ui.供应商","供应商"),t("ui.计划数量","计划数量"),t("ui.实收数量","实收数量"),t("ui.差异","差异"),t("common.amount","金额"),t("ui.到期日","到期日"),t("ui.对账结果","对账结果")].map(h=>(
                    <th key={h} style={{ padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-secondary)",whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.length===0&&<tr><td colSpan={8} style={{ padding:28,textAlign:"center",color:"var(--text-secondary)" }}>{t("ui.该期间无采购记录","该期间无采购记录")}</td></tr>}
                {orders.map((row,i)=>{
                  const rs = getReconStatus(row);
                  const info = RECON_STATUS[rs as keyof typeof RECON_STATUS];
                  const plan = Number(row.plan_qty||0);
                  const recv = Number(row.received_qty||0);
                  const diff = recv - plan;
                  return (
                    <tr key={row.id} style={{ borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg-card)":"var(--bg-page)" }}>
                      <td style={{ padding:"9px 12px",fontFamily:"monospace",fontSize:11,fontWeight:700 }}>{row.po_no}</td>
                      <td style={{ padding:"9px 12px" }}>{row.supplier_name||row.supplier_code||"—"}</td>
                      <td style={{ padding:"9px 12px" }}>{plan}</td>
                      <td style={{ padding:"9px 12px" }}>{recv}</td>
                      <td style={{ padding:"9px 12px",fontWeight:700,color:diff===0?"#16a34a":diff>0?"#f59e0b":"#ef4444" }}>
                        {diff===0?"—":`${diff>0?"+":""}${diff}`}
                      </td>
                      <td style={{ padding:"9px 12px",color:"var(--color-primary)",fontWeight:600 }}>
                        {row.currency_code||"LAK"} {Number(row.total_amount||0).toLocaleString()}
                      </td>
                      <td style={{ padding:"9px 12px",fontSize:11 }}>{row.expected_date?.slice(0,10)||"—"}</td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ display:"inline-flex",alignItems:"center",gap:4,fontSize:12,fontWeight:700,color:info.color,background:info.bg,borderRadius:6,padding:"3px 8px" }}>
                          {info.icon}{info.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!queried&&!loading&&(
        <div className={s.emptyState}>
          <div style={{ fontSize:40,marginBottom:12 }}>⚖️</div>
          <div style={{ fontWeight:700,fontSize:15,marginBottom:6 }}>{t("ui.设置查询条件后开始对账","设置查询条件后开始对账")}</div>
          <div style={{ fontSize:13,color:"var(--text-secondary)" }}>{t("ui.对账说明","将对比采购订单计划数量与实际入库数量，找出差异项")}</div>
        </div>
      )}
    </div>
  );
}
