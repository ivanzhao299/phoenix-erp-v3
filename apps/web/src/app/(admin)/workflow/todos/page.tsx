"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, RefreshCw, User, FileText, Banknote, ShoppingBag, Building2, FolderOpen, DollarSign } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型 ─────────────────────────────────────────────────────────────────────
interface ApprovalTodo {
  step_id: string;
  step_no: number;
  approver_role: string;
  step_status: string;
  instance_id: string;
  instance_no: string;
  module_code: string;
  biz_type: string;
  biz_id: string;
  biz_no: string;
  total_steps: number;
  current_step_no: number;
  started_at: string;
  started_by: string;
  // Phase B 新增业务摘要字段
  amount: string | null;
  currency_code: string | null;
  company_code: string | null;
  company_name: string | null;
  project_code: string | null;
  project_name: string | null;
  subject: string | null;
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
  PR: "采购申请",
  PO: "采购订单",
  PAYMENT: "付款申请",
  FUND: "股东资金",
};

const BIZ_TYPE_ICON: Record<string, React.ReactNode> = {
  PR:      <FileText  size={14} />,
  PO:      <ShoppingBag size={14} />,
  PAYMENT: <Banknote  size={14} />,
  FUND:    <Banknote  size={14} />,
};

function fmtDate(s: string) {
  if (!s) return "-";
  return new Date(s).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtAmount(amount: string | number | null, currency: string | null) {
  if (!amount) return "-";
  const n = Number(amount);
  if (isNaN(n)) return "-";
  return `${n.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} ${currency ?? ""}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    PENDING:   { label: "待审批", color: "#f59e0b" },
    APPROVED:  { label: "已通过", color: "#22c55e" },
    REJECTED:  { label: "已拒绝", color: "#ef4444" },
    SKIPPED:   { label: "已跳过", color: "#9ca3af" },
  };
  const cfg = map[status] ?? { label: status, color: "#9ca3af" };
  return (
    <span style={{ color: cfg.color, fontWeight: 600, fontSize: 12 }}>{cfg.label}</span>
  );
}

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchTodos(): Promise<ApprovalTodo[]> {
  const res = await fetch("/api/approval/todos", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

async function fetchDetail(instanceId: string): Promise<InstanceDetail | null> {
  const res = await fetch(`/api/approval/instances/${instanceId}`, { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

async function approveInstance(instanceId: string, comment: string) {
  const res = await fetch(`/api/approval/instances/${instanceId}/approve`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  return res.json();
}

async function rejectInstance(instanceId: string, comment: string) {
  const res = await fetch(`/api/approval/instances/${instanceId}/reject`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  return res.json();
}

// ── 组件 ─────────────────────────────────────────────────────────────────────
export default function ApprovalTodosPage() {
  const toast = useToast();
  const [todos, setTodos]       = useState<ApprovalTodo[]>([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<ApprovalTodo | null>(null);
  const [detail, setDetail]     = useState<InstanceDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [comment, setComment]   = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTodos();
      setTodos(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (todo: ApprovalTodo) => {
    setSelected(todo);
    setComment("");
    setDrawerOpen(true);
    const d = await fetchDetail(todo.instance_id);
    setDetail(d);
  };

  const handleApprove = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const r = await approveInstance(selected.instance_id, comment);
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
      const r = await rejectInstance(selected.instance_id, comment);
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

  return (
    <div>
      <PageHeader
        title="审批待办"
        subtitle={`我的待审批任务（${todos.length} 条）`}
        breadcrumb={["审批中心", "待办"]}
      />

      <section className={s.card}>
        <div className={s.cardBody} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className={s.cardTitle}>待我审批</h3>
          <button className={s.btnSecondary} onClick={load} disabled={loading}>
            <RefreshCw size={14} style={{ marginRight: 6 }} />
            刷新
          </button>
        </div>

        {loading ? (
          <div className={s.cardBody} style={{ textAlign: "center", color: "#9ca3af", padding: 48 }}>
            加载中…
          </div>
        ) : todos.length === 0 ? (
          <div className={s.cardBody} style={{ textAlign: "center", color: "#9ca3af", padding: 48 }}>
            <CheckCircle size={36} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <p>暂无待审批任务</p>
          </div>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
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
              {todos.map(todo => (
                <tr key={todo.step_id}>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {BIZ_TYPE_ICON[todo.biz_type]}
                      {BIZ_TYPE_LABEL[todo.biz_type] ?? todo.biz_type}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>{todo.biz_no || todo.biz_id}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: "#374151", maxWidth: 140, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {todo.subject || "-"}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: 13 }}>
                      {fmtAmount(todo.amount, todo.currency_code)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                      {todo.company_name && <Building2 size={11} style={{ flexShrink: 0 }} />}
                      {todo.company_name ?? todo.company_code ?? "-"}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                      {todo.project_name && <FolderOpen size={11} style={{ flexShrink: 0 }} />}
                      {todo.project_name ?? todo.project_code ?? "-"}
                    </span>
                  </td>
                  <td>
                    <code style={{ fontSize: 11, background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>
                      {todo.approver_role}
                    </code>
                  </td>
                  <td>
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                      {todo.current_step_no}/{todo.total_steps}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{fmtDate(todo.started_at)}</td>
                  <td>
                    <button className={s.btnPrimary} style={{ fontSize: 12 }} onClick={() => openDetail(todo)}>
                      审批
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 审批详情侧栏 ── */}
      <RightDrawer
        open={drawerOpen}
        title={`审批操作 — ${BIZ_TYPE_LABEL[selected?.biz_type ?? ""] ?? ""} ${selected?.biz_no ?? ""}`}
        onClose={() => setDrawerOpen(false)}
      >
        {detail && (
          <div style={{ padding: "0 20px" }}>
            {/* 实例基本信息 */}
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
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>
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

            {/* 审批步骤历史 */}
            <h4 style={{ fontSize: 14, fontWeight: 600, margin: "16px 0 12px", color: "#374151" }}>
              审批历史
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {detail.steps.map(step => (
                <div key={step.id} style={{
                  display: "flex", gap: 12, padding: "10px 14px",
                  background: step.status === "APPROVED" ? "#f0fdf4"
                    : step.status === "REJECTED" ? "#fef2f2"
                    : "#f8fafc",
                  borderRadius: 8, border: "1px solid #e5e7eb",
                }}>
                  <div style={{ fontSize: 13, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>步骤 {step.stepNo}</span>
                      <StatusBadge status={step.status} />
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      <User size={11} style={{ marginRight: 4 }} />
                      <code style={{ fontSize: 11, background: "#f1f5f9", padding: "1px 4px", borderRadius: 3 }}>
                        {step.requiredRole || step.approverRole}
                      </code>
                      {step.approverName && <span style={{ marginLeft: 8 }}>{step.approverName}</span>}
                    </div>
                    {step.comment && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#374151", fontStyle: "italic" }}>
                        "{step.comment}"
                      </div>
                    )}
                    {step.actedAt && (
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{fmtDate(step.actedAt)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 审批操作区 */}
            <h4 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px", color: "#374151" }}>
              审批意见
            </h4>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="请输入审批意见（拒绝时必填）"
              className={s.textarea}
              rows={3}
              style={{ width: "100%", marginBottom: 16 }}
            />

            <div style={{ display: "flex", gap: 12 }}>
              <button
                className={s.btnDanger}
                onClick={handleReject}
                disabled={submitting}
                style={{ flex: 1 }}
              >
                <XCircle size={14} style={{ marginRight: 6 }} />
                拒绝
              </button>
              <button
                className={s.btnPrimary}
                onClick={handleApprove}
                disabled={submitting}
                style={{ flex: 2 }}
              >
                <CheckCircle size={14} style={{ marginRight: 6 }} />
                {submitting ? "处理中…" : "审批通过"}
              </button>
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}
