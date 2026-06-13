'use client';
import React from 'react';
// G94：输入框样式唯一真相源 —— 统一指向 cockpit-styles.inputField，
//   消灭 FormField 自有的 fieldInputStyle 字面量与 inputField 打架（历史错位根因）。
import { inputField } from '../cockpit-styles';

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

/** @deprecated 名称保留向后兼容；实体即 cockpit-styles.inputField（唯一真相源） */
export const fieldInputStyle: React.CSSProperties = inputField;

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
