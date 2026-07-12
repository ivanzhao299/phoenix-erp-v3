"use client";
/**
 * Phoenix ERP V3 - Pilot Run Execution Center
 * 试运行执行中心
 */
import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Loader2,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Rocket,
  ShoppingCart,
  TrendingUp,
  Truck,
  Wallet,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import FeedbackWidget from "@/components/uat/FeedbackWidget";
import { KpiCardV2 } from "@/components/design-system/cards/KpiCardV2";
import { EmptyState } from "@/components/design-system/feedback/EmptyState";
import { ErrorState } from "@/components/design-system/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/design-system/feedback/LoadingSkeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  formatPilotAmount,
  getPilotStatusVariant,
  getPilotReadinessLabel,
  type PilotScoreStatus,
} from "@/lib/pilot-run-ui";
import styles from "./pilot-run.module.css";

function getToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || "";
}

function authHdr(extra?: Record<string, string>) {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json", ...extra };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ScoreDimensions {
  sales: number;
  inventory: number;
  delivery: number;
  finance: number;
  approval: number;
  stability: number;
}

interface TrendPoint {
  date: string;
  score: number;
  status: string;
}

interface PilotDashboard {
  pilotRunId: number;
  runNo: string;
  siteName: string;
  status: string;
  daysRunning: number;
  daysRemaining: number;
  runStartDate: string;
  runEndDate: string;
  todayOrderCount: number;
  todaySalesAmount: number;
  todayDeliveryCount: number;
  todayReceiptCount: number;
  todayReturnCount: number;
  todayCollectionCount: number;
  todayAbnormalCount: number;
  openIssues: number;
  criticalIssues: number;
  resolvedToday: number;
  score: number;
  scoreStatus: PilotScoreStatus;
  scoreDimensions: ScoreDimensions;
  goLiveReady: boolean;
  goLiveBlockers: string[];
  scoreTrend: TrendPoint[];
}

interface DailyReport {
  id: number;
  pilot_run_id: number;
  report_date: string;
  order_count: number;
  sales_amount: string;
  delivery_count: number;
  receipt_count: number;
  return_count: number;
  collection_count: number;
  issue_count: number;
  critical_issue_count: number;
  score: number;
  score_status: string;
  score_sales: number;
  score_inventory: number;
  score_delivery: number;
  score_finance: number;
  score_approval: number;
  score_stability: number;
  generated_at: string;
}

const DEFAULT_PILOT_RUN_ID = 1;

const STATUS_LABEL: Record<string, string> = {
  GREEN: "良好",
  YELLOW: "警告",
  RED: "危险",
};

const DIMENSION_LABELS: Record<keyof ScoreDimensions, string> = {
  sales: "销售",
  inventory: "库存",
  delivery: "配送",
  finance: "财务",
  approval: "审批",
  stability: "稳定性",
};

const DIMENSION_WEIGHTS: Record<keyof ScoreDimensions, string> = {
  sales: "25%",
  inventory: "20%",
  delivery: "20%",
  finance: "15%",
  approval: "10%",
  stability: "10%",
};

function scoreBarStyle(score: number) {
  return { width: `${Math.max(0, Math.min(100, score))}%` };
}

function scoreToneClass(score: number) {
  if (score >= 80) return styles.scoreGood;
  if (score >= 60) return styles.scoreWarn;
  return styles.scoreDanger;
}

function statusLabel(status: string, t: ReturnType<typeof useLanguage>["t"]) {
  return t(`pilot.status.${status}`, STATUS_LABEL[status] ?? status);
}

function ScoreBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  return (
    <span className={`${styles.statusBadge} ${styles[getPilotStatusVariant(status)]}`}>
      {statusLabel(status, t)}
    </span>
  );
}

function ScoreGauge({ score, status }: { score: number; status: string }) {
  const { t } = useLanguage();
  return (
    <div className={`${styles.scoreGauge} ${styles[getPilotStatusVariant(status)]}`}>
      <div className={styles.scoreGaugeValue}>{score}</div>
      <div className={styles.scoreGaugeMeta}>
        <span>/ 100</span>
        <ScoreBadge status={status} />
      </div>
      <div className={styles.scoreGaugeCaption}>
        {t("pilot.todayComposite", "今日综合评分")}
      </div>
    </div>
  );
}

