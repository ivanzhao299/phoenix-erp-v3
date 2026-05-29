'use client';
import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';

// ── 颜色常量 ──────────────────────────────────────────────────────────────────
const C = {
  bg:      '#070b14',
  bg2:     '#0f1929',
  card:    'rgba(255,255,255,0.05)',
  border:  'rgba(255,255,255,0.10)',
  text:    '#e2e8f0',
  textSub: '#94a3b8',
  orange:  '#f59e0b',
  blue:    '#3b82f6',
  green:   '#10b981',
  red:     '#ef4444',
  gray:    '#64748b',
};

// ── 状态机定义 ────────────────────────────────────────────────────────────────
const STEPS = [
  { key: 'PLANNED',   label: '已规划' },
  { key: 'LOADING',   label: '装车中' },
  { key: 'LOADED',    label: '已装车' },
  { key: 'DEPARTED',  label: '已发车' },
  { key: 'ARRIVED',   label: '已到达' },
  { key: 'SIGNING',   label: '签收中' },
  { key: 'COMPLETED', label: '已完成' },
];

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

interface DeliveryItem {
  id: string;
  productCode: string;
  productName: string;
  qty: number;
  unit: string;
  unitPrice?: number;
  customerCode?: string;
  companyCode?: string;
}

interface DeliveryOrder {
  id: string;
  orderNo: string;
  customerName: string;
  customerCode?: string;
  companyCode?: string;
  status: string;
  waveDate: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  items?: DeliveryItem[];
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

async function apiPost(path: string, body?: unknown) {
  const token = getToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── 状态时间轴 ────────────────────────────────────────────────────────────────
function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIdx = STEPS.findIndex(s => s.key === currentStatus);
  const isException = currentStatus === 'EXCEPTION';

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '16px',
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, color: C.textSub, marginBottom: 12 }}>配送进度</div>
      <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 0 }}>
        {STEPS.map((step, idx) => {
          const done = currentIdx > idx;
          const active = currentIdx === idx;
          const dotColor = done ? C.green : active ? (isException ? C.red : C.orange) : C.gray;
          const lineColor = done ? C.green : C.gray;
          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: dotColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, color: '#fff', fontWeight: 700,
                  border: active ? `2px solid ${dotColor}88` : 'none',
                  boxShadow: active ? `0 0 0 3px ${dotColor}33` : 'none',
                }}>
                  {done ? '✓' : active ? (isException ? '!' : '●') : idx + 1}
                </div>
                <div style={{ fontSize: 10, color: active ? dotColor : done ? C.green : C.gray, whiteSpace: 'nowrap' }}>
                  {step.label}
                </div>
              </div>
              {idx < STEPS.length - 1 && (
                <div style={{ width: 20, height: 2, background: lineColor, margin: '0 2px', marginBottom: 16 }} />
              )}
            </div>
          );
        })}
        {isException && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginLeft: 8, flexShrink: 0 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: '#fff', fontWeight: 700,
            }}>!</div>
            <div style={{ fontSize: 10, color: C.red }}>异常</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 商品明细行 ────────────────────────────────────────────────────────────────
