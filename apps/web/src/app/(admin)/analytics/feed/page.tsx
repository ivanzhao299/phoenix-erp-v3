"use client";
import { useMemo } from "react";
import { useAbortableLoad } from "@/lib/use-abortable-load";
import { RefreshCw, Package, Truck, Users, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface Receipt {
  id: number;
  receipt_no: string;
  arrive_date: string;
  supplier_code: string;
  item_name: string;
  net_weight?: number;
  actual_qty?: number;
  amount?: number;
  status?: string;
}

interface ReceiptsResponse {
  data?: Receipt[];
  items?: Receipt[];
  list?: Receipt[];
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

function getThisMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return d.slice(0, 10);
}

function fmtNum(n: number | null | undefined) {
  if (n === null || n === undefined) return "0";
  return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 1 });
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

export default function FeedAnalyticsPage() {
  const { t } = useLanguage();

  // useAbortableLoad：快速切页/刷新自动取消旧请求（防旧覆盖新 + 省带宽）
  const { data, loading, error, reload } = useAbortableLoad<Receipt[]>(
    (signal) =>
      apiFetch<ReceiptsResponse | Receipt[]>("/api/v2/procurement/receipts?limit=100", signal).then((raw) =>
        Array.isArray(raw) ? raw : raw.data ?? raw.items ?? raw.list ?? [],
      ),
    [],
    { initial: [] },
  );
  const records = data ?? [];

  // 统计：仅在 records 变化时重算（不再每次渲染全量 filter/reduce/Set/sort）
  const { monthBatches, monthWeight, supplierCount, recent } = useMemo(() => {
    const thisMonth = getThisMonthStr();
    const monthRecords = records.filter((r) => (r.arrive_date ?? "").startsWith(thisMonth));
    const weight = monthRecords.reduce((s, r) => s + Number(r.net_weight ?? r.actual_qty ?? 0), 0);
    const suppliers = new Set(records.map((r) => r.supplier_code).filter(Boolean));
    const recentList = [...records]
      .sort((a, b) => ((b.arrive_date ?? "") > (a.arrive_date ?? "") ? 1 : -1))
      .slice(0, 10);
    return { monthBatches: monthRecords.length, monthWeight: weight, supplierCount: suppliers.size, recent: recentList };
  }, [records]);

  return (
    <div>
      <PageHeader
        title={t("analytics.feed_title", "饲料采购分析")}
        subtitle={t("analytics.feed_subtitle", "采购到货统计 · 饲料品类分布 · 供应商分析")}
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
              icon={Package}
              title={t("analytics.feed_month_batches", "本月到货批次")}
              value={monthBatches}
              sub={t("analytics.unit_batch", "批")}
              color="var(--color-accent)"
            />
            <StatCard
              icon={Truck}
              title={t("analytics.feed_month_weight", "本月到货总重量")}
              value={`${fmtNum(monthWeight)} kg`}
              sub={t("analytics.feed_net_weight_total", "净重合计")}
              color="var(--status-success)"
            />
            <StatCard
              icon={Users}
              title={t("analytics.feed_supplier_count", "供应商数量")}
              value={supplierCount}
              sub={t("analytics.feed_supplier_count_sub", "家（全部记录）")}
              color="var(--status-warning)"
            />
          </div>

          {/* 最近10条到货记录 */}
          <div className="rounded-2xl border bg-bg-card border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <span className="font-semibold text-sm text-text-muted">
                {t("analytics.feed_recent_receipts", "最近到货记录")}
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
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.col_supplier", "供应商")}</th>
                      <th className="text-left px-5 py-3 font-medium">{t("analytics.col_feed_category", "饲料品类")}</th>
                      <th className="text-right px-5 py-3 font-medium">{t("analytics.col_weight_kg", "重量（kg）")}</th>
                      <th className="text-right px-5 py-3 font-medium">{t("analytics.col_amount", "金额")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border/50 hover:bg-bg-muted/30 transition-colors"
                      >
                        <td className="px-5 py-3 text-text-muted">
                          {fmtDate(r.arrive_date)}
                        </td>
                        <td className="px-5 py-3 text-text-muted">
                          {r.supplier_code || "—"}
                        </td>
                        <td className="px-5 py-3 text-text-muted">
                          {r.item_name || "—"}
                        </td>
                        <td className="px-5 py-3 text-right text-text-muted">
                          {fmtNum(r.net_weight ?? r.actual_qty)}
                        </td>
                        <td className="px-5 py-3 text-right text-text-muted">
                          {r.amount != null ? `¥${fmtNum(r.amount)}` : "—"}
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
