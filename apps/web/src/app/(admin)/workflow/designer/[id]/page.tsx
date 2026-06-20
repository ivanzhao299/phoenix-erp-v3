"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { ModalV2 } from "@/components/design-system/dialogs/ModalV2";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";
import { workflowApi, type WorkflowForm } from "@/lib/workflow-api";
import u from "@/styles/uix-utils.module.css";
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
  fields?: Array<{
    key: string;
    label: string;
    type: string;
    required?: boolean;
  }>;
};
type DirectoryOption = {
  label: string;
  value: string;
};
type CheckItem = {
  label: string;
  detail: string;
  ok: boolean;
  level: "error" | "warn" | "ok";
};
type RoutePresetKind = "simple" | "two_level" | "amount_branch" | "approval_cc";
type RoutePresetAdvice = {
  kind: RoutePresetKind;
  label: string;
  description: string;
  reason: string;
  enabled: boolean;
  recommended: boolean;
};
const defaultNodes: WorkflowNode[] = [{
  id: "start",
  type: "start",
  name: "发起申请",
  x: 80,
  y: 140
}, {
  id: "approval_1",
  type: "approval",
  name: "一级审批",
  x: 320,
  y: 140,
  config: {
    assigneeType: "ROLE",
    roles: ["ROLE_SYSOPS"]
  }
}, {
  id: "end",
  type: "end",
  name: "流程完成",
  x: 560,
  y: 140
}];
const defaultEdges: WorkflowEdge[] = [{
  from: "start",
  to: "approval_1"
}, {
  from: "approval_1",
  to: "end"
}];
const fallbackRoleOptions: DirectoryOption[] = [{
  label: "系统管理员",
  value: "ROLE_SYSOPS"
}, {
  label: "财务会计",
  value: "ROLE_FIN_ACCT"
}, {
  label: "财务负责人",
  value: "ROLE_FIN_CFO"
}, {
  label: "采购员",
  value: "ROLE_PRC_BUYER"
}, {
  label: "仓储负责人",
  value: "ROLE_WMS_MGR"
}, {
  label: "品控负责人",
  value: "ROLE_QA_MGR"
}, {
  label: "门店经理",
  value: "ROLE_STORE_MGR"
}, {
  label: "销售负责人",
  value: "ROLE_SALES_MGR"
}, {
  label: "养殖场长",
  value: "ROLE_FARM_MGR"
}, {
  label: "物流负责人",
  value: "ROLE_LOG_MGR"
}];
const fallbackUserOptions: DirectoryOption[] = [];
const operators = [{
  label: "等于",
  value: "=="
}, {
  label: "不等于",
  value: "!="
}, {
  label: "大于",
  value: ">"
}, {
  label: "大于等于",
  value: ">="
}, {
  label: "小于",
  value: "<"
}, {
  label: "小于等于",
  value: "<="
}, {
  label: "包含",
  value: "contains"
}] as const;
const presetMeta: Record<RoutePresetKind, {
  label: string;
  description: string;
}> = {
  simple: {
    label: "单级审批",
    description: "适合请假、普通备案、低风险申请。"
  },
  two_level: {
    label: "两级审批",
    description: "适合跨部门、库存、质量、门店类流程。"
  },
  amount_branch: {
    label: "金额分支",
    description: "适合付款、报销、采购、合同等金额类流程。"
  },
  approval_cc: {
    label: "审批后抄送",
    description: "适合审批完成后需要财务、仓储或管理层知会。"
  }
};
export default function WorkflowDesignerPage() {
  const params = useParams<{
    id: string;
  }>();
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
  const [rehearsalData, setRehearsalData] = useState<Record<string, string>>({});
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [roleOptions, setRoleOptions] = useState<DirectoryOption[]>(fallbackRoleOptions);
  const [userOptions, setUserOptions] = useState<DirectoryOption[]>(fallbackUserOptions);
  useEffect(() => {
    Promise.all([workflowApi.definitionDesigner(id), workflowApi.forms(), workflowApi.previewDataSource({
      code: "SYS_ROLES"
    }).catch(() => ({
      data: []
    })), workflowApi.previewDataSource({
      code: "SYS_USERS"
    }).catch(() => ({
      data: []
    }))]).then(([res, formRes, roleRes, userRes]) => {
      setData(res.data);
      const graph = res.data.graph_json as {
        nodes?: WorkflowNode[];
        edges?: WorkflowEdge[];
      } | undefined;
      if (Array.isArray(graph?.nodes)) setNodes(graph.nodes);
      if (Array.isArray(graph?.edges)) setEdges(graph.edges);
      if (res.data.form_version_id) setFormVersionId(String(res.data.form_version_id));
      const schema = res.data.form_schema_json as RuntimeSchema | undefined;
      setFormSchema(schema && Array.isArray(schema.fields) ? schema : null);
      setForms(formRes.data || []);
      const nextRoles = normalizeDirectoryOptions(roleRes.data);
      const nextUsers = normalizeDirectoryOptions(userRes.data);
      if (nextRoles.length) setRoleOptions(nextRoles);
      if (nextUsers.length) setUserOptions(nextUsers);
    });
  }, [id]);
  const graph = useMemo(() => ({
    nodes,
    edges
  }), [nodes, edges]);
  const mainPath = useMemo(() => buildMainPath(nodes, edges), [nodes, edges]);
  const currentNode = nodes[selectedNode] || nodes[0];
  const currentEdge = edges[selectedEdge] || edges[0];
  const publishableForms = forms.filter(form => form.current_version_id);
  const selectedForm = publishableForms.find(form => String(form.current_version_id) === formVersionId);
  const fieldOptions = useMemo(() => formSchema?.fields || [], [formSchema]);
  const previewLines = useMemo(() => buildPreview(nodes, edges, roleOptions, userOptions), [nodes, edges, roleOptions, userOptions]);
  const rehearsal = useMemo(() => rehearseWorkflow(nodes, edges, rehearsalData, roleOptions, userOptions), [edges, nodes, rehearsalData, roleOptions, userOptions]);
  const designerChecks = useMemo(() => buildDesignerChecks(nodes, edges, formVersionId, fieldOptions, roleOptions, userOptions), [nodes, edges, formVersionId, fieldOptions, roleOptions, userOptions]);
  const blockingProblems = designerChecks.filter(item => item.level === "error" && !item.ok);
  const routePresetAdvice = buildRoutePresetAdvice(selectedForm, fieldOptions);
  const recommendedPreset = routePresetAdvice.find(item => item.recommended) || routePresetAdvice[0];
  useEffect(() => {
    if (!selectedForm) return;
    workflowApi.formDesigner(selectedForm.id).then(res => {
      const schema = res.data.schema_json as RuntimeSchema | undefined;
      setFormSchema(schema && Array.isArray(schema.fields) ? schema : null);
    }).catch(() => {});
  }, [selectedForm]);
  function patchNode(index: number, patch: Partial<WorkflowNode>) {
    setNodes(prev => prev.map((node, i) => i === index ? {
      ...node,
      ...patch
    } : node));
  }
  function patchNodeConfig(index: number, patch: WorkflowNode["config"]) {
    setNodes(prev => prev.map((node, i) => i === index ? {
      ...node,
      config: {
        ...(node.config || {}),
        ...(patch || {})
      }
    } : node));
  }
  function addStep(type: "approval" | "condition" | "cc") {
    const nextIndex = nodes.length + 1;
    const next: WorkflowNode = {
      id: `${type}_${nextIndex}`,
      type,
      name: type === "approval" ? "新的审批步骤" : type === "condition" ? "条件判断" : "抄送相关人员",
      x: 80 + nextIndex * 220,
      y: 140,
      config: type === "approval" ? {
        assigneeType: "ROLE",
        roles: ["ROLE_SYSOPS"]
      } : {}
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
      if (incoming && outgoing) rest.push({
        from: incoming.from,
        to: outgoing.to
      });
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
    setEdges([...preserved, ...linear.slice(0, -1).map((node, index) => ({
      from: node.id,
      to: linear[index + 1].id
    }))]);
  }
  function addEdge() {
    const from = currentNode?.id || nodes[0]?.id || "";
    const to = nodes.find(node => node.type === "end")?.id || nodes[0]?.id || "";
    setEdges(prev => [...prev, {
      from,
      to
    }]);
    setSelectedEdge(edges.length);
  }
  function patchEdge(index: number, patch: Partial<WorkflowEdge>) {
    setEdges(prev => prev.map((edge, i) => i === index ? {
      ...edge,
      ...patch
    } : edge));
  }
  function removeEdge(index: number) {
    setEdges(prev => prev.filter((_, i) => i !== index));
    setSelectedEdge(Math.max(0, index - 1));
  }
  function applyRoutePreset(kind: RoutePresetKind) {
    const advice = routePresetAdvice.find(item => item.kind === kind);
    if (advice && !advice.enabled) {
      setError(`${advice.label}不适合当前表单：${advice.reason}`);
      setMsg("请先切换到含金额/数字字段的表单，或选择系统推荐的路线。");
      return;
    }
    const sysRole = pickRole(roleOptions, ["系统", "管理"], "ROLE_SYSOPS");
    const financeRole = pickRole(roleOptions, ["财务"], "ROLE_FIN_ACCT");
    const managerRole = pickRole(roleOptions, ["负责人", "主管", "经理"], sysRole);
    const amountField = fieldOptions.find(field => field.type === "amount" || field.key.includes("amount") || field.key.includes("money"))?.key || "amount";
    let nextNodes: WorkflowNode[] = [];
    let nextEdges: WorkflowEdge[] = [];
    if (kind === "simple") {
      nextNodes = [{
        id: "start",
        type: "start",
        name: "发起申请",
        x: 80,
        y: 140
      }, {
        id: "approval_1",
        type: "approval",
        name: "负责人审批",
        x: 320,
        y: 140,
        config: {
          assigneeType: "ROLE",
          roles: [managerRole]
        }
      }, {
        id: "end",
        type: "end",
        name: "流程完成",
        x: 560,
        y: 140
      }];
      nextEdges = [{
        from: "start",
        to: "approval_1"
      }, {
        from: "approval_1",
        to: "end"
      }];
    } else if (kind === "two_level") {
      nextNodes = [{
        id: "start",
        type: "start",
        name: "发起申请",
        x: 80,
        y: 140
      }, {
        id: "dept_approval",
        type: "approval",
        name: "部门负责人审批",
        x: 320,
        y: 140,
        config: {
          assigneeType: "ROLE",
          roles: [managerRole]
        }
      }, {
        id: "final_approval",
        type: "approval",
        name: "最终审批",
        x: 560,
        y: 140,
        config: {
          assigneeType: "ROLE",
          roles: [sysRole]
        }
      }, {
        id: "end",
        type: "end",
        name: "流程完成",
        x: 800,
        y: 140
      }];
      nextEdges = [{
        from: "start",
        to: "dept_approval"
      }, {
        from: "dept_approval",
        to: "final_approval"
      }, {
        from: "final_approval",
        to: "end"
      }];
    } else if (kind === "amount_branch") {
      nextNodes = [{
        id: "start",
        type: "start",
        name: "发起申请",
        x: 80,
        y: 140
      }, {
        id: "amount_check",
        type: "condition",
        name: "金额判断",
        x: 320,
        y: 140
      }, {
        id: "manager_approval",
        type: "approval",
        name: "负责人审批",
        x: 560,
        y: 80,
        config: {
          assigneeType: "ROLE",
          roles: [managerRole]
        }
      }, {
        id: "finance_approval",
        type: "approval",
        name: "财务审批",
        x: 560,
        y: 220,
        config: {
          assigneeType: "ROLE",
          roles: [financeRole]
        }
      }, {
        id: "end",
        type: "end",
        name: "流程完成",
        x: 820,
        y: 140
      }];
      nextEdges = [{
        from: "start",
        to: "amount_check"
      }, {
        from: "amount_check",
        to: "finance_approval",
        label: "金额较大",
        condition: {
          field: amountField,
          operator: ">",
          value: 10000
        }
      }, {
        from: "amount_check",
        to: "manager_approval",
        label: "普通金额"
      }, {
        from: "manager_approval",
        to: "end"
      }, {
        from: "finance_approval",
        to: "end"
      }];
    } else {
      nextNodes = [{
        id: "start",
        type: "start",
        name: "发起申请",
        x: 80,
        y: 140
      }, {
        id: "approval_1",
        type: "approval",
        name: "负责人审批",
        x: 320,
        y: 140,
        config: {
          assigneeType: "ROLE",
          roles: [managerRole]
        }
      }, {
        id: "cc_record",
        type: "cc",
        name: "抄送备案",
        x: 560,
        y: 140,
        config: {
          assigneeType: "ROLE",
          roles: [sysRole]
        }
      }, {
        id: "end",
        type: "end",
        name: "流程完成",
        x: 800,
        y: 140
      }];
      nextEdges = [{
        from: "start",
        to: "approval_1"
      }, {
        from: "approval_1",
        to: "cc_record"
      }, {
        from: "cc_record",
        to: "end"
      }];
    }
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNode(1);
    setSelectedEdge(0);
    setMsg(`已套用${advice?.label || "路线模板"}，${advice?.reason || "可以继续微调审批人和条件。"}`);
    setError("");
  }
  function applyRecommendedRoute() {
    if (!recommendedPreset) return;
    applyRoutePreset(recommendedPreset.kind);
  }
  function tidyLayout() {
    const path = buildMainPath(nodes, edges);
    const pathIds = new Set(path.map(node => node.id));
    const nextNodes = nodes.map(node => {
      const index = path.findIndex(item => item.id === node.id);
      if (index >= 0) return {
        ...node,
        x: 80 + index * 240,
        y: node.type === "condition" ? 130 : 140
      };
      const extraIndex = [...nodes].filter(item => !pathIds.has(item.id)).findIndex(item => item.id === node.id);
      return {
        ...node,
        x: 320 + extraIndex * 220,
        y: 280
      };
    });
    setNodes(nextNodes);
    setMsg("已整理路线图位置。");
  }
  function autoCompleteForPublish() {
    const sysRole = pickRole(roleOptions, ["系统", "管理"], "ROLE_SYSOPS");
    let nextNodes = nodes.length ? nodes : defaultNodes;
    let nextEdges = edges;
    if (!nextNodes.some(node => node.type === "start")) {
      nextNodes = [{
        id: "start",
        type: "start",
        name: "发起申请",
        x: 80,
        y: 140
      }, ...nextNodes];
    }
    if (!nextNodes.some(node => node.type === "end")) {
      nextNodes = [...nextNodes, {
        id: "end",
        type: "end",
        name: "流程完成",
        x: 80 + nextNodes.length * 240,
        y: 140
      }];
    }
    if (!nextNodes.some(node => node.type === "approval")) {
      const end = nextNodes.find(node => node.type === "end");
      const approval: WorkflowNode = {
        id: uniqueNodeId("approval", nextNodes),
        type: "approval",
        name: "负责人审批",
        x: 320,
        y: 140,
        config: {
          assigneeType: "ROLE",
          roles: [sysRole]
        }
      };
      nextNodes = end ? [...nextNodes.filter(node => node.id !== end.id), approval, end] : [...nextNodes, approval];
    }
    const validIds = new Set(nextNodes.map(node => node.id));
    nextNodes = nextNodes.map(node => {
      if (node.type !== "approval" && node.type !== "cc") return node;
      const config = node.config || {};
      const assigneeType = config.assigneeType || "ROLE";
      if (assigneeType === "STARTER") return node;
      if (assigneeType === "USER" && (config.users || []).length) return node;
      if (assigneeType === "ROLE" && (config.roles || []).length) return node;
      return {
        ...node,
        config: {
          ...config,
          assigneeType: "ROLE",
          roles: [sysRole]
        }
      };
    });
    nextEdges = nextEdges.filter(edge => validIds.has(edge.from) && validIds.has(edge.to));
    if (!nextEdges.length) nextEdges = linkMainRoute(nextNodes);
    const fieldKeys = new Set(fieldOptions.map(field => field.key));
    const firstField = fieldOptions[0]?.key || "amount";
    nextEdges = nextEdges.map(edge => {
      if (!edge.condition) return edge;
      if (!edge.condition.field || fieldKeys.size > 0 && !fieldKeys.has(edge.condition.field)) {
        return {
          ...edge,
          condition: {
            ...edge.condition,
            field: firstField
          }
        };
      }
      return edge;
    });
    const conditionFallbacks = nextNodes.filter(node => node.type === "condition").filter(node => nextEdges.some(edge => edge.from === node.id) && !nextEdges.some(edge => edge.from === node.id && !edge.condition)).map(node => ({
      from: node.id,
      to: nextNodes.find(item => item.type === "end")?.id || "end",
      label: "默认路线"
    }));
    if (!formVersionId && publishableForms[0]?.current_version_id) {
      setFormVersionId(String(publishableForms[0].current_version_id));
    }
    setNodes(nextNodes);
    setEdges([...nextEdges, ...conditionFallbacks]);
    setSelectedNode(Math.min(1, nextNodes.length - 1));
    setSelectedEdge(0);
    setMsg("已按发布要求补齐表单、审批人、路线和条件兜底，请再彩排确认。");
    setError("");
  }
  function applyFieldToCurrentRule(fieldKey: string) {
    if (!currentEdge) return;
    patchEdge(selectedEdge, {
      condition: {
        ...(currentEdge.condition || {
          operator: "==",
          value: ""
        }),
        field: fieldKey
      }
    });
    setMsg("已把字段加入当前规则，可以继续设置判断条件。");
  }
  function selectFormVersion(value: string) {
    setFormVersionId(value);
    if (!value) setFormSchema(null);
  }
  async function publish() {
    const problems = validateDesigner(nodes, edges, fieldOptions, roleOptions, userOptions);
    if (problems.length > 0) {
      setError(problems[0]);
      setMsg("");
      return;
    }
    setError("");
    setMsg("");
    await workflowApi.publishDefinition(id, {
      graph_json: graph,
      form_version_id: formVersionId ? Number(formVersionId) : undefined
    });
    setMsg("发布成功，业务人员现在可以按这个流程发起申请。");
  }
  function openJson() {
    setJsonDraft(JSON.stringify(graph, null, 2));
    setJsonOpen(true);
  }
  function applyJson() {
    const parsed = JSON.parse(jsonDraft) as {
      nodes?: WorkflowNode[];
      edges?: WorkflowEdge[];
    };
    setNodes(Array.isArray(parsed.nodes) ? parsed.nodes : []);
    setEdges(Array.isArray(parsed.edges) ? parsed.edges : []);
    setSelectedNode(0);
    setSelectedEdge(0);
    setJsonOpen(false);
  }
  return <div>
      <PageHeader title="流程搭建器" subtitle={String(data?.name || "")} breadcrumb={["工作流", "流程设计器"]} />
      <div className={s.infoBanner}>
        当前阶段已加入本地彩排：不写入数据库、不产生真实审批任务，只根据表单测试数据模拟流程走向。
      </div>
      <div style={layoutStyle}>
        <section className={s.card} style={panelStyle}>
          <div style={toolbarStyle}>
            <div>
              <strong className={s.cardTitle}>流程步骤</strong>
              <p className={`${s.modalDesc} ${u.mt4}`}>按业务发生顺序搭建，系统会自动保存为流程图。</p>
            </div>
          </div>
          <div style={addBarStyle}>
            <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => addStep("approval")}>添加审批</button>
            <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => addStep("condition")}>添加条件</button>
            <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => addStep("cc")}>添加抄送</button>
            <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={tidyLayout}>整理路线</button>
          </div>
          <div style={directoryHintStyle}>
            <strong>已接入组织数据</strong>
            <span>{roleOptions.length} 个角色 · {userOptions.length} 个用户会自动从系统数据源读取</span>
          </div>
          <div style={presetBoxStyle}>
            <div style={presetHeaderStyle}>
              <strong>路线模板</strong>
              <span>{selectedForm ? `已按「${selectedForm.name}」推荐` : "绑定表单后会自动推荐"}</span>
            </div>
            <div style={presetGridStyle}>
              {routePresetAdvice.map(preset => <button key={preset.kind} type="button" style={{
              ...presetButtonStyle,
              borderColor: preset.recommended ? "var(--color-primary)" : "var(--border)",
              opacity: preset.enabled ? 1 : 0.56,
              cursor: preset.enabled ? "pointer" : "not-allowed"
            }} disabled={!preset.enabled} title={preset.reason} onClick={() => applyRoutePreset(preset.kind)}>
                  <span className={`${s.badge} ${preset.recommended ? s.badgeSuccess : preset.enabled ? s.badgeInfo : s.badgeWarning}`}>
                    {preset.recommended ? "推荐" : preset.enabled ? "可用" : "不适合"}
                  </span>
                  <strong>{preset.label}</strong>
                  <small>{preset.description}</small>
                  <em>{preset.reason}</em>
                </button>)}
            </div>
          </div>
          <div style={assistantBoxStyle}>
            <strong>智能整理</strong>
            <span>自动补齐缺失表单、审批人、无效连线和条件默认路线。</span>
            <div style={assistantActionStyle}>
              <button type="button" className={`${s.btnPrimary} ${s.btnSm}`} onClick={applyRecommendedRoute}>按表单推荐路线</button>
              <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={autoCompleteForPublish}>一键补齐发布条件</button>
            </div>
          </div>
          <div style={stepListStyle}>
            {mainPath.map((node, index) => {
            const nodeIndex = nodes.findIndex(item => item.id === node.id);
            return <button key={`${node.id}-${index}`} type="button" style={{
              ...stepButtonStyle,
              borderColor: selectedNode === nodeIndex ? "var(--color-primary)" : "var(--border)"
            }} onClick={() => setSelectedNode(nodeIndex)}>
                  <span className={nodeBadgeClass(node.type)}>{stepTypeText(node.type)}</span>
                  <strong>{node.name}</strong>
                  <span>{stepHint(node, roleOptions, userOptions)}</span>
                </button>;
          })}
          </div>
        </section>

        <section className={s.card} style={panelStyle}>
          <div style={toolbarStyle}>
            <div>
              <strong className={s.cardTitle}>所见即所得预览</strong>
              <p className={`${s.modalDesc} ${u.mt4}`}>发布前先看一遍业务人员会经历什么。</p>
            </div>
            <div style={toolbarActionsStyle}>
              <button type="button" style={secondaryActionButton} onClick={openJson}>高级 JSON</button>
              <button type="button" style={primaryActionButton} onClick={publish}>发布流程</button>
            </div>
          </div>
          {msg ? <div className={s.successBanner}>{msg}</div> : null}
          {error ? <div className={s.errorBanner}>{error}</div> : null}

          <div style={checkPanelStyle}>
            <div style={edgeHeaderStyle}>
              <div>
                <strong className={s.cardTitle}>上线检查</strong>
                <p className={`${s.modalDesc} ${u.mt4}`}>发布前自动检查表单、审批人、分支和路线完整性。</p>
              </div>
              <span className={`${s.badge} ${blockingProblems.length ? s.badgeDanger : s.badgeSuccess}`}>
                {blockingProblems.length ? `${blockingProblems.length} 项需处理` : "可以发布"}
              </span>
            </div>
            <div style={checkGridStyle}>
              {designerChecks.map(item => <div key={item.label} style={checkItemStyle}>
                  <span className={`${s.badge} ${checkBadgeClass(item)}`}>{item.ok ? "通过" : item.level === "warn" ? "建议" : "必改"}</span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>)}
            </div>
          </div>

          <div style={flowPreviewStyle}>
            {mainPath.map((node, index) => <div key={`${node.id}-preview`} style={previewItemStyle}>
                <button type="button" style={{
              ...previewCardStyle,
              borderColor: nodes[selectedNode]?.id === node.id ? "var(--color-primary)" : "var(--border)"
            }} onClick={() => setSelectedNode(nodes.findIndex(item => item.id === node.id))}>
                  <span className={nodeBadgeClass(node.type)}>{stepTypeText(node.type)}</span>
                  <strong>{node.name}</strong>
                  <small>{stepHint(node, roleOptions, userOptions)}</small>
                </button>
                {index < mainPath.length - 1 ? <span style={arrowStyle}>→</span> : null}
              </div>)}
          </div>

          <div className={s.card} style={previewSummaryStyle}>
            <strong className={s.cardTitle}>流程说明</strong>
            <ol style={summaryListStyle}>
              {previewLines.map(line => <li key={line}>{line}</li>)}
            </ol>
          </div>

          <div className={s.card} style={previewSummaryStyle}>
            <div style={edgeHeaderStyle}>
              <div>
                <strong className={s.cardTitle}>流程彩排</strong>
                <p className={`${s.modalDesc} ${u.mt4}`}>输入一组测试数据，系统会模拟会走到哪些步骤。</p>
              </div>
              <span className={`${s.badge} ${rehearsal.warnings.length ? s.badgeWarning : s.badgeSuccess}`}>
                {rehearsal.warnings.length ? "需要检查" : "彩排通过"}
              </span>
            </div>
            {fieldOptions.length ? <div style={rehearsalGridStyle}>
                {fieldOptions.map(field => <label key={field.key} className={s.field} style={{
              marginBottom: 0
            }}>
                    <span className={s.lbl}>{field.label}</span>
                    <input className={s.inp} value={rehearsalData[field.key] || ""} onChange={e => setRehearsalData(prev => ({
                ...prev,
                [field.key]: e.target.value
              }))} placeholder={field.required ? "必填测试值" : "测试值"} />
                  </label>)}
              </div> : <div className={s.warnBanner}>当前流程没有可读取的表单字段；绑定并发布表单后可按字段彩排条件分支。</div>}
            {rehearsal.warnings.length ? <div className={`${s.warnBanner} ${u.mt12}`}>
                {rehearsal.warnings.join("；")}
              </div> : null}
            <div style={rehearsalPathStyle}>
              {rehearsal.steps.map((item, index) => <div key={`${item.node.id}-${index}`} style={rehearsalStepStyle}>
                  <span className={nodeBadgeClass(item.node.type)}>{stepTypeText(item.node.type)}</span>
                  <strong>{item.node.name}</strong>
                  <small>{item.reason}</small>
                </div>)}
            </div>
          </div>

          <div style={edgeHeaderStyle}>
            <strong className={s.cardTitle}>分支/连线规则</strong>
            <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={addEdge}>添加规则</button>
          </div>
          <div style={edgeListStyle}>
            {edges.map((edge, index) => <button key={`${edge.from}-${edge.to}-${index}`} type="button" style={{
            ...edgeButtonStyle,
            borderColor: selectedEdge === index ? "var(--color-primary)" : "var(--border)"
          }} onClick={() => setSelectedEdge(index)}>
                <span>{nodeName(edge.from, nodes)}</span>
                <span>→</span>
                <span>{nodeName(edge.to, nodes)}</span>
                <em>{edge.condition ? conditionText(edge.condition, fieldOptions) : "无条件"}</em>
              </button>)}
          </div>
        </section>

        <section className={s.card} style={panelStyle}>
          <strong className={s.cardTitle} style={{
          display: "block",
          marginBottom: 12
        }}>当前设置</strong>
          <label className={s.lbl}>绑定业务表单</label>
          <select className={s.inp} value={formVersionId} onChange={e => selectFormVersion(e.target.value)}>
            <option value="">不绑定表单</option>
            {publishableForms.map(form => <option key={form.id} value={String(form.current_version_id)}>
                {form.name} · {categoryText(form.category)} · V{form.current_version_id}
              </option>)}
          </select>
          {selectedForm ? <div style={formHintStyle}>
              <strong>{selectedForm.name}</strong>
              <span>{selectedForm.description || "用户发起时会按此表单填写申请内容。"}</span>
              <Link href={`/workflow/form-designer/${selectedForm.id}`}>查看/调整表单</Link>
            </div> : <div className={s.warnBanner} style={{
          marginTop: 10
        }}>未绑定表单时，用户只能填写通用说明。</div>}
          {fieldOptions.length ? <div style={fieldPoolStyle}>
              <strong>表单字段池</strong>
              <span>点击字段可直接作为当前规则的判断条件。</span>
              <div style={fieldChipGridStyle}>
                {fieldOptions.map(field => <button key={field.key} type="button" className={s.tabPill} onClick={() => applyFieldToCurrentRule(field.key)}>
                    {field.label}
                  </button>)}
              </div>
            </div> : null}

          <hr style={dividerStyle} />
          {currentNode ? <div style={{
          display: "grid",
          gap: 10
        }}>
              <strong className={s.cardTitle}>{stepTypeText(currentNode.type)}设置</strong>
              <label className={s.field}>
                <span className={s.lbl}>步骤名称</span>
                <input className={s.inp} value={currentNode.name} onChange={e => patchNode(selectedNode, {
              name: e.target.value
            })} />
              </label>
              {currentNode.type === "approval" || currentNode.type === "cc" ? <AssigneeEditor node={currentNode} roles={roleOptions} users={userOptions} onChange={patch => patchNodeConfig(selectedNode, patch)} /> : null}
              {currentNode.type !== "start" && currentNode.type !== "end" ? <div style={smallButtonGridStyle}>
                  <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => moveStep(currentNode.id, -1)}>上移</button>
                  <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => moveStep(currentNode.id, 1)}>下移</button>
                  <button type="button" className={`${s.btnDanger} ${s.btnSm}`} onClick={() => removeStep(selectedNode)}>删除</button>
                </div> : null}
            </div> : null}

          <hr style={dividerStyle} />
          <strong className={s.cardTitle} style={{
          display: "block",
          marginBottom: 10
        }}>规则设置</strong>
          {currentEdge ? <div style={{
          display: "grid",
          gap: 10
        }}>
              <select className={s.inp} value={currentEdge.from} onChange={e => patchEdge(selectedEdge, {
            from: e.target.value
          })}>
                {nodes.map(node => <option key={node.id} value={node.id}>从：{node.name}</option>)}
              </select>
              <select className={s.inp} value={currentEdge.to} onChange={e => patchEdge(selectedEdge, {
            to: e.target.value
          })}>
                {nodes.map(node => <option key={node.id} value={node.id}>到：{node.name}</option>)}
              </select>
              <label className={s.field} style={{
            marginBottom: 0
          }}>
                <span className={s.lbl}>满足条件时才走这条规则</span>
                <select className={s.inp} value={currentEdge.condition?.field || ""} onChange={e => patchEdge(selectedEdge, {
              condition: e.target.value ? {
                ...(currentEdge.condition || {
                  operator: "==",
                  value: ""
                }),
                field: e.target.value
              } : undefined
            })}>
                  <option value="">无条件，直接流转</option>
                  {fieldOptions.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
                </select>
              </label>
              {currentEdge.condition ? <>
                  <select className={s.inp} value={currentEdge.condition.operator} onChange={e => patchEdge(selectedEdge, {
              condition: {
                ...currentEdge.condition!,
                operator: e.target.value as NonNullable<WorkflowEdge["condition"]>["operator"]
              }
            })}>
                    {operators.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                  <input className={s.inp} value={String(currentEdge.condition.value ?? "")} onChange={e => patchEdge(selectedEdge, {
              condition: {
                ...currentEdge.condition!,
                value: e.target.value
              }
            })} placeholder="判断值，如 10000" />
                </> : null}
              <button type="button" style={actionPill('danger')} onClick={() => removeEdge(selectedEdge)}>删除规则</button>
            </div> : <div className={s.emptyState}><div className={s.emptyStateText}>暂无规则。</div></div>}
        </section>
      </div>

      <ModalV2 open={jsonOpen} onClose={() => setJsonOpen(false)} title="高级 JSON 编辑" width={900}
        footer={<button type="button" style={primaryActionButton} onClick={applyJson}>应用 JSON</button>}>
        <textarea value={jsonDraft} onChange={e => setJsonDraft(e.target.value)} className={s.textarea} style={textareaStyle} spellCheck={false} />
      </ModalV2>
    </div>;
}
function AssigneeEditor({
  node,
  roles,
  users,
  onChange
}: {
  node: WorkflowNode;
  roles: DirectoryOption[];
  users: DirectoryOption[];
  onChange: (patch: WorkflowNode["config"]) => void;
}) {
  const config = node.config || {};
  const assigneeType = config.assigneeType || "ROLE";
  const selectedUser = config.users?.[0] ? String(config.users[0]) : "";
  return <>
      <label className={s.field}>
        <span className={s.lbl}>{node.type === "cc" ? "抄送给" : "审批人"}</span>
        <select className={s.inp} value={assigneeType} onChange={e => onChange({
        assigneeType: e.target.value as "ROLE" | "USER" | "STARTER"
      })}>
          <option value="ROLE">按角色</option>
          <option value="USER">指定用户 ID</option>
          <option value="STARTER">发起人本人</option>
        </select>
      </label>
      {assigneeType === "ROLE" ? <label className={s.field}>
          <span className={s.lbl}>选择角色</span>
          <select className={s.inp} value={config.roles?.[0] || "ROLE_SYSOPS"} onChange={e => onChange({
        roles: [e.target.value]
      })}>
            {roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
          <small style={fieldHelpStyle}>角色来自系统角色数据源，新增角色后会自动出现在这里。</small>
        </label> : null}
      {assigneeType === "USER" ? <label className={s.field}>
          <span className={s.lbl}>指定用户</span>
          {users.length ? <select className={s.inp} value={selectedUser} onChange={e => onChange({
        users: e.target.value ? [Number(e.target.value)] : []
      })}>
              <option value="">请选择用户</option>
              {users.map(user => <option key={user.value} value={user.value}>{user.label}</option>)}
            </select> : <input className={s.inp} value={(config.users || []).join(",")} onChange={e => onChange({
        users: e.target.value.split(",").map(v => Number(v.trim())).filter(Boolean)
      })} placeholder="用户 ID，如 1001" />}
          <small style={fieldHelpStyle}>用户来自系统用户数据源；如果数据源不可用，可临时填写用户 ID。</small>
        </label> : null}
      <label className={s.field}>
        <span className={s.lbl}>超时时间（小时）</span>
        <input className={s.inp} value={config.timeoutHours ?? ""} onChange={e => onChange({
        timeoutHours: e.target.value ? Number(e.target.value) : undefined
      })} placeholder="不填表示不限制" />
      </label>
    </>;
}
function normalizeDirectoryOptions(rows: Record<string, unknown>[]) {
  return rows.map(row => {
    const value = String(row.value ?? "");
    const label = String(row.label ?? value);
    return value && label ? {
      value,
      label
    } : null;
  }).filter((row): row is DirectoryOption => Boolean(row));
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
  if (!end || !beforeEnd) return [...edges, {
    from: path[path.length - 1]?.id || "start",
    to: node.id
  }];
  const rest = edges.filter(edge => !(edge.from === beforeEnd.id && edge.to === end.id));
  return [...rest, {
    from: beforeEnd.id,
    to: node.id
  }, {
    from: node.id,
    to: end.id
  }];
}
function buildDesignerChecks(nodes: WorkflowNode[], edges: WorkflowEdge[], formVersionId: string, fields: RuntimeSchema["fields"], roles: DirectoryOption[], users: DirectoryOption[]): CheckItem[] {
  const nodeIds = new Set(nodes.map(node => node.id));
  const fieldKeys = new Set((fields || []).map(field => field.key));
  const roleValues = new Set(roles.map(role => role.value));
  const userValues = new Set(users.map(user => user.value));
  const approvalNodes = nodes.filter(node => node.type === "approval");
  const invalidEdges = edges.filter(edge => !nodeIds.has(edge.from) || !nodeIds.has(edge.to));
  const missingAssignee = nodes.filter(node => {
    if (node.type !== "approval" && node.type !== "cc") return false;
    const config = node.config || {};
    const type = config.assigneeType || "ROLE";
    if (type === "STARTER") return false;
    if (type === "ROLE") return !(config.roles || []).length || Boolean(config.roles?.some(role => !roleValues.has(role)));
    return !(config.users || []).length || Boolean(config.users?.some(user => users.length > 0 && !userValues.has(String(user))));
  });
  const conditionEdges = edges.filter(edge => edge.condition);
  const invalidConditionEdges = conditionEdges.filter(edge => !edge.condition?.field || fieldKeys.size > 0 && !fieldKeys.has(edge.condition.field));
  const fieldTypes = new Map((fields || []).map(field => [field.key, field.type]));
  const numericOperators = new Set(["<", "<=", ">", ">="]);
  const semanticMismatches = conditionEdges.filter(edge => {
    if (!edge.condition || !numericOperators.has(edge.condition.operator)) return false;
    const fieldType = fieldTypes.get(edge.condition.field);
    return Boolean(fieldType && fieldType !== "number" && fieldType !== "amount");
  });
  const conditionNodes = nodes.filter(node => node.type === "condition");
  const conditionWithoutFallback = conditionNodes.filter(node => {
    const outgoing = edges.filter(edge => edge.from === node.id);
    return outgoing.length > 0 && !outgoing.some(edge => !edge.condition);
  });
  const hasEndPath = rehearseWorkflow(nodes, edges, {}, roles, users).steps.some(step => step.node.type === "end");
  return [{
    label: "起止节点",
    ok: nodes.some(node => node.type === "start") && nodes.some(node => node.type === "end"),
    level: "error",
    detail: "流程必须有发起和完成两个节点。"
  }, {
    label: "审批步骤",
    ok: approvalNodes.length > 0,
    level: "error",
    detail: approvalNodes.length ? `已设置 ${approvalNodes.length} 个审批步骤。` : "至少需要一个审批步骤。"
  }, {
    label: "业务表单",
    ok: Boolean(formVersionId),
    level: "warn",
    detail: formVersionId ? "已绑定发起申请表单。" : "建议绑定表单，否则发起人只能提交通用信息。"
  }, {
    label: "审批人/抄送人",
    ok: missingAssignee.length === 0,
    level: "error",
    detail: missingAssignee.length ? `${missingAssignee.map(node => node.name).join("、")} 未选择有效处理人。` : "所有审批和抄送节点都已选择有效对象。"
  }, {
    label: "连线完整",
    ok: invalidEdges.length === 0 && edges.length > 0,
    level: "error",
    detail: invalidEdges.length ? "存在指向不存在节点的规则。" : "流程规则都连接到了有效节点。"
  }, {
    label: "条件字段",
    ok: invalidConditionEdges.length === 0,
    level: "error",
    detail: invalidConditionEdges.length ? "有条件规则使用了不存在的表单字段。" : "条件规则字段可以在表单中找到。"
  }, {
    label: "业务语义",
    ok: semanticMismatches.length === 0,
    level: "warn",
    detail: semanticMismatches.length ? "数值比较建议使用金额或数字字段，避免请假原因、类型等文本字段参与大小判断。" : "条件判断和字段类型匹配。"
  }, {
    label: "条件兜底",
    ok: conditionWithoutFallback.length === 0,
    level: "warn",
    detail: conditionWithoutFallback.length ? "条件节点建议保留一条无条件默认路线，避免申请卡住。" : "条件节点已有默认路线或无需兜底。"
  }, {
    label: "可走到结束",
    ok: hasEndPath,
    level: "error",
    detail: hasEndPath ? "按当前主路线可以走到流程完成。" : "当前主路线无法到达完成节点。"
  }];
}
function buildRoutePresetAdvice(form: WorkflowForm | undefined, fields: RuntimeSchema["fields"]): RoutePresetAdvice[] {
  const category = String(form?.category || "").toUpperCase();
  const formText = `${form?.name || ""} ${form?.description || ""} ${category}`;
  const hasAmountField = (fields || []).some(field => {
    const fieldText = `${field.key} ${field.label} ${field.type}`.toLowerCase();
    return field.type === "amount" || field.type === "number" || /amount|money|fee|cost|price|payment|pay|total/.test(fieldText) || /金额|费用|付款|采购|合同|成本|价格|总额/.test(fieldText);
  });
  const amountCategory = ["FINANCE", "PURCHASE", "CONTRACT"].includes(category) || /付款|费用|报销|采购|合同|金额|财务/.test(formText);
  const peopleCategory = category === "HR" || /请假|人事|假期/.test(formText);
  const operationCategory = ["QUALITY", "WMS", "STORE", "FARM", "LOGISTICS"].includes(category) || /质量|库存|仓储|门店|养殖|物流|运输|异常/.test(formText);
  const amountEnabled = hasAmountField || amountCategory;
  const recommendedKind: RoutePresetKind = amountEnabled && amountCategory ? "amount_branch" : peopleCategory ? "simple" : operationCategory ? "two_level" : "simple";
  return (Object.keys(presetMeta) as RoutePresetKind[]).map(kind => {
    let enabled = true;
    let reason = "适合当前表单，可直接套用后微调审批人。";
    if (kind === "amount_branch" && !amountEnabled) {
      enabled = false;
      reason = "当前表单没有金额或数字字段，不建议做金额大小分支。";
    } else if (kind === "amount_branch") {
      reason = hasAmountField ? "检测到金额/数字字段，可按阈值自动分流。" : "当前业务属于金额类场景，可先套用再绑定金额字段。";
    } else if (kind === "simple" && peopleCategory) {
      reason = "请假/人事类流程通常先用单级审批，后续再加抄送即可。";
    } else if (kind === "two_level" && operationCategory) {
      reason = "运营类流程建议先经过负责人，再做最终确认。";
    } else if (kind === "approval_cc") {
      reason = "审批完成后需要知会财务、仓储或管理层时使用。";
    }
    return {
      kind,
      label: presetMeta[kind].label,
      description: presetMeta[kind].description,
      reason,
      enabled,
      recommended: kind === recommendedKind
    };
  });
}
function validateDesigner(nodes: WorkflowNode[], edges: WorkflowEdge[], fields: RuntimeSchema["fields"], roles: DirectoryOption[], users: DirectoryOption[]) {
  const checks = buildDesignerChecks(nodes, edges, "1", fields, roles, users);
  const blocking = checks.filter(item => item.level === "error" && !item.ok);
  if (blocking.length) return blocking.map(item => `${item.label}：${item.detail}`);
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
function pickRole(roles: DirectoryOption[], keywords: string[], fallback: string) {
  return roles.find(role => keywords.some(keyword => role.label.includes(keyword) || role.value.includes(keyword)))?.value || fallback;
}
function uniqueNodeId(prefix: NodeType, nodes: WorkflowNode[]) {
  let index = nodes.length + 1;
  let id = `${prefix}_${index}`;
  const used = new Set(nodes.map(node => node.id));
  while (used.has(id)) {
    index += 1;
    id = `${prefix}_${index}`;
  }
  return id;
}
function linkMainRoute(nodes: WorkflowNode[]) {
  const start = nodes.find(node => node.type === "start") || nodes[0];
  const end = nodes.find(node => node.type === "end") || nodes[nodes.length - 1];
  if (!start || !end || start.id === end.id) return [];
  const middle = nodes.filter(node => node.id !== start.id && node.id !== end.id);
  const route = [start, ...middle, end];
  return route.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: route[index + 1].id
  }));
}
function buildPreview(nodes: WorkflowNode[], edges: WorkflowEdge[], roles: DirectoryOption[], users: DirectoryOption[]) {
  const path = buildMainPath(nodes, edges);
  const lines = path.map((node, index) => `${index + 1}. ${previewText(node, roles, users)}`);
  const conditionalEdges = edges.filter(edge => edge.condition);
  conditionalEdges.forEach(edge => {
    lines.push(`条件规则：当 ${conditionText(edge.condition!, [])} 时，从「${nodeName(edge.from, nodes)}」流向「${nodeName(edge.to, nodes)}」。`);
  });
  return lines;
}
function rehearseWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[], data: Record<string, string>, roles: DirectoryOption[], users: DirectoryOption[]) {
  const warnings: string[] = [];
  const steps: Array<{
    node: WorkflowNode;
    reason: string;
  }> = [];
  const start = nodes.find(node => node.type === "start") || nodes[0];
  let current = start;
  const seen = new Set<string>();
  while (current && !seen.has(current.id) && steps.length < 30) {
    steps.push({
      node: current,
      reason: rehearsalReason(current, roles, users)
    });
    seen.add(current.id);
    if (current.type === "end") break;
    const candidates = edges.filter(edge => edge.from === current.id);
    if (!candidates.length) {
      warnings.push(`步骤「${current.name}」没有后续规则`);
      break;
    }
    const matched = candidates.find(edge => edge.condition && evaluateCondition(edge.condition, data));
    const fallback = candidates.find(edge => !edge.condition);
    const nextEdge = matched || fallback || candidates[0];
    if (nextEdge.condition && !matched) {
      warnings.push(`条件「${conditionText(nextEdge.condition, [])}」未命中，彩排使用第一条可用规则`);
    }
    const next = nodes.find(node => node.id === nextEdge.to);
    if (!next) {
      warnings.push(`规则指向的步骤「${nextEdge.to}」不存在`);
      break;
    }
    current = next;
  }
  if (current && seen.has(current.id) && current.type !== "end") warnings.push("彩排检测到流程循环，请检查规则。");
  if (!steps.some(step => step.node.type === "approval")) warnings.push("彩排路径没有经过审批步骤。");
  return {
    steps,
    warnings
  };
}
function rehearsalReason(node: WorkflowNode, roles: DirectoryOption[], users: DirectoryOption[]) {
  if (node.type === "start") return "模拟提交申请";
  if (node.type === "approval") return `等待 ${assigneeText(node, roles, users)} 审批`;
  if (node.type === "condition") return "根据测试数据判断下一步";
  if (node.type === "cc") return `抄送给 ${assigneeText(node, roles, users)}`;
  return "流程结束";
}
function evaluateCondition(condition: NonNullable<WorkflowEdge["condition"]>, data: Record<string, string>) {
  const leftRaw = data[condition.field];
  const rightRaw = condition.value;
  const leftNumber = Number(leftRaw);
  const rightNumber = Number(rightRaw);
  const bothNumbers = Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && String(leftRaw).trim() !== "";
  const left = bothNumbers ? leftNumber : String(leftRaw ?? "");
  const right = bothNumbers ? rightNumber : String(rightRaw ?? "");
  if (condition.operator === "==") return left === right;
  if (condition.operator === "!=") return left !== right;
  if (condition.operator === ">") return bothNumbers ? leftNumber > rightNumber : String(left) > String(right);
  if (condition.operator === ">=") return bothNumbers ? leftNumber >= rightNumber : String(left) >= String(right);
  if (condition.operator === "<") return bothNumbers ? leftNumber < rightNumber : String(left) < String(right);
  if (condition.operator === "<=") return bothNumbers ? leftNumber <= rightNumber : String(left) <= String(right);
  if (condition.operator === "contains") return String(left).includes(String(right));
  if (condition.operator === "in") return Array.isArray(condition.value) ? condition.value.map(String).includes(String(left)) : String(condition.value).split(",").map(v => v.trim()).includes(String(left));
  if (condition.operator === "notIn") return Array.isArray(condition.value) ? !condition.value.map(String).includes(String(left)) : !String(condition.value).split(",").map(v => v.trim()).includes(String(left));
  return false;
}
function previewText(node: WorkflowNode, roles: DirectoryOption[], users: DirectoryOption[]) {
  if (node.type === "start") return "员工提交申请并填写表单。";
  if (node.type === "approval") return `由「${assigneeText(node, roles, users)}」处理「${node.name}」。`;
  if (node.type === "condition") return `系统判断「${node.name}」并选择后续步骤。`;
  if (node.type === "cc") return `抄送「${assigneeText(node, roles, users)}」知会。`;
  return "流程完成并归档。";
}
function assigneeText(node: WorkflowNode, roles: DirectoryOption[], users: DirectoryOption[]) {
  const config = node.config || {};
  if (config.assigneeType === "STARTER") return "发起人本人";
  if (config.assigneeType === "USER") {
    const selectedUsers = config.users || [];
    const labels = selectedUsers.map(id => users.find(user => user.value === String(id))?.label || `用户 ${id}`);
    return labels.length ? labels.join("、") : "未选择用户";
  }
  const role = config.roles?.[0] || "ROLE_SYSOPS";
  return roles.find(item => item.value === role)?.label || role;
}
function nodeName(id: string, nodes: WorkflowNode[]) {
  return nodes.find(node => node.id === id)?.name || id || "-";
}
function stepTypeText(type: NodeType) {
  const map: Record<NodeType, string> = {
    start: "发起",
    approval: "审批",
    condition: "条件",
    cc: "抄送",
    end: "完成"
  };
  return map[type];
}
function stepHint(node: WorkflowNode, roles: DirectoryOption[], users: DirectoryOption[]) {
  if (node.type === "approval" || node.type === "cc") return assigneeText(node, roles, users);
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
function checkBadgeClass(item: CheckItem) {
  if (item.ok) return s.badgeSuccess;
  if (item.level === "warn") return s.badgeWarning;
  return s.badgeDanger;
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
    GENERAL: "通用"
  };
  return category ? map[category] || category : "通用";
}
const layoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "280px minmax(440px, 1fr) 360px",
  gap: 12,
  alignItems: "start"
};
const panelStyle: React.CSSProperties = {
  padding: 16
};
const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12
};
const toolbarActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end"
};
const addBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12
};
const directoryHintStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 10,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)",
  color: "var(--text-secondary)",
  fontSize: 12,
  marginBottom: 12
};
const presetBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 10,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-card)",
  marginBottom: 12
};
const presetHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  color: "var(--text-secondary)",
  fontSize: 12
};
const presetGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 8
};
const presetButtonStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  textAlign: "left",
  padding: 10,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)",
  color: "var(--text-primary)"
};
const assistantBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 10,
  border: "1px solid var(--color-primary)",
  borderRadius: "var(--radius-md)",
  background: "var(--status-info-bg-light)",
  color: "var(--text-primary)",
  fontSize: 12,
  lineHeight: 1.6,
  marginBottom: 12
};
const assistantActionStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 8
};
const stepListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8
};
const stepButtonStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  textAlign: "left",
  padding: 12,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  cursor: "pointer"
};
const checkPanelStyle: React.CSSProperties = {
  padding: 14,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)",
  marginBottom: 14
};
const checkGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10
};
const checkItemStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  alignContent: "start",
  minHeight: 106,
  padding: 10,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  fontSize: 13,
  lineHeight: 1.5
};
const flowPreviewStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 8,
  overflowX: "auto",
  padding: "12px 2px 16px"
};
const previewItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0
};
const previewCardStyle: React.CSSProperties = {
  minWidth: 160,
  minHeight: 94,
  display: "grid",
  gap: 6,
  textAlign: "left",
  padding: 12,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  cursor: "pointer"
};
const arrowStyle: React.CSSProperties = {
  color: "var(--color-primary)",
  fontWeight: 900,
  fontSize: 18
};
const previewSummaryStyle: React.CSSProperties = {
  padding: 14,
  marginBottom: 14,
  background: "var(--bg-page)"
};
const summaryListStyle: React.CSSProperties = {
  margin: "10px 0 0",
  paddingLeft: 18,
  color: "var(--text-secondary)",
  fontSize: 13,
  lineHeight: 1.8
};
const rehearsalGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10
};
const rehearsalPathStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 12
};
const rehearsalStepStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  padding: 10,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-card)"
};
const edgeHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 10
};
const edgeListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8
};
const edgeButtonStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 24px 1fr",
  gap: 8,
  alignItems: "center",
  padding: 10,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  cursor: "pointer",
  textAlign: "left"
};
const formHintStyle: React.CSSProperties = {
  marginTop: 10,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 10,
  display: "grid",
  gap: 6,
  color: "var(--text-secondary)",
  fontSize: 12,
  lineHeight: 1.6
};
const fieldPoolStyle: React.CSSProperties = {
  marginTop: 10,
  display: "grid",
  gap: 8,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 10,
  background: "var(--bg-page)",
  color: "var(--text-secondary)",
  fontSize: 12,
  lineHeight: 1.5
};
const fieldChipGridStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap"
};
const fieldHelpStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: 12,
  lineHeight: 1.5
};
const smallButtonGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 8
};
const dividerStyle: React.CSSProperties = {
  border: 0,
  borderTop: "1px solid var(--border)",
  margin: "16px 0"
};
const textareaStyle: React.CSSProperties = {
  minHeight: 440,
  fontFamily: "monospace",
  marginBottom: 12
};