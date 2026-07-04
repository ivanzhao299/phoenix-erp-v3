'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { currencySymbol } from '@/lib/currency';  // G61 多币种符号
import u from "@/styles/uix-utils.module.css";
import { PieChart, BarChart2, TrendingDown, TrendingUp, Wallet, Users, Receipt, Building2, FolderOpen, RefreshCw, AlertTriangle, CheckCircle, DollarSign, ArrowLeftRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/PageHeader';
import { TOKENS } from '@/lib/design-tokens';
import s from "@/components/ui/admin-ui.module.css";

import {
  primaryActionButton, secondaryActionButton, inputField, formLabel,
  drawerMask, drawerPanel, drawerHeader, drawerHeaderTitle, drawerCloseButton, drawerFooter,
  inlineBadge, pillBadge,
  tableContainer, tablePagination, kpiCard,
  heroBanner, heroBannerTitle, heroBannerSubtitle, heroBannerKpi, heroTagChip,
  subTabBar, subTabItem, sectionTitle, statTile, statTileLabel, statTileValue,
  // g200a 模板 token(2026-06-19)
  inlineAlert,
} from '@/components/design-system/cockpit-styles';
// ── 工具 ──────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getToken()}`
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function fmt(n: number | string | null | undefined, dec = 2): string {
  return Number(n ?? 0).toLocaleString('zh-CN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
}
function fmtMoney(n: number | null | undefined): string {
  return `¥ ${fmt(n)}`;
}
// G61：按币种金额（修 fmtMoney 一律贴 ¥ 导致 LAK/USD 符号错）
function fmtCcy(n: number | null | undefined, ccy: string): string {
  return `${currencySymbol(ccy)}${fmt(n)}`;
}
// G61：多币种金额堆叠多行渲染（可支配资金/现金账户跨币种不可裸求和成单一 ¥）
function renderCcyRows(rows: { ccy: string; amount: number }[], fontSize = 18): ReactNode {
  if (rows.length === 0) return '—';
  if (rows.length === 1) return fmtCcy(rows[0].amount, rows[0].ccy);
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize, lineHeight: 1.3 }}>
      {rows.map(r => <span key={r.ccy} style={{ whiteSpace: 'nowrap' }}>{fmtCcy(r.amount, r.ccy)}</span>)}
    </span>
  );
}

// ── 子组件 ────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color
}: {
  label: string;
  value: ReactNode;   // G61 支持多币种堆叠 JSX
  sub?: string;
  icon?: React.ElementType;
  color?: string;
}) {
  return <div style={kpiCard}>
      <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }}>
        {Icon && <div style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        flexShrink: 0,
        background: `${color ?? 'var(--color-primary)'}18`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
            <Icon size={14} color={color ?? 'var(--color-primary)'} />
          </div>}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{
      fontSize: 22,
      fontWeight: 800,
      color: 'var(--text-primary)',
      lineHeight: 1.2,
      marginTop: 2,
    }}>{value}</div>
      {sub && <div style={{
      fontSize: 11,
      color: 'var(--text-secondary)',
      marginTop: 'auto'
    }}>{sub}</div>}
    </div>;
}
function SectionTitle({
  children
}: {
  children: React.ReactNode;
}) {
  return <div style={sectionTitle}>{children}</div>;
}
function TableWrapper({
  children
}: {
  children: React.ReactNode;
}) {
  return <div style={{ ...tableContainer, overflowX: 'auto' }}>
      <table className={s.table}>
        {children}
      </table>
    </div>;
}
function Th({
  children,
  right
}: {
  children: React.ReactNode;
  right?: boolean;
}) {
  return <th style={{
    textAlign: right ? 'right' : 'left',
    whiteSpace: 'nowrap'
  }}>{children}</th>;
}
function Td({
  children,
  right,
  bold
}: {
  children: React.ReactNode;
  right?: boolean;
  bold?: boolean;
}) {
  // g199c 推广(2026-06-19):右对齐列默认数字列,加 tabular-nums 让金额对齐
  return <td className={bold ? 'text-text' : 'text-text-muted'} style={{
    textAlign: right ? 'right' : 'left',
    fontWeight: bold ? 700 : undefined,
    whiteSpace: 'nowrap',
    ...(right ? { fontVariantNumeric: 'tabular-nums' as const } : {}),
  }}>{children}</td>;
}
function AgingBar({
  notDue,
  d030,
  d3160,
  d6190,
  dOver90,
  total
}: {
  notDue: number;
  d030: number;
  d3160: number;
  d6190: number;
  dOver90: number;
  total: number;
}) {
  const { t } = useLanguage();
  if (!total) return null;
  const pct = (v: number) => `${Math.round(v / total * 100)}%`;
  const segs = [{
    v: notDue,
    color: 'var(--status-success)',
    label: t('fin2.reports.not_due','未逾期')
  }, {
    v: d030,
    color: 'var(--status-warning)',
    label: t('fin2.reports.aging_0_30','0-30天')
  }, {
    v: d3160,
    color: 'var(--status-warning)',
    label: t('fin2.reports.aging_31_60','31-60天')
  }, {
    v: d6190,
    color: 'var(--status-danger)',
    label: t('fin2.reports.aging_61_90','61-90天')
  }, {
    v: dOver90,
    color: 'var(--status-danger-dark)',
    label: t('fin2.reports.aging_over_90','90天+')
  }];
  return <div style={{
    height: 6,
    borderRadius: 3,
    display: 'flex',
    overflow: 'hidden',
    gap: 1
  }}>
      {segs.filter(s => s.v > 0).map(s => <div key={s.label} title={`${s.label}: ¥${fmt(s.v)} (${pct(s.v)})`} style={{
      width: pct(s.v),
      background: s.color,
      height: '100%'
    }} />)}
    </div>;
}
function Spinner() {
  return <div className="text-text-dim" style={{
    display: 'flex',
    justifyContent: 'center',
    padding: '48px'
  }}>
      <RefreshCw size={20} style={{
      animation: 'spin 1s linear infinite'
    }} />
    </div>;
}
function Empty({
  text
}: {
  text?: string;
}) {
  const { t } = useLanguage();
  return <div className="text-text-dim" style={{
    textAlign: 'center',
    padding: '32px',
    fontSize: 13
  }}>
      {text ?? t('fin2.reports.no_data','暂无数据')}
    </div>;
}

// ── Tab 内容组件 ──────────────────────────────────────────────────────────────

// --- Tab 0: 总览 ---

