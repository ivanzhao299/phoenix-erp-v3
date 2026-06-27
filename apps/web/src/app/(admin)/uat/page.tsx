"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import { PageHeaderV2, KpiCard } from "@/components/design-system";
import type { AccentColor } from "@/lib/design-tokens";

// 将 var(--status-*) 颜色提示映射为 KpiCard accentColor 枚举
function accentFromVar(v?: string): AccentColor {
  if (!v) return "slate";
  if (v.includes("danger")) return "red";
  if (v.includes("success")) return "green";
  if (v.includes("warning")) return "amber";
  if (v.includes("accent") || v.includes("primary")) return "blue";
  return "slate";
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") ?? "" : "";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${tok()}`
});
const MODULE_LABELS: Record<string, string> = {
  PROCUREMENT: "采购管理",
  FINANCE: "财务管理",
  SALES: "销售管理",
  DELIVERY: "配送管理",
  INVENTORY: "库存管理",
  APPROVAL: "审批流程"
};
const SEVERITY_COLOR: Record<string, string> = {
  LOW: "var(--text-secondary)",
  MEDIUM: "var(--color-accent)",
  HIGH: "var(--status-warning)",
  CRITICAL: "var(--status-danger)"
};
const STATUS_COLOR: Record<string, string> = {
  OPEN: "var(--color-accent)",
  IN_PROGRESS: "var(--status-warning)",
  RESOLVED: "var(--status-success)",
  CLOSED: "var(--text-secondary)",
  REJECTED: "var(--status-danger)"
};
// g200n: DB enum → 中文标签([[feedback-hardcoded-english-to-chinese]])
const STATUS_LABEL: Record<string, string> = {
  OPEN:        "待处理",
  IN_PROGRESS: "处理中",
  RESOLVED:    "已解决",
  CLOSED:      "已关闭",
  REJECTED:    "已驳回",
};
const SEVERITY_LABEL: Record<string, string> = {
  LOW:      "低",
  MEDIUM:   "中",
  HIGH:     "高",
  CRITICAL: "严重",
};
function Badge({
  label,
  color
}: {
  label: string;
  color: string;
}) {
  return <span style={{
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-on-dark)",
    background: color,
    whiteSpace: "nowrap"
  }}>
      {label}
    </span>;
}

