'use client';
import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';

function tok() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch((process.env.NEXT_PUBLIC_API_BASE || '') + path, {
    headers: { Authorization: `Bearer ${tok()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}
async function apiPost<T = any>(path: string, data: unknown): Promise<T> {
  const res = await fetch((process.env.NEXT_PUBLIC_API_BASE || '') + path, {
    method: 'POST', body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface FarmCustomer { customer_code: string; customer_name: string; }
interface FarmSaleRecord {
  order_no: string; order_date: string; customer_code: string; customer_name: string;
  total_amount: number; status: string; remark: string | null;
  items: Array<{ grade: string; product_name_zh: string; qty: number; unit_price: number; subtotal: number }>;
}

const EGG_GRADES = [
  { code: '0', name: '0号蛋' }, { code: '1', name: '1号蛋' }, { code: '2', name: '2号蛋' },
  { code: '3', name: '3号蛋' }, { code: '4', name: '4号蛋' }, { code: '5', name: '5号蛋' },
  { code: 'DIRTY', name: '脏蛋' }, { code: 'BROKEN', name: '破损蛋' },
];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); };

type Tab = 'new' | 'history';

interface GradeEntry { qty: number; unit_price: number; }

const STATUS_CONF: Record<string, { label: string; color: string }> = {
  PENDING:   { label: '待确认', color: '#f59e0b' },
  CONFIRMED: { label: '已确认', color: '#10b981' },
  CANCELLED: { label: '已取消', color: '#94a3b8' },
};

export default function FarmSalesPage() {
  const { can } = usePermission();
  const { t }   = useLanguage();
  const canEdit  = can(['ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_SALES_MGR', 'ROLE_SALES_REP', 'ROLE_LOG_MGR']);

  const [tab, setTab]     = useState<Tab>('new');
  const [date, setDate]   = useState(today());
  const isToday = date === today();

  const [customers, setCustomers]     = useState<FarmCustomer[]>([]);
  const [selCustomer, setSelCustomer] = useState<FarmCustomer | null>(null);
  const [entries, setEntries]         = useState<Record<string, GradeEntry>>({});
  const [remark, setRemark]           = useState('');

  const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({});
  const [history, setHistory]   = useState<FarmSaleRecord[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const [successNo, setSuccessNo] = useState('');

  useEffect(() => {
    apiFetch<FarmCustomer[]>('/api/farm/sales/customers')
      .then(list => { setCustomers(list); if (list.length > 0) setSelCustomer(list[0]); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch<any[]>('/api/v2/sales/pricing/current')
      .then(list => {
        const map: Record<string, number> = {};
        for (const item of list) {
          if (item.grade_code) map[item.grade_code] = Number(item.unit_price) || 0;
        }
        setDynamicPrices(map);
      })
      .catch(() => {});
  }, []);

  const loadHistory = useCallback(async (d: string) => {
    setLoading(true); setError('');
    try { setHistory(await apiFetch<FarmSaleRecord[]>(`/api/farm/sales?date=${d}`)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory(date);
  }, [tab, date, loadHistory]);

  const getEntry = (grade: string): GradeEntry => entries[grade] ?? { qty: 0, unit_price: dynamicPrices[grade] ?? 0 };
  const setEntry = (grade: string, patch: Partial<GradeEntry>) => {
    setEntries(p => ({ ...p, [grade]: { ...getEntry(grade), ...patch } }));
    setSuccessNo('');
  };

  const activeGrades = EGG_GRADES.filter(g => (entries[g.code]?.qty ?? 0) > 0);
  const totalAmount = activeGrades.reduce((s, g) => {
    const e = getEntry(g.code);
    return s + e.qty * e.unit_price;
  }, 0);

  const handleSubmit = async () => {
    if (!selCustomer || activeGrades.length === 0) return;
    setSubmitting(true); setError('');
    try {
      const res = await apiPost<{ order_no: string }>('/api/farm/sales', {
        date, customer_code: selCustomer.customer_code,
        items: activeGrades.map(g => ({ grade: g.code, qty: entries[g.code].qty, unit_price: entries[g.code].unit_price })),
        remark: remark || undefined,
      });
      setSuccessNo(res.order_no);
      setEntries({}); setRemark('');
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const handleCancel = async (orderNo: string) => {
    if (!confirm(`确认取消订单 ${orderNo}？`)) return;
    try {
      await apiPost(`/api/farm/sales/${orderNo}/cancel`, {});
      loadHistory(date);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('ui.农场直销', '农场直销')}
        subtitle={t('ui.管理农场鲜蛋直销出库订单', '管理农场鲜蛋直销出库订单，独立于B2B和POS渠道（API: /api/farm/sales）')}
        breadcrumb={[t('ui.订单管理', '订单管理'), t('ui.农场直销', '农场直销')]}
      />

      {/* Tab 栏 + 日期（历史 tab 用） */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', marginBottom: 20, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {(['new', 'history'] as Tab[]).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            className={tab === tb ? s.btnPrimary : s.btnSecondary}
            style={{ borderRadius: '8px 8px 0 0', padding: '8px 20px', fontWeight: 600, fontSize: 13 }}>
            {tb === 'new' ? '新建订单' : '历史记录'}
          </button>
        ))}
        {tab === 'history' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 2, marginLeft: 12 }}>
            <button className={s.btnSecondary} onClick={() => setDate(d => addDays(d, -1))} style={{ padding: '4px 8px' }}><ChevronLeft size={14} /></button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 13, color: 'var(--text-primary)', background: 'var(--bg-card)' }} />
            <button className={s.btnSecondary} onClick={() => setDate(d => addDays(d, 1))} disabled={isToday} style={{ padding: '4px 8px', opacity: isToday ? 0.4 : 1 }}><ChevronRight size={14} /></button>
            <button className={s.btnSecondary} onClick={() => loadHistory(date)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px' }}><RefreshCw size={13} />刷新</button>
          </div>
        )}
      </div>

      {error && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 13 }}>{error}</div>}
      {successNo && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', color: '#10b981', fontSize: 13 }}>✓ 订单已创建：{successNo}</div>}

      {/* ── 新建订单 Tab ── */}
      {tab === 'new' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
          {/* 左：蛋品明细表 */}
          <div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-page)', borderBottom: '2px solid var(--border)' }}>
                    {['规格', '名称', '数量（枚）', '单价（LAK）', '小计（LAK）'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: h === '规格' || h === '名称' ? 'left' : 'right', color: 'var(--text-secondary)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EGG_GRADES.map(g => {
                    const e = getEntry(g.code);
                    const subtotal = e.qty * e.unit_price;
                    return (
                      <tr key={g.code} style={{ borderBottom: '1px solid var(--border)', background: e.qty > 0 ? 'rgba(245,158,11,0.03)' : undefined }}>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>{g.code}</span>
                        </td>
                        <td style={{ padding: '9px 14px', fontWeight: 600 }}>{g.name}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                          {canEdit ? (
                            <input type="number" min="0" value={e.qty || ''}
                              onChange={ev => setEntry(g.code, { qty: Math.max(0, Number(ev.target.value) || 0) })}
                              placeholder="0"
                              style={{ width: 100, textAlign: 'right', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
                          ) : e.qty}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                          {canEdit ? (
                            <input type="number" min="0" value={e.unit_price || ''}
                              onChange={ev => setEntry(g.code, { unit_price: Math.max(0, Number(ev.target.value) || 0) })}
                              placeholder="0"
                              style={{ width: 110, textAlign: 'right', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
                          ) : e.unit_price.toLocaleString()}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: e.qty > 0 ? 700 : 400, color: e.qty > 0 ? 'var(--color-primary)' : 'var(--text-secondary)' }}>
                          {subtotal > 0 ? subtotal.toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 右：订单摘要 + 提交 */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>订单摘要</div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>客户</label>
              <select value={selCustomer?.customer_code ?? ''} onChange={e => setSelCustomer(customers.find(c => c.customer_code === e.target.value) ?? null)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }}>
                {customers.map(c => <option key={c.customer_code} value={c.customer_code}>{c.customer_name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>日期</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            {/* 品类明细 */}
            {activeGrades.length > 0 && (
              <div style={{ marginBottom: 14, padding: 12, background: 'var(--bg-page)', borderRadius: 8, border: '1px solid var(--border)' }}>
                {activeGrades.map(g => {
                  const e = getEntry(g.code);
                  return (
                    <div key={g.code} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{g.name} × {e.qty.toLocaleString()}</span>
                      <span style={{ fontWeight: 600 }}>{(e.qty * e.unit_price).toLocaleString()}</span>
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>合计</span>
                  <span style={{ color: 'var(--color-primary)', fontSize: 18 }}>{totalAmount.toLocaleString()} LAK</span>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>备注</label>
              <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={2}
                placeholder="可选备注…"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            {canEdit && (
              <button className={s.btnPrimary}
                onClick={handleSubmit}
                disabled={submitting || !selCustomer || activeGrades.length === 0}
                style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 700, opacity: activeGrades.length === 0 ? 0.5 : 1 }}>
                {submitting ? '提交中…' : `确认创建订单（${totalAmount.toLocaleString()} LAK）`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 历史记录 Tab ── */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中…</div>
            : history.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>当日暂无记录</div>
            : history.map(order => {
              const conf = STATUS_CONF[order.status] ?? { label: order.status, color: '#94a3b8' };
              const isExpanded = expanded === order.order_no;
              return (
                <div key={order.order_no} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', gap: 12, cursor: 'pointer' }}
                    onClick={() => setExpanded(isExpanded ? null : order.order_no)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{order.order_no}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                          background: `${conf.color}15`, color: conf.color, border: `1px solid ${conf.color}30` }}>
                          {conf.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {order.customer_name} · {order.items.length}个品类
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary)' }}>{order.total_amount.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>LAK</div>
                    </div>
                    {canEdit && order.status === 'PENDING' && (
                      <button className={s.btnDanger} onClick={e => { e.stopPropagation(); handleCancel(order.order_no); }}
                        title="取消订单" style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {['品名', '数量(枚)', '单价', '小计'].map(h => (
                              <th key={h} style={{ padding: '6px 8px', textAlign: h === '品名' ? 'left' : 'right', color: 'var(--text-secondary)', fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {order.items.map(item => (
                            <tr key={item.grade} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 8px' }}>{item.product_name_zh || item.grade}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.qty.toLocaleString()}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{item.unit_price.toLocaleString()}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{item.subtotal.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {order.remark && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>备注：{order.remark}</div>}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
