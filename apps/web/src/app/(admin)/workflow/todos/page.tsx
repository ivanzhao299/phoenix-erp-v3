"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle, RefreshCw, User, FileText, Banknote, ShoppingBag, Building2, FolderOpen, DollarSign, Search, Forward } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill } from "@/components/design-system/cockpit-styles";
import { WorkflowFormRenderer, type FormSchema, type UiSchema } from "@/components/workflow/WorkflowFormRenderer";
import { useLanguage } from "@/contexts/LanguageContext";

// ── Auth helper ───────────────────────────────────────────────────────────────
import u from "@/styles/uix-utils.module.css";
function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || '';
}
function authHdr(extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

// ── 统一任务类型 ───────────────────────────────────────────────────────────────
interface UnifiedTask {
  taskSource: string;
  taskId: string;
  instanceId: string;
  instanceNo: string | null;
  bizType: string;
  bizId: string;
  bizNo: string | null;
  subject: string | null;
  amount: number | null;
  currencyCode: string | null;
  companyCode: string | null;
  companyName: string | null;
  projectCode: string | null;
  projectName: string | null;
  requiredRole: string;
  stepNo: number | null;
  totalSteps: number | null;
  currentStepNo: number | null;
  startedBy: string | null;
  status: string;
  createdAt: string;
}
interface TaskListResponse {
  items: UnifiedTask[];
  total: number;
  page: number;
  pageSize: number;
}
interface FormSubmissionSnapshot {
  id: number;
  submissionNo: string;
  formCode: string;
  dataJson: Record<string, unknown>;
  schemaJson: Record<string, unknown>;
  uiSchemaJson: Record<string, unknown>;
  status: string;
  submittedByName: string | null;
  formName: string | null;
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
  formSubmission: FormSubmissionSnapshot | null; // Phase I
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

type ApprovalDecision = "approve" | "reject" | "transfer";
type ReassignCandidate = { userId: string; displayName: string; roleNameZh: string | null };

// ── 工具函数 ──────────────────────────────────────────────────────────────────
const BIZ_TYPE_LABEL: Record<string, string> = {
  PR: "采购申请",
  PO: "采购订单",
  PAYMENT: "付款申请",
  FUND: "股东资金"
};
const BIZ_TYPE_ICON: Record<string, React.ReactNode> = {
  PR: <FileText size={14} />,
  PO: <ShoppingBag size={14} />,
  PAYMENT: <Banknote size={14} />,
  FUND: <Banknote size={14} />
};
function fmtDate(s: string) {
  if (!s) return "-";
  return new Date(s).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function fmtAmount(amount: number | string | null, currency: string | null) {
  if (amount == null) return "-";
  const n = Number(amount);
  if (isNaN(n)) return "-";
  return `${n.toLocaleString("zh-CN", {
    maximumFractionDigits: 0
  })} ${currency ?? ""}`;
}
function getDisplayTotal(resp: TaskListResponse) {
  const apiTotal = Number.isFinite(Number(resp.total)) ? Number(resp.total) : 0;
  const currentPage = Math.max(1, Number(resp.page) || 1);
  const currentPageSize = Math.max(1, Number(resp.pageSize) || 20);
  const loadedMinimum = (currentPage - 1) * currentPageSize + resp.items.length;
  return Math.max(apiTotal, loadedMinimum);
}
function StatusBadge({
  status
}: {
  status: string;
}) {
  const map: Record<string, {
    label: string;
    color: string;
  }> = {
    PENDING: {
      label: "待审批",
      color: "var(--status-warning)"
    },
    APPROVED: {
      label: "已通过",
      color: "var(--status-success)"
    },
    REJECTED: {
      label: "已拒绝",
      color: "var(--status-danger)"
    },
    SKIPPED: {
      label: "已跳过",
      color: "var(--text-disabled)"
    },
    TODO: {
      label: "待处理",
      color: "var(--status-warning)"
    }
  };
  const cfg = map[status] ?? {
    label: status,
    color: "var(--text-disabled)"
  };
  return <span style={{
    color: cfg.color,
    fontWeight: 600,
    fontSize: 12
  }}>{cfg.label}</span>;
}
function TaskSourceBadge({
  source
}: {
  source: string;
}) {
  const isAE = source === "APPROVAL_ENGINE";
  return <span style={{
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: 4,
    background: isAE ? "var(--status-warning-bg-light)" : "var(--status-info-bg)",
    color: isAE ? "var(--status-warning)" : "var(--color-accent)"
  }}>
      {isAE ? "审批引擎" : "通用流程"}
    </span>;
}

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchTodos(params: {
  page: number;
  pageSize: number;
  taskSource?: string;
  bizType?: string;
  keyword?: string;
}): Promise<TaskListResponse> {
  const p = new URLSearchParams();
  p.set("page", String(params.page));
  p.set("pageSize", String(params.pageSize));
  if (params.taskSource) p.set("taskSource", params.taskSource);
  if (params.bizType) p.set("bizType", params.bizType);
  if (params.keyword) p.set("keyword", params.keyword);
  const res = await fetch(`/api/workflow/my-tasks?${p.toString()}`, {
    headers: authHdr(),
    cache: "no-store"   // G150：禁浏览器缓存，避免审批后刷新仍读到旧待办列表
  });
  if (!res.ok) return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20
  };
  return res.json();
}
async function fetchDetail(instanceId: string): Promise<InstanceDetail | null> {
  const res = await fetch(`/api/approval/instances/${instanceId}`, {
    headers: authHdr(),
    cache: "no-store"
  });
  if (!res.ok) return null;
  return res.json();
}
async function approveInstance(instanceId: string, comment: string) {
  const res = await fetch(`/api/approval/instances/${instanceId}/approve`, {
    method: "POST",
    headers: authHdr(),
    body: JSON.stringify({
      comment
    })
  });
  return res.json();
}
async function fetchReassignCandidates(instanceId: string): Promise<ReassignCandidate[]> {
  const res = await fetch(`/api/approval/instances/${instanceId}/reassign-candidates`, {
    headers: authHdr(),
    cache: "no-store"
  });
  if (!res.ok) return [];
  return res.json();
}
async function reassignInstance(instanceId: string, toUserId: string) {
  const res = await fetch(`/api/approval/instances/${instanceId}/reassign`, {
    method: "POST",
    headers: authHdr(),
    body: JSON.stringify({ toUserId })
  });
  return res.json();
}
async function rejectInstance(instanceId: string, comment: string) {
  const res = await fetch(`/api/approval/instances/${instanceId}/reject`, {
    method: "POST",
    headers: authHdr(),
    body: JSON.stringify({
      comment
    })
  });
  return res.json();
}

// ── 组件 ─────────────────────────────────────────────────────────────────────
export default function ApprovalTodosPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [resp, setResp] = useState<TaskListResponse>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20
  });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UnifiedTask | null>(null);
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState<ApprovalDecision>("approve");
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<ReassignCandidate[]>([]);
  const [pickedTo, setPickedTo] = useState("");
  const [reassignLoading, setReassignLoading] = useState(false);

  // 筛选状态
  const [taskSource, setTaskSource] = useState("");
  const [bizType, setBizType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const load = useCallback(async (params?: {
    taskSource?: string;
    bizType?: string;
    keyword?: string;
    page?: number;
  }) => {
    setLoading(true);
    try {
      const r = await fetchTodos({
        page: params?.page ?? page,
        pageSize: PAGE_SIZE,
        taskSource: (params?.taskSource !== undefined ? params.taskSource : taskSource) || undefined,
        bizType: (params?.bizType !== undefined ? params.bizType : bizType) || undefined,
        keyword: (params?.keyword !== undefined ? params.keyword : keyword) || undefined
      });
      setResp(r);
    } finally {
      setLoading(false);
    }
  }, [page, taskSource, bizType, keyword]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  // 消息中心深链：/workflow/todos?instanceId=<id> 直接打开该审批实例详情，
  // 不依赖 my-tasks 列表是否含该条（修复「点通知进来空白」——通知带的是具体实例，
  // 但列表受 DataScope/分页/已被同角色他人处理 等过滤，可能查不到对应条目）。
  useEffect(() => {
    const focusId = searchParams.get("instanceId");
    if (!focusId) return;
    let alive = true;
    (async () => {
      const d = await fetchDetail(focusId);
      if (!alive) return;
      if (!d) {
        toast.error(t('ui.该审批记录不存在或无权查看','该审批记录不存在或无权查看'));
        return;
      }
      // 由实例详情合成最小 UnifiedTask，供抽屉头部与审批/拒绝/转交动作复用
      const synthetic: UnifiedTask = {
        taskSource: "APPROVAL_ENGINE",
        taskId: String(d.id),
        instanceId: String(d.id),
        instanceNo: d.instanceNo ?? null,
        bizType: d.bizType,
        bizId: d.bizId,
        bizNo: d.bizNo ?? null,
        subject: d.subject ?? null,
        amount: d.amount ?? null,
        currencyCode: d.currencyCode ?? null,
        companyCode: d.companyCode ?? null,
        companyName: d.companyName ?? null,
        projectCode: d.projectCode ?? null,
        projectName: d.projectName ?? null,
        requiredRole: "",
        stepNo: d.currentStepNo ?? null,
        totalSteps: d.totalSteps ?? null,
        currentStepNo: d.currentStepNo ?? null,
        startedBy: null,
        status: d.status,
        createdAt: d.startedAt ?? "",
      };
      setSelected(synthetic);
      setComment("");
      setDecision("approve");
      setCandidates([]);
      setPickedTo("");
      setDetail(d);
      setDrawerOpen(true);
    })();
    return () => { alive = false; };
    // 仅在挂载/深链变化时触发；toast/t 稳定引用，无需入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const applyFilter = () => {
    setPage(1);
    load({
      page: 1,
      taskSource,
      bizType,
      keyword
    });
  };
  const resetFilter = () => {
    setTaskSource("");
    setBizType("");
    setKeyword("");
    setPage(1);
    load({
      page: 1,
      taskSource: "",
      bizType: "",
      keyword: ""
    });
  };
  const openDetail = async (todo: UnifiedTask) => {
    setSelected(todo);
    setComment("");
    setDecision("approve");
    setCandidates([]);
    setPickedTo("");
    setDrawerOpen(true);
    if (todo.taskSource === "APPROVAL_ENGINE") {
      setDetail(await fetchDetail(todo.instanceId));
    } else {
      setDetail(null);
    }
  };
  const selectedInstanceId = selected?.instanceId;
  useEffect(() => {
    if (!drawerOpen || !selectedInstanceId || decision !== "transfer") return;
    let alive = true;
    const timer = window.setTimeout(() => {
      if (!alive) return;
      setPickedTo("");
      setReassignLoading(true);
      fetchReassignCandidates(selectedInstanceId)
        .then(rows => {
          if (!alive) return;
          setCandidates(rows);
          setPickedTo(rows[0]?.userId ?? "");
        })
        .catch(() => {
          if (!alive) return;
          setCandidates([]);
          setPickedTo("");
        })
        .finally(() => {
          if (alive) setReassignLoading(false);
        });
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [drawerOpen, selectedInstanceId, decision]);
  const handleApprove = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const r = await approveInstance(selected.instanceId, comment);
      if (r.statusCode && r.statusCode >= 400) {
        toast.error(r.message || t('ui.操作失败','操作失败'));
      } else {
        toast.success(r.finished ? t('ui.审批完成，单据已通过','审批完成，单据已通过') : t('ui.已通过，等待下一级审批','已通过，等待下一级审批'));
        setDrawerOpen(false);
        // G150：乐观移除——点完即从列表消失，不等整页刷新；随后 load() 对账
        //   （若本人恰是下一级审批人，会在 load() 后以新步骤正确重新出现）
        setResp(prev => ({ ...prev, items: prev.items.filter(t => t.instanceId !== selected.instanceId), total: Math.max(0, prev.total - 1) }));
        load();
      }
    } catch {
      toast.error(t('ui.网络错误','网络错误'));
    } finally {
      setSubmitting(false);
    }
  };
  const handleReject = async () => {
    if (!selected) return;
    if (!comment.trim()) {
      toast.warning(t('ui.拒绝时必须填写意见','拒绝时必须填写意见'));
      return;
    }
    setSubmitting(true);
    try {
      const r = await rejectInstance(selected.instanceId, comment);
      if (r.statusCode && r.statusCode >= 400) {
        toast.error(r.message || t('ui.操作失败','操作失败'));
      } else {
        toast.error(t('ui.已拒绝，单据流程终止','已拒绝，单据流程终止'));
        setDrawerOpen(false);
        setResp(prev => ({ ...prev, items: prev.items.filter(t => t.instanceId !== selected.instanceId), total: Math.max(0, prev.total - 1) }));
        load();
      }
    } catch {
      toast.error(t('ui.网络错误','网络错误'));
    } finally {
      setSubmitting(false);
    }
  };
  const handleReassign = async () => {
    if (!selected || !pickedTo) return;
    setSubmitting(true);
    try {
      const r = await reassignInstance(selected.instanceId, pickedTo);
      if (r.statusCode && r.statusCode >= 400) {
        toast.error(r.message || t('ui.转交失败','转交失败'));
      } else {
        toast.success(`${t('ui.已转交给','已转交给')} ${r.toName ?? t('ui.审批人','审批人')}`);
        setDrawerOpen(false);
        setResp(prev => ({ ...prev, items: prev.items.filter(t => t.instanceId !== selected.instanceId), total: Math.max(0, prev.total - 1) }));
        load();
      }
    } catch {
      toast.error(t('ui.网络错误','网络错误'));
    } finally {
      setSubmitting(false);
    }
  };
  const submitDecision = () => {
    if (decision === "approve") void handleApprove();
    else if (decision === "reject") void handleReject();
    else void handleReassign();
  };
  const isApprovalEngine = selected?.taskSource === "APPROVAL_ENGINE";
  const displayTotal = getDisplayTotal(resp);
  const totalPages = Math.max(1, Math.ceil(displayTotal / PAGE_SIZE));
  return <div>
      <PageHeader title={t('ui.审批待办','审批待办')} subtitle={`${t('ui.我的待审批任务（共','我的待审批任务（共')} ${displayTotal} ${t('ui.条）','条）')}`} breadcrumb={[t('ui.审批中心','审批中心'), t('ui.待办','待办')]} />

      <section className={s.card}>
        {/* ── 筛选栏 ── */}
        <div className={s.cardBody} style={{
        borderBottom: "1px solid var(--bg-muted)",
        paddingBottom: 12,
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "center"
      }}>
          <select value={taskSource} onChange={e => setTaskSource(e.target.value)} className={s.select} style={{
          minWidth: 120
        }}>
            <option value="">{t('ui.全部来源','全部来源')}</option>
            <option value="APPROVAL_ENGINE">{t('ui.审批引擎','审批引擎')}</option>
            <option value="WORKFLOW_ENGINE">{t('ui.通用流程','通用流程')}</option>
          </select>

          <select value={bizType} onChange={e => setBizType(e.target.value)} className={s.select} style={{
          minWidth: 120
        }}>
            <option value="">{t('ui.全部类型','全部类型')}</option>
            <option value="PR">{t('ui.采购申请','采购申请')}</option>
            <option value="PO">{t('ui.采购订单','采购订单')}</option>
            <option value="PAYMENT">{t('ui.付款申请','付款申请')}</option>
            <option value="FUND">{t('ui.股东资金','股东资金')}</option>
          </select>

          <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: 1,
          minWidth: 180
        }}>
            <Search size={14} style={{
            color: "var(--text-disabled)"
          }} />
            <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === "Enter" && applyFilter()} placeholder={t('ui.搜索单号、主题…','搜索单号、主题…')} className={`${s.input} ${u.flex1}`} />
          </div>

          <button className={`${s.btnPrimary} ${u.fs12}`} onClick={applyFilter}>
            {t('ui.搜索','搜索')}
          </button>
          <button className={`${s.btnSecondary} ${u.fs12}`} onClick={resetFilter}>
            {t('ui.重置','重置')}
          </button>
          <button onClick={() => load()} disabled={loading} style={{ ...secondaryActionButton, fontSize: 12, marginLeft: "auto" }}>
            <RefreshCw size={13} style={{
            marginRight: 5
          }} />
            {t('ui.刷新','刷新')}
          </button>
        </div>

        {loading ? <div className={s.cardBody} style={{
        textAlign: "center",
        color: "var(--text-disabled)",
        padding: 48
      }}>{t('ui.加载中…','加载中…')}</div> : resp.items.length === 0 ? <div className={s.cardBody} style={{
        textAlign: "center",
        color: "var(--text-disabled)",
        padding: 48
      }}>
            <CheckCircle size={36} style={{
          margin: "0 auto 12px",
          opacity: 0.4
        }} />
            <p>{t('ui.暂无待审批任务','暂无待审批任务')}</p>
          </div> : <>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>{t('ui.来源','来源')}</th>
                  <th>{t('ui.业务类型','业务类型')}</th>
                  <th>{t('ui.单据编号','单据编号')}</th>
                  <th>{t('ui.主题','主题')}</th>
                  <th>{t('ui.金额','金额')}</th>
                  <th>{t('ui.公司','公司')}</th>
                  <th>{t('ui.项目','项目')}</th>
                  <th>{t('ui.需审批角色','需审批角色')}</th>
                  <th>{t('ui.步骤','步骤')}</th>
                  <th>{t('ui.提交时间','提交时间')}</th>
                  <th>{t('ui.操作','操作')}</th>
                </tr>
              </thead>
              <tbody>
                {resp.items.map(todo => <tr key={`${todo.taskSource}-${todo.taskId}`}>
                    <td><TaskSourceBadge source={todo.taskSource} /></td>
                    <td>
                      <span style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}>
                        {BIZ_TYPE_ICON[todo.bizType]}
                        {BIZ_TYPE_LABEL[todo.bizType] ?? todo.bizType ?? "-"}
                      </span>
                    </td>
                    <td>
                      <span style={{
                  fontWeight: 600,
                  fontFamily: "monospace",
                  fontSize: 12
                }}>
                        {todo.bizNo || todo.bizId}
                      </span>
                    </td>
                    <td>
                      <span style={{
                  fontSize: 12,
                  color: "var(--text-primary)",
                  maxWidth: 140,
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}>
                        {todo.subject || "-"}
                      </span>
                    </td>
                    <td>
                      <span style={{
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  fontSize: 13
                }}>
                        {fmtAmount(todo.amount, todo.currencyCode)}
                      </span>
                    </td>
                    <td>
                      <span style={{
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}>
                        {todo.companyName && <Building2 size={11} style={{
                    flexShrink: 0
                  }} />}
                        {todo.companyName ?? todo.companyCode ?? "-"}
                      </span>
                    </td>
                    <td>
                      <span style={{
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}>
                        {todo.projectName && <FolderOpen size={11} style={{
                    flexShrink: 0
                  }} />}
                        {todo.projectName ?? todo.projectCode ?? "-"}
                      </span>
                    </td>
                    <td>
                      <code style={{
                  fontSize: 11,
                  background: "var(--bg-muted)",
                  padding: "2px 6px",
                  borderRadius: 4
                }}>
                        {todo.requiredRole || "-"}
                      </code>
                    </td>
                    <td>
                      {todo.currentStepNo != null && todo.totalSteps != null ? <span style={{
                  color: "var(--status-warning)",
                  fontWeight: 600
                }}>
                          {todo.currentStepNo}/{todo.totalSteps}
                        </span> : "-"}
                    </td>
                    <td className={u.fs12}>{fmtDate(todo.createdAt)}</td>
                    <td>
                      <button className={`${s.btnPrimary} ${u.fs12}`} onClick={() => openDetail(todo)}>
                        {todo.taskSource === "APPROVAL_ENGINE" ? t('ui.审批','审批') : t('ui.查看','查看')}
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>

            {/* 分页 */}
            {displayTotal > PAGE_SIZE && <div className={s.cardBody} style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          paddingTop: 12
        }}>
                <button className={`${s.btnSecondary} ${u.fs12}`} onClick={() => {
            const p = Math.max(1, page - 1);
            setPage(p);
            load({
              page: p
            });
          }} disabled={page <= 1}>
                  {t('ui.上一页','上一页')}
                </button>
                <span style={{
            fontSize: 12,
            lineHeight: "30px",
            color: "var(--text-secondary)"
          }}>
                  {t('ui.第','第')} {page} / {totalPages} {t('ui.页','页')}
                </span>
                <button className={`${s.btnSecondary} ${u.fs12}`} onClick={() => {
            const p = page + 1;
            setPage(p);
            load({
              page: p
            });
          }} disabled={page >= totalPages}>
                  {t('ui.下一页','下一页')}
                </button>
              </div>}
          </>}
      </section>

      {/* ── 审批详情侧栏 ── */}
      <RightDrawer open={drawerOpen} title={`${isApprovalEngine ? t('ui.审批操作','审批操作') : t('ui.任务详情','任务详情')} — ${BIZ_TYPE_LABEL[selected?.bizType ?? ""] ?? ""} ${selected?.bizNo ?? ""}`} onClose={() => setDrawerOpen(false)}>
        {/* ApprovalEngine 任务：显示完整审批表单 */}
        {isApprovalEngine && detail && <div style={{
        padding: "0 20px"
      }}>
            <div className={`${s.detailSection} ${u.mb16}`}>
              <div className={s.detailGrid}>
                <span className={s.detailLabel}>{t('ui.实例编号','实例编号')}</span>
                <span style={{
              fontFamily: "monospace",
              fontSize: 13
            }}>{detail.instanceNo}</span>
                <span className={s.detailLabel}>{t('ui.业务类型','业务类型')}</span>
                <span>{BIZ_TYPE_LABEL[detail.bizType] ?? detail.bizType}</span>
                <span className={s.detailLabel}>{t('ui.单据编号','单据编号')}</span>
                <span className={u.fw600}>{detail.bizNo}</span>
                {detail.subject && <>
                  <span className={s.detailLabel}>{t('ui.主题','主题')}</span>
                  <span className={u.fs13}>{detail.subject}</span>
                </>}
                {detail.amount != null && <>
                  <span className={s.detailLabel}>{t('ui.金额','金额')}</span>
                  <span style={{
                fontWeight: 600,
                color: "var(--text-primary)"
              }}>
                    <DollarSign size={12} style={{
                  marginRight: 2,
                  verticalAlign: "middle"
                }} />
                    {fmtAmount(detail.amount, detail.currencyCode)}
                  </span>
                </>}
                {detail.companyName && <>
                  <span className={s.detailLabel}>{t('ui.公司','公司')}</span>
                  <span className={u.fs13}>{detail.companyName}</span>
                </>}
                {detail.projectName && <>
                  <span className={s.detailLabel}>{t('ui.项目','项目')}</span>
                  <span className={u.fs13}>{detail.projectName}</span>
                </>}
                <span className={s.detailLabel}>{t('ui.审批进度','审批进度')}</span>
                <span>{t('ui.步骤','步骤')} {detail.currentStepNo}/{detail.totalSteps}</span>
              </div>
            </div>

            <h4 style={{
          fontSize: 14,
          fontWeight: 600,
          margin: "16px 0 12px",
          color: "var(--text-primary)"
        }}>{t('ui.审批历史','审批历史')}</h4>
            <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 20
        }}>
              {detail.steps.map(step => <div key={step.id} style={{
            display: "flex",
            gap: 12,
            padding: "10px 14px",
            background: step.status === "APPROVED" ? "color-mix(in srgb, var(--status-success) 12%, transparent)" : step.status === "REJECTED" ? "color-mix(in srgb, var(--status-danger) 10%, transparent)" : "var(--bg-muted)",
            borderRadius: 8,
            border: "1px solid var(--border)"
          }}>
                  <div style={{
              fontSize: 13,
              flex: 1
            }}>
                    <div style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 4
              }}>
                      <span className={u.fw600}>{t('ui.步骤','步骤')} {step.stepNo}</span>
                      <StatusBadge status={step.status} />
                    </div>
                    <div className={u.muted12}>
                      <User size={11} style={{
                  marginRight: 4
                }} />
                      <code style={{
                  fontSize: 11,
                  background: "var(--bg-muted)",
                  padding: "1px 4px",
                  borderRadius: 3
                }}>
                        {step.requiredRole || step.approverRole}
                      </code>
                      {step.approverName && <span style={{
                  marginLeft: 8
                }}>{step.approverName}</span>}
                    </div>
                    {step.comment && <div style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--text-primary)",
                fontStyle: "italic"
              }}>
                        &ldquo;{step.comment}&rdquo;
                      </div>}
                    {step.actedAt && <div style={{
                fontSize: 11,
                color: "var(--text-disabled)",
                marginTop: 4
              }}>{fmtDate(step.actedAt)}</div>}
                  </div>
                </div>)}
            </div>

            {/* Phase I: 若关联表单提交，展示只读表单数据 */}
            {detail.formSubmission && <div className={u.mb20}>
                <h4 style={{
            fontSize: 14,
            fontWeight: 600,
            margin: "0 0 12px",
            color: "var(--text-primary)"
          }}>
                  {t('ui.表单数据','表单数据')}
                  <span style={{
              marginLeft: 8,
              fontSize: 11,
              fontWeight: 500,
              padding: "2px 7px",
              borderRadius: 4,
              background: "var(--bg-muted)",
              color: "var(--text-secondary)",
              fontFamily: "monospace"
            }}>
                    {detail.formSubmission.formCode}
                  </span>
                </h4>
                <div style={{
            background: "var(--bg-muted)",
            borderRadius: 10,
            padding: "16px 18px",
            border: "1px solid var(--border)"
          }}>
                  <WorkflowFormRenderer schema={detail.formSubmission.schemaJson as unknown as FormSchema} uiSchema={detail.formSubmission.uiSchemaJson as unknown as UiSchema} value={detail.formSubmission.dataJson as Record<string, unknown>} onChange={() => {}} disabled={true} />
                </div>
                <div style={{
            fontSize: 11,
            color: "var(--text-disabled)",
            marginTop: 6,
            textAlign: "right"
          }}>
                  {t('ui.提交编号：','提交编号：')}{detail.formSubmission.submissionNo}
                  {detail.formSubmission.submittedByName && ` · ${t('ui.提交人：','提交人：')}${detail.formSubmission.submittedByName}`}
                </div>
              </div>}

            <h4 style={{
          fontSize: 14,
          fontWeight: 600,
          margin: "0 0 12px",
          color: "var(--text-primary)"
        }}>{t('ui.审批意见','审批意见')}</h4>
            <p className={s.modalDesc} style={{ margin: "0 0 10px" }}>
              {t('ui.默认同意。候选转交人由后端按角色权限、公司/项目数据域和自审分离规则过滤。','默认同意。候选转交人由后端按角色权限、公司/项目数据域和自审分离规则过滤。')}
            </p>
            <div style={decisionTabsStyle}>
              <button type="button" onClick={() => setDecision("approve")} style={decisionButtonStyle(decision === "approve", "success")}>
                <CheckCircle size={14} /> {t('ui.同意','同意')}
              </button>
              <button type="button" onClick={() => setDecision("reject")} style={decisionButtonStyle(decision === "reject", "danger")}>
                <XCircle size={14} /> {t('ui.不同意','不同意')}
              </button>
              <button type="button" onClick={() => setDecision("transfer")} style={decisionButtonStyle(decision === "transfer", "info")}>
                <Forward size={14} /> {t('ui.转交审批','转交审批')}
              </button>
            </div>
            {decision === "transfer" && <div style={{ marginBottom: 16, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-muted)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>{t('ui.转交给（有确认权且数据域覆盖本单据的人）','转交给（有确认权且数据域覆盖本单据的人）')}</div>
              {reassignLoading ? <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: 8 }}>{t('ui.加载候选人…','加载候选人…')}</div>
                : candidates.length === 0 ? <div style={{ fontSize: 12, color: "var(--status-warning)", padding: 8 }}>{t('ui.无可转交对象（无人同时具备确认权与本单据数据域）','无可转交对象（无人同时具备确认权与本单据数据域）')}</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                    {candidates.map(c => (
                      <label key={c.userId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, cursor: "pointer", background: pickedTo === c.userId ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent" }}>
                        <input type="radio" name="reassignTo" checked={pickedTo === c.userId} onChange={() => setPickedTo(c.userId)} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{c.displayName}</span>
                        {c.roleNameZh && <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: "auto" }}>{c.roleNameZh}</span>}
                      </label>
                    ))}
                  </div>}
            </div>}
            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder={decision === "approve" ? t('ui.填写审批意见（可不填）','填写审批意见（可不填）') : decision === "reject" ? t('ui.请填写不同意原因…','请填写不同意原因…') : t('ui.填写转交说明，便于接收人理解背景（可不填）','填写转交说明，便于接收人理解背景（可不填）')} className={s.textarea} rows={3} style={{
          width: "100%",
          marginBottom: 16
        }} />
            <div style={{
          display: "flex",
          gap: 12,
          justifyContent: "flex-end",
          flexWrap: "wrap"
        }}>
              <button onClick={submitDecision} disabled={submitting || (decision === "transfer" && (reassignLoading || !pickedTo))} style={decision === "reject" ? { ...actionPill('danger'), justifyContent: "center", minWidth: 160 } : decision === "transfer" ? { ...actionPill('info'), justifyContent: "center", minWidth: 180 } : { ...primaryActionButton, justifyContent: "center", minWidth: 160 }}>
                {submitting ? t('ui.处理中…','处理中…') : decision === "approve" ? t('ui.提交同意','提交同意') : decision === "reject" ? t('ui.提交不同意','提交不同意') : t('ui.确认转交审批','确认转交审批')}
              </button>
            </div>
          </div>}

        {/* WorkflowEngine 任务：仅显示详情，无审批按钮 */}
        {!isApprovalEngine && selected && <div style={{
        padding: "0 20px"
      }}>
            <div className={s.detailSection}>
              <div className={s.detailGrid}>
                <span className={s.detailLabel}>{t('ui.任务来源','任务来源')}</span>
                <span><TaskSourceBadge source={selected.taskSource} /></span>
                <span className={s.detailLabel}>{t('ui.实例编号','实例编号')}</span>
                <span style={{
              fontFamily: "monospace",
              fontSize: 13
            }}>{selected.instanceNo ?? "-"}</span>
                <span className={s.detailLabel}>{t('ui.业务类型','业务类型')}</span>
                <span>{BIZ_TYPE_LABEL[selected.bizType] ?? selected.bizType ?? "-"}</span>
                <span className={s.detailLabel}>{t('ui.主题','主题')}</span>
                <span className={u.fs13}>{selected.subject ?? "-"}</span>
                <span className={s.detailLabel}>{t('ui.需审批角色','需审批角色')}</span>
                <code style={{
              fontSize: 11,
              background: "var(--bg-muted)",
              padding: "2px 6px",
              borderRadius: 4
            }}>
                  {selected.requiredRole || "-"}
                </code>
                <span className={s.detailLabel}>{t('ui.创建时间','创建时间')}</span>
                <span className={u.fs13}>{fmtDate(selected.createdAt)}</span>
              </div>
            </div>
            <p style={{
          marginTop: 24,
          fontSize: 13,
          color: "var(--text-secondary)"
        }}>
              {t('ui.通用工作流任务请在对应业务模块中处理。','通用工作流任务请在对应业务模块中处理。')}
            </p>
          </div>}
      </RightDrawer>
    </div>;
}

const decisionTabsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 12,
  padding: 4,
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)",
  border: "1px solid var(--border)"
};

function decisionButtonStyle(active: boolean, tone: "success" | "danger" | "info"): React.CSSProperties {
  const color = tone === "success" ? "var(--status-success)" : tone === "danger" ? "var(--status-danger)" : "var(--status-info)";
  return {
    minHeight: 40,
    borderRadius: "var(--radius-sm)",
    border: `1px solid ${active ? color : "transparent"}`,
    background: active ? `color-mix(in srgb, ${color} 14%, transparent)` : "transparent",
    color: active ? color : "var(--text-secondary)",
    fontWeight: 800,
    cursor: "pointer",
    transition: "background .16s ease, color .16s ease, border-color .16s ease",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  };
}
