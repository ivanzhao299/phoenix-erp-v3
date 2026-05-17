"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowForm } from "@/lib/workflow-api";

type NodeType = "start" | "approval" | "condition" | "cc" | "end";
type WorkflowNode = {
  id: string;
  type: NodeType;
  name: string;
  x?: number;
  y?: number;
  config?: {
    assigneeType?: "ROLE" | "USER" | "STARTER";
    roles?: string[];
    users?: number[];
    timeoutHours?: number;
  };
};
type WorkflowEdge = {
  from: string;
  to: string;
  label?: string;
  condition?: {
    field: string;
    operator: "==" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "notIn" | "contains";
    value: string | number | string[];
  };
};
type RuntimeSchema = {
  fields?: Array<{ key: string; label: string; type: string; required?: boolean }>;
};

const defaultNodes: WorkflowNode[] = [
  { id: "start", type: "start", name: "发起申请", x: 80, y: 140 },
  { id: "approval_1", type: "approval", name: "一级审批", x: 320, y: 140, config: { assigneeType: "ROLE", roles: ["ROLE_SYSOPS"] } },
  { id: "end", type: "end", name: "流程完成", x: 560, y: 140 },
];
const defaultEdges: WorkflowEdge[] = [
  { from: "start", to: "approval_1" },
  { from: "approval_1", to: "end" },
];
const roleOptions = [
  { label: "系统管理员", value: "ROLE_SYSOPS" },
  { label: "财务会计", value: "ROLE_FIN_ACCT" },
  { label: "财务负责人", value: "ROLE_FIN_CFO" },
  { label: "采购员", value: "ROLE_PRC_BUYER" },
  { label: "仓储负责人", value: "ROLE_WMS_MGR" },
  { label: "品控负责人", value: "ROLE_QA_MGR" },
  { label: "门店经理", value: "ROLE_STORE_MGR" },
  { label: "销售负责人", value: "ROLE_SALES_MGR" },
  { label: "养殖场长", value: "ROLE_FARM_MGR" },
  { label: "物流负责人", value: "ROLE_LOG_MGR" },
];
const operators = [
  { label: "等于", value: "==" },
  { label: "不等于", value: "!=" },
  { label: "大于", value: ">" },
  { label: "大于等于", value: ">=" },
  { label: "小于", value: "<" },
  { label: "小于等于", value: "<=" },
  { label: "包含", value: "contains" },
] as const;

