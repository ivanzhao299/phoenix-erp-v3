'use client';
import { useState, useRef, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
  blue:    'var(--status-info)',
};

const MAX_SIZE_BYTES = 300 * 1024; // 300 KB

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

// ── 图片压缩 ──────────────────────────────────────────────────────────────────
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');

      let { width, height } = img;
      const MAX_DIM = 1024;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height / width) * MAX_DIM);
          width = MAX_DIM;
        } else {
          width = Math.round((width / height) * MAX_DIM);
          height = MAX_DIM;
        }
      }
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      // 逐步降低质量直到满足大小
      let quality = 0.8;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > MAX_SIZE_BYTES * 1.37 && quality > 0.2) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── 主页面 ───────────────────────────────────────────────────────────────────
export default function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos,     setPhotos]     = useState<string[]>([]);
  const [uploading,  setUploading]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState(false);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const compressed = await Promise.all(files.map(f => compressImage(f)));
      setPhotos(prev => [...prev, ...compressed]);
    } catch {
      setError('图片处理失败，请重试');
    } finally {
      setUploading(false);
      // 清空 input 以允许再次选同一文件
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (photos.length === 0) { setError('请先添加至少一张照片'); return; }
    setSaving(true);
    setError('');
    try {
      const token = getToken();
      const res = await fetch(`/api/v2/mobile/delivery/orders/${id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => router.back(), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div style={{
        minHeight: '100svh', background: C.bg, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>照片已保存</div>
        <div style={{ fontSize: 14, color: C.textSub }}>正在返回…</div>
      </div>
    );
  }

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
          onClick={() => router.back()}
          style={{ background: 'transparent', border: 'none', color: C.orange, fontSize: 20, cursor: 'pointer', padding: '8px 4px', lineHeight: 1 }}
        >
          ←
        </button>
        <span style={{ fontSize: 17, fontWeight: 700 }}>📷 签收照片</span>
      </div>

      <div style={{ padding: '20px 16px' }}>
        {/* 说明文字 */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '12px 14px', marginBottom: 20,
          fontSize: 13, color: C.textSub, lineHeight: 1.6,
        }}>
          📸 请拍摄签收现场照片，图片会自动压缩至 300KB 以内。每次可添加多张照片，保存前可删除不需要的照片。
        </div>

        {/* 照片网格 */}
        {photos.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 16,
          }}>
            {photos.map((photo, idx) => (
              <div key={idx} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '1', background: C.card }}>
                <img
                  src={photo}
                  alt={`签收照片 ${idx + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {/* 删除按钮 */}
                <button
                  onClick={() => removePhoto(idx)}
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 28, height: 28,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 16, lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ×
                </button>
                <div style={{
                  position: 'absolute', bottom: 4, left: 6,
                  fontSize: 11, color: 'rgba(255,255,255,0.7)',
                }}>
                  {idx + 1}/{photos.length}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 空状态 */}
        {photos.length === 0 && !uploading && (
          <div style={{
            border: `2px dashed ${C.border}`,
            borderRadius: 14,
            padding: '40px 20px',
            textAlign: 'center',
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
            <div style={{ fontSize: 14, color: C.textSub }}>点击下方按钮添加签收照片</div>
          </div>
        )}

        {/* 上传中状态 */}
        {uploading && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: 20, textAlign: 'center',
            marginBottom: 16, color: C.textSub, fontSize: 14,
          }}>
            ⏳ 处理图片中…
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div style={{
            color: C.red,
            background: 'rgba(239,68,68,0.10)',
            border: `1px solid rgba(239,68,68,0.3)`,
            borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* 图片数量提示 */}
        {photos.length > 0 && (
          <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12, textAlign: 'center' }}>
            已添加 {photos.length} 张照片
          </div>
        )}
      </div>

      {/* 隐藏文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* 底部固定按钮 */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: C.bg2,
        borderTop: `1px solid ${C.border}`,
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
        display: 'flex', gap: 10,
      }}>
        {/* 添加照片 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 12,
            border: `1px solid ${C.orange}`,
            background: 'transparent',
            color: C.orange,
            fontSize: 15,
            fontWeight: 600,
            cursor: uploading ? 'not-allowed' : 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {uploading ? '处理中…' : '📷 添加照片'}
        </button>

        {/* 保存 */}
        <button
          onClick={handleSave}
          disabled={saving || photos.length === 0}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 12,
            border: 'none',
            background: (saving || photos.length === 0) ? '#1e293b' : C.green,
            color: (saving || photos.length === 0) ? C.textSub : '#fff',
            fontSize: 16,
            fontWeight: 700,
            cursor: (saving || photos.length === 0) ? 'not-allowed' : 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {saving ? '保存中…' : `💾 保存（${photos.length}）`}
        </button>
      </div>
    </div>
  );
}
