"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { FormRenderer } from "@/components/workflow/FormRenderer";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi, type WorkflowDefinition } from "@/lib/workflow-api";

type RuntimeSchema = {
  fields?: Array<{ key: string; label: string; type: string; required?: boolean; [key: string]: unknown }>;
};

export default function WorkflowStartPage() {
  const router = useRouter();
  const [defs, setDefs] = useState<WorkflowDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [schema, setSchema] = useState<RuntimeSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => defs.find(item => item.id === selectedId) || null,
    [defs, selectedId],
  );

  useEffect(() => {
    workflowApi.definitions()
      .then(res => {
        const active = (res.data || []).filter(item => item.status === "ACTIVE");
        setDefs(active);
        if (active[0]) {
          setSelectedId(active[0].id);
          setTitle(active[0].name);
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : "流程加载失败"));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSchema(null);
      setFormData({});
      return;
    }
    setLoading(true);
    workflowApi.definitionDesigner(selectedId)
      .then(res => {
        const formSchema = res.data.form_schema_json as RuntimeSchema | undefined;
        setSchema(formSchema && Array.isArray(formSchema.fields) ? formSchema : null);
        setFormData({});
      })
      .catch(() => setSchema(null))
      .finally(() => setLoading(false));
  }, [selectedId]);

  function chooseDefinition(def: WorkflowDefinition) {
    setSelectedId(def.id);
    setTitle(def.name);
    setNote("");
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

  return (
    <div>
      <PageHeader title="发起申请" subtitle="选择一个已启用流程，填写业务表单并提交审批" breadcrumb={["工作流", "发起申请"]} />

      <div style={layoutStyle}>
        <section className={s.card}>
          <div className={s.cardBody}>
            <div style={sectionHeaderStyle}>
              <h3 className={s.cardTitle}>选择流程</h3>
              <span className={`${s.badge} ${s.badgeNeutral}`}>{defs.length} 个可发起</span>
            </div>
            <div style={flowListStyle}>
              {defs.map(def => (
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
              <Link href="/workflow/instances" className={s.btnSecondary}>查看我发起的</Link>
            </div>

            <label className={s.field}>
              <span className={s.lbl}>申请标题</span>
              <input className={s.inp} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：5月门店物料采购申请" />
            </label>

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

const layoutStyle: React.CSSProperties = { display:"grid", gridTemplateColumns:"320px minmax(0, 1fr)", gap:12, alignItems:"start" };
const sectionHeaderStyle: React.CSSProperties = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:14 };
const flowListStyle: React.CSSProperties = { display:"grid", gap:8 };
const flowStyle: React.CSSProperties = { textAlign:"left", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", background:"var(--bg-card)", color:"var(--text-primary)", padding:12, cursor:"pointer", display:"grid", gap:6 };
const selectedFlowStyle: React.CSSProperties = { ...flowStyle, borderColor:"var(--color-primary)", background:"var(--bg-muted)" };
const footerStyle: React.CSSProperties = { display:"flex", justifyContent:"flex-end", gap:10 };
