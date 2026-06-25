'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import u from "@/styles/uix-utils.module.css";
import { Users, Plus, Search, RefreshCw, X, CheckCircle, Clock, AlertCircle, Upload, ChevronRight, TrendingDown, DollarSign, ArrowDownLeft } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { DictSelect } from '@/components/shared-selectors/DictSelect';
import { CompanySelector, ShareholderSelector, CashAccountSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { AttachmentUploader, ModalV2, DrawerV2, ConfirmDialogV2 } from '@/components/design-system';
import { usePermission } from '@/hooks/usePermission';
import { useAuth } from '@/contexts/AuthContext';
import { currencySymbol } from '@/lib/currency';

import {
  primaryActionButton, secondaryActionButton, inputField, inputFieldClass, formLabel,
  inlineBadge, pillBadge,
  tabBar, tabItem,
  searchToolbar, toolbarFilterPill, sectionTitle,
  statTile, statTileLabel, statTileValue, kpiCard, businessListCard,
  tableContainer,
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

interface Contribution {
  id: string;
  contributionNo: string;
  shareholderCode: string | null;
  shareholderName: string;
  companyCode: string;
  companyName: string | null;
  contributionType: string;
  fundNature: string | null;
  currencyCode: string;
  amountOriginal: string | number;
  settledAmountOriginal: string | number;
  balanceAmountOriginal: string | number;
  contributionDate: string | null;
  expectedReturnDate: string | null;
  status: string;
  createdBy?: string | null;
  sourceType: string;
  remark: string | null;
  createdAt: string;
}
interface Settlement {
  id: string;
  settlementNo: string;
  contributionId: string;
  contributionNo: string;
  shareholderName: string;
  settlementType: string;
  currencyCode: string;
  amountOriginal: string | number;
  cashAccountCode: string | null;
  status: string;
  remark: string | null;
  createdAt: string;
}
interface ShSummary {
  totalContributions: number;
  confirmedContributions: number;
  pendingConfirmations: number;
  totalAmountOriginal: number;
  settledAmountOriginal: number;
  balanceAmountOriginal: number;
  byShareholder: Array<{
    shareholder_name: string;
    cnt: string;
    balance: string;
  }>;
  byContributionType: Array<{
    contribution_type: string;
    cnt: string;
    total: string;
  }>;
  upcomingReturns: Array<{
    id: string;
    contribution_no: string;
    shareholder_name: string;
    expected_return_date: string;
    balance_amount_original: string;
  }>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const API = '/api/v2/finance/shareholders';
const CONTRIBUTION_TYPE_LABELS: Record<string, string> = {
  INVESTMENT: '股权投资',
  LOAN: '借款',
  ADVANCE: '垫资',
  GUARANTEE: '担保金',
  PAYMENT_ON_BEHALF: '代付'
};
const CONTRIBUTION_TYPE_COLORS: Record<string, string> = {
  INVESTMENT: 'var(--color-purple-600)',
  LOAN: 'var(--color-accent)',
  ADVANCE: 'var(--status-warning)',
  GUARANTEE: 'var(--status-info)',
  PAYMENT_ON_BEHALF: 'var(--status-success)'
};
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'var(--text-secondary)' },
  PENDING_CONFIRM: { label: '待确认', color: 'var(--status-warning)' },
  CONFIRMED: { label: '已确认', color: 'var(--color-accent)' },
  PARTIALLY_SETTLED: { label: '部分结算', color: 'var(--color-primary)' },
  SETTLED: { label: '已结清', color: 'var(--status-success)' },
  CANCELLED: { label: '已取消', color: 'var(--text-disabled)' },
};
const SETTLEMENT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'var(--text-secondary)' },
  PENDING_APPROVAL: { label: '待审批', color: 'var(--status-warning)' },
  APPROVED: { label: '已批准', color: 'var(--color-accent)' },
  SETTLED: { label: '已结清', color: 'var(--status-success)' },
  CANCELLED: { label: '已取消', color: 'var(--text-disabled)' },
};
const SETTLEMENT_TYPE_LABELS: Record<string, string> = {
  RETURN: '现金归还',
  OFFSET: '抵扣',
  TRANSFER: '转让',
  WRITE_OFF: '核销'
};
function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0.00';
  return Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LocalStatusBadge({
  status,
  map
}: {
  status: string;
  map: Record<string, {
    label: string;
    color: string;
  }>;
}) {
  const c = map[status] ?? { label: status, color: 'var(--text-secondary)' };
  return <span style={{
    display: 'inline-block', padding: '1px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
    background: `color-mix(in srgb, ${c.color} 14%, transparent)`, color: c.color,
  }}>
      {c.label}
    </span>;
}
function TypeBadge({
  type
}: {
  type: string;
}) {
  const color = CONTRIBUTION_TYPE_COLORS[type] ?? 'var(--gray-500)';
  return <span style={{
    display: 'inline-block',
    padding: '1px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    background: color + '18',
    color
  }}>
      {CONTRIBUTION_TYPE_LABELS[type] ?? type}
    </span>;
}

// ── Create Contribution Modal ──────────────────────────────────────────────────

