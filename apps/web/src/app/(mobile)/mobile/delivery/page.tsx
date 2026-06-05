'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── 颜色常量 ──────────────────────────────────────────────────────────────────
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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PLANNED:   { label: '待装车', color: C.orange },
  LOADING:   { label: '装车中', color: C.blue   },
  LOADED:    { label: '已装车', color: C.blue   },
  DEPARTED:  { label: '配送中', color: C.blue   },
  ARRIVED:   { label: '已到达', color: C.blue   },
  SIGNING:   { label: '签收中', color: C.orange },
  COMPLETED: { label: '已完成', color: C.green  },
  EXCEPTION: { label: '异常',   color: C.red    },
};

const TABS = [
  { key: 'PLANNED',      label: '待装车' },
  { key: 'IN_PROGRESS',  label: '配送中' },
  { key: 'PENDING_SIGN', label: '待签收' },
  { key: 'COMPLETED',    label: '已完成' },
  { key: 'EXCEPTION',    label: '异常'   },
];

interface DashboardStats {
  totalToday: number;
  planned: number;
  inProgress: number;
  pendingSign: number;
  completed: number;
  exception: number;
}

interface DeliveryOrder {
  id: string;
  orderNo: string;
  customerName: string;
  status: string;
  waveDate: string;
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

// ── 统计卡片 ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      flex: '1 1 28%',
      minWidth: 80,
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: '10px 8px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── 配送单卡片 ────────────────────────────────────────────────────────────────
function OrderCard({ order, onClick }: { order: DeliveryOrder; onClick: () => void }) {
  const statusInfo = STATUS_MAP[order.status] ?? { label: order.status, color: C.gray };
  return (
    <div
      onClick={onClick}
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
          {order.address && (
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>📍 {order.address}</div>
          )}
          <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>📅 {order.waveDate}</div>
        </div>
        <div style={{
          background: `${statusInfo.color}22`,
          color: statusInfo.color,
          border: `1px solid ${statusInfo.color}55`,
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {statusInfo.label}
        </div>
      </div>
      <div style={{ textAlign: 'right', marginTop: 8, fontSize: 12, color: C.orange }}>
        查看详情 →
      </div>
    </div>
  );
}

// ── 骨架屏 ───────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          height: 90,
          marginBottom: 10,
          animation: 'pulse 1.5s ease-in-out infinite',
          opacity: 1 - i * 0.15,
        }} />
      ))}
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────────────────────
export default function DeliveryPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [activeTab, setActiveTab] = useState('PLANNED');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch('/api/v2/mobile/delivery/dashboard');
      setStats(data.data ?? data);
    } catch {
      // stats 不阻塞主流程
    }
  }, []);

  const loadOrders = useCallback(async (status: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/v2/mobile/delivery/orders?status=${status}`);
      setOrders(data.data ?? data.list ?? data ?? []);
    } catch {
      setError('加载失败，请下拉重试');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadOrders(activeTab); }, [activeTab, loadOrders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadOrders(activeTab)]);
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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🚚</span>
          <span style={{ fontSize: 17, fontWeight: 700 }}>配送任务</span>
        </div>
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

        {/* 统计卡片 */}
        {stats && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatCard label="今日总单" value={stats.totalToday ?? 0} color={C.text}   />
            <StatCard label="待装车"   value={stats.planned     ?? 0} color={C.orange} />
            <StatCard label="配送中"   value={stats.inProgress  ?? 0} color={C.blue}   />
            <StatCard label="待签收"   value={stats.pendingSign ?? 0} color={C.orange} />
            <StatCard label="已完成"   value={stats.completed   ?? 0} color={C.green}  />
            <StatCard label="异常单"   value={stats.exception   ?? 0} color={C.red}    />
          </div>
        )}

        {/* 快捷入口 3 宫格 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { icon: '📋', label: '我的配送', href: '/mobile/delivery/orders', color: C.blue },
            { icon: '⚠️', label: '异常记录', href: '/mobile/delivery/exceptions', color: C.red },
            { icon: '📊', label: '我的表现', href: '/mobile/delivery/performance', color: C.green },
          ].map(nav => (
            <button
              key={nav.href}
              onClick={() => router.push(nav.href)}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: '14px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 24 }}>{nav.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: nav.color }}>{nav.label}</span>
            </button>
          ))}
        </div>

        {/* Tab 切换 */}
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
                fontSize: 12,
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
          orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={() => router.push(`/mobile/delivery/orders/${order.id}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}
