'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingDown, TrendingUp, Wallet, Users, PieChart,
  Receipt, CheckCircle, AlertTriangle, ArrowRight,
  RefreshCw, Database, DollarSign, ArrowLeftRight,
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
  totalContributions:    number;
  confirmedContributions: number;
  pendingConfirmations:  number;
  totalAmountOriginal:   number;
  settledAmountOriginal: number;
  balanceAmountOriginal: number;
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
  apOpen:                      number;
  arOpen:                      number;
  cashBalance:                 number;
  netOperatingPosition:        number;
  todayInflow:                 number;
  todayOutflow:                number;
  reimbursementPendingAmount:  number;
}

interface HealthData {
  status:       string;
  module:       string;
  phase:        string;
  tables:       string[];
  legacy_frozen: string[];
  timestamp:    string;
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

function PhaseBadge({ phase, status }: { phase: number; status: 'READY' | 'ACTIVE' | 'PLANNED' | 'FROZEN' }) {
  const map = {
    READY:   { label: '✅ 底座就绪', bg: '#f0fdf4', color: '#059669' },
    ACTIVE:  { label: '🔄 建设中',   bg: '#eff6ff', color: '#2563eb' },
    PLANNED: { label: `📋 Phase ${phase}`, bg: '#fafafa', color: '#6b7280' },
    FROZEN:  { label: '🔒 已废弃',   bg: '#fef3c7', color: '#d97706' },
  };
  const cfg = map[status];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color,
    }}>{cfg.label}</span>
  );
}

