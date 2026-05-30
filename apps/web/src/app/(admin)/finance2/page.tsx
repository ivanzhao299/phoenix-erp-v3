'use client';
/**
 * 财务管理驾驶舱
 * ==============
 * 顶部 6 KPI + 功能模块导航，严格遵循 Design System V1。
 * 颜色来源：design-tokens.ts ACCENT_MAP，无硬编码 hex。
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
import { ACCENT_MAP, type AccentColor } from '@/lib/design-tokens';

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

// ── 功能模块导航卡 ────────────────────────────────────────────────────────────

interface ModuleItem {
  icon: React.ElementType;
  title: string;
  description: string;
  path: string;
  accentColor: AccentColor;
}

const MODULES: ModuleItem[] = [
  { icon: TrendingDown,    title: '应付账款管理',  path: '/finance2/ap',                 accentColor: 'amber',  description: '供应商发票管理、付款核销、多币种、账龄分析。' },
  { icon: TrendingUp,      title: '应收账款管理',  path: '/finance2/ar',                 accentColor: 'green',  description: '客户发票、收款核销、账龄分析。' },
  { icon: Wallet,          title: '资金账户管理',  path: '/finance2/cash-accounts',      accentColor: 'blue',   description: '多账户余额管理、流水账本、转账审批。' },
  { icon: ArrowLeftRight,  title: '资金转账',      path: '/finance2/fund-transfers',     accentColor: 'cyan',   description: '账户间资金划转，5 阶段审批流程，事务安全保障。' },
  { icon: Users,           title: '股东资金管理',  path: '/finance2/shareholder-funds',  accentColor: 'violet', description: '出资台账、结算审批（退回/抵扣/核销）、联动资金账户。' },
  { icon: Receipt,         title: '费用申请',      path: '/finance2/expenses',           accentColor: 'indigo', description: '费用申请全流程审批，审批通过自动生成报销，付款联动资金账户。' },
  { icon: ArrowLeftRight,  title: '报销管理',      path: '/finance2/reimbursements',     accentColor: 'teal',   description: '报销台账，付款事务安全，自动扣减现金账户余额。' },
  { icon: PieChart,        title: '经营报表',      path: '/finance2/reports',            accentColor: 'slate',  description: '12 只读聚合报表。账龄 · 资金日报 · 费用统计 · 净头寸 · 项目财务。' },
];

function ModuleCard({ item }: { item: ModuleItem }) {
  const router = useRouter();
  const ac = ACCENT_MAP[item.accentColor];
  return (
    <div
      onClick={() => router.push(item.path)}
      className={[
        'rounded-2xl border p-5 shadow-sm cursor-pointer',
        'bg-white dark:bg-slate-800',
        'hover:shadow-md hover:-translate-y-0.5',
        'transition-all',
        ac.border,
      ].join(' ')}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${ac.icon}`}>
        <item.icon size={20} className={ac.text} />
      </div>
      <div className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">{item.title}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">{item.description}</div>
      <div className={`flex items-center gap-1 text-xs font-medium ${ac.text}`}>
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

  // ── 6 核心 KPI ────────────────────────────────────────────────────────
  const kpis = [
    {
      label:        '现金账户余额',
      value:        cashDash?.summary ? `¥ ${fmt(cashDash.summary.totalBalance)}` : '—',
      subValue:     cashDash?.summary ? `${cashDash.summary.totalAccounts} 个账户` : undefined,
      icon:         Wallet,
      accentColor:  'blue' as AccentColor,
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
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border
              border-slate-200 dark:border-slate-700
              bg-white dark:bg-slate-800
              text-sm text-slate-600 dark:text-slate-300
              hover:bg-slate-50 dark:hover:bg-slate-700
              transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            刷新
          </button>
        }
      />

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800
          rounded-xl px-4 py-3 mb-5 text-red-500 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ── 6 大 KPI 指标 ─────────────────────────────────────────────── */}
      <div className="mb-2">
        <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
          财务核心指标
        </div>
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
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20
          border border-red-200 dark:border-red-700
          rounded-xl px-4 py-3 mb-6 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span>
            当前有 <strong>{arSummary.overdue_invoices}</strong> 笔应收账款逾期，
            逾期余额 <strong>¥ {fmt(arSummary.overdue_balance)}</strong>，请及时跟进。
          </span>
        </div>
      )}

      {/* ── 待处理转账提示 ─────────────────────────────────────────────── */}
      {!loading && cashDash && cashDash.pendingTransfers > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20
          border border-amber-200 dark:border-amber-700
          rounded-xl px-4 py-3 mb-6 text-sm text-amber-700 dark:text-amber-400">
          <DollarSign size={15} className="flex-shrink-0" />
          <span>
            有 <strong>{cashDash.pendingTransfers}</strong> 笔转账申请等待审批。
          </span>
        </div>
      )}

      {/* ── 功能模块导航 ──────────────────────────────────────────────── */}
      <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
        功能模块
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {MODULES.map((m) => (
          <ModuleCard key={m.path} item={m} />
        ))}
      </div>
    </div>
  );
}
