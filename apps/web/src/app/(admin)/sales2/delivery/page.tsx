'use client';

import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import { PageHeaderV2 } from '@/components/design-system';
import { Plus, RefreshCw, Search, Truck, Users, Car, CheckCircle, Clock, AlertTriangle, Package, ChevronRight, X, MapPin, PlayCircle, StopCircle, Navigation, Flag, Ban } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import { ConfirmDialogV2, EmptyState, LoadingSkeleton } from '@/components/design-system'; // F4-B
import { ModalV2 } from '@/components/design-system/dialogs/ModalV2';
import { KpiCard } from '@/components/ui/KpiCard';
import { hexToAccent, KPI_GRID } from '@/lib/design-tokens';
import { DictSelect } from '@/components/shared-selectors/DictSelect'; // G2 字典
import { CompanySelector, DriverSelector, VehicleSelector } from '@/components/shared-selectors/MasterDataSelectors'; // G4-C 主数据选择器
import { useLanguage } from "@/contexts/LanguageContext";
import {
  resolveDeliveryStatus,
  unwrapDeliveryActionOrder,
} from '@/lib/delivery-status-transition';

// ── helpers ─────────────────────────────────────────────────────────────────

function tok() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
const BASE = process.env.NEXT_PUBLIC_API_BASE || '';
async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    cache: 'no-store',
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

// ── 状态配置 ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, {
  label: string;
  color: string;
  bg: string;
  icon: any;
}> = {
  PLANNED: {
    label: '待装车',
    color: 'var(--text-disabled)',
    bg: 'var(--status-neutral-bg)',
    icon: Clock
  },
  LOADING: {
    label: '装车中',
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-bg-light)',
    icon: Package
  },
  LOADED: {
    label: '已装车',
    color: 'var(--color-accent)',
    bg: 'var(--status-info-bg)',
    icon: Package
  },
  DEPARTED: {
    label: '已发车',
    color: 'var(--status-special)',
    bg: 'var(--status-info-bg)',
    icon: Navigation
  },
  ARRIVED: {
    label: '已到达',
    color: 'var(--color-accent)',
    bg: 'var(--status-info-bg)',
    icon: MapPin
  },
  PARTIALLY_SIGNED: {
    label: '部分签收',
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-bg-light)',
    icon: AlertTriangle
  },
  COMPLETED: {
    label: '已完成',
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg)',
    icon: CheckCircle
  },
  CANCELLED: {
    label: '已取消',
    color: 'var(--text-secondary)',
    bg: 'var(--status-neutral-bg-light)',
    icon: Ban
  }
};

// 状态机操作
const ACTIONS: Record<string, {
  label: string;
  endpoint: string;
  color: string;
  icon: any;
}> = {
  PLANNED: {
    label: '开始装车',
    endpoint: 'start-loading',
    color: 'var(--status-warning)',
    icon: PlayCircle
  },
  LOADING: {
    label: '装车完成',
    endpoint: 'finish-loading',
    color: 'var(--color-accent)',
    icon: StopCircle
  },
  LOADED: {
    label: '确认发车',
    endpoint: 'depart',
    color: 'var(--status-special)',
    icon: Navigation
  },
  DEPARTED: {
    label: '确认到达',
    endpoint: 'arrive',
    color: 'var(--color-accent)',
    icon: MapPin
  },
  ARRIVED: {
    label: '强制完成',
    endpoint: 'complete',
    color: 'var(--status-success)',
    icon: Flag
  },
  PARTIALLY_SIGNED: {
    label: '强制完成',
    endpoint: 'complete',
    color: 'var(--status-success)',
    icon: Flag
  }
};
const RECEIPT_STATUS_MAP: Record<string, {
  label: string;
  color: string;
}> = {
  SIGNED: {
    label: '正常签收',
    color: 'var(--status-success)'
  },
  PARTIAL: {
    label: '部分签收',
    color: 'var(--status-warning)'
  },
  EXCEPTION: {
    label: '异常签收',
    color: 'var(--status-danger)'
  }
};

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface DeliveryStats {
  planned: number;
  loading: number;
  loaded: number;
  departed: number;
  arrived: number;
  completedToday: number;
  totalToday: number;
}
interface DeliveryOrder {
  id: string;
  delivery_no: string;
  status: string;
  company_code: string;
  driver_name: string | null;
  vehicle_no: string | null;
  route_name: string | null;
  wave_date: string | null;
  expected_arrival_at: string | null;
  actual_arrival_at: string | null;
  total_orders: number;
  total_qty: number;
  created_at: string;
  loading_start_at: string | null;
  departure_at: string | null;
  completed_at: string | null;
  remark: string | null;
}
interface DeliveryItem {
  id: string;
  sales_order_no: string;
  customer_name: string | null;
  planned_qty: number;
  loaded_qty: number | null;
  received_qty: number | null;
  status: string;
  receipt_id: string | null;
}
interface Receipt {
  id: string;
  receipt_no: string;
  status: string;
  signed_by: string | null;
  signed_at: string;
  received_qty: number;
  exception_qty: number | null;
  exception_type: string | null;
  remark: string | null;
}
interface Driver {
  id: string;
  driver_code: string;
  driver_name: string;
  phone: string | null;
  license_no: string | null;
  company_code: string;
  status: string;
}
interface Vehicle {
  id: string;
  vehicle_no: string;
  plate_no: string | null;
  vehicle_type: string | null;
  capacity: number | null;
  company_code: string;
  status: string;
}

// ── 子组件 ────────────────────────────────────────────────────────────────────

function StatusBadge({
  status
}: {
  status: string;
}) {
  const cfg = STATUS_MAP[status] ?? {
    label: status,
    color: 'var(--text-disabled)',
    bg: 'var(--status-neutral-bg)',
    icon: Clock
  };
  const Icon = cfg.icon;
  return <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    color: cfg.color,
    background: cfg.bg
  }}>
      <Icon size={10} />
      {cfg.label}
    </span>;
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

