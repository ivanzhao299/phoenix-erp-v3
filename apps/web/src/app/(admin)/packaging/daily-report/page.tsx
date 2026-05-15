"use client";
/**
 * Phoenix ERP V3 — 包装日报页
 * 数据源：GET /api/packaging/daily-report?date=YYYY-MM-DD
 * 功能：选择日期查询当日包装汇总、按品级分组统计、可见近 7 天趋势
 */
import { useState, useCallback, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { RefreshCw, BarChart2, Package, CheckCircle2, TrendingUp, Layers } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

const API_BASE = "/api/packaging";

async function apiFetch(path: string) {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") : null;
  const r = await fetch(path, { headers: { Authorization: token ? `Bearer ${token}` : "" } });
  return r.json();
}

interface DailySummary {
  total_tasks: number | string;
  total_packed: number | string;
  total_plan: number | string;
}
interface GradeRow { grade: string; qty: number | string; tasks: number | string; }
interface ReportData { date: string; summary: DailySummary; by_grade: GradeRow[]; }

export default function DailyReportPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading]  = useState(false);
  const [weekData, setWeekData] = useState<ReportData[]>([]);

  const loadReport = useCallback(() => {
    setLoading(true);
    apiFetch(`${API_BASE}/daily-report?date=${date}`)
      .then(r => setReport(r.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  // B6: 一次 SQL 拉 7 天，替代过去 Promise.all 7 次 GET
  const loadWeek = useCallback(() => {
    const end = new Date().toISOString().slice(0, 10);
    apiFetch(`${API_BASE}/daily-report-range?end_date=${end}&days=7`)
      .then(r => setWeekData((r.data || []) as ReportData[]))
      .catch(() => setWeekData([]));
  }, []);

  useEffect(() => { loadReport(); }, [loadReport]);
  useEffect(() => { loadWeek(); }, [loadWeek]);

  const s_total  = Number(report?.summary?.total_packed || 0);
  const s_plan   = Number(report?.summary?.total_plan   || 0);
  const s_tasks  = Number(report?.summary?.total_tasks  || 0);
  const s_pct    = s_plan > 0 ? Math.round(s_total / s_plan * 100) : 0;
  const maxWeekQty = Math.max(...weekData.map(d => Number(d.summary?.total_packed || 0)), 1);

  return (
    <div>
      <PageHeader
        title="包装日报"
        subtitle="查询每日包装汇总数据，按品级分组统计，展示近 7 日趋势"
        breadcrumb={["包装中心", "包装日报"]}
        actions={
          <button type="button" className={s.btnPrimaryGrad} onClick={loadReport} disabled={loading}>
            {loading ? <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={14} />}
            刷新
          </button>
        }
      />

      {/* 日期选择 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <label style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>查询日期：</label>
        <input type="date" className={s.inp} value={date}
          onChange={e => setDate(e.target.value)}
          style={{ width: 160, height: 36, padding: "0 12px" }} />
        <button className={s.btnPrimaryGrad} onClick={loadReport} disabled={loading}>
          {loading ? "查询中..." : "查询"}
        </button>
        {["今天", "昨天"].map((label, i) => (
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { icon: <Package size={20} />, label: "今日包装量", value: s_total.toLocaleString(), unit: "枚", color: "#3b82f6" },
          { icon: <BarChart2 size={20} />, label: "计划完成率", value: `${s_pct}%`, unit: "", color: s_pct >= 100 ? "#10b981" : "#f59e0b" },
          { icon: <CheckCircle2 size={20} />, label: "完工任务数", value: String(s_tasks), unit: "个", color: "#8b5cf6" },
          { icon: <TrendingUp size={20} />, label: "计划总量", value: s_plan.toLocaleString(), unit: "枚", color: "#06b6d4" },
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* 品级分组 */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <Layers size={15} style={{ color: "var(--color-primary)" }} />
            <span className={s.cardTitle}>各品级包装明细 — {date}</span>
          </div>
          {loading ? (
            <div style={{ padding: 20 }}>
              {[1,2,3].map(i => <div key={i} className={s.skeletonLine} style={{ height: 40, marginBottom: 8 }} />)}
            </div>
          ) : !report?.by_grade?.length ? (
            <div className={s.emptyState} style={{ padding: 40 }}>
              <Package size={32} />
              <div className={s.emptyStateText}>当日无完工记录</div>
            </div>
          ) : (
            <table className={s.table}>
              <thead>
                <tr>
                  <th>品级</th><th style={{ textAlign: "right" }}>包装量（枚）</th>
                  <th style={{ textAlign: "right" }}>完工任务数</th><th>占比</th>
                </tr>
              </thead>
              <tbody>
                {report.by_grade.map(row => {
                  const pct2 = s_total > 0 ? Math.round(Number(row.qty) / s_total * 100) : 0;
                  return (
                    <tr key={String(row.grade)}>
                      <td><span className={`${s.badge} ${s.badgePurple}`}>{String(row.grade)}</span></td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{Number(row.qty).toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>{Number(row.tasks)}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className={s.progressWrap} style={{ flex: 1, margin: 0 }}>
                            <div className={s.progressBar} style={{ width: `${pct2}%` }} />
                          </div>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)", minWidth: 28 }}>{pct2}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td>合计</td>
                  <td style={{ textAlign: "right" }}>{s_total.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{s_tasks}</td>
                  <td>100%</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* 近 7 日趋势柱图 */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <TrendingUp size={15} style={{ color: "var(--color-primary)" }} />
            <span className={s.cardTitle}>近 7 日包装趋势</span>
          </div>
          <div style={{ padding: "16px 12px" }}>
            {weekData.map(d => {
              const qty = Number(d.summary?.total_packed || 0);
              const barPct = Math.round(qty / maxWeekQty * 100);
              const isToday = d.date === new Date().toISOString().slice(0, 10);
              return (
                <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 50, fontSize: 11, color: isToday ? "var(--color-primary)" : "var(--text-secondary)", fontWeight: isToday ? 700 : 400, flexShrink: 0 }}>
                    {d.date.slice(5)}
                  </div>
                  <div className={s.progressWrap} style={{ flex: 1, margin: 0 }}>
                    <div className={s.progressBar} style={{ width: `${barPct}%`, background: isToday ? "var(--color-primary)" : undefined }} />
                  </div>
                  <div style={{ width: 50, textAlign: "right", fontSize: 12, fontWeight: 700, color: isToday ? "var(--color-primary)" : "var(--text-primary)" }}>
                    {qty.toLocaleString()}
                  </div>
                </div>
              );
            })}
            {weekData.length === 0 && <div className={s.emptyStateText} style={{ padding: 20 }}>暂无历史数据</div>}
          </div>
        </div>
      </div>
    </div>
  );
}