function DimensionBar({ label, score, weight }: { label: string; score: number; weight: string }) {
  return (
    <div className={styles.dimensionRow}>
      <span className={styles.dimensionLabel}>{label}</span>
      <div className={styles.dimensionTrack}>
        <div className={`${styles.dimensionFill} ${scoreToneClass(score)}`} style={scoreBarStyle(score)} />
      </div>
      <span className={styles.dimensionScore}>{score}</span>
      <span className={styles.dimensionWeight}>{weight}</span>
    </div>
  );
}

function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const { t } = useLanguage();
  if (!trend.length) {
    return <EmptyState compact title={t("pilot.noTrend", "暂无趋势数据")} icon={TrendingUp} />;
  }

  return (
    <div className={styles.trendScroller}>
      <div className={styles.trendChart}>
        {trend.map((p) => (
          <div key={p.date} className={styles.trendItem}>
            <div className={styles.trendScore}>{p.score}</div>
            <div
              className={`${styles.trendBar} ${scoreToneClass(p.score)}`}
              style={{ height: `${Math.max(6, Math.min(100, p.score))}%` }}
              title={`${p.date}: ${p.score} (${p.status})`}
            />
            <span className={`${styles.trendDot} ${styles[getPilotStatusVariant(p.status)]}`} />
            <div className={styles.trendDate}>{p.date.slice(5)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyReportTable({ reports }: { reports: DailyReport[] }) {
  const { t } = useLanguage();
  if (!reports.length) {
    return <EmptyState compact title={t("pilot.noReports", "暂无日报数据")} icon={FileText} />;
  }

  return (
    <div className={styles.tableScroller}>
      <table className={styles.reportTable}>
        <thead>
          <tr>
            <th>{t("pilot.date", "日期")}</th>
            <th>{t("pilot.orders", "订单")}</th>
            <th>{t("pilot.salesAmount", "销售额")}</th>
            <th>{t("pilot.delivery", "配送")}</th>
            <th>{t("pilot.returns", "退货")}</th>
            <th>{t("pilot.issueCount", "问题数")}</th>
            <th>{t("pilot.compositeScore", "综合分")}</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id}>
              <td className={styles.monoCell}>{r.report_date}</td>
              <td>{r.order_count}</td>
              <td>{formatPilotAmount(Number(r.sales_amount))}</td>
              <td>{r.delivery_count}</td>
              <td>{r.return_count}</td>
              <td>
                <span className={r.critical_issue_count > 0 ? styles.dangerText : undefined}>
                  {r.critical_issue_count > 0 ? `${r.critical_issue_count} CRIT / ` : ""}
                  {r.issue_count}
                </span>
              </td>
              <td>
                <span className={`${styles.tableScore} ${styles[getPilotStatusVariant(r.score_status)]}`}>
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

export default function PilotRunPage() {
  const { t } = useLanguage();
  const [pilotRunId] = useState(DEFAULT_PILOT_RUN_ID);
  const [dashboard, setDashboard] = useState<PilotDashboard | null>(null);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBlockers, setShowBlockers] = useState(false);
  const [showReports, setShowReports] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/uat/pilot-runs/${pilotRunId}/dashboard`, { headers: authHdr() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      setDashboard(await res.json());
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [pilotRunId]);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/uat/pilot-runs/${pilotRunId}/daily-reports?limit=14`, { headers: authHdr() });
      if (!res.ok) return;
      const data = await res.json();
      setReports(data.items ?? []);
    } catch {
      /* Preserve dashboard visibility if history is unavailable. */
    }
  }, [pilotRunId]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const [dashboardRes, reportsRes] = await Promise.all([
          fetch(`/api/uat/pilot-runs/${pilotRunId}/dashboard`, { headers: authHdr() }),
          fetch(`/api/uat/pilot-runs/${pilotRunId}/daily-reports?limit=14`, { headers: authHdr() }),
        ]);

        if (!dashboardRes.ok) {
          const body = await dashboardRes.json().catch(() => ({}));
          throw new Error(body?.message ?? `HTTP ${dashboardRes.status}`);
        }

        const nextDashboard = await dashboardRes.json();
        const nextReports = reportsRes.ok ? await reportsRes.json().catch(() => ({})) : {};

        if (!cancelled) {
          setDashboard(nextDashboard);
          setReports(Array.isArray(nextReports?.items) ? nextReports.items : []);
          setError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [pilotRunId]);

  const handleGenerateReport = async () => {
    setReporting(true);
    try {
      const res = await fetch(`/api/uat/pilot-runs/${pilotRunId}/daily-report`, {
        method: "POST",
        headers: authHdr(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchReports();
      await fetchDashboard();
    } catch (e: unknown) {
      alert(`${t("pilot.reportGenFailed", "日报生成失败")}: ${errorMessage(e)}`);
    } finally {
      setReporting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <LoadingSkeleton variant="line" rows={2} />
        <LoadingSkeleton variant="card" rows={6} />
        <LoadingSkeleton variant="card" rows={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.statePage}>
        <ErrorState message={error} onRetry={fetchDashboard} />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className={styles.statePage}>
        <EmptyState title={t("pilot.noTrend", "暂无趋势数据")} icon={Rocket} />
      </div>
    );
  }

  const dims = dashboard.scoreDimensions;
  const readiness = getPilotReadinessLabel(dashboard.goLiveReady, dashboard.goLiveBlockers.length);

  return (
    <div className={styles.page}>
      <FeedbackWidget />

      <PageHeader
        title={t("pilot.title", "试运行执行中心")}
        subtitle={`${dashboard.runNo} / ${dashboard.siteName} / ${t("pilot.daysRunning", "已运行")} ${dashboard.daysRunning} ${t("pilot.daysRemainingLabel", "天（剩余")} ${dashboard.daysRemaining} ${t("pilot.daysUnit", "天）")}`}
        breadcrumb={[t("menu.uat", "验收试运行"), t("menu.uat-pilot-run", "试运行项目")]}
        actions={(
          <button type="button" onClick={fetchDashboard} disabled={loading} className={styles.secondaryButton}>
            <RefreshCw size={14} className={loading ? styles.spin : undefined} />
            {t("pilot.refresh", "刷新")}
          </button>
        )}
      />

      <section className={styles.summaryBand}>
        <div className={styles.summaryTitleRow}>
          <div>
            <div className={styles.summaryEyebrow}>{dashboard.runStartDate} - {dashboard.runEndDate}</div>
            <div className={styles.summaryTitle}>{dashboard.siteName}</div>
          </div>
          <ScoreBadge status={dashboard.scoreStatus} />
        </div>
        <div className={styles.summaryMeta}>
          <span>{dashboard.runNo}</span>
          <span>{t("pilot.todayComposite", "今日综合评分")} {dashboard.score}</span>
          <span>{readiness.label}</span>
        </div>
      </section>

      <section className={styles.kpiGrid} aria-label={t("pilot.title", "试运行执行中心")}>
        <KpiCardV2 title={t("pilot.kpiTodayOrders", "今日订单")} value={dashboard.todayOrderCount} icon={ShoppingCart} accentColor="blue" />
        <KpiCardV2 title={t("pilot.kpiTodaySales", "今日销售额")} value={formatPilotAmount(dashboard.todaySalesAmount)} icon={TrendingUp} accentColor="green" />
        <KpiCardV2 title={t("pilot.kpiTodayDelivery", "今日配送")} value={dashboard.todayDeliveryCount} subValue={`${t("pilot.received", "已签收")} ${dashboard.todayReceiptCount}`} icon={Truck} accentColor="cyan" />
        <KpiCardV2 title={t("pilot.kpiTodayReturns", "今日退货")} value={dashboard.todayReturnCount} icon={RotateCcw} accentColor={dashboard.todayReturnCount > 0 ? "amber" : "slate"} />
        <KpiCardV2 title={t("pilot.kpiTodayCollection", "今日收款笔数")} value={dashboard.todayCollectionCount} icon={Wallet} accentColor="teal" />
        <KpiCardV2
          title={t("pilot.kpiOpenIssues", "未解决问题")}
          value={dashboard.openIssues}
          subValue={dashboard.criticalIssues > 0 ? `${t("pilot.including", "含")} ${dashboard.criticalIssues} ${t("pilot.criticalCount", "个 CRITICAL")}` : undefined}
          icon={AlertTriangle}
          accentColor={dashboard.criticalIssues > 0 ? "red" : dashboard.openIssues > 0 ? "amber" : "green"}
        />
        <KpiCardV2 title={t("pilot.kpiResolvedToday", "今日已解决")} value={dashboard.resolvedToday} icon={CheckCircle2} accentColor="green" />
        <KpiCardV2 title={t("pilot.kpiTodayAbnormal", "今日异常")} value={dashboard.todayAbnormalCount} icon={PackageCheck} accentColor={dashboard.todayAbnormalCount > 0 ? "red" : "green"} />
        <KpiCardV2 title={t("pilot.kpiGoLiveReady", "上线准备度")} value={readiness.label} icon={Rocket} accentColor={readiness.accentColor} />
      </section>

      <section className={styles.scoreGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>{t("pilot.todayComposite", "今日综合评分")}</div>
          <ScoreGauge score={dashboard.score} status={dashboard.scoreStatus} />
          {dashboard.criticalIssues > 0 && (
            <div className={styles.criticalNote}>
              <AlertTriangle size={14} />
              {t("pilot.criticalCap", "CRITICAL 问题存在，评分上限 70 分")}
            </div>
          )}
        </article>

        <article className={`${styles.panel} ${styles.dimensionPanel}`}>
          <div className={styles.panelTitle}>{t("pilot.sixDimDetail", "6 维评分明细")}</div>
          <div className={styles.dimensionList}>
            {(Object.keys(DIMENSION_LABELS) as (keyof ScoreDimensions)[]).map((key) => (
              <DimensionBar
                key={key}
                label={t(`pilot.dim.${key}`, DIMENSION_LABELS[key])}
                score={dims[key]}
                weight={DIMENSION_WEIGHTS[key]}
              />
            ))}
          </div>
          <div className={styles.panelHint}>
            {t("pilot.weightFormula", "权重：销售25% + 库存20% + 配送20% + 财务15% + 审批10% + 稳定性10%")}
          </div>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>{t("pilot.trend7d", "近 7 天评分趋势")}</div>
        <TrendChart trend={dashboard.scoreTrend} />
      </section>

      <section className={`${styles.readinessPanel} ${dashboard.goLiveReady ? styles.good : styles.warn}`}>
        <div className={styles.readinessHeader}>
          <div className={styles.readinessTitle}>
            {dashboard.goLiveReady ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>
              {dashboard.goLiveReady
                ? t("pilot.goLivePass", "上线准备度：通过")
                : `${t("pilot.goLiveBlockedPrefix", "上线准备度：存在")} ${dashboard.goLiveBlockers.length} ${t("pilot.blockersUnit", "项阻塞")}`}
            </span>
          </div>
          {!dashboard.goLiveReady && (
            <button type="button" onClick={() => setShowBlockers(!showBlockers)} className={styles.linkButton}>
              {showBlockers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showBlockers ? t("pilot.collapse", "收起") : t("pilot.viewDetails", "查看详情")}
            </button>
          )}
        </div>
        {showBlockers && !dashboard.goLiveReady && (
          <ol className={styles.blockerList}>
            {dashboard.goLiveBlockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.reportHeader}>
          <button type="button" onClick={() => setShowReports(!showReports)} className={styles.sectionToggle}>
            <FileText size={16} />
            {t("pilot.reportHistory", "日报历史")}
            {showReports ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button type="button" onClick={handleGenerateReport} disabled={reporting} className={styles.primaryButton}>
            {reporting ? <Loader2 size={13} className={styles.spin} /> : <Clock size={13} />}
            {t("pilot.genTodayReport", "生成今日日报")}
          </button>
        </div>
        {showReports && <DailyReportTable reports={reports} />}
        {!showReports && reports.length > 0 && (
          <div className={styles.panelHint}>
            {t("pilot.total", "共")} {reports.length} {t("pilot.reportsExpand", "条日报，点击\"日报历史\"展开查看")}
          </div>
        )}
        {!showReports && reports.length === 0 && (
          <div className={styles.panelHint}>{t("pilot.noReportsHint", "暂无日报，点击\"生成今日日报\"创建第一条")}</div>
        )}
      </section>
    </div>
  );
}
