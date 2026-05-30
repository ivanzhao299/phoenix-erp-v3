'use client';
/**
 * 财务管理驾驶舱 — Design System V2
 * ===================================
 * · 全部颜色来自 @theme inline token，无 dark:bg-slate-* 硬编码
 * · 模块卡使用 bg-bg-card + accent token
 * · 告警条使用 bg-danger/10、bg-warning/10
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingDown, TrendingUp, Wallet, Users,
  PieChart, Receipt, ArrowRight, RefreshCw,
  DollarSign, ArrowLeftRight, Activity, AlertTriangle,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AccentColor } from '@/lib/design-tokens';

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
  { icon: PieChart,       title: '经营报表',     path: '/finance2/reports',           accent: 'slate',  description: '12 只读聚合报表。账龄 · 资金日报 · 费用统计 · 净头寸 · 项目财务。' },
];

function ModuleCard({ item }: { item: ModuleItem }) {
  const router = useRouter();
  const ac = ACCENT[item.accent];
  return (
    <div
      onClick={() => router.push(item.path)}
      className={cn(
        'rounded-2xl border bg-bg-card p-5 cursor-pointer',
        'shadow-card hover:shadow-card-hover hover:-translate-y-0.5',
        'transition-all duration-150',
        ac.border,
      )}
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', ac.icon)}>
        <item.icon size={20} className={ac.text} />
      </div>
      <div className="font-bold text-sm text-text mb-1">{item.title}</div>
      <div className="text-xs text-text-muted leading-relaxed mb-3">{item.description}</div>
      <div className={cn('flex items-center gap-1 text-xs font-medium', ac.text)}>
        进入 <ArrowRight size={12} />
      </div>
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────────────────

export default function Finance2DashboardPage() {
  const [arSummary,      setArSummary]      = useState<ArSummaryData | null>(null);
  const [cashDash,       setCashDash]       = useState<CashDashData | null>(null);
  const [shSummary,      setShSummary]      = useState<ShSummaryData | null>(null);
  const [expSummary,     setExpSummary]     = useState<ExpSummaryData | null>(null);
  const [reportOverview, setReportOverview] = useState<ReportOverviewData | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [ar, cashSummary, pendingTfr, sh, exp, rpt] = await Promise.allSettled([
        apiFetch<ArSummaryData>('/api/v2/finance/ar/summary'),
        apiFetch<CashDashData['summary']>('/api/v2/finance/cash/accounts/summary'),
        apiFetch<{ total: number }>('/api/v2/finance/cash/transfers?status=PENDING_APPROVAL&pageSize=1'),
        apiFetch<ShSummaryData>('/api/v2/finance/shareholders/summary'),
        apiFetch<ExpSummaryData>('/api/v2/finance/expenses/summary'),
        apiFetch<ReportOverviewData>('/api/v2/finance/reports/overview'),
      ]);

      if (ar.status  === 'fulfilled') setArSummary(ar.value);
      if (sh.status  === 'fulfilled') setShSummary(sh.value);
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
  };

  useEffect(() => { void load(); }, []);

  // ── 6 核心 KPI ─────────────────────────────────────────────────────────
  const kpis = [
    {
      label:       '现金账户余额',
      value:       cashDash?.summary ? `¥ ${fmt(cashDash.summary.totalBalance)}` : '—',
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
      label:       '经营净头寸',
      value:       reportOverview
        ? `${reportOverview.netOperatingPosition >= 0 ? '+' : ''}¥ ${fmt(reportOverview.netOperatingPosition)}`
        : '—',
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
        subtitle="应付 · 应收 · 资金账户 · 费用报销 · 股东资金 · 经营净头寸"
        breadcrumb={['财务管理', '驾驶舱']}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {MODULES.map((m) => (
          <ModuleCard key={m.path} item={m} />
        ))}
      </div>
    </div>
  );
}
