"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { WorkflowDataView } from "@/components/workflow/WorkflowDataView";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type ApprovalReassignCandidate, type WorkflowTask } from "@/lib/workflow-api";
import u from "@/styles/uix-utils.module.css";
import {
  primaryActionButton, secondaryActionButton, actionPill,
  detailInfoBox,
} from "@/components/design-system/cockpit-styles";
export default function WorkflowTodoPage() {
  const [rows, setRows] = useState<WorkflowTask[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject" | "transfer">("approve");
  const [transferCandidates, setTransferCandidates] = useState<ApprovalReassignCandidate[]>([]);
  const [transferTarget, setTransferTarget] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = useMemo(() => rows.find(row => row.id === selectedId) || rows[0] || null, [rows, selectedId]);
  const load = useCallback(async () => {
    // WF-2 P0：禁止 catch-swallow — 5xx 必须显式提示
    setError("");
    try {
      const res = await workflowApi.todo();
      const nextRows = res.data || [];
      setRows(nextRows);
      setSelectedId(current => current && nextRows.some(row => row.id === current) ? current : nextRows[0]?.id || null);
    } catch (err) {
      console.error('[workflow/todo] load failed:', err);
      setError(err instanceof Error ? `加载待办失败：${err.message}` : '加载待办失败');
      setRows([]);
    }
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
  useEffect(() => {
    if (!selected || decision !== "transfer") return;
    let alive = true;
    setCandidateLoading(true);
    setError("");
    workflowApi.approvalReassignCandidates(selected.instance_id)
      .then(rows => {
        if (!alive) return;
        setTransferCandidates(rows);
        setTransferTarget(rows[0]?.userId ?? "");
      })
      .catch(err => {
        if (!alive) return;
        setTransferCandidates([]);
        setTransferTarget("");
        setError(err instanceof Error ? friendlyError(err.message) : "加载转交候选人失败");
      })
      .finally(() => {
        if (alive) setCandidateLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected?.instance_id, decision]);
  async function act(type: "approve" | "reject") {
    if (!selected) return;
    if (type === "reject" && !comment.trim()) {
      setError("请填写不同意原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (type === "approve") await workflowApi.approve(selected.id, comment.trim());else await workflowApi.reject(selected.id, comment.trim());
      setComment("");
      setDecision("approve");
      setNotice(type === "approve" ? "已同意审批。" : "已提交不同意。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "处理失败");
    } finally {
      setLoading(false);
    }
  }
  async function saveComment() {
    if (!selected || !comment.trim()) {
      setError("请先填写审批意见。");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await workflowApi.comment(selected.id, comment.trim());
      setComment("");
      setNotice("已补充审批意见。");
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "保存意见失败");
    } finally {
      setLoading(false);
    }
  }
  async function transfer() {
    if (!selected) return;
    if (!transferTarget) {
      setError("请选择转交审批人。");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await workflowApi.approvalReassign(selected.instance_id, transferTarget);
      setComment("");
      setDecision("approve");
      setTransferTarget("");
      setNotice(res.toName ? `任务已转交给 ${res.toName}。` : "任务已转交。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "转交失败");
    } finally {
      setLoading(false);
    }
  }
  return <div>
      <PageHeader title="我的待办" subtitle="处理分配给我的审批任务，查看表单内容后给出审批意见" breadcrumb={["工作流", "我的待办"]} />

      <div style={layoutStyle}>
        <section className={s.card}>
          <div className={s.cardBody}>
            <div style={sectionHeaderStyle}>
              <div>
                <h3 className={s.cardTitle}>待处理</h3>
                <p className={`${s.modalDesc} ${u.mt4}`}>共 {rows.length} 条待办</p>
              </div>
              <Link href="/workflow/start" style={secondaryActionButton}>发起申请</Link>
            </div>

            {rows.length ? <div style={taskListStyle}>
                {rows.map(row => <button key={row.id} type="button" style={row.id === selected?.id ? selectedTaskStyle : taskStyle} onClick={() => {
              setSelectedId(row.id);
              setComment("");
              setError("");
              setNotice("");
              setDecision("approve");
              setTransferTarget("");
            }}>
                    <strong>{row.title}</strong>
                    <span>{row.node_name} · {row.starter_name || "发起人"}</span>
                    <small>{row.definition_name || row.instance_no || row.task_no}</small>
                  </button>)}
              </div> : <div className={s.emptyState}><div className={s.emptyStateText}>当前没有待审批任务。</div></div>}
          </div>
        </section>

        <section className={s.card}>
          {selected ? <div className={s.cardBody}>
              <div style={detailHeaderStyle}>
                <div>
                  <h3 className={s.cardTitle}>{selected.title}</h3>
                  <p className={`${s.modalDesc} ${u.mt4}`}>{selected.definition_name || "工作流"} · {selected.node_name}</p>
                </div>
                <span style={actionPill('info')}>{statusText(selected.status)}</span>
              </div>

              <div className={`${s.infoGrid3} ${u.mb16}`}>
                <Meta label="流程编号" value={selected.instance_no || "-"} />
                <Meta label="发起人" value={selected.starter_name || "-"} />
                <Meta label="当前节点" value={selected.node_name || "-"} />
                <Meta label="到期时间" value={formatDate(selected.due_at) || "未设置"} />
              </div>

              <ApprovalAssist task={selected} onUseTemplate={setComment} />

              <h4 className={s.formSection}>申请内容</h4>
              <WorkflowDataView data={selected.form_data_json || {}} schema={selected.form_schema_json} />

              <h4 className={s.formSection}>审批处理</h4>
              <p className={s.modalDesc} style={{
            margin: "0 0 8px"
          }}>选择处理方式并填写意见。转交候选人由后端按角色权限和数据域过滤。</p>
              <div style={decisionTabsStyle}>
                <button type="button" onClick={() => {
              setDecision("approve");
              setError("");
            }} style={decisionButtonStyle(decision === "approve", "success")}>同意</button>
                <button type="button" onClick={() => {
              setDecision("reject");
              setError("");
            }} style={decisionButtonStyle(decision === "reject", "danger")}>不同意</button>
                <button type="button" onClick={() => {
              setDecision("transfer");
              setError("");
            }} style={decisionButtonStyle(decision === "transfer", "info")}>转交审批</button>
              </div>
              {decision === "transfer" ? <div style={transferPanelStyle}>
                  <label className={s.formLabel}>转交审批人 *</label>
                  <select className={s.select} value={transferTarget} onChange={e => setTransferTarget(e.target.value)} disabled={candidateLoading || transferCandidates.length === 0}>
                    {candidateLoading ? <option value="">候选人加载中...</option> : null}
                    {!candidateLoading && transferCandidates.length === 0 ? <option value="">暂无可转交审批人</option> : null}
                    {!candidateLoading && transferCandidates.map(candidate => <option key={candidate.userId} value={candidate.userId}>
                        {candidate.displayName}{candidate.roleNameZh ? ` · ${candidate.roleNameZh}` : ""}
                      </option>)}
                  </select>
                  <p className={s.modalDesc} style={{ margin: 0 }}>候选人已由后端按角色权限、公司/项目数据域和自审分离规则过滤。</p>
                </div> : null}
              <textarea className={s.textarea} placeholder={decision === "approve" ? "填写审批意见，可留空直接同意" : decision === "reject" ? "请填写不同意原因" : "填写转交说明，便于接收人理解背景（可选）"} value={comment} onChange={e => setComment(e.target.value)} />
              {notice ? <div className={s.successBanner}>{notice}</div> : null}
              {error ? <div className={s.errorBanner}>{error}</div> : null}

              <div style={footerStyle}>
                <Link href={`/workflow/instances/${selected.instance_id}`} style={secondaryActionButton}>查看详情</Link>
                <button type="button" style={secondaryActionButton} disabled={loading || !comment.trim()} onClick={saveComment}>补充意见</button>
                <button type="button" style={decision === "reject" ? actionPill('danger') : decision === "transfer" ? actionPill('info') : primaryActionButton} disabled={loading || (decision === "transfer" && (candidateLoading || transferCandidates.length === 0))} onClick={() => {
              if (decision === "approve") void act("approve");
              else if (decision === "reject") void act("reject");
              else void transfer();
            }}>
                  {loading ? "处理中..." : decision === "approve" ? "提交同意" : decision === "reject" ? "提交不同意" : "确认转交审批"}
                </button>
              </div>
            </div> : <div className={s.emptyState}><div className={s.emptyStateText}>选择一条待办后处理。</div></div>}
        </section>
      </div>
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
function ApprovalAssist({
  task,
  onUseTemplate
}: {
  task: WorkflowTask;
  onUseTemplate: (value: string) => void;
}) {
  const insight = buildApprovalInsight(task);
  return <div style={assistPanelStyle}>
      <div style={assistCardStyle}>
        <span style={actionPill('default')}>审批关注</span>
        <strong>{insight.title}</strong>
        <div style={assistListStyle}>
          {insight.focus.map(item => <span key={item}>{item}</span>)}
        </div>
      </div>
      <div style={assistCardStyle}>
        <span style={actionPill('default')}>系统提示</span>
        <strong>{insight.riskLevel}</strong>
        <div style={assistListStyle}>
          {insight.risks.map(item => <span key={item}>{item}</span>)}
        </div>
      </div>
      <div style={assistCardStyle}>
        <span style={actionPill('default')}>意见模板</span>
        <strong>可一键带入审批意见</strong>
        <div style={templateGridStyle}>
          {insight.templates.map(item => <button key={item} type="button" onClick={() => onUseTemplate(item)} style={actionPill('default')}>
              {item}
            </button>)}
        </div>
      </div>
    </div>;
}
function buildApprovalInsight(task: WorkflowTask) {
  const data = task.form_data_json || {};
  const haystack = `${task.definition_name || ""} ${task.title || ""} ${task.node_name || ""}`.toLowerCase();
  const amount = readAmount(data);
  const due = dueInsight(task.due_at);
  const focus = ["核对申请内容是否与业务场景一致"];
  const risks: string[] = [];
  const templates = ["已核对申请内容，同意通过。", "资料不完整，请补充后重新提交。"];
  if (haystack.includes("采购") || data.product_code) {
    focus.push("确认采购物料、数量、预算金额是否合理");
    templates.unshift("采购信息与预算基本匹配，同意进入下一审批。");
  } else if (haystack.includes("费用") || data.expense_type) {
    focus.push("确认费用类型、金额、门店归属和报销事由");
    templates.unshift("费用事由清晰，金额在可接受范围内，同意通过。");
  } else if (haystack.includes("付款") || data.payee) {
    focus.push("确认收款方、付款类型、金额和票据/合同编号");
    templates.unshift("付款资料已核对，建议按财务流程继续处理。");
  } else if (haystack.includes("合同") || data.contract_amount) {
    focus.push("确认合同相对方、合同金额、生效日期和风险说明");
    templates.unshift("合同关键要素已核对，暂无明显异常，同意通过。");
  } else if (haystack.includes("库存") || data.adjust_qty) {
    focus.push("确认仓库/门店、物料、调整数量和调整原因");
    templates.unshift("库存调整原因明确，建议同步留存盘点依据。");
  } else if (haystack.includes("质量") || data.exception_type) {
    focus.push("确认异常类型、严重程度、批次号和处理建议");
    templates.unshift("质量异常描述完整，请按处理建议推进并跟踪关闭。");
  } else if (haystack.includes("请假") || data.leave_type) {
    focus.push("确认假期类型、起止时间和岗位安排");
    templates.unshift("请假时间与说明已确认，同意审批。");
  }
  if (amount >= 10000) risks.push(`金额较高：${amount.toLocaleString("zh-CN")}`);else if (amount > 0) risks.push(`涉及金额：${amount.toLocaleString("zh-CN")}`);
  if (due) risks.push(due);
  if (Object.keys(data).length === 0) risks.push("未读取到表单数据，建议查看流程详情");
  if (!risks.length) risks.push("未发现明显风险点");
  return {
    title: task.node_name ? `当前节点：${task.node_name}` : "当前审批任务",
    focus,
    risks,
    riskLevel: risks.some(item => item.includes("较高") || item.includes("已超期")) ? "需要重点复核" : "常规审批",
    templates: Array.from(new Set(templates)).slice(0, 4)
  };
}
function readAmount(data: Record<string, unknown>) {
  const keys = ["amount", "budget_amount", "contract_amount", "payment_amount", "loss_amount", "amount_impact"];
  for (const key of keys) {
    const value = Number(data[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}
function dueInsight(value?: string) {
  if (!value) return "";
  const due = new Date(value).getTime();
  if (!Number.isFinite(due)) return "";
  const diffHours = Math.round((due - Date.now()) / 36e5);
  if (diffHours < 0) return `已超期 ${Math.abs(diffHours)} 小时`;
  if (diffHours <= 24) return `剩余 ${diffHours} 小时到期`;
  return "";
}
function statusText(status: string) {
  if (status === "TODO") return "待处理";
  if (status === "DONE") return "已处理";
  return status;
}
function formatDate(value?: string) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}
function friendlyError(message: string) {
  if (message.includes("forbidden") || message.includes("not visible")) return "你没有处理这条任务的权限。";
  if (message.includes("assignee_user_id or assignee_role_code required")) return "请填写转交对象。";
  if (message.includes("task is not TODO")) return "这条任务已经被处理，请刷新列表。";
  return message;
}
const layoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "340px minmax(0, 1fr)",
  gap: 12,
  alignItems: "start"
};
const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14
};
const taskListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8
};
const taskStyle: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  padding: 12,
  cursor: "pointer",
  display: "grid",
  gap: 6
};
const selectedTaskStyle: React.CSSProperties = {
  ...taskStyle,
  borderColor: "var(--color-primary)",
  background: "var(--bg-muted)"
};
const detailHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14
};
const assistPanelStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 16
};
const assistCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  alignContent: "start",
  minHeight: 130,
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)",
  color: "var(--text-primary)"
};
const assistListStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  color: "var(--text-secondary)",
  fontSize: 12,
  lineHeight: 1.55
};
const templateGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 6
};
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
    transition: "background .16s ease, color .16s ease, border-color .16s ease"
  };
}
const transferPanelStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 12,
  marginBottom: 12,
  display: "grid",
  gap: 10,
  background: "var(--bg-page)"
};
const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 14,
  flexWrap: "wrap"
};
