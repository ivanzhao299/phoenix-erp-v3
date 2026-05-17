"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowTask } from "@/lib/workflow-api";

export default function WorkflowTodoPage() {
  const [rows, setRows] = useState<WorkflowTask[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferMode, setTransferMode] = useState<"role" | "user">("role");
  const [transferTarget, setTransferTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = useMemo(
    () => rows.find(row => row.id === selectedId) || rows[0] || null,
    [rows, selectedId],
  );

  const load = useCallback(async () => {
    const res = await workflowApi.todo();
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

  async function act(type: "approve" | "reject") {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      if (type === "approve") await workflowApi.approve(selected.id, comment.trim());
      else await workflowApi.reject(selected.id, comment.trim());
      setComment("");
      setNotice(type === "approve" ? "已通过审批。" : "已驳回申请。");
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
    const target = transferTarget.trim();
    if (!target) {
      setError("请填写转交对象。");
      return;
    }
    const userId = Number(target);
    if (transferMode === "user" && (!Number.isInteger(userId) || userId <= 0)) {
      setError("用户 ID 必须是大于 0 的数字。");
      return;
    }
    const payload = transferMode === "user"
      ? { assignee_user_id: userId }
      : { assignee_role_code: target.toUpperCase() };
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await workflowApi.transfer(selected.id, payload);
      setComment("");
      setTransferTarget("");
      setTransferOpen(false);
      setNotice("任务已转交。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "转交失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="我的待办" subtitle="处理分配给我的审批任务，查看表单内容后给出审批意见" breadcrumb={["工作流", "我的待办"]} />

      <div style={layoutStyle}>
        <section className={s.card}>
          <div className={s.cardBody}>
            <div style={sectionHeaderStyle}>
              <div>
                <h3 className={s.cardTitle}>待处理</h3>
                <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>共 {rows.length} 条待办</p>
              </div>
              <Link href="/workflow/start" className={s.btnSecondary}>发起申请</Link>
            </div>

            {rows.length ? (
              <div style={taskListStyle}>
                {rows.map(row => (
                  <button
                    key={row.id}
                    type="button"
                    style={row.id === selected?.id ? selectedTaskStyle : taskStyle}
                    onClick={() => {
                      setSelectedId(row.id);
                      setComment("");
                      setError("");
                      setNotice("");
                      setTransferOpen(false);
                    }}
                  >
                    <strong>{row.title}</strong>
                    <span>{row.node_name} · {row.starter_name || "发起人"}</span>
                    <small>{row.definition_name || row.instance_no || row.task_no}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className={s.emptyState}><div className={s.emptyStateText}>当前没有待审批任务。</div></div>
            )}
          </div>
        </section>

        <section className={s.card}>
          {selected ? (
            <div className={s.cardBody}>
              <div style={detailHeaderStyle}>
                <div>
                  <h3 className={s.cardTitle}>{selected.title}</h3>
                  <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>{selected.definition_name || "工作流"} · {selected.node_name}</p>
                </div>
                <span className={`${s.badge} ${s.badgeInfo}`}>{statusText(selected.status)}</span>
              </div>

              <div className={s.infoGrid3} style={{ marginBottom: 16 }}>
                <Meta label="流程编号" value={selected.instance_no || "-"} />
                <Meta label="发起人" value={selected.starter_name || "-"} />
                <Meta label="当前节点" value={selected.node_name || "-"} />
                <Meta label="到期时间" value={formatDate(selected.due_at) || "未设置"} />
              </div>

              <ApprovalAssist task={selected} onUseTemplate={setComment} />

              <h4 className={s.formSection}>申请内容</h4>
              <DataView data={selected.form_data_json || {}} />

              <h4 className={s.formSection}>审批意见</h4>
              <p className={s.modalDesc} style={{ margin: "0 0 8px" }}>可以先补充意见，也可以直接通过、驳回或转交给其他处理人。</p>
              <textarea
                className={s.textarea}
                placeholder="填写审批意见，可留空直接通过"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              {notice ? <div className={s.successBanner}>{notice}</div> : null}
              {error ? <div className={s.errorBanner}>{error}</div> : null}

              {transferOpen ? (
                <div style={transferPanelStyle}>
                  <div style={transferModeStyle}>
                    <button
                      type="button"
                      className={`${s.tabPill} ${transferMode === "role" ? s.tabPillActive : ""}`}
                      onClick={() => setTransferMode("role")}
                    >
                      转给角色
                    </button>
                    <button
                      type="button"
                      className={`${s.tabPill} ${transferMode === "user" ? s.tabPillActive : ""}`}
                      onClick={() => setTransferMode("user")}
                    >
                      转给用户
                    </button>
                  </div>
                  <input
                    className={s.inp}
                    value={transferTarget}
                    onChange={e => setTransferTarget(e.target.value)}
                    placeholder={transferMode === "role" ? "角色编码，如 ROLE_FIN_ACCT" : "用户 ID，如 1001"}
                  />
                  <div style={transferActionsStyle}>
                    <button className={s.btnSecondary} disabled={loading} onClick={() => setTransferOpen(false)}>取消转交</button>
                    <button className={s.btnPrimary} disabled={loading} onClick={transfer}>{loading ? "转交中..." : "确认转交"}</button>
                  </div>
                </div>
              ) : null}

              <div style={footerStyle}>
                <Link href={`/workflow/instances/${selected.instance_id}`} className={s.btnSecondary}>查看详情</Link>
                <button className={s.btnSecondary} disabled={loading || !comment.trim()} onClick={saveComment}>补充意见</button>
                <button className={s.btnSecondary} disabled={loading} onClick={() => setTransferOpen(open => !open)}>转交</button>
                <button className={s.btnDanger} disabled={loading} onClick={() => act("reject")}>驳回</button>
                <button className={s.btnPrimary} disabled={loading} onClick={() => act("approve")}>
                  {loading ? "处理中..." : "通过"}
                </button>
              </div>
            </div>
          ) : (
            <div className={s.emptyState}><div className={s.emptyStateText}>选择一条待办后处理。</div></div>
          )}
        </section>
      </div>
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

function ApprovalAssist({ task, onUseTemplate }: { task: WorkflowTask; onUseTemplate: (value: string) => void }) {
  const insight = buildApprovalInsight(task);
  return (
    <div style={assistPanelStyle}>
      <div style={assistCardStyle}>
        <span className={s.badge}>审批关注</span>
        <strong>{insight.title}</strong>
        <div style={assistListStyle}>
          {insight.focus.map(item => <span key={item}>{item}</span>)}
        </div>
      </div>
      <div style={assistCardStyle}>
        <span className={s.badge}>系统提示</span>
        <strong>{insight.riskLevel}</strong>
        <div style={assistListStyle}>
          {insight.risks.map(item => <span key={item}>{item}</span>)}
        </div>
      </div>
      <div style={assistCardStyle}>
        <span className={s.badge}>意见模板</span>
        <strong>可一键带入审批意见</strong>
        <div style={templateGridStyle}>
          {insight.templates.map(item => (
            <button key={item} type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => onUseTemplate(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DataView({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return <div className={s.emptyState}><div className={s.emptyStateText}>暂无表单数据。</div></div>;
  return (
    <div className={s.infoGrid}>
      {entries.map(([key, value]) => (
        <div key={key} className={s.infoItem}>
          <div className={s.infoKey}>{fieldLabel(key)}</div>
          <div className={s.infoVal}>{formatValue(value)}</div>
        </div>
      ))}
    </div>
  );
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

  if (amount >= 10000) risks.push(`金额较高：${amount.toLocaleString("zh-CN")}`);
  else if (amount > 0) risks.push(`涉及金额：${amount.toLocaleString("zh-CN")}`);
  if (due) risks.push(due);
  if (Object.keys(data).length === 0) risks.push("未读取到表单数据，建议查看流程详情");
  if (!risks.length) risks.push("未发现明显风险点");

  return {
    title: task.node_name ? `当前节点：${task.node_name}` : "当前审批任务",
    focus,
    risks,
    riskLevel: risks.some(item => item.includes("较高") || item.includes("已超期")) ? "需要重点复核" : "常规审批",
    templates: Array.from(new Set(templates)).slice(0, 4),
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

function fieldLabel(key: string) {
  const map: Record<string, string> = {
    amount: "金额",
    expense_type: "费用类型",
    store_code: "门店",
    reason: "申请原因",
    product_code: "物料/商品",
    quantity: "数量",
    budget_amount: "预算金额",
    need_date: "期望日期",
    payee: "收款方",
    payment_type: "付款类型",
    contract_amount: "合同金额",
    leave_type: "假期类型",
    start_time: "开始时间",
    end_time: "结束时间",
    exception_type: "异常类型",
    description: "说明",
  };
  return map[key] || key;
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join("、");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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

const layoutStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"340px minmax(0, 1fr)", gap:12, alignItems:"start" };
const sectionHeaderStyle: React.CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:14 };
const taskListStyle: React.CSSProperties = { display:"grid", gap:8 };
const taskStyle: React.CSSProperties = { textAlign:"left", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", color:"var(--text-primary)", padding:12, cursor:"pointer", display:"grid", gap:6 };
const selectedTaskStyle: React.CSSProperties = { ...taskStyle, borderColor:"var(--color-primary)", background:"var(--bg-muted)" };
const detailHeaderStyle: React.CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:14 };
const assistPanelStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(3, minmax(0, 1fr))", gap:10, marginBottom:16 };
const assistCardStyle: React.CSSProperties = { display:"grid", gap:8, alignContent:"start", minHeight:130, padding:12, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-page)", color:"var(--text-primary)" };
const assistListStyle: React.CSSProperties = { display:"grid", gap:5, color:"var(--text-secondary)", fontSize:12, lineHeight:1.55 };
const templateGridStyle: React.CSSProperties = { display:"grid", gap:6 };
const transferPanelStyle: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:12, marginTop:12, display:"grid", gap:10, background:"var(--bg-page)" };
const transferModeStyle: React.CSSProperties = { display:"flex", gap:6, flexWrap:"wrap" };
const transferActionsStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10 };
const footerStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10, marginTop:14, flexWrap:"wrap" };