function ItemRow({ item }: { item: DeliveryItem }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div>
        <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{item.productName}</div>
        <div style={{ fontSize: 12, color: C.textSub }}>{item.productCode}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.orange }}>{item.qty}</div>
        <div style={{ fontSize: 11, color: C.textSub }}>{item.unit}</div>
      </div>
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────────────────────
export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/v2/mobile/delivery/orders/${id}`);
      setOrder(data.data ?? data);
    } catch {
      setError('加载失败，请返回重试');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  const doAction = async (endpoint: string) => {
    setActionLoading(true);
    setActionError('');
    try {
      await apiPost(`/api/v2/mobile/delivery/orders/${id}/${endpoint}`);
      await loadOrder();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : '操作失败，请重试');
    } finally {
      setActionLoading(false);
    }
  };

  const buildSignUrl = (itemId: string) =>
    `/mobile/delivery/orders/${id}/sign?itemId=${itemId}`;

  const buildExceptionUrl = (item: DeliveryItem) => {
    const params = new URLSearchParams({
      itemId:       item.id,
      productCode:  item.productCode  ?? '',
      productName:  item.productName  ?? '',
      unitPrice:    String(item.unitPrice  ?? ''),
      customerCode: item.customerCode ?? order?.customerCode ?? '',
      customerName: order?.customerName ?? '',
      companyCode:  item.companyCode  ?? order?.companyCode  ?? '',
    });
    return `/mobile/delivery/orders/${id}/exception?${params.toString()}`;
  };

  const btnStyle = (color: string, disabled = false): React.CSSProperties => ({
    flex: 1,
    height: 52,
    borderRadius: 12,
    border: 'none',
    background: disabled ? C.gray : color,
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    WebkitTapHighlightColor: 'transparent',
  });

  const renderActions = (o: DeliveryOrder) => {
    const dis = actionLoading;
    const firstItem = o.items?.[0];

    switch (o.status) {
      case 'PLANNED':
        return (
          <button style={btnStyle(C.orange, dis)} onClick={() => doAction('start-loading')} disabled={dis}>
            {dis ? '处理中…' : '📦 开始装车'}
          </button>
        );
      case 'LOADING':
        return (
          <button style={btnStyle(C.blue, dis)} onClick={() => doAction('finish-loading')} disabled={dis}>
            {dis ? '处理中…' : '✅ 完成装车'}
          </button>
        );
      case 'LOADED':
        return (
          <button style={btnStyle(C.blue, dis)} onClick={() => doAction('depart')} disabled={dis}>
            {dis ? '处理中…' : '🚚 发车'}
          </button>
        );
      case 'DEPARTED':
        return (
          <button style={btnStyle(C.green, dis)} onClick={() => doAction('arrive')} disabled={dis}>
            {dis ? '处理中…' : '📍 到达'}
          </button>
        );
      case 'ARRIVED':
        return (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              style={btnStyle(C.green, dis)}
              onClick={() => firstItem ? router.push(buildSignUrl(firstItem.id)) : doAction('sign')}
              disabled={dis}
            >
              ✅ 正常签收
            </button>
            <button
              style={btnStyle(C.red, dis)}
              onClick={() => firstItem ? router.push(buildExceptionUrl(firstItem)) : router.push(`/mobile/delivery/orders/${id}/exception`)}
              disabled={dis}
            >
              ⚠ 异常签收
            </button>
          </div>
        );
      case 'COMPLETED':
        return (
          <button style={btnStyle(C.blue)} onClick={() => router.push(`/mobile/delivery/orders/${id}/photos`)}>
            📷 查看照片
          </button>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.textSub, fontSize: 14 }}>加载中…</div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ color: C.red, fontSize: 14 }}>⚠ {error || '订单不存在'}</div>
        <button onClick={() => router.back()} style={{ color: C.orange, background: 'none', border: 'none', fontSize: 15, cursor: 'pointer' }}>← 返回</button>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[order.status] ?? { label: order.status, color: C.gray };

  return (
    <div style={{ minHeight: '100svh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 100 }}>
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
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{order.orderNo}</div>
        </div>
        <div style={{
          background: `${statusInfo.color}22`,
          color: statusInfo.color,
          border: `1px solid ${statusInfo.color}55`,
          borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600,
        }}>
          {statusInfo.label}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* 状态时间轴 */}
        <StatusTimeline currentStatus={order.status} />

        {/* 基本信息 */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: C.textSub, marginBottom: 10 }}>配送信息</div>
          {[
            ['🏢 客户',   order.customerName],
            ['📅 波次日期', order.waveDate],
            ['📍 地址',   order.address],
            ['👤 联系人', order.contactName],
            ['📞 电话',   order.contactPhone],
            ['📝 备注',   order.remark],
          ].filter(([, v]) => v).map(([label, val]) => (
            <div key={label as string} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: C.textSub, flexShrink: 0 }}>{label as string}</span>
              <span style={{ fontSize: 13, color: C.text }}>{val as string}</span>
            </div>
          ))}
        </div>

        {/* 商品明细 */}
        {order.items && order.items.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 4 }}>
              商品明细（{order.items.length} 项）
            </div>
            {order.items.map(item => (
              <div key={item.id}>
                <ItemRow item={item} />
                {/* ARRIVED 状态：每行都有签收/异常按钮 */}
                {order.status === 'ARRIVED' && (
                  <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
                    <button
                      onClick={() => router.push(buildSignUrl(item.id))}
                      style={{
                        flex: 1, height: 36, borderRadius: 8, border: 'none',
                        background: `${C.green}22`, color: C.green, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      ✅ 正常签收
                    </button>
                    <button
                      onClick={() => router.push(buildExceptionUrl(item))}
                      style={{
                        flex: 1, height: 36, borderRadius: 8, border: 'none',
                        background: `${C.red}22`, color: C.red, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      ⚠ 异常签收
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 操作错误提示 */}
        {actionError && (
          <div style={{ color: C.red, background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.red}44`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
            ⚠ {actionError}
          </div>
        )}
      </div>

      {/* 底部固定操作区 */}
      {order.status !== 'ARRIVED' && order.status !== 'EXCEPTION' && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: C.bg2,
          borderTop: `1px solid ${C.border}`,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
          display: 'flex', gap: 10,
        }}>
          {renderActions(order)}
        </div>
      )}

      {/* ARRIVED 状态：底部提示 */}
      {order.status === 'ARRIVED' && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: C.bg2,
          borderTop: `1px solid ${C.border}`,
          padding: '10px 16px calc(10px + env(safe-area-inset-bottom))',
        }}>
          <div style={{ fontSize: 12, color: C.textSub, textAlign: 'center', marginBottom: 8 }}>
            请对每个商品逐一签收，或使用下方按钮整单操作
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {renderActions(order)}
          </div>
        </div>
      )}
    </div>
  );
}
