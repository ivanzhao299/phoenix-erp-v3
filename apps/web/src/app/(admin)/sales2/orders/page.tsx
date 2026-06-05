'use client';
import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import {
  Plus, RefreshCw, Search, ChevronRight, X,
  AlertTriangle, CheckCircle, Clock, CreditCard,
} from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import { LoadingSkeleton, EmptyState } from '@/components/design-system'; // P1-1 性能快修
import { DictSelect } from '@/components/shared-selectors/DictSelect'; // G2 字典
import {
  CompanySelector, CustomerSelector, ChannelSelector, SkuSelector,
} from '@/components/shared-selectors/MasterDataSelectors'; // G4-C 主数据选择器

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
  DRAFT:            { label: '草稿',    color: 'var(--slate-400)', bg: 'var(--status-neutral-bg-light)' },
  PENDING_APPROVAL: { label: '审批中',  color: 'var(--status-warning)', bg: 'var(--status-warning-bg-light)'  },
  APPROVED:         { label: '已批准',  color: 'var(--status-success)', bg: 'var(--status-success-bg-light)'   },
  ALLOCATED:        { label: '已分配',  color: 'var(--status-info)', bg: 'var(--status-info-bg)'  },
  PICKED:           { label: '已拣货',  color: 'var(--color-purple-500)', bg: 'var(--status-special-bg)'  },
  LOADED:           { label: '已装车',  color: 'var(--status-info)', bg: 'var(--status-info-bg)'   },
  SHIPPED:          { label: '已发货',  color: 'var(--status-info)', bg: 'rgba(14,165,233,0.1)'  },
  DELIVERED:        { label: '已送达',  color: 'var(--status-success)', bg: 'var(--status-success-bg-medium)'  },
  RECEIVED:         { label: '已签收',  color: 'var(--status-success)', bg: 'var(--status-success-bg-light)'  },
  RECONCILED:       { label: '已对账',  color: 'var(--color-accent)', bg: 'var(--status-special-bg-medium)'  },
  REJECTED:         { label: '已拒绝',  color: 'var(--status-danger)', bg: 'var(--status-danger-bg-light)'   },
  CANCELLED:        { label: '已取消',  color: 'var(--slate-500)', bg: 'var(--status-neutral-bg-light)' },
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
  sku_code?: string | null;   // Phase H5
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
  credit_warning: boolean;
  need_price_approval: boolean;
  need_credit_approval: boolean;
  credit_snapshot: Record<string, any> | null;
  ar_invoice_id: string | null;
  created_at: string;
  items?: OrderItem[];
  arInvoice?: any;
}

interface Customer { id: string; customer_code: string; customer_name: string; credit_limit: number; credit_used: number; status: string; }
interface PriceResult { unitPrice: number; floorPrice: number | null; priceBookId: string | null; }
// Phase H5: SKU 主数据
interface SkuItem { sku_code: string; product_code: string; grade_code: string; spec_code: string; sku_name?: string; }

