"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowDefinition } from "@/lib/workflow-api";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/workflow-templates";

const FLOW_TEMPLATES = WORKFLOW_TEMPLATES;

const CATEGORY_OPTIONS = ["财务", "采购", "合同", "人事", "仓储", "品控", "门店", "养殖", "物流", "通用"];

export default function WorkflowDefinitionsPage() {
  const [rows, setRows] = useState<WorkflowDefinition[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [source, setSource] = useState<WorkflowDefinition | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState(FLOW_TEMPLATES[0].key);
  const [form, setForm] = useState({ code: "", name: "", category: "", description: "" });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const template = useMemo(
    () => FLOW_TEMPLATES.find(item => item.key === selectedTemplate) || FLOW_TEMPLATES[0],
    [selectedTemplate],
  );

  const load = () => workflowApi.definitions().then(res => setRows(res.data || []));
  useEffect(() => { load(); }, []);

  function openFromTemplate(nextTemplate: WorkflowTemplate = FLOW_TEMPLATES[0]) {
    setSource(null);
    setSelectedTemplate(nextTemplate.key);
    setForm({
      code: makeUniqueCode(nextTemplate.code),
      name: nextTemplate.name,
      category: nextTemplate.category,
      description: nextTemplate.description,
    });
    setError("");
    setDrawerOpen(true);
  }

  function openFromExisting(row: WorkflowDefinition) {
    setSource(row);
    setForm({
      code: makeUniqueCode(`${row.code}_COPY`),
      name: `${row.name}（副本）`,
      category: row.category || "通用",
      description: row.description || `复制自 ${row.name}，可进入设计器调整审批节点。`,
    });
    setError("");
    setDrawerOpen(true);
  }

  function chooseTemplate(nextKey: string) {
    const next = FLOW_TEMPLATES.find(item => item.key === nextKey) || FLOW_TEMPLATES[0];
    setSelectedTemplate(next.key);
    setSource(null);
    setForm({
      code: makeUniqueCode(next.code),
      name: next.name,
      category: next.category,
      description: next.description,
    });
    setError("");
  }

  async function create() {
    const payload = {
      ...form,
      code: normalizeCode(form.code),
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
    };
    if (!payload.code || !payload.name) {
      setError("请填写流程名称；系统编码会自动生成，必要时可在高级设置中调整。");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (source) await workflowApi.cloneDefinition(source.id, payload);
      else {
        const formCode = makeUniqueCode(template.formCode);
        const createdForm = await workflowApi.createForm({
          code: formCode,
          name: template.formName,
          category: payload.category,
          description: template.formDescription,
        });
        const formVersion = await workflowApi.publishForm(createdForm.data.id, { schema_json: { fields: template.fields } });
        const formVersionId = Number((formVersion.data as { id?: number }).id);
        if (!formVersionId) throw new Error("表单版本发布失败，请稍后重试。");
        const created = await workflowApi.createDefinition(payload);
        await workflowApi.publishDefinition(created.data.id, {
          graph_json: buildTemplateGraph(payload.name, template),
          form_version_id: formVersionId,
        });
      }
      setDrawerOpen(false);
      setSource(null);
      setNotice(source ? "已复制流程，可进入设计器继续调整。" : "已创建并发布流程及配套表单，用户现在可以直接发起。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "创建流程失败");
    } finally {
      setLoading(false);
    }
  }

  async function generateIndustryTemplates() {
    setGenerating(true);
    setNotice("");
    setError("");
    try {
      const res = await workflowApi.generateIndustryTemplates();
      const data = res.data || {};
      setNotice(`已自动补齐行业模板：新增 ${data.createdDefinitions || 0} 个流程，新增 ${data.createdForms || 0} 个表单；已有模板会保留不覆盖。`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "生成行业模板失败");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <PageHeader title="流程定义" subtitle="日常查看和维护已定义流程，少量新增可从模板或现有流程复制" breadcrumb={["工作流", "流程定义"]} />

      <section className={s.card} style={{ marginBottom: 12 }}>
        <div className={s.cardBody} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          <div>
            <h3 className={s.cardTitle}>流程列表</h3>
            <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>大多数流程应先由管理员统一定义，业务人员只需要发起和审批。</p>
          </div>
          <div style={toolbarActionsStyle}>
            <button className={s.btnSecondary} disabled={generating} onClick={generateIndustryTemplates}>
              {generating ? "生成中..." : "AI生成行业模板"}
            </button>
            <button className={s.btnPrimary} onClick={() => openFromTemplate()}>新增流程</button>
          </div>
        </div>
      </section>
      {notice ? <div className={s.successBanner}>{notice}</div> : null}
      {error && !drawerOpen ? <div className={s.errorBanner}>{error}</div> : null}

      <section className={s.card}>
        <table className={s.table}>
          <thead><tr><th>流程名称</th><th>分类</th><th>状态</th><th>版本</th><th>操作</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.id}>
              <td>
                <strong>{row.name}</strong>
                <div style={codeStyle}>{row.code}</div>
              </td>
              <td>{categoryText(row.category)}</td>
              <td><span className={statusBadgeClass(row.status)}>{statusText(row.status)}</span></td>
              <td>{row.current_version_id || "-"}</td>
              <td>
                <div style={actionStyle}>
                  <Link href={`/workflow/designer/${row.id}`}>设计/发布</Link>
                  <button style={linkButtonStyle} onClick={() => openFromExisting(row)}>复制创建</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <RightDrawer
        open={drawerOpen}
        title={source ? "复制现有流程" : "新增流程"}
        width={640}
        onClose={() => setDrawerOpen(false)}
        footer={
          <div style={footerStyle}>
            <button className={s.btnSecondary} onClick={() => setDrawerOpen(false)}>取消</button>
            <button className={s.btnPrimary} disabled={loading} onClick={create}>{loading ? "创建中..." : "创建流程"}</button>
          </div>
        }
      >
        <div style={drawerStackStyle}>
          <section>
            <h4 style={sectionTitleStyle}>{source ? "复制来源" : "选择常用流程模板"}</h4>
            {source ? (
              <div style={selectedSourceStyle}>
                <strong>{source.name}</strong>
                <span>{source.category || "通用"} · {source.code}</span>
              </div>
            ) : (
              <div style={templateGridStyle}>
                {FLOW_TEMPLATES.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    style={item.key === template.key ? selectedTemplateStyle : templateStyle}
                    onClick={() => chooseTemplate(item.key)}
                  >
                    <strong>{item.name}</strong>
                    <span>{item.category}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h4 style={sectionTitleStyle}>基础信息</h4>
            <label style={labelStyle}>
              流程名称
              <input className={s.inp} value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
            </label>
            <label style={labelStyle}>
              业务分类
              <select className={s.inp} value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>
                {CATEGORY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              适用说明
              <textarea className={s.textarea} value={form.description} onChange={e=>setForm({...form, description:e.target.value})} />
            </label>
          </section>

          <details style={advancedStyle}>
            <summary>高级设置</summary>
            <label style={labelStyle}>
              系统编码
              <input className={s.inp} value={form.code} onChange={e=>setForm({...form, code:normalizeCode(e.target.value)})} />
            </label>
            <p style={hintStyle}>系统编码用于接口和数据存储，页面会自动生成，通常不需要修改。</p>
          </details>

          {error ? <div style={errorStyle}>{error}</div> : null}
        </div>
      </RightDrawer>
    </div>
  );
}

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_]/g, "");
}

function makeUniqueCode(base: string) {
  const stamp = new Date().toISOString().slice(2, 16).replace(/[-T:]/g, "");
  return normalizeCode(`${base}_${stamp}`);
}

function friendlyError(message: string) {
  if (message.includes("uppercase letters")) return "系统编码只能包含大写英文、数字、下划线。";
  if (message.includes("duplicate") || message.includes("unique")) return "这个流程编码已存在，请在高级设置中更换一个编码。";
  return message;
}

function statusText(status: string) {
  if (status === "ACTIVE") return "已启用";
  if (status === "DISABLED") return "已停用";
  return "草稿";
}

function statusBadgeClass(status: string) {
  if (status === "ACTIVE") return `${s.badge} ${s.badgeSuccess}`;
  if (status === "DISABLED") return `${s.badge} ${s.badgeDanger}`;
  return `${s.badge} ${s.badgeNeutral}`;
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
  return category ? map[category] || category : "-";
}

function buildTemplateGraph(flowName: string, template: WorkflowTemplate) {
  const approvals = template.approvals.length > 0
    ? template.approvals
    : [{ id: "biz_approval", name: `${template.category || "业务"}审批`, role: approvalRole(template.category) }];
  const nodes = [
    { id: "start", type: "start", name: "提交申请", x: 80, y: 140 },
    ...approvals.map((approval, index) => ({
      id: approval.id,
      type: "approval",
      name: approval.name,
      x: 320 + index * 240,
      y: 140,
      config: { assigneeType: "ROLE", roles: [approval.role] },
    })),
    { id: "end", type: "end", name: `${flowName}完成`, x: 320 + approvals.length * 240, y: 140 },
  ];
  return {
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1].id })),
  };
}