interface OverviewData {
  apOpen: number;
  arOpen: number;
  cashBalance: number;
  shareholderBalance: number;
  expensePendingCount: number;
  expensePendingAmount: number;
  reimbursementPendingCount: number;
  reimbursementPendingAmount: number;
  netOperatingPosition: number;
  todayInflow: number;
  todayOutflow: number;
  byCurrency: {
    currencyCode: string;
    cashBalance: number;
  }[];
  byCompany: {
    companyCode: string;
    cashBalance: number;
  }[];
  sourceAuthority?: {
    apOpen: string;
    arOpen: string;
    cashBalance: string;
    shareholderBalance: string;
    expensePending: string;
    reimbursementPending: string;
  };
  chanjetAlignment?: {
    coverageRate: number;
    metrics: {
      apOpen: { source: string; authoritativeValue: number; erpValue: number; diff: number; covered: boolean; latestPeriod: string | null };
      arOpen: { source: string; authoritativeValue: number; erpValue: number; diff: number; covered: boolean; latestPeriod: string | null };
    };
    guardrail: string;
  };
}

function sourceLabel(source?: string) {
  if (!source) return '';
  if (source.startsWith('CHANJET')) return '好业财口径';
  if (source === 'ERP_FALLBACK') return 'ERP回退';
  return source.replace(/_/g, ' ');
}

function chanjetSub(data: OverviewData, key: 'arOpen' | 'apOpen') {
  const metric = data.chanjetAlignment?.metrics?.[key];
  const source = data.sourceAuthority?.[key];
  if (!metric) return sourceLabel(source);
  const diff = metric.covered ? `差异 ${fmt(metric.diff)}` : '待同步好业财镜像';
  const period = metric.latestPeriod ? ` · 期间 ${metric.latestPeriod}` : '';
  return `${sourceLabel(source)} · ${diff}${period}`;
}

function OverviewTab() {
  const { t } = useLanguage();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<OverviewData>('/api/v2/finance/reports/overview').then(setData).finally(() => setLoading(false));
  }, []);
  // ⚠️ React #310 修复:hooks 必须在所有 early return 之前调用,顺序固定。
  //    之前 useMemo 在 if (loading) return 之后 → 第一次 render(loading=true)只 3 个 hooks,
  //    第二次(loading=false)5 个 hooks → 数量不一致崩页。
  // G61:现金/可支配资金按币种(跨币种不可裸求和成单一 ¥)。
  //    现金 = byCurrency;可支配 = 现金各币种 + CNY 行并入 (应收 − 应付 − 待报销)(本币口径)。
  const cashRows = useMemo(
    () => (data?.byCurrency ?? []).map(r => ({ ccy: r.currencyCode, amount: r.cashBalance })),
    [data?.byCurrency],
  );
  const cnyAdj = (data?.arOpen ?? 0) - (data?.apOpen ?? 0) - (data?.reimbursementPendingAmount ?? 0);
  const disposableRows = useMemo(() => {
    const rows = cashRows.length > 0
      ? cashRows.map(r => ({ ccy: r.ccy, amount: r.amount + (r.ccy === 'CNY' ? cnyAdj : 0) }))
      : [];
    if (cnyAdj !== 0 && cashRows.length > 0 && !rows.some(r => r.ccy === 'CNY')) {
      rows.push({ ccy: 'CNY', amount: cnyAdj });
    }
    return rows;
  }, [cashRows, cnyAdj]);

  if (loading) return <Spinner />;
  if (!data) return <Empty text={t('fin2.common.load_failed','加载失败')} />;
  const netColor = data.netOperatingPosition >= 0 ? TOKENS.css.statusSuccess : TOKENS.css.statusDanger;
  return <div>
      {/* 可支配资金 主 KPI（按币种） */}
      <div style={{ ...heroBanner, flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 4 }}>{t('fin2.common.disposable_funds','可支配资金')}（Net Operating Position）· {t('fin2.reports.by_currency','按币种')}</div>
        <div style={{ ...heroBannerKpi(disposableRows.length > 1 ? 22 : 36) }}>
          {disposableRows.length > 0
            ? renderCcyRows(disposableRows, disposableRows.length > 1 ? 22 : 36)
            : `¥ ${fmt(data.netOperatingPosition)}`}
        </div>
        <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6 }}>
          {t('fin2.reports.disposable_formula','= 现金余额 + 应收待收 − 应付待付 − 待报销金额（外币不折算本币，按币种列示）')}
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
          {[{
            label: t('fin2.reports.today_inflow','今日流入'),
            value: `+¥${fmt(data.todayInflow)}`,
            color: 'var(--status-success)'
          }, {
            label: t('fin2.reports.today_outflow','今日流出'),
            value: `-¥${fmt(data.todayOutflow)}`,
            color: 'var(--status-danger)'
          }, {
            label: t('fin2.reports.today_net','今日净额'),
            value: `¥${fmt(data.todayInflow - data.todayOutflow)}`,
            color: data.todayInflow >= data.todayOutflow ? 'var(--status-success)' : 'var(--status-danger)'
          }].map(item => (
            <div key={item.label} style={{ fontSize: 12 }}>
              <span style={{ opacity: 0.7 }}>{item.label}</span>
              <span style={{ marginLeft: 6, fontWeight: 700, color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 10,
      marginBottom: 20
    }}>
        <KpiCard label={t('fin2.reports.cash_account_balance','现金账户余额')} value={cashRows.length > 0 ? renderCcyRows(cashRows, 16) : fmtMoney(data.cashBalance)} icon={Wallet} color="var(--color-primary)" />
        <KpiCard label={t('fin2.reports.ar_open','应收待收款')} value={fmtMoney(data.arOpen)} sub={chanjetSub(data, 'arOpen')} icon={TrendingUp} color="var(--status-success)" />
        <KpiCard label={t('fin2.reports.ap_open','应付待付款')} value={fmtMoney(data.apOpen)} sub={chanjetSub(data, 'apOpen')} icon={TrendingDown} color="var(--status-warning)" />
        <KpiCard label={t('fin2.reports.shareholder_balance','股东资金余额')} value={fmtMoney(data.shareholderBalance)} icon={Users} color="var(--status-info)" />
        <KpiCard label={t('fin2.reports.expense_pending','费用待审批')} value={`${data.expensePendingCount} ${t('fin2.common.count_unit','笔')}`} sub={fmtMoney(data.expensePendingAmount)} icon={Receipt} color="var(--color-primary)" />
        <KpiCard label={t('fin2.reports.reimb_pending','报销待处理')} value={`${data.reimbursementPendingCount} ${t('fin2.common.count_unit','笔')}`} sub={fmtMoney(data.reimbursementPendingAmount)} icon={ArrowLeftRight} color="var(--color-accent)" />
      </div>

      <div style={{ ...inlineAlert('info'), marginBottom: 16 }}>
        <strong>财务数字来源：</strong>
        应收/应付优先采用好业财只读镜像；未覆盖项明确显示 ERP 回退。当前好业财覆盖率：
        {Math.round((data.chanjetAlignment?.coverageRate ?? 0) * 100)}%。
      </div>

      {data.byCurrency.length > 0 && <>
          <SectionTitle>{t('fin2.common.cash_balance','现金余额')} — {t('fin2.reports.by_currency','按币种')}</SectionTitle>
          <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 16
      }}>
            {data.byCurrency.map(r => (
              <div key={r.currencyCode} style={statTile}>
                <div style={statTileLabel}>{r.currencyCode}</div>
                <div style={statTileValue}>{fmtCcy(r.cashBalance, r.currencyCode)}</div>
              </div>
            ))}
          </div>
        </>}

      {data.byCompany.length > 0 && <>
          <SectionTitle>{t('fin2.common.cash_balance','现金余额')} — {t('fin2.reports.by_company','按公司')}</SectionTitle>
          <TableWrapper>
            <thead><tr><Th>{t('fin2.reports.company_code','公司代码')}</Th><Th right>{t('fin2.common.cash_balance','现金余额')}</Th></tr></thead>
            <tbody>
              {data.byCompany.map(r => <tr key={r.companyCode}>
                  <Td>{r.companyCode}</Td>
                  <Td right bold>{fmtMoney(r.cashBalance)}</Td>
                </tr>)}
            </tbody>
          </TableWrapper>
        </>}
    </div>;
}

