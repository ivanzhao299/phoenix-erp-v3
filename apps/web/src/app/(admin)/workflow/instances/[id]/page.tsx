"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { WorkflowDataView } from "@/components/workflow/WorkflowDataView";
import { WorkflowTimeline } from "@/components/workflow/WorkflowTimeline";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";
import { workflowApi, type WorkflowInstance, type WorkflowTask } from "@/lib/workflow-api";
import u from "@/styles/uix-utils.module.css";
export default function WorkflowInstanceDetailPage() {
  const params = useParams<{
    id: string;
  }>();
  const id = Number(params.id);
  const [data, setData] = useState<WorkflowInstance | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => workflowApi.instance(id).then(res => setData(res.data)), [id]);
  useEffect(() => {
    load();
  }, [load]);
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
  const tasks = useMemo(() => data?.tasks || [], [data]);
  const runningTasks = useMemo(() => tasks.filter(task => String(task.status) === "TODO"), [tasks]);
  const insight = useMemo(() => data ? buildInstanceInsight(data, tasks) : null, [data, tasks]);
  return <div>
      <PageHeader title="流程详情" subtitle={data?.title || ""} breadcrumb={["工作流", "流程详情"]} />
      {data ? <div style={layoutStyle}>
          <section className={s.card}>
            <div className={s.cardBody}>
              <div style={headerStyle}>
                <div>
                  <h3 className={s.cardTitle}>{data.title}</h3>
                  <p className={`${s.modalDesc} ${u.mt4}`}>{data.instance_no} · {data.starter_name || "发起人"}</p>
                </div>
                <span className={statusBadgeClass(data.status)}>{statusText(data.status)}</span>
              </div>

              <div style={actionBarStyle}>
                <Link href="/workflow/start" style={secondaryActionButton}>继续发起</Link>
                <Link href="/workflow/tasks/todo" style={secondaryActionButton}>我的待办</Link>
                {data.status === "RUNNING" ? <button type="button" style={actionPill('danger')} disabled={canceling} onClick={cancel}>
                    {canceling ? "取消中..." : "取消流程"}
                  </button> : null}
              </div>
              {error ? <div className={s.errorBanner}>{error}</div> : null}

              {insight ? <div style={insightGridStyle}>
                  <div style={insightCardStyle}>
                    <span className={s.badge}>流程进度</span>
                    <strong>{insight.progressText}</strong>
                    <div style={progressTrackStyle}><span style={{
                  ...progressBarStyle,
                  width: insight.progressPercent
                }} /></div>
                    <span style={hintStyle}>{insight.nodeText}</span>
                  </div>
                  <div style={insightCardStyle}>
                    <span className={s.badge}>当前责任</span>
                    <strong>{insight.ownerText}</strong>
                    <span style={hintStyle}>{insight.ownerHint}</span>
                  </div>
                  <div style={insightCardStyle}>
                    <span className={s.badge}>耗时</span>
                    <strong>{insight.elapsedText}</strong>
                    <span style={hintStyle}>{insight.timeHint}</span>
                  </div>
                  <div style={insightCardStyle}>
                    <span className={s.badge}>下一步</span>
                    <strong>{insight.nextTitle}</strong>
                    <span style={hintStyle}>{insight.nextHint}</span>
                  </div>
                </div> : null}

              {runningTasks.length ? <div className={s.warnBanner}>
                  <strong>当前待处理节点</strong>
                  <span>
                    {runningTasks.map(task => `${String(task.node_name)}${task.assignee_role_code ? ` · ${String(task.assignee_role_code)}` : ""}`).join("、")}
                  </span>
                </div> : null}

              <h4 className={s.formSection}>申请内容</h4>
              <WorkflowDataView data={data.form_data_json || {}} schema={data.form_schema_json} />

              <h4 className={s.formSection}>审批任务</h4>
              <table className={s.table}>
                <thead><tr><th>节点</th><th>状态</th><th>结果</th><th>处理时间</th></tr></thead>
                <tbody>{tasks.map((task, idx) => <tr key={idx}>
                    <td>{String(task.node_name || "-")}</td>
                    <td><span className={taskBadgeClass(String(task.status || ""))}>{taskStatusText(String(task.status || ""))}</span></td>
                    <td>{resultText(String(task.action_result || ""))}</td>
                    <td>{formatDate(String(task.completed_at || "")) || "-"}</td>
                  </tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className={s.card}>
            <div className={s.cardBody}>
              <h3 className={`${s.cardTitle} ${u.mb12}`}>流程轨迹</h3>
              <WorkflowTimeline actions={data.actions as Record<string, unknown>[] || []} />
            </div>
          </section>
        </div> : null}
    </div>;
}
function buildInstanceInsight(data: WorkflowInstance, tasks: WorkflowTask[]) {
  const total = tasks.length;
  const done = tasks.filter(task => String(task.status) === "DONE").length;
  const todo = tasks.filter(task => String(task.status) === "TODO");
  const canceled = tasks.filter(task => String(task.status) === "CANCELED").length;
  const finished = ["APPROVED", "REJECTED", "CANCELED"].includes(data.status);
  const progressNumber = total ? Math.round(done / total * 100) : finished ? 100 : 0;
  const current = todo[0];
  const pendingOwners = todo.map(task => task.assignee_role_code || (task.assignee_user_id ? `用户 ${task.assignee_user_id}` : "待分配"));
  const startedAt = data.started_at || data.created_at;
  const endedAt = data.ended_at || undefined;
  const elapsedText = durationText(startedAt, endedAt);
  const dueText = current?.due_at ? dueStatusText(current.due_at) : "";
  return {
    progressText: total ? `${done}/${total} 个节点已处理` : statusText(data.status),
    progressPercent: `${progressNumber}%`,
    nodeText: canceled ? `${canceled} 个节点已取消` : current ? `当前节点：${current.node_name}` : "暂无待处理节点",
    ownerText: pendingOwners.length ? Array.from(new Set(pendingOwners)).join("、") : "无待处理人",
    ownerHint: current ? `${current.node_name}${dueText ? ` · ${dueText}` : ""}` : "流程当前无需人工处理",
    elapsedText,
    timeHint: finished ? `结束时间：${formatDate(endedAt) || "-"}` : "从发起到当前的运行时长",
    nextTitle: nextTitle(data.status, todo.length),
    nextHint: nextHint(data.status, todo)
  };
}
function nextTitle(status: string, todoCount: number) {
  if (status === "RUNNING" && todoCount > 0) return "等待审批处理";
  if (status === "RUNNING") return "等待系统流转";
  if (status === "APPROVED") return "流程已完成";
  if (status === "REJECTED") return "申请已驳回";
  if (status === "CANCELED") return "流程已取消";
  return "查看流程轨迹";
}
function nextHint(status: string, todo: WorkflowTask[]) {
  if (status === "RUNNING" && todo.length > 0) {
    return todo.map(task => `${task.node_name} 由 ${task.assignee_role_code || task.assignee_user_id || "待分配"} 处理`).join("；");
  }
  if (status === "RUNNING") return "系统正在按流程图继续推进。";
  if (status === "APPROVED") return "可以查看审批轨迹或继续发起类似申请。";
  if (status === "REJECTED") return "根据审批意见修改资料后可重新发起。";
  if (status === "CANCELED") return "如业务仍需办理，可重新发起申请。";
  return "查看任务表和流程轨迹了解细节。";
}
function durationText(start?: string, end?: string) {
  if (!start) return "未记录";
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return "未记录";
  const minutes = Math.max(0, Math.round((endTime - startTime) / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} 天 ${restHours} 小时` : `${days} 天`;
}
function dueStatusText(value: string) {
  const due = new Date(value).getTime();
  if (!Number.isFinite(due)) return "";
  const diffHours = Math.round((due - Date.now()) / 36e5);
  if (diffHours < 0) return `已超期 ${Math.abs(diffHours)} 小时`;
  if (diffHours <= 24) return `剩余 ${diffHours} 小时到期`;
  return `到期：${formatDate(value)}`;
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
const layoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 360px",
  gap: 12,
  alignItems: "start"
};
const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12
};
const actionBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginBottom: 12,
  flexWrap: "wrap"
};
const insightGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 14
};
const insightCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 7,
  alignContent: "start",
  minHeight: 126,
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)",
  color: "var(--text-primary)"
};
const hintStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: 12,
  lineHeight: 1.6
};
const progressTrackStyle: React.CSSProperties = {
  height: 8,
  borderRadius: 999,
  background: "var(--bg-muted)",
  overflow: "hidden"
};
const progressBarStyle: React.CSSProperties = {
  display: "block",
  height: "100%",
  borderRadius: 999,
  background: "var(--color-primary)"
};