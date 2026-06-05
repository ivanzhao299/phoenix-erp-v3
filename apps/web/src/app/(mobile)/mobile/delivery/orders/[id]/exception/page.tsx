'use client';
import { useState, use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// ── 颜色常量 ──────────────────────────────────────────────────────────────────
const C = {
  bg:      'var(--brand-deep-1)',
  bg2:     'var(--brand-deep-2)',
  card:    'var(--overlay-white-05)',
  border:  'var(--overlay-white-10)',
  text:    'var(--slate-200)',
  textSub: 'var(--slate-400)',
  orange:  'var(--status-warning)',
  green:   'var(--status-success)',
  red:     'var(--status-danger)',
};

const EXCEPTION_TYPES = [
  { value: 'SHORTAGE', label: '缺货' },
  { value: 'DAMAGED',  label: '破损' },
  { value: 'REJECTED', label: '拒收' },
  { value: 'EXPIRED',  label: '超期' },
  { value: 'OTHER',    label: '其他' },
];

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

// ── 表单内容（包裹在 Suspense 内以使用 useSearchParams）──────────────────────
function ExceptionForm({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 从 query params 获取商品信息
  const itemId       = searchParams.get('itemId')       ?? '';
  const productCode  = searchParams.get('productCode')  ?? '';
  const productName  = searchParams.get('productName')  ?? '';
  const unitPrice    = searchParams.get('unitPrice')    ?? '';
  const customerCode = searchParams.get('customerCode') ?? '';
  const customerName = searchParams.get('customerName') ?? '';
  const companyCode  = searchParams.get('companyCode')  ?? '';

  const [signedBy,       setSignedBy]       = useState('');
  const [receivedQty,    setReceivedQty]    = useState('');
  const [exceptionQty,   setExceptionQty]   = useState('');
  const [exceptionType,  setExceptionType]  = useState('SHORTAGE');
  const [remark,         setRemark]         = useState('');
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState('');
  const [success,        setSuccess]        = useState(false);

  const handleSubmit = async () => {
    if (!signedBy.trim()) { setError('请填写签收人姓名'); return; }
    if (receivedQty === '' || Number(receivedQty) < 0) { setError('请填写正常签收数量（可为0）'); return; }
    if (!exceptionQty || Number(exceptionQty) <= 0) { setError('请填写异常数量（须大于0）'); return; }

    setSubmitting(true);
    setError('');
    try {
      const token = getToken();
      const res = await fetch(`/api/v2/mobile/delivery/orders/${id}/sign-exception`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryItemId: itemId       || undefined,
          receivedQty:    Number(receivedQty),
          exceptionQty:   Number(exceptionQty),
          exceptionType,
          signedBy:       signedBy.trim(),
          remark:         remark.trim() || undefined,
          customerCode,
          customerName,
          companyCode,
          productCode,
          productName,
          unitPrice:      unitPrice ? Number(unitPrice) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => router.back(), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '13px 14px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.07)',
    border: `1px solid ${C.border}`,
    color: C.text,
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: C.textSub,
    marginBottom: 6,
    display: 'block',
  };

  if (success) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
      }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>异常已记录</div>
        <div style={{ fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 1.6 }}>
          已自动创建退货单，请等待仓库处理
        </div>
        <div style={{ fontSize: 13, color: C.textSub }}>正在返回…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 商品信息回显 */}
      {(productName || productCode) && (
        <div style={{
          background: `${C.red}11`,
          border: `1px solid ${C.red}33`,
          borderRadius: 12, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 12, color: C.red, marginBottom: 4, fontWeight: 600 }}>⚠ 异常商品</div>
          <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{productName}</div>
          <div style={{ fontSize: 12, color: C.textSub }}>{productCode}</div>
        </div>
      )}

      {/* 签收人 */}
      <div>
        <label style={labelStyle}>签收人姓名 *</label>
        <input
          style={inputStyle}
          value={signedBy}
          onChange={e => setSignedBy(e.target.value)}
          placeholder="请填写签收人真实姓名"
          autoFocus
        />
      </div>

      {/* 正常数量 + 异常数量 */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>正常数量 *</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            style={inputStyle}
            value={receivedQty}
            onChange={e => setReceivedQty(e.target.value)}
            placeholder="0"
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>异常数量 *</label>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            style={{ ...inputStyle, borderColor: 'var(--status-danger)' }}
            value={exceptionQty}
            onChange={e => setExceptionQty(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {/* 异常原因 */}
      <div>
        <label style={labelStyle}>异常原因 *</label>
        <select
          style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }}
          value={exceptionType}
          onChange={e => setExceptionType(e.target.value)}
        >
          {EXCEPTION_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* 备注 */}
      <div>
        <label style={labelStyle}>备注（可选）</label>
        <textarea
          style={{ ...inputStyle, height: 88, resize: 'none' }}
          value={remark}
          onChange={e => setRemark(e.target.value)}
          placeholder="请描述异常情况（可选）"
        />
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{
          color: C.red,
          background: 'var(--status-danger-bg-light)',
          border: `1px solid var(--status-danger-bg-strong)`,
          borderRadius: 10, padding: '10px 14px', fontSize: 13,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* 提交按钮 */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: '100%',
          height: 52,
          borderRadius: 12,
          border: 'none',
          background: submitting ? 'var(--slate-500)' : C.red,
          color: 'var(--bg-card)',
          fontSize: 16,
          fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer',
          marginTop: 4,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {submitting ? '提交中…' : '⚠ 提交异常记录'}
      </button>

      <div style={{ fontSize: 12, color: C.textSub, textAlign: 'center', lineHeight: 1.5 }}>
        提交后将自动创建退货单，请确认信息无误后再提交
      </div>
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────────────────────
export default function ExceptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <div style={{
      minHeight: '100svh',
      background: C.bg,
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex', flexDirection: 'column',
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
          onClick={() => router.back()}
          style={{ background: 'transparent', border: 'none', color: C.orange, fontSize: 20, cursor: 'pointer', padding: '8px 4px', lineHeight: 1 }}
        >
          ←
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: C.red }}>⚠ 异常签收</span>
      </div>

      <Suspense fallback={
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSub }}>
          加载中…
        </div>
      }>
        <ExceptionForm id={id} />
      </Suspense>
    </div>
  );
}
