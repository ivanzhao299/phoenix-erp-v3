"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowFormField } from "@/lib/workflow-api";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/workflow-templates";
import u from "@/styles/uix-utils.module.css";
type RoleOption = {
  label: string;
  value: string;
};
type ApprovalStep = {
  id: string;
  name: string;
  role: string;
};
type BuildStage = "scene" | "form" | "route" | "finish";
const FALLBACK_ROLES: RoleOption[] = [{
  label: "系统管理员",
  value: "ROLE_SYSOPS"
}, {
  label: "管理员",
  value: "ROLE_ADMIN"
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
}];
const FIELD_PALETTE: WorkflowFormField[] = [{
  key: "amount",
  label: "申请金额",
  type: "amount",
  required: true
}, {
  key: "reason",
  label: "申请原因",
  type: "textarea",
  required: true
}, {
  key: "product_code",
  label: "商品/物料",
  type: "reference",
  dataSource: "MST_PRODUCTS"
}, {
  key: "store_code",
  label: "门店/组织",
  type: "reference",
  dataSource: "MST_STORES"
}, {
  key: "start_time",
  label: "开始时间",
  type: "datetime"
}, {
  key: "end_time",
  label: "结束时间",
  type: "datetime"
}, {
  key: "need_date",
  label: "期望日期",
  type: "date"
}, {
  key: "remark",
  label: "备注说明",
  type: "textarea"
}];
export default function WorkflowBuilderPage() {
  const [stage, setStage] = useState<BuildStage>("scene");
  const [templateKey, setTemplateKey] = useState(WORKFLOW_TEMPLATES[0]?.key || "");
  const template = useMemo(() => WORKFLOW_TEMPLATES.find(item => item.key === templateKey) || WORKFLOW_TEMPLATES[0], [templateKey]);
  const [flowName, setFlowName] = useState(template?.name || "新的审批流程");
  const [category, setCategory] = useState(template?.category || "通用");
  const [description, setDescription] = useState(template?.description || "");
  const [fields, setFields] = useState<WorkflowFormField[]>(template?.fields || []);
  const [steps, setSteps] = useState<ApprovalStep[]>(template?.approvals || [{
    id: "approval_1",
    name: "负责人审批",
    role: "ROLE_SYSOPS"
  }]);
  const [ccRole, setCcRole] = useState("");
  const [roles, setRoles] = useState<RoleOption[]>(FALLBACK_ROLES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    definitionId: number;
    formId: number;
    code: string;
  } | null>(null);
  const [customField, setCustomField] = useState({
    label: "",
    type: "text"
  });
  useEffect(() => {
    workflowApi.previewDataSource({
      code: "SYS_ROLES"
    }).then(res => {
      const next = (res.data || []).map(row => ({
        label: String(row.label || row.value || ""),
        value: String(row.value || "")
      })).filter(row => row.label && row.value);
      if (next.length) setRoles(next);
    }).catch(() => {});
  }, []);
  function useTemplate(next: WorkflowTemplate) {
    setTemplateKey(next.key);
    setFlowName(next.name);
    setCategory(next.category);
    setDescription(next.description);
    setFields(next.fields);
    setSteps(next.approvals.length ? next.approvals : [{
      id: "approval_1",
      name: `${next.category}审批`,
      role: "ROLE_SYSOPS"
    }]);
    setCcRole("");
    setStage("form");
    setResult(null);
    setError("");
  }
  function toggleField(field: WorkflowFormField) {
    setFields(current => current.some(item => item.key === field.key) ? current.filter(item => item.key !== field.key) : [...current, {
      ...field
    }]);
  }
  function updateField(key: string, patch: Partial<WorkflowFormField>) {
    setFields(current => current.map(item => item.key === key ? {
      ...item,
      ...patch
    } : item));
  }
  function addCustomField() {
    const label = customField.label.trim();
    if (!label) return;
    const key = toFieldKey(label);
    if (fields.some(item => item.key === key)) {
      setError("这个字段已经存在，可以直接在字段清单里调整。");
      return;
    }
    setFields(current => [...current, {
      key,
      label,
      type: customField.type,
      required: false
    }]);
    setCustomField({
      label: "",
      type: "text"
    });
    setError("");
  }
  function addStep() {
    setSteps(current => [...current, {
      id: `approval_${current.length + 1}`,
      name: `第 ${current.length + 1} 级审批`,
      role: roles[0]?.value || "ROLE_SYSOPS"
    }]);
  }
  function updateStep(id: string, patch: Partial<ApprovalStep>) {
    setSteps(current => current.map(item => item.id === id ? {
      ...item,
      ...patch
    } : item));
  }
  function removeStep(id: string) {
    setSteps(current => current.length <= 1 ? current : current.filter(item => item.id !== id));
  }
  async function build() {
    if (!flowName.trim()) {
      setError("请先填写流程名称。");
      return;
    }
    if (fields.length === 0) {
      setError("至少保留一个表单字段。");
      return;
    }
    if (steps.length === 0) {
      setError("至少保留一个审批步骤。");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const suffix = String(Date.now()).slice(-6);
      const baseCode = `${toCode(flowName)}_${suffix}`;
      const form = await workflowApi.createForm({
        code: `${baseCode}_FORM`,
        name: `${flowName}表单`,
        category,
        description: `${flowName}自动搭建表单`
      });
      const formVersion = await workflowApi.publishForm(form.data.id, {
        schema_json: {
          fields
        }
      });
      const definition = await workflowApi.createDefinition({
        code: baseCode,
        name: flowName,
        category,
        description
      });
      await workflowApi.publishDefinition(definition.data.id, {
        graph_json: buildGraph(flowName, steps, ccRole),
        form_version_id: Number(formVersion.data.id)
      });
      setResult({
        definitionId: definition.data.id,
        formId: form.data.id,
        code: baseCode
      });
      setStage("finish");
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "流程生成失败");
    } finally {
      setBusy(false);
    }
  }
  return <div>
      <PageHeader title="流程搭建工作区" subtitle="按业务场景、表单字段、审批路线三步搭建流程，全程不用写代码" breadcrumb={["工作流", "流程搭建工作区"]} actions={<Link href="/workflow/definitions" className={s.btnSecondary}>流程列表</Link>} />

      <section className={`${s.card} ${u.mb12}`}>
        <div className={s.cardBody} style={stepsHeaderStyle}>
          {[["scene", "1", "选场景"], ["form", "2", "配表单"], ["route", "3", "排审批"], ["finish", "4", "生成使用"]].map(([key, no, label]) => <button key={key} type="button" className={stage === key ? s.tabPillActive : s.tabPill} onClick={() => setStage(key as BuildStage)}>
              {no}. {label}
            </button>)}
        </div>
      </section>

      {error ? <div className={`${s.errorBanner} ${u.mb12}`}>{error}</div> : null}

      {stage === "scene" ? <SceneStep template={template} onUseTemplate={useTemplate} /> : null}

      {stage === "form" ? <FormStep flowName={flowName} category={category} description={description} fields={fields} customField={customField} onFlowName={setFlowName} onCategory={setCategory} onDescription={setDescription} onToggleField={toggleField} onUpdateField={updateField} onCustomField={setCustomField} onAddCustomField={addCustomField} onNext={() => setStage("route")} /> : null}

      {stage === "route" ? <RouteStep flowName={flowName} steps={steps} roles={roles} ccRole={ccRole} busy={busy} onAddStep={addStep} onUpdateStep={updateStep} onRemoveStep={removeStep} onCcRole={setCcRole} onBuild={build} /> : null}

      {stage === "finish" ? <FinishStep result={result} /> : null}
    </div>;
}
function SceneStep({
  template,
  onUseTemplate
}: {
  template: WorkflowTemplate;
  onUseTemplate: (template: WorkflowTemplate) => void;
}) {
  return <section>
      <div style={sceneGridStyle}>
        {WORKFLOW_TEMPLATES.map(item => <button key={item.key} type="button" style={item.key === template.key ? selectedSceneStyle : sceneStyle} onClick={() => onUseTemplate(item)}>
            <span className={s.badge}>{item.category}</span>
            <strong>{item.name}</strong>
            <span>{item.description}</span>
            <small>{item.fields.length} 个表单字段 · {Math.max(1, item.approvals.length)} 个审批步骤</small>
          </button>)}
      </div>
    </section>;
}
function FormStep(props: {
  flowName: string;
  category: string;
  description: string;
  fields: WorkflowFormField[];
  customField: {
    label: string;
    type: string;
  };
  onFlowName: (value: string) => void;
  onCategory: (value: string) => void;
  onDescription: (value: string) => void;
  onToggleField: (field: WorkflowFormField) => void;
  onUpdateField: (key: string, patch: Partial<WorkflowFormField>) => void;
  onCustomField: (value: {
    label: string;
    type: string;
  }) => void;
  onAddCustomField: () => void;
  onNext: () => void;
}) {
  return <div style={workbenchStyle}>
      <section className={s.card}>
        <div className={s.cardBody}>
          <h3 className={s.cardTitle} style={titleStyle}>流程基本信息</h3>
          <div style={formGridStyle}>
            <label style={labelStyle}>流程名称<input className={s.inp} value={props.flowName} onChange={e => props.onFlowName(e.target.value)} /></label>
            <label style={labelStyle}>业务分类<input className={s.inp} value={props.category} onChange={e => props.onCategory(e.target.value)} /></label>
            <label style={{
            ...labelStyle,
            gridColumn: "1 / -1"
          }}>说明<textarea className={s.textarea} value={props.description} onChange={e => props.onDescription(e.target.value)} /></label>
          </div>

          <h3 className={s.cardTitle} style={{
          ...titleStyle,
          marginTop: 18
        }}>常用字段，一点就加</h3>
          <div style={chipGridStyle}>
            {FIELD_PALETTE.map(field => {
            const active = props.fields.some(item => item.key === field.key);
            return <button key={field.key} type="button" className={active ? s.tabPillActive : s.tabPill} onClick={() => props.onToggleField(field)}>
                  {active ? "已加入 " : "+ "}{field.label}
                </button>;
          })}
          </div>

          <div style={customFieldStyle}>
            <input className={s.inp} placeholder="新增字段名称，如：合同编号" value={props.customField.label} onChange={e => props.onCustomField({
            ...props.customField,
            label: e.target.value
          })} />
            <select className={s.inp} value={props.customField.type} onChange={e => props.onCustomField({
            ...props.customField,
            type: e.target.value
          })}>
              <option value="text">单行文本</option>
              <option value="textarea">多行说明</option>
              <option value="number">数字</option>
              <option value="amount">金额</option>
              <option value="date">日期</option>
              <option value="datetime">日期时间</option>
            </select>
            <button type="button" className={s.btnSecondary} onClick={props.onAddCustomField}>加入字段</button>
          </div>
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardBody}>
          <div style={sectionHeaderStyle}>
            <div>
              <h3 className={s.cardTitle}>表单预览</h3>
              <p className={`${s.modalDesc} ${u.mt4}`}>字段会按这个顺序出现在发起申请页面。</p>
            </div>
            <button type="button" className={s.btnPrimary} onClick={props.onNext}>下一步：排审批</button>
          </div>
          <div style={fieldListStyle}>
            {props.fields.map(field => <div key={field.key} style={fieldItemStyle}>
                <div>
                  <strong>{field.label}</strong>
                  <small>{fieldTypeText(field)} · {field.required ? "必填" : "选填"}</small>
                </div>
                <div style={fieldActionsStyle}>
                  <label style={checkStyle}><input type="checkbox" checked={Boolean(field.required)} onChange={e => props.onUpdateField(field.key, {
                  required: e.target.checked
                })} /> 必填</label>
                  <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => props.onToggleField(field)}>移除</button>
                </div>
              </div>)}
            {props.fields.length === 0 ? <div className={s.emptyState}><div className={s.emptyStateText}>请选择至少一个字段。</div></div> : null}
          </div>
        </div>
      </section>
    </div>;
}
function RouteStep(props: {
  flowName: string;
  steps: ApprovalStep[];
  roles: RoleOption[];
  ccRole: string;
  busy: boolean;
  onAddStep: () => void;
  onUpdateStep: (id: string, patch: Partial<ApprovalStep>) => void;
  onRemoveStep: (id: string) => void;
  onCcRole: (value: string) => void;
  onBuild: () => void;
}) {
  return <div style={routeLayoutStyle}>
      <section className={s.card}>
        <div className={s.cardBody}>
          <div style={sectionHeaderStyle}>
            <div>
              <h3 className={s.cardTitle}>审批路线</h3>
              <p className={`${s.modalDesc} ${u.mt4}`}>像排队一样排审批步骤，从上到下依次流转。</p>
            </div>
            <button type="button" className={s.btnSecondary} onClick={props.onAddStep}>添加一级审批</button>
          </div>

          <div style={approvalListStyle}>
            {props.steps.map((step, index) => <div key={step.id} style={approvalItemStyle}>
                <span style={nodeNoStyle}>{index + 1}</span>
                <input className={s.inp} value={step.name} onChange={e => props.onUpdateStep(step.id, {
              name: e.target.value
            })} />
                <select className={s.inp} value={step.role} onChange={e => props.onUpdateStep(step.id, {
              role: e.target.value
            })}>
                  {props.roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
                <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} disabled={props.steps.length <= 1} onClick={() => props.onRemoveStep(step.id)}>移除</button>
              </div>)}
          </div>

          <h3 className={s.cardTitle} style={{
          ...titleStyle,
          marginTop: 18
        }}>抄送备案</h3>
          <select className={s.inp} value={props.ccRole} onChange={e => props.onCcRole(e.target.value)}>
            <option value="">不设置抄送</option>
            {props.roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardBody}>
          <h3 className={s.cardTitle} style={titleStyle}>所见即所得路线图</h3>
          <div style={timelineStyle}>
            <RouteNode label="发起申请" desc={props.flowName || "填写表单并提交"} tone="start" />
            {props.steps.map(step => <RouteNode key={step.id} label={step.name} desc={roleLabel(props.roles, step.role)} />)}
            {props.ccRole ? <RouteNode label="抄送备案" desc={roleLabel(props.roles, props.ccRole)} tone="cc" /> : null}
            <RouteNode label="流程完成" desc="自动归档，可在实例中追踪" tone="end" />
          </div>
          <button type="button" className={s.btnPrimary} style={{
          width: "100%",
          marginTop: 16
        }} disabled={props.busy} onClick={props.onBuild}>
            {props.busy ? "正在生成..." : "一键生成并发布"}
          </button>
        </div>
      </section>
    </div>;
}
function RouteNode({
  label,
  desc,
  tone
}: {
  label: string;
  desc: string;
  tone?: "start" | "cc" | "end";
}) {
  const badge = tone === "start" ? s.badgeSuccess : tone === "end" ? s.badgeNeutral : tone === "cc" ? s.badgeWarning : s.badgeInfo;
  return <div style={routeNodeStyle}>
      <span className={`${s.badge} ${badge}`}>{tone === "start" ? "开始" : tone === "end" ? "结束" : tone === "cc" ? "抄送" : "审批"}</span>
      <strong>{label}</strong>
      <small>{desc}</small>
    </div>;
}
function FinishStep({
  result
}: {
  result: {
    definitionId: number;
    formId: number;
    code: string;
  } | null;
}) {
  return <section className={s.card}>
      <div className={s.cardBody} style={finishStyle}>
        <span className={`${s.badge} ${s.badgeSuccess}`}>已生成</span>
        <h3 style={finishTitleStyle}>流程已经可以使用</h3>
        <p className={s.modalDesc} style={{
        margin: 0
      }}>系统已经自动创建表单、发布流程版本，并把编码生成好了。后续可以继续去高级设计器微调。</p>
        {result ? <div className={`${s.infoGrid3} ${u.w100}`}>
            <Info label="流程编码" value={result.code} />
            <Info label="流程 ID" value={String(result.definitionId)} />
            <Info label="表单 ID" value={String(result.formId)} />
          </div> : null}
        <div style={finishActionsStyle}>
          {result ? <Link href={`/workflow/start?code=${result.code}`} className={s.btnPrimary}>马上发起试用</Link> : null}
          {result ? <Link href={`/workflow/designer/${result.definitionId}`} className={s.btnSecondary}>高级微调</Link> : null}
          <Link href="/workflow/definitions" className={s.btnSecondary}>回到流程列表</Link>
        </div>
      </div>
    </section>;
}
function Info({
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
function buildGraph(flowName: string, steps: ApprovalStep[], ccRole: string) {
  const approvalNodes = steps.map((step, index) => ({
    id: step.id,
    type: "approval",
    name: step.name || `第 ${index + 1} 级审批`,
    x: 320 + index * 220,
    y: 140,
    config: {
      assigneeType: "ROLE",
      roles: [step.role]
    }
  }));
  const ccNode = ccRole ? [{
    id: "cc_record",
    type: "cc",
    name: "抄送备案",
    x: 320 + approvalNodes.length * 220,
    y: 140,
    config: {
      roles: [ccRole]
    }
  }] : [];
  const nodes = [{
    id: "start",
    type: "start",
    name: "提交申请",
    x: 80,
    y: 140
  }, ...approvalNodes, ...ccNode, {
    id: "end",
    type: "end",
    name: `${flowName || "流程"}完成`,
    x: 320 + (approvalNodes.length + ccNode.length) * 220,
    y: 140
  }];
  const edges = nodes.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: nodes[index + 1].id
  }));
  return {
    nodes,
    edges
  };
}
function toCode(value: string) {
  const seed = value.trim() || "CUSTOM_WORKFLOW";
  const ascii = seed.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  return /^[A-Z]/.test(ascii) && ascii.length > 2 ? ascii.slice(0, 54) : "CUSTOM_WORKFLOW";
}
function toFieldKey(label: string) {
  const ascii = label.trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return ascii && /^[a-zA-Z_]/.test(ascii) ? ascii.slice(0, 40) : `field_${Date.now().toString().slice(-5)}`;
}
function fieldTypeText(field: WorkflowFormField) {
  const map: Record<string, string> = {
    text: "文本",
    textarea: "多行说明",
    number: "数字",
    amount: "金额",
    date: "日期",
    datetime: "日期时间",
    select: "下拉选项",
    radio: "单选",
    checkbox: "勾选",
    reference: "引用数据"
  };
  return field.dataSource ? `${map[field.type] || field.type} · ${field.dataSource}` : map[field.type] || field.type;
}
function roleLabel(roles: RoleOption[], value: string) {
  return roles.find(role => role.value === value)?.label || value || "未选择";
}
function friendlyError(message: string) {
  if (message.includes("duplicate key") || message.includes("already exists")) return "流程或表单编码已存在，请稍后再试或换一个名称。";
  if (message.includes("workflow admin")) return "当前账号没有工作流管理员权限。";
  return message;
}
const stepsHeaderStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap"
};
const sceneGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12
};
const sceneStyle: React.CSSProperties = {
  textAlign: "left",
  minHeight: 154,
  padding: 16,
  display: "grid",
  gap: 8,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  cursor: "pointer"
};
const selectedSceneStyle: React.CSSProperties = {
  ...sceneStyle,
  borderColor: "var(--color-primary)",
  background: "color-mix(in srgb, var(--color-primary) 8%, var(--bg-card))"
};
const workbenchStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "420px minmax(0, 1fr)",
  gap: 12,
  alignItems: "start"
};
const routeLayoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 420px",
  gap: 12,
  alignItems: "start"
};
const titleStyle: React.CSSProperties = {
  margin: 0
};
const formGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "1fr 1fr",
  marginTop: 12
};
const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  color: "var(--text-secondary)",
  fontSize: 13
};
const chipGridStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12
};
const customFieldStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 140px auto",
  gap: 8,
  marginTop: 12
};
const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12
};
const fieldListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8
};
const fieldItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-page)"
};
const fieldActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap"
};
const checkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "var(--text-secondary)",
  fontSize: 13
};
const approvalListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10
};
const approvalItemStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1.2fr) minmax(180px, 1fr) auto",
  gap: 8,
  alignItems: "center",
  padding: 10,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-page)"
};
const nodeNoStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "var(--color-primary)",
  color: "var(--text-on-dark)",
  fontWeight: 800
};
const timelineStyle: React.CSSProperties = {
  display: "grid",
  gap: 10
};
const routeNodeStyle: React.CSSProperties = {
  position: "relative",
  display: "grid",
  gap: 6,
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-page)"
};
const finishStyle: React.CSSProperties = {
  minHeight: 320,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: 14
};
const finishTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  color: "var(--text-primary)"
};
const finishActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "center",
  flexWrap: "wrap"
};