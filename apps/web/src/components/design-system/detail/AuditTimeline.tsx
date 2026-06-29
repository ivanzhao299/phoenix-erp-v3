'use client';
import React from 'react';
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * AuditTimeline — 统一审计/状态时间轴（详情页用）。
 * 取代各页手写 timeline（股东资本流/审批详情等）。暗色经 CSS 变量适配。
 */
export interface TimelineItem {
  title: string;
  time?: string | null;
  desc?: string;
  /** 节点色：传 CSS 变量或 design-tokens 色值；缺省主色 */
  color?: string;
  done?: boolean;
}
export interface AuditTimelineProps {
  items: TimelineItem[];
  title?: string;
}

export function AuditTimeline({ items, title = '操作时间轴' }: AuditTimelineProps) {
  const { t } = useLanguage();
  return (
    <div>
      {title && <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: 14, fontSize: 14 }}>{title}</div>}
      <div style={{ position: 'relative', paddingLeft: 20 }}>
        {items.map((t, i) => {
          const c = t.color || 'var(--color-primary)';
          return (
            <div key={i} style={{ position: 'relative', paddingBottom: i === items.length - 1 ? 0 : 18 }}>
              {i !== items.length - 1 && <div style={{ position: 'absolute', left: -13, top: 14, bottom: 0, width: 2, background: 'var(--border)' }} />}
              <div style={{ position: 'absolute', left: -18, top: 2, width: 12, height: 12, borderRadius: '50%', background: c, border: '2px solid var(--bg-card)', boxShadow: `0 0 0 1px ${c}` }} />
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</div>
              {t.time && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{t.time}</div>}
              {t.desc && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{t.desc}</div>}
            </div>
          );
        })}
        {items.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-disabled)' }}>{t('ui.暂无记录','暂无记录')}</div>}
      </div>
    </div>
  );
}
