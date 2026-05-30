'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  PieChart, BarChart2, TrendingDown, TrendingUp, Wallet,
  Users, Receipt, Building2, FolderOpen, RefreshCw,
  AlertTriangle, CheckCircle, DollarSign, ArrowLeftRight,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { TOKENS } from '@/lib/design-tokens';

// ── 工具 ──────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmt(n: number | string | null | undefined, dec = 2): string {
  return Number(n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtMoney(n: number | null | undefined): string {
  return `¥ ${fmt(n)}`;
}

// ── 子组件 ────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string;
  icon?: React.ElementType; color?: string;
}) {
  return (
    <div className="bg-bg-card border border-border"
      style={{ borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {Icon && (
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: `${color ?? 'var(--color-primary)'}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={16} color={color ?? 'var(--color-primary)'} />
          </div>
        )}
        <span className="text-text-muted" style={{ fontSize: 11 }}>{label}</span>
      </div>
      <div className="text-text" style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
      {sub && <div className="text-text-dim" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-text-muted" style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 10px' }}>
      {children}
    </div>
  );
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border" style={{ overflowX: 'auto', borderRadius: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        {children}
      </table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className="bg-bg-muted border-b border-border text-text-muted"
      style={{
        padding: '10px 14px', textAlign: right ? 'right' : 'left',
        fontSize: 11, fontWeight: 700,
        whiteSpace: 'nowrap',
      }}>{children}</th>
  );
}

function Td({ children, right, bold }: { children: React.ReactNode; right?: boolean; bold?: boolean }) {
  return (
    <td className={bold ? 'text-text border-b border-border' : 'text-text-muted border-b border-border'}
      style={{
        padding: '9px 14px', textAlign: right ? 'right' : 'left',
        fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap',
      }}>{children}</td>
  );
}

function AgingBar({ notDue, d030, d3160, d6190, dOver90, total }: {
  notDue: number; d030: number; d3160: number; d6190: number; dOver90: number; total: number;
}) {
  if (!total) return null;
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  const segs = [
    { v: notDue, color: '#10b981', label: '未逾期' },
    { v: d030,   color: '#f59e0b', label: '0-30天' },
    { v: d3160,  color: '#f97316', label: '31-60天' },
    { v: d6190,  color: '#ef4444', label: '61-90天' },
    { v: dOver90,color: '#7f1d1d', label: '90天+' },
  ];
  return (
    <div style={{ height: 6, borderRadius: 3, display: 'flex', overflow: 'hidden', gap: 1 }}>
      {segs.filter(s => s.v > 0).map(s => (
        <div key={s.label} title={`${s.label}: ¥${fmt(s.v)} (${pct(s.v)})`}
          style={{ width: pct(s.v), background: s.color, height: '100%' }} />
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <div className="text-text-dim" style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
      <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  );
}

function Empty({ text = '暂无数据' }: { text?: string }) {
  return (
    <div className="text-text-dim" style={{ textAlign: 'center', padding: '32px', fontSize: 13 }}>
      {text}
    </div>
  );
}

// ── Tab 内容组件 ──────────────────────────────────────────────────────────────

// --- Tab 0: 总览 ---

interface OverviewData {
  apOpen: number; arOpen: number; cashBalance: number; shareholderBalance: number;
  expensePendingCount: number; expensePendingAmount: number;
  reimbursementPendingCount: number; reimbursementPendingAmount: number;
  netOperatingPosition: number; todayInflow: number; todayOutflow: number;
  byCurrency: { currencyCode: string; cashBalance: number }[];
  byCompany:  { companyCode: string;  cashBalance: number }[];
}

function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<OverviewData>('/api/v2/finance/reports/overview')
      .then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data) return <Empty text="加载失败" />;

  const netColor = data.netOperatingPosition >= 0 ? TOKENS.css.statusSuccess : TOKENS.css.statusDanger;

  return (
    <div>
      {/* 经营净头寸 主 KPI */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f766e 100%)',
        borderRadius: 16, padding: '24px 28px', marginBottom: 20, color: '#fff',
      }}>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>经营净头寸（Net Operating Position）</div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1 }}>
          {data.netOperatingPosition >= 0 ? '+' : ''}¥ {fmt(data.netOperatingPosition)}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          = 现金余额 + AR待收 − AP待付 − 待报销金额
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { label: '今日流入', value: `+¥${fmt(data.todayInflow)}`, color: '#86efac' },
            { label: '今日流出', value: `-¥${fmt(data.todayOutflow)}`, color: '#fca5a5' },
            { label: '今日净额', value: `¥${fmt(data.todayInflow - data.todayOutflow)}`,
              color: data.todayInflow >= data.todayOutflow ? '#86efac' : '#fca5a5' },
          ].map(item => (
            <div key={item.label} style={{ fontSize: 12 }}>
              <span style={{ opacity: 0.6 }}>{item.label}</span>
              <span style={{ marginLeft: 6, fontWeight: 700, color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        <KpiCard label="现金账户余额"    value={fmtMoney(data.cashBalance)}    icon={Wallet}      color="var(--color-primary)" />
        <KpiCard label="AR 待收款"        value={fmtMoney(data.arOpen)}         icon={TrendingUp}  color="var(--status-success)" />
        <KpiCard label="AP 待付款"        value={fmtMoney(data.apOpen)}         icon={TrendingDown} color="var(--status-warning)" />
        <KpiCard label="股东资金余额"     value={fmtMoney(data.shareholderBalance)} icon={Users}   color="var(--status-info)" />
        <KpiCard label="费用待审批"
          value={`${data.expensePendingCount} 笔`}
          sub={fmtMoney(data.expensePendingAmount)}
          icon={Receipt} color="var(--color-primary)" />
        <KpiCard label="报销待处理"
          value={`${data.reimbursementPendingCount} 笔`}
          sub={fmtMoney(data.reimbursementPendingAmount)}
          icon={ArrowLeftRight} color="var(--color-accent)" />
      </div>

      {data.byCurrency.length > 0 && (
        <>
          <SectionTitle>现金余额 — 按币种</SectionTitle>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {data.byCurrency.map(r => (
              <div key={r.currencyCode} className="bg-bg-muted border border-border"
                style={{ borderRadius: 10, padding: '10px 16px' }}>
                <div className="text-text-muted" style={{ fontSize: 11 }}>{r.currencyCode}</div>
                <div className="text-text" style={{ fontSize: 16, fontWeight: 800 }}>{fmtMoney(r.cashBalance)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {data.byCompany.length > 0 && (
        <>
          <SectionTitle>现金余额 — 按公司</SectionTitle>
          <TableWrapper>
            <thead><tr><Th>公司代码</Th><Th right>现金余额</Th></tr></thead>
            <tbody>
              {data.byCompany.map(r => (
                <tr key={r.companyCode}>
                  <Td>{r.companyCode}</Td>
                  <Td right bold>{fmtMoney(r.cashBalance)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </>
      )}
    </div>
  );
}

// --- Tab 1: AP ---

interface ApAgingRow {
  supplierName: string; supplierCode?: string; currencyCode: string; companyCode: string;
  notDue: number; d030: number; d3160: number; d6190: number; dOver90: number; total: number;
}
interface ApAgingData {
  summary: { notDue: number; d030: number; d3160: number; d6190: number; dOver90: number; total: number };
  rows: ApAgingRow[];
}
interface ApTopRow { rank: number; supplierName: string; supplierCode?: string; invoiceCount: number; totalAmount: number; openAmount: number }

function ApTab() {
  const [aging,      setAging]      = useState<ApAgingData | null>(null);
  const [topSup,     setTopSup]     = useState<ApTopRow[] | null>(null);
  const [loadAging,  setLoadAging]  = useState(true);
  const [loadTop,    setLoadTop]    = useState(true);

  useEffect(() => {
    apiFetch<ApAgingData>('/api/v2/finance/reports/ap-aging').then(setAging).finally(() => setLoadAging(false));
    apiFetch<ApTopRow[]>('/api/v2/finance/reports/ap-top-suppliers').then(setTopSup).finally(() => setLoadTop(false));
  }, []);

  const s = aging?.summary;

  return (
    <div>
      {/* 账龄汇总条 */}
      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
          <KpiCard label="AP 合计"    value={fmtMoney(s.total)}   icon={TrendingDown} color="var(--status-warning)" />
          <KpiCard label="未逾期"     value={fmtMoney(s.notDue)}  icon={CheckCircle}  color="var(--status-success)" />
          <KpiCard label="0-30 天"   value={fmtMoney(s.d030)}    icon={AlertTriangle} color="var(--status-warning)" />
          <KpiCard label="31-60 天"  value={fmtMoney(s.d3160)}   icon={AlertTriangle} color="var(--status-warning)" />
          <KpiCard label="61-90 天"  value={fmtMoney(s.d6190)}   icon={AlertTriangle} color="var(--status-danger)" />
          <KpiCard label="90 天以上" value={fmtMoney(s.dOver90)} icon={AlertTriangle} color="var(--status-danger)" />
        </div>
      )}

      <SectionTitle>AP 账龄明细（按供应商）</SectionTitle>
      {loadAging ? <Spinner /> : !aging?.rows.length ? <Empty /> : (
        <TableWrapper>
          <thead>
            <tr>
              <Th>供应商</Th><Th>公司</Th><Th>币种</Th>
              <Th right>未逾期</Th><Th right>0-30天</Th><Th right>31-60天</Th>
              <Th right>61-90天</Th><Th right>90天+</Th><Th right>合计</Th>
              <Th>账龄分布</Th>
            </tr>
          </thead>
          <tbody>
            {aging.rows.map((r, i) => (
              <tr key={i}>
                <Td bold>{r.supplierName}</Td>
                <Td>{r.companyCode}</Td>
                <Td>{r.currencyCode}</Td>
                <Td right>{fmt(r.notDue)}</Td>
                <Td right>{fmt(r.d030)}</Td>
                <Td right>{fmt(r.d3160)}</Td>
                <Td right>{fmt(r.d6190)}</Td>
                <Td right>{fmt(r.dOver90)}</Td>
                <Td right bold>{fmt(r.total)}</Td>
                <td style={{ padding: '9px 14px', width: 100 }}>
                  <AgingBar {...r} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}

      <SectionTitle>TOP 20 供应商</SectionTitle>
      {loadTop ? <Spinner /> : !topSup?.length ? <Empty /> : (
        <TableWrapper>
          <thead>
            <tr><Th>#</Th><Th>供应商</Th><Th right>发票笔数</Th><Th right>累计金额</Th><Th right>待付余额</Th></tr>
          </thead>
          <tbody>
            {topSup.map(r => (
              <tr key={r.rank}>
                <Td>{r.rank}</Td>
                <Td bold>{r.supplierName}</Td>
                <Td right>{r.invoiceCount}</Td>
                <Td right>{fmtMoney(r.totalAmount)}</Td>
                <Td right bold>{fmtMoney(r.openAmount)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </div>
  );
}

// --- Tab 2: AR ---

interface ArAgingRow {
  customerName: string; currencyCode: string; companyCode: string;
  notDue: number; d030: number; d3160: number; d6190: number; dOver90: number; total: number;
}
interface ArAgingData {
  summary: { notDue: number; d030: number; d3160: number; d6190: number; dOver90: number; total: number };
  rows: ArAgingRow[];
}
interface ArTopRow { rank: number; customerName: string; invoiceCount: number; totalAmount: number; openAmount: number }

function ArTab() {
  const [aging,    setAging]    = useState<ArAgingData | null>(null);
  const [topCust,  setTopCust]  = useState<ArTopRow[] | null>(null);
  const [loadAg,   setLoadAg]   = useState(true);
  const [loadTop,  setLoadTop]  = useState(true);

  useEffect(() => {
    apiFetch<ArAgingData>('/api/v2/finance/reports/ar-aging').then(setAging).finally(() => setLoadAg(false));
    apiFetch<ArTopRow[]>('/api/v2/finance/reports/ar-top-customers').then(setTopCust).finally(() => setLoadTop(false));
  }, []);

  const s = aging?.summary;

  return (
    <div>
      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
          <KpiCard label="AR 合计"    value={fmtMoney(s.total)}   icon={TrendingUp}   color="var(--status-success)" />
          <KpiCard label="未逾期"     value={fmtMoney(s.notDue)}  icon={CheckCircle}  color="var(--status-success)" />
          <KpiCard label="0-30 天"   value={fmtMoney(s.d030)}    icon={AlertTriangle} color="var(--status-warning)" />
          <KpiCard label="31-60 天"  value={fmtMoney(s.d3160)}   icon={AlertTriangle} color="var(--status-warning)" />
          <KpiCard label="61-90 天"  value={fmtMoney(s.d6190)}   icon={AlertTriangle} color="var(--status-danger)" />
          <KpiCard label="90 天以上" value={fmtMoney(s.dOver90)} icon={AlertTriangle} color="var(--status-danger)" />
        </div>
      )}

      <SectionTitle>AR 账龄明细（按客户）</SectionTitle>
      {loadAg ? <Spinner /> : !aging?.rows.length ? <Empty /> : (
        <TableWrapper>
          <thead>
            <tr>
              <Th>客户</Th><Th>公司</Th><Th>币种</Th>
              <Th right>未逾期</Th><Th right>0-30天</Th><Th right>31-60天</Th>
              <Th right>61-90天</Th><Th right>90天+</Th><Th right>合计</Th>
              <Th>账龄分布</Th>
            </tr>
          </thead>
          <tbody>
            {aging.rows.map((r, i) => (
              <tr key={i}>
                <Td bold>{r.customerName}</Td>
                <Td>{r.companyCode}</Td>
                <Td>{r.currencyCode}</Td>
                <Td right>{fmt(r.notDue)}</Td>
                <Td right>{fmt(r.d030)}</Td>
                <Td right>{fmt(r.d3160)}</Td>
                <Td right>{fmt(r.d6190)}</Td>
                <Td right>{fmt(r.dOver90)}</Td>
                <Td right bold>{fmt(r.total)}</Td>
                <td style={{ padding: '9px 14px', width: 100 }}>
                  <AgingBar {...r} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}

      <SectionTitle>TOP 20 客户</SectionTitle>
      {loadTop ? <Spinner /> : !topCust?.length ? <Empty /> : (
        <TableWrapper>
          <thead>
            <tr><Th>#</Th><Th>客户</Th><Th right>发票笔数</Th><Th right>累计金额</Th><Th right>待收余额</Th></tr>
          </thead>
          <tbody>
            {topCust.map(r => (
              <tr key={r.rank}>
                <Td>{r.rank}</Td>
                <Td bold>{r.customerName}</Td>
                <Td right>{r.invoiceCount}</Td>
                <Td right>{fmtMoney(r.totalAmount)}</Td>
                <Td right bold>{fmtMoney(r.openAmount)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </div>
  );
}

// --- Tab 3: Cash ---

interface CashOverviewData {
  totalBalance: number; activeAccounts: number;
  byAccountType: { accountType: string; count: number; balance: number }[];
  byCurrency:    { currencyCode: string; count: number; balance: number }[];
  byCompany:     { companyCode: string;  count: number; balance: number }[];
}
interface DailyFlowRow { date: string; inflow: number; outflow: number; net: number }
interface DailyFlowData { dateFrom: string; dateTo: string; rows: DailyFlowRow[] }

function CashTab() {
  const [overview,   setOverview]   = useState<CashOverviewData | null>(null);
  const [dailyFlow,  setDailyFlow]  = useState<DailyFlowData | null>(null);
  const [loadOv,     setLoadOv]     = useState(true);
  const [loadDf,     setLoadDf]     = useState(true);

  useEffect(() => {
    apiFetch<CashOverviewData>('/api/v2/finance/reports/cash-overview').then(setOverview).finally(() => setLoadOv(false));
    apiFetch<DailyFlowData>('/api/v2/finance/reports/cash-daily-flow').then(setDailyFlow).finally(() => setLoadDf(false));
  }, []);

  return (
    <div>
      {loadOv ? <Spinner /> : !overview ? null : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
            <KpiCard label="账户总余额"  value={fmtMoney(overview.totalBalance)}   icon={Wallet}    color="var(--color-primary)" />
            <KpiCard label="活跃账户数" value={`${overview.activeAccounts} 个`}   icon={CheckCircle} color="var(--status-success)" />
          </div>

          <SectionTitle>按账户类型</SectionTitle>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {overview.byAccountType.map(r => (
              <div key={r.accountType} className="bg-bg-muted border border-border"
                style={{ borderRadius: 10, padding: '10px 16px', minWidth: 140 }}>
                <div className="text-text-muted" style={{ fontSize: 11, marginBottom: 2 }}>{r.accountType}</div>
                <div className="text-text" style={{ fontSize: 15, fontWeight: 800 }}>{fmtMoney(r.balance)}</div>
                <div className="text-text-dim" style={{ fontSize: 11 }}>{r.count} 个账户</div>
              </div>
            ))}
          </div>

          <SectionTitle>按公司余额</SectionTitle>
          <TableWrapper>
            <thead><tr><Th>公司</Th><Th right>账户数</Th><Th right>余额</Th></tr></thead>
            <tbody>
              {overview.byCompany.map(r => (
                <tr key={r.companyCode}>
                  <Td bold>{r.companyCode}</Td>
                  <Td right>{r.count}</Td>
                  <Td right bold>{fmtMoney(r.balance)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </>
      )}

      <SectionTitle>资金日度流水（近 30 天）</SectionTitle>
      {loadDf ? <Spinner /> : !dailyFlow?.rows.length ? <Empty text="近 30 天无流水记录" /> : (
        <>
          {/* 简单条形可视化 */}
          {(() => {
            const maxVal = Math.max(...dailyFlow.rows.map(r => Math.max(r.inflow, r.outflow)));
            return (
              <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80, minWidth: dailyFlow.rows.length * 24 }}>
                  {dailyFlow.rows.map(r => (
                    <div key={r.date} title={`${r.date}\n流入: ¥${fmt(r.inflow)}\n流出: ¥${fmt(r.outflow)}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', flex: 1 }}>
                      <div style={{
                        width: '100%', background: 'var(--status-success)', borderRadius: '3px 3px 0 0',
                        height: maxVal ? `${(r.inflow / maxVal) * 60}px` : 0,
                      }} />
                      <div style={{
                        width: '100%', background: 'var(--status-danger)', borderRadius: '3px 3px 0 0',
                        height: maxVal ? `${(r.outflow / maxVal) * 60}px` : 0,
                      }} />
                    </div>
                  ))}
                </div>
                <div className="text-text-muted" style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, background: 'var(--status-success)', borderRadius: 2, display: 'inline-block' }} />流入
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, background: 'var(--status-danger)', borderRadius: 2, display: 'inline-block' }} />流出
                  </span>
                </div>
              </div>
            );
          })()}
          <TableWrapper>
            <thead>
              <tr><Th>日期</Th><Th right>流入</Th><Th right>流出</Th><Th right>净额</Th></tr>
            </thead>
            <tbody>
              {[...dailyFlow.rows].reverse().map(r => (
                <tr key={r.date}>
                  <Td>{r.date}</Td>
                  <Td right>{fmtMoney(r.inflow)}</Td>
                  <Td right>{fmtMoney(r.outflow)}</Td>
                  <Td right bold>
                    <span style={{ color: r.net >= 0 ? TOKENS.css.statusSuccess : TOKENS.css.statusDanger }}>
                      {r.net >= 0 ? '+' : ''}{fmtMoney(r.net)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </>
      )}
    </div>
  );
}

