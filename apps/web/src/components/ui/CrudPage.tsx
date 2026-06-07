"use client";
/**
 * G18-2 · CrudPage — 标准 CRUD 业务页模板
 * ═══════════════════════════════════════════════════════════════════════════
 * 收口 inbound/outbound/feed/medicine/transfer/stocktake 等所有"列表 + 抽屉
 * 编辑"业务页的模板。统一：
 *   · PageHeader（带"新建"按钮，权限自动隐藏）
 *   · 可选过滤 tabs（按 filterKey）
 *   · DataTable + 编辑/删除列（权限自动隐藏）
 *   · RightDrawer + CrudForm（用 shared-selectors 字典/主数据下拉）
 *   · ConfirmDialog（删除）
 *   · crudApi.create/update/delete 自动注入 site_code（generic-crud 已处理）
 *
 * 使用：
 *   <CrudPage
 *     table="wms_inbound"
 *     menuCode="MENU_INV_MANUAL_INBOUND"
 *     title="入库管理"
 *     fields={FIELDS}
 *     columns={COLUMNS}
 *     newPayload={(v) => ({ ...v, status: v.status || 'PENDING' })}
 *   />
 */
import { useState, useCallback, useMemo, type ReactNode } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { usePermission } from "@/hooks/usePermission";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus, Edit2, Trash2 } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

export type Row = Record<string, unknown>;

export interface CrudPageProps {
  table: string;
  menuCode: string;
  title: string;
  subtitle?: string;
  breadcrumb?: string[];
  fields: FormField[];
  columns: Column<Row>[];
  /** 新建提交时附加固定字段（如 status 默认值、自动编号等） */
  newPayload?: (values: Row) => Row;
  /** 过滤 tab key（如 'type' / 'status'） */
  filterKey?: string;
  /** 过滤 tab options，含"全部"会自动加 */
  filterOptions?: { value: string; label: string }[];
  /** 表格 pageSize，默认 30 */
  pageSize?: number;
  /** 空表提示 */
  emptyText?: string;
  /** 额外 header 操作按钮 */
  extraActions?: ReactNode;
  /** 删除/编辑列是否禁用（如表为仅追加） */
  disableEdit?: boolean;
  disableDelete?: boolean;
  /** 自定义 createApi/updateApi/deleteApi（默认 crudApi.{create,update,delete}） */
  idColumn?: string;
}

export function CrudPage(props: CrudPageProps) {
  const {
    table, menuCode, title, subtitle, breadcrumb,
    fields, columns,
    newPayload,
    filterKey, filterOptions,
    pageSize = 30,
    emptyText,
    extraActions,
    disableEdit, disableDelete,
    idColumn = 'id',
  } = props;

  const { t } = useLanguage();
  const { canCreate, canEdit, canDelete } = usePermission(menuCode);

  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [editing,      setEditing]      = useState<Row | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [filterValue,  setFilterValue]  = useState("");

  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew     = useCallback(() => { setEditing(null); setDrawerOpen(true); }, []);
  const openEdit    = useCallback((row: Row) => { setEditing(row); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
      const id = editing?.[idColumn];
      const payload = id ? values : (newPayload ? newPayload(values) : values);
      id
        ? await crudApi.update(table, id as number, payload)
        : await crudApi.create(table, payload);
      setDrawerOpen(false); refresh();
    } finally { setSaving(false); }
  }, [editing, refresh, table, newPayload, idColumn]);

  const handleDelete  = useCallback((row: Row) => { setDeleteTarget(row); setConfirmOpen(true); }, []);
  const confirmDelete = useCallback(async () => {
    const id = deleteTarget?.[idColumn];
    if (!id) return;
    await crudApi.delete(table, id as number);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh, table, idColumn]);

  // 自动追加"操作"列（编辑/删除按权限）
  const finalColumns: Column<Row>[] = useMemo(() => {
    const hasActions = !disableEdit || !disableDelete;
    if (!hasActions) return columns;
    return [
      ...columns,
      {
        key: "_actions",
        title: t("common.operation", "操作"),
        width: 100,
        align: "center" as const,
        render: (_: unknown, row: Row) => (
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            {!disableEdit && canEdit && (
              <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => openEdit(row)}>
                <Edit2 size={12} />{t("common.edit", "编辑")}
              </button>
            )}
            {!disableDelete && canDelete && (
              <button type="button" className={`${s.btnDanger} ${s.btnSm}`} onClick={() => handleDelete(row)}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ),
      },
    ];
  }, [columns, disableEdit, disableDelete, canEdit, canDelete, openEdit, handleDelete, t]);

  const params = filterKey && filterValue ? { [filterKey]: filterValue } as any : undefined;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumb={breadcrumb}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {extraActions}
            {canCreate && (
              <button type="button" className={s.btnPrimary} onClick={openNew}>
                <Plus size={14} />{t("common.new", "新建")}
              </button>
            )}
          </div>
        }
      />

      {filterKey && filterOptions && filterOptions.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setFilterValue("")}
            className={`${s.tabPill} ${filterValue === "" ? s.tabPillActive : ""}`}>
            {t("ui.全部", "全部")}
          </button>
          {filterOptions.map(o => (
            <button key={o.value} type="button" onClick={() => setFilterValue(o.value)}
              className={`${s.tabPill} ${filterValue === o.value ? s.tabPillActive : ""}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}

      <DataTable
        table={table}
        columns={finalColumns}
        params={params}
        onNew={openNew}
        onEdit={openEdit}
        onDelete={handleDelete}
        showActions={false}
        refreshKey={refreshKey}
        emptyText={emptyText ?? t("common.no_data", "暂无数据")}
        pageSize={pageSize}
      />

      <RightDrawer open={drawerOpen} title={editing ? t("common.edit_record", "编辑") : t("common.new_record", "新建")} onClose={closeDrawer}>
        <CrudForm fields={fields} initialValues={editing ?? {}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title={t("ui.确认删除", "确认删除")}
        message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
