"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { workflowApi, type WorkflowDefinition } from "@/lib/workflow-api";

export default function WorkflowDefinitionsPage() {
  const [rows, setRows] = useState<WorkflowDefinition[]>([]);
  const [form, setForm] = useState({ code: "", name: "", category: "", description: "" });
  const [loading, setLoading] = useState(false);

  const load = () => workflowApi.definitions().then(res => setRows(res.data || []));
  useEffect(() => { load(); }, []);

  async function create() {
    setLoading(true);
    try {
      await workflowApi.createDefinition(form);
      setForm({ code: "", name: "", category: "", description: "" });
      await load();
    } finally { setLoading(false); }
  }

  return (
    <div>
      <PageHeader title="流程定义" subtitle="管理工作流定义，发布后即可发起实例" breadcrumb={["工作流", "流程定义"]} />
      <section style={panelStyle}>
        <h3 style={titleStyle}>新增流程</h3>
        <div style={gridStyle}>
          <input style={inputStyle} placeholder="编码，如 EXPENSE_APPROVAL" value={form.code} onChange={e=>setForm({...form, code:e.target.value.toUpperCase()})} />
          <input style={inputStyle} placeholder="名称" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
          <input style={inputStyle} placeholder="分类" value={form.category} onChange={e=>setForm({...form, category:e.target.value})} />
          <input style={inputStyle} placeholder="描述" value={form.description} onChange={e=>setForm({...form, description:e.target.value})} />
        </div>
        <button style={buttonStyle} disabled={loading} onClick={create}>创建</button>
      </section>
      <section style={panelStyle}>
        <h3 style={titleStyle}>流程列表</h3>
        <table style={tableStyle}>
          <thead><tr><th>编码</th><th>名称</th><th>状态</th><th>版本</th><th>操作</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.id}>
              <td>{row.code}</td><td>{row.name}</td><td>{row.status}</td><td>{row.current_version_id || "-"}</td>
              <td><Link href={`/workflow/designer/${row.id}`}>设计/发布</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16, marginBottom:12 };
const titleStyle: React.CSSProperties = { margin: "0 0 12px", fontSize: 15 };
const gridStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(4, minmax(0, 1fr))", gap:10, marginBottom:12 };
const inputStyle: React.CSSProperties = { height:38, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", padding:"0 10px" };
const buttonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700 };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
