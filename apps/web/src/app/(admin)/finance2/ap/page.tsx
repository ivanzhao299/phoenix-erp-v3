'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingDown, Clock, CheckCircle, Wallet, Search, RefreshCw,
  AlertTriangle, ChevronLeft, ChevronRight, Filter, Plus,
  Download, X, ChevronDown, AlertCircle, Ban,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface ApInvoice {
  id:                    string;
  ap_no:                 string;
  source_type:           string;
  source_no:             string | null;
  company_code:          string;
  company_name:          string | null;
  project_code:          string | null;
  project_name:          string | null;
  supplier_code:         string | null;
  supplier_name:         string;
  invoice_no:            string | null;
  invoice_date:          string | null;
  due_date:              string | null;
  currency_code:         string;
  amount_original:       string;
  paid_amount_original:  string;
  balance_amount_original: string;
  status:                string;
  payment_status:        string;
  aging_bucket:          string;
  remark:                string | null;
  created_at:            string;
}

interface ApAllocation {
  id:             string;
  alloc_no:       string;
  amount_original: string;
  currency_code:  string;
  payment_date:   string;
  payment_method: string | null;
  reference_no:   string | null;
  remark:         string | null;
}

interface ApDetail extends ApInvoice {
  allocations: ApAllocation[];
}

interface ApSummary {
  source:                   string;
  total_invoices:           number;
  open_invoices:            number;
  partial_invoices:         number;
  paid_invoices:            number;
  overdue_invoices:         number;
  total_amount_original:    string;
  paid_amount_original:     string;
  balance_amount_original:  string;
  overdue_balance:          string;
  byCurrency:               { currency_code: string; amount: string; balance: string; count: number }[];
  byStatus:                 { status: string; count: number; amount: string }[];
  asOf:                     string;
}

interface ImportResult {
  source:   string;
  total:    number;
  imported: number;
  skipped:  number;
  failed:   number;
  errors:   string[];
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...opts?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body;
}

