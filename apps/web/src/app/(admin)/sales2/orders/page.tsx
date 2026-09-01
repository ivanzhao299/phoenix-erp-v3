'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import u from "@/styles/uix-utils.module.css";
import PageHeader from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import { Plus, RefreshCw, Search, ChevronRight, X, AlertTriangle, CheckCircle, Clock, CreditCard } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import { LoadingSkeleton, EmptyState } from '@/components/design-system'; // P1-1 性能快修
import { ModalV2 } from '@/components/design-system/dialogs/ModalV2';
import { DictSelect } from '@/components/shared-selectors/DictSelect'; // G2 字典
import { CompanySelector, CustomerSelector, ChannelSelector, SkuSelector } from '@/components/shared-selectors/MasterDataSelectors'; // G4-C 主数据选择器
import { useLanguage } from "@/contexts/LanguageContext";
import { normalizeSalesOrdersPage } from '@/lib/sales-orders-response';
import styles from './orders.module.css';

// ── helpers ──────────────────────────────────────────────────────────────────

function tok() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
const BASE = process.env.NEXT_PUBLIC_API_BASE || '';
async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${tok()}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data ?? d;
}

async function apiEnvelope<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── 状态配置 ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, {
  label: string;
  color: string;
  bg: string;
}> = {
  DRAFT: {
    label: '草稿',
    color: 'var(--slate-400)',
    bg: 'var(--status-neutral-bg-light)'
  },
  PENDING_APPROVAL: {
    label: '审批中',
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-bg-light)'
  },
  APPROVED: {
    label: '已批准',
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg-light)'
  },
  ALLOCATED: {
    label: '已分配',
    color: 'var(--status-info)',
    bg: 'var(--status-info-bg)'
  },
  PICKED: {
    label: '已拣货',
    color: 'var(--color-purple-500)',
    bg: 'var(--status-special-bg)'
  },
  LOADED: {
    label: '已装车',
    color: 'var(--status-info)',
    bg: 'var(--status-info-bg)'
  },
  SHIPPED: {
    label: '已发货',
    color: 'var(--status-info)',
    bg: 'rgba(14,165,233,0.1)'
  },
  DELIVERED: {
    label: '已送达',
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg-medium)'
  },
  RECEIVED: {
    label: '已签收',
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg-light)'
  },
  RECONCILED: {
    label: '已对账',
    color: 'var(--color-accent)',
    bg: 'var(--status-special-bg-medium)'
  },
  REJECTED: {
    label: '已拒绝',
    color: 'var(--status-danger)',
    bg: 'var(--status-danger-bg-light)'
  },
  CANCELLED: {
    label: '已取消',
    color: 'var(--slate-500)',
    bg: 'var(--status-neutral-bg-light)'
  },
  OPEN: {
    label: '待结算', color: 'var(--status-warning)', bg: 'var(--status-warning-bg-light)'
  },
  COMPLETED: {
    label: '已成交', color: 'var(--status-success)', bg: 'var(--status-success-bg-light)'
  },
  VOID: {
    label: '已作废', color: 'var(--slate-500)', bg: 'var(--status-neutral-bg-light)'
  },
  RETURNED: {
    label: '已退货', color: 'var(--status-danger)', bg: 'var(--status-danger-bg-light)'
  }
};
const TRANSITION_LABELS: Record<string, string> = {
  APPROVED: '分配库存',
  ALLOCATED: '开始拣货',
  PICKED: '装车',
  LOADED: '发货',
  SHIPPED: '标记送达'
};
const TRANSITION_TARGETS: Record<string, string> = {
  APPROVED: 'ALLOCATED',
  ALLOCATED: 'PICKED',
  PICKED: 'LOADED',
  LOADED: 'SHIPPED',
  SHIPPED: 'DELIVERED'
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
  sku_code?: string | null; // Phase H5
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
type ActivitySource = 'ALL' | 'ORDER' | 'POS';
interface SalesActivityRow {
  sourceType: 'ORDER' | 'POS';
  sourceId: string;
  documentNo: string;
  companyCode: string;
  storeCode: string | null;
  customerCode: string | null;
  customerName: string | null;
  status: string;
  displayCategory: string;
  amount: number;
  currency: string;
  businessDate: string;
  occurredAt: string;
  detailHref: string;
}
interface SalesActivityResponse {
  data: SalesActivityRow[];
  availableSources: Array<'ORDER' | 'POS'>;
  hasMore: boolean;
  page: number;
  limit: number;
}

function isSalesActivityResponse(value: unknown): value is SalesActivityResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  return Array.isArray(response.data)
    && response.data.every(row => !!row && typeof row === 'object'
      && ((row as SalesActivityRow).sourceType === 'ORDER' || (row as SalesActivityRow).sourceType === 'POS')
      && typeof (row as SalesActivityRow).sourceId === 'string'
      && typeof (row as SalesActivityRow).documentNo === 'string')
    && Array.isArray(response.availableSources)
    && response.availableSources.every(source => source === 'ORDER' || source === 'POS')
    && typeof response.hasMore === 'boolean'
    && typeof response.page === 'number'
    && typeof response.limit === 'number';
}

function orderToActivity(order: Order): SalesActivityRow {
  return {
    sourceType: 'ORDER', sourceId: order.id, documentNo: order.order_no,
    companyCode: order.company_code, storeCode: null,
    customerCode: order.customer_code, customerName: order.customer_name,
    status: order.status, displayCategory: `${order.status}_ORDER`,
    amount: Number(order.total_amount), currency: order.currency_code,
    businessDate: order.created_at?.slice(0, 10) ?? '', occurredAt: order.created_at,
    detailHref: `/sales2/orders?orderId=${order.id}`
  };
}
interface Customer {
  id: string;
  customer_code: string;
  customer_name: string;
  credit_limit: number;
  credit_used: number;
  status: string;
}
interface PriceResult {
  unitPrice: number;
  floorPrice: number | null;
  priceBookId: string | null;
}
// Phase H5: SKU 主数据
interface SkuItem {
  sku_code: string;
  product_code: string;
  grade_code: string;
  spec_code: string;
  sku_name?: string;
}

