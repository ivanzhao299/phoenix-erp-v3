"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { workflowApi } from "@/lib/workflow-api";

type NodeType = "start" | "approval" | "condition" | "cc" | "end";
type WorkflowNode = {
  id: string;
  type: NodeType;
  name: string;
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
  { id: "start", type: "start", name: "开始" },
  { id: "approval_1", type: "approval", name: "审批", config: { assigneeType: "ROLE", roles: ["ROLE_FIN_ACCT"] } },
  { id: "end", type: "end", name: "结束" },
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
  const [selectedNode, setSelectedNode] = useState(1);
  const [selectedEdge, setSelectedEdge] = useState(0);
  const [formVersionId, setFormVersionId] = useState("");
  const [msg, setMsg] = useState("");
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");

  useEffect(() => {
    workflowApi.definitionDesigner(id).then(res => {
      setData(res.data);
      const graph = res.data.graph_json as { nodes?: WorkflowNode[]; edges?: WorkflowEdge[] } | undefined;
      if (Array.isArray(graph?.nodes)) setNodes(graph.nodes);
      if (Array.isArray(graph?.edges)) setEdges(graph.edges);
      if (res.data.form_version_id) setFormVersionId(String(res.data.form_version_id));
    });
  }, [id]);

  const graph = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const currentNode = nodes[selectedNode] || nodes[0];
  const currentEdge = edges[selectedEdge] || edges[0];

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
          <label style={labelStyle}>绑定表单版本 ID</label>
          <input style={inputStyle} value={formVersionId} onChange={e => setFormVersionId(e.target.value)} placeholder="例如 1" />

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
const successStyle: React.CSSProperties = { marginBottom: 12, color: "var(--status-success)", fontWeight: 700 };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 6, color: "var(--text-secondary)", fontSize: 12, fontWeight: 700 };
const dividerStyle: React.CSSProperties = { border: 0, borderTop: "1px solid var(--border)", margin: "16px 0" };
const modalMaskStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const modalStyle: React.CSSProperties = { width: "min(900px, 92vw)", maxHeight: "88vh", overflow: "auto", background: "var(--bg-card)", borderRadius: "var(--radius-md)", padding: 16, border: "1px solid var(--border)" };
const textareaStyle: React.CSSProperties = { width: "100%", minHeight: 440, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-muted)", color: "var(--text-primary)", padding: 12, fontFamily: "monospace", fontSize: 13, marginBottom: 12 };
