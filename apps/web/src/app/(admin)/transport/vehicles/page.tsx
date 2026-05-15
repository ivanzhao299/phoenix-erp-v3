"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ✅ V3 表: log_vehicles
// 实际字段: id, vehicle_no, plate, type, capacity, driver_id, status
const TABLE = "log_vehicles";

const COLUMNS = [
  { key: "vehicle_no", title: "车辆编号" },
  { key: "plate",      title: "车牌号" },
  { key: "type",       title: "车型" },
  { key: "capacity",   title: "载重(件)" },
  { key: "driver_id",  title: "绑定司机" },
  { key: "status",     title: "状态" },
];

const FIELDS: FormField[] = [
  { key: "vehicle_no", label: "车辆编号",   type: "text",   required: true,  placeholder: "如：VH-001" },
  { key: "plate",      label: "车牌号",     type: "text",   required: true,  placeholder: "如：粤A12345" },
  { key: "type",       label: "车型",       type: "select", required: false,
    options: [{ label: "厢式货车", value: "VAN" }, { label: "皮卡", value: "PICKUP" }, { label: "卡车", value: "TRUCK" }] },
  { key: "capacity",   label: "载重量(件)", type: "number", required: false },
  { key: "driver_id",  label: "绑定司机ID", type: "text",   required: false },
  { key: "status",     label: "状态",       type: "select", required: false,
    options: [{ label: "在用", value: "ACTIVE" }, { label: "停用", value: "INACTIVE" }, { label: "维修中", value: "MAINTENANCE" }] },
];

export default function VehiclesPage() {
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
      <PageHeader title="车辆档案" subtitle="管理配送车辆基础信息（表：log_vehicles）" />
      <DataTable table={TABLE} columns={COLUMNS as any} onNew={openNew} onEdit={openEdit as any}
        onDelete={handleDelete as any} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? "编辑车辆" : "新增车辆"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
