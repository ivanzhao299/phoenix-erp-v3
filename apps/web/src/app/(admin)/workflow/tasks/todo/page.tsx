"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { workflowApi, type WorkflowTask } from "@/lib/workflow-api";

export default function WorkflowTodoPage() {
  const [rows, setRows] = useState<WorkflowTask[]>([]);
  const [comment, setComment] = useState("");
  const load = () => workflowApi.todo().then(res => setRows(res.data || []));
  useEffect(() => { load(); }, []);

  async function act(id: number, type: "approve" | "reject") {
    if (type === "approve") await workflowApi.approve(id, comment);
    else await workflowApi.reject(id, comment);
    setComment("");
    await load();
  }

  return (
    <div>
      <PageHeader title="我的待办" subtitle="处理分配给我的工作流任务" breadcrumb={["工作流", "我的待办"]} />
      <section style={panelStyle}>
        <textarea style={textareaStyle} placeholder="审批意见" value={comment} onChange={e=>setComment(e.target.value)} />
        <table style={tableStyle}>
          <thead><tr><th>流程</th><th>节点</th><th>发起人</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.id}>
              <td><Link href={`/workflow/instances/${row.instance_id}`}>{row.title}</Link></td>
              <td>{row.node_name}</td><td>{row.starter_name}</td><td>{row.created_at}</td>
              <td style={{ display:"flex", gap:8 }}>
                <button style={buttonStyle} onClick={()=>act(row.id, "approve")}>通过</button>
                <button style={dangerButtonStyle} onClick={()=>act(row.id, "reject")}>驳回</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16 };
const textareaStyle: React.CSSProperties = { width:"100%", minHeight:72, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", padding:10, marginBottom:12 };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
const buttonStyle: React.CSSProperties = { height:28, padding:"0 12px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700 };
const dangerButtonStyle: React.CSSProperties = { ...buttonStyle, background:"var(--status-danger)" };
