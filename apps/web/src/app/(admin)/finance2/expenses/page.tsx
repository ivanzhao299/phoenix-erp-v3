'use client';

import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import { Receipt, Plus, RefreshCw, Send, ChevronRight, AlertTriangle, DollarSign, Calendar, Building2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { StatusBadge } from '@/components/design-system';
import { usePermission } from '@/hooks/usePermission'; // G23-A 子 menu 分流
import { DictSelect } from '@/components/shared-selectors/DictSelect';
import { CompanySelector } from '@/components/shared-selectors/MasterDataSelectors';
import { currencySymbol } from '@/lib/currency';
import { DrawerV2 } from '@/components/design-system/drawers/DrawerV2';

import {
  primaryActionButton, secondaryActionButton, modalMask, modalPanel, inputField, formLabel,
  drawerMask, drawerPanel, drawerHeader, drawerHeaderTitle, drawerCloseButton, drawerFooter,
  inlineBadge, pillBadge,
  searchToolbar, toolbarFilterPill, toolbarSearchInput,
  tableContainer, tablePagination,
} from '@/components/design-system/cockpit-styles';
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

const EXPENSE_TYPES: Record<string, string> = {
  TRAVEL: '差旅',
  MEAL: '餐饮',
  ENTERTAINMENT: '招待',
  OFFICE: '办公',
  MATERIAL: '物料',
  TRANSPORT: '交通',
  OTHER: '其他'
};
const STEP_STATUS_CFG: Record<string, {
  color: string;
  label: string;
}> = {
  PENDING: {
    color: 'var(--status-warning)',
    label: '待审批'
  },
  APPROVED: {
    color: 'var(--status-success)',
    label: '已通过'
  },
  REJECTED: {
    color: 'var(--status-danger)',
    label: '已拒绝'
  }
};
function fmt(n: string | number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ── 子组件：创建弹窗 ──────────────────────────────────────────────────────────

function CreateExpenseModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    companyCode: '',
    companyName: '',
    expenseType: 'TRAVEL',
    currencyCode: 'CNY',
    amountOriginal: '',
    expenseDate: '',
    description: '',
    remark: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!form.companyCode || !form.amountOriginal) {
      setError('公司代码和金额必填');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/v2/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          companyCode: form.companyCode,
          companyName: form.companyName,
          expenseType: form.expenseType,
          currencyCode: form.currencyCode,
          amountOriginal: Number(form.amountOriginal),
          expenseDate: form.expenseDate || undefined,
          description: form.description || undefined,
          remark: form.remark || undefined
        })
      });
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };
  const field = (label: string, node: React.ReactNode) => <div className={u.mb14}>
      <div className={`text-text-muted text-xs ${u.mb4}`}>{label}</div>
      {node}
    </div>;
  const inp = (key: keyof typeof form, type = 'text', placeholder = '') => <input type={type} placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({
    ...f,
    [key]: e.target.value
  }))} className="px-3 py-1.5 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 w-full" style={{
    boxSizing: 'border-box'
  }} />;
  return <div style={modalMask}>
      <div style={modalPanel(460)} onClick={e => e.stopPropagation()}>
        <div className="text-text" style={{
        fontWeight: 800,
        fontSize: 16,
        marginBottom: 20
      }}>新建费用申请</div>
        {/* G4-A：公司主数据，自动带出名称，DataScope 自动过滤 */}
        {field('公司 *', <CompanySelector value={form.companyCode} onChange={v => setForm(f => ({
        ...f,
        companyCode: v
      }))} onPick={o => setForm(f => ({
        ...f,
        companyName: o?.label ?? ''
      }))} />)}
        {/* G4-A：费用类型枚举来自 sys_dict(FIN_EXPENSE_TYPE) */}
        {field('费用类型 *', <DictSelect dictType="FIN_EXPENSE_TYPE" value={form.expenseType} onChange={v => setForm(f => ({
        ...f,
        expenseType: v
      }))} allowEmpty={false} />)}
        {/* G4-A：货币枚举来自 sys_dict(SYS_CURRENCY) */}
        {field('币种 *', <DictSelect dictType="SYS_CURRENCY" value={form.currencyCode} onChange={v => setForm(f => ({
        ...f,
        currencyCode: v
      }))} allowEmpty={false} />)}
        {field('金额 *', inp('amountOriginal', 'number', '0.00'))}
        {field('费用日期', inp('expenseDate', 'date'))}
        {field('费用说明', <textarea value={form.description} onChange={e => setForm(f => ({
        ...f,
        description: e.target.value
      }))} rows={3} placeholder="费用用途、说明..." className="px-3 py-1.5 rounded-lg text-sm border border-border bg-bg-page text-text placeholder:text-text-dim outline-none focus:border-emerald-400 w-full" style={{
        resize: 'vertical',
        boxSizing: 'border-box'
      }} />)}
        {field('备注', inp('remark', 'text', '选填'))}
        {error && <div className={`bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2 ${u.mb12}`}>
            {error}
          </div>}
        <div style={{
        display: 'flex',
        gap: 10,
        justifyContent: 'flex-end'
      }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border bg-bg-page text-text-muted text-sm cursor-pointer hover:bg-bg-muted transition-colors">取消</button>
          <button onClick={() => void submit()} disabled={saving} className={`px-4 py-2 rounded-lg border-0 text-sm font-bold text-white cursor-pointer transition-colors ${saving ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
            {saving ? '创建中...' : '创建草稿'}
          </button>
        </div>
      </div>
    </div>;
}

// ── 子组件：详情抽屉 ──────────────────────────────────────────────────────────

function ExpenseDrawer({
  id,
  onClose,
  onRefresh
}: {
  id: number;
  onClose: () => void;
  onRefresh: () => void;
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
  useEffect(() => {
    void load();
  }, [load]);
  const action = async (url: string, body: Record<string, unknown> = {}) => {
    setActing(true);
    setError('');
    try {
      await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      await load();
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setActing(false);
    }
  };
  return <DrawerV2 open title={loading || !data ? '费用详情' : data.expense_no} onClose={onClose} width={540}>
      {loading || !data ? <div className="text-text-muted" style={{ padding: 28 }}>加载中...</div> : <>
      <div style={{ marginBottom: 20 }}>
        <StatusBadge status={data.status} />
      </div>

      {/* 基本信息 */}
      <div className="bg-bg-muted" style={{
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 16
    }}>
        <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px 16px',
        fontSize: 13
      }}>
          {[['申请人', data.requester_name ?? '—'], ['公司', data.company_name ?? data.company_code], ['费用类型', EXPENSE_TYPES[data.expense_type] ?? data.expense_type], ['币种', data.currency_code], ['申请金额', `${currencySymbol(data.currency_code)}${fmt(data.amount_original)}`], ['费用日期', data.expense_date ?? '—'], ['创建时间', new Date(data.created_at).toLocaleString('zh-CN')]].map(([k, v]) => <div key={k}><span className="text-text-muted">{k}：</span><span className={u.fw600}>{v}</span></div>)}
        </div>
        {data.description && <div className="text-text-muted" style={{
        marginTop: 10,
        fontSize: 13,
        borderTop: '1px solid var(--slate-200)',
        paddingTop: 8
      }}>
            <span className="text-text-muted">说明：</span>{data.description}
          </div>}
      </div>

      {/* 操作按钮 */}
      {error && <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2" style={{
      marginBottom: 10
    }}>
          {error}
        </div>}
      <div style={{
      display: 'flex',
      gap: 8,
      marginBottom: 16,
      flexWrap: 'wrap'
    }}>
        {data.status === 'DRAFT' && <button onClick={() => void action(`/api/v2/finance/expenses/${id}/submit`)} disabled={acting} style={primaryActionButton}>
            <Send size={13} /> 提交审批
          </button>}
        {['DRAFT', 'REJECTED'].includes(data.status) && <button onClick={() => void action(`/api/v2/finance/expenses/${id}/cancel`)} disabled={acting} className="px-3 py-1.5 rounded-lg border border-danger/20 bg-danger/10 text-danger text-xs font-bold cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50">
            取消申请
          </button>}
      </div>

      {/* Workflow Timeline */}
      {data.wfTimeline && data.wfTimeline.length > 0 && <div className={u.mb16}>
          <div className="text-text-muted" style={{
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 10
      }}>审批流程</div>
          {data.wfTimeline.map((step, i) => {
        const cfg = STEP_STATUS_CFG[step.status] ?? {
          color: 'var(--gray-500)',
          label: step.status
        };
        return <div key={i} style={{
          display: 'flex',
          gap: 12,
          marginBottom: 10
        }}>
                <div style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: `${cfg.color}20`,
            border: `2px solid ${cfg.color}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 700,
            color: cfg.color
          }}>
                  {step.step_no}
                </div>
                <div className={u.flex1}>
                  <div className="text-text" style={{
              fontSize: 13,
              fontWeight: 600
            }}>{step.approver_name ?? step.approver_role}</div>
                  <div className={`text-text-muted ${u.fs11}`}>
                    {cfg.label}
                    {step.actor_username && ` · ${step.actor_username}`}
                    {step.acted_at && ` · ${new Date(step.acted_at).toLocaleString('zh-CN')}`}
                  </div>
                  {step.comment && <div className="text-text-muted" style={{
              fontSize: 11,
              marginTop: 2
            }}>{step.comment}</div>}
                </div>
              </div>;
      })}
        </div>}

      {/* 关联报销 */}
      {data.reimbursements && data.reimbursements.length > 0 && <div>
          <div className="text-text-muted" style={{
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 8
      }}>关联报销</div>
          {data.reimbursements.map(r => <div key={r.id} className="bg-bg-muted" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        borderRadius: 10,
        marginBottom: 6
      }}>
              <div>
                <div className="text-text" style={{
            fontSize: 13,
            fontWeight: 700
          }}>{r.reimb_no}</div>
                <div className={`text-text-muted ${u.fs11}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{currencySymbol(data.currency_code)}{fmt(r.reimb_amount_original)}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>)}
        </div>}
    </>}
    </DrawerV2>;
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  // G23-A：按子 menu 分流
  //   新建费用申请 → MENU_FIN2_EXPENSE_MASTER:C
  const { canCreate: canCreateExpense } = usePermission('MENU_FIN2_EXPENSE_MASTER');
  const [items, setItems] = useState<ExpenseRequest[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
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
      if (typeFilter) params.set('expenseType', typeFilter);
      const [list, sum] = await Promise.allSettled([apiFetch<{
        data: ExpenseRequest[];
        total: number;
      }>(`/api/v2/finance/expenses?${params}`), apiFetch<Summary>('/api/v2/finance/expenses/summary')]);
      if (list.status === 'fulfilled') {
        setItems(list.value.data);
        setTotal(list.value.total);
      }
      if (sum.status === 'fulfilled') setSummary(sum.value);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter]);
  useEffect(() => {
    void load();
  }, [load]);
  return <div>
      <PageHeader title="费用申请" subtitle="费用申请 · 审批流程 · 自动生成报销" breadcrumb={['财务管理', '费用申请']} actions={<div style={{
      display: 'flex',
      gap: 8
    }}>
            <button onClick={() => void load()} disabled={loading} style={secondaryActionButton}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> 刷新
            </button>
            {canCreateExpense && (
              <button onClick={() => setShowCreate(true)} style={primaryActionButton}>
                <Plus size={13} /> 新建申请
              </button>
            )}
          </div>} />

      {/* KPI 快览 */}
      {summary && <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: 10,
      marginBottom: 20
    }}>
          {[{
        label: '申请总数',
        value: String(summary.totalExpenses),
        accent: 'bg-indigo-50 dark:bg-indigo-950/40',
        valueClass: 'text-indigo-600 dark:text-indigo-400'
      }, {
        label: '审批中',
        value: String(summary.pendingApproval),
        accent: 'bg-amber-50 dark:bg-amber-950/40',
        valueClass: 'text-warning'
      }, {
        label: '已审批',
        value: String(summary.approved),
        accent: 'bg-emerald-50 dark:bg-emerald-950/40',
        valueClass: 'text-emerald-600 dark:text-emerald-400'
      }, {
        label: '已报销',
        value: String(summary.reimbursed),
        accent: 'bg-indigo-50 dark:bg-indigo-950/40',
        valueClass: 'text-indigo-600 dark:text-indigo-400'
      }, {
        label: '待报销',
        value: String(summary.pendingReimb),
        accent: 'bg-amber-50 dark:bg-amber-950/40',
        valueClass: 'text-warning'
      }, {
        label: '今日已付款',
        value: String(summary.paidToday) + ' 笔',
        accent: 'bg-emerald-50 dark:bg-emerald-950/40',
        valueClass: 'text-emerald-600 dark:text-emerald-400'
      }].map(c => <div key={c.label} className={`rounded-xl ${c.accent}`} style={{
        padding: '12px 16px'
      }}>
              <div className="text-text-muted" style={{
          fontSize: 11,
          marginBottom: 2
        }}>{c.label}</div>
              <div className={`text-lg font-extrabold ${c.valueClass}`}>{c.value}</div>
            </div>)}
        </div>}

      {/* 筛选 工具栏 */}
      <div style={searchToolbar}>
        <select value={statusFilter} onChange={e => {
        setStatusFilter(e.target.value);
        setPage(1);
      }} style={{ ...inputField, width: 'auto', padding: '6px 12px', fontSize: 13 }}>
          <option value="">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="PENDING_APPROVAL">审批中</option>
          <option value="APPROVED">已审批</option>
          <option value="REJECTED">已拒绝</option>
          <option value="CANCELLED">已取消</option>
          <option value="REIMBURSED">已报销</option>
        </select>
        <select value={typeFilter} onChange={e => {
        setTypeFilter(e.target.value);
        setPage(1);
      }} style={{ ...inputField, width: 'auto', padding: '6px 12px', fontSize: 13 }}>
          <option value="">全部类型</option>
          {Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {error && <div className={`bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger flex items-center gap-2 ${u.mb12}`}>
          <AlertTriangle size={13} />{error}
        </div>}

      {/* 列表 */}
      <div style={tableContainer}>
        {loading && <div className="text-text-muted" style={{
        padding: 32,
        textAlign: 'center'
      }}>加载中...</div>}
        {!loading && items.length === 0 && <div className="text-text-muted" style={{
        padding: 40,
        textAlign: 'center'
      }}>
            <Receipt size={32} style={{
          marginBottom: 8,
          opacity: 0.4
        }} />
            <div>暂无费用申请</div>
          </div>}
        {!loading && items.map((item, i) => <div key={item.id} onClick={() => setSelectedId(item.id)} className={`border-b border-border/30 transition-colors hover:bg-bg-muted/50 cursor-pointer ${i % 2 !== 0 ? 'bg-bg-muted/20' : ''}`} style={{
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14
      }}>
            <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center flex-shrink-0" style={{
          width: 36,
          height: 36
        }}>
              <Receipt size={16} className="text-indigo-500" />
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
            }}>{item.expense_no}</span>
                <StatusBadge status={item.status} />
                <span className="bg-bg-muted text-text-muted" style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 6
            }}>
                  {EXPENSE_TYPES[item.expense_type] ?? item.expense_type}
                </span>
              </div>
              <div className="text-text-muted" style={{
            fontSize: 12,
            display: 'flex',
            gap: 12
          }}>
                <span><Building2 size={11} style={{
                verticalAlign: 'middle',
                marginRight: 2
              }} />{item.company_name ?? item.company_code}</span>
                {item.requester_name && <span>{item.requester_name}</span>}
                {item.expense_date && <span><Calendar size={11} style={{
                verticalAlign: 'middle',
                marginRight: 2
              }} />{item.expense_date}</span>}
              </div>
            </div>
            <div style={{
          textAlign: 'right',
          flexShrink: 0
        }}>
              <div className="text-text" style={{
            fontWeight: 800,
            fontSize: 15,
            fontVariantNumeric: 'tabular-nums'
          }}>{currencySymbol(item.currency_code)}{fmt(item.amount_original)}</div>
              <div className={`text-text-muted ${u.fs11}`}>{new Date(item.created_at).toLocaleDateString('zh-CN')}</div>
            </div>
            <ChevronRight size={14} className="text-text-dim" />
          </div>)}
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
              上一页
            </button>}
          <span className="text-text-muted" style={{
        fontSize: 13,
        padding: '6px 14px'
      }}>第 {page} 页 / 共 {Math.ceil(total / pageSize)} 页</span>
          {page * pageSize < total && <button onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-border bg-bg-page text-text-muted hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-sm px-3 py-1.5">
              下一页
            </button>}
        </div>}

      {/* Modals */}
      {showCreate && <CreateExpenseModal onClose={() => setShowCreate(false)} onCreated={() => {
      setShowCreate(false);
      void load();
    }} />}
      {selectedId !== null && <ExpenseDrawer id={selectedId} onClose={() => setSelectedId(null)} onRefresh={() => void load()} />}
    </div>;
}