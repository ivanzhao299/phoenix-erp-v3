"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import { AlertTriangle, Bug, Loader2, RefreshCw, X } from "lucide-react";

type BugReportListItem = {
  bugNo: string;
  title: string;
  severity: string;
  status: string;
  priority: string;
  moduleCode: string;
  assigneeUsername: string;
  assigneeName: string;
  repairTaskNo: string;
  repairTaskStatus: string;
  route: string;
  reporterUsername: string;
  reporterName: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  attachmentCount: number;
};

type Attachment = {
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  previewEndpoint: string;
};

type BugReportDetail = BugReportListItem & {
  description: string;
  url: string;
  reporterUserId: string;
  roles: string[];
  companyCode: string;
  projectCode: string;
  consoleErrors: unknown[];
  failedRequests: unknown[];
  attachments: Attachment[];
  clientContext: Record<string, unknown>;
  resolutionNote: string;
  repairTaskPayload: Record<string, unknown>;
  updatedBy: string;
};

type AgentResult = {
  taskId?: string;
  agent?: string;
  conclusion?: string;
  commitHash?: string;
  recordedAt?: string;
  resultFile?: string;
  validationResults?: unknown;
  summary?: string;
};

type PipelineStatus = {
  generatedAt: string;
  decision: string;
  counts: {
    openTotal: number;
    byStatus: Record<string, number>;
    byRepairTaskStatus: Record<string, number>;
    staleRunning: number;
    staleApproved: number;
    hold: number;
  };
  staleRunning: Array<{ bug_no?: string; bugNo?: string; title: string; updated_at?: string; updatedAt?: string }>;
  staleApproved: Array<{ bug_no?: string; bugNo?: string; title: string; updated_at?: string; updatedAt?: string }>;
  holdReports: Array<{
    bugNo: string;
    title: string;
    severity: string;
    priority: string;
    repairTaskStatus: string;
    updatedAt: string;
    failureClassification?: { category?: string; confidence?: number; suggestedFix?: string };
    holdDispatch?: { recommendedAgents?: string[]; nextAction?: string; reason?: string };
  }>;
  alerts: Array<{ id: number; alert_type: string; severity: string; title: string; created_at: string }>;
  runtimeSummary?: {
    queueVisibleCount: number;
    blockedCount: number;
    waitingRunnerCount: number;
    runningCount: number;
    artifactReadyCount: number;
    autoRecoverableCount?: number;
    readOnlyValidationCount?: number;
    codeRepairCount?: number;
    releaseGateCount?: number;
    routeReviewCount?: number;
    queueHealthScore?: number;
    latestRunnerConclusion?: string | null;
    latestRunnerSummary?: string | null;
    latestCommitHash?: string | null;
    recommendedImmediateAction?: string;
  };
  queueItems?: Array<{
    bugNo: string;
    title: string;
    status: string;
    severity: string;
    priority: string;
    moduleCode?: string;
    repairTaskNo?: string;
    repairTaskStatus?: string;
    route?: string;
    updatedAt?: string;
    ageMinutes?: number;
    failureCategory?: string | null;
    classificationConfidence?: number | null;
    suggestedFix?: string | null;
    recommendedAgents?: string[];
    selectedAgents?: string[];
    safetyLane?: string;
    canRedispatchSafely?: boolean;
    retryCount?: number;
    redispatchCount?: number;
    lastRedispatchAt?: string | null;
    failedAttemptCount?: number;
    latestAgentConclusion?: string | null;
    latestAgentName?: string | null;
    latestRunnerConclusion?: string | null;
    latestRunnerSummary?: string | null;
    latestCommitHash?: string;
    resultFiles?: string[];
    validationSummary?: string | null;
    blockingReason?: string;
    recommendedOperation?: string;
    autoRecoveryEligible?: boolean;
    nextAction?: string;
    artifactReady?: boolean;
  }>;
};

type AutoTriageResult = {
  generatedAt: string;
  decision: string;
  processed: number;
  results: Array<{
    bugNo: string;
    action: string;
    repairTaskStatus: string;
    classification?: { category?: string; confidence?: number; suggestedFix?: string; recommendedAgents?: string[] };
  }>;
};

const STATUSES = ["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"];
type QueueLaneFilter = "ALL" | "READ_ONLY_VALIDATION" | "CODE_REPAIR" | "RELEASE_GATE" | "ROUTE_REVIEW" | "AUTO_RECOVERABLE" | "HOLD";
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const PAGE_SIZE = 20;

function token() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}

function badgeColor(value: string) {
  if (value === "CRITICAL" || value === "REJECTED") return { bg: "var(--status-danger-bg-faint)", color: "var(--status-danger)" };
  if (value === "HIGH" || value === "OPEN") return { bg: "var(--status-warning-bg-faint)", color: "var(--status-warning)" };
  if (value === "RESOLVED" || value === "CLOSED") return { bg: "var(--status-success-bg-faint)", color: "var(--status-success)" };
  if (value === "HOLD" || value === "AGENT_COMPLETED") return { bg: "var(--status-danger-bg-faint)", color: "var(--status-danger)" };
  if (value === "FIX_READY_FOR_UAT" || value === "AGENT_EXECUTION_FINISHED") return { bg: "var(--status-warning-bg-faint)", color: "var(--status-warning)" };
  if (value === "BUSINESS_VERIFIED") return { bg: "var(--status-success-bg-faint)", color: "var(--status-success)" };
  return { bg: "var(--bg-muted)", color: "var(--text-secondary)" };
}

function repairStatusLabel(value: string) {
  if (value === "AGENT_COMPLETED") return "历史完成结果（证据不足）";
  if (value === "AGENT_EXECUTION_FINISHED") return "Agent 执行结束，等待发布验证";
  if (value === "FIX_READY_FOR_UAT") return "已部署，等待业务验收";
  if (value === "BUSINESS_VERIFIED") return "业务验收通过";
  if (value === "AGENT_APPROVED") return "已批准待执行";
  if (value === "AGENT_RUNNING") return "Agent 执行中";
  if (value === "HOLD") return "HOLD 待处理";
  if (value === "ROUTED") return "待批准入队";
  if (value === "READY") return "待生成计划";
  return value || "—";
}

