"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
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

const defaultNodes: WorkflowNode[] = [
  { id: "start", type: "start", name: "开始", x: 80, y: 150 },
  { id: "approval_1", type: "approval", name: "审批", x: 310, y: 150, config: { assigneeType: "ROLE", roles: ["ROLE_FIN_ACCT"] } },
  { id: "end", type: "end", name: "结束", x: 560, y: 150 },
];
const defaultEdges: WorkflowEdge[] = [
  { from: "start", to: "approval_1" },
  { from: "approval_1", to: "end" },
];
const nodeTypes: NodeType[] = ["start", "approval", "condition", "cc", "end"];
const operators = ["==", "!=", ">", ">=", "<", "<=", "in", "notIn", "contains"] as const;

export default function WorkflowDesignerPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>(defaultNodes);
  const [edges, setEdges] = useState<WorkflowEdge[]>(defaultEdges);
  const [forms, setForms] = useState<WorkflowForm[]>([]);
  const [selectedNode, setSelectedNode] = useState(1);
  const [selectedEdge, setSelectedEdge] = useState(0);
  const [formVersionId, setFormVersionId] = useState("");
  const [msg, setMsg] = useState("");
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([workflowApi.definitionDesigner(id), workflowApi.forms()]).then(([res, formRes]) => {
      setData(res.data);
      const graph = res.data.graph_json as { nodes?: WorkflowNode[]; edges?: WorkflowEdge[] } | undefined;
      if (Array.isArray(graph?.nodes)) setNodes(graph.nodes);
      if (Array.isArray(graph?.edges)) setEdges(graph.edges);
      if (res.data.form_version_id) setFormVersionId(String(res.data.form_version_id));
      setForms(formRes.data || []);
    });
  }, [id]);

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const currentNode = nodes[selectedNode] || nodes[0];
  const currentEdge = edges[selectedEdge] || edges[0];
  const publishableForms = forms.filter(form => form.current_version_id);
  const selectedForm = publishableForms.find(form => String(form.current_version_id) === formVersionId);

  function patchNode(index: number, patch: Partial<WorkflowNode>) {
    setNodes(prev => prev.map((node, i) => i === index ? { ...node, ...patch } : node));
  }

  function patchNodeConfig(index: number, patch: WorkflowNode["config"]) {
    setNodes(prev => prev.map((node, i) => i === index ? { ...node, config: { ...(node.config || {}), ...(patch || {}) } } : node));
  }

  function addNode(type: NodeType = "approval") {
    const next: WorkflowNode = {
      id: `${type}_${nodes.length + 1}`,
      type,
      name: type === "approval" ? "审批节点" : type === "condition" ? "条件判断" : type === "cc" ? "抄送" : type,
      x: 120 + (nodes.length % 3) * 220,
      y: 80 + Math.floor(nodes.length / 3) * 120,
      config: type === "approval" ? { assigneeType: "ROLE", roles: ["ROLE_FIN_ACCT"] } : {},
    };
    setNodes(prev => [...prev, next]);
    setSelectedNode(nodes.length);
  }

  function removeNode(index: number) {
    const target = nodes[index];
    if (!target || target.type === "start" || target.type === "end") return;
    setNodes(prev => prev.filter((_, i) => i !== index));
    setEdges(prev => prev.filter(edge => edge.from !== target.id && edge.to !== target.id));
    setSelectedNode(0);
  }

  function addEdge() {
    const from = nodes[0]?.id || "";
    const to = nodes[1]?.id || "";
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

  function moveNode(index: number, x: number, y: number) {
    setNodes(prev => prev.map((node, i) => i === index ? { ...node, x, y } : node));
  }

  function beginDrag(index: number, e: React.PointerEvent<HTMLButtonElement>) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const node = layoutNode(nodes[index], index);
    const offsetX = e.clientX - rect.left - node.x;
    const offsetY = e.clientY - rect.top - node.y;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedNode(index);

    const onMove = (move: PointerEvent) => {
      const nextX = Math.max(16, Math.min(rect.width - nodeWidth - 16, move.clientX - rect.left - offsetX));
      const nextY = Math.max(16, Math.min(rect.height - nodeHeight - 16, move.clientY - rect.top - offsetY));
      moveNode(index, Math.round(nextX), Math.round(nextY));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function publish() {
    setMsg("");
    await workflowApi.publishDefinition(id, {
      graph_json: graph,
      form_version_id: formVersionId ? Number(formVersionId) : undefined,
    });
    setMsg("发布成功");
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
      <PageHeader title="流程设计器" subtitle={String(data?.name || "")} breadcrumb={["工作流", "流程设计器"]} />
      <div style={{ display: "grid", gridTemplateColumns: "260px minmax(420px, 1fr) 360px", gap: 12, alignItems: "start" }}>
        <section style={panelStyle}>
          <div style={toolbarStyle}>
            <strong>节点</strong>
            <button style={smallButtonStyle} onClick={() => addNode()}>新增</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
            {nodeTypes.map(type => <button key={type} style={ghostButtonStyle} onClick={() => addNode(type)}>{type}</button>)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {nodes.map((node, index) => (
              <button
                key={`${node.id}-${index}`}
                style={{ ...nodeButtonStyle, borderColor: selectedNode === index ? "var(--color-primary)" : "var(--border)" }}
                onClick={() => setSelectedNode(index)}
              >
                <span style={{ fontWeight: 800 }}>{node.name}</span>
                <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{node.type} · {node.id}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={panelStyle}>
          <div style={toolbarStyle}>
            <strong>流程结构</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={ghostButtonStyle} onClick={openJson}>JSON</button>
              <button style={buttonStyle} onClick={publish}>发布流程版本</button>
            </div>
          </div>
          {msg ? <div style={successStyle}>{msg}</div> : null}
          <div ref={canvasRef} style={canvasStyle}>
            <svg style={svgStyle}>
              <defs>
                <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" fill="var(--color-primary)" />
                </marker>
              </defs>
              {edges.map((edge, index) => {
                const fromIndex = nodes.findIndex(node => node.id === edge.from);
                const toIndex = nodes.findIndex(node => node.id === edge.to);
                if (fromIndex < 0 || toIndex < 0) return null;
                const from = layoutNode(nodes[fromIndex], fromIndex);
                const to = layoutNode(nodes[toIndex], toIndex);
                const startX = from.x + nodeWidth;
                const startY = from.y + nodeHeight / 2;
                const endX = to.x;
                const endY = to.y + nodeHeight / 2;
                const midX = Math.round((startX + endX) / 2);
                const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
                return (
                  <g key={`${edge.from}-${edge.to}-${index}`} onClick={() => setSelectedEdge(index)} style={{ cursor: "pointer" }}>
                    <path
                      d={path}
                      stroke={selectedEdge === index ? "var(--color-primary)" : "var(--border)"}
                      strokeWidth={selectedEdge === index ? 3 : 2}
                      fill="none"
                      markerEnd="url(#arrow)"
                    />
                    {edge.condition ? (
                      <text x={midX} y={Math.min(startY, endY) - 8} fill="var(--color-primary)" fontSize="11" textAnchor="middle">
                        {edge.condition.field} {edge.condition.operator} {String(edge.condition.value)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
            {nodes.map((node, index) => {
              const pos = layoutNode(node, index);
              return (
                <button
                  key={`${node.id}-${index}`}
                  type="button"
                  onPointerDown={e => beginDrag(index, e)}
                  onClick={() => setSelectedNode(index)}
                  style={{
                    ...canvasNodeStyle,
                    left: pos.x,
                    top: pos.y,
                    borderColor: selectedNode === index ? "var(--color-primary)" : nodeColor(node.type),
                    boxShadow: selectedNode === index ? "0 0 0 3px rgba(31,56,100,0.14)" : "var(--shadow-sm)",
                  }}
                >
                  <span style={{ ...nodeTypePillStyle, background: nodeColor(node.type) }}>{node.type}</span>
                  <strong>{node.name}</strong>
                  <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{node.id}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {edges.map((edge, index) => (
              <button
                key={`${edge.from}-${edge.to}-${index}`}
                style={{ ...edgeButtonStyle, borderColor: selectedEdge === index ? "var(--color-primary)" : "var(--border)" }}
                onClick={() => setSelectedEdge(index)}
              >
                <span>{nodeName(edge.from, nodes)}</span>
                <span style={arrowStyle}>→</span>
                <span>{nodeName(edge.to, nodes)}</span>
                {edge.condition ? <span style={conditionPillStyle}>{edge.condition.field} {edge.condition.operator} {String(edge.condition.value)}</span> : null}
              </button>
            ))}
          </div>
          <button style={{ ...ghostButtonStyle, marginTop: 12 }} onClick={addEdge}>新增连线</button>
        </section>

        <section style={panelStyle}>
          <strong style={{ display: "block", marginBottom: 12 }}>属性</strong>
          <label style={labelStyle}>绑定业务表单</label>
          <select style={inputStyle} value={formVersionId} onChange={e => setFormVersionId(e.target.value)}>
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
            <div style={warnStyle}>未绑定表单时，用户发起申请只能填写通用说明。建议选择一个已发布表单。</div>
          )}

          <hr style={dividerStyle} />
          <strong style={{ display: "block", marginBottom: 10 }}>节点属性</strong>
          {currentNode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input style={inputStyle} value={currentNode.id} onChange={e => patchNode(selectedNode, { id: e.target.value })} placeholder="节点 ID" />
              <input style={inputStyle} value={currentNode.name} onChange={e => patchNode(selectedNode, { name: e.target.value })} placeholder="节点名称" />
              <select style={inputStyle} value={currentNode.type} onChange={e => patchNode(selectedNode, { type: e.target.value as NodeType })}>
                {nodeTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
              {currentNode.type === "approval" || currentNode.type === "cc" ? (
                <>
                  <select
                    style={inputStyle}
                    value={currentNode.config?.assigneeType || "ROLE"}
                    onChange={e => patchNodeConfig(selectedNode, { assigneeType: e.target.value as "ROLE" | "USER" | "STARTER" })}
                  >
                    <option value="ROLE">按角色</option>
                    <option value="USER">按用户 ID</option>
                    <option value="STARTER">发起人</option>
                  </select>
                  <input
                    style={inputStyle}
                    value={(currentNode.config?.roles || []).join(",")}
                    onChange={e => patchNodeConfig(selectedNode, { roles: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })}
                    placeholder="角色，逗号分隔，如 ROLE_FIN_ACCT"
                  />
                  <input
                    style={inputStyle}
                    value={(currentNode.config?.users || []).join(",")}
                    onChange={e => patchNodeConfig(selectedNode, { users: e.target.value.split(",").map(v => Number(v.trim())).filter(Boolean) })}
                    placeholder="用户 ID，逗号分隔"
                  />
                  <input
                    style={inputStyle}
                    value={currentNode.config?.timeoutHours ?? ""}
                    onChange={e => patchNodeConfig(selectedNode, { timeoutHours: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="超时小时数"
                  />
                </>
              ) : null}
              <button style={dangerButtonStyle} onClick={() => removeNode(selectedNode)}>删除节点</button>
            </div>
          ) : null}

          <hr style={dividerStyle} />
          <strong style={{ display: "block", marginBottom: 10 }}>连线属性</strong>
          {currentEdge ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <select style={inputStyle} value={currentEdge.from} onChange={e => patchEdge(selectedEdge, { from: e.target.value })}>
                {nodes.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
              <select style={inputStyle} value={currentEdge.to} onChange={e => patchEdge(selectedEdge, { to: e.target.value })}>
                {nodes.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
              <input style={inputStyle} value={currentEdge.label || ""} onChange={e => patchEdge(selectedEdge, { label: e.target.value })} placeholder="连线标签" />
              <input style={inputStyle} value={currentEdge.condition?.field || ""} onChange={e => patchEdge(selectedEdge, { condition: { ...(currentEdge.condition || { operator: "==", value: "" }), field: e.target.value } })} placeholder="条件字段，如 amount" />
              <select style={inputStyle} value={currentEdge.condition?.operator || "=="} onChange={e => patchEdge(selectedEdge, { condition: { ...(currentEdge.condition || { field: "", value: "" }), operator: e.target.value as NonNullable<WorkflowEdge["condition"]>["operator"] } })}>
                {operators.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <input style={inputStyle} value={String(currentEdge.condition?.value ?? "")} onChange={e => patchEdge(selectedEdge, { condition: { ...(currentEdge.condition || { field: "", operator: "==" }), value: e.target.value } })} placeholder="条件值；空表示无条件" />
              <button style={ghostButtonStyle} onClick={() => patchEdge(selectedEdge, { condition: undefined })}>清除条件</button>
              <button style={dangerButtonStyle} onClick={() => removeEdge(selectedEdge)}>删除连线</button>
            </div>
          ) : null}
        </section>
      </div>

      {jsonOpen ? (
        <div style={modalMaskStyle}>
          <div style={modalStyle}>
            <div style={toolbarStyle}>
              <strong>高级 JSON 编辑</strong>
              <button style={ghostButtonStyle} onClick={() => setJsonOpen(false)}>关闭</button>
            </div>
            <textarea value={jsonDraft} onChange={e => setJsonDraft(e.target.value)} style={textareaStyle} spellCheck={false} />
            <button style={buttonStyle} onClick={applyJson}>应用 JSON</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function nodeName(id: string, nodes: WorkflowNode[]) {
  return nodes.find(node => node.id === id)?.name || id || "-";
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

const nodeWidth = 148;
const nodeHeight = 70;

function layoutNode(node: WorkflowNode, index: number) {
  return {
    x: typeof node.x === "number" ? node.x : 80 + (index % 3) * 230,
    y: typeof node.y === "number" ? node.y : 90 + Math.floor(index / 3) * 120,
  };
}

function nodeColor(type: NodeType) {
  return ({
    start: "#10b981",
    approval: "#2563eb",
    condition: "#f59e0b",
    cc: "#8b5cf6",
    end: "#64748b",
  } satisfies Record<NodeType, string>)[type];
}

const panelStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16 };
const toolbarStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 };
const inputStyle: React.CSSProperties = { width: "100%", minHeight: 36, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-muted)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13 };
const buttonStyle: React.CSSProperties = { height: 34, padding: "0 14px", border: 0, borderRadius: "var(--radius-md)", background: "var(--color-primary)", color: "#fff", fontWeight: 700, cursor: "pointer" };
const smallButtonStyle: React.CSSProperties = { ...buttonStyle, height: 28, fontSize: 12 };
const ghostButtonStyle: React.CSSProperties = { minHeight: 30, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-primary)", cursor: "pointer" };
const dangerButtonStyle: React.CSSProperties = { ...ghostButtonStyle, color: "var(--status-danger)" };
const nodeButtonStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-muted)", color: "var(--text-primary)", textAlign: "left", cursor: "pointer" };
const edgeButtonStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 24px 1fr auto", alignItems: "center", gap: 8, minHeight: 46, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-muted)", color: "var(--text-primary)", cursor: "pointer" };
const arrowStyle: React.CSSProperties = { color: "var(--color-primary)", fontWeight: 900, textAlign: "center" };
const conditionPillStyle: React.CSSProperties = { fontSize: 11, color: "var(--color-primary)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px" };
const canvasStyle: React.CSSProperties = { position: "relative", height: 360, marginBottom: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "linear-gradient(90deg, rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px)", backgroundSize: "24px 24px", overflow: "hidden" };
const svgStyle: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "auto" };
const canvasNodeStyle: React.CSSProperties = { position: "absolute", width: nodeWidth, height: nodeHeight, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, padding: "8px 10px", border: "2px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", color: "var(--text-primary)", textAlign: "left", cursor: "grab", userSelect: "none", zIndex: 2 };
const nodeTypePillStyle: React.CSSProperties = { alignSelf: "flex-start", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 800, textTransform: "uppercase" };
const successStyle: React.CSSProperties = { marginBottom: 12, color: "var(--status-success)", fontWeight: 700 };
const formHintStyle: React.CSSProperties = { marginTop: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 10, display: "grid", gap: 6, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 };
const warnStyle: React.CSSProperties = { marginTop: 10, border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)", borderRadius: "var(--radius-md)", padding: 10, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 6, color: "var(--text-secondary)", fontSize: 12, fontWeight: 700 };
const dividerStyle: React.CSSProperties = { border: 0, borderTop: "1px solid var(--border)", margin: "16px 0" };
const modalMaskStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const modalStyle: React.CSSProperties = { width: "min(900px, 92vw)", maxHeight: "88vh", overflow: "auto", background: "var(--bg-card)", borderRadius: "var(--radius-md)", padding: 16, border: "1px solid var(--border)" };
const textareaStyle: React.CSSProperties = { width: "100%", minHeight: 440, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-muted)", color: "var(--text-primary)", padding: 12, fontFamily: "monospace", fontSize: 13, marginBottom: 12 };
