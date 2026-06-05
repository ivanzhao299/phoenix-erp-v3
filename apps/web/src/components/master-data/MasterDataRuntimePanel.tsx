"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw, Pencil, Send, Snowflake, Archive, RotateCcw, X, Link2, MoreHorizontal } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { EmptyState, LoadingSkeleton } from "@/components/design-system";
import { primaryActionButton, inlineBadge } from "@/components/design-system/cockpit-styles";
import request from "@/lib/api-client";

/**
 * MasterDataRuntimePanel — 通用核心主数据 Runtime 面板（G3-A）
 * 配置驱动：客户/供应商/项目/现金账户复用同一组件。
 * 能力：列表 + 新增 + 编辑 + 生命周期（提交审批/冻结/归档/恢复）+ 状态标签。
 */

export interface MdField {
  key: string; label: string; required?: boolean;
  type?: "text" | "number" | "date" | "select";
  options?: { value: string; label: string }[];
  dictType?: string;   // 预留：DictSelect 接入
  readOnlyOnEdit?: boolean;
}

export interface MasterDataRuntimePanelProps {
  type: string;          // customer | supplier | project | cash-account
  title: string;
  codeKey: string;       // customer_no / supplier_code ...
  nameKey: string;
  fields: MdField[];     // 表单字段（不含编码，编码自动生成）
  columns: { key: string; label: string }[];  // 列表展示列
  objectType?: string;   // G5.5-D：用于引用关系查询（CUSTOMER/SUPPLIER/...）；默认按 type 推断
  /** UIX-7：点击编码触发详情 drawer（产品化 — 不传则编码列仅显示） */
  onCodeClick?: (code: string, row: Record<string, any>) => void;
}

type StatusTone = 'default' | 'success' | 'warning' | 'danger';
const STATUS_LABEL: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT:            { label: "草稿",     tone: 'default' },
  PENDING_APPROVAL: { label: "待审批",   tone: 'warning' },
  ACTIVE:           { label: "已生效",   tone: 'success' },
  FROZEN:           { label: "已冻结",   tone: 'default' },
  ARCHIVED:         { label: "已归档",   tone: 'default' },
  REJECTED:         { label: "已驳回",   tone: 'danger' },
};

