"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { workflowApi } from "@/lib/workflow-api";

const defaultGraph = {
  nodes: [
    { id: "start", type: "start", name: "开始" },
    { id: "approval_1", type: "approval", name: "审批", config: { assigneeType: "ROLE", roles: ["ROLE_FIN_ACCT"] } },
    { id: "end", type: "end", name: "结束" }
  ],
  edges: [
    { from: "start", to: "approval_1" },
    { from: "approval_1", to: "end" }
  ]
};

export default function WorkflowDesignerPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [graph, setGraph] = useState(JSON.stringify(defaultGraph, null, 2));
  const [formVersionId, setFormVersionId] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    workflowApi.definitionDesigner(id).then(res => {
      setData(res.data);
      if (res.data.graph_json) setGraph(JSON.stringify(res.data.graph_json, null, 2));
      if (res.data.form_version_id) setFormVersionId(String(res.data.form_version_id));
    });
  }, [id]);

  async function publish() {
    setMsg("");
    await workflowApi.publishDefinition(id, {
      graph_json: JSON.parse(graph),
      form_version_id: formVersionId ? Number(formVersionId) : undefined,
    });
    setMsg("发布成功");
  }

  return (
    <div>
      <PageHeader title="流程设计器" subtitle={String(data?.name || "")} breadcrumb={["工作流", "流程设计器"]} />
      <section style={panelStyle}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <input style={inputStyle} placeholder="绑定表单版本 ID，可为空" value={formVersionId} onChange={e=>setFormVersionId(e.target.value)} />
          <button style={buttonStyle} onClick={publish}>发布流程版本</button>
          {msg ? <span style={{ alignSelf:"center", color:"var(--status-success)" }}>{msg}</span> : null}
        </div>
        <textarea value={graph} onChange={e=>setGraph(e.target.value)} style={textareaStyle} spellCheck={false} />
      </section>
    </div>
  );
}

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16 };
const inputStyle: React.CSSProperties = { height:38, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", padding:"0 10px", minWidth: 220 };
const buttonStyle: React.CSSProperties = { height:38, padding:"0 16px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700 };
const textareaStyle: React.CSSProperties = { width:"100%", minHeight:520, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", color:"var(--text-primary)", padding:12, fontFamily:"monospace", fontSize:13 };
