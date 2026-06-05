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

interface ExceptionOrder {
  id: string;
  orderNo: string;
  customerName: string;
  status: string;
  waveDate: string;
  exceptionType?: string;
  remark?: string;
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
          height: 88,
          marginBottom: 10,
          animation: 'pulse 1.5s ease-in-out infinite',
          opacity: 1 - i * 0.15,
        }} />
      ))}
    </div>
  );
}

export default function ExceptionsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<ExceptionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadExceptions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/v2/mobile/delivery/exceptions?page=1&pageSize=30');
      setOrders(data.data ?? data.list ?? data ?? []);
    } catch {
      setError('加载失败，请点击刷新重试');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadExceptions(); }, [loadExceptions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadExceptions();
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
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>异常记录</div>
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
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div style={{ textAlign: 'center', color: C.red, padding: 40, fontSize: 14 }}>
            ⚠ {error}
          </div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textSub, padding: 60, fontSize: 14 }}>
            ✅ 暂无异常记录
          </div>
        ) : (
          orders.map(order => (
            <div
              key={order.id}
              onClick={() => router.push(`/mobile/delivery/orders/${order.id}`)}
              style={{
                background: C.card,
                border: `1px solid ${C.red}44`,
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
                  <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>📅 {order.waveDate}</div>
                  {order.exceptionType && (
                    <div style={{ fontSize: 12, color: C.red, marginTop: 2 }}>原因：{order.exceptionType}</div>
                  )}
                  {order.remark && (
                    <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>备注：{order.remark}</div>
                  )}
                </div>
                <div style={{
                  background: `${C.red}22`,
                  color: C.red,
                  border: `1px solid ${C.red}55`,
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  ⚠ 异常
                </div>
              </div>
              <div style={{ textAlign: 'right', marginTop: 8, fontSize: 12, color: C.orange }}>
                查看详情 →
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
