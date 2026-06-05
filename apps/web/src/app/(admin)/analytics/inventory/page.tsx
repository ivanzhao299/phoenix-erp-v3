"use client";
import { useState, useEffect } from "react";
import { RefreshCw, Layers, AlertTriangle, BarChart2, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";

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

interface BatchResponse {
  data?: Batch[];
  items?: Batch[];
  list?: Batch[];
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
  AA: "#6366f1",
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
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const raw = await apiFetch<BatchResponse | Batch[]>(
        "/api/wms/batches?limit=100"
      );
      let list: Batch[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else {
        list = raw.data ?? raw.items ?? raw.list ?? [];
      }
      setBatches(list);
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
  const activeBatches = batches.filter(
    (b) => !b.status || b.status === "AVAILABLE" || b.status === "LOCKED"
  );
  const totalQty = batches.reduce(
    (s, b) => s + Number(b.quantity_kg ?? b.qty ?? 0),
    0
  );
  const expiringBatches = batches.filter((b) => {
    const days = getRemainingDays(b);
    return days !== null && days < 7;
  });

  // 等级分布
  const gradeMap: Record<string, number> = { AA: 0, A: 0, B: 0, C: 0 };
  batches.forEach((b) => {
    const g = (b.grade ?? b.sku_code ?? "").toUpperCase();
    if (g.includes("AA")) gradeMap["AA"]++;
    else if (g.includes("A")) gradeMap["A"]++;
    else if (g.includes("B")) gradeMap["B"]++;
    else if (g.includes("C")) gradeMap["C"]++;
  });

  const recent = [...batches]
    .sort((a, b) => (b.grading_date ?? "") > (a.grading_date ?? "") ? 1 : -1)
    .slice(0, 10);

  return (
    <div>
      <PageHeader
        title="库存周转分析"
        subtitle="批次库存概览 · 等级分布 · 临期预警"
        actions={
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-bg-card text-sm text-text-muted hover:bg-bg-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            刷新
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
          加载中…
        </div>
      )}

      {!loading && !error && (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              icon={Layers}
              title="活跃批次数"
              value={activeBatches.length}
              sub="批"
              color="#6366f1"
            />
            <StatCard
              icon={BarChart2}
              title="总库存量"
              value={`${fmtNum(totalQty)} kg`}
              sub="所有批次合计"
              color="var(--status-success)"
            />
            <StatCard
              icon={AlertTriangle}
              title="临期批次"
              value={expiringBatches.length}
              sub="剩余天数 < 7 天"
              color="var(--status-danger)"
            />
          </div>

          {/* 等级分布 */}
          <div className="rounded-2xl border bg-bg-card border-border shadow-sm mb-6 p-5">
            <div className="font-semibold text-sm text-text-muted mb-4">
              等级分布
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
                    {gradeMap[g]}
                  </div>
                  <div className="text-xs font-semibold" style={{ color: GRADE_COLORS[g] }}>
                    {g} 级
                  </div>
                  <div className="text-xs text-text-dim mt-0.5">批次</div>
                </div>
              ))}
            </div>
          </div>

          {/* 最近批次记录 */}
          <div className="rounded-2xl border bg-bg-card border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <span className="font-semibold text-sm text-text-muted">
                最近批次记录
              </span>
            </div>
            {recent.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-dim">暂无数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-muted border-b border-border">
                      <th className="text-left px-5 py-3 font-medium">批次号</th>
                      <th className="text-left px-5 py-3 font-medium">等级</th>
                      <th className="text-right px-5 py-3 font-medium">库存量（kg）</th>
                      <th className="text-left px-5 py-3 font-medium">入库日期</th>
                      <th className="text-left px-5 py-3 font-medium">来源鸡舍</th>
                      <th className="text-left px-5 py-3 font-medium">状态</th>
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
                                background: `${GRADE_COLORS[b.grade?.toUpperCase() ?? ""] ?? "#94a3b8"}18`,
                                color: GRADE_COLORS[b.grade?.toUpperCase() ?? ""] ?? "#94a3b8",
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
                                临期 ({days}天)
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
