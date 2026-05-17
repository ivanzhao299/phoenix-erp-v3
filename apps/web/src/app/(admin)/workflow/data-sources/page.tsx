"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { workflowApi } from "@/lib/workflow-api";
import { WORKFLOW_DATA_CATALOG, dataSourceConfig } from "@/lib/workflow-data-catalog";

export default function WorkflowDataSourcesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [selectedCode, setSelectedCode] = useState(WORKFLOW_DATA_CATALOG[0].code);
  const [previewCode, setPreviewCode] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const selectedCatalog = useMemo(
    () => WORKFLOW_DATA_CATALOG.find(item => item.code === selectedCode) || WORKFLOW_DATA_CATALOG[0],
    [selectedCode],
  );
  const existingCodes = useMemo(() => new Set(rows.map(row => String(row.code))), [rows]);

  const load = () => workflowApi.dataSources().then(res => setRows(res.data || []));
  useEffect(() => { load(); }, []);

  async function createFromCatalog() {
    setMsg("");
    setError("");
    try {
      await workflowApi.createDataSource({
        code: selectedCatalog.code,
        name: selectedCatalog.name,
        source_type: selectedCatalog.source_type,
        config_json: dataSourceConfig(selectedCatalog),
      });
      setMsg(`已创建数据源：${selectedCatalog.name}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "创建数据源失败");
    }
  }

  async function show(code: string) {
    setPreviewCode(code);
    setError("");
    try {
      const res = await workflowApi.previewDataSource({ code });
      setPreview(res.data || []);
    } catch (err) {
      setPreview([]);
      setError(err instanceof Error ? friendlyError(err.message) : "数据源预览失败");
    }
  }

  return (
    <div>
      <PageHeader title="工作流数据源" subtitle="把数据库里的业务对象包装成表单可用的下拉/引用控件" breadcrumb={["工作流", "数据源"]} />

      <section className={s.card} style={sectionStyle}>
        <div className={s.cardBody}>
          <div style={headerStyle}>
            <div>
              <h3 className={s.cardTitle}>从业务对象创建数据源</h3>
              <p className={s.modalDesc} style={{ margin: "4px 0 0" }}>管理员选择业务对象即可，系统会自动生成表单控件使用的编码和取值字段。</p>
            </div>
            <button className={s.btnPrimary} disabled={existingCodes.has(selectedCatalog.code)} onClick={createFromCatalog}>
              {existingCodes.has(selectedCatalog.code) ? "已创建" : "创建数据源"}
            </button>
          </div>

          <div style={catalogLayoutStyle}>
            <div style={catalogListStyle}>
              {WORKFLOW_DATA_CATALOG.map(item => (
                <button
                  key={item.code}
                  type="button"
                  style={{ ...catalogButtonStyle, borderColor: item.code === selectedCode ? "var(--color-primary)" : "var(--border)" }}
                  onClick={() => setSelectedCode(item.code)}
                >
                  <strong>{item.objectName}</strong>
                  <span>{item.description}</span>
                  <small>{item.code}</small>
                </button>
              ))}
            </div>
            <div className={s.infoGrid} style={catalogDetailStyle}>
              <Info label="数据源名称" value={selectedCatalog.name} />
              <Info label="控件编码" value={selectedCatalog.code} />
              <Info label="来源类型" value={sourceTypeText(selectedCatalog.source_type)} />
              <Info label="提交值字段" value={selectedCatalog.valueField} />
              <Info label="显示字段" value={selectedCatalog.labelField} />
              <Info label="数据库表/字典" value={selectedCatalog.table || selectedCatalog.dict_type || "-"} />
            </div>
          </div>

          <div style={fieldMapStyle}>
            {selectedCatalog.fields.map(field => (
              <span key={field.key} className={s.tag}>{field.label} · {field.usage}</span>
            ))}
          </div>
          {msg ? <div className={s.successBanner}>{msg}</div> : null}
          {error ? <div className={s.errorBanner}>{error}</div> : null}
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardBody}>
          <h3 className={s.cardTitle} style={titleStyle}>已配置数据源</h3>
          <table className={s.table}>
            <thead><tr><th>编码</th><th>名称</th><th>类型</th><th>操作</th></tr></thead>
            <tbody>{rows.map(row => (
              <tr key={String(row.id)}>
                <td>{String(row.code)}</td>
                <td>{String(row.name)}</td>
                <td>{sourceTypeText(String(row.source_type))}</td>
                <td><button className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => show(String(row.code))}>预览真实数据</button></td>
              </tr>
            ))}</tbody>
          </table>
          {previewCode ? (
            <div style={previewBoxStyle}>
              <strong className={s.cardTitle}>{previewCode} 预览</strong>
              {preview.length ? (
                <table className={s.table} style={{ marginTop: 10 }}>
                  <thead><tr><th>提交值</th><th>显示名称</th></tr></thead>
                  <tbody>{preview.slice(0, 8).map((row, index) => (
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

function sourceTypeText(type: string) {
  if (type === "TABLE") return "数据库表";
  if (type === "DICT") return "系统字典";
  if (type === "STATIC") return "固定选项";
  return type;
}

function friendlyError(message: string) {
  if (message.includes("duplicate") || message.includes("unique")) return "这个数据源已经存在，可直接在表单设计器中使用。";
  if (message.includes("relation") || message.includes("does not exist")) return "数据库对象不存在，请先确认基础资料表是否已初始化。";
  return message;
}

const sectionStyle: React.CSSProperties = { marginBottom: 12 };
const titleStyle: React.CSSProperties = { margin: "0 0 12px" };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 };
const catalogLayoutStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", gap: 14 };
const catalogListStyle: React.CSSProperties = { display: "grid", gap: 8 };
const catalogButtonStyle: React.CSSProperties = { display: "grid", gap: 6, textAlign: "left", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", color: "var(--text-primary)", padding: 12, cursor: "pointer" };
const catalogDetailStyle: React.CSSProperties = { alignContent: "start", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, background: "var(--bg-page)" };
const fieldMapStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const previewBoxStyle: React.CSSProperties = { marginTop: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, background: "var(--bg-page)" };
