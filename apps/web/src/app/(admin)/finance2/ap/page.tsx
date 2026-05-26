'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingDown, Clock, CheckCircle, Wallet, Search, RefreshCw,
  AlertTriangle, ChevronLeft, ChevronRight, Filter, Plus,
  Download, X, ChevronDown, AlertCircle, Ban,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

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

// ── StatusChip ────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  OPEN:           { label: '未付',     bg: '#fff7ed', color: '#ea580c' },
  PARTIALLY_PAID: { label: '部分付款', bg: '#eff6ff', color: '#2563eb' },
  PAID:           { label: '已付清',   bg: '#f0fdf4', color: '#059669' },
  DISPUTED:       { label: '争议中',   bg: '#fdf4ff', color: '#9333ea' },
  CANCELLED:      { label: '已取消',   bg: '#f8fafc', color: '#94a3b8' },
};

const AGING_MAP: Record<string, { label: string; color: string }> = {
  NOT_DUE:  { label: '未到期',  color: '#059669' },
  '0_30':   { label: '逾期 ≤30天',  color: '#f59e0b' },
  '31_60':  { label: '逾期 31-60天', color: '#ea580c' },
  '61_90':  { label: '逾期 61-90天', color: '#dc2626' },
  '90_PLUS':{ label: '逾期 >90天',  color: '#991b1b' },
};

const SOURCE_MAP: Record<string, { label: string; color: string }> = {
  MANUAL:        { label: '手工',   color: '#6366f1' },
  PO:            { label: '采购PO', color: '#0891b2' },
  EXPENSE:       { label: '费用',   color: '#d97706' },
  REIMBURSEMENT: { label: '报销',   color: '#7c3aed' },
  OPENING:       { label: '期初',   color: '#475569' },
};

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
    }}>{cfg.label}</span>
  );
}

function AgingBadge({ bucket }: { bucket: string }) {
  const cfg = AGING_MAP[bucket] ?? { label: bucket, color: '#64748b' };
  if (bucket === 'NOT_DUE') return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, marginLeft: 4 }}>
      [{cfg.label}]
    </span>
  );
}

