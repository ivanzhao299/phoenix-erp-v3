"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { FormRenderer } from "@/components/workflow/FormRenderer";
import { workflowApi } from "@/lib/workflow-api";
import { WORKFLOW_DATA_CATALOG, dataSourceLabel } from "@/lib/workflow-data-catalog";

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

const quickFieldTypes: FieldType[] = ["text", "textarea", "amount", "date", "datetime", "select", "reference", "readonly"];
const fieldTypeLabels: Record<FieldType, string> = {
  text: "文本",
  textarea: "多行文本",
  number: "数字",
  amount: "金额",
  date: "日期",
  datetime: "日期时间",
  select: "下拉选项",
  radio: "单选",
  checkbox: "勾选",
  reference: "数据库引用",
  readonly: "只读展示",
};

export default function WorkflowFormDesignerPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [fields, setFields] = useState<Field[]>(defaultFields);
  const [dataSources, setDataSources] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<Record<string, unknown>>({});
  const [msg, setMsg] = useState("");
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");

  useEffect(() => {
    Promise.all([workflowApi.formDesigner(id), workflowApi.dataSources()]).then(([res, sourceRes]) => {
      setData(res.data);
      const schema = res.data.schema_json as { fields?: Field[] } | undefined;
      if (Array.isArray(schema?.fields)) setFields(schema.fields);
      setDataSources(sourceRes.data || []);
    }).catch(() => {});
  }, [id]);

  const schema = useMemo(() => ({ fields }), [fields]);
  const current = fields[selected] || fields[0];

  function patchField(index: number, patch: Partial<Field>) {
    setFields(prev => prev.map((field, i) => i === index ? { ...field, ...patch } : field));
  }

  function addField(type: FieldType = "text") {
    const referenceSource = dataSources[0] ? String(dataSources[0].code) : "MST_STORES";
    const next: Field = {
      key: `field_${fields.length + 1}`,
      label: type === "reference" ? "业务数据" : "新字段",
      type,
      required: false,
      span: type === "textarea" ? 2 : 1,
      dataSource: type === "reference" ? referenceSource : undefined,
    };
    setFields(prev => [...prev, next]);
    setSelected(fields.length);
  }

  function addReferenceField(sourceCode: string) {
    const source = dataSources.find(item => String(item.code) === sourceCode);
    const catalog = WORKFLOW_DATA_CATALOG.find(item => item.code === sourceCode);
    const label = String(source?.name || catalog?.objectName || "业务数据");
    const next: Field = {
      key: uniqueFieldKey(catalog?.valueField || sourceCode.toLowerCase(), fields),
      label,
      type: "reference",
      required: false,
      dataSource: sourceCode,
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
      <div className={s.infoBanner}>表单画布所见即所得：左侧添加控件，中间点击字段，右侧调整属性；数据库字段可直接从数据源生成。</div>
      <div style={layoutStyle}>
        <section className={s.card} style={panelStyle}>
          <div style={toolbarStyle}>
            <div>
              <strong className={s.cardTitle}>控件库</strong>
              <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>选择控件后会添加到表单画布。</p>
            </div>
          </div>
          <div style={controlGridStyle}>
            {quickFieldTypes.map(type => (
              <button type="button" key={type} className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => addField(type)}>{fieldTypeLabels[type]}</button>
            ))}
          </div>

          <div className={s.formSection}>数据库字段</div>
          <div style={sourceListStyle}>
            {dataSources.map(source => (
              <button
                key={String(source.code)}
                type="button"
                style={sourceButtonStyle}
                onClick={() => addReferenceField(String(source.code))}
              >
                <strong>{String(source.name)}</strong>
                <span>{String(source.code)}</span>
              </button>
            ))}
            {dataSources.length === 0 ? <div className={s.emptyState}><div className={s.emptyStateText}>暂无数据源。</div></div> : null}
          </div>
        </section>

        <section className={s.card} style={panelStyle}>
          <div style={toolbarStyle}>
            <div>
              <strong className={s.cardTitle}>表单画布</strong>
              <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>业务人员发起流程时会按这个顺序填写。</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={s.btnSecondary} onClick={openJson}>高级 JSON</button>
              <button type="button" className={s.btnPrimary} onClick={publish}>发布表单</button>
            </div>
          </div>
          {msg ? <div className={s.successBanner}>{msg}</div> : null}
          <div style={canvasStyle}>
            {fields.map((field, index) => (
              <button
                key={`${field.key}-${index}`}
                type="button"
                style={{
                  ...fieldCardStyle,
                  gridColumn: field.span === 2 || field.type === "textarea" ? "1 / -1" : undefined,
                  borderColor: index === selected ? "var(--color-primary)" : "var(--border)",
                }}
                onClick={() => setSelected(index)}
              >
                <span className={`${s.badge} ${field.type === "reference" ? s.badgePurple : s.badgeNeutral}`}>{fieldTypeLabels[field.type]}</span>
                <strong>{field.label || field.key}{field.required ? " *" : ""}</strong>
                <span>{field.type === "reference" ? dataSourceLabel(field.dataSource) : field.placeholder || "点击右侧调整字段属性"}</span>
              </button>
            ))}
            {fields.length === 0 ? (
              <div className={s.emptyState}>
                <div className={s.emptyStateText}>还没有字段，从左侧控件库添加。</div>
              </div>
            ) : null}
          </div>

          <div style={runtimePreviewStyle}>
            <strong className={s.cardTitle}>填写预览</strong>
            <p className={s.modalDesc} style={{ margin: "4px 0 12px" }}>这里可以直接试填，确认控件是否符合业务人员使用习惯。</p>
            <FormRenderer schema={schema} value={preview} onChange={setPreview} />
          </div>
        </section>

        <section className={s.card} style={panelStyle}>
          <strong className={s.cardTitle} style={{ display: "block", marginBottom: 12 }}>字段属性</strong>
          {current ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={selectedFieldStyle}>
                <span className={s.badge}>正在编辑</span>
                <strong>{current.label || current.key}</strong>
                <span>{fieldTypeLabels[current.type]}</span>
              </div>
              <label className={s.field} style={{ marginBottom: 0 }}>
                <span className={s.lbl}>页面显示名称</span>
                <input className={s.inp} value={current.label} onChange={e => patchField(selected, { label: e.target.value })} placeholder="例如：申请金额" />
              </label>
              <label className={s.field} style={{ marginBottom: 0 }}>
                <span className={s.lbl}>系统字段名</span>
                <input className={s.inp} value={current.key} onChange={e => patchField(selected, { key: e.target.value })} placeholder="例如：amount" />
                <span style={hintStyle}>用于系统保存数据，建议使用英文、数字和下划线。</span>
              </label>
              <label className={s.field} style={{ marginBottom: 0 }}>
                <span className={s.lbl}>控件类型</span>
                <select className={s.inp} value={current.type} onChange={e => patchField(selected, { type: e.target.value as FieldType })}>
                  {Object.keys(fieldTypeLabels).map(type => <option key={type} value={type}>{fieldTypeLabels[type as FieldType]}</option>)}
                </select>
              </label>
              <label className={s.field} style={{ marginBottom: 0 }}>
                <span className={s.lbl}>填写提示</span>
                <input className={s.inp} value={current.placeholder || ""} onChange={e => patchField(selected, { placeholder: e.target.value })} placeholder="例如：请选择费用所属门店" />
              </label>
              {current.type === "reference" ? (
                <label className={s.field} style={{ marginBottom: 0 }}>
                  <span className={s.lbl}>数据库引用</span>
                  <select className={s.inp} value={current.dataSource || ""} onChange={e => patchField(selected, { dataSource: e.target.value })}>
                    <option value="">请选择数据源</option>
                    {dataSources.map(source => (
                      <option key={String(source.code)} value={String(source.code)}>
                        {String(source.name)} · {String(source.code)}
                      </option>
                    ))}
                  </select>
                  <span style={hintStyle}>没有目标数据源时，先到数据源页面从业务对象创建。</span>
                </label>
              ) : current.type === "select" || current.type === "radio" ? (
                <textarea
                  className={s.textarea}
                  style={{ minHeight: 90 }}
                  value={(current.options || []).map(opt => `${opt.label}:${opt.value}`).join("\n")}
                  onChange={e => patchField(selected, {
                    options: e.target.value.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
                      const [label, value = label] = line.split(":");
                      return { label, value };
                    }),
                  })}
                  placeholder="选项，每行 label:value"
                />
              ) : null}
              <label style={checkStyle}><input type="checkbox" checked={Boolean(current.required)} onChange={e => patchField(selected, { required: e.target.checked })} /> 必填</label>
              <label style={checkStyle}><input type="checkbox" checked={current.span === 2} onChange={e => patchField(selected, { span: e.target.checked ? 2 : 1 })} /> 跨两列</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => moveField(selected, -1)}>上移</button>
                <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => moveField(selected, 1)}>下移</button>
                <button type="button" className={`${s.btnDanger} ${s.btnSm}`} onClick={() => removeField(selected)}>删除</button>
              </div>
            </div>
          ) : <div style={{ color: "var(--text-secondary)" }}>暂无字段</div>}
        </section>
      </div>

      {jsonOpen ? (
        <div style={modalMaskStyle}>
          <div className={s.card} style={modalStyle}>
            <div style={toolbarStyle}>
              <strong className={s.cardTitle}>高级 JSON 编辑</strong>
              <button type="button" className={s.btnSecondary} onClick={() => setJsonOpen(false)}>关闭</button>
            </div>
            <textarea value={jsonDraft} onChange={e => setJsonDraft(e.target.value)} className={s.textarea} style={textareaStyle} spellCheck={false} />
            <button type="button" className={s.btnPrimary} onClick={applyJson}>应用 JSON</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function uniqueFieldKey(base: string, fields: Field[]) {
  const normalized = base.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^([^a-z_])/, "field_$1") || "field";
  const used = new Set(fields.map(field => field.key));
  if (!used.has(normalized)) return normalized;
  let index = 2;
  while (used.has(`${normalized}_${index}`)) index += 1;
  return `${normalized}_${index}`;
}

const layoutStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "280px minmax(460px, 1fr) 340px", gap: 12, alignItems: "start" };
const panelStyle: React.CSSProperties = { padding: 16 };
const toolbarStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 };
const controlGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 };
const sourceListStyle: React.CSSProperties = { display: "grid", gap: 8 };
const sourceButtonStyle: React.CSSProperties = { display: "grid", gap: 4, textAlign: "left", padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" };
const canvasStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, padding: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", marginBottom: 14 };
const fieldCardStyle: React.CSSProperties = { display: "grid", gap: 6, minHeight: 86, textAlign: "left", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", color: "var(--text-primary)", padding: 12, cursor: "pointer" };
const selectedFieldStyle: React.CSSProperties = { display: "grid", gap: 4, padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", color: "var(--text-primary)" };
const runtimePreviewStyle: React.CSSProperties = { padding: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)" };
const checkStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13 };
const hintStyle: React.CSSProperties = { color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 };
const modalMaskStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const modalStyle: React.CSSProperties = { width: "min(900px, 92vw)", maxHeight: "88vh", overflow: "auto", padding: 16 };
const textareaStyle: React.CSSProperties = { minHeight: 440, fontFamily: "monospace", marginBottom: 12 };
