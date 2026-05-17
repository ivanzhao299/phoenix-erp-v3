"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowTask } from "@/lib/workflow-api";

export default function WorkflowDonePage() {
  const [rows, setRows] = useState<WorkflowTask[]>([]);

  useEffect(() => { workflowApi.done().then(res => setRows(res.data || [])); }, []);

  return (
    <div>
      <PageHeader title="我的已办" subtitle="查看已经处理过的审批记录和处理结果" breadcrumb={["工作流", "我的已办"]} />

      <section className={s.card}>
        <div className={s.cardBody}>
          <div style={sectionHeaderStyle}>
            <div>
              <h3 className={s.cardTitle}>已处理任务</h3>
              <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>共 {rows.length} 条记录</p>
            </div>
            <Link href="/workflow/tasks/todo" className={s.btnSecondary}>回到待办</Link>
          </div>
        </div>

        {rows.length ? (
          <table className={s.table}>
            <thead>
              <tr><th>流程</th><th>节点</th><th>发起人</th><th>处理结果</th><th>处理时间</th><th>操作</th></tr>
            </thead>
            <tbody>{rows.map(row => (
              <tr key={row.id}>
                <td>
                  <strong>{row.title}</strong>
                  <div style={subTextStyle}>{row.definition_name || row.instance_no || row.task_no}</div>
                </td>
                <td>{row.node_name}</td>
                <td>{row.starter_name || "-"}</td>
                <td><span className={resultBadgeClass(row.action_result)}>{resultText(row.action_result)}</span></td>
                <td>{formatDate(row.completed_at || row.created_at)}</td>
                <td><Link href={`/workflow/instances/${row.instance_id}`}>查看详情</Link></td>
              </tr>
            ))}</tbody>
          </table>
        ) : (
          <div className={s.emptyState}>
            <div className={s.emptyStateText}>还没有已处理的审批任务。</div>
          </div>
        )}
      </section>
    </div>
  );
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

function resultBadgeClass(result?: string) {
  if (result === "APPROVE") return `${s.badge} ${s.badgeSuccess}`;
  if (result === "REJECT" || result === "CANCEL" || result === "CANCELED") return `${s.badge} ${s.badgeDanger}`;
  return `${s.badge} ${s.badgeNeutral}`;
}

const sectionHeaderStyle: React.CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:14 };
const subTextStyle: React.CSSProperties = { marginTop:4, color:"var(--text-secondary)", fontSize:12 };