// --- Tab 1: AP ---

interface ApAgingRow {
  supplierName: string;
  supplierCode?: string;
  currencyCode: string;
  companyCode: string;
  notDue: number;
  d030: number;
  d3160: number;
  d6190: number;
  dOver90: number;
  total: number;
}
interface ApAgingData {
  summary: {
    notDue: number;
    d030: number;
    d3160: number;
    d6190: number;
    dOver90: number;
    total: number;
  };
  rows: ApAgingRow[];
}
interface ApTopRow {
  rank: number;
  supplierName: string;
  supplierCode?: string;
  invoiceCount: number;
  totalAmount: number;
  openAmount: number;
}
function ApTab() {
  const { t } = useLanguage();
  const [aging, setAging] = useState<ApAgingData | null>(null);
  const [topSup, setTopSup] = useState<ApTopRow[] | null>(null);
  const [loadAging, setLoadAging] = useState(true);
  const [loadTop, setLoadTop] = useState(true);
  useEffect(() => {
    apiFetch<ApAgingData>('/api/v2/finance/reports/ap-aging').then(setAging).finally(() => setLoadAging(false));
    apiFetch<ApTopRow[]>('/api/v2/finance/reports/ap-top-suppliers').then(setTopSup).finally(() => setLoadTop(false));
  }, []);
  const s = aging?.summary;
  return <div>
      {/* 账龄汇总条 */}
      {s && <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      gap: 10,
      marginBottom: 20
    }}>
          <KpiCard label={t('fin2.reports.ap_total','应付合计')} value={fmtMoney(s.total)} icon={TrendingDown} color="var(--status-warning)" />
          <KpiCard label={t('fin2.reports.not_due','未逾期')} value={fmtMoney(s.notDue)} icon={CheckCircle} color="var(--status-success)" />
          <KpiCard label={t('fin2.reports.aging_0_30_sp','0-30 天')} value={fmtMoney(s.d030)} icon={AlertTriangle} color="var(--status-warning)" />
          <KpiCard label={t('fin2.reports.aging_31_60_sp','31-60 天')} value={fmtMoney(s.d3160)} icon={AlertTriangle} color="var(--status-warning)" />
          <KpiCard label={t('fin2.reports.aging_61_90_sp','61-90 天')} value={fmtMoney(s.d6190)} icon={AlertTriangle} color="var(--status-danger)" />
          <KpiCard label={t('fin2.reports.aging_over_90_sp','90 天以上')} value={fmtMoney(s.dOver90)} icon={AlertTriangle} color="var(--status-danger)" />
        </div>}

      <SectionTitle>{t('fin2.reports.ap_aging_detail','应付账龄明细（按供应商）')}</SectionTitle>
      {loadAging ? <Spinner /> : !aging?.rows.length ? <Empty /> : <TableWrapper>
          <thead>
            <tr>
              <Th>{t('fin2.common.supplier','供应商')}</Th><Th>{t('fin2.common.company','公司')}</Th><Th>{t('fin2.common.currency','币种')}</Th>
              <Th right>{t('fin2.reports.not_due','未逾期')}</Th><Th right>{t('fin2.reports.aging_0_30','0-30天')}</Th><Th right>{t('fin2.reports.aging_31_60','31-60天')}</Th>
              <Th right>{t('fin2.reports.aging_61_90','61-90天')}</Th><Th right>{t('fin2.reports.aging_over_90','90天+')}</Th><Th right>{t('fin2.reports.total_col','合计')}</Th>
              <Th>{t('fin2.reports.aging_dist','账龄分布')}</Th>
            </tr>
          </thead>
          <tbody>
            {aging.rows.map((r, i) => <tr key={i}>
                <Td bold>{r.supplierName}</Td>
                <Td>{r.companyCode}</Td>
                <Td>{r.currencyCode}</Td>
                <Td right>{fmt(r.notDue)}</Td>
                <Td right>{fmt(r.d030)}</Td>
                <Td right>{fmt(r.d3160)}</Td>
                <Td right>{fmt(r.d6190)}</Td>
                <Td right>{fmt(r.dOver90)}</Td>
                <Td right bold>{fmt(r.total)}</Td>
                <td style={{
            width: 100
          }}>
                  <AgingBar {...r} />
                </td>
              </tr>)}
          </tbody>
        </TableWrapper>}

      <SectionTitle>{t('fin2.reports.top20_suppliers','TOP 20 供应商')}</SectionTitle>
      {loadTop ? <Spinner /> : !topSup?.length ? <Empty /> : <TableWrapper>
          <thead>
            <tr><Th>#</Th><Th>{t('fin2.common.supplier','供应商')}</Th><Th right>{t('fin2.reports.invoice_count','发票笔数')}</Th><Th right>{t('fin2.reports.cumulative_amount','累计金额')}</Th><Th right>{t('fin2.reports.payable_balance','待付余额')}</Th></tr>
          </thead>
          <tbody>
            {topSup.map(r => <tr key={r.rank}>
                <Td>{r.rank}</Td>
                <Td bold>{r.supplierName}</Td>
                <Td right>{r.invoiceCount}</Td>
                <Td right>{fmtMoney(r.totalAmount)}</Td>
                <Td right bold>{fmtMoney(r.openAmount)}</Td>
              </tr>)}
          </tbody>
        </TableWrapper>}
    </div>;
}

