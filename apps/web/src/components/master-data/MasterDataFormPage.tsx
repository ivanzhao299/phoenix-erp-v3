"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Panel } from "@/components/design-system";
import {
  primaryActionButton, secondaryActionButton, formLabel, inlineAlert,
  drawerHeroBox, drawerHeroLabel, drawerHeroCodeValue, drawerHeroNameValue,
} from "@/components/design-system/cockpit-styles";
import request from "@/lib/api-client";
import { saveAndReturn } from "@/lib/list-refresh";
import { useLanguage } from "@/contexts/LanguageContext";
import { renderMdFieldInput, multilingualNameFields, type MdField } from "./MasterDataRuntimePanel";

/**
 * g200p: MasterDataFormPage — 主数据"新建/编辑"全屏路由页(替代字段多于 8 的抽屉)。
 * 按 MdField.group 分 Panel 分组渲染,顶部 PageHeader,底部 sticky 操作栏。
 *
 * 用法(在 `<type>/new/page.tsx` 中):
 *   <MasterDataFormPage type="customer" title="客户" codeKey="customer_no" nameKey="customer_name"
 *     fields={CUSTOMER_FIELDS} listRoute="/master-data/customers" mode="create" />
 */
export interface MasterDataFormPageProps {
  type: string;
  title: string;
  codeKey: string;
  nameKey: string;
  fields: MdField[];
  /** 取消/保存成功后跳回的列表页路由 */
  listRoute: string;
  /** 模式:create(新建) / edit(编辑,需要 initialRow) */
  mode: "create" | "edit";
  /** edit 模式必传:从 detail 页或 list 拿到的当前行 */
  initialRow?: Record<string, any>;
}

export function MasterDataFormPage(props: MasterDataFormPageProps) {
  const { type, title, codeKey, nameKey, fields, listRoute, mode, initialRow } = props;
  const { t, translateLiteral } = useLanguage();
  const router = useRouter();
  const [form, setForm] = useState<Record<string, any>>(initialRow ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // task #25：多语言类型在末尾追加英文/老挝文名称字段（单独分组"多语言名称"成 Panel）；
  //   已在页面 fields 里配过的语言键不重复注入（如 products 已有 product_name_lo）
  const allFields = useMemo(() => {
    const have = new Set(fields.map(f => f.key));
    return [...fields, ...multilingualNameFields(type, nameKey).filter(f => !have.has(f.key))];
  }, [fields, type, nameKey]);

  // 按 group 分组(无 group 字段归入"基本信息")
  const groups = useMemo(() => {
    const order: string[] = [];
    const buckets: Record<string, MdField[]> = {};
    const DEFAULT = "基本信息";
    allFields.forEach(f => {
      const g = f.group ?? DEFAULT;
      if (!buckets[g]) { buckets[g] = []; order.push(g); }
      buckets[g].push(f);
    });
    return order.map(g => ({ name: g, fields: buckets[g] }));
  }, [fields]);

  // initialRow 异步加载场景(edit 模式)
  useEffect(() => { if (initialRow) setForm({ ...initialRow }); }, [initialRow]);

  const onCancel = () => router.push(listRoute);

  const onSave = async () => {
    setError("");
    for (const f of fields) {
      if (f.required && !form[f.key]) { setError(`${t('ui.请填写:','请填写:')}${translateLiteral(f.label)}`); return; }
    }
    setSaving(true);
    try {
      if (mode === "create") {
        await request(`/master-data/runtime/${type}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
        });
      } else {
        const resp = await request<{ pendingChange?: boolean; message?: string }>(
          `/master-data/runtime/${type}/${initialRow?.[codeKey]}`,
          { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) },
        );
        if (resp?.pendingChange) setNotice(resp.message || t('ui.关键字段变更已提交审批,通过后生效。','关键字段变更已提交审批,通过后生效。'));
      }
      saveAndReturn(listRoute, router);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('ui.保存失败','保存失败'));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ paddingBottom: 56 /* sticky footer 留位 */ }}>
      <PageHeader
        title={mode === "create" ? `${t('ui.新增','新增')}${translateLiteral(title)}` : `${t('ui.编辑','编辑')}${translateLiteral(title)}`}
        subtitle={mode === "create" ? t('ui.完整建档 · 编码自动生成','完整建档 · 编码自动生成') : `${t('ui.编辑','编辑')} ${initialRow?.[codeKey] ?? ""}`}
        breadcrumb={[t('ui.主数据中心','主数据中心'), `${translateLiteral(title)}${t('ui.中心','中心')}`, mode === "create" ? t('ui.新增','新增') : t('ui.编辑','编辑')]}
        actions={
          <button onClick={onCancel} style={{ ...secondaryActionButton, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={14} /> {t('ui.返回列表','返回列表')}
          </button>
        }
      />

      {/* g200p:紧凑布局 — maxWidth 1200 + Panel 间隔 10 + 3 列网格,目标整页 viewport 可见 */}
      <div style={{ padding: "0 24px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* hero:编辑显编码,新建显紧凑提示 */}
        {mode === "edit" && initialRow ? (
          <div style={{ ...drawerHeroBox, marginBottom: 0, padding: "10px 14px" }}>
            <div>
              <div style={drawerHeroLabel}>{translateLiteral(title)}{t('ui.编码','编码')}</div>
              <div style={drawerHeroCodeValue}>{initialRow[codeKey]}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={drawerHeroLabel}>{t('ui.名称','名称')}</div>
              <div style={drawerHeroNameValue}>{String(initialRow[nameKey] ?? form[nameKey] ?? "—")}</div>
            </div>
          </div>
        ) : (
          <div style={{ ...inlineAlert("info"), padding: "6px 12px", fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>{t('ui.提示','提示')}</span>
            <span style={{ marginLeft: 6 }}>{t('ui.编码将在保存时自动生成,无需手填','编码将在保存时自动生成,无需手填')}</span>
          </div>
        )}

        {error && <div style={{ ...inlineAlert("danger"), padding: "6px 12px", fontSize: 12 }}>{error}</div>}
        {notice && <div style={{ ...inlineAlert("warning"), padding: "6px 12px", fontSize: 12 }}>{notice}</div>}

        {/* 按 group 分 Panel — bodyPadding 12 + grid 3 列 + gap 10/16 紧凑化 */}
        {groups.map(g => (
          <Panel key={g.name} title={translateLiteral(g.name)} bodyPadding={12}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 16px" }}>
              {g.fields.map(f => (
                <div key={f.key}>
                  <label style={{ ...formLabel, marginBottom: 4 }}>
                    {translateLiteral(f.label)}{f.required && <span style={{ color: "var(--status-danger)", marginLeft: 4 }}>*</span>}
                  </label>
                  {renderMdFieldInput(f, form, setForm, t, translateLiteral)}
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      {/* 底部 sticky 操作栏 — 紧凑高度 */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0,
        background: "var(--bg-card)", borderTop: "1px solid var(--border)",
        padding: "10px 24px", display: "flex", justifyContent: "flex-end", gap: 10,
        zIndex: 100,
      }}>
        <button onClick={onCancel} style={secondaryActionButton}>{t('ui.取消','取消')}</button>
        <button onClick={onSave} disabled={saving} style={{ ...primaryActionButton, display: "inline-flex", alignItems: "center", gap: 6, opacity: saving ? 0.6 : 1 }}>
          <Save size={14} /> {saving ? t('ui.保存中…','保存中…') : t('ui.保存','保存')}
        </button>
      </div>
    </div>
  );
}

export default MasterDataFormPage;
