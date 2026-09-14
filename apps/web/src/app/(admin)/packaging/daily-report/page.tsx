"use client";
import PackingProductionReport from '@/components/packaging/PackingProductionReport';
/**
 * Phoenix ERP V3 — 包装日报页
 * 数据源：GET /api/packaging/terminal/reports/shift-summary?date=YYYY-MM-DD
 * 功能：选择日期查询当日包装班次汇总数据
 */
import { useState, useCallback, useEffect } from "react";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader";
import { RefreshCw, BarChart2, Package, CheckCircle2, TrendingUp, Layers } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProductGrades } from "@/hooks/useProductGrades";
import {
  primaryActionButton, inputField, toolbarFilterPill,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  detailInfoBox,
} from "@/components/design-system/cockpit-styles";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";

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
  gradingOutputs?: Record<string, number>;
  gradedQty?: number;
  shiftPackedEggs?: number;
}
interface DailySummary {
  total_tasks: number | string;
  total_packed: number | string;
  total_plan: number | string;
}
interface GradeRow { grade: string; qty: number | string; tasks: number | string; }
interface ReportData { date: string; summary: DailySummary; by_grade: GradeRow[]; }

function LegacyDailyReportPage() {
  const { t } = useLanguage();
  const { grades: productGrades } = useProductGrades();

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
          const totalPacked = items.reduce((acc, it) => acc + Number(it.shiftPackedEggs || 0), 0);
          const gradeTotals = items.reduce<Record<string, number>>((acc, item) => {
            for (const [grade, qty] of Object.entries(item.gradingOutputs || {})) acc[grade] = (acc[grade] || 0) + Number(qty || 0);
            return acc;
          }, {});
          setReport({
            date,
            summary: { total_tasks: items.length, total_packed: totalPacked, total_plan: totalQty },
            by_grade: Object.entries(gradeTotals).map(([grade, qty]) => ({ grade, qty, tasks: items.length })),
          });
        } else if (raw && typeof raw === "object") {
          // Already shaped or single shift object
          const item = raw as ShiftSummaryItem;
          const receivedQty = Number(item.receivedQty || 0);
          const packedQty = Number(item.shiftPackedEggs || 0);
          setReport({
            date,
            summary: { total_tasks: item.shift ? 1 : 0, total_packed: packedQty, total_plan: receivedQty },
            by_grade: Object.entries(item.gradingOutputs || {}).map(([grade, qty]) => ({ grade, qty, tasks: 1 })),
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
  const gradeQty = new Map((report?.by_grade || []).map(row => [row.grade, Number(row.qty || 0)]));

  return (
    <div>
      <PageHeader
        title={t("ui.包装日报", "包装日报")}
        subtitle={t("ui.包装日报副标题", "查询每日包装汇总数据，按品级分组统计，展示近 7 日趋势")}
        breadcrumb={[t("ui.包装中心", "包装中心"), t("ui.包装日报", "包装日报")]}
        actions={
          <button type="button" onClick={loadReport} disabled={loading} style={{ ...primaryActionButton, opacity: loading ? 0.5 : 1 }}>
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {t("common.refresh", "刷新")}
          </button>
        }
      />

      {/* g200f 日期选择 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>{t("ui.查询日期", "查询日期")}：</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputField, width: 160 }} />
        <button type="button" onClick={loadReport} disabled={loading} style={{ ...primaryActionButton, opacity: loading ? 0.5 : 1 }}>
          {loading ? t("ui.查询中", "查询中...") : t("common.search", "查询")}
        </button>
        {[t("ui.今天", "今天"), t("ui.昨天", "昨天")].map((label, i) => (
          <button key={label} type="button" onClick={() => {
            const d = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
            setDate(d);
          }} style={toolbarFilterPill(false)}>
            {label}
          </button>
        ))}
      </div>

      {/* g200f KPI 4 卡 — kpiCardCompact(tone) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 24 }}>
        {([
          { Icon: Package,      label: t("ui.今日包装量",   "今日包装量"),   value: s_total.toLocaleString(), unit: t("ui.枚", "枚"), tone: "info"    as Tone },
          { Icon: BarChart2,    label: t("ui.计划完成率",   "计划完成率"),   value: `${s_pct}%`,              unit: "",               tone: (s_pct >= 100 ? "success" : "warning") as Tone },
          { Icon: CheckCircle2, label: t("ui.完工任务数",   "完工任务数"),   value: String(s_tasks),          unit: t("ui.个", "个"), tone: "brand"   as Tone },
          { Icon: TrendingUp,   label: t("ui.计划总量",     "计划总量"),     value: s_plan.toLocaleString(),  unit: t("ui.枚", "枚"), tone: "info"    as Tone },
        ]).map(kpi => {
          const Icon = kpi.Icon;
          return (
            <div key={kpi.label} style={kpiCardCompact(kpi.tone)}>
              <div style={kpiCardCompactLabel}><Icon size={13} /> {kpi.label}</div>
              <div style={{ ...kpiCardCompactValue(kpi.tone), display: "flex", alignItems: "baseline", gap: 4 }}>
                {kpi.value}
                {kpi.unit && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>{kpi.unit}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* g200f 班次汇总 — detailInfoBox(非 KPI 风格) */}
      <div style={{ ...detailInfoBox, background: "var(--bg-card)", padding: 0 }}>
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
                <th>{t("ui.统计项", "统计项")}</th><th className={u.tar}>{t("ui.数值", "数值")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("ui.班次数", "班次数")}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{s_tasks}</td>
              </tr>
              <tr>
                <td>{t("ui.接收量枚", "接收量（枚）")}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{s_plan.toLocaleString()}</td>
              </tr>
              {productGrades.map(grade => (
                <tr key={grade.grade_code}>
                  <td>{grade.grade_name}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{(gradeQty.get(grade.grade_code) || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


export default function ProductionReportRoute(){return <PackingProductionReport/>;}