function ModuleCard({
  icon: Icon, title, description, phase, phaseStatus, path, iconColor,
}: {
  icon: React.ElementType; title: string; description: string;
  phase: number; phaseStatus: 'READY' | 'ACTIVE' | 'PLANNED' | 'FROZEN';
  path?: string; iconColor?: string;
}) {
  const router = useRouter();
  const canNav = !!path && (phaseStatus === 'ACTIVE' || phaseStatus === 'READY');

  return (
    <div
      onClick={() => canNav && router.push(path!)}
      style={{
        background: '#fff', borderRadius: 16, border: '1.5px solid #f1f5f9',
        padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        cursor: canNav ? 'pointer' : 'default',
        opacity: phaseStatus === 'PLANNED' && phase > 3 ? 0.65 : 1,
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { if (canNav) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#c7d2fe'; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#f1f5f9'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${iconColor ?? '#6366f1'}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={iconColor ?? '#6366f1'} />
        </div>
        <PhaseBadge phase={phase} status={phaseStatus} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{description}</div>
      {canNav && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 12, color: '#6366f1' }}>
          进入 <ArrowRight size={12} />
        </div>
      )}
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────────────────

function fmtMoney(val: string | number | null | undefined, currency = 'CNY') {
  const n = Number(val ?? 0);
  const sym = currency === 'USD' ? '$' : '¥';
  return `${currency} ${sym}${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0.00';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Finance2DashboardPage() {
  const [health,        setHealth]       = useState<HealthData | null>(null);
  const [arSummary,     setArSummary]    = useState<ArSummaryData | null>(null);
  const [cashDash,      setCashDash]     = useState<CashDashData | null>(null);
  const [shSummary,     setShSummary]    = useState<ShSummaryData | null>(null);
  const [expSummary,    setExpSummary]   = useState<ExpSummaryData | null>(null);
  const [reportOverview, setReportOverview] = useState<ReportOverviewData | null>(null);
  const [loading,       setLoading]      = useState(true);
  const [error,         setError]        = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [h, ar, cashSummary, pendingTfr, sh, exp, rpt] = await Promise.allSettled([
        apiFetch<HealthData>('/api/v2/finance/health'),
        apiFetch<ArSummaryData>('/api/v2/finance/ar/summary'),
        apiFetch<CashDashData['summary']>('/api/v2/finance/cash/accounts/summary'),
        apiFetch<{ total: number }>('/api/v2/finance/cash/transfers?status=PENDING_APPROVAL&pageSize=1'),
        apiFetch<ShSummaryData>('/api/v2/finance/shareholders/summary'),
        apiFetch<ExpSummaryData>('/api/v2/finance/expenses/summary'),
        apiFetch<ReportOverviewData>('/api/v2/finance/reports/overview'),
      ]);

      if (h.status === 'fulfilled')   setHealth(h.value);
      if (ar.status === 'fulfilled')  setArSummary(ar.value);
      if (sh.status === 'fulfilled')  setShSummary(sh.value);
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
        title="Finance V2"
        subtitle="Workflow Native 财务平台 — Phase 6 Financial Reports Runtime"
        breadcrumb={['Finance V2', 'Dashboard']}
        actions={
          <button
            onClick={() => void load()}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              border: '1.5px solid #e2e8f0', background: '#fff',
              fontSize: 13, cursor: 'pointer', color: '#475569',
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            刷新
          </button>
        }
      />

      {/* Phase 6 Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f766e 100%)',
        borderRadius: 16, padding: '22px 28px', marginBottom: 24, color: '#fff',
      }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>
          ✅ Finance V2 Phase 6 — Financial Reports Runtime 正式启用
        </div>
        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.8, marginBottom: 14 }}>
          12 只读聚合报表 API · AP/AR/Cash/Expense/Shareholder/Project/Company 统一分析<br />
          经营净头寸 · 账龄分析 · 项目财务视图 · 公司经营视图 · DataScope 全程合规
        </div>

        {/* 底座状态栏 */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'AP Runtime',          value: 'LIVE', ok: true },
            { label: 'AR Runtime',          value: 'LIVE', ok: true },
            { label: 'Cash Runtime',        value: 'LIVE', ok: true },
            { label: 'Shareholder Runtime', value: 'LIVE', ok: true },
            { label: 'Expense Runtime',     value: 'LIVE', ok: true },
            { label: 'Reports Runtime',     value: 'LIVE', ok: true },
            { label: 'fin_* 表骨架',        value: loading ? '…' : (health?.status === 'ok' ? 'READY' : 'ERR'), ok: health?.status === 'ok' },
            { label: 'Phase',               value: health?.phase ?? '…', ok: true },
          ].map(item => (
            <div key={item.label} style={{ fontSize: 12 }}>
              <span style={{ opacity: 0.7 }}>{item.label}</span>
              <span style={{
                marginLeft: 6, fontWeight: 700, padding: '1px 8px', borderRadius: 10,
                background: item.ok ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
              }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '12px 16px', marginBottom: 20, color: '#ef4444', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Phase 6 — 经营净头寸 KPI */}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#374151' }}>
        经营资金总览（Phase 6 Reports Runtime）
      </div>
      {reportOverview && (
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0f766e 100%)',
          borderRadius: 14, padding: '18px 22px', marginBottom: 16, color: '#fff',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>经营净头寸</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>
              {reportOverview.netOperatingPosition >= 0 ? '+' : ''}¥ {fmt(reportOverview.netOperatingPosition)}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>= 现金 + AR − AP − 待报销</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>今日流入</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#86efac', marginTop: 2 }}>
              +¥ {fmt(reportOverview.todayInflow)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>今日流出</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fca5a5', marginTop: 2 }}>
              -¥ {fmt(reportOverview.todayOutflow)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>AR 待收款</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>¥ {fmt(reportOverview.arOpen)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>AP 待付款</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>¥ {fmt(reportOverview.apOpen)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>现金账户余额</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>¥ {fmt(reportOverview.cashBalance)}</div>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 24 }} />

      {/* Shareholder KPI 快览 */}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#374151' }}>
        Shareholder Runtime KPI（股东资金）
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[
          {
            label: '出资总余额',
            value: shSummary ? `¥ ${fmt(shSummary.balanceAmountOriginal)}` : (loading ? '…' : '—'),
            icon: <Users size={16} color="#7c3aed" />, bg: '#f5f3ff', border: '#ddd6fe',
          },
          {
            label: '累计出资总额',
            value: shSummary ? `¥ ${fmt(shSummary.totalAmountOriginal)}` : (loading ? '…' : '—'),
            icon: <DollarSign size={16} color="#6d28d9" />, bg: '#ede9fe', border: '#c4b5fd',
          },
          {
            label: '已结算总额',
            value: shSummary ? `¥ ${fmt(shSummary.settledAmountOriginal)}` : (loading ? '…' : '—'),
            icon: <CheckCircle size={16} color="#059669" />, bg: '#f0fdf4', border: '#bbf7d0',
          },
          {
            label: '已确认出资笔数',
            value: shSummary ? `${shSummary.confirmedContributions} 笔` : (loading ? '…' : '—'),
            icon: <Activity size={16} color="#0891b2" />, bg: '#f0fdfa', border: '#a7f3d0',
          },
          {
            label: '待确认出资',
            value: shSummary ? `${shSummary.pendingConfirmations} 笔` : (loading ? '…' : '—'),
            icon: <AlertTriangle size={16} color="#d97706" />, bg: '#fffbeb', border: '#fde68a',
          },
        ].map(c => (
          <div key={c.label} style={{
            background: c.bg, border: `1.5px solid ${c.border}`,
            borderRadius: 14, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 1 }}>{c.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Expense KPI 快览 */}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#374151' }}>
        Expense Runtime KPI（费用 · 报销）
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[
          {
            label: '费用申请总数',
            value: expSummary ? `${expSummary.totalExpenses} 笔` : (loading ? '…' : '—'),
            icon: <Receipt size={16} color="#6366f1" />, bg: '#eef2ff', border: '#c7d2fe',
          },
          {
            label: '审批中',
            value: expSummary ? `${expSummary.pendingApproval} 笔` : (loading ? '…' : '—'),
            icon: <AlertTriangle size={16} color="#f59e0b" />, bg: '#fffbeb', border: '#fde68a',
          },
          {
            label: '已审批',
            value: expSummary ? `${expSummary.approved} 笔` : (loading ? '…' : '—'),
            icon: <CheckCircle size={16} color="#10b981" />, bg: '#f0fdf4', border: '#a7f3d0',
          },
          {
            label: '待报销',
            value: expSummary ? `${expSummary.pendingReimb} 笔` : (loading ? '…' : '—'),
            icon: <Activity size={16} color="#f59e0b" />, bg: '#fffbeb', border: '#fde68a',
          },
          {
            label: '今日已付款',
            value: expSummary ? `${expSummary.paidToday} 笔` : (loading ? '…' : '—'),
            icon: <DollarSign size={16} color="#059669" />, bg: '#f0fdf4', border: '#a7f3d0',
          },
        ].map(c => (
          <div key={c.label} style={{
            background: c.bg, border: `1.5px solid ${c.border}`,
            borderRadius: 14, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 1 }}>{c.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Cash KPI 快览 */}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#374151' }}>
        Cash Runtime KPI（资金账户）
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[
          {
            label: '账户总余额',
            value: cashDash?.summary ? `¥ ${fmt(cashDash.summary.totalBalance)}` : (loading ? '…' : '—'),
            icon: <DollarSign size={16} color="#2563eb" />, bg: '#eff6ff', border: '#bfdbfe',
          },
          {
            label: '账户总数',
            value: cashDash?.summary ? `${cashDash.summary.totalAccounts} 个` : (loading ? '…' : '—'),
            icon: <Wallet size={16} color="#7c3aed" />, bg: '#f5f3ff', border: '#ddd6fe',
          },
          {
            label: '正常账户',
            value: cashDash?.summary ? `${cashDash.summary.activeCount} 个` : (loading ? '…' : '—'),
            icon: <Activity size={16} color="#16a34a" />, bg: '#f0fdf4', border: '#bbf7d0',
          },
          {
            label: '冻结账户',
            value: cashDash?.summary ? `${cashDash.summary.frozenCount} 个` : (loading ? '…' : '—'),
            icon: <Lock size={16} color="#d97706" />, bg: '#fffbeb', border: '#fde68a',
          },
          {
            label: '待处理转账',
            value: cashDash ? `${cashDash.pendingTransfers} 笔` : (loading ? '…' : '—'),
            icon: <ArrowLeftRight size={16} color="#0891b2" />, bg: '#f0fdfa', border: '#a7f3d0',
          },
        ].map(c => (
          <div key={c.label} style={{
            background: c.bg, border: `1.5px solid ${c.border}`,
            borderRadius: 14, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 1 }}>{c.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* AR KPI 快览 */}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#374151' }}>
        AR Runtime KPI（应收账款）
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'AR 总笔数',  value: String(arSummary?.total_invoices   ?? (loading ? '…' : '—')), color: '#10b981' },
          { label: '未收款',     value: String(arSummary?.open_invoices    ?? (loading ? '…' : '—')), color: '#f59e0b' },
          { label: '逾期笔数',   value: String(arSummary?.overdue_invoices ?? (loading ? '…' : '—')), color: '#dc2626' },
          {
            label: '待收余额',
            value: arSummary ? fmtMoney(arSummary.balance_amount_original, arSummary.byCurrency?.[0]?.currency_code ?? 'CNY') : (loading ? '…' : '—'),
            color: '#ef4444',
          },
          {
            label: '逾期余额',
            value: arSummary ? fmtMoney(arSummary.overdue_balance, arSummary.byCurrency?.[0]?.currency_code ?? 'CNY') : (loading ? '…' : '—'),
            color: '#991b1b',
          },
        ].map(item => (
          <div key={item.label} style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', border: '1.5px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* 模块路线图 */}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#374151' }}>
        Finance V2 模块路线图
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14, marginBottom: 28,
      }}>
        <ModuleCard
          icon={TrendingDown} iconColor="#f59e0b"
          title="AP Runtime（应付账款）"
          phase={1} phaseStatus="ACTIVE"
          path="/finance2/ap"
          description="fin_ap_invoices + fin_ap_payment_allocations。供应商发票管理、付款核销、多币种、账龄分析。"
        />
        <ModuleCard
          icon={TrendingUp} iconColor="#10b981"
          title="AR Runtime（应收账款）"
          phase={2} phaseStatus="ACTIVE"
          path="/finance2/ar"
          description="fin_ar_invoices + fin_ar_receipts + 核销分摊。客户发票、收款核销、账龄分析。Phase 2 已上线。"
        />
        <ModuleCard
          icon={Wallet} iconColor="#3b82f6"
          title="Cash Runtime（资金账户）"
          phase={3} phaseStatus="ACTIVE"
          path="/finance2/cash-accounts"
          description="fin_cash_accounts + fin_cash_transactions + fin_fund_transfers。多账户余额、流水账本、转账审批。"
        />
        <ModuleCard
          icon={ArrowLeftRight} iconColor="#0891b2"
          title="资金转账"
          phase={3} phaseStatus="ACTIVE"
          path="/finance2/fund-transfers"
          description="账户间资金划转，5 状态审批工作流（DRAFT→PENDING→APPROVED→EXECUTED），SERIALIZABLE 事务保障。"
        />
        <ModuleCard
          icon={Users} iconColor="#7c3aed"
          title="股东资金 Runtime"
          phase={4} phaseStatus="ACTIVE"
          path="/finance2/shareholder-funds"
          description="fin_shareholder_contributions + fin_shareholder_settlements。出资台账、结算审批（RETURN/OFFSET/WRITE_OFF）、联动 Cash Runtime。"
        />
        <ModuleCard
          icon={Receipt} iconColor="#6366f1"
          title="Expense Runtime（费用）"
          phase={5} phaseStatus="ACTIVE"
          path="/finance2/expenses"
          description="fin_expense_requests + fin_reimbursements。完全 Workflow Native。审批通过自动生成报销，付款联动 Cash Runtime。"
        />
        <ModuleCard
          icon={ArrowLeftRight} iconColor="#059669"
          title="报销管理"
          phase={5} phaseStatus="ACTIVE"
          path="/finance2/reimbursements"
          description="报销台账，SERIALIZABLE 付款事务，自动扣减现金账户余额，写 OUT 流水。"
        />
        <ModuleCard
          icon={PieChart} iconColor="#0891b2"
          title="Financial Reports（经营报表）"
          phase={6} phaseStatus="ACTIVE"
          path="/finance2/reports"
          description="12 只读聚合 API。AP/AR 账龄 · 资金日报 · 费用统计 · 股东资金 · 项目财务 · 公司经营净头寸。Phase 6 已上线。"
        />
      </div>

      {/* 已就绪底座 */}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#374151' }}>已就绪底座</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { icon: CheckCircle, color: '#059669', title: 'Workflow 2.0 Platform',  desc: 'Phase A-I 全部完成，ApprovalEngine + Form Runtime + SLA 已就绪' },
          { icon: CheckCircle, color: '#059669', title: 'DataScope',              desc: '基于 OrgModule @Global，所有接口自动注入 company_code 范围过滤' },
          { icon: CheckCircle, color: '#059669', title: 'fin_* 表骨架',           desc: '9 张 fin_* 领域表 DDL 已创建，Entity 骨架已注册 TypeORM' },
          { icon: CheckCircle, color: '#059669', title: 'RBAC 矩阵',              desc: 'MENU_FIN2_* 8 个权限条目已注册，CFO/Finance/Accountant 分级管控' },
          { icon: CheckCircle, color: '#059669', title: 'AP Runtime（Phase 1）',  desc: 'fin_ap_invoices 正式启用，手工创建/PO导入/状态机/账龄分析全部就绪' },
          { icon: CheckCircle, color: '#059669', title: 'AR Runtime（Phase 2）',  desc: 'fin_ar_invoices + fin_ar_receipts 正式启用，收款核销/账龄分析/事务核销全部就绪' },
          { icon: CheckCircle, color: '#059669', title: 'Cash Runtime（Phase 3）',        desc: 'fin_cash_accounts + fin_cash_transactions + fin_fund_transfers 正式启用' },
          { icon: CheckCircle, color: '#059669', title: 'Shareholder Runtime（Phase 4）', desc: 'fin_shareholder_contributions + fin_shareholder_settlements 正式启用，RETURN/OFFSET/WRITE_OFF 结算联动 Cash' },
          { icon: CheckCircle, color: '#059669', title: 'Expense Runtime（Phase 5）',     desc: 'fin_expense_requests + fin_reimbursements 正式启用。完全 Workflow Native，审批通过自动生成报销，付款联动 Cash Runtime' },
          { icon: CheckCircle, color: '#059669', title: 'Reports Runtime（Phase 6）',     desc: '12 只读聚合端点：AP/AR 账龄、资金日报、费用统计、股东资金、项目财务、公司经营净头寸。DataScope 全程合规' },
          { icon: Database,    color: '#64748b', title: '旧 Finance 废弃',                desc: 'fin_transactions / fin_payments / biz_cash_flow 不再写入，只读废弃' },
        ].map(item => (
          <div key={item.title} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <item.icon size={15} color={item.color} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{item.title}</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{item.desc}</div>
          </div>
        ))}
      </div>

      {/* 旧 Finance 废弃说明 */}
      <div style={{ background: '#fff8f1', border: '1.5px solid #fed7aa', borderRadius: 14, padding: '16px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#c2410c', marginBottom: 10 }}>
          ⚠️ 旧 Finance 模块废弃声明（{new Date().toISOString().slice(0, 10)}）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: 12, color: '#9a3412' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>已废弃表（只读，禁止写入）：</div>
            {['fin_transactions', 'fin_payments', 'biz_cash_flow'].map(t => (
              <div key={t} style={{ fontFamily: 'monospace', marginBottom: 2 }}>• {t}</div>
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>已废弃页面（入口关闭）：</div>
            {['/finance', '/finance/payments', '/finance/receivables', '/finance/payables',
              '/finance/aging', '/finance/cashflow', '/finance/cost'].map(p => (
              <div key={p} style={{ fontFamily: 'monospace', marginBottom: 2 }}>• {p}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
