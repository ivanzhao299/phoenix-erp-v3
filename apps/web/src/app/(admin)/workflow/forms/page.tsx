"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { workflowApi, type WorkflowForm } from "@/lib/workflow-api";

type FormTemplate = {
  key: string;
  name: string;
  category: string;
  code: string;
  description: string;
};

const FORM_TEMPLATES: FormTemplate[] = [
  { key: "expense", name: "费用报销单", category: "财务", code: "EXPENSE_FORM", description: "包含报销金额、费用类型、事由、附件等常用字段。" },
  { key: "purchase", name: "采购申请单", category: "采购", code: "PURCHASE_REQUEST_FORM", description: "包含采购物料、数量、预算、供应商建议和到货时间。" },
  { key: "payment", name: "付款申请单", category: "财务", code: "PAYMENT_REQUEST_FORM", description: "包含收款方、付款金额、合同/发票、付款原因。" },
  { key: "contract", name: "合同审批单", category: "合同", code: "CONTRACT_REVIEW_FORM", description: "包含合同主体、金额、期限、风险说明和附件。" },
  { key: "leave", name: "请假申请单", category: "人事", code: "LEAVE_REQUEST_FORM", description: "包含假期类型、开始时间、结束时间、请假原因。" },
  { key: "stock_adjust", name: "库存调整单", category: "仓储", code: "STOCK_ADJUST_FORM", description: "包含仓库、物料、批次、调整数量、调整原因。" },
  { key: "quality_exception", name: "质量异常单", category: "品控", code: "QUALITY_EXCEPTION_FORM", description: "包含异常类型、批次、问题描述、处理建议和责任部门。" },
  { key: "store_discount", name: "门店折扣申请单", category: "门店", code: "STORE_DISCOUNT_FORM", description: "包含门店、折扣类型、让利金额、活动周期和原因。" },
  { key: "farm_medicine", name: "养殖用药申请单", category: "养殖", code: "FARM_MEDICINE_FORM", description: "包含养殖场、药品、批次、用药对象、剂量和兽医意见。" },
  { key: "logistics_exception", name: "运输异常处理单", category: "物流", code: "LOGISTICS_EXCEPTION_FORM", description: "包含运单、异常类型、损失金额、责任方和处理方案。" },
];

const CATEGORY_OPTIONS = ["财务", "采购", "合同", "人事", "仓储", "品控", "门店", "养殖", "物流", "通用"];

