'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight, Plus, Search, RefreshCw, X, CheckCircle,
  Clock, AlertCircle, Send, Play,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

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

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  DRAFT:            { label: '草稿',   bg: '#f1f5f9', color: '#475569', icon: <Clock size={12} /> },
  PENDING_APPROVAL: { label: '待审批', bg: '#fef3c7', color: '#92400e', icon: <AlertCircle size={12} /> },
  APPROVED:         { label: '已审批', bg: '#dbeafe', color: '#1e40af', icon: <CheckCircle size={12} /> },
  EXECUTED:         { label: '已执行', bg: '#dcfce7', color: '#166534', icon: <CheckCircle size={12} /> },
  CANCELLED:        { label: '已取消', bg: '#f1f5f9', color: '#9ca3af', icon: <X size={12} /> },
};

function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0.00';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? { label: status, bg: '#f1f5f9', color: '#475569', icon: null };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.color,
    }}>
      {c.icon}{c.label}
    </span>
  );
}

// ── Create Transfer Modal ─────────────────────────────────────────────────────

function CreateTransferModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [form, setForm] = useState({ fromAccountId: '', toAccountId: '', amountOriginal: '', remark: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`${API}/accounts?status=ACTIVE&pageSize=100`)
      .then(r => r.json())
      .then(d => setAccounts(d.items ?? []));
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const fromAcc = accounts.find(a => a.id === form.fromAccountId);

  async function submit() {
    if (!form.fromAccountId) { setErr('请选择转出账户'); return; }
    if (!form.toAccountId)   { setErr('请选择转入账户'); return; }
    if (form.fromAccountId === form.toAccountId) { setErr('转出和转入账户不能相同'); return; }
    if (!form.amountOriginal || Number(form.amountOriginal) <= 0) { setErr('请填写转账金额'); return; }
    setSaving(true); setErr('');
    try {
      const r = await fetch(`${API}/transfers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId: form.fromAccountId,
          toAccountId: form.toAccountId,
          amountOriginal: Number(form.amountOriginal),
          remark: form.remark.trim() || undefined,
        }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message ?? '创建失败'); }
      onCreated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
    border: '1.5px solid #e2e8f0', background: '#fff', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28, width: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>新建资金转账</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} color="#94a3b8" />
          </button>
        </div>

        {err && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>转出账户 *</div>
            <select value={form.fromAccountId} onChange={e => set('fromAccountId', e.target.value)} style={selectStyle}>
              <option value="">请选择转出账户</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.accountName} ({a.currencyCode} {fmt(a.currentBalance)})
                </option>
              ))}
            </select>
          </div>

          {fromAcc && (
            <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1e40af' }}>
              当前余额：{fromAcc.currencyCode} {fmt(fromAcc.currentBalance)}
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>转入账户 *</div>
            <select value={form.toAccountId} onChange={e => set('toAccountId', e.target.value)} style={selectStyle}>
              <option value="">请选择转入账户</option>
              {accounts.filter(a => a.id !== form.fromAccountId).map(a => (
                <option key={a.id} value={a.id}>
                  {a.accountName} ({a.currencyCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>转账金额 *</div>
            <input
              type="number" min="0.01" step="0.01"
              value={form.amountOriginal}
              onChange={e => set('amountOriginal', e.target.value)}
              placeholder="请输入金额"
              style={selectStyle}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>备注</div>
            <textarea
              value={form.remark}
              onChange={e => set('remark', e.target.value)}
              placeholder="可选"
              rows={2}
              style={{ ...selectStyle, resize: 'none', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        <div style={{ background: '#fffbeb', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', margin: '14px 0', lineHeight: 1.6 }}>
          💡 创建后状态为「草稿」，需提交审批 → 审批通过 → 执行，才会实际扣减账户余额。
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>
            取消
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
              background: saving ? '#93c5fd' : '#2563eb', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '创建中…' : '创建草稿'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FundTransfersPage() {
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
      const res = await fetch(`${API}/transfers?${params}`).then(r => r.json());
      let items: FundTransfer[] = res.items ?? [];
      if (keyword) {
        const kw = keyword.toLowerCase();
        items = items.filter(t =>
          t.transferNo.toLowerCase().includes(kw) ||
          t.fromAccountName.toLowerCase().includes(kw) ||
          t.toAccountName.toLowerCase().includes(kw),
        );
      }
      setTransfers(items);
      setTotal(res.total ?? items.length);
    } finally {
      setLoading(false);
    }
  }, [keyword, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function doAction(id: string, action: string, msg?: string) {
    if (msg && !confirm(msg)) return;
    setActionLoading(id + action);
    try {
      const r = await fetch(`${API}/transfers/${id}/${action}`, { method: 'POST' });
      if (!r.ok) { const d = await r.json(); alert(d.message ?? '操作失败'); return; }
      await load();
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="资金转账"
        subtitle="账户间内部资金划转，5 状态审批工作流"
        breadcrumb={['财务管理', '资金转账']}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            <Plus size={15} /> 新建转账
          </button>
        }
      />

      {/* 状态筛选 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="搜索单号/账户名称…"
            style={{
              width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13,
              background: '#fff', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {[{ k: '', v: '全部状态' }, ...Object.entries(STATUS_CONFIG).map(([k, c]) => ({ k, v: c.label }))].map(({ k, v }) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${statusFilter === k ? '#2563eb' : '#e2e8f0'}`,
                background: statusFilter === k ? '#eff6ff' : '#fff',
                color: statusFilter === k ? '#2563eb' : '#6b7280',
              }}
            >
              {v}
            </button>
          ))}
        </div>

        <button
          onClick={() => void load()}
          disabled={loading}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
        >
          <RefreshCw size={14} color="#64748b" style={{ display: 'block' }} />
        </button>

        <span style={{ fontSize: 12, color: '#94a3b8' }}>共 {total} 条</span>
      </div>

      {/* 转账列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>加载中…</div>
      ) : transfers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>
          <ArrowLeftRight size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
          暂无转账记录
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {transfers.map(t => (
            <div key={t.id} style={{
              background: '#fff', borderRadius: 14,
              border: `1.5px solid ${t.status === 'EXECUTED' ? '#bbf7d0' : t.status === 'CANCELLED' ? '#f1f5f9' : '#e8f4fd'}`,
              padding: '16px 20px',
              opacity: t.status === 'CANCELLED' ? 0.65 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                {/* 左侧信息 */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{t.transferNo}</span>
                    <StatusBadge status={t.status} />
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {new Date(t.createdAt).toLocaleDateString('zh-CN')} · {t.createdBy ?? '-'}
                    </span>
                  </div>

                  {/* 转账路径 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ background: '#fef3c7', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                      <div style={{ color: '#92400e', fontWeight: 600 }}>{t.fromAccountName}</div>
                      <div style={{ color: '#d97706', fontSize: 11 }}>{t.fromAccountCode}</div>
                    </div>
                    <ArrowLeftRight size={16} color="#64748b" />
                    <div style={{ background: '#dcfce7', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                      <div style={{ color: '#166534', fontWeight: 600 }}>{t.toAccountName}</div>
                      <div style={{ color: '#16a34a', fontSize: 11 }}>{t.toAccountCode}</div>
                    </div>

                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: 18, color: '#1e40af' }}>
                        {t.currencyCode} {fmt(t.amountOriginal)}
                      </div>
                    </div>
                  </div>

                  {t.remark && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>备注：{t.remark}</div>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              {!['EXECUTED', 'CANCELLED'].includes(t.status) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  {t.status === 'DRAFT' && (
                    <button
                      onClick={() => doAction(t.id, 'submit', `确认提交转账单 ${t.transferNo} 至审批？`)}
                      disabled={actionLoading === t.id + 'submit'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af',
                      }}
                    >
                      <Send size={12} /> 提交审批
                    </button>
                  )}
                  {t.status === 'PENDING_APPROVAL' && (
                    <button
                      onClick={() => doAction(t.id, 'approve')}
                      disabled={actionLoading === t.id + 'approve'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: '1.5px solid #86efac', background: '#f0fdf4', color: '#166534',
                      }}
                    >
                      <CheckCircle size={12} /> 审批通过
                    </button>
                  )}
                  {t.status === 'APPROVED' && (
                    <button
                      onClick={() => doAction(t.id, 'execute', `确认执行转账 ${t.transferNo}？将实际划转 ${t.currencyCode} ${fmt(t.amountOriginal)}。`)}
                      disabled={actionLoading === t.id + 'execute'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: '1.5px solid #6ee7b7', background: '#ecfdf5', color: '#065f46',
                      }}
                    >
                      <Play size={12} /> 执行转账
                    </button>
                  )}
                  <button
                    onClick={() => doAction(t.id, 'cancel', `确认取消转账单 ${t.transferNo}？`)}
                    disabled={actionLoading === t.id + 'cancel'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: '1.5px solid #fecaca', background: '#fef2f2', color: '#dc2626',
                    }}
                  >
                    <X size={12} /> 取消
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTransferModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void load(); }}
        />
      )}
    </div>
  );
}
