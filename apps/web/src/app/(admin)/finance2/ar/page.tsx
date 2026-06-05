'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Clock, CheckCircle, Wallet, Search, RefreshCw,
  AlertTriangle, ChevronLeft, ChevronRight, Filter, Plus,
  X, AlertCircle, Ban, Receipt,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { StatusBadge } from '@/components/design-system';
import s from "@/components/ui/admin-ui.module.css";
import { DictSelect } from '@/components/shared-selectors/DictSelect';
import { CompanySelector, CustomerSelector, CashAccountSelector } from '@/components/shared-selectors/MasterDataSelectors';

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

// ── 账龄/来源 辅助组件（无背景色，仅文字色或 opacity tint）──────────────────

const AGING_MAP: Record<string, { label: string; colorClass: string }> = {
  NOT_DUE:  { label: '未到期',     colorClass: 'text-emerald-600 dark:text-emerald-400' },
  '0_30':   { label: '逾期≤30天',  colorClass: 'text-warning' },
  '31_60':  { label: '逾期31-60',  colorClass: 'text-orange-600 dark:text-orange-400' },
  '61_90':  { label: '逾期61-90',  colorClass: 'text-danger' },
  '90_PLUS':{ label: '逾期>90天',  colorClass: 'text-red-800 dark:text-red-300' },
};

const SOURCE_MAP: Record<string, { label: string; colorClass: string }> = {
  MANUAL:      { label: '手工',    colorClass: 'text-emerald-700 dark:text-emerald-300' },
  SALES_ORDER: { label: '销售订单', colorClass: 'text-blue-700 dark:text-blue-300' },
  CONTRACT:    { label: '合同',    colorClass: 'text-violet-700 dark:text-violet-300' },
  OPENING:     { label: '期初',    colorClass: 'text-text-muted' },
};

function AgingBadge({ bucket }: { bucket: string }) {
  const cfg = AGING_MAP[bucket];
  if (!cfg || bucket === 'NOT_DUE') return null;
  return (
    <span className={`text-[10px] font-bold ml-1 ${cfg.colorClass}`}>
      [{cfg.label}]
    </span>
  );
}

