'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/contexts/ToastContext';
import u from "@/styles/uix-utils.module.css";
import { Wallet, Plus, Search, RefreshCw, Lock, Unlock, X, TrendingUp, TrendingDown, DollarSign, Activity, Pencil, ArrowLeftRight, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { StatusBadge } from '@/components/design-system';
import { usePermission } from '@/hooks/usePermission'; // G20-2 子 menu 按钮分流
import { currencySymbol } from '@/lib/currency';
import { CompanySelector } from '@/components/shared-selectors/MasterDataSelectors';
import { ConfirmDialogV2 } from '@/components/design-system/dialogs/ConfirmDialogV2';

import {
  primaryActionButton, secondaryActionButton, modalMask, modalPanel, inputField, formLabel,
  drawerMask, drawerPanel, drawerHeader, drawerHeaderTitle, drawerCloseButton, drawerFooter,
  inlineBadge, pillBadge,
  searchToolbar, toolbarFilterPill,
  // g200a 模板 token
  MONO_FONT, kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  actionPill, moneyCell, txnRow, drawerHeroBox,
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

// G36-5: API 返回 snake_case，对齐字段名（避免 21 卡片字段全空 bug 复发）
interface CashAccount {
  id: string;
  account_code: string;
  account_name: string;
  company_code: string;
  company_name: string | null;
  currency_code: string;
  account_type: string;
  opening_balance: string | number;
  current_balance: string | number;
  bank_name: string | null;
  bank_account_no: string | null;
  status: string;
  remark: string | null;
  created_at: string;
}
interface AccountSummary {
  totalAccounts: number;
  totalBalance: number;
  activeCount: number;
  frozenCount: number;
  closedCount: number;
  byType: Array<{
    account_type: string;
    cnt: string;
    balance: string;
  }>;
  byCurrency?: Array<{
    currency_code: string;
    cnt: string;
    balance: string;
  }>;
}
interface Transaction {
  id: string;
  txn_no: string;
  direction: string;
  source_type: string;
  source_no: string | null;
  amount: string | number;
  balance_after: string | number;
  txn_date: string;
  remark: string | null;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const API = '/api/v2/finance/cash';
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  BANK: '银行账户',
  CASH: '现金账户',
  EWALLET: '电子钱包',
  VIRTUAL: '虚拟账户',
  SHAREHOLDER: '股东账户',
  INTERNAL: '内部账户',
  PERSONAL_AGENT: '个人代收代付',
};
const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  BANK: 'var(--color-accent)',
  CASH: 'var(--status-success)',
  EWALLET: 'var(--status-info)',
  VIRTUAL: 'var(--color-purple-600)',
  SHAREHOLDER: 'var(--status-warning)',
  INTERNAL: 'var(--status-info)',
  PERSONAL_AGENT: 'var(--color-purple-600)',
};
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '正常',
  FROZEN: '冻结',
  CLOSED: '已关闭'
};
const SOURCE_TYPE_LABELS: Record<string, string> = {
  AP_PAYMENT: '应付付款',
  AR_RECEIPT: '应收收款',
  TRANSFER: '转账',
  SHAREHOLDER: '股东资金',
  MANUAL: '手工',
  OPENING: '期初'
};
function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0.00';
  return Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({
  type
}: {
  type: string;
}) {
  const color = ACCOUNT_TYPE_COLORS[type] ?? 'var(--gray-500)';
  return <span style={{
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    background: color + '18',
    color
  }}>
      {ACCOUNT_TYPE_LABELS[type] ?? type}
    </span>;
}

// ── Create Account Modal ─────────────────────────────────────────────────────

function CreateAccountModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    accountCode: '',
    accountName: '',
    companyCode: '',
    companyName: '',
    currencyCode: 'CNY',
    accountType: 'BANK',
    openingBalance: '',
    bankName: '',
    bankAccountNo: '',
    remark: ''
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm(f => ({
    ...f,
    [k]: v
  }));
  async function submit() {
    if (!form.accountName.trim()) {
      setErr('请填写账户名称');
      return;
    }
    if (!form.companyCode.trim()) {
      setErr('请填写公司编号');
      return;
    }
    if (!form.currencyCode.trim()) {
      setErr('请填写货币代码');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const body: Record<string, unknown> = {
        accountName: form.accountName.trim(),
        companyCode: form.companyCode.trim(),
        companyName: form.companyName.trim() || undefined,
        currencyCode: form.currencyCode.trim().toUpperCase(),
        accountType: form.accountType,
        openingBalance: form.openingBalance ? Number(form.openingBalance) : undefined,
        bankName: form.bankName.trim() || undefined,
        bankAccountNo: form.bankAccountNo.trim() || undefined,
        remark: form.remark.trim() || undefined
      };
      if (form.accountCode.trim()) body.accountCode = form.accountCode.trim();
      const r = await fetch(`${API}/accounts`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.message ?? '创建失败');
      }
      onCreated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }
  return <div style={modalMask} onClick={onClose}>
      <div style={modalPanel(520)} onClick={e => e.stopPropagation()}>
        <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
      }}>
          <div className="text-text" style={{
          fontWeight: 700,
          fontSize: 16
        }}>新建资金账户</div>
          <button onClick={onClose} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer'
        }}>
            <X size={18} className="text-text-dim" />
          </button>
        </div>

        {err && <div className={`bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2 ${u.mb14}`}>
            {err}
          </div>}

        {/* 公司：主数据下拉，名称自动带出只读 */}
        <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        marginBottom: 12
      }}>
          <div>
            <div className={`text-text-muted text-xs font-semibold ${u.mb4}`}>公司 *</div>
            <CompanySelector
              value={form.companyCode}
              onChange={v => set('companyCode', v)}
              onPick={o => set('companyName', o?.label ?? '')}
            />
          </div>
          <div>
            <div className={`text-text-muted text-xs font-semibold ${u.mb4}`}>公司名称</div>
            <input
              value={form.companyName}
              readOnly
              placeholder="选择公司后自动带出"
              className="px-3 py-1.5 rounded-lg text-sm border border-border text-text w-full"
              style={{ boxSizing: 'border-box', background: 'var(--bg-muted)', cursor: 'not-allowed' }}
            />
          </div>
        </div>

        <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12
      }}>
          {[{
          label: '账户编号（留空自动生成）',
          key: 'accountCode',
          placeholder: 'CA-202605-00001'
        }, {
          label: '账户名称 *',
          key: 'accountName',
          placeholder: '如：中行人民币基本户'
        }, {
          label: '货币代码 *',
          key: 'currencyCode',
          placeholder: 'CNY'
        }, {
          label: '期初余额',
          key: 'openingBalance',
          placeholder: '0.00'
        }, {
          label: '开户行',
          key: 'bankName',
          placeholder: '中国银行某某支行'
        }, {
          label: '银行账号',
          key: 'bankAccountNo',
          placeholder: '1234 5678 9012 3456'
        }].map(f => <div key={f.key}>
              <div className={`text-text-muted text-xs font-semibold ${u.mb4}`}>{f.label}</div>
              <input value={(form as Record<string, string>)[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} className="px-3 py-1.5 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 w-full" style={{
            boxSizing: 'border-box'
          }} />
            </div>)}
        </div>

        <div className={u.mt12}>
          <div className={`text-text-muted text-xs font-semibold ${u.mb4}`}>账户类型 *</div>
          <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap'
        }}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => <button key={k} onClick={() => set('accountType', k)} style={{
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            border: `1.5px solid ${form.accountType === k ? ACCOUNT_TYPE_COLORS[k] : 'var(--slate-200)'}`,
            background: form.accountType === k ? ACCOUNT_TYPE_COLORS[k] + '18' : undefined,
            color: form.accountType === k ? ACCOUNT_TYPE_COLORS[k] : undefined
          }} className={form.accountType === k ? '' : 'bg-bg-page text-text-muted border-border'}>
                {v}
              </button>)}
          </div>
        </div>

        <div className={u.mt12}>
          <div className={`text-text-muted text-xs font-semibold ${u.mb4}`}>备注</div>
          <textarea value={form.remark} onChange={e => set('remark', e.target.value)} placeholder="可选" rows={2} className="px-3 py-1.5 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 w-full" style={{
          resize: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box'
        }} />
        </div>

        {/* g200a 模态底栏(2026-06-19):用 drawerFooter + secondaryActionButton/primaryActionButton token。*/}
        <div style={drawerFooter}>
          <button onClick={onClose} style={secondaryActionButton}>取消</button>
          <button onClick={submit} disabled={saving} style={{ ...primaryActionButton, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '创建中…' : '创建账户'}
          </button>
        </div>
      </div>
    </div>;
}

// ── Edit Account Modal（含期初余额修正） ──────────────────────────────────────