export default function WorkflowFormsPage() {
  const [rows, setRows] = useState<WorkflowForm[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(FORM_TEMPLATES[0].key);
  const [form, setForm] = useState({ code: "", name: "", category: "", description: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const template = useMemo(
    () => FORM_TEMPLATES.find(item => item.key === selectedTemplate) || FORM_TEMPLATES[0],
    [selectedTemplate],
  );

  const load = () => workflowApi.forms().then(res => setRows(res.data || []));
  useEffect(() => { load(); }, []);

  function openFromTemplate(nextTemplate = FORM_TEMPLATES[0]) {
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

  function chooseTemplate(nextKey: string) {
    const next = FORM_TEMPLATES.find(item => item.key === nextKey) || FORM_TEMPLATES[0];
    setSelectedTemplate(next.key);
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
      setError("请填写表单名称；系统编码会自动生成，必要时可在高级设置中调整。");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await workflowApi.createForm(payload);
      setDrawerOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "创建表单失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="表单定义" subtitle="维护常用业务表单，新增时优先从模板复制再微调字段" breadcrumb={["工作流", "表单定义"]} />

      <section style={toolbarStyle}>
        <div>
          <h3 style={titleStyle}>表单列表</h3>
          <p style={hintStyle}>表单用于承载流程里的基础数据，发布后可绑定到审批流程。</p>
        </div>
        <button style={buttonStyle} onClick={() => openFromTemplate()}>新增表单</button>
      </section>

      <section style={panelStyle}>
        <table style={tableStyle}>
          <thead><tr><th>表单名称</th><th>分类</th><th>状态</th><th>版本</th><th>操作</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.id}>
              <td>
                <strong>{row.name}</strong>
                <div style={codeStyle}>{row.code}</div>
              </td>
              <td>{categoryText(row.category)}</td>
              <td>{statusText(row.status)}</td>
              <td>{row.current_version_id || "-"}</td>
              <td><Link href={`/workflow/form-designer/${row.id}`}>设计/发布</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <RightDrawer
        open={drawerOpen}
        title="新增表单"
        width={620}
        onClose={() => setDrawerOpen(false)}
        footer={
          <div style={footerStyle}>
            <button style={secondaryButtonStyle} onClick={() => setDrawerOpen(false)}>取消</button>
            <button style={buttonStyle} disabled={loading} onClick={create}>{loading ? "创建中..." : "创建表单"}</button>
          </div>
        }
      >
        <div style={drawerStackStyle}>
          <section>
            <h4 style={sectionTitleStyle}>选择常用表单模板</h4>
            <div style={templateGridStyle}>
              {FORM_TEMPLATES.map(item => (
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
          </section>

          <section>
            <h4 style={sectionTitleStyle}>基础信息</h4>
            <label style={labelStyle}>
              表单名称
              <input style={inputStyle} value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
            </label>
            <label style={labelStyle}>
              业务分类
              <select style={inputStyle} value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>
                {CATEGORY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              适用说明
              <textarea style={textareaStyle} value={form.description} onChange={e=>setForm({...form, description:e.target.value})} />
            </label>
          </section>

          <details style={advancedStyle}>
            <summary>高级设置</summary>
            <label style={labelStyle}>
              系统编码
              <input style={inputStyle} value={form.code} onChange={e=>setForm({...form, code:normalizeCode(e.target.value)})} />
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
  if (message.includes("duplicate") || message.includes("unique")) return "这个表单编码已存在，请在高级设置中更换一个编码。";
  return message;
}

function statusText(status: string) {
  if (status === "ACTIVE") return "已启用";
  if (status === "DISABLED") return "已停用";
  return "草稿";
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

const panelStyle: React.CSSProperties = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16, marginBottom:12 };
const toolbarStyle: React.CSSProperties = { ...panelStyle, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 };
const titleStyle: React.CSSProperties = { margin: "0 0 6px", fontSize: 16 };
const hintStyle: React.CSSProperties = { margin:0, color:"var(--text-secondary)", fontSize:13, lineHeight:1.6 };
const buttonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:0, borderRadius:"var(--radius-md)", background:"var(--color-primary)", color:"#fff", fontWeight:700, cursor:"pointer" };
const secondaryButtonStyle: React.CSSProperties = { height:36, padding:"0 16px", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", color:"var(--text-primary)", fontWeight:600, cursor:"pointer" };
const tableStyle: React.CSSProperties = { width:"100%", borderCollapse:"collapse" };
const codeStyle: React.CSSProperties = { marginTop:4, color:"var(--text-secondary)", fontSize:12 };
const drawerStackStyle: React.CSSProperties = { display:"grid", gap:20 };
const sectionTitleStyle: React.CSSProperties = { margin:"0 0 10px", fontSize:14 };
const templateGridStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:10 };
const templateStyle: React.CSSProperties = { minHeight:74, textAlign:"left", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", padding:12, cursor:"pointer", display:"grid", gap:6, color:"var(--text-primary)" };
const selectedTemplateStyle: React.CSSProperties = { ...templateStyle, borderColor:"var(--color-primary)", background:"var(--bg-muted)" };
const labelStyle: React.CSSProperties = { display:"grid", gap:6, marginBottom:12, fontSize:13, color:"var(--text-secondary)" };
const inputStyle: React.CSSProperties = { height:38, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-muted)", padding:"0 10px", color:"var(--text-primary)" };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight:82, padding:"10px", resize:"vertical" };
const advancedStyle: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:12 };
const errorStyle: React.CSSProperties = { color:"var(--color-danger)", fontSize:13 };
const footerStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10 };
