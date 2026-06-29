'use client';
import React from 'react';
import { useLanguage } from "@/contexts/LanguageContext";
import { fieldInputStyle, FormField } from './FormField';
import { SelectField, type Option } from './SelectField';
import { AttachmentUploader } from './AttachmentUploader';

/**
 * 全局表单原子（Design System V2）。统一边框/聚焦/只读/禁用/暗色。
 */

/** TextInput — 文本输入 */
export interface TextInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'email' | 'tel' | 'password';
  disabled?: boolean;
  readOnly?: boolean;
}
export function TextInput({ value, onChange, placeholder, type = 'text', disabled, readOnly }: TextInputProps) {
  return (
    <input
      type={type} value={value} placeholder={placeholder} disabled={disabled} readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...fieldInputStyle, opacity: disabled ? 0.6 : 1, background: readOnly ? 'var(--bg-muted)' : 'var(--bg-card)' }}
    />
  );
}

/** TextAreaInput — 多行文本（G94 补齐缺失原子；消灭各页自写 <textarea style> 漂移） */
export interface TextAreaInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  readOnly?: boolean;
}
export function TextAreaInput({ value, onChange, placeholder, rows = 3, disabled, readOnly }: TextAreaInputProps) {
  return (
    <textarea
      value={value} placeholder={placeholder} rows={rows} disabled={disabled} readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...fieldInputStyle, resize: 'vertical', minHeight: 64, lineHeight: 1.5, fontFamily: 'inherit',
        opacity: disabled ? 0.6 : 1, background: readOnly ? 'var(--bg-muted)' : 'var(--bg-card)' }}
    />
  );
}

/** SelectInput — 下拉（SelectField 的别名导出，统一命名） */
export const SelectInput = SelectField;

/** DateInput — 单个日期 */
export function DateInput({ value, onChange, disabled, min, max }: { value: string; onChange: (v: string) => void; disabled?: boolean; min?: string; max?: string }) {
  return (
    <input type="date" value={value} disabled={disabled} min={min} max={max}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...fieldInputStyle, opacity: disabled ? 0.6 : 1 }} />
  );
}

/** UserSelector — 用户下拉（options 由页面传入，避免耦合 API） */
export function UserSelector({ value, onChange, options, disabled, allowEmpty = true }: {
  value: string; onChange: (v: string) => void; options: Option[]; disabled?: boolean; allowEmpty?: boolean;
}) {
  const { t } = useLanguage();
  return <SelectField value={value} onChange={onChange} options={options} placeholder={t('ui.选择用户','选择用户')} disabled={disabled} allowEmpty={allowEmpty} emptyLabel={t('ui.选择用户','选择用户')} />;
}

/** AttachmentField — FormField + AttachmentUploader 组合 */
export function AttachmentField({ label = '附件', required, hint, value, onChange, readOnly }: {
  label?: string; required?: boolean; hint?: string; value: string[]; onChange: (urls: string[]) => void; readOnly?: boolean;
}) {
  return (
    <FormField label={label} required={required} hint={hint}>
      <AttachmentUploader value={value} onChange={onChange} readOnly={readOnly} />
    </FormField>
  );
}