// --- Tab 2: AR ---

interface ArAgingRow {
  customerName: string;
  currencyCode: string;
  companyCode: string;
  notDue: number;
  d030: number;
  d3160: number;
  d6190: number;
  dOver90: number;
  total: number;
}
interface ArAgingData {
  summary: {
    notDue: number;
    d030: number;
    d3160: number;
    d6190: number;
    dOver90: number;
    total: number;
  };
  rows: ArAgingRow[];
}
interface ArTopRow {
  rank: number;
  customerName: string;
  invoiceCount: number;
  totalAmount: number;
  openAmount: number;
}
function ArTab() {
  const { t } = useLanguage();
  const [aging, setAging] = useState<ArAgingData | null>(null);
  const [topCust, setTopCust] = useState<ArTopRow[] | null>(null);
  const [loadAg, setLoadAg] = useState(true);
  const [loadTop, setLoadTop] = useState(true);
  useEffect(() => {
    apiFetch<ArAgingData>('/api/v2/finance/reports/ar-aging').then(setAging).finally(() => setLoadAg(false));
    apiFetch<ArTopRow[]>('/api/v2/finance/reports/ar-top-customers').then(setTopCust).finally(() => setLoadTop(false));
  }, []);
  const s = aging?.summary;
  return <div>
      {s && <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      gap: 10,
      marginBottom: 20
    }}>
          <KpiCard label={t('fin2.reports.ar_total','应收合计')} value={fmtMoney(s.total)} icon={TrendingUp} color="var(--status-success)" />
          <KpiCard label={t('fin2.reports.not_due','未逾期')} value={fmtMoney(s.notDue)} icon={CheckCircle} color="var(--status-success)" />
          <KpiCard label={t('fin2.reports.aging_0_30_sp','0-30 天')} value={fmtMoney(s.d030)} icon={AlertTriangle} color="var(--status-warning)" />
          <KpiCard label={t('fin2.reports.aging_31_60_sp','31-60 天')} value={fmtMoney(s.d3160)} icon={AlertTriangle} color="var(--status-warning)" />
          <KpiCard label={t('fin2.reports.aging_61_90_sp','61-90 天')} value={fmtMoney(s.d6190)} icon={AlertTriangle} color="var(--status-danger)" />
          <KpiCard label={t('fin2.reports.aging_over_90_sp','90 天以上')} value={fmtMoney(s.dOver90)} icon={AlertTriangle} color="var(--status-danger)" />
        </div>}

      <SectionTitle>{t('fin2.reports.ar_aging_detail','应收账龄明细（按客户）')}</SectionTitle>
      {loadAg ? <Spinner /> : !aging?.rows.length ? <Empty /> : <TableWrapper>
          <thead>
            <tr>
              <Th>{t('fin2.common.customer','客户')}</Th><Th>{t('fin2.common.company','公司')}</Th><Th>{t('fin2.common.currency','币种')}</Th>
              <Th right>{t('fin2.reports.not_due','未逾期')}</Th><Th right>{t('fin2.reports.aging_0_30','0-30天')}</Th><Th right>{t('fin2.reports.aging_31_60','31-60天')}</Th>
              <Th right>{t('fin2.reports.aging_61_90','61-90天')}</Th><Th right>{t('fin2.reports.aging_over_90','90天+')}</Th><Th right>{t('fin2.reports.total_col','合计')}</Th>
              <Th>{t('fin2.reports.aging_dist','账龄分布')}</Th>
            </tr>
          </thead>
          <tbody>
            {aging.rows.map((r, i) => <tr key={i}>
                <Td bold>{r.customerName}</Td>
                <Td>{r.companyCode}</Td>
                <Td>{r.currencyCode}</Td>
                <Td right>{fmt(r.notDue)}</Td>
                <Td right>{fmt(r.d030)}</Td>
                <Td right>{fmt(r.d3160)}</Td>
                <Td right>{fmt(r.d6190)}</Td>
                <Td right>{fmt(r.dOver90)}</Td>
                <Td right bold>{fmt(r.total)}</Td>
                <td style={{
            width: 100
          }}>
                  <AgingBar {...r} />
                </td>
              </tr>)}
          </tbody>
        </TableWrapper>}

      <SectionTitle>{t('fin2.reports.top20_customers','TOP 20 客户')}</SectionTitle>
      {loadTop ? <Spinner /> : !topCust?.length ? <Empty /> : <TableWrapper>
          <thead>
            <tr><Th>#</Th><Th>{t('fin2.common.customer','客户')}</Th><Th right>{t('fin2.reports.invoice_count','发票笔数')}</Th><Th right>{t('fin2.reports.cumulative_amount','累计金额')}</Th><Th right>{t('fin2.reports.receivable_balance','待收余额')}</Th></tr>
          </thead>
          <tbody>
            {topCust.map(r => <tr key={r.rank}>
                <Td>{r.rank}</Td>
                <Td bold>{r.customerName}</Td>
                <Td right>{r.invoiceCount}</Td>
                <Td right>{fmtMoney(r.totalAmount)}</Td>
                <Td right bold>{fmtMoney(r.openAmount)}</Td>
              </tr>)}
          </tbody>
        </TableWrapper>}
    </div>;
}

// --- Tab 3: Cash ---