// Phase H5: SKU 徽章（紫色小标签）
function SkuBadge({
  code
}: {
  code: string | null | undefined;
}) {
  if (!code) return null;
  return <span style={{
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: 700,
    background: 'var(--status-special-bg-medium)',
    color: 'var(--color-purple-500)',
    border: '1px solid var(--status-special-border)',
    marginLeft: 4
  }}>{code}</span>;
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function SalesV2OrdersPage() {
  const { t } = useLanguage();
  // G24-A：PBAC 收口（销售订单域 MENU_SALES2_ORDER）
  const { canView: canViewOrders, canCreate, canApprove, canEdit: canTransit } = usePermission('MENU_SALES2_ORDER');
  const { canView: canViewStorePos } = usePermission('MENU_STORE_POS');

  // 列表状态
  const [orders, setOrders] = useState<SalesActivityRow[]>([]);
  const [source, setSource] = useState<ActivitySource>('ALL');
  const [availableSources, setAvailableSources] = useState<Array<'ORDER' | 'POS'>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [degraded, setDegraded] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [keyword, setKeyword] = useState('');

  // 抽屉状态
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // 新建表单状态
  const [newForm, setNewForm] = useState({
    companyCode: '',
    customerCode: '',
    channelCode: '',
    remark: '',
    expectedDeliveryDate: '',
    deliveryAddress: ''
  });
  const [newItems, setNewItems] = useState<Array<{
    productCode: string;
    gradeCode: string;
    qty: string;
    actualUnitPrice: string;
    skuCode?: string; // Phase H5
    _resolved?: PriceResult;
  }>>([{
    productCode: '',
    gradeCode: '',
    qty: '',
    actualUnitPrice: ''
  }]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditInfo, setCreditInfo] = useState<any>(null);
  // Phase H5: SKU 主数据
  const [skus, setSkus] = useState<SkuItem[]>([]);

  // ── 数据加载 ────────────────────────────────────────────────────────────────

  const loadOrders = useCallback(async (query?: { page?: number; status?: string; keyword?: string; source?: ActivitySource }) => {
    setLoading(true);
    setError('');
    try {
      const requestedPage = query?.page ?? page;
      const requestedStatus = query?.status ?? filterStatus;
      const requestedKeyword = query?.keyword ?? keyword;
      const requestedSource = query?.source ?? source;
      const params = new URLSearchParams({
        page: String(requestedPage),
        limit: '20',
        source: requestedSource
      });
      if (requestedStatus) params.set('status', requestedStatus);
      if (requestedKeyword) params.set('keyword', requestedKeyword);
      const res = await apiEnvelope<unknown>(`/api/v2/sales/activity?${params}`);
      if (!isSalesActivityResponse(res)) throw new Error(t('ui.联合列表响应契约无效','联合列表响应契约无效'));
      setOrders(res.data);
      setAvailableSources(res.availableSources);
      setHasMore(res.hasMore);
      setDegraded(false);
    } catch (e: any) {
      if (canViewOrders) {
        try {
          const fallbackParams = new URLSearchParams({ page: String(query?.page ?? page), limit: '20' });
          const requestedStatus = query?.status ?? filterStatus;
          const requestedKeyword = query?.keyword ?? keyword;
          if (requestedStatus) fallbackParams.set('status', requestedStatus);
          if (requestedKeyword) fallbackParams.set('keyword', requestedKeyword);
          const fallback = await api<unknown>('GET', `/api/v2/sales/orders?${fallbackParams}`);
          const normalized = normalizeSalesOrdersPage<Order>(fallback);
          setOrders(normalized.rows.map(orderToActivity));
          setAvailableSources(['ORDER']);
          setHasMore(normalized.total > (query?.page ?? page) * 20);
          setDegraded(true);
          setError(t('ui.联合列表不可用当前展示客户订单','联合列表不可用，当前展示客户订单'));
        } catch (fallbackError: any) {
          setError(`${e.message || t('ui.联合列表加载失败','联合列表加载失败')}；${t('ui.客户订单降级也失败','客户订单降级也失败')}：${fallbackError.message}`);
        }
      } else {
        setError(e.message || t('ui.联合列表加载失败','联合列表加载失败'));
      }
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, keyword, source, canViewOrders]);
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);
  useEffect(() => {
    api<any>('GET', '/api/v2/sales/customers?limit=200').then(r => setCustomers(r.data ?? [])).catch(() => {});
    // Phase H5: 加载 SKU 主数据
    api<any>('GET', '/api/product-master/skus?limit=500').then(r => setSkus(Array.isArray(r) ? r : r.data ?? [])).catch(() => {});
  }, []);

  // ── 选择客户时加载实时信用分析（Phase 5：调用 credit-analysis API）────────

  useEffect(() => {
    if (!newForm.customerCode) {
      setCreditInfo(null);
      return;
    }
    const cust = customers.find(c => c.customer_code === newForm.customerCode);
    if (!cust) return;
    // 先用本地快照做即时显示
    setCreditInfo({
      creditLimit: Number(cust.credit_limit),
      creditUsed: Number(cust.credit_used),
      creditAvailable: Number(cust.credit_limit) - Number(cust.credit_used),
      creditStatus: null,
      totalReceivable: null,
      overdueReceivable: null,
      overdueDays: null,
      status: cust.status,
      loading: true
    });
    // 异步拉取实时分析
    api<any>('GET', `/api/v2/sales/customers/${cust.id}/credit-analysis`).then(r => setCreditInfo({
      creditLimit: Number(r.creditLimit ?? 0),
      creditUsed: Number(r.creditUsed ?? 0),
      creditAvailable: Number(r.creditAvailable ?? 0),
      creditStatus: r.creditStatus ?? 'NORMAL',
      totalReceivable: Number(r.totalReceivable ?? 0),
      overdueReceivable: Number(r.overdueReceivable ?? 0),
      overdueDays: Number(r.overdueDays ?? 0),
      status: cust.status,
      loading: false
    })).catch(() => setCreditInfo((prev: typeof creditInfo) => prev ? {
      ...prev,
      loading: false
    } : null));
  }, [newForm.customerCode, customers]);

  // ── 加载详情 ────────────────────────────────────────────────────────────────

  const openDetail = async (id: string) => {
    try {
      const d = await api<Order>('GET', `/api/v2/sales/orders/${id}`);
      setDetailOrder(d);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── 价格 resolve ────────────────────────────────────────────────────────────

  const resolveItemPrice = async (idx: number) => {
    const item = newItems[idx];
    if (!item.productCode || !newForm.companyCode) return;
    try {
      const r = await api<any>('POST', '/api/v2/sales/pricing/resolve-price', {
        companyCode: newForm.companyCode,
        productCode: item.productCode,
        gradeCode: item.gradeCode || undefined,
        qty: Number(item.qty) || 1,
        customerCode: newForm.customerCode || undefined,
        channelCode: newForm.channelCode || undefined
      });
      setNewItems(prev => prev.map((it, i) => i === idx ? {
        ...it,
        _resolved: {
          unitPrice: r.unitPrice,
          floorPrice: r.floorPrice,
          priceBookId: r.priceBookId
        },
        actualUnitPrice: it.actualUnitPrice || String(r.unitPrice ?? '')
      } : it));
    } catch {/* fallback */}
  };

  // ── 新建订单 ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newForm.companyCode) {
      setActionError(t('ui.请填写公司代码','请填写公司代码'));
      return;
    }
    const validItems = newItems.filter(i => i.productCode && Number(i.qty) > 0);
    if (!validItems.length) {
      setActionError(t('ui.请至少添加一行有效明细','请至少添加一行有效明细'));
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      await api('POST', '/api/v2/sales/orders', {
        companyCode: newForm.companyCode,
        customerCode: newForm.customerCode || undefined,
        channelCode: newForm.channelCode || undefined,
        remark: newForm.remark || undefined,
        expectedDeliveryDate: newForm.expectedDeliveryDate || undefined,
        deliveryAddress: newForm.deliveryAddress || undefined,
        items: validItems.map(i => ({
          skuCode: i.skuCode || undefined,
          // Phase H5
          productCode: i.productCode,
          gradeCode: i.gradeCode || undefined,
          qty: Number(i.qty),
          actualUnitPrice: i.actualUnitPrice ? Number(i.actualUnitPrice) : undefined
        }))
      });
      setShowCreate(false);
      setNewForm({
        companyCode: '',
        customerCode: '',
        channelCode: '',
        remark: '',
        expectedDeliveryDate: '',
        deliveryAddress: ''
      });
      setNewItems([{
        productCode: '',
        gradeCode: '',
        qty: '',
        actualUnitPrice: ''
      }]);
      // A draft must be discoverable immediately even when the user created it
      // from a later page or while a status/keyword filter was active.
      setPage(1);
      setSource('ORDER');
      setFilterStatus('');
      setKeyword('');
      await loadOrders({ page: 1, status: '', keyword: '', source: 'ORDER' });
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── 订单操作 ────────────────────────────────────────────────────────────────

  const doAction = async (id: string, action: string, body?: any) => {
    setActionLoading(true);
    setActionError('');
    try {
      if (action === 'submit') await api('POST', `/api/v2/sales/orders/${id}/submit`, body ?? {});else if (action === 'cancel') await api('POST', `/api/v2/sales/orders/${id}/cancel`, body ?? {});else if (action === 'receive') await api('POST', `/api/v2/sales/orders/${id}/mark-received`);else await api('POST', `/api/v2/sales/orders/${id}/transition`, body);

      // Mutation responses are not guaranteed to contain the complete order.
      // Re-query the current page so its status and available actions always
      // reflect the server-authoritative workflow state without a manual refresh.
      await loadOrders();
      if (detailOrder?.id === id) {
        const d = await api<Order>('GET', `/api/v2/sales/orders/${id}`);
        setDetailOrder(d);
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  const statusConf = (st: string) => STATUS_MAP[st] ?? {
    label: st,
    color: 'var(--slate-400)',
    bg: 'var(--status-neutral-bg-light)'
  };
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.销售订单','销售订单')} subtitle={t('ui.统一销售订单 · 定价引擎 · 信用控制 · 审批流程 · 应收联动','统一销售订单 · 定价引擎 · 信用控制 · 审批流程 · 应收联动')} breadcrumb={[t('ui.销售系统','销售系统'), t('ui.销售订单','销售订单')]} />

      <div style={{
      marginBottom: 16,
      padding: '12px 14px',
      borderRadius: 8,
      border: '1px solid var(--status-info-border)',
      background: 'var(--status-info-bg)',
      color: 'var(--text-secondary)',
      fontSize: 13
    }}>
        {t('ui.客户订单与门店POS成交采用不同业务链路；联合列表仅供发现与查看，不作为结算、资金、应收或过账输入。','客户订单与门店 POS 成交采用不同业务链路；联合列表仅供发现与查看，不作为结算、资金、应收或过账输入。')}
        {canViewStorePos && <Link href="/store-pos" style={{
        marginLeft: 8,
        color: 'var(--status-info)',
        fontWeight: 700
      }}>{t('ui.查看门店POS成交','查看门店 POS 成交')} →</Link>}
      </div>

      {/* 操作栏 */}
      <div role="tablist" aria-label={t('ui.销售来源','销售来源')} style={{
      display: 'flex', gap: 8, marginBottom: 12
    }}>
        {([['ALL', t('ui.全部','全部')], ['ORDER', t('ui.客户订单','客户订单')], ['POS', t('ui.POS成交','POS 成交')]] as const)
          .filter(([value]) => value === 'ALL' || availableSources.includes(value))
          .map(([value, label]) => <button key={value} role="tab" aria-selected={source === value}
            className={source === value ? s.btnPrimary : s.btnSecondary}
            onClick={() => { setSource(value); setPage(1); setFilterStatus(''); }}>
              {label}
            </button>)}
      </div>

      <div style={{
      display: 'flex',
      gap: 10,
      marginBottom: 20,
      flexWrap: 'wrap',
      alignItems: 'center'
    }}>
        <div style={{
        position: 'relative',
        flex: 1,
        minWidth: 200
      }}>
          <Search size={14} style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: 0.4
        }} />
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={t('ui.搜索订单号 / 客户名称…','搜索订单号 / 客户名称…')} style={{
          width: '100%',
          paddingLeft: 32,
          padding: '8px 12px 8px 32px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontSize: 13
        }} />
        </div>
        <select value={filterStatus} onChange={e => {
        setFilterStatus(e.target.value);
        setPage(1);
      }} style={{
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        fontSize: 13
      }}>
          <option value="">{t('ui.全部状态','全部状态')}</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className={`${s.btnSecondary} ${u.flexRow}`} onClick={() => void loadOrders()}>
          <RefreshCw size={14} /> {t('ui.刷新','刷新')}
        </button>
        {canCreate && <button className={`${s.btnPrimary} ${u.flexRow}`} onClick={() => setShowCreate(true)}>
            <Plus size={14} /> {t('ui.新建订单','新建订单')}
          </button>}
      </div>

      {/* P1-1: 错误提示使用 CSS 变量 token */}
      {error && <div role="alert" style={{
      marginBottom: 12,
      padding: '10px 14px',
      borderRadius: 8,
      background: 'var(--status-danger-bg)',
      border: '1px solid var(--status-danger-border)',
      color: 'var(--status-danger)',
      fontSize: 13
    }}>
          {error}{orders.length > 0 && !degraded ? ` · ${t('ui.数据可能为旧值','数据可能为旧值')}` : ''}
        </div>}

      {actionError && !detailOrder && !showCreate && <div role="alert" style={{
      marginBottom: 12,
      padding: '10px 14px',
      borderRadius: 8,
      background: 'var(--status-danger-bg)',
      border: '1px solid var(--status-danger-border)',
      color: 'var(--status-danger)',
      fontSize: 13
    }}>
          {actionError}
        </div>}

      {/* 订单列表 */}
      <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      overflow: 'hidden'
    }}>
        {/* P1-1: Loading Skeleton — 表头立即显示，数据区骨架屏替代白屏 */}
        {loading && orders.length === 0 ? <div style={{
        padding: '12px 0 8px'
      }}>
            <LoadingSkeleton variant="table" rows={8} />
          </div> : orders.length === 0 && !error ? <div style={{
        padding: '32px 0'
      }}>
            <EmptyState title={t('ui.暂无销售数据','暂无销售数据')} description={t('ui.当前筛选条件下没有可见的客户订单或POS成交','当前筛选条件下没有可见的客户订单或 POS 成交')} compact />
          </div> : orders.length > 0 ? <div className={styles.tableScroll} aria-busy={loading}><table className={`${s.table} ${styles.ordersTable}`} style={{ tableLayout: "fixed", width: "100%" }}>
          <thead>
            <tr>
              {[t('ui.来源','来源'), t('ui.单据号','单据号'), t('ui.客户门店','客户 / 门店'), t('ui.金额','金额'), t('ui.状态','状态'), t('ui.业务日期','业务日期'), t('ui.操作','操作')].map(h => <th key={h} className={u.nowrap}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
            const sc = statusConf(o.status);
            const nextTarget = TRANSITION_TARGETS[o.status];
            const isOrder = o.sourceType === 'ORDER';
            const openActivity = () => isOrder ? openDetail(o.sourceId) : window.location.assign(o.detailHref);
            return <tr key={`${o.sourceType}:${o.sourceId}`} className={u.pointer} onClick={openActivity}>
                  <td><span style={{
                padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: isOrder ? 'var(--status-info-bg)' : 'var(--status-special-bg)',
                color: isOrder ? 'var(--status-info)' : 'var(--color-purple-500)'
              }}>{isOrder ? t('ui.销售订单','销售订单') : 'POS'}</span></td>
                  <td style={{
                color: 'var(--color-primary)'
              }}>{o.documentNo}</td>
                  <td>{o.customerName ?? o.customerCode ?? '—'}{o.storeCode ? ` · ${o.storeCode}` : ''}</td>
                  <td>{Number(o.amount).toLocaleString()} {o.currency}</td>
                  <td>
                    <span style={{
                  padding: '3px 8px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  background: sc.bg,
                  color: sc.color
                }}>{sc.label}</span>
                  </td>
                  <td>{o.businessDate}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{
                  display: 'flex',
                  gap: 4
                }}>
                      {isOrder && o.status === 'DRAFT' && canCreate && <button className={s.btnPrimary} style={{
                    padding: '3px 8px',
                    fontSize: 11
                  }} disabled={actionLoading} onClick={() => doAction(o.sourceId, 'submit')}>{t('ui.提交','提交')}</button>}
                      {isOrder && nextTarget && canTransit && <button className={s.btnSecondary} style={{
                    padding: '3px 8px',
                    fontSize: 11
                  }} disabled={actionLoading} onClick={() => doAction(o.sourceId, 'transition', {
                    targetStatus: nextTarget
                  })}>
                          {TRANSITION_LABELS[o.status]}
                        </button>}
                      {isOrder && o.status === 'DELIVERED' && canTransit && <button className={s.btnPrimary} style={{
                    padding: '3px 8px',
                    fontSize: 11
                  }} disabled={actionLoading} onClick={() => doAction(o.sourceId, 'receive')}>{t('ui.确认签收','确认签收')}</button>}
                      {isOrder && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(o.status) && canCreate && <button className={s.btnDanger} style={{
                    padding: '3px 8px',
                    fontSize: 11
                  }} disabled={actionLoading} onClick={() => doAction(o.sourceId, 'cancel')}>{t('ui.取消','取消')}</button>}
                      {!isOrder && <button className={s.btnSecondary} style={{ padding: '3px 8px', fontSize: 11 }} onClick={openActivity}>{t('ui.查看详情','查看详情')}</button>}
                    </div>
                  </td>
                </tr>;
          })}
          </tbody>
        </table></div> : null}
      </div>

      {/* 分页 */}
      {(page > 1 || hasMore) && <div style={{
      display: 'flex',
      gap: 8,
      justifyContent: 'center',
      marginTop: 16
    }}>
          <button className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{
        padding: '4px 12px'
      }}>{t('ui.上一页','上一页')}</button>
          <span style={{
        padding: '4px 12px',
        fontSize: 13,
        color: 'var(--text-secondary)'
      }}>{t('ui.第','第')} {page} {t('ui.页','页')}</span>
          <button className={s.btnSecondary} disabled={!hasMore} onClick={() => setPage(p => p + 1)} style={{
        padding: '4px 12px'
      }}>{t('ui.下一页','下一页')}</button>
        </div>}

      {/* ── 新建订单弹窗 ── */}
      <ModalV2 open={showCreate} title={t('ui.新建销售订单','新建销售订单')} onClose={() => setShowCreate(false)} width={580}
        footer={<>
          <button className={s.btnSecondary} onClick={() => setShowCreate(false)}>{t('ui.取消','取消')}</button>
          <button className={s.btnPrimary} onClick={handleCreate} disabled={actionLoading} style={{ minWidth: 100 }}>
            {actionLoading ? t('ui.创建中…','创建中…') : t('ui.创建草稿','创建草稿')}
          </button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {actionError && <div style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: 'var(--status-danger-bg-faint)',
          color: 'var(--status-danger)',
          fontSize: 13
        }}>{actionError}</div>}

            {/* 基本信息 */}
            <div className={styles.formGrid}>
              <div>
                <label style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: 4
            }}>{t('ui.公司 *','公司 *')}</label>
                {/* G4-C：公司主数据，DataScope 自动过滤 */}
                <CompanySelector value={newForm.companyCode} onChange={v => setNewForm(p => ({
              ...p,
              companyCode: v
            }))} />
              </div>
              <div>
                <label style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: 4
            }}>{t('ui.渠道','渠道')}</label>
                {/* G4-C：渠道主数据(sal_channels，仅 ACTIVE) */}
                <ChannelSelector value={newForm.channelCode} onChange={v => setNewForm(p => ({
              ...p,
              channelCode: v
            }))} />
              </div>
              <div>
                <label style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: 4
            }}>{t('ui.预计交货日期','预计交货日期')}</label>
                <input type="date" value={(newForm as any).expectedDeliveryDate ?? ''} onChange={e => setNewForm(p => ({
              ...p,
              expectedDeliveryDate: e.target.value
            }))} style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-page)',
              color: 'var(--text-primary)',
              fontSize: 13,
              boxSizing: 'border-box'
            }} />
              </div>
              <div>
                <label style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: 4
            }}>{t('ui.客户','客户')}</label>
                {/* G4-C：客户主数据(仅 ACTIVE)，DataScope 自动过滤 */}
                <CustomerSelector value={newForm.customerCode} onChange={v => setNewForm(p => ({
              ...p,
              customerCode: v
            }))} />
              </div>
            </div>

            {/* 信用状态面板（Phase 5 实时分析） */}
            {creditInfo && (() => {
          const cs = creditInfo.creditStatus;
          const isFrozen = creditInfo.status === 'FROZEN' || creditInfo.status === 'BLACKLIST' || cs === 'FROZEN';
          const isOverdue = cs === 'OVERDUE';
          const isOver = cs === 'OVER_LIMIT';
          const isWarn = cs === 'WARNING';
          const panelBg = isFrozen ? 'rgba(107,114,128,0.08)' : isOverdue || isOver ? 'rgba(239,68,68,0.07)' : isWarn ? 'rgba(245,158,11,0.07)' : 'var(--status-success-bg-faint)';
          const panelBdr = isFrozen ? 'rgba(107,114,128,0.25)' : isOverdue || isOver ? 'var(--status-danger-bg-medium)' : isWarn ? 'var(--status-warning-border)' : 'var(--status-success-bg-strong)';
          const statusCfg: Record<string, {
            label: string;
            color: string;
          }> = {
            NORMAL: {
              label: t('ui.信用正常','信用正常'),
              color: 'var(--status-success)'
            },
            WARNING: {
              label: t('ui.⚠ 逾期预警','⚠ 逾期预警'),
              color: 'var(--status-warning)'
            },
            OVER_LIMIT: {
              label: t('ui.🚫 超信用额度','🚫 超信用额度'),
              color: 'var(--status-danger)'
            },
            OVERDUE: {
              label: t('ui.🚫 账期逾期','🚫 账期逾期'),
              color: 'var(--status-danger)'
            },
            FROZEN: {
              label: t('ui.🔒 账户冻结，禁止下单','🔒 账户冻结，禁止下单'),
              color: 'var(--gray-500)'
            }
          };
          const scf = cs ? statusCfg[cs] ?? {
            label: cs,
            color: 'var(--slate-400)'
          } : null;
          return <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: panelBg,
            border: `1px solid ${panelBdr}`,
            fontSize: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
                  {creditInfo.loading ? <span className={u.muted}>{t('ui.加载信用信息…','加载信用信息…')}</span> : <>
                      {scf && <div style={{
                fontWeight: 700,
                color: scf.color,
                fontSize: 13
              }}>{scf.label}</div>}
                      <div style={{
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap'
              }}>
                        <span>{t('ui.信用额度：','信用额度：')}<strong>{Number(creditInfo.creditLimit).toLocaleString()}</strong></span>
                        <span>{t('ui.实时欠款：','实时欠款：')}<strong style={{
                    color: creditInfo.totalReceivable > 0 ? 'var(--status-warning)' : undefined
                  }}>{creditInfo.totalReceivable != null ? Number(creditInfo.totalReceivable).toLocaleString() : Number(creditInfo.creditUsed).toLocaleString()}</strong></span>
                        <span style={{
                  fontWeight: 700,
                  color: creditInfo.creditAvailable < 0 ? 'var(--status-danger)' : 'var(--status-success)'
                }}>
                          {t('ui.可用：','可用：')}{Number(creditInfo.creditAvailable).toLocaleString()}
                        </span>
                      </div>
                      {creditInfo.overdueReceivable > 0 && <div style={{
                color: 'var(--status-danger)',
                fontWeight: 600
              }}>
                          {t('ui.逾期未收：','逾期未收：')}{Number(creditInfo.overdueReceivable).toLocaleString()}{t('ui.（已逾期','（已逾期')} {creditInfo.overdueDays} {t('ui.天）','天）')}
                        </div>}
                      {(isOver || isOverdue) && <div style={{
                color: 'var(--status-danger)',
                fontWeight: 700,
                fontSize: 12
              }}>
                          {t('ui.⚠ 提交后将触发信用审批流程','⚠ 提交后将触发信用审批流程')}
                        </div>}
                      {isFrozen && <div style={{
                color: 'var(--gray-500)',
                fontWeight: 700,
                fontSize: 12
              }}>
                          {t('ui.该客户已冻结，无法提交订单，请联系财务','该客户已冻结，无法提交订单，请联系财务')}
                        </div>}
                    </>}
                </div>;
        })()}

            {/* 备注 */}
            <div>
              <label style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            display: 'block',
            marginBottom: 4
          }}>{t('ui.备注','备注')}</label>
              <textarea value={newForm.remark} onChange={e => setNewForm(p => ({
            ...p,
            remark: e.target.value
          }))} rows={2} style={{
            width: '100%',
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-page)',
            color: 'var(--text-primary)',
            fontSize: 13,
            resize: 'vertical',
            boxSizing: 'border-box'
          }} />
            </div>

            {/* 明细行 */}
            <div>
              <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}>
                <div style={{
              fontSize: 13,
              fontWeight: 700
            }}>{t('ui.订单明细','订单明细')}</div>
                <button className={s.btnSecondary} style={{
              padding: '3px 10px',
              fontSize: 12
            }} onClick={() => setNewItems(p => [...p, {
              productCode: '',
              gradeCode: '',
              qty: '',
              actualUnitPrice: ''
            }])}>
                  {t('ui.+ 添加行','+ 添加行')}
                </button>
              </div>
              {newItems.map((item, idx) => {
            const belowFloor = item._resolved?.floorPrice != null && Number(item.actualUnitPrice) > 0 && Number(item.actualUnitPrice) < item._resolved.floorPrice;
            return <div key={idx} style={{
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${belowFloor ? 'var(--status-danger)' : 'var(--border)'}`,
              marginBottom: 8,
              background: belowFloor ? 'var(--status-danger-bg-page)' : undefined
            }}>
                    {/* G4-C：商品 SKU 主数据，禁止手工录入；自动带出 productCode/gradeCode/spec/name */}
                    <div className={u.mb8}>
                      <label style={{
                  fontSize: 11,
                  color: 'var(--color-purple-500)',
                  display: 'block',
                  marginBottom: 2
                }}>{t('ui.商品（SKU 主数据）*','商品（SKU 主数据）*')}</label>
                      <SkuSelector value={item.skuCode ?? ''} onChange={code => setNewItems(p => p.map((it, i) => i === idx ? {
                  ...it,
                  skuCode: code,
                  _resolved: undefined
                } : it))} onPick={o => {
                  const raw = o?.raw;
                  setNewItems(p => p.map((it, i) => i === idx ? {
                    ...it,
                    skuCode: raw?.sku_code ?? '',
                    productCode: raw?.product_code ?? '',
                    gradeCode: raw?.grade_code ?? '',
                    _resolved: undefined
                  } : it));
                  if (raw) setTimeout(() => resolveItemPrice(idx), 0);
                }} style={{
                  fontSize: 12,
                  padding: '6px 8px',
                  border: '1px solid var(--status-special-border)'
                }} />
                      {item.skuCode && <span style={{
                  fontSize: 10,
                  color: 'var(--color-purple-500)'
                }}>{t('ui.✓ 已自动填充产品代码 / 等级 / 规格','✓ 已自动填充产品代码 / 等级 / 规格')}</span>}
                    </div>
                    <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1.5fr auto',
                gap: 8,
                alignItems: 'end'
              }}>
                      <div>
                        <label style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 2
                  }}>{t('ui.商品代码','商品代码')}</label>
                        <input value={item.productCode} readOnly placeholder={t('ui.由 SKU 自动带出','由 SKU 自动带出')} style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-muted)',
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    cursor: 'not-allowed'
                  }} />
                      </div>
                      <div>
                        <label style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 2
                  }}>{t('ui.等级','等级')}</label>
                        <input value={item.gradeCode} readOnly placeholder={t('ui.自动带出','自动带出')} style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-muted)',
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    cursor: 'not-allowed'
                  }} />
                      </div>
                      <div>
                        <label style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 2
                  }}>{t('ui.数量','数量')}</label>
                        <input type="number" value={item.qty} onChange={e => setNewItems(p => p.map((it, i) => i === idx ? {
                    ...it,
                    qty: e.target.value
                  } : it))} placeholder="0" style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    fontSize: 12
                  }} />
                      </div>
                      <div>
                        <label style={{
                    fontSize: 11,
                    color: `${belowFloor ? 'var(--status-danger)' : 'var(--text-secondary)'}`,
                    display: 'block',
                    marginBottom: 2
                  }}>
                          {t('ui.实际单价','实际单价')} {item._resolved?.floorPrice != null ? `(${t('ui.底价:','底价:')} ${item._resolved.floorPrice})` : ''}
                        </label>
                        <input type="number" value={item.actualUnitPrice} onChange={e => setNewItems(p => p.map((it, i) => i === idx ? {
                    ...it,
                    actualUnitPrice: e.target.value
                  } : it))} placeholder={item._resolved ? String(item._resolved.unitPrice) : '0'} style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: `1px solid ${belowFloor ? 'var(--status-danger)' : 'var(--border)'}`,
                    background: 'var(--bg-page)',
                    color: belowFloor ? 'var(--status-danger)' : 'var(--text-primary)',
                    fontSize: 12,
                    fontWeight: belowFloor ? 700 : 400
                  }} />
                        {belowFloor && <div style={{
                    fontSize: 11,
                    color: 'var(--status-danger)',
                    marginTop: 2
                  }}>{t('ui.⚠ 低于底价，需审批','⚠ 低于底价，需审批')}</div>}
                      </div>
                      <button onClick={() => setNewItems(p => p.filter((_, i) => i !== idx))} style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--status-danger)',
                  paddingBottom: 2
                }}>
                        <X size={14} />
                      </button>
                    </div>
                    {item._resolved && <div style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                marginTop: 4
              }}>
                        {t('ui.参考价:','参考价:')} {item._resolved.unitPrice}
                        {item._resolved.floorPrice != null ? ` · ${t('ui.底价:','底价:')} ${item._resolved.floorPrice}` : ''}
                      </div>}
                  </div>;
          })}
            </div>

        </div>
      </ModalV2>

      {/* ── 订单详情弹窗 ── */}
      <ModalV2 open={!!detailOrder} title={detailOrder ? `${detailOrder.order_no} · ${detailOrder.company_code}` : ''} onClose={() => setDetailOrder(null)} width={600}>
        {detailOrder && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {actionError && <div style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: 'var(--status-danger-bg-faint)',
          color: 'var(--status-danger)',
          fontSize: 13
        }}>{actionError}</div>}

            {/* 状态 + 预警 */}
            <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap'
        }}>
              {(() => {
            const sc = statusConf(detailOrder.status);
            return <span style={{
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              background: sc.bg,
              color: sc.color
            }}>{sc.label}</span>;
          })()}
              {detailOrder.below_floor_price && <span style={{
            padding: '3px 10px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            background: 'var(--status-danger-bg-light)',
            color: 'var(--status-danger)'
          }}>{t('ui.⚠ 低于底价','⚠ 低于底价')}</span>}
              {detailOrder.over_credit && <span style={{
            padding: '3px 10px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            background: 'var(--status-danger-bg-light)',
            color: 'var(--status-danger)'
          }}>{t('ui.🚫 超信用额度','🚫 超信用额度')}</span>}
              {detailOrder.credit_warning && !detailOrder.over_credit && <span style={{
            padding: '3px 10px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            background: 'var(--status-warning-bg-light)',
            color: 'var(--status-warning)'
          }}>{t('ui.⚠ 信用预警','⚠ 信用预警')}</span>}
            </div>

            {/* 基本信息 */}
            <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          fontSize: 13
        }}>
              {[[t('ui.客户','客户'), detailOrder.customer_name ?? detailOrder.customer_code ?? '—'], [t('ui.渠道','渠道'), detailOrder.channel_code ?? '—'], [t('ui.总金额','总金额'), `${Number(detailOrder.total_amount).toLocaleString()} ${detailOrder.currency_code}`], [t('ui.应收状态','应收状态'), detailOrder.ar_invoice_id ? t('ui.✓ 已生成应收账款','✓ 已生成应收账款') : t('ui.未生成','未生成')]].map(([k, v]) => <div key={k as string}>
                  <div style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              marginBottom: 2
            }}>{k}</div>
                  <div className={u.fw600}>{v}</div>
                </div>)}
            </div>

            {/* 信用快照（提交时刻记录） */}
            {detailOrder.credit_snapshot && <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'var(--status-warning-bg-faint)',
          border: '1px solid var(--status-warning-border)',
          fontSize: 12
        }}>
                <div style={{
            fontWeight: 700,
            color: 'var(--status-warning)',
            marginBottom: 6,
            fontSize: 12
          }}>{t('ui.提交时信用快照','提交时信用快照')}</div>
                <div style={{
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap'
          }}>
                  <span>{t('ui.状态：','状态：')}<strong>{detailOrder.credit_snapshot.creditStatus ?? '—'}</strong></span>
                  <span>{t('ui.实时欠款：','实时欠款：')}<strong>{Number(detailOrder.credit_snapshot.totalReceivable ?? 0).toLocaleString()}</strong></span>
                  <span>{t('ui.逾期：','逾期：')}<strong style={{
                color: Number(detailOrder.credit_snapshot.overdueReceivable) > 0 ? 'var(--status-danger)' : undefined
              }}>
                    {Number(detailOrder.credit_snapshot.overdueReceivable ?? 0).toLocaleString()}
                  </strong></span>
                  <span>{t('ui.可用额度：','可用额度：')}<strong>{Number(detailOrder.credit_snapshot.creditAvailable ?? 0).toLocaleString()}</strong></span>
                </div>
                {detailOrder.credit_snapshot.reason && <div style={{
            marginTop: 4,
            color: 'var(--text-secondary)'
          }}>{detailOrder.credit_snapshot.reason}</div>}
              </div>}

            {/* AR 信息 */}
            {detailOrder.arInvoice && <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'var(--status-success-bg-faint)',
          border: '1px solid var(--status-success-bg-strong)',
          fontSize: 12
        }}>
                <div style={{
            fontWeight: 700,
            color: 'var(--status-success)',
            marginBottom: 6
          }}>{t('ui.应收账款记录','应收账款记录')}</div>
                <div style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap'
          }}>
                  <span>{t('ui.应收单号：','应收单号：')}{detailOrder.arInvoice.ar_no}</span>
                  <span>{t('ui.金额：','金额：')}{Number(detailOrder.arInvoice.amount_original).toLocaleString()}</span>
                  <span>{t('ui.到期：','到期：')}{detailOrder.arInvoice.due_date?.slice(0, 10)}</span>
                  <span>{t('ui.状态：','状态：')}{detailOrder.arInvoice.status}</span>
                </div>
              </div>}

            {/* 明细表 */}
            {detailOrder.items && detailOrder.items.length > 0 && <div>
                <div style={{
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 8
          }}>{t('ui.订单明细','订单明细')}</div>
                <table className={s.table} style={{ tableLayout: "fixed", width: "100%" }}>
                  <thead>
                    <tr>
                      {[t('ui.商品','商品'), t('ui.规格','规格'), t('ui.数量','数量'), t('ui.参考价','参考价'), t('ui.实际价','实际价'), t('ui.底价','底价'), t('ui.金额','金额')].map(h => <th key={h} style={{
                  textAlign: h === t('ui.商品','商品') || h === t('ui.规格','规格') ? 'left' : 'right'
                }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {detailOrder.items.map((item: OrderItem) => <tr key={item.id} style={{
                background: item.below_floor_price ? 'var(--status-danger-bg-page)' : undefined
              }}>
                        <td>
                          {item.product_name || item.product_code}
                          <SkuBadge code={item.sku_code} />
                        </td>
                        <td>{item.grade_code || '—'}</td>
                        <td className={u.tar}>{Number(item.qty).toLocaleString()}</td>
                        <td style={{
                  textAlign: 'right',
                  color: 'var(--text-secondary)'
                }}>{Number(item.resolved_unit_price).toLocaleString()}</td>
                        <td style={{
                  textAlign: 'right',
                  color: item.below_floor_price ? 'var(--status-danger)' : undefined,
                  fontWeight: item.below_floor_price ? 700 : 400
                }}>
                          {Number(item.actual_unit_price).toLocaleString()}
                          {item.below_floor_price && ' ⚠'}
                        </td>
                        <td style={{
                  textAlign: 'right',
                  color: 'var(--text-secondary)'
                }}>{item.floor_price != null ? Number(item.floor_price).toLocaleString() : '—'}</td>
                        <td style={{
                  textAlign: 'right',
                  fontWeight: 600
                }}>{Number(item.amount).toLocaleString()}</td>
                      </tr>)}
                  </tbody>
                </table>
              </div>}

            {/* 操作按钮 */}
            <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          paddingTop: 8,
          borderTop: '1px solid var(--border)'
        }}>
              {detailOrder.status === 'DRAFT' && canCreate && <button className={s.btnPrimary} disabled={actionLoading} onClick={() => doAction(detailOrder.id, 'submit')}>{t('ui.提交审批','提交审批')}</button>}
              {TRANSITION_TARGETS[detailOrder.status] && canTransit && <button className={s.btnSecondary} disabled={actionLoading} onClick={() => doAction(detailOrder.id, 'transition', {
            targetStatus: TRANSITION_TARGETS[detailOrder.status]
          })}>
                  {TRANSITION_LABELS[detailOrder.status]}
                </button>}
              {detailOrder.status === 'DELIVERED' && canTransit && <button className={s.btnPrimary} disabled={actionLoading} onClick={() => doAction(detailOrder.id, 'receive')}>
                  {t('ui.确认签收','确认签收')}
                </button>}
              {['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(detailOrder.status) && canCreate && <button className={s.btnDanger} disabled={actionLoading} onClick={() => doAction(detailOrder.id, 'cancel')}>{t('ui.取消订单','取消订单')}</button>}
            </div>
        </div>}
      </ModalV2>
    </div>;
}
