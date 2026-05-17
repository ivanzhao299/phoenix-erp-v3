"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { WorkflowDataView } from "@/components/workflow/WorkflowDataView";
import { WorkflowTimeline } from "@/components/workflow/WorkflowTimeline";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowInstance } from "@/lib/workflow-api";

export default function WorkflowInstanceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<WorkflowInstance | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => workflowApi.instance(id).then(res => setData(res.data)), [id]);
  useEffect(() => { load(); }, [load]);

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
          <section className={s.card}>
            <div className={s.cardBody}>
              <div style={headerStyle}>
                <div>
                  <h3 className={s.cardTitle}>{data.title}</h3>
                  <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>{data.instance_no} · {data.starter_name || "发起人"}</p>
                </div>
                <span className={statusBadgeClass(data.status)}>{statusText(data.status)}</span>
              </div>

              <div style={actionBarStyle}>
                <Link href="/workflow/start" className={s.btnSecondary}>继续发起</Link>
                <Link href="/workflow/tasks/todo" className={s.btnSecondary}>我的待办</Link>
                {data.status === "RUNNING" ? (
                  <button className={s.btnDanger} disabled={canceling} onClick={cancel}>
                    {canceling ? "取消中..." : "取消流程"}
                  </button>
                ) : null}
              </div>
              {error ? <div className={s.errorBanner}>{error}</div> : null}

              {runningTasks.length ? (
                <div className={s.warnBanner}>
                  <strong>当前待处理节点</strong>
                  <span>
                    {runningTasks.map(task => `${String(task.node_name)}${task.assignee_role_code ? ` · ${String(task.assignee_role_code)}` : ""}`).join("、")}
                  </span>
                </div>
              ) : null}

              <h4 className={s.formSection}>申请内容</h4>
              <WorkflowDataView data={data.form_data_json || {}} schema={data.form_schema_json} />

              <h4 className={s.formSection}>审批任务</h4>
              <table className={s.table}>
                <thead><tr><th>节点</th><th>状态</th><th>结果</th><th>处理时间</th></tr></thead>
                <tbody>{tasks.map((task, idx) => (
                  <tr key={idx}>
                    <td>{String(task.node_name || "-")}</td>
                    <td><span className={taskBadgeClass(String(task.status || ""))}>{taskStatusText(String(task.status || ""))}</span></td>
                    <td>{resultText(String(task.action_result || ""))}</td>
                    <td>{formatDate(String(task.completed_at || "")) || "-"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section className={s.card}>
            <div className={s.cardBody}>
              <h3 className={s.cardTitle} style={{ marginBottom: 12 }}>流程轨迹</h3>
              <WorkflowTimeline actions={data.actions as Record<string, unknown>[] || []} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
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

function statusBadgeClass(status: string) {
  if (status === "APPROVED") return `${s.badge} ${s.badgeSuccess}`;
  if (status === "RUNNING") return `${s.badge} ${s.badgeInfo}`;
  if (status === "REJECTED" || status === "CANCELED") return `${s.badge} ${s.badgeDanger}`;
  return `${s.badge} ${s.badgeNeutral}`;
}

function taskBadgeClass(status: string) {
  if (status === "DONE") return `${s.badge} ${s.badgeSuccess}`;
  if (status === "TODO") return `${s.badge} ${s.badgeInfo}`;
  if (status === "CANCELED") return `${s.badge} ${s.badgeDanger}`;
  return `${s.badge} ${s.badgeNeutral}`;
}

const layoutStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"minmax(0, 1fr) 360px", gap:12, alignItems:"start" };
const headerStyle: React.CSSProperties = { display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:12 };
const actionBarStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10, marginBottom:12, flexWrap:"wrap" };