function workflowStatusDisabled(detail: BugReportDetail, status: string) {
  if (!detail.repairTaskNo) return false;
  if (status === "RESOLVED") return detail.repairTaskStatus !== "FIX_READY_FOR_UAT";
  if (status === "CLOSED") return !(detail.status === "RESOLVED" && detail.repairTaskStatus === "BUSINESS_VERIFIED");
  return false;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre style={{ background: "var(--bg-muted)", borderRadius: "var(--radius-md)", padding: 12, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 260, overflow: "auto" }}>
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

function asAgentResults(value: unknown): AgentResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AgentResult => Boolean(item && typeof item === "object"));
}

function timelineStatusColor(value: string) {
  const text = value.toUpperCase();
  if (/FAIL|HOLD|REJECT|ERROR/.test(text)) return "var(--status-danger)";
  if (/PASS|GO|DONE|COMPLETED|RESOLVED|SUCCESS/.test(text)) return "var(--status-success)";
  if (/APPROVED|RUNNING|IN_PROGRESS|TRIAGED|READY|ROUTED/.test(text)) return "var(--status-warning)";
  return "var(--text-secondary)";
}

function repairPayload(detail: BugReportDetail) {
  return detail.repairTaskPayload && typeof detail.repairTaskPayload === "object" ? detail.repairTaskPayload : {};
}

