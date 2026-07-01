"use client";
import type { CSSProperties } from "react";
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

const pageStyle: CSSProperties = {
  padding: "24px 32px 40px",
  maxWidth: 1440,
  margin: "0 auto",
};

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-sm)",
};

const mutedText: CSSProperties = {
  color: "var(--text-secondary)",
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
    <div style={{ ...cardStyle, padding: 18, minHeight: 126, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <span style={{ ...mutedText, fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>{title}</span>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${color}18`,
            flex: "0 0 auto",
          }}
        >
          <Icon size={18} color={color} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", letterSpacing: 0, lineHeight: 1.15 }}>{value}</div>
        {sub && <div style={{ ...mutedText, fontSize: 12, marginTop: 4 }}>{sub}</div>}
      </div>
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
    <div style={pageStyle}>
      <PageHeader
        title={t("analytics.inventory_title", "库存周转分析")}
        subtitle={t("analytics.inventory_subtitle", "批次库存概览 · 等级分布 · 临期预警")}
        actions={
          <button
            onClick={() => reload()}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {t("analytics.refresh", "刷新")}
          </button>
        }
      />

      {/* 错误提示 */}
      {error && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid color-mix(in srgb,var(--status-danger) 25%,transparent)", background: "color-mix(in srgb,var(--status-danger) 10%,var(--bg-card))", color: "var(--status-danger)", fontSize: 13 }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* 加载中 */}
      {loading && !error && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "72px 0", color: "var(--text-secondary)", fontSize: 14 }}>
          <RefreshCw size={20} style={{ animation: "spin 1s linear infinite", marginRight: 8 }} />
          {t("analytics.loading", "加载中…")}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* 统计卡片 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16, marginBottom: 18 }}>
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
          <div style={{ ...cardStyle, marginBottom: 18, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginBottom: 14 }}>
              {t("analytics.inventory_grade_dist", "等级分布")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              {(["AA", "A", "B", "C"] as const).map((g) => (
                <div
                  key={g}
                  style={{
                    minHeight: 86,
                    borderRadius: "var(--radius-md)",
                    padding: 14,
                    textAlign: "center",
                    background: `${GRADE_COLORS[g]}12`,
                    border: `1px solid ${GRADE_COLORS[g]}30`,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{ color: GRADE_COLORS[g], fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}
                  >
                    {gradeBuckets[g]}
                  </div>
                  <div style={{ color: GRADE_COLORS[g], fontSize: 13, fontWeight: 800, marginTop: 6 }}>
                    {g} {t("analytics.grade_suffix", "级")}
                  </div>
                  <div style={{ ...mutedText, fontSize: 12, marginTop: 2 }}>{t("analytics.unit_batches", "批次")}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 最近批次记录 */}
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                {t("analytics.inventory_recent_batches", "最近批次记录")}
              </span>
            </div>
            {recent.length === 0 ? (
              <div style={{ padding: "48px 16px", textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>{t("analytics.no_data", "暂无数据")}</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 860 }}>
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "12px 18px", fontWeight: 800 }}>{t("analytics.col_batch_no", "批次号")}</th>
                      <th style={{ textAlign: "left", padding: "12px 18px", fontWeight: 800 }}>{t("analytics.col_grade", "等级")}</th>
                      <th style={{ textAlign: "right", padding: "12px 18px", fontWeight: 800 }}>{t("analytics.col_stock_qty_kg", "库存量（kg）")}</th>
                      <th style={{ textAlign: "left", padding: "12px 18px", fontWeight: 800 }}>{t("analytics.col_inbound_date", "入库日期")}</th>
                      <th style={{ textAlign: "left", padding: "12px 18px", fontWeight: 800 }}>{t("analytics.col_source_house", "来源鸡舍")}</th>
                      <th style={{ textAlign: "left", padding: "12px 18px", fontWeight: 800 }}>{t("analytics.col_status", "状态")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((b) => {
                      const days = getRemainingDays(b);
                      return (
                        <tr
                          key={b.id}
                          style={{ borderBottom: "1px solid var(--border)" }}
                        >
                          <td style={{ padding: "11px 18px", fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {b.batch_no}
                          </td>
                          <td style={{ padding: "11px 18px" }}>
                            <span
                              style={{
                                background: `${GRADE_COLORS[b.grade?.toUpperCase() ?? ""] ?? "var(--slate-400)"}18`,
                                color: GRADE_COLORS[b.grade?.toUpperCase() ?? ""] ?? "var(--slate-400)",
                                display: "inline-flex",
                                alignItems: "center",
                                minWidth: 36,
                                justifyContent: "center",
                                padding: "3px 8px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              {b.grade ?? b.sku_code ?? "—"}
                            </span>
                          </td>
                          <td style={{ padding: "11px 18px", textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {fmtNum(b.quantity_kg ?? b.qty)}
                          </td>
                          <td style={{ padding: "11px 18px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {fmtDate(b.grading_date)}
                          </td>
                          <td style={{ padding: "11px 18px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {b.house_code ?? "—"}
                          </td>
                          <td style={{ padding: "11px 18px", whiteSpace: "nowrap" }}>
                            {days !== null && days < 7 ? (
                              <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 999, fontSize: 12, fontWeight: 800, color: "var(--status-danger)", background: "color-mix(in srgb,var(--status-danger) 10%,transparent)" }}>
                                {t("analytics.inventory_expiring_label", "临期")} ({days}{t("analytics.unit_day", "天")})
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{b.status ?? "—"}</span>
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