function CreateContributionModal({
  onClose,
  onCreated,
  editing
}: {
  onClose: () => void;
  onCreated: () => void;
  editing?: Contribution | null;
}) {
  const [form, setForm] = useState({
    shareholderName: editing?.shareholderName ?? '',
    shareholderCode: editing?.shareholderCode ?? '',
    companyCode: editing?.companyCode ?? '',
    companyName: editing?.companyName ?? '',
    contributionType: editing?.contributionType ?? 'LOAN',
    currencyCode: editing?.currencyCode ?? 'CNY',
    amountOriginal: editing ? String(editing.amountOriginal) : '',
    contributionDate: editing?.contributionDate ?? '',
    expectedReturnDate: editing?.expectedReturnDate ?? '',
    remark: editing?.remark ?? '',
    voucherUrl: '' as string
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm(f => ({
    ...f,
    [k]: v
  }));
  async function submit() {
    if (!form.shareholderName.trim()) {
      setErr('请选择股东');
      return;
    }
    if (!form.companyCode.trim()) {
      setErr('请选择公司');
      return;
    }
    if (!form.amountOriginal || Number(form.amountOriginal) <= 0) {
      setErr('请填写金额');
      return;
    }
    if (!form.contributionDate) {
      setErr('请选择股东出资时间');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const r = await fetch(editing ? `${API}/contributions/${editing.id}` : `${API}/contributions`, {
        method: editing ? 'PATCH' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          shareholderName: form.shareholderName.trim(),
          shareholderCode: form.shareholderCode.trim() || undefined,
          companyCode: form.companyCode.trim(),
          companyName: form.companyName.trim() || undefined,
          contributionType: form.contributionType,
          currencyCode: form.currencyCode.trim().toUpperCase(),
          amountOriginal: Number(form.amountOriginal),
          contributionDate: form.contributionDate || undefined,
          expectedReturnDate: form.expectedReturnDate || undefined,
          remark: form.remark.trim() || undefined,
          voucherUrl: form.voucherUrl || undefined
        })
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.message ?? (editing ? '保存失败' : '创建失败'));
      }
      onCreated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }
  const inpClass = inputFieldClass;
  const cancelBtn: React.CSSProperties = { ...secondaryActionButton, flex: 1, padding: '11px 18px', fontSize: 14 };
  const submitBtn: React.CSSProperties = {
    flex: 2, padding: '11px 18px', borderRadius: 'var(--radius-md)', border: 'none', fontSize: 15,
    fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', color: 'var(--text-on-dark)',
    background: saving ? 'var(--text-disabled)' : 'var(--color-primary)', opacity: saving ? 0.7 : 1,
  };
  return <ModalV2 open title={editing ? '编辑股东资金记录' : '新建股东资金记录'} width={520} onClose={onClose} footer={<>
        <button onClick={onClose} style={cancelBtn}>取消</button>
        <button onClick={submit} disabled={saving} style={submitBtn}>{saving ? '保存中…' : (editing ? '保存' : '创建记录')}</button>
      </>}>
        {err && <div style={{ color: 'var(--status-danger)', background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-danger) 20%, transparent)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
            {err}
          </div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={formLabel}>公司 <span style={{ color: 'var(--status-danger)' }}>*</span></div>
            <CompanySelector value={form.companyCode}
              onChange={v => { set('companyCode', v); set('shareholderCode', ''); set('shareholderName', ''); }}
              onPick={o => set('companyName', o?.label ?? '')} />
          </div>
          <div>
            <div style={formLabel}>股东 <span style={{ color: 'var(--status-danger)' }}>*</span></div>
            <ShareholderSelector companyCode={form.companyCode} disabled={!form.companyCode}
              value={form.shareholderCode} onChange={v => set('shareholderCode', v)}
              onPick={o => set('shareholderName', o?.raw?.name ?? o?.raw?.shareholderName ?? o?.raw?.shareholder_name ?? o?.label ?? '')} />
          </div>
          <div>
            <div style={formLabel}>货币 <span style={{ color: 'var(--status-danger)' }}>*</span></div>
            <DictSelect dictType="SYS_CURRENCY" value={form.currencyCode} onChange={v => set('currencyCode', v)} allowEmpty={false} />
          </div>
          <div>
            <div style={formLabel}>金额 <span style={{ color: 'var(--status-danger)' }}>*</span></div>
            <input type="number" min="0.01" step="0.01" value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)} placeholder="0.00" className={inpClass} />
          </div>
          <div>
            <div style={formLabel}>股东出资时间 <span style={{ color: 'var(--status-danger)' }}>*</span></div>
            <input type="date" value={form.contributionDate} onChange={e => set('contributionDate', e.target.value)} className={inpClass} />
          </div>
          <div>
            <div style={formLabel}>预计归还日期</div>
            <input type="date" value={form.expectedReturnDate} onChange={e => set('expectedReturnDate', e.target.value)} className={inpClass} />
          </div>
        </div>
        <div className={u.mt12}>
          <div style={formLabel}>资金类型 <span style={{ color: 'var(--status-danger)' }}>*</span></div>
          <DictSelect dictType="FIN_CONTRIBUTION_TYPE" value={form.contributionType} onChange={v => set('contributionType', v)} allowEmpty={false} />
        </div>
        <div className={u.mt12}>
          <div style={formLabel}>出资凭证</div>
          <AttachmentUploader value={form.voucherUrl ? [form.voucherUrl] : []} onChange={urls => set('voucherUrl', urls[urls.length - 1] ?? '')} label="上传出资凭证（PDF/图片 ≤15MB）" />
        </div>
        <div className={u.mt12}>
          <div style={formLabel}>备注</div>
          <textarea value={form.remark} onChange={e => set('remark', e.target.value)} placeholder="可选" rows={2} className={inpClass} style={{ fontFamily: 'inherit', resize: 'none' }} />
        </div>
      </ModalV2>;
}

// ── Create Settlement Modal ───────────────────────────────────────────────────