function SourceTag({ type }: { type: string }) {
  const cfg = SOURCE_MAP[type] ?? { label: type, color: '#64748b' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
      background: `${cfg.color}18`, color: cfg.color, whiteSpace: 'nowrap',
    }}>{cfg.label}</span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, loading }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; loading: boolean;
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
      {sub && !loading && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

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

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box' as const,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: 480, maxWidth: '95vw',
        padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>新建手工 AP 发票</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="#94a3b8" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                公司代码 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input style={inputStyle} value={form.companyCode}
                onChange={e => set('companyCode', e.target.value)} placeholder="如 HKJH" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                货币 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select style={inputStyle} value={form.currencyCode}
                onChange={e => set('currencyCode', e.target.value)}>
                {['CNY', 'USD', 'EUR', 'HKD', 'JPY'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              供应商名称 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input style={inputStyle} value={form.supplierName}
              onChange={e => set('supplierName', e.target.value)} placeholder="供应商全称" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                发票金额 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input style={inputStyle} type="number" min="0" step="0.01"
                value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)}
                placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                发票号
              </label>
              <input style={inputStyle} value={form.invoiceNo}
                onChange={e => set('invoiceNo', e.target.value)} placeholder="可选" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                发票日期
              </label>
              <input style={inputStyle} type="date" value={form.invoiceDate}
                onChange={e => set('invoiceDate', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                到期日
              </label>
              <input style={inputStyle} type="date" value={form.dueDate}
                onChange={e => set('dueDate', e.target.value)} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              备注
            </label>
            <textarea style={{ ...inputStyle, resize: 'none', height: 60 }} value={form.remark}
              onChange={e => set('remark', e.target.value)} placeholder="可选" />
          </div>

          {err && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '8px 12px', fontSize: 12, color: '#ef4444', display: 'flex', gap: 6, alignItems: 'center' }}>
              <AlertCircle size={13} /> {err}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{
              padding: '8px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0',
              background: '#fff', fontSize: 13, cursor: 'pointer', color: '#475569',
            }}>取消</button>
            <button onClick={handleSubmit} disabled={saving} style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: saving ? '#a5b4fc' : '#6366f1', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            }}>{saving ? '创建中…' : '确认创建'}</button>
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
      <div style={{
        width: 480, maxWidth: '95vw', height: '100%', background: '#fff',
        overflowY: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
        padding: 28, display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>AP 发票详情</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="#94a3b8" />
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>加载中…</div>
        )}

        {!loading && detail && (
          <>
            {/* 基本信息 */}
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#6366f1', fontSize: 14 }}>
                  {detail.ap_no}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <SourceTag type={detail.source_type} />
                  <StatusChip status={detail.status} />
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
                    <span style={{ color: '#94a3b8' }}>{k}：</span>
                    <span style={{ color: '#0f172a', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 金额 */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
            }}>
              {[
                { label: '发票金额', value: fmtMoney(detail.amount_original, detail.currency_code), color: '#0f172a' },
                { label: '已付金额', value: fmtMoney(detail.paid_amount_original, detail.currency_code), color: '#10b981' },
                { label: '待付余额', value: fmtMoney(detail.balance_amount_original, detail.currency_code), color: Number(detail.balance_amount_original) > 0 ? '#ef4444' : '#64748b' },
              ].map(item => (
                <div key={item.label} style={{
                  background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: 10,
                  padding: '12px 14px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* 账龄 */}
            {detail.aging_bucket !== 'NOT_DUE' && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '8px 12px', fontSize: 12, color: '#dc2626',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <AlertTriangle size={13} />
                账龄：{AGING_MAP[detail.aging_bucket]?.label ?? detail.aging_bucket}
              </div>
            )}

            {/* 付款核销记录 */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                付款核销记录（{detail.allocations.length} 条）
              </div>
              {detail.allocations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontSize: 12 }}>
                  暂无付款记录
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.allocations.map(a => (
                    <div key={a.id} style={{
                      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                      padding: '10px 14px', fontSize: 12,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: 'monospace', color: '#059669', fontWeight: 600 }}>{a.alloc_no}</span>
                        <span style={{ fontWeight: 700, color: '#065f46' }}>
                          {fmtMoney(a.amount_original, a.currency_code)}
                        </span>
                      </div>
                      <div style={{ color: '#64748b' }}>
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
              <div style={{
                border: '1.5px solid #fed7aa', borderRadius: 10,
                padding: 14, background: '#fff8f1',
              }}>
                {!showCancel ? (
                  <button
                    onClick={() => setShowCancel(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8,
                      border: '1.5px solid #fca5a5', background: '#fff',
                      fontSize: 13, cursor: 'pointer', color: '#dc2626',
                    }}
                  >
                    <Ban size={13} /> 取消此 AP 发票
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#c2410c', marginBottom: 8 }}>
                      确认取消 AP 发票
                    </div>
                    <textarea
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      placeholder="取消原因（可选）"
                      style={{
                        width: '100%', height: 60, padding: '8px 10px', borderRadius: 8,
                        border: '1.5px solid #fca5a5', fontSize: 12, resize: 'none',
                        boxSizing: 'border-box', outline: 'none',
                      }}
                    />
                    {cancelErr && (
                      <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{cancelErr}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={() => { setShowCancel(false); setCancelErr(''); }} style={{
                        padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                        background: '#fff', fontSize: 12, cursor: 'pointer',
                      }}>放弃</button>
                      <button onClick={handleCancel} disabled={cancelling} style={{
                        padding: '6px 14px', borderRadius: 8, border: 'none',
                        background: cancelling ? '#fca5a5' : '#dc2626', color: '#fff',
                        fontSize: 12, fontWeight: 600, cursor: cancelling ? 'not-allowed' : 'pointer',
                      }}>{cancelling ? '处理中…' : '确认取消'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {detail.status === 'CANCELLED' && (
              <div style={{
                background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10,
                padding: '12px 14px', fontSize: 12, color: '#94a3b8',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Ban size={13} /> 此 AP 发票已取消
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
        title="AP Runtime（应付账款）"
        subtitle="Finance V2 Phase 1 — fin_ap_invoices 正式启用"
        breadcrumb={['Finance V2', 'AP Runtime']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleImport}
              disabled={importing}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                border: '1.5px solid #bae6fd', background: '#f0f9ff',
                fontSize: 13, cursor: importing ? 'not-allowed' : 'pointer', color: '#0284c7',
              }}
            >
              <Download size={13} />
              {importing ? '导入中…' : '从采购 AP 导入'}
            </button>
            <button
              onClick={() => { loadList(page); loadSummary(); }}
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
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                border: 'none', background: '#6366f1',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#fff',
              }}
            >
              <Plus size={13} /> 新建 AP
            </button>
          </div>
        }
      />

      {/* 导入结果 */}
      {importResult && (
        <div style={{
          background: importResult.failed > 0 ? '#fff8f1' : '#f0fdf4',
          border: `1px solid ${importResult.failed > 0 ? '#fed7aa' : '#bbf7d0'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: importResult.failed > 0 ? '#c2410c' : '#065f46' }}>
            导入完成：共 {importResult.total} 条，成功 {importResult.imported}，
            跳过 {importResult.skipped}，失败 {importResult.failed}
          </span>
          <button onClick={() => setImportResult(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <X size={14} color="#94a3b8" />
          </button>
        </div>
      )}

      {/* KPI 汇总 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12, marginBottom: 22,
      }}>
        <KpiCard label="AP 总笔数"  value={String(summary?.total_invoices ?? '—')}
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
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 14, padding: '12px 14px',
        background: '#fff', borderRadius: 10, border: '1.5px solid #f1f5f9',
      }}>
        <Filter size={14} color="#64748b" />

        {/* 状态快速筛选 */}
        {[
          { key: 'OPEN',           label: '未付' },
          { key: 'PARTIALLY_PAID', label: '部分付款' },
          { key: 'PAID',           label: '已付清' },
          { key: 'DISPUTED',       label: '争议中' },
          { key: 'CANCELLED',      label: '已取消' },
        ].map(s => (
          <button key={s.key} onClick={() => handleStatusFilter(s.key)} style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
            fontWeight: status === s.key ? 700 : 400,
            background: status === s.key ? '#6366f1' : '#f1f5f9',
            color:      status === s.key ? '#fff'    : '#475569',
            border: 'none',
          }}>{s.label}</button>
        ))}

        <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />

        {/* 来源类型 */}
        <select
          value={sourceType}
          onChange={e => { setSourceType(e.target.value); setPage(1); }}
          style={{
            padding: '4px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0',
            fontSize: 12, background: '#fff', color: '#475569', cursor: 'pointer',
          }}
        >
          <option value="">全部来源</option>
          <option value="MANUAL">手工</option>
          <option value="PO">采购PO</option>
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
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 13,
              border: '1.5px solid #e2e8f0', outline: 'none', width: 210,
            }}
          />
          <button onClick={handleSearch} style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 13,
            background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Search size={13} /> 搜索
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '12px 16px', marginBottom: 14, color: '#ef4444', fontSize: 13,
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
                {['AP编号', '来源', '供应商', '公司', '发票日期', '到期日', '发票金额', '待付余额', '状态'].map(h => (
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
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                  暂无 AP 记录。
                  {!status && !keyword && (
                    <span> 可点击 <strong>从采购 AP 导入</strong> 迁移历史数据，或 <strong>新建 AP</strong>。</span>
                  )}
                </td></tr>
              ) : records.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: i % 2 === 0 ? '#fff' : '#fafafa',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa')}
                >
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#6366f1', whiteSpace: 'nowrap' }}>
                    {r.ap_no}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <SourceTag type={r.source_type} />
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: 160 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.supplier_name}</div>
                    {r.supplier_code && <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.supplier_code}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {r.company_code}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {fmtDate(r.invoice_date)}
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: isOverdue(r.due_date, r.status) ? '#ef4444' : '#475569' }}>
                      {fmtDate(r.due_date)}
                    </span>
                    <AgingBadge bucket={r.aging_bucket} />
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                    {fmtMoney(r.amount_original, r.currency_code)}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap',
                    color: Number(r.balance_amount_original) > 0 ? '#ef4444' : '#64748b' }}>
                    {fmtMoney(r.balance_amount_original, r.currency_code)}
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
          <span>共 {total} 条（第 {page} / {totalPages} 页）</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => { const p = page - 1; setPage(p); loadList(p); }}
              disabled={page <= 1 || loading}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0',
                background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.4 : 1, display: 'flex', alignItems: 'center',
              }}
            ><ChevronLeft size={14} /></button>
            <span style={{ padding: '0 8px' }}>{page} / {totalPages}</span>
            <button
              onClick={() => { const p = page + 1; setPage(p); loadList(p); }}
              disabled={page >= totalPages || loading}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0',
                background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.4 : 1, display: 'flex', alignItems: 'center',
              }}
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
