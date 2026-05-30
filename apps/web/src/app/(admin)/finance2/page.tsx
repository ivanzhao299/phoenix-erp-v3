'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingDown, TrendingUp, Wallet, Users, PieChart,
  Receipt, CheckCircle, AlertTriangle, ArrowRight,
  RefreshCw, DollarSign, ArrowLeftRight,
  Activity, Lock,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

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
    totalBalance: number;
    activeCount: number;
    frozenCount: number;
    closedCount: number;
  } | null;
  todayIn: number;
  todayOut: number;
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

// ── 子组件 ────────────────────────────────────────────────────────────────────

function ModuleCard({
  icon: Icon, title, description, path, iconColor,
}: {
  icon: React.ElementType; title: string; description: string;
  path?: string; iconColor?: string;
}) {
  const router = useRouter();
  const canNav = !!path;

  return (
    <div
      onClick={() => canNav && router.push(path!)}
      className={[
        'rounded-2xl border p-5 shadow-sm transition-all',
        'bg-white dark:bg-slate-800',
        'border-slate-100 dark:border-slate-700',
        canNav
          ? 'cursor-pointer hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-600'
          : '',
      ].join(' ')}
    >
      <div className="mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${iconColor ?? '#6366f1'}18` }}
        >
          <Icon size={20} color={iconColor ?? '#6366f1'} />
        </div>
      </div>
      <div className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">{title}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{description}</div>
      {canNav && (
        <div className="flex items-center gap-1 mt-3 text-xs text-indigo-600 dark:text-indigo-400">
          进入 <ArrowRight size={12} />
        </div>
      )}
    </div>
  );
}

// ── 格式化工具 ─────────────────────────────────────────────────────────────────