// UI-2.4：本地 MetricCard 收口为 design-system KpiCard（调用点不变，零功能风险）
function MetricCard({
  title,
  value,
  borderColor,
  valueColor,
  sub
}: {
  title: string;
  value: string | number;
  borderColor?: string;
  valueColor?: string;
  sub?: string;
}) {
  return <div style={{
    flex: 1,
    minWidth: 140
  }}>
      <KpiCard title={title} value={value} subValue={sub} accentColor={accentFromVar(valueColor ?? borderColor)} />
    </div>;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface FeedbackSummary {
  openCount: number;
  inProgressCount: number;
  resolvedCount: number;
  criticalCount: number;
  highCount: number;
}
interface Feedback {
  id: number;
  feedbackNo: string;
  title: string;
  moduleCode: string;
  feedbackType: string;
  severity: string;
  status: string;
  reporterName: string;
  assigneeName?: string;
  createdAt: string;
}
interface TrainingSummary {
  totalCount: number;
  byType: Record<string, number>;
}
interface Training {
  id: number;
  trainingNo: string;
  trainingType: string;
  trainingTitle: string;
  trainerName: string;
  participantCount: number;
  trainingDate: string;
  score?: number;
  remark?: string;
}
interface ChecklistItem {
  id: number;
  itemCode: string;
  itemName: string;
  status: string;
  remark?: string;
  priority: string;
}
interface ChecklistGroup {
  moduleCode: string;
  items: ChecklistItem[];
}
interface ChecklistProgress {
  moduleCode: string;
  total: number;
  passed: number;
  passPct: number;
}
interface PilotRun {
  id: number;
  runNo: string;
  companyCode: string;
  siteName: string;
  runStartDate: string;
  runEndDate?: string;
  status: string;
  orderCount: number;
  deliveryCount: number;
  receiptCount: number;
  returnCount: number;
  issueCount: number;
  remark?: string;
}
interface PilotRunSummary {
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
}
interface ReadinessDimension {
  dimensionName: string;
  weight: number;
  passed: number;
  total: number;
  score: number;
  weighted: number;
}
interface Readiness {
  score: number;
  status: string;
  hasCriticalIssues: boolean;
  dimensions: ReadinessDimension[];
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
type TabKey = "feedbacks" | "trainings" | "checklists" | "pilot" | "readiness";
const TABS: {
  key: TabKey;
  label: string;
}[] = [{
  key: "feedbacks",
  label: "问题反馈"
}, {
  key: "trainings",
  label: "培训记录"
}, {
  key: "checklists",
  label: "验收清单"
}, {
  key: "pilot",
  label: "试运行"
}, {
  key: "readiness",
  label: "上线准备度"
}];
export default function UATPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("feedbacks");

  // Dashboard metrics
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummary | null>(null);
  const [trainingSummary, setTrainingSummary] = useState<TrainingSummary | null>(null);
  const [checklistProgress, setChecklistProgress] = useState<ChecklistProgress[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const loadDashboard = useCallback(async () => {
    try {
      const [fs, ts, cp, rd] = await Promise.all([fetch("/api/uat/feedbacks/summary", {
        headers: authHeaders()
      }).then(r => r.json()), fetch("/api/uat/trainings/summary", {
        headers: authHeaders()
      }).then(r => r.json()), fetch("/api/uat/checklists/progress", {
        headers: authHeaders()
      }).then(r => r.json()), fetch("/api/uat/readiness", {
        headers: authHeaders()
      }).then(r => r.json())]);
      setFeedbackSummary(fs?.data ?? fs ?? null);
      setTrainingSummary(ts?.data ?? ts ?? null);
      setChecklistProgress(cp?.data ?? cp ?? []);
      setReadiness(rd?.data ?? rd ?? null);
    } catch {
      // fail silently — dashboard shows dashes
    }
  }, []);
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Compute avg pass pct
  const avgPassPct = checklistProgress.length > 0 ? Math.round(checklistProgress.reduce((s, m) => s + (m.passPct ?? 0), 0) / checklistProgress.length) : null;
  const readinessScore = readiness?.score ?? null;
  const readinessColor = readinessScore === null ? "var(--text-secondary)" : readinessScore >= 80 ? "var(--status-success)" : readinessScore >= 60 ? "var(--status-warning)" : "var(--status-danger)";
  return <div style={{
    padding: "24px 32px",
    maxWidth: 1400,
    margin: "0 auto"
  }}>
      <PageHeaderV2 title="UAT & 试运行" subtitle="用户验收测试、培训记录、验收清单与上线准备度管理" />

      {/* ── Dashboard ── */}
      <div style={{
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
      marginBottom: 28
    }}>
        <MetricCard title="未解决问题" value={feedbackSummary?.openCount ?? "—"} borderColor={feedbackSummary && feedbackSummary.openCount > 0 ? "var(--status-danger)" : undefined} valueColor={feedbackSummary && feedbackSummary.openCount > 0 ? "var(--status-danger)" : undefined} sub="待处理 + 处理中" />
        <MetricCard title="严重问题" value={feedbackSummary?.criticalCount ?? "—"} borderColor={feedbackSummary && feedbackSummary.criticalCount > 0 ? "var(--status-danger)" : undefined} valueColor={feedbackSummary && feedbackSummary.criticalCount > 0 ? "var(--status-danger)" : undefined} sub="最高严重度" />
        <MetricCard title="验收通过率" value={avgPassPct !== null ? `${avgPassPct}%` : "—"} sub="所有模块均值" />
        <MetricCard title="培训场次" value={trainingSummary?.totalCount ?? "—"} sub="累计已完成" />
        <MetricCard title="上线准备度" value={readinessScore !== null ? `${readinessScore}` : "—"} borderColor={readinessScore !== null ? readinessColor : undefined} valueColor={readinessScore !== null ? readinessColor : undefined} sub={readinessScore !== null ? readinessScore >= 80 ? "可以上线" : readinessScore >= 60 ? "需要改进" : "不建议上线" : undefined} />
      </div>

      {/* ── Tabs ── */}
      <div style={{
      display: "flex",
      gap: 0,
      borderBottom: "2px solid var(--border)",
      marginBottom: 24
    }}>
        {TABS.map(t => <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
        padding: "10px 22px",
        border: "none",
        background: "none",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: activeTab === t.key ? 700 : 400,
        color: activeTab === t.key ? "var(--color-accent)" : "var(--text-secondary)",
        borderBottom: activeTab === t.key ? "2px solid var(--color-accent)" : "2px solid transparent",
        marginBottom: -2,
        transition: "all 0.15s"
      }}>
            {t.label}
          </button>)}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "feedbacks" && <FeedbacksTab />}
      {activeTab === "trainings" && <TrainingsTab />}
      {activeTab === "checklists" && <ChecklistsTab progress={checklistProgress} onProgressRefresh={loadDashboard} />}
      {activeTab === "pilot" && <PilotRunTab />}
      {activeTab === "readiness" && <ReadinessTab readiness={readiness} onRefresh={loadDashboard} />}
    </div>;
}

