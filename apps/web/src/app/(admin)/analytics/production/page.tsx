"use client";
import { useState, useEffect } from "react";
import { RefreshCw, Egg, TrendingDown, Calendar, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";

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

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
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
    <div className="rounded-2xl border bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500 dark:text-slate-400">{title}</span>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <Icon size={18} color={color} />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function ProductionAnalyticsPage() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const raw = await apiFetch<ReportResponse | DailyReport[]>(
        "/api/breeding/daily-reports?limit=30"
      );
      let list: DailyReport[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else {
        list = raw.data ?? raw.items ?? raw.list ?? [];
      }
      setReports(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // 统计
  const totalEggs = reports.reduce((s, r) => s + getEggs(r), 0);
  const avgDailyEggs = reports.length > 0 ? totalEggs / reports.length : 0;
  const avgMortality =
    reports.length > 0
      ? reports.reduce((s, r) => s + getMortality(r), 0) / reports.length
      : 0;

  const recent = [...reports]
    .sort((a, b) => getDate(b) > getDate(a) ? 1 : -1)
    .slice(0, 10);

  return (
    <div>
      <PageHeader
        title="生产报表"
        subtitle="日产蛋量趋势 · 死淘率分析 · 饲料转化率"
        actions={
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            刷新
          </button>
        }
      />

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* 加载中 */}
      {loading && !error && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw size={20} className="animate-spin mr-2" />
          加载中…
        </div>
      )}

      {!loading && !error && (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              icon={Egg}
              title="近30天总产蛋量"
              value={fmtNum(totalEggs)}
              sub="枚"
              color="#6366f1"
            />
            <StatCard
              icon={Calendar}
              title="日均产蛋量"
              value={fmtNum(avgDailyEggs, 0)}
              sub="枚/天"
              color="#10b981"
            />
            <StatCard
              icon={TrendingDown}
              title="平均死淘数"
              value={fmtNum(avgMortality, 1)}
              sub="只/天（死亡+淘汰）"
              color="#f59e0b"
            />
          </div>

          {/* 最近10天日报 */}
          <div className="rounded-2xl border bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">
                最近日报记录
              </span>
            </div>
            {recent.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">暂无数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      <th className="text-left px-5 py-3 font-medium">日期</th>
                      <th className="text-left px-5 py-3 font-medium">鸡舍</th>
                      <th className="text-left px-5 py-3 font-medium">鸡群</th>
                      <th className="text-right px-5 py-3 font-medium">产蛋数（枚）</th>
                      <th className="text-right px-5 py-3 font-medium">死淘数（只）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                      >
                        <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                          {fmtDate(getDate(r))}
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                          {r.house_code ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                          {r.flock_no ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                          {fmtNum(getEggs(r))}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-400">
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
