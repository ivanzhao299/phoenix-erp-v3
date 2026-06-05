'use client';
import React from 'react';

// ── JSON Schema 类型 ───────────────────────────────────────────────────────────

export interface SchemaProperty {
  type?:      string;       // string | number | integer | boolean | date
  title?:     string;
  maxLength?: number;
  minimum?:   number;
  maximum?:   number;
  enum?:      string[];
  format?:    string;       // date | datetime
  default?:   unknown;
}

export interface FormSchema {
  type:       string;
  required?:  string[];
  properties: Record<string, SchemaProperty>;
}

// ── UI Schema 类型 ─────────────────────────────────────────────────────────────

export interface UiFieldConfig {
  widget?:      string;   // input | textarea | number | date | select | checkbox
  placeholder?: string;
  rows?:        number;
  prefix?:      string;
  suffix?:      string;
  options?:     { value: string; label: string }[];
}

export type UiSchema = Record<string, UiFieldConfig>;

// ── Props ──────────────────────────────────────────────────────────────────────

export interface WorkflowFormRendererProps {
  schema:     FormSchema;
  uiSchema?:  UiSchema;
  value:      Record<string, unknown>;
  onChange:   (key: string, val: unknown) => void;
  errors?:    Record<string, string>;
  disabled?:  boolean;
  className?: string;
}

// ── 样式常量 ───────────────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1.5px solid #e2e8f0',
  fontSize: 14,
  color: 'var(--slate-900)',
  background: 'var(--bg-card)',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

const inputError: React.CSSProperties = {
  ...inputBase,
  borderColor: 'var(--status-danger)',
  background: '#fff5f5',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--gray-700)',
  marginBottom: 6,
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--status-danger)',
  marginTop: 4,
};

const requiredMark = (
  <span style={{ color: 'var(--status-danger)', marginLeft: 2 }}>*</span>
);

// ── 字段渲染逻辑 ───────────────────────────────────────────────────────────────

function resolveWidget(key: string, propSchema: SchemaProperty, ui?: UiFieldConfig): string {
  if (ui?.widget) return ui.widget;
  const type = propSchema.type ?? 'string';
  if (type === 'boolean') return 'checkbox';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'string' && (propSchema.format === 'date')) return 'date';
  if (type === 'string' && propSchema.format === 'datetime') return 'datetime';
  if (Array.isArray(propSchema.enum) && propSchema.enum.length > 0) return 'select';
  return 'input';
}

// ── 主组件 ─────────────────────────────────────────────────────────────────────