function fmtMoney(val: string | number | null | undefined, currency = 'CNY') {
  const n = Number(val ?? 0);
  const sym = currency === 'USD' ? '$' : '¥';
  return `${currency} ${sym}${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0.00';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  return (
    <div>
      <PageHeader
        title="财务管理"
        subtitle="一体化财务管理平台 — 应付 · 应收 · 资金账户 · 费用报销 · 股东资金 · 经营报表"
        breadcrumb={['财务管理', '总览']}
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

      {/* 平台简介 Banner */}
      <div
        className="rounded-2xl p-6 mb-6 text-white"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f766e 100%)' }}
      >
        <div className="font-extrabold text-lg mb-2">财务管理平台</div>
        <div className="text-sm leading-relaxed opacity-90">
          一体化财务管理 · 应付 / 应收 / 资金账户 / 费用报销 / 股东资金 统一管理<br />
          经营净头寸 · 账龄分析 · 项目财务视图 · 公司经营视图 · 数据权限全程合规
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800
          rounded-xl px-4 py-3 mb-5 text-red-500 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* 经营资金总览 */}
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">经营资金总览</div>
      {reportOverview && (
        <div
          className="rounded-2xl p-5 mb-6 text-white"
          style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f766e 100%)' }}
        >
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
          >
            <div>
              <div className="text-xs opacity-70">经营净头寸</div>
              <div className="text-2xl font-black mt-0.5">
                {reportOverview.netOperatingPosition >= 0 ? '+' : ''}¥{' '}
                {fmt(reportOverview.netOperatingPosition)}
              </div>
              <div className="text-xs opacity-60 mt-0.5">= 现金 + 应收 − 应付 − 待报销</div>
            </div>
            <div>
              <div className="text-xs opacity-70">今日流入</div>
              <div className="text-xl font-extrabold mt-0.5" style={{ color: '#86efac' }}>
                +¥ {fmt(reportOverview.todayInflow)}
              </div>
            </div>
            <div>
              <div className="text-xs opacity-70">今日流出</div>
              <div className="text-xl font-extrabold mt-0.5" style={{ color: '#fca5a5' }}>
                -¥ {fmt(reportOverview.todayOutflow)}
              </div>
            </div>
            <div>
              <div className="text-xs opacity-70">应收待收款</div>
              <div className="text-lg font-bold mt-0.5">¥ {fmt(reportOverview.arOpen)}</div>
            </div>
            <div>
              <div className="text-xs opacity-70">应付待付款</div>
              <div className="text-lg font-bold mt-0.5">¥ {fmt(reportOverview.apOpen)}</div>
            </div>
            <div>
              <div className="text-xs opacity-70">现金账户余额</div>
              <div className="text-lg font-bold mt-0.5">¥ {fmt(reportOverview.cashBalance)}</div>
            </div>
          </div>
        </div>
      )}

      {/* 股东资金概览 */}
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">股东资金概览</div>
      <div
        className="grid gap-2.5 mb-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
      >
        {[
          {
            label: '出资总余额',
            value: shSummary ? `¥ ${fmt(shSummary.balanceAmountOriginal)}` : (loading ? '…' : '—'),
            icon: <Users size={16} color="#7c3aed" />,
            cls: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700',
          },
          {
            label: '累计出资总额',
            value: shSummary ? `¥ ${fmt(shSummary.totalAmountOriginal)}` : (loading ? '…' : '—'),
            icon: <DollarSign size={16} color="#6d28d9" />,
            cls: 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-600',
          },
          {
            label: '已结算总额',
            value: shSummary ? `¥ ${fmt(shSummary.settledAmountOriginal)}` : (loading ? '…' : '—'),
            icon: <CheckCircle size={16} color="#059669" />,
            cls: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700',
          },
          {
            label: '已确认出资笔数',
            value: shSummary ? `${shSummary.confirmedContributions} 笔` : (loading ? '…' : '—'),
            icon: <Activity size={16} color="#0891b2" />,
            cls: 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-700',
          },
          {
            label: '待确认出资',
            value: shSummary ? `${shSummary.pendingConfirmations} 笔` : (loading ? '…' : '—'),
            icon: <AlertTriangle size={16} color="#d97706" />,
            cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700',
          },
        ].map(c => (
          <div key={c.label} className={`${c.cls} border rounded-2xl p-4 flex items-center gap-2.5`}>
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
              {c.icon}
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{c.label}</div>
              <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 费用报销概览 */}
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">费用报销概览</div>
      <div
        className="grid gap-2.5 mb-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
      >
        {[
          {
            label: '费用申请总数',
            value: expSummary ? `${expSummary.totalExpenses} 笔` : (loading ? '…' : '—'),
            icon: <Receipt size={16} color="#6366f1" />,
            cls: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700',
          },
          {
            label: '审批中',
            value: expSummary ? `${expSummary.pendingApproval} 笔` : (loading ? '…' : '—'),
            icon: <AlertTriangle size={16} color="#f59e0b" />,
            cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700',
          },
          {
            label: '已审批',
            value: expSummary ? `${expSummary.approved} 笔` : (loading ? '…' : '—'),
            icon: <CheckCircle size={16} color="#10b981" />,
            cls: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700',
          },
          {
            label: '待报销',
            value: expSummary ? `${expSummary.pendingReimb} 笔` : (loading ? '…' : '—'),
            icon: <Activity size={16} color="#f59e0b" />,
            cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700',
          },
          {
            label: '今日已付款',
            value: expSummary ? `${expSummary.paidToday} 笔` : (loading ? '…' : '—'),
            icon: <DollarSign size={16} color="#059669" />,
            cls: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700',
          },
        ].map(c => (
          <div key={c.label} className={`${c.cls} border rounded-2xl p-4 flex items-center gap-2.5`}>
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
              {c.icon}
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{c.label}</div>
              <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 资金账户概览 */}
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">资金账户概览</div>
      <div
        className="grid gap-2.5 mb-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
      >
        {[
          {
            label: '账户总余额',
            value: cashDash?.summary ? `¥ ${fmt(cashDash.summary.totalBalance)}` : (loading ? '…' : '—'),
            icon: <DollarSign size={16} color="#2563eb" />,
            cls: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700',
          },
          {
            label: '账户总数',
            value: cashDash?.summary ? `${cashDash.summary.totalAccounts} 个` : (loading ? '…' : '—'),
            icon: <Wallet size={16} color="#7c3aed" />,
            cls: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700',
          },
          {
            label: '正常账户',
            value: cashDash?.summary ? `${cashDash.summary.activeCount} 个` : (loading ? '…' : '—'),
            icon: <Activity size={16} color="#16a34a" />,
            cls: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700',
          },
          {
            label: '冻结账户',
            value: cashDash?.summary ? `${cashDash.summary.frozenCount} 个` : (loading ? '…' : '—'),
            icon: <Lock size={16} color="#d97706" />,
            cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700',
          },
          {
            label: '待处理转账',
            value: cashDash ? `${cashDash.pendingTransfers} 笔` : (loading ? '…' : '—'),
            icon: <ArrowLeftRight size={16} color="#0891b2" />,
            cls: 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-700',
          },
        ].map(c => (
          <div key={c.label} className={`${c.cls} border rounded-2xl p-4 flex items-center gap-2.5`}>
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
              {c.icon}
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{c.label}</div>
              <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 应收账款概览 */}
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">应收账款概览</div>
      <div
        className="grid gap-2.5 mb-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
      >
        {[
          {
            label: '应收账单总数',
            value: String(arSummary?.total_invoices ?? (loading ? '…' : '—')),
            color: 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: '未收款',
            value: String(arSummary?.open_invoices ?? (loading ? '…' : '—')),
            color: 'text-amber-500 dark:text-amber-400',
          },
          {
            label: '逾期笔数',
            value: String(arSummary?.overdue_invoices ?? (loading ? '…' : '—')),
            color: 'text-red-600 dark:text-red-400',
          },
          {
            label: '待收余额',
            value: arSummary
              ? fmtMoney(arSummary.balance_amount_original, arSummary.byCurrency?.[0]?.currency_code ?? 'CNY')
              : (loading ? '…' : '—'),
            color: 'text-red-500 dark:text-red-400',
          },
          {
            label: '逾期余额',
            value: arSummary
              ? fmtMoney(arSummary.overdue_balance, arSummary.byCurrency?.[0]?.currency_code ?? 'CNY')
              : (loading ? '…' : '—'),
            color: 'text-red-800 dark:text-red-300',
          },
        ].map(item => (
          <div
            key={item.label}
            className="bg-white dark:bg-slate-800 rounded-xl p-4
              border border-slate-100 dark:border-slate-700 shadow-sm"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{item.label}</div>
            <div className={`text-base font-extrabold ${item.color}`}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* 功能模块 */}
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">功能模块</div>
      <div
        className="grid gap-3.5 mb-8"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
      >
        <ModuleCard
          icon={TrendingDown} iconColor="#f59e0b"
          title="应付账款管理"
          path="/finance2/ap"
          description="供应商发票管理、付款核销、多币种、账龄分析。"
        />
        <ModuleCard
          icon={TrendingUp} iconColor="#10b981"
          title="应收账款管理"
          path="/finance2/ar"
          description="客户发票、收款核销、账龄分析。"
        />
        <ModuleCard
          icon={Wallet} iconColor="#3b82f6"
          title="资金账户管理"
          path="/finance2/cash-accounts"
          description="多账户余额管理、流水账本、转账审批。"
        />
        <ModuleCard
          icon={ArrowLeftRight} iconColor="#0891b2"
          title="资金转账"
          path="/finance2/fund-transfers"
          description="账户间资金划转，5 阶段审批流程（草稿→待审→已批→已执行），事务安全保障。"
        />
        <ModuleCard
          icon={Users} iconColor="#7c3aed"
          title="股东资金管理"
          path="/finance2/shareholder-funds"
          description="出资台账、结算审批（退回/抵扣/核销）、联动资金账户。"
        />
        <ModuleCard
          icon={Receipt} iconColor="#6366f1"
          title="费用申请"
          path="/finance2/expenses"
          description="费用申请全流程审批，审批通过自动生成报销，付款联动资金账户。"
        />
        <ModuleCard
          icon={ArrowLeftRight} iconColor="#059669"
          title="报销管理"
          path="/finance2/reimbursements"
          description="报销台账，付款事务安全，自动扣减现金账户余额。"
        />
        <ModuleCard
          icon={PieChart} iconColor="#0891b2"
          title="经营报表"
          path="/finance2/reports"
          description="12 只读聚合报表。应付/应收账龄 · 资金日报 · 费用统计 · 股东资金 · 项目财务 · 公司经营净头寸。"
        />
      </div>
    </div>
  );
}
