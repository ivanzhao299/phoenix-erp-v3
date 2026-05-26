'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  TrendingDown, Clock, CheckCircle, Wallet, Search, RefreshCw,
  AlertTriangle, ChevronLeft, ChevronRight, Filter,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface ApRecord {
  id:            number;
  ap_no:         string;
  supplier_code: string;
  supplier_name: string;
  company_code:  string;
  invoice_date:  string;
  due_date:      string | null;
  amount:        string;
  paid_amount:   string;
  balance:       string;
  currency_code: string;
  status:        string;
  po_no:         string | null;
  description:   string | null;
}

interface ApSummary {
  total_count:    number;
  open_count:     number;
  partial_count:  number;
  paid_count:     number;
  total_balance:  string;
  overdue_balance: string;
}

interface PagedResult {
  data:  ApRecord[];
  total: number;
  page:  number;
  pageSize: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtMoney(val: string | number, currency = 'CNY') {
  const n = Number(val ?? 0);
  return `${currency === 'USD' ? '$' : '¥'}${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return s.slice(0, 10);
}

// ── StatusChip ────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    OPEN:    { label: '未付',     bg: '#fff7ed', color: '#ea580c' },
    PARTIAL: { label: '部分付款', bg: '#eff6ff', color: '#2563eb' },
    PAID:    { label: '已付清',   bg: '#f0fdf4', color: '#059669' },
    OVERDUE: { label: '已逾期',   bg: '#fef2f2', color: '#dc2626' },
    VOID:    { label: '已作废',   bg: '#f8fafc', color: '#94a3b8' },
  };
  const cfg = map[status] ?? { label: status, bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
    }}>{cfg.label}</span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color, loading }: {
  label: string; value: string; icon: React.ElementType; color: string; loading: boolean;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '16px 18px',
      border: '1.5px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={16} color={color} />
        <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
        {loading ? '…' : value}
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function Finance2ApPage() {
  const [records,   setRecords]   = useState<ApRecord[]>([]);
  const [summary,   setSummary]   = useState<ApSummary | null>(null);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [pageSize]                = useState(20);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // 筛选
  const [status,       setStatus]       = useState('');
  const [companyCode,  setCompanyCode]  = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [keyword,      setKeyword]      = useState('');
  const [searchInput,  setSearchInput]  = useState('');

  const buildQuery = useCallback((p = page) => {
    const q = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
    if (status)       q.set('status',       status);
    if (companyCode)  q.set('companyCode',  companyCode);
    if (supplierCode) q.set('supplierCode', supplierCode);
    if (keyword)      q.set('keyword',      keyword);
    return q.toString();
  }, [page, pageSize, status, companyCode, supplierCode, keyword]);

  const loadList = useCallback(async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const [res, sum] = await Promise.all([
        apiFetch<PagedResult>(`/api/v2/finance/ap/legacy-source?${buildQuery(p)}`),
        summary ? Promise.resolve(summary) : apiFetch<ApSummary>('/api/v2/finance/ap/summary'),
      ]);
      setRecords(res.data);
      setTotal(res.total);
      setPage(res.page);
      if (!summary) setSummary(sum);
    } catch (e: any) {
      setError(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildQuery]);

  useEffect(() => { loadList(1); }, [status, companyCode, supplierCode, keyword]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSearch = () => {
    setKeyword(searchInput.trim());
    setPage(1);
  };

  const handleStatusFilter = (s: string) => {
    setStatus(prev => prev === s ? '' : s);
    setPage(1);
  };

  const refreshSummary = async () => {
    try {
      const sum = await apiFetch<ApSummary>('/api/v2/finance/ap/summary');
      setSummary(sum);
    } catch {}
  };

  return (
    <div>
      <PageHeader
        title="AP Runtime（应付账款）"
        subtitle="来源：prc2_ap_ledger 适配层 — Phase 0 只读视图"
        breadcrumb={['Finance V2', 'AP Runtime']}
        actions={
          <button
            onClick={() => { loadList(page); refreshSummary(); }}
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

      {/* 适配层提示条 */}
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
        padding: '10px 16px', marginBottom: 20, fontSize: 12, color: '#1d4ed8',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <TrendingDown size={14} />
        当前数据来源为 <strong>prc2_ap_ledger</strong>（采购 V2 付款台账）过渡适配层。
        Phase 1 完成后将切换到 <strong>fin_ap_invoices</strong> 原生 AP Runtime。
      </div>

      {/* KPI 汇总 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12, marginBottom: 24,
      }}>
        <KpiCard label="AP 总笔数"  value={String(summary?.total_count ?? '—')}  icon={TrendingDown}  color="#6366f1" loading={loading} />
        <KpiCard label="未付"       value={String(summary?.open_count ?? '—')}    icon={Clock}         color="#f59e0b" loading={loading} />
        <KpiCard label="部分付款"   value={String(summary?.partial_count ?? '—')} icon={TrendingDown}  color="#3b82f6" loading={loading} />
        <KpiCard label="已付清"     value={String(summary?.paid_count ?? '—')}    icon={CheckCircle}   color="#10b981" loading={loading} />
        <KpiCard
          label="待付余额"
          value={summary ? fmtMoney(summary.total_balance) : '—'}
          icon={Wallet} color="#ef4444" loading={loading}
        />
        <KpiCard
          label="逾期余额"
          value={summary ? fmtMoney(summary.overdue_balance) : '—'}
          icon={AlertTriangle} color="#dc2626" loading={loading}
        />
      </div>

      {/* 筛选栏 */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 16, padding: '12px 16px',
        background: '#fff', borderRadius: 10, border: '1.5px solid #f1f5f9',
      }}>
        <Filter size={14} color="#64748b" />

        {/* 状态快速筛选 */}
        {[
          { key: 'OPEN',    label: '未付' },
          { key: 'PARTIAL', label: '部分付款' },
          { key: 'PAID',    label: '已付清' },
          { key: 'OVERDUE', label: '已逾期' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => handleStatusFilter(s.key)}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              fontWeight: status === s.key ? 700 : 400,
              background: status === s.key ? '#6366f1' : '#f1f5f9',
              color:      status === s.key ? '#fff'    : '#475569',
              border: 'none',
            }}
          >
            {s.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* 关键字搜索 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="AP编号 / 供应商 / 描述…"
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 13,
              border: '1.5px solid #e2e8f0', outline: 'none', width: 200,
            }}
          />
          <button
            onClick={handleSearch}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 13,
              background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Search size={13} /> 搜索
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16, color: '#ef4444', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* 表格 */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1.5px solid #f1f5f9',
        overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                {['AP编号', '供应商', '公司', '发票日期', '到期日', '金额', '已付', '余额', '状态'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontWeight: 600, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && records.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>加载中…</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>暂无数据</td></tr>
              ) : records.map((r, i) => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: i % 2 === 0 ? '#fff' : '#fafafa',
                  }}
                >
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#6366f1', whiteSpace: 'nowrap' }}>
                    {r.ap_no}
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: 160 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.supplier_name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.supplier_code}</div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#475569', whiteSpace: 'nowrap' }}>{r.company_code}</td>
                  <td style={{ padding: '10px 14px', color: '#475569', whiteSpace: 'nowrap' }}>{fmtDate(r.invoice_date)}</td>
                  <td style={{ padding: '10px 14px', color: r.due_date && new Date(r.due_date) < new Date() && r.status !== 'PAID' ? '#ef4444' : '#475569', whiteSpace: 'nowrap' }}>
                    {fmtDate(r.due_date)}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                    {fmtMoney(r.amount, r.currency_code)}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#10b981', whiteSpace: 'nowrap' }}>
                    {fmtMoney(r.paid_amount, r.currency_code)}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: Number(r.balance) > 0 ? '#ef4444' : '#64748b', whiteSpace: 'nowrap' }}>
                    {fmtMoney(r.balance, r.currency_code)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <StatusChip status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderTop: '1px solid #f1f5f9',
          fontSize: 13, color: '#64748b',
        }}>
          <span>共 {total} 条</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => { loadList(page - 1); setPage(p => p - 1); }}
              disabled={page <= 1 || loading}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0',
                background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.4 : 1, display: 'flex', alignItems: 'center',
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ padding: '0 8px' }}>{page} / {totalPages}</span>
            <button
              onClick={() => { loadList(page + 1); setPage(p => p + 1); }}
              disabled={page >= totalPages || loading}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0',
                background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.4 : 1, display: 'flex', alignItems: 'center',
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