// Phase H5: SKU 徽章（紫色小标签）
function SkuBadge({ code }: { code: string | null | undefined }) {
  if (!code) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10,
      fontFamily: 'monospace', fontWeight: 700, background: 'var(--status-special-bg-medium)',
      color: 'var(--color-purple-500)', border: '1px solid var(--status-special-border)', marginLeft: 4,
    }}>{code}</span>
  );
}

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
    skuCode?: string;   // Phase H5
    _resolved?: PriceResult;
  }>>([{ productCode: '', gradeCode: '', qty: '', actualUnitPrice: '' }]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditInfo, setCreditInfo] = useState<any>(null);
  // Phase H5: SKU 主数据
  const [skus, setSkus] = useState<SkuItem[]>([]);

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
    // Phase H5: 加载 SKU 主数据
    api<any>('GET', '/api/product-master/skus?limit=500')
      .then(r => setSkus(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => {});
  }, []);

  // ── 选择客户时加载实时信用分析（Phase 5：调用 credit-analysis API）────────

  useEffect(() => {
    if (!newForm.customerCode) { setCreditInfo(null); return; }
    const cust = customers.find(c => c.customer_code === newForm.customerCode);
    if (!cust) return;
    // 先用本地快照做即时显示
    setCreditInfo({
      creditLimit:      Number(cust.credit_limit),
      creditUsed:       Number(cust.credit_used),
      creditAvailable:  Number(cust.credit_limit) - Number(cust.credit_used),
      creditStatus:     null,
      totalReceivable:  null,
      overdueReceivable: null,
      overdueDays:      null,
      status:           cust.status,
      loading:          true,
    });
    // 异步拉取实时分析
    api<any>('GET', `/api/v2/sales/customers/${cust.id}/credit-analysis`)
      .then(r => setCreditInfo({
        creditLimit:      Number(r.creditLimit ?? 0),
        creditUsed:       Number(r.creditUsed ?? 0),
        creditAvailable:  Number(r.creditAvailable ?? 0),
        creditStatus:     r.creditStatus ?? 'NORMAL',
        totalReceivable:  Number(r.totalReceivable ?? 0),
        overdueReceivable: Number(r.overdueReceivable ?? 0),
        overdueDays:      Number(r.overdueDays ?? 0),
        status:           cust.status,
        loading:          false,
      }))
      .catch(() => setCreditInfo((prev: typeof creditInfo) => prev ? { ...prev, loading: false } : null));
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
          skuCode:         i.skuCode || undefined,           // Phase H5
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

  const statusConf = (st: string) => STATUS_MAP[st] ?? { label: st, color: 'var(--slate-400)', bg: 'var(--status-neutral-bg-light)' };

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

      {/* P1-1: 错误提示使用 CSS 变量 token */}
      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8,
          background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger-border)',
          color: 'var(--status-danger)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* 订单列表 */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* P1-1: Loading Skeleton — 表头立即显示，数据区骨架屏替代白屏 */}
        {loading ? (
          <div style={{ padding: '12px 0 8px' }}>
            <LoadingSkeleton variant="table" rows={8} />
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: '32px 0' }}>
            <EmptyState title="暂无订单数据" description="当前筛选条件下没有销售订单" compact />
          </div>
        ) : (
        <table className={s.table}>
          <thead>
            <tr>
              {['订单号','客户','金额','状态','价格','信用','应收','操作'].map(h => (
                <th key={h} style={{ whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const sc = statusConf(o.status);
              const nextTarget = TRANSITION_TARGETS[o.status];
              return (
                <tr key={o.id} style={{ cursor: 'pointer' }}
                  onClick={() => openDetail(o.id)}>
                  <td style={{ color: 'var(--color-primary)' }}>{o.order_no}</td>
                  <td>{o.customer_name ?? o.customer_code ?? '—'}</td>
                  <td>{Number(o.total_amount).toLocaleString()} {o.currency_code}</td>
                  <td>
                    <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{sc.label}</span>
                  </td>
                  <td>
                    {o.below_floor_price && <span style={{ fontSize: 11, color: 'var(--status-danger)', fontWeight: 700 }}>⚠ 低价</span>}
                  </td>
                  <td>
                    {o.over_credit && <span style={{ fontSize: 11, color: 'var(--status-warning)', fontWeight: 700 }}>⚠ 超信用</span>}
                  </td>
                  <td>
                    {o.ar_invoice_id
                      ? <span style={{ fontSize: 11, color: 'var(--status-success)', fontWeight: 700 }}>✓ 已生成</span>
                      : o.status === 'RECEIVED'
                        ? <span style={{ fontSize: 11, color: 'var(--status-warning)' }}>待生成</span>
                        : <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>—</span>
                    }
                  </td>
                  <td onClick={e => e.stopPropagation()}>
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
        )}
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
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-black-50)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 560, background: 'var(--bg-card)', height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>新建销售订单</div>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>

            {actionError && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--status-danger-bg-faint)', color: 'var(--status-danger)', fontSize: 13 }}>{actionError}</div>}

            {/* 基本信息 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>公司 *</label>
                {/* G4-C：公司主数据，DataScope 自动过滤 */}
                <CompanySelector value={newForm.companyCode}
                  onChange={v => setNewForm(p => ({ ...p, companyCode: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>渠道</label>
                {/* G4-C：渠道主数据(sal_channels，仅 ACTIVE) */}
                <ChannelSelector value={newForm.channelCode}
                  onChange={v => setNewForm(p => ({ ...p, channelCode: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>预计交货日期</label>
                <input type="date" value={(newForm as any).expectedDeliveryDate ?? ''}
                  onChange={e => setNewForm(p => ({ ...p, expectedDeliveryDate: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>客户</label>
                {/* G4-C：客户主数据(仅 ACTIVE)，DataScope 自动过滤 */}
                <CustomerSelector value={newForm.customerCode}
                  onChange={v => setNewForm(p => ({ ...p, customerCode: v }))} />
              </div>
            </div>

            {/* 信用状态面板（Phase 5 实时分析） */}
            {creditInfo && (() => {
              const cs  = creditInfo.creditStatus;
              const isFrozen  = creditInfo.status === 'FROZEN' || creditInfo.status === 'BLACKLIST' || cs === 'FROZEN';
              const isOverdue = cs === 'OVERDUE';
              const isOver    = cs === 'OVER_LIMIT';
              const isWarn    = cs === 'WARNING';
              const panelBg   = isFrozen ? 'rgba(107,114,128,0.08)' : isOverdue || isOver ? 'rgba(239,68,68,0.07)' : isWarn ? 'rgba(245,158,11,0.07)' : 'var(--status-success-bg-faint)';
              const panelBdr  = isFrozen ? 'rgba(107,114,128,0.25)' : isOverdue || isOver ? 'var(--status-danger-bg-medium)' : isWarn ? 'var(--status-warning-border)' : 'var(--status-success-bg-strong)';
              const statusCfg: Record<string, { label: string; color: string }> = {
                NORMAL:     { label: '信用正常', color: 'var(--status-success)' },
                WARNING:    { label: '⚠ 逾期预警', color: 'var(--status-warning)' },
                OVER_LIMIT: { label: '🚫 超信用额度', color: 'var(--status-danger)' },
                OVERDUE:    { label: '🚫 账期逾期', color: 'var(--status-danger)' },
                FROZEN:     { label: '🔒 账户冻结，禁止下单', color: 'var(--gray-500)' },
              };
              const scf = cs ? (statusCfg[cs] ?? { label: cs, color: 'var(--slate-400)' }) : null;
              return (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: panelBg, border: `1px solid ${panelBdr}`, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {creditInfo.loading ? (
                    <span style={{ color: 'var(--text-secondary)' }}>加载信用信息…</span>
                  ) : (
                    <>
                      {scf && <div style={{ fontWeight: 700, color: scf.color, fontSize: 13 }}>{scf.label}</div>}
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span>信用额度：<strong>{Number(creditInfo.creditLimit).toLocaleString()}</strong></span>
                        <span>实时欠款：<strong style={{ color: creditInfo.totalReceivable > 0 ? 'var(--status-warning)' : undefined }}>{creditInfo.totalReceivable != null ? Number(creditInfo.totalReceivable).toLocaleString() : Number(creditInfo.creditUsed).toLocaleString()}</strong></span>
                        <span style={{ fontWeight: 700, color: creditInfo.creditAvailable < 0 ? 'var(--status-danger)' : 'var(--status-success)' }}>
                          可用：{Number(creditInfo.creditAvailable).toLocaleString()}
                        </span>
                      </div>
                      {creditInfo.overdueReceivable > 0 && (
                        <div style={{ color: 'var(--status-danger)', fontWeight: 600 }}>
                          逾期未收：{Number(creditInfo.overdueReceivable).toLocaleString()}（已逾期 {creditInfo.overdueDays} 天）
                        </div>
                      )}
                      {(isOver || isOverdue) && (
                        <div style={{ color: 'var(--status-danger)', fontWeight: 700, fontSize: 12 }}>
                          ⚠ 提交后将触发信用审批流程
                        </div>
                      )}
                      {isFrozen && (
                        <div style={{ color: 'var(--gray-500)', fontWeight: 700, fontSize: 12 }}>
                          该客户已冻结，无法提交订单，请联系财务
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

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
                  <div key={idx} style={{ padding: 12, borderRadius: 8, border: `1px solid ${belowFloor ? 'var(--status-danger)' : 'var(--border)'}`, marginBottom: 8, background: belowFloor ? 'var(--status-danger-bg-page)' : undefined }}>
                    {/* G4-C：商品 SKU 主数据，禁止手工录入；自动带出 productCode/gradeCode/spec/name */}
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, color: 'var(--color-purple-500)', display: 'block', marginBottom: 2 }}>商品（SKU 主数据）*</label>
                      <SkuSelector
                        value={item.skuCode ?? ''}
                        onChange={code => setNewItems(p => p.map((it, i) => i === idx ? { ...it, skuCode: code, _resolved: undefined } : it))}
                        onPick={o => {
                          const raw = o?.raw;
                          setNewItems(p => p.map((it, i) => i === idx ? {
                            ...it,
                            skuCode:     raw?.sku_code ?? '',
                            productCode: raw?.product_code ?? '',
                            gradeCode:   raw?.grade_code ?? '',
                            _resolved:   undefined,
                          } : it));
                          if (raw) setTimeout(() => resolveItemPrice(idx), 0);
                        }}
                        style={{ fontSize: 12, padding: '6px 8px', border: '1px solid var(--status-special-border)' }} />
                      {item.skuCode && <span style={{ fontSize: 10, color: 'var(--color-purple-500)' }}>✓ 已自动填充产品代码 / 等级 / 规格</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr auto', gap: 8, alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>商品代码</label>
                        <input value={item.productCode} readOnly
                          placeholder="由 SKU 自动带出"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'not-allowed' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>等级</label>
                        <input value={item.gradeCode} readOnly
                          placeholder="自动带出"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'not-allowed' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>数量</label>
                        <input type="number" value={item.qty}
                          onChange={e => setNewItems(p => p.map((it, i) => i === idx ? { ...it, qty: e.target.value } : it))}
                          placeholder="0"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: `${belowFloor ? 'var(--status-danger)' : 'var(--text-secondary)'}`, display: 'block', marginBottom: 2 }}>
                          实际单价 {item._resolved?.floorPrice != null ? `(底价: ${item._resolved.floorPrice})` : ''}
                        </label>
                        <input type="number" value={item.actualUnitPrice}
                          onChange={e => setNewItems(p => p.map((it, i) => i === idx ? { ...it, actualUnitPrice: e.target.value } : it))}
                          placeholder={item._resolved ? String(item._resolved.unitPrice) : '0'}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${belowFloor ? 'var(--status-danger)' : 'var(--border)'}`, background: 'var(--bg-page)', color: belowFloor ? 'var(--status-danger)' : 'var(--text-primary)', fontSize: 12, fontWeight: belowFloor ? 700 : 400 }} />
                        {belowFloor && <div style={{ fontSize: 11, color: 'var(--status-danger)', marginTop: 2 }}>⚠ 低于底价，需审批</div>}
                      </div>
                      <button onClick={() => setNewItems(p => p.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-danger)', paddingBottom: 2 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-black-50)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 560, background: 'var(--bg-card)', height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{detailOrder.order_no}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{detailOrder.company_code}</div>
              </div>
              <button onClick={() => setDetailOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>

            {actionError && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--status-danger-bg-faint)', color: 'var(--status-danger)', fontSize: 13 }}>{actionError}</div>}

            {/* 状态 + 预警 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(() => { const sc = statusConf(detailOrder.status); return (
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: sc.bg, color: sc.color }}>{sc.label}</span>
              ); })()}
              {detailOrder.below_floor_price && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: 'var(--status-danger-bg-light)', color: 'var(--status-danger)' }}>⚠ 低于底价</span>}
              {detailOrder.over_credit && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: 'var(--status-danger-bg-light)', color: 'var(--status-danger)' }}>🚫 超信用额度</span>}
              {detailOrder.credit_warning && !detailOrder.over_credit && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: 'var(--status-warning-bg-light)', color: 'var(--status-warning)' }}>⚠ 信用预警</span>}
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

            {/* 信用快照（提交时刻记录） */}
            {detailOrder.credit_snapshot && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--status-warning-bg-faint)', border: '1px solid var(--status-warning-border)', fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--status-warning)', marginBottom: 6, fontSize: 12 }}>提交时信用快照</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span>状态：<strong>{detailOrder.credit_snapshot.creditStatus ?? '—'}</strong></span>
                  <span>实时欠款：<strong>{Number(detailOrder.credit_snapshot.totalReceivable ?? 0).toLocaleString()}</strong></span>
                  <span>逾期：<strong style={{ color: Number(detailOrder.credit_snapshot.overdueReceivable) > 0 ? 'var(--status-danger)' : undefined }}>
                    {Number(detailOrder.credit_snapshot.overdueReceivable ?? 0).toLocaleString()}
                  </strong></span>
                  <span>可用额度：<strong>{Number(detailOrder.credit_snapshot.creditAvailable ?? 0).toLocaleString()}</strong></span>
                </div>
                {detailOrder.credit_snapshot.reason && (
                  <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{detailOrder.credit_snapshot.reason}</div>
                )}
              </div>
            )}

            {/* AR 信息 */}
            {detailOrder.arInvoice && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--status-success-bg-faint)', border: '1px solid var(--status-success-bg-strong)', fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--status-success)', marginBottom: 6 }}>应收账款记录</div>
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
                <table className={s.table}>
                  <thead>
                    <tr>
                      {['商品','规格','数量','参考价','实际价','底价','金额'].map(h => (
                        <th key={h} style={{ textAlign: h === '商品' || h === '规格' ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detailOrder.items.map((item: OrderItem) => (
                      <tr key={item.id} style={{ background: item.below_floor_price ? 'var(--status-danger-bg-page)' : undefined }}>
                        <td>
                          {item.product_name || item.product_code}
                          <SkuBadge code={item.sku_code} />
                        </td>
                        <td>{item.grade_code || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{Number(item.qty).toLocaleString()}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{Number(item.resolved_unit_price).toLocaleString()}</td>
                        <td style={{ textAlign: 'right', color: item.below_floor_price ? 'var(--status-danger)' : undefined, fontWeight: item.below_floor_price ? 700 : 400 }}>
                          {Number(item.actual_unit_price).toLocaleString()}
                          {item.below_floor_price && ' ⚠'}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{item.floor_price != null ? Number(item.floor_price).toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(item.amount).toLocaleString()}</td>
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
