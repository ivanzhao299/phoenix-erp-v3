'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { TrendingDown, Clock, CheckCircle, Wallet, Search, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, Filter, Plus, Download, X, ChevronDown, AlertCircle, Ban } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { StatusBadge, LoadingSkeleton } from '@/components/design-system';
import { usePermission } from '@/hooks/usePermission'; // G23-A 子 menu 分流
import s from "@/components/ui/admin-ui.module.css";
import { DictSelect } from '@/components/shared-selectors/DictSelect';
import { CompanySelector, SupplierSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { useLanguage } from '@/contexts/LanguageContext';
import { getApInvoiceStatusLabel } from '@/lib/finance-ap-status';

import {
  primaryActionButton, secondaryActionButton, modalMask, modalPanel, inputField, formLabel,
  drawerMask, drawerPanel, drawerHeader, drawerHeaderTitle, drawerCloseButton, drawerFooter,
  inlineBadge, pillBadge,
  searchToolbar, toolbarFilterPill, toolbarSearchInput,
  tableContainer, tablePagination,
  tabBar, tabItem, kpiCard,
  // g200a 模板 token(2026-06-19)
  MONO_FONT, actionPill, moneyCell,
  detailInfoBox, recordRow, inlineAlert, actionGroupBox,
} from '@/components/design-system/cockpit-styles';
// ── 类型 ─────────────────────────────────────────────────────────────────────
import u from "@/styles/uix-utils.module.css";
import { currencySymbol } from '@/lib/currency';
import { buildFinanceApPaymentPrefillHref } from '@/lib/finance-ap-payment-prefill';
interface ApInvoice {
  id: string;
  ap_no: string;
  source_type: string;
  source_no: string | null;
  company_code: string;
  company_name: string | null;
  project_code: string | null;
  project_name: string | null;
  supplier_code: string | null;
  supplier_name: string;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency_code: string;
  amount_original: string;
  paid_amount_original: string;
  balance_amount_original: string;
  status: string;
  payment_status: string;
  aging_bucket: string;
  remark: string | null;
  created_at: string;
}
interface ApAllocation {
  id: string;
  alloc_no: string;
  amount_original: string;
  currency_code: string;
  payment_date: string;
  payment_method: string | null;
  reference_no: string | null;
  remark: string | null;
}
interface ApDetail extends ApInvoice {
  allocations: ApAllocation[];
}
interface ApSummary {
  source: string;
  total_invoices: number;
  open_invoices: number;
  partial_invoices: number;
  paid_invoices: number;
  overdue_invoices: number;
  total_amount_original: string;
  paid_amount_original: string;
  balance_amount_original: string;
  overdue_balance: string;
  byCurrency: {
    currency_code: string;
    amount: string;
    balance: string;
    count: number;
  }[];
  byStatus: {
    status: string;
    count: number;
    amount: string;
  }[];
  asOf: string;
}
interface ImportResult {
  source: string;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...opts?.headers
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body;
}
function fmtMoney(val: string | number | null | undefined, currency = 'CNY') {
  const n = Number(val ?? 0);
  const sym = currencySymbol(currency);
  return `${sym}${n.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
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

const AGING_MAP: Record<string, {
  label: string;
  colorClass: string;
}> = {
  NOT_DUE: {
    label: '未到期',
    colorClass: 'text-emerald-600 dark:text-emerald-400'
  },
  '0_30': {
    label: '逾期 ≤30天',
    colorClass: 'text-warning'
  },
  '31_60': {
    label: '逾期 31-60天',
    colorClass: 'text-orange-600 dark:text-orange-400'
  },
  '61_90': {
    label: '逾期 61-90天',
    colorClass: 'text-danger'
  },
  '90_PLUS': {
    label: '逾期 >90天',
    colorClass: 'text-red-800 dark:text-red-300'
  }
};
const SOURCE_MAP: Record<string, {
  label: string;
  colorClass: string;
}> = {
  MANUAL: {
    label: '手工',
    colorClass: 'text-indigo-700 dark:text-indigo-300'
  },
  PO: {
    label: '采购订单',
    colorClass: 'text-cyan-700 dark:text-cyan-300'
  },
  EXPENSE: {
    label: '费用',
    colorClass: 'text-amber-700 dark:text-amber-300'
  },
  REIMBURSEMENT: {
    label: '报销',
    colorClass: 'text-violet-700 dark:text-violet-300'
  },
  OPENING: {
    label: '期初',
    colorClass: 'text-text-muted'
  }
};
function AgingBadge({
  bucket
}: {
  bucket: string;
}) {
  const { t } = useLanguage();
  const cfg = AGING_MAP[bucket] ?? {
    label: bucket,
    colorClass: 'text-text-muted'
  };
  if (bucket === 'NOT_DUE') return null;
  return <span className={`text-[10px] font-bold ml-1 ${cfg.colorClass}`}>
      [{AGING_MAP[bucket] ? t(`fin2.ap.aging_${bucket.toLowerCase()}`, cfg.label) : cfg.label}]
    </span>;
}
function SourceBadge({
  type
}: {
  type: string;
}) {
  const { t } = useLanguage();
  const cfg = SOURCE_MAP[type] ?? {
    label: type,
    colorClass: 'text-text-muted'
  };
  return <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap bg-current/[0.08] ${cfg.colorClass}`}>
      {SOURCE_MAP[type] ? t(`fin2.ap.source_${type.toLowerCase()}`, cfg.label) : cfg.label}
    </span>;
}