interface CashOverviewData {
  totalBalance: number;
  activeAccounts: number;
  byAccountType: {
    accountType: string;
    count: number;
    balance: number;
  }[];
  byCurrency: {
    currencyCode: string;
    count: number;
    balance: number;
  }[];
  byCompany: {
    companyCode: string;
    count: number;
    balance: number;
  }[];
}
interface DailyFlowRow {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
}
interface DailyFlowData {
  dateFrom: string;
  dateTo: string;
  rows: DailyFlowRow[];
}
function CashTab() {
  const { t } = useLanguage();
  const [overview, setOverview] = useState<CashOverviewData | null>(null);
  const [dailyFlow, setDailyFlow] = useState<DailyFlowData | null>(null);
  const [loadOv, setLoadOv] = useState(true);
  const [loadDf, setLoadDf] = useState(true);
  useEffect(() => {
    apiFetch<CashOverviewData>('/api/v2/finance/reports/cash-overview').then(setOverview).finally(() => setLoadOv(false));
    apiFetch<DailyFlowData>('/api/v2/finance/reports/cash-daily-flow').then(setDailyFlow).finally(() => setLoadDf(false));
  }, []);
  return <div>
      {loadOv ? <Spinner /> : !overview ? null : <>
          <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10,
        marginBottom: 20
      }}>
            <KpiCard label={t('fin2.reports.total_account_balance','账户总余额')} value={fmtMoney(overview.totalBalance)} icon={Wallet} color="var(--color-primary)" />
            <KpiCard label={t('fin2.reports.active_accounts','活跃账户数')} value={`${overview.activeAccounts} ${t('fin2.common.unit_item','个')}`} icon={CheckCircle} color="var(--status-success)" />
          </div>

          <SectionTitle>{t('fin2.reports.by_account_type','按账户类型')}</SectionTitle>
          <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 16
      }}>
            {overview.byAccountType.map(r => (
              <div key={r.accountType} style={statTile}>
                <div style={statTileLabel}>{r.accountType}</div>
                <div style={statTileValue}>{fmtMoney(r.balance)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.count} {t('fin2.reports.accounts_unit','个账户')}</div>
              </div>
            ))}
          </div>

          <SectionTitle>{t('fin2.reports.by_company_balance','按公司余额')}</SectionTitle>
          <TableWrapper>
            <thead><tr><Th>{t('fin2.common.company','公司')}</Th><Th right>{t('fin2.reports.account_count','账户数')}</Th><Th right>{t('fin2.common.balance','余额')}</Th></tr></thead>
            <tbody>
              {overview.byCompany.map(r => <tr key={r.companyCode}>
                  <Td bold>{r.companyCode}</Td>
                  <Td right>{r.count}</Td>
                  <Td right bold>{fmtMoney(r.balance)}</Td>
                </tr>)}
            </tbody>
          </TableWrapper>
        </>}

      <SectionTitle>{t('fin2.reports.daily_cash_flow','资金日度流水（近 30 天）')}</SectionTitle>
      {loadDf ? <Spinner /> : !dailyFlow?.rows.length ? <Empty text={t('fin2.reports.no_flow_30d','近 30 天无流水记录')} /> : <>
          {/* 简单条形可视化 */}
          {(() => {
        const maxVal = Math.max(...dailyFlow.rows.map(r => Math.max(r.inflow, r.outflow)));
        return <div style={{
          overflowX: 'auto',
          marginBottom: 16
        }}>
                <div style={{
            display: 'flex',
            gap: 4,
            alignItems: 'flex-end',
            height: 80,
            minWidth: dailyFlow.rows.length * 24
          }}>
                  {dailyFlow.rows.map(r => <div key={r.date} title={`${r.date}\n${t('fin2.reports.inflow','流入')}: ¥${fmt(r.inflow)}\n${t('fin2.reports.outflow','流出')}: ¥${fmt(r.outflow)}`} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              alignItems: 'center',
              flex: 1
            }}>
                      <div style={{
                width: '100%',
                background: 'var(--status-success)',
                borderRadius: '3px 3px 0 0',
                height: maxVal ? `${r.inflow / maxVal * 60}px` : 0
              }} />
                      <div style={{
                width: '100%',
                background: 'var(--status-danger)',
                borderRadius: '3px 3px 0 0',
                height: maxVal ? `${r.outflow / maxVal * 60}px` : 0
              }} />
                    </div>)}
                </div>
                <div className="text-text-muted" style={{
            display: 'flex',
            gap: 12,
            marginTop: 8,
            fontSize: 11
          }}>
                  <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
                    <span style={{
                width: 10,
                height: 10,
                background: 'var(--status-success)',
                borderRadius: 2,
                display: 'inline-block'
              }} />{t('fin2.reports.inflow','流入')}
                  </span>
                  <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
                    <span style={{
                width: 10,
                height: 10,
                background: 'var(--status-danger)',
                borderRadius: 2,
                display: 'inline-block'
              }} />{t('fin2.reports.outflow','流出')}
                  </span>
                </div>
              </div>;
      })()}
          <TableWrapper>
            <thead>
              <tr><Th>{t('fin2.reports.date','日期')}</Th><Th right>{t('fin2.reports.inflow','流入')}</Th><Th right>{t('fin2.reports.outflow','流出')}</Th><Th right>{t('fin2.reports.net','净额')}</Th></tr>
            </thead>
            <tbody>
              {[...dailyFlow.rows].reverse().map(r => <tr key={r.date}>
                  <Td>{r.date}</Td>
                  <Td right>{fmtMoney(r.inflow)}</Td>
                  <Td right>{fmtMoney(r.outflow)}</Td>
                  <Td right bold>
                    <span style={{
                color: r.net >= 0 ? TOKENS.css.statusSuccess : TOKENS.css.statusDanger
              }}>
                      {r.net >= 0 ? '+' : ''}{fmtMoney(r.net)}
                    </span>
                  </Td>
                </tr>)}
            </tbody>
          </TableWrapper>
        </>}
    </div>;
}

// --- Tab 4: Expense ---