export default function WorkflowDesignerPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>(defaultNodes);
  const [edges, setEdges] = useState<WorkflowEdge[]>(defaultEdges);
  const [forms, setForms] = useState<WorkflowForm[]>([]);
  const [formSchema, setFormSchema] = useState<RuntimeSchema | null>(null);
  const [selectedNode, setSelectedNode] = useState(1);
  const [selectedEdge, setSelectedEdge] = useState(0);
  const [formVersionId, setFormVersionId] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");

  useEffect(() => {
    Promise.all([workflowApi.definitionDesigner(id), workflowApi.forms()]).then(([res, formRes]) => {
      setData(res.data);
      const graph = res.data.graph_json as { nodes?: WorkflowNode[]; edges?: WorkflowEdge[] } | undefined;
      if (Array.isArray(graph?.nodes)) setNodes(graph.nodes);
      if (Array.isArray(graph?.edges)) setEdges(graph.edges);
      if (res.data.form_version_id) setFormVersionId(String(res.data.form_version_id));
      const schema = res.data.form_schema_json as RuntimeSchema | undefined;
      setFormSchema(schema && Array.isArray(schema.fields) ? schema : null);
      setForms(formRes.data || []);
    });
  }, [id]);

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const mainPath = useMemo(() => buildMainPath(nodes, edges), [nodes, edges]);
  const currentNode = nodes[selectedNode] || nodes[0];
  const currentEdge = edges[selectedEdge] || edges[0];
  const publishableForms = forms.filter(form => form.current_version_id);
  const selectedForm = publishableForms.find(form => String(form.current_version_id) === formVersionId);
  const fieldOptions = formSchema?.fields || [];
  const previewLines = useMemo(() => buildPreview(nodes, edges), [nodes, edges]);

  function patchNode(index: number, patch: Partial<WorkflowNode>) {
    setNodes(prev => prev.map((node, i) => i === index ? { ...node, ...patch } : node));
  }

  function patchNodeConfig(index: number, patch: WorkflowNode["config"]) {
    setNodes(prev => prev.map((node, i) => i === index ? { ...node, config: { ...(node.config || {}), ...(patch || {}) } } : node));
  }

  function addStep(type: "approval" | "condition" | "cc") {
    const nextIndex = nodes.length + 1;
    const next: WorkflowNode = {
      id: `${type}_${nextIndex}`,
      type,
      name: type === "approval" ? "新的审批步骤" : type === "condition" ? "条件判断" : "抄送相关人员",
      x: 80 + nextIndex * 220,
      y: 140,
      config: type === "approval" ? { assigneeType: "ROLE", roles: ["ROLE_SYSOPS"] } : {},
    };
    setNodes(prev => [...prev, next]);
    setEdges(prev => insertBeforeEnd(mainPath, prev, next));
    setSelectedNode(nodes.length);
    setMsg("");
    setError("");
  }

  function removeStep(index: number) {
    const target = nodes[index];
    if (!target || target.type === "start" || target.type === "end") return;
    setNodes(prev => prev.filter((_, i) => i !== index));
    setEdges(prev => {
      const incoming = prev.find(edge => edge.to === target.id);
      const outgoing = prev.find(edge => edge.from === target.id);
      const rest = prev.filter(edge => edge.from !== target.id && edge.to !== target.id);
      if (incoming && outgoing) rest.push({ from: incoming.from, to: outgoing.to });
      return rest;
    });
    setSelectedNode(0);
  }

  function moveStep(nodeId: string, dir: -1 | 1) {
    const movable = mainPath.filter(node => node.type !== "start" && node.type !== "end");
    const idx = movable.findIndex(node => node.id === nodeId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= movable.length) return;
    [movable[idx], movable[target]] = [movable[target], movable[idx]];
    const start = mainPath.find(node => node.type === "start") || nodes.find(node => node.type === "start");
    const end = mainPath.find(node => node.type === "end") || nodes.find(node => node.type === "end");
    if (!start || !end) return;
    const linear = [start, ...movable, end];
    const linearIds = new Set(linear.map(node => node.id));
    const preserved = edges.filter(edge => !linearIds.has(edge.from) || !linearIds.has(edge.to));
    setEdges([...preserved, ...linear.slice(0, -1).map((node, index) => ({ from: node.id, to: linear[index + 1].id }))]);
  }

  function addEdge() {
    const from = currentNode?.id || nodes[0]?.id || "";
    const to = nodes.find(node => node.type === "end")?.id || nodes[0]?.id || "";
    setEdges(prev => [...prev, { from, to }]);
    setSelectedEdge(edges.length);
  }

  function patchEdge(index: number, patch: Partial<WorkflowEdge>) {
    setEdges(prev => prev.map((edge, i) => i === index ? { ...edge, ...patch } : edge));
  }

  function removeEdge(index: number) {
    setEdges(prev => prev.filter((_, i) => i !== index));
    setSelectedEdge(Math.max(0, index - 1));
  }

  async function publish() {
    const problems = validateDesigner(nodes, edges);
    if (problems.length > 0) {
      setError(problems[0]);
      setMsg("");
      return;
    }
    setError("");
    setMsg("");
    await workflowApi.publishDefinition(id, {
      graph_json: graph,
      form_version_id: formVersionId ? Number(formVersionId) : undefined,
    });
    setMsg("发布成功，业务人员现在可以按这个流程发起申请。");
  }

  function openJson() {
    setJsonDraft(JSON.stringify(graph, null, 2));
    setJsonOpen(true);
  }

  function applyJson() {
    const parsed = JSON.parse(jsonDraft) as { nodes?: WorkflowNode[]; edges?: WorkflowEdge[] };
    setNodes(Array.isArray(parsed.nodes) ? parsed.nodes : []);
    setEdges(Array.isArray(parsed.edges) ? parsed.edges : []);
    setSelectedNode(0);
    setSelectedEdge(0);
    setJsonOpen(false);
  }

  return (
    <div>
      <PageHeader title="流程搭建器" subtitle={String(data?.name || "")} breadcrumb={["工作流", "流程设计器"]} />
      <div style={layoutStyle}>
        <section className={s.card} style={panelStyle}>
          <div style={toolbarStyle}>
            <div>
              <strong className={s.cardTitle}>流程步骤</strong>
              <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>按业务发生顺序搭建，系统会自动保存为流程图。</p>
            </div>
          </div>
          <div style={addBarStyle}>
            <button className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => addStep("approval")}>添加审批</button>
            <button className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => addStep("condition")}>添加条件</button>
            <button className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => addStep("cc")}>添加抄送</button>
          </div>
          <div style={stepListStyle}>
            {mainPath.map((node, index) => {
              const nodeIndex = nodes.findIndex(item => item.id === node.id);
              return (
                <button
                  key={`${node.id}-${index}`}
                  type="button"
                  style={{ ...stepButtonStyle, borderColor: selectedNode === nodeIndex ? "var(--color-primary)" : "var(--border)" }}
                  onClick={() => setSelectedNode(nodeIndex)}
                >
                  <span className={nodeBadgeClass(node.type)}>{stepTypeText(node.type)}</span>
                  <strong>{node.name}</strong>
                  <span>{stepHint(node)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={s.card} style={panelStyle}>
          <div style={toolbarStyle}>
            <div>
              <strong className={s.cardTitle}>所见即所得预览</strong>
              <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>发布前先看一遍业务人员会经历什么。</p>
            </div>
            <div style={toolbarActionsStyle}>
              <button className={s.btnSecondary} onClick={openJson}>高级 JSON</button>
              <button className={s.btnPrimary} onClick={publish}>发布流程</button>
            </div>
          </div>
          {msg ? <div className={s.successBanner}>{msg}</div> : null}
          {error ? <div className={s.errorBanner}>{error}</div> : null}

          <div style={flowPreviewStyle}>
            {mainPath.map((node, index) => (
              <div key={`${node.id}-preview`} style={previewItemStyle}>
                <button
                  type="button"
                  style={{ ...previewCardStyle, borderColor: nodes[selectedNode]?.id === node.id ? "var(--color-primary)" : "var(--border)" }}
                  onClick={() => setSelectedNode(nodes.findIndex(item => item.id === node.id))}
                >
                  <span className={nodeBadgeClass(node.type)}>{stepTypeText(node.type)}</span>
                  <strong>{node.name}</strong>
                  <small>{stepHint(node)}</small>
                </button>
                {index < mainPath.length - 1 ? <span style={arrowStyle}>→</span> : null}
              </div>
            ))}
          </div>

          <div className={s.card} style={previewSummaryStyle}>
            <strong className={s.cardTitle}>流程说明</strong>
            <ol style={summaryListStyle}>
              {previewLines.map(line => <li key={line}>{line}</li>)}
            </ol>
          </div>

          <div style={edgeHeaderStyle}>
            <strong className={s.cardTitle}>分支/连线规则</strong>
            <button className={`${s.btnSecondary} ${s.btnSm}`} onClick={addEdge}>添加规则</button>
          </div>
          <div style={edgeListStyle}>
            {edges.map((edge, index) => (
              <button
                key={`${edge.from}-${edge.to}-${index}`}
                type="button"
                style={{ ...edgeButtonStyle, borderColor: selectedEdge === index ? "var(--color-primary)" : "var(--border)" }}
                onClick={() => setSelectedEdge(index)}
              >
                <span>{nodeName(edge.from, nodes)}</span>
                <span>→</span>
                <span>{nodeName(edge.to, nodes)}</span>
                <em>{edge.condition ? conditionText(edge.condition, fieldOptions) : "无条件"}</em>
              </button>
            ))}
          </div>
        </section>

        <section className={s.card} style={panelStyle}>
          <strong className={s.cardTitle} style={{ display: "block", marginBottom: 12 }}>当前设置</strong>
          <label className={s.lbl}>绑定业务表单</label>
          <select className={s.inp} value={formVersionId} onChange={e => setFormVersionId(e.target.value)}>
            <option value="">不绑定表单</option>
            {publishableForms.map(form => (
              <option key={form.id} value={String(form.current_version_id)}>
                {form.name} · {categoryText(form.category)} · V{form.current_version_id}
              </option>
            ))}
          </select>
          {selectedForm ? (
            <div style={formHintStyle}>
              <strong>{selectedForm.name}</strong>
              <span>{selectedForm.description || "用户发起时会按此表单填写申请内容。"}</span>
              <Link href={`/workflow/form-designer/${selectedForm.id}`}>查看/调整表单</Link>
            </div>
          ) : (
            <div className={s.warnBanner} style={{ marginTop: 10 }}>未绑定表单时，用户只能填写通用说明。</div>
          )}

          <hr style={dividerStyle} />
          {currentNode ? (
            <div style={{ display: "grid", gap: 10 }}>
              <strong className={s.cardTitle}>{stepTypeText(currentNode.type)}设置</strong>
              <label className={s.field}>
                <span className={s.lbl}>步骤名称</span>
                <input className={s.inp} value={currentNode.name} onChange={e => patchNode(selectedNode, { name: e.target.value })} />
              </label>
              {(currentNode.type === "approval" || currentNode.type === "cc") ? (
                <AssigneeEditor node={currentNode} onChange={patch => patchNodeConfig(selectedNode, patch)} />
              ) : null}
              {currentNode.type !== "start" && currentNode.type !== "end" ? (
                <div style={smallButtonGridStyle}>
                  <button className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => moveStep(currentNode.id, -1)}>上移</button>
                  <button className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => moveStep(currentNode.id, 1)}>下移</button>
                  <button className={`${s.btnDanger} ${s.btnSm}`} onClick={() => removeStep(selectedNode)}>删除</button>
                </div>
              ) : null}
            </div>
          ) : null}

          <hr style={dividerStyle} />
          <strong className={s.cardTitle} style={{ display: "block", marginBottom: 10 }}>规则设置</strong>
          {currentEdge ? (
            <div style={{ display: "grid", gap: 10 }}>
              <select className={s.inp} value={currentEdge.from} onChange={e => patchEdge(selectedEdge, { from: e.target.value })}>
                {nodes.map(node => <option key={node.id} value={node.id}>从：{node.name}</option>)}
              </select>
              <select className={s.inp} value={currentEdge.to} onChange={e => patchEdge(selectedEdge, { to: e.target.value })}>
                {nodes.map(node => <option key={node.id} value={node.id}>到：{node.name}</option>)}
              </select>
              <label className={s.field} style={{ marginBottom: 0 }}>
                <span className={s.lbl}>满足条件时才走这条规则</span>
                <select
                  className={s.inp}
                  value={currentEdge.condition?.field || ""}
                  onChange={e => patchEdge(selectedEdge, { condition: e.target.value ? { ...(currentEdge.condition || { operator: "==", value: "" }), field: e.target.value } : undefined })}
                >
                  <option value="">无条件，直接流转</option>
                  {fieldOptions.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
                </select>
              </label>
              {currentEdge.condition ? (
                <>
                  <select className={s.inp} value={currentEdge.condition.operator} onChange={e => patchEdge(selectedEdge, { condition: { ...currentEdge.condition!, operator: e.target.value as NonNullable<WorkflowEdge["condition"]>["operator"] } })}>
                    {operators.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                  <input className={s.inp} value={String(currentEdge.condition.value ?? "")} onChange={e => patchEdge(selectedEdge, { condition: { ...currentEdge.condition!, value: e.target.value } })} placeholder="判断值，如 10000" />
                </>
              ) : null}
              <button className={s.btnDanger} onClick={() => removeEdge(selectedEdge)}>删除规则</button>
            </div>
          ) : <div className={s.emptyState}><div className={s.emptyStateText}>暂无规则。</div></div>}
        </section>
      </div>

      {jsonOpen ? (
        <div style={modalMaskStyle}>
          <div className={s.card} style={modalStyle}>
            <div style={toolbarStyle}>
              <strong className={s.cardTitle}>高级 JSON 编辑</strong>
              <button className={s.btnSecondary} onClick={() => setJsonOpen(false)}>关闭</button>
            </div>
            <textarea value={jsonDraft} onChange={e => setJsonDraft(e.target.value)} className={s.textarea} style={textareaStyle} spellCheck={false} />
            <button className={s.btnPrimary} onClick={applyJson}>应用 JSON</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AssigneeEditor({ node, onChange }: { node: WorkflowNode; onChange: (patch: WorkflowNode["config"]) => void }) {
  const config = node.config || {};
  const assigneeType = config.assigneeType || "ROLE";
  return (
    <>
      <label className={s.field}>
        <span className={s.lbl}>{node.type === "cc" ? "抄送给" : "审批人"}</span>
        <select className={s.inp} value={assigneeType} onChange={e => onChange({ assigneeType: e.target.value as "ROLE" | "USER" | "STARTER" })}>
          <option value="ROLE">按角色</option>
          <option value="USER">指定用户 ID</option>
          <option value="STARTER">发起人本人</option>
        </select>
      </label>
      {assigneeType === "ROLE" ? (
        <label className={s.field}>
          <span className={s.lbl}>常用角色</span>
          <select className={s.inp} value={config.roles?.[0] || "ROLE_SYSOPS"} onChange={e => onChange({ roles: [e.target.value] })}>
            {roleOptions.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
        </label>
      ) : null}
      {assigneeType === "USER" ? (
        <label className={s.field}>
          <span className={s.lbl}>用户 ID</span>
          <input className={s.inp} value={(config.users || []).join(",")} onChange={e => onChange({ users: e.target.value.split(",").map(v => Number(v.trim())).filter(Boolean) })} placeholder="多个用户用逗号分隔" />
        </label>
      ) : null}
      <label className={s.field}>
        <span className={s.lbl}>超时时间（小时）</span>
        <input className={s.inp} value={config.timeoutHours ?? ""} onChange={e => onChange({ timeoutHours: e.target.value ? Number(e.target.value) : undefined })} placeholder="不填表示不限制" />
      </label>
    </>
  );
}

function buildMainPath(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const start = nodes.find(node => node.type === "start") || nodes[0];
  if (!start) return [];
  const path: WorkflowNode[] = [];
  const seen = new Set<string>();
  let current: WorkflowNode | undefined = start;
  while (current && !seen.has(current.id)) {
    path.push(current);
    seen.add(current.id);
    const nextEdge = edges.find(edge => edge.from === current!.id && !edge.condition) || edges.find(edge => edge.from === current!.id);
    current = nextEdge ? nodes.find(node => node.id === nextEdge.to) : undefined;
  }
  const extras = nodes.filter(node => !seen.has(node.id));
  return [...path, ...extras];
}

function insertBeforeEnd(path: WorkflowNode[], edges: WorkflowEdge[], node: WorkflowNode) {
  const end = path.find(item => item.type === "end");
  const beforeEnd = end ? [...path].reverse().find(item => item.id !== end.id) : path[path.length - 1];
  if (!end || !beforeEnd) return [...edges, { from: path[path.length - 1]?.id || "start", to: node.id }];
  const rest = edges.filter(edge => !(edge.from === beforeEnd.id && edge.to === end.id));
  return [...rest, { from: beforeEnd.id, to: node.id }, { from: node.id, to: end.id }];
}

function validateDesigner(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const problems: string[] = [];
  if (!nodes.some(node => node.type === "start")) problems.push("流程必须有发起申请步骤。");
  if (!nodes.some(node => node.type === "end")) problems.push("流程必须有完成步骤。");
  if (!nodes.some(node => node.type === "approval")) problems.push("流程至少需要一个审批步骤。");
  const ids = new Set(nodes.map(node => node.id));
  edges.forEach(edge => {
    if (!ids.has(edge.from) || !ids.has(edge.to)) problems.push("存在未连接到步骤的规则，请检查分支/连线规则。");
  });
  nodes.filter(node => node.type === "approval").forEach(node => {
    const config = node.config || {};
    if ((config.assigneeType || "ROLE") === "ROLE" && !(config.roles || []).length) problems.push(`${node.name} 还没有选择审批角色。`);
    if (config.assigneeType === "USER" && !(config.users || []).length) problems.push(`${node.name} 还没有指定用户。`);
  });
  return problems;
}

function buildPreview(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const path = buildMainPath(nodes, edges);
  const lines = path.map((node, index) => `${index + 1}. ${previewText(node)}`);
  const conditionalEdges = edges.filter(edge => edge.condition);
  conditionalEdges.forEach(edge => {
    lines.push(`条件规则：当 ${conditionText(edge.condition!, [])} 时，从「${nodeName(edge.from, nodes)}」流向「${nodeName(edge.to, nodes)}」。`);
  });
  return lines;
}

function previewText(node: WorkflowNode) {
  if (node.type === "start") return "员工提交申请并填写表单。";
  if (node.type === "approval") return `由「${assigneeText(node)}」处理「${node.name}」。`;
  if (node.type === "condition") return `系统判断「${node.name}」并选择后续步骤。`;
  if (node.type === "cc") return `抄送「${assigneeText(node)}」知会。`;
  return "流程完成并归档。";
}

function assigneeText(node: WorkflowNode) {
  const config = node.config || {};
  if (config.assigneeType === "STARTER") return "发起人本人";
  if (config.assigneeType === "USER") return `用户 ${config.users?.join("、") || "-"}`;
  const role = config.roles?.[0] || "ROLE_SYSOPS";
  return roleOptions.find(item => item.value === role)?.label || role;
}

function nodeName(id: string, nodes: WorkflowNode[]) {
  return nodes.find(node => node.id === id)?.name || id || "-";
}

function stepTypeText(type: NodeType) {
  const map: Record<NodeType, string> = { start: "发起", approval: "审批", condition: "条件", cc: "抄送", end: "完成" };
  return map[type];
}

function stepHint(node: WorkflowNode) {
  if (node.type === "approval" || node.type === "cc") return assigneeText(node);
  if (node.type === "condition") return "按表单字段判断";
  if (node.type === "start") return "用户提交申请";
  return "审批完成后归档";
}

function nodeBadgeClass(type: NodeType) {
  if (type === "start") return `${s.badge} ${s.badgeSuccess}`;
  if (type === "approval") return `${s.badge} ${s.badgeInfo}`;
  if (type === "condition") return `${s.badge} ${s.badgeWarning}`;
  if (type === "cc") return `${s.badge} ${s.badgePurple}`;
  return `${s.badge} ${s.badgeNeutral}`;
}

function conditionText(condition: NonNullable<WorkflowEdge["condition"]>, fields: RuntimeSchema["fields"]) {
  const field = fields?.find(item => item.key === condition.field);
  const op = operators.find(item => item.value === condition.operator);
  return `${field?.label || condition.field} ${op?.label || condition.operator} ${String(condition.value ?? "")}`;
}

function categoryText(category?: string) {
  const map: Record<string, string> = {
    FINANCE: "财务",
    PURCHASE: "采购",
    CONTRACT: "合同",
    HR: "人事",
    WMS: "仓储",
    QUALITY: "品控",
    STORE: "门店",
    FARM: "养殖",
    LOGISTICS: "物流",
    GENERAL: "通用",
  };
  return category ? map[category] || category : "通用";
}

const layoutStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "280px minmax(440px, 1fr) 360px", gap: 12, alignItems: "start" };
const panelStyle: React.CSSProperties = { padding: 16 };
const toolbarStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 };
const toolbarActionsStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };
const addBarStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 };
const stepListStyle: React.CSSProperties = { display: "grid", gap: 8 };
const stepButtonStyle: React.CSSProperties = { display: "grid", gap: 6, textAlign: "left", padding: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" };
const flowPreviewStyle: React.CSSProperties = { display: "flex", alignItems: "stretch", gap: 8, overflowX: "auto", padding: "12px 2px 16px" };
const previewItemStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 };
const previewCardStyle: React.CSSProperties = { minWidth: 160, minHeight: 94, display: "grid", gap: 6, textAlign: "left", padding: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" };
const arrowStyle: React.CSSProperties = { color: "var(--color-primary)", fontWeight: 900, fontSize: 18 };
const previewSummaryStyle: React.CSSProperties = { padding: 14, marginBottom: 14, background: "var(--bg-page)" };
const summaryListStyle: React.CSSProperties = { margin: "10px 0 0", paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.8 };
const edgeHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 };
const edgeListStyle: React.CSSProperties = { display: "grid", gap: 8 };
const edgeButtonStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 24px 1fr", gap: 8, alignItems: "center", padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer", textAlign: "left" };
const formHintStyle: React.CSSProperties = { marginTop: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 10, display: "grid", gap: 6, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 };
const smallButtonGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 };
const dividerStyle: React.CSSProperties = { border: 0, borderTop: "1px solid var(--border)", margin: "16px 0" };
const modalMaskStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const modalStyle: React.CSSProperties = { width: "min(900px, 92vw)", maxHeight: "88vh", overflow: "auto", padding: 16 };
const textareaStyle: React.CSSProperties = { minHeight: 440, fontFamily: "monospace", marginBottom: 12 };
