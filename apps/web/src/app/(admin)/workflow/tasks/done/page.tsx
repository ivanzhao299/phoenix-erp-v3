"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { workflowApi, type WorkflowTask } from "@/lib/workflow-api";

export default function WorkflowDonePage() {
  const [rows, setRows] = useState<WorkflowTask[]>([]);
  useEffect(() => { workflowApi.done().then(res => setRows(res.data || [])); }, []);
  return (
    <div>
      <PageHeader title="我的已办" subtitle="查看已经处理过的工作流任务" breadcrumb={["工作流", "我的已办"]} />
      <section style={panelStyle}>
        <table style={tableStyle}>
          <thead><tr><th>流程</th><th>节点</th><th>发起人</th><th>完成状态</th><th>创建时间</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.id}>
              <td><Link href={`/workflow/instances/${row.instance_id}`}>{row.title}</Link></td>
              <td>{row.node_name}</td><td>{row.starter_name}</td><td>{row.status}</td><td>{row.created_at}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16 };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
