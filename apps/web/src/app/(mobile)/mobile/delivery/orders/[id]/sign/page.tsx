'use client';
import { useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ── 颜色常量 ──────────────────────────────────────────────────────────────────
const C = {
  bg:      '#070b14',
  bg2:     '#0f1929',
  card:    'rgba(255,255,255,0.05)',
  border:  'rgba(255,255,255,0.10)',
  text:    '#e2e8f0',
  textSub: '#94a3b8',
  orange:  'var(--status-warning)',
  green:   'var(--status-success)',
  red:     'var(--status-danger)',
};

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

// ── 表单内容（需要 useSearchParams，包裹在 Suspense 内）────────────────────────
function SignForm({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemId = searchParams.get('itemId') ?? '';

  const [signedBy,    setSignedBy]    = useState('');
  const [receivedQty, setReceivedQty] = useState('');
  const [remark,      setRemark]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState(false);

  const handleSubmit = async () => {
    if (!signedBy.trim()) { setError('请填写签收人姓名'); return; }
    if (!receivedQty || Number(receivedQty) <= 0) { setError('请填写有效的签收数量'); return; }

    setSubmitting(true);
    setError('');
    try {
      const token = getToken();
      const res = await fetch(`/api/v2/mobile/delivery/orders/${id}/sign`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryItemId: itemId || undefined,
          signedBy: signedBy.trim(),
          receivedQty: Number(receivedQty),
          remark: remark.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => router.back(), 1500);
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
        alignItems: 'center', justifyContent: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>签收成功</div>
        <div style={{ fontSize: 14, color: C.textSub }}>正在返回…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
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

      {/* 签收数量 */}
      <div>
        <label style={labelStyle}>签收数量 *</label>
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

      {/* 备注 */}
      <div>
        <label style={labelStyle}>备注（可选）</label>
        <textarea
          style={{ ...inputStyle, height: 88, resize: 'none' }}
          value={remark}
          onChange={e => setRemark(e.target.value)}
          placeholder="可填写备注信息"
        />
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{
          color: C.red,
          background: 'rgba(239,68,68,0.10)',
          border: `1px solid rgba(239,68,68,0.3)`,
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
          background: submitting ? '#64748b' : C.green,
          color: '#fff',
          fontSize: 16,
          fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer',
          marginTop: 8,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {submitting ? '提交中…' : '✅ 确认签收'}
      </button>
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────────────────────
export default function SignPage({ params }: { params: Promise<{ id: string }> }) {
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
        <span style={{ fontSize: 17, fontWeight: 700 }}>✅ 正常签收</span>
      </div>

      <Suspense fallback={
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSub }}>
          加载中…
        </div>
      }>
        <SignForm id={id} />
      </Suspense>
    </div>
  );
}
