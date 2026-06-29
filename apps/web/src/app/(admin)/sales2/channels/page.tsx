"use client";
import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { RefreshCw, Store, Truck, UserCheck, ShoppingBag, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { usePermission } from "@/hooks/usePermission";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";
// g200b/d 模板 token(2026-06-19)
import {
  secondaryActionButton, inlineAlert,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
} from "@/components/design-system/cockpit-styles";

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

// g200d(2026-06-19):color hex/var → tone enum,4 卡走 kpiCardCompact(tone)。
// 按 [feedback_avoid_emoji_color_card]:禁用浅色背景图标盒 + hex 大数字。
const CHANNEL_DEFS = [
  { type: "DIRECT",      label: "直营门店", icon: Store,        tone: "info"    as const, desc: "公司自营，直接面向消费者", color: "var(--status-info)"    },
  { type: "DISTRIBUTOR", label: "经销商",   icon: Truck,        tone: "success" as const, desc: "区域代理，批发分销",       color: "var(--status-success)" },
  { type: "AGENT",       label: "代理商",   icon: UserCheck,    tone: "warning" as const, desc: "品牌代理，佣金模式",       color: "var(--status-warning)" },
  { type: "ECOMMERCE",   label: "电商",     icon: ShoppingBag,  tone: "brand"   as const, desc: "线上平台，第三方渠道",     color: "var(--color-primary)"  },
] as const;

type ChannelType = (typeof CHANNEL_DEFS)[number]["type"];

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function SalesChannelsPage() {
  const { t } = useLanguage();
  const { canView } = usePermission("MENU_SALES2_CHANNEL");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [distributors, setDistributors] = useState<Customer[]>([]);
  const [channelsError, setChannelsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
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
      setError(e instanceof Error ? e.message : t('ui.客户数据加载失败','客户数据加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return (
      <div className="flex items-center justify-center py-20 text-text-dim">
        {t('ui.无权限查看渠道管理','无权限查看渠道管理')}
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
        title={t('ui.渠道管理','渠道管理')}
        subtitle={t('ui.销售渠道档案 · 直营 / 经销商 / 代理商 / 电商','销售渠道档案 · 直营 / 经销商 / 代理商 / 电商')}
        actions={
          <button onClick={() => void load()} disabled={loading} style={{ ...secondaryActionButton, opacity: loading ? 0.5 : 1 }}>
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {t('ui.刷新','刷新')}
          </button>
        }
      />

      {/* 错误提示 */}
      {error && (
        <div style={{ ...inlineAlert('danger'), marginBottom: 16 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* 加载中 */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-text-dim">
          <RefreshCw size={20} className="animate-spin mr-2" />
          {t('ui.加载中…','加载中…')}
        </div>
      )}

      {!loading && (
        <>
          {/* g200d(2026-06-19):4 渠道分类卡 emoji-color anti-pattern → kpiCardCompact(tone)。
              白底 + 左 3px 色条 + 13px label + 20px MONO 数字。同 g200a 参考页风格。 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
            gap: 12,
            marginBottom: 20,
          }}>
            {CHANNEL_DEFS.map(({ type, label, icon: Icon, tone, desc }) => {
              const count = countByType(type);
              return (
                <div key={type} style={kpiCardCompact(tone)}>
                  <div style={kpiCardCompactLabel}>
                    <Icon size={13} /> {label}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>{type}</span>
                  </div>
                  <div style={kpiCardCompactValue(tone)}>
                    {count}
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 4 }}>家</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</div>
                </div>
              );
            })}
          </div>

          {channelsError && (
            <div style={{ ...inlineAlert('warning'), marginBottom: 16 }}>
              <AlertCircle size={16} /> {t('ui.渠道专属接口暂不可用，已显示静态渠道分类，客户数据来自客户列表','渠道专属接口暂不可用，已显示静态渠道分类，客户数据来自客户列表')}
            </div>
          )}

          {/* 客户列表 —— 使用全局标准 .card + .cardHeader + .table + .badge */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>
                {channelsError ? t('ui.客户列表','客户列表') : t('ui.渠道客户列表','渠道客户列表')}
              </span>
            </div>
            {recentCustomers.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-dim">{t('ui.暂无数据','暂无数据')}</div>
            ) : (
              <div className={u.scrollX}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>{t('ui.客户名称','客户名称')}</th>
                      <th>{t('ui.渠道类型','渠道类型')}</th>
                      <th className={u.tar}>{t('ui.状态','状态')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCustomers.map((c) => {
                      const typeStr = (c.channel_type ?? c.customer_type ?? "").toUpperCase();
                      const def = CHANNEL_DEFS.find((d) => d.type === typeStr);
                      return (
                        <tr key={c.id}>
                          <td className={u.fw600}>
                            {c.customer_name ?? c.name ?? `${t('ui.客户','客户')}${c.id}`}
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
                          <td className={u.tar}>
                            <span className={`${s.badge} ${
                              c.status === "ACTIVE" ? s.badgeSuccess
                              : c.status === "FROZEN" ? s.badgeDanger
                              : s.badgeNeutral
                            }`}>
                              {c.status === "ACTIVE" ? t('ui.启用','启用') : c.status === "FROZEN" ? t('ui.冻结','冻结') : c.status ?? "—"}
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
