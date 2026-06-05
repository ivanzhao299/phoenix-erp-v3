'use client';

import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import { Users, Plus, Search, RefreshCw, X, CheckCircle, Clock, AlertCircle, Upload, ChevronRight, TrendingDown, DollarSign, ArrowDownLeft } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { DictSelect } from '@/components/shared-selectors/DictSelect';
import { CompanySelector, ShareholderSelector, CashAccountSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { AttachmentUploader } from '@/components/design-system';

import {
  primaryActionButton, secondaryActionButton, modalMask, modalPanel, inputField, formLabel,
  drawerMask, drawerPanel, drawerHeader, drawerHeaderTitle, drawerCloseButton, drawerFooter,
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
  expectedReturnDate: string | null;
  status: string;
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
const STATUS_CONFIG: Record<string, {
  label: string;
  badgeClass: string;
}> = {
  DRAFT: {
    label: '草稿',
    badgeClass: 'bg-bg-muted text-text-muted'
  },
  PENDING_CONFIRM: {
    label: '待确认',
    badgeClass: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
  },
  CONFIRMED: {
    label: '已确认',
    badgeClass: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300'
  },
  PARTIALLY_SETTLED: {
    label: '部分结算',
    badgeClass: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
  },
  SETTLED: {
    label: '已结清',
    badgeClass: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
  },
  CANCELLED: {
    label: '已取消',
    badgeClass: 'bg-bg-muted text-text-dim'
  }
};
const SETTLEMENT_STATUS_CONFIG: Record<string, {
  label: string;
  badgeClass: string;
}> = {
  DRAFT: {
    label: '草稿',
    badgeClass: 'bg-bg-muted text-text-muted'
  },
  PENDING_APPROVAL: {
    label: '待审批',
    badgeClass: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
  },
  APPROVED: {
    label: '已批准',
    badgeClass: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300'
  },
  SETTLED: {
    label: '已结清',
    badgeClass: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
  },
  CANCELLED: {
    label: '已取消',
    badgeClass: 'bg-bg-muted text-text-dim'
  }
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

function StatusBadge({
  status,
  map
}: {
  status: string;
  map: Record<string, {
    label: string;
    badgeClass: string;
  }>;
}) {
  const c = map[status] ?? {
    label: status,
    badgeClass: 'bg-bg-muted text-text-muted'
  };
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.badgeClass}`}>
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
  onCreated
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    shareholderName: '',
    shareholderCode: '',
    companyCode: '',
    companyName: '',
    contributionType: 'LOAN',
    currencyCode: 'CNY',
    amountOriginal: '',
    expectedReturnDate: '',
    remark: '',
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
    setSaving(true);
    setErr('');
    try {
      const r = await fetch(`${API}/contributions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          shareholderName: form.shareholderName.trim(),
          shareholderCode: form.shareholderCode.trim() || undefined,
          companyCode: form.companyCode.trim(),
          companyName: form.companyName.trim() || undefined,
          contributionType: form.contributionType,
          currencyCode: form.currencyCode.trim().toUpperCase(),
          amountOriginal: Number(form.amountOriginal),
          expectedReturnDate: form.expectedReturnDate || undefined,
          remark: form.remark.trim() || undefined,
          voucherUrl: form.voucherUrl || undefined
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
  const inpClass = "w-full px-3 py-2 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 box-border";
  return <div style={modalMask}>
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
        }}>新建股东资金记录</div>
          <button onClick={onClose} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer'
        }}><X size={18} className="text-text-dim" /></button>
        </div>
        {err && <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2 mb-3.5">
            {err}
          </div>}
        <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12
      }}>
          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>股东 <span className="text-red-500">*</span></div>
            {/* G4-A：股东主数据，自动带出姓名 */}
            <ShareholderSelector value={form.shareholderCode} onChange={v => set('shareholderCode', v)} onPick={o => set('shareholderName', o?.raw?.shareholderName ?? o?.raw?.shareholder_name ?? o?.label ?? '')} />
          </div>
          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>股东姓名</div>
            <input className={inpClass} value={form.shareholderName} readOnly style={{
            background: 'var(--bg-muted)',
            cursor: 'not-allowed'
          }} placeholder="由股东选择自动带出" />
          </div>
          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>公司 <span className="text-red-500">*</span></div>
            {/* G4-A：公司主数据，DataScope 自动过滤 */}
            <CompanySelector value={form.companyCode} onChange={v => set('companyCode', v)} onPick={o => set('companyName', o?.label ?? '')} />
          </div>
          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>公司名称</div>
            <input className={inpClass} value={form.companyName} readOnly style={{
            background: 'var(--bg-muted)',
            cursor: 'not-allowed'
          }} placeholder="由公司选择自动带出" />
          </div>
          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>货币 <span className="text-red-500">*</span></div>
            {/* G4-A：货币枚举来自 sys_dict(SYS_CURRENCY) */}
            <DictSelect dictType="SYS_CURRENCY" value={form.currencyCode} onChange={v => set('currencyCode', v)} allowEmpty={false} />
          </div>
          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>金额 <span className="text-red-500">*</span></div>
            <input type="number" min="0.01" step="0.01" value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)} placeholder="0.00" className={inpClass} />
          </div>
          <div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4
          }}>预计归还日期</div>
            <input type="date" value={form.expectedReturnDate} onChange={e => set('expectedReturnDate', e.target.value)} className={inpClass} />
          </div>
        </div>
        <div className={u.mt12}>
          <div className="text-text-muted" style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 4
        }}>资金类型 <span className="text-red-500">*</span></div>
          {/* G4-A：资金类型枚举来自 sys_dict(FIN_CONTRIBUTION_TYPE) */}
          <DictSelect dictType="FIN_CONTRIBUTION_TYPE" value={form.contributionType} onChange={v => set('contributionType', v)} allowEmpty={false} />
        </div>
        <div className={u.mt12}>
          <div className="text-text-muted" style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 4
        }}>出资凭证</div>
          {/* G4-A：禁止 URL 文本框，统一附件上传 */}
          <AttachmentUploader value={form.voucherUrl ? [form.voucherUrl] : []} onChange={urls => set('voucherUrl', urls[urls.length - 1] ?? '')} label="上传出资凭证（PDF/图片 ≤15MB）" />
        </div>
        <div className={u.mt12}>
          <div className="text-text-muted" style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 4
        }}>备注</div>
          <textarea value={form.remark} onChange={e => set('remark', e.target.value)} placeholder="可选" rows={2} className={`${inpClass} resize-none`} style={{
          fontFamily: 'inherit'
        }} />
        </div>
        <div style={{
        display: 'flex',
        gap: 10,
        justifyContent: 'flex-end',
        marginTop: 20
      }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border bg-bg-page text-sm text-text-muted cursor-pointer hover:bg-bg-muted transition-colors">取消</button>
          <button onClick={submit} disabled={saving} className={`px-5 py-2 rounded-lg border-none text-sm font-semibold text-white cursor-pointer transition-colors ${saving ? 'bg-violet-300 dark:bg-violet-800 cursor-not-allowed' : 'bg-violet-700 hover:bg-violet-800'}`}>
            {saving ? '创建中…' : '创建记录'}
          </button>
        </div>
      </div>
    </div>;
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
  const inpClass = "w-full px-3 py-2 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 box-border";
  return <div style={modalMask}>
      <div style={modalPanel(460)} onClick={e => e.stopPropagation()}>
        <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
      }}>
          <div className="text-text" style={{
          fontWeight: 700,
          fontSize: 15
        }}>创建还款/结算</div>
          <button onClick={onClose} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer'
        }}><X size={17} className="text-text-dim" /></button>
        </div>
        <div className="bg-bg-muted/50" style={{
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 16,
        fontSize: 12
      }}>
          <div className={`text-text-muted ${u.fw600}`}>{contribution.shareholderName} · {contribution.contributionNo}</div>
          <div className="text-text-muted" style={{
          marginTop: 2
        }}>
            未结余额：{contribution.currencyCode} {fmt(contribution.balanceAmountOriginal)}
          </div>
        </div>
        {err && <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2 mb-3.5">
            {err}
          </div>}

        <div className={u.mb12}>
          <div className="text-text-muted" style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 4
        }}>结算类型</div>
          <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap'
        }}>
            {Object.entries(SETTLEMENT_TYPE_LABELS).map(([k, v]) => <button key={k} onClick={() => set('settlementType', k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${form.settlementType === k ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-border bg-bg-card text-text-muted hover:bg-bg-muted'}`}>{v}</button>)}
          </div>
        </div>

        <div className={u.mb12}>
          <div className="text-text-muted" style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 4
        }}>金额 <span className="text-red-500">*</span></div>
          <input type="number" min="0.01" step="0.01" value={form.amountOriginal} onChange={e => set('amountOriginal', e.target.value)} placeholder="0.00" className={inpClass} />
        </div>

        {needsCash && <div className={u.mb12}>
            <div className="text-text-muted" style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 4
        }}>现金账户 <span className="text-red-500">*</span>（RETURN 必填）</div>
            {/* G4-A：资金账户主数据，value=id；按 contribution 币种过滤 */}
            <CashAccountSelector value={form.cashAccountId} valueField="id" onChange={v => set('cashAccountId', v)} currencyCode={contribution.currencyCode} />
          </div>}

        <div className={u.mb16}>
          <div className="text-text-muted" style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 4
        }}>
            备注{needsRemark ? <span className="text-red-500"> *（WRITE_OFF 必填）</span> : ''}
          </div>
          <textarea value={form.remark} onChange={e => set('remark', e.target.value)} placeholder={needsRemark ? '请填写核销原因' : '可选'} rows={2} className={`${inpClass} resize-none`} style={{
          fontFamily: 'inherit'
        }} />
        </div>

        <div style={{
        display: 'flex',
        gap: 10,
        justifyContent: 'flex-end'
      }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border bg-bg-page text-sm text-text-muted cursor-pointer hover:bg-bg-muted transition-colors">取消</button>
          <button onClick={submit} disabled={saving} className={`px-5 py-2 rounded-lg border-none text-sm font-semibold text-white cursor-pointer transition-colors ${saving ? 'bg-blue-300 dark:bg-blue-800 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {saving ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>;
}

// ── Contribution Detail Drawer ────────────────────────────────────────────────

function ContributionDrawer({
  contribution,
  onClose,
  onRefresh
}: {
  contribution: Contribution;
  onClose: () => void;
  onRefresh: () => void;
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
  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [d, accs] = await Promise.all([fetch(`${API}/contributions/${contribution.id}`, {
        headers: authHeaders()
      }).then(r => r.json()), fetch('/api/v2/finance/cash/accounts?status=ACTIVE&pageSize=100', {
        headers: authHeaders()
      }).then(r => r.json())]);
      setDetail(d);
      setCashAccounts(accs.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [contribution.id]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  async function doAction(action: string, payload: Record<string, unknown> = {}) {
    setActionLoading(action);
    try {
      const r = await fetch(`${API}/contributions/${contribution.id}/${action}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const d = await r.json();
        alert(d.message ?? '操作失败');
        return;
      }
      onRefresh();
      onClose();
    } finally {
      setActionLoading('');
    }
  }
  async function doSettleAction(settlementId: string, action: string) {
    setActionLoading(settlementId + action);
    try {
      const r = await fetch(`${API}/settlements/${settlementId}/${action}`, {
        method: 'POST',
        headers: authHeaders()
      });
      if (!r.ok) {
        const d = await r.json();
        alert(d.message ?? '操作失败');
        return;
      }
      await loadDetail();
      onRefresh();
    } finally {
      setActionLoading('');
    }
  }
  const canConfirm = ['DRAFT', 'PENDING_CONFIRM'].includes(contribution.status);
  const canSettle = ['CONFIRMED', 'PARTIALLY_SETTLED'].includes(contribution.status);
  const canCancel = ['DRAFT', 'PENDING_CONFIRM'].includes(contribution.status);
  return <div style={drawerMask}>
      <div className="bg-bg-card" style={{
      width: 560,
      height: '100vh',
      overflowY: 'auto',
      padding: 24,
      boxShadow: '-8px 0 32px var(--overlay-black-10)'
    }}>
        <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16
      }}>
          <div>
            <div className="text-text" style={{
            fontWeight: 700,
            fontSize: 16
          }}>{contribution.shareholderName}</div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            marginTop: 2
          }}>{contribution.contributionNo}</div>
          </div>
          <button onClick={onClose} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer'
        }}><X size={18} className="text-text-dim" /></button>
        </div>

        {/* 金额总览 */}
        <div style={{
        background: 'linear-gradient(135deg,var(--violet-900),var(--color-purple-600))',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 18,
        color: 'var(--bg-card)'
      }}>
          <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          textAlign: 'center'
        }}>
            {[{
            label: '出资总额',
            value: fmt(contribution.amountOriginal)
          }, {
            label: '已结算',
            value: fmt(contribution.settledAmountOriginal)
          }, {
            label: '未结余额',
            value: fmt(contribution.balanceAmountOriginal)
          }].map(c => <div key={c.label}>
                <div style={{
              fontSize: 10,
              opacity: 0.8,
              marginBottom: 2
            }}>{c.label}</div>
                <div style={{
              fontWeight: 800,
              fontSize: 16
            }}>{contribution.currencyCode} {c.value}</div>
              </div>)}
          </div>
          {contribution.expectedReturnDate && <div style={{
          textAlign: 'center',
          marginTop: 10,
          fontSize: 11,
          opacity: 0.8
        }}>
              预计归还：{contribution.expectedReturnDate}
            </div>}
        </div>

        {/* 基本信息 */}
        <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        marginBottom: 16
      }}>
          {[{
          label: '资金类型',
          value: <TypeBadge type={contribution.contributionType} />
        }, {
          label: '状态',
          value: <StatusBadge status={contribution.status} map={STATUS_CONFIG} />
        }, {
          label: '公司',
          value: contribution.companyName ?? contribution.companyCode
        }, {
          label: '来源',
          value: contribution.sourceType
        }].map(r => <div key={r.label} className="bg-bg-muted/50" style={{
          borderRadius: 8,
          padding: '8px 12px'
        }}>
              <div className="text-text-dim" style={{
            fontSize: 10,
            marginBottom: 2
          }}>{r.label}</div>
              <div className="text-text" style={{
            fontSize: 12,
            fontWeight: 600
          }}>{r.value}</div>
            </div>)}
        </div>

        {/* 操作按钮 */}
        <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 18,
        flexWrap: 'wrap'
      }}>
          {canConfirm && <button onClick={() => doAction('confirm-direct')} disabled={!!actionLoading} className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 disabled:opacity-50 transition-colors">
              <CheckCircle size={12} /> 直接确认
            </button>}
          {contribution.status === 'DRAFT' && <button onClick={() => doAction('submit-confirm')} disabled={!!actionLoading} className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-info/20 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 disabled:opacity-50 transition-colors">
              <AlertCircle size={12} /> 提交确认
            </button>}
          {canSettle && <button onClick={() => setShowSettle(true)} className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 transition-colors">
              <ArrowDownLeft size={12} /> 创建结算
            </button>}
          {canCancel && <button onClick={() => {
          if (confirm('确认取消该股东资金记录？')) void doAction('cancel', {});
        }} disabled={!!actionLoading} className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-danger/20 bg-danger/10 text-danger disabled:opacity-50 transition-colors">
              <X size={12} /> 取消
            </button>}
        </div>

        {/* 结算记录 */}
        <div className="text-text-muted" style={{
        fontWeight: 600,
        fontSize: 13,
        marginBottom: 10
      }}>结算记录</div>
        {loading ? <div className="text-text-dim text-sm text-center py-6">加载中…</div> : !detail?.settlements?.length ? <div className="text-text-dim text-sm text-center py-5 bg-bg-muted/30 rounded-xl">暂无结算记录</div> : <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
            {(detail.settlements as Settlement[]).map(s => {
          const sc = SETTLEMENT_STATUS_CONFIG[s.status] ?? {
            label: s.status,
            badgeClass: 'bg-bg-muted text-text-muted'
          };
          return <div key={s.id} className="bg-bg-muted/50 border border-border" style={{
            borderRadius: 10,
            padding: '10px 14px'
          }}>
                  <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6
            }}>
                    <div>
                      <span className="text-text" style={{
                  fontWeight: 600,
                  fontSize: 12
                }}>{s.settlementNo}</span>
                      <span className="text-text-dim" style={{
                  fontSize: 11,
                  marginLeft: 8
                }}>{SETTLEMENT_TYPE_LABELS[s.settlementType] ?? s.settlementType}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sc.badgeClass}`}>{sc.label}</span>
                  </div>
                  <div className="text-blue-700 dark:text-blue-300" style={{
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 4
            }}>
                    {s.currencyCode} {fmt(s.amountOriginal)}
                  </div>
                  {s.cashAccountCode && <div className={`text-text-muted ${u.fs11}`}>现金账户：{s.cashAccountCode}</div>}

                  {!['SETTLED', 'CANCELLED'].includes(s.status) && <div style={{
              display: 'flex',
              gap: 6,
              marginTop: 8
            }}>
                      {s.status === 'DRAFT' && <button onClick={() => doSettleAction(s.id, 'submit')} disabled={!!actionLoading} className="px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer border border-info/20 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 disabled:opacity-50 transition-colors">
                          提交审批
                        </button>}
                      {s.status === 'PENDING_APPROVAL' && <button onClick={() => doSettleAction(s.id, 'approve-direct')} disabled={!!actionLoading} className="px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 disabled:opacity-50 transition-colors">
                          直接批准
                        </button>}
                      {s.status === 'APPROVED' && <button onClick={() => {
                if (confirm(`确认执行结算 ${s.settlementNo}？将实际操作资金。`)) void doSettleAction(s.id, 'execute');
              }} disabled={!!actionLoading} className="px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer border border-emerald-200 dark:border-emerald-700 bg-success/10 text-emerald-900 dark:text-emerald-200 disabled:opacity-50 transition-colors">
                          执行结算
                        </button>}
                      <button onClick={() => {
                if (confirm('确认取消此结算？')) void doSettleAction(s.id, 'cancel');
              }} disabled={!!actionLoading} className="px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer border border-danger/20 bg-danger/10 text-danger disabled:opacity-50 transition-colors">
                        取消
                      </button>
                    </div>}
                </div>;
        })}
          </div>}

        {contribution.remark && <div className="bg-warning/10 border border-warning/20 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-300 mt-4">
            备注：{contribution.remark}
          </div>}
      </div>

      {showSettle && <CreateSettlementModal contribution={contribution} accounts={cashAccounts} onClose={() => setShowSettle(false)} onCreated={() => {
      setShowSettle(false);
      void loadDetail();
      onRefresh();
    }} />}
    </div>;
}

// ── Summary Tab ───────────────────────────────────────────────────────────────

function SummaryTab({
  summary
}: {
  summary: ShSummary | null;
}) {
  if (!summary) return <div className="text-text-muted text-sm text-center py-8">加载中…</div>;
  const statCards = [{
    label: '出资总额',
    value: `¥ ${fmt(summary.totalAmountOriginal)}`,
    colorClass: 'text-violet-700 dark:text-violet-300'
  }, {
    label: '已结算',
    value: `¥ ${fmt(summary.settledAmountOriginal)}`,
    colorClass: 'text-emerald-700 dark:text-emerald-300'
  }, {
    label: '未结余额',
    value: `¥ ${fmt(summary.balanceAmountOriginal)}`,
    colorClass: 'text-danger'
  }, {
    label: '已确认笔数',
    value: `${summary.confirmedContributions} 笔`,
    colorClass: 'text-blue-700 dark:text-blue-300'
  }, {
    label: '待确认',
    value: `${summary.pendingConfirmations} 笔`,
    colorClass: 'text-warning'
  }];
  return <div>
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
      gap: 12,
      marginBottom: 24
    }}>
        {statCards.map(c => (
          <div key={c.label} style={kpiCard}>
            <div style={statTileLabel}>{c.label}</div>
            <div className={`font-extrabold ${c.colorClass}`} style={{ fontSize: 20, lineHeight: 1.2, marginTop: 2 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
      marginBottom: 24
    }}>
        <div style={{ ...tableContainer, padding: '16px 18px' }}>
          <div style={sectionTitle}>按股东分布</div>
          {summary.byShareholder.length === 0 ? <div className="text-text-dim text-xs text-center py-4">暂无数据</div> : summary.byShareholder.map(r => <div key={r.shareholder_name} className="border-b border-border/50" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 0'
        }}>
              <div>
                <div className="text-text" style={{
              fontSize: 12,
              fontWeight: 600
            }}>{r.shareholder_name}</div>
                <div className={`text-text-dim ${u.fs11}`}>{r.cnt} 笔</div>
              </div>
              <div className="text-violet-700 dark:text-violet-300" style={{
            fontSize: 13,
            fontWeight: 700
          }}>¥ {fmt(r.balance)}</div>
            </div>)}
        </div>

        <div style={{ ...tableContainer, padding: '16px 18px' }}>
          <div style={sectionTitle}>按资金类型</div>
          {summary.byContributionType.length === 0 ? <div className="text-text-dim text-xs text-center py-4">暂无数据</div> : summary.byContributionType.map(r => <div key={r.contribution_type} className="border-b border-border/50" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 0'
        }}>
              <div className={u.flexRow8}>
                <TypeBadge type={r.contribution_type} />
                <span className={`text-text-dim ${u.fs11}`}>{r.cnt} 笔</span>
              </div>
              <div className="text-text-muted" style={{
            fontSize: 13,
            fontWeight: 700
          }}>¥ {fmt(r.total)}</div>
            </div>)}
        </div>
      </div>

      {summary.upcomingReturns.length > 0 && <div style={{
      ...tableContainer,
      borderColor: 'var(--status-warning)',
      padding: '16px 18px',
    }}>
          <div className="text-amber-800 dark:text-amber-300" style={{
        fontWeight: 600,
        fontSize: 13,
        marginBottom: 12
      }}>⚠️ 即将到期归还（30 天内）</div>
          <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
            {summary.upcomingReturns.map(r => <div key={r.id} className="bg-warning/10 border border-warning/20" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          borderRadius: 8
        }}>
                <div>
                  <div className="text-text" style={{
              fontWeight: 600,
              fontSize: 12
            }}>{r.contribution_no}</div>
                  <div className={`text-text-dim ${u.fs11}`}>{r.shareholder_name} · 到期：{r.expected_return_date}</div>
                </div>
                <div className="text-warning" style={{
            fontWeight: 700,
            fontSize: 14
          }}>¥ {fmt(r.balance_amount_original)}</div>
              </div>)}
          </div>
        </div>}
    </div>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ShareholderFundsPage() {
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
  const [importLoading, setImportLoading] = useState(false);
  const loadContributions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set('keyword', keyword);
      if (typeFilter) params.set('contributionType', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('pageSize', '100');
      const [listRes, sumRes] = await Promise.all([fetch(`${API}/contributions?${params}`, {
        headers: authHeaders()
      }).then(r => r.json()), fetch(`${API}/summary`, {
        headers: authHeaders()
      }).then(r => r.json())]);
      setContributions(listRes.items ?? []);
      setSummary(sumRes);
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
  useEffect(() => {
    if (tab === 'contributions' || tab === 'summary') void loadContributions();else void loadSettlements();
  }, [tab, loadContributions, loadSettlements]);
  async function importFromPrc2() {
    if (!confirm('确认从 prc2_shareholder_funds 幂等导入股东资金？已导入的记录会被跳过。')) return;
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
      void loadContributions();
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
            <button onClick={() => void importFromPrc2()} disabled={importLoading} style={secondaryActionButton}>
              <Upload size={14} /> {importLoading ? '导入中…' : '从采购系统导入'}
            </button>
            <button onClick={() => setShowCreate(true)} style={primaryActionButton}>
              <Plus size={15} /> 新建记录
            </button>
          </div>} />

      {/* Tab 切换 */}
      <div style={tabBar}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabItem(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && <SummaryTab summary={summary} />}

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
              k: 'PENDING_CONFIRM',
              v: '待确认'
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

            <button onClick={() => void loadContributions()} disabled={loading} style={secondaryActionButton}>
              <RefreshCw size={14} />
            </button>
          </div>

          {loading ? <div className="text-text-muted text-sm text-center py-12">加载中…</div> : contributions.length === 0 ? <div className="text-text-muted text-sm text-center py-12">
              <Users size={32} style={{
          margin: '0 auto 12px',
          display: 'block',
          opacity: 0.4
        }} />
              暂无股东资金记录
            </div> : <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
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
                  <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 6
          }}>
                    <span className="text-text" style={{
              fontWeight: 700,
              fontSize: 14
            }}>{c.shareholderName}</span>
                    <TypeBadge type={c.contributionType} />
                    <StatusBadge status={c.status} map={STATUS_CONFIG} />
                    <span className="text-text-dim" style={{
              fontSize: 11,
              marginLeft: 'auto'
            }}>{c.contributionNo}</span>
                  </div>
                  <div style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center'
          }}>
                    <div>
                      <div className={`text-text-dim ${u.fs10}`}>出资总额</div>
                      <div className="text-text" style={{
                fontWeight: 700,
                fontSize: 15
              }}>{c.currencyCode} {fmt(c.amountOriginal)}</div>
                    </div>
                    <div>
                      <div className={`text-text-dim ${u.fs10}`}>未结余额</div>
                      <div style={{
                fontWeight: 700,
                fontSize: 15
              }} className={Number(c.balanceAmountOriginal) > 0 ? 'text-danger' : 'text-emerald-600 dark:text-emerald-400'}>
                        {c.currencyCode} {fmt(c.balanceAmountOriginal)}
                      </div>
                    </div>
                    {c.expectedReturnDate && <div>
                        <div className={`text-text-dim ${u.fs10}`}>预计归还</div>
                        <div className="text-warning" style={{
                fontSize: 12,
                fontWeight: 600
              }}>{c.expectedReturnDate}</div>
                      </div>}
                    <ChevronRight size={16} className="text-text-dim" style={{
              marginLeft: 'auto'
            }} />
                  </div>
                </div>;
              })}
            </div>}
        </>}

      {tab === 'settlements' && <>
          <div style={{
        marginBottom: 18,
        display: 'flex',
        gap: 10,
        alignItems: 'center'
      }}>
            <span className={`text-text-muted ${u.fs13}`}>共 {settlements.length} 条结算记录</span>
            <button onClick={() => void loadSettlements()} style={secondaryActionButton}>
              <RefreshCw size={13} />
            </button>
          </div>
          {loading ? <div className="text-text-dim text-sm text-center py-12">加载中…</div> : settlements.length === 0 ? <div className="text-text-dim text-sm text-center py-12">暂无结算记录</div> : <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
              {settlements.map(s => {
          const sc = SETTLEMENT_STATUS_CONFIG[s.status] ?? {
            label: s.status,
            badgeClass: 'bg-bg-muted text-text-muted'
          };
          return <div key={s.id} className="bg-bg-card border border-border" style={{
            borderRadius: 12,
            padding: '12px 16px'
          }}>
                    <div className={u.flexBetween}>
                      <div>
                        <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4
                }}>
                          <span className="text-text" style={{
                    fontWeight: 600,
                    fontSize: 13
                  }}>{s.settlementNo}</span>
                          <span className={`text-text-dim ${u.fs11}`}>{SETTLEMENT_TYPE_LABELS[s.settlementType] ?? s.settlementType}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sc.badgeClass}`}>{sc.label}</span>
                        </div>
                        <div className={`text-text-muted ${u.fs12}`}>
                          {s.shareholderName} · 出资单：{s.contributionNo}
                          {s.cashAccountCode ? ` · 现金账户：${s.cashAccountCode}` : ''}
                        </div>
                      </div>
                      <div className="text-blue-700 dark:text-blue-300" style={{
                fontWeight: 800,
                fontSize: 16
              }}>
                        {s.currencyCode} {fmt(s.amountOriginal)}
                      </div>
                    </div>
                  </div>;
        })}
            </div>}
        </>}

      {showCreate && <CreateContributionModal onClose={() => setShowCreate(false)} onCreated={() => {
      setShowCreate(false);
      void loadContributions();
    }} />}
      {selectedC && <ContributionDrawer contribution={selectedC} onClose={() => setSelectedC(null)} onRefresh={() => void loadContributions()} />}
    </div>;
}