function EditAccountModal({
  account,
  onClose,
  onSaved
}: {
  account: CashAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    accountName: account.account_name ?? '',
    bankName: account.bank_name ?? '',
    bankAccountNo: account.bank_account_no ?? '',
    openingBalance: String(account.opening_balance ?? ''),
    remark: account.remark ?? ''
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const openingChanged = String(account.opening_balance ?? '') !== form.openingBalance;
  async function submit() {
    if (!form.accountName.trim()) { setErr('请填写账户名称'); return; }
    if (form.openingBalance !== '' && !Number.isFinite(Number(form.openingBalance))) {
      setErr('期初余额必须为数字'); return;
    }
    setSaving(true);
    setErr('');
    try {
      const body: Record<string, unknown> = {
        accountName: form.accountName.trim(),
        bankName: form.bankName.trim() || undefined,
        bankAccountNo: form.bankAccountNo.trim() || undefined,
        remark: form.remark.trim() || undefined
      };
      if (openingChanged && form.openingBalance !== '') body.openingBalance = Number(form.openingBalance);
      const r = await fetch(`${API}/accounts/${account.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.message ?? '保存失败');
      }
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }
  return <div style={modalMask} onClick={onClose}>
      <div style={modalPanel(480)} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div className="text-text" style={{ fontWeight: 700, fontSize: 16 }}>编辑账户</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} className="text-text-dim" />
          </button>
        </div>
        <div className="text-text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
          {account.account_code} · {account.currency_code}
        </div>

        {err && <div className={`bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger ${u.mb14}`}>{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[{ label: '账户名称 *', key: 'accountName', placeholder: '账户名称' },
            { label: '开户行', key: 'bankName', placeholder: '开户行' },
            { label: '银行账号', key: 'bankAccountNo', placeholder: '银行账号' },
            { label: '期初余额', key: 'openingBalance', placeholder: '0.00' }
          ].map(f => <div key={f.key}>
              <div className={`text-text-muted text-xs font-semibold ${u.mb4}`}>{f.label}</div>
              <input value={(form as Record<string, string>)[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} className="px-3 py-1.5 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 w-full" style={{ boxSizing: 'border-box' }} />
            </div>)}
        </div>

        {openingChanged && <div className="bg-warning/10 border border-warning/20 rounded-xl px-4 py-3 text-xs text-amber-800 dark:text-amber-300" style={{ marginTop: 12 }}>
          修改期初余额后，将按「期初 + 全部流水」自动重算当前余额并重建余额台账（balance_after 链）。
        </div>}

        <div className={u.mt12}>
          <div className={`text-text-muted text-xs font-semibold ${u.mb4}`}>备注</div>
          <textarea value={form.remark} onChange={e => set('remark', e.target.value)} placeholder="可选" rows={2} className="px-3 py-1.5 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 w-full" style={{ resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>

        {/* g200a 模态底栏(2026-06-19):token 化(同 CreateAccountModal)。*/}
        <div style={drawerFooter}>
          <button onClick={onClose} style={secondaryActionButton}>取消</button>
          <button onClick={submit} disabled={saving} style={{ ...primaryActionButton, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>;
}

// ── Transaction Drawer ────────────────────────────────────────────────────────

function TransactionDrawer({
  account,
  accounts,
  canEdit,
  canEditTxn,
  canDeleteTxn,
  onChanged,
  onClose
}: {
  account: CashAccount;
  accounts: CashAccount[];
  canEdit: boolean;
  canEditTxn: boolean;
  canDeleteTxn: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassignId, setReassignId] = useState<string | null>(null);   // 正在改挂的流水
  const [reassignTarget, setReassignTarget] = useState('');             // 目标账户 id
  const [reassigning, setReassigning] = useState(false);
  // G103 手工流水「修改 / 删除」（出纳修正录错的流水）
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ direction: 'IN' | 'OUT'; amount: string; txn_date: string; remark: string }>({ direction: 'IN', amount: '', txn_date: '', remark: '' });
  const [savingTxn, setSavingTxn] = useState(false);
  const [pendingDeleteTxnId, setPendingDeleteTxnId] = useState<string | null>(null);
  // G189 批量删除（初始化对齐：删导入/手工/期初等无源流水）
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  function toggleTxnSel(id: string) {
    setSelectedTxnIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function doEditTxn(txnId: string) {
    const amt = Number(editForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) { alert('金额必须为正数'); return; }
    setSavingTxn(true);
    try {
      const r = await fetch(`${API}/transactions/${txnId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ direction: editForm.direction, amount: amt, txn_date: editForm.txn_date, remark: editForm.remark }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.message ?? '修改失败'); return; }
      setEditId(null);
      await loadTxns();
      onChanged();
    } finally { setSavingTxn(false); }
  }
  function doDeleteTxn(txnId: string) {
    setPendingDeleteTxnId(txnId);
  }
  async function confirmDeleteTxn() {
    if (!pendingDeleteTxnId) return;
    setSavingTxn(true);
    try {
      const r = await fetch(`${API}/transactions/${pendingDeleteTxnId}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.message ?? '删除失败'); return; }
      await loadTxns();
      onChanged();
    } finally { setSavingTxn(false); setPendingDeleteTxnId(null); }
  }
  const loadTxns = useCallback(() => {
    setLoading(true);
    return fetch(`${API}/transactions?accountId=${account.id}&pageSize=50`, {
      headers: authHeaders()
    }).then(r => r.json()).then(d => {
      setTxns(d.items ?? []);
    }).finally(() => setLoading(false));
  }, [account.id]);
  useEffect(() => { void loadTxns(); }, [loadTxns]);
  async function doBulkDelete() {
    if (selectedTxnIds.size === 0) return;
    if (!confirm(`确认批量删除选中的 ${selectedTxnIds.size} 条流水？仅手工/期初/导入等无源单据流水会被删除；删后自动重算余额。此操作不可恢复。`)) return;
    setBulkDeleting(true);
    try {
      const r = await fetch(`${API}/transactions/bulk-delete`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ids: [...selectedTxnIds] }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.message ?? '批量删除失败'); return; }
      alert(`已删除 ${d.deleted ?? 0} 条流水，重算 ${d.accounts?.length ?? 0} 个账户余额`);
      setSelectedTxnIds(new Set());
      await loadTxns();
      onChanged();
    } catch { alert('批量删除失败'); }
    finally { setBulkDeleting(false); }
  }
  // 同币种、非本账户、未关闭 → 可作为改挂目标
  const reassignTargets = useMemo(() => accounts.filter(a =>
    a.id !== account.id && a.currency_code === account.currency_code && a.status !== 'CLOSED'), [accounts, account.id, account.currency_code]);
  async function doReassign(txnId: string) {
    if (!reassignTarget) { alert('请选择目标账户'); return; }
    setReassigning(true);
    try {
      const r = await fetch(`${API}/transactions/${txnId}/reassign`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ targetAccountId: reassignTarget })
      });
      if (!r.ok) {
        const d = await r.json();
        alert(d.message ?? '改挂失败');
        return;
      }
      setReassignId(null);
      setReassignTarget('');
      await loadTxns();
      onChanged();
    } finally {
      setReassigning(false);
    }
  }
  return <div style={drawerMask} onClick={onClose}>
      <div style={drawerPanel(520)} onClick={e => e.stopPropagation()}>
        {/* g200a 抽屉头部(2026-06-19):用 drawerHeader/drawerHeaderTitle/drawerCloseButton token,
            替代之前 marginBottom 18 无下分割线的自写头(扫读时与余额块粘连)。*/}
        <div style={drawerHeader}>
          <div>
            <div style={drawerHeaderTitle}>{account.account_name}</div>
            <div className="text-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              {account.account_code} · {account.currency_code}
            </div>
          </div>
          <button onClick={onClose} style={drawerCloseButton}>
            <X size={18} />
          </button>
        </div>

        {/* g200a 余额块(2026-06-19):去渐变蓝,用 drawerHeroBox token(灰底克制) + moneyCell(lg)。*/}
        <div style={drawerHeroBox}>
          <div>
            <div className="text-text-muted" style={{ fontSize: 11, marginBottom: 4 }}>当前余额</div>
            <div style={{ ...moneyCell('default', 'lg'), fontSize: 24, letterSpacing: -0.5 }}>
              {currencySymbol(account.currency_code)}{fmt(account.current_balance)}
            </div>
          </div>
          <div className="text-text-muted" style={{ fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>
            期初 <span style={{ fontFamily: MONO_FONT }}>{fmt(account.opening_balance)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="text-text-muted" style={{ fontWeight: 600, fontSize: 13 }}>
            最近 50 条流水{canDeleteTxn && selectedTxnIds.size > 0 ? ` · 已选 ${selectedTxnIds.size}` : ''}
          </span>
          {canDeleteTxn && selectedTxnIds.size > 0 && (
            <button onClick={() => void doBulkDelete()} disabled={bulkDeleting} style={actionPill('danger', bulkDeleting)}>
              <Trash2 size={11} /> {bulkDeleting ? '删除中…' : `批量删除 (${selectedTxnIds.size})`}
            </button>
          )}
        </div>

        {loading ? <div className="text-text-muted" style={{
        textAlign: 'center',
        padding: 32,
        fontSize: 13
      }}>加载中…</div> : txns.length === 0 ? <div className="text-text-muted" style={{
        textAlign: 'center',
        padding: 32,
        fontSize: 13
      }}>暂无流水记录</div> : <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
            {txns.map(t => (
              /* g200a 流水行(2026-06-19):去 Tailwind 浅绿/浅橙背景,用 txnRow(direction) — 白底 + 左 3px 色条标方向。
                 金额用 moneyCell(success/warning, md);余额尾巴 moneyCell(default, sm)。*/
              <div key={t.id} style={txnRow(t.direction === 'IN' ? 'IN' : 'OUT')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', width: '100%' }}>
                  {canDeleteTxn && <input type="checkbox" checked={selectedTxnIds.has(t.id)} onChange={() => toggleTxnSel(t.id)} style={{ width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }} />}
                  <div className={u.flex1}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      {t.direction === 'IN'
                        ? <TrendingUp size={13} className="text-success" />
                        : <TrendingDown size={13} style={{ color: 'var(--status-warning)' }} />}
                      <span className="text-text-muted" style={{ fontSize: 12, fontWeight: 600 }}>
                        {SOURCE_TYPE_LABELS[t.source_type ?? ''] ?? t.source_type ?? '-'}
                      </span>
                      {t.source_no && <span className={`text-text-dim ${u.fs11}`}>{t.source_no}</span>}
                    </div>
                    <div className={`text-text-muted ${u.fs11}`}>
                      {new Date(t.txn_date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {t.remark && ` · ${t.remark}`}
                    </div>
                  </div>
                  <div className={u.tar}>
                    <div style={moneyCell(t.direction === 'IN' ? 'success' : 'warning', 'md')}>
                      {t.direction === 'IN' ? '+' : '-'}{fmt(t.amount)}
                    </div>
                    <div style={{ ...moneyCell('default', 'sm'), color: 'var(--text-dim)', fontWeight: 400 }}>余 {fmt(t.balance_after)}</div>
                  </div>
                </div>

                {/* 流水修正操作区：改挂账户 / 修改 / 删除（手工流水） */}
                {editId === t.id ? (
                  /* G103 修改手工流水（金额/方向/日期/摘要） */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: '8px 0' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select value={editForm.direction} onChange={e => setEditForm(f => ({ ...f, direction: e.target.value as 'IN' | 'OUT' }))} style={{ ...inputField, width: 80, fontSize: 12, padding: '5px 8px' }}>
                        <option value="IN">收款</option>
                        <option value="OUT">付款</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} placeholder="金额" style={{ ...inputField, flex: 1, fontSize: 12, padding: '5px 8px' }} />
                      <input type="date" value={editForm.txn_date} onChange={e => setEditForm(f => ({ ...f, txn_date: e.target.value }))} style={{ ...inputField, width: 130, fontSize: 12, padding: '5px 8px' }} />
                    </div>
                    <input value={editForm.remark} onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))} placeholder="摘要 / 备注" style={{ ...inputField, fontSize: 12, padding: '5px 8px' }} />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditId(null)} style={actionPill('default')}>取消</button>
                      <button onClick={() => void doEditTxn(t.id)} disabled={savingTxn} style={actionPill('brand', savingTxn)}>
                        {savingTxn ? '保存中…' : '保存修改'}
                      </button>
                    </div>
                  </div>
                ) : reassignId === t.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}>
                    <select value={reassignTarget} onChange={e => setReassignTarget(e.target.value)} style={{ ...inputField, flex: 1, fontSize: 12, padding: '5px 8px' }}>
                      <option value="">选择目标账户（同币种 {account.currency_code}）…</option>
                      {reassignTargets.map(a => <option key={a.id} value={a.id}>{a.account_code} · {a.account_name}</option>)}
                    </select>
                    <button onClick={() => void doReassign(t.id)} disabled={reassigning || !reassignTarget} style={actionPill('brand', reassigning || !reassignTarget)}>
                      {reassigning ? '改挂中…' : '确认'}
                    </button>
                    <button onClick={() => { setReassignId(null); setReassignTarget(''); }} style={actionPill('default')}>取消</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {canEdit && (
                      <button onClick={() => { setReassignId(t.id); setReassignTarget(''); }} style={actionPill('default')}>
                        <ArrowLeftRight size={10} /> 改挂账户
                      </button>
                    )}
                    {/* 修改 / 删除：仅手工录入的流水（业务单据带出的流水须回源单据修正） */}
                    {canEditTxn && t.source_type === 'MANUAL' && (
                      <button onClick={() => { setEditId(t.id); setEditForm({ direction: t.direction === 'OUT' ? 'OUT' : 'IN', amount: String(t.amount ?? ''), txn_date: (t.txn_date ?? '').slice(0, 10), remark: t.remark ?? '' }); }} style={actionPill('info')}>
                        <Pencil size={10} /> 修改
                      </button>
                    )}
                    {canDeleteTxn && t.source_type === 'MANUAL' && (
                      <button onClick={() => void doDeleteTxn(t.id)} disabled={savingTxn} style={actionPill('danger', savingTxn)}>
                        <Trash2 size={10} /> 删除
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>}
      </div>
      <ConfirmDialogV2
        open={!!pendingDeleteTxnId}
        title="删除流水"
        message="确认删除这条手工流水？删除后账户余额将自动重算，且不可恢复。"
        danger
        confirmLabel="删除"
        loading={savingTxn}
        onConfirm={confirmDeleteTxn}
        onCancel={() => setPendingDeleteTxnId(null)}
      />
    </div>;
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CashAccountsPage() {
  // G20-2：按钮按子 menu 分流（A1 欠债治理）
  //   新建账户 → MENU_FIN2_CASH_MASTER:C
  //   收/付款  → MENU_FIN2_CASH_TXN:C
  //   宋明光持 TXN:C 但不持 MASTER:C，可记账不可建账户
  const { canCreate: canCreateAccount, canEdit: canEditAccount } = usePermission('MENU_FIN2_CASH_MASTER');
  const { canCreate: canCreateTxn, canEdit: canEditTxn, canDelete: canDeleteTxn } = usePermission('MENU_FIN2_CASH_TXN');
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [showCreate, setShowCreate] = useState(false);
  const [editAccount, setEditAccount] = useState<CashAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<CashAccount | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 现金流水录入模态（出纳日常工作 — 由 daily-work 卡片 ?action=receive/pay 触发，或顶部按钮）
  const [txnModal, setTxnModal] = useState<{ direction: 'IN' | 'OUT' } | null>(null);

  // 接收 ?action=receive / pay 自动打开模态
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const act = sp.get('action');
    if (act === 'receive') setTxnModal({ direction: 'IN' });
    else if (act === 'pay') setTxnModal({ direction: 'OUT' });
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set('keyword', keyword);
      if (typeFilter) params.set('accountType', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('pageSize', '100');
      const [listRes, summaryRes] = await Promise.all([fetch(`${API}/accounts?${params}`, {
        headers: authHeaders()
      }).then(r => r.json()), fetch(`${API}/accounts/summary`, {
        headers: authHeaders()
      }).then(r => r.json())]);
      setAccounts(listRes.items ?? []);
      setSummary(summaryRes);
    } finally {
      setLoading(false);
    }
  }, [keyword, typeFilter, statusFilter]);
  useEffect(() => {
    void load();
  }, [load]);
  async function doAction(id: string, action: string) {
    setActionLoading(id + action);
    try {
      const r = await fetch(`${API}/accounts/${id}/${action}`, {
        method: 'POST',
        headers: authHeaders()
      });
      if (!r.ok) {
        const d = await r.json();
        alert(d.message ?? '操作失败');
        return;
      }
      await load();
    } finally {
      setActionLoading(null);
    }
  }
  // 账户总余额跨币种，单一符号会误导(USD/THB 账户被当人民币)。按币种分组展示。
  const totalBalanceDisplay = useMemo(() => {
    const rows = (summary?.byCurrency ?? []).filter(r => Number(r.balance) !== 0 || Number(r.cnt) > 0);
    if (rows.length === 0) return fmt(summary?.totalBalance ?? 0);
    return rows
      .map(r => `${currencySymbol(r.currency_code)}${fmt(r.balance)}`)
      .join('  /  ');
  }, [summary]);
  return <div>
      <PageHeader title="资金账户中心" subtitle="资金账户管理 · 流水账本 · 转账审批" breadcrumb={['财务管理', '资金账户']} actions={
        <div style={{ display: 'flex', gap: 8 }}>
          {canCreateTxn && (
            <button onClick={() => setTxnModal({ direction: 'IN' })} style={{ ...secondaryActionButton, color: 'var(--status-success)', borderColor: 'var(--status-success)' }}>
              <Plus size={13} /> 收款
            </button>
          )}
          {canCreateTxn && (
            <button onClick={() => setTxnModal({ direction: 'OUT' })} style={{ ...secondaryActionButton, color: 'var(--status-danger)', borderColor: 'var(--status-danger)' }}>
              <Plus size={13} /> 付款
            </button>
          )}
          {canCreateAccount && (
            <button onClick={() => setShowCreate(true)} style={primaryActionButton}>
              <Plus size={15} /> 新建账户
            </button>
          )}
        </div>
      } />

      {/* g200a KPI 卡片(2026-06-19):统一 kpiCardCompact token,白底 + 左 3px 色条 + MONO 数字。
          替代之前 4 种 Tailwind 浅色背景方案(暗色漏覆盖、视觉过重)。*/}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
        gap: 12,
        marginBottom: 24,
      }}>
        {([
          { label: '账户总余额', value: totalBalanceDisplay,                icon: DollarSign, tone: 'info'    as const },
          { label: '账户总数',   value: `${summary?.totalAccounts ?? 0} 个`, icon: Wallet,     tone: 'brand'   as const },
          { label: '正常账户',   value: `${summary?.activeCount ?? 0} 个`,   icon: Activity,   tone: 'success' as const },
          { label: '冻结账户',   value: `${summary?.frozenCount ?? 0} 个`,   icon: Lock,       tone: 'warning' as const },
        ]).map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} style={kpiCardCompact(c.tone)}>
              <div style={kpiCardCompactLabel}>
                <Icon size={13} /> {c.label}
              </div>
              <div style={kpiCardCompactValue(c.tone)}>{c.value}</div>
            </div>
          );
        })}
      </div>

      {/* 筛选 + 搜索 工具栏 */}
      <div style={searchToolbar}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} color="var(--text-secondary)" style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }} />
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索账户名称/编号…" style={{ ...inputField, paddingLeft: 34, fontSize: 13 }} />
        </div>

        {[{
          k: '',
          v: '全部类型'
        }, ...Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => ({
          k,
          v
        }))].map(({ k, v }) => (
          <button key={k} onClick={() => setTypeFilter(k)} style={toolbarFilterPill(typeFilter === k)}>
            {v}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        {[{
          k: '',
          v: '全部状态'
        }, {
          k: 'ACTIVE',
          v: '正常'
        }, {
          k: 'FROZEN',
          v: '冻结'
        }, {
          k: 'CLOSED',
          v: '已关闭'
        }].map(({ k, v }) => (
          <button key={k} onClick={() => setStatusFilter(k)} style={toolbarFilterPill(statusFilter === k)}>
            {v}
          </button>
        ))}

        <button onClick={() => void load()} disabled={loading} style={secondaryActionButton}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* 账户列表 */}
      {loading ? <div className="text-text-muted" style={{
      textAlign: 'center',
      padding: 48,
      fontSize: 14
    }}>加载中…</div> : accounts.length === 0 ? <div className="text-text-muted" style={{
      textAlign: 'center',
      padding: 48,
      fontSize: 14
    }}>
          <Wallet size={32} style={{
        margin: '0 auto 12px',
        display: 'block',
        opacity: 0.4
      }} />
          暂无资金账户，点击「新建账户」开始管理
        </div> : <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))',
      gap: 14
    }}>
          {accounts.map(acc => <div key={acc.id} onClick={() => setSelectedAccount(acc)} className="bg-bg-card transition-shadow cursor-pointer" style={{
        borderRadius: 14,
        // 边框改可见 var(--border)（冻结=warning强调），加基础阴影抬起卡片，避免融进背景
        border: `1px solid ${acc.status === 'FROZEN' ? 'var(--status-warning)' : 'var(--border)'}`,
        boxShadow: acc.status === 'CLOSED' ? 'none' : '0 1px 3px var(--overlay-black-08, rgba(15,23,42,0.06)), 0 4px 12px var(--overlay-black-08, rgba(15,23,42,0.05))',
        padding: '18px 20px',
        opacity: acc.status === 'CLOSED' ? 0.6 : 1
      }}>
              {/* 顶部行 */}
              <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 12
        }}>
                <div>
                  <div className="text-text" style={{
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 4
            }}>
                    {acc.account_name}
                  </div>
                  <div className={`text-text-muted ${u.fs11}`}>{acc.account_code}</div>
                </div>
                <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4
          }}>
                  <StatusBadge status={acc.status} label={STATUS_LABELS[acc.status] ?? acc.status} />
                  <TypeBadge type={acc.account_type} />
                </div>
              </div>

              {/* g200a 余额块(2026-06-19):去渐变蓝(暗色色系冲突),回归克制灰底 + MONO 数字。*/}
              <div style={{
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div className="text-text-muted" style={{ fontSize: 11, marginBottom: 2 }}>当前余额</div>
                  <div style={moneyCell('default', 'lg')}>
                    {currencySymbol(acc.currency_code)}{fmt(acc.current_balance)}
                  </div>
                </div>
                {acc.bank_name && (
                  <div className="text-text-muted" style={{ fontSize: 11, textAlign: 'right' }}>
                    <div>{acc.bank_name}</div>
                    {acc.bank_account_no && (
                      <div className="text-text-dim" style={{ fontFamily: MONO_FONT }}>
                        {acc.bank_account_no.slice(-4).padStart(acc.bank_account_no.length, '*')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* g200a 操作按钮(2026-06-19):5 种 Tailwind 自写色 → 统一 actionPill(tone) token。
                  保持语义色:编辑 info / 重算 brand / 冻结 warning / 解冻 success / 关闭 default。*/}
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {canEditAccount && acc.status !== 'CLOSED' && (
                  <button onClick={() => setEditAccount(acc)} style={actionPill('info')}>
                    <Pencil size={11} /> 编辑/期初
                  </button>
                )}
                {canEditAccount && (
                  <button
                    onClick={() => { if (confirm(`重算账户「${acc.account_name}」余额？将按 期初 + 全部流水 重建余额台账。`)) { void doAction(acc.id, 'recompute'); } }}
                    disabled={actionLoading === acc.id + 'recompute'}
                    style={actionPill('brand', actionLoading === acc.id + 'recompute')}
                  >
                    <RefreshCw size={11} /> 重算余额
                  </button>
                )}
                {acc.status === 'ACTIVE' && (
                  <button onClick={() => doAction(acc.id, 'freeze')} disabled={actionLoading === acc.id + 'freeze'} style={actionPill('warning', actionLoading === acc.id + 'freeze')}>
                    <Lock size={11} /> 冻结
                  </button>
                )}
                {acc.status === 'FROZEN' && (
                  <button onClick={() => doAction(acc.id, 'unfreeze')} disabled={actionLoading === acc.id + 'unfreeze'} style={actionPill('success', actionLoading === acc.id + 'unfreeze')}>
                    <Unlock size={11} /> 解冻
                  </button>
                )}
                {acc.status !== 'CLOSED' && (
                  <button
                    onClick={() => { if (confirm(`确认关闭账户「${acc.account_name}」？关闭后不可恢复，且余额必须为零。`)) { void doAction(acc.id, 'close'); } }}
                    style={actionPill('default')}
                  >
                    <X size={11} /> 关闭
                  </button>
                )}
              </div>
            </div>)}
        </div>}

      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} onCreated={() => {
      setShowCreate(false);
      void load();
    }} />}

      {editAccount && <EditAccountModal account={editAccount} onClose={() => setEditAccount(null)} onSaved={() => {
      setEditAccount(null);
      void load();
    }} />}

      {selectedAccount && <TransactionDrawer account={selectedAccount} accounts={accounts} canEdit={canEditAccount} canEditTxn={canEditTxn} canDeleteTxn={canDeleteTxn} onChanged={() => void load()} onClose={() => setSelectedAccount(null)} />}

      {/* 手工录流水模态 — 出纳日常 */}
      {txnModal && <ManualTxnModal direction={txnModal.direction} accounts={accounts} onClose={() => {
        setTxnModal(null);
        // 移除 URL 中的 action 参数避免刷新重复弹出
        const url = new URL(window.location.href);
        url.searchParams.delete('action');
        window.history.replaceState({}, '', url.toString());
      }} onCreated={() => {
        setTxnModal(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('action');
        window.history.replaceState({}, '', url.toString());
        void load();
      }} />}
    </div>;
}

// ── 手工现金流水录入模态 ────────────────────────────────────────────────────
function _useToastSafe(): any {
  try { return useToast(); } catch { return { success: () => {}, error: () => {} }; }
}
const _tokSafe = () => (typeof window === 'undefined' ? '' : sessionStorage.getItem('phoenix_token') || '');

function ManualTxnModal({ direction, accounts, onClose, onCreated }: {
  direction: 'IN' | 'OUT';
  accounts: CashAccount[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = _useToastSafe();
  const [accountCode, setAccountCode] = useState('');
  const [amount, setAmount] = useState('');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().split('T')[0]);
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  // 账户很多 → 可搜索组合框（按账户名/编号/币种过滤），取代长下拉
  const [acctSearch, setAcctSearch] = useState('');
  const [acctOpen, setAcctOpen] = useState(false);
  const activeAccounts = useMemo(() => accounts.filter(a => a.status === 'ACTIVE'), [accounts]);
  const acctFiltered = useMemo(() => acctSearch.trim()
    ? activeAccounts.filter(a => `${a.account_name} ${a.account_code} ${a.currency_code}`.toLowerCase().includes(acctSearch.trim().toLowerCase()))
    : activeAccounts, [activeAccounts, acctSearch]);
  const selectedAcct = useMemo(() => activeAccounts.find(a => a.account_code === accountCode), [activeAccounts, accountCode]);

  const label = direction === 'IN' ? '收款' : '付款';
  const color = direction === 'IN' ? 'var(--status-success)' : 'var(--status-danger)';

  const submit = async () => {
    if (!accountCode) return toast.error('请选择资金账户');
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('金额必须为正数');
    setSaving(true);
    try {
      const res = await fetch(`${API}/transactions/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_tokSafe()}` },
        body: JSON.stringify({ account_code: accountCode, direction, amount: amt, txn_date: txnDate, remark }),
      });
      const json = await res.json();
      if (json.code === 200) {
        toast.success(`${label}已入账：${json.data.txn_no}`);
        onCreated();
      } else toast.error(json.msg || '录入失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={modalMask}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalPanel(440), padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color }}>{label}录入</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            <label style={formLabel}>资金账户 <span style={{ color: 'var(--status-danger)' }}>*</span></label>
            <input
              style={inputField}
              value={acctOpen ? acctSearch : (selectedAcct ? `${selectedAcct.account_name}（${selectedAcct.account_code} · ${selectedAcct.currency_code}）` : '')}
              placeholder="输入关键字筛选：账户名 / 编号 / 币种"
              onFocus={() => { setAcctOpen(true); setAcctSearch(''); }}
              onChange={e => { setAcctSearch(e.target.value); setAcctOpen(true); }}
              onBlur={() => setTimeout(() => setAcctOpen(false), 150)}
            />
            {acctOpen && (
              <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 240, overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.18)' }}>
                {acctFiltered.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>无匹配账户</div>
                ) : acctFiltered.map(a => (
                  <div
                    key={a.account_code}
                    onMouseDown={() => { setAccountCode(a.account_code); setAcctOpen(false); }}
                    style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)', background: a.account_code === accountCode ? 'var(--bg-muted)' : 'transparent' }}
                  >
                    <span style={{ fontWeight: 600 }}>{a.account_name}</span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>{a.account_code} · {a.currency_code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={formLabel}>金额 <span style={{ color: 'var(--status-danger)' }}>*</span></label>
            <input type="number" min="0" step="0.01" style={inputField} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
          </div>
          <div>
            <label style={formLabel}>日期</label>
            <input type="date" style={inputField} value={txnDate} onChange={e => setTxnDate(e.target.value)} />
          </div>
          <div>
            <label style={formLabel}>摘要 / 备注</label>
            <input style={inputField} value={remark} onChange={e => setRemark(e.target.value)} placeholder={`如：${direction === 'IN' ? '收直营店现金' : '付柴油款'}`} />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={secondaryActionButton}>取消</button>
          <button onClick={submit} disabled={saving} style={{ ...primaryActionButton, background: color, opacity: saving ? 0.6 : 1 }}>
            {saving ? '保存中…' : `确认${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}