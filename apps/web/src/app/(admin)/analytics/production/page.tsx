"use client";
import { useMemo } from "react";
import { useAbortableLoad } from "@/lib/use-abortable-load";
import { RefreshCw, Egg, TrendingDown, Calendar, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface DailyReport {
  id: number;
  report_date?: string;
  log_date?: string;
  flock_no?: string;
  house_code?: string;
  total_eggs_produced?: number;
  eggs_produced?: number;
  dead_count?: number;
  culled_count?: number;
  mortality_rate?: number;
  [key: string]: unknown;
}

interface ReportResponse {
  data?: DailyReport[];
  items?: DailyReport[];
  list?: DailyReport[];
  total?: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === "undefined") return "";
  return (
    sessionStorage.getItem("phoenix_token") ||
    localStorage.getItem("phoenix_token") ||
    ""
  );
}

async function apiFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 工具 ─────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return d.slice(0, 10);
}

function fmtNum(n: number | null | undefined, dec = 0) {
  if (n === null || n === undefined) return "0";
  return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: dec });
}

function getEggs(r: DailyReport): number {
  return Number(r.total_eggs_produced ?? r.eggs_produced ?? 0);
}

function getDate(r: DailyReport): string {
  return r.report_date ?? r.log_date ?? "";
}

function getMortality(r: DailyReport): number {
  if (r.mortality_rate != null) return Number(r.mortality_rate);
  const dead = Number(r.dead_count ?? 0) + Number(r.culled_count ?? 0);
  return dead;
}

// ── 统计卡片 ──────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  title,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border bg-bg-card border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-text-muted">{title}</span>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <Icon size={18} color={color} />
        </div>
      </div>
      <div className="text-2xl font-bold text-text">{value}</div>
      {sub && <div className="text-xs text-text-dim mt-1">{sub}</div>}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function ProductionAnalyticsPage() {
  const { t } = useLanguage();

  // useAbortableLoad：快速切页/刷新自动取消旧请求（防旧覆盖新 + 省带宽）
  const { data, loading, error, reload } = useAbortableLoad<DailyReport[]>(
    (signal) =>
      apiFetch<ReportResponse | DailyReport[]>("/api/breeding/daily-reports?limit=30", signal).then((raw) =>
        Array.isArray(raw) ? raw : raw.data ?? raw.items ?? raw.list ?? [],
      ),
    [],
    { initial: [] },
  );
  const reports = data ?? [];

  // 统计：仅在 reports 变化时重算（不再每次渲染全量 reduce/sort）
  const { totalEggs, avgDailyEggs, avgMortality, recent } = useMemo(() => {
    const total = reports.reduce((s, r) => s + getEggs(r), 0);
    const avgDaily = reports.length > 0 ? total / reports.length : 0;
    const avgMort = reports.length > 0 ? reports.reduce((s, r) => s + getMortality(r), 0) / reports.length : 0;
    const recentList = [...reports].sort((a, b) => (getDate(b) > getDate(a) ? 1 : -1)).slice(0, 10);
    return { totalEggs: total, avgDailyEggs: avgDaily, avgMortality: avgMort, recent: recentList };
  }, [reports]);

  return (
    <div>
      <PageHeader
        title={t("analytics.production_title", "生产报表")}
        subtitle={t("analytics.production_subtitle", "日产蛋量趋势 · 死淘率分析 · 饲料转化率")}
        actions={
          <button
            onClick={() => reload()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-bg-card text-sm text-text-muted hover:bg-bg-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {t("analytics.refresh", "刷新")}
          </button>
        }
      />

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* 加载中 */}
      {loading && !error && (
        <div className="flex items-center justify-center py-20 text-text-dim">
          <RefreshCw size={20} className="animate-spin mr-2" />
          {t("analytics.loading", "加载中…")}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              icon={Egg}
              title={t("analytics.production_total_eggs_30d", "近30天总产蛋量")}
              value={fmtNum(totalEggs)}
              sub={t("analytics.unit_egg", "枚")}
              color="var(--color-accent)"
            />
            <StatCard
              icon={Calendar}
              title={t("analytics.production_avg_daily_eggs", "日均产蛋量")}
              value={fmtNum(avgDailyEggs, 0)}
              sub={t("analytics.unit_egg_per_day", "枚/天")}
              color="var(--status-success)"
            />
            <StatCard
              icon={TrendingDown}
              title={t("analytics.production_avg_mortality", "平均死淘数")}
              value={fmtNum(avgMortality, 1)}
              sub={t("analytics.production_avg_mortality_sub", "只/天（死亡+淘汰）")}
              color="var(--status-warning)"
            />
          </div>

          {/* 最近10天日报 */}
          <div className="rounded-2xl border bg-bg-card border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <span className="font-semibold text-sm text-text-muted">
                {t("analytics.production_recent_reports", "最近日报记录")}
              </span>
            </div>
            {recent.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-dim">{t("analytics.no_data", "暂无数据")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-muted border-b border-border">
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.col_date", "日期")}</th>
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.col_house", "鸡舍")}</th>
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.col_flock", "鸡群")}</th>
                      <th className="text-right px-5 py-3 font-medium">{t("analytics.col_eggs_produced", "产蛋数（枚）")}</th>
                      <th className="text-right px-5 py-3 font-medium">{t("analytics.col_mortality_count", "死淘数（只）")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border/50 hover:bg-bg-muted/30 transition-colors"
                      >
                        <td className="px-5 py-3 text-text-muted">
                          {fmtDate(getDate(r))}
                        </td>
                        <td className="px-5 py-3 text-text-muted">
                          {r.house_code ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-text-muted">
                          {r.flock_no ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-text-muted">
                          {fmtNum(getEggs(r))}
                        </td>
                        <td className="px-5 py-3 text-right text-text-muted">
                          {fmtNum(Number(r.dead_count ?? 0) + Number(r.culled_count ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
