"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { WorkflowTimeline } from "@/components/workflow/WorkflowTimeline";
import { workflowApi, type WorkflowInstance } from "@/lib/workflow-api";

export default function WorkflowInstanceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<WorkflowInstance | null>(null);

  const load = () => workflowApi.instance(id).then(res => setData(res.data));
  useEffect(() => { load(); }, [id]);

  async function cancel() {
    await workflowApi.cancelInstance(id, "发起人取消");
    await load();
  }

  return (
    <div>
      <PageHeader title="流程详情" subtitle={data?.title || ""} breadcrumb={["工作流", "流程详情"]} />
      {data ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 360px", gap:12 }}>
          <section style={panelStyle}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div>
                <h3 style={{ margin:"0 0 4px" }}>{data.instance_no}</h3>
                <div style={{ color:"var(--text-secondary)", fontSize:13 }}>{data.status} · {data.starter_name}</div>
              </div>
              {data.status === "RUNNING" ? <button style={dangerButtonStyle} onClick={cancel}>取消流程</button> : null}
            </div>
            <h4>表单数据</h4>
            <pre style={preStyle}>{JSON.stringify(data.form_data_json || {}, null, 2)}</pre>
            <h4>任务</h4>
            <table style={tableStyle}>
              <thead><tr><th>节点</th><th>状态</th><th>结果</th><th>处理时间</th></tr></thead>
              <tbody>{(data.tasks || []).map((task, idx) => (
                <tr key={idx}><td>{String(task.node_name)}</td><td>{String(task.status)}</td><td>{String(task.action_result || "-")}</td><td>{String(task.completed_at || "-")}</td></tr>
              ))}</tbody>
            </table>
          </section>
          <section style={panelStyle}>
            <h3 style={{ marginTop:0 }}>流程轨迹</h3>
            <WorkflowTimeline actions={data.actions as Record<string, unknown>[] || []} />
          </section>
        </div>
      ) : null}
    </div>
  );
}

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16 };
const preStyle: React.CSSProperties = { background:"var(--bg-muted)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:12, overflow:"auto" };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
const dangerButtonStyle: React.CSSProperties = { height:34, padding:"0 14px", border:0, borderRadius:"var(--radius-md)", background:"var(--status-danger)", color:"#fff", fontWeight:700 };
