'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Clock, CheckCircle, Wallet, Search, RefreshCw,
  AlertTriangle, ChevronLeft, ChevronRight, Filter, Plus,
  X, AlertCircle, Ban, Receipt,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface ArInvoice {
  id:                       string;
  ar_no:                    string;
  source_type:              string;
  source_no:                string | null;
  company_code:             string;
  company_name:             string | null;
  project_code:             string | null;
  customer_code:            string | null;
  customer_name:            string;
  invoice_no:               string | null;
  invoice_date:             string | null;
  due_date:                 string | null;
  currency_code:            string;
  amount_original:          string;
  received_amount_original: string;
  balance_amount_original:  string;
  status:                   string;
  collection_status:        string;
  aging_bucket:             string;
  remark:                   string | null;
  created_at:               string;
}

interface ArAllocation {
  id:                        string;
  receipt_no:                string;
  allocated_amount_original: string;
  currency_code:             string;
  receipt_date:              string;
  receipt_method:            string | null;
  bank_ref:                  string | null;
  receipt_status:            string;
}

interface ArInvoiceDetail extends ArInvoice {
  allocations: ArAllocation[];
}

interface ArReceipt {
  id:              string;
  receipt_no:      string;
  company_code:    string;
  customer_code:   string | null;
  customer_name:   string;
  receipt_date:    string;
  currency_code:   string;
  amount_original: string;
  receipt_method:  string | null;
  bank_ref:        string | null;
  status:          string;
}

interface ArSummary {
  source:                   string;
  total_invoices:           number;
  open_invoices:            number;
  partial_invoices:         number;
  received_invoices:        number;
  overdue_invoices:         number;
  total_amount_original:    string;
  received_amount_original: string;
  balance_amount_original:  string;
  overdue_balance:          string;
  byCurrency:               { currency_code: string; amount: string; balance: string; count: number }[];
  byStatus:                 { status: string; count: number; amount: string }[];
  topCustomers:             { customer_code: string; customer_name: string; balance: string; count: number }[];
  asOf:                     string;
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
  if (!res.ok) throw new Error((body as any)?.message ?? `HTTP ${res.status}`);
  return body as T;
}