interface ExpenseSummaryData {
  byStatus: Record<string, {
    count: number;
    amount: number;
  }>;
  byExpenseType: {
    expenseType: string;
    count: number;
    total: number;
  }[];
  byCompany: {
    companyCode: string;
    count: number;
    total: number;
  }[];
  byProject: {
    projectCode: string;
    count: number;
    total: number;
  }[];
}
interface ReimbSummaryData {
  byStatus: Record<string, {
    count: number;
    amount: number;
  }>;
  avgProcessingDays: number | null;
}
const EXPENSE_TYPE_LABEL: Record<string, string> = {
  TRAVEL: '差旅',
  MEAL: '餐饮',
  ENTERTAINMENT: '招待',
  OFFICE: '办公',
  MATERIAL: '物料',
  TRANSPORT: '交通',
  OTHER: '其他'
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  PENDING_APPROVAL: '审批中',
  APPROVED: '已审批',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
  REIMBURSED: '已报销',
  PENDING: '待处理',
  PAID: '已付款'
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'var(--status-neutral)',
  SUBMITTED: 'var(--color-primary)',
  PENDING_APPROVAL: 'var(--status-warning)',
  APPROVED: 'var(--status-success)',
  REJECTED: 'var(--status-danger)',
  CANCELLED: 'var(--status-neutral)',
  REIMBURSED: 'var(--status-success)',
  PENDING: 'var(--status-warning)',
  PENDING_APPROVAL2: 'var(--status-warning)',
  PAID: 'var(--status-success)'
};
function ExpenseTab() {
  const { t } = useLanguage();
  const [expData, setExpData] = useState<ExpenseSummaryData | null>(null);
  const [reimbData, setReimbData] = useState<ReimbSummaryData | null>(null);
  const [loadExp, setLoadExp] = useState(true);
  const [loadRe, setLoadRe] = useState(true);
  useEffect(() => {
    apiFetch<ExpenseSummaryData>('/api/v2/finance/reports/expense-summary').then(setExpData).finally(() => setLoadExp(false));
    apiFetch<ReimbSummaryData>('/api/v2/finance/reports/reimbursement-summary').then(setReimbData).finally(() => setLoadRe(false));
  }, []);
  return <div>
      <SectionTitle>{t('fin2.reports.expense_by_status','费用申请 — 各状态')}</SectionTitle>
      {loadExp ? <Spinner /> : !expData ? <Empty /> : <>
          <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 20
      }}>
            {Object.entries(expData.byStatus).map(([status, d]) => (
              <div key={status} style={statTile}>
                <div style={{ ...statTileLabel, color: STATUS_COLOR[status] ?? 'var(--status-neutral)', fontWeight: 700 }}>
                  {STATUS_LABEL[status] ? t(`fin2.reports.status_label.${status}`, STATUS_LABEL[status]) : status}
                </div>
                <div style={statTileValue}>{d.count} {t('fin2.common.count_unit','笔')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtMoney(d.amount)}</div>
              </div>
            ))}
          </div>

          <SectionTitle>{t('fin2.reports.by_expense_type','按费用类型')}</SectionTitle>
          <TableWrapper>
            <thead><tr><Th>{t('fin2.common.type','类型')}</Th><Th right>{t('fin2.reports.count_col','笔数')}</Th><Th right>{t('fin2.common.amount','金额')}</Th></tr></thead>
            <tbody>
              {expData.byExpenseType.map(r => <tr key={r.expenseType}>
                  <Td bold>{EXPENSE_TYPE_LABEL[r.expenseType] ? t(`fin2.reports.expense_type.${r.expenseType}`, EXPENSE_TYPE_LABEL[r.expenseType]) : r.expenseType}</Td>
                  <Td right>{r.count}</Td>
                  <Td right>{fmtMoney(r.total)}</Td>
                </tr>)}
            </tbody>
          </TableWrapper>

          {expData.byCompany.length > 0 && <>
              <SectionTitle>{t('fin2.reports.by_company','按公司')}</SectionTitle>
              <TableWrapper>
                <thead><tr><Th>{t('fin2.common.company','公司')}</Th><Th right>{t('fin2.reports.count_col','笔数')}</Th><Th right>{t('fin2.common.amount','金额')}</Th></tr></thead>
                <tbody>
                  {expData.byCompany.map(r => <tr key={r.companyCode}>
                      <Td bold>{r.companyCode}</Td>
                      <Td right>{r.count}</Td>
                      <Td right>{fmtMoney(r.total)}</Td>
                    </tr>)}
                </tbody>
              </TableWrapper>
            </>}

          {expData.byProject.length > 0 && <>
              <SectionTitle>{t('fin2.reports.by_project_top20','按项目（TOP 20）')}</SectionTitle>
              <TableWrapper>
                <thead><tr><Th>{t('fin2.common.project','项目')}</Th><Th right>{t('fin2.reports.count_col','笔数')}</Th><Th right>{t('fin2.common.amount','金额')}</Th></tr></thead>
                <tbody>
                  {expData.byProject.map(r => <tr key={r.projectCode}>
                      <Td bold>{r.projectCode}</Td>
                      <Td right>{r.count}</Td>
                      <Td right>{fmtMoney(r.total)}</Td>
                    </tr>)}
                </tbody>
              </TableWrapper>
            </>}
        </>}

      <SectionTitle>{t('fin2.reports.reimb_by_status','报销 — 各状态')}</SectionTitle>
      {loadRe ? <Spinner /> : !reimbData ? <Empty /> : <>
          <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 16
      }}>
            {Object.entries(reimbData.byStatus).map(([status, d]) => (
              <div key={status} style={statTile}>
                <div style={{ ...statTileLabel, color: STATUS_COLOR[status] ?? 'var(--status-neutral)', fontWeight: 700 }}>
                  {STATUS_LABEL[status] ? t(`fin2.reports.status_label.${status}`, STATUS_LABEL[status]) : status}
                </div>
                <div style={statTileValue}>{d.count} {t('fin2.common.count_unit','笔')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtMoney(d.amount)}</div>
              </div>
            ))}
          </div>
          {reimbData.avgProcessingDays !== null && <div style={{ ...inlineAlert('success'), fontSize: 13, padding: '12px 16px' }}>
            ⏱ {t('fin2.reports.avg_processing','平均报销处理时长')}：<strong>{reimbData.avgProcessingDays} {t('fin2.common.day','天')}</strong>
          </div>}
        </>}
    </div>;
}

// --- Tab 5: Shareholder ---