type Tab = 'orders' | 'drivers' | 'vehicles';
export default function DeliveryPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('orders');

  // ── 配送单列表 ──
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [stats, setStats] = useState<DeliveryStats | null>(null);

  // ── 配送单详情 ──
  const [selected, setSelected] = useState<DeliveryOrder | null>(null);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionErr, setActionErr] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState(false);

  // ── 签收弹窗 ──
  const [signingItem, setSigningItem] = useState<DeliveryItem | null>(null);
  const [signingMode, setSigningMode] = useState<'normal' | 'exception'>('normal');
  const [signedBy, setSignedBy] = useState('');
  const [receivedQty, setReceivedQty] = useState('');
  const [exceptionQty, setExceptionQty] = useState('');
  const [exceptionType, setExceptionType] = useState('SHORTAGE');
  const [signRemark, setSignRemark] = useState('');
  const [signLoading, setSignLoading] = useState(false);
  const [signErr, setSignErr] = useState('');

  // ── 新建配送单 ──
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    companyCode: '',
    salesOrderIds: '',
    driverName: '',
    vehicleNo: '',
    routeName: '',
    waveDate: '',
    expectedArrivalAt: '',
    remark: ''
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createErr, setCreateErr] = useState('');

  // ── 司机 ──
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverLoading, setDriverLoading] = useState(false);
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [driverForm, setDriverForm] = useState({
    driverName: '',
    phone: '',
    licenseNo: '',
    companyCode: ''
  });
  const [driverErr, setDriverErr] = useState('');

  // ── 车辆 ──
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    vehicleNo: '',
    plateNo: '',
    vehicleType: '',
    capacity: '',
    companyCode: ''
  });
  const [vehicleErr, setVehicleErr] = useState('');

  // ── 数据加载 ─────────────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const d = await api('GET', '/api/v2/sales/delivery/stats');
      setStats(d);
    } catch {}
  }, []);
  const loadOrders = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: '20'
      });
      if (keyword) params.set('keyword', keyword);
      if (filterStatus) params.set('status', filterStatus);
      const d = await api('GET', `/api/v2/sales/delivery?${params}`);
      setOrders(d.data ?? d.items ?? d);
      setTotal(d.total ?? 0);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [page, keyword, filterStatus]);
  const loadDetail = useCallback(async (order: DeliveryOrder) => {
    setSelected(order);
    setDetailLoading(true);
    setActionErr('');
    try {
      const [its, recs] = await Promise.all([api('GET', `/api/v2/sales/delivery/${order.id}/receipts`).then(() => api('GET', `/api/v2/sales/delivery?page=1&limit=1`).then(() => [] as DeliveryItem[])).catch(() => [] as DeliveryItem[]), api('GET', `/api/v2/sales/delivery/${order.id}/receipts`).catch(() => [] as Receipt[])]);
      // Items come from detail call
      const detail = await api('GET', `/api/v2/sales/delivery/${order.id}`);
      setItems(detail.items ?? []);
      setReceipts(recs);
    } catch {
      setItems([]);
      setReceipts([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);
  const refreshDetail = useCallback(async () => {
    if (!selected) return;
    setDetailLoading(true);
    try {
      const [detail, recs] = await Promise.all([api('GET', `/api/v2/sales/delivery/${selected.id}`), api('GET', `/api/v2/sales/delivery/${selected.id}/receipts`)]);
      setSelected({
        ...selected,
        ...detail
      });
      setItems(detail.items ?? []);
      setReceipts(recs);
    } catch {} finally {
      setDetailLoading(false);
    }
  }, [selected]);
  const loadDrivers = useCallback(async () => {
    setDriverLoading(true);
    try {
      const d = await api('GET', '/api/v2/sales/delivery/drivers');
      setDrivers(Array.isArray(d) ? d : d.data ?? []);
    } catch {
      setDrivers([]);
    } finally {
      setDriverLoading(false);
    }
  }, []);
  const loadVehicles = useCallback(async () => {
    setVehicleLoading(true);
    try {
      const d = await api('GET', '/api/v2/sales/delivery/vehicles');
      setVehicles(Array.isArray(d) ? d : d.data ?? []);
    } catch {
      setVehicles([]);
    } finally {
      setVehicleLoading(false);
    }
  }, []);
  useEffect(() => {
    loadStats();
    loadOrders(1);
  }, []);
  useEffect(() => {
    if (tab === 'drivers') loadDrivers();
    if (tab === 'vehicles') loadVehicles();
  }, [tab]);

  // ── 状态机操作 ───────────────────────────────────────────────────────────────

  const applySuccessfulAction = (endpoint: string, response: unknown) => {
    if (!selected) return;
    const status = resolveDeliveryStatus(endpoint, response);
    const responseOrder = unwrapDeliveryActionOrder<DeliveryOrder>(response);
    const updated = {
      ...selected,
      ...responseOrder,
      ...(status ? { status } : {}),
    };

    // The action response is the first authoritative acknowledgement. Reflect it
    // immediately so the status badge and available action buttons cannot remain
    // stale while the follow-up detail/list requests are in flight.
    setSelected(updated);
    setOrders(current => current.map(order =>
      order.id === updated.id ? { ...order, ...updated } : order
    ));
  };

  const doAction = async (endpoint: string) => {
    if (!selected) return;
    setActionLoading(true);
    setActionErr('');
    try {
      const updated = await api('POST', `/api/v2/sales/delivery/${selected.id}/${endpoint}`, {});
      applySuccessfulAction(endpoint, updated);
      await Promise.all([refreshDetail(), loadOrders(), loadStats()]);
      // A stale list/detail read must not roll the UI back to the pre-action
      // status. Re-apply the mutation acknowledgement after reconciliation.
      applySuccessfulAction(endpoint, updated);
    } catch (e: any) {
      setActionErr(e.message);
    } finally {
      setActionLoading(false);
    }
  };
  const cancelOrder = () => {
    if (selected) setCancelConfirm(true);
  };
  const doCancelOrder = async () => {
    setCancelConfirm(false);
    if (!selected) return;
    setActionLoading(true);
    setActionErr('');
    try {
      const updated = await api('POST', `/api/v2/sales/delivery/${selected.id}/cancel`, {});
      applySuccessfulAction('cancel', updated);
      await Promise.all([refreshDetail(), loadOrders(), loadStats()]);
      applySuccessfulAction('cancel', updated);
    } catch (e: any) {
      setActionErr(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── 签收操作 ─────────────────────────────────────────────────────────────────

  const submitReceipt = async () => {
    if (!selected || !signingItem) return;
    setSignLoading(true);
    setSignErr('');
    try {
      if (signingMode === 'normal') {
        await api('POST', `/api/v2/sales/delivery/${selected.id}/receipts`, {
          deliveryItemId: signingItem.id,
          signedBy: signedBy || undefined,
          receivedQty: Number(receivedQty),
          remark: signRemark || undefined
        });
      } else {
        await api('POST', `/api/v2/sales/delivery/${selected.id}/receipts/exception`, {
          deliveryItemId: signingItem.id,
          signedBy: signedBy || undefined,
          receivedQty: Number(receivedQty),
          exceptionQty: Number(exceptionQty),
          exceptionType,
          remark: signRemark || undefined
        });
      }
      setSigningItem(null);
      setSignedBy('');
      setReceivedQty('');
      setExceptionQty('');
      setSignRemark('');
      await Promise.all([refreshDetail(), loadOrders(), loadStats()]);
    } catch (e: any) {
      setSignErr(e.message);
    } finally {
      setSignLoading(false);
    }
  };

  // ── 新建配送单 ───────────────────────────────────────────────────────────────

  const submitCreate = async () => {
    setCreateLoading(true);
    setCreateErr('');
    try {
      const ids = createForm.salesOrderIds.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      await api('POST', '/api/v2/sales/delivery', {
        companyCode: createForm.companyCode,
        salesOrderIds: ids,
        driverName: createForm.driverName || undefined,
        vehicleNo: createForm.vehicleNo || undefined,
        routeName: createForm.routeName || undefined,
        waveDate: createForm.waveDate || undefined,
        expectedArrivalAt: createForm.expectedArrivalAt || undefined,
        remark: createForm.remark || undefined
      });
      setShowCreate(false);
      setCreateForm({
        companyCode: '',
        salesOrderIds: '',
        driverName: '',
        vehicleNo: '',
        routeName: '',
        waveDate: '',
        expectedArrivalAt: '',
        remark: ''
      });
      await Promise.all([loadOrders(1), loadStats()]);
    } catch (e: any) {
      setCreateErr(e.message);
    } finally {
      setCreateLoading(false);
    }
  };

  // ── 司机新建 ─────────────────────────────────────────────────────────────────

  const submitDriver = async () => {
    setDriverErr('');
    try {
      await api('POST', '/api/v2/sales/delivery/drivers', driverForm);
      setShowDriverForm(false);
      setDriverForm({
        driverName: '',
        phone: '',
        licenseNo: '',
        companyCode: ''
      });
      loadDrivers();
    } catch (e: any) {
      setDriverErr(e.message);
    }
  };

  // ── 车辆新建 ─────────────────────────────────────────────────────────────────

  const submitVehicle = async () => {
    setVehicleErr('');
    try {
      await api('POST', '/api/v2/sales/delivery/vehicles', {
        ...vehicleForm,
        capacity: vehicleForm.capacity ? Number(vehicleForm.capacity) : undefined
      });
      setShowVehicleForm(false);
      setVehicleForm({
        vehicleNo: '',
        plateNo: '',
        vehicleType: '',
        capacity: '',
        companyCode: ''
      });
      loadVehicles();
    } catch (e: any) {
      setVehicleErr(e.message);
    }
  };

  // ── 渲染 ─────────────────────────────────────────────────────────────────────

  return <div style={{
    padding: '24px 32px',
    maxWidth: 1400
  }}>
      <PageHeaderV2 title={t('ui.配送管理','配送管理')} subtitle={t('ui.配送单管理 · 装车→发车→到达→签收','配送单管理 · 装车→发车→到达→签收')} />

      {/* ── Dashboard Stats ── */}
      {stats && <div style={{
      ...KPI_GRID,
      marginBottom: 24
    }}>
          {[{
        label: t('ui.待装车','待装车'),
        value: stats.planned,
        color: 'var(--text-disabled)'
      }, {
        label: t('ui.装车中','装车中'),
        value: stats.loading,
        color: 'var(--status-warning)'
      }, {
        label: t('ui.已装车','已装车'),
        value: stats.loaded,
        color: 'var(--color-accent)'
      }, {
        label: t('ui.在途中','在途中'),
        value: stats.departed,
        color: 'var(--status-special)'
      }, {
        label: t('ui.已到达','已到达'),
        value: stats.arrived,
        color: 'var(--color-accent)'
      }, {
        label: t('ui.今日完成','今日完成'),
        value: stats.completedToday,
        color: 'var(--status-success)'
      }, {
        label: t('ui.今日总单','今日总单'),
        value: stats.totalToday,
        color: 'var(--text-secondary)'
      }].map(({
        label,
        value,
        color
      }) => <KpiCard key={label} label={label} value={value ?? 0} accentColor={hexToAccent(color)} />)}
        </div>}

      {/* ── Tabs ── */}
      <div style={{
      display: 'flex',
      gap: 0,
      marginBottom: 20,
      borderBottom: '1px solid var(--border)'
    }}>
        {([{
        key: 'orders',
        label: t('ui.配送单','配送单'),
        icon: Truck
      }, {
        key: 'drivers',
        label: t('ui.司机档案','司机档案'),
        icon: Users
      }, {
        key: 'vehicles',
        label: t('ui.车辆档案','车辆档案'),
        icon: Car
      }] as const).map(({
        key,
        label,
        icon: Icon
      }) => <button key={key} onClick={() => setTab(key)} style={{
        padding: '8px 20px',
        fontSize: 13,
        fontWeight: 600,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: tab === key ? 'var(--color-accent)' : 'var(--text-secondary)',
        borderBottom: tab === key ? '2px solid var(--color-accent)' : '2px solid transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}>
            <Icon size={14} />{label}
          </button>)}
      </div>

      {/* ══════════════════ 配送单列表 Tab ══════════════════ */}
      {tab === 'orders' && <div style={{
      display: 'flex',
      gap: 20
    }}>

          {/* 左侧列表 */}
          <div style={{
        flex: '0 0 520px',
        minWidth: 0
      }}>
            {/* 工具栏 */}
            <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 12,
          alignItems: 'center'
        }}>
              <div style={{
            position: 'relative',
            flex: 1
          }}>
                <Search size={13} style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              opacity: 0.4
            }} />
                <input value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setPage(1), loadOrders(1))} placeholder={t('ui.配送单号 / 司机 / 车牌','配送单号 / 司机 / 车牌')} style={{
              width: '100%',
              paddingLeft: 32,
              paddingRight: 12,
              height: 34,
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13
            }} />
              </div>
              <select value={filterStatus} onChange={e => {
            setFilterStatus(e.target.value);
            setPage(1);
            loadOrders(1);
          }} style={{
            height: 34,
            borderRadius: 6,
            background: 'var(--bg-muted)',
            border: '1px solid var(--border)',
            color: 'inherit',
            fontSize: 13,
            padding: '0 8px'
          }}>
                <option value="">{t('ui.全部状态','全部状态')}</option>
                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button onClick={() => {
            setPage(1);
            loadOrders(1);
            loadStats();
          }} style={{
            height: 34,
            width: 34,
            borderRadius: 6,
            background: 'var(--bg-muted)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
                <RefreshCw size={13} style={{
              color: 'var(--text-disabled)'
            }} />
              </button>
              <button onClick={() => setShowCreate(true)} style={{
            height: 34,
            padding: '0 14px',
            borderRadius: 6,
            background: 'var(--color-accent)',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-on-dark)',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}>
                <Plus size={13} />{t('ui.新建','新建')}
              </button>
            </div>

            {/* 列表 */}
            <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
              {loading && <div className={u.p24}><LoadingSkeleton variant="line" rows={5} /></div>}
              {!loading && orders.length === 0 && <EmptyState title={t('ui.暂无配送单','暂无配送单')} compact />}
              {orders.map(o => <div key={o.id} onClick={() => loadDetail(o)} style={{
            padding: '12px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            background: selected?.id === o.id ? 'var(--status-info-bg)' : 'var(--bg-muted)',
            border: '1px solid ' + (selected?.id === o.id ? 'var(--status-info)' : 'var(--border)'),
            transition: 'all 0.12s'
          }}>
                  <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6
            }}>
                    <div style={{
                fontWeight: 700,
                fontSize: 13,
                fontFamily: 'monospace'
              }}>{o.delivery_no}</div>
                    <StatusBadge status={o.status} />
                  </div>
                  <div style={{
              display: 'flex',
              gap: 12,
              fontSize: 11,
              color: 'var(--text-disabled)',
              flexWrap: 'wrap'
            }}>
                    {o.driver_name && <span><Users size={10} style={{
                  display: 'inline',
                  marginRight: 3
                }} />{o.driver_name}</span>}
                    {o.vehicle_no && <span><Car size={10} style={{
                  display: 'inline',
                  marginRight: 3
                }} />{o.vehicle_no}</span>}
                    {o.route_name && <span><MapPin size={10} style={{
                  display: 'inline',
                  marginRight: 3
                }} />{o.route_name}</span>}
                    <span><Package size={10} style={{
                  display: 'inline',
                  marginRight: 3
                }} />{o.total_orders}{t('ui.单','单')} / {o.total_qty}{t('ui.件','件')}</span>
                  </div>
                  {o.wave_date && <div style={{
              marginTop: 4,
              fontSize: 11,
              color: 'var(--text-secondary)'
            }}>{t('ui.波次：','波次：')}{o.wave_date}</div>}
                </div>)}
            </div>

            {/* 翻页 */}
            {total > 20 && <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginTop: 16
        }}>
                <button disabled={page === 1} onClick={() => {
            setPage(page - 1);
            loadOrders(page - 1);
          }} style={{
            padding: '4px 12px',
            borderRadius: 4,
            background: 'var(--bg-muted)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            color: 'inherit',
            fontSize: 13
          }}>
                  {t('ui.上一页','上一页')}
                </button>
                <span style={{
            fontSize: 12,
            padding: '4px 8px',
            opacity: 0.5
          }}>
                  {t('ui.第','第')} {page} {t('ui.页 / 共','页 / 共')} {Math.ceil(total / 20)} {t('ui.页','页')}
                </span>
                <button disabled={page * 20 >= total} onClick={() => {
            setPage(page + 1);
            loadOrders(page + 1);
          }} style={{
            padding: '4px 12px',
            borderRadius: 4,
            background: 'var(--bg-muted)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            color: 'inherit',
            fontSize: 13
          }}>
                  {t('ui.下一页','下一页')}
                </button>
              </div>}
          </div>

          {/* 右侧详情 */}
          {selected && <div style={{
        flex: 1,
        minWidth: 0,
        background: 'var(--bg-muted)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px'
      }}>

              {/* 详情头部 */}
              <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16
        }}>
                <div>
                  <div style={{
              fontWeight: 800,
              fontSize: 16,
              fontFamily: 'monospace',
              marginBottom: 4
            }}>
                    {selected.delivery_no}
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <button onClick={() => setSelected(null)} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: 0.5
          }}>
                  <X size={16} />
                </button>
              </div>

              {/* 基本信息 */}
              <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 16
        }}>
                {[[t('ui.公司','公司'), selected.company_code], [t('ui.司机','司机'), selected.driver_name ?? '—'], [t('ui.车辆','车辆'), selected.vehicle_no ?? '—'], [t('ui.路线','路线'), selected.route_name ?? '—'], [t('ui.波次日期','波次日期'), selected.wave_date ?? '—'], [t('ui.预计到达','预计到达'), selected.expected_arrival_at ? new Date(selected.expected_arrival_at).toLocaleString('zh-CN') : '—'], [t('ui.实际到达','实际到达'), selected.actual_arrival_at ? new Date(selected.actual_arrival_at).toLocaleString('zh-CN') : '—'], [t('ui.完成时间','完成时间'), selected.completed_at ? new Date(selected.completed_at).toLocaleString('zh-CN') : '—']].map(([k, v]) => <div key={k} className={u.fs12}>
                    <span style={{
              color: 'var(--text-secondary)',
              marginRight: 6
            }}>{k}:</span>
                    <span style={{
              color: 'var(--border)'
            }}>{v}</span>
                  </div>)}
              </div>

              {/* 时间轴 */}
              <div style={{
          display: 'flex',
          gap: 0,
          marginBottom: 16,
          fontSize: 11
        }}>
                {[{
            label: t('ui.创建','创建'),
            time: selected.created_at,
            color: 'var(--text-disabled)'
          }, {
            label: t('ui.开始装车','开始装车'),
            time: selected.loading_start_at,
            color: 'var(--status-warning)'
          }, {
            label: t('ui.发车','发车'),
            time: selected.departure_at,
            color: 'var(--status-special)'
          }, {
            label: t('ui.到达','到达'),
            time: selected.actual_arrival_at,
            color: 'var(--color-accent)'
          }, {
            label: t('ui.完成','完成'),
            time: selected.completed_at,
            color: 'var(--status-success)'
          }].map(({
            label,
            time,
            color
          }, i) => <div key={label} style={{
            flex: 1,
            textAlign: 'center',
            position: 'relative'
          }}>
                    <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              margin: '0 auto 4px',
              background: time ? color : 'var(--border)',
              border: `2px solid ${time ? color : 'var(--border)'}`
            }} />
                    {i < 4 && <div style={{
              position: 'absolute',
              top: 3,
              left: '50%',
              width: '100%',
              height: 2,
              background: 'var(--border)'
            }} />}
                    <div style={{
              color: time ? color : 'var(--text-primary)'
            }}>{label}</div>
                    {time && <div style={{
              color: 'var(--text-secondary)',
              marginTop: 2
            }}>
                      {new Date(time).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })}
                    </div>}
                  </div>)}
              </div>

              {/* 状态机操作按钮 */}
              {ACTIONS[selected.status] && <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16
        }}>
                  {(() => {
            const act = ACTIONS[selected.status];
            const Icon = act.icon;
            return <button disabled={actionLoading} onClick={() => doAction(act.endpoint)} style={{
              padding: '8px 18px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: act.color,
              color: 'var(--text-on-dark)',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: actionLoading ? 0.6 : 1
            }}>
                        <Icon size={13} />{act.label}
                      </button>;
          })()}
                  {['PLANNED', 'LOADING'].includes(selected.status) && <button disabled={actionLoading} onClick={cancelOrder} style={{
            padding: '8px 14px',
            borderRadius: 6,
            border: '1px solid var(--status-danger)',
            cursor: 'pointer',
            background: 'var(--status-danger-bg-light)',
            color: 'var(--status-danger)',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}>
                      <Ban size={12} />{t('ui.取消','取消')}
                    </button>}
                </div>}
              {actionErr && <div style={{
          color: 'var(--status-danger)',
          fontSize: 12,
          marginBottom: 10
        }}>{actionErr}</div>}

              {/* 配送明细 */}
              <div className={u.mb16}>
                <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            letterSpacing: 0.8,
            marginBottom: 8,
            textTransform: 'uppercase'
          }}>{t('ui.配送明细','配送明细')}</div>
                {detailLoading && <div style={{
            fontSize: 12,
            opacity: 0.4
          }}>{t('ui.加载中…','加载中…')}</div>}
                {!detailLoading && items.length === 0 && <div style={{
            fontSize: 12,
            opacity: 0.4
          }}>{t('ui.暂无明细','暂无明细')}</div>}
                <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
                  {items.map(item => <div key={item.id} style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'var(--bg-muted)',
              border: '1px solid var(--bg-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
                      <div>
                        <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'monospace'
                }}>{item.sales_order_no}</div>
                        <div style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  marginTop: 2
                }}>
                          {item.customer_name ?? '—'} · {t('ui.计划','计划')} {item.planned_qty} {t('ui.件','件')}
                          {item.received_qty !== null && ` · ${t('ui.签收','签收')} ${item.received_qty} ${t('ui.件','件')}`}
                        </div>
                      </div>
                      <div className={u.flexRow8}>
                        <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: item.status === 'SIGNED' ? 'var(--status-success-bg)' : item.status === 'EXCEPTION' ? 'var(--status-danger-bg-light)' : 'var(--status-neutral-bg)',
                  color: item.status === 'SIGNED' ? 'var(--status-success)' : item.status === 'EXCEPTION' ? 'var(--status-danger)' : 'var(--text-disabled)'
                }}>
                          {item.status === 'SIGNED' ? t('ui.已签收','已签收') : item.status === 'EXCEPTION' ? t('ui.异常','异常') : t('ui.待签收','待签收')}
                        </span>
                        {!['SIGNED', 'EXCEPTION', 'RETURNED'].includes(item.status) && ['ARRIVED', 'PARTIALLY_SIGNED'].includes(selected.status) && <button onClick={() => {
                  setSigningItem(item);
                  setSigningMode('normal');
                  setSignedBy('');
                  setReceivedQty(String(item.planned_qty));
                  setExceptionQty('');
                  setSignRemark('');
                  setSignErr('');
                }} style={{
                  padding: '3px 10px',
                  borderRadius: 4,
                  border: '1px solid var(--status-success-bg-strong-2)',
                  background: 'var(--status-success-bg-faint)',
                  cursor: 'pointer',
                  color: 'var(--status-success)',
                  fontSize: 11,
                  fontWeight: 600
                }}>
                              {t('ui.签收','签收')}
                            </button>}
                      </div>
                    </div>)}
                </div>
              </div>

              {/* 签收记录 */}
              {receipts.length > 0 && <div>
                  <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            letterSpacing: 0.8,
            marginBottom: 8,
            textTransform: 'uppercase'
          }}>{t('ui.签收记录','签收记录')}</div>
                  <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
                    {receipts.map(r => <div key={r.id} style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--bg-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12
            }}>
                        <div>
                          <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 600
                }}>{r.receipt_no}</span>
                          {r.signed_by && <span style={{
                  color: 'var(--text-secondary)',
                  marginLeft: 8
                }}>{t('ui.签收人：','签收人：')}{r.signed_by}</span>}
                          {r.exception_type && <span style={{
                  color: 'var(--status-danger)',
                  marginLeft: 8
                }}>
                              [{r.exception_type}] {t('ui.异常','异常')} {r.exception_qty} {t('ui.件','件')}
                            </span>}
                        </div>
                        <div className={u.flexRow8}>
                          <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: RECEIPT_STATUS_MAP[r.status]?.color === 'var(--status-success)' ? 'var(--status-success-bg)' : 'var(--status-danger-bg-light)',
                  color: RECEIPT_STATUS_MAP[r.status]?.color ?? 'var(--text-disabled)'
                }}>
                            {RECEIPT_STATUS_MAP[r.status]?.label ?? r.status}
                          </span>
                          <span style={{
                  color: 'var(--text-secondary)',
                  fontSize: 11
                }}>
                            {t('ui.收','收')} {r.received_qty} {t('ui.件','件')} · {new Date(r.signed_at).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                      </div>)}
                  </div>
                </div>}
            </div>}
        </div>}

      {/* ══════════════════ 司机 Tab ══════════════════ */}
      {tab === 'drivers' && <div>
          <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: 12
      }}>
            <button onClick={() => setShowDriverForm(true)} style={{
          height: 34,
          padding: '0 14px',
          borderRadius: 6,
          background: 'var(--color-accent)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-on-dark)',
          fontSize: 13,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 5
        }}>
              <Plus size={13} />{t('ui.新建司机','新建司机')}
            </button>
          </div>
          {driverLoading && <div style={{
        textAlign: 'center',
        padding: 40,
        opacity: 0.4
      }}>{t('ui.加载中…','加载中…')}</div>}
          <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 10
      }}>
            {drivers.map(d => <div key={d.id} style={{
          padding: '14px 18px',
          borderRadius: 10,
          background: 'var(--bg-muted)',
          border: '1px solid var(--border)'
        }}>
                <div style={{
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 4
          }}>{d.driver_name}</div>
                <div style={{
            fontSize: 12,
            color: 'var(--text-disabled)'
          }}>
                  <div>{t('ui.工号：','工号：')}<span style={{
                fontFamily: 'monospace'
              }}>{d.driver_code}</span></div>
                  {d.phone && <div>{t('ui.电话：','电话：')}{d.phone}</div>}
                  {d.license_no && <div>{t('ui.驾照：','驾照：')}{d.license_no}</div>}
                  <div>{t('ui.公司：','公司：')}{d.company_code}</div>
                </div>
                <div style={{
            marginTop: 8
          }}>
                  <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 4,
              background: d.status === 'ACTIVE' ? 'var(--status-success-bg)' : 'var(--status-neutral-bg-light)',
              color: d.status === 'ACTIVE' ? 'var(--status-success)' : 'var(--text-secondary)'
            }}>
                    {d.status === 'ACTIVE' ? t('ui.在职','在职') : t('ui.停用','停用')}
                  </span>
                </div>
              </div>)}
            {!driverLoading && drivers.length === 0 && <div style={{
          gridColumn: '1/-1',
          textAlign: 'center',
          padding: 40,
          opacity: 0.4,
          fontSize: 13
        }}>
                {t('ui.暂无司机档案','暂无司机档案')}
              </div>}
          </div>
        </div>}

      {/* ══════════════════ 车辆 Tab ══════════════════ */}
      {tab === 'vehicles' && <div>
          <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: 12
      }}>
            <button onClick={() => setShowVehicleForm(true)} style={{
          height: 34,
          padding: '0 14px',
          borderRadius: 6,
          background: 'var(--color-accent)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-on-dark)',
          fontSize: 13,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 5
        }}>
              <Plus size={13} />{t('ui.新建车辆','新建车辆')}
            </button>
          </div>
          {vehicleLoading && <div style={{
        textAlign: 'center',
        padding: 40,
        opacity: 0.4
      }}>{t('ui.加载中…','加载中…')}</div>}
          <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 10
      }}>
            {vehicles.map(v => <div key={v.id} style={{
          padding: '14px 18px',
          borderRadius: 10,
          background: 'var(--bg-muted)',
          border: '1px solid var(--border)'
        }}>
                <div style={{
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 4
          }}>
                  <Car size={13} style={{
              display: 'inline',
              marginRight: 5,
              opacity: 0.6
            }} />
                  {v.vehicle_no}
                </div>
                <div style={{
            fontSize: 12,
            color: 'var(--text-disabled)'
          }}>
                  {v.plate_no && <div>{t('ui.车牌：','车牌：')}{v.plate_no}</div>}
                  {v.vehicle_type && <div>{t('ui.类型：','类型：')}{v.vehicle_type}</div>}
                  {v.capacity && <div>{t('ui.载重：','载重：')}{v.capacity} kg</div>}
                  <div>{t('ui.公司：','公司：')}{v.company_code}</div>
                </div>
                <div style={{
            marginTop: 8
          }}>
                  <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 4,
              background: v.status === 'ACTIVE' ? 'var(--status-success-bg)' : v.status === 'MAINTENANCE' ? 'var(--status-warning-bg-light)' : 'var(--status-neutral-bg-light)',
              color: v.status === 'ACTIVE' ? 'var(--status-success)' : v.status === 'MAINTENANCE' ? 'var(--status-warning)' : 'var(--text-secondary)'
            }}>
                    {v.status === 'ACTIVE' ? t('ui.可用','可用') : v.status === 'MAINTENANCE' ? t('ui.维修中','维修中') : t('ui.停用','停用')}
                  </span>
                </div>
              </div>)}
            {!vehicleLoading && vehicles.length === 0 && <div style={{
          gridColumn: '1/-1',
          textAlign: 'center',
          padding: 40,
          opacity: 0.4,
          fontSize: 13
        }}>
                {t('ui.暂无车辆档案','暂无车辆档案')}
              </div>}
          </div>
        </div>}

      {/* ══════════════════ 新建配送单 弹窗 ══════════════════ */}
      <ModalV2 open={showCreate} onClose={() => { setShowCreate(false); setCreateErr(''); }} title={t('ui.新建配送单','新建配送单')} width={520}
        footer={<>
          <button onClick={() => { setShowCreate(false); setCreateErr(''); }} style={{
            padding: '8px 18px', borderRadius: 6, background: 'var(--bg-muted)', border: '1px solid var(--border)', cursor: 'pointer', color: 'inherit', fontSize: 13
          }}>{t('ui.取消','取消')}</button>
          <button disabled={createLoading} onClick={submitCreate} style={{
            padding: '8px 18px', borderRadius: 6, background: 'var(--color-accent)', border: 'none', cursor: 'pointer', color: 'var(--text-on-dark)', fontSize: 13, fontWeight: 600, opacity: createLoading ? 0.6 : 1
          }}>{createLoading ? t('ui.提交中…','提交中…') : t('ui.确认新建','确认新建')}</button>
        </>}>
            <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
              {/* G4-C：公司主数据 */}
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{t('ui.公司 *','公司 *')}</div>
                <CompanySelector value={createForm.companyCode} onChange={v => setCreateForm(f => ({
              ...f,
              companyCode: v
            }))} />
              </label>
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{t('ui.销售订单ID（逗号或换行分隔）*','销售订单ID（逗号或换行分隔）*')}</div>
                <textarea value={createForm.salesOrderIds} onChange={e => setCreateForm(f => ({
              ...f,
              salesOrderIds: e.target.value
            }))} rows={3} style={{
              width: '100%',
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13,
              padding: '7px 10px',
              resize: 'vertical',
              boxSizing: 'border-box'
            }} />
              </label>
              {/* G4-C：司机主数据(sal_drivers，仅 ACTIVE) */}
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{t('ui.司机','司机')}</div>
                <DriverSelector value={createForm.driverName} onChange={v => setCreateForm(f => ({
              ...f,
              driverName: v
            }))} companyCode={createForm.companyCode || undefined} />
              </label>
              {/* G4-C：车辆主数据(sal_vehicles，仅 ACTIVE) */}
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{t('ui.车辆','车辆')}</div>
                <VehicleSelector value={createForm.vehicleNo} onChange={v => setCreateForm(f => ({
              ...f,
              vehicleNo: v
            }))} companyCode={createForm.companyCode || undefined} />
              </label>
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{t('ui.路线名称','路线名称')}</div>
                <input value={createForm.routeName} onChange={e => setCreateForm(f => ({
              ...f,
              routeName: e.target.value
            }))} style={{
              width: '100%',
              height: 34,
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13,
              padding: '0 10px',
              boxSizing: 'border-box'
            }} />
              </label>
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{t('ui.波次日期','波次日期')}</div>
                <input type="date" value={createForm.waveDate} onChange={e => setCreateForm(f => ({
              ...f,
              waveDate: e.target.value
            }))} style={{
              width: '100%',
              height: 34,
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13,
              padding: '0 10px',
              boxSizing: 'border-box'
            }} />
              </label>
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{t('ui.预计到达时间','预计到达时间')}</div>
                <input type="datetime-local" value={createForm.expectedArrivalAt} onChange={e => setCreateForm(f => ({
              ...f,
              expectedArrivalAt: e.target.value
            }))} style={{
              width: '100%',
              height: 34,
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13,
              padding: '0 10px',
              boxSizing: 'border-box'
            }} />
              </label>
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{t('ui.备注','备注')}</div>
                <textarea value={createForm.remark} onChange={e => setCreateForm(f => ({
              ...f,
              remark: e.target.value
            }))} rows={2} style={{
              width: '100%',
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13,
              padding: '7px 10px',
              resize: 'vertical',
              boxSizing: 'border-box'
            }} />
              </label>
            </div>
            {createErr && <div style={{
          color: 'var(--status-danger)',
          fontSize: 12,
          marginTop: 10
        }}>{createErr}</div>}
      </ModalV2>

      {/* ══════════════════ 签收 弹窗 ══════════════════ */}
      <ModalV2 open={!!signingItem} onClose={() => { setSigningItem(null); setSignErr(''); }} title={t('ui.客户签收','客户签收')} width={420}
        footer={<>
          <button onClick={() => { setSigningItem(null); setSignErr(''); }} style={{
            padding: '8px 18px', borderRadius: 6, background: 'var(--bg-muted)', border: '1px solid var(--border)', cursor: 'pointer', color: 'inherit', fontSize: 13
          }}>{t('ui.取消','取消')}</button>
          <button disabled={signLoading || !receivedQty} onClick={submitReceipt} style={{
            padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: signingMode === 'normal' ? 'var(--status-success)' : 'var(--status-danger)',
            color: 'var(--text-on-dark)', fontSize: 13, fontWeight: 600, opacity: signLoading || !receivedQty ? 0.6 : 1
          }}>{signLoading ? t('ui.提交中…','提交中…') : t('ui.确认签收','确认签收')}</button>
        </>}>
        {signingItem && <>
            <div style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginBottom: 16
        }}>
              {signingItem.sales_order_no} · {signingItem.customer_name}
            </div>

            {/* 签收模式切换 */}
            <div style={{
          display: 'flex',
          gap: 0,
          marginBottom: 16,
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--border)'
        }}>
              {(['normal', 'exception'] as const).map(mode => <button key={mode} onClick={() => setSigningMode(mode)} style={{
            flex: 1,
            padding: '7px 0',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.1s',
            background: signingMode === mode ? mode === 'normal' ? 'var(--status-success)' : 'var(--status-danger)' : 'transparent',
            color: signingMode === mode ? 'var(--bg-card)' : 'var(--text-secondary)'
          }}>
                  {mode === 'normal' ? t('ui.✅ 正常签收','✅ 正常签收') : t('ui.⚠️ 异常签收','⚠️ 异常签收')}
                </button>)}
            </div>

            <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{t('ui.签收人','签收人')}</div>
                <input value={signedBy} onChange={e => setSignedBy(e.target.value)} placeholder={t('ui.客户姓名','客户姓名')} style={{
              width: '100%',
              height: 34,
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13,
              padding: '0 10px',
              boxSizing: 'border-box'
            }} />
              </label>
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>
                  {t('ui.实收数量 *（计划','实收数量 *（计划')} {signingItem.planned_qty} {t('ui.件）','件）')}
                </div>
                <input type="number" min={0} value={receivedQty} onChange={e => setReceivedQty(e.target.value)} style={{
              width: '100%',
              height: 34,
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13,
              padding: '0 10px',
              boxSizing: 'border-box'
            }} />
              </label>
              {signingMode === 'exception' && <>
                  <label>
                    <div style={{
                fontSize: 12,
                color: 'var(--text-disabled)',
                marginBottom: 4
              }}>{t('ui.异常数量 *','异常数量 *')}</div>
                    <input type="number" min={0} value={exceptionQty} onChange={e => setExceptionQty(e.target.value)} style={{
                width: '100%',
                height: 34,
                borderRadius: 6,
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)',
                color: 'inherit',
                fontSize: 13,
                padding: '0 10px',
                boxSizing: 'border-box'
              }} />
                  </label>
                  <label>
                    <div style={{
                fontSize: 12,
                color: 'var(--text-disabled)',
                marginBottom: 4
              }}>{t('ui.异常类型 *','异常类型 *')}</div>
                    {/* G4-C：异常类型来自 sys_dict(SAL_DELIVERY_EXCEPTION) */}
                    <DictSelect dictType="SAL_DELIVERY_EXCEPTION" value={exceptionType} onChange={setExceptionType} allowEmpty={false} />
                  </label>
                </>}
              <label>
                <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{t('ui.备注','备注')}</div>
                <input value={signRemark} onChange={e => setSignRemark(e.target.value)} style={{
              width: '100%',
              height: 34,
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13,
              padding: '0 10px',
              boxSizing: 'border-box'
            }} />
              </label>
            </div>
            {signErr && <div style={{
          color: 'var(--status-danger)',
          fontSize: 12,
          marginTop: 10
        }}>{signErr}</div>}
        </>}
      </ModalV2>

      {/* ══════════════════ 新建司机 弹窗 ══════════════════ */}
      <ModalV2 open={showDriverForm} onClose={() => { setShowDriverForm(false); setDriverErr(''); }} title={t('ui.新建司机','新建司机')} width={400}
        footer={<>
          <button onClick={() => { setShowDriverForm(false); setDriverErr(''); }} style={{
            padding: '8px 18px', borderRadius: 6, background: 'var(--bg-muted)', border: '1px solid var(--border)', cursor: 'pointer', color: 'inherit', fontSize: 13
          }}>{t('ui.取消','取消')}</button>
          <button onClick={submitDriver} style={{
            padding: '8px 18px', borderRadius: 6, background: 'var(--color-accent)', border: 'none', cursor: 'pointer', color: 'var(--text-on-dark)', fontSize: 13, fontWeight: 600
          }}>{t('ui.保存','保存')}</button>
        </>}>
            <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
              {[{
            label: t('ui.姓名 *','姓名 *'),
            field: 'driverName'
          }, {
            label: t('ui.电话','电话'),
            field: 'phone'
          }, {
            label: t('ui.驾照号','驾照号'),
            field: 'licenseNo'
          }, {
            label: t('ui.公司代码 *','公司代码 *'),
            field: 'companyCode'
          }].map(({
            label,
            field
          }) => <label key={field}>
                  <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{label}</div>
                  <input value={(driverForm as any)[field]} onChange={e => setDriverForm(f => ({
              ...f,
              [field]: e.target.value
            }))} style={{
              width: '100%',
              height: 34,
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13,
              padding: '0 10px',
              boxSizing: 'border-box'
            }} />
                </label>)}
            </div>
            {driverErr && <div style={{
          color: 'var(--status-danger)',
          fontSize: 12,
          marginTop: 10
        }}>{driverErr}</div>}
      </ModalV2>

      {/* ══════════════════ 新建车辆 弹窗 ══════════════════ */}
      <ModalV2 open={showVehicleForm} onClose={() => { setShowVehicleForm(false); setVehicleErr(''); }} title={t('ui.新建车辆','新建车辆')} width={400}
        footer={<>
          <button onClick={() => { setShowVehicleForm(false); setVehicleErr(''); }} style={{
            padding: '8px 18px', borderRadius: 6, background: 'var(--bg-muted)', border: '1px solid var(--border)', cursor: 'pointer', color: 'inherit', fontSize: 13
          }}>{t('ui.取消','取消')}</button>
          <button onClick={submitVehicle} style={{
            padding: '8px 18px', borderRadius: 6, background: 'var(--color-accent)', border: 'none', cursor: 'pointer', color: 'var(--text-on-dark)', fontSize: 13, fontWeight: 600
          }}>{t('ui.保存','保存')}</button>
        </>}>
            <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
              {[{
            label: t('ui.车辆编号 *','车辆编号 *'),
            field: 'vehicleNo'
          }, {
            label: t('ui.车牌号','车牌号'),
            field: 'plateNo'
          }, {
            label: t('ui.车辆类型','车辆类型'),
            field: 'vehicleType'
          }, {
            label: t('ui.载重(kg)','载重(kg)'),
            field: 'capacity',
            type: 'number'
          }, {
            label: t('ui.公司代码 *','公司代码 *'),
            field: 'companyCode'
          }].map(({
            label,
            field,
            type
          }) => <label key={field}>
                  <div style={{
              fontSize: 12,
              color: 'var(--text-disabled)',
              marginBottom: 4
            }}>{label}</div>
                  <input type={type ?? 'text'} value={(vehicleForm as any)[field]} onChange={e => setVehicleForm(f => ({
              ...f,
              [field]: e.target.value
            }))} style={{
              width: '100%',
              height: 34,
              borderRadius: 6,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'inherit',
              fontSize: 13,
              padding: '0 10px',
              boxSizing: 'border-box'
            }} />
                </label>)}
            </div>
            {vehicleErr && <div style={{
          color: 'var(--status-danger)',
          fontSize: 12,
          marginTop: 10
        }}>{vehicleErr}</div>}
      </ModalV2>

      <ConfirmDialogV2 open={cancelConfirm} title={t('ui.取消配送单','取消配送单')} danger confirmLabel={t('ui.确认取消','确认取消')} message={t('ui.确认取消此配送单？此操作不可撤销。','确认取消此配送单？此操作不可撤销。')} onConfirm={doCancelOrder} onCancel={() => setCancelConfirm(false)} />
    </div>;
}
