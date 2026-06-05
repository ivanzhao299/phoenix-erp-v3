'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, Plus, Receipt, Clock, CheckCircle, XCircle, Wallet, Send } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { getMobileToken, authHeader } from '@/lib/mobile-auth-token';

// ── 类型 ──────────────────────────────────────────────────────────────────────
import u from "@/styles/uix-utils.module.css";
interface ExpenseRecord {
  id: number;
  expense_no: string;
  expense_type: string;
  currency_code: string;
  amount_original: string;
  status: string;
  expense_date: string | null;
  description: string | null;
  company_name: string;
  requester_name: string | null;
  created_at: string;
  reimbursements?: {
    id: number;
    reimb_no: string;
    status: string;
  }[];
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(opts?.headers ?? {})
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

const EXPENSE_TYPES: Record<string, string> = {
  TRAVEL: '差旅',
  MEAL: '餐饮',
  ENTERTAINMENT: '招待',
  OFFICE: '办公',
  MATERIAL: '物料',
  TRANSPORT: '交通',
  OTHER: '其他'
};
const STATUS_CFG: Record<string, {
  label: string;
  color: string;
  icon: React.ElementType;
}> = {
  DRAFT: {
    label: '草稿',
    color: 'var(--gray-500)',
    icon: Receipt
  },
  PENDING_APPROVAL: {
    label: '审批中',
    color: 'var(--status-warning)',
    icon: Clock
  },
  APPROVED: {
    label: '已审批',
    color: 'var(--status-success)',
    icon: CheckCircle
  },
  REJECTED: {
    label: '已拒绝',
    color: 'var(--status-danger)',
    icon: XCircle
  },
  CANCELLED: {
    label: '已取消',
    color: 'var(--gray-400)',
    icon: XCircle
  },
  REIMBURSED: {
    label: '已报销',
    color: 'var(--color-accent)',
    icon: Wallet
  }
};
function fmt(n: string | number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
type Tab = 'list' | 'create';

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function MobileExpensesPage() {
  const router = useRouter();
  const {
    isDark
  } = useMobileTheme();
  const [tab, setTab] = useState<Tab>('list');
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 创建表单
  const [form, setForm] = useState({
    companyCode: '',
    expenseType: 'TRAVEL',
    currencyCode: 'CNY',
    amountOriginal: '',
    expenseDate: '',
    description: ''
  });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  // 选中的记录（查看详情）
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ExpenseRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── 颜色主题 ──────────────────────────────────────────────────────────────

  const bg = isDark ? 'var(--gray-900)' : 'var(--slate-50)';
  const card = isDark ? 'var(--gray-800)' : 'var(--bg-card)';
  const text = isDark ? 'var(--gray-50)' : 'var(--slate-900)';
  const sub = isDark ? 'var(--gray-400)' : 'var(--slate-500)';
  const border = isDark ? 'var(--gray-700)' : 'var(--slate-100)';

  // ── 数据加载 ──────────────────────────────────────────────────────────────

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{
        data: ExpenseRecord[];
      }>('/api/v2/finance/expenses?pageSize=50');
      setRecords(res.data);
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadList();
  }, [loadList]);
  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const d = await apiFetch<ExpenseRecord>(`/api/v2/finance/expenses/${id}`);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  }, []);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);else setDetail(null);
  }, [selectedId, loadDetail]);

  // ── 提交审批 ──────────────────────────────────────────────────────────────

  const submitApproval = async (id: number) => {
    try {
      await apiFetch(`/api/v2/finance/expenses/${id}/submit`, {
        method: 'POST',
        body: '{}'
      });
      void loadDetail(id);
      void loadList();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '提交失败');
    }
  };

  // ── 创建 ──────────────────────────────────────────────────────────────────

  const createExpense = async () => {
    if (!form.companyCode || !form.amountOriginal) {
      setSaveErr('公司代码和金额必填');
      return;
    }
    setSaving(true);
    setSaveErr('');
    try {
      await apiFetch('/api/v2/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          companyCode: form.companyCode,
          expenseType: form.expenseType,
          currencyCode: form.currencyCode,
          amountOriginal: Number(form.amountOriginal),
          expenseDate: form.expenseDate || undefined,
          description: form.description || undefined
        })
      });
      setForm({
        companyCode: '',
        expenseType: 'TRAVEL',
        currencyCode: 'CNY',
        amountOriginal: '',
        expenseDate: '',
        description: ''
      });
      setTab('list');
      void loadList();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  // ── 样式工具 ──────────────────────────────────────────────────────────────

  const inp = (key: keyof typeof form, type = 'text', placeholder = '') => <input type={type} placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({
    ...f,
    [key]: e.target.value
  }))} style={{
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: `1.5px solid ${border}`,
    background: card,
    color: text,
    fontSize: 14,
    boxSizing: 'border-box'
  }} />;

  // ── 详情视图 ─────────────────────────────────────────────────────────────

  if (selectedId !== null) {
    const cfg = detail ? STATUS_CFG[detail.status] ?? STATUS_CFG.DRAFT : STATUS_CFG.DRAFT;
    return <div style={{
      background: bg,
      minHeight: '100vh',
      padding: '16px 16px 32px'
    }}>
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20
      }}>
          <button onClick={() => setSelectedId(null)} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: sub
        }}>
            <ChevronLeft size={24} />
          </button>
          <span style={{
          fontWeight: 700,
          fontSize: 16,
          color: text
        }}>费用申请详情</span>
        </div>

        {detailLoading ? <div style={{
        textAlign: 'center',
        color: sub,
        paddingTop: 60
      }}>加载中...</div> : detail ? <>
            <div style={{
          background: card,
          borderRadius: 14,
          padding: 20,
          marginBottom: 12
        }}>
              <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 12
          }}>
                <div style={{
              fontWeight: 800,
              fontSize: 15,
              color: text
            }}>{detail.expense_no}</div>
                <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 12,
              color: cfg.color,
              background: `${cfg.color}20`
            }}>
                  {cfg.label}
                </span>
              </div>
              <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            fontSize: 13
          }}>
                {[['费用类型', EXPENSE_TYPES[detail.expense_type] ?? detail.expense_type], ['币种', detail.currency_code], ['金额', `${detail.currency_code} ${fmt(detail.amount_original)}`], ['费用日期', detail.expense_date ?? '—'], ['公司', detail.company_name], ['申请人', detail.requester_name ?? '—']].map(([k, v]) => <div key={k}>
                    <div style={{
                color: sub,
                fontSize: 11,
                marginBottom: 2
              }}>{k}</div>
                    <div style={{
                fontWeight: 600,
                color: text
              }}>{v}</div>
                  </div>)}
              </div>
              {detail.description && <div style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${border}`,
            fontSize: 13,
            color: text
          }}>
                  {detail.description}
                </div>}
            </div>

            {detail.status === 'DRAFT' && <button onClick={() => void submitApproval(detail.id)} style={{
          width: '100%',
          padding: '13px',
          borderRadius: 12,
          border: 'none',
          background: 'var(--color-accent)',
          color: 'var(--bg-card)',
          fontWeight: 700,
          fontSize: 15,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 12
        }}>
                <Send size={16} /> 提交审批
              </button>}

            {/* 关联报销 */}
            {detail.reimbursements && detail.reimbursements.length > 0 && <div style={{
          background: card,
          borderRadius: 14,
          padding: 16
        }}>
                <div style={{
            fontWeight: 700,
            fontSize: 14,
            color: text,
            marginBottom: 10
          }}>关联报销</div>
                {detail.reimbursements.map(r => {
            const rCfg = STATUS_CFG[r.status] ?? STATUS_CFG.PENDING_APPROVAL;
            return <div key={r.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: `1px solid ${border}`
            }}>
                      <span style={{
                fontSize: 13,
                color: text
              }}>{r.reimb_no}</span>
                      <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: rCfg.color
              }}>{rCfg.label}</span>
                    </div>;
          })}
              </div>}
          </> : <div style={{
        color: sub,
        textAlign: 'center',
        paddingTop: 60
      }}>记录不存在</div>}
      </div>;
  }

  // ── 主视图 ───────────────────────────────────────────────────────────────

  return <div style={{
    background: bg,
    minHeight: '100vh',
    padding: '16px 16px 32px'
  }}>
      {/* 顶部 */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20
    }}>
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }}>
          <button onClick={() => router.back()} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: sub
        }}>
            <ChevronLeft size={24} />
          </button>
          <span style={{
          fontWeight: 800,
          fontSize: 18,
          color: text
        }}>费用申请</span>
        </div>
        <button onClick={() => void loadList()} disabled={loading} style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: sub
      }}>
          <RefreshCw size={18} style={{
          animation: loading ? 'spin 1s linear infinite' : 'none'
        }} />
        </button>
      </div>

      {/* Tab */}
      <div style={{
      display: 'flex',
      background: isDark ? 'var(--gray-700)' : 'var(--slate-200)',
      borderRadius: 10,
      padding: 3,
      marginBottom: 20
    }}>
        {(['list', 'create'] as Tab[]).map(t => <button key={t} onClick={() => setTab(t)} style={{
        flex: 1,
        padding: '8px 0',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        background: tab === t ? isDark ? 'var(--gray-800)' : 'var(--bg-card)' : 'transparent',
        color: tab === t ? text : sub,
        boxShadow: tab === t ? '0 1px 4px var(--overlay-black-10)' : 'none'
      }}>
            {t === 'list' ? '我的申请' : '+ 新建'}
          </button>)}
      </div>

      {/* 列表 Tab */}
      {tab === 'list' && <>
          {error && <div style={{
        color: 'var(--status-danger)',
        fontSize: 13,
        marginBottom: 12
      }}>{error}</div>}
          {loading ? <div style={{
        textAlign: 'center',
        color: sub,
        paddingTop: 60
      }}>加载中...</div> : records.length === 0 ? <div style={{
        textAlign: 'center',
        color: sub,
        paddingTop: 60
      }}>
              <Receipt size={40} style={{
          opacity: 0.3,
          marginBottom: 10
        }} />
              <div>暂无费用申请</div>
              <div style={{
          fontSize: 12,
          marginTop: 4
        }}>点击"新建"发起申请</div>
            </div> : records.map(item => {
        const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.DRAFT;
        return <div key={item.id} onClick={() => setSelectedId(item.id)} style={{
          background: card,
          borderRadius: 14,
          padding: 16,
          marginBottom: 10,
          cursor: 'pointer'
        }}>
                  <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 8
          }}>
                    <div style={{
              fontWeight: 700,
              fontSize: 14,
              color: text
            }}>{item.expense_no}</div>
                    <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: cfg.color,
              padding: '2px 8px',
              borderRadius: 10,
              background: `${cfg.color}18`
            }}>{cfg.label}</span>
                  </div>
                  <div className={u.flexBetween}>
                    <div>
                      <div style={{
                fontSize: 12,
                color: sub
              }}>
                        {EXPENSE_TYPES[item.expense_type] ?? item.expense_type}
                        {item.expense_date ? ` · ${item.expense_date}` : ''}
                      </div>
                      {item.description && <div style={{
                fontSize: 11,
                color: sub,
                marginTop: 2,
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>{item.description}</div>}
                    </div>
                    <div style={{
              fontWeight: 800,
              fontSize: 16,
              color: text
            }}>{item.currency_code} {fmt(item.amount_original)}</div>
                  </div>
                </div>;
      })}
        </>}

      {/* 创建 Tab */}
      {tab === 'create' && <div style={{
      background: card,
      borderRadius: 14,
      padding: 20
    }}>
          <div style={{
        fontWeight: 700,
        fontSize: 15,
        color: text,
        marginBottom: 18
      }}>新建费用申请</div>

          {[{
        label: '公司代码 *',
        key: 'companyCode' as const,
        placeholder: 'e.g. COMP001'
      }].map(({
        label,
        key,
        placeholder
      }) => <div key={key} className={u.mb14}>
              <div style={{
          fontSize: 12,
          color: sub,
          marginBottom: 6
        }}>{label}</div>
              {inp(key, 'text', placeholder)}
            </div>)}

          <div className={u.mb14}>
            <div style={{
          fontSize: 12,
          color: sub,
          marginBottom: 6
        }}>费用类型 *</div>
            <select value={form.expenseType} onChange={e => setForm(f => ({
          ...f,
          expenseType: e.target.value
        }))} style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: `1.5px solid ${border}`,
          background: card,
          color: text,
          fontSize: 14
        }}>
              {Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div className={u.mb14}>
            <div style={{
          fontSize: 12,
          color: sub,
          marginBottom: 6
        }}>币种</div>
            <select value={form.currencyCode} onChange={e => setForm(f => ({
          ...f,
          currencyCode: e.target.value
        }))} style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: `1.5px solid ${border}`,
          background: card,
          color: text,
          fontSize: 14
        }}>
              {['CNY', 'USD', 'EUR', 'HKD'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {[{
        label: '金额 *',
        key: 'amountOriginal' as const,
        type: 'number',
        placeholder: '0.00'
      }, {
        label: '费用日期',
        key: 'expenseDate' as const,
        type: 'date',
        placeholder: ''
      }].map(({
        label,
        key,
        type,
        placeholder
      }) => <div key={key} className={u.mb14}>
              <div style={{
          fontSize: 12,
          color: sub,
          marginBottom: 6
        }}>{label}</div>
              {inp(key, type, placeholder)}
            </div>)}

          <div className={u.mb20}>
            <div style={{
          fontSize: 12,
          color: sub,
          marginBottom: 6
        }}>费用说明</div>
            <textarea value={form.description} onChange={e => setForm(f => ({
          ...f,
          description: e.target.value
        }))} rows={3} placeholder="请描述费用用途..." style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: `1.5px solid ${border}`,
          background: card,
          color: text,
          fontSize: 14,
          resize: 'none',
          boxSizing: 'border-box'
        }} />
          </div>

          {saveErr && <div style={{
        color: 'var(--status-danger)',
        fontSize: 13,
        marginBottom: 12
      }}>{saveErr}</div>}

          <button onClick={() => void createExpense()} disabled={saving} style={{
        width: '100%',
        padding: '13px',
        borderRadius: 12,
        border: 'none',
        background: 'var(--color-accent)',
        color: 'var(--bg-card)',
        fontWeight: 700,
        fontSize: 15,
        cursor: 'pointer'
      }}>
            {saving ? '创建中...' : '创建草稿'}
          </button>
          <div style={{
        fontSize: 12,
        color: sub,
        textAlign: 'center',
        marginTop: 8
      }}>创建后可在「我的申请」中提交审批</div>
        </div>}
    </div>;
}