"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { WorkflowTimeline } from "@/components/workflow/WorkflowTimeline";
import { workflowApi, type WorkflowInstance } from "@/lib/workflow-api";

export default function WorkflowInstanceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<WorkflowInstance | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState("");

  const load = () => workflowApi.instance(id).then(res => setData(res.data));
  useEffect(() => { load(); }, [id]);

  async function cancel() {
    setCanceling(true);
    setError("");
    try {
      await workflowApi.cancelInstance(id, "发起人取消");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "取消失败");
    } finally {
      setCanceling(false);
    }
  }

  const tasks = data?.tasks || [];
  const runningTasks = tasks.filter(task => String(task.status) === "TODO");

  return (
    <div>
      <PageHeader title="流程详情" subtitle={data?.title || ""} breadcrumb={["工作流", "流程详情"]} />
      {data ? (
        <div style={layoutStyle}>
          <section style={panelStyle}>
            <div style={headerStyle}>
              <div>
                <h3 style={titleStyle}>{data.title}</h3>
                <p style={hintStyle}>{data.instance_no} · {data.starter_name || "发起人"}</p>
              </div>
              <span style={statusStyle(data.status)}>{statusText(data.status)}</span>
            </div>

            <div style={actionBarStyle}>
              <Link href="/workflow/start" style={secondaryButtonStyle}>继续发起</Link>
              <Link href="/workflow/tasks/todo" style={secondaryButtonStyle}>我的待办</Link>
              {data.status === "RUNNING" ? (
                <button style={dangerButtonStyle} disabled={canceling} onClick={cancel}>
                  {canceling ? "取消中..." : "取消流程"}
                </button>
              ) : null}
            </div>
            {error ? <div style={errorStyle}>{error}</div> : null}

            {runningTasks.length ? (
              <div style={currentBoxStyle}>
                <strong>当前待处理节点</strong>
                <div style={currentListStyle}>
                  {runningTasks.map((task, idx) => (
                    <span key={idx}>{String(task.node_name)}{task.assignee_role_code ? ` · ${String(task.assignee_role_code)}` : ""}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <h4 style={blockTitleStyle}>申请内容</h4>
            <DataView data={data.form_data_json || {}} />

            <h4 style={blockTitleStyle}>审批任务</h4>
            <table style={tableStyle}>
              <thead><tr><th>节点</th><th>状态</th><th>结果</th><th>处理时间</th></tr></thead>
              <tbody>{tasks.map((task, idx) => (
                <tr key={idx}>
                  <td>{String(task.node_name || "-")}</td>
                  <td>{taskStatusText(String(task.status || ""))}</td>
                  <td>{resultText(String(task.action_result || ""))}</td>
                  <td>{formatDate(String(task.completed_at || "")) || "-"}</td>
                </tr>
              ))}</tbody>
            </table>
          </section>

          <section style={panelStyle}>
            <h3 style={sideTitleStyle}>流程轨迹</h3>
            <WorkflowTimeline actions={data.actions as Record<string, unknown>[] || []} />
          </section>
        </div>
      ) : null}
    </div>
  );
}

function DataView({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return <div style={emptyStyle}>暂无表单数据。</div>;
  return (
    <div style={dataGridStyle}>
      {entries.map(([key, value]) => (
        <div key={key} style={dataItemStyle}>
          <span>{fieldLabel(key)}</span>
          <strong>{formatValue(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function fieldLabel(key: string) {
  const map: Record<string, string> = {
    amount: "金额",
    expense_type: "费用类型",
    store_code: "门店",
    reason: "申请原因",
    product_code: "物料/商品",
    quantity: "数量",
    budget_amount: "预算金额",
    need_date: "期望日期",
    payee: "收款方",
    payment_type: "付款类型",
    counterparty: "合同相对方",
    contract_amount: "合同金额",
    leave_type: "假期类型",
    start_time: "开始时间",
    end_time: "结束时间",
    warehouse: "仓库/门店",
    adjust_qty: "调整数量",
    adjust_type: "调整类型",
    batch_no: "批次号",
    exception_type: "异常类型",
    severity: "严重程度",
    description: "说明",
    proposal: "处理建议",
    shipment_no: "运输单号",
  };
  return map[key] || key;
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join("、");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function statusText(status: string) {
  if (status === "RUNNING") return "审批中";
  if (status === "APPROVED") return "已通过";
  if (status === "REJECTED") return "已驳回";
  if (status === "CANCELED") return "已取消";
  return status;
}

function taskStatusText(status: string) {
  if (status === "TODO") return "待处理";
  if (status === "DONE") return "已处理";
  if (status === "CANCELED") return "已取消";
  return status || "-";
}

function resultText(result: string) {
  if (result === "APPROVE") return "通过";
  if (result === "REJECT") return "驳回";
  if (result === "CANCEL" || result === "CANCELED") return "取消";
  return result || "-";
}

function formatDate(value?: string) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function statusStyle(status: string): React.CSSProperties {
  const danger = status === "REJECTED" || status === "CANCELED";
  return {
    border:"1px solid var(--border)",
    borderRadius:999,
    padding:"5px 12px",
    color: danger ? "var(--status-danger)" : "var(--color-primary)",
    fontSize:12,
    fontWeight:700,
  };
}

const layoutStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"minmax(0, 1fr) 360px", gap:12, alignItems:"start" };
const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16 };
const headerStyle: React.CSSProperties = { display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:12 };
const titleStyle: React.CSSProperties = { margin:"0 0 4px", fontSize:18 };
const sideTitleStyle: React.CSSProperties = { margin:"0 0 12px", fontSize:16 };
const hintStyle: React.CSSProperties = { margin:0, color:"var(--text-secondary)", fontSize:13, lineHeight:1.6 };
const actionBarStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10, marginBottom:12, flexWrap:"wrap" };
const currentBoxStyle: React.CSSProperties = { border:"1px solid rgba(245,158,11,0.35)", background:"rgba(245,158,11,0.08)", borderRadius:"var(--radius-md)", padding:12, display:"grid", gap:8, marginBottom:14 };
const currentListStyle: React.CSSProperties = { display:"flex", gap:8, flexWrap:"wrap", color:"var(--text-secondary)", fontSize:13 };
const blockTitleStyle: React.CSSProperties = { margin:"18px 0 10px", fontSize:14 };
const dataGridStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:10 };
const dataItemStyle: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:10, display:"grid", gap:6, overflow:"hidden" };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
const emptyStyle: React.CSSProperties = { border:"1px dashed var(--border)", borderRadius:"var(--radius-md)", padding:14, color:"var(--text-secondary)", fontSize:13 };
const errorStyle: React.CSSProperties = { color:"var(--color-danger)", fontSize:13, marginBottom:10 };
const secondaryButtonStyle: React.CSSProperties = { height:34, padding:"0 14px", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", color:"var(--text-primary)", fontWeight:700, display:"inline-flex", alignItems:"center" };
const dangerButtonStyle: React.CSSProperties = { height:34, padding:"0 14px", border:0, borderRadius:"var(--radius-md)", background:"var(--status-danger)", color:"#fff", fontWeight:700, cursor:"pointer" };
