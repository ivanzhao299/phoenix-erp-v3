"use client";

import { useEffect, useCallback, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowTask } from "@/lib/workflow-api";
import u from "@/styles/uix-utils.module.css";
import { secondaryActionButton, actionPill } from "@/components/design-system/cockpit-styles";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";
function resultTone(result?: string): Tone {
  if (result === "APPROVE") return "success";
  if (result === "REJECT" || result === "CANCEL" || result === "CANCELED") return "danger";
  return "default";
}
export default function WorkflowDonePage() {
  const [rows, setRows] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await workflowApi.done();
      const payload = res.data as unknown;
      const nested = payload && !Array.isArray(payload) && typeof payload === "object" ? payload as { list?: WorkflowTask[]; items?: WorkflowTask[]; data?: WorkflowTask[] } : null;
      const nextRows = Array.isArray(payload)
        ? payload
        : Array.isArray(nested?.list)
          ? nested.list
          : Array.isArray(nested?.items)
            ? nested.items
            : Array.isArray(nested?.data)
              ? nested.data
              : [];
      setRows(nextRows);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "加载已办审批失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return <div>
      <PageHeader title="我的已办" subtitle="查看已经处理过的审批记录和处理结果" breadcrumb={["工作流", "我的已办"]} />

      <section className={s.card}>
        <div className={s.cardBody}>
          <div style={sectionHeaderStyle}>
            <div>
              <h3 className={s.cardTitle}>已处理任务</h3>
              <p className={`${s.modalDesc} ${u.mt4}`}>共 {rows.length} 条记录</p>
            </div>
            <Link href="/workflow/tasks/todo" style={{ ...secondaryActionButton, textDecoration: "none" }}>回到待办</Link>
          </div>
        </div>

        {loading ? <div className={s.emptyState}><div className={s.emptyStateText}>加载中…</div></div> : error ? <div className={s.emptyState}>
            <AlertTriangle size={34} style={{ color: "var(--status-danger)", margin: "0 auto 10px" }} />
            <div className={s.emptyStateText}>{error}</div>
            <button type="button" onClick={load} style={{ ...secondaryActionButton, marginTop: 12 }}>重新加载</button>
          </div> : rows.length ? <table className={s.table}>
            <thead>
              <tr><th>流程</th><th>节点</th><th>发起人</th><th>处理结果</th><th>处理时间</th><th>操作</th></tr>
            </thead>
            <tbody>{rows.map(row => <tr key={row.id}>
                <td>
                  <strong>{row.title || row.instance_no || row.task_no || "审批任务"}</strong>
                  <div style={subTextStyle}>{row.definition_name || row.instance_no || row.task_no}</div>
                </td>
                <td>{row.node_name || "-"}</td>
                <td>{row.starter_name || "-"}</td>
                <td><span style={actionPill(resultTone(row.action_result))}>{resultText(row.action_result)}</span></td>
                <td>{formatDate(row.completed_at || row.created_at)}</td>
                <td>{row.instance_id ? <Link href={`/workflow/instances/${row.instance_id}`}>查看详情</Link> : "-"}</td>
              </tr>)}</tbody>
          </table> : <div className={s.emptyState}>
            <div className={s.emptyStateText}>还没有已处理的审批任务。</div>
          </div>}
      </section>
    </div>;
}
function resultText(result?: string) {
  if (result === "APPROVE") return "已通过";
  if (result === "REJECT") return "已驳回";
  if (result === "CANCEL" || result === "CANCELED") return "已取消";
  return result || "已处理";
}
function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}
const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14
};
const subTextStyle: React.CSSProperties = {
  marginTop: 4,
  color: "var(--text-secondary)",
  fontSize: 12
};