// --- Tab 4: Expense ---

interface ExpenseSummaryData {
  byStatus: Record<string, { count: number; amount: number }>;
  byExpenseType: { expenseType: string; count: number; total: number }[];
  byCompany:     { companyCode: string;  count: number; total: number }[];
  byProject:     { projectCode: string;  count: number; total: number }[];
}
interface ReimbSummaryData {
  byStatus: Record<string, { count: number; amount: number }>;
  avgProcessingDays: number | null;
}

const EXPENSE_TYPE_LABEL: Record<string, string> = {
  TRAVEL: '差旅', MEAL: '餐饮', ENTERTAINMENT: '招待', OFFICE: '办公',
  MATERIAL: '物料', TRANSPORT: '交通', OTHER: '其他',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿', SUBMITTED: '已提交', PENDING_APPROVAL: '审批中',
  APPROVED: '已审批', REJECTED: '已拒绝', CANCELLED: '已取消', REIMBURSED: '已报销',
  PENDING: '待处理', PAID: '已付款',
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT:            'var(--status-neutral)',
  SUBMITTED:        'var(--color-primary)',
  PENDING_APPROVAL: 'var(--status-warning)',
  APPROVED:         'var(--status-success)',
  REJECTED:         'var(--status-danger)',
  CANCELLED:        'var(--status-neutral)',
  REIMBURSED:       'var(--status-success)',
  PENDING:          'var(--status-warning)',
  PENDING_APPROVAL2:'var(--status-warning)',
  PAID:             'var(--status-success)',
};

