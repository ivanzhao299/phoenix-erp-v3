"use client";
import { useState, useEffect, useCallback } from "react";

interface ShiftRow    { id: number | string; shift_code?: string; status: string; operator_name?: string; line_id?: string; }
interface BatchRow    { id: number | string; batch_code?: string; batch_status: string; received_qty?: number; house_code?: string; }
interface ExceptionRow{ id: number | string; status: string; exception_type?: string; issue_type?: string; description?: string; detail?: string; }
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import { Package, Monitor, AlertCircle, RefreshCw, CheckCircle, Clock, ChevronRight } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

const tok = () => typeof window !== "undefined" ? (sessionStorage.getItem("phoenix_token") || "") : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

export default function PackagingOverviewPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const today = new Date().toISOString().slice(0, 10);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sR, bR, eR] = await Promise.all([
        fetch("/api/packaging/terminal/shifts/today", { headers: hdr() }),
        fetch("/api/packaging/terminal/source-batches/today", { headers: hdr() }),
        fetch("/api/packaging/terminal/exceptions/today", { headers: hdr() }),
      ]);
      const [sJ, bJ, eJ] = await Promise.all([sR.json(), bR.json(), eR.json()]);
      setShifts(Array.isArray(sJ.data ?? sJ) ? (sJ.data ?? sJ) : []);
      setBatches(Array.isArray(bJ.data ?? bJ) ? (bJ.data ?? bJ) : []);
      setExceptions(Array.isArray(eJ.data ?? eJ) ? (eJ.data ?? eJ) : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openExceptions = exceptions.filter(e => !["CLOSED", "CANCELLED"].includes(e.status || ""));

  return (
    <div className={s.pageRoot}>
      <PageHeader
        title={t("ui.包装中心管理", "包装中心管理")}
        subtitle={`${today} · ${t("ui.今日作业概览", "今日作业概览")}`}
        actions={
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={load} className={s.btnSecondary}><RefreshCw size={14} /> {t("common.refresh", "刷新")}</button>
            <a href="/terminal/packaging/dashboard" target="_blank"
              style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 18px",
                borderRadius:8, background:"#f59e0b", color:"#0f172a",
                fontWeight:700, fontSize:14, textDecoration:"none" }}>
              <Monitor size={14} /> {t("ui.进入作业台", "进入作业台")}
            </a>
          </div>
        }
      />

      {/* 统计卡片 */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        {[
          { icon:<Clock size={20}/>, label: t("ui.今日班次", "今日班次"), value:shifts.length, color:"#3b82f6" },
          { icon:<Package size={20}/>, label: t("ui.来源批次", "来源批次"), value:batches.length, color:"#8b5cf6" },
          { icon:<CheckCircle size={20}/>, label: t("ui.已接收", "已接收"), value:batches.filter(b =>b.batch_status==="RECEIVED"||b.batch_status==="QC_PASSED").length, color:"#22c55e" },
          { icon:<AlertCircle size={20}/>, label: t("ui.未关闭异常", "未关闭异常"), value:openExceptions.length, color: openExceptions.length > 0 ? "#ef4444" : "#94a3b8" },
        ].map(item => (
          <div key={item.label} className={s.card} style={{ padding:"20px 24px", display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ width:44, height:44, borderRadius:10, background:`${item.color}15`,
              display:"flex", alignItems:"center", justifyContent:"center", color:item.color, flexShrink:0 }}>
              {item.icon}
            </div>
            <div>
              <div style={{ fontSize:26, fontWeight:800, color:"var(--text-primary,#0f172a)", lineHeight:1 }}>{item.value}</div>
              <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:4 }}>{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* 今日班次列表 */}
        <div className={s.card}>
          <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border,#e2e8f0)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontWeight:600, fontSize:15 }}>{t("ui.今日班次", "今日班次")}</span>
            <span style={{ fontSize:12, color:"#64748b" }}>{today}</span>
          </div>
          <div style={{ padding:"12px 20px" }}>
            {loading ? <div style={{ color:"#94a3b8", padding:"20px 0", textAlign:"center" }}>{t("common.loading", "加载中...")}</div>
              : shifts.length === 0 ? <div style={{ color:"#94a3b8", padding:"20px 0", textAlign:"center" }}>{t("ui.今日暂无班次", "今日暂无班次")}</div>
              : shifts.map(sh => (
                <div key={sh.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"10px 0", borderBottom:"1px solid var(--border,#f1f5f9)" }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{sh.shift_code || sh.id}</div>
                    <div style={{ fontSize:12, color:"#64748b" }}>{sh.operator_name || "—"} · {sh.line_id || "—"}</div>
                  </div>
                  <span style={{ fontSize:12, padding:"3px 10px", borderRadius:20,
                    background: sh.status === "CLOSED" ? "#f0fdf4" : "#fffbeb",
                    color: sh.status === "CLOSED" ? "#16a34a" : "#d97706",
                    fontWeight:600 }}>
                    {sh.status === "CLOSED" ? t("ui.已交班", "已交班") : t("ui.进行中", "进行中")}
                  </span>
                </div>
              ))
            }
          </div>
        </div>

        {/* 来源批次列表 */}
        <div className={s.card}>
          <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border,#e2e8f0)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontWeight:600, fontSize:15 }}>{t("ui.来源批次", "来源批次")}</span>
            <span style={{ fontSize:12, color:"#64748b" }}>{t("ui.接收状态", "接收状态")}</span>
          </div>
          <div style={{ padding:"12px 20px" }}>
            {loading ? <div style={{ color:"#94a3b8", padding:"20px 0", textAlign:"center" }}>{t("common.loading", "加载中...")}</div>
              : batches.length === 0 ? <div style={{ color:"#94a3b8", padding:"20px 0", textAlign:"center" }}>{t("ui.今日暂无批次", "今日暂无批次")}</div>
              : batches.map(b => (
                <div key={b.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"10px 0", borderBottom:"1px solid var(--border,#f1f5f9)" }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14, fontFamily:"monospace" }}>{b.batch_code || b.id}</div>
                    <div style={{ fontSize:12, color:"#64748b" }}>{(b.received_qty || 0).toLocaleString()} {t("ui.枚", "枚")} · {b.house_code || "—"}</div>
                  </div>
                  <span style={{ fontSize:12, padding:"3px 10px", borderRadius:20,
                    background: b.batch_status === "QC_PASSED" ? "#f0fdf4" : b.batch_status === "RECEIVED" ? "#eff6ff" : "#fffbeb",
                    color: b.batch_status === "QC_PASSED" ? "#16a34a" : b.batch_status === "RECEIVED" ? "#2563eb" : "#d97706",
                    fontWeight:600 }}>
                    {b.batch_status === "QC_PASSED" ? t("ui.已首检", "已首检") : b.batch_status === "RECEIVED" ? t("ui.已接收", "已接收") : b.batch_status || t("ui.待接收", "待接收")}
                  </span>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* 未关闭异常 */}
      {openExceptions.length > 0 && (
        <div className={s.card} style={{ marginTop:16 }}>
          <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border,#e2e8f0)", display:"flex", alignItems:"center", gap:8 }}>
            <AlertCircle size={16} color="#ef4444" />
            <span style={{ fontWeight:600, fontSize:15, color:"#ef4444" }}>{t("ui.未关闭异常", "未关闭异常")} ({openExceptions.length})</span>
          </div>
          <div style={{ padding:"12px 20px" }}>
            {openExceptions.map(e => (
              <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"10px 0", borderBottom:"1px solid var(--border,#f1f5f9)" }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14 }}>{e.exception_type || e.issue_type || t("ui.异常", "异常")}</div>
                  <div style={{ fontSize:12, color:"#64748b" }}>{e.description || e.detail || "—"}</div>
                </div>
                <a href="/terminal/packaging/exceptions" target="_blank"
                  style={{ fontSize:12, color:"#f59e0b", textDecoration:"none", display:"flex", alignItems:"center", gap:4 }}>
                  {t("ui.处理", "处理")} <ChevronRight size={12} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
