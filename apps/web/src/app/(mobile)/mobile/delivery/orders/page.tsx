'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const C = {
  bg:      'var(--brand-deep-1)',
  bg2:     'var(--brand-deep-2)',
  card:    'var(--overlay-white-05)',
  border:  'var(--overlay-white-10)',
  text:    'var(--slate-200)',
  textSub: 'var(--slate-400)',
  orange:  'var(--status-warning)',
  blue:    'var(--status-info)',
  green:   'var(--status-success)',
  red:     'var(--status-danger)',
  gray:    'var(--slate-500)',
};

const STATUS_MAP: Record<string, { label: string; color: string; next: string }> = {
  PLANNED:   { label: '待装车', color: C.orange, next: '去装车' },
  LOADING:   { label: '装车中', color: C.blue,   next: '完成装车' },
  LOADED:    { label: '已装车', color: C.blue,   next: '发车' },
  DEPARTED:  { label: '配送中', color: C.blue,   next: '签收' },
  ARRIVED:   { label: '已到达', color: C.blue,   next: '签收' },
  COMPLETED: { label: '已完成', color: C.green,  next: '已完成 ✓' },
  EXCEPTION: { label: '异常',   color: C.red,    next: '查看异常 ⚠' },
};

const TABS = [
  { key: '',          label: '全部' },
  { key: 'PLANNED',   label: '待装车' },
  { key: 'DEPARTED',  label: '配送中' },
  { key: 'ARRIVED',   label: '待签收' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'EXCEPTION', label: '异常' },
];

interface DeliveryOrder {
  id: string;
  orderNo: string;
  customerName: string;
  status: string;
  waveDate: string;
  item_count?: number;
  address?: string;
}

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function apiFetch(path: string) {
  const token = getToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function Skeleton() {
  return (
    <div>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          height: 96,
          marginBottom: 10,
          animation: 'pulse 1.5s ease-in-out infinite',
          opacity: 1 - i * 0.15,
        }} />
      ))}
    </div>
  );
}

export default function MyDeliveryOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [activeTab, setActiveTab] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async (status: string) => {
    setLoading(true);
    setError('');
    try {
      const url = status
        ? `/api/v2/mobile/delivery/orders?status=${status}&page=1&pageSize=30`
        : `/api/v2/mobile/delivery/orders?page=1&pageSize=30`;
      const data = await apiFetch(url);
      setOrders(data.data ?? data.list ?? data ?? []);
    } catch {
      setError('加载失败，请点击刷新重试');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(activeTab); }, [activeTab, loadOrders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadOrders(activeTab);
    setRefreshing(false);
  };

  return (
    <div style={{
      minHeight: '100svh',
      background: C.bg,
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* 顶部栏 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: C.bg2,
        borderBottom: `1px solid ${C.border}`,
        padding: '0 16px',
        height: 56,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'transparent', border: 'none', color: C.orange, fontSize: 20, cursor: 'pointer', padding: '8px 4px', lineHeight: 1 }}
        >
          ←
        </button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>我的配送</div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            background: 'transparent', border: 'none', color: C.orange,
            fontSize: 22, cursor: refreshing ? 'not-allowed' : 'pointer',
            padding: 8, lineHeight: 1,
            display: 'inline-block',
            animation: refreshing ? 'spin 1s linear infinite' : 'none',
          }}
        >
          ↺
        </button>
      </div>

      <div style={{ padding: '16px 16px 100px' }}>

        {/* Tab 筛选 */}
        <div style={{
          display: 'flex',
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          marginBottom: 16,
          overflow: 'hidden',
        }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: '11px 4px',
                background: activeTab === tab.key ? C.orange : 'transparent',
                color: activeTab === tab.key ? '#000' : C.textSub,
                border: 'none',
                fontWeight: activeTab === tab.key ? 700 : 400,
                fontSize: 11,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 列表 */}
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div style={{ textAlign: 'center', color: C.red, padding: 40, fontSize: 14 }}>
            ⚠ {error}
          </div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textSub, padding: 60, fontSize: 14 }}>
            📦 暂无配送单
          </div>
        ) : (
          orders.map(order => {
            const statusInfo = STATUS_MAP[order.status] ?? { label: order.status, color: C.gray, next: '查看详情' };
            return (
              <div
                key={order.id}
                onClick={() => router.push(`/mobile/delivery/orders/${order.id}`)}
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  padding: '14px 16px',
                  marginBottom: 10,
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{order.orderNo}</div>
                    <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>🏢 {order.customerName}</div>
                    {order.item_count !== undefined && (
                      <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>📦 {order.item_count} 项商品</div>
                    )}
                    <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>📅 {order.waveDate}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <div style={{
                      background: `${statusInfo.color}22`,
                      color: statusInfo.color,
                      border: `1px solid ${statusInfo.color}55`,
                      borderRadius: 8,
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>
                      {statusInfo.label}
                    </div>
                    <div style={{ fontSize: 12, color: statusInfo.color, fontWeight: 600 }}>
                      {statusInfo.next} →
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
