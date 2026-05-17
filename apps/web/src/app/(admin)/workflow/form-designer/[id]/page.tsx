"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { FormRenderer } from "@/components/workflow/FormRenderer";
import { workflowApi } from "@/lib/workflow-api";

const defaultSchema = {
  fields: [
    { key: "amount", label: "申请金额", type: "amount", required: true },
    { key: "reason", label: "申请事由", type: "textarea", required: true },
    { key: "store_code", label: "门店", type: "reference", dataSource: "MST_STORES" }
  ]
};

export default function WorkflowFormDesignerPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [schema, setSchema] = useState(JSON.stringify(defaultSchema, null, 2));
  const [preview, setPreview] = useState<Record<string, unknown>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    workflowApi.formDesigner(id).then(res => {
      setData(res.data);
      if (res.data.schema_json) setSchema(JSON.stringify(res.data.schema_json, null, 2));
    });
  }, [id]);

  async function publish() {
    setMsg("");
    await workflowApi.publishForm(id, { schema_json: JSON.parse(schema) });
    setMsg("发布成功");
  }

  const parsed = (() => {
    try { return JSON.parse(schema); } catch { return { fields: [] }; }
  })();

  return (
    <div>
      <PageHeader title="表单设计器" subtitle={String(data?.name || "")} breadcrumb={["工作流", "表单设计器"]} />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <section style={panelStyle}>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button style={buttonStyle} onClick={publish}>发布表单版本</button>
            {msg ? <span style={{ alignSelf:"center", color:"var(--status-success)" }}>{msg}</span> : null}
          </div>
          <textarea value={schema} onChange={e=>setSchema(e.target.value)} style={textareaStyle} spellCheck={false} />
        </section>
        <section style={panelStyle}>
          <h3 style={{ marginTop:0 }}>运行时预览</h3>
          <FormRenderer schema={parsed} value={preview} onChange={setPreview} />
        </section>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16 };
const buttonStyle: React.CSSProperties = { height:38, padding:"0 16px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700 };
const textareaStyle: React.CSSProperties = { width:"100%", minHeight:520, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", color:"var(--text-primary)", padding:12, fontFamily:"monospace", fontSize:13 };
