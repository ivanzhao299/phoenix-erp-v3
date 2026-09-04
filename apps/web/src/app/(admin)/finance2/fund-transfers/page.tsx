'use client';

import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import { ArrowLeftRight, Plus, Search, RefreshCw, X, CheckCircle, Clock, AlertCircle, Send, Play } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { CashAccountSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { invalidateCashAccountLookups } from '@/lib/request-cache';
import { usePermission } from '@/hooks/usePermission';
import { currencySymbol } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { LoadingSkeleton } from '@/components/design-system';

import {
  primaryActionButton, secondaryActionButton, modalMask, modalPanel, inputField, formLabel,
  drawerMask, drawerPanel, drawerHeader, drawerHeaderTitle, drawerCloseButton, drawerFooter,
  inlineBadge, pillBadge,
  searchToolbar, toolbarFilterPill, toolbarSearchInput,
  tableContainer,
  // g200a 模板 token(2026-06-19)
  actionPill, inlineAlert,
} from '@/components/design-system/cockpit-styles';
// ── Auth helper ───────────────────────────────────────────────────────────────
function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || '';
}
function authHeaders(extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
    ...extra
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

interface FundTransfer {
  id: string;
  transferNo: string;
  fromAccountId: string;
  fromAccountCode: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountCode: string;
  toAccountName: string;
  companyCode: string;
  companyName: string | null;
  currencyCode: string;
  amountOriginal: string | number;
  exchangeRate: string | number;
  status: string;
  remark: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
interface CashAccount {
  id: string;
  accountCode: string;
  accountName: string;
  currencyCode: string;
  currentBalance: string | number;
  status: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const API = '/api/v2/finance/cash';
const STATUS_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  badgeClass: string;
}> = {
  DRAFT: {
    label: '草稿',
    badgeClass: 'bg-bg-muted text-text-muted',
    icon: <Clock size={12} />
  },
  PENDING_APPROVAL: {
    label: '待审批',
    badgeClass: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
    icon: <AlertCircle size={12} />
  },
  APPROVED: {
    label: '已审批',
    badgeClass: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
    icon: <CheckCircle size={12} />
  },
  EXECUTED: {
    label: '已执行',
    badgeClass: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300',
    icon: <CheckCircle size={12} />
  },
  CANCELLED: {
    label: '已取消',
    badgeClass: 'bg-bg-muted text-text-dim',
    icon: <X size={12} />
  }
};
function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0.00';
  return Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function LocalStatusBadge({
  status
}: {
  status: string;
}) {
  const { t } = useLanguage();
  const c = STATUS_CONFIG[status] ?? {
    label: status,
    badgeClass: 'bg-bg-muted text-text-muted',
    icon: null
  };
  const label = STATUS_CONFIG[status] ? t(`fin2.transfers.status_${status.toLowerCase()}`, c.label) : c.label;
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.badgeClass}`}>
      {c.icon}{label}
    </span>;
}

// ── Create Transfer Modal ─────────────────────────────────────────────────────

function CreateTransferModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amountOriginal: '',
    remark: ''
  });
  const [fromAcc, setFromAcc] = useState<CashAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm(f => ({
    ...f,
    [k]: v
  }));
  async function submit() {
    if (!form.fromAccountId) {
      setErr(t('fin2.transfers.select_from','请选择转出账户'));
      return;
    }
    if (!form.toAccountId) {
      setErr(t('fin2.transfers.select_to','请选择转入账户'));
      return;
    }
    if (form.fromAccountId === form.toAccountId) {
      setErr(t('fin2.transfers.same_account','转出和转入账户不能相同'));
      return;
    }
    if (!form.amountOriginal || Number(form.amountOriginal) <= 0) {
      setErr(t('fin2.transfers.fill_amount','请填写转账金额'));
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const r = await fetch(`${API}/transfers`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          fromAccountId: form.fromAccountId,
          toAccountId: form.toAccountId,
          amountOriginal: Number(form.amountOriginal),
          remark: form.remark.trim() || undefined
        })
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.message ?? t('fin2.common.create_failed','创建失败'));
      }
      onCreated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('fin2.common.create_failed','创建失败'));
    } finally {
      setSaving(false);
    }
  }
  const selectClass = "w-full px-3 py-2 rounded-lg text-sm border border-border bg-bg-page text-text outline-none focus:border-emerald-400 box-border";
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
        }}>{t('fin2.transfers.create_title','新建资金转账')}</div>
          <button onClick={onClose} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer'
        }}>
            <X size={18} className="text-text-dim" />
          </button>
        </div>

        {err && <div style={{ ...inlineAlert('danger'), marginBottom: 14 }}>{err}</div>}

        <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>{t('fin2.transfers.from_account','转出账户')} <span className="text-red-500">*</span></div>
            {/* G4-A：资金账户主数据(仅 ACTIVE)，value=id；onPick 同步带出账户币种/余额 */}
            <CashAccountSelector value={form.fromAccountId} valueField="id" onChange={v => set('fromAccountId', v)} onPick={o => setFromAcc((o?.raw ?? null) as CashAccount | null)} />
          </div>

          {fromAcc && <div className="bg-info/10 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              {t('fin2.transfers.current_balance','当前余额')}：{currencySymbol(fromAcc.currencyCode)}{fmt(fromAcc.currentBalance)}
            </div>}

          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>{t('fin2.transfers.to_account','转入账户')} <span className="text-red-500">*</span></div>
            {/* G4-A：资金账户主数据；同币种过滤（避免跨币种调拨） */}
            <CashAccountSelector value={form.toAccountId} valueField="id" onChange={v => set('toAccountId', v)} currencyCode={fromAcc?.currencyCode} />
          </div>

          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>{t('fin2.transfers.transfer_amount','转账金额')} <span className="text-red-500">*</span></div>
            <input type="number" min="0.01" step="0.01" value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)} placeholder={t('fin2.transfers.amount_ph','请输入金额')} className={selectClass} />
          </div>

          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>{t('fin2.common.remark','备注')}</div>
            <textarea value={form.remark} onChange={e => set('remark', e.target.value)} placeholder={t('fin2.common.optional','可选')} rows={2} className={`${selectClass} resize-none font-inherit`} />
          </div>
        </div>

        <div style={{ ...inlineAlert('warning'), margin: '14px 0', lineHeight: 1.6 }}>
          💡 {t('fin2.transfers.create_hint','创建后状态为「草稿」，需提交审批 → 审批通过 → 执行，才会实际扣减账户余额。')}
        </div>

        <div style={drawerFooter}>
          <button onClick={onClose} style={secondaryActionButton}>{t('fin2.common.cancel','取消')}</button>
          <button onClick={submit} disabled={saving} style={{ ...primaryActionButton, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? t('fin2.transfers.creating','创建中…') : t('fin2.transfers.create_draft','创建草稿')}
          </button>
        </div>
      </div>
    </div>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FundTransfersPage() {
  // 权限门控（G47）：新建转账受 MENU_FIN2_CASH_TRANSFER:C 约束，
  // 刘杰等仅查看/审核角色(无该菜单)不应看到新建入口。
  const { canCreate } = usePermission('MENU_FIN2_CASH_TRANSFER');
  const { t } = useLanguage();
  const [transfers, setTransfers] = useState<FundTransfer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('pageSize', '50');
      const res = await fetch(`${API}/transfers?${params}`, {
        headers: authHeaders()
      }).then(r => r.json());
      let items: FundTransfer[] = res.items ?? [];
      if (keyword) {
        const kw = keyword.toLowerCase();
        items = items.filter(t => t.transferNo.toLowerCase().includes(kw) || t.fromAccountName.toLowerCase().includes(kw) || t.toAccountName.toLowerCase().includes(kw));
      }
      setTransfers(items);
      setTotal(res.total ?? items.length);
    } finally {
      setLoading(false);
    }
  }, [keyword, statusFilter]);
  useEffect(() => {
    void load();
  }, [load]);
  async function doAction(id: string, action: string, msg?: string) {
    if (msg && !confirm(msg)) return;
    setActionLoading(id + action);
    try {
      const r = await fetch(`${API}/transfers/${id}/${action}`, {
        method: 'POST',
        headers: authHeaders()
      });
      if (!r.ok) {
        const d = await r.json();
        alert(d.message ?? t('fin2.common.op_failed','操作失败'));
        return;
      }
      if (action === 'execute') invalidateCashAccountLookups();
      await load();
    } finally {
      setActionLoading(null);
    }
  }
  return <div>
      <PageHeader title={t('fin2.transfers.page_title','资金转账')} subtitle={t('fin2.transfers.page_subtitle','账户间内部资金划转，5 状态审批工作流')} breadcrumb={[t('fin2.common.finance_mgmt','财务管理'), t('fin2.transfers.page_title','资金转账')]} actions={canCreate ? <button onClick={() => setShowCreate(true)} style={primaryActionButton}>
            <Plus size={15} /> {t('fin2.transfers.create_btn','新建转账')}
          </button> : undefined} />

      {/* 状态筛选 工具栏 */}
      <div style={searchToolbar}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} color="var(--text-secondary)" style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }} />
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={t('fin2.transfers.search_ph','搜索单号/账户名称…')} style={{ ...inputField, paddingLeft: 34, fontSize: 13 }} />
        </div>

        {[{
          k: '',
          v: t('fin2.transfers.all_status','全部状态')
        }, ...Object.entries(STATUS_CONFIG).map(([k, c]) => ({
          k,
          v: t(`fin2.transfers.status_${k.toLowerCase()}`, c.label)
        }))].map(({ k, v }) => (
          <button key={k} onClick={() => setStatusFilter(k)} style={toolbarFilterPill(statusFilter === k)}>
            {v}
          </button>
        ))}

        <button onClick={() => void load()} disabled={loading} style={secondaryActionButton}>
          <RefreshCw size={14} />
        </button>

        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('fin2.common.total','共')} {total} {t('fin2.transfers.records_unit','条')}</span>
      </div>

      {/* 转账列表 */}
      {loading ? <LoadingSkeleton variant="card" rows={4} /> : transfers.length === 0 ? <div className="text-text-muted text-sm text-center py-12">
          <ArrowLeftRight size={32} style={{
        margin: '0 auto 12px',
        display: 'block',
        opacity: 0.4
      }} />
          {t('fin2.transfers.empty','暂无转账记录')}
        </div> : <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }}>
          {transfers.map(tf => <div key={tf.id} className="bg-bg-card" style={{
        borderRadius: 14,
        border: `1.5px solid ${tf.status === 'EXECUTED' ? 'var(--status-success-bg-light)' : tf.status === 'CANCELLED' ? 'var(--slate-200)' : 'var(--status-info-bg-page)'}`,
        padding: '16px 20px',
        opacity: tf.status === 'CANCELLED' ? 0.65 : 1
      }}>
              <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
                {/* 左侧信息 */}
                <div className={u.flex1}>
                  <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10
            }}>
                    <span className="text-text" style={{
                fontWeight: 700,
                fontSize: 13
              }}>{tf.transferNo}</span>
                    <LocalStatusBadge status={tf.status} />
                    <span className={`text-text-dim ${u.fs11}`}>
                      {new Date(tf.createdAt).toLocaleDateString('zh-CN')} · {tf.createdBy ?? '-'}
                    </span>
                  </div>

                  {/* 转账路径 */}
                  <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 6
            }}>
                    <div className="bg-warning/10" style={{
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12
              }}>
                      <div className={`text-amber-800 dark:text-amber-300 ${u.fw600}`}>{tf.fromAccountName}</div>
                      <div className={`text-warning ${u.fs11}`}>{tf.fromAccountCode}</div>
                    </div>
                    <ArrowLeftRight size={16} className="text-text-dim" />
                    <div className="bg-success/10" style={{
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12
              }}>
                      <div className={`text-emerald-800 dark:text-emerald-300 ${u.fw600}`}>{tf.toAccountName}</div>
                      <div className={`text-emerald-600 dark:text-emerald-400 ${u.fs11}`}>{tf.toAccountCode}</div>
                    </div>

                    <div style={{
                marginLeft: 'auto',
                textAlign: 'right'
              }}>
                      <div className="text-blue-700 dark:text-blue-300" style={{
                  fontWeight: 800,
                  fontSize: 18,
                  fontVariantNumeric: 'tabular-nums'
                }}>
                        {currencySymbol(tf.currencyCode)}{fmt(tf.amountOriginal)}
                      </div>
                    </div>
                  </div>

                  {tf.remark && <div className="text-text-dim" style={{
              fontSize: 11,
              marginTop: 4
            }}>{t('fin2.common.remark','备注')}：{tf.remark}</div>}
                </div>
              </div>

              {/* 操作按钮 */}
              {!['EXECUTED', 'CANCELLED'].includes(tf.status) && <div className="border-t border-border" style={{
          display: 'flex',
          gap: 8,
          marginTop: 12,
          paddingTop: 12
        }}>
                  {tf.status === 'DRAFT' && <button onClick={() => doAction(tf.id, 'submit', `${t('fin2.transfers.confirm_submit_pre','确认提交转账单')} ${tf.transferNo} ${t('fin2.transfers.confirm_submit_post','至审批？')}`)} disabled={actionLoading === tf.id + 'submit'} style={actionPill('info', actionLoading === tf.id + 'submit')}>
                    <Send size={12} /> {t('fin2.common.submit_approval','提交审批')}
                  </button>}
                  {tf.status === 'PENDING_APPROVAL' && <button onClick={() => doAction(tf.id, 'approve')} disabled={actionLoading === tf.id + 'approve'} style={actionPill('success', actionLoading === tf.id + 'approve')}>
                    <CheckCircle size={12} /> {t('fin2.transfers.approve','审批通过')}
                  </button>}
                  {tf.status === 'APPROVED' && <button onClick={() => doAction(tf.id, 'execute', `${t('fin2.transfers.confirm_exec_pre','确认执行转账')} ${tf.transferNo}${t('fin2.transfers.confirm_exec_mid','？将实际划转')} ${currencySymbol(tf.currencyCode)}${fmt(tf.amountOriginal)}${t('fin2.transfers.confirm_exec_post','。')}`)} disabled={actionLoading === tf.id + 'execute'} style={actionPill('success', actionLoading === tf.id + 'execute')}>
                    <Play size={12} /> {t('fin2.transfers.execute','执行转账')}
                  </button>}
                  <button onClick={() => doAction(tf.id, 'cancel', `${t('fin2.transfers.confirm_cancel_pre','确认取消转账单')} ${tf.transferNo}${t('fin2.transfers.confirm_cancel_post','？')}`)} disabled={actionLoading === tf.id + 'cancel'} style={actionPill('danger', actionLoading === tf.id + 'cancel')}>
                    <X size={12} /> {t('fin2.common.cancel','取消')}
                  </button>
                </div>}
            </div>)}
        </div>}

      {showCreate && <CreateTransferModal onClose={() => setShowCreate(false)} onCreated={() => {
      setShowCreate(false);
      void load();
    }} />}
    </div>;
}