function fmtMoney(val: string | number | null | undefined, currency = 'CNY') {
  const n = Number(val ?? 0);
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '¥';
  return `${currency} ${sym}${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return s.slice(0, 10);
}

function isOverdue(dueDate: string | null | undefined, status: string) {
  if (!dueDate || ['PAID', 'CANCELLED'].includes(status)) return false;
  return new Date(dueDate) < new Date();
}

// ── 账龄/来源 辅助组件 ────────────────────────────────────────────────────────

const AGING_MAP: Record<string, { label: string; colorClass: string }> = {
  NOT_DUE:  { label: '未到期',     colorClass: 'text-emerald-600 dark:text-emerald-400' },
  '0_30':   { label: '逾期 ≤30天',  colorClass: 'text-warning' },
  '31_60':  { label: '逾期 31-60天', colorClass: 'text-orange-600 dark:text-orange-400' },
  '61_90':  { label: '逾期 61-90天', colorClass: 'text-danger' },
  '90_PLUS':{ label: '逾期 >90天',  colorClass: 'text-red-800 dark:text-red-300' },
};

const SOURCE_MAP: Record<string, { label: string; colorClass: string }> = {
  MANUAL:        { label: '手工',   colorClass: 'text-indigo-700 dark:text-indigo-300' },
  PO:            { label: '采购订单', colorClass: 'text-cyan-700 dark:text-cyan-300' },
  EXPENSE:       { label: '费用',   colorClass: 'text-amber-700 dark:text-amber-300' },
  REIMBURSEMENT: { label: '报销',   colorClass: 'text-violet-700 dark:text-violet-300' },
  OPENING:       { label: '期初',   colorClass: 'text-text-muted' },
};

function AgingBadge({ bucket }: { bucket: string }) {
  const cfg = AGING_MAP[bucket] ?? { label: bucket, colorClass: 'text-text-muted' };
  if (bucket === 'NOT_DUE') return null;
  return (
    <span className={`text-[10px] font-bold ml-1 ${cfg.colorClass}`}>
      [{cfg.label}]
    </span>
  );
}

function SourceBadge({ type }: { type: string }) {
  const cfg = SOURCE_MAP[type] ?? { label: type, colorClass: 'text-text-muted' };
  return (
    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap bg-current/[0.08] ${cfg.colorClass}`}>
      {cfg.label}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, loading }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; loading: boolean;
}) {
  return (
    <div className="bg-bg-card border border-border"
      style={{ borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={16} color={color} />
        <span className="text-text-muted" style={{ fontSize: 12 }}>{label}</span>
      </div>
      <div className="text-text" style={{ fontSize: 18, fontWeight: 800 }}>
        {loading ? '…' : value}
      </div>
      {sub && !loading && (
        <div className="text-text-muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

// ── Modal 通用 input className ────────────────────────────────────────────────

const INP_CLASS = 'w-full px-3 py-2 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-indigo-400 dark:focus:border-indigo-500 box-border';

// ── 创建 AP Modal ─────────────────────────────────────────────────────────────

interface CreateForm {
  companyCode: string; supplierName: string; currencyCode: string;
  amountOriginal: string; invoiceNo: string; invoiceDate: string;
  dueDate: string; remark: string;
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<CreateForm>({
    companyCode: '', supplierName: '', currencyCode: 'CNY',
    amountOriginal: '', invoiceNo: '', invoiceDate: '', dueDate: '', remark: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k: keyof CreateForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.companyCode.trim()) { setErr('请填写公司代码'); return; }
    if (!form.supplierName.trim()) { setErr('请填写供应商名称'); return; }
    if (!form.amountOriginal || isNaN(Number(form.amountOriginal)) || Number(form.amountOriginal) <= 0) {
      setErr('请填写有效的发票金额'); return;
    }
    setSaving(true);
    setErr('');
    try {
      await apiFetch('/api/v2/finance/ap/invoices', {
        method: 'POST',
        body: JSON.stringify({
          companyCode:    form.companyCode.trim(),
          supplierName:   form.supplierName.trim(),
          currencyCode:   form.currencyCode,
          amountOriginal: Number(form.amountOriginal),
          invoiceNo:      form.invoiceNo.trim() || undefined,
          invoiceDate:    form.invoiceDate || undefined,
          dueDate:        form.dueDate || undefined,
          remark:         form.remark.trim() || undefined,
        }),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setErr(e.message ?? '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="bg-bg-card"
        style={{ borderRadius: 16, width: 480, maxWidth: '95vw', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="text-text" style={{ fontWeight: 700, fontSize: 16 }}>新建应付发票</div>
          <button onClick={onClose} className="bg-transparent border-0 cursor-pointer p-1">
            <X size={18} className="text-text-dim" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">
                公司代码 <span className="text-red-500">*</span>
              </label>
              <input className={INP_CLASS} value={form.companyCode}
                onChange={e => set('companyCode', e.target.value)} placeholder="如 HKJH" />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">
                货币 <span className="text-red-500">*</span>
              </label>
              <select className={INP_CLASS} value={form.currencyCode}
                onChange={e => set('currencyCode', e.target.value)}>
                {['CNY', 'USD', 'EUR', 'HKD', 'JPY'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block mb-1 text-xs font-semibold text-text-muted">
              供应商名称 <span className="text-red-500">*</span>
            </label>
            <input className={INP_CLASS} value={form.supplierName}
              onChange={e => set('supplierName', e.target.value)} placeholder="供应商全称" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">
                发票金额 <span className="text-red-500">*</span>
              </label>
              <input className={INP_CLASS} type="number" min="0" step="0.01"
                value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)}
                placeholder="0.00" />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">
                发票号
              </label>
              <input className={INP_CLASS} value={form.invoiceNo}
                onChange={e => set('invoiceNo', e.target.value)} placeholder="可选" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">
                发票日期
              </label>
              <input className={INP_CLASS} type="date" value={form.invoiceDate}
                onChange={e => set('invoiceDate', e.target.value)} />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">
                到期日
              </label>
              <input className={INP_CLASS} type="date" value={form.dueDate}
                onChange={e => set('dueDate', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-xs font-semibold text-text-muted">
              备注
            </label>
            <textarea className={INP_CLASS} style={{ resize: 'none', height: 60 }} value={form.remark}
              onChange={e => set('remark', e.target.value)} placeholder="可选" />
          </div>

          {err && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2">
              <AlertCircle size={13} /> {err}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border bg-bg-page text-sm text-text-muted cursor-pointer hover:bg-bg-muted transition-colors">
              取消
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className={`px-4 py-2 rounded-lg border-0 text-sm font-semibold text-white cursor-pointer transition-colors ${saving ? 'bg-indigo-300 dark:bg-indigo-700 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
              {saving ? '创建中…' : '确认创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 详情侧抽屉 ────────────────────────────────────────────────────────────────

function DetailDrawer({ invoiceId, onClose, onCancelled }: {
  invoiceId: string; onClose: () => void; onCancelled: () => void;
}) {
  const [detail,      setDetail]      = useState<ApDetail | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [cancelReason,setCancelReason]= useState('');
  const [cancelling,  setCancelling]  = useState(false);
  const [showCancel,  setShowCancel]  = useState(false);
  const [cancelErr,   setCancelErr]   = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch<ApDetail>(`/api/v2/finance/ap/invoices/${invoiceId}`)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const handleCancel = async () => {
    setCancelling(true);
    setCancelErr('');
    try {
      await apiFetch(`/api/v2/finance/ap/invoices/${invoiceId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      });
      onCancelled();
      onClose();
    } catch (e: any) {
      setCancelErr(e.message ?? '取消失败');
    } finally {
      setCancelling(false);
    }
  };

  const canCancel = detail && !['PAID', 'CANCELLED'].includes(detail.status)
    && Number(detail.paid_amount_original) === 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 900,
      display: 'flex', justifyContent: 'flex-end',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-bg-card"
        style={{ width: 480, maxWidth: '95vw', height: '100%', overflowY: 'auto',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.12)', padding: 28,
          display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="text-text" style={{ fontWeight: 700, fontSize: 16 }}>应付发票详情</div>
          <button onClick={onClose} className="bg-transparent border-0 cursor-pointer p-1">
            <X size={18} className="text-text-dim" />
          </button>
        </div>

        {loading && (
          <div className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>加载中…</div>
        )}

        {!loading && detail && (
          <>
            {/* 基本信息 */}
            <div className="bg-bg-muted" style={{ borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                  {detail.ap_no}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <SourceBadge type={detail.source_type} />
                  <StatusBadge status={detail.status} size="sm" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                {[
                  ['供应商', detail.supplier_name],
                  ['公司', detail.company_code + (detail.company_name ? ` ${detail.company_name}` : '')],
                  ['发票号', detail.invoice_no ?? '—'],
                  ['发票日期', fmtDate(detail.invoice_date)],
                  ['到期日', fmtDate(detail.due_date)],
                  ['项目', detail.project_code ?? '—'],
                  ['来源单号', detail.source_no ?? '—'],
                  ['备注', detail.remark ?? '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span className="text-text-muted">{k}：</span>
                    <span className="text-text" style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 金额 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: '发票金额', value: fmtMoney(detail.amount_original, detail.currency_code), colorClass: 'text-text' },
                { label: '已付金额', value: fmtMoney(detail.paid_amount_original, detail.currency_code), colorClass: 'text-emerald-600 dark:text-emerald-400' },
                { label: '待付余额', value: fmtMoney(detail.balance_amount_original, detail.currency_code), colorClass: Number(detail.balance_amount_original) > 0 ? 'text-danger' : 'text-text-muted' },
              ].map(item => (
                <div key={item.label} className="bg-bg-page border border-border"
                  style={{ borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div className="text-text-muted" style={{ fontSize: 10, marginBottom: 4 }}>{item.label}</div>
                  <div className={`text-xs font-extrabold ${item.colorClass}`}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* 账龄 */}
            {detail.aging_bucket !== 'NOT_DUE' && (
              <div className="bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 text-xs text-danger flex items-center gap-1.5">
                <AlertTriangle size={13} />
                账龄：{AGING_MAP[detail.aging_bucket]?.label ?? detail.aging_bucket}
              </div>
            )}

            {/* 付款核销记录 */}
            <div>
              <div className="text-text-muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                付款核销记录（{detail.allocations.length} 条）
              </div>
              {detail.allocations.length === 0 ? (
                <div className="text-text-muted" style={{ textAlign: 'center', padding: '16px 0', fontSize: 12 }}>
                  暂无付款记录
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.allocations.map(a => (
                    <div key={a.id} className="bg-success/10 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2.5 text-xs">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{a.alloc_no}</span>
                        <span className="font-bold text-emerald-800 dark:text-emerald-200">
                          {fmtMoney(a.amount_original, a.currency_code)}
                        </span>
                      </div>
                      <div className="text-text-muted">
                        {fmtDate(a.payment_date)}
                        {a.payment_method && <span> · {a.payment_method}</span>}
                        {a.reference_no && <span> · {a.reference_no}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 取消区域 */}
            {canCancel && (
              <div className="border border-orange-200 dark:border-orange-800 rounded-xl p-3.5 bg-orange-50 dark:bg-orange-900/20">
                {!showCancel ? (
                  <button
                    onClick={() => setShowCancel(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-danger/20 bg-bg-card text-sm text-danger cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Ban size={13} /> 取消应付发票
                  </button>
                ) : (
                  <div>
                    <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-2">
                      确认取消应付发票
                    </div>
                    <textarea
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      placeholder="取消原因（可选）"
                      className="w-full h-14 px-2.5 py-2 rounded-lg border border-danger/20 bg-bg-page text-xs text-text resize-none outline-none box-border"
                    />
                    {cancelErr && (
                      <div className="text-xs text-danger mt-1.5">{cancelErr}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={() => { setShowCancel(false); setCancelErr(''); }}
                        className="px-3.5 py-1.5 rounded-lg border border-border bg-bg-page text-xs text-text-muted cursor-pointer hover:bg-bg-muted transition-colors">
                        放弃
                      </button>
                      <button onClick={handleCancel} disabled={cancelling}
                        className={`px-3.5 py-1.5 rounded-lg border-0 text-xs font-semibold text-white transition-colors ${cancelling ? 'bg-red-300 dark:bg-red-800 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 cursor-pointer'}`}>
                        {cancelling ? '处理中…' : '确认取消'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {detail.status === 'CANCELLED' && (
              <div className="bg-bg-muted border border-border"
                style={{ borderRadius: 10, padding: '12px 14px', fontSize: 12,
                  display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="text-text-muted flex items-center gap-1.5">
                  <Ban size={13} /> 此应付发票已取消
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function Finance2ApPage() {
  const [records,      setRecords]      = useState<ApInvoice[]>([]);
  const [summary,      setSummary]      = useState<ApSummary | null>(null);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [pageSize]                      = useState(20);
  const [loading,      setLoading]      = useState(true);
  const [sumLoading,   setSumLoading]   = useState(true);
  const [error,        setError]        = useState('');

  // 筛选
  const [status,        setStatus]        = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [sourceType,    setSourceType]    = useState('');
  const [keyword,       setKeyword]       = useState('');
  const [searchInput,   setSearchInput]   = useState('');

  // 模态框 / 侧抽屉
  const [showCreate,   setShowCreate]   = useState(false);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);

  // 导入状态
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const buildQuery = useCallback((p = page) => {
    const q = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
    if (status)        q.set('status',        status);
    if (paymentStatus) q.set('paymentStatus', paymentStatus);
    if (sourceType)    q.set('sourceType',    sourceType);
    if (keyword)       q.set('keyword',       keyword);
    return q.toString();
  }, [page, pageSize, status, paymentStatus, sourceType, keyword]);

  const loadList = useCallback(async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ items: ApInvoice[]; total: number; page: number; pageSize: number }>(
        `/api/v2/finance/ap/invoices?${buildQuery(p)}`,
      );
      setRecords(res.items);
      setTotal(res.total);
      setPage(res.page);
    } catch (e: any) {
      setError(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const loadSummary = useCallback(async () => {
    setSumLoading(true);
    try {
      const sum = await apiFetch<ApSummary>('/api/v2/finance/ap/summary');
      setSummary(sum);
    } catch {}
    finally { setSumLoading(false); }
  }, []);

  useEffect(() => { loadList(1); }, [status, paymentStatus, sourceType, keyword]);
  useEffect(() => { loadSummary(); }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSearch = () => { setKeyword(searchInput.trim()); setPage(1); };

  const handleStatusFilter = (s: string) => { setStatus(p => p === s ? '' : s); setPage(1); };

  const handleImport = async () => {
    if (!confirm('将从 prc2_ap_ledger 幂等导入历史 AP 数据，已存在的记录会跳过。确认执行？')) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await apiFetch<ImportResult>('/api/v2/finance/ap/import-from-prc2', { method: 'POST' });
      setImportResult(result);
      await Promise.all([loadList(1), loadSummary()]);
    } catch (e: any) {
      setError(e.message ?? '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="应付账款管理"
        subtitle="供应商应付账款 · 付款核销 · 账龄分析"
        breadcrumb={['财务管理', '应付账款']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleImport}
              disabled={importing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-200 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900/20 text-sm text-cyan-700 dark:text-cyan-300 transition-colors ${importing ? 'opacity-60 cursor-not-allowed' : 'hover:bg-cyan-100 dark:hover:bg-cyan-900/40 cursor-pointer'}`}
            >
              <Download size={13} />
              {importing ? '导入中…' : '从采购单导入'}
            </button>
            <button
              onClick={() => { loadList(page); loadSummary(); }}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-bg-card text-sm text-text-muted hover:bg-bg-muted cursor-pointer transition-colors"
            >
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              刷新
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-0 bg-indigo-500 text-sm font-semibold text-white cursor-pointer hover:bg-indigo-600 transition-colors"
            >
              <Plus size={13} /> 新建 AP
            </button>
          </div>
        }
      />

      {/* 导入结果 */}
      {importResult && (
        <div className={`flex justify-between items-center px-4 py-3 rounded-xl mb-4 text-xs border ${
          importResult.failed > 0
            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
            : 'bg-success/10 border-emerald-200 dark:border-emerald-800'
        }`}>
          <span className={importResult.failed > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-emerald-700 dark:text-emerald-300'}>
            导入完成：共 {importResult.total} 条，成功 {importResult.imported}，
            跳过 {importResult.skipped}，失败 {importResult.failed}
          </span>
          <button onClick={() => setImportResult(null)}
            className="bg-transparent border-0 cursor-pointer p-0.5">
            <X size={14} className="text-text-dim" />
          </button>
        </div>
      )}

      {/* KPI 汇总 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12, marginBottom: 22,
      }}>
        <KpiCard label="应付账单总数"  value={String(summary?.total_invoices ?? '—')}
          icon={TrendingDown} color="#6366f1" loading={sumLoading} />
        <KpiCard label="待付（未付）" value={String(summary?.open_invoices ?? '—')}
          icon={Clock} color="#f59e0b" loading={sumLoading} />
        <KpiCard label="部分付款" value={String(summary?.partial_invoices ?? '—')}
          icon={TrendingDown} color="#3b82f6" loading={sumLoading} />
        <KpiCard label="已付清" value={String(summary?.paid_invoices ?? '—')}
          icon={CheckCircle} color="#10b981" loading={sumLoading} />
        <KpiCard label="逾期笔数" value={String(summary?.overdue_invoices ?? '—')}
          icon={AlertTriangle} color="#dc2626" loading={sumLoading} />
        <KpiCard
          label="待付余额（综合）"
          value={summary?.byCurrency?.[0]
            ? fmtMoney(summary.balance_amount_original, summary.byCurrency[0]?.currency_code)
            : (sumLoading ? '…' : '¥0.00')}
          sub={(summary?.byCurrency?.length ?? 0) > 1 ? `${summary!.byCurrency.length} 个币种` : undefined}
          icon={Wallet} color="#ef4444" loading={sumLoading} />
      </div>

      {/* 筛选栏 */}
      <div className="bg-bg-card border border-border flex gap-2 flex-wrap items-center mb-3.5 px-3.5 py-3 rounded-xl">
        <Filter size={14} className="text-text-dim" />

        {/* 状态快速筛选 */}
        {[
          { key: 'OPEN',           label: '未付' },
          { key: 'PARTIALLY_PAID', label: '部分付款' },
          { key: 'PAID',           label: '已付清' },
          { key: 'DISPUTED',       label: '争议中' },
          { key: 'CANCELLED',      label: '已取消' },
        ].map(s => (
          <button key={s.key} onClick={() => handleStatusFilter(s.key)}
            className={`px-3 py-1 rounded-full text-xs cursor-pointer font-medium transition-colors border-0 ${
              status === s.key
                ? 'bg-indigo-600 text-white font-bold'
                : 'bg-bg-muted text-text-muted hover:bg-bg-muted dark:hover:bg-slate-600'
            }`}>
            {s.label}
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        {/* 来源类型 */}
        <select
          value={sourceType}
          onChange={e => { setSourceType(e.target.value); setPage(1); }}
          className="px-2.5 py-1 rounded-lg border border-border text-xs bg-bg-page text-text-muted cursor-pointer outline-none"
        >
          <option value="">全部来源</option>
          <option value="MANUAL">手工</option>
          <option value="PO">采购订单</option>
          <option value="EXPENSE">费用</option>
          <option value="OPENING">期初</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* 关键字搜索 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="AP编号 / 供应商 / 发票号…"
            className="px-3 py-1.5 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-indigo-400 dark:focus:border-indigo-500 w-52"
          />
          <button onClick={handleSearch}
            className="px-3 py-1.5 rounded-lg text-sm bg-indigo-500 text-white border-0 cursor-pointer hover:bg-indigo-600 flex items-center gap-1 transition-colors">
            <Search size={13} /> 搜索
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-3.5 text-sm text-danger flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* 表格 */}
      <div className="bg-bg-card border border-border"
        style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr className="bg-bg-muted border-b border-border">
                {['AP编号', '来源', '供应商', '公司', '发票日期', '到期日', '发票金额', '待付余额', '状态'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left',
                    fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}
                    className="text-text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && records.length === 0 ? (
                <tr><td colSpan={9} className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>加载中…</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={9} className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>
                  暂无 AP 记录。
                  {!status && !keyword && (
                    <span> 可点击 <strong>从采购单导入</strong> 迁移历史数据，或 <strong>新建应付发票</strong>。</span>
                  )}
                </td></tr>
              ) : records.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`border-b border-border/30 cursor-pointer hover:bg-indigo-50 hover:bg-bg-muted/50 transition-colors ${i % 2 === 0 ? '' : 'bg-bg-muted/20'}`}
                >
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}
                    className="font-mono text-indigo-600 dark:text-indigo-400">
                    {r.ap_no}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <SourceBadge type={r.source_type} />
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: 160 }}>
                    <div className="text-text" style={{ fontWeight: 600 }}>{r.supplier_name}</div>
                    {r.supplier_code && <div className="text-text-muted" style={{ fontSize: 11 }}>{r.supplier_code}</div>}
                  </td>
                  <td className="text-text-muted" style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {r.company_code}
                  </td>
                  <td className="text-text-muted" style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {fmtDate(r.invoice_date)}
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <span className={isOverdue(r.due_date, r.status) ? 'text-danger' : 'text-text-muted'}>
                      {fmtDate(r.due_date)}
                    </span>
                    <AgingBadge bucket={r.aging_bucket} />
                  </td>
                  <td className="text-text" style={{ padding: '10px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {fmtMoney(r.amount_original, r.currency_code)}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap' }}
                    className={Number(r.balance_amount_original) > 0 ? 'text-danger' : 'text-text-muted'}>
                    {fmtMoney(r.balance_amount_original, r.currency_code)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <StatusBadge status={r.status} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <div className="border-t border-border text-text-muted flex justify-between items-center px-4 py-3 text-sm">
          <span>共 {total} 条（第 {page} / {totalPages} 页）</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => { const p = page - 1; setPage(p); loadList(p); }}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center cursor-pointer"
            ><ChevronLeft size={14} /></button>
            <span style={{ padding: '0 8px' }}>{page} / {totalPages}</span>
            <button
              onClick={() => { const p = page + 1; setPage(p); loadList(p); }}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center cursor-pointer"
            ><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* 创建 Modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { loadList(1); loadSummary(); }}
        />
      )}

      {/* 详情侧抽屉 */}
      {selectedId && (
        <DetailDrawer
          invoiceId={selectedId}
          onClose={() => setSelectedId(null)}
          onCancelled={() => { loadList(page); loadSummary(); }}
        />
      )}
    </div>
  );
}
