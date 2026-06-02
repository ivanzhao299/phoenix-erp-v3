"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, RefreshCw, User, FileText, Banknote, ShoppingBag, Building2, FolderOpen, DollarSign, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";
import { WorkflowFormRenderer } from "@/components/workflow/WorkflowFormRenderer";

// ── Auth helper ───────────────────────────────────────────────────────────────
function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || '';
}
function authHdr(extra?: Record<string, string>) {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...extra };
}



// ── 统一任务类型 ───────────────────────────────────────────────────────────────
interface UnifiedTask {
  taskSource:    string;
  taskId:        string;
  instanceId:    string;
  instanceNo:    string | null;
  bizType:       string;
  bizId:         string;
  bizNo:         string | null;
  subject:       string | null;
  amount:        number | null;
  currencyCode:  string | null;
  companyCode:   string | null;
  companyName:   string | null;
  projectCode:   string | null;
  projectName:   string | null;
  requiredRole:  string;
  stepNo:        number | null;
  totalSteps:    number | null;
  currentStepNo: number | null;
  startedBy:     string | null;
  status:        string;
  createdAt:     string;
}

interface TaskListResponse {
  items:    UnifiedTask[];
  total:    number;
  page:     number;
  pageSize: number;
}

interface FormSubmissionSnapshot {
  id:              number;
  submissionNo:    string;
  formCode:        string;
  dataJson:        Record<string, unknown>;
  schemaJson:      Record<string, unknown>;
  uiSchemaJson:    Record<string, unknown>;
  status:          string;
  submittedByName: string | null;
  formName:        string | null;
}