function ExpenseTab() {
  const [expData,   setExpData]   = useState<ExpenseSummaryData | null>(null);
  const [reimbData, setReimbData] = useState<ReimbSummaryData | null>(null);
  const [loadExp,   setLoadExp]   = useState(true);
  const [loadRe,    setLoadRe]    = useState(true);

  useEffect(() => {
    apiFetch<ExpenseSummaryData>('/api/v2/finance/reports/expense-summary').then(setExpData).finally(() => setLoadExp(false));
    apiFetch<ReimbSummaryData>('/api/v2/finance/reports/reimbursement-summary').then(setReimbData).finally(() => setLoadRe(false));
  }, []);

  return (
    <div>
      <SectionTitle>费用申请 — 各状态</SectionTitle>
      {loadExp ? <Spinner /> : !expData ? <Empty /> : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {Object.entries(expData.byStatus).map(([status, d]) => (
              <div key={status} className="bg-bg-muted border border-border"
                style={{ borderRadius: 10, padding: '10px 16px', minWidth: 130 }}>
                <div style={{ fontSize: 11, color: STATUS_COLOR[status] ?? 'var(--status-neutral)', fontWeight: 700 }}>
                  {STATUS_LABEL[status] ?? status}
                </div>
                <div className="text-text" style={{ fontSize: 16, fontWeight: 800 }}>{d.count} 笔</div>
                <div className="text-text-muted" style={{ fontSize: 11 }}>{fmtMoney(d.amount)}</div>
              </div>
            ))}
          </div>

          <SectionTitle>按费用类型</SectionTitle>
          <TableWrapper>
            <thead><tr><Th>类型</Th><Th right>笔数</Th><Th right>金额</Th></tr></thead>
            <tbody>
              {expData.byExpenseType.map(r => (
                <tr key={r.expenseType}>
                  <Td bold>{EXPENSE_TYPE_LABEL[r.expenseType] ?? r.expenseType}</Td>
                  <Td right>{r.count}</Td>
                  <Td right>{fmtMoney(r.total)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>

          {expData.byCompany.length > 0 && (
            <>
              <SectionTitle>按公司</SectionTitle>
              <TableWrapper>
                <thead><tr><Th>公司</Th><Th right>笔数</Th><Th right>金额</Th></tr></thead>
                <tbody>
                  {expData.byCompany.map(r => (
                    <tr key={r.companyCode}>
                      <Td bold>{r.companyCode}</Td>
                      <Td right>{r.count}</Td>
                      <Td right>{fmtMoney(r.total)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>
            </>
          )}

          {expData.byProject.length > 0 && (
            <>
              <SectionTitle>按项目（TOP 20）</SectionTitle>
              <TableWrapper>
                <thead><tr><Th>项目</Th><Th right>笔数</Th><Th right>金额</Th></tr></thead>
                <tbody>
                  {expData.byProject.map(r => (
                    <tr key={r.projectCode}>
                      <Td bold>{r.projectCode}</Td>
                      <Td right>{r.count}</Td>
                      <Td right>{fmtMoney(r.total)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>
            </>
          )}
        </>
      )}

      <SectionTitle>报销 — 各状态</SectionTitle>
      {loadRe ? <Spinner /> : !reimbData ? <Empty /> : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {Object.entries(reimbData.byStatus).map(([status, d]) => (
              <div key={status} className="bg-bg-muted border border-border"
                style={{ borderRadius: 10, padding: '10px 16px', minWidth: 130 }}>
                <div style={{ fontSize: 11, color: STATUS_COLOR[status] ?? 'var(--status-neutral)', fontWeight: 700 }}>
                  {STATUS_LABEL[status] ?? status}
                </div>
                <div className="text-text" style={{ fontSize: 16, fontWeight: 800 }}>{d.count} 笔</div>
                <div className="text-text-muted" style={{ fontSize: 11 }}>{fmtMoney(d.amount)}</div>
              </div>
            ))}
          </div>
          {reimbData.avgProcessingDays !== null && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              style={{ borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
              ⏱ 平均报销处理时长：<strong>{reimbData.avgProcessingDays} 天</strong>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Tab 5: Shareholder ---

interface ShSummaryData {
  byShareholder: { shareholderName: string; count: number; totalAmount: number; settledAmount: number; balanceAmount: number }[];
  byContributionType: { contributionType: string; count: number; totalAmount: number; balanceAmount: number }[];
  upcomingReturns: { shareholderName: string; expectedReturnDate: string; balanceAmount: number; companyCode: string }[];
}

function ShareholderTab() {
  const [data, setData] = useState<ShSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ShSummaryData>('/api/v2/finance/reports/shareholder-summary').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data) return <Empty text="加载失败" />;

  const totalBal = data.byShareholder.reduce((s, r) => s + r.balanceAmount, 0);
  const totalIn  = data.byShareholder.reduce((s, r) => s + r.totalAmount, 0);
  const totalSt  = data.byShareholder.reduce((s, r) => s + r.settledAmount, 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        <KpiCard label="出资总额"     value={fmtMoney(totalIn)}  icon={Users}      color="var(--status-info)" />
        <KpiCard label="已结算"       value={fmtMoney(totalSt)}  icon={CheckCircle} color="var(--status-success)" />
        <KpiCard label="余额"         value={fmtMoney(totalBal)} icon={DollarSign} color="var(--status-info)" />
        <KpiCard label="90天内到期"   value={`${data.upcomingReturns.length} 笔`} icon={AlertTriangle} color="var(--status-warning)" />
      </div>

      <SectionTitle>按股东</SectionTitle>
      {!data.byShareholder.length ? <Empty /> : (
        <TableWrapper>
          <thead>
            <tr><Th>股东</Th><Th right>笔数</Th><Th right>出资总额</Th><Th right>已结算</Th><Th right>余额</Th></tr>
          </thead>
          <tbody>
            {data.byShareholder.map(r => (
              <tr key={r.shareholderName}>
                <Td bold>{r.shareholderName}</Td>
                <Td right>{r.count}</Td>
                <Td right>{fmtMoney(r.totalAmount)}</Td>
                <Td right>{fmtMoney(r.settledAmount)}</Td>
                <Td right bold>{fmtMoney(r.balanceAmount)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}

      {data.byContributionType.length > 0 && (
        <>
          <SectionTitle>按出资类型</SectionTitle>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {data.byContributionType.map(r => (
              <div key={r.contributionType}
                className="border border-violet-200 dark:border-violet-700 bg-violet-50"
                style={{ borderRadius: 10, padding: '10px 16px', minWidth: 140 }}>
                <div className="text-violet-700 dark:text-violet-400" style={{ fontSize: 11, fontWeight: 700 }}>{r.contributionType}</div>
                <div className="text-text" style={{ fontSize: 15, fontWeight: 800 }}>{fmtMoney(r.totalAmount)}</div>
                <div className="text-text-muted" style={{ fontSize: 11 }}>余额 {fmtMoney(r.balanceAmount)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {data.upcomingReturns.length > 0 && (
        <>
          <SectionTitle>⚠️ 90 天内即将到期</SectionTitle>
          <TableWrapper>
            <thead>
              <tr><Th>股东</Th><Th>公司</Th><Th>预计还款日</Th><Th right>余额</Th></tr>
            </thead>
            <tbody>
              {data.upcomingReturns.map((r, i) => (
                <tr key={i}>
                  <Td bold>{r.shareholderName}</Td>
                  <Td>{r.companyCode}</Td>
                  <Td>
                    <span className="text-warning" style={{ fontWeight: 600 }}>
                      {String(r.expectedReturnDate).slice(0, 10)}
                    </span>
                  </Td>
                  <Td right bold>{fmtMoney(r.balanceAmount)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </>
      )}
    </div>
  );
}

// --- Tab 6: Project ---

interface ProjectRow {
  projectCode: string; companyCode: string;
  apOpen: number; arOpen: number; shBalance: number; expenseTotal: number; netPosition: number;
}

function ProjectTab() {
  const [data, setData] = useState<ProjectRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    apiFetch<ProjectRow[]>('/api/v2/finance/reports/project-finance').then(setData).finally(() => setLoading(false));
  }, []);

  const rows = data?.filter(r =>
    !filter || r.projectCode.toLowerCase().includes(filter.toLowerCase()),
  ) ?? [];

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="过滤项目代码…"
          className="text-text-muted border border-border bg-bg-card placeholder:text-text-dim dark:placeholder:text-slate-500"
          style={{
            padding: '7px 12px', borderRadius: 8,
            fontSize: 13, width: 220, outline: 'none',
          }}
        />
        <span className="text-text-dim" style={{ fontSize: 12 }}>{rows.length} 个项目</span>
      </div>

      {!rows.length ? <Empty text="暂无项目财务数据" /> : (
        <TableWrapper>
          <thead>
            <tr>
              <Th>项目</Th><Th>公司</Th>
              <Th right>AR 待收</Th><Th right>AP 待付</Th>
              <Th right>费用总额</Th><Th right>股东资金</Th>
              <Th right>净头寸</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <Td bold>{r.projectCode}</Td>
                <Td>{r.companyCode}</Td>
                <Td right>{fmtMoney(r.arOpen)}</Td>
                <Td right>{fmtMoney(r.apOpen)}</Td>
                <Td right>{fmtMoney(r.expenseTotal)}</Td>
                <Td right>{fmtMoney(r.shBalance)}</Td>
                <Td right bold>
                  <span style={{ color: r.netPosition >= 0 ? TOKENS.css.statusSuccess : TOKENS.css.statusDanger }}>
                    {r.netPosition >= 0 ? '+' : ''}{fmtMoney(r.netPosition)}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}

      <div className="text-text-dim" style={{ marginTop: 12, fontSize: 11 }}>
        净头寸 = AR 待收 − AP 待付 − 费用总额
      </div>
    </div>
  );
}

// --- Tab 7: Company ---

interface CompanyRow {
  companyCode: string;
  apOpen: number; arOpen: number; cashBalance: number;
  shBalance: number; expenseTotal: number; netOperatingPosition: number;
}

function CompanyTab() {
  const [data, setData] = useState<CompanyRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<CompanyRow[]>('/api/v2/finance/reports/company-finance').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data?.length) return <Empty text="暂无公司财务数据" />;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        <KpiCard label="公司总数" value={`${data.length} 家`} icon={Building2} color="var(--status-neutral)" />
        <KpiCard label="合计现金余额"
          value={fmtMoney(data.reduce((s, r) => s + r.cashBalance, 0))}
          icon={Wallet} color="var(--color-primary)" />
        <KpiCard label="合计经营净头寸"
          value={fmtMoney(data.reduce((s, r) => s + r.netOperatingPosition, 0))}
          icon={PieChart} color="var(--color-primary)" />
      </div>

      <TableWrapper>
        <thead>
          <tr>
            <Th>公司</Th>
            <Th right>现金余额</Th><Th right>AR 待收</Th><Th right>AP 待付</Th>
            <Th right>费用总额</Th><Th right>股东资金</Th>
            <Th right>经营净头寸</Th>
          </tr>
        </thead>
        <tbody>
          {data.map(r => (
            <tr key={r.companyCode}>
              <Td bold>{r.companyCode}</Td>
              <Td right>{fmtMoney(r.cashBalance)}</Td>
              <Td right>{fmtMoney(r.arOpen)}</Td>
              <Td right>{fmtMoney(r.apOpen)}</Td>
              <Td right>{fmtMoney(r.expenseTotal)}</Td>
              <Td right>{fmtMoney(r.shBalance)}</Td>
              <Td right bold>
                <span style={{ color: r.netOperatingPosition >= 0 ? TOKENS.css.statusSuccess : TOKENS.css.statusDanger }}>
                  {r.netOperatingPosition >= 0 ? '+' : ''}{fmtMoney(r.netOperatingPosition)}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
      <div className="text-text-dim" style={{ marginTop: 12, fontSize: 11 }}>
        经营净头寸 = 现金余额 + AR 待收 − AP 待付 − 费用总额
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',     label: '总览',    icon: PieChart      },
  { key: 'ap',          label: 'AP',      icon: TrendingDown  },
  { key: 'ar',          label: 'AR',      icon: TrendingUp    },
  { key: 'cash',        label: '资金',    icon: Wallet        },
  { key: 'expense',     label: '费用',    icon: Receipt       },
  { key: 'shareholder', label: '股东',    icon: Users         },
  { key: 'project',     label: '项目',    icon: FolderOpen    },
  { key: 'company',     label: '公司',    icon: Building2     },
];

export default function Finance2ReportsPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div>
      <PageHeader
        title="财务报表"
        subtitle="经营报表 · 账龄分析 · 资金日报 · 公司净头寸"
        breadcrumb={['财务管理', '经营报表']}
      />

      {/* Phase 6 说明横幅 */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f766e 100%)',
        borderRadius: 14, padding: '18px 24px', marginBottom: 20, color: '#fff',
        display: 'flex', alignItems: 'flex-start', gap: 14,
      }}>
        <PieChart size={22} style={{ marginTop: 2, flexShrink: 0, opacity: 0.85 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            财务管理 — 经营报表系统
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.7 }}>
            经营报表层 · 12 只读聚合报表 · 数据权限全程合规 · 管理报表（非会计凭证/总账）
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
            {['应付账龄', '应收账龄', '资金日报', '费用统计', '股东资金', '项目维度', '公司维度'].map(t => (
              <span key={t} style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                background: 'var(--bg-muted)',
              }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="border-b-2 border-border"
        style={{ display: 'flex', gap: 4, marginBottom: 20, paddingBottom: 0, overflowX: 'auto' }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm cursor-pointer bg-transparent border-0',
                'border-b-2 -mb-0.5 whitespace-nowrap rounded-t-lg transition-colors',
                active
                  ? 'text-indigo-600 dark:text-indigo-400 border-indigo-500 font-bold'
                  : 'text-text-muted border-transparent font-medium',
              ].join(' ')}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 内容 */}
      <div style={{ minHeight: 400 }}>
        {activeTab === 'overview'     && <OverviewTab />}
        {activeTab === 'ap'           && <ApTab />}
        {activeTab === 'ar'           && <ArTab />}
        {activeTab === 'cash'         && <CashTab />}
        {activeTab === 'expense'      && <ExpenseTab />}
        {activeTab === 'shareholder'  && <ShareholderTab />}
        {activeTab === 'project'      && <ProjectTab />}
        {activeTab === 'company'      && <CompanyTab />}
      </div>
    </div>
  );
}
