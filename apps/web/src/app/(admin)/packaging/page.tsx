"use client";

import { useState, useEffect, useCallback } from "react";
interface ShiftRow {
  id: number | string;
  shift_code?: string;
  status: string;
  operator_name?: string;
  line_id?: string;
}
interface BatchRow {
  id: number | string;
  batch_code?: string;
  batch_status: string;
  received_qty?: number;
  house_code?: string;
}
interface ExceptionRow {
  id: number | string;
  status: string;
  exception_type?: string;
  issue_type?: string;
  description?: string;
  detail?: string;
}
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import { Package, Monitor, AlertCircle, RefreshCw, CheckCircle, Clock, ChevronRight } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import u from "@/styles/uix-utils.module.css";
// g200f 模板 token(2026-06-20)
import {
  primaryActionButton, secondaryActionButton, actionPill,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  actionGroupBox, detailInfoBox, MONO_FONT,
} from "@/components/design-system/cockpit-styles";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";
const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${tok()}`
});
export default function PackagingOverviewPage() {
  const {
    t
  } = useLanguage();
  const today = new Date().toISOString().slice(0, 10);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sR, bR, eR] = await Promise.all([fetch("/api/packaging/terminal/shifts/today", {
        headers: hdr()
      }), fetch("/api/packaging/terminal/source-batches/today", {
        headers: hdr()
      }), fetch("/api/packaging/terminal/exceptions/today", {
        headers: hdr()
      })]);
      const [sJ, bJ, eJ] = await Promise.all([sR.json(), bR.json(), eR.json()]);
      setShifts(Array.isArray(sJ.data ?? sJ) ? sJ.data ?? sJ : []);
      setBatches(Array.isArray(bJ.data ?? bJ) ? bJ.data ?? bJ : []);
      setExceptions(Array.isArray(eJ.data ?? eJ) ? eJ.data ?? eJ : []);
    } catch {/* ignore */} finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const openExceptions = exceptions.filter(e => !["CLOSED", "CANCELLED"].includes(e.status || ""));
  return <div className={s.pageRoot}>
      <PageHeader
        title={t("ui.包装中心管理", "包装中心管理")}
        subtitle={`${today} · ${t("ui.今日作业概览", "今日作业概览")}`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={load} style={secondaryActionButton}><RefreshCw size={13} /> {t("common.refresh", "刷新")}</button>
            <a href="/terminal/packaging/dashboard" style={{ ...primaryActionButton, background: "var(--status-warning)", textDecoration: "none" }}>
              <Monitor size={14} /> {t("ui.进入作业台", "进入作业台")}
            </a>
          </div>
        }
      />

      {/* g200f KPI 4 卡 — kpiCardCompact(tone) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        {([
          { Icon: Clock,        label: t("ui.今日班次",   "今日班次"),   value: shifts.length,                                                                  tone: "info"    as Tone },
          { Icon: Package,      label: t("ui.来源批次",   "来源批次"),   value: batches.length,                                                                 tone: "brand"   as Tone },
          { Icon: CheckCircle,  label: t("ui.已接收",     "已接收"),     value: batches.filter(b => b.batch_status === "RECEIVED" || b.batch_status === "QC_PASSED").length, tone: "success" as Tone },
          { Icon: AlertCircle,  label: t("ui.未关闭异常", "未关闭异常"), value: openExceptions.length,                                                          tone: openExceptions.length > 0 ? "danger" as Tone : "default" as Tone },
        ]).map(item => {
          const Icon = item.Icon;
          return (
            <div key={item.label} style={kpiCardCompact(item.tone)}>
              <div style={kpiCardCompactLabel}><Icon size={13} /> {item.label}</div>
              <div style={kpiCardCompactValue(item.tone)}>{item.value}</div>
            </div>
          );
        })}
      </div>

      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16
    }}>
        {/* g200f 今日班次列表 — detailInfoBox(非 KPI 风格) */}
        <div style={{ ...detailInfoBox, background: "var(--bg-card)", padding: 0 }}>
          <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border,var(--text-primary))",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
            <span style={{
            fontWeight: 600,
            fontSize: 15
          }}>{t("ui.今日班次", "今日班次")}</span>
            <span className={u.muted12}>{today}</span>
          </div>
          <div style={{
          padding: "12px 20px"
        }}>
            {loading ? <div style={{
            color: "var(--text-disabled)",
            padding: "20px 0",
            textAlign: "center"
          }}>{t("common.loading", "加载中...")}</div> : shifts.length === 0 ? <div style={{
            color: "var(--text-disabled)",
            padding: "20px 0",
            textAlign: "center"
          }}>{t("ui.今日暂无班次", "今日暂无班次")}</div> : shifts.map(sh => <div key={sh.id} style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0",
            borderBottom: "1px solid var(--border,var(--text-primary))"
          }}>
                  <div>
                    <div style={{
                fontWeight: 600,
                fontSize: 14
              }}>{sh.shift_code || sh.id}</div>
                    <div className={u.muted12}>{sh.operator_name || "—"} · {sh.line_id || "—"}</div>
                  </div>
                  <span style={actionPill(sh.status === "CLOSED" ? "success" : "warning")}>
                    {sh.status === "CLOSED" ? t("ui.已交班", "已交班") : t("ui.进行中", "进行中")}
                  </span>
                </div>)}
          </div>
        </div>

        {/* g200f 来源批次列表 — detailInfoBox */}
        <div style={{ ...detailInfoBox, background: "var(--bg-card)", padding: 0 }}>
          <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border,var(--text-primary))",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
            <span style={{
            fontWeight: 600,
            fontSize: 15
          }}>{t("ui.来源批次", "来源批次")}</span>
            <span className={u.muted12}>{t("ui.接收状态", "接收状态")}</span>
          </div>
          <div style={{
          padding: "12px 20px"
        }}>
            {loading ? <div style={{
            color: "var(--text-disabled)",
            padding: "20px 0",
            textAlign: "center"
          }}>{t("common.loading", "加载中...")}</div> : batches.length === 0 ? <div style={{
            color: "var(--text-disabled)",
            padding: "20px 0",
            textAlign: "center"
          }}>{t("ui.今日暂无批次", "今日暂无批次")}</div> : batches.map(b => <div key={b.id} style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0",
            borderBottom: "1px solid var(--border,var(--text-primary))"
          }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: MONO_FONT }}>{b.batch_code || b.id}</div>
                    <div className={u.muted12}>{(b.received_qty || 0).toLocaleString()} {t("ui.枚", "枚")} · {b.house_code || "—"}</div>
                  </div>
                  <span style={actionPill(
                    b.batch_status === "QC_PASSED" ? "success" :
                    b.batch_status === "RECEIVED"  ? "info"    : "warning"
                  )}>
                    {b.batch_status === "QC_PASSED" ? t("ui.已首检", "已首检") : b.batch_status === "RECEIVED" ? t("ui.已接收", "已接收") : b.batch_status || t("ui.待接收", "待接收")}
                  </span>
                </div>)}
          </div>
        </div>
      </div>

      {/* g200f 未关闭异常 — actionGroupBox(危险操作区) */}
      {openExceptions.length > 0 && <div style={{ ...actionGroupBox, background: "var(--bg-card)", marginTop: 16, padding: 0 }}>
          <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--border,var(--text-primary))",
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
            <AlertCircle size={16} color="var(--status-danger)" />
            <span style={{
          fontWeight: 600,
          fontSize: 15,
          color: "var(--status-danger)"
        }}>{t("ui.未关闭异常", "未关闭异常")} ({openExceptions.length})</span>
          </div>
          <div style={{
        padding: "12px 20px"
      }}>
            {openExceptions.map(e => <div key={e.id} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 0",
          borderBottom: "1px solid var(--border,var(--text-primary))"
        }}>
                <div>
                  <div style={{
              fontWeight: 600,
              fontSize: 14
            }}>{e.exception_type || e.issue_type || t("ui.异常", "异常")}</div>
                  <div className={u.muted12}>{e.description || e.detail || "—"}</div>
                </div>
                <a href="/terminal/packaging/exceptions" target="_blank" style={{
            fontSize: 12,
            color: "var(--status-warning)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 4
          }}>
                  {t("ui.处理", "处理")} <ChevronRight size={12} />
                </a>
              </div>)}
          </div>
        </div>}
    </div>;
}
