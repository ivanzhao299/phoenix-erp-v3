"use client";
import { useState, useEffect } from "react";
import { RefreshCw, Store, Truck, UserCheck, ShoppingBag, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { usePermission } from "@/hooks/usePermission";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface Channel {
  id: number;
  channel_code?: string;
  channel_name?: string;
  name?: string;
  channel_type?: string;
  type?: string;
  status?: string;
  [key: string]: unknown;
}

interface Customer {
  id: number;
  customer_name?: string;
  name?: string;
  channel_type?: string;
  customer_type?: string;
  status?: string;
  [key: string]: unknown;
}

interface ApiResponse<T> {
  data?: T[];
  items?: T[];
  list?: T[];
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

// ── 渠道配置 ──────────────────────────────────────────────────────────────────

const CHANNEL_DEFS = [
  {
    type: "DIRECT",
    label: "直营门店",
    icon: Store,
    color: "#6366f1",
    desc: "公司自营，直接面向消费者",
  },
  {
    type: "DISTRIBUTOR",
    label: "经销商",
    icon: Truck,
    color: "#10b981",
    desc: "区域代理，批发分销",
  },
  {
    type: "AGENT",
    label: "代理商",
    icon: UserCheck,
    color: "#f59e0b",
    desc: "品牌代理，佣金模式",
  },
  {
    type: "ECOMMERCE",
    label: "电商",
    icon: ShoppingBag,
    color: "#8b5cf6",
    desc: "线上平台，第三方渠道",
  },
] as const;

type ChannelType = (typeof CHANNEL_DEFS)[number]["type"];

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function SalesChannelsPage() {
  const { canView } = usePermission("MENU_SALES2_CHANNEL");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [distributors, setDistributors] = useState<Customer[]>([]);
  const [channelsError, setChannelsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    setChannelsError(false);

    // 尝试拉渠道接口，失败时降级为静态卡片
    try {
      const raw = await apiFetch<ApiResponse<Channel> | Channel[]>(
        "/api/v2/sales/channels?limit=100"
      );
      let list: Channel[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else {
        list = raw.data ?? raw.items ?? raw.list ?? [];
      }
      setChannels(list);
    } catch {
      setChannelsError(true);
      setChannels([]);
    }

    // 拉经销商客户数据
    try {
      const raw = await apiFetch<ApiResponse<Customer> | Customer[]>(
        "/api/v2/sales/customers?limit=50"
      );
      let list: Customer[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else {
        list = raw.data ?? raw.items ?? raw.list ?? [];
      }
      setDistributors(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "客户数据加载失败");
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
        无权限查看渠道管理
      </div>
    );
  }

  // 按渠道类型统计客户数
  function countByType(type: ChannelType): number {
    if (!channelsError && channels.length > 0) {
      return channels.filter(
        (c) => (c.channel_type ?? c.type ?? "").toUpperCase() === type
      ).length;
    }
    return distributors.filter(
      (c) => (c.channel_type ?? c.customer_type ?? "").toUpperCase() === type
    ).length;
  }

  const recentCustomers = distributors.slice(0, 10);

  return (
    <div>
      <PageHeader
        title="渠道管理"
        subtitle="销售渠道档案 · 直营 / 经销商 / 代理商 / 电商"
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
      {loading && (
        <div className="flex items-center justify-center py-20 text-text-dim">
          <RefreshCw size={20} className="animate-spin mr-2" />
          加载中…
        </div>
      )}

      {!loading && (
        <>
          {/* 渠道分类卡片（API不存在时为静态说明，有数据时显示统计） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {CHANNEL_DEFS.map(({ type, label, icon: Icon, color, desc }) => {
              const count = countByType(type);
              return (
                <div
                  key={type}
                  className="rounded-2xl border bg-bg-card border-border p-5 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}18` }}
                    >
                      <Icon size={20} color={color} />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-text">
                        {label}
                      </div>
                      <div className="text-xs text-text-dim">{type}</div>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted leading-relaxed mb-3">
                    {desc}
                  </div>
                  <div className="text-2xl font-bold" style={{ color }}>
                    {count}
                    <span className="text-sm font-normal text-text-dim ml-1">家</span>
                  </div>
                </div>
              );
            })}
          </div>

          {channelsError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle size={16} />
              渠道专属接口暂不可用，已显示静态渠道分类，客户数据来自客户列表
            </div>
          )}

          {/* 客户列表 —— 使用全局标准 .card + .cardHeader + .table + .badge */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>
                {channelsError ? "客户列表" : "渠道客户列表"}
              </span>
            </div>
            {recentCustomers.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-dim">暂无数据</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>客户名称</th>
                      <th>渠道类型</th>
                      <th style={{ textAlign: "right" }}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCustomers.map((c) => {
                      const typeStr = (c.channel_type ?? c.customer_type ?? "").toUpperCase();
                      const def = CHANNEL_DEFS.find((d) => d.type === typeStr);
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600 }}>
                            {c.customer_name ?? c.name ?? `客户${c.id}`}
                          </td>
                          <td>
                            {def ? (
                              <span className={s.badge} style={{ color: def.color, background: `color-mix(in srgb, ${def.color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${def.color} 30%, transparent)` }}>
                                {def.label}
                              </span>
                            ) : (
                              <span className={`${s.badge} ${s.badgeNeutral}`}>{typeStr || "—"}</span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <span className={`${s.badge} ${
                              c.status === "ACTIVE" ? s.badgeSuccess
                              : c.status === "FROZEN" ? s.badgeDanger
                              : s.badgeNeutral
                            }`}>
                              {c.status === "ACTIVE" ? "启用" : c.status === "FROZEN" ? "冻结" : c.status ?? "—"}
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
