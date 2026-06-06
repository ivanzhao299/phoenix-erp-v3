'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/contexts/ToastContext';
import u from "@/styles/uix-utils.module.css";
import { Wallet, Plus, Search, RefreshCw, Lock, Unlock, X, TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { StatusBadge } from '@/components/design-system';

import {
  primaryActionButton, secondaryActionButton, modalMask, modalPanel, inputField, formLabel,
  drawerMask, drawerPanel, drawerHeader, drawerHeaderTitle, drawerCloseButton, drawerFooter,
  inlineBadge, pillBadge,
  searchToolbar, toolbarFilterPill,
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

interface CashAccount {
  id: string;
  accountCode: string;
  accountName: string;
  companyCode: string;
  companyName: string | null;
  currencyCode: string;
  accountType: string;
  openingBalance: string | number;
  currentBalance: string | number;
  bankName: string | null;
  bankAccountNo: string | null;
  status: string;
  remark: string | null;
  createdAt: string;
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
}
interface Transaction {
  id: string;
  txnNo: string;
  direction: string;
  sourceType: string;
  sourceNo: string | null;
  amount: string | number;
  balanceAfter: string | number;
  txnDate: string;
  remark: string | null;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const API = '/api/v2/finance/cash';
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  BANK: '银行账户',
  CASH: '现金账户',
  VIRTUAL: '虚拟账户',
  SHAREHOLDER: '股东账户',
  INTERNAL: '内部账户'
};
const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  BANK: 'var(--color-accent)',
  CASH: 'var(--status-success)',
  VIRTUAL: 'var(--color-purple-600)',
  SHAREHOLDER: 'var(--status-warning)',
  INTERNAL: 'var(--status-info)'
};
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '正常',
  FROZEN: '冻结',
  CLOSED: '已关闭'
};
const SOURCE_TYPE_LABELS: Record<string, string> = {
  AP_PAYMENT: 'AP付款',
  AR_RECEIPT: 'AR收款',
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
          label: '公司编号 *',
          key: 'companyCode',
          placeholder: 'COMP001'
        }, {
          label: '公司名称',
          key: 'companyName',
          placeholder: '如：某某科技有限公司'
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

        <div style={{
        display: 'flex',
        gap: 10,
        justifyContent: 'flex-end',
        marginTop: 20
      }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border bg-bg-page text-text-muted text-sm cursor-pointer hover:bg-bg-muted transition-colors">
            取消
          </button>
          <button onClick={submit} disabled={saving} className={`px-5 py-2 rounded-lg border-0 text-sm font-semibold text-white cursor-pointer transition-colors ${saving ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {saving ? '创建中…' : '创建账户'}
          </button>
        </div>
      </div>
    </div>;
}

// ── Transaction Drawer ────────────────────────────────────────────────────────

function TransactionDrawer({
  account,
  onClose
}: {
  account: CashAccount;
  onClose: () => void;
}) {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`${API}/transactions?accountId=${account.id}&pageSize=50`, {
      headers: authHeaders()
    }).then(r => r.json()).then(d => {
      setTxns(d.items ?? []);
    }).finally(() => setLoading(false));
  }, [account.id]);
  return <div style={drawerMask}>
      <div className="bg-bg-card" style={{
      width: 520,
      height: '100vh',
      overflowY: 'auto',
      padding: 24,
      boxShadow: '-8px 0 32px var(--overlay-black-10)'
    }}>
        <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 18
      }}>
          <div>
            <div className="text-text" style={{
            fontWeight: 700,
            fontSize: 16
          }}>{account.accountName}</div>
            <div className="text-text-muted" style={{
            fontSize: 12,
            marginTop: 2
          }}>{account.accountCode} · {account.currencyCode}</div>
          </div>
          <button onClick={onClose} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer'
        }}>
            <X size={18} className="text-text-dim" />
          </button>
        </div>

        {/* 余额卡片 */}
        <div style={{
        background: 'linear-gradient(135deg,var(--color-accent),var(--status-info))',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 18,
        color: 'var(--bg-card)'
      }}>
          <div style={{
          fontSize: 12,
          opacity: 0.8
        }}>当前余额</div>
          <div style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: -1
        }}>
            {account.currencyCode} {fmt(account.currentBalance)}
          </div>
          <div style={{
          fontSize: 12,
          opacity: 0.7,
          marginTop: 4
        }}>
            期初余额 {fmt(account.openingBalance)}
          </div>
        </div>

        <div className="text-text-muted" style={{
        fontWeight: 600,
        fontSize: 13,
        marginBottom: 12
      }}>最近 50 条流水</div>

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
            {txns.map(t => <div key={t.id} className={t.direction === 'IN' ? 'bg-success/10 border border-green-200 dark:border-green-800' : 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderRadius: 10
        }}>
                <div className={u.flex1}>
                  <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 2
            }}>
                    {t.direction === 'IN' ? <TrendingUp size={13} className="text-success" /> : <TrendingDown size={13} className="text-orange-600 dark:text-orange-400" />}
                    <span className="text-text-muted" style={{
                fontSize: 12,
                fontWeight: 600
              }}>
                      {SOURCE_TYPE_LABELS[t.sourceType ?? ''] ?? t.sourceType ?? '-'}
                    </span>
                    {t.sourceNo && <span className={`text-text-dim ${u.fs11}`}>{t.sourceNo}</span>}
                  </div>
                  <div className={`text-text-muted ${u.fs11}`}>
                    {new Date(t.txnDate).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })}
                    {t.remark && ` · ${t.remark}`}
                  </div>
                </div>
                <div className={u.tar}>
                  <div style={{
              fontWeight: 700,
              fontSize: 14
            }} className={t.direction === 'IN' ? 'text-success' : 'text-orange-600 dark:text-orange-400'}>
                    {t.direction === 'IN' ? '+' : '-'}{fmt(t.amount)}
                  </div>
                  <div className={`text-text-dim ${u.fs11}`}>余 {fmt(t.balanceAfter)}</div>
                </div>
              </div>)}
          </div>}
      </div>
    </div>;
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CashAccountsPage() {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [showCreate, setShowCreate] = useState(false);
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
  const totalBalance = summary?.totalBalance ?? 0;
  return <div>
      <PageHeader title="资金账户中心" subtitle="资金账户管理 · 流水账本 · 转账审批" breadcrumb={['财务管理', '资金账户']} actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setTxnModal({ direction: 'IN' })} style={{ ...secondaryActionButton, color: 'var(--status-success)', borderColor: 'var(--status-success)' }}>
            <Plus size={13} /> 收款
          </button>
          <button onClick={() => setTxnModal({ direction: 'OUT' })} style={{ ...secondaryActionButton, color: 'var(--status-danger)', borderColor: 'var(--status-danger)' }}>
            <Plus size={13} /> 付款
          </button>
          <button onClick={() => setShowCreate(true)} style={primaryActionButton}>
            <Plus size={15} /> 新建账户
          </button>
        </div>
      } />

      {/* KPI 卡片 */}
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
      gap: 14,
      marginBottom: 24
    }}>
        {[{
        label: '账户总余额',
        value: `¥ ${fmt(totalBalance)}`,
        icon: <DollarSign size={18} className="text-blue-500" />,
        accent: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
      }, {
        label: '账户总数',
        value: `${summary?.totalAccounts ?? 0} 个`,
        icon: <Wallet size={18} className="text-violet-500" />,
        accent: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800'
      }, {
        label: '正常账户',
        value: `${summary?.activeCount ?? 0} 个`,
        icon: <Activity size={18} className="text-emerald-500" />,
        accent: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
      }, {
        label: '冻结账户',
        value: `${summary?.frozenCount ?? 0} 个`,
        icon: <Lock size={18} className="text-amber-500" />,
        accent: 'bg-amber-50 dark:bg-amber-950/40 border-warning/20'
      }].map(c => <div key={c.label} className={`border-[1.5px] rounded-2xl ${c.accent}`} style={{
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}>
            <div className="w-10 h-10 rounded-xl bg-bg-page flex items-center justify-center flex-shrink-0">
              {c.icon}
            </div>
            <div>
              <div className="text-text-muted" style={{
            fontSize: 11,
            marginBottom: 2
          }}>{c.label}</div>
              <div className="text-text" style={{
            fontSize: 18,
            fontWeight: 800
          }}>{c.value}</div>
            </div>
          </div>)}
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
          {accounts.map(acc => <div key={acc.id} onClick={() => setSelectedAccount(acc)} className="bg-bg-card hover:shadow-card-hover transition-shadow cursor-pointer" style={{
        borderRadius: 14,
        border: `1.5px solid ${acc.status === 'FROZEN' ? 'var(--status-warning-bg-faint)' : acc.status === 'CLOSED' ? 'var(--slate-200)' : 'var(--status-info-bg-page)'}`,
        padding: '18px 20px',
        opacity: acc.status === 'CLOSED' ? 0.65 : 1
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
                    {acc.accountName}
                  </div>
                  <div className={`text-text-muted ${u.fs11}`}>{acc.accountCode}</div>
                </div>
                <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4
          }}>
                  <StatusBadge status={acc.status} label={STATUS_LABELS[acc.status] ?? acc.status} />
                  <TypeBadge type={acc.accountType} />
                </div>
              </div>

              {/* 余额 */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-700 dark:to-slate-600" style={{
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
                <div>
                  <div className="text-text-muted" style={{
              fontSize: 10,
              marginBottom: 2
            }}>当前余额</div>
                  <div className="text-blue-800 dark:text-blue-300" style={{
              fontWeight: 800,
              fontSize: 18
            }}>
                    {acc.currencyCode} {fmt(acc.currentBalance)}
                  </div>
                </div>
                {acc.bankName && <div className="text-text-muted" style={{
            fontSize: 11,
            textAlign: 'right'
          }}>
                    <div>{acc.bankName}</div>
                    {acc.bankAccountNo && <div className="text-text-dim">{acc.bankAccountNo.slice(-4).padStart(acc.bankAccountNo.length, '*')}</div>}
                  </div>}
              </div>

              {/* 操作按钮 */}
              <div onClick={e => e.stopPropagation()} style={{
          display: 'flex',
          gap: 8
        }}>
                {acc.status === 'ACTIVE' && <button onClick={() => doAction(acc.id, 'freeze')} disabled={actionLoading === acc.id + 'freeze'} className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer border border-warning/20 bg-warning/10 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50">
                    <Lock size={11} /> 冻结
                  </button>}
                {acc.status === 'FROZEN' && <button onClick={() => doAction(acc.id, 'unfreeze')} disabled={actionLoading === acc.id + 'unfreeze'} className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer border border-emerald-200 dark:border-emerald-700 bg-success/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50">
                    <Unlock size={11} /> 解冻
                  </button>}
                {acc.status !== 'CLOSED' && <button onClick={() => {
            if (confirm(`确认关闭账户「${acc.accountName}」？关闭后不可恢复，且余额必须为零。`)) {
              void doAction(acc.id, 'close');
            }
          }} className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer border border-border bg-bg-muted text-text-muted hover:bg-bg-muted transition-colors">
                    <X size={11} /> 关闭
                  </button>}
              </div>
            </div>)}
        </div>}

      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} onCreated={() => {
      setShowCreate(false);
      void load();
    }} />}

      {selectedAccount && <TransactionDrawer account={selectedAccount} onClose={() => setSelectedAccount(null)} />}

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
          <div>
            <label style={formLabel}>资金账户 <span style={{ color: 'var(--status-danger)' }}>*</span></label>
            <select style={inputField} value={accountCode} onChange={e => setAccountCode(e.target.value)}>
              <option value="">请选择账户</option>
              {accounts.filter(a => a.status === 'ACTIVE').map(a => (
                <option key={a.accountCode} value={a.accountCode}>
                  {a.accountName}（{a.accountCode} · {a.currencyCode}）
                </option>
              ))}
            </select>
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