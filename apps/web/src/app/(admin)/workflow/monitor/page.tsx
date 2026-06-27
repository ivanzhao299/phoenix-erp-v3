"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";
import { workflowApi, type WorkflowMonitorTask } from "@/lib/workflow-api";
import u from "@/styles/uix-utils.module.css";
export default function WorkflowMonitorPage() {
  const [rows, setRows] = useState<WorkflowMonitorTask[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [comment, setComment] = useState("请尽快处理该流程，如需补充资料请及时反馈。");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const selected = useMemo(() => rows.find(row => row.id === selectedId) || rows[0] || null, [rows, selectedId]);
  const stats = useMemo(() => {
    const overdue = rows.filter(row => row.overdue).length;
    const longWaiting = rows.filter(row => Number(row.waiting_hours || 0) >= 24).length;
    const urged = rows.filter(row => Number(row.urge_count || 0) > 0).length;
    return {
      total: rows.length,
      overdue,
      longWaiting,
      urged
    };
  }, [rows]);
  const load = useCallback(async () => {
    const res = await workflowApi.monitorTasks();
    const nextRows = res.data || [];
    setRows(nextRows);
    setSelectedId(current => current && nextRows.some(row => row.id === current) ? current : nextRows[0]?.id || null);
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.resolve();
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);
  async function urge() {
    if (!selected) return;
    setLoading(true);
    setNotice("");
    setError("");
    try {
      const res = await workflowApi.urgeInstance(selected.instance_id, comment.trim());
      setNotice(`已催办 ${res.data.urgedTaskCount} 个待处理任务。`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "催办失败");
    } finally {
      setLoading(false);
    }
  }
  return <div>
      <PageHeader title="流程督办" subtitle="查看正在流转的审批任务，识别超时与长期等待项，并对卡点流程发起催办" breadcrumb={["工作流", "流程督办"]} actions={<Link href="/workflow/instances?status=RUNNING" style={secondaryActionButton}>流转中实例</Link>} />

      <section className={`${s.card} ${u.mb12}`}>
        <div className={s.cardBody} style={metricGridStyle}>
          <Metric label="流转任务" value={stats.total} />
          <Metric label="已超时" value={stats.overdue} tone={stats.overdue ? "danger" : "ok"} />
          <Metric label="超过 24 小时" value={stats.longWaiting} tone={stats.longWaiting ? "warn" : "ok"} />
          <Metric label="已催办" value={stats.urged} />
        </div>
      </section>

      <div style={layoutStyle}>
        <section className={s.card}>
          <div className={s.cardBody}>
            <div style={sectionHeaderStyle}>
              <div>
                <h3 className={s.cardTitle}>当前卡点</h3>
                <p className={`${s.modalDesc} ${u.mt4}`}>超时、临近超时和等待最久的任务优先展示。</p>
              </div>
              <button type="button" style={secondaryActionButton} onClick={load} disabled={loading}>刷新</button>
            </div>

            {rows.length ? <div style={listStyle}>
                {rows.map(row => <button key={row.id} type="button" style={row.id === selected?.id ? selectedItemStyle : itemStyle} onClick={() => {
              setSelectedId(row.id);
              setNotice("");
              setError("");
            }}>
                    <span style={itemTopStyle}>
                      <strong>{row.title || row.instance_no}</strong>
                      <span className={statusBadgeClass(row)}>{statusLabel(row)}</span>
                    </span>
                    <span>{row.node_name || "审批"} · {assigneeText(row)}</span>
                    <small>{row.definition_name || "工作流"} · 等待 {waitingText(row.waiting_hours)}</small>
                  </button>)}
              </div> : <div className={s.emptyState}>
                <div className={s.emptyStateText}>当前没有需要督办的流转任务。</div>
              </div>}
          </div>
        </section>

        <section className={s.card}>
          {selected ? <div className={s.cardBody}>
              <div style={detailHeaderStyle}>
                <div>
                  <h3 className={s.cardTitle}>{selected.title}</h3>
                  <p className={`${s.modalDesc} ${u.mt4}`}>{selected.instance_no || "-"} · {selected.definition_name || "工作流"}</p>
                </div>
                <span className={statusBadgeClass(selected)}>{statusLabel(selected)}</span>
              </div>

              <div className={`${s.infoGrid3} ${u.mb16}`}>
                <Meta label="当前节点" value={selected.node_name || "-"} />
                <Meta label="处理人" value={assigneeText(selected)} />
                <Meta label="发起人" value={selected.starter_name || "-"} />
                <Meta label="等待时长" value={waitingText(selected.waiting_hours)} />
                <Meta label="截止时间" value={formatDate(selected.due_at) || "未设置"} />
                <Meta label="催办记录" value={selected.urge_count ? `${selected.urge_count} 次，最近 ${formatDate(selected.last_urged_at)}` : "暂无催办"} />
              </div>

              <div style={urgePanelStyle}>
                <div>
                  <h4 className={s.cardTitle} style={{
                margin: 0
              }}>催办意见</h4>
                  <p className={`${s.modalDesc} ${u.mt4}`}>催办会写入流程动作记录，后续可扩展消息通知。</p>
                </div>
                <textarea className={s.textarea} value={comment} onChange={e => setComment(e.target.value)} />
                {notice ? <div className={s.successBanner}>{notice}</div> : null}
                {error ? <div className={s.errorBanner}>{error}</div> : null}
              </div>

              <div style={footerStyle}>
                <Link href={`/workflow/instances/${selected.instance_id}`} style={secondaryActionButton}>查看详情</Link>
                <button type="button" style={primaryActionButton} disabled={loading} onClick={urge}>
                  {loading ? "催办中..." : "发送催办"}
                </button>
              </div>
            </div> : <div className={s.emptyState}>
              <div className={s.emptyStateText}>选择一条任务后查看督办详情。</div>
            </div>}
        </section>
      </div>
    </div>;
}
function Metric({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone?: "danger" | "warn" | "ok";
}) {
  const valueStyle = tone === "danger" ? dangerValueStyle : tone === "warn" ? warnValueStyle : tone === "ok" ? okValueStyle : metricValueStyle;
  return <div style={metricStyle}>
      <span>{label}</span>
      <strong style={valueStyle}>{value}</strong>
    </div>;
}
function Meta({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return <div className={s.infoItem}>
      <div className={s.infoKey}>{label}</div>
      <div className={s.infoVal}>{value}</div>
    </div>;
}
function assigneeText(row: WorkflowMonitorTask) {
  if (row.assignee_user_name || row.assignee_user_id) return row.assignee_user_name || `用户 #${row.assignee_user_id}`;
  if (row.assignee_role_name || row.assignee_role_code) return row.assignee_role_name || row.assignee_role_code || "-";
  return "-";
}
function waitingText(value?: string | number) {
  const hours = Number(value || 0);
  if (!Number.isFinite(hours)) return "-";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟`;
  if (hours < 24) return `${hours.toFixed(1)} 小时`;
  return `${(hours / 24).toFixed(1)} 天`;
}
function statusLabel(row: WorkflowMonitorTask) {
  if (row.overdue) return "已超时";
  if (Number(row.waiting_hours || 0) >= 24) return "等待较久";
  if (row.due_at) return "进行中";
  return "待处理";
}
function statusBadgeClass(row: WorkflowMonitorTask) {
  if (row.overdue) return `${s.badge} ${s.badgeDanger}`;
  if (Number(row.waiting_hours || 0) >= 24) return `${s.badge} ${s.badgeWarning}`;
  return `${s.badge} ${s.badgeInfo}`;
}
function formatDate(value?: string) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}
function friendlyError(message: string) {
  if (message.includes("only starter or admin")) return "只有流程发起人或管理员可以催办。";
  if (message.includes("no active task")) return "当前流程没有可催办的待处理任务。";
  return message;
}
const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12
};
const metricStyle: React.CSSProperties = {
  padding: 14,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-page)",
  display: "grid",
  gap: 6
};
const metricValueStyle: React.CSSProperties = {
  fontSize: 26,
  lineHeight: 1,
  color: "var(--text-primary)"
};
const dangerValueStyle: React.CSSProperties = {
  ...metricValueStyle,
  color: "var(--status-danger)"
};
const warnValueStyle: React.CSSProperties = {
  ...metricValueStyle,
  color: "var(--status-warning)"
};
const okValueStyle: React.CSSProperties = {
  ...metricValueStyle,
  color: "var(--status-success)"
};
const layoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "400px minmax(0, 1fr)",
  gap: 12,
  alignItems: "start"
};
const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12
};
const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 8
};
const itemStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  display: "grid",
  gap: 6,
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  cursor: "pointer"
};
const selectedItemStyle: React.CSSProperties = {
  ...itemStyle,
  borderColor: "var(--color-primary)",
  background: "color-mix(in srgb, var(--color-primary) 8%, var(--bg-page))"
};
const itemTopStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10
};
const detailHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 16
};
const urgePanelStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 14,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-page)"
};
const footerStyle: React.CSSProperties = {
  marginTop: 18,
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap"
};