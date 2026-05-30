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

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; badgeClass: string }> = {
  DRAFT:            { label: '草稿',   badgeClass: 'bg-bg-muted text-text-muted',           icon: <Clock size={12} /> },
  PENDING_APPROVAL: { label: '待审批', badgeClass: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',       icon: <AlertCircle size={12} /> },
  APPROVED:         { label: '已审批', badgeClass: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',           icon: <CheckCircle size={12} /> },
  EXECUTED:         { label: '已执行', badgeClass: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300', icon: <CheckCircle size={12} /> },
  CANCELLED:        { label: '已取消', badgeClass: 'bg-bg-muted text-text-dim',           icon: <X size={12} /> },
};

function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0.00';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function LocalStatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? { label: status, badgeClass: 'bg-bg-muted text-text-muted', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.badgeClass}`}>
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

  const selectClass = "w-full px-3 py-2 rounded-lg text-sm border border-border bg-bg-page text-text outline-none focus:border-emerald-400 box-border";

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="bg-bg-card"
        style={{ borderRadius: 16, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="text-text" style={{ fontWeight: 700, fontSize: 16 }}>新建资金转账</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {err && (
          <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2 mb-3.5">
            {err}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="text-text-muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>转出账户 <span className="text-red-500">*</span></div>
            <select value={form.fromAccountId} onChange={e => set('fromAccountId', e.target.value)} className={selectClass}>
              <option value="">请选择转出账户</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.accountName} ({a.currencyCode} {fmt(a.currentBalance)})
                </option>
              ))}
            </select>
          </div>

          {fromAcc && (
            <div className="bg-info/10 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              当前余额：{fromAcc.currencyCode} {fmt(fromAcc.currentBalance)}
            </div>
          )}

          <div>
            <div className="text-text-muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>转入账户 <span className="text-red-500">*</span></div>
            <select value={form.toAccountId} onChange={e => set('toAccountId', e.target.value)} className={selectClass}>
              <option value="">请选择转入账户</option>
              {accounts.filter(a => a.id !== form.fromAccountId).map(a => (
                <option key={a.id} value={a.id}>
                  {a.accountName} ({a.currencyCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-text-muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>转账金额 <span className="text-red-500">*</span></div>
            <input
              type="number" min="0.01" step="0.01"
              value={form.amountOriginal}
              onChange={e => set('amountOriginal', e.target.value)}
              placeholder="请输入金额"
              className={selectClass}
            />
          </div>

          <div>
            <div className="text-text-muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>备注</div>
            <textarea
              value={form.remark}
              onChange={e => set('remark', e.target.value)}
              placeholder="可选"
              rows={2}
              className={`${selectClass} resize-none font-inherit`}
            />
          </div>
        </div>

        <div className="bg-warning/10 border border-warning/20 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-300 my-3.5 leading-relaxed">
          💡 创建后状态为「草稿」，需提交审批 → 审批通过 → 执行，才会实际扣减账户余额。
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border bg-bg-page text-sm text-text-muted cursor-pointer hover:bg-bg-muted transition-colors">
            取消
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className={`px-5 py-2 rounded-lg border-none text-sm font-semibold text-white cursor-pointer transition-colors ${saving ? 'bg-blue-300 dark:bg-blue-800 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
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
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white border-none cursor-pointer transition-colors"
          >
            <Plus size={15} /> 新建转账
          </button>
        }
      />

      {/* 状态筛选 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} className="text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="搜索单号/账户名称…"
            className="px-3 py-1.5 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 w-full pl-8"
          />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {[{ k: '', v: '全部状态' }, ...Object.entries(STATUS_CONFIG).map(([k, c]) => ({ k, v: c.label }))].map(({ k, v }) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${
                statusFilter === k
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-border bg-bg-card text-text-muted hover:bg-bg-muted'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-bg-card text-sm text-text-muted hover:bg-bg-muted cursor-pointer transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className="block" />
        </button>

        <span className="text-text-muted" style={{ fontSize: 12 }}>共 {total} 条</span>
      </div>

      {/* 转账列表 */}
      {loading ? (
        <div className="text-text-dim text-sm text-center py-12">加载中…</div>
      ) : transfers.length === 0 ? (
        <div className="text-text-muted text-sm text-center py-12">
          <ArrowLeftRight size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
          暂无转账记录
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {transfers.map(t => (
            <div key={t.id} className="bg-bg-card"
              style={{
                borderRadius: 14,
                border: `1.5px solid ${t.status === 'EXECUTED' ? '#bbf7d0' : t.status === 'CANCELLED' ? '#e2e8f0' : '#e8f4fd'}`,
                padding: '16px 20px',
                opacity: t.status === 'CANCELLED' ? 0.65 : 1,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                {/* 左侧信息 */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span className="text-text" style={{ fontWeight: 700, fontSize: 13 }}>{t.transferNo}</span>
                    <LocalStatusBadge status={t.status} />
                    <span className="text-text-dim" style={{ fontSize: 11 }}>
                      {new Date(t.createdAt).toLocaleDateString('zh-CN')} · {t.createdBy ?? '-'}
                    </span>
                  </div>

                  {/* 转账路径 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div className="bg-warning/10" style={{ borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                      <div className="text-amber-800 dark:text-amber-300" style={{ fontWeight: 600 }}>{t.fromAccountName}</div>
                      <div className="text-warning" style={{ fontSize: 11 }}>{t.fromAccountCode}</div>
                    </div>
                    <ArrowLeftRight size={16} className="text-text-dim" />
                    <div className="bg-success/10" style={{ borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                      <div className="text-emerald-800 dark:text-emerald-300" style={{ fontWeight: 600 }}>{t.toAccountName}</div>
                      <div className="text-emerald-600 dark:text-emerald-400" style={{ fontSize: 11 }}>{t.toAccountCode}</div>
                    </div>

                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div className="text-blue-700 dark:text-blue-300" style={{ fontWeight: 800, fontSize: 18 }}>
                        {t.currencyCode} {fmt(t.amountOriginal)}
                      </div>
                    </div>
                  </div>

                  {t.remark && (
                    <div className="text-text-dim" style={{ fontSize: 11, marginTop: 4 }}>备注：{t.remark}</div>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              {!['EXECUTED', 'CANCELLED'].includes(t.status) && (
                <div className="border-t border-border" style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12 }}>
                  {t.status === 'DRAFT' && (
                    <button
                      onClick={() => doAction(t.id, 'submit', `确认提交转账单 ${t.transferNo} 至审批？`)}
                      disabled={actionLoading === t.id + 'submit'}
                      className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-info/20 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 disabled:opacity-50 transition-colors"
                    >
                      <Send size={12} /> 提交审批
                    </button>
                  )}
                  {t.status === 'PENDING_APPROVAL' && (
                    <button
                      onClick={() => doAction(t.id, 'approve')}
                      disabled={actionLoading === t.id + 'approve'}
                      className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle size={12} /> 审批通过
                    </button>
                  )}
                  {t.status === 'APPROVED' && (
                    <button
                      onClick={() => doAction(t.id, 'execute', `确认执行转账 ${t.transferNo}？将实际划转 ${t.currencyCode} ${fmt(t.amountOriginal)}。`)}
                      disabled={actionLoading === t.id + 'execute'}
                      className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-emerald-200 dark:border-emerald-700 bg-success/10 text-emerald-900 dark:text-emerald-200 disabled:opacity-50 transition-colors"
                    >
                      <Play size={12} /> 执行转账
                    </button>
                  )}
                  <button
                    onClick={() => doAction(t.id, 'cancel', `确认取消转账单 ${t.transferNo}？`)}
                    disabled={actionLoading === t.id + 'cancel'}
                    className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-danger/20 bg-danger/10 text-danger disabled:opacity-50 transition-colors"
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