function CreateSettlementModal({
  contribution,
  accounts,
  onClose,
  onCreated
}: {
  contribution: Contribution;
  accounts: Array<{
    id: string;
    accountName: string;
    currencyCode: string;
    currentBalance: string | number;
  }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    settlementType: 'RETURN',
    amountOriginal: '',
    cashAccountId: '',
    remark: ''
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm(f => ({
    ...f,
    [k]: v
  }));
  const needsCash = form.settlementType === 'RETURN';
  const needsRemark = form.settlementType === 'WRITE_OFF';
  async function submit() {
    if (!form.amountOriginal || Number(form.amountOriginal) <= 0) {
      setErr('请填写金额');
      return;
    }
    if (needsCash && !form.cashAccountId) {
      setErr('RETURN 类型必须指定现金账户');
      return;
    }
    if (needsRemark && !form.remark.trim()) {
      setErr('WRITE_OFF 必须填写备注');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const r = await fetch(`${API}/settlements`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          contributionId: contribution.id,
          settlementType: form.settlementType,
          currencyCode: contribution.currencyCode,
          amountOriginal: Number(form.amountOriginal),
          cashAccountId: form.cashAccountId || undefined,
          remark: form.remark.trim() || undefined
        })
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
  const inpClass = inputFieldClass;
  const stBtn: React.CSSProperties = {
    padding: '9px 22px', borderRadius: 'var(--radius-md)', border: 'none', fontSize: 14,
    fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', color: 'var(--text-on-dark)',
    background: saving ? 'var(--text-disabled)' : 'var(--color-primary)', opacity: saving ? 0.7 : 1, flex: 1,
  };
  return <ModalV2 open title="创建还款/结算" width={460} onClose={onClose} footer={<>
        <button onClick={onClose} style={{ ...secondaryActionButton, flex: 1, padding: '9px 18px' }}>取消</button>
        <button onClick={submit} disabled={saving} style={stBtn}>{saving ? '创建中…' : '创建'}</button>
      </>}>
        <div style={{ borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{contribution.shareholderName} · {contribution.contributionNo}</div>
          <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
            未结余额：{currencySymbol(contribution.currencyCode)}{fmt(contribution.balanceAmountOriginal)}
          </div>
        </div>
        {err && <div style={{ color: 'var(--status-danger)', background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-danger) 20%, transparent)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
            {err}
          </div>}

        <div className={u.mb12}>
          <div style={formLabel}>结算类型</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(SETTLEMENT_TYPE_LABELS).map(([k, v]) => {
              const active = form.settlementType === k;
              return <button key={k} onClick={() => set('settlementType', k)} style={{
                padding: '5px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'var(--bg-card)',
                color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
              }}>{v}</button>;
            })}
          </div>
        </div>

        <div className={u.mb12}>
          <div style={formLabel}>金额 <span style={{ color: 'var(--status-danger)' }}>*</span></div>
          <input type="number" min="0.01" step="0.01" value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)} placeholder="0.00" className={inpClass} />
        </div>

        {needsCash && <div className={u.mb12}>
            <div style={formLabel}>现金账户 <span style={{ color: 'var(--status-danger)' }}>*</span>（现金归还必填）</div>
            <CashAccountSelector value={form.cashAccountId} valueField="id" onChange={v => set('cashAccountId', v)} currencyCode={contribution.currencyCode} />
          </div>}

        <div className={u.mb16}>
          <div style={formLabel}>
            备注{needsRemark ? <span style={{ color: 'var(--status-danger)' }}> *（核销必填）</span> : ''}
          </div>
          <textarea value={form.remark} onChange={e => set('remark', e.target.value)} placeholder={needsRemark ? '请填写核销原因' : '可选'} rows={2} className={inpClass} style={{ fontFamily: 'inherit', resize: 'none' }} />
        </div>
      </ModalV2>;
}

// ── Contribution Detail Drawer ────────────────────────────────────────────────

function ContributionDrawer({
  contribution,
  onClose,
  onRefresh,
  onEdit
}: {
  contribution: Contribution;
  onClose: () => void;
  onRefresh: () => void;
  onEdit?: (c: Contribution) => void;
}) {
  const [detail, setDetail] = useState<{
    settlements?: Settlement[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettle, setShowSettle] = useState(false);
  const [cashAccounts, setCashAccounts] = useState<Array<{
    id: string;
    accountName: string;
    currencyCode: string;
    currentBalance: string | number;
  }>>([]);
  const [actionLoading, setActionLoading] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; danger?: boolean; onConfirm: () => void } | null>(null);
  // P1：提交审批时选审批人（候选 = 后端 eligible-approvers 权限∩数据域过滤）
  const [pickMode, setPickMode] = useState(false);
  const [approvers, setApprovers] = useState<Array<{ userId: string; displayName: string; roleNameZh: string | null }>>([]);
  const [pickedId, setPickedId] = useState('');
  const [pickLoading, setPickLoading] = useState(false);
  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch(`${API}/contributions/${contribution.id}`, {
        headers: authHeaders()
      }).then(r => r.json());
      setDetail(d);
    } finally {
      setLoading(false);
    }
  }, [contribution.id]);
  // 现金账户仅「创建结算」时才用到 → 懒加载，避免每次打开抽屉白拉 100 条拖慢加载
  const ensureCashAccounts = useCallback(async () => {
    if (cashAccounts.length > 0) return;
    try {
      const accs = await fetch('/api/v2/finance/cash/accounts?status=ACTIVE&pageSize=100', {
        headers: authHeaders()
      }).then(r => r.json());
      setCashAccounts(accs.items ?? []);
    } catch { /* 忽略 */ }
  }, [cashAccounts.length]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  async function doAction(action: string, payload: Record<string, unknown> = {}) {
    setActionLoading(action);
    setActionErr('');
    try {
      const r = await fetch(`${API}/contributions/${contribution.id}/${action}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const d = await r.json();
        setActionErr(d.message ?? '操作失败');
        return;
      }
      onRefresh();
      onClose();
    } finally {
      setActionLoading('');
    }
  }
  // 打开"选择审批人"——拉取该单据公司下、有股东资金确认权(E)的候选人
  async function openPickApprover() {
    setActionErr('');
    setPickedId('');
    setPickMode(true);
    setPickLoading(true);
    try {
      const qs = new URLSearchParams({ menuCode: 'MENU_FIN2_SHAREHOLDER', requiredPerm: 'E', companyCode: contribution.companyCode });
      const r = await fetch(`/api/approval/eligible-approvers?${qs}`, { headers: authHeaders() }).then(res => res.ok ? res.json() : []);
      setApprovers(Array.isArray(r) ? r : []);
    } catch { setApprovers([]); }
    finally { setPickLoading(false); }
  }
  async function doSettleAction(settlementId: string, action: string) {
    setActionLoading(settlementId + action);
    setActionErr('');
    try {
      const r = await fetch(`${API}/settlements/${settlementId}/${action}`, {
        method: 'POST',
        headers: authHeaders()
      });
      if (!r.ok) {
        const d = await r.json();
        setActionErr(d.message ?? '操作失败');
        return;
      }
      await loadDetail();
      onRefresh();
    } finally {
      setActionLoading('');
    }
  }
  // 确认/提交/取消/结算都是写操作，后端要求 MENU_FIN2_SHAREHOLDER:E（财务确认入账，
  // 与出纳建单的 :C 分离）。无 :E 权限不显示按钮——避免无权用户点了再被后端 403 拒。
  const { canEdit: dCanEdit } = usePermission('MENU_FIN2_SHAREHOLDER');
  const { user: authUser } = useAuth();
  // 制单/审核分离：自己创建的记录不能自己确认/提交（与后端 assertNotSelfApproval 对齐）。
  // 取消是撤回自己的草稿，允许；仅确认/提交受自审拦截。
  const isOwnRecord = !!authUser?.username && contribution.createdBy === authUser.username;
  const canConfirm = dCanEdit && !isOwnRecord && ['DRAFT', 'PENDING_CONFIRM'].includes(contribution.status);
  const canSettle = dCanEdit && ['CONFIRMED', 'PARTIALLY_SETTLED'].includes(contribution.status);
  const canCancel = dCanEdit && ['DRAFT', 'PENDING_CONFIRM'].includes(contribution.status);
  const actionBtn = (bg: string, fg: string, border: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 14px', borderRadius: 'var(--radius-md)',
    fontSize: 12, fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer',
    border: `1px solid ${border}`, background: bg, color: fg, opacity: actionLoading ? 0.5 : 1,
  });
  const settleBtnStyle = (bg: string, fg: string, border: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--radius-sm)',
    fontSize: 11, fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer',
    border: `1px solid ${border}`, background: bg, color: fg, opacity: actionLoading ? 0.5 : 1,
  });
  return <>
    <DrawerV2 open title={contribution.shareholderName} width={560} onClose={onClose}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -8, marginBottom: 16 }}>{contribution.contributionNo}</div>

        {actionErr && <div style={{ color: 'var(--status-danger)', background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-danger) 20%, transparent)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
            {actionErr}
          </div>}

        {/* 金额总览 */}
        <div style={{
        background: 'linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, black))',
        borderRadius: 12, padding: '16px 20px', marginBottom: 18, color: 'var(--text-on-dark)',
      }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
            {[{ label: '出资总额', value: fmt(contribution.amountOriginal) },
              { label: '已结算', value: fmt(contribution.settledAmountOriginal) },
              { label: '未结余额', value: fmt(contribution.balanceAmountOriginal) },
            ].map(c => <div key={c.label}>
                <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 2 }}>{c.label}</div>
                <div style={{ fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{currencySymbol(contribution.currencyCode)}{c.value}</div>
              </div>)}
          </div>
          {contribution.expectedReturnDate && <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, opacity: 0.8 }}>
              预计归还：{contribution.expectedReturnDate}
            </div>}
        </div>

        {/* 基本信息 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[{ label: '资金类型', value: <TypeBadge type={contribution.contributionType} /> },
            { label: '状态', value: <LocalStatusBadge status={contribution.status} map={STATUS_CONFIG} /> },
            { label: '公司', value: contribution.companyName ?? contribution.companyCode },
            { label: '股东出资时间', value: contribution.contributionDate ?? '—' },
            { label: '来源', value: contribution.sourceType },
          ].map(r => <div key={r.label} style={{ borderRadius: 8, padding: '8px 12px', background: 'var(--bg-muted)' }}>
              <div style={{ fontSize: 10, marginBottom: 2, color: 'var(--text-secondary)' }}>{r.label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.value}</div>
            </div>)}
        </div>

        {/* 自审提示：已提交待确认时，告诉创建者在等他人确认（制单/审核分离） */}
        {isOwnRecord && contribution.status === 'PENDING_CONFIRM' && (
          <div style={{ fontSize: 12, color: 'var(--status-warning)', background: 'color-mix(in srgb, var(--status-warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-warning) 20%, transparent)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
            已提交，等待他人复核确认 —— 你不能确认自己创建的记录（制单 / 审核分离）
          </div>
        )}
        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {/* 提交审批：创建者/有编辑权把草稿"交出去"，点击先选审批人 */}
          {dCanEdit && contribution.status === 'DRAFT' && <button onClick={() => void openPickApprover()} disabled={!!actionLoading}
            style={actionBtn('color-mix(in srgb, var(--color-accent) 10%, transparent)', 'var(--color-accent)', 'color-mix(in srgb, var(--color-accent) 30%, transparent)')}>
              <AlertCircle size={12} /> 提交审批
            </button>}
          {/* 直接确认入账：仅他人可操作（自审拦截） */}
          {canConfirm && <button onClick={() => doAction('confirm-direct')} disabled={!!actionLoading}
            style={actionBtn('color-mix(in srgb, var(--status-success) 10%, transparent)', 'var(--status-success)', 'color-mix(in srgb, var(--status-success) 30%, transparent)')}>
              <CheckCircle size={12} /> 直接确认
            </button>}
          {/* 编辑草稿：仅草稿可改 */}
          {dCanEdit && contribution.status === 'DRAFT' && onEdit && <button onClick={() => { onClose(); onEdit(contribution); }} disabled={!!actionLoading}
            style={actionBtn('color-mix(in srgb, var(--color-primary) 10%, transparent)', 'var(--color-primary)', 'color-mix(in srgb, var(--color-primary) 30%, transparent)')}>
              <AlertCircle size={12} /> 编辑
            </button>}
          {canSettle && <button onClick={() => { void ensureCashAccounts(); setShowSettle(true); }}
            style={actionBtn('color-mix(in srgb, var(--color-primary) 10%, transparent)', 'var(--color-primary)', 'color-mix(in srgb, var(--color-primary) 30%, transparent)')}>
              <ArrowDownLeft size={12} /> 创建结算
            </button>}
          {canCancel && <button onClick={() => setConfirmDialog({
              title: contribution.status === 'DRAFT' ? '删除草稿' : '取消股东资金记录',
              message: contribution.status === 'DRAFT' ? '确认删除该草稿？删除后不可恢复。' : '确认取消该股东资金记录？取消后不可恢复。', danger: true,
              onConfirm: () => { setConfirmDialog(null); void doAction('cancel', {}); },
            })} disabled={!!actionLoading}
            style={actionBtn('color-mix(in srgb, var(--status-danger) 10%, transparent)', 'var(--status-danger)', 'color-mix(in srgb, var(--status-danger) 30%, transparent)')}>
              <X size={12} /> {contribution.status === 'DRAFT' ? '删除' : '取消'}
            </button>}
        </div>

        {/* 结算记录 */}
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--text-secondary)' }}>结算记录</div>
        {loading ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>加载中…</div>
          : !detail?.settlements?.length ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)', fontSize: 13, background: 'var(--bg-muted)', borderRadius: 10 }}>暂无结算记录</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(detail.settlements as Settlement[]).map(s => {
          const sc = SETTLEMENT_STATUS_CONFIG[s.status] ?? { label: s.status, badgeClass: '' };
          const badgeColor = s.status === 'SETTLED' ? 'var(--status-success)' : s.status === 'PENDING_APPROVAL' ? 'var(--status-warning)' : s.status === 'APPROVED' ? 'var(--color-accent)' : 'var(--text-secondary)';
          return <div key={s.id} style={{ borderRadius: 10, padding: '10px 14px', background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>{s.settlementNo}</span>
                      <span style={{ fontSize: 11, marginLeft: 8, color: 'var(--text-secondary)' }}>{SETTLEMENT_TYPE_LABELS[s.settlementType] ?? s.settlementType}</span>
                    </div>
                    <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: `color-mix(in srgb, ${badgeColor} 14%, transparent)`, color: badgeColor }}>{sc.label}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--color-primary)' }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{currencySymbol(s.currencyCode)}{fmt(s.amountOriginal)}</span>
                  </div>
                  {s.cashAccountCode && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>现金账户：{s.cashAccountCode}</div>}

                  {!['SETTLED', 'CANCELLED'].includes(s.status) && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {s.status === 'DRAFT' && <button onClick={() => doSettleAction(s.id, 'submit')} disabled={!!actionLoading}
                        style={settleBtnStyle('color-mix(in srgb, var(--color-accent) 10%, transparent)', 'var(--color-accent)', 'color-mix(in srgb, var(--color-accent) 30%, transparent)')}>
                          提交审批
                        </button>}
                      {s.status === 'PENDING_APPROVAL' && <button onClick={() => doSettleAction(s.id, 'approve-direct')} disabled={!!actionLoading}
                        style={settleBtnStyle('color-mix(in srgb, var(--status-success) 10%, transparent)', 'var(--status-success)', 'color-mix(in srgb, var(--status-success) 30%, transparent)')}>
                          直接批准
                        </button>}
                      {s.status === 'APPROVED' && <button onClick={() => setConfirmDialog({
                          title: '执行结算', message: `确认执行结算 ${s.settlementNo}？将实际操作资金。`,
                          onConfirm: () => { setConfirmDialog(null); void doSettleAction(s.id, 'execute'); },
                        })} disabled={!!actionLoading}
                        style={settleBtnStyle('color-mix(in srgb, var(--status-success) 10%, transparent)', 'var(--status-success)', 'color-mix(in srgb, var(--status-success) 30%, transparent)')}>
                          执行结算
                        </button>}
                      <button onClick={() => setConfirmDialog({
                          title: '取消结算', message: '确认取消此结算？', danger: true,
                          onConfirm: () => { setConfirmDialog(null); void doSettleAction(s.id, 'cancel'); },
                        })} disabled={!!actionLoading}
                        style={settleBtnStyle('color-mix(in srgb, var(--status-danger) 10%, transparent)', 'var(--status-danger)', 'color-mix(in srgb, var(--status-danger) 30%, transparent)')}>
                        取消
                      </button>
                    </div>}
                </div>;
        })}
          </div>}

        {contribution.remark && <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, fontSize: 12, background: 'color-mix(in srgb, var(--status-warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-warning) 20%, transparent)', color: 'var(--text-primary)' }}>
            备注：{contribution.remark}
          </div>}
      </DrawerV2>

      {showSettle && <CreateSettlementModal contribution={contribution} accounts={cashAccounts} onClose={() => setShowSettle(false)} onCreated={() => {
      setShowSettle(false);
      void loadDetail();
      onRefresh();
    }} />}
      <ConfirmDialogV2 open={!!confirmDialog} title={confirmDialog?.title} message={confirmDialog?.message ?? ''} danger={confirmDialog?.danger}
        loading={!!actionLoading} onConfirm={() => confirmDialog?.onConfirm()} onCancel={() => setConfirmDialog(null)} />

      {/* P1：提交审批 → 选择审批人 */}
      {pickMode && <ModalV2 open title="提交审批 · 选择审批人" width={460} onClose={() => setPickMode(false)} footer={<div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button onClick={() => setPickMode(false)} style={{ ...secondaryActionButton, flex: 1 }}>取消</button>
            <button onClick={() => { setPickMode(false); void doAction('submit-confirm', {}); }} style={{ ...secondaryActionButton, flex: 1.4 }}>不指定，提交待确认</button>
            <button onClick={() => { if (!pickedId) return; setPickMode(false); void doAction('submit-confirm', { approverUserId: pickedId }); }} disabled={!pickedId}
              style={{ flex: 1.6, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none', fontSize: 14, fontWeight: 600, color: 'var(--text-on-dark)', background: pickedId ? 'var(--color-primary)' : 'var(--text-disabled)', cursor: pickedId ? 'pointer' : 'not-allowed' }}>提交给所选</button>
          </div>}>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
            选一位有确认权、且数据域覆盖本公司的审批人；提交后对方会收到待办通知。也可"不指定"，由任一有权同事确认。
          </div>
          {pickLoading ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>加载候选人…</div>
            : approvers.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--status-warning)', fontSize: 12.5, lineHeight: 1.6 }}>
                无可选审批人（无人同时具备确认权与本公司数据域）。可点"不指定"提交，由有权同事确认。
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {approvers.map(a => (
                  <div key={a.userId} onClick={() => setPickedId(a.userId)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${pickedId === a.userId ? 'var(--color-primary)' : 'var(--border)'}`,
                      background: pickedId === a.userId ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--bg-card)' }}>
                    <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 8, background: pickedId === a.userId ? 'var(--color-primary)' : 'var(--border)' }} />
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{a.displayName}</span>
                    {a.roleNameZh && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>{a.roleNameZh}</span>}
                  </div>
                ))}
              </div>}
        </ModalV2>}
    </>;
}