function approvalRole(category: string) {
  const map: Record<string, string> = {
    财务: "ROLE_FIN_CFO",
    采购: "ROLE_PRC_BUYER",
    合同: "ROLE_SYSOPS",
    人事: "ROLE_SYSOPS",
    仓储: "ROLE_WMS_MGR",
    品控: "ROLE_QA_MGR",
    门店: "ROLE_STORE_MGR",
    养殖: "ROLE_FARM_MGR",
    物流: "ROLE_LOG_MGR",
  };
  return map[category] || "ROLE_SYSOPS";
}

const toolbarActionsStyle: React.CSSProperties = { display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" };
const hintStyle: React.CSSProperties = { margin:0, color:"var(--text-secondary)", fontSize:13, lineHeight:1.6 };
const codeStyle: React.CSSProperties = { marginTop:4, color:"var(--text-secondary)", fontSize:12 };
const actionStyle: React.CSSProperties = { display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" };
const linkButtonStyle: React.CSSProperties = { border:0, background:"transparent", color:"var(--color-primary)", cursor:"pointer", padding:0 };
const drawerStackStyle: React.CSSProperties = { display:"grid", gap:20 };
const sectionTitleStyle: React.CSSProperties = { margin:"0 0 10px", fontSize:14 };
const templateGridStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:10 };
const templateStyle: React.CSSProperties = { minHeight:74, textAlign:"left", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", padding:12, cursor:"pointer", display:"grid", gap:6, color:"var(--text-primary)" };
const selectedTemplateStyle: React.CSSProperties = { ...templateStyle, borderColor:"var(--color-primary)", background:"var(--bg-muted)" };
const selectedSourceStyle: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:12, display:"grid", gap:6, background:"var(--bg-muted)" };
const labelStyle: React.CSSProperties = { display:"grid", gap:6, marginBottom:12, fontSize:13, color:"var(--text-secondary)" };
const advancedStyle: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:12 };
const errorStyle: React.CSSProperties = { color:"var(--color-danger)", fontSize:13 };
const footerStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10 };
