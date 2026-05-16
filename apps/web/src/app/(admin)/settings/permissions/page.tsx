"use client";
import { useState, useEffect, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Shield, Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 表: sys_permissions — 角色-菜单-权限 三元组配置
// 字段: id, role_code, menu_code, perm_codes (如 "V,C,E,D,A,X")

const TABLE = "sys_permissions";

interface PermRow {
  id: number;
  role_code: string;
  menu_code: string;
  perm_codes: string;
}

export default function PermissionsPage() {
  const { t } = useLanguage();

  const PERM_CODE_META: Record<string, { label: string; color: string }> = {
    V: { label: t('ui.查看', '查看'), color: "#3b82f6" },
    C: { label: t('common.new', '新增'), color: "#22c55e" },
    E: { label: t('common.edit', '编辑'), color: "#f59e0b" },
    D: { label: t('common.delete', '删除'), color: "#ef4444" },
    A: { label: t('ui.审批', '审批'), color: "#8b5cf6" },
    X: { label: t('common.export', '导出'), color: "#06b6d4" },
  };

  const FIELDS: FormField[] = [
    { key: "role_code",  label: t('ui.角色编码', '角色编码'),   type: "text",   required: true, placeholder: t('ui.如ROLE_FARM_MGR', '如：ROLE_FARM_MGR') },
    { key: "menu_code",  label: t('ui.菜单代码', '菜单代码'),   type: "text",   required: true, placeholder: t('ui.如MENU_ORDER_MGR', '如：MENU_ORDER_MGR') },
    { key: "perm_codes", label: t('ui.权限码集合', '权限码集合'), type: "text",   required: true, placeholder: t('ui.逗号分隔VCE或星号', '逗号分隔：V,C,E 或 *') },
  ];

  const [data,    setData]    = useState<PermRow[]>([]);
  const [filter,  setFilter]  = useState("");
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<PermRow | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [delItem, setDelItem] = useState<PermRow | null>(null);
  const [rk,      setRk]      = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crudApi.list(TABLE, { limit: 1000 } as any);
      setData(((res as any).data ?? []) as PermRow[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [rk]);

  const filtered = data.filter(r =>
    !filter || r.role_code.toLowerCase().includes(filter.toLowerCase()) ||
    r.menu_code.toLowerCase().includes(filter.toLowerCase())
  );

  // 按角色分组
  const groups: Record<string, PermRow[]> = {};
  for (const r of filtered) {
    if (!groups[r.role_code]) groups[r.role_code] = [];
    groups[r.role_code].push(r);
  }

  const save = useCallback(async (v: Record<string, unknown>) => {
    setSaving(true);
    try {
      editing
        ? await crudApi.update(TABLE, editing.id, v)
        : await crudApi.create(TABLE, v);
      setOpen(false);
      setRk(k => k + 1);
    } finally { setSaving(false); }
  }, [editing]);

  const del = useCallback(async () => {
    if (!delItem) return;
    await crudApi.delete(TABLE, delItem.id);
    setConfirm(false);
    setRk(k => k + 1);
  }, [delItem]);

  return (
    <div>
      <PageHeader
        title={t('ui.权限配置', '权限配置')}
        subtitle={t('ui.管理每个角色对每个菜单的VCEDAX细粒度权限条目', '管理每个角色对每个菜单的 VCEDAX 细粒度权限条目（表：sys_permissions）')}
      />

      {/* 顶栏 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%",
            transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={t('ui.搜索角色或菜单编码', '搜索角色或菜单编码…')}
            style={{ width: "100%", padding: "8px 12px 8px 32px",
              background: "var(--bg-surface)", border: "1px solid var(--border-light)",
              borderRadius: 8, color: "var(--text-primary)", fontSize: "0.85rem" }}
          />
        </div>
        <button onClick={() => { setEditing(null); setOpen(true); }} style={{
          background: "var(--brand-primary)", border: "none", borderRadius: 8,
          padding: "8px 18px", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem",
        }}>+ {t('ui.新增权限条目', '新增权限条目')}</button>
      </div>

      {/* 统计 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {[
          { label: t('ui.权限条目总数', '权限条目总数'),   value: data.length,         color: "#3b82f6" },
          { label: t('ui.涉及角色数', '涉及角色数'),    value: Object.keys(groups).length, color: "#22c55e" },
          { label: t('ui.搜索结果', '搜索结果'),      value: filtered.length,      color: "#f59e0b" },
        ].map(k => (
          <div key={k.label} style={{
            background: `${k.color}10`, border: `1px solid ${k.color}25`,
            borderRadius: 10, padding: "10px 16px",
          }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: k.color }}>{loading ? "—" : k.value}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* 分组权限表 */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>{t('common.loading', '加载中…')}</div>
      ) : Object.entries(groups).length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          <Shield size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
          <div>{t('ui.暂无权限配置点击新增开始配置', '暂无权限配置，点击「新增」开始配置')}</div>
        </div>
      ) : (
        Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([roleCode, rows]) => (
          <div key={roleCode} style={{
            marginBottom: 12, background: "var(--bg-surface)",
            border: "1px solid var(--bg-surface)", borderRadius: 10, overflow: "hidden",
          }}>
            <div style={{ padding: "10px 16px", background: "var(--bg-surface)",
              borderBottom: "1px solid var(--bg-surface)",
              display: "flex", alignItems: "center", gap: 10 }}>
              <Shield size={14} style={{ color: "#8b5cf6" }} />
              <span style={{ fontWeight: 700, fontSize: "0.85rem", fontFamily: "monospace", color: "#8b5cf6" }}>
                {roleCode}
              </span>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                {rows.length} {t('ui.个菜单权限', '个菜单权限')}
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--bg-surface)" }}>
                    <th style={{ padding: "6px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>{t('ui.菜单代码', '菜单代码')}</th>
                    <th style={{ padding: "6px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>{t('ui.权限码', '权限码')}</th>
                    <th style={{ padding: "6px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>{t('common.operation', '操作')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.sort((a, b) => a.menu_code.localeCompare(b.menu_code)).map(row => (
                    <tr key={row.id} style={{ borderBottom: "1px solid var(--bg-surface)" }}>
                      <td style={{ padding: "8px 16px", fontFamily: "monospace", color: "var(--text-primary)" }}>
                        {row.menu_code}
                      </td>
                      <td style={{ padding: "8px 16px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {row.perm_codes === "*" ? (
                            <span style={{ padding: "2px 8px", borderRadius: 12,
                              background: "#ef444420", color: "#ef4444",
                              fontSize: "0.72rem", fontWeight: 700 }}>
                              * {t('ui.全部权限', '全部权限')}
                            </span>
                          ) : row.perm_codes.split(",").filter(Boolean).map(code => {
                            const meta = PERM_CODE_META[code.trim()] ?? { label: code, color: "#94a3b8" };
                            return (
                              <span key={code} style={{
                                padding: "2px 8px", borderRadius: 12, fontSize: "0.72rem", fontWeight: 700,
                                background: `${meta.color}20`, color: meta.color,
                                border: `1px solid ${meta.color}30`,
                              }}>
                                {code.trim()} {meta.label}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ padding: "8px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { setEditing(row); setOpen(true); }} style={{
                            padding: "4px 10px", fontSize: "0.75rem", background: "rgba(59,130,246,0.15)",
                            color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)",
                            borderRadius: 6, cursor: "pointer",
                          }}>{t('common.edit', '编辑')}</button>
                          <button onClick={() => { setDelItem(row); setConfirm(true); }} style={{
                            padding: "4px 10px", fontSize: "0.75rem", background: "rgba(239,68,68,0.12)",
                            color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)",
                            borderRadius: 6, cursor: "pointer",
                          }}>{t('common.delete', '删除')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <RightDrawer open={open} title={editing ? t('ui.编辑权限条目', '编辑权限条目') : t('ui.新增权限条目', '新增权限条目')} onClose={() => setOpen(false)}>
        <div style={{ marginBottom: 16, padding: 12, background: "rgba(59,130,246,0.08)",
          borderRadius: 8, fontSize: "0.78rem", color: "#93c5fd" }}>
          {t('ui.权限码说明', '权限码说明')}：<strong>V</strong>={t('ui.查看', '查看')} <strong>C</strong>={t('common.new', '新增')} <strong>E</strong>={t('common.edit', '编辑')}
          <strong>D</strong>={t('common.delete', '删除')} <strong>A</strong>={t('ui.审批', '审批')} <strong>X</strong>={t('common.export', '导出')}<br />
          {t('ui.多个权限用逗号分隔', '多个权限用逗号分隔，如：')}<code>V,C,E</code>。{t('ui.超管填星号', '超管填')} <code>*</code>。
        </div>
        <CrudForm
          fields={FIELDS}
          initialValues={(editing ?? {}) as Record<string,unknown>}
          onSubmit={save}
          onCancel={() => setOpen(false)}
          loading={saving}
        />
      </RightDrawer>

      <ConfirmDialog
        open={confirm}
        title={t('common.confirm', '确认删除')}
        message={`${t('ui.删除角色', '删除角色')}「${delItem?.role_code}」${t('ui.在菜单上的权限', '在菜单')}「${delItem?.menu_code}」${t('ui.上的权限', '上的权限')}？`}
        onConfirm={del}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
