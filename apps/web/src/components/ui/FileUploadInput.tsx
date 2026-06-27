'use client';
import { useRef, useState } from 'react';
import { Paperclip, X, Loader2, FileText, ImageIcon } from 'lucide-react';
import { isProtectedFileRef, isUnsafeAttachmentRef } from '@/lib/attachments';

interface FileUploadInputProps {
  value?: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  label?: string;
  /** 用于图片缩略图预览的基础 URL（留空则使用 NEXT_PUBLIC_API_BASE） */
  apiBase?: string;
}

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

function getApiBase() {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }
  return '';
}

export function FileUploadInput({
  value,
  onChange,
  disabled = false,
  label = '上传附件（PDF / 图片，≤15MB）',
  apiBase,
}: FileUploadInputProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const base = apiBase ?? getApiBase();

  async function handleFile(file: File) {
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${base}/api/upload/contract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (json.code === 200 && json.fileId) {
        onChange(String(json.fileId));
      } else if (json.code === 200 && json.url && !isUnsafeAttachmentRef(String(json.url))) {
        onChange(String(json.url));
      } else if (json.code === 200 && json.url) {
        setError('上传失败：服务端返回裸链接，已按安全策略拒绝');
      } else {
        setError(json.message || '上传失败：服务端未返回受控 fileId');
      }
    } catch {
      setError('网络错误，请检查连接');
    } finally {
      setUploading(false);
    }
  }

  const unsafeRef = value ? isUnsafeAttachmentRef(value) : false;
  const protectedRef = value ? isProtectedFileRef(value) : false;
  const fileName = value
    ? protectedRef
      ? value
      : unsafeRef
        ? '历史附件链接已禁用'
        : decodeURIComponent(value.split('/').pop() || value)
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      {value ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm, 6px)',
          background: 'var(--bg-page)',
          fontSize: 13,
        }}>
          {protectedRef
            ? <FileText size={14} color="var(--color-accent)" style={{ flexShrink: 0 }} />
            : <ImageIcon size={14} color={unsafeRef ? 'var(--status-warning)' : 'var(--status-info)'} style={{ flexShrink: 0 }} />
          }
          <span
            title={unsafeRef ? '安全策略禁止打开裸链接' : fileName}
            style={{
              flex: 1,
              color: unsafeRef ? 'var(--status-warning)' : 'var(--color-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 12,
            }}
          >
            {fileName || '附件'}
          </span>
          {protectedRef && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>受控</span>}
          {!disabled && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  padding: '2px 7px',
                  color: 'var(--text-secondary)',
                  flexShrink: 0,
                }}
              >
                替换
              </button>
              <button
                type="button"
                onClick={() => onChange('')}
                title="移除附件"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--status-danger)',
                  padding: 2,
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                <X size={13} />
              </button>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          disabled={uploading || disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 14px',
            border: '1.5px dashed var(--border)',
            borderRadius: 'var(--radius-sm, 6px)',
            background: 'var(--bg-page)',
            cursor: uploading || disabled ? 'not-allowed' : 'pointer',
            fontSize: 13,
            color: 'var(--text-secondary)',
            width: '100%',
            opacity: disabled ? 0.55 : 1,
            transition: 'border-color 0.15s',
          }}
        >
          {uploading
            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            : <Paperclip size={14} />
          }
          {uploading ? '上传中...' : label}
        </button>
      )}

      {error && (
        <span style={{ fontSize: 12, color: 'var(--status-danger)', marginTop: 2 }}>{error}</span>
      )}

      {value && (
        <span style={{ fontSize: 12, color: unsafeRef ? 'var(--status-warning)' : 'var(--text-tertiary)', marginTop: 2 }}>
          {unsafeRef ? '安全策略禁止裸链接访问，请重新上传生成受控附件引用。' : '附件已保存为受控引用，预览/下载需由业务模块受控端点提供。'}
        </span>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
