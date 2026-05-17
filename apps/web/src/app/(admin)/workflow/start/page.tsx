"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { FormRenderer } from "@/components/workflow/FormRenderer";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowDefinition } from "@/lib/workflow-api";
import { dataSourceLabel } from "@/lib/workflow-data-catalog";

type RuntimeSchema = {
  fields?: Array<{ key: string; label: string; type: string; required?: boolean; [key: string]: unknown }>;
};

export default function WorkflowStartPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCode = searchParams.get("code") || "";
  const smartRequested = searchParams.get("smart") === "1";
  const autoSmartRef = useRef("");
  const [defs, setDefs] = useState<WorkflowDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("全部");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [schema, setSchema] = useState<RuntimeSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [smartFilling, setSmartFilling] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => defs.find(item => item.id === selectedId) || null,
    [defs, selectedId],
  );
  const categories = useMemo(() => {
    const names = defs.map(item => categoryText(item.category));
    return ["全部", ...Array.from(new Set(names))];
  }, [defs]);
  const filteredDefs = useMemo(() => {
    const word = keyword.trim().toLowerCase();
    return defs.filter(def => {
      const matchedCategory = category === "全部" || categoryText(def.category) === category;
      const haystack = `${def.name} ${def.code} ${def.description || ""} ${categoryText(def.category)}`.toLowerCase();
      return matchedCategory && (!word || haystack.includes(word));
    });
  }, [category, defs, keyword]);
  const requiredFields = useMemo(() => (schema?.fields || []).filter(field => field.required), [schema]);
  const completedRequired = requiredFields.filter(field => !isEmpty(formData[field.key])).length;
  const progressText = requiredFields.length ? `${completedRequired}/${requiredFields.length} 必填已完成` : "无必填项";
  const smartSummary = useMemo(() => buildSmartSummary(schema), [schema]);

  useEffect(() => {
    workflowApi.definitions()
      .then(res => {
        const active = (res.data || []).filter(item => item.status === "ACTIVE");
        const target = active.find(item => item.code === requestedCode) || active[0];
        setDefs(active);
        if (target) {
          setSelectedId(target.id);
          setTitle(target.name);
          setCategory(categoryText(target.category));
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : "流程加载失败"));
  }, [requestedCode]);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    void (async () => {
      await Promise.resolve();
      if (!alive) return;
      setLoading(true);
      try {
        const res = await workflowApi.definitionDesigner(selectedId);
        if (!alive) return;
        const formSchema = res.data.form_schema_json as RuntimeSchema | undefined;
        setSchema(formSchema && Array.isArray(formSchema.fields) ? formSchema : null);
        setFormData({});
      } catch {
        if (alive) setSchema(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  function chooseDefinition(def: WorkflowDefinition) {
    setSelectedId(def.id);
    setTitle(def.name);
    setNote("");
    setSchema(null);
    setFormData({});
    setError("");
  }

  async function submit() {
    if (!selectedId) {
      setError("请选择要发起的流程。");
      return;
    }
    if (!title.trim()) {
      setError("请填写申请标题。");
      return;
    }
    const missing = (schema?.fields || []).filter(field => field.required && isEmpty(formData[field.key]));
    if (missing.length > 0) {
      setError(`请填写必填项：${missing.map(field => field.label).join("、")}`);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const payload = schema ? formData : { note };
      const res = await workflowApi.start({
        definition_id: selectedId,
        title: title.trim(),
        form_data: payload,
      });
      router.push(`/workflow/instances/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "发起流程失败");
    } finally {
      setSubmitting(false);
    }
  }

  const fillSmartDraft = useCallback(async () => {
    if (!selected || !schema?.fields?.length) {
      setError("请先选择一个已绑定表单的流程。");
      return;
    }
    setSmartFilling(true);
    setError("");
    try {
      const next = { ...formData };
      for (const field of schema.fields) {
        if (!isEmpty(next[field.key])) continue;
        next[field.key] = await smartFieldValue(field, selected);
      }
      setFormData(next);
      if (!title.trim()) setTitle(`${selected.name} - ${formatDate(new Date())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "智能生成草稿失败");
    } finally {
      setSmartFilling(false);
    }
  }, [formData, schema, selected, title]);

  useEffect(() => {
    if (!smartRequested || !selected || !schema?.fields?.length || loading || smartFilling) return;
    const key = `${selected.id}:${schema.fields.length}`;
    if (autoSmartRef.current === key) return;
    autoSmartRef.current = key;
    void fillSmartDraft();
  }, [fillSmartDraft, loading, schema, selected, smartFilling, smartRequested]);

  function clearDraft() {
    setFormData({});
    setNote("");
    setError("");
  }

  return (
    <div>
      <PageHeader title="发起申请" subtitle="选择一个已启用流程，填写业务表单并提交审批" breadcrumb={["工作流", "发起申请"]} />

      {smartRequested ? (
        <div style={smartEntryBannerStyle}>
          <div>
            <span className={`${s.badge} ${s.badgeSuccess}`}>AI 智能发起</span>
            <strong>已按常用业务场景进入发起页</strong>
            <span>系统会自动选择流程并生成草稿，字段值仍可人工修改。</span>
          </div>
          <Link href="/workflow" className={s.btnSecondary}>返回工作流中心</Link>
        </div>
      ) : null}

      <div style={layoutStyle}>
        <section className={s.card}>
          <div className={s.cardBody}>
            <div style={sectionHeaderStyle}>
              <h3 className={s.cardTitle}>选择流程</h3>
              <span className={`${s.badge} ${s.badgeNeutral}`}>{defs.length} 个可发起</span>
            </div>
            <div style={filterStackStyle}>
              <input
                className={s.inp}
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="搜索流程名称、编码或业务场景"
              />
              <div style={tabsStyle}>
                {categories.map(item => (
                  <button
                    key={item}
                    type="button"
                    className={`${s.tabPill} ${item === category ? s.tabPillActive : ""}`}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div style={flowListStyle}>
              {filteredDefs.map(def => (
                <button
                  key={def.id}
                  type="button"
                  style={def.id === selectedId ? selectedFlowStyle : flowStyle}
                  onClick={() => chooseDefinition(def)}
                >
                  <strong>{def.name}</strong>
                  <span>{categoryText(def.category)} · {def.description || "已配置审批流程"}</span>
                </button>
              ))}
              {defs.length === 0 ? (
                <div className={s.emptyState}>
                  <div className={s.emptyStateText}>
                    暂无可发起流程。请先由管理员到 <Link href="/workflow/definitions">流程定义</Link> 发布流程。
                  </div>
                </div>
              ) : null}
              {defs.length > 0 && filteredDefs.length === 0 ? (
                <div className={s.emptyState}>
                  <div className={s.emptyStateText}>没有找到匹配流程。</div>
                  <div className={s.emptyStateHint}>换一个关键词或分类试试。</div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className={s.card}>
          <div className={s.cardBody}>
            <div style={sectionHeaderStyle}>
              <div>
                <h3 className={s.cardTitle}>{selected ? selected.name : "申请内容"}</h3>
                <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>{selected ? selected.description || "填写信息后提交审批" : "先从左侧选择流程"}</p>
              </div>
              <div style={toolbarActionsStyle}>
                {selected ? <span className={`${s.badge} ${schema ? s.badgeSuccess : s.badgeWarning}`}>{schema ? progressText : "通用说明"}</span> : null}
                <Link href="/workflow/instances" className={s.btnSecondary}>查看我发起的</Link>
              </div>
            </div>

            {selected && schema ? (
              <div style={smartPanelStyle}>
                <div>
                  <strong>智能填单助手</strong>
                  <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>
                    按当前流程自动补全常用字段，数据库字段会优先选取可用业务数据，生成后仍可手动修改。
                  </p>
                </div>
                <div style={smartMetaStyle}>
                  <span className={s.badge}>{smartSummary}</span>
                  <button className={s.btnSecondary} disabled={smartFilling} onClick={clearDraft}>清空</button>
                  <button className={s.btnPrimary} disabled={smartFilling} onClick={fillSmartDraft}>
                    {smartFilling ? "生成中..." : "智能生成草稿"}
                  </button>
                </div>
              </div>
            ) : null}

            <label className={s.field}>
              <span className={s.lbl}>申请标题</span>
              <input className={s.inp} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：5月门店物料采购申请" />
            </label>

            {selected ? (
              <div className={s.infoBanner}>
                {schema ? "该流程已绑定业务表单，提交后会自动进入审批节点。" : "该流程暂未绑定专用表单，系统会以申请说明作为审批内容。"}
              </div>
            ) : null}

            {loading ? (
              <div className={s.emptyState}><div className={s.emptyStateText}>正在加载表单...</div></div>
            ) : schema ? (
              <div style={{ marginBottom: 14 }}>
                <FormRenderer schema={schema} value={formData} onChange={setFormData} />
              </div>
            ) : (
              <label className={s.field}>
                <span className={s.lbl}>申请说明</span>
                <textarea className={s.textarea} value={note} onChange={e=>setNote(e.target.value)} placeholder="这个流程暂未绑定专用表单，可先填写申请说明。" />
              </label>
            )}

            {error ? <div className={s.errorBanner}>{error}</div> : null}

            <div style={footerStyle}>
              <Link href="/workflow/tasks/todo" className={s.btnSecondary}>我的待办</Link>
              <button className={s.btnPrimary} disabled={!selectedId || submitting} onClick={submit}>
                {submitting ? "提交中..." : "提交申请"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || value === "";
}

function friendlyError(message: string) {
  if (message.includes("field") && message.includes("required")) return "请完整填写必填项后再提交。";
  if (message.includes("workflow definition not active")) return "该流程还未启用，请联系管理员发布。";
  return message;
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

function buildSmartSummary(schema: RuntimeSchema | null) {
  const fields = schema?.fields || [];
  if (!fields.length) return "暂无表单";
  const references = fields.filter(field => field.type === "reference");
  const required = fields.filter(field => field.required);
  if (references.length) return `${required.length} 个必填 · ${references.map(field => dataSourceLabel(String(field.dataSource || ""))).join("、")}`;
  return `${required.length} 个必填 · ${fields.length} 个字段`;
}

async function smartFieldValue(field: NonNullable<RuntimeSchema["fields"]>[number], def: WorkflowDefinition) {
  if (field.type === "reference" && field.dataSource) {
    const res = await workflowApi.previewDataSource({ code: field.dataSource });
    const first = (res.data || [])[0] as { value?: string | number } | undefined;
    return first?.value ?? "";
  }
  if ((field.type === "select" || field.type === "radio") && Array.isArray(field.options) && field.options[0]) {
    return field.options[0].value;
  }
  if (field.type === "checkbox") return true;
  if (field.type === "date") return formatDate(addDays(new Date(), 7));
  if (field.type === "datetime") return formatDateTime(field.key.includes("end") ? addHours(new Date(), 10) : addHours(new Date(), 2));
  if (field.type === "amount" || field.key.toLowerCase().includes("amount")) return defaultAmount(def.code, field.key);
  if (field.type === "number") return defaultNumber(def.code, field.key);
  if (field.type === "textarea") return defaultLongText(def.code, field.key, field.label);
  if (field.type === "readonly") return "";
  return defaultShortText(def.code, field.key, field.label);
}

function defaultAmount(code: string, key: string) {
  const lower = `${code}_${key}`.toLowerCase();
  if (lower.includes("loss")) return 300;
  if (lower.includes("contract")) return 12000;
  if (lower.includes("budget")) return 1800;
  return 500;
}

function defaultNumber(code: string, key: string) {
  const lower = `${code}_${key}`.toLowerCase();
  if (lower.includes("discount")) return 95;
  if (lower.includes("quantity") || lower.includes("qty")) return 10;
  return 1;
}

function defaultShortText(code: string, key: string, label: string) {
  const lower = `${code}_${key}_${label}`.toLowerCase();
  if (lower.includes("invoice") || lower.includes("合同编号")) return `HT-${formatCompactDate(new Date())}`;
  if (lower.includes("batch")) return `BT-${formatCompactDate(new Date())}`;
  if (lower.includes("shipment")) return `YS-${formatCompactDate(new Date())}`;
  if (lower.includes("medicine")) return "常规兽药/疫苗";
  if (lower.includes("house")) return "A-01";
  if (lower.includes("payee") || lower.includes("counterparty")) return "示例供应商";
  return `${label || "业务信息"}示例`;
}

function defaultLongText(code: string, key: string, label: string) {
  const lower = `${code}_${key}_${label}`.toLowerCase();
  if (lower.includes("reason")) return "根据当前业务安排提交申请，请相关负责人审批。";
  if (lower.includes("proposal")) return "建议按标准流程处理，并在完成后回传处理结果。";
  if (lower.includes("risk")) return "暂未发现重大风险，需按合同和财务制度复核。";
  if (lower.includes("description")) return "现场已完成初步核对，详细情况请见本次申请内容。";
  return "系统已生成初稿，请根据实际业务情况补充或调整。";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return date.toISOString().slice(0, 16);
}

function formatCompactDate(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

const layoutStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"320px minmax(0, 1fr)", gap:12, alignItems:"start" };
const smartEntryBannerStyle: React.CSSProperties = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:14, padding:14, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", marginBottom:12 };
const sectionHeaderStyle: React.CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:14 };
const filterStackStyle: React.CSSProperties = { display:"grid", gap:10, marginBottom:12 };
const tabsStyle: React.CSSProperties = { display:"flex", gap:6, flexWrap:"wrap" };
const toolbarActionsStyle: React.CSSProperties = { display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", justifyContent:"flex-end" };
const smartPanelStyle: React.CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, padding:12, border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-page)", marginBottom:14 };
const smartMetaStyle: React.CSSProperties = { display:"flex", alignItems:"center", justifyContent:"flex-end", flexWrap:"wrap", gap:8 };
const flowListStyle: React.CSSProperties = { display:"grid", gap:8 };
const flowStyle: React.CSSProperties = { textAlign:"left", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", color:"var(--text-primary)", padding:12, cursor:"pointer", display:"grid", gap:6 };
const selectedFlowStyle: React.CSSProperties = { ...flowStyle, borderColor:"var(--color-primary)", background:"var(--bg-muted)" };
const footerStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10 };
