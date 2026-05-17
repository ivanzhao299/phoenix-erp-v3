"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi } from "@/lib/workflow-api";
import { WORKFLOW_DATA_CATALOG, dataSourceConfig } from "@/lib/workflow-data-catalog";

type DataSourceRow = Record<string, unknown>;
type PreviewRow = { value?: string | number; label?: string | number };
type HealthState = {
  status: "idle" | "checking" | "ok" | "empty" | "error";
  count?: number;
  message?: string;
  sample?: PreviewRow[];
};

export default function WorkflowDataSourcesPage() {
  const [rows, setRows] = useState<DataSourceRow[]>([]);
  const [selectedCode, setSelectedCode] = useState(WORKFLOW_DATA_CATALOG[0].code);
  const [previewCode, setPreviewCode] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [health, setHealth] = useState<Record<string, HealthState>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const selectedCatalog = useMemo(
    () => WORKFLOW_DATA_CATALOG.find(item => item.code === selectedCode) || WORKFLOW_DATA_CATALOG[0],
    [selectedCode],
  );
  const existingByCode = useMemo(() => new Map(rows.map(row => [String(row.code), row])), [rows]);
  const existingCodes = useMemo(() => new Set(rows.map(row => String(row.code))), [rows]);
  const missingCount = useMemo(
    () => WORKFLOW_DATA_CATALOG.filter(item => !existingCodes.has(item.code)).length,
    [existingCodes],
  );
  const healthSummary = useMemo(() => {
    const states = rows.map(row => health[String(row.code)]?.status || "idle");
    return {
      ok: states.filter(item => item === "ok").length,
      empty: states.filter(item => item === "empty").length,
      error: states.filter(item => item === "error").length,
    };
  }, [health, rows]);

  const checkRows = useCallback(async (targetRows: DataSourceRow[]) => {
    const activeRows = targetRows.filter(row => String(row.status || "ACTIVE") === "ACTIVE");
    if (!activeRows.length) return;
    setHealth(prev => ({
      ...prev,
      ...Object.fromEntries(activeRows.map(row => [String(row.code), { status: "checking" as const }])),
    }));
    await Promise.all(activeRows.map(async row => {
      const code = String(row.code);
      try {
        const res = await workflowApi.previewDataSource({ code });
        const data = (res.data || []) as PreviewRow[];
        setHealth(prev => ({
          ...prev,
          [code]: {
            status: data.length ? "ok" : "empty",
            count: data.length,
            sample: data.slice(0, 3),
          },
        }));
      } catch (err) {
        setHealth(prev => ({
          ...prev,
          [code]: {
            status: "error",
            message: err instanceof Error ? friendlyError(err.message) : "预览失败",
          },
        }));
      }
    }));
  }, []);

  useEffect(() => {
    let alive = true;
    workflowApi.dataSources()
      .then(res => {
        if (!alive) return;
        const next = res.data || [];
        setRows(next);
        void checkRows(next);
      })
      .catch(err => {
        if (alive) setError(err instanceof Error ? friendlyError(err.message) : "数据源加载失败");
      });
    return () => { alive = false; };
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
    try {
      await workflowApi.syncDefaultDataSources();
      const next = await load();
      setMsg("标准数据源已补齐，表单设计器可以直接引用用户、角色、组织和业务资料。");
      await checkRows(next);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "同步标准数据源失败");
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
        config_json: dataSourceConfig(selectedCatalog),
      });
      const next = await load();
      setMsg(`已创建数据源：${selectedCatalog.name}`);
      await checkRows(next);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "创建数据源失败");
    } finally {
      setBusy(false);
    }
  }

  async function show(code: string) {
    setPreviewCode(code);
    setError("");
    try {
      const res = await workflowApi.previewDataSource({ code });
      const data = (res.data || []) as PreviewRow[];
      setPreview(data);
      setHealth(prev => ({ ...prev, [code]: { status: data.length ? "ok" : "empty", count: data.length, sample: data.slice(0, 3) } }));
    } catch (err) {
      setPreview([]);
      setHealth(prev => ({ ...prev, [code]: { status: "error", message: err instanceof Error ? friendlyError(err.message) : "预览失败" } }));
      setError(err instanceof Error ? friendlyError(err.message) : "数据源预览失败");
    }
  }

  return (
    <div>
      <PageHeader title="工作流数据源" subtitle="把用户、角色、组织和业务资料包装成表单可用的动态引用控件" breadcrumb={["工作流", "数据源"]} />

      <div className={s.statsRow}>
        <div className={s.statCard}>
          <div className={s.statLabel}>标准目录</div>
          <div className={s.statValue}>{WORKFLOW_DATA_CATALOG.length}</div>
          <div className={s.statSub}>{missingCount ? `待补齐 ${missingCount} 个` : "已补齐"}</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>已启用数据源</div>
          <div className={s.statValue}>{rows.filter(row => String(row.status || "ACTIVE") === "ACTIVE").length}</div>
          <div className={s.statSub}>表单设计器可直接引用</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>巡检通过</div>
          <div className={s.statValue}>{healthSummary.ok}</div>
          <div className={s.statSub}>{healthSummary.empty ? `${healthSummary.empty} 个暂无数据` : "真实数据可读取"}</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>异常数据源</div>
          <div className={s.statValue}>{healthSummary.error}</div>
          <div className={s.statSub}>表或字段变更会在这里暴露</div>
        </div>
      </div>

      <section className={s.card} style={sectionStyle}>
        <div className={s.cardBody}>
          <div className={s.toolbar} style={toolbarStyle}>
            <div className={s.toolbarLeft}>
              <div>
                <h3 className={s.cardTitle} style={titleStyle}>标准业务对象</h3>
                <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>选择一个对象可以单独创建；也可以一键补齐标准数据源。</p>
              </div>
            </div>
            <div className={s.toolbarRight}>
              <button className={s.btnSecondary} disabled={busy || rows.length === 0} onClick={() => void checkRows(rows)}>
                重新巡检
              </button>
              <button className={s.btnPrimary} disabled={busy} onClick={syncDefaults}>
                补齐标准数据源
              </button>
            </div>
          </div>

          <div style={catalogLayoutStyle}>
            <div style={catalogListStyle}>
              {WORKFLOW_DATA_CATALOG.map(item => {
                const exists = existingCodes.has(item.code);
                return (
                  <button
                    key={item.code}
                    type="button"
                    style={{ ...catalogButtonStyle, borderColor: item.code === selectedCode ? "var(--color-primary)" : "var(--border)" }}
                    onClick={() => setSelectedCode(item.code)}
                  >
                    <span style={catalogButtonTopStyle}>
                      <strong>{item.objectName}</strong>
                      <span className={`${s.badge} ${exists ? s.badgeSuccess : s.badgeNeutral}`}>{exists ? "已启用" : "待创建"}</span>
                    </span>
                    <span>{item.description}</span>
                    <small>{item.code}</small>
                  </button>
                );
              })}
            </div>
            <div className={s.infoGrid} style={catalogDetailStyle}>
              <Info label="数据源名称" value={selectedCatalog.name} />
              <Info label="控件编码" value={selectedCatalog.code} />
              <Info label="来源类型" value={sourceTypeText(selectedCatalog.source_type)} />
              <Info label="提交值字段" value={selectedCatalog.valueField} />
              <Info label="显示字段" value={selectedCatalog.labelField} />
              <Info label="数据库表/字典" value={selectedCatalog.table || selectedCatalog.dict_type || "-"} />
              <Info label="启用过滤" value={selectedCatalog.statusFields?.length ? selectedCatalog.statusFields.join(" / ") : "无"} />
              <Info label="当前状态" value={existingByCode.has(selectedCatalog.code) ? "已配置，可在表单设计器使用" : "尚未创建"} />
            </div>
          </div>

          <div style={fieldMapStyle}>
            {selectedCatalog.fields.map(field => (
              <span key={field.key} className={s.tag}>{field.label} · {field.usage}</span>
            ))}
          </div>
          <div style={actionsStyle}>
            <button className={s.btnSecondary} disabled={busy || existingCodes.has(selectedCatalog.code)} onClick={createFromCatalog}>
              {existingCodes.has(selectedCatalog.code) ? "该对象已创建" : `创建 ${selectedCatalog.name}`}
            </button>
            {existingCodes.has(selectedCatalog.code) ? (
              <button className={s.btnSecondary} disabled={busy} onClick={() => show(selectedCatalog.code)}>
                预览 {selectedCatalog.name}
              </button>
            ) : null}
          </div>
          {msg ? <div className={s.successBanner}>{msg}</div> : null}
          {error ? <div className={s.errorBanner}>{error}</div> : null}
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardBody}>
          <h3 className={s.cardTitle} style={titleStyle}>已配置数据源</h3>
          <table className={s.table}>
            <thead><tr><th>编码</th><th>名称</th><th>类型</th><th>状态</th><th>巡检</th><th>样例</th><th>操作</th></tr></thead>
            <tbody>{rows.map(row => {
              const code = String(row.code);
              const state = health[code] || { status: "idle" as const };
              return (
                <tr key={String(row.id)}>
                  <td>{code}</td>
                  <td>{String(row.name)}</td>
                  <td>{sourceTypeText(String(row.source_type))}</td>
                  <td><span className={`${s.badge} ${String(row.status || "ACTIVE") === "ACTIVE" ? s.badgeSuccess : s.badgeNeutral}`}>{String(row.status || "ACTIVE")}</span></td>
                  <td><HealthBadge state={state} /></td>
                  <td>{sampleText(state)}</td>
                  <td><button className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => show(code)}>预览真实数据</button></td>
                </tr>
              );
            })}</tbody>
          </table>
          {rows.length === 0 ? <div className={s.emptyState}><div className={s.emptyStateText}>暂无数据源，请先补齐标准数据源。</div></div> : null}
          {previewCode ? (
            <div style={previewBoxStyle}>
              <strong className={s.cardTitle}>{previewCode} 预览</strong>
              {preview.length ? (
                <table className={s.table} style={{ marginTop: 10 }}>
                  <thead><tr><th>提交值</th><th>显示名称</th></tr></thead>
                  <tbody>{preview.slice(0, 10).map((row, index) => (
                    <tr key={`${String(row.value)}-${index}`}><td>{String(row.value)}</td><td>{String(row.label)}</td></tr>
                  ))}</tbody>
                </table>
              ) : <div className={s.emptyState}><div className={s.emptyStateText}>暂无预览数据。</div></div>}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.infoItem}>
      <div className={s.infoKey}>{label}</div>
      <div className={s.infoVal}>{value}</div>
    </div>
  );
}