function SourceBadge({ type }: { type: string }) {
  const cfg = SOURCE_MAP[type] ?? { label: type, colorClass: 'text-text-muted' };
  // 用 opacity-based background tint
  return (
    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap
      bg-current/[0.08] ${cfg.colorClass}`}>
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
      style={{ borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', minHeight: 112, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon size={15} color={color} />
        <span className="text-text-muted" style={{ fontSize: 11 }}>{label}</span>
      </div>
      <div className="text-text" style={{ fontSize: 17, fontWeight: 800 }}>{loading ? '…' : value}</div>
      {sub && !loading && <div className="text-text-muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Modal 通用 input className ────────────────────────────────────────────────

const INP_CLASS = 'w-full px-3 py-2 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 dark:focus:border-emerald-500 box-border';

// ── 创建 AR Modal ─────────────────────────────────────────────────────────────

function CreateArModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    companyCode: '', companyName: '', customerCode: '', customerName: '', currencyCode: 'CNY',
    amountOriginal: '', invoiceNo: '', invoiceDate: '', dueDate: '', remark: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.companyCode.trim()) { setErr('请选择公司'); return; }
    if (!form.customerName.trim()) { setErr('请选择客户'); return; }
    if (!form.amountOriginal || Number(form.amountOriginal) <= 0) { setErr('请填写有效的发票金额'); return; }
    setSaving(true); setErr('');
    try {
      await apiFetch('/api/v2/finance/ar/invoices', {
        method: 'POST',
        body: JSON.stringify({
          companyCode:    form.companyCode.trim(),
          companyName:    form.companyName.trim() || undefined,
          customerCode:   form.customerCode.trim() || undefined,
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="bg-bg-card"
        style={{ borderRadius: 16, width: 480, maxWidth: '95vw', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="text-text" style={{ fontWeight: 700, fontSize: 16 }}>新建应收发票</div>
          <button onClick={onClose} className="bg-transparent border-0 cursor-pointer p-0">
            <X size={18} className="text-text-dim" />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">
                公司 <span className="text-red-500">*</span>
              </label>
              {/* G4-A：从 org_units(COMPANY) 主数据加载，DataScope 自动过滤 */}
              <CompanySelector value={form.companyCode}
                onChange={v => set('companyCode', v)}
                onPick={o => set('companyName', o?.label ?? '')} />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">货币</label>
              {/* G4-A：货币枚举来自 sys_dict(SYS_CURRENCY) */}
              <DictSelect dictType="SYS_CURRENCY" value={form.currencyCode} onChange={v => set('currencyCode', v)} allowEmpty={false} />
            </div>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-text-muted">
              客户 <span className="text-red-500">*</span>
            </label>
            {/* G4-A：从客户主数据(仅ACTIVE)选择，自动带出名称 */}
            <CustomerSelector value={form.customerCode}
              onChange={v => set('customerCode', v)}
              onPick={o => set('customerName', o?.raw?.name ?? o?.label ?? '')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">
                发票金额 <span className="text-red-500">*</span>
              </label>
              <input className={INP_CLASS} type="number" min="0" step="0.01"
                value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">发票号</label>
              <input className={INP_CLASS} value={form.invoiceNo} onChange={e => set('invoiceNo', e.target.value)} placeholder="可选" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">发票日期</label>
              <input className={INP_CLASS} type="date" value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">到期日</label>
              <input className={INP_CLASS} type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-text-muted">备注</label>
            <textarea className={INP_CLASS} style={{ resize: 'none', height: 56 }} value={form.remark} onChange={e => set('remark', e.target.value)} />
          </div>
          {err && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2">
              <AlertCircle size={13} /> {err}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border bg-bg-page text-sm text-text-muted cursor-pointer hover:bg-bg-muted transition-colors">
              取消
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className={`px-4 py-2 rounded-lg border-0 text-sm font-semibold text-white cursor-pointer transition-colors ${saving ? 'bg-emerald-300 dark:bg-emerald-700 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
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
    companyName:  selectedAr?.company_name  ?? '',
    customerName: selectedAr?.customer_name ?? '',
    customerCode: selectedAr?.customer_code ?? '',
    currencyCode: selectedAr?.currency_code ?? 'CNY',
    amountOriginal: selectedAr ? selectedAr.balance_amount_original : '',
    receiptDate:  new Date().toISOString().slice(0, 10),
    receiptMethod: '', receivedAccountCode: '', bankRef: '', remark: '',
  });
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.companyCode.trim()) { setErr('请选择公司'); return; }
    if (!form.customerName.trim()) { setErr('请选择客户'); return; }
    if (!form.receiptDate) { setErr('请选择收款日期'); return; }
    if (!form.amountOriginal || Number(form.amountOriginal) <= 0) { setErr('请填写有效收款金额'); return; }
    setSaving(true); setErr('');
    try {
      const receipt = await apiFetch<any>('/api/v2/finance/ar/receipts', {
        method: 'POST',
        body: JSON.stringify({
          companyCode:   form.companyCode.trim(),
          companyName:   form.companyName.trim() || undefined,
          customerName:  form.customerName.trim(),
          customerCode:  form.customerCode.trim() || undefined,
          currencyCode:  form.currencyCode,
          amountOriginal: Number(form.amountOriginal),
          receiptDate:   form.receiptDate,
          receiptMethod: form.receiptMethod || undefined,
          receivedAccountCode: form.receivedAccountCode || undefined,
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="bg-bg-card"
        style={{ borderRadius: 16, width: 500, maxWidth: '95vw', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="text-text" style={{ fontWeight: 700, fontSize: 16 }}>
            {selectedAr ? `录入收款 — ${selectedAr.ar_no}` : '新建收款'}
          </div>
          <button onClick={onClose} className="bg-transparent border-0 cursor-pointer p-0">
            <X size={18} className="text-text-dim" />
          </button>
        </div>
        {selectedAr && (
          <div className="bg-success/10 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2.5 mb-4 text-xs text-emerald-700 dark:text-emerald-300">
            <strong>{selectedAr.customer_name}</strong>｜
            余额 <strong>{fmtMoney(selectedAr.balance_amount_original, selectedAr.currency_code)}</strong>
            {selectedAr.due_date && ` · 到期 ${fmtDate(selectedAr.due_date)}`}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">公司 *</label>
              {/* G4-A：公司主数据，DataScope 自动过滤 */}
              <CompanySelector value={form.companyCode}
                onChange={v => set('companyCode', v)}
                onPick={o => set('companyName', o?.label ?? '')} />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">货币</label>
              <DictSelect dictType="SYS_CURRENCY" value={form.currencyCode} onChange={v => set('currencyCode', v)} allowEmpty={false} />
            </div>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-text-muted">客户 *</label>
            {/* G4-A：客户主数据，自动带出名称 */}
            <CustomerSelector value={form.customerCode}
              onChange={v => set('customerCode', v)}
              onPick={o => set('customerName', o?.raw?.name ?? o?.label ?? '')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">收款金额 *</label>
              <input className={INP_CLASS} type="number" min="0.01" step="0.01"
                value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)} />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">收款日期 *</label>
              <input className={INP_CLASS} type="date" value={form.receiptDate} onChange={e => set('receiptDate', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">收款方式</label>
              {/* G4-A：收款方式枚举来自 sys_dict(FIN_RECEIPT_METHOD) */}
              <DictSelect dictType="FIN_RECEIPT_METHOD" value={form.receiptMethod} onChange={v => set('receiptMethod', v)} placeholder="请选择收款方式" />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-text-muted">收款账户</label>
              {/* G4-A：从资金账户主数据(仅ACTIVE)选择，value=account_code */}
              <CashAccountSelector value={form.receivedAccountCode}
                onChange={v => set('receivedAccountCode', v)}
                currencyCode={form.currencyCode} />
            </div>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-text-muted">银行流水号</label>
            <input className={INP_CLASS} value={form.bankRef} onChange={e => set('bankRef', e.target.value)} placeholder="可选" />
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-text-muted">备注</label>
            <textarea className={INP_CLASS} style={{ resize: 'none', height: 52 }} value={form.remark} onChange={e => set('remark', e.target.value)} />
          </div>
          {selectedAr && (
            <div className="bg-info/10 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              提交后将自动核销到 <strong>{selectedAr.ar_no}</strong>（草稿 → 立即确认）
            </div>
          )}
          {err && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2">
              <AlertCircle size={13} /> {err}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border bg-bg-page text-sm text-text-muted cursor-pointer hover:bg-bg-muted transition-colors">
              取消
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className={`px-4 py-2 rounded-lg border-0 text-sm font-semibold text-white cursor-pointer transition-colors ${saving ? 'bg-emerald-300 dark:bg-emerald-700 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
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
      <div className="bg-bg-card"
        style={{ width: 480, maxWidth: '95vw', height: '100%', overflowY: 'auto',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.12)', padding: 28,
          display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="text-text" style={{ fontWeight: 700, fontSize: 16 }}>AR 发票详情</div>
          <button onClick={onClose} className="bg-transparent border-0 cursor-pointer p-0">
            <X size={18} className="text-text-dim" />
          </button>
        </div>

        {loading && <div className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>加载中…</div>}

        {!loading && detail && (
          <>
            {/* 基本信息 */}
            <div className="bg-bg-muted" style={{ borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono text-sm">
                  {detail.ar_no}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <SourceBadge type={detail.source_type} />
                  <StatusBadge status={detail.status} size="sm" />
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
                { label: '已收金额', value: fmtMoney(detail.received_amount_original, detail.currency_code), colorClass: 'text-emerald-600 dark:text-emerald-400' },
                { label: '待收余额', value: fmtMoney(detail.balance_amount_original, detail.currency_code),
                  colorClass: Number(detail.balance_amount_original) > 0 ? 'text-danger' : 'text-text-muted' },
              ].map(item => (
                <div key={item.label} className="bg-bg-page border border-border"
                  style={{ borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
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

            {/* 收款核销记录 */}
            <div>
              <div className="text-text-muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                收款核销记录（{detail.allocations.length} 条）
              </div>
              {detail.allocations.length === 0 ? (
                <div className="text-text-muted" style={{ textAlign: 'center', padding: '12px 0', fontSize: 12 }}>暂无收款记录</div>
              ) : detail.allocations.map(a => (
                <div key={a.id} className="bg-success/10 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2.5 text-xs mb-1.5">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{a.receipt_no}</span>
                    <span className="font-bold text-emerald-800 dark:text-emerald-200">
                      {fmtMoney(a.allocated_amount_original, a.currency_code)}
                    </span>
                  </div>
                  <div className="text-text-muted">
                    {fmtDate(a.receipt_date)}
                    {a.receipt_method && <span> · {a.receipt_method}</span>}
                    {a.bank_ref && <span> · {a.bank_ref}</span>}
                    <span className="ml-1.5"><StatusBadge status={a.receipt_status} size="sm" /></span>
                  </div>
                </div>
              ))}
            </div>

            {/* 录入收款 */}
            {!['RECEIVED','CANCELLED','WRITTEN_OFF'].includes(detail.status) &&
              Number(detail.balance_amount_original) > 0 && (
              <div>
                {!showReceipt ? (
                  <button onClick={() => setShowReceipt(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-success/10 text-sm text-emerald-700 dark:text-emerald-300 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                    <Receipt size={13} /> 录入收款
                  </button>
                ) : (
                  <div className="bg-success/10 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3.5">
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
              <div className="border border-orange-200 dark:border-orange-800 rounded-xl p-3.5 bg-orange-50 dark:bg-orange-900/20">
                {!showCancel ? (
                  <button onClick={() => setShowCancel(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-danger/20 bg-bg-card text-sm text-danger cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Ban size={13} /> 取消此 AR 发票
                  </button>
                ) : (
                  <div>
                    <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-2">确认取消 AR 发票</div>
                    <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                      placeholder="取消原因（可选）"
                      className="w-full h-14 px-2.5 py-2 rounded-lg border border-danger/20 bg-bg-page text-xs text-text resize-none outline-none box-border" />
                    {cancelErr && <div className="text-xs text-danger mt-1">{cancelErr}</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-bg-card text-sm text-text-muted hover:bg-bg-muted cursor-pointer transition-colors">
              <RefreshCw size={13} style={{ animation: invLoading ? 'spin 1s linear infinite' : 'none' }} />
              刷新
            </button>
            <button onClick={() => setShowReceipt(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-success/10 text-sm font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
              <Receipt size={13} /> 录入收款
            </button>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-0 bg-emerald-500 text-sm font-semibold text-white cursor-pointer hover:bg-emerald-600 transition-colors">
              <Plus size={13} /> 新建 AR
            </button>
          </div>
        }
      />

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 10, marginBottom: 20 }}>
        <KpiCard label="应收账单总数" value={String(summary?.total_invoices ?? '—')}
          icon={TrendingUp} color="var(--status-success)" loading={sumLoading} />
        <KpiCard label="未收款" value={String(summary?.open_invoices ?? '—')}
          icon={Clock} color="var(--status-warning)" loading={sumLoading} />
        <KpiCard label="部分收款" value={String(summary?.partial_invoices ?? '—')}
          icon={TrendingUp} color="var(--status-info)" loading={sumLoading} />
        <KpiCard label="已收清" value={String(summary?.received_invoices ?? '—')}
          icon={CheckCircle} color="var(--status-success)" loading={sumLoading} />
        <KpiCard label="逾期笔数" value={String(summary?.overdue_invoices ?? '—')}
          icon={AlertTriangle} color="var(--status-danger)" loading={sumLoading} />
        <KpiCard label="待收余额"
          value={summary?.byCurrency?.[0]
            ? fmtMoney(summary.balance_amount_original, summary.byCurrency[0].currency_code)
            : (sumLoading ? '…' : '—')}
          sub={(summary?.byCurrency?.length ?? 0) > 1 ? `${summary!.byCurrency.length} 个币种` : undefined}
          icon={Wallet} color="var(--status-danger)" loading={sumLoading} />
      </div>

      {/* Tabs */}
      <div className="border-b-2 border-border flex gap-0 mb-4">
        {([
          { key: 'invoices', label: '应收账单' },
          { key: 'receipts', label: '收款记录' },
          { key: 'aging',    label: '账龄分析' },
        ] as { key: TabKey; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 cursor-pointer transition-colors bg-transparent border-x-0 border-t-0 -mb-0.5 ${
              tab === t.key
                ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500'
                : 'text-text-muted border-transparent hover:text-text dark:hover:text-slate-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: 应收账单 ── */}
      {tab === 'invoices' && (
        <>
          {/* 筛选 */}
          <div className="bg-bg-card border border-border flex gap-2 flex-wrap items-center mb-3 px-3.5 py-2.5 rounded-xl">
            <Filter size={14} className="text-text-dim" />
            {[
              { key: 'OPEN',               label: '未收款' },
              { key: 'PARTIALLY_RECEIVED', label: '部分收款' },
              { key: 'RECEIVED',           label: '已收清' },
              { key: 'OVERDUE',            label: '已逾期' },
              { key: 'CANCELLED',          label: '已取消' },
            ].map(s => (
              <button key={s.key} onClick={() => { setStatus(p => p === s.key ? '' : s.key); setInvPage(1); }}
                className={`px-3 py-1 rounded-full text-xs cursor-pointer font-medium transition-colors border-0 ${
                  status === s.key
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-bg-muted text-text-muted hover:bg-bg-muted dark:hover:bg-slate-600'
                }`}>
                {s.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (setKeyword(searchInput.trim()), setInvPage(1))}
                placeholder="AR编号 / 客户 / 发票号…"
                className="px-3 py-1.5 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 dark:focus:border-emerald-500 w-52" />
              <button onClick={() => { setKeyword(searchInput.trim()); setInvPage(1); }}
                className="px-3 py-1.5 rounded-lg text-sm bg-emerald-500 text-white border-0 cursor-pointer hover:bg-emerald-600 flex items-center gap-1 transition-colors">
                <Search size={13} /> 搜索
              </button>
            </div>
          </div>

          {invError && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-3 text-sm text-danger flex items-center gap-2">
              <AlertTriangle size={14} /> {invError}
            </div>
          )}

          {/* 表格 */}
          <div className="bg-bg-card border border-border"
            style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className={s.table}>
                <thead>
                  <tr>
                    {['AR编号','来源','客户','公司','发票日期','到期日','发票金额','待收余额','状态'].map(h => (
                      <th key={h} style={{ whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invLoading && invoices.length === 0 ? (
                    <tr><td colSpan={9} className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>加载中…</td></tr>
                  ) : invoices.length === 0 ? (
                    <tr><td colSpan={9} className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>
                      暂无 AR 记录。可点击 <strong>新建 AR</strong> 手工录入。
                    </td></tr>
                  ) : invoices.map((r, i) => (
                    <tr key={r.id} onClick={() => setSelectedInvId(r.id)}
                      className={`border-b border-border/30 cursor-pointer hover:bg-emerald-50 hover:bg-bg-muted/50 transition-colors ${i % 2 === 0 ? '' : 'bg-bg-muted/20'}`}>
                      <td style={{ whiteSpace: 'nowrap' }}
                        className="font-mono text-emerald-600 dark:text-emerald-400">
                        {r.ar_no}
                      </td>
                      <td><SourceBadge type={r.source_type} /></td>
                      <td style={{ maxWidth: 150 }}>
                        <div className="text-text" style={{ fontWeight: 600 }}>{r.customer_name}</div>
                        {r.customer_code && <div className="text-text-muted" style={{ fontSize: 11 }}>{r.customer_code}</div>}
                      </td>
                      <td className="text-text-muted" style={{ whiteSpace: 'nowrap' }}>{r.company_code}</td>
                      <td className="text-text-muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.invoice_date)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className={isOverdue(r.due_date, r.status) ? 'text-danger' : 'text-text-muted'}>
                          {fmtDate(r.due_date)}
                        </span>
                        <AgingBadge bucket={r.aging_bucket} />
                      </td>
                      <td className="text-text" style={{ whiteSpace: 'nowrap' }}>
                        {fmtMoney(r.amount_original, r.currency_code)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}
                        className={Number(r.balance_amount_original) > 0 ? 'text-danger' : 'text-text-muted'}>
                        {fmtMoney(r.balance_amount_original, r.currency_code)}
                      </td>
                      <td><StatusBadge status={r.status} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border text-text-muted flex justify-between items-center px-4 py-3 text-sm">
              <span>共 {invTotal} 条（第 {invPage} / {invTotalPages} 页）</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { const p = invPage - 1; setInvPage(p); loadInvoices(p); }}
                  disabled={invPage <= 1 || invLoading}
                  className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center cursor-pointer">
                  <ChevronLeft size={14} />
                </button>
                <span style={{ padding: '0 8px' }}>{invPage} / {invTotalPages}</span>
                <button onClick={() => { const p = invPage + 1; setInvPage(p); loadInvoices(p); }}
                  disabled={invPage >= invTotalPages || invLoading}
                  className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center cursor-pointer">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Tab: 收款记录 ── */}
      {tab === 'receipts' && (
        <div className="bg-bg-card border border-border"
          style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className={s.table}>
              <thead>
                <tr>
                  {['收款编号','客户','公司','收款日期','收款金额','方式','流水号','状态'].map(h => (
                    <th key={h} style={{ whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recLoading && receipts.length === 0 ? (
                  <tr><td colSpan={8} className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>加载中…</td></tr>
                ) : receipts.length === 0 ? (
                  <tr><td colSpan={8} className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>
                    暂无收款记录。
                  </td></tr>
                ) : receipts.map((r, i) => (
                  <tr key={r.id}
                    className={`border-b border-border/30 ${i % 2 === 0 ? '' : 'bg-bg-muted/20'}`}>
                    <td style={{ whiteSpace: 'nowrap' }}
                      className="font-mono text-emerald-600 dark:text-emerald-400">
                      {r.receipt_no}
                    </td>
                    <td className="text-text" style={{ maxWidth: 140 }}>
                      {r.customer_name}
                    </td>
                    <td className="text-text-muted">{r.company_code}</td>
                    <td className="text-text-muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.receipt_date)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}
                      className="text-emerald-600 dark:text-emerald-400">
                      {fmtMoney(r.amount_original, r.currency_code)}
                    </td>
                    <td className="text-text-muted">{r.receipt_method ?? '—'}</td>
                    <td className="text-text-muted font-mono" style={{ fontSize: 12 }}>
                      {r.bank_ref ?? '—'}
                    </td>
                    <td><StatusBadge status={r.status} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border text-text-muted flex justify-between items-center px-4 py-3 text-sm">
            <span>共 {recTotal} 条</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { const p = recPage - 1; setRecPage(p); loadReceipts(p); }}
                disabled={recPage <= 1 || recLoading}
                className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center cursor-pointer">
                <ChevronLeft size={14} />
              </button>
              <span style={{ padding: '0 8px' }}>{recPage} / {recTotalPages}</span>
              <button onClick={() => { const p = recPage + 1; setRecPage(p); loadReceipts(p); }}
                disabled={recPage >= recTotalPages || recLoading}
                className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center cursor-pointer">
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
            <div className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>加载中…</div>
          ) : !aging ? null : (
            <>
              {/* 汇总桶 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 10, marginBottom: 20 }}>
                {[
                  { key: 'NOT_DUE',  label: '未到期',     value: aging.buckets?.NOT_DUE  ?? 0, colorClass: 'text-emerald-600 dark:text-emerald-400', borderColor: 'border-emerald-200 dark:border-emerald-800' },
                  { key: '0_30',     label: '逾期≤30天',  value: aging.buckets?.['0_30']  ?? 0, colorClass: 'text-warning',   borderColor: 'border-warning/20' },
                  { key: '31_60',    label: '逾期31-60天', value: aging.buckets?.['31_60'] ?? 0, colorClass: 'text-orange-600 dark:text-orange-400', borderColor: 'border-orange-200 dark:border-orange-800' },
                  { key: '61_90',    label: '逾期61-90天', value: aging.buckets?.['61_90'] ?? 0, colorClass: 'text-danger',       borderColor: 'border-danger/20' },
                  { key: '90_PLUS',  label: '逾期>90天',  value: aging.buckets?.['90_PLUS']?? 0, colorClass: 'text-red-800 dark:text-red-300',      borderColor: 'border-red-300 dark:border-red-700' },
                ].map(b => (
                  <div key={b.key} className={`bg-bg-card border ${b.borderColor} rounded-xl px-3.5 py-3 text-center`}
                    style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="text-text-muted text-xs mb-1">{b.label}</div>
                    <div className={`text-base font-extrabold ${b.colorClass}`}>
                      {b.value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>

              {/* 客户明细 */}
              <div className="bg-bg-card border border-border"
                style={{ borderRadius: 12, overflow: 'hidden' }}>
                <div className="border-b border-border text-text-muted px-4 py-3 text-sm font-semibold">
                  客户账龄明细（截至 {new Date().toLocaleDateString('zh-CN')}）
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        {['客户','币种','未到期','≤30天','31-60天','61-90天','>90天','合计'].map(h => (
                          <th key={h} style={{ whiteSpace: 'nowrap',
                            textAlign: h === '客户' ? 'left' : 'right' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(aging.byCustomer ?? []).length === 0 ? (
                        <tr><td colSpan={8} className="text-text-muted" style={{ textAlign: 'center', padding: 30 }}>暂无账龄数据</td></tr>
                      ) : (aging.byCustomer ?? []).map((row: any, i: number) => (
                        <tr key={i} className={`border-b border-border/30 ${i % 2 === 0 ? '' : 'bg-bg-muted/20'}`}>
                          <td className="text-text">
                            {row.customer_name ?? '—'}
                            {row.customer_code && <div className="text-text-muted" style={{ fontSize: 10 }}>{row.customer_code}</div>}
                          </td>
                          <td className="text-text-muted" style={{ textAlign: 'right' }}>{row.currency_code}</td>
                          {['not_due','bucket_0_30','bucket_31_60','bucket_61_90','bucket_90_plus','total_balance'].map(k => (
                            <td key={k} style={{ textAlign: 'right', fontFamily: 'monospace',
                              fontWeight: k === 'total_balance' ? 700 : 400 }}
                              className={k === 'total_balance'
                                ? 'text-text'
                                : (Number(row[k] ?? 0) > 0 && k !== 'not_due'
                                  ? 'text-danger'
                                  : 'text-text-muted')}>
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