export function WorkflowFormRenderer({
  schema,
  uiSchema = {},
  value,
  onChange,
  errors = {},
  disabled = false,
  className,
}: WorkflowFormRendererProps) {
  if (!schema?.properties) {
    return (
      <div style={{ color: 'var(--slate-400)', fontSize: 14, padding: 16 }}>
        表单结构未定义（schema.properties 为空）
      </div>
    );
  }

  const required = new Set<string>(Array.isArray(schema.required) ? schema.required : []);
  const fieldKeys = Object.keys(schema.properties);

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {fieldKeys.map(key => {
        const propSchema = schema.properties[key];
        const ui         = uiSchema[key];
        const widget     = resolveWidget(key, propSchema, ui);
        const isRequired = required.has(key);
        const hasError   = !!errors[key];
        const fieldValue = value[key];
        const title      = propSchema.title ?? key;

        const baseStyle  = hasError ? inputError : inputBase;
        const disabledStyle: React.CSSProperties = disabled
          ? { background: 'var(--slate-50)', cursor: 'not-allowed', color: 'var(--slate-400)' }
          : {};

        return (
          <div key={key}>
            {/* 标签 */}
            <label style={labelStyle}>
              {title}{isRequired && requiredMark}
            </label>

            {/* ── input ── */}
            {(widget === 'input') && (
              <div style={{ position: 'relative' }}>
                {ui?.prefix && (
                  <span style={{
                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 13, color: 'var(--slate-500)', pointerEvents: 'none',
                  }}>{ui.prefix}</span>
                )}
                <input
                  type="text"
                  value={String(fieldValue ?? '')}
                  onChange={e => onChange(key, e.target.value)}
                  placeholder={ui?.placeholder ?? `请输入${title}`}
                  maxLength={propSchema.maxLength}
                  disabled={disabled}
                  style={{
                    ...baseStyle,
                    ...disabledStyle,
                    paddingLeft: ui?.prefix ? 30 : 12,
                  }}
                />
              </div>
            )}

            {/* ── textarea ── */}
            {widget === 'textarea' && (
              <textarea
                value={String(fieldValue ?? '')}
                onChange={e => onChange(key, e.target.value)}
                placeholder={ui?.placeholder ?? `请输入${title}`}
                rows={ui?.rows ?? 3}
                maxLength={propSchema.maxLength}
                disabled={disabled}
                style={{ ...baseStyle, ...disabledStyle, resize: 'vertical', minHeight: 80 }}
              />
            )}

            {/* ── number ── */}
            {widget === 'number' && (
              <div style={{ position: 'relative' }}>
                {ui?.prefix && (
                  <span style={{
                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 13, color: 'var(--slate-500)', pointerEvents: 'none',
                  }}>{ui.prefix}</span>
                )}
                <input
                  type="number"
                  value={fieldValue !== undefined && fieldValue !== null ? String(fieldValue) : ''}
                  onChange={e => onChange(key, e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={ui?.placeholder ?? `请输入${title}`}
                  min={propSchema.minimum}
                  max={propSchema.maximum}
                  disabled={disabled}
                  style={{
                    ...baseStyle,
                    ...disabledStyle,
                    paddingLeft: ui?.prefix ? 30 : 12,
                  }}
                />
                {ui?.suffix && (
                  <span style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 13, color: 'var(--slate-500)', pointerEvents: 'none',
                  }}>{ui.suffix}</span>
                )}
              </div>
            )}

            {/* ── date / datetime ── */}
            {(widget === 'date' || widget === 'datetime') && (
              <input
                type={widget === 'datetime' ? 'datetime-local' : 'date'}
                value={String(fieldValue ?? '')}
                onChange={e => onChange(key, e.target.value)}
                disabled={disabled}
                style={{ ...baseStyle, ...disabledStyle }}
              />
            )}

            {/* ── select ── */}
            {widget === 'select' && (
              <select
                value={String(fieldValue ?? '')}
                onChange={e => onChange(key, e.target.value)}
                disabled={disabled}
                style={{ ...baseStyle, ...disabledStyle, cursor: disabled ? 'not-allowed' : 'pointer' }}
              >
                <option value="">— 请选择 —</option>
                {/* 优先使用 uiSchema options，否则使用 schema.enum */}
                {(ui?.options
                  ? ui.options
                  : (propSchema.enum ?? []).map(v => ({ value: v, label: v }))
                ).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}

            {/* ── checkbox ── */}
            {widget === 'checkbox' && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: disabled ? 'var(--slate-400)' : 'var(--slate-900)',
                fontSize: 14,
              }}>
                <input
                  type="checkbox"
                  checked={Boolean(fieldValue)}
                  onChange={e => onChange(key, e.target.checked)}
                  disabled={disabled}
                  style={{ width: 16, height: 16, cursor: 'inherit' }}
                />
                {title}
              </label>
            )}

            {/* 错误提示 */}
            {hasError && (
              <div style={errorStyle}>{errors[key]}</div>
            )}

            {/* maxLength 提示 */}
            {!hasError && propSchema.maxLength && (widget === 'input' || widget === 'textarea') && (
              <div style={{ fontSize: 11, color: 'var(--slate-400)', marginTop: 3, textAlign: 'right' }}>
                {String(fieldValue ?? '').length} / {propSchema.maxLength}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 默认导出 ───────────────────────────────────────────────────────────────────

export default WorkflowFormRenderer;
