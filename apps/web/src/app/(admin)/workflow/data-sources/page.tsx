"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";
import { workflowApi } from "@/lib/workflow-api";
import { WORKFLOW_DATA_CATALOG, dataSourceConfig } from "@/lib/workflow-data-catalog";
import u from "@/styles/uix-utils.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
type DataSourceRow = Record<string, unknown>;
type PreviewRow = {
  value?: string | number;
  label?: string | number;
};
type DataSourceMetadata = {
  available?: boolean;
  rowCount?: number;
  columns?: Array<{
    key?: string;
    type?: string;
    nullable?: boolean;
  }>;
  missing?: string[];
  refreshedAt?: string;
  error?: string;
  table?: string;
  valueField?: string;
  labelField?: string;
  statusField?: string;
};
type FieldSuggestion = {
  key?: string;
  label?: string;
  type?: string;
  dataSource?: string;
  required?: boolean;
  reason?: string;
};
type GeneratedLinkSet = {
  title: string;
  start?: string;
  designer?: string;
  formDesigner?: string;
  list?: string;
};
type HealthState = {
  status: "idle" | "checking" | "ok" | "empty" | "error";
  count?: number;
  message?: string;
  sample?: PreviewRow[];
};
export default function WorkflowDataSourcesPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<DataSourceRow[]>([]);
  const [selectedCode, setSelectedCode] = useState(WORKFLOW_DATA_CATALOG[0].code);
  const [previewCode, setPreviewCode] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [suggestionCode, setSuggestionCode] = useState("");
  const [fieldSuggestions, setFieldSuggestions] = useState<FieldSuggestion[]>([]);
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLinkSet | null>(null);
  const [health, setHealth] = useState<Record<string, HealthState>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const selectedCatalog = useMemo(() => WORKFLOW_DATA_CATALOG.find(item => item.code === selectedCode) || WORKFLOW_DATA_CATALOG[0], [selectedCode]);
  const existingByCode = useMemo(() => new Map(rows.map(row => [String(row.code), row])), [rows]);
  const selectedExisting = existingByCode.get(selectedCatalog.code);
  const selectedMetadata = metadataOf(selectedExisting);
  const existingCodes = useMemo(() => new Set(rows.map(row => String(row.code))), [rows]);
  const missingCount = useMemo(() => WORKFLOW_DATA_CATALOG.filter(item => !existingCodes.has(item.code)).length, [existingCodes]);
  const healthSummary = useMemo(() => {
    const states = rows.map(row => health[String(row.code)]?.status || "idle");
    return {
      ok: states.filter(item => item === "ok").length,
      empty: states.filter(item => item === "empty").length,
      error: states.filter(item => item === "error").length
    };
  }, [health, rows]);
  const metadataSummary = useMemo(() => {
    const metas = rows.map(row => metadataOf(row));
    return {
      available: metas.filter(meta => meta?.available).length,
      columns: metas.reduce((sum, meta) => sum + (meta?.columns?.length || 0), 0)
    };
  }, [rows]);
  const checkRows = useCallback(async (targetRows: DataSourceRow[]) => {
    const activeRows = targetRows.filter(row => String(row.status || "ACTIVE") === "ACTIVE");
    if (!activeRows.length) return;
    setHealth(prev => ({
      ...prev,
      ...Object.fromEntries(activeRows.map(row => [String(row.code), {
        status: "checking" as const
      }]))
    }));
    await Promise.all(activeRows.map(async row => {
      const code = String(row.code);
      try {
        const res = await workflowApi.previewDataSource({
          code
        });
        const data = (res.data || []) as PreviewRow[];
        setHealth(prev => ({
          ...prev,
          [code]: {
            status: data.length ? "ok" : "empty",
            count: data.length,
            sample: data.slice(0, 3)
          }
        }));
      } catch (err) {
        setHealth(prev => ({
          ...prev,
          [code]: {
            status: "error",
            message: err instanceof Error ? friendlyError(err.message) : t('ui.预览失败','预览失败')
          }
        }));
      }
    }));
  }, []);
  useEffect(() => {
    let alive = true;
    workflowApi.dataSources().then(res => {
      if (!alive) return;
      const next = res.data || [];
      setRows(next);
      void checkRows(next);
    }).catch(err => {
      if (alive) setError(err instanceof Error ? friendlyError(err.message) : t('ui.数据源加载失败','数据源加载失败'));
    });
    return () => {
      alive = false;
    };
  }, [checkRows]);
  async function load() {
    const res = await workflowApi.dataSources();
    const next = res.data || [];
    setRows(next);
    return next;
  }
  async function syncDefaults() {
    setBusy(true);
    setMsg("");
    setError("");
    setGeneratedLinks(null);
    try {
      await workflowApi.syncDefaultDataSources();
      const next = await load();
      setMsg(t('ui.标准数据源已补齐，表单设计器可以直接引用用户、角色、组织和业务资料。','标准数据源已补齐，表单设计器可以直接引用用户、角色、组织和业务资料。'));
      await checkRows(next);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : t('ui.同步标准数据源失败','同步标准数据源失败'));
    } finally {
      setBusy(false);
    }
  }
  async function refreshMetadata() {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await workflowApi.refreshDataSourceMetadata();
      const next = res.data || [];
      setRows(next);
      setMsg(t('ui.字段元数据已自动刷新，新增字段和缺失字段会在下方列表体现。','字段元数据已自动刷新，新增字段和缺失字段会在下方列表体现。'));
      await checkRows(next);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : t('ui.刷新字段元数据失败','刷新字段元数据失败'));
    } finally {
      setBusy(false);
    }
  }
  async function createFromCatalog() {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      await workflowApi.createDataSource({
        code: selectedCatalog.code,
        name: selectedCatalog.name,
        source_type: selectedCatalog.source_type,
        config_json: dataSourceConfig(selectedCatalog)
      });
      const next = await load();
      setMsg(`${t('ui.已创建数据源：','已创建数据源：')}${selectedCatalog.name}`);
      await checkRows(next);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : t('ui.创建数据源失败','创建数据源失败'));
    } finally {
      setBusy(false);
    }
  }
  async function show(code: string) {
    setPreviewCode(code);
    setError("");
    try {
      const res = await workflowApi.previewDataSource({
        code
      });
      const data = (res.data || []) as PreviewRow[];
      setPreview(data);
      setHealth(prev => ({
        ...prev,
        [code]: {
          status: data.length ? "ok" : "empty",
          count: data.length,
          sample: data.slice(0, 3)
        }
      }));
    } catch (err) {
      setPreview([]);
      setHealth(prev => ({
        ...prev,
        [code]: {
          status: "error",
          message: err instanceof Error ? friendlyError(err.message) : t('ui.预览失败','预览失败')
        }
      }));
      setError(err instanceof Error ? friendlyError(err.message) : t('ui.数据源预览失败','数据源预览失败'));
    }
  }
  async function loadFieldSuggestions(code: string) {
    setSuggestionCode(code);
    setError("");
    try {
      const res = await workflowApi.dataSourceFieldSuggestions(code);
      const data = res.data || {};
      setFieldSuggestions((Array.isArray(data.fields) ? data.fields : []) as FieldSuggestion[]);
      if (data.metadata) {
        setRows(prev => prev.map(row => String(row.code) === code ? {
          ...row,
          metadata_json: data.metadata
        } : row));
      }
    } catch (err) {
      setFieldSuggestions([]);
      setError(err instanceof Error ? friendlyError(err.message) : t('ui.生成字段建议失败','生成字段建议失败'));
    }
  }
  async function createFormFromSelectedSource() {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await workflowApi.createFormFromDataSource({
        sourceCode: selectedCatalog.code,
        name: `${selectedCatalog.name}自动表单`,
        category: "通用"
      });
      const data = res.data || {};
      const form = data.form as {
        id?: number;
        name?: string;
      } | undefined;
      const links = data.links as {
        designer?: string;
        forms?: string;
      } | undefined;
      setMsg(`${t('ui.已生成表单：','已生成表单：')}${String(form?.name || selectedCatalog.name)}${t('ui.，可进入表单定义继续设计/发布。','，可进入表单定义继续设计/发布。')}`);
      setGeneratedLinks({
        title: t('ui.表单已生成','表单已生成'),
        formDesigner: links?.designer || (form?.id ? `/workflow/form-designer/${form.id}` : undefined),
        list: links?.forms || "/workflow/forms"
      });
      await loadFieldSuggestions(selectedCatalog.code);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : t('ui.生成表单失败','生成表单失败'));
    } finally {
      setBusy(false);
    }
  }
  async function createWorkflowFromSelectedSource() {
    setBusy(true);
    setMsg("");
    setError("");
    setGeneratedLinks(null);
    try {
      const res = await workflowApi.createDefinitionFromDataSource({
        sourceCode: selectedCatalog.code,
        name: `${selectedCatalog.name}自动审批流程`,
        category: "通用",
        approvalRole: "ROLE_FIN_CFO"
      });
      const data = res.data || {};
      const definition = data.definition as {
        id?: number;
        name?: string;
      } | undefined;
      const links = data.links as {
        start?: string;
        designer?: string;
        formDesigner?: string;
        definitions?: string;
      } | undefined;
      setMsg(`${t('ui.已生成流程：','已生成流程：')}${String(definition?.name || selectedCatalog.name)}${t('ui.，用户可在流程发起页选择使用。','，用户可在流程发起页选择使用。')}`);
      setGeneratedLinks({
        title: t('ui.流程包已生成','流程包已生成'),
        start: links?.start || (definition ? `/workflow/start?code=${selectedCatalog.code}_AUTO_WORKFLOW` : undefined),
        designer: links?.designer || (definition?.id ? `/workflow/designer/${definition.id}` : undefined),
        formDesigner: links?.formDesigner,
        list: links?.definitions || "/workflow/definitions"
      });
      await loadFieldSuggestions(selectedCatalog.code);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : t('ui.生成流程失败','生成流程失败'));
    } finally {
      setBusy(false);
    }
  }
  return <div>
      <PageHeader title={t('ui.工作流数据源','工作流数据源')} subtitle={t('ui.把用户、角色、组织和业务资料包装成表单可用的动态引用控件','把用户、角色、组织和业务资料包装成表单可用的动态引用控件')} breadcrumb={[t('ui.工作流','工作流'), t('ui.数据源','数据源')]} />

      <div className={s.statsRow}>
        <div className={s.statCard}>
          <div className={s.statLabel}>{t('ui.标准目录','标准目录')}</div>
          <div className={s.statValue}>{WORKFLOW_DATA_CATALOG.length}</div>
          <div className={s.statSub}>{missingCount ? `${t('ui.待补齐','待补齐')} ${missingCount} ${t('ui.个','个')}` : t('ui.已补齐','已补齐')}</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>{t('ui.已启用数据源','已启用数据源')}</div>
          <div className={s.statValue}>{rows.filter(row => String(row.status || "ACTIVE") === "ACTIVE").length}</div>
          <div className={s.statSub}>{t('ui.表单设计器可直接引用','表单设计器可直接引用')}</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>{t('ui.巡检通过','巡检通过')}</div>
          <div className={s.statValue}>{healthSummary.ok}</div>
          <div className={s.statSub}>{healthSummary.empty ? `${healthSummary.empty} ${t('ui.个暂无数据','个暂无数据')}` : t('ui.真实数据可读取','真实数据可读取')}</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>{t('ui.已发现字段','已发现字段')}</div>
          <div className={s.statValue}>{metadataSummary.columns}</div>
          <div className={s.statSub}>{metadataSummary.available} {t('ui.个数据源元数据正常','个数据源元数据正常')}</div>
        </div>
      </div>

      <section className={s.card} style={sectionStyle}>
        <div className={s.cardBody}>
          <div className={s.toolbar} style={toolbarStyle}>
            <div className={s.toolbarLeft}>
              <div>
                <h3 className={s.cardTitle} style={titleStyle}>{t('ui.标准业务对象','标准业务对象')}</h3>
                <p className={`${s.modalDesc} ${u.mt4}`}>{t('ui.选择一个对象可以单独创建；也可以一键补齐标准数据源。','选择一个对象可以单独创建；也可以一键补齐标准数据源。')}</p>
              </div>
            </div>
            <div className={s.toolbarRight}>
              <button type="button" style={secondaryActionButton} disabled={busy || rows.length === 0} onClick={() => void checkRows(rows)}>
                {t('ui.重新巡检','重新巡检')}
              </button>
              <button type="button" style={secondaryActionButton} disabled={busy || rows.length === 0} onClick={refreshMetadata}>
                {t('ui.刷新字段元数据','刷新字段元数据')}
              </button>
              <button type="button" style={primaryActionButton} disabled={busy} onClick={syncDefaults}>
                {t('ui.补齐标准数据源','补齐标准数据源')}
              </button>
            </div>
          </div>

          <div style={catalogLayoutStyle}>
            <div style={catalogListStyle}>
              {WORKFLOW_DATA_CATALOG.map(item => {
              const exists = existingCodes.has(item.code);
              return <button key={item.code} type="button" style={{
                ...catalogButtonStyle,
                borderColor: item.code === selectedCode ? "var(--color-primary)" : "var(--border)"
              }} onClick={() => setSelectedCode(item.code)}>
                    <span style={catalogButtonTopStyle}>
                      <strong>{item.objectName}</strong>
                      <span className={`${s.badge} ${exists ? s.badgeSuccess : s.badgeNeutral}`}>{exists ? t('ui.已启用','已启用') : t('ui.待创建','待创建')}</span>
                    </span>
                    <span>{item.description}</span>
                    <small>{item.code}</small>
                  </button>;
            })}
            </div>
            <div className={s.infoGrid} style={catalogDetailStyle}>
              <Info label={t('ui.数据源名称','数据源名称')} value={selectedCatalog.name} />
              <Info label={t('ui.控件编码','控件编码')} value={selectedCatalog.code} />
              <Info label={t('ui.来源类型','来源类型')} value={sourceTypeText(selectedCatalog.source_type)} />
              <Info label={t('ui.提交值字段','提交值字段')} value={selectedCatalog.valueField} />
              <Info label={t('ui.显示字段','显示字段')} value={selectedCatalog.labelField} />
              <Info label={t('ui.数据库表/字典','数据库表/字典')} value={selectedCatalog.table || selectedCatalog.dict_type || "-"} />
              <Info label={t('ui.启用过滤','启用过滤')} value={selectedCatalog.statusFields?.length ? selectedCatalog.statusFields.join(" / ") : t('ui.无','无')} />
              <Info label={t('ui.当前状态','当前状态')} value={existingByCode.has(selectedCatalog.code) ? t('ui.已配置，可在表单设计器使用','已配置，可在表单设计器使用') : t('ui.尚未创建','尚未创建')} />
              <Info label={t('ui.自动发现字段','自动发现字段')} value={selectedMetadata?.columns?.length ? `${selectedMetadata.columns.length} ${t('ui.个','个')}` : "-"} />
              <Info label={t('ui.最近同步','最近同步')} value={formatTime(selectedExisting?.last_synced_at)} />
            </div>
          </div>

          <div style={fieldMapStyle}>
            {selectedCatalog.fields.map(field => <span key={field.key} className={s.tag}>{field.label} · {field.usage}</span>)}
          </div>
          {selectedMetadata?.columns?.length ? <div style={fieldMapStyle}>
              {selectedMetadata.columns.slice(0, 12).map(column => <span key={String(column.key)} className={s.tag}>
                  {String(column.key)} · {String(column.type || t('ui.字段','字段'))}
                </span>)}
              {selectedMetadata.columns.length > 12 ? <span className={s.tag}>+{selectedMetadata.columns.length - 12} {t('ui.个字段','个字段')}</span> : null}
            </div> : null}
          <div style={actionsStyle}>
            <button type="button" style={secondaryActionButton} disabled={busy || existingCodes.has(selectedCatalog.code)} onClick={createFromCatalog}>
              {existingCodes.has(selectedCatalog.code) ? t('ui.该对象已创建','该对象已创建') : `${t('ui.创建','创建')} ${selectedCatalog.name}`}
            </button>
            {existingCodes.has(selectedCatalog.code) ? <button type="button" style={secondaryActionButton} disabled={busy} onClick={() => show(selectedCatalog.code)}>
                {t('ui.预览','预览')} {selectedCatalog.name}
              </button> : null}
            {existingCodes.has(selectedCatalog.code) ? <button type="button" style={secondaryActionButton} disabled={busy} onClick={() => loadFieldSuggestions(selectedCatalog.code)}>
                {t('ui.生成字段建议','生成字段建议')}
              </button> : null}
            {existingCodes.has(selectedCatalog.code) ? <button type="button" style={primaryActionButton} disabled={busy} onClick={createFormFromSelectedSource}>
                {t('ui.生成表单','生成表单')}
              </button> : null}
            {existingCodes.has(selectedCatalog.code) ? <button type="button" style={primaryActionButton} disabled={busy} onClick={createWorkflowFromSelectedSource}>
                {t('ui.生成流程','生成流程')}
              </button> : null}
          </div>
          {msg ? <div className={s.successBanner}>{msg}</div> : null}
          {generatedLinks ? <GeneratedLinks links={generatedLinks} /> : null}
          {error ? <div className={s.errorBanner}>{error}</div> : null}
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardBody}>
          <h3 className={s.cardTitle} style={titleStyle}>{t('ui.已配置数据源','已配置数据源')}</h3>
          <table className={s.table}>
            <thead><tr><th>{t('ui.编码','编码')}</th><th>{t('ui.名称','名称')}</th><th>{t('ui.类型','类型')}</th><th>{t('ui.状态','状态')}</th><th>{t('ui.字段','字段')}</th><th>{t('ui.数据','数据')}</th><th>{t('ui.最近同步','最近同步')}</th><th>{t('ui.样例','样例')}</th><th>{t('ui.操作','操作')}</th></tr></thead>
            <tbody>{rows.map(row => {
              const code = String(row.code);
              const state = health[code] || {
                status: "idle" as const
              };
              const metadata = metadataOf(row);
              return <tr key={String(row.id)}>
                  <td>{code}</td>
                  <td>{String(row.name)}</td>
                  <td>{sourceTypeText(String(row.source_type))}</td>
                  <td><span className={`${s.badge} ${String(row.status || "ACTIVE") === "ACTIVE" ? s.badgeSuccess : s.badgeNeutral}`}>{String(row.status || "ACTIVE")}</span></td>
                  <td><MetadataBadge metadata={metadata} /></td>
                  <td><HealthBadge state={state} /></td>
                  <td>{formatTime(row.last_synced_at)}</td>
                  <td>{sampleText(state)}</td>
                  <td><button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => show(code)}>{t('ui.预览真实数据','预览真实数据')}</button></td>
                </tr>;
            })}</tbody>
          </table>
          {rows.length === 0 ? <div className={s.emptyState}><div className={s.emptyStateText}>{t('ui.暂无数据源，请先补齐标准数据源。','暂无数据源，请先补齐标准数据源。')}</div></div> : null}
          {previewCode ? <div style={previewBoxStyle}>
              <strong className={s.cardTitle}>{previewCode} {t('ui.预览','预览')}</strong>
              {preview.length ? <table className={s.table} style={{
            marginTop: 10
          }}>
                  <thead><tr><th>{t('ui.提交值','提交值')}</th><th>{t('ui.显示名称','显示名称')}</th></tr></thead>
                  <tbody>{preview.slice(0, 10).map((row, index) => <tr key={`${String(row.value)}-${index}`}><td>{String(row.value)}</td><td>{String(row.label)}</td></tr>)}</tbody>
                </table> : <div className={s.emptyState}><div className={s.emptyStateText}>{t('ui.暂无预览数据。','暂无预览数据。')}</div></div>}
            </div> : null}
          {suggestionCode ? <div style={previewBoxStyle}>
              <strong className={s.cardTitle}>{suggestionCode} {t('ui.字段建议','字段建议')}</strong>
              <p className={s.modalDesc} style={{
            margin: "6px 0 10px"
          }}>
                {t('ui.系统根据数据源字段自动推断表单控件类型；后续可接入表单设计器一键导入。','系统根据数据源字段自动推断表单控件类型；后续可接入表单设计器一键导入。')}
              </p>
              {fieldSuggestions.length ? <table className={s.table}>
                  <thead><tr><th>{t('ui.字段','字段')}</th><th>{t('ui.显示名','显示名')}</th><th>{t('ui.控件类型','控件类型')}</th><th>{t('ui.规则','规则')}</th><th>{t('ui.建议原因','建议原因')}</th></tr></thead>
                  <tbody>{fieldSuggestions.map(field => <tr key={`${String(field.key)}-${String(field.type)}`}>
                      <td>{String(field.key || "-")}</td>
                      <td>{String(field.label || "-")}</td>
                      <td>{fieldTypeText(String(field.type || ""))}</td>
                      <td>{field.required ? t('ui.必填','必填') : t('ui.可选','可选')}{field.dataSource ? ` · ${field.dataSource}` : ""}</td>
                      <td>{String(field.reason || "-")}</td>
                    </tr>)}</tbody>
                </table> : <div className={s.emptyState}><div className={s.emptyStateText}>{t('ui.暂无可生成的字段建议。','暂无可生成的字段建议。')}</div></div>}
            </div> : null}
        </div>
      </section>
    </div>;
}
function GeneratedLinks({
  links
}: {
  links: GeneratedLinkSet;
}) {
  const { t } = useLanguage();
  return <div style={generatedLinksStyle}>
      <strong>{links.title}</strong>
      <div style={generatedLinkActionsStyle}>
        {links.start ? <Link style={primaryActionButton} href={links.start}>{t('ui.立即发起','立即发起')}</Link> : null}
        {links.designer ? <Link style={secondaryActionButton} href={links.designer}>{t('ui.流程设计器','流程设计器')}</Link> : null}
        {links.formDesigner ? <Link style={secondaryActionButton} href={links.formDesigner}>{t('ui.表单设计器','表单设计器')}</Link> : null}
        {links.list ? <Link style={secondaryActionButton} href={links.list}>{t('ui.查看列表','查看列表')}</Link> : null}
      </div>
    </div>;
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
function HealthBadge({
  state
}: {
  state: HealthState;
}) {
  const { t } = useLanguage();
  if (state.status === "checking") return <span className={`${s.badge} ${s.badgeInfo}`}>{t('ui.巡检中','巡检中')}</span>;
  if (state.status === "ok") return <span className={`${s.badge} ${s.badgeSuccess}`}>{state.count || 0} {t('ui.条','条')}</span>;
  if (state.status === "empty") return <span className={`${s.badge} ${s.badgeWarning}`}>{t('ui.暂无数据','暂无数据')}</span>;
  if (state.status === "error") return <span className={`${s.badge} ${s.badgeDanger}`}>{t('ui.异常','异常')}</span>;
  return <span className={`${s.badge} ${s.badgeNeutral}`}>{t('ui.未巡检','未巡检')}</span>;
}
function MetadataBadge({
  metadata
}: {
  metadata: DataSourceMetadata | null;
}) {
  const { t } = useLanguage();
  if (!metadata) return <span className={`${s.badge} ${s.badgeNeutral}`}>{t('ui.待同步','待同步')}</span>;
  if (metadata.available === false) return <span className={`${s.badge} ${s.badgeDanger}`}>{t('ui.字段异常','字段异常')}</span>;
  return <span className={`${s.badge} ${s.badgeInfo}`}>{metadata.columns?.length || 0} {t('ui.字段','字段')}</span>;
}
function metadataOf(row?: DataSourceRow): DataSourceMetadata | null {
  const raw = row?.metadata_json;
  if (!raw) return null;
  if (typeof raw === "object") return raw as DataSourceMetadata;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as DataSourceMetadata;
    } catch {
      return null;
    }
  }
  return null;
}
function sampleText(state: HealthState) {
  if (state.status === "error") return state.message || "预览失败";
  if (!state.sample?.length) return "-";
  return state.sample.map(item => String(item.label ?? item.value ?? "")).filter(Boolean).join("、") || "-";
}
function formatTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    hour12: false
  });
}
function sourceTypeText(type: string) {
  if (type === "TABLE") return "数据库表";
  if (type === "DICT") return "系统字典";
  if (type === "STATIC") return "固定选项";
  return type;
}
function fieldTypeText(type: string) {
  const dict: Record<string, string> = {
    reference: "引用选择",
    select: "下拉选择",
    text: "单行文本",
    textarea: "多行文本",
    number: "数字",
    amount: "金额",
    date: "日期",
    datetime: "日期时间",
    readonly: "只读"
  };
  return dict[type] || type || "-";
}
function friendlyError(message: string) {
  if (message.includes("duplicate") || message.includes("unique")) return "这个数据源已经存在，可直接在表单设计器中使用。";
  if (message.includes("relation") || message.includes("does not exist")) return "数据库对象不存在，请先确认基础资料表是否已初始化。";
  if (message.includes("column not found")) return "字段不存在，请检查该数据源对应的数据表字段是否调整过。";
  return message;
}
const sectionStyle: React.CSSProperties = {
  marginBottom: 12
};
const titleStyle: React.CSSProperties = {
  margin: 0
};
const toolbarStyle: React.CSSProperties = {
  marginBottom: 14,
  padding: 0,
  border: "none",
  background: "transparent"
};
const catalogLayoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)",
  gap: 14
};
const catalogListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8
};
const catalogButtonStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  textAlign: "left",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  padding: 12,
  cursor: "pointer"
};
const catalogButtonTopStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8
};
const catalogDetailStyle: React.CSSProperties = {
  alignContent: "start",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 14,
  background: "var(--bg-page)"
};
const fieldMapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12
};
const actionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 14
};
const previewBoxStyle: React.CSSProperties = {
  marginTop: 14,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 14,
  background: "var(--bg-page)"
};
const generatedLinksStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 10,
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-page)"
};
const generatedLinkActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap"
};
