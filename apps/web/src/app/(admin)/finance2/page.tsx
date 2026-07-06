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
  BookOpen, Scale, Cloud, CloudCog,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { NavCard } from '@/components/ui/NavCard';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { usePermission } from '@/hooks/usePermission';  // G58 现金收付款入口门控
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { KPI_GRID, type AccentColor } from '@/lib/design-tokens';
import { currencySymbol } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';

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
  sourceAuthority?:           Record<string, string>;
}

type AlignmentStatus =
  | 'OK'
  | 'WARN'
  | 'MISMATCH'
  | 'ERP_FALLBACK'
  | 'NEEDS_MAPPING'
  | 'AUTHORITY_READY'
  | 'READONLY_READY'
  | 'BLOCKED_MAPPING'
  | 'NEED_MANUAL_REVIEW'
  | 'WAITING_SAMPLE'
  | 'HOLD';

interface ChanjetAlignmentCard {
  cardKey: string;
  label: string;
  displayValue: number;
  source: string;
  erpValue: number;
  chanjetValue: number | null;
  diff: number;
  diffAbs: number;
  diffRate: number;
  status: AlignmentStatus;
  covered: boolean;
  rows: number;
  latestPeriod: string | null;
  note: string;
}

interface ChanjetAlignmentData {
  generatedAt: string;
  coverageRate: number;
  authority: string;
  cards: ChanjetAlignmentCard[];
  statusCounts: Partial<Record<AlignmentStatus, number>>;
  mismatchCount: number;
  fallbackCount: number;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD' | 'FAIL';
  conditions: string[];
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

function sourceLabel(source?: string): string {
  if (!source) return '来源待确认';
  if (source === 'CHANJET_AR_SNAPSHOT') return '好业财应收汇总';
  if (source === 'CHANJET_AP_STATISTICS_MIRROR') return '好业财应付汇总';
  if (source === 'CHANJET_CASH_ACCOUNT_MIRROR') return '好业财资金账户';
  if (source === 'CHANJET_AR_RECEIPT_MIRROR') return '好业财收款镜像';
  if (source === 'CHANJET_AP_PAYMENT_MIRROR') return '好业财付款镜像';
  if (source === 'CHANJET_GL_BALANCE_MIRROR') return '好业财科目余额';
  if (source === 'CHANJET_BALANCE_SHEET_MIRROR') return '好业财资产负债表';
  if (source === 'CHANJET_INCOME_STATEMENT_MIRROR') return '好业财利润表';
  if (source.startsWith('CHANJET')) return '好业财口径';
  if (source === 'ERP_FALLBACK') return 'ERP 口径（待好业财同步）';
  if (source.startsWith('ERP')) return 'ERP 辅助明细';
  return source;
}

function statusLabel(status?: AlignmentStatus): string {
  if (status === 'OK') return '已对齐';
  if (status === 'WARN') return '轻微差异';
  if (status === 'MISMATCH') return '存在差异';
  if (status === 'ERP_FALLBACK') return '待同步';
  if (status === 'NEEDS_MAPPING') return '待字段锁定';
  if (status === 'AUTHORITY_READY') return '可作为权威';
  if (status === 'READONLY_READY') return '只读可用';
  if (status === 'BLOCKED_MAPPING') return '字段阻断';
  if (status === 'NEED_MANUAL_REVIEW') return '待口径复核';
  if (status === 'WAITING_SAMPLE') return '待样本';
  if (status === 'HOLD') return '暂停';
  return '待核对';
}

function statusTone(status?: AlignmentStatus) {
  if (status === 'OK') return { bg: 'var(--success-50, #ecfdf3)', fg: 'var(--success, #15803d)', border: 'var(--success-100, #bbf7d0)' };
  if (status === 'AUTHORITY_READY') return { bg: 'var(--success-50, #ecfdf3)', fg: 'var(--success, #15803d)', border: 'var(--success-100, #bbf7d0)' };
  if (status === 'READONLY_READY') return { bg: 'var(--info-50, #eff6ff)', fg: 'var(--info, #2563eb)', border: 'var(--info-100, #bfdbfe)' };
  if (status === 'WARN') return { bg: 'var(--warning-50, #fffbeb)', fg: 'var(--warning, #b45309)', border: 'var(--warning-100, #fde68a)' };
  if (status === 'MISMATCH') return { bg: 'var(--danger-50, #fef2f2)', fg: 'var(--danger, #dc2626)', border: 'var(--danger-100, #fecaca)' };
  if (status === 'NEEDS_MAPPING' || status === 'BLOCKED_MAPPING' || status === 'NEED_MANUAL_REVIEW' || status === 'WAITING_SAMPLE') return { bg: 'var(--warning-50, #fffbeb)', fg: 'var(--warning, #b45309)', border: 'var(--warning-100, #fde68a)' };
  if (status === 'HOLD') return { bg: 'var(--danger-50, #fef2f2)', fg: 'var(--danger, #dc2626)', border: 'var(--danger-100, #fecaca)' };
  return { bg: 'var(--bg-muted, #f3f4f6)', fg: 'var(--text-muted, #6b7280)', border: 'var(--border, #e5e7eb)' };
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
  perm:        string;
}

const MODULES: ModuleItem[] = [
  { icon: TrendingUp,     title: '应收账款管理', path: '/finance2/ar',                accent: 'green',  perm: 'MENU_FIN2_AR', description: '客户发票、收款核销、账龄分析。' },
  { icon: BookOpen,       title: '应收总账',     path: '/finance2/ar-ledger',         accent: 'green',  perm: 'MENU_FIN2_AR_LEDGER', description: '集团应收往来余额台账 · 期初/本期/期末 · 多币种本币折算。' },
  // g199 三大新页(2026-06-19)— 财务总监月末关账核心路径
  { icon: Scale,          title: '应收三方对账', path: '/finance2/ar-reconciliation', accent: 'green',  perm: 'MENU_FIN2_AR_LEDGER', description: '业务发票 ↔ ERP 总账 ↔ 好业财应收 · 按客户对齐 · 差异飘红。' },
  { icon: Cloud,          title: '好业财同步',   path: '/finance2/chanjet-sync',      accent: 'blue',   perm: 'MENU_SETTINGS_CHANJET', description: '管理员只读同步控制台 · 普通用户在业务模块无感使用好业财口径。' },
  { icon: CloudCog,       title: '好业财中间层', path: '/finance2/chanjet-integration', accent: 'blue', perm: 'MENU_SETTINGS_CHANJET', description: '管理员治理控制台：账套、字段目录、主数据映射、对账差异、凭证草稿。' },
  { icon: TrendingDown,   title: '应付账款管理', path: '/finance2/ap',                accent: 'amber',  perm: 'MENU_FIN2_AP', description: '供应商发票管理、付款核销、多币种、账龄分析。' },
  { icon: Wallet,         title: '资金账户管理', path: '/finance2/cash-accounts',     accent: 'blue',   perm: 'MENU_FIN2_CASH_VIEW', description: '多账户余额管理、流水账本、转账审批。' },
  { icon: ArrowLeftRight, title: '资金转账',     path: '/finance2/fund-transfers',    accent: 'cyan',   perm: 'MENU_FIN2_CASH_TRANSFER', description: '账户间资金划转,5 阶段审批流程,事务安全保障。' },
  { icon: Users,          title: '股东资金管理', path: '/finance2/shareholder-funds', accent: 'violet', perm: 'MENU_FIN2_SHAREHOLDER', description: '出资台账、结算审批(退回/抵扣/核销)、联动资金账户。' },
  { icon: Receipt,        title: '费用申请',     path: '/finance2/expenses',          accent: 'indigo', perm: 'MENU_FIN2_EXPENSE', description: '费用申请全流程审批,审批通过自动生成报销,付款联动资金账户。' },
  { icon: ArrowLeftRight, title: '报销管理',     path: '/finance2/reimbursements',    accent: 'teal',   perm: 'MENU_FIN2_REIMBURSE', description: '报销台账,付款事务安全,自动扣减现金账户余额。' },
  { icon: PieChart,       title: '经营报表',     path: '/finance2/reports',           accent: 'slate',  perm: 'MENU_FIN2_REPORT', description: '12 只读聚合报表。账龄 · 资金日报 · 费用统计 · 可支配资金 · 项目财务。' },
];

// ModuleCard 已删除，改用全局 NavCard 组件

// ── 主页面 ─────────────────────────────────────────────────────────────────────

export default function Finance2DashboardPage() {
  const { canCreate: canCreateTxn } = usePermission('MENU_FIN2_CASH_TXN');  // G58 出纳现金收付款入口
  const { hasPermission } = useAuth();
  const { t } = useLanguage();
  const [arSummary,      setArSummary]      = useState<ArSummaryData | null>(null);
  const [cashDash,       setCashDash]       = useState<CashDashData | null>(null);
  const [shSummary,      setShSummary]      = useState<ShSummaryData | null>(null);
  const [expSummary,     setExpSummary]     = useState<ExpSummaryData | null>(null);
  const [reportOverview, setReportOverview] = useState<ReportOverviewData | null>(null);
  const [chanjetAlignment, setChanjetAlignment] = useState<ChanjetAlignmentData | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ar, cashSummary, pendingTfr, sh, exp, rpt, alignment] = await Promise.allSettled([
        apiFetch<ArSummaryData>('/api/v2/finance/ar/summary'),
        apiFetch<CashDashData['summary']>('/api/v2/finance/cash/accounts/summary'),
        apiFetch<{ total: number }>('/api/v2/finance/cash/transfers?status=PENDING_APPROVAL&pageSize=1'),
        apiFetch<ShSummaryData>('/api/v2/finance/shareholders/contributions/summary'),
        apiFetch<ExpSummaryData>('/api/v2/finance/expenses/summary'),
        apiFetch<ReportOverviewData>('/api/v2/finance/reports/overview'),
        apiFetch<ChanjetAlignmentData>('/api/v2/finance/reports/chanjet-alignment'),
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
      if (alignment.status === 'fulfilled') setChanjetAlignment(alignment.value);

      setCashDash({
        summary:          cashSummary.status === 'fulfilled' ? cashSummary.value : null,
        todayIn:          0,
        todayOut:         0,
        pendingTransfers: pendingTfr.status === 'fulfilled' ? pendingTfr.value.total : 0,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('fin2.common.load_failed','加载失败'));
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
    if (reportOverview?.sourceAuthority?.cashBalance?.startsWith('CHANJET')) {
      return `¥ ${fmt(reportOverview.cashBalance)}`;
    }
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

  const alignmentByKey = (key: string) => chanjetAlignment?.cards.find((card) => card.cardKey === key);
  const sourceLine = (key: string, fallbackSource?: string) => {
    const card = alignmentByKey(key);
    const source = card?.source ?? fallbackSource;
    const prefix = `${sourceLabel(source)} · ${statusLabel(card?.status)}`;
    if (!card || card.status === 'OK' || card.status === 'ERP_FALLBACK') return prefix;
    return `${prefix} · 差异 ¥${fmt(card.diffAbs)}`;
  };

  const alignmentSummary = (() => {
    if (!chanjetAlignment) return null;
    const covered = chanjetAlignment.cards.filter((card) => card.covered).length;
    const total = chanjetAlignment.cards.length;
    return {
      covered,
      total,
      ok: chanjetAlignment.statusCounts.OK ?? 0,
      warn: chanjetAlignment.statusCounts.WARN ?? 0,
      mismatch: chanjetAlignment.statusCounts.MISMATCH ?? 0,
      fallback: chanjetAlignment.statusCounts.ERP_FALLBACK ?? 0,
    };
  })();

  // ── 6 核心 KPI ─────────────────────────────────────────────────────────
  const kpis = [
    {
      label:       t('fin2.common.cash_balance','现金账户余额'),
      value:       cashBalanceDisplay,
      subValue:    cashDash?.summary
        ? `${sourceLine('cashBalance', reportOverview?.sourceAuthority?.cashBalance)} · ERP 账户 ${cashDash.summary.totalAccounts} ${t('fin2.home.accounts_unit','个账户')}`
        : sourceLine('cashBalance', reportOverview?.sourceAuthority?.cashBalance),
      icon:        Wallet,
      accentColor: 'blue' as AccentColor,
    },
    {
      label:       t('fin2.home.ar_receivable','应收待收款'),
      value:       reportOverview ? `¥ ${fmt(reportOverview.arOpen)}` : '—',
      subValue:    arSummary
        ? `${sourceLine('arOpen', reportOverview?.sourceAuthority?.arOpen)} · ERP 明细 ${arSummary.open_invoices} ${t('fin2.home.unpaid_unit','笔未收')} / ${arSummary.overdue_invoices} ${t('fin2.home.overdue_unit','笔逾期')}`
        : sourceLine('arOpen', reportOverview?.sourceAuthority?.arOpen),
      icon:        TrendingUp,
      accentColor: 'green' as AccentColor,
    },
    {
      label:       t('fin2.home.ap_payable','应付待付款'),
      value:       reportOverview ? `¥ ${fmt(reportOverview.apOpen)}` : '—',
      subValue:    sourceLine('apOpen', reportOverview?.sourceAuthority?.apOpen),
      icon:        TrendingDown,
      accentColor: 'red' as AccentColor,
    },
    {
      label:       t('fin2.home.reimb_amount','待报销金额'),
      value:       reportOverview ? `¥ ${fmt(reportOverview.reimbursementPendingAmount)}` : '—',
      subValue:    expSummary ? `${expSummary.pendingReimb} ${t('fin2.home.pending_reimb_unit','笔待报销')}` : undefined,
      icon:        Receipt,
      accentColor: 'amber' as AccentColor,
    },
    {
      label:       t('fin2.common.disposable_funds','可支配资金'),
      value:       disposableDisplay,
      subValue:    reportOverview
        ? `${sourceLine('todayInflow', reportOverview.sourceAuthority?.todayInflow)} · ${t('fin2.home.today_inflow','今日流入')} ¥${fmt(reportOverview.todayInflow)} / ${t('fin2.home.outflow','流出')} ¥${fmt(reportOverview.todayOutflow)}`
        : undefined,
      icon:        Activity,
      accentColor: reportOverview?.netOperatingPosition !== undefined && reportOverview.netOperatingPosition >= 0
        ? ('violet' as AccentColor)
        : ('red' as AccentColor),
    },
    {
      label:       t('fin2.home.shareholder_balance','股东出资余额'),
      value:       shSummary ? `¥ ${fmt(shSummary.balanceAmountOriginal)}` : '—',
      subValue:    shSummary ? `${shSummary.pendingConfirmations} ${t('fin2.home.pending_confirm_unit','笔待确认')}` : undefined,
      icon:        Users,
      accentColor: 'indigo' as AccentColor,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('fin2.common.finance_mgmt','财务管理')}
        subtitle={t('fin2.home.subtitle','应付 · 应收 · 资金账户 · 费用报销 · 股东资金 · 可支配资金')}
        breadcrumb={[t('fin2.common.finance_mgmt','财务管理'), t('fin2.home.cockpit','驾驶舱')]}
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
                <Wallet size={14} /> {t('fin2.home.cash_payment','现金收付款')}
              </Link>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {t('fin2.common.refresh','刷新')}
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
        <SectionLabel>{t('fin2.home.core_metrics','财务核心指标')}</SectionLabel>
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

      {!loading && chanjetAlignment && alignmentSummary && (
        <section
          className="mb-8"
          style={{
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 12,
            background: 'var(--bg-card, #fff)',
            padding: 18,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text, #111827)', marginBottom: 4 }}>
                好业财财务口径对齐
              </div>
              <div style={{ color: 'var(--text-muted, #6b7280)', fontSize: 13 }}>
                好业财可覆盖的财务卡片采用好业财为权威口径；ERP 明细作为辅助差异，不静默覆盖。
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {[
                [`覆盖 ${alignmentSummary.covered}/${alignmentSummary.total}`, 'OK' as AlignmentStatus],
                [`一致 ${alignmentSummary.ok}`, 'OK' as AlignmentStatus],
                [`差异 ${alignmentSummary.mismatch + alignmentSummary.warn}`, alignmentSummary.mismatch > 0 ? 'MISMATCH' as AlignmentStatus : 'WARN' as AlignmentStatus],
                [`待同步 ${alignmentSummary.fallback}`, 'ERP_FALLBACK' as AlignmentStatus],
              ].map(([label, status]) => {
                const tone = statusTone(status as AlignmentStatus);
                return (
                  <span key={String(label)} style={{
                    border: `1px solid ${tone.border}`,
                    background: tone.bg,
                    color: tone.fg,
                    borderRadius: 999,
                    padding: '5px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}>
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {chanjetAlignment.cards.slice(0, 8).map((card) => {
              const tone = statusTone(card.status);
              return (
                <div key={card.cardKey} style={{
                  border: `1px solid ${tone.border}`,
                  borderRadius: 10,
                  padding: 12,
                  background: card.status === 'OK' ? 'var(--bg-subtle, #fafafa)' : tone.bg,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 13, color: 'var(--text, #111827)' }}>{card.label}</strong>
                    <span style={{ color: tone.fg, fontSize: 12, fontWeight: 800 }}>{statusLabel(card.status)}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text, #111827)', marginBottom: 6 }}>
                    ¥ {fmt(card.displayValue)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)', lineHeight: 1.6 }}>
                    <div>{sourceLabel(card.source)} · {card.rows} 行 · {card.latestPeriod ?? '无期间'}</div>
                    <div>ERP 辅助 ¥{fmt(card.erpValue)}{card.chanjetValue !== null ? ` / 好业财 ¥${fmt(card.chanjetValue)}` : ''}</div>
                    {card.status !== 'OK' && card.status !== 'ERP_FALLBACK' && (
                      <div style={{ color: tone.fg, fontWeight: 700 }}>差异 ¥{fmt(card.diffAbs)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 应收账款异常提示（有逾期时高亮） ──────────────────────────── */}
      {!loading && arSummary && arSummary.overdue_invoices > 0 && (
        <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-6 text-sm text-danger">
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span>
            {t('fin2.home.overdue_alert_pre','当前有')} <strong>{arSummary.overdue_invoices}</strong> {t('fin2.home.overdue_alert_mid','笔应收账款逾期，逾期余额')} <strong>¥ {fmt(arSummary.overdue_balance)}</strong>{t('fin2.home.overdue_alert_post','，请及时跟进。')}
          </span>
        </div>
      )}

      {/* ── 待处理转账提示 ─────────────────────────────────────────────── */}
      {!loading && cashDash && cashDash.pendingTransfers > 0 && (
        <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-xl px-4 py-3 mb-6 text-sm text-warning">
          <DollarSign size={15} className="flex-shrink-0" />
          <span>
            {t('fin2.home.pending_tfr_pre','有')} <strong>{cashDash.pendingTransfers}</strong> {t('fin2.home.pending_tfr_post','笔转账申请等待审批。')}
          </span>
        </div>
      )}

      {/* ── 功能模块导航 ──────────────────────────────────────────────── */}
      <SectionLabel>{t('fin2.home.func_modules','功能模块')}</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {MODULES
          .filter(m => hasPermission(m.perm, 'V'))
          .map((m) => (
          <NavCard
            key={m.path}
            icon={m.icon}
            title={t(`fin2.home.mod_${m.path.split('/').pop()?.replace(/-/g, '_')}_title`, m.title)}
            description={t(`fin2.home.mod_${m.path.split('/').pop()?.replace(/-/g, '_')}_desc`, m.description)}
            href={m.path}
            accent={m.accent}
          />
        ))}
      </div>
    </div>
  );
}
