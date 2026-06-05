'use client';
import { useRef, useState } from 'react';
import { Paperclip, X, Loader2, FileText, ImageIcon } from 'lucide-react';

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
      if (json.code === 200 && json.url) {
        onChange(json.url);
      } else {
        setError(json.message || '上传失败，请重试');
      }
    } catch {
      setError('网络错误，请检查连接');
    } finally {
      setUploading(false);
    }
  }

  const fileName = value ? decodeURIComponent(value.split('/').pop() || value) : '';
  const isImage = value ? /\.(jpg|jpeg|png|webp)$/i.test(value) : false;
  const fullUrl = value ? (value.startsWith('http') ? value : `${base}${value}`) : '';

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
          {isImage
            ? <ImageIcon size={14} color="var(--status-info)" style={{ flexShrink: 0 }} />
            : <FileText  size={14} color="#6366f1" style={{ flexShrink: 0 }} />
          }
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            title={fileName}
            style={{
              flex: 1,
              color: 'var(--color-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 12,
            }}
          >
            {fileName || '查看附件'}
          </a>
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

      {/* 图片预览（仅图片���式） */}
      {isImage && fullUrl && (
        <a href={fullUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 4 }}>
          <img
            src={fullUrl}
            alt="附件预览"
            style={{
              maxWidth: '100%',
              maxHeight: 160,
              borderRadius: 6,
              border: '1px solid var(--border)',
              objectFit: 'contain',
            }}
          />
        </a>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
