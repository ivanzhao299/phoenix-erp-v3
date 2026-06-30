"use client";
import { useAbortableLoad } from "@/lib/use-abortable-load";
import { RefreshCw, Layers, AlertTriangle, BarChart2, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface Batch {
  id: number;
  batch_no: string;
  sku_code?: string;
  grade?: string;
  quantity_kg?: number;
  qty?: number;
  grading_date?: string;
  house_code?: string;
  status?: string;
  remaining_days?: number;
  expiry_date?: string;
}

// 后端聚合返回（/api/inventory/batches/summary）—— 服务端 reduce 覆盖全量在范围批次
interface InvSummary {
  totalCount: number;
  activeCount: number;
  totalQtyKg: number;
  expiringCount: number;
  gradeBuckets: { AA: number; A: number; B: number; C: number };
  recent: Batch[];
}

const EMPTY_SUMMARY: InvSummary = {
  totalCount: 0, activeCount: 0, totalQtyKg: 0, expiringCount: 0,
  gradeBuckets: { AA: 0, A: 0, B: 0, C: 0 }, recent: [],
};

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

function fmtNum(n: number | null | undefined, dec = 1) {
  if (n === null || n === undefined) return "0";
  return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: dec });
}

function getRemainingDays(batch: Batch): number | null {
  if (batch.remaining_days != null) return batch.remaining_days;
  if (batch.expiry_date) {
    const diff = Math.floor(
      (new Date(batch.expiry_date).getTime() - Date.now()) / 86400000
    );
    return diff;
  }
  return null;
}

const GRADE_COLORS: Record<string, string> = {
  AA: "var(--color-accent)",
  A: "var(--status-success)",
  B: "var(--status-warning)",
  C: "var(--status-danger)",
};

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

export default function InventoryAnalyticsPage() {
  const { t } = useLanguage();

  // 取数改为后端聚合端点 /api/inventory/batches/summary（服务端 reduce，KPI 覆盖全量在范围批次，
  // 不再拉 200 行客户端 reduce），并用 useAbortableLoad：快速切页/刷新自动取消旧请求，防旧覆盖新 + 省带宽。
  const { data, loading, error, reload } = useAbortableLoad<InvSummary>(
    (signal) =>
      apiFetch<{ code: number; data: InvSummary }>("/api/inventory/batches/summary", signal)
        .then((r) => r.data ?? EMPTY_SUMMARY),
    [],
    { initial: EMPTY_SUMMARY },
  );
  const { activeCount, totalQtyKg, expiringCount, gradeBuckets, recent } = data ?? EMPTY_SUMMARY;

  return (
    <div>
      <PageHeader
        title={t("analytics.inventory_title", "库存周转分析")}
        subtitle={t("analytics.inventory_subtitle", "批次库存概览 · 等级分布 · 临期预警")}
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
              icon={Layers}
              title={t("analytics.inventory_active_batches", "活跃批次数")}
              value={activeCount}
              sub={t("analytics.unit_batch", "批")}
              color="var(--color-accent)"
            />
            <StatCard
              icon={BarChart2}
              title={t("analytics.inventory_total_qty", "总库存量")}
              value={`${fmtNum(totalQtyKg)} kg`}
              sub={t("analytics.inventory_all_batches_total", "所有批次合计")}
              color="var(--status-success)"
            />
            <StatCard
              icon={AlertTriangle}
              title={t("analytics.inventory_expiring_batches", "临期批次")}
              value={expiringCount}
              sub={t("analytics.inventory_remaining_days_lt7", "剩余天数 < 7 天")}
              color="var(--status-danger)"
            />
          </div>

          {/* 等级分布 */}
          <div className="rounded-2xl border bg-bg-card border-border shadow-sm mb-6 p-5">
            <div className="font-semibold text-sm text-text-muted mb-4">
              {t("analytics.inventory_grade_dist", "等级分布")}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["AA", "A", "B", "C"] as const).map((g) => (
                <div
                  key={g}
                  className="rounded-xl p-4 text-center"
                  style={{ background: `${GRADE_COLORS[g]}12`, border: `1px solid ${GRADE_COLORS[g]}30` }}
                >
                  <div
                    className="text-2xl font-bold mb-1"
                    style={{ color: GRADE_COLORS[g] }}
                  >
                    {gradeBuckets[g]}
                  </div>
                  <div className="text-xs font-semibold" style={{ color: GRADE_COLORS[g] }}>
                    {g} {t("analytics.grade_suffix", "级")}
                  </div>
                  <div className="text-xs text-text-dim mt-0.5">{t("analytics.unit_batches", "批次")}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 最近批次记录 */}
          <div className="rounded-2xl border bg-bg-card border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <span className="font-semibold text-sm text-text-muted">
                {t("analytics.inventory_recent_batches", "最近批次记录")}
              </span>
            </div>
            {recent.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-dim">{t("analytics.no_data", "暂无数据")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-muted border-b border-border">
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.col_batch_no", "批次号")}</th>
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.col_grade", "等级")}</th>
                      <th className="text-right px-5 py-3 font-medium">{t("analytics.col_stock_qty_kg", "库存量（kg）")}</th>
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.col_inbound_date", "入库日期")}</th>
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.col_source_house", "来源鸡舍")}</th>
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.col_status", "状态")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((b) => {
                      const days = getRemainingDays(b);
                      return (
                        <tr
                          key={b.id}
                          className="border-b border-border/50 hover:bg-bg-muted/30 transition-colors"
                        >
                          <td className="px-5 py-3 font-mono text-text-muted">
                            {b.batch_no}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className="text-xs font-semibold px-2 py-0.5 rounded-full"
                              style={{
                                background: `${GRADE_COLORS[b.grade?.toUpperCase() ?? ""] ?? "var(--slate-400)"}18`,
                                color: GRADE_COLORS[b.grade?.toUpperCase() ?? ""] ?? "var(--slate-400)",
                              }}
                            >
                              {b.grade ?? b.sku_code ?? "—"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-text-muted">
                            {fmtNum(b.quantity_kg ?? b.qty)}
                          </td>
                          <td className="px-5 py-3 text-text-muted">
                            {fmtDate(b.grading_date)}
                          </td>
                          <td className="px-5 py-3 text-text-muted">
                            {b.house_code ?? "—"}
                          </td>
                          <td className="px-5 py-3">
                            {days !== null && days < 7 ? (
                              <span className="text-xs font-semibold text-red-500 bg-danger/10 px-2 py-0.5 rounded-full">
                                {t("analytics.inventory_expiring_label", "临期")} ({days}{t("analytics.unit_day", "天")})
                              </span>
                            ) : (
                              <span className="text-xs text-text-muted">{b.status ?? "—"}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
