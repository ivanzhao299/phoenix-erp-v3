'use client';
import React from 'react';

/**
 * FormField — 统一表单字段容器：标签 / 必填星 / 说明 / 错误提示 / 只读·禁用态。
 * 输入控件作为 children 传入；统一标签样式与错误展示，消灭各页自写 label/error。
 */
export interface FormFieldProps {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export const fieldInputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)',
  fontSize: 13.5, outline: 'none',
};

export function FormField({ label, required, hint, error, children, className = '' }: FormFieldProps) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {label}{required && <span style={{ color: 'var(--status-danger)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {hint && !error && <span style={{ fontSize: 11.5, color: 'var(--text-disabled)' }}>{hint}</span>}
      {error && <span style={{ fontSize: 11.5, color: 'var(--status-danger)' }}>{error}</span>}
    </div>
  );
}