function ApInvoiceStatusBadge({
  status,
  size = 'sm',
}: {
  status: string;
  size?: 'sm' | 'md';
}) {
  const { t } = useLanguage();
  return <StatusBadge status={status} label={getApInvoiceStatusLabel(status, t)} size={size} />;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  loading
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  loading: boolean;
}) {
  return <div style={kpiCard}>
      <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{
      fontSize: 22,
      fontWeight: 800,
      color: 'var(--text-primary)',
      lineHeight: 1.2,
      marginTop: 2
    }}>
        {loading ? '…' : value}
      </div>
      {sub && !loading && <div style={{
      fontSize: 11,
      color: 'var(--text-secondary)',
      marginTop: 'auto'
    }}>{sub}</div>}
    </div>;
}

// ── Modal 通用 input className ────────────────────────────────────────────────

// ── 创建 AP Modal ─────────────────────────────────────────────────────────────

interface CreateForm {
  companyCode: string;
  companyName: string;
  supplierCode: string;
  supplierName: string;
  currencyCode: string;
  amountOriginal: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  remark: string;
}
function CreateModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<CreateForm>({
    companyCode: '',
    companyName: '',
    supplierCode: '',
    supplierName: '',
    currencyCode: 'CNY',
    amountOriginal: '',
    invoiceNo: '',
    invoiceDate: '',
    dueDate: '',
    remark: ''
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof CreateForm, v: string) => setForm(f => ({
    ...f,
    [k]: v
  }));
  const handleSubmit = async () => {
    if (!form.companyCode.trim()) {
      setErr(t('fin2.ap.err_select_company', '请选择公司'));
      return;
    }
    if (!form.supplierName.trim()) {
      setErr(t('fin2.ap.err_select_supplier', '请选择供应商'));
      return;
    }
    if (!form.amountOriginal || isNaN(Number(form.amountOriginal)) || Number(form.amountOriginal) <= 0) {
      setErr(t('fin2.ap.err_valid_amount', '请填写有效的发票金额'));
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await apiFetch('/api/v2/finance/ap/invoices', {
        method: 'POST',
        body: JSON.stringify({
          companyCode: form.companyCode.trim(),
          companyName: form.companyName.trim() || undefined,
          supplierCode: form.supplierCode.trim() || undefined,
          supplierName: form.supplierName.trim(),
          currencyCode: form.currencyCode,
          amountOriginal: Number(form.amountOriginal),
          invoiceNo: form.invoiceNo.trim() || undefined,
          invoiceDate: form.invoiceDate || undefined,
          dueDate: form.dueDate || undefined,
          remark: form.remark.trim() || undefined
        })
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setErr(e.message ?? t('fin2.common.create_failed', '创建失败'));
    } finally {
      setSaving(false);
    }
  };
  return <div style={modalMask} onClick={onClose}>
      <div style={modalPanel(480)} onClick={e => e.stopPropagation()}>
        <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
      }}>
          <div className="text-text" style={{
          fontWeight: 700,
          fontSize: 16
        }}>{t('fin2.ap.create_title', '新建应付发票')}</div>
          <button onClick={onClose} className="bg-transparent border-0 cursor-pointer p-1">
            <X size={18} className="text-text-dim" />
          </button>
        </div>

        <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
          <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12
        }}>
            <div>
              <label style={formLabel}>
                {t('fin2.common.company', '公司')} <span className="text-red-500">*</span>
              </label>
              {/* G4-A：公司主数据(org_units COMPANY)，DataScope 自动过滤 */}
              <CompanySelector value={form.companyCode} onChange={v => set('companyCode', v)} onPick={o => set('companyName', o?.label ?? '')} />
            </div>
            <div>
              <label style={formLabel}>
                {t('fin2.ap.currency', '货币')} <span className="text-red-500">*</span>
              </label>
              {/* G4-A：货币枚举来自 sys_dict(SYS_CURRENCY) */}
              <DictSelect dictType="SYS_CURRENCY" value={form.currencyCode} onChange={v => set('currencyCode', v)} allowEmpty={false} />
            </div>
          </div>

          <div>
            <label style={formLabel}>
              {t('fin2.common.supplier', '供应商')} <span className="text-red-500">*</span>
            </label>
            {/* G4-A：从供应商主数据(仅ACTIVE)选择，自动带出名称 */}
            <SupplierSelector value={form.supplierCode} onChange={v => set('supplierCode', v)} onPick={o => set('supplierName', o?.raw?.name ?? o?.label ?? '')} />
          </div>

          <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12
        }}>
            <div>
              <label style={formLabel}>
                {t('fin2.ap.invoice_amount', '发票金额')} <span className="text-red-500">*</span>
              </label>
              <input style={inputField} type="number" min="0" step="0.01" value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={formLabel}>
                {t('fin2.ap.invoice_no', '发票号')}
              </label>
              <input style={inputField} value={form.invoiceNo} onChange={e => set('invoiceNo', e.target.value)} placeholder={t('fin2.common.optional', '可选')} />
            </div>
          </div>

          <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12
        }}>
            <div>
              <label style={formLabel}>
                {t('fin2.ap.invoice_date', '发票日期')}
              </label>
              <input style={inputField} type="date" value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} />
            </div>
            <div>
              <label style={formLabel}>
                {t('fin2.ap.due_date', '到期日')}
              </label>
              <input style={inputField} type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
            </div>
          </div>

          <div>
            <label style={formLabel}>
              {t('fin2.common.remark', '备注')}
            </label>
            <textarea style={{ ...inputField, resize: 'none',
            height: 60 }} value={form.remark} onChange={e => set('remark', e.target.value)} placeholder={t('fin2.common.optional', '可选')} />
          </div>

          {err && <div style={inlineAlert('danger')}><AlertCircle size={13} /> {err}</div>}

          <div style={drawerFooter}>
            <button onClick={onClose} style={secondaryActionButton}>{t('fin2.common.cancel', '取消')}</button>
            <button onClick={handleSubmit} disabled={saving} style={{ ...primaryActionButton, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? t('fin2.common.creating', '创建中…') : t('fin2.ap.confirm_create', '确认创建')}
            </button>
          </div>
        </div>
      </div>
    </div>;
}

