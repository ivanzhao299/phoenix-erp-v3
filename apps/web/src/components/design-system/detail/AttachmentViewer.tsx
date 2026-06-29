'use client';
import React from 'react';
import { FileText } from 'lucide-react';
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * AttachmentViewer — 统一附件查看（只读）。详情页用。
 * 只展示受控引用状态，不渲染裸 URL。
 */
export interface AttachmentViewerProps {
  urls?: string[] | null;
  count?: number;
  emptyText?: string;
}

export function AttachmentViewer({ urls, count, emptyText }: AttachmentViewerProps) {
  const { t } = useLanguage();
  const emptyTextResolved = emptyText ?? t('ui.无附件', '无附件');
  if (urls && urls.length > 0) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {urls.map((u, i) => {
          const ref = String(u ?? '').trim();
          const isProtectedRef = /^FILE-[A-Z0-9_-]+/i.test(ref);
          const isRawUrl = /^https?:\/\//i.test(ref) || /^\/?uploads\//i.test(ref);
          const displayRef = isRawUrl
            ? t('ui.已按安全策略脱敏', '已按安全策略脱敏')
            : ref || 'empty';
          const label = isProtectedRef
            ? t('ui.受控附件引用', '受控附件引用')
            : isRawUrl
              ? t('ui.历史裸链接已禁用', '历史裸链接已禁用')
              : t('ui.附件引用', '附件引用');
          return (
            <div key={i}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: isRawUrl ? 'var(--status-danger)' : 'var(--text-secondary)', fontSize: 12 }}>
              <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-muted)', borderRadius: 6, color: 'var(--text-secondary)' }}><FileText size={24} /></div>
              <span>{label} {i + 1}</span>
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayRef}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return <div style={{ fontSize: 13, color: 'var(--text-disabled)' }}>{count ? `${t('ui.附件数已记录（', '附件数已记录（')}${count}${t('ui.），URL 未持久化', '），URL 未持久化')}` : emptyTextResolved}</div>;
}
