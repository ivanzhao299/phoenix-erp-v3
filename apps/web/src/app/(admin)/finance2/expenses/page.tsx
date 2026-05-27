'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Receipt, Plus, RefreshCw, CheckCircle, XCircle,
  Clock, Send, Ban, ChevronRight, AlertTriangle,
  Paperclip, DollarSign, Calendar, Building2,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface ExpenseRequest {
  id: number;
  expense_no: string;
  requester_name: string;
  company_code: string;
  company_name: string;
  expense_type: string;
  currency_code: string;
  amount_original: string;
  amount_base: string;
  expense_date: string | null;
  description: string | null;
  status: string;
  created_at: string;
  wf_instance_id: string | null;
  reimbursements?: Reimbursement[];
  wfTimeline?: WfStep[];
}

interface Reimbursement {
  id: number;
  reimb_no: string;
  reimb_amount_original: string;
  status: string;
  created_at: string;
}

interface WfStep {
  step_no: number;
  approver_role: string;
  approver_name: string;
  status: string;
  action: string | null;
  actor_username: string | null;
  comment: string | null;
  acted_at: string | null;
  due_at: string | null;
}

interface Summary {
  totalExpenses: number;
  pendingApproval: number;
  approved: number;
  reimbursed: number;
  totalAmountOriginal: number;
  pendingReimb: number;
  paidToday: number;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── 常量 ─────────────────────────────────────────────────────────────────────

const EXPENSE_TYPES: Record<string, string> = {
  TRAVEL: '差旅',  MEAL: '餐饮',  ENTERTAINMENT: '招待',
  OFFICE: '办公',  MATERIAL: '物料',  TRANSPORT: '交通',  OTHER: '其他',
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:            { label: '草稿',    color: '#6b7280', bg: '#f3f4f6' },
  PENDING_APPROVAL: { label: '审批中',  color: '#f59e0b', bg: '#fffbeb' },
  APPROVED:         { label: '已审批',  color: '#10b981', bg: '#f0fdf4' },
  REJECTED:         { label: '已拒绝',  color: '#ef4444', bg: '#fef2f2' },
  CANCELLED:        { label: '已取消',  color: '#9ca3af', bg: '#f9fafb' },
  REIMBURSED:       { label: '已报销',  color: '#6366f1', bg: '#eef2ff' },
};

const STEP_STATUS_CFG: Record<string, { color: string; label: string }> = {
  PENDING:  { color: '#f59e0b', label: '待审批' },
  APPROVED: { color: '#10b981', label: '已通过' },
  REJECTED: { color: '#ef4444', label: '已拒绝' },
};

function fmt(n: string | number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── 子组件：状态 Badge ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
      color: cfg.color, background: cfg.bg,
    }}>{cfg.label}</span>
  );
}

// ── 子组件：创建弹窗 ──────────────────────────────────────────────────────────

function CreateExpenseModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    companyCode: '', companyName: '',
    expenseType: 'TRAVEL', currencyCode: 'CNY',
    amountOriginal: '', expenseDate: '', description: '', remark: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.companyCode || !form.amountOriginal) { setError('公司代码和金额必填'); return; }
    setSaving(true); setError('');
    try {
      await apiFetch('/api/v2/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          companyCode: form.companyCode, companyName: form.companyName,
          expenseType: form.expenseType, currencyCode: form.currencyCode,
          amountOriginal: Number(form.amountOriginal),
          expenseDate: form.expenseDate || undefined,
          description: form.description || undefined,
          remark: form.remark || undefined,
        }),
      });
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      {node}
    </div>
  );

  const inp = (key: keyof typeof form, type = 'text', placeholder = '') => (
    <input type={type} placeholder={placeholder} value={form[key]}
      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      style={{
        width: '100%', padding: '8px 10px', borderRadius: 8,
        border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box',
      }}
    />
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28, width: 460,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 20 }}>新建费用申请</div>
        {field('公司代码 *', inp('companyCode', 'text', 'e.g. COMP001'))}
        {field('公司名称', inp('companyName', 'text', '选填'))}
        {field('费用类型 *',
          <select value={form.expenseType} onChange={e => setForm(f => ({ ...f, expenseType: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13 }}>
            {Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        {field('币种 *',
          <select value={form.currencyCode} onChange={e => setForm(f => ({ ...f, currencyCode: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13 }}>
            {['CNY', 'USD', 'EUR', 'HKD'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {field('金额 *', inp('amountOriginal', 'number', '0.00'))}
        {field('费用日期', inp('expenseDate', 'date'))}
        {field('费用说明', (
          <textarea value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3} placeholder="费用用途、说明..."
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />
        ))}
        {field('备注', inp('remark', 'text', '选填'))}
        {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>取消</button>
          <button onClick={() => void submit()} disabled={saving}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {saving ? '创建中...' : '创建草稿'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 子组件：详情抽屉 ──────────────────────────────────────────────────────────

function ExpenseDrawer({
  id, onClose, onRefresh,
}: {
  id: number; onClose: () => void; onRefresh: () => void;
}) {
  const [data, setData] = useState<ExpenseRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<ExpenseRequest>(`/api/v2/finance/expenses/${id}`);
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const action = async (url: string, body: Record<string, unknown> = {}) => {
    setActing(true); setError('');
    try {
      await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
      await load(); onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setActing(false);
    }
  };

  if (loading || !data) return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 520, background: '#fff', padding: 28, boxShadow: '-2px 0 16px rgba(0,0,0,0.1)', zIndex: 500 }}>
      <div style={{ color: '#64748b' }}>加载中...</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 540, background: '#fff', padding: 28, boxShadow: '-2px 0 20px rgba(0,0,0,0.12)', zIndex: 500, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{data.expense_no}</div>
          <div style={{ marginTop: 4 }}><StatusBadge status={data.status} /></div>
        </div>
        <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', cursor: 'pointer', fontSize: 13 }}>关闭</button>
      </div>

      {/* 基本信息 */}
      <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
          {[
            ['申请人',   data.requester_name ?? '—'],
            ['公司',     data.company_name ?? data.company_code],
            ['费用类型', EXPENSE_TYPES[data.expense_type] ?? data.expense_type],
            ['币种',     data.currency_code],
            ['申请金额', `${data.currency_code} ${fmt(data.amount_original)}`],
            ['费用日期', data.expense_date ?? '—'],
            ['创建时间', new Date(data.created_at).toLocaleString('zh-CN')],
          ].map(([k, v]) => (
            <div key={k}><span style={{ color: '#64748b' }}>{k}：</span><span style={{ fontWeight: 600 }}>{v}</span></div>
          ))}
        </div>
        {data.description && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#374151', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
            <span style={{ color: '#64748b' }}>说明：</span>{data.description}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {data.status === 'DRAFT' && (
          <button onClick={() => void action(`/api/v2/finance/expenses/${id}/submit`)}
            disabled={acting}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Send size={13} /> 提交审批
          </button>
        )}
        {['DRAFT', 'REJECTED'].includes(data.status) && (
          <button onClick={() => void action(`/api/v2/finance/expenses/${id}/cancel`)}
            disabled={acting}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fee2e2', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            取消申请
          </button>
        )}
      </div>

      {/* Workflow Timeline */}
      {data.wfTimeline && data.wfTimeline.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#374151' }}>审批流程</div>
          {data.wfTimeline.map((step, i) => {
            const cfg = STEP_STATUS_CFG[step.status] ?? { color: '#6b7280', label: step.status };
            return (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${cfg.color}20`, border: `2px solid ${cfg.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 700, color: cfg.color }}>
                  {step.step_no}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{step.approver_name ?? step.approver_role}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {cfg.label}
                    {step.actor_username && ` · ${step.actor_username}`}
                    {step.acted_at && ` · ${new Date(step.acted_at).toLocaleString('zh-CN')}`}
                  </div>
                  {step.comment && <div style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>{step.comment}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 关联报销 */}
      {data.reimbursements && data.reimbursements.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#374151' }}>关联报销</div>
          {data.reimbursements.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: 10, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{r.reimb_no}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>¥ {fmt(r.reimb_amount_original)}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const [items,      setItems]      = useState<ExpenseRequest[]>([]);
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [showCreate,   setShowCreate]   = useState(false);
  const [selectedId,   setSelectedId]   = useState<number | null>(null);
  const [error,        setError]        = useState('');

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter)   params.set('expenseType', typeFilter);

      const [list, sum] = await Promise.allSettled([
        apiFetch<{ data: ExpenseRequest[]; total: number }>(`/api/v2/finance/expenses?${params}`),
        apiFetch<Summary>('/api/v2/finance/expenses/summary'),
      ]);

      if (list.status === 'fulfilled') { setItems(list.value.data); setTotal(list.value.total); }
      if (sum.status === 'fulfilled')  setSummary(sum.value);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="费用申请"
        subtitle="费用申请 · 审批流程 · 自动生成报销"
        breadcrumb={['财务管理', '费用申请']}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void load()} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#475569' }}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> 刷新
            </button>
            <button onClick={() => setShowCreate(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
              <Plus size={13} /> 新建申请
            </button>
          </div>
        }
      />

      {/* KPI 快览 */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: '申请总数',    value: String(summary.totalExpenses),   color: '#6366f1', bg: '#eef2ff' },
            { label: '审批中',      value: String(summary.pendingApproval),  color: '#f59e0b', bg: '#fffbeb' },
            { label: '已审批',      value: String(summary.approved),         color: '#10b981', bg: '#f0fdf4' },
            { label: '已报销',      value: String(summary.reimbursed),       color: '#6366f1', bg: '#eef2ff' },
            { label: '待报销',      value: String(summary.pendingReimb),     color: '#f59e0b', bg: '#fffbeb' },
            { label: '今日已付款',  value: String(summary.paidToday) + ' 笔', color: '#059669', bg: '#f0fdf4' },
          ].map(c => (
            <div key={c.label} style={{ background: c.bg, borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 筛选 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#374151' }}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#374151' }}>
          <option value="">全部类型</option>
          {Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8 }}><AlertTriangle size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />{error}</div>}

      {/* 列表 */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #f1f5f9', overflow: 'hidden' }}>
        {loading && <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>加载中...</div>}
        {!loading && items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <Receipt size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div>暂无费用申请</div>
          </div>
        )}
        {!loading && items.map((item, i) => (
          <div key={item.id}
            onClick={() => setSelectedId(item.id)}
            style={{
              padding: '14px 20px', cursor: 'pointer',
              borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none',
              display: 'flex', alignItems: 'center', gap: 14,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ width: 36, height: 36, borderRadius: 9, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Receipt size={16} color="#6366f1" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{item.expense_no}</span>
                <StatusBadge status={item.status} />
                <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '1px 6px', borderRadius: 6 }}>
                  {EXPENSE_TYPES[item.expense_type] ?? item.expense_type}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12 }}>
                <span><Building2 size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />{item.company_name ?? item.company_code}</span>
                {item.requester_name && <span>{item.requester_name}</span>}
                {item.expense_date && <span><Calendar size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />{item.expense_date}</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{item.currency_code} {fmt(item.amount_original)}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(item.created_at).toLocaleDateString('zh-CN')}</div>
            </div>
            <ChevronRight size={14} color="#cbd5e1" />
          </div>
        ))}
      </div>

      {/* 分页 */}
      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          {page > 1 && <button onClick={() => setPage(p => p - 1)} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>上一页</button>}
          <span style={{ padding: '6px 14px', fontSize: 13, color: '#64748b' }}>第 {page} 页 / 共 {Math.ceil(total / pageSize)} 页</span>
          {page * pageSize < total && <button onClick={() => setPage(p => p + 1)} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>下一页</button>}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateExpenseModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void load(); }}
        />
      )}
      {selectedId !== null && (
        <ExpenseDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={() => void load()}
        />
      )}
    </div>
  );
}