interface ShSummaryData {
  byShareholder: {
    shareholderName: string;
    count: number;
    totalAmount: number;
    settledAmount: number;
    balanceAmount: number;
  }[];
  byContributionType: {
    contributionType: string;
    count: number;
    totalAmount: number;
    balanceAmount: number;
  }[];
  upcomingReturns: {
    shareholderName: string;
    expectedReturnDate: string;
    balanceAmount: number;
    companyCode: string;
  }[];
}
function ShareholderTab() {
  const { t } = useLanguage();
  const [data, setData] = useState<ShSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<ShSummaryData>('/api/v2/finance/reports/shareholder-summary').then(setData).finally(() => setLoading(false));
  }, []);
  // React #310 修复:useMemo 必须在 early return 之前(同 OverviewTab)
  const totalBal = useMemo(() => (data?.byShareholder ?? []).reduce((s, r) => s + r.balanceAmount, 0), [data?.byShareholder]);
  const totalIn = useMemo(() => (data?.byShareholder ?? []).reduce((s, r) => s + r.totalAmount, 0), [data?.byShareholder]);
  const totalSt = useMemo(() => (data?.byShareholder ?? []).reduce((s, r) => s + r.settledAmount, 0), [data?.byShareholder]);
  if (loading) return <Spinner />;
  if (!data) return <Empty text={t('fin2.common.load_failed','加载失败')} />;
  return <div>
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 10,
      marginBottom: 20
    }}>
        <KpiCard label={t('fin2.reports.contribution_total','出资总额')} value={fmtMoney(totalIn)} icon={Users} color="var(--status-info)" />
        <KpiCard label={t('fin2.reports.settled','已结算')} value={fmtMoney(totalSt)} icon={CheckCircle} color="var(--status-success)" />
        <KpiCard label={t('fin2.common.balance','余额')} value={fmtMoney(totalBal)} icon={DollarSign} color="var(--status-info)" />
        <KpiCard label={t('fin2.reports.due_in_90d','90天内到期')} value={`${data.upcomingReturns.length} ${t('fin2.common.count_unit','笔')}`} icon={AlertTriangle} color="var(--status-warning)" />
      </div>

      <SectionTitle>{t('fin2.reports.by_shareholder','按股东')}</SectionTitle>
      {!data.byShareholder.length ? <Empty /> : <TableWrapper>
          <thead>
            <tr><Th>{t('fin2.reports.shareholder','股东')}</Th><Th right>{t('fin2.reports.count_col','笔数')}</Th><Th right>{t('fin2.reports.contribution_total','出资总额')}</Th><Th right>{t('fin2.reports.settled','已结算')}</Th><Th right>{t('fin2.common.balance','余额')}</Th></tr>
          </thead>
          <tbody>
            {data.byShareholder.map(r => <tr key={r.shareholderName}>
                <Td bold>{r.shareholderName}</Td>
                <Td right>{r.count}</Td>
                <Td right>{fmtMoney(r.totalAmount)}</Td>
                <Td right>{fmtMoney(r.settledAmount)}</Td>
                <Td right bold>{fmtMoney(r.balanceAmount)}</Td>
              </tr>)}
          </tbody>
        </TableWrapper>}

      {data.byContributionType.length > 0 && <>
          <SectionTitle>{t('fin2.reports.by_contribution_type','按出资类型')}</SectionTitle>
          <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 16
      }}>
            {data.byContributionType.map(r => (
              <div key={r.contributionType} style={statTile}>
                <div style={{ ...statTileLabel, color: 'var(--color-primary)', fontWeight: 700 }}>{r.contributionType}</div>
                <div style={statTileValue}>{fmtMoney(r.totalAmount)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('fin2.common.balance','余额')} {fmtMoney(r.balanceAmount)}</div>
              </div>
            ))}
          </div>
        </>}

      {data.upcomingReturns.length > 0 && <>
          <SectionTitle>⚠️ {t('fin2.reports.due_in_90d_full','90 天内即将到期')}</SectionTitle>
          <TableWrapper>
            <thead>
              <tr><Th>{t('fin2.reports.shareholder','股东')}</Th><Th>{t('fin2.common.company','公司')}</Th><Th>{t('fin2.reports.expected_return_date','预计还款日')}</Th><Th right>{t('fin2.common.balance','余额')}</Th></tr>
            </thead>
            <tbody>
              {data.upcomingReturns.map((r, i) => <tr key={i}>
                  <Td bold>{r.shareholderName}</Td>
                  <Td>{r.companyCode}</Td>
                  <Td>
                    <span className={`text-warning ${u.fw600}`}>
                      {String(r.expectedReturnDate).slice(0, 10)}
                    </span>
                  </Td>
                  <Td right bold>{fmtMoney(r.balanceAmount)}</Td>
                </tr>)}
            </tbody>
          </TableWrapper>
        </>}
    </div>;
}

// --- Tab 6: Project ---

interface ProjectRow {
  projectCode: string;
  companyCode: string;
  apOpen: number;
  arOpen: number;
  shBalance: number;
  expenseTotal: number;
  netPosition: number;
}
function ProjectTab() {
  const { t } = useLanguage();
  const [data, setData] = useState<ProjectRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    apiFetch<ProjectRow[]>('/api/v2/finance/reports/project-finance').then(setData).finally(() => setLoading(false));
  }, []);
  const rows = useMemo(() => data?.filter(r => !filter || r.projectCode.toLowerCase().includes(filter.toLowerCase())) ?? [], [data, filter]);
  if (loading) return <Spinner />;
  return <div>
      <div style={{
      marginBottom: 14,
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }}>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={t('fin2.reports.filter_project_code','过滤项目代码…')} style={{ ...inputField, width: 220, fontSize: 13 }} />
        <span className={`text-text-dim ${u.fs12}`}>{rows.length} {t('fin2.reports.projects_unit','个项目')}</span>
      </div>

      {!rows.length ? <Empty text={t('fin2.reports.no_project_finance','暂无项目财务数据')} /> : <TableWrapper>
          <thead>
            <tr>
              <Th>{t('fin2.common.project','项目')}</Th><Th>{t('fin2.common.company','公司')}</Th>
              <Th right>{t('fin2.reports.ar_open_short','应收待收')}</Th><Th right>{t('fin2.reports.ap_open_short','应付待付')}</Th>
              <Th right>{t('fin2.reports.expense_total','费用总额')}</Th><Th right>{t('fin2.common.shareholder_funds','股东资金')}</Th>
              <Th right>{t('fin2.common.disposable_funds','可支配资金')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => <tr key={i}>
                <Td bold>{r.projectCode}</Td>
                <Td>{r.companyCode}</Td>
                <Td right>{fmtMoney(r.arOpen)}</Td>
                <Td right>{fmtMoney(r.apOpen)}</Td>
                <Td right>{fmtMoney(r.expenseTotal)}</Td>
                <Td right>{fmtMoney(r.shBalance)}</Td>
                <Td right bold>
                  <span style={{
              color: r.netPosition >= 0 ? TOKENS.css.statusSuccess : TOKENS.css.statusDanger
            }}>
                    {r.netPosition >= 0 ? '+' : ''}{fmtMoney(r.netPosition)}
                  </span>
                </Td>
              </tr>)}
          </tbody>
        </TableWrapper>}

      <div className="text-text-dim" style={{
      marginTop: 12,
      fontSize: 11
    }}>
        {t('fin2.reports.project_disposable_formula','可支配资金 = 应收待收 − 应付待付 − 费用总额')}
      </div>
    </div>;
}

