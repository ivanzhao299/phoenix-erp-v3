'use client';
import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import {
  Plus, RefreshCw, Search, ChevronRight, X,
  AlertTriangle, CheckCircle, Clock, CreditCard,
} from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';

// ── helpers ──────────────────────────────────────────────────────────────────

function tok() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
const BASE = process.env.NEXT_PUBLIC_API_BASE || '';

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data ?? d;
}

// ── 状态配置 ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:            { label: '草稿',    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  PENDING_APPROVAL: { label: '审批中',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  APPROVED:         { label: '已批准',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  ALLOCATED:        { label: '已分配',  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  PICKED:           { label: '已拣货',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)'  },
  LOADED:           { label: '已装车',  color: '#06b6d4', bg: 'rgba(6,182,212,0.1)'   },
  SHIPPED:          { label: '已发货',  color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)'  },
  DELIVERED:        { label: '已送达',  color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  RECEIVED:         { label: '已签收',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
  RECONCILED:       { label: '已对账',  color: '#6366f1', bg: 'rgba(99,102,241,0.1)'  },
  REJECTED:         { label: '已拒绝',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  CANCELLED:        { label: '已取消',  color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
};

const TRANSITION_LABELS: Record<string, string> = {
  APPROVED:  '分配库存',
  ALLOCATED: '开始拣货',
  PICKED:    '装车',
  LOADED:    '发货',
  SHIPPED:   '标记送达',
};

const TRANSITION_TARGETS: Record<string, string> = {
  APPROVED:  'ALLOCATED',
  ALLOCATED: 'PICKED',
  PICKED:    'LOADED',
  LOADED:    'SHIPPED',
  SHIPPED:   'DELIVERED',
};

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  product_code: string;
  product_name: string | null;
  grade_code: string | null;
  qty: number;
  resolved_unit_price: number;
  actual_unit_price: number;
  floor_price: number | null;
  amount: number;
  below_floor_price: boolean;
}

interface Order {
  id: string;
  order_no: string;
  customer_code: string | null;
  customer_name: string | null;
  company_code: string;
  channel_code: string | null;
  status: string;
  total_amount: number;
  currency_code: string;
  below_floor_price: boolean;
  over_credit: boolean;
  need_price_approval: boolean;
  need_credit_approval: boolean;
  ar_invoice_id: string | null;
  created_at: string;
  items?: OrderItem[];
  arInvoice?: any;
}

interface Customer { customer_code: string; customer_name: string; credit_limit: number; credit_used: number; }
interface PriceResult { unitPrice: number; floorPrice: number | null; priceBookId: string | null; }

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function SalesV2OrdersPage() {
  const { can } = usePermission();
  const canCreate = can(['ROLE_ADMIN', 'ROLE_SALES_MGR', 'ROLE_SALES_REP']);
  const canApprove = can(['ROLE_ADMIN', 'ROLE_SALES_MGR', 'ROLE_CEO', 'ROLE_FIN_CFO']);
  const canTransit = can(['ROLE_ADMIN', 'ROLE_SALES_MGR', 'ROLE_LOG_MGR']);

  // 列表状态
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [keyword, setKeyword] = useState('');

  // 抽屉状态
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // 新建表单状态
  const [newForm, setNewForm] = useState({
    companyCode: '', customerCode: '', channelCode: '', remark: '',
    expectedDeliveryDate: '', deliveryAddress: '',
  });
  const [newItems, setNewItems] = useState<Array<{
    productCode: string; gradeCode: string; qty: string; actualUnitPrice: string;
    _resolved?: PriceResult;
  }>>([{ productCode: '', gradeCode: '', qty: '', actualUnitPrice: '' }]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditInfo, setCreditInfo] = useState<any>(null);

  // ── 数据加载 ────────────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filterStatus) params.set('status', filterStatus);
      if (keyword) params.set('keyword', keyword);
      const res = await api<any>('GET', `/api/v2/sales/orders?${params}`);
      setOrders(res.data ?? []);
      setTotal(Number(res.total ?? 0));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, filterStatus, keyword]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    api<any>('GET', '/api/v2/sales/customers?limit=200')
      .then(r => setCustomers(r.data ?? []))
      .catch(() => {});
  }, []);

  // ── 选择客户时加载信用快照 ──────────────────────────────────────────────────

  useEffect(() => {
    if (!newForm.customerCode) { setCreditInfo(null); return; }
    const cust = customers.find(c => c.customer_code === newForm.customerCode);
    if (cust) {
      setCreditInfo({
        creditLimit: Number(cust.credit_limit),
        creditUsed:  Number(cust.credit_used),
        creditAvailable: Number(cust.credit_limit) - Number(cust.credit_used),
      });
    }
  }, [newForm.customerCode, customers]);

  // ── 加载详情 ────────────────────────────────────────────────────────────────

  const openDetail = async (id: string) => {
    try {
      const d = await api<Order>('GET', `/api/v2/sales/orders/${id}`);
      setDetailOrder(d);
    } catch (e: any) { setError(e.message); }
  };

  // ── 价格 resolve ────────────────────────────────────────────────────────────

  const resolveItemPrice = async (idx: number) => {
    const item = newItems[idx];
    if (!item.productCode || !newForm.companyCode) return;
    try {
      const r = await api<any>('POST', '/api/v2/sales/pricing/resolve-price', {
        companyCode:  newForm.companyCode,
        productCode:  item.productCode,
        gradeCode:    item.gradeCode || undefined,
        qty:          Number(item.qty) || 1,
        customerCode: newForm.customerCode || undefined,
        channelCode:  newForm.channelCode || undefined,
      });
      setNewItems(prev => prev.map((it, i) => i === idx ? {
        ...it,
        _resolved: { unitPrice: r.unitPrice, floorPrice: r.floorPrice, priceBookId: r.priceBookId },
        actualUnitPrice: it.actualUnitPrice || String(r.unitPrice ?? ''),
      } : it));
    } catch { /* fallback */ }
  };

  // ── 新建订单 ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newForm.companyCode) { setActionError('请填写公司代码'); return; }
    const validItems = newItems.filter(i => i.productCode && Number(i.qty) > 0);
    if (!validItems.length) { setActionError('请至少添加一行有效明细'); return; }
    setActionLoading(true); setActionError('');
    try {
      await api('POST', '/api/v2/sales/orders', {
        companyCode:          newForm.companyCode,
        customerCode:         newForm.customerCode || undefined,
        channelCode:          newForm.channelCode || undefined,
        remark:               newForm.remark || undefined,
        expectedDeliveryDate: newForm.expectedDeliveryDate || undefined,
        deliveryAddress:      newForm.deliveryAddress || undefined,
        items: validItems.map(i => ({
          productCode:     i.productCode,
          gradeCode:       i.gradeCode || undefined,
          qty:             Number(i.qty),
          actualUnitPrice: i.actualUnitPrice ? Number(i.actualUnitPrice) : undefined,
        })),
      });
      setShowCreate(false);
      setNewForm({ companyCode: '', customerCode: '', channelCode: '', remark: '', expectedDeliveryDate: '', deliveryAddress: '' });
      setNewItems([{ productCode: '', gradeCode: '', qty: '', actualUnitPrice: '' }]);
      loadOrders();
    } catch (e: any) { setActionError(e.message); }
    finally { setActionLoading(false); }
  };

  // ── 订单操作 ────────────────────────────────────────────────────────────────

  const doAction = async (id: string, action: string, body?: any) => {
    setActionLoading(true); setActionError('');
    try {
      let updated: Order;
      if (action === 'submit')        updated = await api('POST', `/api/v2/sales/orders/${id}/submit`, body ?? {});
      else if (action === 'cancel')   updated = await api('POST', `/api/v2/sales/orders/${id}/cancel`, body ?? {});
      else if (action === 'receive')  updated = await api('POST', `/api/v2/sales/orders/${id}/mark-received`);
      else                            updated = await api('POST', `/api/v2/sales/orders/${id}/transition`, body);

      setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updated } : o));
      if (detailOrder?.id === id) {
        const d = await api<Order>('GET', `/api/v2/sales/orders/${id}`);
        setDetailOrder(d);
      }
    } catch (e: any) { setActionError(e.message); }
    finally { setActionLoading(false); }
  };

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  const statusConf = (st: string) => STATUS_MAP[st] ?? { label: st, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="销售订单"
        subtitle="统一销售订单 · 定价引擎 · 信用控制 · 审批流程 · 应收联动"
        breadcrumb={['销售系统', '销售订单']}
      />

      {/* 操作栏 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
          <input value={keyword} onChange={e => setKeyword(e.target.value)}
            placeholder="搜索订单号 / 客户名称…"
            style={{ width: '100%', paddingLeft: 32, padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }} />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className={s.btnSecondary} onClick={loadOrders} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> 刷新
        </button>
        {canCreate && (
          <button className={s.btnPrimary} onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> 新建订单
          </button>
        )}
      </div>

      {error && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 13 }}>{error}</div>}

      {/* 订单列表 */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)', borderBottom: '2px solid var(--border)' }}>
              {['订单号','客户','金额','状态','价格','信用','应收','操作'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>暂无订单数据</td></tr>
            ) : orders.map(o => {
              const sc = statusConf(o.status);
              const nextTarget = TRANSITION_TARGETS[o.status];
              return (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => openDetail(o.id)}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--color-primary)' }}>{o.order_no}</td>
                  <td style={{ padding: '10px 14px' }}>{o.customer_name ?? o.customer_code ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{Number(o.total_amount).toLocaleString()} {o.currency_code}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{sc.label}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {o.below_floor_price && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>⚠ 低价</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {o.over_credit && <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>⚠ 超信用</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {o.ar_invoice_id
                      ? <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>✓ 已生成</span>
                      : o.status === 'RECEIVED'
                        ? <span style={{ fontSize: 11, color: '#f59e0b' }}>待生成</span>
                        : <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {o.status === 'DRAFT' && canCreate && (
                        <button className={s.btnPrimary} style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => doAction(o.id, 'submit')}>提交</button>
                      )}
                      {nextTarget && canTransit && (
                        <button className={s.btnSecondary} style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => doAction(o.id, 'transition', { targetStatus: nextTarget })}>
                          {TRANSITION_LABELS[o.status]}
                        </button>
                      )}
                      {o.status === 'DELIVERED' && canTransit && (
                        <button className={s.btnPrimary} style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => doAction(o.id, 'receive')}>确认签收</button>
                      )}
                      {['DRAFT','PENDING_APPROVAL','APPROVED'].includes(o.status) && canCreate && (
                        <button className={s.btnDanger} style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => doAction(o.id, 'cancel')}>取消</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {total > 20 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '4px 12px' }}>上一页</button>
          <span style={{ padding: '4px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>第 {page} 页 / 共 {Math.ceil(total / 20)} 页</span>
          <button className={s.btnSecondary} disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} style={{ padding: '4px 12px' }}>下一页</button>
        </div>
      )}

      {/* ── 新建订单抽屉 ── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 560, background: 'var(--bg-card)', height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>新建销售订单</div>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>

            {actionError && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 13 }}>{actionError}</div>}

            {/* 基本信息 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: '公司代码 *', key: 'companyCode', placeholder: 'HQ' },
                { label: '渠道代码', key: 'channelCode', placeholder: 'CH001' },
                { label: '预计交货日期', key: 'expectedDeliveryDate', type: 'date' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input type={f.type || 'text'}
                    value={(newForm as any)[f.key]}
                    onChange={e => setNewForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>客户</label>
                <select value={newForm.customerCode} onChange={e => setNewForm(p => ({ ...p, customerCode: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }}>
                  <option value="">不指定客户</option>
                  {customers.map(c => <option key={c.customer_code} value={c.customer_code}>{c.customer_name} ({c.customer_code})</option>)}
                </select>
              </div>
            </div>

            {/* 信用信息 */}
            {creditInfo && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: creditInfo.creditAvailable < 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.06)', border: `1px solid ${creditInfo.creditAvailable < 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`, fontSize: 12 }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>信用额度：<strong>{Number(creditInfo.creditLimit).toLocaleString()}</strong></span>
                  <span>已用：<strong>{Number(creditInfo.creditUsed).toLocaleString()}</strong></span>
                  <span style={{ color: creditInfo.creditAvailable < 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                    可用：{Number(creditInfo.creditAvailable).toLocaleString()}
                    {creditInfo.creditAvailable < 0 && ' ⚠ 超额'}
                  </span>
                </div>
              </div>
            )}

            {/* 备注 */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>备注</label>
              <textarea value={newForm.remark} onChange={e => setNewForm(p => ({ ...p, remark: e.target.value }))} rows={2}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            {/* 明细行 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>订单明细</div>
                <button className={s.btnSecondary} style={{ padding: '3px 10px', fontSize: 12 }}
                  onClick={() => setNewItems(p => [...p, { productCode: '', gradeCode: '', qty: '', actualUnitPrice: '' }])}>
                  + 添加行
                </button>
              </div>
              {newItems.map((item, idx) => {
                const belowFloor = item._resolved?.floorPrice != null && Number(item.actualUnitPrice) > 0 && Number(item.actualUnitPrice) < item._resolved.floorPrice;
                return (
                  <div key={idx} style={{ padding: 12, borderRadius: 8, border: `1px solid ${belowFloor ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`, marginBottom: 8, background: belowFloor ? 'rgba(239,68,68,0.04)' : undefined }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr auto', gap: 8, alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>商品代码</label>
                        <input value={item.productCode}
                          onChange={e => setNewItems(p => p.map((it, i) => i === idx ? { ...it, productCode: e.target.value, _resolved: undefined } : it))}
                          onBlur={() => resolveItemPrice(idx)}
                          placeholder="PC001"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>规格</label>
                        <input value={item.gradeCode}
                          onChange={e => setNewItems(p => p.map((it, i) => i === idx ? { ...it, gradeCode: e.target.value } : it))}
                          onBlur={() => resolveItemPrice(idx)}
                          placeholder="1"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>数量</label>
                        <input type="number" value={item.qty}
                          onChange={e => setNewItems(p => p.map((it, i) => i === idx ? { ...it, qty: e.target.value } : it))}
                          placeholder="0"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: `${belowFloor ? '#ef4444' : 'var(--text-secondary)'}`, display: 'block', marginBottom: 2 }}>
                          实际单价 {item._resolved?.floorPrice != null ? `(底价: ${item._resolved.floorPrice})` : ''}
                        </label>
                        <input type="number" value={item.actualUnitPrice}
                          onChange={e => setNewItems(p => p.map((it, i) => i === idx ? { ...it, actualUnitPrice: e.target.value } : it))}
                          placeholder={item._resolved ? String(item._resolved.unitPrice) : '0'}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${belowFloor ? '#ef4444' : 'var(--border)'}`, background: 'var(--bg-page)', color: belowFloor ? '#ef4444' : 'var(--text-primary)', fontSize: 12, fontWeight: belowFloor ? 700 : 400 }} />
                        {belowFloor && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>⚠ 低于底价，需审批</div>}
                      </div>
                      <button onClick={() => setNewItems(p => p.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', paddingBottom: 2 }}>
                        <X size={14} />
                      </button>
                    </div>
                    {item._resolved && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                        参考价: {item._resolved.unitPrice}
                        {item._resolved.floorPrice != null ? ` · 底价: ${item._resolved.floorPrice}` : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
              <button className={s.btnSecondary} onClick={() => setShowCreate(false)}>取消</button>
              <button className={s.btnPrimary} onClick={handleCreate} disabled={actionLoading} style={{ minWidth: 100 }}>
                {actionLoading ? '创建中…' : '创建草稿'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 订单详情抽屉 ── */}
      {detailOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 560, background: 'var(--bg-card)', height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{detailOrder.order_no}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{detailOrder.company_code}</div>
              </div>
              <button onClick={() => setDetailOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>

            {actionError && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 13 }}>{actionError}</div>}

            {/* 状态 + 预警 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(() => { const sc = statusConf(detailOrder.status); return (
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: sc.bg, color: sc.color }}>{sc.label}</span>
              ); })()}
              {detailOrder.below_floor_price && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>⚠ 低于底价</span>}
              {detailOrder.over_credit && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>⚠ 超信用额度</span>}
            </div>

            {/* 基本信息 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
              {[
                ['客户', detailOrder.customer_name ?? detailOrder.customer_code ?? '—'],
                ['渠道', detailOrder.channel_code ?? '—'],
                ['总金额', `${Number(detailOrder.total_amount).toLocaleString()} ${detailOrder.currency_code}`],
                ['应收状态', detailOrder.ar_invoice_id ? `✓ 已生成应收账款` : '未生成'],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{k}</div>
                  <div style={{ fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* AR 信息 */}
            {detailOrder.arInvoice && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: '#22c55e', marginBottom: 6 }}>应收账款记录</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>应收单号：{detailOrder.arInvoice.ar_no}</span>
                  <span>金额：{Number(detailOrder.arInvoice.amount_original).toLocaleString()}</span>
                  <span>到期：{detailOrder.arInvoice.due_date?.slice(0,10)}</span>
                  <span>状态：{detailOrder.arInvoice.status}</span>
                </div>
              </div>
            )}

            {/* 明细表 */}
            {detailOrder.items && detailOrder.items.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>订单明细</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {['商品','规格','数量','参考价','实际价','底价','金额'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: h === '商品' || h === '规格' ? 'left' : 'right', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detailOrder.items.map((item: OrderItem) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: item.below_floor_price ? 'rgba(239,68,68,0.03)' : undefined }}>
                        <td style={{ padding: '6px 8px' }}>{item.product_name || item.product_code}</td>
                        <td style={{ padding: '6px 8px' }}>{item.grade_code || '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Number(item.qty).toLocaleString()}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{Number(item.resolved_unit_price).toLocaleString()}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: item.below_floor_price ? '#ef4444' : undefined, fontWeight: item.below_floor_price ? 700 : 400 }}>
                          {Number(item.actual_unit_price).toLocaleString()}
                          {item.below_floor_price && ' ⚠'}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{item.floor_price != null ? Number(item.floor_price).toLocaleString() : '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{Number(item.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              {detailOrder.status === 'DRAFT' && canCreate && (
                <button className={s.btnPrimary} disabled={actionLoading} onClick={() => doAction(detailOrder.id, 'submit')}>提交审批</button>
              )}
              {TRANSITION_TARGETS[detailOrder.status] && canTransit && (
                <button className={s.btnSecondary} disabled={actionLoading}
                  onClick={() => doAction(detailOrder.id, 'transition', { targetStatus: TRANSITION_TARGETS[detailOrder.status] })}>
                  {TRANSITION_LABELS[detailOrder.status]}
                </button>
              )}
              {detailOrder.status === 'DELIVERED' && canTransit && (
                <button className={s.btnPrimary} disabled={actionLoading} onClick={() => doAction(detailOrder.id, 'receive')}>
                  确认签收
                </button>
              )}
              {['DRAFT','PENDING_APPROVAL','APPROVED'].includes(detailOrder.status) && canCreate && (
                <button className={s.btnDanger} disabled={actionLoading} onClick={() => doAction(detailOrder.id, 'cancel')}>取消订单</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
