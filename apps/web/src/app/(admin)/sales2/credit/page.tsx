"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, CheckCircle, Lock, AlertTriangle, AlertCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { usePermission } from "@/hooks/usePermission";
// g200b 模板 token(2026-06-19)
import {
  secondaryActionButton, inlineAlert,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  actionPill, moneyCell, MONO_FONT,
  tableContainer, tableHeaderCell, tableBodyCell,
} from "@/components/design-system/cockpit-styles";
import { useLanguage } from "@/contexts/LanguageContext";

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
  // g200b(2026-06-19):hex 写死颜色 → color-mix var(--status-*) 跟随主题
  if (c.status === "FROZEN" || c.risk_flag === "BLACKLIST") {
    return { label: "冻结", color: "var(--status-danger)",  bg: "color-mix(in srgb, var(--status-danger) 12%, transparent)" };
  }
  const rate = getUsageRate(c);
  if (rate > 0.8) {
    return { label: "预警", color: "var(--status-warning)", bg: "color-mix(in srgb, var(--status-warning) 12%, transparent)" };
  }
  return {   label: "正常", color: "var(--status-success)", bg: "color-mix(in srgb, var(--status-success) 12%, transparent)" };
}

// ── 统计卡片 — g200b(2026-06-19) kpiCardCompact 替代 GlobalKpiCard ──────────
// GlobalKpiCard 右上图标盒 + 大字号与 g200a 的 cash-accounts/expenses 风格不一致。

function StatCard({
  icon: Icon,
  title,
  value,
  sub,
  tone,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  sub?: string;
  tone: 'success' | 'warning' | 'danger' | 'brand' | 'info' | 'default';
}) {
  return (
    <div style={kpiCardCompact(tone)}>
      <div style={kpiCardCompactLabel}>
        <Icon size={13} /> {title}
      </div>
      <div style={kpiCardCompactValue(tone)}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  );
}

// ── 进度条 ────────────────────────────────────────────────────────────────────

function CreditBar({ rate }: { rate: number }) {
  const pct = Math.min(100, rate * 100);
  const color = pct > 80 ? "var(--status-danger)" : pct > 60 ? "var(--status-warning)" : "var(--status-success)";
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
  const { t } = useLanguage();
  const { canView } = usePermission("MENU_SALES2_CREDIT");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
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
      setError(e instanceof Error ? e.message : t('ui.加载失败','加载失败'));
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
        {t('ui.无权限查看信用管理','无权限查看信用管理')}
      </div>
    );
  }

  // 统计
  const { normalCount, frozenCount, warnCount } = useMemo(() => {
    let normal = 0, frozen = 0, warn = 0;
    for (const c of customers) {
      const label = getCreditStatus(c).label;
      if (label === "正常") normal++;
      else if (label === "冻结") frozen++;
      else if (label === "预警") warn++;
    }
    return { normalCount: normal, frozenCount: frozen, warnCount: warn };
  }, [customers]);

  return (
    <div>
      <PageHeader
        title={t('ui.信用管理','信用管理')}
        subtitle={t('ui.客户信用额度 · 冻结状态 · 逾期预警 · 信用台账','客户信用额度 · 冻结状态 · 逾期预警 · 信用台账')}
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
      {loading && !error && (
        <div className="flex items-center justify-center py-20 text-text-dim">
          <RefreshCw size={20} className="animate-spin mr-2" />
          {t('ui.加载中…','加载中…')}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard icon={CheckCircle}   title={t('ui.正常客户','正常客户')} value={normalCount} sub={t('ui.信用使用率 ≤ 80%','信用使用率 ≤ 80%')} tone="success" />
            <StatCard icon={Lock}          title={t('ui.冻结客户','冻结客户')} value={frozenCount} sub={t('ui.账户已冻结','账户已冻结')}      tone="danger"  />
            <StatCard icon={AlertTriangle} title={t('ui.信用预警','信用预警')} value={warnCount}   sub={t('ui.信用使用率 > 80%','信用使用率 > 80%')} tone="warning" />
          </div>

          {/* 客户信用列表 — g200b:回归 tableContainer + tableHeaderCell + tableBodyCell token */}
          <div style={tableContainer}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('ui.客户信用列表','客户信用列表')} <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 6 }}>({customers.length})</span>
            </div>
            {customers.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>{t('ui.暂无数据','暂无数据')}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCell}>{t('ui.客户名称','客户名称')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'right' }}>{t('ui.信用额度','信用额度')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'right' }}>{t('ui.已用额度','已用额度')}</th>
                      <th style={{ ...tableHeaderCell, width: 200 }}>{t('ui.使用率','使用率')}</th>
                      <th style={tableHeaderCell}>{t('ui.状态','状态')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => {
                      const status = getCreditStatus(c);
                      const rate = getUsageRate(c);
                      const tone: 'success' | 'warning' | 'danger' = status.label === '冻结' ? 'danger' : status.label === '预警' ? 'warning' : 'success';
                      return (
                        <tr key={c.id}>
                          <td style={{ ...tableBodyCell, fontWeight: 500 }}>
                            {c.customer_name ?? c.name ?? `${t('ui.客户','客户')}${c.id}`}
                          </td>
                          <td style={{ ...tableBodyCell, textAlign: 'right', fontFamily: MONO_FONT, color: 'var(--text-secondary)' }}>
                            {fmtMoney(c.credit_limit)}
                          </td>
                          <td style={{ ...tableBodyCell, textAlign: 'right', ...moneyCell('default', 'md'), padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                            {fmtMoney(c.credit_used)}
                          </td>
                          <td style={{ ...tableBodyCell, width: 200 }}>
                            <CreditBar rate={rate} />
                          </td>
                          <td style={tableBodyCell}>
                            <span style={actionPill(tone)}>{status.label}</span>
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
