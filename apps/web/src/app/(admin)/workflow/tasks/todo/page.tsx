"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
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
        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h3 style={titleStyle}>待处理</h3>
              <p style={hintStyle}>共 {rows.length} 条待办</p>
            </div>
            <Link href="/workflow/start" style={linkStyle}>发起申请</Link>
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
            <div style={emptyStyle}>当前没有待审批任务。</div>
          )}
        </section>

        <section style={panelStyle}>
          {selected ? (
            <>
              <div style={detailHeaderStyle}>
                <div>
                  <h3 style={detailTitleStyle}>{selected.title}</h3>
                  <p style={hintStyle}>{selected.definition_name || "工作流"} · {selected.node_name}</p>
                </div>
                <span style={statusStyle}>{statusText(selected.status)}</span>
              </div>

              <div style={metaGridStyle}>
                <Meta label="流程编号" value={selected.instance_no || "-"} />
                <Meta label="发起人" value={selected.starter_name || "-"} />
                <Meta label="当前节点" value={selected.node_name || "-"} />
                <Meta label="到期时间" value={formatDate(selected.due_at) || "未设置"} />
              </div>

              <h4 style={blockTitleStyle}>申请内容</h4>
              <DataView data={selected.form_data_json || {}} />

              <h4 style={blockTitleStyle}>审批意见</h4>
              <textarea
                style={textareaStyle}
                placeholder="填写审批意见，可留空直接通过"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              {error ? <div style={errorStyle}>{error}</div> : null}

              <div style={footerStyle}>
                <Link href={`/workflow/instances/${selected.instance_id}`} style={secondaryButtonStyle}>查看详情</Link>
                <button style={dangerButtonStyle} disabled={loading} onClick={() => act("reject")}>驳回</button>
                <button style={buttonStyle} disabled={loading} onClick={() => act("approve")}>
                  {loading ? "处理中..." : "通过"}
                </button>
              </div>
            </>
          ) : (
            <div style={emptyStyle}>选择一条待办后处理。</div>
          )}
        </section>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={metaStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataView({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return <div style={emptyStyle}>暂无表单数据。</div>;
  return (
    <div style={dataGridStyle}>
      {entries.map(([key, value]) => (
        <div key={key} style={dataItemStyle}>
          <span>{fieldLabel(key)}</span>
          <strong>{formatValue(value)}</strong>
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
const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16 };
const sectionHeaderStyle: React.CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:14 };
const titleStyle: React.CSSProperties = { margin:"0 0 4px", fontSize:16 };
const hintStyle: React.CSSProperties = { margin:0, color:"var(--text-secondary)", fontSize:13, lineHeight:1.6 };
const linkStyle: React.CSSProperties = { color:"var(--color-primary)", fontWeight:700, fontSize:13 };
const taskListStyle: React.CSSProperties = { display:"grid", gap:8 };
const taskStyle: React.CSSProperties = { textAlign:"left", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", color:"var(--text-primary)", padding:12, cursor:"pointer", display:"grid", gap:6 };
const selectedTaskStyle: React.CSSProperties = { ...taskStyle, borderColor:"var(--color-primary)", background:"var(--bg-muted)" };
const emptyStyle: React.CSSProperties = { border:"1px dashed var(--border)", borderRadius:"var(--radius-md)", padding:14, color:"var(--text-secondary)", fontSize:13 };
const detailHeaderStyle: React.CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:14 };
const detailTitleStyle: React.CSSProperties = { margin:"0 0 4px", fontSize:18 };
const statusStyle: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:999, padding:"4px 10px", color:"var(--color-primary)", fontSize:12, fontWeight:700 };
const metaGridStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(4, minmax(0, 1fr))", gap:10, marginBottom:16 };
const metaStyle: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:10, display:"grid", gap:6 };
const blockTitleStyle: React.CSSProperties = { margin:"18px 0 10px", fontSize:14 };
const dataGridStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:10 };
const dataItemStyle: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:10, display:"grid", gap:6, overflow:"hidden" };
const textareaStyle: React.CSSProperties = { width:"100%", minHeight:86, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", color:"var(--text-primary)", padding:10, resize:"vertical" };
const errorStyle: React.CSSProperties = { marginTop:8, color:"var(--color-danger)", fontSize:13 };
const footerStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10, marginTop:14 };
const buttonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700, cursor:"pointer" };
const dangerButtonStyle: React.CSSProperties = { ...buttonStyle, background:"var(--status-danger)" };
const secondaryButtonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", color:"var(--text-primary)", fontWeight:700, display:"inline-flex", alignItems:"center" };
