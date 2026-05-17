"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { FormRenderer } from "@/components/workflow/FormRenderer";
import { workflowApi, type WorkflowDefinition, type WorkflowInstance } from "@/lib/workflow-api";

export default function WorkflowInstancesPage() {
  const [defs, setDefs] = useState<WorkflowDefinition[]>([]);
  const [rows, setRows] = useState<WorkflowInstance[]>([]);
  const [definitionId, setDefinitionId] = useState("");
  const [title, setTitle] = useState("");
  const [formData, setFormData] = useState('{"amount":1000,"reason":"测试费用申请"}');
  const [runtimeData, setRuntimeData] = useState<Record<string, unknown>>({});
  const [schema, setSchema] = useState<{ fields?: Array<{ key: string; label: string; type: string; [key: string]: unknown }> } | null>(null);

  const load = () => Promise.all([
    workflowApi.definitions().then(res => setDefs((res.data || []).filter(d => d.status === "ACTIVE"))),
    workflowApi.instances().then(res => setRows(res.data || [])),
  ]);
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!definitionId) {
      setSchema(null);
      return;
    }
    workflowApi.definitionDesigner(Number(definitionId)).then(res => {
      const formSchema = res.data.form_schema_json as { fields?: Array<{ key: string; label: string; type: string; [key: string]: unknown }> } | undefined;
      setSchema(formSchema && Array.isArray(formSchema.fields) ? formSchema : null);
      setRuntimeData({});
    }).catch(() => setSchema(null));
  }, [definitionId]);

  async function start() {
    await workflowApi.start({
      definition_id: Number(definitionId),
      title,
      form_data: schema ? runtimeData : JSON.parse(formData),
    });
    setTitle("");
    setRuntimeData({});
    await load();
  }

  return (
    <div>
      <PageHeader title="流程实例" subtitle="发起流程并查看运行状态" breadcrumb={["工作流", "流程实例"]} />
      <section style={panelStyle}>
        <h3 style={titleStyle}>发起流程</h3>
        <div style={gridStyle}>
          <select style={inputStyle} value={definitionId} onChange={e=>setDefinitionId(e.target.value)}>
            <option value="">选择流程</option>
            {defs.map(def => <option key={def.id} value={def.id}>{def.name}</option>)}
          </select>
          <input style={inputStyle} placeholder="标题" value={title} onChange={e=>setTitle(e.target.value)} />
        </div>
        {schema ? (
          <div style={{ marginBottom: 12 }}>
            <FormRenderer schema={schema} value={runtimeData} onChange={setRuntimeData} />
          </div>
        ) : (
          <textarea style={textareaStyle} value={formData} onChange={e=>setFormData(e.target.value)} />
        )}
        <button style={buttonStyle} disabled={!definitionId} onClick={start}>发起</button>
      </section>
      <section style={panelStyle}>
        <h3 style={titleStyle}>实例列表</h3>
        <table style={tableStyle}>
          <thead><tr><th>编号</th><th>标题</th><th>状态</th><th>发起人</th><th>时间</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.id}>
              <td><Link href={`/workflow/instances/${row.id}`}>{row.instance_no}</Link></td>
              <td>{row.title}</td><td>{row.status}</td><td>{row.starter_name}</td><td>{row.created_at}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16, marginBottom:12 };
const titleStyle: React.CSSProperties = { margin: "0 0 12px", fontSize: 15 };
const gridStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"240px 1fr", gap:10, marginBottom:12 };
const inputStyle: React.CSSProperties = { height:38, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", padding:"0 10px" };
const textareaStyle: React.CSSProperties = { width:"100%", minHeight:100, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", padding:10, marginBottom:12, fontFamily:"monospace" };
const buttonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700 };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
