"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 表: log_drivers
// 实际字段: id, driver_id, name, phone, license_no, status
const TABLE = "log_drivers";

export default function DriversPage() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "driver_id",  title: t("ui.司机编号", "司机编号") },
    { key: "name",       title: t("ui.姓名", "姓名") },
    { key: "phone",      title: t("ui.手机号", "手机号") },
    { key: "license_no", title: t("ui.驾照号", "驾照号") },
    { key: "status",     title: t("common.status", "状态") },
  ];

  const FIELDS: FormField[] = [
    { key: "driver_id",  label: t("ui.司机编号", "司机编号"),   type: "text",   required: true,  placeholder: t("ui.如DRV001", "如：DRV-001") },
    { key: "name",       label: t("ui.司机姓名", "司机姓名"),   type: "text",   required: true },
    { key: "phone",      label: t("ui.手机号码", "手机号码"),   type: "text",   required: false },
    { key: "license_no", label: t("ui.驾照号码", "驾照号码"),   type: "text",   required: false },
    { key: "status",     label: t("common.status", "状态"),       type: "select", required: false,
      options: [
        { label: t("ui.在职", "在职"), value: "ACTIVE"   },
        { label: t("ui.离职", "离职"), value: "INACTIVE" },
      ] },
  ];

  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editing, setEditing]           = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving]             = useState(false);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);

  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew     = useCallback(() => { setEditing(null); setDrawerOpen(true); }, []);
  const openEdit    = useCallback((row: Record<string, unknown>) => { setEditing(row); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      editing?.id ? await crudApi.update(TABLE, editing.id as number, values)
                  : await crudApi.create(TABLE, values);
      setDrawerOpen(false); refresh();
    } finally { setSaving(false); }
  }, [editing, refresh]);

  const handleDelete  = useCallback((row: Record<string, unknown>) => { setDeleteTarget(row); setConfirmOpen(true); }, []);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh]);

  return (
    <div>
      <PageHeader title={t("ui.司机档案", "司机档案")} subtitle={t("ui.管理配送司机基础信息", "管理配送司机基础信息（表：log_drivers）")} />
      <DataTable table={TABLE} columns={COLUMNS} onNew={openNew} onEdit={openEdit}
        onDelete={handleDelete} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑司机", "编辑司机") : t("ui.新增司机", "新增司机")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title={t("common.confirm", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
