'use client';
import React from 'react';
import { fieldInputStyle } from './FormField';
import { STATUS_LABEL } from '@/lib/design-tokens';

/** 通用选项类型 */
export interface Option { value: string; label: string; }

/**
 * SelectField — 统一下拉选择基座。CompanySelector/ProjectSelector/StatusSelector 均基于它。
 */
export interface SelectFieldProps {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export function SelectField({ value, onChange, options, placeholder = '请选择', disabled, allowEmpty = true, emptyLabel }: SelectFieldProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...fieldInputStyle, opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {allowEmpty && <option value="">{emptyLabel ?? placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** CompanySelector — 公司下拉（options 由页面传入，避免耦合 API）。 */
export function CompanySelector(props: Omit<SelectFieldProps, 'placeholder'>) {
  return <SelectField placeholder="选择公司" {...props} />;
}

/** ProjectSelector — 项目下拉（options 由页面传入）。 */
export function ProjectSelector(props: Omit<SelectFieldProps, 'placeholder'>) {
  return <SelectField placeholder="选择项目" {...props} />;
}

/** StatusSelector — 状态下拉（传状态码数组，自动取中文标签）。 */
export function StatusSelector({ statuses, value, onChange, disabled, allowEmpty = true }: {
  statuses: string[]; value: string; onChange: (v: string) => void; disabled?: boolean; allowEmpty?: boolean;
}) {
  const options: Option[] = statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] || s }));
  return <SelectField value={value} onChange={onChange} options={options} placeholder="全部状态" disabled={disabled} allowEmpty={allowEmpty} emptyLabel="全部状态" />;
}