function BugRepairTimeline({ detail, t }: { detail: BugReportDetail; t: (key: string, fallback?: string) => string }) {
  const payload = repairPayload(detail);
  const agentPlan = payload.agentPlan && typeof payload.agentPlan === "object" ? payload.agentPlan as Record<string, unknown> : null;
  const approval = payload.agentExecutionApproval && typeof payload.agentExecutionApproval === "object" ? payload.agentExecutionApproval as Record<string, unknown> : null;
  const agentResults = asAgentResults(payload.agentResults);
  const selectedAgents = Array.isArray(agentPlan?.selected_agents) ? agentPlan.selected_agents.map(String) : [];
  const lifecycle = agentResults.filter(item => item.agent === "BugIntakeLocalRunner");
  const workerResults = agentResults.filter(item => item.agent !== "BugIntakeLocalRunner");
  const items = [
    {
      label: t("system.bugIntake.timelineUserReport", "用户提报"),
      status: "DONE",
      meta: `${detail.reporterName || detail.reporterUsername || "—"} · ${new Date(detail.createdAt).toLocaleString("zh-CN")}`,
      detail: detail.route || detail.url || "—",
    },
    {
      label: t("system.bugIntake.timelineAdminTriage", "管理员受理"),
      status: detail.status,
      meta: `${detail.priority || "P2"} · ${detail.moduleCode || t("system.bugIntake.unassignedModule", "未填模块")}`,
      detail: detail.assigneeName || detail.assigneeUsername || t("system.bugIntake.unassignedOwner", "未分派负责人"),
    },
    {
      label: t("system.bugIntake.timelineRepairTask", "修复任务包"),
      status: detail.repairTaskNo ? detail.repairTaskStatus || "READY" : "PENDING",
      meta: detail.repairTaskNo || t("system.bugIntake.notGenerated", "未生成"),
      detail: detail.repairTaskNo ? t("system.bugIntake.repairTaskPayloadReady", "已生成本地 Agent 可消费的 repair task payload") : t("system.bugIntake.waitingRepairTask", "等待管理员生成修复任务包"),
    },
    {
      label: t("system.bugIntake.timelineAgentSplit", "Agent 分工"),
      status: agentPlan ? String(agentPlan.route_decision || "PLAN_READY") : "PENDING",
      meta: selectedAgents.length ? selectedAgents.join(" / ") : t("system.bugIntake.notGenerated", "未生成"),
      detail: agentPlan ? t("system.bugIntake.agentPlanReady", "已生成 selected_agents 与 split_strategy") : t("system.bugIntake.waitingAgentPlan", "等待生成 Agent 修复计划"),
    },
    {
      label: t("system.bugIntake.timelineApproval", "执行批准"),
      status: approval?.approved ? "APPROVED" : "PENDING",
      meta: approval?.approvedBy ? `${t("system.bugIntake.approvedBy", "批准人：")}${String(approval.approvedBy)}` : t("system.bugIntake.notApproved", "未批准"),
      detail: approval?.approvalScope ? String(approval.approvalScope) : t("system.bugIntake.notQueued", "未进入本地队列"),
    },
    {
      label: t("system.bugIntake.timelineWorkerResult", "Worker 结果"),
      status: workerResults.length ? (workerResults.some(r => /HOLD|FAIL/.test(String(r.conclusion || ""))) ? "HOLD" : "EVIDENCE_RECORDED") : "PENDING",
      meta: workerResults.length ? t("system.bugIntake.agentResultCount", "{count} 条 Agent 结果").replace("{count}", String(workerResults.length)) : t("system.bugIntake.waitingLocalWorker", "等待本地 worker"),
      detail: workerResults.map(r => `${r.agent || "Agent"}: ${r.conclusion || "—"}`).join("；") || t("system.bugIntake.noAgentResult", "暂无"),
    },
    {
      label: t("system.bugIntake.timelineRunnerCi", "Runner / Push / CI"),
      status: lifecycle.length ? String(lifecycle.at(-1)?.conclusion || "RECORDED") : "PENDING",
      meta: lifecycle.at(-1)?.commitHash ? `commit ${lifecycle.at(-1)?.commitHash}` : t("system.bugIntake.waitingRunnerLifecycle", "等待 runner lifecycle"),
      detail: lifecycle.at(-1)?.summary ? String(lifecycle.at(-1)?.summary).slice(0, 240) : t("system.bugIntake.noRunnerLifecycle", "暂无本地 runner lifecycle 回写"),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 10 }}>
          <div style={{ display: "grid", justifyItems: "center" }}>
            <span style={{ width: 11, height: 11, borderRadius: 99, background: timelineStatusColor(item.status), marginTop: 4 }} />
            {index < items.length - 1 && <span style={{ width: 1, minHeight: 42, background: "var(--border)" }} />}
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 10, background: "var(--bg-muted)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <strong>{item.label}</strong>
              <span style={{ color: timelineStatusColor(item.status), fontSize: 12, fontWeight: 800 }}>{item.status}</span>
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4 }}>{item.meta}</div>
            <div style={{ fontSize: 12, marginTop: 6, wordBreak: "break-word" }}>{item.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BugReportsPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<BugReportListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<BugReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [triage, setTriage] = useState({
    status: "OPEN",
    priority: "P2",
    moduleCode: "",
    assigneeUsername: "",
    assigneeName: "",
  });
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [approvalScope, setApprovalScope] = useState("仅允许按当前 Agent 修复计划写入本地任务队列；不自动部署、不写数据库、不执行 migration。");
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [autoTriageResult, setAutoTriageResult] = useState<AutoTriageResult | null>(null);
  const [queueLaneFilter, setQueueLaneFilter] = useState<QueueLaneFilter>("ALL");

  const fetchPipelineStatus = useCallback(async () => {
    setPipelineLoading(true);
    try {
      const res = await fetch("/api/bug-intake/pipeline/status", { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) {
        const data = await res.json() as PipelineStatus;
        setPipelineStatus(data);
      }
    } finally {
      setPipelineLoading(false);
    }
  }, []);

  const fetchList = useCallback(async (nextPage = 1) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      if (status) qs.set("status", status);
      if (keyword.trim()) qs.set("keyword", keyword.trim());
      const res = await fetch(`/api/bug-intake/reports?${qs.toString()}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) {
        const data = await res.json() as { items: BugReportListItem[]; total: number };
        setRows(data.items ?? []);
        setTotal(data.total ?? 0);
        setPage(nextPage);
      }
    } finally {
      setLoading(false);
    }
  }, [keyword, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchList(1);
    void fetchPipelineStatus();
  }, [fetchList, fetchPipelineStatus]);

  const runAutoTriage = async () => {
    setPipelineLoading(true);
    try {
      const res = await fetch("/api/bug-intake/pipeline/auto-triage", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json() as AutoTriageResult & { status?: PipelineStatus };
        setAutoTriageResult(data);
        if (data.status) setPipelineStatus(data.status);
        await fetchList(page);
      }
    } finally {
      setPipelineLoading(false);
    }
  };

  const openDetail = async (bugNo: string) => {
    setDetailLoading(true);
    setDetail(null);
    setNote("");
    setAcceptanceCriteria("");
    setApprovalScope("仅允许按当前 Agent 修复计划写入本地任务队列；不自动部署、不写数据库、不执行 migration。");
    try {
      const res = await fetch(`/api/bug-intake/reports/${bugNo}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) {
        const data = await res.json() as BugReportDetail;
        setDetail(data);
        setNote(data.resolutionNote ?? "");
        setTriage({
          status: data.status || "OPEN",
          priority: data.priority || "P2",
          moduleCode: data.moduleCode || "",
          assigneeUsername: data.assigneeUsername || "",
          assigneeName: data.assigneeName || "",
        });
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const saveTriage = async (bugNo: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bug-intake/reports/${bugNo}/triage`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...triage, resolutionNote: note }),
      });
      if (res.ok) {
        const data = await res.json() as BugReportDetail;
        setDetail(data);
        setTriage({
          status: data.status || "OPEN",
          priority: data.priority || "P2",
          moduleCode: data.moduleCode || "",
          assigneeUsername: data.assigneeUsername || "",
          assigneeName: data.assigneeName || "",
        });
        await fetchList(page);
      }
    } finally {
      setSaving(false);
    }
  };

  const createRepairTask = async (bugNo: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bug-intake/reports/${bugNo}/repair-task`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ acceptanceCriteria, suggestedOwner: triage.assigneeUsername }),
      });
      if (res.ok) {
        const data = await res.json() as BugReportDetail;
        setDetail(data);
        await fetchList(page);
      }
    } finally {
      setSaving(false);
    }
  };

  const generateAgentPlan = async (bugNo: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bug-intake/reports/${bugNo}/agent-plan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json() as BugReportDetail;
        setDetail(data);
        await fetchList(page);
      }
    } finally {
      setSaving(false);
    }
  };

  const approveAgentExecution = async (bugNo: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bug-intake/reports/${bugNo}/agent-approval`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approvalScope }),
      });
      if (res.ok) {
        const data = await res.json() as BugReportDetail;
        setDetail(data);
        await fetchList(page);
      }
    } finally {
      setSaving(false);
    }
  };

  const redispatchRepairTask = async (bugNo: string, mode: "REQUEUE" | "REPLAN_AND_REQUEUE") => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bug-intake/reports/${bugNo}/redispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          approvalScope: approvalScope || t("system.bugIntake.redispatchDefaultScope", "重新派发到本地 Agent 队列；仍禁止未授权 DB 写入、migration、生产部署和 force push。"),
          note: mode === "REPLAN_AND_REQUEUE"
            ? t("system.bugIntake.replanRedispatchNote", "管理员要求重算 Agent 计划后重新派发。")
            : t("system.bugIntake.redispatchNote", "管理员要求按原 Agent 计划重新派发。"),
        }),
      });
      if (res.ok) {
        const data = await res.json() as BugReportDetail;
        setDetail(prev => prev?.bugNo === data.bugNo ? data : prev);
        await fetchList(page);
        await fetchPipelineStatus();
      }
    } finally {
      setSaving(false);
    }
  };

  const openProtectedAttachment = (endpoint: string) => {
    if (!endpoint) return;
    window.location.assign(endpoint);
  };

  const pages = Math.ceil(total / PAGE_SIZE) || 1;
  const queueItems = pipelineStatus?.queueItems ?? [];
  const filteredQueueItems = useMemo(() => {
    if (queueLaneFilter === "ALL") return queueItems;
    if (queueLaneFilter === "AUTO_RECOVERABLE") return queueItems.filter(item => item.autoRecoveryEligible);
    if (queueLaneFilter === "HOLD") return queueItems.filter(item => item.repairTaskStatus === "HOLD");
    return queueItems.filter(item => item.safetyLane === queueLaneFilter);
  }, [queueItems, queueLaneFilter]);
  const queueLaneOptions: Array<{ key: QueueLaneFilter; label: string; count: number }> = [
    { key: "ALL", label: t("system.bugIntake.queueLaneAll", "全部"), count: queueItems.length },
    { key: "READ_ONLY_VALIDATION", label: t("system.bugIntake.queueLaneReadOnly", "只读验证"), count: pipelineStatus?.runtimeSummary?.readOnlyValidationCount ?? queueItems.filter(item => item.safetyLane === "READ_ONLY_VALIDATION").length },
    { key: "CODE_REPAIR", label: t("system.bugIntake.queueLaneCodeRepair", "代码修复"), count: pipelineStatus?.runtimeSummary?.codeRepairCount ?? queueItems.filter(item => item.safetyLane === "CODE_REPAIR").length },
    { key: "RELEASE_GATE", label: t("system.bugIntake.queueLaneReleaseGate", "发布 Gate"), count: pipelineStatus?.runtimeSummary?.releaseGateCount ?? queueItems.filter(item => item.safetyLane === "RELEASE_GATE").length },
    { key: "ROUTE_REVIEW", label: t("system.bugIntake.queueLaneRouteReview", "路由复核"), count: pipelineStatus?.runtimeSummary?.routeReviewCount ?? queueItems.filter(item => item.safetyLane === "ROUTE_REVIEW").length },
    { key: "AUTO_RECOVERABLE", label: t("system.bugIntake.queueLaneAutoRecoverable", "可自恢复"), count: pipelineStatus?.runtimeSummary?.autoRecoverableCount ?? queueItems.filter(item => item.autoRecoveryEligible).length },
    { key: "HOLD", label: "HOLD", count: pipelineStatus?.counts.hold ?? queueItems.filter(item => item.repairTaskStatus === "HOLD").length },
  ];

  return (
    <div>
      <PageHeader
        title={t("system.bugIntake.adminTitle", "问题反馈")}
        subtitle={`${t("system.bugIntake.adminSubtitle", "Bug Intake 台账 · 用户页面提报 + 自动上下文采集")} · ${t("ui.共", "共")} ${total} ${t("ui.条", "条")}`}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={status} onChange={e => setStatus(e.target.value)}
              style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
              <option value="">{t("system.bugIntake.allStatuses", "全部状态")}</option>
              {STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={t("system.bugIntake.searchPlaceholder", "搜索编号 / 标题 / 页面 / 用户")}
              style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", width: 240 }} />
            <button type="button" onClick={() => fetchList(1)} disabled={loading}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", cursor: loading ? "not-allowed" : "pointer" }}>
              <RefreshCw size={14} /> {t("common.refresh", "刷新")}
            </button>
          </div>
        }
      />

      <section style={{ marginBottom: 16, display: "grid", gap: 12 }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--bg-card)", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>{t("system.bugIntake.pipelinePanelTitle", "AI 修复流水线运行面板")}</h3>
              <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: 13 }}>
                {t("system.bugIntake.pipelinePanelSubtitle", "失败自动分类、超时自恢复、HOLD 分派候选、告警通知统一看这里。")}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={fetchPipelineStatus}
                disabled={pipelineLoading}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", cursor: pipelineLoading ? "not-allowed" : "pointer" }}
              >
                <RefreshCw size={14} /> {t("system.bugIntake.refreshPanel", "刷新面板")}
              </button>
              <button
                type="button"
                onClick={runAutoTriage}
                disabled={pipelineLoading}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-md)", background: "var(--color-primary)", color: "white", cursor: pipelineLoading ? "not-allowed" : "pointer" }}
              >
                {pipelineLoading ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                {t("system.bugIntake.autoTriageRecoverDispatch", "自动分类 / 恢复 / 分派")}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(120px, 1fr))", gap: 10, marginTop: 14 }}>
            {[
              [t("system.bugIntake.pipelineOpenTotal", "总待处理"), pipelineStatus?.counts.openTotal ?? "—", "OPEN/TRIAGED/IN_PROGRESS"],
              ["HOLD", pipelineStatus?.counts.hold ?? "—", t("system.bugIntake.pipelineHoldHint", "需复核或重新分派")],
              [t("system.bugIntake.pipelineStaleRunning", "运行超时"), pipelineStatus?.counts.staleRunning ?? "—", t("system.bugIntake.pipelineStaleRunningHint", "AGENT_RUNNING 超时")],
              [t("system.bugIntake.pipelineStaleApproved", "批准待执行"), pipelineStatus?.counts.staleApproved ?? "—", t("system.bugIntake.pipelineStaleApprovedHint", "AGENT_APPROVED 超时")],
              [t("system.bugIntake.pipelineRunnerStatus", "Runner 状态"), pipelineStatus?.decision ?? "—", t("system.bugIntake.pipelineBackendDecisionHint", "后端工作流判断")],
              [t("system.bugIntake.pipelineOpenAlerts", "未处理告警"), pipelineStatus?.alerts.length ?? "—", t("system.bugIntake.pipelineAlertHint", "Bug Intake 告警")],
            ].map(([label, value, hint]) => (
              <div key={String(label)} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, background: "var(--bg-muted)", minHeight: 92 }}>
                <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{label}</div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900, color: label === "HOLD" || label === t("system.bugIntake.pipelineStaleRunning", "运行超时") ? "var(--status-danger)" : "var(--text-primary)" }}>{String(value)}</div>
                <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 11 }}>{hint}</div>
              </div>
            ))}
          </div>

          {pipelineStatus?.runtimeSummary && (
            <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, background: "var(--bg-muted)", display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(220px, 2fr)", gap: 12 }}>
              <div>
                <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t("system.bugIntake.runtimeSummaryTitle", "运行闭环摘要")}</div>
                <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 12 }}>
                  <span>{t("system.bugIntake.queueVisibleCount", "队列可见项")}：<strong>{pipelineStatus.runtimeSummary.queueVisibleCount}</strong></span>
                  <span>{t("system.bugIntake.runningCount", "执行中")}：<strong>{pipelineStatus.runtimeSummary.runningCount}</strong> · {t("system.bugIntake.waitingRunnerCount", "待 Runner 领取")}：<strong>{pipelineStatus.runtimeSummary.waitingRunnerCount}</strong></span>
                  <span>{t("system.bugIntake.artifactReadyCount", "已有修复产物")}：<strong>{pipelineStatus.runtimeSummary.artifactReadyCount}</strong></span>
                  <span>{t("system.bugIntake.autoRecoverableCount", "可自动恢复")}：<strong>{pipelineStatus.runtimeSummary.autoRecoverableCount ?? 0}</strong> · {t("system.bugIntake.queueHealthScore", "健康分")}：<strong>{pipelineStatus.runtimeSummary.queueHealthScore ?? "—"}</strong></span>
                  <span>{t("system.bugIntake.queueLaneReadOnly", "只读验证")}：<strong>{pipelineStatus.runtimeSummary.readOnlyValidationCount ?? 0}</strong> · {t("system.bugIntake.queueLaneCodeRepair", "代码修复")}：<strong>{pipelineStatus.runtimeSummary.codeRepairCount ?? 0}</strong></span>
                  <span>{t("system.bugIntake.queueLaneReleaseGate", "发布 Gate")}：<strong>{pipelineStatus.runtimeSummary.releaseGateCount ?? 0}</strong> · {t("system.bugIntake.queueLaneRouteReview", "路由复核")}：<strong>{pipelineStatus.runtimeSummary.routeReviewCount ?? 0}</strong></span>
                  <span>{t("system.bugIntake.latestRunnerConclusion", "最近 Runner 结论")}：<strong>{pipelineStatus.runtimeSummary.latestRunnerConclusion || "—"}</strong></span>
                  <span>{t("system.bugIntake.latestCommitHash", "最近提交")}：<strong style={{ fontFamily: "monospace" }}>{pipelineStatus.runtimeSummary.latestCommitHash || "—"}</strong></span>
                </div>
              </div>
              <div>
                <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t("system.bugIntake.recommendedImmediateAction", "建议立即动作")}</div>
                <strong style={{ display: "block", marginTop: 8 }}>{pipelineStatus.runtimeSummary.recommendedImmediateAction || "—"}</strong>
                {pipelineStatus.runtimeSummary.latestRunnerSummary && (
                  <div style={{ marginTop: 8, color: "var(--text-secondary)", fontSize: 12, wordBreak: "break-word" }}>{pipelineStatus.runtimeSummary.latestRunnerSummary}</div>
                )}
              </div>
            </div>
          )}

          {(pipelineStatus?.holdReports.length || autoTriageResult) && (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {autoTriageResult && (
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, background: "var(--status-info-bg-faint)" }}>
                  <strong>{t("system.bugIntake.latestAutoTriage", "最近自动处理：")}{autoTriageResult.decision}</strong>
                  <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 12 }}>
                    {t("system.bugIntake.autoTriageProcessedPrefix", "处理 ")}{autoTriageResult.processed}
                    {t("system.bugIntake.autoTriageHoldDispatchMiddle", " 条；HOLD 分派候选 ")}
                    {autoTriageResult.results.filter(item => item.action.includes("HOLD_DISPATCH")).length}
                    {t("system.bugIntake.autoTriageProcessedSuffix", " 条。")}
                  </div>
                </div>
              )}
              {pipelineStatus?.holdReports.slice(0, 5).map(item => (
                <button
                  type="button"
                  key={item.bugNo}
                  onClick={() => openDetail(item.bugNo)}
                  style={{ textAlign: "left", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, background: "var(--bg-card)", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong>{item.bugNo} · {item.title}</strong>
                    <span style={{ color: "var(--status-danger)", fontWeight: 800 }}>{item.repairTaskStatus}</span>
                  </div>
                  <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 12 }}>
                    {t("system.bugIntake.failureCategoryLabel", "分类：")}{item.failureClassification?.category || t("system.bugIntake.unclassified", "未分类")} · {t("system.bugIntake.recommendedAgentLabel", "建议 Agent：")}{item.holdDispatch?.recommendedAgents?.join(" / ") || "—"}
                  </div>
                </button>
              ))}
            </div>
          )}

          {Boolean(queueItems.length) && (
            <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              <div style={{ padding: 12, borderBottom: "1px solid var(--border)", background: "var(--bg-muted)", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <strong>{t("system.bugIntake.pipelineQueueLedger", "修复队列运行台账")}</strong>
                <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                  {t("system.bugIntake.filteredQueueCount", "当前筛选")} {filteredQueueItems.length}/{queueItems.length}
                </span>
              </div>
              <div style={{ padding: 12, borderBottom: "1px solid var(--border)", background: "var(--bg-card)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t("system.bugIntake.pipelineQueueLedgerHint", "显示卡点、重试、Agent 产物和 runner 最近回写")}</span>
                {queueLaneOptions.map(option => {
                  const active = queueLaneFilter === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setQueueLaneFilter(option.key)}
                      style={{
                        border: `1px solid ${active ? "var(--color-primary)" : "var(--border)"}`,
                        borderRadius: 999,
                        background: active ? "var(--color-primary)" : "var(--bg-muted)",
                        color: active ? "white" : "var(--text-primary)",
                        padding: "5px 10px",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {option.label} · {option.count}
                    </button>
                  );
                })}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      {[
                        t("system.bugIntake.bugNo", "编号"),
                        t("system.bugIntake.pipelineStage", "阶段"),
                        t("system.bugIntake.safetyLane", "处理分道"),
                        t("system.bugIntake.failureCategoryLabel", "分类："),
                        t("system.bugIntake.retries", "重试"),
                        t("system.bugIntake.agent", "Agent"),
                        t("system.bugIntake.runner", "Runner"),
                        t("system.bugIntake.artifacts", "产物"),
                        t("system.bugIntake.blockingReason", "阻塞原因"),
                        t("system.bugIntake.nextAction", "下一动作"),
                        t("system.bugIntake.queueActions", "操作"),
                      ].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueueItems.slice(0, 20).map(item => (
                      <tr key={item.bugNo} onClick={() => openDetail(item.bugNo)} style={{ cursor: "pointer" }}>
                        <td>
                          <strong style={{ color: "var(--color-primary)", fontFamily: "monospace" }}>{item.bugNo}</strong>
                          <div style={{ color: "var(--text-secondary)", fontSize: 11, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                        </td>
                        <td>
                          <strong style={{ color: timelineStatusColor(item.repairTaskStatus || item.status || "") }}>{item.repairTaskStatus || item.status || "—"}</strong>
                          <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>{item.ageMinutes ?? 0} {t("system.bugIntake.minutesAgo", "分钟前更新")}</div>
                        </td>
                        <td>
                          <strong>{t(`system.bugIntake.safetyLane.${item.safetyLane || "ROUTE_REVIEW"}`, item.safetyLane || "ROUTE_REVIEW")}</strong>
                          <div style={{ color: item.canRedispatchSafely ? "var(--status-success)" : "var(--status-warning)", fontSize: 11, fontWeight: 800 }}>
                            {item.canRedispatchSafely
                              ? t("system.bugIntake.safeRedispatchAllowed", "可安全重派")
                              : t("system.bugIntake.gateRequiredBeforeRedispatch", "需 Gate 后重派")}
                          </div>
                        </td>
                        <td>
                          <strong>{item.failureCategory || t("system.bugIntake.unclassified", "未分类")}</strong>
                          <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>{item.classificationConfidence ? `${Math.round(item.classificationConfidence * 100)}%` : "—"}</div>
                        </td>
                        <td>
                          <strong>{item.retryCount ?? 0}</strong>
                          <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>{t("system.bugIntake.failedAttempts", "失败尝试")} {item.failedAttemptCount ?? 0}</div>
                          <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>{t("system.bugIntake.redispatchCount", "重派")} {item.redispatchCount ?? 0}</div>
                        </td>
                        <td style={{ maxWidth: 220 }}>
                          <strong>{item.latestAgentName || item.selectedAgents?.[0] || "—"}</strong>
                          <div style={{ color: "var(--text-secondary)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.recommendedAgents?.join(" / ") || item.selectedAgents?.join(" / ") || "—"}</div>
                        </td>
                        <td style={{ maxWidth: 180 }}>
                          <strong>{item.latestRunnerConclusion || item.latestAgentConclusion || "—"}</strong>
                          <div style={{ color: "var(--text-secondary)", fontSize: 11, fontFamily: "monospace" }}>{item.latestCommitHash || "—"}</div>
                        </td>
                        <td>
                          <strong>{item.artifactReady ? t("system.bugIntake.artifactReady", "已回写") : t("system.bugIntake.artifactPending", "待回写")}</strong>
                          <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>{item.resultFiles?.length || 0} {t("system.bugIntake.files", "个文件")}</div>
                        </td>
                        <td style={{ maxWidth: 260, fontSize: 12, wordBreak: "break-word" }}>
                          <strong style={{ color: item.autoRecoveryEligible ? "var(--status-warning)" : "var(--text-primary)" }}>
                            {item.autoRecoveryEligible ? t("system.bugIntake.autoRecoveryEligible", "可自动恢复") : t("system.bugIntake.manualReviewOrClear", "常规处理")}
                          </strong>
                          <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>{item.blockingReason || "—"}</div>
                        </td>
                        <td style={{ maxWidth: 300, color: "var(--text-secondary)", fontSize: 12, wordBreak: "break-word" }}>
                          <strong style={{ color: "var(--text-primary)" }}>{item.recommendedOperation || "—"}</strong>
                          <div style={{ marginTop: 4 }}>{item.nextAction || "—"}</div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                redispatchRepairTask(item.bugNo, "REQUEUE");
                              }}
                              disabled={saving || !item.repairTaskNo || !item.canRedispatchSafely}
                              style={{ padding: "5px 9px", border: "1px solid var(--status-success)", borderRadius: "var(--radius-sm)", background: item.canRedispatchSafely ? "var(--status-success)" : "var(--bg-muted)", color: item.canRedispatchSafely ? "white" : "var(--text-secondary)", cursor: saving || !item.repairTaskNo || !item.canRedispatchSafely ? "not-allowed" : "pointer", fontSize: 12 }}
                            >
                              {t("system.bugIntake.redispatchOriginal", "重新派发")}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                redispatchRepairTask(item.bugNo, "REPLAN_AND_REQUEUE");
                              }}
                              disabled={saving || !item.repairTaskNo}
                              style={{ padding: "5px 9px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", color: "var(--text-primary)", cursor: saving || !item.repairTaskNo ? "not-allowed" : "pointer", fontSize: 12 }}
                            >
                              {t("system.bugIntake.replanAndRedispatch", "重算后派发")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table className={s.table}>
          <thead>
            <tr>
              {[
                t("system.bugIntake.bugNo", "编号"),
                t("system.bugIntake.title", "标题"),
                t("system.bugIntake.priority", "优先级"),
                t("system.bugIntake.severity", "严重程度"),
                t("common.status", "状态"),
                t("system.bugIntake.module", "模块"),
                t("system.bugIntake.assignee", "负责人"),
                t("system.bugIntake.repairTask", "修复任务"),
                t("system.bugIntake.page", "页面"),
                t("system.bugIntake.reporter", "提报人"),
                t("system.bugIntake.screenshots", "截图"),
                t("system.bugIntake.createdAt", "创建时间"),
              ].map(h => <th key={h} className={u.nowrap}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: "center", padding: 48 }}><Loader2 size={22} className="animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}><Bug size={26} /><p>{t("system.bugIntake.empty", "暂无问题反馈")}</p></td></tr>
            ) : rows.map(row => {
              const sev = badgeColor(row.severity);
              const st = badgeColor(row.status);
              const priority = badgeColor(row.priority);
              return (
                <tr key={row.bugNo} onClick={() => openDetail(row.bugNo)} style={{ cursor: "pointer" }}>
                  <td style={{ fontFamily: "monospace", color: "var(--color-primary)", fontWeight: 800 }}>{row.bugNo}</td>
                  <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</td>
                  <td><span style={{ ...priority, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800 }}>{row.priority || "P2"}</span></td>
                  <td><span style={{ ...sev, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800 }}>{row.severity}</span></td>
                  <td><span style={{ ...st, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800 }}>{row.status}</span></td>
                  <td>{row.moduleCode || "—"}</td>
                  <td>{row.assigneeName || row.assigneeUsername || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{row.repairTaskNo || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.route || "—"}</td>
                  <td>{row.reporterName || row.reporterUsername || "—"}</td>
                  <td>{row.attachmentCount}</td>
                  <td style={{ whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: 12 }}>{new Date(row.createdAt).toLocaleString("zh-CN")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => fetchList(page - 1)}>{t("ui.上一页", "上一页")}</button>
          <span style={{ lineHeight: "28px", color: "var(--text-secondary)" }}>{t("ui.第", "第")} {page} / {pages} {t("ui.页", "页")}</span>
          <button disabled={page >= pages} onClick={() => fetchList(page + 1)}>{t("ui.下一页", "下一页")}</button>
        </div>
      )}

      {(detail || detailLoading) && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "var(--overlay-mask)", display: "flex", justifyContent: "flex-end" }} onMouseDown={() => setDetail(null)}>
          <div style={{ width: 720, maxWidth: "94vw", height: "100%", background: "var(--bg-card)", overflowY: "auto", borderLeft: "1px solid var(--border)" }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ padding: 22, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ color: "var(--color-primary)", fontWeight: 800, fontFamily: "monospace" }}>{detail?.bugNo ?? t("common.loading", "加载中")}</div>
                <h3 style={{ margin: "6px 0 0", fontSize: 18 }}>{detail?.title ?? t("system.bugIntake.detailTitle", "问题详情")}</h3>
              </div>
              <button type="button" onClick={() => setDetail(null)} style={{ border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div style={{ padding: 48, textAlign: "center" }}><Loader2 size={24} className="animate-spin" /></div>
            ) : detail && (
              <div style={{ padding: 22, display: "grid", gap: 18 }}>
                <section style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.pageUrl", "页面地址")}</span><strong style={{ wordBreak: "break-all" }}>{detail.url || detail.route || "—"}</strong>
                  <span style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.userRoles", "用户 / 角色")}</span><strong>{detail.reporterName || detail.reporterUsername} · {(detail.roles ?? []).join(", ") || "—"}</strong>
                  <span style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.companyProject", "公司 / 项目")}</span><strong>{detail.companyCode || "—"} / {detail.projectCode || "—"}</strong>
                  <span style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.description", "说明")}</span><span style={{ whiteSpace: "pre-wrap" }}>{detail.description || "—"}</span>
                </section>

                <section>
                  <h4>{t("system.bugIntake.timeline", "闭环时间线")}</h4>
                  <BugRepairTimeline detail={detail} t={t} />
                </section>

                <section>
                  <h4>{t("system.bugIntake.triageTitle", "受理与分派")}</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t("system.bugIntake.processingStatus", "处理状态")}</span>
                      <select value={triage.status} onChange={e => setTriage(prev => ({ ...prev, status: e.target.value }))} disabled={saving}
                        style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                        {STATUSES.map(item => (
                          <option key={item} value={item} disabled={workflowStatusDisabled(detail, item)}>
                            {item}{workflowStatusDisabled(detail, item) ? ` · ${t("system.bugIntake.evidenceRequired", "需先通过证据门禁")}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t("system.bugIntake.priority", "优先级")}</span>
                      <select value={triage.priority} onChange={e => setTriage(prev => ({ ...prev, priority: e.target.value }))} disabled={saving}
                        style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                        {PRIORITIES.map(item => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t("system.bugIntake.module", "模块")}</span>
                      <input value={triage.moduleCode} onChange={e => setTriage(prev => ({ ...prev, moduleCode: e.target.value }))}
                        placeholder={t("system.bugIntake.modulePlaceholder", "例如 PROCUREMENT / FINANCE / MOBILE")}
                        style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t("system.bugIntake.assignee", "负责人")}</span>
                      <input value={triage.assigneeUsername} onChange={e => setTriage(prev => ({ ...prev, assigneeUsername: e.target.value }))}
                        placeholder={t("system.bugIntake.assigneePlaceholder", "负责人用户名")}
                        style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }} />
                    </label>
                    <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
                      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t("system.bugIntake.assigneeName", "负责人姓名")}</span>
                      <input value={triage.assigneeName} onChange={e => setTriage(prev => ({ ...prev, assigneeName: e.target.value }))}
                        placeholder={t("system.bugIntake.assigneeNamePlaceholder", "可选")}
                        style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }} />
                    </label>
                  </div>
                  <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={t("system.bugIntake.resolutionPlaceholder", "处理备注 / 复现结论")}
                    style={{ width: "100%", minHeight: 80, marginTop: 10, padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", color: "var(--text-primary)" }} />
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                    <button type="button" onClick={() => saveTriage(detail.bugNo)} disabled={saving}
                      style={{ padding: "8px 14px", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-md)", background: "var(--color-primary)", color: "white", cursor: saving ? "not-allowed" : "pointer" }}>
                      {t("system.bugIntake.saveTriage", "保存受理信息")}
                    </button>
                    {saving && <Loader2 size={16} className="animate-spin" />}
                  </div>
                </section>

                <section>
                  <h4>{t("system.bugIntake.repairTaskTitle", "修复任务包")}</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, fontSize: 13, marginBottom: 10 }}>
                    <span style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.repairTask", "修复任务")}</span><strong>{detail.repairTaskNo || "—"}</strong>
                    <span style={{ color: "var(--text-secondary)" }}>{t("common.status", "状态")}</span><strong>{repairStatusLabel(detail.repairTaskStatus)}</strong>
                    <span style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.redispatchCount", "重派")}</span><strong>{String((detail.repairTaskPayload?.redispatchCount as number | undefined) ?? 0)}</strong>
                  </div>
                  {["AGENT_COMPLETED", "AGENT_EXECUTION_FINISHED", "FIX_READY_FOR_UAT"].includes(detail.repairTaskStatus) && (
                    <div style={{ marginBottom: 12, padding: 12, border: "1px solid var(--status-warning)", borderRadius: "var(--radius-md)", background: "var(--status-warning-bg-faint)", color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6 }}>
                      <strong>{detail.repairTaskStatus === "FIX_READY_FOR_UAT"
                        ? t("system.bugIntake.fixReadyForUatTitle", "技术发布验证已通过，等待业务验收。")
                        : t("system.bugIntake.agentCompletedVerifyTitle", "Agent 执行结束，但问题尚未证明已解决。")}</strong>
                      <div>{t("system.bugIntake.agentCompletedVerifyText", "只有实现证据、CI/CD 和生产 smoke 全部通过后才能进入业务验收；业务验收通过后才能标记已解决，再关闭问题。证据不足或问题仍存在时请重新派发。")}</div>
                    </div>
                  )}
                  <textarea value={acceptanceCriteria} onChange={e => setAcceptanceCriteria(e.target.value)}
                    placeholder={t("system.bugIntake.acceptancePlaceholder", "验收标准：例如复现路径、期望结果、必须通过的检查")}
                    style={{ width: "100%", minHeight: 72, padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", color: "var(--text-primary)" }} />
                  <button type="button" onClick={() => createRepairTask(detail.bugNo)} disabled={saving}
                    style={{ marginTop: 10, padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", color: "var(--text-primary)", cursor: saving ? "not-allowed" : "pointer" }}>
                    {detail.repairTaskNo ? t("system.bugIntake.refreshRepairTask", "更新修复任务包") : t("system.bugIntake.createRepairTask", "生成修复任务包")}
                  </button>
                  <button type="button" onClick={() => generateAgentPlan(detail.bugNo)} disabled={saving || !detail.repairTaskNo}
                    style={{ marginTop: 10, marginLeft: 10, padding: "8px 14px", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-md)", background: "var(--color-primary)", color: "white", cursor: saving || !detail.repairTaskNo ? "not-allowed" : "pointer" }}>
                    {t("system.bugIntake.generateAgentPlan", "生成 Agent 修复计划")}
                  </button>
                  <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t("system.bugIntake.agentApprovalScope", "Agent 执行批准范围")}</span>
                    <textarea
                      value={approvalScope}
                      onChange={e => setApprovalScope(e.target.value)}
                      placeholder={t("system.bugIntake.agentApprovalPlaceholder", "例如：仅允许按当前计划写入队列，先 dry-run，不自动部署")}
                      style={{ width: "100%", minHeight: 64, padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", color: "var(--text-primary)" }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => approveAgentExecution(detail.bugNo)}
                    disabled={saving || !detail.repairTaskPayload?.agentPlan}
                    style={{ marginTop: 10, padding: "8px 14px", border: "1px solid var(--status-success)", borderRadius: "var(--radius-md)", background: "var(--status-success)", color: "white", cursor: saving || !detail.repairTaskPayload?.agentPlan ? "not-allowed" : "pointer" }}
                  >
                    {t("system.bugIntake.approveAgentQueue", "批准投入 Agent 队列")}
                  </button>
                  <button
                    type="button"
                    onClick={() => redispatchRepairTask(detail.bugNo, "REQUEUE")}
                    disabled={saving || !detail.repairTaskNo}
                    style={{ marginTop: 10, marginLeft: 10, padding: "8px 14px", border: "1px solid var(--status-success)", borderRadius: "var(--radius-md)", background: "var(--status-success)", color: "white", cursor: saving || !detail.repairTaskNo ? "not-allowed" : "pointer" }}
                  >
                    {t("system.bugIntake.redispatchOriginal", "重新派发原任务")}
                  </button>
                  <button
                    type="button"
                    onClick={() => redispatchRepairTask(detail.bugNo, "REPLAN_AND_REQUEUE")}
                    disabled={saving || !detail.repairTaskNo}
                    style={{ marginTop: 10, marginLeft: 10, padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", color: "var(--text-primary)", cursor: saving || !detail.repairTaskNo ? "not-allowed" : "pointer" }}
                  >
                    {t("system.bugIntake.replanAndRedispatch", "重算计划并重新派发")}
                  </button>
                  <p style={{ margin: "8px 0 0", color: "var(--text-secondary)", fontSize: 12 }}>
                    {t("system.bugIntake.agentApprovalNote", "审批只记录授权；实际队列写入由本地 Agent Factory 脚本执行，仍受 dry-run / apply 和安全门禁控制。")}
                  </p>
                  {Array.isArray(detail.repairTaskPayload?.redispatchHistory) && (
                    <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, background: "var(--bg-muted)" }}>
                      <strong>{t("system.bugIntake.redispatchHistory", "重新派发历史")}</strong>
                      <JsonBlock value={detail.repairTaskPayload.redispatchHistory} />
                    </div>
                  )}
                  {Array.isArray(detail.repairTaskPayload?.agentResults) && (
                    <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12 }}>
                      <strong>{t("system.bugIntake.agentResults", "Agent 执行结果")}</strong>
                      <JsonBlock value={detail.repairTaskPayload.agentResults} />
                    </div>
                  )}
                  {detail.repairTaskPayload && Object.keys(detail.repairTaskPayload).length > 0 && <JsonBlock value={detail.repairTaskPayload} />}
                </section>

                <section>
                  <h4>{t("system.bugIntake.attachments", "截图 / 附件")}</h4>
                  {detail.attachments?.length ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      {detail.attachments.map(file => (
                        <div key={file.fileName} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 10 }}>
                          <button
                            type="button"
                            onClick={() => openProtectedAttachment(file.previewEndpoint)}
                            style={{ border: 0, background: "transparent", color: "var(--color-primary)", fontWeight: 700, cursor: "pointer", padding: 0 }}
                          >
                            {file.originalName}
                          </button>
                          <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{file.mimeType} · {Math.round(file.sizeBytes / 1024)} KB</div>
                          {file.mimeType?.startsWith("image/") && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={file.previewEndpoint} alt={file.originalName} style={{ marginTop: 10, maxWidth: "100%", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }} />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.noScreenshots", "未上传截图。")}</p>}
                </section>

                <section>
                  <h4><AlertTriangle size={16} /> {t("system.bugIntake.recentConsoleErrors", "最近 Console Error")}</h4>
                  <JsonBlock value={detail.consoleErrors} />
                </section>
                <section>
                  <h4>{t("system.bugIntake.recentFailedRequests", "最近失败接口")}</h4>
                  <JsonBlock value={detail.failedRequests} />
                </section>
                <section>
                  <h4>{t("system.bugIntake.clientContext", "客户端上下文")}</h4>
                  <JsonBlock value={detail.clientContext} />
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
