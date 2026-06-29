"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowTaskSummary } from "@/lib/workflow-api";
import { WorkflowMetricsStrip } from "@/components/workflow/WorkflowMetricsStrip";
import { actionPill, primaryActionButton, detailInfoBox } from "@/components/design-system/cockpit-styles";
import { useLanguage } from "@/contexts/LanguageContext";

const smartScenarios = [
  ["采购申请", "PURCHASE_APPROVAL", "采购", "自动带出物料、数量、预算和采购原因草稿"],
  ["费用报销", "EXPENSE_APPROVAL", "财务", "自动生成报销金额、费用类型、门店和事由"],
  ["库存调整", "STOCK_ADJUST_APPROVAL", "仓储", "自动补齐仓库/物料、调整数量和调整原因"],
  ["门店折扣", "STORE_DISCOUNT_APPROVAL", "门店", "自动生成门店、折扣比例和申请原因"],
];

const userLinks = [
  ["发起申请", "/workflow/start", "选择流程，填写表单并提交审批"],
  ["我的待办", "/workflow/tasks/todo", "处理分配给我的审批任务"],
  ["抄送我的", "/workflow/tasks/cc", "查看抄送给我的流程知会"],
  ["我的已办", "/workflow/tasks/done", "查看已经处理过的审批记录"],
  ["流程实例", "/workflow/instances", "跟踪我发起的流程进度"],
];

const adminLinks = [
  ["流程搭建", "/workflow/builder", "用向导式工作区快速生成自定义流程"],
  ["流程定义", "/workflow/definitions", "管理员维护审批节点、条件和发布版本"],
  ["表单定义", "/workflow/forms", "管理员维护可视化表单和字段"],
  ["数据源", "/workflow/data-sources", "管理员维护表单下拉和引用数据"],
  ["流程督办", "/workflow/monitor", "查看流转卡点、超时任务和催办记录"],
  ["流程驾驶舱", "/workflow/analytics", "查看流程效率、通过率和瓶颈分析"],
];

export default function WorkflowHomePage() {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<WorkflowTaskSummary | null>(null);

  useEffect(() => {
    workflowApi.taskSummary().then(res => setSummary(res.data)).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title={t('ui.审批工作台','审批工作台')} subtitle={t('ui.我的待办优先 · SLA 实时监控 · 业务驱动审批 · 智能发起常用流程','我的待办优先 · SLA 实时监控 · 业务驱动审批 · 智能发起常用流程')} breadcrumb={[t('ui.审批工作台','审批工作台')]} />

      {/* UIX-PROD-1 审批工作台化：第一眼是"我要做什么" */}
      <section style={{ ...detailInfoBox, background: "var(--bg-card)", marginBottom: 12 }}>
        <div style={metricGridStyle}>
          <Metric label={t('ui.我的待办','我的待办')} value={summary?.todo ?? 0} href="/workflow/tasks/todo" tone="primary" />
          <Metric label={t('ui.抄送未读','抄送未读')} value={summary?.ccUnread ?? 0} href="/workflow/tasks/cc" tone="warning" />
          <Metric label={t('ui.超时待办','超时待办')} value={summary?.overdueTodo ?? 0} href="/workflow/monitor" tone="danger" />
          <Metric label={t('ui.我发起进行中','我发起进行中')} value={summary?.startedRunning ?? 0} href="/workflow/instances?status=RUNNING" />
        </div>
      </section>

      {/* 第二行：SLA 实时监控 */}
      <WorkflowMetricsStrip />

      {/* 第三行：智能发起 */}
      <section style={aiWorkbenchStyle}>
        <div style={aiHeaderStyle}>
          <div>
            <span style={actionPill("success")}>{t('ui.智能发起','智能发起')}</span>
            <h3 style={aiTitleStyle}>{t('ui.常用业务一键提单','常用业务一键提单')}</h3>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>
              {t('ui.选择业务场景，系统自动选择对应流程并预填表单字段，缩短发起耗时。','选择业务场景，系统自动选择对应流程并预填表单字段，缩短发起耗时。')}
            </p>
          </div>
          <Link href="/workflow/start?smart=1" style={{ ...primaryActionButton, textDecoration: "none" }}>{t('ui.更多场景','更多场景')}</Link>
        </div>
        <div style={scenarioGridStyle}>
          {smartScenarios.map(([label, code, category, desc]) => (
            <Link key={code} href={`/workflow/start?code=${code}&smart=1`} style={scenarioCardStyle}>
              <span style={actionPill("default")}>{category}</span>
              <strong>{label}</strong>
              <span>{desc}</span>
              <b>{t('ui.选择并生成草稿','选择并生成草稿')}</b>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ ...detailInfoBox, background: "var(--bg-card)", marginBottom: 12 }}>
        <h3 style={{ ...titleStyle, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{t('ui.日常使用','日常使用')}</h3>
        <div style={gridStyle}>
          {userLinks.map(([label, href, desc]) => (
            <Link key={href} href={href} style={cardStyle}>
              <span style={cardTitleStyle}>{label}</span>
              <span style={cardDescStyle}>{desc}</span>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ ...detailInfoBox, background: "var(--bg-card)" }}>
        <h3 style={{ ...titleStyle, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{t('ui.管理员配置','管理员配置')}</h3>
        <div style={gridStyle}>
          {adminLinks.map(([label, href, desc]) => (
            <Link key={href} href={href} style={cardStyle}>
              <span style={cardTitleStyle}>{label}</span>
              <span style={cardDescStyle}>{desc}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, href, tone }: { label: string; value: number; href: string; tone?: "primary" | "warning" | "danger" }) {
  return (
    <Link href={href} style={metricStyle}>
      <span>{label}</span>
      <strong style={tone === "primary" ? metricPrimaryValueStyle : tone === "warning" ? metricWarningValueStyle : tone === "danger" ? metricDangerValueStyle : metricValueStyle}>{value}</strong>
    </Link>
  );
}

const aiWorkbenchStyle: React.CSSProperties = { padding: 18, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", marginBottom: 12 };
const aiHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 };
const aiTitleStyle: React.CSSProperties = { margin: "8px 0 6px", fontSize: 22, fontWeight: 900, color: "var(--text-primary)" };
const scenarioGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 };
const scenarioCardStyle: React.CSSProperties = { display: "grid", gap: 8, minHeight: 132, padding: 14, border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-page)", color: "var(--text-primary)", textDecoration: "none" };
const sectionStyle: React.CSSProperties = { marginBottom: 12 };
const titleStyle: React.CSSProperties = { margin: "0 0 12px" };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 };
const metricGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 };
const metricStyle: React.CSSProperties = { minHeight: 82, padding: 14, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-secondary)", textDecoration: "none", display: "grid", gap: 6 };
const metricValueStyle: React.CSSProperties = { fontSize: 26, lineHeight: 1, color: "var(--text-primary)" };
const metricPrimaryValueStyle: React.CSSProperties = { ...metricValueStyle, color: "var(--color-primary)" };
const metricWarningValueStyle: React.CSSProperties = { ...metricValueStyle, color: "var(--status-warning)" };
const metricDangerValueStyle: React.CSSProperties = { ...metricValueStyle, color: "var(--status-danger)" };
const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 92,
  padding: 16,
  border: "1px solid var(--border)",
  borderRadius: "8px",
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  textDecoration: "none",
};
const cardTitleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 800 };
const cardDescStyle: React.CSSProperties = { color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 };
