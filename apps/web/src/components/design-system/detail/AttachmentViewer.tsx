'use client';
import React from 'react';
import { FileText } from 'lucide-react';

/**
 * AttachmentViewer — 统一附件查看（只读，缩略图 + 下载）。详情页用。
 * 与 AttachmentUploader 配对：上传用 Uploader，展示用 Viewer。
 */
export interface AttachmentViewerProps {
  urls?: string[] | null;
  count?: number;
  emptyText?: string;
}

export function AttachmentViewer({ urls, count, emptyText = '无附件' }: AttachmentViewerProps) {
  if (urls && urls.length > 0) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {urls.map((u, i) => {
          const isImg = /\.(png|jpe?g|webp)$/i.test(u);
          return (
            <a key={i} href={u} target="_blank" rel="noreferrer"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', textDecoration: 'none', color: 'var(--color-accent)', fontSize: 12 }}>
              {isImg
                ? <img src={u} alt={`附件${i + 1}`} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} />
                : <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-muted)', borderRadius: 6, color: 'var(--text-secondary)' }}><FileText size={24} /></div>}
              <span>附件{i + 1} ↓</span>
            </a>
          );
        })}
      </div>
    );
  }
  return <div style={{ fontSize: 13, color: 'var(--text-disabled)' }}>{count ? `附件数已记录（${count}），URL 未持久化` : emptyText}</div>;
}
