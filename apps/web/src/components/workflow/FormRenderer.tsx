"use client";

import { useEffect, useMemo, useState } from "react";
import { workflowApi } from "@/lib/workflow-api";

type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  dataSource?: string;
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
          style: inputStyle,
        };
        const options = field.options || (field.dataSource ? sourceOptions[field.dataSource] : []) || [];
        return (
          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: field.type === "textarea" ? "1 / -1" : undefined }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              {field.label}{field.required ? " *" : ""}
            </span>
            {field.type === "textarea" ? (
              <textarea {...common} rows={4} placeholder={field.placeholder} />
            ) : field.type === "select" || field.type === "radio" || field.type === "reference" ? (
              <select {...common}>
                <option value="">请选择</option>
                {options.map(opt => <option key={String(opt.value)} value={opt.value}>{opt.label}</option>)}
              </select>
            ) : field.type === "readonly" ? (
              <div style={{ ...inputStyle, display: "flex", alignItems: "center", color: "var(--text-secondary)" }}>{String(value[field.key] ?? "-")}</div>
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

const inputStyle: React.CSSProperties = {
  minHeight: 38,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-muted)",
  color: "var(--text-primary)",
  padding: "8px 10px",
  fontSize: 13,
};