function fmtMoney(val: string | number | null | undefined, currency = 'CNY') {
  const n = Number(val ?? 0);
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '¥';
  return `${currency} ${sym}${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null | undefined) { return s ? s.slice(0, 10) : '—'; }

function isOverdue(due: string | null | undefined, status: string) {
  if (!due || ['RECEIVED', 'CANCELLED', 'WRITTEN_OFF'].includes(status)) return false;
  return new Date(due) < new Date();
}

// ── 徽章组件 ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  OPEN:               { label: '未收款',   bg: '#fff7ed', color: '#ea580c' },
  PARTIALLY_RECEIVED: { label: '部分收款', bg: '#eff6ff', color: '#2563eb' },
  RECEIVED:           { label: '已收清',   bg: '#f0fdf4', color: '#059669' },
  OVERDUE:            { label: '已逾期',   bg: '#fef2f2', color: '#dc2626' },
  DISPUTED:           { label: '争议中',   bg: '#fdf4ff', color: '#9333ea' },
  WRITTEN_OFF:        { label: '已核销',   bg: '#fefce8', color: '#854d0e' },
  CANCELLED:          { label: '已取消',   bg: '#f8fafc', color: '#94a3b8' },
};

const RECEIPT_STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  DRAFT:     { label: '草稿',   bg: '#f8fafc', color: '#64748b' },
  CONFIRMED: { label: '已确认', bg: '#f0fdf4', color: '#059669' },
  CANCELLED: { label: '已取消', bg: '#fef2f2', color: '#dc2626' },
};

const AGING_MAP: Record<string, { label: string; color: string }> = {
  NOT_DUE:  { label: '未到期',     color: '#059669' },
  '0_30':   { label: '逾期≤30天', color: '#f59e0b' },
  '31_60':  { label: '逾期31-60', color: '#ea580c' },
  '61_90':  { label: '逾期61-90', color: '#dc2626' },
  '90_PLUS':{ label: '逾期>90天', color: '#991b1b' },
};

const SOURCE_MAP: Record<string, { label: string; color: string }> = {
  MANUAL:      { label: '手工',    color: '#10b981' },
  SALES_ORDER: { label: '销售订单', color: '#3b82f6' },
  CONTRACT:    { label: '合同',    color: '#7c3aed' },
  OPENING:     { label: '期初',    color: '#475569' },
};

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

function ReceiptStatusChip({ status }: { status: string }) {
  const cfg = RECEIPT_STATUS_MAP[status] ?? { label: status, bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

function AgingBadge({ bucket }: { bucket: string }) {
  const cfg = AGING_MAP[bucket];
  if (!cfg || bucket === 'NOT_DUE') return null;
  return <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, marginLeft: 4 }}>[{cfg.label}]</span>;
}

function SourceTag({ type }: { type: string }) {
  const cfg = SOURCE_MAP[type] ?? { label: type, color: '#64748b' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
      background: `${cfg.color}18`, color: cfg.color, whiteSpace: 'nowrap' }}>
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
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
      style={{ borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon size={15} color={color} />
        <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: 11 }}>{label}</span>
      </div>
      <div className="text-slate-900 dark:text-slate-100" style={{ fontSize: 17, fontWeight: 800 }}>{loading ? '…' : value}</div>
      {sub && !loading && <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── 创建 AR Modal ─────────────────────────────────────────────────────────────

function CreateArModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    companyCode: '', customerName: '', currencyCode: 'CNY',
    amountOriginal: '', invoiceNo: '', invoiceDate: '', dueDate: '', remark: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.companyCode.trim()) { setErr('请填写公司代码'); return; }
    if (!form.customerName.trim()) { setErr('请填写客户名称'); return; }
    if (!form.amountOriginal || Number(form.amountOriginal) <= 0) { setErr('请填写有效的发票金额'); return; }
    setSaving(true); setErr('');
    try {
      await apiFetch('/api/v2/finance/ar/invoices', {
        method: 'POST',
        body: JSON.stringify({
          companyCode:    form.companyCode.trim(),
          customerName:   form.customerName.trim(),
          currencyCode:   form.currencyCode,
          amountOriginal: Number(form.amountOriginal),
          invoiceNo:      form.invoiceNo.trim() || undefined,
          invoiceDate:    form.invoiceDate || undefined,
          dueDate:        form.dueDate || undefined,
          remark:         form.remark.trim() || undefined,
        }),
      });
      onCreated(); onClose();
    } catch (e: any) { setErr(e.message ?? '创建失败'); }
    finally { setSaving(false); }
  };

  const inp = { width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="bg-white dark:bg-slate-800"
        style={{ borderRadius: 16, width: 480, maxWidth: '95vw', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="text-slate-900 dark:text-slate-100" style={{ fontWeight: 700, fontSize: 16 }}>新建应收发票</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} color="#94a3b8" />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                公司代码 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input style={inp} value={form.companyCode} onChange={e => set('companyCode', e.target.value)} placeholder="如 HKJH" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>货币</label>
              <select style={inp} value={form.currencyCode} onChange={e => set('currencyCode', e.target.value)}>
                {['CNY', 'USD', 'EUR', 'HKD', 'JPY'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              客户名称 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input style={inp} value={form.customerName} onChange={e => set('customerName', e.target.value)} placeholder="客户全称" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                发票金额 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input style={inp} type="number" min="0" step="0.01"
                value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>发票号</label>
              <input style={inp} value={form.invoiceNo} onChange={e => set('invoiceNo', e.target.value)} placeholder="可选" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>发票日期</label>
              <input style={inp} type="date" value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>到期日</label>
              <input style={inp} type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>备注</label>
            <textarea style={{ ...inp, resize: 'none', height: 56 }} value={form.remark} onChange={e => set('remark', e.target.value)} />
          </div>
          {err && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '8px 12px', fontSize: 12, color: '#ef4444', display: 'flex', gap: 6, alignItems: 'center' }}>
              <AlertCircle size={13} /> {err}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0',
              background: '#fff', fontSize: 13, cursor: 'pointer', color: '#475569' }}>取消</button>
            <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 18px', borderRadius: 8,
              border: 'none', background: saving ? '#6ee7b7' : '#10b981', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? '创建中…' : '确认创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 创建收款 Modal ─────────────────────────────────────────────────────────────

function CreateReceiptModal({
  selectedAr, onClose, onCreated,
}: { selectedAr?: ArInvoice | null; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    companyCode:  selectedAr?.company_code  ?? '',
    customerName: selectedAr?.customer_name ?? '',
    customerCode: selectedAr?.customer_code ?? '',
    currencyCode: selectedAr?.currency_code ?? 'CNY',
    amountOriginal: selectedAr ? selectedAr.balance_amount_original : '',
    receiptDate:  new Date().toISOString().slice(0, 10),
    receiptMethod: '', bankRef: '', remark: '',
  });
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.companyCode.trim()) { setErr('请填写公司代码'); return; }
    if (!form.customerName.trim()) { setErr('请填写客户名称'); return; }
    if (!form.receiptDate) { setErr('请选择收款日期'); return; }
    if (!form.amountOriginal || Number(form.amountOriginal) <= 0) { setErr('请填写有效收款金额'); return; }
    setSaving(true); setErr('');
    try {
      const receipt = await apiFetch<any>('/api/v2/finance/ar/receipts', {
        method: 'POST',
        body: JSON.stringify({
          companyCode:   form.companyCode.trim(),
          customerName:  form.customerName.trim(),
          customerCode:  form.customerCode.trim() || undefined,
          currencyCode:  form.currencyCode,
          amountOriginal: Number(form.amountOriginal),
          receiptDate:   form.receiptDate,
          receiptMethod: form.receiptMethod.trim() || undefined,
          bankRef:       form.bankRef.trim() || undefined,
          remark:        form.remark.trim() || undefined,
        }),
      });
      // 如果有指定 AR，立即发起 confirm 核销
      if (selectedAr && receipt?.id) {
        await apiFetch(`/api/v2/finance/ar/receipts/${receipt.id}/confirm`, {
          method: 'POST',
          body: JSON.stringify({
            allocations: [{
              arInvoiceId:              selectedAr.id,
              allocatedAmountOriginal:  Number(form.amountOriginal),
            }],
          }),
        });
      }
      onCreated(); onClose();
    } catch (e: any) { setErr(e.message ?? '创建失败'); }
    finally { setSaving(false); }
  };

  const inp = { width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    border: '1.5px solid #e2e8f0', outline: 'none', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="bg-white dark:bg-slate-800"
        style={{ borderRadius: 16, width: 500, maxWidth: '95vw', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="text-slate-900 dark:text-slate-100" style={{ fontWeight: 700, fontSize: 16 }}>
            {selectedAr ? `录入收款 — ${selectedAr.ar_no}` : '新建收款'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} color="#94a3b8" />
          </button>
        </div>
        {selectedAr && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
            padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#065f46' }}>
            <strong>{selectedAr.customer_name}</strong>｜
            余额 <strong>{fmtMoney(selectedAr.balance_amount_original, selectedAr.currency_code)}</strong>
            {selectedAr.due_date && ` · 到期 ${fmtDate(selectedAr.due_date)}`}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>公司代码 *</label>
              <input style={inp} value={form.companyCode} onChange={e => set('companyCode', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>货币</label>
              <select style={inp} value={form.currencyCode} onChange={e => set('currencyCode', e.target.value)}>
                {['CNY','USD','EUR','HKD','JPY'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>客户名称 *</label>
            <input style={inp} value={form.customerName} onChange={e => set('customerName', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>收款金额 *</label>
              <input style={inp} type="number" min="0.01" step="0.01"
                value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>收款日期 *</label>
              <input style={inp} type="date" value={form.receiptDate} onChange={e => set('receiptDate', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>收款方式</label>
              <select style={inp} value={form.receiptMethod} onChange={e => set('receiptMethod', e.target.value)}>
                <option value="">请选择</option>
                {['银行转账','支票','现金','线上支付','其他'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>银行流水号</label>
              <input style={inp} value={form.bankRef} onChange={e => set('bankRef', e.target.value)} placeholder="可选" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>备注</label>
            <textarea style={{ ...inp, resize: 'none', height: 52 }} value={form.remark} onChange={e => set('remark', e.target.value)} />
          </div>
          {selectedAr && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
              padding: '8px 12px', fontSize: 11, color: '#1d4ed8' }}>
              提交后将自动核销到 <strong>{selectedAr.ar_no}</strong>（草稿 → 立即确认）
            </div>
          )}
          {err && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '8px 12px', fontSize: 12, color: '#ef4444', display: 'flex', gap: 6, alignItems: 'center' }}>
              <AlertCircle size={13} /> {err}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8,
              border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#475569' }}>取消</button>
            <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 18px', borderRadius: 8,
              border: 'none', background: saving ? '#6ee7b7' : '#10b981', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? '处理中…' : '确认收款'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AR 详情侧抽屉 ──────────────────────────────────────────────────────────────

function ArDetailDrawer({ invoiceId, onClose, onChanged }: {
  invoiceId: string; onClose: () => void; onChanged: () => void;
}) {
  const [detail,      setDetail]      = useState<ArInvoiceDetail | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [cancelReason,setCancelReason]= useState('');
  const [cancelling,  setCancelling]  = useState(false);
  const [showCancel,  setShowCancel]  = useState(false);
  const [cancelErr,   setCancelErr]   = useState('');
  const [showReceipt, setShowReceipt] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch<ArInvoiceDetail>(`/api/v2/finance/ar/invoices/${invoiceId}`)
      .then(setDetail).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [invoiceId]);

  const handleCancel = async () => {
    setCancelling(true); setCancelErr('');
    try {
      await apiFetch(`/api/v2/finance/ar/invoices/${invoiceId}/cancel`, {
        method: 'POST', body: JSON.stringify({ reason: cancelReason }),
      });
      onChanged(); onClose();
    } catch (e: any) { setCancelErr(e.message ?? '取消失败'); }
    finally { setCancelling(false); }
  };

  const canCancel = detail &&
    !['RECEIVED','CANCELLED','WRITTEN_OFF'].includes(detail.status) &&
    Number(detail.received_amount_original) === 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 900,
      display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-800"
        style={{ width: 480, maxWidth: '95vw', height: '100%', overflowY: 'auto',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.12)', padding: 28,
          display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="text-slate-900 dark:text-slate-100" style={{ fontWeight: 700, fontSize: 16 }}>AR 发票详情</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} color="#94a3b8" />
          </button>
        </div>

        {loading && <div className="text-slate-500 dark:text-slate-400" style={{ textAlign: 'center', padding: 40 }}>加载中…</div>}

        {!loading && detail && (
          <>
            {/* 基本信息 */}
            <div className="bg-slate-50 dark:bg-slate-700" style={{ borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981', fontSize: 14 }}>
                  {detail.ar_no}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <SourceTag type={detail.source_type} />
                  <StatusChip status={detail.status} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                {[
                  ['客户', detail.customer_name],
                  ['公司', detail.company_code],
                  ['发票号', detail.invoice_no ?? '—'],
                  ['发票日期', fmtDate(detail.invoice_date)],
                  ['到期日', fmtDate(detail.due_date)],
                  ['项目', detail.project_code ?? '—'],
                  ['备注', detail.remark ?? '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span className="text-slate-500 dark:text-slate-400">{k}：</span>
                    <span className="text-slate-900 dark:text-slate-100" style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 金额 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: '发票金额', value: fmtMoney(detail.amount_original, detail.currency_code), color: '#0f172a' },
                { label: '已收金额', value: fmtMoney(detail.received_amount_original, detail.currency_code), color: '#10b981' },
                { label: '待收余额', value: fmtMoney(detail.balance_amount_original, detail.currency_code),
                  color: Number(detail.balance_amount_original) > 0 ? '#ef4444' : '#64748b' },
              ].map(item => (
                <div key={item.label} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600"
                  style={{ borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: 10, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* 账龄 */}
            {detail.aging_bucket !== 'NOT_DUE' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '8px 12px', fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13} />
                账龄：{AGING_MAP[detail.aging_bucket]?.label ?? detail.aging_bucket}
              </div>
            )}

            {/* 收款核销记录 */}
            <div>
              <div className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                收款核销记录（{detail.allocations.length} 条）
              </div>
              {detail.allocations.length === 0 ? (
                <div className="text-slate-500 dark:text-slate-400" style={{ textAlign: 'center', padding: '12px 0', fontSize: 12 }}>暂无收款记录</div>
              ) : detail.allocations.map(a => (
                <div key={a.id} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                  padding: '10px 14px', fontSize: 12, marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'monospace', color: '#059669', fontWeight: 600 }}>{a.receipt_no}</span>
                    <span style={{ fontWeight: 700, color: '#065f46' }}>
                      {fmtMoney(a.allocated_amount_original, a.currency_code)}
                    </span>
                  </div>
                  <div style={{ color: '#64748b' }}>
                    {fmtDate(a.receipt_date)}
                    {a.receipt_method && <span> · {a.receipt_method}</span>}
                    {a.bank_ref && <span> · {a.bank_ref}</span>}
                    <span style={{ marginLeft: 6 }}><ReceiptStatusChip status={a.receipt_status} /></span>
                  </div>
                </div>
              ))}
            </div>

            {/* 录入收款 */}
            {!['RECEIVED','CANCELLED','WRITTEN_OFF'].includes(detail.status) &&
              Number(detail.balance_amount_original) > 0 && (
              <div>
                {!showReceipt ? (
                  <button onClick={() => setShowReceipt(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 8,
                    border: '1.5px solid #bbf7d0', background: '#f0fdf4',
                    fontSize: 13, cursor: 'pointer', color: '#059669',
                  }}>
                    <Receipt size={13} /> 录入收款
                  </button>
                ) : (
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: 14 }}>
                    <CreateReceiptModal
                      selectedAr={detail}
                      onClose={() => setShowReceipt(false)}
                      onCreated={() => { setShowReceipt(false); load(); onChanged(); }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 取消 */}
            {canCancel && (
              <div style={{ border: '1.5px solid #fed7aa', borderRadius: 10, padding: 14, background: '#fff8f1' }}>
                {!showCancel ? (
                  <button onClick={() => setShowCancel(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                    border: '1.5px solid #fca5a5', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#dc2626',
                  }}>
                    <Ban size={13} /> 取消此 AR 发票
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#c2410c', marginBottom: 8 }}>确认取消 AR 发票</div>
                    <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                      placeholder="取消原因（可选）" style={{
                        width: '100%', height: 56, padding: '8px 10px', borderRadius: 8,
                        border: '1.5px solid #fca5a5', fontSize: 12, resize: 'none',
                        boxSizing: 'border-box', outline: 'none',
                      }} />
                    {cancelErr && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{cancelErr}</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => { setShowCancel(false); setCancelErr(''); }} style={{
                        padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                        background: '#fff', fontSize: 12, cursor: 'pointer' }}>放弃</button>
                      <button onClick={handleCancel} disabled={cancelling} style={{
                        padding: '6px 14px', borderRadius: 8, border: 'none',
                        background: cancelling ? '#fca5a5' : '#dc2626', color: '#fff',
                        fontSize: 12, fontWeight: 600, cursor: cancelling ? 'not-allowed' : 'pointer' }}>
                        {cancelling ? '处理中…' : '确认取消'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 收款 Modal 浮在抽屉外层 */}
      {showReceipt && detail && (
        <CreateReceiptModal
          selectedAr={detail}
          onClose={() => setShowReceipt(false)}
          onCreated={() => { setShowReceipt(false); load(); onChanged(); }}
        />
      )}
    </div>
  );
}

// ── Tab 类型 ──────────────────────────────────────────────────────────────────

type TabKey = 'invoices' | 'receipts' | 'aging';

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function Finance2ArPage() {
  const [tab, setTab]           = useState<TabKey>('invoices');

  // AR 列表
  const [invoices,    setInvoices]    = useState<ArInvoice[]>([]);
  const [invTotal,    setInvTotal]    = useState(0);
  const [invPage,     setInvPage]     = useState(1);
  const [invLoading,  setInvLoading]  = useState(true);
  const [invError,    setInvError]    = useState('');

  // AR 筛选
  const [status,      setStatus]      = useState('');
  const [keyword,     setKeyword]     = useState('');
  const [searchInput, setSearchInput] = useState('');

  // 收款列表
  const [receipts,    setReceipts]    = useState<ArReceipt[]>([]);
  const [recTotal,    setRecTotal]    = useState(0);
  const [recPage,     setRecPage]     = useState(1);
  const [recLoading,  setRecLoading]  = useState(false);

  // 汇总
  const [summary,     setSummary]     = useState<ArSummary | null>(null);
  const [sumLoading,  setSumLoading]  = useState(true);

  // 账龄
  const [aging,       setAging]       = useState<any>(null);
  const [agingLoading,setAgingLoading]= useState(false);

  // 模态框
  const [showCreate,    setShowCreate]    = useState(false);
  const [showReceipt,   setShowReceipt]   = useState(false);
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);

  const PAGE_SIZE = 20;

  // ── 数据加载 ────────────────────────────────────────────────────────────────

  const loadInvoices = useCallback(async (p = invPage) => {
    setInvLoading(true); setInvError('');
    try {
      const q = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (status)  q.set('status',  status);
      if (keyword) q.set('keyword', keyword);
      const res = await apiFetch<{ items: ArInvoice[]; total: number; page: number }>(
        `/api/v2/finance/ar/invoices?${q}`);
      setInvoices(res.items); setInvTotal(res.total); setInvPage(res.page);
    } catch (e: any) { setInvError(e.message ?? '加载失败'); }
    finally { setInvLoading(false); }
  }, [invPage, status, keyword]);

  const loadReceipts = useCallback(async (p = recPage) => {
    setRecLoading(true);
    try {
      const q = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      const res = await apiFetch<{ items: ArReceipt[]; total: number; page: number }>(
        `/api/v2/finance/ar/receipts?${q}`);
      setReceipts(res.items); setRecTotal(res.total); setRecPage(res.page);
    } catch {}
    finally { setRecLoading(false); }
  }, [recPage]);

  const loadSummary = useCallback(async () => {
    setSumLoading(true);
    try { const s = await apiFetch<ArSummary>('/api/v2/finance/ar/summary'); setSummary(s); } catch {}
    finally { setSumLoading(false); }
  }, []);

  const loadAging = useCallback(async () => {
    setAgingLoading(true);
    try { const a = await apiFetch<any>('/api/v2/finance/ar/aging'); setAging(a); } catch {}
    finally { setAgingLoading(false); }
  }, []);

  useEffect(() => { loadInvoices(1); }, [status, keyword]);
  useEffect(() => { loadSummary(); }, []);
  useEffect(() => { if (tab === 'receipts') loadReceipts(1); }, [tab]);
  useEffect(() => { if (tab === 'aging') loadAging(); }, [tab]);

  const invTotalPages = Math.max(1, Math.ceil(invTotal / PAGE_SIZE));
  const recTotalPages = Math.max(1, Math.ceil(recTotal / PAGE_SIZE));

  // ── 渲染 ────────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="应收账款管理"
        subtitle="客户应收账款 · 收款核销 · 账龄分析"
        breadcrumb={['财务管理', '应收账款']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { loadInvoices(1); loadSummary(); }} disabled={invLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#475569' }}>
              <RefreshCw size={13} style={{ animation: invLoading ? 'spin 1s linear infinite' : 'none' }} />
              刷新
            </button>
            <button onClick={() => setShowReceipt(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
              border: '1.5px solid #bbf7d0', background: '#f0fdf4',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#059669' }}>
              <Receipt size={13} /> 录入收款
            </button>
            <button onClick={() => setShowCreate(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
              border: 'none', background: '#10b981', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#fff' }}>
              <Plus size={13} /> 新建 AR
            </button>
          </div>
        }
      />

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 10, marginBottom: 20 }}>
        <KpiCard label="应收账单总数" value={String(summary?.total_invoices ?? '—')}
          icon={TrendingUp} color="#10b981" loading={sumLoading} />
        <KpiCard label="未收款" value={String(summary?.open_invoices ?? '—')}
          icon={Clock} color="#f59e0b" loading={sumLoading} />
        <KpiCard label="部分收款" value={String(summary?.partial_invoices ?? '—')}
          icon={TrendingUp} color="#3b82f6" loading={sumLoading} />
        <KpiCard label="已收清" value={String(summary?.received_invoices ?? '—')}
          icon={CheckCircle} color="#10b981" loading={sumLoading} />
        <KpiCard label="逾期笔数" value={String(summary?.overdue_invoices ?? '—')}
          icon={AlertTriangle} color="#dc2626" loading={sumLoading} />
        <KpiCard label="待收余额"
          value={summary?.byCurrency?.[0]
            ? fmtMoney(summary.balance_amount_original, summary.byCurrency[0].currency_code)
            : (sumLoading ? '…' : '—')}
          sub={(summary?.byCurrency?.length ?? 0) > 1 ? `${summary!.byCurrency.length} 个币种` : undefined}
          icon={Wallet} color="#ef4444" loading={sumLoading} />
      </div>

      {/* Tabs */}
      <div className="border-b-2 border-slate-200 dark:border-slate-700"
        style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
        {([
          { key: 'invoices', label: '应收账单' },
          { key: 'receipts', label: '收款记录' },
          { key: 'aging',    label: '账龄分析' },
        ] as { key: TabKey; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', border: 'none', background: 'none',
            fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
            color:         tab === t.key ? '#10b981' : '#64748b',
            borderBottom:  tab === t.key ? '2px solid #10b981' : '2px solid transparent',
            cursor: 'pointer', marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab: 应收账单 ── */}
      {tab === 'invoices' && (
        <>
          {/* 筛选 */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
              marginBottom: 12, padding: '10px 14px', borderRadius: 10 }}>
            <Filter size={14} color="#64748b" />
            {[
              { key: 'OPEN',               label: '未收款' },
              { key: 'PARTIALLY_RECEIVED', label: '部分收款' },
              { key: 'RECEIVED',           label: '已收清' },
              { key: 'OVERDUE',            label: '已逾期' },
              { key: 'CANCELLED',          label: '已取消' },
            ].map(s => (
              <button key={s.key} onClick={() => { setStatus(p => p === s.key ? '' : s.key); setInvPage(1); }}
                style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  fontWeight: status === s.key ? 700 : 400,
                  background: status === s.key ? '#10b981' : '#f1f5f9',
                  color:      status === s.key ? '#fff'    : '#475569',
                  border: 'none' }}>{s.label}</button>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (setKeyword(searchInput.trim()), setInvPage(1))}
                placeholder="AR编号 / 客户 / 发票号…"
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: 13, width: 200,
                  border: '1.5px solid #e2e8f0', outline: 'none' }} />
              <button onClick={() => { setKeyword(searchInput.trim()); setInvPage(1); }}
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: 13,
                  background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4 }}>
                <Search size={13} /> 搜索
              </button>
            </div>
          </div>

          {invError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
              padding: '12px 16px', marginBottom: 12, color: '#ef4444', fontSize: 13,
              display: 'flex', gap: 8 }}>
              <AlertTriangle size={14} /> {invError}
            </div>
          )}

          {/* 表格 */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                    {['AR编号','来源','客户','公司','发票日期','到期日','发票金额','待收余额','状态'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left',
                        fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}
                        className="text-slate-500 dark:text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invLoading && invoices.length === 0 ? (
                    <tr><td colSpan={9} className="text-slate-500 dark:text-slate-400" style={{ textAlign: 'center', padding: 40 }}>加载中…</td></tr>
                  ) : invoices.length === 0 ? (
                    <tr><td colSpan={9} className="text-slate-500 dark:text-slate-400" style={{ textAlign: 'center', padding: 40 }}>
                      暂无 AR 记录。可点击 <strong>新建 AR</strong> 手工录入。
                    </td></tr>
                  ) : invoices.map((r, i) => (
                    <tr key={r.id} onClick={() => setSelectedInvId(r.id)}
                      style={{ borderBottom: '1px solid #f1f5f9',
                        background: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa')}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#10b981', whiteSpace: 'nowrap' }}>
                        {r.ar_no}
                      </td>
                      <td style={{ padding: '10px 14px' }}><SourceTag type={r.source_type} /></td>
                      <td style={{ padding: '10px 14px', maxWidth: 150 }}>
                        <div className="text-slate-900 dark:text-slate-100" style={{ fontWeight: 600 }}>{r.customer_name}</div>
                        {r.customer_code && <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: 11 }}>{r.customer_code}</div>}
                      </td>
                      <td className="text-slate-500 dark:text-slate-400" style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{r.company_code}</td>
                      <td className="text-slate-500 dark:text-slate-400" style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtDate(r.invoice_date)}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ color: isOverdue(r.due_date, r.status) ? '#ef4444' : '#475569' }}>
                          {fmtDate(r.due_date)}
                        </span>
                        <AgingBadge bucket={r.aging_bucket} />
                      </td>
                      <td className="text-slate-900 dark:text-slate-100" style={{ padding: '10px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmtMoney(r.amount_original, r.currency_code)}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap',
                        color: Number(r.balance_amount_original) > 0 ? '#ef4444' : '#64748b' }}>
                        {fmtMoney(r.balance_amount_original, r.currency_code)}
                      </td>
                      <td style={{ padding: '10px 14px' }}><StatusChip status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', fontSize: 13 }}>
              <span>共 {invTotal} 条（第 {invPage} / {invTotalPages} 页）</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { const p = invPage - 1; setInvPage(p); loadInvoices(p); }}
                  disabled={invPage <= 1 || invLoading}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0',
                    background: '#fff', cursor: invPage <= 1 ? 'not-allowed' : 'pointer',
                    opacity: invPage <= 1 ? 0.4 : 1, display: 'flex', alignItems: 'center' }}>
                  <ChevronLeft size={14} />
                </button>
                <span style={{ padding: '0 8px' }}>{invPage} / {invTotalPages}</span>
                <button onClick={() => { const p = invPage + 1; setInvPage(p); loadInvoices(p); }}
                  disabled={invPage >= invTotalPages || invLoading}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0',
                    background: '#fff', cursor: invPage >= invTotalPages ? 'not-allowed' : 'pointer',
                    opacity: invPage >= invTotalPages ? 0.4 : 1, display: 'flex', alignItems: 'center' }}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Tab: 收款记录 ── */}
      {tab === 'receipts' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                  {['收款编号','客户','公司','收款日期','收款金额','方式','流水号','状态'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left',
                      fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}
                      className="text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recLoading && receipts.length === 0 ? (
                  <tr><td colSpan={8} className="text-slate-500 dark:text-slate-400" style={{ textAlign: 'center', padding: 40 }}>加载中…</td></tr>
                ) : receipts.length === 0 ? (
                  <tr><td colSpan={8} className="text-slate-500 dark:text-slate-400" style={{ textAlign: 'center', padding: 40 }}>
                    暂无收款记录。
                  </td></tr>
                ) : receipts.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9',
                    background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#10b981', whiteSpace: 'nowrap' }}>
                      {r.receipt_no}
                    </td>
                    <td className="text-slate-900 dark:text-slate-100" style={{ padding: '10px 14px', fontWeight: 600, maxWidth: 140 }}>
                      {r.customer_name}
                    </td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: '10px 14px' }}>{r.company_code}</td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtDate(r.receipt_date)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                      {fmtMoney(r.amount_original, r.currency_code)}
                    </td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: '10px 14px' }}>{r.receipt_method ?? '—'}</td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12 }}>
                      {r.bank_ref ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}><ReceiptStatusChip status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', fontSize: 13 }}>
            <span>共 {recTotal} 条</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { const p = recPage - 1; setRecPage(p); loadReceipts(p); }}
                disabled={recPage <= 1 || recLoading}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0',
                  background: '#fff', cursor: recPage <= 1 ? 'not-allowed' : 'pointer',
                  opacity: recPage <= 1 ? 0.4 : 1, display: 'flex' }}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ padding: '0 8px' }}>{recPage} / {recTotalPages}</span>
              <button onClick={() => { const p = recPage + 1; setRecPage(p); loadReceipts(p); }}
                disabled={recPage >= recTotalPages || recLoading}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0',
                  background: '#fff', cursor: recPage >= recTotalPages ? 'not-allowed' : 'pointer',
                  opacity: recPage >= recTotalPages ? 0.4 : 1, display: 'flex' }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: 账龄分析 ── */}
      {tab === 'aging' && (
        <div>
          {agingLoading ? (
            <div className="text-slate-500 dark:text-slate-400" style={{ textAlign: 'center', padding: 40 }}>加载中…</div>
          ) : !aging ? null : (
            <>
              {/* 汇总桶 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 10, marginBottom: 20 }}>
                {[
                  { key: 'NOT_DUE',  label: '未到期',     value: aging.buckets?.NOT_DUE  ?? 0, color: '#059669' },
                  { key: '0_30',     label: '逾期≤30天',  value: aging.buckets?.['0_30']  ?? 0, color: '#f59e0b' },
                  { key: '31_60',    label: '逾期31-60天', value: aging.buckets?.['31_60'] ?? 0, color: '#ea580c' },
                  { key: '61_90',    label: '逾期61-90天', value: aging.buckets?.['61_90'] ?? 0, color: '#dc2626' },
                  { key: '90_PLUS',  label: '逾期>90天',  value: aging.buckets?.['90_PLUS']?? 0, color: '#991b1b' },
                ].map(b => (
                  <div key={b.key} className="bg-white dark:bg-slate-800"
                    style={{ borderRadius: 10, padding: '12px 14px',
                      border: `1.5px solid ${b.color}30`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                    <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: 11, marginBottom: 4 }}>{b.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: b.color }}>
                      {b.value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>

              {/* 客户明细 */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                style={{ borderRadius: 12, overflow: 'hidden' }}>
                <div className="border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                  style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>
                  客户账龄明细（截至 {new Date().toLocaleDateString('zh-CN')}）
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                        {['客户','币种','未到期','≤30天','31-60天','61-90天','>90天','合计'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'right',
                            fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                            ...(h === '客户' ? { textAlign: 'left' } : {}) }}
                            className="text-slate-500 dark:text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(aging.byCustomer ?? []).length === 0 ? (
                        <tr><td colSpan={8} className="text-slate-500 dark:text-slate-400" style={{ textAlign: 'center', padding: 30 }}>暂无账龄数据</td></tr>
                      ) : (aging.byCustomer ?? []).map((row: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9',
                          background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }} className="text-slate-900 dark:text-slate-100">
                            {row.customer_name ?? '—'}
                            {row.customer_code && <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: 10 }}>{row.customer_code}</div>}
                          </td>
                          <td className="text-slate-500 dark:text-slate-400" style={{ padding: '8px 12px', textAlign: 'right' }}>{row.currency_code}</td>
                          {['not_due','bucket_0_30','bucket_31_60','bucket_61_90','bucket_90_plus','total_balance'].map(k => (
                            <td key={k} style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace',
                              color: k === 'total_balance' ? '#0f172a' : (Number(row[k] ?? 0) > 0 && k !== 'not_due' ? '#dc2626' : '#475569'),
                              fontWeight: k === 'total_balance' ? 700 : 400 }}>
                              {Number(row[k] ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 模态框 */}
      {showCreate && (
        <CreateArModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { loadInvoices(1); loadSummary(); }}
        />
      )}
      {showReceipt && (
        <CreateReceiptModal
          onClose={() => setShowReceipt(false)}
          onCreated={() => { loadReceipts(1); loadSummary(); setTab('receipts'); }}
        />
      )}
      {selectedInvId && (
        <ArDetailDrawer
          invoiceId={selectedInvId}
          onClose={() => setSelectedInvId(null)}
          onChanged={() => { loadInvoices(invPage); loadSummary(); }}
        />
      )}
    </div>
  );
}
