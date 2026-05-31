"use client";
/**
 * Phoenix ERP V3 — 包装日报页
 * 数据源：GET /api/packaging/terminal/reports/shift-summary?date=YYYY-MM-DD
 * 功能：选择日期查询当日包装班次汇总数据
 */
import { useState, useCallback, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { RefreshCw, BarChart2, Package, CheckCircle2, TrendingUp, Layers } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

async function apiFetch(path: string) {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") : null;
  const r = await fetch(path, { headers: { Authorization: token ? `Bearer ${token}` : "" } });
  return r.json();
}

interface ShiftSummaryItem {
  shift: string;
  receivedQty: number;
  receivedWeight: number;
  openExceptionCount: number;
  closedExceptionCount: number;
}
interface DailySummary {
  total_tasks: number | string;
  total_packed: number | string;
  total_plan: number | string;
}
interface GradeRow { grade: string; qty: number | string; tasks: number | string; }
interface ReportData { date: string; summary: DailySummary; by_grade: GradeRow[]; }

export default function DailyReportPage() {
  const { t } = useLanguage();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading]  = useState(false);

  const loadReport = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/packaging/terminal/reports/shift-summary?date=${date}`)
      .then(r => {
        const raw = r.data ?? r;
        // Normalise terminal API response → ReportData shape
        if (Array.isArray(raw)) {
          const items = raw as ShiftSummaryItem[];
          const totalQty = items.reduce((acc, it) => acc + Number(it.receivedQty || 0), 0);
          setReport({
            date,
            summary: { total_tasks: items.length, total_packed: totalQty, total_plan: totalQty },
            by_grade: [],
          });
        } else if (raw && typeof raw === "object") {
          // Already shaped or single shift object
          const item = raw as ShiftSummaryItem;
          const qty = Number(item.receivedQty || 0);
          setReport({
            date,
            summary: { total_tasks: 1, total_packed: qty, total_plan: qty },
            by_grade: [],
          });
        } else {
          setReport(null);
        }
      })
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const s_total  = Number(report?.summary?.total_packed || 0);
  const s_plan   = Number(report?.summary?.total_plan   || 0);
  const s_tasks  = Number(report?.summary?.total_tasks  || 0);
  const s_pct    = s_plan > 0 ? Math.round(s_total / s_plan * 100) : 0;

  return (
    <div>
      <PageHeader
        title={t("ui.包装日报", "包装日报")}
        subtitle={t("ui.包装日报副标题", "查询每日包装汇总数据，按品级分组统计，展示近 7 日趋势")}
        breadcrumb={[t("ui.包装中心", "包装中心"), t("ui.包装日报", "包装日报")]}
        actions={
          <button type="button" className={s.btnPrimaryGrad} onClick={loadReport} disabled={loading}>
            {loading ? <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={14} />}
            {t("common.refresh", "刷新")}
          </button>
        }
      />

      {/* 日期选择 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>{t("ui.查询日期", "查询日期")}：</label>
        <input type="date" className={s.inp} value={date}
          onChange={e => setDate(e.target.value)}
          style={{ width: 160, height: 36, padding: "0 12px" }} />
        <button type="button" className={s.btnPrimaryGrad} onClick={loadReport} disabled={loading}>
          {loading ? t("ui.查询中", "查询中...") : t("common.search", "查询")}
        </button>
        {[t("ui.今天", "今天"), t("ui.昨天", "昨天")].map((label, i) => (
          <button key={label} type="button" className={s.tabPill}
            onClick={() => {
              const d = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
              setDate(d);
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* KPI 卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        {[
          { icon: <Package size={20} />, label: t("ui.今日包装量", "今日包装量"), value: s_total.toLocaleString(), unit: t("ui.枚", "枚"), color: "#3b82f6" },
          { icon: <BarChart2 size={20} />, label: t("ui.计划完成率", "计划完成率"), value: `${s_pct}%`, unit: "", color: s_pct >= 100 ? "#10b981" : "#f59e0b" },
          { icon: <CheckCircle2 size={20} />, label: t("ui.完工任务数", "完工任务数"), value: String(s_tasks), unit: t("ui.个", "个"), color: "#8b5cf6" },
          { icon: <TrendingUp size={20} />, label: t("ui.计划总量", "计划总量"), value: s_plan.toLocaleString(), unit: t("ui.枚", "枚"), color: "#06b6d4" },
        ].map(kpi => (
          <div key={kpi.label} className={s.kpiCard}>
            <div className={s.kpiIcon} style={{ color: kpi.color, background: `${kpi.color}18` }}>{kpi.icon}</div>
            <div>
              <div className={s.kpiValue} style={{ color: kpi.color }}>
                {kpi.value} <span style={{ fontSize: 12, fontWeight: 400 }}>{kpi.unit}</span>
              </div>
              <div className={s.kpiLabel}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 班次汇总明细 */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <Layers size={15} style={{ color: "var(--color-primary)" }} />
          <span className={s.cardTitle}>{t("ui.班次汇总明细", "班次汇总明细")} — {date}</span>
        </div>
        {loading ? (
          <div style={{ padding: 20 }}>
            {[1,2,3].map(i => <div key={i} className={s.skeletonLine} style={{ height: 40, marginBottom: 8 }} />)}
          </div>
        ) : !report ? (
          <div className={s.emptyState} style={{ padding: 40 }}>
            <Package size={32} />
            <div className={s.emptyStateText}>{t("ui.当日无班次数据", "当日无班次数据")}</div>
          </div>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th>{t("ui.统计项", "统计项")}</th><th style={{ textAlign: "right" }}>{t("ui.数值", "数值")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("ui.班次数", "班次数")}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{s_tasks}</td>
              </tr>
              <tr>
                <td>{t("ui.接收量枚", "接收量（枚）")}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{s_total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