// --- Tab 7: Company ---

interface CompanyRow {
  companyCode: string;
  apOpen: number;
  arOpen: number;
  cashBalance: number;
  shBalance: number;
  expenseTotal: number;
  netOperatingPosition: number;
}
function CompanyTab() {
  const { t } = useLanguage();
  const [data, setData] = useState<CompanyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<CompanyRow[]>('/api/v2/finance/reports/company-finance').then(setData).finally(() => setLoading(false));
  }, []);
  const totalCashBalance = useMemo(() => data?.reduce((s, r) => s + r.cashBalance, 0) ?? 0, [data]);
  const totalNetPosition = useMemo(() => data?.reduce((s, r) => s + r.netOperatingPosition, 0) ?? 0, [data]);
  if (loading) return <Spinner />;
  if (!data?.length) return <Empty text={t('fin2.reports.no_company_finance','暂无公司财务数据')} />;
  return <div>
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 10,
      marginBottom: 20
    }}>
        <KpiCard label={t('fin2.reports.company_total','公司总数')} value={`${data.length} ${t('fin2.reports.company_unit','家')}`} icon={Building2} color="var(--status-neutral)" />
        <KpiCard label={t('fin2.reports.total_cash_balance','合计现金余额')} value={fmtMoney(totalCashBalance)} icon={Wallet} color="var(--color-primary)" />
        <KpiCard label={t('fin2.reports.total_disposable','合计可支配资金')} value={fmtMoney(totalNetPosition)} icon={PieChart} color="var(--color-primary)" />
      </div>

      <TableWrapper>
        <thead>
          <tr>
            <Th>{t('fin2.common.company','公司')}</Th>
            <Th right>{t('fin2.common.cash_balance','现金余额')}</Th><Th right>{t('fin2.reports.ar_open_short','应收待收')}</Th><Th right>{t('fin2.reports.ap_open_short','应付待付')}</Th>
            <Th right>{t('fin2.reports.expense_total','费用总额')}</Th><Th right>{t('fin2.common.shareholder_funds','股东资金')}</Th>
            <Th right>{t('fin2.common.disposable_funds','可支配资金')}</Th>
          </tr>
        </thead>
        <tbody>
          {data.map(r => <tr key={r.companyCode}>
              <Td bold>{r.companyCode}</Td>
              <Td right>{fmtMoney(r.cashBalance)}</Td>
              <Td right>{fmtMoney(r.arOpen)}</Td>
              <Td right>{fmtMoney(r.apOpen)}</Td>
              <Td right>{fmtMoney(r.expenseTotal)}</Td>
              <Td right>{fmtMoney(r.shBalance)}</Td>
              <Td right bold>
                <span style={{
              color: r.netOperatingPosition >= 0 ? TOKENS.css.statusSuccess : TOKENS.css.statusDanger
            }}>
                  {r.netOperatingPosition >= 0 ? '+' : ''}{fmtMoney(r.netOperatingPosition)}
                </span>
              </Td>
            </tr>)}
        </tbody>
      </TableWrapper>
      <div className="text-text-dim" style={{
      marginTop: 12,
      fontSize: 11
    }}>
        {t('fin2.reports.company_disposable_formula','可支配资金 = 现金余额 + 应收待收 − 应付待付 − 费用总额')}
      </div>
    </div>;
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

const TABS = [{
  key: 'overview',
  label: '总览',
  icon: PieChart
}, {
  key: 'ap',
  label: '应付',
  icon: TrendingDown
}, {
  key: 'ar',
  label: '应收',
  icon: TrendingUp
}, {
  key: 'cash',
  label: '资金',
  icon: Wallet
}, {
  key: 'expense',
  label: '费用',
  icon: Receipt
}, {
  key: 'shareholder',
  label: '股东',
  icon: Users
}, {
  key: 'project',
  label: '项目',
  icon: FolderOpen
}, {
  key: 'company',
  label: '公司',
  icon: Building2
}];
export default function Finance2ReportsPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('overview');
  return <div>
      <PageHeader title={t('fin2.reports.page_title','财务报表')} subtitle={t('fin2.reports.page_subtitle','经营报表 · 账龄分析 · 资金日报 · 公司可支配资金')} breadcrumb={[t('fin2.common.finance_mgmt','财务管理'), t('fin2.reports.breadcrumb','经营报表')]} />

      {/* 模块说明横幅 */}
      <div style={heroBanner}>
        <PieChart size={22} style={{ marginTop: 2, flexShrink: 0, opacity: 0.85 }} />
        <div style={{ flex: 1 }}>
          <div style={heroBannerTitle}>{t('fin2.reports.hero_title','财务管理 — 经营报表系统')}</div>
          <div style={heroBannerSubtitle}>
            {t('fin2.reports.hero_subtitle','经营报表层 · 12 只读聚合报表 · 数据权限全程合规 · 管理报表（非会计凭证/总账）')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              { k: 'ap_aging', zh: '应付账龄' },
              { k: 'ar_aging', zh: '应收账龄' },
              { k: 'cash_daily', zh: '资金日报' },
              { k: 'expense_stat', zh: '费用统计' },
              { k: 'shareholder_funds_tag', zh: '股东资金' },
              { k: 'project_dim', zh: '项目维度' },
              { k: 'company_dim', zh: '公司维度' },
            ].map(tag => (
              <span key={tag.k} style={heroTagChip}>{t(`fin2.reports.tag.${tag.k}`, tag.zh)}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div style={subTabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={subTabItem(active)}>
              <Icon size={14} />
              {t(`fin2.reports.tab.${tab.key}`, tab.label)}
            </button>
          );
        })}
      </div>

      {/* Tab 内容 */}
      <div style={{
      minHeight: 400
    }}>
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'ap' && <ApTab />}
        {activeTab === 'ar' && <ArTab />}
        {activeTab === 'cash' && <CashTab />}
        {activeTab === 'expense' && <ExpenseTab />}
        {activeTab === 'shareholder' && <ShareholderTab />}
        {activeTab === 'project' && <ProjectTab />}
        {activeTab === 'company' && <CompanyTab />}
      </div>
    </div>;
}
