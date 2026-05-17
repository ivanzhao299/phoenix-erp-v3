"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { workflowApi, type WorkflowInstance } from "@/lib/workflow-api";

export default function WorkflowInstancesPage() {
  const [rows, setRows] = useState<WorkflowInstance[]>([]);

  const load = () => workflowApi.instances().then(res => setRows(res.data || []));
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        title="流程实例"
        subtitle="查看我发起的流程和当前审批状态"
        breadcrumb={["工作流", "流程实例"]}
        actions={<Link href="/workflow/start" style={buttonStyle}>发起申请</Link>}
      />
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
const buttonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700, display:"inline-flex", alignItems:"center", textDecoration:"none" };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