export function MasterDataRuntimePanel(props: MasterDataRuntimePanelProps) {
  const { type, title, codeKey, nameKey, fields, columns, objectType, onCodeClick } = props;
  const { canCreate, canEdit } = usePermission("MENU_MASTER_DATA");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  // G5.5-D：行内引用计数
  const [refCounts, setRefCounts] = useState<Record<string, { total: number; loading: boolean }>>({});

  const resolvedObjectType = (objectType ?? type.toUpperCase().replace(/-/g, '_'));

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const qs = filterStatus ? `?status=${filterStatus}` : "";
      setRows(await request<Record<string, any>[]>(`/master-data/runtime/${type}${qs}`));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "加载失败"); }
    finally { setLoading(false); }
  }, [type, filterStatus]);

  useEffect(() => { load(); }, [load]);

  // G5.5-D：按需懒加载行的引用计数（避免一次性查询全部）
  const fetchRefCount = useCallback(async (code: string) => {
    if (refCounts[code]) return;
    setRefCounts(prev => ({ ...prev, [code]: { total: 0, loading: true } }));
    try {
      const r = await request<{ totalReferences: number }>(`/master-data/references/${resolvedObjectType}/${encodeURIComponent(code)}`);
      setRefCounts(prev => ({ ...prev, [code]: { total: r.totalReferences ?? 0, loading: false } }));
    } catch {
      setRefCounts(prev => ({ ...prev, [code]: { total: -1, loading: false } }));
    }
  }, [resolvedObjectType, refCounts]);

  const openNew = () => { setForm({}); setEditing({}); };
  const openEdit = (row: Record<string, any>) => { setForm({ ...row }); setEditing(row); };

  const save = async () => {
    for (const f of fields) {
      if (f.required && !form[f.key]) { setError(`请填写：${f.label}`); return; }
    }
    setSaving(true); setError("");
    try {
      const isNew = !editing?.[codeKey];
      if (isNew) await request(`/master-data/runtime/${type}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      else await request(`/master-data/runtime/${type}/${editing[codeKey]}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setEditing(null); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const doTransition = async (row: Record<string, any>, action: string) => {
    try {
      await request(`/master-data/runtime/${type}/${row[codeKey]}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "操作失败"); }
  };

  // 按状态决定可用动作（PENDING_APPROVAL 由「审批中心」走 Workflow，面板不直接审批，避免绕过治理）
  const actionsFor = (status: string) => {
    const a: { action: string; label: string; icon: any }[] = [];
    if (status === "DRAFT" || status === "REJECTED") a.push({ action: "submit", label: "提交审批", icon: Send });
    if (status === "ACTIVE") a.push({ action: "freeze", label: "冻结", icon: Snowflake });
    if (status === "FROZEN" || status === "ARCHIVED") a.push({ action: "restore", label: "恢复", icon: RotateCcw });
    if (status !== "ARCHIVED") a.push({ action: "archive", label: "归档", icon: Archive });
    return a;
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-bg-muted border border-border text-text" style={{ padding: "7px 12px", borderRadius: 7, fontSize: 13 }}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="bg-bg-muted border border-border text-text-muted"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 刷新
        </button>
        {canCreate && (
          <button onClick={openNew} style={{ ...primaryActionButton, marginLeft: "auto" }}>
            <Plus size={14} /> 新增{title}
          </button>
        )}
      </div>

      {error && <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, background: "var(--status-danger-bg)", border: "1px solid var(--status-danger-border)", color: "var(--status-danger)", fontSize: 13 }}>{error}</div>}

      <div style={{ borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", background: "var(--bg-card)" }}>
        {loading ? <div style={{ padding: 16 }}><LoadingSkeleton variant="table" rows={6} /></div>
          : rows.length === 0 ? <div style={{ padding: 32 }}><EmptyState title={`暂无${title}数据`} compact /></div>
          : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "auto" }}>
              <thead><tr style={{ background: "var(--bg-muted)", color: "var(--text-secondary)" }}>
                <th style={thStyle}>编码</th>
                {columns.map(c => <th key={c.key} style={thStyle}>{c.label}</th>)}
                <th style={{ ...thStyle, textAlign: "center", width: 80 }}>状态</th>
                <th style={{ ...thStyle, textAlign: "center", width: 60 }}>引用</th>
                <th style={{ ...thStyle, textAlign: "right", width: 130 }}>操作</th>
              </tr></thead>
              <tbody>
                {rows.map(r => {
                  const st = STATUS_LABEL[r.status] ?? { label: r.status, tone: 'default' as StatusTone };
                  return (
                    <tr key={r[codeKey]} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--color-primary)" }}>
                        {onCodeClick ? (
                          <button
                            type="button"
                            onClick={() => onCodeClick(r[codeKey], r)}
                            style={{
                              background: "transparent", border: "none", color: "var(--color-primary)",
                              fontFamily: "monospace", fontSize: 13, padding: 0, cursor: "pointer",
                              textDecoration: "underline", textUnderlineOffset: 2,
                              whiteSpace: "nowrap",
                            }}
                          >{r[codeKey]}</button>
                        ) : r[codeKey]}
                      </td>
                      {columns.map(c => <td key={c.key} style={tdStyle} title={String(r[c.key] ?? "")}>{r[c.key] ?? "—"}</td>)}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{ ...inlineBadge(st.tone), whiteSpace: "nowrap" }}>{st.label}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {/* G5.5-D：引用计数（懒加载，悬浮触发） */}
                        {refCounts[r[codeKey]] ? (
                          refCounts[r[codeKey]].loading ? <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>…</span> :
                          refCounts[r[codeKey]].total < 0 ? <span style={{ fontSize: 11, color: "var(--status-danger)" }}>err</span> :
                          refCounts[r[codeKey]].total === 0 ? <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>0</span> :
                          <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--status-warning-bg, var(--status-warning-bg-light))", color: "var(--status-warning, var(--status-warning))", fontWeight: 600 }} title={`被 ${refCounts[r[codeKey]].total} 处业务引用`}>
                            <Link2 size={9} style={{ display: "inline", marginRight: 2 }} />{refCounts[r[codeKey]].total}
                          </span>
                        ) : (
                          <button onClick={() => fetchRefCount(r[codeKey])}
                            style={{ fontSize: 11, padding: "1px 8px", borderRadius: 4, background: "var(--bg-muted)", color: "var(--text-secondary)", border: "1px solid var(--border)", cursor: "pointer" }}>
                            查询
                          </button>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <RowActions
                          row={r}
                          canEdit={canEdit}
                          onEdit={() => openEdit(r)}
                          transitions={actionsFor(r.status)}
                          onTransition={(action) => doTransition(r, action)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
      </div>

      {/* 新增/编辑抽屉 */}
      {editing !== null && (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-mask)", zIndex: 10010, display: "flex", justifyContent: "flex-end" }} onClick={() => setEditing(null)}>
          <div style={{ width: 480, background: "var(--bg-card)", height: "100%", overflowY: "auto", padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editing[codeKey] ? `编辑${title}` : `新增${title}`}</h2>
              <button onClick={() => setEditing(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-secondary)" }}><X size={20} /></button>
            </div>
            {editing[codeKey] && <div style={{ marginBottom: 14, fontSize: 12, color: "var(--text-secondary)" }}>编码：<span style={{ fontFamily: "monospace", color: "var(--color-primary)" }}>{editing[codeKey]}</span>（自动生成，不可修改）</div>}
            {!editing[codeKey] && <div style={{ marginBottom: 14, fontSize: 12, color: "var(--text-secondary)" }}>编码将在保存时自动生成（不可手填）</div>}
            {fields.map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>{f.label}{f.required && <span style={{ color: "var(--status-danger)" }}> *</span>}</label>
                {f.type === "select" ? (
                  <select value={form[f.key] ?? ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    className="bg-bg-card border border-border text-text" style={{ width: "100%", padding: "8px 12px", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }}>
                    <option value="">请选择</option>
                    {(f.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    value={form[f.key] ?? ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    className="bg-bg-card border border-border text-text" style={{ width: "100%", padding: "8px 12px", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }} />
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={() => setEditing(null)} className="bg-bg-muted border border-border text-text" style={{ flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>取消</button>
              <button onClick={save} disabled={saving} style={{ flex: 2, padding: "10px 0", borderRadius: 8, background: "var(--color-primary)", color: "white", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{saving ? "保存中…" : "保存草稿"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 26, borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--bg-muted)", color: "var(--text-secondary)", cursor: "pointer",
};

// UIX-PROD-2: 紧凑表格单元格
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "9px 12px",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const tdStyle: React.CSSProperties = {
  padding: "9px 12px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 240,
};

// UIX-PROD-2: 行操作（编辑 + dropdown）
function RowActions({ row, canEdit, onEdit, transitions, onTransition }: {
  row: Record<string, any>;
  canEdit: boolean;
  onEdit: () => void;
  transitions: { action: string; label: string; icon: any }[];
  onTransition: (action: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const archived = row.status === "ARCHIVED";

  if (!canEdit) return null;

  return (
    <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
      {!archived && (
        <button onClick={onEdit} title="编辑" style={iconBtn}>
          <Pencil size={13} />
        </button>
      )}
      {transitions.length > 0 && (
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            title="更多操作"
            style={iconBtn}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          >
            <MoreHorizontal size={14} />
          </button>
          {open && (
            <div style={{
              position: "absolute", right: 0, top: 30, zIndex: 10,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 8, padding: 4, minWidth: 130,
              boxShadow: "0 4px 16px var(--overlay-black-15)",
            }}>
              {transitions.map(a => (
                <button
                  key={a.action}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onTransition(a.action); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "7px 10px", background: "transparent", border: "none",
                    color: "var(--text-primary)", fontSize: 12, cursor: "pointer",
                    borderRadius: 6, textAlign: "left",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-muted)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <a.icon size={12} /> {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MasterDataRuntimePanel;
