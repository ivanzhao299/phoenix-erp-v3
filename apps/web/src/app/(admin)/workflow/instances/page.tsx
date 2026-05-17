"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowInstance } from "@/lib/workflow-api";

const STATUS_FILTERS = [
  { label: "全部", value: "" },
  { label: "审批中", value: "RUNNING" },
  { label: "已通过", value: "APPROVED" },
  { label: "已驳回", value: "REJECTED" },
  { label: "已取消", value: "CANCELED" },
];

export default function WorkflowInstancesPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<WorkflowInstance[]>([]);
  const [status, setStatus] = useState(searchParams.get("status") || "");

  const load = useCallback(() => workflowApi.instances(status || undefined).then(res => setRows(res.data || [])), [status]);
  useEffect(() => { load(); }, [load]);

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
        actions={<Link href="/workflow/start" className={s.btnPrimary}>发起申请</Link>}
      />

      <section className={s.card} style={{ marginBottom: 12 }}>
        <div className={s.cardBody} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          <div>
            <h3 className={s.cardTitle}>实例列表</h3>
            <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>当前条件下共 {rows.length} 条流程。</p>
          </div>
          <div style={filterStyle}>
            {STATUS_FILTERS.map(item => (
              <button
                key={item.value || "ALL"}
                type="button"
                className={status === item.value ? s.tabPillActive : s.tabPill}
                onClick={() => setStatus(item.value)}
              >
                {item.label}
                <span>{item.value ? counts[item.value] || 0 : counts.ALL || 0}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={s.card}>
        {rows.length ? (
          <table className={s.table}>
            <thead><tr><th>编号</th><th>标题</th><th>状态</th><th>发起人</th><th>发起时间</th><th>操作</th></tr></thead>
            <tbody>{rows.map(row => (
              <tr key={row.id}>
                <td><Link href={`/workflow/instances/${row.id}`}>{row.instance_no}</Link></td>
                <td>
                  <strong>{row.title}</strong>
                  <div style={subTextStyle}>{row.business_type || "工作流"}</div>
                </td>
                <td><span className={statusBadgeClass(row.status)}>{statusText(row.status)}</span></td>
                <td>{row.starter_name || "-"}</td>
                <td>{formatDate(row.created_at)}</td>
                <td><Link href={`/workflow/instances/${row.id}`}>查看详情</Link></td>
              </tr>
            ))}</tbody>
          </table>
        ) : (
          <div className={s.emptyState}>
            <div className={s.emptyStateText}>当前没有流程实例，可以先发起一个申请。</div>
          </div>
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

function statusBadgeClass(status: string) {
  if (status === "APPROVED") return `${s.badge} ${s.badgeSuccess}`;
  if (status === "RUNNING") return `${s.badge} ${s.badgeInfo}`;
  if (status === "REJECTED" || status === "CANCELED") return `${s.badge} ${s.badgeDanger}`;
  return `${s.badge} ${s.badgeNeutral}`;
}

const filterStyle: React.CSSProperties = { display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" };
const subTextStyle: React.CSSProperties = { marginTop:4, color:"var(--text-secondary)", fontSize:12 };
