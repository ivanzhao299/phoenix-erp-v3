"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
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
      <section className={s.card} style={sectionStyle}>
        <div className={s.cardBody}>
        <h3 className={s.cardTitle} style={titleStyle}>新增数据源</h3>
        <div style={gridStyle}>
          <input className={s.inp} placeholder="编码" value={form.code} onChange={e=>setForm({...form, code:e.target.value})} />
          <input className={s.inp} placeholder="名称" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
          <select className={s.inp} value={form.source_type} onChange={e=>setForm({...form, source_type:e.target.value})}>
            <option value="DICT">DICT</option><option value="TABLE">TABLE</option><option value="STATIC">STATIC</option>
          </select>
        </div>
        <textarea className={s.textarea} style={jsonTextareaStyle} value={form.config_json} onChange={e=>setForm({...form, config_json:e.target.value})} />
        <button className={s.btnPrimary} onClick={create}>创建</button>
        </div>
      </section>
      <section className={s.card}>
        <div className={s.cardBody}>
        <h3 className={s.cardTitle} style={titleStyle}>数据源列表</h3>
        <table className={s.table}><thead><tr><th>编码</th><th>名称</th><th>类型</th><th>操作</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={String(row.id)}><td>{String(row.code)}</td><td>{String(row.name)}</td><td>{String(row.source_type)}</td>
              <td><button className={`${s.btnSecondary} ${s.btnSm}`} onClick={()=>show(String(row.code))}>预览</button></td></tr>
          ))}</tbody>
        </table>
        {preview.length ? <pre style={preStyle}>{JSON.stringify(preview, null, 2)}</pre> : null}
        </div>
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = { marginBottom: 12 };
const titleStyle: React.CSSProperties = { margin: "0 0 12px" };
const gridStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(3, minmax(0, 1fr))", gap:10, marginBottom:12 };
const jsonTextareaStyle: React.CSSProperties = { minHeight: 100, marginBottom: 12, fontFamily: "monospace" };
const preStyle: React.CSSProperties = { marginTop:12, background:"var(--bg-muted)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:12, maxHeight:260, overflow:"auto" };
