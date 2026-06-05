'use client';
import { useState, useEffect, useCallback, use } from 'react';
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

const EXCEPTION_TYPES = ['缺货', '破损', '拒收', '超期', '其他'];

interface DeliveryItem {
  id: string;
  productCode: string;
  productName: string;
  qty: number;
  unit: string;
  unitPrice?: number;
  customerCode?: string;
  companyCode?: string;
  status?: string;
}

interface DeliveryOrder {
  id: string;
  orderNo: string;
  customerName: string;
  customerCode?: string;
  companyCode?: string;
  status: string;
  waveDate: string;
  items?: DeliveryItem[];
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

async function apiPost(path: string, body: unknown) {
  const token = getToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().then((d: { message?: string; error?: string }) => d?.message || d?.error || `HTTP ${res.status}`).catch(() => `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return res.json();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: C.textSub,
  marginBottom: 6,
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: C.bg2,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: '10px 12px',
  color: C.text,
  fontSize: 15,
  boxSizing: 'border-box',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
};

export default function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();

  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // 选中的 item
  const [selectedItem, setSelectedItem] = useState<DeliveryItem | null>(null);

  // 表单字段
  const [signedBy, setSignedBy] = useState('');
  const [receivedQty, setReceivedQty] = useState('');
  const [exceptionQty, setExceptionQty] = useState('0');
  const [exceptionType, setExceptionType] = useState('缺货');
  const [remark, setRemark] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiFetch(`/api/v2/mobile/delivery/orders/${orderId}`);
      setOrder(data.data ?? data);
    } catch {
      setLoadError('加载配送单失败，请返回重试');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  // 选中 item 后初始化数量
  const handleSelectItem = (item: DeliveryItem) => {
    setSelectedItem(item);
    setReceivedQty(String(item.qty));
    setExceptionQty('0');
    setExceptionType('缺货');
    setRemark('');
    setPhotos([]);
    setSubmitError('');
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (photos.length + files.length > 3) {
      alert('最多上传 3 张照片');
      return;
    }
    const newBase64 = await Promise.all(files.slice(0, 3 - photos.length).map(fileToBase64));
    setPhotos(prev => [...prev, ...newBase64]);
    // 清空 input 以允许重复选择同一文件
    e.target.value = '';
  };

  const handleRemovePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!selectedItem) return;
    if (!signedBy.trim()) { setSubmitError('请填写签收人'); return; }

    const exQty = parseInt(exceptionQty) || 0;
    const rcvQty = parseInt(receivedQty) || 0;

    setSubmitting(true);
    setSubmitError('');
    try {
      if (exQty === 0) {
        await apiPost(`/api/v2/mobile/delivery/orders/${orderId}/sign`, {
          deliveryItemId: selectedItem.id,
          signedBy: signedBy.trim(),
          receivedQty: rcvQty,
          remark: remark.trim() || undefined,
          photoUrls: photos.length > 0 ? photos : undefined,
        });
      } else {
        await apiPost(`/api/v2/mobile/delivery/orders/${orderId}/sign-exception`, {
          deliveryItemId: selectedItem.id,
          signedBy: signedBy.trim(),
          receivedQty: rcvQty,
          exceptionQty: exQty,
          exceptionType,
          remark: remark.trim() || undefined,
          photoUrls: photos.length > 0 ? photos : undefined,
          customerCode: selectedItem.customerCode ?? order?.customerCode,
          companyCode: selectedItem.companyCode ?? order?.companyCode,
          productCode: selectedItem.productCode,
          productName: selectedItem.productName,
        });
      }
      alert(exQty > 0 ? '异常签收已提交' : '签收成功');
      router.push(`/mobile/delivery/orders/${orderId}`);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.textSub, fontSize: 14 }}>加载中…</div>
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ color: C.red, fontSize: 14 }}>⚠ {loadError || '订单不存在'}</div>
        <button onClick={() => router.back()} style={{ color: C.orange, background: 'none', border: 'none', fontSize: 15, cursor: 'pointer' }}>← 返回</button>
      </div>
    );
  }

  const items = order.items ?? [];

  return (
    <div style={{
      minHeight: '100svh',
      background: C.bg,
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      paddingBottom: 100,
    }}>
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
          onClick={() => selectedItem ? setSelectedItem(null) : router.back()}
          style={{ background: 'transparent', border: 'none', color: C.orange, fontSize: 20, cursor: 'pointer', padding: '8px 4px', lineHeight: 1 }}
        >
          ←
        </button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>
          {selectedItem ? '填写签收信息' : '选择签收商品'}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* 订单信息 */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: '12px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{order.orderNo}</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>🏢 {order.customerName}</div>
        </div>

        {/* 步骤1：选择 item */}
        {!selectedItem && (
          <div>
            <div style={{ fontSize: 14, color: C.textSub, marginBottom: 12 }}>请选择要签收的商品：</div>
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.textSub, padding: 40, fontSize: 14 }}>
                暂无商品明细
              </div>
            ) : (
              items.map(item => {
                const isSigned = item.status === 'SIGNED' || item.status === 'EXCEPTION';
                return (
                  <div
                    key={item.id}
                    onClick={() => !isSigned && handleSelectItem(item)}
                    style={{
                      background: isSigned ? 'rgba(255,255,255,0.02)' : C.card,
                      border: `1px solid ${isSigned ? C.gray + '44' : C.border}`,
                      borderRadius: 14,
                      padding: '14px 16px',
                      marginBottom: 10,
                      cursor: isSigned ? 'not-allowed' : 'pointer',
                      opacity: isSigned ? 0.55 : 1,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{item.productName}</div>
                        <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{item.productCode}</div>
                        <div style={{ fontSize: 13, color: C.orange, marginTop: 4 }}>应送 {item.qty} {item.unit}</div>
                      </div>
                      {isSigned ? (
                        <div style={{
                          background: `${C.green}22`, color: C.green,
                          border: `1px solid ${C.green}55`,
                          borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600,
                        }}>
                          {item.status === 'EXCEPTION' ? '已异常' : '已签收'}
                        </div>
                      ) : (
                        <div style={{ color: C.orange, fontSize: 20 }}>›</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 步骤2：签收表单 */}
        {selectedItem && (
          <div>
            {/* 商品信息 */}
            <div style={{
              background: C.card, border: `1px solid ${C.orange}44`, borderRadius: 14,
              padding: '12px 16px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.orange }}>{selectedItem.productName}</div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{selectedItem.productCode} · 应送 {selectedItem.qty} {selectedItem.unit}</div>
            </div>

            {/* 签收人 */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>签收人 *</label>
              <input
                type="text"
                value={signedBy}
                onChange={e => setSignedBy(e.target.value)}
                placeholder="请输入签收人姓名"
                style={inputStyle}
              />
            </div>

            {/* 实收数量 */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>实收数量</label>
              <input
                type="number"
                value={receivedQty}
                onChange={e => setReceivedQty(e.target.value)}
                min={0}
                style={inputStyle}
              />
            </div>

            {/* 异常数量 */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>异常数量（0 为正常签收）</label>
              <input
                type="number"
                value={exceptionQty}
                onChange={e => setExceptionQty(e.target.value)}
                min={0}
                style={inputStyle}
              />
            </div>

            {/* 异常原因（仅当 exceptionQty > 0） */}
            {parseInt(exceptionQty) > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>异常原因</label>
                <select
                  value={exceptionType}
                  onChange={e => setExceptionType(e.target.value)}
                  style={selectStyle}
                >
                  {EXCEPTION_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 照片上传 */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>照片（最多 3 张）</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                {photos.map((photo, idx) => (
                  <div key={idx} style={{ position: 'relative', width: 80, height: 80 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt={`照片 ${idx + 1}`}
                      style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }}
                    />
                    <button
                      onClick={() => handleRemovePhoto(idx)}
                      style={{
                        position: 'absolute', top: -8, right: -8,
                        width: 22, height: 22, borderRadius: '50%',
                        background: C.red, border: 'none', color: 'var(--bg-card)',
                        fontSize: 14, cursor: 'pointer', lineHeight: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {photos.length < 3 && (
                  <label style={{
                    width: 80, height: 80,
                    background: C.card, border: `1px dashed ${C.border}`,
                    borderRadius: 8, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', gap: 4,
                  }}>
                    <span style={{ fontSize: 24, color: C.textSub }}>+</span>
                    <span style={{ fontSize: 10, color: C.textSub }}>拍照</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePhotoChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* 备注 */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>备注</label>
              <textarea
                value={remark}
                onChange={e => setRemark(e.target.value)}
                placeholder="可选备注"
                rows={3}
                style={{ ...inputStyle, resize: 'none' }}
              />
            </div>

            {/* 错误提示 */}
            {submitError && (
              <div style={{
                color: C.red, background: 'var(--status-danger-bg-light)',
                border: `1px solid ${C.red}44`, borderRadius: 10,
                padding: '10px 14px', marginBottom: 16, fontSize: 13,
              }}>
                ⚠ {submitError}
              </div>
            )}

            {/* 状态说明 */}
            {parseInt(exceptionQty) > 0 ? (
              <div style={{
                background: `${C.red}11`, border: `1px solid ${C.red}33`, borderRadius: 10,
                padding: '10px 14px', marginBottom: 20, fontSize: 13, color: C.red,
              }}>
                ⚠ 将提交异常签收（{exceptionType}），异常数量：{exceptionQty}
              </div>
            ) : (
              <div style={{
                background: `${C.green}11`, border: `1px solid ${C.green}33`, borderRadius: 10,
                padding: '10px 14px', marginBottom: 20, fontSize: 13, color: C.green,
              }}>
                ✅ 正常签收，实收数量：{receivedQty}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部提交按钮 */}
      {selectedItem && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: C.bg2,
          borderTop: `1px solid ${C.border}`,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
        }}>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%',
              height: 52,
              borderRadius: 12,
              border: 'none',
              background: submitting ? C.gray : (parseInt(exceptionQty) > 0 ? C.red : C.green),
              color: 'var(--bg-card)',
              fontSize: 16,
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {submitting ? '提交中…' : parseInt(exceptionQty) > 0 ? '⚠ 提交异常签收' : '✅ 确认签收'}
          </button>
        </div>
      )}
    </div>
  );
}
