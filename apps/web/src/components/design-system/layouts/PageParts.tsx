'use client';
import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * 全局 Layout 基座（Design System V2）。所有后台管理页面后续统一使用。
 * 暗色经 CSS 变量适配。
 */

/** PageBreadcrumb — 面包屑 */
export interface Crumb { label: string; href?: string; }
export function PageBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight size={13} style={{ color: 'var(--text-disabled)' }} />}
          {c.href ? <a href={c.href} style={{ color: 'var(--text-secondary)' }}>{c.label}</a> : <span style={{ color: i === items.length - 1 ? 'var(--text-primary)' : undefined, fontWeight: i === items.length - 1 ? 600 : 400 }}>{c.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}

/** PageHeaderV2 — 页头：面包屑 + 标题 + 说明 + 操作区 */
export interface PageHeaderV2Props {
  title: string;
  subtitle?: string;
  breadcrumb?: Crumb[];
  actions?: React.ReactNode;
}
export function PageHeaderV2({ title, subtitle, breadcrumb, actions }: PageHeaderV2Props) {
  return (
    <div style={{ marginBottom: 16 }}>
      {breadcrumb && breadcrumb.length > 0 && <PageBreadcrumb items={breadcrumb} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </div>
  );
}

/** PageSection — 内容分区（标题 + 内容块） */
export function PageSection({ title, extra, children, noPadding }: { title?: string; extra?: React.ReactNode; children: React.ReactNode; noPadding?: boolean }) {
  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 16, overflow: 'hidden' }}>
      {(title || extra) && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          {title && <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>}
          {extra && <div style={{ marginLeft: 'auto' }}>{extra}</div>}
        </div>
      )}
      <div style={{ padding: noPadding ? 0 : 16 }}>{children}</div>
    </section>
  );
}

/** PageToolbar — 工具栏（筛选/搜索 + 操作，左右分布） */
export function PageToolbar({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{left}</div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>
    </div>
  );
}

/** PageActions — 操作按钮组（右对齐） */
export function PageActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>;
}
