"use client";
import { useState, useEffect, useCallback, useRef, memo } from "react";
import styles from "./crudForm.module.css";

export type FieldType = "text" | "number" | "select" | "date" | "datetime" | "textarea" | "readonly";

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string | number }[];
  span?: 1 | 2;
  defaultValue?: string | number;
}

interface CrudFormProps {
  fields: FormField[];
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
}

function buildInitValues(
  fields: FormField[],
  initialValues: Record<string, unknown>
): Record<string, unknown> {
  const init: Record<string, unknown> = {};
  fields.forEach(f => {
    init[f.key] = initialValues[f.key] ?? f.defaultValue ?? "";
  });
  return init;
}

// ✅ React.memo 防止父组件重渲染时 CrudForm 无意义重渲染
export const CrudForm = memo(function CrudForm({
  fields,
  initialValues = {},
  onSubmit,
  onCancel,
  loading,
  submitLabel = "保存",
}: CrudFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(
    () => buildInitValues(fields, initialValues)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // ✅ 用 ref 存储上一次的 initialValues id，避免引用相等比较失败
  // 只有当 initialValues 中的 id 字段变化时（真正的编辑/新建切换），才重置表单
  const prevIdRef = useRef<unknown>(undefined);
  useEffect(() => {
    const currentId = initialValues?.id;
    if (currentId !== prevIdRef.current) {
      prevIdRef.current = currentId;
      setValues(buildInitValues(fields, initialValues));
      setErrors({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues?.id]); // ← 只在 id 真正变化时触发，不监听整个对象

  const set = useCallback((key: string, val: unknown) => {
    setValues(prev => ({ ...prev, [key]: val }));
    setErrors(prev => prev[key] ? { ...prev, [key]: "" } : prev);
  }, []);

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    fields.forEach(f => {
      if (f.required && !values[f.key] && values[f.key] !== 0) {
        errs[f.key] = `${f.label}不能为空`;
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [fields, values]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      // ✅ 提交时才做 number 类型转换，避免输入过程中转换破坏中间状态（如小数点）
      const submitValues: Record<string, unknown> = {};
      fields.forEach(f => {
        const val = values[f.key];
        if (f.type === "number" && val !== "" && val !== null && val !== undefined) {
          const n = Number(val);
          submitValues[f.key] = isNaN(n) ? val : n;
        } else {
          submitValues[f.key] = val;
        }
      });
      await onSubmit(submitValues);
    }
    finally { setSubmitting(false); }
  }, [validate, onSubmit, values, fields]);

  const isLoading = loading || submitting;

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.grid}>
        {fields.map(field => (
          <div
            key={field.key}
            className={`${styles.fieldGroup} ${field.span === 2 ? styles.fullSpan : ""}`}
          >
            <label className={styles.label}>
              {field.label}
              {field.required && <span className={styles.required}>*</span>}
            </label>

            {field.type === "textarea" ? (
              <textarea
                className={`${styles.input} ${styles.textarea} ${errors[field.key] ? styles.hasError : ""}`}
                value={String(values[field.key] ?? "")}
                onChange={e => set(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
              />
            ) : field.type === "select" ? (
              <select
                className={`${styles.input} ${errors[field.key] ? styles.hasError : ""}`}
                value={String(values[field.key] ?? "")}
                onChange={e => set(field.key, e.target.value)}
              >
                <option value="">— 请选择 —</option>
                {field.options?.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : field.type === "readonly" ? (
              <div className={styles.readonlyValue}>
                {String(values[field.key] ?? "—")}
              </div>
            ) : (
              <input
                className={`${styles.input} ${errors[field.key] ? styles.hasError : ""}`}
                type={field.type === "datetime" ? "datetime-local" : field.type}
                value={String(values[field.key] ?? "")}
                onChange={e => set(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}

            {errors[field.key] && (
              <span className={styles.errorMsg}>{errors[field.key]}</span>
            )}
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.btnCancel} onClick={onCancel} disabled={isLoading}>
          取消
        </button>
        <button type="submit" className={styles.btnSubmit} disabled={isLoading}>
          {isLoading ? "保存中..." : submitLabel}
        </button>
      </div>
    </form>
  );
});