// ─────────────────────────────────────────────
// Tab 1: 问题反馈
// ─────────────────────────────────────────────
function FeedbacksTab() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [updateValues, setUpdateValues] = useState<Record<number, {
    status: string;
    assigneeName: string;
  }>>({});

  // Create form state
  const [form, setForm] = useState({
    title: "",
    description: "",
    moduleCode: "SALES",
    companyCode: "",
    feedbackType: "BUG",
    severity: "MEDIUM",
    reporterName: ""
  });
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "50"
      });
      if (filterStatus) params.set("status", filterStatus);
      if (filterSeverity) params.set("severity", filterSeverity);
      const res = await fetch(`/api/uat/feedbacks?${params}`, {
        headers: authHeaders()
      });
      const json = await res.json();
      setFeedbacks(json?.data?.items ?? json?.items ?? json?.data ?? []);
    } catch {
      setFeedbacks([]);
    }
  }, [filterStatus, filterSeverity]);
  useEffect(() => {
    load();
  }, [load]);
  const handleCreate = async () => {
    try {
      await fetch("/api/uat/feedbacks", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form)
      });
      setShowCreateForm(false);
      setForm({
        title: "",
        description: "",
        moduleCode: "SALES",
        companyCode: "",
        feedbackType: "BUG",
        severity: "MEDIUM",
        reporterName: ""
      });
      load();
    } catch {
      /* ignore */
    }
  };
  const handleUpdate = async (id: number) => {
    const vals = updateValues[id];
    if (!vals) return;
    try {
      await fetch(`/api/uat/feedbacks/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(vals)
      });
      setUpdatingId(null);
      load();
    } catch {
      /* ignore */
    }
  };
  const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    fontSize: 13,
    outline: "none"
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    background: "var(--bg-card)"
  };
  return <div>
      {/* Filter row */}
      <div style={{
      display: "flex",
      gap: 10,
      alignItems: "center",
      marginBottom: 16,
      flexWrap: "wrap"
    }}>
        <select style={selectStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全部状态</option>
          {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"].map(s => <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s}
            </option>)}
        </select>
        <select style={selectStyle} value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
          <option value="">全部严重度</option>
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(s => <option key={s} value={s}>
              {SEVERITY_LABEL[s] ?? s}
            </option>)}
        </select>
        <button onClick={() => setShowCreateForm(v => !v)} style={{
        marginLeft: "auto",
        padding: "7px 18px",
        background: "var(--color-accent)",
        color: "var(--text-on-dark)",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600
      }}>
          {showCreateForm ? "取消" : "+ 新建反馈"}
        </button>
      </div>

      {/* Inline create form */}
      {showCreateForm && <div style={{
      background: "var(--bg-muted)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: 20,
      marginBottom: 20
    }}>
          <div style={{
        fontWeight: 600,
        marginBottom: 14,
        fontSize: 14
      }}>新建问题反馈</div>
          <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 12
      }}>
            <div>
              <label className={u.muted12}>标题 *</label>
              <input style={{
            ...inputStyle,
            width: "100%",
            boxSizing: "border-box",
            marginTop: 4
          }} value={form.title} onChange={e => setForm({
            ...form,
            title: e.target.value
          })} placeholder="问题标题" />
            </div>
            <div>
              <label className={u.muted12}>报告人 *</label>
              <input style={{
            ...inputStyle,
            width: "100%",
            boxSizing: "border-box",
            marginTop: 4
          }} value={form.reporterName} onChange={e => setForm({
            ...form,
            reporterName: e.target.value
          })} placeholder="姓名" />
            </div>
            <div>
              <label className={u.muted12}>模块</label>
              <select style={{
            ...selectStyle,
            width: "100%",
            boxSizing: "border-box",
            marginTop: 4
          }} value={form.moduleCode} onChange={e => setForm({
            ...form,
            moduleCode: e.target.value
          })}>
                {Object.keys(MODULE_LABELS).map(k => <option key={k} value={k}>
                    {MODULE_LABELS[k]}
                  </option>)}
              </select>
            </div>
            <div>
              <label className={u.muted12}>严重度</label>
              <select style={{
            ...selectStyle,
            width: "100%",
            boxSizing: "border-box",
            marginTop: 4
          }} value={form.severity} onChange={e => setForm({
            ...form,
            severity: e.target.value
          })}>
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(s => <option key={s} value={s}>
                    {SEVERITY_LABEL[s] ?? s}
                  </option>)}
              </select>
            </div>
            <div>
              <label className={u.muted12}>类型</label>
              <select style={{
            ...selectStyle,
            width: "100%",
            boxSizing: "border-box",
            marginTop: 4
          }} value={form.feedbackType} onChange={e => setForm({
            ...form,
            feedbackType: e.target.value
          })}>
                {["BUG", "IMPROVEMENT", "QUESTION", "OTHER"].map(s => <option key={s} value={s}>
                    {s}
                  </option>)}
              </select>
            </div>
            <div>
              <label className={u.muted12}>公司代码</label>
              <input style={{
            ...inputStyle,
            width: "100%",
            boxSizing: "border-box",
            marginTop: 4
          }} value={form.companyCode} onChange={e => setForm({
            ...form,
            companyCode: e.target.value
          })} placeholder="可选" />
            </div>
            <div style={{
          gridColumn: "1 / -1"
        }}>
              <label className={u.muted12}>描述</label>
              <textarea style={{
            ...inputStyle,
            width: "100%",
            boxSizing: "border-box",
            marginTop: 4,
            resize: "vertical",
            minHeight: 70
          }} value={form.description} onChange={e => setForm({
            ...form,
            description: e.target.value
          })} placeholder="详细描述" />
            </div>
          </div>
          <button onClick={handleCreate} disabled={!form.title || !form.reporterName} style={{
        marginTop: 14,
        padding: "8px 20px",
        background: "var(--color-accent)",
        color: "var(--text-on-dark)",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        opacity: !form.title || !form.reporterName ? 0.5 : 1
      }}>
            提交反馈
          </button>
        </div>}

      {/* Table */}
      <div className={u.scrollX}>
        <table className={s.table}>
          <thead>
            <tr>
              {["编号", "标题", "模块", "类型", "严重度", "状态", "报告人", "创建时间", "操作"].map(h => <th key={h} className={u.nowrap}>
                    {h}
                  </th>)}
            </tr>
          </thead>
          <tbody>
            {feedbacks.length === 0 && <tr>
                <td colSpan={9} style={{
              padding: 32,
              textAlign: "center",
              color: "var(--text-disabled)"
            }}>
                  暂无数据
                </td>
              </tr>}
            {feedbacks.map(fb => <tr key={fb.id}>
                <td style={{
              color: "var(--text-secondary)",
              whiteSpace: "nowrap"
            }}>
                  {fb.feedbackNo}
                </td>
                <td style={{
              maxWidth: 200
            }}>{fb.title}</td>
                <td className={u.nowrap}>
                  {MODULE_LABELS[fb.moduleCode] ?? fb.moduleCode}
                </td>
                <td className={u.nowrap}>{fb.feedbackType}</td>
                <td>
                  <Badge label={fb.severity} color={SEVERITY_COLOR[fb.severity] ?? "var(--text-secondary)"} />
                </td>
                <td>
                  <Badge label={fb.status} color={STATUS_COLOR[fb.status] ?? "var(--text-secondary)"} />
                </td>
                <td className={u.nowrap}>{fb.reporterName}</td>
                <td style={{
              whiteSpace: "nowrap",
              color: "var(--text-secondary)"
            }}>
                  {fb.createdAt ? new Date(fb.createdAt).toLocaleDateString("zh-CN") : "—"}
                </td>
                <td className={u.nowrap}>
                  {updatingId === fb.id ? <div className={u.flexRow}>
                      <select style={{
                  ...inputStyle,
                  fontSize: 12,
                  padding: "3px 6px"
                }} value={updateValues[fb.id]?.status ?? fb.status} onChange={e => setUpdateValues(v => ({
                  ...v,
                  [fb.id]: {
                    ...v[fb.id],
                    status: e.target.value
                  }
                }))}>
                        {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"].map(s => <option key={s} value={s}>
                            {STATUS_LABEL[s] ?? s}
                          </option>)}
                      </select>
                      <input style={{
                  ...inputStyle,
                  fontSize: 12,
                  padding: "3px 6px",
                  width: 90
                }} placeholder="指派给" value={updateValues[fb.id]?.assigneeName ?? fb.assigneeName ?? ""} onChange={e => setUpdateValues(v => ({
                  ...v,
                  [fb.id]: {
                    ...v[fb.id],
                    assigneeName: e.target.value
                  }
                }))} />
                      <button onClick={() => handleUpdate(fb.id)} style={{
                  padding: "3px 10px",
                  background: "var(--status-success)",
                  color: "var(--text-on-dark)",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12
                }}>
                        保存
                      </button>
                      <button onClick={() => setUpdatingId(null)} style={{
                  padding: "3px 10px",
                  background: "var(--border)",
                  color: "var(--text-primary)",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12
                }}>
                        取消
                      </button>
                    </div> : <button onClick={() => {
                setUpdatingId(fb.id);
                setUpdateValues(v => ({
                  ...v,
                  [fb.id]: {
                    status: fb.status,
                    assigneeName: fb.assigneeName ?? ""
                  }
                }));
              }} style={{
                padding: "3px 12px",
                background: "var(--bg-muted)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text-primary)"
              }}>
                      指派/更新
                    </button>}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}

// ─────────────────────────────────────────────
// Tab 2: 培训记录
// ─────────────────────────────────────────────
function TrainingsTab() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [filterType, setFilterType] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({
    trainingType: "SALES",
    trainingTitle: "",
    trainerName: "",
    participantCount: "",
    trainingDate: "",
    score: "",
    remark: ""
  });
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: "1"
      });
      if (filterType) params.set("trainingType", filterType);
      const [tRes, sRes] = await Promise.all([fetch(`/api/uat/trainings?${params}`, {
        headers: authHeaders()
      }).then(r => r.json()), fetch("/api/uat/trainings/summary", {
        headers: authHeaders()
      }).then(r => r.json())]);
      setTrainings(tRes?.data?.items ?? tRes?.items ?? tRes?.data ?? []);
      setSummary(sRes?.data ?? sRes ?? null);
    } catch {
      setTrainings([]);
    }
  }, [filterType]);
  useEffect(() => {
    load();
  }, [load]);
  const handleCreate = async () => {
    try {
      await fetch("/api/uat/trainings", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          participantCount: Number(form.participantCount),
          score: form.score ? Number(form.score) : undefined
        })
      });
      setShowCreateForm(false);
      setForm({
        trainingType: "SALES",
        trainingTitle: "",
        trainerName: "",
        participantCount: "",
        trainingDate: "",
        score: "",
        remark: ""
      });
      load();
    } catch {
      /* ignore */
    }
  };
  const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    fontSize: 13,
    outline: "none"
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    background: "var(--bg-card)"
  };
  const trainingTypes = ["SALES", "DELIVERY", "INVENTORY", "FINANCE", "APPROVAL", "MANAGEMENT"];
  return <div>
      {/* Summary cards by type */}
      {summary && summary.byType && <div style={{
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      marginBottom: 20
    }}>
          {trainingTypes.map(t => <div key={t} style={{
        background: "var(--bg-muted)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 16px",
        minWidth: 110,
        textAlign: "center"
      }}>
              <div style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          marginBottom: 4
        }}>{t}</div>
              <div style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--color-accent)"
        }}>
                {summary.byType[t] ?? 0}
              </div>
            </div>)}
        </div>}

      {/* Filter + create button */}
      <div style={{
      display: "flex",
      gap: 10,
      marginBottom: 16,
      alignItems: "center"
    }}>
        <select style={selectStyle} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">全部类型</option>
          {trainingTypes.map(t => <option key={t} value={t}>
              {t}
            </option>)}
        </select>
        <button onClick={() => setShowCreateForm(v => !v)} style={{
        marginLeft: "auto",
        padding: "7px 18px",
        background: "var(--color-accent)",
        color: "var(--text-on-dark)",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600
      }}>
          {showCreateForm ? "取消" : "+ 新建培训"}
        </button>
      </div>

      {/* Inline create form */}
      {showCreateForm && <div style={{
      background: "var(--bg-muted)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: 20,
      marginBottom: 20
    }}>
          <div style={{
        fontWeight: 600,
        marginBottom: 14,
        fontSize: 14
      }}>新建培训记录</div>
          <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 12
      }}>
            {[{
          label: "培训标题 *",
          key: "trainingTitle",
          type: "text",
          placeholder: "培训标题"
        }, {
          label: "讲师 *",
          key: "trainerName",
          type: "text",
          placeholder: "姓名"
        }, {
          label: "参与人数",
          key: "participantCount",
          type: "number",
          placeholder: "人数"
        }, {
          label: "培训日期",
          key: "trainingDate",
          type: "date",
          placeholder: ""
        }, {
          label: "评分 (0-100)",
          key: "score",
          type: "number",
          placeholder: "可选"
        }, {
          label: "备注",
          key: "remark",
          type: "text",
          placeholder: "可选"
        }].map(f => <div key={f.key}>
                <label className={u.muted12}>{f.label}</label>
                <input type={f.type} style={{
            ...inputStyle,
            width: "100%",
            boxSizing: "border-box",
            marginTop: 4
          }} value={(form as Record<string, string>)[f.key]} onChange={e => setForm({
            ...form,
            [f.key]: e.target.value
          })} placeholder={f.placeholder} />
              </div>)}
            <div>
              <label className={u.muted12}>培训类型</label>
              <select style={{
            ...selectStyle,
            width: "100%",
            boxSizing: "border-box",
            marginTop: 4
          }} value={form.trainingType} onChange={e => setForm({
            ...form,
            trainingType: e.target.value
          })}>
                {trainingTypes.map(t => <option key={t} value={t}>
                    {t}
                  </option>)}
              </select>
            </div>
          </div>
          <button onClick={handleCreate} disabled={!form.trainingTitle || !form.trainerName} style={{
        marginTop: 14,
        padding: "8px 20px",
        background: "var(--color-accent)",
        color: "var(--text-on-dark)",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        opacity: !form.trainingTitle || !form.trainerName ? 0.5 : 1
      }}>
            提交
          </button>
        </div>}

      {/* Table */}
      <div className={u.scrollX}>
        <table className={s.table}>
          <thead>
            <tr>
              {["编号", "培训类型", "标题", "讲师", "参与人数", "日期", "评分", "备注"].map(h => <th key={h} className={u.nowrap}>
                  {h}
                </th>)}
            </tr>
          </thead>
          <tbody>
            {trainings.length === 0 && <tr>
                <td colSpan={8} style={{
              padding: 32,
              textAlign: "center",
              color: "var(--text-disabled)"
            }}>
                  暂无数据
                </td>
              </tr>}
            {trainings.map(t => <tr key={t.id}>
                <td className={u.muted}>{t.trainingNo}</td>
                <td>
                  <Badge label={t.trainingType} color="var(--color-accent)" />
                </td>
                <td>{t.trainingTitle}</td>
                <td className={u.nowrap}>{t.trainerName}</td>
                <td className={u.tac}>
                  {t.participantCount}
                </td>
                <td style={{
              whiteSpace: "nowrap",
              color: "var(--text-secondary)"
            }}>
                  {t.trainingDate ? new Date(t.trainingDate).toLocaleDateString("zh-CN") : "—"}
                </td>
                <td className={u.tac}>
                  {t.score != null ? <span style={{
                fontWeight: 600,
                color: t.score >= 80 ? "var(--status-success)" : t.score >= 60 ? "var(--status-warning)" : "var(--status-danger)"
              }}>
                      {t.score}
                    </span> : "—"}
                </td>
                <td className={u.muted}>{t.remark ?? "—"}</td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}

// ─────────────────────────────────────────────
// Tab 3: 验收清单
// ─────────────────────────────────────────────
function ChecklistsTab({
  progress,
  onProgressRefresh
}: {
  progress: ChecklistProgress[];
  onProgressRefresh: () => void;
}) {
  const [groups, setGroups] = useState<ChecklistGroup[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [remarksInput, setRemarksInput] = useState<Record<number, string>>({});
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/uat/checklists/grouped", {
        headers: authHeaders()
      });
      const json = await res.json();
      setGroups(json?.data ?? json ?? []);
    } catch {
      setGroups([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const handleStatus = async (id: number, status: string) => {
    const remark = remarksInput[id] ?? "";
    try {
      await fetch(`/api/uat/checklists/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          status,
          remark
        })
      });
      load();
      onProgressRefresh();
    } catch {
      /* ignore */
    }
  };
  const ITEM_STATUS_COLOR: Record<string, string> = {
    NOT_STARTED: "var(--text-disabled)",
    PASSED: "var(--status-success)",
    FAILED: "var(--status-danger)",
    BLOCKED: "var(--status-warning)"
  };
  return <div>
      {/* Module progress bars */}
      {progress.length > 0 && <div className={u.mb24}>
          <div style={{
        fontWeight: 600,
        fontSize: 14,
        marginBottom: 12,
        color: "var(--text-primary)"
      }}>
            模块验收进度
          </div>
          <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 12
      }}>
            {progress.map(p => <div key={p.moduleCode} style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 16px"
        }}>
                <div style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            marginBottom: 6
          }}>
                  <span className={u.fw600}>
                    {MODULE_LABELS[p.moduleCode] ?? p.moduleCode}
                  </span>
                  <span className={u.muted}>
                    {p.passed}/{p.total} ({p.passPct ?? 0}%)
                  </span>
                </div>
                <div style={{
            height: 8,
            background: "var(--bg-muted)",
            borderRadius: 4,
            overflow: "hidden"
          }}>
                  <div style={{
              height: "100%",
              width: `${p.passPct ?? 0}%`,
              background: (p.passPct ?? 0) >= 80 ? "var(--status-success)" : (p.passPct ?? 0) >= 50 ? "var(--status-warning)" : "var(--status-danger)",
              borderRadius: 4,
              transition: "width 0.4s"
            }} />
                </div>
              </div>)}
          </div>
        </div>}

      {/* Accordion by module */}
      {groups.length === 0 && <div style={{
      color: "var(--text-disabled)",
      textAlign: "center",
      padding: 32
    }}>暂无验收清单数据</div>}
      {groups.map(group => <div key={group.moduleCode} style={{
      border: "1px solid var(--border)",
      borderRadius: 10,
      marginBottom: 12,
      overflow: "hidden"
    }}>
          <button onClick={() => setExpanded(v => ({
        ...v,
        [group.moduleCode]: !v[group.moduleCode]
      }))} style={{
        width: "100%",
        padding: "14px 18px",
        background: "var(--bg-muted)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 14,
        fontWeight: 600,
        color: "var(--text-primary)"
      }}>
            <span>{MODULE_LABELS[group.moduleCode] ?? group.moduleCode}</span>
            <span className={u.muted12}>
              {group.items.length} 项 {expanded[group.moduleCode] ? "▲" : "▼"}
            </span>
          </button>
          {expanded[group.moduleCode] && <div>
              {group.items.map(item => <div key={item.id} style={{
          padding: "14px 18px",
          borderTop: "1px solid var(--bg-muted)",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap"
        }}>
                  <div style={{
            flex: 1,
            minWidth: 180
          }}>
                    <div style={{
              fontWeight: 500,
              fontSize: 13
            }}>{item.itemName}</div>
                    <div style={{
              fontSize: 11,
              color: "var(--text-disabled)",
              marginTop: 2
            }}>
                      {item.itemCode} ·{" "}
                      <span style={{
                color: ITEM_STATUS_COLOR[item.status] ?? "var(--text-secondary)",
                fontWeight: 600
              }}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                  <input style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: 5,
            fontSize: 12,
            outline: "none",
            width: 160
          }} placeholder="备注（失败/阻塞时填写）" value={remarksInput[item.id] ?? item.remark ?? ""} onChange={e => setRemarksInput(v => ({
            ...v,
            [item.id]: e.target.value
          }))} />
                  <div style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap"
          }}>
                    {[{
              s: "PASSED",
              label: "✅ 通过",
              bg: "var(--status-success)"
            }, {
              s: "FAILED",
              label: "❌ 失败",
              bg: "var(--status-danger)"
            }, {
              s: "BLOCKED",
              label: "🚧 阻塞",
              bg: "var(--status-warning)"
            }, {
              s: "NOT_STARTED",
              label: "↩️ 重置",
              bg: "var(--text-secondary)"
            }].map(({
              s,
              label,
              bg
            }) => <button key={s} onClick={() => handleStatus(item.id, s)} style={{
              padding: "4px 10px",
              background: item.status === s ? bg : "var(--bg-muted)",
              color: item.status === s ? "var(--text-on-dark)" : "var(--text-primary)",
              border: `1px solid ${item.status === s ? bg : "var(--border)"}`,
              borderRadius: 5,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: item.status === s ? 600 : 400
            }}>
                        {label}
                      </button>)}
                  </div>
                </div>)}
            </div>}
        </div>)}
    </div>;
}

