'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wallet, RefreshCw, AlertTriangle, CreditCard, CheckCircle, Clock, Ban } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/PageHeader';
import { StatusBadge, LoadingSkeleton } from '@/components/design-system';
import { CashAccountSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { currencySymbol } from '@/lib/currency';
import {
  hasSufficientReimbursementBalance,
  normalizeCashAccountPayment,
  type CashAccountPaymentLike,
} from '@/lib/reimbursement-payment';

import {
  primaryActionButton, secondaryActionButton, modalMask, modalPanel, inputField, formLabel,
  drawerMask, drawerPanel, drawerHeader, drawerHeaderTitle, drawerCloseButton, drawerFooter,
  inlineBadge, pillBadge,
  searchToolbar, toolbarFilterPill,
  tableContainer,
  // g200a 模板 token(2026-06-19)
  MONO_FONT, kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  actionPill, moneyCell, inlineAlert,
} from '@/components/design-system/cockpit-styles';
// ── 类型 ─────────────────────────────────────────────────────────────────────
import u from "@/styles/uix-utils.module.css";
interface Reimbursement {
  id: number;
  reimb_no: string;
  expense_request_id: number;
  expense_no: string;
  employee_name: string;
  company_code: string;
  company_name: string;
  currency_code: string;
  reimb_amount_original: string;
  reimb_amount_base: string;
  cash_account_code: string | null;
  payment_txn_id: string | null;
  status: string;
  created_at: string;
  expense_type?: string;
  expense_date?: string;
}
interface CashAccount extends CashAccountPaymentLike {
  id: number;
  accountCode?: string;
  accountName?: string;
}
interface ReimbSummary {
  totalReimb: number;
  pendingReimb: number;
  approvedReimb: number;
  paidReimb: number;
  paidToday: number;
  paidAmountToday: number;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── 常量 ─────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  label: string;
  accentBg: string;
  accentIcon: string;
  icon: React.ElementType;
}> = {
  PENDING: {
    label: '待付款',
    accentBg: 'bg-warning/10',
    accentIcon: 'text-amber-500',
    icon: Clock
  },
  PENDING_APPROVAL: {
    label: '审批中',
    accentBg: 'bg-warning/10',
    accentIcon: 'text-amber-500',
    icon: Clock
  },
  APPROVED: {
    label: '已审批',
    accentBg: 'bg-success/10',
    accentIcon: 'text-emerald-500',
    icon: CheckCircle
  },
  PAID: {
    label: '已付款',
    accentBg: 'bg-indigo-50 dark:bg-indigo-900/20',
    accentIcon: 'text-indigo-500',
    icon: CreditCard
  },
  CANCELLED: {
    label: '已取消',
    accentBg: 'bg-bg-muted',
    accentIcon: 'text-text-dim',
    icon: Ban
  }
};
function fmt(n: string | number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ── 子组件：付款弹窗 ──────────────────────────────────────────────────────────

function PayModal({
  reimb,
  onClose,
  onPaid
}: {
  reimb: Reimbursement;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { t } = useLanguage();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedAccRaw, setSelectedAccRaw] = useState<CashAccount | null>(null);
  const [remark, setRemark] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const pay = async () => {
    if (!selectedAccount) {
      setError(t('fin2.reimburse.select_pay_account','请选择付款账户'));
      return;
    }
    setPaying(true);
    setError('');
    try {
      await apiFetch(`/api/v2/finance/expenses/reimbursements/${reimb.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          cashAccountId: selectedAccount,
          remark: remark || undefined
        })
      });
      onPaid();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('fin2.reimburse.pay_failed','付款失败'));
    } finally {
      setPaying(false);
    }
  };
  const selected = selectedAccRaw;
  const normalizedSelected = normalizeCashAccountPayment(selected);
  const balanceEnough = hasSufficientReimbursementBalance(
    selected,
    reimb.reimb_amount_original,
  );
  return <div style={modalMask} onClick={onClose}>
      <div style={modalPanel(420)} onClick={e => e.stopPropagation()}>
        <div className="text-text" style={{
        fontWeight: 800,
        fontSize: 16,
        marginBottom: 6
      }}>{t('fin2.reimburse.execute_pay','执行付款')}</div>
        <div className="text-text-muted" style={{
        fontSize: 13,
        marginBottom: 20
      }}>{t('fin2.reimburse.reimb_no','报销单号')}：{reimb.reimb_no}</div>

        <div className="bg-warning/10 border border-warning/20" style={{
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 20
      }}>
          <div className="text-amber-800 dark:text-amber-300" style={{
          fontSize: 13,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums'
        }}>
            {currencySymbol(reimb.currency_code)}{fmt(reimb.reimb_amount_original)}
          </div>
          <div className="text-warning" style={{
          fontSize: 12,
          marginTop: 2,
          fontVariantNumeric: 'tabular-nums'
        }}>
            ¥{fmt(reimb.reimb_amount_base)}（{t('fin2.reimburse.base_currency','基准货币')}）
          </div>
        </div>

        <div className={u.mb14}>
          <div className="text-text-muted" style={{
          fontSize: 12,
          marginBottom: 6
        }}>{t('fin2.reimburse.pay_account','付款账户')} *</div>
          {/* G4-A：资金账户主数据(仅 ACTIVE)，value=id；选中后自动带出余额并校验 */}
          <CashAccountSelector
            value={selectedAccount}
            valueField="id"
            currencyCode={reimb.currency_code}
            companyCode={reimb.company_code}
            onChange={setSelectedAccount}
            onPick={o => setSelectedAccRaw((o?.raw ?? null) as CashAccount | null)}
          />
          {selected && <div className={`text-xs font-semibold mt-1.5 ${balanceEnough ? 'text-emerald-600 dark:text-emerald-400' : 'text-danger'}`}>
              {balanceEnough ? t('fin2.reimburse.balance_enough','✓ 余额充足') : t('fin2.reimburse.balance_insufficient','✗ 余额不足')}
              {normalizedSelected && ` · ${currencySymbol(normalizedSelected.currencyCode || reimb.currency_code)}${fmt(normalizedSelected.currentBalance)}`}
            </div>}
        </div>

        <div className={u.mb14}>
          <div className="text-text-muted" style={{
          fontSize: 12,
          marginBottom: 6
        }}>{t('fin2.common.remark','备注')}</div>
          <input value={remark} onChange={e => setRemark(e.target.value)} placeholder={t('fin2.reimburse.optional_fill','选填')} className="px-3 py-1.5 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 w-full" style={{
          boxSizing: 'border-box'
        }} />
        </div>

        {error && <div style={{ ...inlineAlert('danger'), marginBottom: 12 }}>{error}</div>}
        <div style={drawerFooter}>
          <button onClick={onClose} style={secondaryActionButton}>{t('fin2.common.cancel','取消')}</button>
          <button onClick={() => void pay()} disabled={paying || !selectedAccount || !balanceEnough} style={{ ...primaryActionButton, opacity: (paying || !selectedAccount || !balanceEnough) ? 0.5 : 1, cursor: (paying || !selectedAccount || !balanceEnough) ? 'not-allowed' : 'pointer' }}>
            {paying ? t('fin2.reimburse.paying','付款中...') : t('fin2.reimburse.confirm_pay','确认付款')}
          </button>
        </div>
      </div>
    </div>;
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function ReimbursementsPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<Reimbursement[]>([]);
  const [summary, setSummary] = useState<ReimbSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [payTarget, setPayTarget] = useState<Reimbursement | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const pageSize = 20;
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize)
      });
      if (statusFilter) params.set('status', statusFilter);
      const [list, sum] = await Promise.allSettled([apiFetch<{
        data: Reimbursement[];
        total: number;
      }>(`/api/v2/finance/expenses/reimbursements?${params}`), apiFetch<ReimbSummary>('/api/v2/finance/expenses/reimbursements/summary')]);
      if (list.status === 'fulfilled') {
        setItems(list.value.data);
        setTotal(list.value.total);
      }
      if (sum.status === 'fulfilled') setSummary(sum.value);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('fin2.common.load_failed','加载失败'));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);
  useEffect(() => {
    void load();
  }, [load]);
  const actionPost = async (id: number, path: string, body: Record<string, unknown> = {}) => {
    setActingId(id);
    try {
      await apiFetch(`/api/v2/finance/expenses/reimbursements/${id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('fin2.common.op_failed','操作失败'));
    } finally {
      setActingId(null);
    }
  };
  return <div>
      <PageHeader title={t('fin2.reimburse.page_title','报销管理')} subtitle={t('fin2.reimburse.page_subtitle','报销台账 · 付款审批 · 资金账户联动')} breadcrumb={[t('fin2.common.finance_mgmt','财务管理'), t('fin2.reimburse.page_title','报销管理')]} actions={<button onClick={() => void load()} disabled={loading} style={secondaryActionButton}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> {t('fin2.common.refresh','刷新')}
          </button>} />

      {/* g200a KPI 6 卡(2026-06-19):Tailwind 浅色背景 → kpiCardCompact token */}
      {summary && <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10,
        marginBottom: 20,
      }}>
        {([
          { label: t('fin2.reimburse.kpi_total','报销总数'),      value: String(summary.totalReimb),                tone: 'brand'   as const },
          { label: t('fin2.reimburse.status_pending','待付款'),        value: String(summary.pendingReimb),              tone: 'warning' as const },
          { label: t('fin2.common.approved','已审批'),        value: String(summary.approvedReimb),             tone: 'success' as const },
          { label: t('fin2.reimburse.status_paid','已付款'),        value: String(summary.paidReimb),                 tone: 'brand'   as const },
          { label: t('fin2.reimburse.kpi_paid_today_count','今日付款笔数'),  value: String(summary.paidToday) + ' ' + t('fin2.common.count_unit','笔'),         tone: 'success' as const },
          { label: t('fin2.reimburse.kpi_paid_today_amount','今日付款金额'),  value: `¥ ${fmt(summary.paidAmountToday)}`,       tone: 'success' as const },
        ]).map(c => (
          <div key={c.label} style={kpiCardCompact(c.tone)}>
            <div style={kpiCardCompactLabel}>{c.label}</div>
            <div style={kpiCardCompactValue(c.tone)}>{c.value}</div>
          </div>
        ))}
      </div>}

      {/* 筛选 工具栏 */}
      <div style={searchToolbar}>
        <select value={statusFilter} onChange={e => {
        setStatusFilter(e.target.value);
        setPage(1);
      }} style={{ ...inputField, width: 'auto', padding: '6px 12px', fontSize: 13 }}>
          <option value="">{t('fin2.reimburse.all_status','全部状态')}</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{t(`fin2.reimburse.status_cfg.${k}`, v.label)}</option>)}
        </select>
      </div>

      {error && <div style={{ ...inlineAlert('danger'), marginBottom: 12 }}>
        <AlertTriangle size={13} />{error}
      </div>}

      {/* 列表 */}
      <div style={tableContainer}>
        {loading && <div style={{ padding: 20 }}><LoadingSkeleton variant="table" rows={10} cols={5} /></div>}
        {!loading && items.length === 0 && <div className="text-text-muted" style={{
        padding: 40,
        textAlign: 'center'
      }}>
            <Wallet size={32} style={{
          marginBottom: 8,
          opacity: 0.4
        }} />
            <div>{t('fin2.reimburse.empty','暂无报销记录')}</div>
          </div>}
        {!loading && items.map((item, i) => {
        const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.PENDING;
        const isActing = actingId === item.id;
        return <div key={item.id} className={`border-b border-border/30 transition-colors ${i % 2 !== 0 ? 'bg-bg-muted/20' : ''}`} style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 14
        }}>
              <div className={`${cfg.accentBg} rounded-xl flex items-center justify-center flex-shrink-0`} style={{
            width: 36,
            height: 36
          }}>
                <cfg.icon size={16} className={cfg.accentIcon} />
              </div>
              <div style={{
            flex: 1,
            minWidth: 0
          }}>
                <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 3
            }}>
                  <span className="text-text" style={{
                fontWeight: 700,
                fontSize: 14
              }}>{item.reimb_no}</span>
                  <StatusBadge status={item.status} />
                </div>
                <div className="text-text-muted" style={{
              fontSize: 12,
              display: 'flex',
              gap: 12
            }}>
                  <span>{item.employee_name}</span>
                  <span>{item.expense_no}</span>
                  <span>{item.company_name ?? item.company_code}</span>
                </div>
                {item.cash_account_code && <div className="text-indigo-500 dark:text-indigo-400" style={{
              fontSize: 11,
              marginTop: 2
            }}>{t('fin2.reimburse.pay_account','付款账户')}：{item.cash_account_code}</div>}
              </div>
              <div style={{
            textAlign: 'right',
            flexShrink: 0,
            marginRight: 12
          }}>
                <div className="text-text" style={{
              fontWeight: 800,
              fontSize: 15,
              fontVariantNumeric: 'tabular-nums'
            }}>{currencySymbol(item.currency_code)}{fmt(item.reimb_amount_original)}</div>
                <div className={`text-text-muted ${u.fs11}`}>{new Date(item.created_at).toLocaleDateString('zh-CN')}</div>
              </div>
              {/* 操作按钮 */}
              <div style={{
            display: 'flex',
            gap: 6,
            flexShrink: 0
          }}>
                {['PENDING', 'APPROVED'].includes(item.status) && <button onClick={() => setPayTarget(item)} disabled={isActing} style={primaryActionButton}>
                    {t('fin2.common.payment','付款')}
                  </button>}
                {item.status === 'PENDING' && <button onClick={() => void actionPost(item.id, 'approve-direct')} disabled={isActing} style={actionPill('success', isActing)}>
                    {t('fin2.reimburse.approve_direct','直接审批')}
                  </button>}
                {['PENDING', 'APPROVED'].includes(item.status) && <button onClick={() => void actionPost(item.id, 'cancel')} disabled={isActing} style={actionPill('danger', isActing)}>
                    {t('fin2.common.cancel','取消')}
                  </button>}
              </div>
            </div>;
      })}
      </div>

      {/* 分页 */}
      {total > pageSize && <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: 8,
      marginTop: 16,
      alignItems: 'center'
    }}>
          {page > 1 && <button onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-sm px-3 py-1.5">
              {t('fin2.reimburse.prev_page','上一页')}
            </button>}
          <span className="text-text-muted" style={{
        fontSize: 13,
        padding: '6px 14px'
      }}>{t('fin2.reimburse.page_label','第')} {page} {t('fin2.reimburse.page_unit','页')} / {t('fin2.common.total','共')} {Math.ceil(total / pageSize)} {t('fin2.reimburse.page_unit','页')}</span>
          {page * pageSize < total && <button onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-sm px-3 py-1.5">
              {t('fin2.reimburse.next_page','下一页')}
            </button>}
        </div>}

      {/* 付款弹窗 */}
      {payTarget && <PayModal reimb={payTarget} onClose={() => setPayTarget(null)} onPaid={() => {
      setPayTarget(null);
      void load();
    }} />}
    </div>;
}
