"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { workflowApi, type WorkflowInstance } from "@/lib/workflow-api";

const STATUS_FILTERS = [
  { label: "全部", value: "" },
  { label: "审批中", value: "RUNNING" },
  { label: "已通过", value: "APPROVED" },
  { label: "已驳回", value: "REJECTED" },
  { label: "已取消", value: "CANCELED" },
];

export default function WorkflowInstancesPage() {
  const [rows, setRows] = useState<WorkflowInstance[]>([]);
  const [status, setStatus] = useState("");

  const load = () => workflowApi.instances(status || undefined).then(res => setRows(res.data || []));
  useEffect(() => { load(); }, [status]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: rows.length };
    rows.forEach(row => { map[row.status] = (map[row.status] || 0) + 1; });
    return map;
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="流程实例"
        subtitle="查看我发起或参与过的流程，跟踪当前审批状态"
        breadcrumb={["工作流", "流程实例"]}
        actions={<Link href="/workflow/start" style={buttonStyle}>发起申请</Link>}
      />

      <section style={toolbarStyle}>
        <div>
          <h3 style={titleStyle}>实例列表</h3>
          <p style={hintStyle}>当前条件下共 {rows.length} 条流程。</p>
        </div>
        <div style={filterStyle}>
          {STATUS_FILTERS.map(item => (
            <button
              key={item.value || "ALL"}
              type="button"
              style={status === item.value ? activeFilterButtonStyle : filterButtonStyle}
              onClick={() => setStatus(item.value)}
            >
              {item.label}
              <span>{item.value ? counts[item.value] || 0 : counts.ALL || 0}</span>
            </button>
          ))}
        </div>
      </section>

      <section style={panelStyle}>
        {rows.length ? (
          <table style={tableStyle}>
            <thead><tr><th>编号</th><th>标题</th><th>状态</th><th>发起人</th><th>发起时间</th><th>操作</th></tr></thead>
            <tbody>{rows.map(row => (
              <tr key={row.id}>
                <td><Link href={`/workflow/instances/${row.id}`}>{row.instance_no}</Link></td>
                <td>
                  <strong>{row.title}</strong>
                  <div style={subTextStyle}>{row.business_type || "工作流"}</div>
                </td>
                <td><span style={statusPillStyle(row.status)}>{statusText(row.status)}</span></td>
                <td>{row.starter_name || "-"}</td>
                <td>{formatDate(row.created_at)}</td>
                <td><Link href={`/workflow/instances/${row.id}`}>查看详情</Link></td>
              </tr>
            ))}</tbody>
          </table>
        ) : (
          <div style={emptyStyle}>当前没有流程实例，可以先发起一个申请。</div>
        )}
      </section>
    </div>
  );
}

function statusText(status: string) {
  if (status === "RUNNING") return "审批中";
  if (status === "APPROVED") return "已通过";
  if (status === "REJECTED") return "已驳回";
  if (status === "CANCELED") return "已取消";
  return status || "-";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function statusPillStyle(status: string): React.CSSProperties {
  const danger = status === "REJECTED" || status === "CANCELED";
  return {
    border:"1px solid var(--border)",
    borderRadius:999,
    padding:"4px 10px",
    color: danger ? "var(--status-danger)" : "var(--color-primary)",
    fontSize:12,
    fontWeight:700,
  };
}

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16, marginBottom:12 };
const toolbarStyle: React.CSSProperties = { ...panelStyle, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 };
const titleStyle: React.CSSProperties = { margin: "0 0 4px", fontSize: 16 };
const hintStyle: React.CSSProperties = { margin:0, color:"var(--text-secondary)", fontSize:13 };
const buttonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700, display:"inline-flex", alignItems:"center", textDecoration:"none" };
const filterStyle: React.CSSProperties = { display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" };
const filterButtonStyle: React.CSSProperties = { minHeight:34, padding:"0 10px", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", color:"var(--text-primary)", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 };
const activeFilterButtonStyle: React.CSSProperties = { ...filterButtonStyle, borderColor:"var(--color-primary)", background:"var(--bg-muted)", color:"var(--color-primary)", fontWeight:700 };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
const subTextStyle: React.CSSProperties = { marginTop:4, color:"var(--text-secondary)", fontSize:12 };
const emptyStyle: React.CSSProperties = { border:"1px dashed var(--border)", borderRadius:"var(--radius-md)", padding:14, color:"var(--text-secondary)", fontSize:13 };