// ── 详情侧抽屉 ────────────────────────────────────────────────────────────────

function DetailDrawer({
  invoiceId,
  onClose,
  onCancelled
}: {
  invoiceId: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { t } = useLanguage();
  const { canCreate: canCreatePayment, hasAccess: canViewPayment } = usePermission('MENU_PRC2_PAYMENT');
  const [detail, setDetail] = useState<ApDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelErr, setCancelErr] = useState('');
  useEffect(() => {
    setLoading(true);
    apiFetch<ApDetail>(`/api/v2/finance/ap/invoices/${invoiceId}`).then(setDetail).catch(() => {}).finally(() => setLoading(false));
  }, [invoiceId]);
  const handleCancel = async () => {
    setCancelling(true);
    setCancelErr('');
    try {
      await apiFetch(`/api/v2/finance/ap/invoices/${invoiceId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          reason: cancelReason
        })
      });
      onCancelled();
      onClose();
    } catch (e: any) {
      setCancelErr(e.message ?? t('fin2.ap.cancel_failed', '取消失败'));
    } finally {
      setCancelling(false);
    }
  };
  const canCancel = detail && !['PAID', 'CANCELLED'].includes(detail.status) && Number(detail.paid_amount_original) === 0;
  const canStartPayment = detail && ['OPEN', 'PARTIALLY_PAID'].includes(detail.status) && Number(detail.balance_amount_original) > 0;
  const paymentHref = detail ? buildFinanceApPaymentPrefillHref({
    apId: detail.id,
    apNo: detail.ap_no,
    companyCode: detail.company_code,
    companyName: detail.company_name,
    projectCode: detail.project_code,
    projectName: detail.project_name,
    supplierCode: detail.supplier_code,
    supplierName: detail.supplier_name,
    currencyCode: detail.currency_code,
    balanceAmountOriginal: detail.balance_amount_original,
    sourceNo: detail.source_no,
  }) : '';
  /* g200a DetailDrawer 整体改造(2026-06-19):同 ar/ArDetailDrawer 模式 */
  return <div style={drawerMask} onClick={onClose}>
      <div style={drawerPanel(480)} onClick={e => e.stopPropagation()}>
        <div style={drawerHeader}>
          <div style={drawerHeaderTitle}>{t('fin2.ap.detail_title', '应付发票详情')}</div>
          <button onClick={onClose} style={drawerCloseButton}><X size={18} /></button>
        </div>

        {loading && <div className="text-text-muted" style={{ textAlign: 'center', padding: 40 }}>{t('fin2.common.loading', '加载中…')}</div>}

        {!loading && detail && <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 基本信息块 */}
            <div style={detailInfoBox}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 13, color: 'var(--status-info)' }}>
                  {detail.ap_no}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <SourceBadge type={detail.source_type} />
                  <ApInvoiceStatusBadge status={detail.status} size="sm" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                {[[t('fin2.common.supplier', '供应商'), detail.supplier_name], [t('fin2.common.company', '公司'), detail.company_code + (detail.company_name ? ` ${detail.company_name}` : '')], [t('fin2.ap.invoice_no', '发票号'), detail.invoice_no ?? '—'], [t('fin2.ap.invoice_date', '发票日期'), fmtDate(detail.invoice_date)], [t('fin2.ap.due_date', '到期日'), fmtDate(detail.due_date)], [t('fin2.common.project', '项目'), detail.project_code ?? '—'], [t('fin2.ap.source_no', '来源单号'), detail.source_no ?? '—'], [t('fin2.common.remark', '备注'), detail.remark ?? '—']].map(([k, v]) => (
                  <div key={k}>
                    <span className="text-text-muted">{k}：</span>
                    <span className={`text-text ${u.fw500}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3 金额卡 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {([
                { label: t('fin2.ap.invoice_amount', '发票金额'), value: fmtMoney(detail.amount_original,         detail.currency_code), tone: 'default' as const },
                { label: t('fin2.ap.paid_amount', '已付金额'), value: fmtMoney(detail.paid_amount_original,    detail.currency_code), tone: 'success' as const },
                { label: t('fin2.ap.balance_due', '待付余额'), value: fmtMoney(detail.balance_amount_original, detail.currency_code), tone: (Number(detail.balance_amount_original) > 0 ? 'danger' : 'default') as 'danger' | 'default' },
              ]).map(item => (
                <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div className="text-text-muted" style={{ fontSize: 11, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ ...moneyCell(item.tone, 'md'), display: 'block', textAlign: 'center' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* 账龄告警 */}
            {detail.aging_bucket !== 'NOT_DUE' && (
              <div style={inlineAlert('danger')}>
                <AlertTriangle size={13} /> {t('fin2.common.aging', '账龄')}：{AGING_MAP[detail.aging_bucket] ? t(`fin2.ap.aging_${detail.aging_bucket.toLowerCase()}`, AGING_MAP[detail.aging_bucket].label) : detail.aging_bucket}
              </div>
            )}

            {/* 付款核销记录 */}
            <div>
              <div className="text-text-muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                {t('fin2.ap.payment_records', '付款核销记录')}（{detail.allocations.length} {t('fin2.common.rows_unit', '条')}）
              </div>
              {detail.allocations.length === 0 ? (
                <div className="text-text-muted" style={{ textAlign: 'center', padding: '12px 0', fontSize: 12 }}>{t('fin2.ap.no_payment_records', '暂无付款记录')}</div>
              ) : detail.allocations.map(a => (
                <div key={a.id} style={recordRow('success')}>
                  <div>
                    <div style={{ fontFamily: MONO_FONT, color: 'var(--status-success)', fontWeight: 600, marginBottom: 2 }}>{a.alloc_no}</div>
                    <div className="text-text-muted" style={{ fontSize: 11 }}>
                      {fmtDate(a.payment_date)}
                      {a.payment_method && <span> · {a.payment_method}</span>}
                      {a.reference_no && <span> · {a.reference_no}</span>}
                    </div>
                  </div>
                  <div style={moneyCell('success', 'md')}>{fmtMoney(a.amount_original, a.currency_code)}</div>
                </div>
              ))}
            </div>

            {/* 付款入口 */}
            {canStartPayment && (
              <div style={actionGroupBox}>
                {canCreatePayment ? (
                  <Link
                    href={paymentHref}
                    style={{
                      ...actionPill('brand'),
                      width: '100%',
                      justifyContent: 'center',
                      textDecoration: 'none',
                    }}
                  >
                    <Wallet size={12} /> {t('fin2.ap.start_payment', '发起付款')}
                  </Link>
                ) : canViewPayment ? (
                  <div style={inlineAlert('warning')}>
                    <AlertCircle size={13} /> {t('fin2.ap.payment_create_denied', '当前账号可查看付款管理，但缺少新建付款单权限。')}
                  </div>
                ) : (
                  <div style={inlineAlert('warning')}>
                    <AlertCircle size={13} /> {t('fin2.ap.payment_menu_denied', '当前账号缺少付款管理权限，请联系管理员发起付款。')}
                  </div>
                )}
              </div>
            )}

            {/* 取消区域 */}
            {canCancel && (
              <div style={actionGroupBox}>
                {!showCancel ? (
                  <button onClick={() => setShowCancel(true)} style={actionPill('danger')}>
                    <Ban size={11} /> {t('fin2.ap.cancel_invoice', '取消应付发票')}
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--status-danger)', marginBottom: 8 }}>{t('fin2.ap.confirm_cancel_invoice', '确认取消应付发票')}</div>
                    <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder={t('fin2.ap.cancel_reason_ph', '取消原因（可选）')} style={{ ...inputField, height: 56, resize: 'none', fontFamily: 'inherit' }} />
                    {cancelErr && <div style={{ fontSize: 12, color: 'var(--status-danger)', marginTop: 4 }}>{cancelErr}</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setShowCancel(false); setCancelErr(''); }} style={actionPill('default')}>{t('fin2.common.discard', '放弃')}</button>
                      <button onClick={handleCancel} disabled={cancelling} style={actionPill('danger', cancelling)}>
                        {cancelling ? t('fin2.common.processing', '处理中…') : t('fin2.ap.confirm_cancel', '确认取消')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {detail.status === 'CANCELLED' && (
              <div style={inlineAlert('warning')}>
                <Ban size={13} /> {t('fin2.ap.invoice_cancelled', '此应付发票已取消')}
              </div>
            )}
          </div>}
      </div>
    </div>;
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function Finance2ApPage() {
  // 对齐后端守卫:fin-ap.controller 所有写操作守卫父码 MENU_FIN2_AP:E,子码 _MASTER 后端从不校验。
  //   FE 用子码门控会"按钮可见却 403 / 隐藏却放行",故 gate 对齐到父码 MENU_FIN2_AP。
  const { canCreate: canCreateAp } = usePermission('MENU_FIN2_AP');
  const { t } = useLanguage();
  const [records, setRecords] = useState<ApInvoice[]>([]);
  const [summary, setSummary] = useState<ApSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [sumLoading, setSumLoading] = useState(true);
  const [error, setError] = useState('');

  // 筛选
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // 模态框 / 侧抽屉
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 导入状态
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const buildQuery = useCallback((p = page) => {
    const q = new URLSearchParams({
      page: String(p),
      pageSize: String(pageSize)
    });
    if (status) q.set('status', status);
    if (paymentStatus) q.set('paymentStatus', paymentStatus);
    if (sourceType) q.set('sourceType', sourceType);
    if (keyword) q.set('keyword', keyword);
    return q.toString();
  }, [page, pageSize, status, paymentStatus, sourceType, keyword]);
  const loadList = useCallback(async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{
        items: ApInvoice[];
        total: number;
        page: number;
        pageSize: number;
      }>(`/api/v2/finance/ap/invoices?${buildQuery(p)}`);
      setRecords(res.items);
      setTotal(res.total);
      setPage(res.page);
    } catch (e: any) {
      setError(e.message ?? t('fin2.common.load_failed', '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);
  const loadSummary = useCallback(async () => {
    setSumLoading(true);
    try {
      const sum = await apiFetch<ApSummary>('/api/v2/finance/ap/summary');
      setSummary(sum);
    } catch {} finally {
      setSumLoading(false);
    }
  }, []);
  useEffect(() => {
    loadList(1);
  }, [status, paymentStatus, sourceType, keyword]);
  useEffect(() => {
    loadSummary();
  }, []);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const handleSearch = () => {
    setKeyword(searchInput.trim());
    setPage(1);
  };
  const handleStatusFilter = (s: string) => {
    setStatus(p => p === s ? '' : s);
    setPage(1);
  };
  const handleImport = async () => {
    if (!confirm(t('fin2.ap.import_confirm', '将从 prc2_ap_ledger 幂等导入历史应付数据，已存在的记录会跳过。确认执行？'))) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await apiFetch<ImportResult>('/api/v2/finance/ap/import-from-prc2', {
        method: 'POST'
      });
      setImportResult(result);
      await Promise.all([loadList(1), loadSummary()]);
    } catch (e: any) {
      setError(e.message ?? t('fin2.ap.import_failed', '导入失败'));
    } finally {
      setImporting(false);
    }
  };
  return <div>
      <PageHeader title={t('fin2.ap.page_title', '应付账款管理')} subtitle={t('fin2.ap.page_subtitle', '供应商应付账款 · 付款核销 · 账龄分析')} breadcrumb={[t('fin2.common.finance_mgmt', '财务管理'), t('fin2.ap.breadcrumb', '应付账款')]} actions={<div style={{
      display: 'flex',
      gap: 8
    }}>
            <button onClick={handleImport} disabled={importing} style={secondaryActionButton}>
              <Download size={13} />
              {importing ? t('fin2.ap.importing', '导入中…') : t('fin2.ap.import_from_po', '从采购单导入')}
            </button>
            <button onClick={() => { loadList(page); loadSummary(); }} disabled={loading} style={secondaryActionButton}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> {t('fin2.common.refresh', '刷新')}
            </button>
            {canCreateAp && (
              <button onClick={() => setShowCreate(true)} style={primaryActionButton}>
                <Plus size={13} /> {t('fin2.ap.create_title', '新建应付发票')}
              </button>
            )}
          </div>} />

      {/* 导入结果 */}
      {importResult && (
        <div style={{ ...inlineAlert(importResult.failed > 0 ? 'warning' : 'success'), justifyContent: 'space-between', marginBottom: 16 }}>
          <span>
            {t('fin2.ap.import_done', '导入完成')}：{t('fin2.common.total', '共')} {importResult.total} {t('fin2.common.rows_unit', '条')}，{t('fin2.ap.import_success', '成功')} {importResult.imported}，
            {t('fin2.ap.import_skipped', '跳过')} {importResult.skipped}，{t('fin2.ap.import_failed_n', '失败')} {importResult.failed}
          </span>
          <button onClick={() => setImportResult(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI 汇总 */}
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 12,
      marginBottom: 22
    }}>
        <KpiCard label={t('fin2.ap.kpi_total', '应付账单总数')} value={String(summary?.total_invoices ?? '—')} icon={TrendingDown} color="var(--color-accent)" loading={sumLoading} />
        <KpiCard label={t('fin2.ap.kpi_open', '待付（未付）')} value={String(summary?.open_invoices ?? '—')} icon={Clock} color="var(--status-warning)" loading={sumLoading} />
        <KpiCard label={t('fin2.ap.kpi_partial', '部分付款')} value={String(summary?.partial_invoices ?? '—')} icon={TrendingDown} color="var(--status-info)" loading={sumLoading} />
        <KpiCard label={t('fin2.ap.kpi_paid', '已付清')} value={String(summary?.paid_invoices ?? '—')} icon={CheckCircle} color="var(--status-success)" loading={sumLoading} />
        <KpiCard label={t('fin2.ap.kpi_overdue', '逾期笔数')} value={String(summary?.overdue_invoices ?? '—')} icon={AlertTriangle} color="var(--status-danger)" loading={sumLoading} />
        <KpiCard label={t('fin2.ap.kpi_balance', '待付余额（综合）')} value={summary?.byCurrency?.[0] ? fmtMoney(summary.balance_amount_original, summary.byCurrency[0]?.currency_code) : sumLoading ? '…' : '¥0.00'} sub={(summary?.byCurrency?.length ?? 0) > 1 ? `${summary!.byCurrency.length} ${t('fin2.common.currencies_unit', '个币种')}` : undefined} icon={Wallet} color="var(--status-danger)" loading={sumLoading} />
      </div>

      {/* 筛选 + 搜索 工具栏 */}
      <div style={searchToolbar}>
        <Filter size={14} color="var(--text-secondary)" />

        {[{
        key: 'OPEN',
        label: t('fin2.ap.filter_open', '未付')
      }, {
        key: 'PARTIALLY_PAID',
        label: t('fin2.ap.kpi_partial', '部分付款')
      }, {
        key: 'PAID',
        label: t('fin2.ap.kpi_paid', '已付清')
      }, {
        key: 'DISPUTED',
        label: t('fin2.ap.filter_disputed', '争议中')
      }, {
        key: 'CANCELLED',
        label: t('fin2.common.cancelled', '已取消')
      }].map(sItem => (
        <button key={sItem.key} onClick={() => handleStatusFilter(sItem.key)} style={toolbarFilterPill(status === sItem.key)}>
          {sItem.label}
        </button>
      ))}

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        <select value={sourceType} onChange={e => {
        setSourceType(e.target.value);
        setPage(1);
      }} style={{ ...inputField, width: 'auto', padding: '6px 10px', fontSize: 12 }}>
          <option value="">{t('fin2.ap.source_all', '全部来源')}</option>
          <option value="MANUAL">{t('fin2.ap.source_manual', '手工')}</option>
          <option value="PO">{t('fin2.ap.source_po', '采购订单')}</option>
          <option value="EXPENSE">{t('fin2.ap.source_expense', '费用')}</option>
          <option value="OPENING">{t('fin2.common.opening', '期初')}</option>
        </select>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder={t('fin2.ap.search_ph', '应付编号 / 供应商 / 发票号…')} style={toolbarSearchInput} />
          <button onClick={handleSearch} style={primaryActionButton}>
            <Search size={13} /> {t('fin2.common.search', '搜索')}
          </button>
        </div>
      </div>

      {error && <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 mb-4 text-sm text-danger flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>}

      {/* 表格 */}
      <div style={tableContainer}>
        <div className={u.scrollX}>
          <table className={s.table}>
            <thead>
              <tr>
                {[['ap_no', '应付编号'], ['source', '来源'], ['supplier', '供应商'], ['company', '公司'], ['invoice_date', '发票日期'], ['due_date', '到期日'], ['invoice_amount', '发票金额'], ['balance_due', '待付余额'], ['status', '状态']].map(([k, h]) => <th key={k} className={u.nowrap}>{t(`fin2.ap.col_${k}`, h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && records.length === 0 ? <tr><td colSpan={9} style={{
                padding: 16
              }}><LoadingSkeleton variant="table" rows={10} cols={9} /></td></tr> : records.length === 0 ? <tr><td colSpan={9} className="text-text-muted" style={{
                textAlign: 'center',
                padding: 40
              }}>
                  {t('fin2.ap.empty', '暂无应付记录。')}
                  {!status && !keyword && <span> {t('fin2.ap.empty_hint_1', '可点击')} <strong>{t('fin2.ap.import_from_po', '从采购单导入')}</strong> {t('fin2.ap.empty_hint_2', '迁移历史数据，或')} <strong>{t('fin2.ap.create_title', '新建应付发票')}</strong>。</span>}
                </td></tr> : records.map((r, i) => <tr key={r.id} onClick={() => setSelectedId(r.id)} className={`border-b border-border/30 cursor-pointer hover:bg-indigo-50 hover:bg-bg-muted/50 transition-colors ${i % 2 === 0 ? '' : 'bg-bg-muted/20'}`}>
                  <td className={`font-mono text-indigo-600 dark:text-indigo-400 ${u.nowrap}`}>
                    {r.ap_no}
                  </td>
                  <td>
                    <SourceBadge type={r.source_type} />
                  </td>
                  <td style={{
                maxWidth: 160
              }}>
                    <div className={`text-text ${u.fw600}`}>{r.supplier_name}</div>
                    {r.supplier_code && <div className={`text-text-muted ${u.fs11}`}>{r.supplier_code}</div>}
                  </td>
                  <td className={`text-text-muted ${u.nowrap}`}>
                    {r.company_code}
                  </td>
                  <td className={`text-text-muted ${u.nowrap}`}>
                    {fmtDate(r.invoice_date)}
                  </td>
                  <td className={u.nowrap}>
                    <span className={isOverdue(r.due_date, r.status) ? 'text-danger' : 'text-text-muted'}>
                      {fmtDate(r.due_date)}
                    </span>
                    <AgingBadge bucket={r.aging_bucket} />
                  </td>
                  <td className={`text-text ${u.nowrap}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtMoney(r.amount_original, r.currency_code)}
                  </td>
                  <td className={`${Number(r.balance_amount_original) > 0 ? 'text-danger' : 'text-text-muted'} ${u.nowrap}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtMoney(r.balance_amount_original, r.currency_code)}
                  </td>
                  <td>
                    <ApInvoiceStatusBadge status={r.status} size="sm" />
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <div style={tablePagination}>
          <span>{t('fin2.common.total', '共')} {total} {t('fin2.common.rows_unit', '条')}（{t('fin2.common.page_no', '第')} {page} / {totalPages} {t('fin2.common.page_unit', '页')}）</span>
          <div className={u.flexRow}>
            <button onClick={() => {
            const p = page - 1;
            setPage(p);
            loadList(p);
          }} disabled={page <= 1 || loading} className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center cursor-pointer"><ChevronLeft size={14} /></button>
            <span style={{
            padding: '0 8px'
          }}>{page} / {totalPages}</span>
            <button onClick={() => {
            const p = page + 1;
            setPage(p);
            loadList(p);
          }} disabled={page >= totalPages || loading} className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center cursor-pointer"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* 创建 Modal */}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => {
      loadList(1);
      loadSummary();
    }} />}

      {/* 详情侧抽屉 */}
      {selectedId && <DetailDrawer invoiceId={selectedId} onClose={() => setSelectedId(null)} onCancelled={() => {
      loadList(page);
      loadSummary();
    }} />}
    </div>;
}
