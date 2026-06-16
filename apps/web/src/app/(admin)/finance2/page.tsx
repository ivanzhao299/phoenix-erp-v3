'use client';
/**
 * 财务管理驾驶舱 — Design System V2
 * ===================================
 * · 全部颜色来自 @theme inline token，无 dark:bg-slate-* 硬编码
 * · 模块卡使用 bg-bg-card + accent token
 * · 告警条使用 bg-danger/10、bg-warning/10
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingDown, TrendingUp, Wallet, Users,
  PieChart, Receipt, ArrowRight, RefreshCw,
  DollarSign, ArrowLeftRight, Activity, AlertTriangle,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { NavCard } from '@/components/ui/NavCard';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { usePermission } from '@/hooks/usePermission';  // G58 现金收付款入口门控
import { cn } from '@/lib/utils';
import { KPI_GRID, type AccentColor } from '@/lib/design-tokens';
import { currencySymbol } from '@/lib/currency';

// ── 设计系统 token 映射 ───────────────────────────────────────────────────────
type AccentKey = "blue" | "green" | "amber" | "red" | "violet" | "indigo" | "cyan" | "teal" | "slate";

const ACCENT: Record<AccentKey, { text: string; icon: string; border: string }> = {
  blue:   { text: 'text-info',       icon: 'bg-info/10',    border: 'border-info/20'    },
  green:  { text: 'text-success',    icon: 'bg-success/10', border: 'border-success/20' },
  amber:  { text: 'text-warning',    icon: 'bg-warning/10', border: 'border-warning/20' },
  red:    { text: 'text-danger',     icon: 'bg-danger/10',  border: 'border-danger/20'  },
  violet: { text: 'text-brand',      icon: 'bg-brand/10',   border: 'border-brand/20'   },
  indigo: { text: 'text-brand',      icon: 'bg-brand/10',   border: 'border-brand/20'   },
  cyan:   { text: 'text-info',       icon: 'bg-info/10',    border: 'border-info/20'    },
  teal:   { text: 'text-success',    icon: 'bg-success/10', border: 'border-success/20' },
  slate:  { text: 'text-text-muted', icon: 'bg-bg-muted',   border: 'border-border'     },
};

// ── 类型 ─────────────────────────────────────────────────────────────────────
// ModuleCard 已由全局 NavCard 组件替代，不再在页面内联定义

interface ArSummaryData {
  total_invoices:           number;
  open_invoices:            number;
  overdue_invoices:         number;
  balance_amount_original:  string;
  overdue_balance:          string;
  byCurrency:               { currency_code: string }[];
}

interface CashDashData {
  summary: {
    totalAccounts: number;
    totalBalance:  number;
    activeCount:   number;
    frozenCount:   number;
    closedCount:   number;
    byCurrency?:   { currency_code: string; cnt: string; balance: string }[];
  } | null;
  todayIn:          number;
  todayOut:         number;
  pendingTransfers: number;
}

interface ShSummaryData {
  totalContributions:     number;
  confirmedContributions: number;
  pendingConfirmations:   number;
  totalAmountOriginal:    number;
  settledAmountOriginal:  number;
  balanceAmountOriginal:  number;
}

interface ExpSummaryData {
  totalExpenses:       number;
  pendingApproval:     number;
  approved:            number;
  reimbursed:          number;
  totalAmountOriginal: number;
  pendingReimb:        number;
  paidToday:           number;
}

interface ReportOverviewData {
  apOpen:                     number;
  arOpen:                     number;
  cashBalance:                number;
  netOperatingPosition:       number;
  todayInflow:                number;
  todayOutflow:               number;
  reimbursementPendingAmount: number;
  byCurrency?:                { currencyCode: string; cashBalance: number }[];  // G58 可支配资金按币种
}

// ── API ───────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0.00';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── 区块标题 ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-3">
      {children}
    </div>
  );
}

// ── 功能模块导航卡 ────────────────────────────────────────────────────────────

interface ModuleItem {
  icon:        React.ElementType;
  title:       string;
  description: string;
  path:        string;
  accent:      AccentKey;
}

const MODULES: ModuleItem[] = [
  { icon: TrendingDown,   title: '应付账款管理', path: '/finance2/ap',                accent: 'amber',  description: '供应商发票管理、付款核销、多币种、账龄分析。' },
  { icon: TrendingUp,     title: '应收账款管理', path: '/finance2/ar',                accent: 'green',  description: '客户发票、收款核销、账龄分析。' },
  { icon: Wallet,         title: '资金账户管理', path: '/finance2/cash-accounts',     accent: 'blue',   description: '多账户余额管理、流水账本、转账审批。' },
  { icon: ArrowLeftRight, title: '资金转账',     path: '/finance2/fund-transfers',    accent: 'cyan',   description: '账户间资金划转，5 阶段审批流程，事务安全保障。' },
  { icon: Users,          title: '股东资金管理', path: '/finance2/shareholder-funds', accent: 'violet', description: '出资台账、结算审批（退回/抵扣/核销）、联动资金账户。' },
  { icon: Receipt,        title: '费用申请',     path: '/finance2/expenses',          accent: 'indigo', description: '费用申请全流程审批，审批通过自动生成报销，付款联动资金账户。' },
  { icon: ArrowLeftRight, title: '报销管理',     path: '/finance2/reimbursements',    accent: 'teal',   description: '报销台账，付款事务安全，自动扣减现金账户余额。' },
  { icon: PieChart,       title: '经营报表',     path: '/finance2/reports',           accent: 'slate',  description: '12 只读聚合报表。账龄 · 资金日报 · 费用统计 · 可支配资金 · 项目财务。' },
];

// ModuleCard 已删除，改用全局 NavCard 组件

// ── 主页面 ─────────────────────────────────────────────────────────────────────

export default function Finance2DashboardPage() {
  const { canCreate: canCreateTxn } = usePermission('MENU_FIN2_CASH_TXN');  // G58 出纳现金收付款入口
  const [arSummary,      setArSummary]      = useState<ArSummaryData | null>(null);
  const [cashDash,       setCashDash]       = useState<CashDashData | null>(null);
  const [shSummary,      setShSummary]      = useState<ShSummaryData | null>(null);
  const [expSummary,     setExpSummary]     = useState<ExpSummaryData | null>(null);
  const [reportOverview, setReportOverview] = useState<ReportOverviewData | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ar, cashSummary, pendingTfr, sh, exp, rpt] = await Promise.allSettled([
        apiFetch<ArSummaryData>('/api/v2/finance/ar/summary'),
        apiFetch<CashDashData['summary']>('/api/v2/finance/cash/accounts/summary'),
        apiFetch<{ total: number }>('/api/v2/finance/cash/transfers?status=PENDING_APPROVAL&pageSize=1'),
        apiFetch<ShSummaryData>('/api/v2/finance/shareholders/contributions/summary'),
        apiFetch<ExpSummaryData>('/api/v2/finance/expenses/summary'),
        apiFetch<ReportOverviewData>('/api/v2/finance/reports/overview'),
      ]);

      if (ar.status  === 'fulfilled') setArSummary(ar.value);
      // G60：后端 contributions/summary 返回 {totals,byType,byStatus}，适配为 ShSummaryData
      if (sh.status  === 'fulfilled') {
        const raw = sh.value as unknown as { totals?: Record<string, unknown>; byStatus?: Array<Record<string, unknown>> } | null;
        if (raw?.totals) {
          const t = raw.totals; const bs = raw.byStatus ?? [];
          const cntOf = (sts: string[]) => bs.filter(s => sts.includes(String(s.status))).reduce((a, s) => a + Number(s.cnt ?? 0), 0);
          setShSummary({
            totalContributions:     Number(t.total_count ?? 0),
            confirmedContributions: cntOf(['CONFIRMED', 'ACTIVE', 'SETTLED']),
            pendingConfirmations:   cntOf(['PENDING_CONFIRM', 'PENDING_CONFIRMATION', 'PENDING', 'DRAFT']),
            totalAmountOriginal:    Number(t.total_amount_original ?? 0),
            settledAmountOriginal:  Number(t.total_settled ?? 0),
            balanceAmountOriginal:  Number(t.total_balance ?? 0),
          });
        }
      }
      if (exp.status === 'fulfilled') setExpSummary(exp.value);
      if (rpt.status === 'fulfilled') setReportOverview(rpt.value);

      setCashDash({
        summary:          cashSummary.status === 'fulfilled' ? cashSummary.value : null,
        todayIn:          0,
        todayOut:         0,
        pendingTransfers: pendingTfr.status === 'fulfilled' ? pendingTfr.value.total : 0,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, []);

  // G58 多币种金额按币种堆叠多行渲染（避免单行 break-all 拦腰截断数字）。
  const renderMultiCcy = (rows: { ccy: string; amount: number }[]): React.ReactNode => {
    if (rows.length === 0) return '—';
    if (rows.length === 1) return `${currencySymbol(rows[0].ccy)}${fmt(rows[0].amount)}`;
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 17, lineHeight: 1.35 }}>
        {rows.map(r => (
          <span key={r.ccy} style={{ whiteSpace: 'nowrap' }}>{currencySymbol(r.ccy)}{fmt(r.amount)}</span>
        ))}
      </span>
    );
  };

  // 现金账户余额跨币种：按币种分组展示，避免 USD/THB 账户被贴成人民币符号。
  const cashBalanceDisplay = (() => {
    const s = cashDash?.summary;
    if (!s) return '—';
    const rows = (s.byCurrency ?? []).filter(r => Number(r.cnt) > 0)
      .map(r => ({ ccy: r.currency_code, amount: Number(r.balance) }));
    if (rows.length === 0) return fmt(s.totalBalance);
    return renderMultiCcy(rows);
  })();

  // G58 可支配资金按币种：现金 byCurrency，CNY 行并入 (AR - AP - 待报销)（这些为本币口径）。
  const disposableDisplay = (() => {
    const o = reportOverview;
    if (!o) return '—';
    const cnyAdj = (o.arOpen ?? 0) - (o.apOpen ?? 0) - (o.reimbursementPendingAmount ?? 0);
    const rows = (o.byCurrency ?? []).map(r => ({
      ccy: r.currencyCode,
      amount: r.cashBalance + (r.currencyCode === 'CNY' ? cnyAdj : 0),
    }));
    if (rows.length === 0) {
      // 无现金币种明细时退回单一本币净头寸
      return `${o.netOperatingPosition >= 0 ? '+' : ''}¥ ${fmt(o.netOperatingPosition)}`;
    }
    // CNY 不在 byCurrency 但有调整时补一行
    if (cnyAdj !== 0 && !rows.some(r => r.ccy === 'CNY')) rows.push({ ccy: 'CNY', amount: cnyAdj });
    return renderMultiCcy(rows);
  })();

  // ── 6 核心 KPI ─────────────────────────────────────────────────────────
  const kpis = [
    {
      label:       '现金账户余额',
      value:       cashBalanceDisplay,
      subValue:    cashDash?.summary ? `${cashDash.summary.totalAccounts} 个账户` : undefined,
      icon:        Wallet,
      accentColor: 'blue' as AccentColor,
    },
    {
      label:       '应收待收款',
      value:       arSummary ? `¥ ${fmt(arSummary.balance_amount_original)}` : '—',
      subValue:    arSummary ? `${arSummary.open_invoices} 笔未收 / ${arSummary.overdue_invoices} 笔逾期` : undefined,
      icon:        TrendingUp,
      accentColor: 'green' as AccentColor,
    },
    {
      label:       '应付待付款',
      value:       reportOverview ? `¥ ${fmt(reportOverview.apOpen)}` : '—',
      icon:        TrendingDown,
      accentColor: 'red' as AccentColor,
    },
    {
      label:       '待报销金额',
      value:       reportOverview ? `¥ ${fmt(reportOverview.reimbursementPendingAmount)}` : '—',
      subValue:    expSummary ? `${expSummary.pendingReimb} 笔待报销` : undefined,
      icon:        Receipt,
      accentColor: 'amber' as AccentColor,
    },
    {
      label:       '可支配资金',
      value:       disposableDisplay,
      subValue:    reportOverview
        ? `今日流入 ¥${fmt(reportOverview.todayInflow)} / 流出 ¥${fmt(reportOverview.todayOutflow)}`
        : undefined,
      icon:        Activity,
      accentColor: reportOverview?.netOperatingPosition !== undefined && reportOverview.netOperatingPosition >= 0
        ? ('violet' as AccentColor)
        : ('red' as AccentColor),
    },
    {
      label:       '股东出资余额',
      value:       shSummary ? `¥ ${fmt(shSummary.balanceAmountOriginal)}` : '—',
      subValue:    shSummary ? `${shSummary.pendingConfirmations} 笔待确认` : undefined,
      icon:        Users,
      accentColor: 'indigo' as AccentColor,
    },
  ];

  return (
    <div>
      <PageHeader
        title="财务管理"
        subtitle="应付 · 应收 · 资金账户 · 费用报销 · 股东资金 · 可支配资金"
        breadcrumb={['财务管理', '驾驶舱']}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* G58 出纳每日操作入口：现金收付款逐笔录入（CASH_TXN:C） */}
            {canCreateTxn && (
              <Link
                href="/finance2/cash-accounts"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: 'var(--accent-primary, #4f46e5)', color: '#fff', textDecoration: 'none',
                }}
              >
                <Wallet size={14} /> 现金收付款
              </Link>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              刷新
            </Button>
          </div>
        }
      />

      {/* 错误提示 */}
      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-5 text-danger text-sm flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ── 6 大 KPI 指标 ─────────────────────────────────────────────── */}
      <div className="mb-2">
        <SectionLabel>财务核心指标</SectionLabel>
        <div className="mb-8" style={KPI_GRID}>
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              subValue={kpi.subValue}
              icon={kpi.icon}
              accentColor={kpi.accentColor}
              loading={loading}
            />
          ))}
        </div>
      </div>

      {/* ── 应收账款异常提示（有逾期时高亮） ──────────────────────────── */}
      {!loading && arSummary && arSummary.overdue_invoices > 0 && (
        <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-6 text-sm text-danger">
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span>
            当前有 <strong>{arSummary.overdue_invoices}</strong> 笔应收账款逾期，
            逾期余额 <strong>¥ {fmt(arSummary.overdue_balance)}</strong>，请及时跟进。
          </span>
        </div>
      )}

      {/* ── 待处理转账提示 ─────────────────────────────────────────────── */}
      {!loading && cashDash && cashDash.pendingTransfers > 0 && (
        <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-xl px-4 py-3 mb-6 text-sm text-warning">
          <DollarSign size={15} className="flex-shrink-0" />
          <span>
            有 <strong>{cashDash.pendingTransfers}</strong> 笔转账申请等待审批。
          </span>
        </div>
      )}

      {/* ── 功能模块导航 ──────────────────────────────────────────────── */}
      <SectionLabel>功能模块</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {MODULES.map((m) => (
          <NavCard
            key={m.path}
            icon={m.icon}
            title={m.title}
            description={m.description}
            href={m.path}
            accent={m.accent}
          />
        ))}
      </div>
    </div>
  );
}
