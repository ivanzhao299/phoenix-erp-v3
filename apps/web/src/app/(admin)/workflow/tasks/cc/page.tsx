"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { WorkflowDataView } from "@/components/workflow/WorkflowDataView";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowCcTask } from "@/lib/workflow-api";

export default function WorkflowCcPage() {
  const [rows, setRows] = useState<WorkflowCcTask[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(
    () => rows.find(row => row.id === selectedId) || rows[0] || null,
    [rows, selectedId],
  );
  const unreadCount = rows.filter(row => !row.read_at).length;

  const load = useCallback(async () => {
    const res = await workflowApi.cc();
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

  async function markRead(row = selected) {
    if (!row || row.read_at) return;
    setLoading(true);
    setNotice("");
    setError("");
    try {
      await workflowApi.markCcRead(row.id);
      setNotice("已标记为已读。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "标记已读失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="抄送我的"
        subtitle="查看流程知会、同步审批结果和业务变更，不需要审批也能保留阅读记录"
        breadcrumb={["工作流", "抄送我的"]}
        actions={<Link href="/workflow/start" className={s.btnPrimary}>发起申请</Link>}
      />

      <section className={s.card} style={{ marginBottom: 12 }}>
        <div className={s.cardBody} style={summaryStyle}>
          <Metric label="全部知会" value={rows.length} />
          <Metric label="未读" value={unreadCount} tone={unreadCount ? "warn" : "ok"} />
          <Metric label="已读" value={rows.length - unreadCount} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}>刷新</button>
            <Link href="/workflow/tasks/todo" className={s.btnSecondary}>去处理待办</Link>
          </div>
        </div>
      </section>

      <div style={layoutStyle}>
        <section className={s.card}>
          <div className={s.cardBody}>
            <div style={sectionHeaderStyle}>
              <div>
                <h3 className={s.cardTitle}>知会列表</h3>
                <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>未读会自动排在前面。</p>
              </div>
              {unreadCount ? <span className={`${s.badge} ${s.badgeWarning}`}>{unreadCount} 条未读</span> : <span className={`${s.badge} ${s.badgeSuccess}`}>已全部阅读</span>}
            </div>

            {rows.length ? (
              <div style={listStyle}>
                {rows.map(row => (
                  <button
                    key={row.id}
                    type="button"
                    style={row.id === selected?.id ? selectedItemStyle : itemStyle}
                    onClick={() => {
                      setSelectedId(row.id);
                      setNotice("");
                      setError("");
                    }}
                  >
                    <span style={itemTopStyle}>
                      <strong>{row.title || row.instance_no}</strong>
                      {!row.read_at ? <b style={unreadDotStyle}>未读</b> : <small>已读</small>}
                    </span>
                    <span>{row.definition_name || "工作流"} · {row.starter_name || "发起人"}</span>
                    <small>{row.instance_no || "-"} · {formatDate(row.created_at)}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className={s.emptyState}>
                <div className={s.emptyStateText}>当前没有抄送给你的流程。</div>
              </div>
            )}
          </div>
        </section>

        <section className={s.card}>
          {selected ? (
            <div className={s.cardBody}>
              <div style={detailHeaderStyle}>
                <div>
                  <h3 className={s.cardTitle}>{selected.title}</h3>
                  <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>
                    {selected.definition_name || "工作流"} · {selected.instance_no || "-"}
                  </p>
                </div>
                <span className={statusBadgeClass(selected.instance_status)}>{statusText(selected.instance_status)}</span>
              </div>

              <div className={s.infoGrid3} style={{ marginBottom: 16 }}>
                <Meta label="发起人" value={selected.starter_name || "-"} />
                <Meta label="知会对象" value={receiverText(selected)} />
                <Meta label="知会时间" value={formatDate(selected.created_at)} />
                <Meta label="阅读状态" value={selected.read_at ? `已读 ${formatDate(selected.read_at)}` : "未读"} />
              </div>

              {notice ? <div className={s.successBanner}>{notice}</div> : null}
              {error ? <div className={s.errorBanner}>{error}</div> : null}

              <h4 className={s.formSection}>申请内容</h4>
              <WorkflowDataView data={selected.form_data_json || {}} schema={selected.form_schema_json} />

              <div style={footerStyle}>
                <Link href={`/workflow/instances/${selected.instance_id}`} className={s.btnSecondary}>查看流程详情</Link>
                <button type="button" className={s.btnPrimary} disabled={loading || Boolean(selected.read_at)} onClick={() => markRead()}>
                  {selected.read_at ? "已读" : loading ? "处理中..." : "标记已读"}
                </button>
              </div>
            </div>
          ) : (
            <div className={s.emptyState}>
              <div className={s.emptyStateText}>选择一条知会后查看内容。</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "warn" | "ok" }) {
  const valueStyle = tone === "warn" ? warnValueStyle : tone === "ok" ? okValueStyle : metricValueStyle;
  return (
    <div style={metricStyle}>
      <span>{label}</span>
      <strong style={valueStyle}>{value}</strong>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.infoItem}>
      <div className={s.infoKey}>{label}</div>
      <div className={s.infoVal}>{value}</div>
    </div>
  );
}

function receiverText(row: WorkflowCcTask) {
  if (row.receiver_user_name || row.receiver_user_id) return row.receiver_user_name || `用户 #${row.receiver_user_id}`;
  if (row.receiver_role_name || row.receiver_role_code) return row.receiver_role_name || row.receiver_role_code || "-";
  return "-";
}

function statusText(status?: string) {
  if (status === "RUNNING") return "审批中";
  if (status === "APPROVED") return "已通过";
  if (status === "REJECTED") return "已驳回";
  if (status === "CANCELED") return "已取消";
  return status || "-";
}

function statusBadgeClass(status?: string) {
  if (status === "APPROVED") return `${s.badge} ${s.badgeSuccess}`;
  if (status === "RUNNING") return `${s.badge} ${s.badgeInfo}`;
  if (status === "REJECTED" || status === "CANCELED") return `${s.badge} ${s.badgeDanger}`;
  return `${s.badge} ${s.badgeNeutral}`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

const summaryStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" };
const metricStyle: React.CSSProperties = { minWidth: 132, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-page)", display: "grid", gap: 4 };
const metricValueStyle: React.CSSProperties = { fontSize: 22, color: "var(--text-primary)" };
const warnValueStyle: React.CSSProperties = { ...metricValueStyle, color: "var(--status-warning)" };
const okValueStyle: React.CSSProperties = { ...metricValueStyle, color: "var(--status-success)" };
const layoutStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: 12, alignItems: "start" };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 };
const listStyle: React.CSSProperties = { display: "grid", gap: 8 };
const itemStyle: React.CSSProperties = { textAlign: "left", display: "grid", gap: 6, width: "100%", padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" };
const selectedItemStyle: React.CSSProperties = { ...itemStyle, borderColor: "var(--color-primary)", background: "color-mix(in srgb, var(--color-primary) 8%, var(--bg-page))" };
const itemTopStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" };
const unreadDotStyle: React.CSSProperties = { color: "var(--status-warning)", fontSize: 12 };
const detailHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 };
const footerStyle: React.CSSProperties = { marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" };
