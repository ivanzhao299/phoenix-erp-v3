import React from 'react';

/**
 * PageHeader — UIX-PROD-2 紧凑化
 * 标题与 subtitle 同行（中点分隔），breadcrumb 上方一行，去掉 border，留白 24→14。
 */
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: string[];
  /** 右侧操作区（Client Component 中传入） */
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16,
      marginBottom: 14, paddingBottom: 8,
    }}>
      <div style={{ minWidth: 0 }}>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>
            {breadcrumb.map((crumb, i) => (
              <span key={i}>
                {i > 0 && <span style={{ margin: '0 6px', opacity: 0.5 }}>/</span>}
                <span>{crumb}</span>
              </span>
            ))}
          </nav>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1.2, margin: 0 }}>
            {title}
          </h1>
          {subtitle && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              <span style={{ marginRight: 6, opacity: 0.5 }}>·</span>{subtitle}
            </span>
          )}
        </div>
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
