"use client";
/**
 * Phoenix ERP V3 — Pilot Run 1 Execution Center
 * 试运行执行中心
 *
 * 功能：
 *   - 实时 Dashboard（9 大 KPI 卡片）
 *   - 6 维评分仪表盘（GREEN / YELLOW / RED）
 *   - 7 天评分趋势图
 *   - 上线准备度评估
 *   - 日报历史列表
 *   - 手动触发日报生成
 */
import { useState, useEffect, useCallback } from "react";
import {
  Rocket, RefreshCw, ShoppingCart, TrendingUp, Truck, PackageCheck,
  RotateCcw, Wallet, AlertTriangle, CheckCircle2, XCircle, Clock,
  FileText, ChevronDown, ChevronUp, Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScoreDimensions {
  sales:     number;
  inventory: number;
  delivery:  number;
  finance:   number;
  approval:  number;
  stability: number;
}

interface TrendPoint {
  date:   string;
  score:  number;
  status: string;
}

interface PilotDashboard {
  pilotRunId:           number;
  runNo:                string;
  siteName:             string;
  status:               string;
  daysRunning:          number;
  daysRemaining:        number;
  runStartDate:         string;
  runEndDate:           string;
  todayOrderCount:      number;
  todaySalesAmount:     number;
  todayDeliveryCount:   number;
  todayReceiptCount:    number;
  todayReturnCount:     number;
  todayCollectionCount: number;
  todayAbnormalCount:   number;
  openIssues:           number;
  criticalIssues:       number;
  resolvedToday:        number;
  score:                number;
  scoreStatus:          "GREEN" | "YELLOW" | "RED";
  scoreDimensions:      ScoreDimensions;
  goLiveReady:          boolean;
  goLiveBlockers:       string[];
  scoreTrend:           TrendPoint[];
}

interface DailyReport {
  id:                   number;
  pilot_run_id:         number;
  report_date:          string;
  order_count:          number;
  sales_amount:         string;
  delivery_count:       number;
  receipt_count:        number;
  return_count:         number;
  collection_count:     number;
  issue_count:          number;
  critical_issue_count: number;
  score:                number;
  score_status:         string;
  score_sales:          number;
  score_inventory:      number;
  score_delivery:       number;
  score_finance:        number;
  score_approval:       number;
  score_stability:      number;
  generated_at:         string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_PILOT_RUN_ID = 1;

const STATUS_COLOR: Record<string, string> = {
  GREEN:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  YELLOW:  "text-yellow-700 bg-yellow-50 border-yellow-200",
  RED:     "text-red-700 bg-red-50 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  GREEN:  "良好",
  YELLOW: "警告",
  RED:    "危险",
};

const DIMENSION_LABELS: Record<keyof ScoreDimensions, string> = {
  sales:     "销售",
  inventory: "库存",
  delivery:  "配送",
  finance:   "财务",
  approval:  "审批",
  stability: "稳定性",
};

const DIMENSION_WEIGHTS: Record<keyof ScoreDimensions, string> = {
  sales:     "25%",
  inventory: "20%",
  delivery:  "20%",
  finance:   "15%",
  approval:  "10%",
  stability: "10%",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmt(v: number): string {
  if (v >= 10000) return `¥${(v / 10000).toFixed(1)}万`;
  return `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 0 })}`;
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-yellow-400";
  return "bg-red-500";
}

function trendStatusDot(status: string): string {
  if (status === "GREEN")  return "bg-emerald-500";
  if (status === "YELLOW") return "bg-yellow-400";
  return "bg-red-500";
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color = "text-slate-800",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-3">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
        <Icon size={18} className="text-slate-500" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-400 mb-0.5">{label}</div>
        <div className={`text-xl font-bold leading-tight ${color}`}>{value}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Score Gauge ───────────────────────────────────────────────────────────────

function ScoreGauge({ score, status }: { score: number; status: string }) {
  const cls =
    status === "GREEN"  ? "text-emerald-700 bg-emerald-50"  :
    status === "YELLOW" ? "text-yellow-700  bg-yellow-50"   :
                          "text-red-700     bg-red-50";

  return (
    <div className={`rounded-2xl p-6 flex flex-col items-center justify-center gap-2 ${cls}`}>
      <div className="text-6xl font-black leading-none">{score}</div>
      <div className="text-sm font-medium opacity-70">/ 100</div>
      <div className="mt-1 px-3 py-1 rounded-full bg-white/60 text-sm font-semibold">
        {STATUS_LABEL[status] ?? status}
      </div>
    </div>
  );
}

// ── Dimension Bar ────────────────────────────────────────────────────────────

function DimensionBar({
  label, score, weight,
}: { label: string; score: number; weight: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-14 text-slate-500 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all ${scoreBarColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-8 text-right font-semibold text-slate-700">{score}</span>
      <span className="w-8 text-xs text-slate-400">{weight}</span>
    </div>
  );
}

// ── Trend Chart ──────────────────────────────────────────────────────────────

function TrendChart({ trend }: { trend: TrendPoint[] }) {
  if (!trend.length) {
    return <div className="text-center text-slate-400 text-sm py-6">暂无趋势数据</div>;
  }
  const maxScore = 100;
  const minScore = 0;
  const height   = 80;

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-2 min-w-max px-1 pt-2" style={{ height: height + 32 }}>
        {trend.map((p) => {
          const pct = ((p.score - minScore) / (maxScore - minScore)) * height;
          return (
            <div key={p.date} className="flex flex-col items-center gap-1" style={{ width: 40 }}>
              <div className="text-xs font-bold text-slate-700">{p.score}</div>
              <div
                className={`w-6 rounded-t-md transition-all ${scoreBarColor(p.score)}`}
                style={{ height: Math.max(4, pct) }}
                title={`${p.date}: ${p.score} (${p.status})`}
              />
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${trendStatusDot(p.status)}`}
              />
              <div className="text-[10px] text-slate-400 text-center leading-tight">
                {p.date.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Daily Reports Table ───────────────────────────────────────────────────────

function DailyReportTable({ reports }: { reports: DailyReport[] }) {
  if (!reports.length) {
    return <div className="text-center text-slate-400 text-sm py-6">暂无日报数据</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs text-slate-400">
            <th className="text-left py-2 pr-3 font-medium">日期</th>
            <th className="text-right py-2 pr-3 font-medium">订单</th>
            <th className="text-right py-2 pr-3 font-medium">销售额</th>
            <th className="text-right py-2 pr-3 font-medium">配送</th>
            <th className="text-right py-2 pr-3 font-medium">退货</th>
            <th className="text-right py-2 pr-3 font-medium">问题数</th>
            <th className="text-right py-2 font-medium">综合分</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="py-2 pr-3 font-mono text-slate-600">{r.report_date}</td>
              <td className="text-right py-2 pr-3">{r.order_count}</td>
              <td className="text-right py-2 pr-3">{fmtAmt(Number(r.sales_amount))}</td>
              <td className="text-right py-2 pr-3">{r.delivery_count}</td>
              <td className="text-right py-2 pr-3">{r.return_count}</td>
              <td className="text-right py-2 pr-3">
                {r.critical_issue_count > 0 && (
                  <span className="text-red-600 font-bold">{r.critical_issue_count} CRIT </span>
                )}
                {r.issue_count}
              </td>
              <td className="text-right py-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_COLOR[r.score_status] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}
                >
                  {r.score}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PilotRunPage() {
  const [pilotRunId]               = useState(DEFAULT_PILOT_RUN_ID);
  const [dashboard, setDashboard]  = useState<PilotDashboard | null>(null);
  const [reports,   setReports]    = useState<DailyReport[]>([]);
  const [loading,   setLoading]    = useState(true);
  const [reporting, setReporting]  = useState(false);
  const [error,     setError]      = useState<string | null>(null);
  const [showBlockers, setShowBlockers] = useState(false);
  const [showReports,  setShowReports]  = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/uat/pilot-runs/${pilotRunId}/dashboard`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      setDashboard(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [pilotRunId]);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/uat/pilot-runs/${pilotRunId}/daily-reports?limit=14`);
      if (!res.ok) return;
      const data = await res.json();
      setReports(data.items ?? []);
    } catch { /* silent */ }
  }, [pilotRunId]);

  useEffect(() => {
    fetchDashboard();
    fetchReports();
  }, [fetchDashboard, fetchReports]);

  const handleGenerateReport = async () => {
    setReporting(true);
    try {
      const res = await fetch(`/api/uat/pilot-runs/${pilotRunId}/daily-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchReports();
      await fetchDashboard();
    } catch (e: any) {
      alert(`日报生成失败: ${e.message}`);
    } finally {
      setReporting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96 gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
        <span>加载试运行数据…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <XCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-slate-600 mb-4">{error}</p>
        <button
          onClick={fetchDashboard}
          className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700"
        >
          重试
        </button>
      </div>
    );
  }

  if (!dashboard) return null;

  const dims = dashboard.scoreDimensions;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Rocket size={20} className="text-violet-500" />
            <h1 className="text-xl font-bold text-slate-800">试运行执行中心</h1>
            <span
              className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLOR[dashboard.scoreStatus]}`}
            >
              {STATUS_LABEL[dashboard.scoreStatus]}
            </span>
          </div>
          <div className="text-sm text-slate-400">
            {dashboard.runNo} · {dashboard.siteName} · 已运行 {dashboard.daysRunning} 天（剩余 {dashboard.daysRemaining} 天）
            &nbsp;|&nbsp; {dashboard.runStartDate} ~ {dashboard.runEndDate}
          </div>
        </div>
        <button
          onClick={fetchDashboard}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm hover:bg-slate-200 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      </div>

      {/* ── 9 KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={ShoppingCart}
          label="今日订单"
          value={dashboard.todayOrderCount}
          color={dashboard.todayOrderCount > 0 ? "text-violet-700" : "text-slate-400"}
        />
        <KpiCard
          icon={TrendingUp}
          label="今日销售额"
          value={fmtAmt(dashboard.todaySalesAmount)}
          color={dashboard.todaySalesAmount > 0 ? "text-emerald-700" : "text-slate-400"}
        />
        <KpiCard
          icon={Truck}
          label="今日配送"
          value={dashboard.todayDeliveryCount}
          sub={`已签收 ${dashboard.todayReceiptCount}`}
        />
        <KpiCard
          icon={RotateCcw}
          label="今日退货"
          value={dashboard.todayReturnCount}
          color={dashboard.todayReturnCount > 0 ? "text-amber-600" : "text-slate-400"}
        />
        <KpiCard
          icon={Wallet}
          label="今日收款笔数"
          value={dashboard.todayCollectionCount}
        />
        <KpiCard
          icon={AlertTriangle}
          label="未解决问题"
          value={dashboard.openIssues}
          sub={dashboard.criticalIssues > 0 ? `含 ${dashboard.criticalIssues} 个 CRITICAL` : undefined}
          color={dashboard.criticalIssues > 0 ? "text-red-700" : dashboard.openIssues > 0 ? "text-amber-600" : "text-emerald-700"}
        />
        <KpiCard
          icon={CheckCircle2}
          label="今日已解决"
          value={dashboard.resolvedToday}
          color={dashboard.resolvedToday > 0 ? "text-emerald-700" : "text-slate-400"}
        />
        <KpiCard
          icon={PackageCheck}
          label="今日异常"
          value={dashboard.todayAbnormalCount}
          color={dashboard.todayAbnormalCount > 0 ? "text-red-600" : "text-emerald-700"}
        />
        <KpiCard
          icon={Rocket}
          label="上线准备度"
          value={dashboard.goLiveReady ? "✅ 可上线" : `❌ ${dashboard.goLiveBlockers.length} 项阻塞`}
          color={dashboard.goLiveReady ? "text-emerald-700" : "text-red-600"}
        />
      </div>

      {/* ── Score + Dimensions ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Gauge */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-slate-600 mb-3">今日综合评分</div>
          <ScoreGauge score={dashboard.score} status={dashboard.scoreStatus} />
          {dashboard.criticalIssues > 0 && (
            <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg p-2 text-center">
              ⚠ CRITICAL 问题存在，评分上限 70 分
            </div>
          )}
        </div>

        {/* Dimensions */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 col-span-2">
          <div className="text-sm font-semibold text-slate-600 mb-4">6 维评分明细</div>
          <div className="space-y-3">
            {(Object.keys(DIMENSION_LABELS) as (keyof ScoreDimensions)[]).map((key) => (
              <DimensionBar
                key={key}
                label={DIMENSION_LABELS[key]}
                score={dims[key]}
                weight={DIMENSION_WEIGHTS[key]}
              />
            ))}
          </div>
          <div className="mt-4 text-xs text-slate-400">
            权重：销售25% + 库存20% + 配送20% + 财务15% + 审批10% + 稳定性10%
          </div>
        </div>
      </div>

      {/* ── 7-day Trend ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="text-sm font-semibold text-slate-600 mb-3">近 7 天评分趋势</div>
        <TrendChart trend={dashboard.scoreTrend} />
      </div>

      {/* ── Go-Live Readiness ── */}
      <div className={`rounded-xl border shadow-sm p-5 ${dashboard.goLiveReady ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {dashboard.goLiveReady
              ? <CheckCircle2 size={18} className="text-emerald-600" />
              : <XCircle      size={18} className="text-amber-600"   />
            }
            <span className={`font-semibold text-sm ${dashboard.goLiveReady ? "text-emerald-700" : "text-amber-700"}`}>
              {dashboard.goLiveReady ? "上线准备度：通过" : `上线准备度：存在 ${dashboard.goLiveBlockers.length} 项阻塞`}
            </span>
          </div>
          {!dashboard.goLiveReady && (
            <button
              onClick={() => setShowBlockers(!showBlockers)}
              className="text-amber-600 text-xs flex items-center gap-1 hover:underline"
            >
              {showBlockers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showBlockers ? "收起" : "查看详情"}
            </button>
          )}
        </div>
        {showBlockers && !dashboard.goLiveReady && (
          <ul className="mt-3 space-y-1.5">
            {dashboard.goLiveBlockers.map((b, i) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-amber-200 text-amber-700 text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Daily Reports ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setShowReports(!showReports)}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            <FileText size={16} />
            日报历史
            {showReports ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={handleGenerateReport}
            disabled={reporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {reporting ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
            生成今日日报
          </button>
        </div>
        {showReports && <DailyReportTable reports={reports} />}
        {!showReports && reports.length > 0 && (
          <div className="text-xs text-slate-400">
            共 {reports.length} 条日报，点击"日报历史"展开查看
          </div>
        )}
        {!showReports && reports.length === 0 && (
          <div className="text-xs text-slate-400">暂无日报，点击"生成今日日报"创建第一条</div>
        )}
      </div>

    </div>
  );
}
