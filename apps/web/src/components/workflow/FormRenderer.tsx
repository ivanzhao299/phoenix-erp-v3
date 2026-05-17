"use client";

import { useEffect, useMemo, useState } from "react";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi } from "@/lib/workflow-api";

type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  dataSource?: string;
  span?: 1 | 2;
  options?: Array<{ label: string; value: string | number }>;
};

export function FormRenderer({
  schema,
  value,
  onChange,
  readonly = false,
}: {
  schema: { fields?: Field[] };
  value: Record<string, unknown>;
  onChange?: (next: Record<string, unknown>) => void;
  readonly?: boolean;
}) {
  const fields = useMemo(() => schema?.fields || [], [schema]);
  const [sourceOptions, setSourceOptions] = useState<Record<string, Array<{ label: string; value: string | number }>>>({});

  useEffect(() => {
    fields.forEach(field => {
      if (field.type !== "reference" || !field.dataSource || sourceOptions[field.dataSource]) return;
      workflowApi.previewDataSource({ code: field.dataSource })
        .then(res => {
          setSourceOptions(prev => ({
            ...prev,
            [field.dataSource!]: (res.data || []) as Array<{ label: string; value: string | number }>,
          }));
        })
        .catch(() => {});
    });
  }, [fields, sourceOptions]);

  const set = (key: string, next: unknown) => onChange?.({ ...value, [key]: next });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
      {fields.map(field => {
        const common = {
          disabled: readonly,
          value: String(value[field.key] ?? ""),
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(field.key, e.target.value),
          className: field.type === "textarea" ? s.textarea : s.inp,
        };
        const options = field.options || (field.dataSource ? sourceOptions[field.dataSource] : []) || [];
        return (
          <label key={field.key} className={s.field} style={{ gridColumn: field.type === "textarea" || field.span === 2 ? "1 / -1" : undefined, marginBottom: 0 }}>
            <span className={`${s.lbl} ${field.required ? s.required : ""}`}>{field.label}</span>
            {field.type === "textarea" ? (
              <textarea {...common} rows={4} placeholder={field.placeholder} />
            ) : field.type === "checkbox" ? (
              <span className={s.inp} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  disabled={readonly}
                  checked={Boolean(value[field.key])}
                  onChange={e => set(field.key, e.target.checked)}
                />
                是
              </span>
            ) : field.type === "select" || field.type === "radio" || field.type === "reference" ? (
              <select {...common}>
                <option value="">请选择</option>
                {options.map(opt => <option key={String(opt.value)} value={opt.value}>{opt.label}</option>)}
              </select>
            ) : field.type === "readonly" ? (
              <div className={s.inp} style={{ display: "flex", alignItems: "center", color: "var(--text-secondary)" }}>{String(value[field.key] ?? "-")}</div>
            ) : (
              <input
                {...common}
                type={field.type === "amount" || field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : field.type}
                placeholder={field.placeholder}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