interface InstanceDetail {
  id: string;
  instanceNo: string;
  bizType: string;
  bizId: string;
  bizNo: string;
  status: string;
  totalSteps: number;
  currentStepNo: number;
  startedAt: string;
  amount: number | null;
  currencyCode: string | null;
  companyCode: string | null;
  companyName: string | null;
  projectCode: string | null;
  projectName: string | null;
  subject: string | null;
  formSubmission: FormSubmissionSnapshot | null;   // Phase I
  steps: {
    id: string;
    stepNo: number;
    approverRole: string;
    approverName: string;
    requiredRole: string;
    status: string;
    action: string;
    comment: string;
    actedAt: string;
  }[];
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
const BIZ_TYPE_LABEL: Record<string, string> = {
  PR:      "采购申请",
  PO:      "采购订单",
  PAYMENT: "付款申请",
  FUND:    "股东资金",
};

const BIZ_TYPE_ICON: Record<string, React.ReactNode> = {
  PR:      <FileText    size={14} />,
  PO:      <ShoppingBag size={14} />,
  PAYMENT: <Banknote    size={14} />,
  FUND:    <Banknote    size={14} />,
};

function fmtDate(s: string) {
  if (!s) return "-";
  return new Date(s).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtAmount(amount: number | string | null, currency: string | null) {
  if (amount == null) return "-";
  const n = Number(amount);
  if (isNaN(n)) return "-";
  return `${n.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} ${currency ?? ""}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    PENDING:  { label: "待审批", color: "var(--status-warning)" },
    APPROVED: { label: "已通过", color: "var(--status-success)" },
    REJECTED: { label: "已拒绝", color: "var(--status-danger)" },
    SKIPPED:  { label: "已跳过", color: "var(--text-disabled)" },
    TODO:     { label: "待处理", color: "var(--status-warning)" },
  };
  const cfg = map[status] ?? { label: status, color: "var(--text-disabled)" };
  return <span style={{ color: cfg.color, fontWeight: 600, fontSize: 12 }}>{cfg.label}</span>;
}

function TaskSourceBadge({ source }: { source: string }) {
  const isAE = source === "APPROVAL_ENGINE";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 10, fontWeight: 600, padding: "2px 6px",
      borderRadius: 4,
      background: isAE ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.12)",
      color:      isAE ? "var(--status-warning)"               : "var(--color-accent)",
    }}>
      {isAE ? "审批引擎" : "通用流程"}
    </span>
  );
}

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchTodos(params: {
  page: number; pageSize: number;
  taskSource?: string; bizType?: string; keyword?: string;
}): Promise<TaskListResponse> {
  const p = new URLSearchParams();
  p.set("page",     String(params.page));
  p.set("pageSize", String(params.pageSize));
  if (params.taskSource) p.set("taskSource", params.taskSource);
  if (params.bizType)    p.set("bizType",    params.bizType);
  if (params.keyword)    p.set("keyword",    params.keyword);

  const res = await fetch(`/api/workflow/my-tasks?${p.toString()}`, { headers: authHdr() });
  if (!res.ok) return { items: [], total: 0, page: 1, pageSize: 20 };
  return res.json();
}

async function fetchDetail(instanceId: string): Promise<InstanceDetail | null> {
  const res = await fetch(`/api/approval/instances/${instanceId}`, { headers: authHdr() });
  if (!res.ok) return null;
  return res.json();
}

async function approveInstance(instanceId: string, comment: string) {
  const res = await fetch(`/api/approval/instances/${instanceId}/approve`, {
    method: "POST", headers: authHdr(),
    body: JSON.stringify({ comment }),
  });
  return res.json();
}

async function rejectInstance(instanceId: string, comment: string) {
  const res = await fetch(`/api/approval/instances/${instanceId}/reject`, {
    method: "POST", headers: authHdr(),
    body: JSON.stringify({ comment }),
  });
  return res.json();
}

// ── 组件 ─────────────────────────────────────────────────────────────────────
export default function ApprovalTodosPage() {
  const toast = useToast();
  const [resp, setResp]             = useState<TaskListResponse>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading]       = useState(false);
  const [selected, setSelected]     = useState<UnifiedTask | null>(null);
  const [detail, setDetail]         = useState<InstanceDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [comment, setComment]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 筛选状态
  const [taskSource, setTaskSource] = useState("");
  const [bizType,    setBizType]    = useState("");
  const [keyword,    setKeyword]    = useState("");
  const [page,       setPage]       = useState(1);
  const PAGE_SIZE = 20;

  const load = useCallback(async (params?: { taskSource?: string; bizType?: string; keyword?: string; page?: number }) => {
    setLoading(true);
    try {
      const r = await fetchTodos({
        page:       params?.page       ?? page,
        pageSize:   PAGE_SIZE,
        taskSource: (params?.taskSource !== undefined ? params.taskSource : taskSource) || undefined,
        bizType:    (params?.bizType    !== undefined ? params.bizType    : bizType)    || undefined,
        keyword:    (params?.keyword    !== undefined ? params.keyword    : keyword)    || undefined,
      });
      setResp(r);
    } finally {
      setLoading(false);
    }
  }, [page, taskSource, bizType, keyword]);

  useEffect(() => { load(); }, [load]);

  const applyFilter = () => {
    setPage(1);
    load({ page: 1, taskSource, bizType, keyword });
  };

  const resetFilter = () => {
    setTaskSource(""); setBizType(""); setKeyword(""); setPage(1);
    load({ page: 1, taskSource: "", bizType: "", keyword: "" });
  };

  const openDetail = async (todo: UnifiedTask) => {
    setSelected(todo);
    setComment("");
    setDrawerOpen(true);
    if (todo.taskSource === "APPROVAL_ENGINE") {
      setDetail(await fetchDetail(todo.instanceId));
    } else {
      setDetail(null);
    }
  };

  const handleApprove = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const r = await approveInstance(selected.instanceId, comment);
      if (r.statusCode && r.statusCode >= 400) {
        toast.error(r.message || "操作失败");
      } else {
        toast.success(r.finished ? "审批完成，单据已通过" : "已通过，等待下一级审批");
        setDrawerOpen(false);
        load();
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    if (!comment.trim()) { toast.warning("拒绝时必须填写意见"); return; }
    setSubmitting(true);
    try {
      const r = await rejectInstance(selected.instanceId, comment);
      if (r.statusCode && r.statusCode >= 400) {
        toast.error(r.message || "操作失败");
      } else {
        toast.error("已拒绝，单据流程终止");
        setDrawerOpen(false);
        load();
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const isApprovalEngine = selected?.taskSource === "APPROVAL_ENGINE";

  return (
    <div>
      <PageHeader
        title="审批待办"
        subtitle={`我的待审批任务（共 ${resp.total} 条）`}
        breadcrumb={["审批中心", "待办"]}
      />

      <section className={s.card}>
        {/* ── 筛选栏 ── */}
        <div className={s.cardBody} style={{ borderBottom: "1px solid var(--bg-muted)", paddingBottom: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={taskSource}
            onChange={e => setTaskSource(e.target.value)}
            className={s.select}
            style={{ minWidth: 120 }}
          >
            <option value="">全部来源</option>
            <option value="APPROVAL_ENGINE">审批引擎</option>
            <option value="WORKFLOW_ENGINE">通用流程</option>
          </select>

          <select
            value={bizType}
            onChange={e => setBizType(e.target.value)}
            className={s.select}
            style={{ minWidth: 120 }}
          >
            <option value="">全部类型</option>
            <option value="PR">采购申请</option>
            <option value="PO">采购订单</option>
            <option value="PAYMENT">付款申请</option>
            <option value="FUND">股东资金</option>
          </select>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ color: "var(--text-disabled)" }} />
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyFilter()}
              placeholder="搜索单号、主题…"
              className={s.input}
              style={{ flex: 1 }}
            />
          </div>

          <button className={s.btnPrimary} onClick={applyFilter} style={{ fontSize: 12 }}>
            搜索
          </button>
          <button className={s.btnSecondary} onClick={resetFilter} style={{ fontSize: 12 }}>
            重置
          </button>
          <button className={s.btnSecondary} onClick={() => load()} disabled={loading} style={{ fontSize: 12, marginLeft: "auto" }}>
            <RefreshCw size={13} style={{ marginRight: 5 }} />
            刷新
          </button>
        </div>

        {loading ? (
          <div className={s.cardBody} style={{ textAlign: "center", color: "var(--text-disabled)", padding: 48 }}>加载中…</div>
        ) : resp.items.length === 0 ? (
          <div className={s.cardBody} style={{ textAlign: "center", color: "var(--text-disabled)", padding: 48 }}>
            <CheckCircle size={36} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <p>暂无待审批任务</p>
          </div>
        ) : (
          <>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>来源</th>
                  <th>业务类型</th>
                  <th>单据编号</th>
                  <th>主题</th>
                  <th>金额</th>
                  <th>公司</th>
                  <th>项目</th>
                  <th>需审批角色</th>
                  <th>步骤</th>
                  <th>提交时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {resp.items.map(todo => (
                  <tr key={`${todo.taskSource}-${todo.taskId}`}>
                    <td><TaskSourceBadge source={todo.taskSource} /></td>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {BIZ_TYPE_ICON[todo.bizType]}
                        {BIZ_TYPE_LABEL[todo.bizType] ?? todo.bizType ?? "-"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>
                        {todo.bizNo || todo.bizId}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: "var(--text-primary)", maxWidth: 140, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {todo.subject || "-"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
                        {fmtAmount(todo.amount, todo.currencyCode)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                        {todo.companyName && <Building2 size={11} style={{ flexShrink: 0 }} />}
                        {todo.companyName ?? todo.companyCode ?? "-"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                        {todo.projectName && <FolderOpen size={11} style={{ flexShrink: 0 }} />}
                        {todo.projectName ?? todo.projectCode ?? "-"}
                      </span>
                    </td>
                    <td>
                      <code style={{ fontSize: 11, background: "var(--bg-muted)", padding: "2px 6px", borderRadius: 4 }}>
                        {todo.requiredRole || "-"}
                      </code>
                    </td>
                    <td>
                      {todo.currentStepNo != null && todo.totalSteps != null ? (
                        <span style={{ color: "var(--status-warning)", fontWeight: 600 }}>
                          {todo.currentStepNo}/{todo.totalSteps}
                        </span>
                      ) : "-"}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(todo.createdAt)}</td>
                    <td>
                      <button className={s.btnPrimary} style={{ fontSize: 12 }} onClick={() => openDetail(todo)}>
                        {todo.taskSource === "APPROVAL_ENGINE" ? "审批" : "查看"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 分页 */}
            {resp.total > PAGE_SIZE && (
              <div className={s.cardBody} style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 12 }}>
                <button
                  className={s.btnSecondary}
                  onClick={() => { const p = Math.max(1, page - 1); setPage(p); load({ page: p }); }}
                  disabled={page <= 1}
                  style={{ fontSize: 12 }}
                >
                  上一页
                </button>
                <span style={{ fontSize: 12, lineHeight: "30px", color: "var(--text-secondary)" }}>
                  第 {page} / {Math.ceil(resp.total / PAGE_SIZE)} 页
                </span>
                <button
                  className={s.btnSecondary}
                  onClick={() => { const p = page + 1; setPage(p); load({ page: p }); }}
                  disabled={page >= Math.ceil(resp.total / PAGE_SIZE)}
                  style={{ fontSize: 12 }}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── 审批详情侧栏 ── */}
      <RightDrawer
        open={drawerOpen}
        title={`${isApprovalEngine ? "审批操作" : "任务详情"} — ${BIZ_TYPE_LABEL[selected?.bizType ?? ""] ?? ""} ${selected?.bizNo ?? ""}`}
        onClose={() => setDrawerOpen(false)}
      >
        {/* ApprovalEngine 任务：显示完整审批表单 */}
        {isApprovalEngine && detail && (
          <div style={{ padding: "0 20px" }}>
            <div className={s.detailSection} style={{ marginBottom: 16 }}>
              <div className={s.detailGrid}>
                <span className={s.detailLabel}>实例编号</span>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{detail.instanceNo}</span>
                <span className={s.detailLabel}>业务类型</span>
                <span>{BIZ_TYPE_LABEL[detail.bizType] ?? detail.bizType}</span>
                <span className={s.detailLabel}>单据编号</span>
                <span style={{ fontWeight: 600 }}>{detail.bizNo}</span>
                {detail.subject && <>
                  <span className={s.detailLabel}>主题</span>
                  <span style={{ fontSize: 13 }}>{detail.subject}</span>
                </>}
                {detail.amount != null && <>
                  <span className={s.detailLabel}>金额</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    <DollarSign size={12} style={{ marginRight: 2, verticalAlign: "middle" }} />
                    {fmtAmount(detail.amount, detail.currencyCode)}
                  </span>
                </>}
                {detail.companyName && <>
                  <span className={s.detailLabel}>公司</span>
                  <span style={{ fontSize: 13 }}>{detail.companyName}</span>
                </>}
                {detail.projectName && <>
                  <span className={s.detailLabel}>项目</span>
                  <span style={{ fontSize: 13 }}>{detail.projectName}</span>
                </>}
                <span className={s.detailLabel}>审批进度</span>
                <span>步骤 {detail.currentStepNo}/{detail.totalSteps}</span>
              </div>
            </div>

            <h4 style={{ fontSize: 14, fontWeight: 600, margin: "16px 0 12px", color: "var(--text-primary)" }}>审批历史</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {detail.steps.map(step => (
                <div key={step.id} style={{
                  display: "flex", gap: 12, padding: "10px 14px",
                  background: step.status === "APPROVED" ? "color-mix(in srgb, var(--status-success) 12%, transparent)" : step.status === "REJECTED" ? "color-mix(in srgb, var(--status-danger) 10%, transparent)" : "var(--bg-muted)",
                  borderRadius: 8, border: "1px solid var(--border)",
                }}>
                  <div style={{ fontSize: 13, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>步骤 {step.stepNo}</span>
                      <StatusBadge status={step.status} />
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                      <User size={11} style={{ marginRight: 4 }} />
                      <code style={{ fontSize: 11, background: "var(--bg-muted)", padding: "1px 4px", borderRadius: 3 }}>
                        {step.requiredRole || step.approverRole}
                      </code>
                      {step.approverName && <span style={{ marginLeft: 8 }}>{step.approverName}</span>}
                    </div>
                    {step.comment && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-primary)", fontStyle: "italic" }}>
                        &ldquo;{step.comment}&rdquo;
                      </div>
                    )}
                    {step.actedAt && (
                      <div style={{ fontSize: 11, color: "var(--text-disabled)", marginTop: 4 }}>{fmtDate(step.actedAt)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Phase I: 若关联表单提交，展示只读表单数据 */}
            {detail.formSubmission && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px", color: "var(--text-primary)" }}>
                  表单数据
                  <span style={{
                    marginLeft: 8, fontSize: 11, fontWeight: 500, padding: "2px 7px",
                    borderRadius: 4, background: "var(--bg-muted)", color: "var(--text-secondary)",
                    fontFamily: "monospace",
                  }}>
                    {detail.formSubmission.formCode}
                  </span>
                </h4>
                <div style={{ background: "var(--bg-muted)", borderRadius: 10, padding: "16px 18px", border: "1px solid var(--border)" }}>
                  <WorkflowFormRenderer
                    schema={detail.formSubmission.schemaJson as any}
                    uiSchema={detail.formSubmission.uiSchemaJson as any}
                    value={detail.formSubmission.dataJson as Record<string, unknown>}
                    onChange={() => {}}
                    disabled={true}
                  />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-disabled)", marginTop: 6, textAlign: "right" }}>
                  提交编号：{detail.formSubmission.submissionNo}
                  {detail.formSubmission.submittedByName && ` · 提交人：${detail.formSubmission.submittedByName}`}
                </div>
              </div>
            )}

            <h4 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px", color: "var(--text-primary)" }}>审批意见</h4>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="请输入审批意见（拒绝时必填）"
              className={s.textarea}
              rows={3}
              style={{ width: "100%", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button className={s.btnDanger} onClick={handleReject} disabled={submitting} style={{ flex: 1 }}>
                <XCircle size={14} style={{ marginRight: 6 }} />拒绝
              </button>
              <button className={s.btnPrimary} onClick={handleApprove} disabled={submitting} style={{ flex: 2 }}>
                <CheckCircle size={14} style={{ marginRight: 6 }} />
                {submitting ? "处理中…" : "审批通过"}
              </button>
            </div>
          </div>
        )}

        {/* WorkflowEngine 任务：仅显示详情，无审批按钮 */}
        {!isApprovalEngine && selected && (
          <div style={{ padding: "0 20px" }}>
            <div className={s.detailSection}>
              <div className={s.detailGrid}>
                <span className={s.detailLabel}>任务来源</span>
                <span><TaskSourceBadge source={selected.taskSource} /></span>
                <span className={s.detailLabel}>实例编号</span>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{selected.instanceNo ?? "-"}</span>
                <span className={s.detailLabel}>业务类型</span>
                <span>{BIZ_TYPE_LABEL[selected.bizType] ?? selected.bizType ?? "-"}</span>
                <span className={s.detailLabel}>主题</span>
                <span style={{ fontSize: 13 }}>{selected.subject ?? "-"}</span>
                <span className={s.detailLabel}>需审批角色</span>
                <code style={{ fontSize: 11, background: "var(--bg-muted)", padding: "2px 6px", borderRadius: 4 }}>
                  {selected.requiredRole || "-"}
                </code>
                <span className={s.detailLabel}>创建时间</span>
                <span style={{ fontSize: 13 }}>{fmtDate(selected.createdAt)}</span>
              </div>
            </div>
            <p style={{ marginTop: 24, fontSize: 13, color: "var(--text-secondary)" }}>
              通用工作流任务请在对应业务模块中处理。
            </p>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}
