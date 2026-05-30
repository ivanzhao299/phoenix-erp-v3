"use client";
import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle, Lock, AlertTriangle, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { usePermission } from "@/hooks/usePermission";

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface Customer {
  id: number;
  customer_name?: string;
  name?: string;
  credit_limit?: number;
  credit_used?: number;
  risk_flag?: string;
  status?: string;
  [key: string]: unknown;
}

interface CustomerResponse {
  data?: Customer[];
  items?: Customer[];
  list?: Customer[];
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

function fmtMoney(n: number | null | undefined) {
  if (n === null || n === undefined) return "¥0";
  return `¥${Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function getUsageRate(c: Customer): number {
  const limit = Number(c.credit_limit ?? 0);
  const used = Number(c.credit_used ?? 0);
  if (limit <= 0) return 0;
  return used / limit;
}

function getCreditStatus(c: Customer): { label: string; color: string; bg: string } {
  if (c.status === "FROZEN" || c.risk_flag === "BLACKLIST") {
    return { label: "冻结", color: "#ef4444", bg: "#ef444420" };
  }
  const rate = getUsageRate(c);
  if (rate > 0.8) {
    return { label: "预警", color: "#f59e0b", bg: "#f59e0b20" };
  }
  return { label: "正常", color: "#10b981", bg: "#10b98120" };
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
    <div className="rounded-2xl border bg-bg-card border-border/30 p-5 shadow-sm">
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

// ── 进度条 ────────────────────────────────────────────────────────────────────

function CreditBar({ rate }: { rate: number }) {
  const pct = Math.min(100, rate * 100);
  const color = pct > 80 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#10b981";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-medium w-10 text-right" style={{ color }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function CustomerCreditPage() {
  const { canView } = usePermission("MENU_SALES2_CREDIT");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const raw = await apiFetch<CustomerResponse | Customer[]>(
        "/api/v2/sales/customers?limit=50"
      );
      let list: Customer[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else {
        list = raw.data ?? raw.items ?? raw.list ?? [];
      }
      setCustomers(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!canView) {
    return (
      <div className="flex items-center justify-center py-20 text-text-dim">
        无权限查看信用管理
      </div>
    );
  }

  // 统计
  const normalCount = customers.filter((c) => getCreditStatus(c).label === "正常").length;
  const frozenCount = customers.filter((c) => getCreditStatus(c).label === "冻结").length;
  const warnCount = customers.filter((c) => getCreditStatus(c).label === "预警").length;

  return (
    <div>
      <PageHeader
        title="信用管理"
        subtitle="客户信用额度 · 冻结状态 · 逾期预警 · 信用台账"
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
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
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
              icon={CheckCircle}
              title="正常客户"
              value={normalCount}
              sub="信用使用率 ≤ 80%"
              color="#10b981"
            />
            <StatCard
              icon={Lock}
              title="冻结客户"
              value={frozenCount}
              sub="账户已冻结"
              color="#ef4444"
            />
            <StatCard
              icon={AlertTriangle}
              title="信用预警"
              value={warnCount}
              sub="信用使用率 > 80%"
              color="#f59e0b"
            />
          </div>

          {/* 客户信用列表 */}
          <div className="rounded-2xl border bg-bg-card border-border/30 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/30">
              <span className="font-semibold text-sm text-text">
                客户信用列表
              </span>
            </div>
            {customers.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-dim">暂无数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-muted border-b border-border/30">
                      <th className="text-left px-5 py-3 font-medium">客户名称</th>
                      <th className="text-right px-5 py-3 font-medium">信用额度</th>
                      <th className="text-right px-5 py-3 font-medium">已用额度</th>
                      <th className="text-left px-5 py-3 font-medium w-48">使用率</th>
                      <th className="text-left px-5 py-3 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => {
                      const status = getCreditStatus(c);
                      const rate = getUsageRate(c);
                      return (
                        <tr
                          key={c.id}
                          className="border-b border-border/30 hover:bg-bg-muted hover:bg-bg-muted/30 transition-colors"
                        >
                          <td className="px-5 py-3 font-medium text-text">
                            {c.customer_name ?? c.name ?? `客户${c.id}`}
                          </td>
                          <td className="px-5 py-3 text-right text-text-muted">
                            {fmtMoney(c.credit_limit)}
                          </td>
                          <td className="px-5 py-3 text-right text-text">
                            {fmtMoney(c.credit_used)}
                          </td>
                          <td className="px-5 py-3 w-48">
                            <CreditBar rate={rate} />
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className="text-xs font-semibold px-2 py-0.5 rounded-full"
                              style={{ color: status.color, background: status.bg }}
                            >
                              {status.label}
                            </span>
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
