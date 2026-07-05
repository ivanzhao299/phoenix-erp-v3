"use client";

import { useCallback, useEffect, useState } from "react";
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

const STATUSES = ["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"];
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
  return { bg: "var(--bg-muted)", color: "var(--text-secondary)" };
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

function BugRepairTimeline({ detail }: { detail: BugReportDetail }) {
  const payload = repairPayload(detail);
  const agentPlan = payload.agentPlan && typeof payload.agentPlan === "object" ? payload.agentPlan as Record<string, unknown> : null;
  const approval = payload.agentExecutionApproval && typeof payload.agentExecutionApproval === "object" ? payload.agentExecutionApproval as Record<string, unknown> : null;
  const agentResults = asAgentResults(payload.agentResults);
  const selectedAgents = Array.isArray(agentPlan?.selected_agents) ? agentPlan.selected_agents.map(String) : [];
  const lifecycle = agentResults.filter(item => item.agent === "BugIntakeLocalRunner");
  const workerResults = agentResults.filter(item => item.agent !== "BugIntakeLocalRunner");
  const items = [
    {
      label: "用户提报",
      status: "DONE",
      meta: `${detail.reporterName || detail.reporterUsername || "—"} · ${new Date(detail.createdAt).toLocaleString("zh-CN")}`,
      detail: detail.route || detail.url || "—",
    },
    {
      label: "管理员受理",
      status: detail.status,
      meta: `${detail.priority || "P2"} · ${detail.moduleCode || "未填模块"}`,
      detail: detail.assigneeName || detail.assigneeUsername || "未分派负责人",
    },
    {
      label: "修复任务包",
      status: detail.repairTaskNo ? detail.repairTaskStatus || "READY" : "PENDING",
      meta: detail.repairTaskNo || "未生成",
      detail: detail.repairTaskNo ? "已生成本地 Agent 可消费的 repair task payload" : "等待管理员生成修复任务包",
    },
    {
      label: "Agent 分工",
      status: agentPlan ? String(agentPlan.route_decision || "PLAN_READY") : "PENDING",
      meta: selectedAgents.length ? selectedAgents.join(" / ") : "未生成",
      detail: agentPlan ? "已生成 selected_agents 与 split_strategy" : "等待生成 Agent 修复计划",
    },
    {
      label: "执行批准",
      status: approval?.approved ? "APPROVED" : "PENDING",
      meta: approval?.approvedBy ? `批准人：${String(approval.approvedBy)}` : "未批准",
      detail: approval?.approvalScope ? String(approval.approvalScope) : "未进入本地队列",
    },
    {
      label: "Worker 结果",
      status: workerResults.length ? (workerResults.some(r => /HOLD|FAIL/.test(String(r.conclusion || ""))) ? "HOLD" : "COMPLETED") : "PENDING",
      meta: workerResults.length ? `${workerResults.length} 条 Agent 结果` : "等待本地 worker",
      detail: workerResults.map(r => `${r.agent || "Agent"}: ${r.conclusion || "—"}`).join("；") || "暂无",
    },
    {
      label: "Runner / Push / CI",
      status: lifecycle.length ? String(lifecycle.at(-1)?.conclusion || "RECORDED") : "PENDING",
      meta: lifecycle.at(-1)?.commitHash ? `commit ${lifecycle.at(-1)?.commitHash}` : "等待 runner lifecycle",
      detail: lifecycle.at(-1)?.summary ? String(lifecycle.at(-1)?.summary).slice(0, 240) : "暂无本地 runner lifecycle 回写",
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
  }, [fetchList]);

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

  const openProtectedAttachment = (endpoint: string) => {
    if (!endpoint) return;
    window.location.assign(endpoint);
  };

  const pages = Math.ceil(total / PAGE_SIZE) || 1;

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
                <div style={{ color: "var(--color-primary)", fontWeight: 800, fontFamily: "monospace" }}>{detail?.bugNo ?? "加载中"}</div>
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
                  <BugRepairTimeline detail={detail} />
                </section>

                <section>
                  <h4>{t("system.bugIntake.triageTitle", "受理与分派")}</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{t("system.bugIntake.processingStatus", "处理状态")}</span>
                      <select value={triage.status} onChange={e => setTriage(prev => ({ ...prev, status: e.target.value }))} disabled={saving}
                        style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                        {STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
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
                    <span style={{ color: "var(--text-secondary)" }}>{t("common.status", "状态")}</span><strong>{detail.repairTaskStatus || "—"}</strong>
                  </div>
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
                  <p style={{ margin: "8px 0 0", color: "var(--text-secondary)", fontSize: 12 }}>
                    {t("system.bugIntake.agentApprovalNote", "审批只记录授权；实际队列写入由本地 Agent Factory 脚本执行，仍受 dry-run / apply 和安全门禁控制。")}
                  </p>
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
