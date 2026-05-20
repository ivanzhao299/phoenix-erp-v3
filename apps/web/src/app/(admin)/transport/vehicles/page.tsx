"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 表: log_vehicles
// 实际字段: id, vehicle_no, plate, type, capacity, driver_id, status
const TABLE = "log_vehicles";

export default function VehiclesPage() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "vehicle_no", title: t("ui.车辆编号", "车辆编号") },
    { key: "plate",      title: t("ui.车牌号", "车牌号") },
    { key: "type",       title: t("ui.车型", "车型") },
    { key: "capacity",   title: t("ui.载重件", "载重(件)") },
    { key: "driver_id",  title: t("ui.绑定司机", "绑定司机") },
    { key: "status",     title: t("common.status", "状态") },
  ];

  const FIELDS: FormField[] = [
    { key: "vehicle_no", label: t("ui.车辆编号", "车辆编号"),   type: "text",   required: true,  placeholder: t("ui.如VH001", "如：VH-001") },
    { key: "plate",      label: t("ui.车牌号", "车牌号"),     type: "text",   required: true,  placeholder: t("ui.如粤A12345", "如：粤A12345") },
    { key: "type",       label: t("ui.车型", "车型"),       type: "select", required: false,
      options: [
        { label: t("ui.厢式货车", "厢式货车"), value: "VAN"    },
        { label: t("ui.皮卡", "皮卡"),       value: "PICKUP" },
        { label: t("ui.卡车", "卡车"),       value: "TRUCK"  },
      ] },
    { key: "capacity",   label: t("ui.载重量件", "载重量(件)"), type: "number", required: false },
    { key: "driver_id",  label: t("ui.绑定司机ID", "绑定司机ID"), type: "text",   required: false },
    { key: "status",     label: t("common.status", "状态"),       type: "select", required: false,
      options: [
        { label: t("ui.在用", "在用"),   value: "ACTIVE"      },
        { label: t("status.inactive", "停用"), value: "INACTIVE"    },
        { label: t("ui.维修中", "维修中"), value: "MAINTENANCE" },
      ] },
  ];

  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editing, setEditing]           = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving]             = useState(false);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);

  const refresh   = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew   = useCallback(() => { setEditing(null); setDrawerOpen(true); }, []);
  const openEdit  = useCallback((row: Record<string, unknown>) => { setEditing(row); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      editing?.id ? await crudApi.update(TABLE, editing.id as number, values)
                  : await crudApi.create(TABLE, values);
      setDrawerOpen(false);
      refresh();
    } finally { setSaving(false); }
  }, [editing, refresh]);

  const handleDelete = useCallback((row: Record<string, unknown>) => {
    setDeleteTarget(row); setConfirmOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh]);

  return (
    <div>
      <PageHeader title={t("ui.车辆档案", "车辆档案")} subtitle={t("ui.管理配送车辆基础信息", "管理配送车辆基础信息（表：log_vehicles）")} />
      <DataTable table={TABLE} columns={COLUMNS} onNew={openNew} onEdit={openEdit}
        onDelete={handleDelete} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑车辆", "编辑车辆") : t("ui.新增车辆", "新增车辆")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title={t("common.confirm", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
