'use client';
import React, { useState } from 'react';
import { Upload, X, FileText } from 'lucide-react';

/**
 * AttachmentUploader — 统一多附件上传（基于现有 /api/upload/contract 通道）。
 * value: string[]（已上传 url 列表）；onChange 返回新列表。审批后 readOnly 只读。
 */
export interface AttachmentUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  readOnly?: boolean;
  label?: string;
  apiBase?: string;
}

export function AttachmentUploader({ value, onChange, readOnly, label = '上传附件（PDF/图片 ≤15MB）', apiBase }: AttachmentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const token = (typeof window !== 'undefined'
    && (sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token'))) || '';
  const base = apiBase ?? (process.env.NEXT_PUBLIC_API_BASE || '');

  // G134：支持一次多选 + 多次累加。批量内逐个串行上传，全部成功的 url 一次性合并进 value
  //   （避免并行 onChange 各读到 stale value 互相覆盖，导致"只剩最后一个"）。
  const MAX_MB = 15;   // 与应用层 FileInterceptor(15MB) + nginx(20m) 一致（原 10 与"≤15MB"标签不符）
  const uploadFiles = async (files: File[]) => {
    setErr(''); setUploading(true);
    const added: string[] = [];
    const errs: string[] = [];
    try {
      for (const file of files) {
        if (file.size > MAX_MB * 1024 * 1024) {
          errs.push(`${file.name}：超出 ${MAX_MB}MB（${(file.size / 1024 / 1024).toFixed(1)}MB）`);
          continue;
        }
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`${base}/api/upload/contract`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: fd });
        // G30：5xx 返 text/HTML，不强 JSON.parse（防 "Unexpected token 'I'" 报错）
        const ct = res.headers.get('content-type') || '';
        if (!res.ok) {
          const detail = ct.includes('application/json') ? (await res.json().catch(() => ({})))?.message : await res.text().catch(() => '');
          errs.push(`${file.name}：上传失败 (${res.status})${detail ? '，' + String(detail).slice(0, 80) : ''}`);
          continue;
        }
        const json = ct.includes('application/json') ? await res.json() : {};
        if (json?.url) added.push(json.url);
        else errs.push(`${file.name}：服务端未返回 url`);
      }
      if (added.length) onChange([...value, ...added]);
      if (errs.length) setErr(errs.join('；'));
    } catch (e: any) { setErr(e?.message || '上传失败'); }
    finally { setUploading(false); }
  };

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: readOnly ? 0 : 8 }}>
          {value.map((u, i) => {
            const isImg = /\.(png|jpe?g|webp)$/i.test(u);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 12.5 }}>
                {isImg ? <img src={u} alt={`附件${i + 1}`} style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 3 }} /> : <FileText size={14} style={{ color: 'var(--text-secondary)' }} />}
                <a href={u} target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)' }}>附件{i + 1}</a>
                {!readOnly && (
                  <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', color: 'var(--status-danger)', cursor: 'pointer', display: 'flex' }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!readOnly && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)', color: 'var(--text-secondary)', cursor: uploading ? 'wait' : 'pointer', fontSize: 13 }}>
          <Upload size={14} />{uploading ? '上传中…' : label}
          {/* G134：multiple 允许一次选多个；也可重复点击逐个累加 */}
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} disabled={uploading}
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) uploadFiles(fs); e.target.value = ''; }} />
        </label>
      )}
      {readOnly && value.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-disabled)' }}>无附件</span>}
      {err && <div style={{ fontSize: 12, color: 'var(--status-danger)', marginTop: 4 }}>{err}</div>}
    </div>
  );
}
