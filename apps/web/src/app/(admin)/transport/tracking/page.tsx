"use client";
import { useState, useCallback } from "react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { crudApi } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE = "log_routes";
type Row = Record<string, unknown>;

export default function Page() {
  const { t } = useLanguage();

  const COLS: Column<Row>[] = [
    { key: "route_code",  title: t("ui.路线编号", "路线编号"), width: 120 },
    { key: "name",        title: t("ui.路线名称", "路线名称"), width: 160 },
    { key: "stores",      title: t("ui.覆盖门店", "覆盖门店"), width: 200 },
    { key: "distance_km", title: t("ui.距离km", "距离(km)"), width: 100, align: "right" as const },
    { key: "status",      title: t("common.status", "状态"),    width: 90, align: "center" as const },
  ];
  const FIELDS: FormField[] = [
    { key: "route_code",  label: t("ui.路线编号", "路线编号"), type: "text" as const, required: true },
    { key: "name",        label: t("ui.路线名称", "路线名称"), type: "text" as const, required: true },
    { key: "stores",      label: t("ui.门店列表逗号分隔", "门店列表(逗号分隔)"), type: "textarea" as const, span: 2 as const },
    { key: "distance_km", label: t("ui.距离km", "距离(km)"), type: "number" as const, defaultValue: 0 },
    { key: "status", label: t("common.status", "状态"), type: "select" as const, defaultValue: "ACTIVE",
      options: [
        { label: t("status.active", "启用"),   value: "ACTIVE"   },
        { label: t("status.inactive", "停用"), value: "INACTIVE" },
      ] },
  ];

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editRow, setEditRow]       = useState<Row | null>(null);
  const [deleteRow, setDeleteRow]   = useState<Row | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const refresh = () => setRefreshKey(k => k + 1);
  const close   = () => { setDrawerOpen(false); setEditRow(null); };

  const handleSubmit = useCallback(async (v: Record<string, unknown>) => {
    setSaving(true);
    try {
      editRow?.id
        ? await crudApi.update(TABLE, editRow.id as number, v)
        : await crudApi.create(TABLE, v);
      close(); refresh();
    } finally { setSaving(false); }
  }, [editRow]);

  const handleDelete = useCallback(async () => {
    if (!deleteRow?.id) return;
    setDeleting(true);
    try { await crudApi.delete(TABLE, deleteRow.id as number); setDeleteRow(null); refresh(); }
    finally { setDeleting(false); }
  }, [deleteRow]);

  return (
    <div>
      <PageHeader title={t("ui.配送路线", "配送路线")} subtitle={t("ui.管理配送路线规划及覆盖门店", "管理配送路线规划及覆盖门店（表：log_routes）")} />
      <DataTable<Row>
        table={TABLE}
        columns={COLS}
        showActions
        onNew={() => { setEditRow(null); setDrawerOpen(true); }}
        onEdit={r => { setEditRow(r); setDrawerOpen(true); }}
        onDelete={r => setDeleteRow(r)}
        refreshKey={refreshKey}
      />
      <RightDrawer open={drawerOpen} title={editRow ? t("common.edit", "编辑") : t("common.new", "新增")} onClose={close}>
        <CrudForm
          fields={FIELDS}
          initialValues={(editRow as unknown as Record<string,unknown>) ?? undefined}
          onSubmit={handleSubmit}
          onCancel={close}
          loading={saving}
        />
      </RightDrawer>
      <ConfirmDialog
        open={!!deleteRow}
        title={t("common.confirm", "确认删除")}
        message={t("ui.确定删除该记录", "确定删除该记录？")}
        confirmLabel={t("common.delete", "删除")}
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteRow(null)}
      />
    </div>
  );
}
