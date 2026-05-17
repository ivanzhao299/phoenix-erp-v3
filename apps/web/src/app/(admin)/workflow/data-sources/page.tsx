"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { workflowApi } from "@/lib/workflow-api";

export default function WorkflowDataSourcesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ code: "", name: "", source_type: "DICT", config_json: '{"dict_type":"APPROVAL"}' });
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);

  const load = () => workflowApi.dataSources().then(res => setRows(res.data || []));
  useEffect(() => { load(); }, []);

  async function create() {
    await workflowApi.createDataSource({ ...form, code: form.code.toUpperCase(), config_json: JSON.parse(form.config_json) });
    setForm({ code: "", name: "", source_type: "DICT", config_json: '{"dict_type":"APPROVAL"}' });
    await load();
  }

  async function show(code: string) {
    const res = await workflowApi.previewDataSource({ code });
    setPreview(res.data || []);
  }

  return (
    <div>
      <PageHeader title="工作流数据源" subtitle="为表单 select/reference 控件提供选项" breadcrumb={["工作流", "数据源"]} />
      <section style={panelStyle}>
        <h3 style={titleStyle}>新增数据源</h3>
        <div style={gridStyle}>
          <input style={inputStyle} placeholder="编码" value={form.code} onChange={e=>setForm({...form, code:e.target.value})} />
          <input style={inputStyle} placeholder="名称" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
          <select style={inputStyle} value={form.source_type} onChange={e=>setForm({...form, source_type:e.target.value})}>
            <option value="DICT">DICT</option><option value="TABLE">TABLE</option><option value="STATIC">STATIC</option>
          </select>
        </div>
        <textarea style={textareaStyle} value={form.config_json} onChange={e=>setForm({...form, config_json:e.target.value})} />
        <button style={buttonStyle} onClick={create}>创建</button>
      </section>
      <section style={panelStyle}>
        <h3 style={titleStyle}>数据源列表</h3>
        <table style={tableStyle}><thead><tr><th>编码</th><th>名称</th><th>类型</th><th>操作</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={String(row.id)}><td>{String(row.code)}</td><td>{String(row.name)}</td><td>{String(row.source_type)}</td>
              <td><button style={smallButtonStyle} onClick={()=>show(String(row.code))}>预览</button></td></tr>
          ))}</tbody>
        </table>
        {preview.length ? <pre style={preStyle}>{JSON.stringify(preview, null, 2)}</pre> : null}
      </section>
    </div>
  );
}

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16, marginBottom:12 };
const titleStyle: React.CSSProperties = { margin: "0 0 12px", fontSize: 15 };
const gridStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(3, minmax(0, 1fr))", gap:10, marginBottom:12 };
const inputStyle: React.CSSProperties = { height:38, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", padding:"0 10px" };
const textareaStyle: React.CSSProperties = { width:"100%", minHeight:100, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", padding:10, marginBottom:12, fontFamily:"monospace" };
const buttonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700 };
const smallButtonStyle: React.CSSProperties = { ...buttonStyle, height:28 };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
const preStyle: React.CSSProperties = { marginTop:12, background:"var(--bg-muted)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:12, maxHeight:260, overflow:"auto" };