// ── Summary Tab ───────────────────────────────────────────────────────────────

function SummaryTab({
  summary,
  pending,
  canConfirm,
  onOpen,
  onViewAll,
}: {
  summary: ShSummary | null;
  pending: Contribution[];
  canConfirm: boolean;
  onOpen: (c: Contribution) => void;
  onViewAll?: () => void;
}) {
  if (!summary) return <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 32 }}>加载中…</div>;
  const statCards: { label: string; value: string; color: string }[] = [
    { label: '出资总额', value: `¥ ${fmt(summary.totalAmountOriginal)}`, color: 'var(--color-primary)' },
    { label: '已结算', value: `¥ ${fmt(summary.settledAmountOriginal)}`, color: 'var(--status-success)' },
    { label: '未结余额', value: `¥ ${fmt(summary.balanceAmountOriginal)}`, color: 'var(--status-danger)' },
    { label: '已确认笔数', value: `${summary.confirmedContributions} 笔`, color: 'var(--color-accent)' },
    { label: '待处理（含草稿）', value: `${summary.pendingConfirmations} 笔`, color: 'var(--status-warning)' },
  ];
  return <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 24 }}>
        {statCards.map(c => (
          <div key={c.label} style={kpiCard}>
            <div style={statTileLabel}>{c.label}</div>
            <div style={{ fontSize: 20, lineHeight: 1.2, marginTop: 2, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* 待处理明细——就地可确认（替代原"卡片快捷链跳转"，确认入口直接在眼前） */}
      {pending.length > 0 && <div style={{ ...tableContainer, padding: '16px 18px', marginBottom: 24, borderColor: 'var(--status-warning)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--status-warning)' }}>
            待处理明细 · {pending.length} 笔（{canConfirm ? '点击记录即可确认入账' : '点击查看详情'}）
          </div>
          {onViewAll && <button onClick={onViewAll} style={{ ...secondaryActionButton, padding: '4px 12px', fontSize: 12 }}>在台账中查看 →</button>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pending.map(c => (
            <div key={c.id} onClick={() => onOpen(c)} style={{ ...businessListCard('warning'), cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{c.shareholderName}</span>
                <TypeBadge type={c.contributionType} />
                <LocalStatusBadge status={c.status} map={STATUS_CONFIG} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.contributionNo}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{currencySymbol(c.currencyCode)}{fmt(c.amountOriginal)}</span>
                <ChevronRight size={15} style={{ color: 'var(--text-secondary)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ ...tableContainer, padding: '16px 18px' }}>
          <div style={sectionTitle}>按股东分布</div>
          {summary.byShareholder.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', padding: 16 }}>暂无数据</div> : summary.byShareholder.map(r => <div key={r.shareholder_name} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0',
          borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
        }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.shareholder_name}</div>
                <div className={u.fs11} style={{ color: 'var(--text-secondary)' }}>{r.cnt} 笔</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>¥ {fmt(r.balance)}</div>
            </div>)}
        </div>

        <div style={{ ...tableContainer, padding: '16px 18px' }}>
          <div style={sectionTitle}>按资金类型</div>
          {summary.byContributionType.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', padding: 16 }}>暂无数据</div> : summary.byContributionType.map(r => <div key={r.contribution_type} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0',
          borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
        }}>
              <div className={u.flexRow8}>
                <TypeBadge type={r.contribution_type} />
                <span className={u.fs11} style={{ color: 'var(--text-secondary)' }}>{r.cnt} 笔</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>¥ {fmt(r.total)}</div>
            </div>)}
        </div>
      </div>

      {summary.upcomingReturns.length > 0 && <div style={{
      ...tableContainer, borderColor: 'var(--status-warning)', padding: '16px 18px',
    }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--status-warning)' }}>即将到期归还（30 天内）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {summary.upcomingReturns.map(r => <div key={r.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8,
          background: 'color-mix(in srgb, var(--status-warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-warning) 20%, transparent)',
        }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>{r.contribution_no}</div>
                  <div className={u.fs11} style={{ color: 'var(--text-secondary)' }}>{r.shareholder_name} · 到期：{r.expected_return_date}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--status-warning)', fontVariantNumeric: 'tabular-nums' }}>¥ {fmt(r.balance_amount_original)}</div>
              </div>)}
          </div>
        </div>}
    </div>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ShareholderFundsPage() {
  // 权限门控（G47）：新建/导入股东资金记录受 MENU_FIN2_SHAREHOLDER:E 约束，
  // 刘杰等仅查看角色(V,X)不应看到写入口。
  const { canCreate, canEdit } = usePermission('MENU_FIN2_SHAREHOLDER');
  const canWrite = canCreate || canEdit;
  const [tab, setTab] = useState<'contributions' | 'settlements' | 'summary'>('contributions');
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [summary, setSummary] = useState<ShSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedC, setSelectedC] = useState<Contribution | null>(null);
  const [pendingList, setPendingList] = useState<Contribution[]>([]);
  const [editingC, setEditingC] = useState<Contribution | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const loadSummary = useCallback(async () => {
    try {
      const sumRes = await fetch(`${API}/contributions/summary`, {
        headers: authHeaders()
      }).then(r => r.ok ? r.json() : null);
      const raw = sumRes as { totals?: Record<string, unknown>; byType?: Array<Record<string, unknown>>; byStatus?: Array<Record<string, unknown>> } | null;
      if (raw && raw.totals) {
        const t = raw.totals; const byStatus = raw.byStatus ?? [];
        const cntOf = (sts: string[]) => byStatus.filter(s => sts.includes(String(s.status))).reduce((a, s) => a + Number(s.cnt ?? 0), 0);
        setSummary({
          totalContributions:    Number(t.total_count ?? 0),
          confirmedContributions: cntOf(['CONFIRMED', 'ACTIVE', 'SETTLED']),
          pendingConfirmations:   cntOf(['PENDING_CONFIRM', 'PENDING_CONFIRMATION', 'PENDING']) + cntOf(['DRAFT']),
          totalAmountOriginal:    Number(t.total_amount_original ?? 0),
          settledAmountOriginal:  Number(t.total_settled ?? 0),
          balanceAmountOriginal:  Number(t.total_balance ?? 0),
          byShareholder:      [],
          byContributionType: (raw.byType ?? []).map(x => ({ contribution_type: String(x.contribution_type ?? ''), cnt: String(x.cnt ?? 0), total: String(x.amount ?? 0) })),
          upcomingReturns:    [],
        });
      } else {
        setSummary(null);
      }
    } catch { /* summary 加载失败不阻塞列表 */ }
  }, []);
  // 待处理明细（status=PENDING 经后端展开为 DRAFT+PENDING_CONFIRM）——汇总页就地展示+确认
  const loadPending = useCallback(async () => {
    try {
      const res = await fetch(`${API}/contributions?status=PENDING&pageSize=100`, {
        headers: authHeaders(),
      }).then(r => (r.ok ? r.json() : { items: [] }));
      setPendingList(res.items ?? []);
    } catch { setPendingList([]); }
  }, []);
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set('keyword', keyword);
      if (typeFilter) params.set('contributionType', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('pageSize', '100');
      const listRes = await fetch(`${API}/contributions?${params}`, {
        headers: authHeaders()
      }).then(r => r.json());
      setContributions(listRes.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [keyword, typeFilter, statusFilter]);
  const loadSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/settlements?pageSize=100`, {
        headers: authHeaders()
      }).then(r => r.json());
      setSettlements(res.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  // summary 只在首次 + 写操作后加载，不跟随筛选条件
  useEffect(() => { void loadSummary(); }, [loadSummary]);
  // 进入汇总页时加载待处理明细（就地确认用）
  useEffect(() => { if (tab === 'summary') void loadPending(); }, [tab, loadPending]);
  // 列表请求防抖 300ms
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (tab === 'contributions') {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void loadList(), 300);
      return () => clearTimeout(debounceRef.current);
    }
    if (tab === 'settlements') void loadSettlements();
  }, [tab, loadList, loadSettlements]);
  async function importFromPrc2() {
    if (!confirm('确认从采购系统导入股东资金记录？已存在的记录将自动跳过，不会重复导入。')) return;
    setImportLoading(true);
    try {
      const r = await fetch(`${API}/import-from-prc2`, {
        method: 'POST',
        headers: authHeaders()
      });
      const d = (await r.json()) as {
        imported?: number;
        skipped?: number;
        failed?: number;
      };
      alert(`导入完成：成功 ${d.imported ?? 0}，跳过 ${d.skipped ?? 0}，失败 ${d.failed ?? 0}`);
      void Promise.all([loadList(), loadSummary()]);
    } catch {
      alert('导入失败');
    } finally {
      setImportLoading(false);
    }
  }
  const tabs = [{
    key: 'contributions' as const,
    label: '股东资金台账'
  }, {
    key: 'settlements' as const,
    label: '结算记录'
  }, {
    key: 'summary' as const,
    label: '汇总分析'
  }];
  return <div>
      <PageHeader title="股东资金管理" subtitle="股东出资台账 · 结算审批 · 资金账户联动" breadcrumb={['财务管理', '股东资金']} actions={<div style={{
      display: 'flex',
      gap: 8
    }}>
            {canWrite && (
              <button onClick={() => void importFromPrc2()} disabled={importLoading} style={secondaryActionButton}>
                <Upload size={14} /> {importLoading ? '导入中…' : '从采购系统导入'}
              </button>
            )}
            {canWrite && (
              <button onClick={() => setShowCreate(true)} style={primaryActionButton}>
                <Plus size={15} /> 新建记录
              </button>
            )}
          </div>} />

      {/* Tab 切换 */}
      <div style={tabBar}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabItem(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && <SummaryTab summary={summary} pending={pendingList} canConfirm={canWrite}
        onOpen={(c) => setSelectedC(c)}
        onViewAll={() => { setStatusFilter('PENDING'); setTab('contributions'); }} />}

      {tab === 'contributions' && <>
          {/* 筛选 工具栏 */}
          <div style={searchToolbar}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} color="var(--text-secondary)" style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }} />
              <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索股东名称/单号…" style={{ ...inputField, paddingLeft: 34, fontSize: 13 }} />
            </div>

            {[{
              k: '',
              v: '全部类型'
            }, ...Object.entries(CONTRIBUTION_TYPE_LABELS).map(([k, v]) => ({
              k,
              v
            }))].map(({ k, v }) => (
              <button key={k} onClick={() => setTypeFilter(k)} style={toolbarFilterPill(typeFilter === k)}>{v}</button>
            ))}

            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

            {[{
              k: '',
              v: '全部'
            }, {
              k: 'PENDING',
              v: '待处理'
            }, {
              k: 'CONFIRMED',
              v: '已确认'
            }, {
              k: 'PARTIALLY_SETTLED',
              v: '部分结算'
            }, {
              k: 'SETTLED',
              v: '已结清'
            }].map(({ k, v }) => (
              <button key={k} onClick={() => setStatusFilter(k)} style={toolbarFilterPill(statusFilter === k)}>{v}</button>
            ))}

            <button onClick={() => void Promise.all([loadList(), loadSummary()])} disabled={loading} style={secondaryActionButton}>
              <RefreshCw size={14} />
            </button>
          </div>

          {loading ? <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '48px 0' }}>加载中…</div> : contributions.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '48px 0' }}>
              <Users size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
              暂无股东资金记录
            </div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contributions.map(c => {
                const tone: Parameters<typeof businessListCard>[0] =
                  c.status === 'SETTLED' ? 'default' :
                  c.status === 'PENDING_CONFIRM' ? 'warning' :
                  c.status === 'PARTIALLY_SETTLED' ? 'info' :
                  c.status === 'CONFIRMED' ? 'success' : 'default';
                return <div key={c.id} onClick={() => setSelectedC(c)} style={{
                  ...businessListCard(tone),
                  opacity: c.status === 'CANCELLED' ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{c.shareholderName}</span>
                    <TypeBadge type={c.contributionType} />
                    <LocalStatusBadge status={c.status} map={STATUS_CONFIG} />
                    <span style={{ fontSize: 11, marginLeft: 'auto', color: 'var(--text-secondary)' }}>{c.contributionNo}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div>
                      <div className={u.fs10} style={{ color: 'var(--text-secondary)' }}>出资总额</div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{currencySymbol(c.currencyCode)}{fmt(c.amountOriginal)}</div>
                    </div>
                    <div>
                      <div className={u.fs10} style={{ color: 'var(--text-secondary)' }}>股东出资时间</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{c.contributionDate ?? '—'}</div>
                    </div>
                    <div>
                      <div className={u.fs10} style={{ color: 'var(--text-secondary)' }}>未结余额</div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: Number(c.balanceAmountOriginal) > 0 ? 'var(--status-danger)' : 'var(--status-success)' }}>
                        {currencySymbol(c.currencyCode)}{fmt(c.balanceAmountOriginal)}
                      </div>
                    </div>
                    {c.expectedReturnDate && <div>
                        <div className={u.fs10} style={{ color: 'var(--text-secondary)' }}>预计归还</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--status-warning)' }}>{c.expectedReturnDate}</div>
                      </div>}
                    <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
                  </div>
                </div>;
              })}
            </div>}
        </>}

      {tab === 'settlements' && <>
          <div style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className={u.fs13} style={{ color: 'var(--text-secondary)' }}>共 {settlements.length} 条结算记录</span>
            <button onClick={() => void loadSettlements()} style={secondaryActionButton}>
              <RefreshCw size={13} />
            </button>
          </div>
          {loading ? <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '48px 0' }}>加载中…</div> : settlements.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '48px 0' }}>暂无结算记录</div> : <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
              {settlements.map(s => {
          const sc = SETTLEMENT_STATUS_CONFIG[s.status] ?? { label: s.status, color: 'var(--text-secondary)' };
          return <div key={s.id} style={{ borderRadius: 12, padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div className={u.flexBetween}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{s.settlementNo}</span>
                          <span className={u.fs11} style={{ color: 'var(--text-secondary)' }}>{SETTLEMENT_TYPE_LABELS[s.settlementType] ?? s.settlementType}</span>
                          <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: `color-mix(in srgb, ${sc.color} 14%, transparent)`, color: sc.color }}>{sc.label}</span>
                        </div>
                        <div className={u.fs12} style={{ color: 'var(--text-secondary)' }}>
                          {s.shareholderName} · 出资单：{s.contributionNo}
                          {s.cashAccountCode ? ` · 现金账户：${s.cashAccountCode}` : ''}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-primary)' }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{currencySymbol(s.currencyCode)}{fmt(s.amountOriginal)}</span>
                      </div>
                    </div>
                  </div>;
        })}
            </div>}
        </>}

      {showCreate && <CreateContributionModal onClose={() => setShowCreate(false)} onCreated={() => {
      setShowCreate(false);
      void Promise.all([loadList(), loadSummary()]);
    }} />}
      {selectedC && <ContributionDrawer contribution={selectedC} onClose={() => setSelectedC(null)} onEdit={(c) => setEditingC(c)} onRefresh={() => void Promise.all([loadList(), loadSummary(), loadPending()])} />}
      {editingC && <CreateContributionModal editing={editingC} onClose={() => setEditingC(null)} onCreated={() => {
        setEditingC(null);
        void Promise.all([loadList(), loadSummary(), loadPending()]);
      }} />}
    </div>;
}
