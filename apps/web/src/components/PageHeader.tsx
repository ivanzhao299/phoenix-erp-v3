import React from 'react';

/**
 * PageHeader — Server Component
 * 纯展示，标题 + 面包屑 + 右侧操作区
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
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)',
    }}>
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {breadcrumb.map((crumb, i) => (
              <span key={i}>
                {i > 0 && <span style={{ margin: '0 6px', opacity: 0.5 }}>/</span>}
                <span>{crumb}</span>
              </span>
            ))}
          </nav>
        )}
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1.3 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, marginLeft: 16 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