// ─────────────────────────────────────────────
// Tab 4: 试运行
// ─────────────────────────────────────────────
function PilotRunTab() {
  const [runs, setRuns] = useState<PilotRun[]>([]);
  const [_summary, setSummary] = useState<PilotRunSummary | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [updateValues, setUpdateValues] = useState<Partial<PilotRun>>({});
  const [form, setForm] = useState({
    companyCode: "",
    siteName: "",
    runStartDate: "",
    runEndDate: "",
    remark: ""
  });
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      const [rRes, sRes] = await Promise.all([fetch(`/api/uat/pilot-runs?${params}`, {
        headers: authHeaders()
      }).then(r => r.json()), fetch("/api/uat/pilot-runs/summary", {
        headers: authHeaders()
      }).then(r => r.json())]);
      setRuns(rRes?.data?.items ?? rRes?.items ?? rRes?.data ?? []);
      setSummary(sRes?.data ?? sRes ?? null);
    } catch {
      setRuns([]);
    }
  }, [filterStatus]);
  useEffect(() => {
    load();
  }, [load]);
  const handleCreate = async () => {
    try {
      await fetch("/api/uat/pilot-runs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form)
      });
      setShowCreateForm(false);
      setForm({
        companyCode: "",
        siteName: "",
        runStartDate: "",
        runEndDate: "",
        remark: ""
      });
      load();
    } catch {
      /* ignore */
    }
  };
  const handleUpdate = async (id: number) => {
    try {
      await fetch(`/api/uat/pilot-runs/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(updateValues)
      });
      setUpdatingId(null);
      load();
    } catch {
      /* ignore */
    }
  };
  const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    fontSize: 13,
    outline: "none"
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    background: "var(--bg-card)"
  };
  const PILOT_STATUS_COLOR: Record<string, string> = {
    PLANNED: "var(--text-secondary)",
    RUNNING: "var(--color-accent)",
    PAUSED: "var(--status-warning)",
    COMPLETED: "var(--status-success)",
    ABORTED: "var(--status-danger)"
  };
  return <div>
      <div style={{
      display: "flex",
      gap: 10,
      marginBottom: 16,
      alignItems: "center"
    }}>
        <select style={selectStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全部状态</option>
          {["PLANNED", "RUNNING", "PAUSED", "COMPLETED", "ABORTED"].map(s => <option key={s} value={s}>
              {s}
            </option>)}
        </select>
        <button onClick={() => setShowCreateForm(v => !v)} style={{
        marginLeft: "auto",
        padding: "7px 18px",
        background: "var(--color-accent)",
        color: "var(--text-on-dark)",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600
      }}>
          {showCreateForm ? "取消" : "+ 创建试运行"}
        </button>
      </div>

      {showCreateForm && <div style={{
      background: "var(--bg-muted)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: 20,
      marginBottom: 20
    }}>
          <div style={{
        fontWeight: 600,
        marginBottom: 14,
        fontSize: 14
      }}>创建试运行</div>
          <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 12
      }}>
            {[{
          label: "公司代码 *",
          key: "companyCode",
          type: "text",
          placeholder: "代码"
        }, {
          label: "站点名称 *",
          key: "siteName",
          type: "text",
          placeholder: "站点"
        }, {
          label: "开始日期",
          key: "runStartDate",
          type: "date",
          placeholder: ""
        }, {
          label: "结束日期",
          key: "runEndDate",
          type: "date",
          placeholder: ""
        }, {
          label: "备注",
          key: "remark",
          type: "text",
          placeholder: "可选"
        }].map(f => <div key={f.key}>
                <label className={u.muted12}>{f.label}</label>
                <input type={f.type} style={{
            ...inputStyle,
            width: "100%",
            boxSizing: "border-box",
            marginTop: 4
          }} value={(form as Record<string, string>)[f.key]} onChange={e => setForm({
            ...form,
            [f.key]: e.target.value
          })} placeholder={f.placeholder} />
              </div>)}
          </div>
          <button onClick={handleCreate} disabled={!form.companyCode || !form.siteName} style={{
        marginTop: 14,
        padding: "8px 20px",
        background: "var(--color-accent)",
        color: "var(--text-on-dark)",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        opacity: !form.companyCode || !form.siteName ? 0.5 : 1
      }}>
            创建
          </button>
        </div>}

      <div className={u.scrollX}>
        <table className={s.table}>
          <thead>
            <tr>
              {["编号", "公司", "站点", "开始日期", "结束日期", "状态", "订单数", "配送数", "问题数", "操作"].map(h => <th key={h} className={u.nowrap}>
                    {h}
                  </th>)}
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && <tr>
                <td colSpan={10} style={{
              padding: 32,
              textAlign: "center",
              color: "var(--text-disabled)"
            }}>
                  暂无试运行数据
                </td>
              </tr>}
            {runs.map(run => <tr key={run.id}>
                <td style={{
              color: "var(--text-secondary)",
              whiteSpace: "nowrap"
            }}>
                  {run.runNo}
                </td>
                <td>{run.companyCode}</td>
                <td>{run.siteName}</td>
                <td style={{
              whiteSpace: "nowrap",
              color: "var(--text-secondary)"
            }}>
                  {run.runStartDate ? new Date(run.runStartDate).toLocaleDateString("zh-CN") : "—"}
                </td>
                <td style={{
              whiteSpace: "nowrap",
              color: "var(--text-secondary)"
            }}>
                  {run.runEndDate ? new Date(run.runEndDate).toLocaleDateString("zh-CN") : "—"}
                </td>
                <td>
                  <Badge label={run.status} color={PILOT_STATUS_COLOR[run.status] ?? "var(--text-secondary)"} />
                </td>
                <td className={u.tac}>{run.orderCount}</td>
                <td className={u.tac}>{run.deliveryCount}</td>
                <td className={u.tac}>
                  <span style={{
                color: run.issueCount > 0 ? "var(--status-danger)" : "var(--status-success)",
                fontWeight: 600
              }}>
                    {run.issueCount}
                  </span>
                </td>
                <td className={u.nowrap}>
                  {updatingId === run.id ? <div style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                flexWrap: "wrap"
              }}>
                      <select style={{
                  ...inputStyle,
                  fontSize: 12,
                  padding: "3px 6px",
                  background: "var(--bg-card)"
                }} value={updateValues.status as string ?? run.status} onChange={e => setUpdateValues(v => ({
                  ...v,
                  status: e.target.value
                }))}>
                        {["PLANNED", "RUNNING", "PAUSED", "COMPLETED", "ABORTED"].map(s => <option key={s} value={s}>
                            {s}
                          </option>)}
                      </select>
                      {(["orderCount", "deliveryCount", "issueCount"] as const).map(f => <input key={f} type="number" style={{
                  ...inputStyle,
                  fontSize: 12,
                  padding: "3px 6px",
                  width: 64
                }} placeholder={f === "orderCount" ? "订单" : f === "deliveryCount" ? "配送" : "问题"} value={updateValues[f] as number | undefined ?? ""} onChange={e => setUpdateValues(v => ({
                  ...v,
                  [f]: Number(e.target.value)
                }))} />)}
                      <button onClick={() => handleUpdate(run.id)} style={{
                  padding: "3px 10px",
                  background: "var(--status-success)",
                  color: "var(--text-on-dark)",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12
                }}>
                        保存
                      </button>
                      <button onClick={() => setUpdatingId(null)} style={{
                  padding: "3px 10px",
                  background: "var(--border)",
                  color: "var(--text-primary)",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12
                }}>
                        取消
                      </button>
                    </div> : <button onClick={() => {
                setUpdatingId(run.id);
                setUpdateValues({
                  status: run.status,
                  orderCount: run.orderCount,
                  deliveryCount: run.deliveryCount,
                  issueCount: run.issueCount
                });
              }} style={{
                padding: "3px 12px",
                background: "var(--bg-muted)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text-primary)"
              }}>
                      更新
                    </button>}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}

// ─────────────────────────────────────────────
// Tab 5: 上线准备度
// ─────────────────────────────────────────────
function ReadinessTab({
  readiness,
  onRefresh
}: {
  readiness: Readiness | null;
  onRefresh: () => void;
}) {
  const score = readiness?.score ?? null;
  const scoreColor = score === null ? "var(--text-secondary)" : score >= 80 ? "var(--status-success)" : score >= 60 ? "var(--status-warning)" : "var(--status-danger)";
  const statusLabel = score === null ? "—" : score >= 80 ? "可以上线" : score >= 60 ? "需要改进" : "不建议上线";
  return <div>
      {/* Score display */}
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 32,
      marginBottom: 28,
      flexWrap: "wrap"
    }}>
        <div className={u.tac}>
          <div style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          border: `6px solid ${scoreColor}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
          fontWeight: 800,
          color: scoreColor
        }}>
            {score ?? "—"}
          </div>
          <div style={{
          marginTop: 8,
          fontSize: 14,
          fontWeight: 700,
          color: scoreColor
        }}>
            {statusLabel}
          </div>
        </div>
        <div>
          {readiness?.hasCriticalIssues && <div style={{
          background: "color-mix(in srgb, var(--status-danger) 8%, transparent)",
          border: "1px solid var(--status-danger)",
          borderRadius: 8,
          padding: "10px 16px",
          marginBottom: 12,
          color: "var(--status-danger)",
          fontWeight: 600,
          fontSize: 13
        }}>
              存在严重级别未解决问题,强烈建议上线前处理
            </div>}
          <button onClick={onRefresh} style={{
          padding: "8px 20px",
          background: "var(--color-accent)",
          color: "var(--text-on-dark)",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600
        }}>
            刷新评分
          </button>
        </div>
      </div>

      {/* Dimension table */}
      {readiness?.dimensions && readiness.dimensions.length > 0 && <div>
          <div style={{
        fontWeight: 600,
        fontSize: 14,
        marginBottom: 12,
        color: "var(--text-primary)"
      }}>
            评分维度明细
          </div>
          <div className={u.scrollX}>
            <table className={s.table}>
              <thead>
                <tr>
                  {["维度", "权重", "通过/总计", "评分", "加权"].map(h => <th key={h}>
                      {h}
                    </th>)}
                </tr>
              </thead>
              <tbody>
                {readiness.dimensions.map((d, i) => <tr key={i}>
                    <td>
                      {d.dimensionName}
                    </td>
                    <td className={u.muted}>
                      {(d.weight * 100).toFixed(0)}%
                    </td>
                    <td>
                      <span className={u.fw600}>{d.passed}</span>
                      <span style={{
                  color: "var(--text-disabled)"
                }}> / {d.total}</span>
                    </td>
                    <td>
                      <span style={{
                  fontWeight: 700,
                  color: d.score >= 80 ? "var(--status-success)" : d.score >= 60 ? "var(--status-warning)" : "var(--status-danger)"
                }}>
                        {d.score.toFixed(1)}
                      </span>
                    </td>
                    <td style={{
                color: "var(--text-primary)"
              }}>
                      {d.weighted.toFixed(2)}
                    </td>
                  </tr>)}
                <tr style={{
              background: "var(--bg-muted)",
              borderTop: "2px solid var(--border)"
            }}>
                  <td colSpan={4} className={u.fw700}>
                    综合评分
                  </td>
                  <td style={{
                fontWeight: 800,
                fontSize: 16,
                color: scoreColor
              }}>
                    {score ?? "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>}

      {!readiness && <div style={{
      color: "var(--text-disabled)",
      textAlign: "center",
      padding: 48,
      fontSize: 14
    }}>
          暂无准备度数据，请点击「刷新评分」加载
        </div>}
    </div>;
}