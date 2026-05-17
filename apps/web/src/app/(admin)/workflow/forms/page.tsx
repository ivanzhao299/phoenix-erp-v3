"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowForm } from "@/lib/workflow-api";
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-templates";

const FORM_TEMPLATES = WORKFLOW_TEMPLATES.map(template => ({
  key: template.key,
  name: template.formName,
  category: template.category,
  code: template.formCode,
  description: template.formDescription,
  fields: template.fields,
}));

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
      const created = await workflowApi.createForm(payload);
      await workflowApi.publishForm(created.data.id, { schema_json: { fields: template.fields } });
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

      <section className={s.card} style={{ marginBottom: 12 }}>
        <div className={s.cardBody} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          <div>
            <h3 className={s.cardTitle}>表单列表</h3>
            <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>表单用于承载流程里的基础数据，发布后可绑定到审批流程。</p>
          </div>
          <button className={s.btnPrimary} onClick={() => openFromTemplate()}>新增表单</button>
        </div>
      </section>

      <section className={s.card}>
        <table className={s.table}>
          <thead><tr><th>表单名称</th><th>分类</th><th>状态</th><th>版本</th><th>操作</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.id}>
              <td>
                <strong>{row.name}</strong>
                <div style={codeStyle}>{row.code}</div>
              </td>
              <td>{categoryText(row.category)}</td>
              <td><span className={statusBadgeClass(row.status)}>{statusText(row.status)}</span></td>
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
            <button className={s.btnSecondary} onClick={() => setDrawerOpen(false)}>取消</button>
            <button className={s.btnPrimary} disabled={loading} onClick={create}>{loading ? "创建中..." : "创建并发布表单"}</button>
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
            <p style={hintStyle}>选择模板后会自动带出字段并发布为可用版本，后续仍可进入设计器微调。</p>
          </section>

          <section>
            <h4 style={sectionTitleStyle}>基础信息</h4>
            <label style={labelStyle}>
              表单名称
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
  if (message.includes("duplicate") || message.includes("unique")) return "这个表单编码已存在，请在高级设置中更换一个编码。";
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

const hintStyle: React.CSSProperties = { margin:0, color:"var(--text-secondary)", fontSize:13, lineHeight:1.6 };
const codeStyle: React.CSSProperties = { marginTop:4, color:"var(--text-secondary)", fontSize:12 };
const drawerStackStyle: React.CSSProperties = { display:"grid", gap:20 };
const sectionTitleStyle: React.CSSProperties = { margin:"0 0 10px", fontSize:14 };
const templateGridStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:10 };
const templateStyle: React.CSSProperties = { minHeight:74, textAlign:"left", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", padding:12, cursor:"pointer", display:"grid", gap:6, color:"var(--text-primary)" };
const selectedTemplateStyle: React.CSSProperties = { ...templateStyle, borderColor:"var(--color-primary)", background:"var(--bg-muted)" };
const labelStyle: React.CSSProperties = { display:"grid", gap:6, marginBottom:12, fontSize:13, color:"var(--text-secondary)" };
const advancedStyle: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:12 };
const errorStyle: React.CSSProperties = { color:"var(--color-danger)", fontSize:13 };
const footerStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10 };
