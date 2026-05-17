"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowAnalytics } from "@/lib/workflow-api";

const DAY_OPTIONS = [7, 30, 90];

export default function WorkflowAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<WorkflowAnalytics | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await workflowApi.analytics(days);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "流程驾驶舱加载失败");
    }
  }, [days]);

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

  const maxDefinitionTotal = useMemo(
    () => Math.max(1, ...(data?.definitions || []).map(row => Number(row.total || 0))),
    [data],
  );
  const maxBottleneckWait = useMemo(
    () => Math.max(1, ...(data?.bottlenecks || []).map(row => Number(row.avg_waiting_hours || 0))),
    [data],
  );
  const maxTrend = useMemo(
    () => Math.max(1, ...(data?.trend || []).map(row => Number(row.started || 0))),
    [data],
  );

  return (
    <div>
      <PageHeader
        title="流程驾驶舱"
        subtitle="从流程量、通过率、平均耗时和瓶颈节点观察 OA 运转效率"
        breadcrumb={["工作流", "流程驾驶舱"]}
        actions={<Link href="/workflow/monitor" className={s.btnSecondary}>流程督办</Link>}
      />

      <section className={s.card} style={{ marginBottom: 12 }}>
        <div className={s.cardBody} style={toolbarStyle}>
          <div>
            <h3 className={s.cardTitle}>统计周期</h3>
            <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>默认观察最近 30 天，可快速切换短期和季度视角。</p>
          </div>
          <div style={tabsStyle}>
            {DAY_OPTIONS.map(value => (
              <button
                key={value}
                type="button"
                className={days === value ? s.tabPillActive : s.tabPill}
                onClick={() => setDays(value)}
              >
                最近 {value} 天
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? <div className={s.errorBanner} style={{ marginBottom: 12 }}>{error}</div> : null}

      <section className={s.card} style={{ marginBottom: 12 }}>
        <div className={s.cardBody} style={metricGridStyle}>
          <Metric label="流程总量" value={data?.summary.total ?? 0} />
          <Metric label="审批中" value={data?.summary.running ?? 0} tone="primary" />
          <Metric label="通过率" value={percentText(data?.summary.approvalRate)} tone="success" />
          <Metric label="平均耗时" value={hourText(data?.summary.avgCompleteHours)} tone="warning" />
          <Metric label="今日发起" value={data?.summary.startedToday ?? 0} />
          <Metric label="今日完成" value={data?.summary.completedToday ?? 0} />
          <Metric label="已通过" value={data?.summary.approved ?? 0} tone="success" />
          <Metric label="已驳回/取消" value={(data?.summary.rejected ?? 0) + (data?.summary.canceled ?? 0)} tone="danger" />
        </div>
      </section>

      <div style={mainGridStyle}>
        <section className={s.card}>
          <div className={s.cardBody}>
            <h3 className={s.cardTitle} style={titleStyle}>流程类型排行</h3>
            <p className={s.modalDesc} style={descStyle}>哪些流程被频繁使用，哪些还在流转中。</p>
            {(data?.definitions || []).length ? (
              <div style={rankListStyle}>
                {(data?.definitions || []).map(row => (
                  <div key={row.definition_id || row.definition_name} style={rankItemStyle}>
                    <div style={rowHeaderStyle}>
                      <strong>{row.definition_name || "未命名流程"}</strong>
                      <span>{row.total} 次</span>
                    </div>
                    <div style={barTrackStyle}>
                      <span style={{ ...barFillStyle, width: `${Math.max(4, (Number(row.total || 0) / maxDefinitionTotal) * 100)}%` }} />
                    </div>
                    <small>{row.category || "未分类"} · 审批中 {row.running} · 平均 {hourText(row.avg_complete_hours)}</small>
                  </div>
                ))}
              </div>
            ) : <Empty text="当前周期暂无流程数据。" />}
          </div>
        </section>

        <section className={s.card}>
          <div className={s.cardBody}>
            <h3 className={s.cardTitle} style={titleStyle}>节点瓶颈</h3>
            <p className={s.modalDesc} style={descStyle}>按等待时长和超时数识别容易卡住的审批节点。</p>
            {(data?.bottlenecks || []).length ? (
              <div style={rankListStyle}>
                {(data?.bottlenecks || []).map(row => (
                  <div key={row.node_id || row.node_name} style={rankItemStyle}>
                    <div style={rowHeaderStyle}>
                      <strong>{row.node_name || row.node_id || "审批节点"}</strong>
                      <span className={row.overdue_count ? `${s.badge} ${s.badgeDanger}` : `${s.badge} ${s.badgeInfo}`}>
                        {row.overdue_count ? `${row.overdue_count} 超时` : `${row.todo_count} 待办`}
                      </span>
                    </div>
                    <div style={barTrackStyle}>
                      <span style={{ ...warnBarFillStyle, width: `${Math.max(4, (Number(row.avg_waiting_hours || 0) / maxBottleneckWait) * 100)}%` }} />
                    </div>
                    <small>平均等待 {hourText(row.avg_waiting_hours)} · 待办 {row.todo_count}</small>
                  </div>
                ))}
              </div>
            ) : <Empty text="当前没有流转瓶颈。" />}
          </div>
        </section>
      </div>

      <section className={s.card} style={{ marginTop: 12 }}>
        <div className={s.cardBody}>
          <div style={rowHeaderStyle}>
            <div>
              <h3 className={s.cardTitle} style={titleStyle}>发起趋势</h3>
              <p className={s.modalDesc} style={descStyle}>按日观察流程发起量，帮助判断业务高峰和人力配置。</p>
            </div>
            <Link href="/workflow/instances" className={s.btnSecondary}>查看实例</Link>
          </div>
          {(data?.trend || []).length ? (
            <div style={trendGridStyle}>
              {(data?.trend || []).map(row => (
                <div key={row.day} style={trendItemStyle} title={`${formatDay(row.day)} 发起 ${row.started}`}>
                  <div style={trendBarBoxStyle}>
                    <span style={{ ...trendBarStyle, height: `${Math.max(8, (Number(row.started || 0) / maxTrend) * 100)}%` }} />
                  </div>
                  <small>{formatDay(row.day).slice(5)}</small>
                </div>
              ))}
            </div>
          ) : <Empty text="当前周期暂无趋势数据。" />}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "primary" | "success" | "warning" | "danger" }) {
  const valueStyle = tone === "primary" ? primaryValueStyle : tone === "success" ? successValueStyle : tone === "warning" ? warningValueStyle : tone === "danger" ? dangerValueStyle : metricValueStyle;
  return (
    <div style={metricStyle}>
      <span>{label}</span>
      <strong style={valueStyle}>{value}</strong>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className={s.emptyState}><div className={s.emptyStateText}>{text}</div></div>;
}

function percentText(value?: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function hourText(value?: number) {
  const hours = Number(value || 0);
  if (!Number.isFinite(hours) || hours <= 0) return "0 小时";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟`;
  if (hours < 24) return `${hours.toFixed(1)} 小时`;
  return `${(hours / 24).toFixed(1)} 天`;
}

function formatDay(value: string) {
  return String(value || "").slice(0, 10);
}

const toolbarStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" };
const tabsStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const metricGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 };
const metricStyle: React.CSSProperties = { minHeight: 82, padding: 14, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-page)", display: "grid", gap: 6 };
const metricValueStyle: React.CSSProperties = { fontSize: 26, lineHeight: 1, color: "var(--text-primary)" };
const primaryValueStyle: React.CSSProperties = { ...metricValueStyle, color: "var(--color-primary)" };
const successValueStyle: React.CSSProperties = { ...metricValueStyle, color: "var(--status-success)" };
const warningValueStyle: React.CSSProperties = { ...metricValueStyle, color: "var(--status-warning)" };
const dangerValueStyle: React.CSSProperties = { ...metricValueStyle, color: "var(--status-danger)" };
const mainGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 };
const titleStyle: React.CSSProperties = { margin: 0 };
const descStyle: React.CSSProperties = { margin: "4px 0 14px" };
const rankListStyle: React.CSSProperties = { display: "grid", gap: 12 };
const rankItemStyle: React.CSSProperties = { display: "grid", gap: 8, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-page)" };
const rowHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 };
const barTrackStyle: React.CSSProperties = { height: 8, borderRadius: 999, background: "var(--bg-muted)", overflow: "hidden" };
const barFillStyle: React.CSSProperties = { display: "block", height: "100%", borderRadius: 999, background: "var(--color-primary)" };
const warnBarFillStyle: React.CSSProperties = { ...barFillStyle, background: "var(--status-warning)" };
const trendGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(34px, 1fr))", gap: 8, alignItems: "end", minHeight: 160 };
const trendItemStyle: React.CSSProperties = { display: "grid", gap: 6, alignItems: "end", textAlign: "center", color: "var(--text-secondary)" };
const trendBarBoxStyle: React.CSSProperties = { height: 120, display: "flex", alignItems: "end", justifyContent: "center", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-page)", padding: 4 };
const trendBarStyle: React.CSSProperties = { display: "block", width: "100%", minHeight: 8, borderRadius: 6, background: "var(--color-primary)" };
