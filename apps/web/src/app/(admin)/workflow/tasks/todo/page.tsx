"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowTask } from "@/lib/workflow-api";

export default function WorkflowTodoPage() {
  const [rows, setRows] = useState<WorkflowTask[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => rows.find(row => row.id === selectedId) || rows[0] || null,
    [rows, selectedId],
  );

  const load = async () => {
    const res = await workflowApi.todo();
    const nextRows = res.data || [];
    setRows(nextRows);
    setSelectedId(current => current && nextRows.some(row => row.id === current) ? current : nextRows[0]?.id || null);
  };

  useEffect(() => { load(); }, []);

  async function act(type: "approve" | "reject") {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      if (type === "approve") await workflowApi.approve(selected.id, comment.trim());
      else await workflowApi.reject(selected.id, comment.trim());
      setComment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "处理失败");
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

              <h4 className={s.formSection}>申请内容</h4>
              <DataView data={selected.form_data_json || {}} />

              <h4 className={s.formSection}>审批意见</h4>
              <textarea
                className={s.textarea}
                placeholder="填写审批意见，可留空直接通过"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              {error ? <div className={s.errorBanner}>{error}</div> : null}

              <div style={footerStyle}>
                <Link href={`/workflow/instances/${selected.instance_id}`} className={s.btnSecondary}>查看详情</Link>
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
  if (message.includes("task is not TODO")) return "这条任务已经被处理，请刷新列表。";
  return message;
}

const layoutStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"340px minmax(0, 1fr)", gap:12, alignItems:"start" };
const sectionHeaderStyle: React.CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:14 };
const taskListStyle: React.CSSProperties = { display:"grid", gap:8 };
const taskStyle: React.CSSProperties = { textAlign:"left", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", color:"var(--text-primary)", padding:12, cursor:"pointer", display:"grid", gap:6 };
const selectedTaskStyle: React.CSSProperties = { ...taskStyle, borderColor:"var(--color-primary)", background:"var(--bg-muted)" };
const detailHeaderStyle: React.CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:14 };
const footerStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10, marginTop:14 };
