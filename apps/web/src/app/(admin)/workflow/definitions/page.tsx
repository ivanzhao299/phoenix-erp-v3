"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowDefinition } from "@/lib/workflow-api";

type FlowTemplate = {
  key: string;
  name: string;
  category: string;
  description: string;
  code: string;
};

const FLOW_TEMPLATES: FlowTemplate[] = [
  { key: "expense", name: "费用报销审批", category: "财务", code: "EXPENSE_APPROVAL", description: "员工提交费用报销，部门负责人和财务复核后归档。" },
  { key: "purchase", name: "采购申请审批", category: "采购", code: "PURCHASE_APPROVAL", description: "采购需求提交后，由部门、采购、财务逐级审批。" },
  { key: "payment", name: "付款申请审批", category: "财务", code: "PAYMENT_APPROVAL", description: "供应商付款、预付款、尾款支付的审批流程。" },
  { key: "contract", name: "合同审批流程", category: "合同", code: "CONTRACT_APPROVAL", description: "合同起草、法务/财务复核、负责人审批后生效。" },
  { key: "leave", name: "请假申请审批", category: "人事", code: "LEAVE_APPROVAL", description: "员工请假提交，直属主管审批，人事备案。" },
  { key: "stock_adjust", name: "库存调整审批", category: "仓储", code: "STOCK_ADJUST_APPROVAL", description: "库存盘盈盘亏、调账、报损等调整事项审批。" },
  { key: "quality_exception", name: "质量异常处理", category: "品控", code: "QUALITY_EXCEPTION_APPROVAL", description: "质量异常上报、责任确认、处理方案审批和关闭。" },
  { key: "store_discount", name: "门店折扣审批", category: "门店", code: "STORE_DISCOUNT_APPROVAL", description: "门店临时折扣、促销让利、特殊价格审批。" },
  { key: "farm_medicine", name: "养殖用药审批", category: "养殖", code: "FARM_MEDICINE_APPROVAL", description: "养殖场用药、疫苗、防疫处理等关键事项审批。" },
  { key: "logistics_exception", name: "运输异常处理", category: "物流", code: "LOGISTICS_EXCEPTION_APPROVAL", description: "运输延误、破损、温控异常、补偿方案等处理审批。" },
];

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

  function openFromTemplate(nextTemplate = FLOW_TEMPLATES[0]) {
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
        const created = await workflowApi.createDefinition(payload);
        await workflowApi.publishDefinition(created.data.id, { graph_json: buildTemplateGraph(payload.name, payload.category) });
      }
      setDrawerOpen(false);
      setSource(null);
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

function buildTemplateGraph(flowName: string, category: string) {
  const role = approvalRole(category);
  return {
    nodes: [
      { id: "start", type: "start", name: "提交申请", x: 80, y: 140 },
      { id: "dept_approval", type: "approval", name: "部门负责人审批", x: 320, y: 140, config: { assigneeType: "STARTER" } },
      { id: "biz_approval", type: "approval", name: `${category || "业务"}审批`, x: 560, y: 140, config: { assigneeType: "ROLE", roles: [role] } },
      { id: "end", type: "end", name: `${flowName}完成`, x: 800, y: 140 },
    ],
    edges: [
      { from: "start", to: "dept_approval" },
      { from: "dept_approval", to: "biz_approval" },
      { from: "biz_approval", to: "end" },
    ],
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

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16, marginBottom:12 };
const toolbarStyle: React.CSSProperties = { ...panelStyle, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 };
const toolbarActionsStyle: React.CSSProperties = { display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" };
const titleStyle: React.CSSProperties = { margin: "0 0 6px", fontSize: 16 };
const hintStyle: React.CSSProperties = { margin:0, color:"var(--text-secondary)", fontSize:13, lineHeight:1.6 };
const buttonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700, cursor:"pointer" };
const secondaryButtonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", color:"var(--text-primary)", fontWeight:600, cursor:"pointer" };
const noticeStyle: React.CSSProperties = { border:"1px solid rgba(16,185,129,0.35)", background:"rgba(16,185,129,0.08)", color:"var(--text-primary)", borderRadius:"var(--radius-md)", padding:"10px 12px", fontSize:13, marginBottom:12 };
const errorBannerStyle: React.CSSProperties = { border:"1px solid rgba(239,68,68,0.35)", background:"rgba(239,68,68,0.08)", color:"var(--color-danger)", borderRadius:"var(--radius-md)", padding:"10px 12px", fontSize:13, marginBottom:12 };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
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
const inputStyle: React.CSSProperties = { height:38, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", padding:"0 10px", color:"var(--text-primary)" };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight:82, padding:"10px", resize:"vertical" };
const advancedStyle: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:12 };
const errorStyle: React.CSSProperties = { color:"var(--color-danger)", fontSize:13 };
const footerStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10 };
