"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { FormRenderer } from "@/components/workflow/FormRenderer";
import { workflowApi } from "@/lib/workflow-api";

type FieldType = "text" | "textarea" | "number" | "amount" | "date" | "datetime" | "select" | "radio" | "checkbox" | "reference" | "readonly";
type Field = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  dataSource?: string;
  span?: 1 | 2;
  options?: Array<{ label: string; value: string }>;
};

const defaultFields: Field[] = [
  { key: "amount", label: "申请金额", type: "amount", required: true },
  { key: "reason", label: "申请事由", type: "textarea", required: true, span: 2 },
  { key: "store_code", label: "门店", type: "reference", dataSource: "MST_STORES" },
];

const fieldTypes: FieldType[] = ["text", "textarea", "number", "amount", "date", "datetime", "select", "radio", "checkbox", "reference", "readonly"];

export default function WorkflowFormDesignerPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [fields, setFields] = useState<Field[]>(defaultFields);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<Record<string, unknown>>({});
  const [msg, setMsg] = useState("");
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");

  useEffect(() => {
    workflowApi.formDesigner(id).then(res => {
      setData(res.data);
      const schema = res.data.schema_json as { fields?: Field[] } | undefined;
      if (Array.isArray(schema?.fields)) setFields(schema.fields);
    });
  }, [id]);

  const schema = useMemo(() => ({ fields }), [fields]);
  const current = fields[selected] || fields[0];

  function patchField(index: number, patch: Partial<Field>) {
    setFields(prev => prev.map((field, i) => i === index ? { ...field, ...patch } : field));
  }

  function addField(type: FieldType = "text") {
    const next: Field = {
      key: `field_${fields.length + 1}`,
      label: "新字段",
      type,
      required: false,
      span: type === "textarea" ? 2 : 1,
    };
    setFields(prev => [...prev, next]);
    setSelected(fields.length);
  }

  function removeField(index: number) {
    setFields(prev => prev.filter((_, i) => i !== index));
    setSelected(Math.max(0, index - 1));
  }

  function moveField(index: number, dir: -1 | 1) {
    const next = [...fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
    setSelected(target);
  }

  async function publish() {
    setMsg("");
    await workflowApi.publishForm(id, { schema_json: schema });
    setMsg("发布成功");
  }

  function openJson() {
    setJsonDraft(JSON.stringify(schema, null, 2));
    setJsonOpen(true);
  }

  function applyJson() {
    const parsed = JSON.parse(jsonDraft) as { fields?: Field[] };
    setFields(Array.isArray(parsed.fields) ? parsed.fields : []);
    setSelected(0);
    setJsonOpen(false);
  }

  return (
    <div>
      <PageHeader title="表单设计器" subtitle={String(data?.name || "")} breadcrumb={["工作流", "表单设计器"]} />
      <div style={{ display: "grid", gridTemplateColumns: "260px minmax(420px, 1fr) 340px", gap: 12, alignItems: "start" }}>
        <section style={panelStyle}>
          <div style={toolbarStyle}>
            <strong>控件</strong>
            <button style={smallButtonStyle} onClick={() => addField()}>新增</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
            {fieldTypes.map(type => (
              <button key={type} style={ghostButtonStyle} onClick={() => addField(type)}>{type}</button>
            ))}
          </div>
          <strong style={{ display: "block", marginBottom: 8 }}>字段顺序</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fields.map((field, index) => (
              <button
                key={`${field.key}-${index}`}
                style={{ ...fieldButtonStyle, borderColor: index === selected ? "var(--color-primary)" : "var(--border)" }}
                onClick={() => setSelected(index)}
              >
                <span style={{ fontWeight: 700 }}>{field.label || field.key}</span>
                <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{field.type}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={panelStyle}>
          <div style={toolbarStyle}>
            <strong>运行时预览</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={ghostButtonStyle} onClick={openJson}>JSON</button>
              <button style={buttonStyle} onClick={publish}>发布表单版本</button>
            </div>
          </div>
          {msg ? <div style={successStyle}>{msg}</div> : null}
          <FormRenderer schema={schema} value={preview} onChange={setPreview} />
        </section>

        <section style={panelStyle}>
          <strong style={{ display: "block", marginBottom: 12 }}>字段属性</strong>
          {current ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input style={inputStyle} value={current.key} onChange={e => patchField(selected, { key: e.target.value })} placeholder="字段 key" />
              <input style={inputStyle} value={current.label} onChange={e => patchField(selected, { label: e.target.value })} placeholder="字段名称" />
              <select style={inputStyle} value={current.type} onChange={e => patchField(selected, { type: e.target.value as FieldType })}>
                {fieldTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
              <input style={inputStyle} value={current.placeholder || ""} onChange={e => patchField(selected, { placeholder: e.target.value })} placeholder="占位提示" />
              <input style={inputStyle} value={current.dataSource || ""} onChange={e => patchField(selected, { dataSource: e.target.value })} placeholder="数据源编码，如 MST_STORES" />
              <textarea
                style={{ ...inputStyle, minHeight: 90, paddingTop: 8 }}
                value={(current.options || []).map(opt => `${opt.label}:${opt.value}`).join("\n")}
                onChange={e => patchField(selected, {
                  options: e.target.value.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
                    const [label, value = label] = line.split(":");
                    return { label, value };
                  }),
                })}
                placeholder="选项，每行 label:value"
              />
              <label style={checkStyle}><input type="checkbox" checked={Boolean(current.required)} onChange={e => patchField(selected, { required: e.target.checked })} /> 必填</label>
              <label style={checkStyle}><input type="checkbox" checked={current.span === 2} onChange={e => patchField(selected, { span: e.target.checked ? 2 : 1 })} /> 跨两列</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <button style={ghostButtonStyle} onClick={() => moveField(selected, -1)}>上移</button>
                <button style={ghostButtonStyle} onClick={() => moveField(selected, 1)}>下移</button>
                <button style={dangerButtonStyle} onClick={() => removeField(selected)}>删除</button>
              </div>
            </div>
          ) : <div style={{ color: "var(--text-secondary)" }}>暂无字段</div>}
        </section>
      </div>

      {jsonOpen ? (
        <div style={modalMaskStyle}>
          <div style={modalStyle}>
            <div style={toolbarStyle}>
              <strong>高级 JSON 编辑</strong>
              <button style={ghostButtonStyle} onClick={() => setJsonOpen(false)}>关闭</button>
            </div>
            <textarea value={jsonDraft} onChange={e => setJsonDraft(e.target.value)} style={textareaStyle} spellCheck={false} />
            <button style={buttonStyle} onClick={applyJson}>应用 JSON</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const panelStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16 };
const toolbarStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 };
const inputStyle: React.CSSProperties = { minHeight: 38, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-muted)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13 };
const buttonStyle: React.CSSProperties = { height: 34, padding: "0 14px", border: 0, borderRadius: "var(--radius-md)", background: "var(--color-primary)", color: "#fff", fontWeight: 700, cursor: "pointer" };
const smallButtonStyle: React.CSSProperties = { ...buttonStyle, height: 28, fontSize: 12 };
const ghostButtonStyle: React.CSSProperties = { minHeight: 30, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-primary)", cursor: "pointer" };
const dangerButtonStyle: React.CSSProperties = { ...ghostButtonStyle, color: "var(--status-danger)" };
const fieldButtonStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-muted)", color: "var(--text-primary)", textAlign: "left", cursor: "pointer" };
const successStyle: React.CSSProperties = { marginBottom: 12, color: "var(--status-success)", fontWeight: 700 };
const checkStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13 };
const modalMaskStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const modalStyle: React.CSSProperties = { width: "min(900px, 92vw)", maxHeight: "88vh", overflow: "auto", background: "var(--bg-card)", borderRadius: "var(--radius-md)", padding: 16, border: "1px solid var(--border)" };
const textareaStyle: React.CSSProperties = { width: "100%", minHeight: 440, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-muted)", color: "var(--text-primary)", padding: 12, fontFamily: "monospace", fontSize: 13, marginBottom: 12 };