function HealthBadge({ state }: { state: HealthState }) {
  if (state.status === "checking") return <span className={`${s.badge} ${s.badgeInfo}`}>巡检中</span>;
  if (state.status === "ok") return <span className={`${s.badge} ${s.badgeSuccess}`}>{state.count || 0} 条</span>;
  if (state.status === "empty") return <span className={`${s.badge} ${s.badgeWarning}`}>暂无数据</span>;
  if (state.status === "error") return <span className={`${s.badge} ${s.badgeDanger}`}>异常</span>;
  return <span className={`${s.badge} ${s.badgeNeutral}`}>未巡检</span>;
}

function sampleText(state: HealthState) {
  if (state.status === "error") return state.message || "预览失败";
  if (!state.sample?.length) return "-";
  return state.sample.map(item => String(item.label ?? item.value ?? "")).filter(Boolean).join("、") || "-";
}

function sourceTypeText(type: string) {
  if (type === "TABLE") return "数据库表";
  if (type === "DICT") return "系统字典";
  if (type === "STATIC") return "固定选项";
  return type;
}

function friendlyError(message: string) {
  if (message.includes("duplicate") || message.includes("unique")) return "这个数据源已经存在，可直接在表单设计器中使用。";
  if (message.includes("relation") || message.includes("does not exist")) return "数据库对象不存在，请先确认基础资料表是否已初始化。";
  if (message.includes("column not found")) return "字段不存在，请检查该数据源对应的数据表字段是否调整过。";
  return message;
}

const sectionStyle: React.CSSProperties = { marginBottom: 12 };
const titleStyle: React.CSSProperties = { margin: 0 };
const toolbarStyle: React.CSSProperties = { marginBottom: 14, padding: 0, border: "none", background: "transparent" };
const catalogLayoutStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)", gap: 14 };
const catalogListStyle: React.CSSProperties = { display: "grid", gap: 8 };
const catalogButtonStyle: React.CSSProperties = { display: "grid", gap: 6, textAlign: "left", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", color: "var(--text-primary)", padding: 12, cursor: "pointer" };
const catalogButtonTopStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const catalogDetailStyle: React.CSSProperties = { alignContent: "start", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, background: "var(--bg-page)" };
const fieldMapStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const actionsStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 14 };
const previewBoxStyle: React.CSSProperties = { marginTop: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, background: "var(--bg-page)" };
