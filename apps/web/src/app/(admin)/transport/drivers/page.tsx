"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ✅ V3 表: log_drivers
// 实际字段: id, driver_id, name, phone, license_no, status
const TABLE = "log_drivers";

const COLUMNS = [
  { key: "driver_id",  title: "司机编号" },
  { key: "name",       title: "姓名" },
  { key: "phone",      title: "手机号" },
  { key: "license_no", title: "驾照号" },
  { key: "status",     title: "状态" },
];

const FIELDS: FormField[] = [
  { key: "driver_id",  label: "司机编号",   type: "text",   required: true,  placeholder: "如：DRV-001" },
  { key: "name",       label: "司机姓名",   type: "text",   required: true },
  { key: "phone",      label: "手机号码",   type: "text",   required: false },
  { key: "license_no", label: "驾照号码",   type: "text",   required: false },
  { key: "status",     label: "状态",       type: "select", required: false,
    options: [{ label: "在职", value: "ACTIVE" }, { label: "离职", value: "INACTIVE" }] },
];

export default function DriversPage() {
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
      <PageHeader title="司机档案" subtitle="管理配送司机基础信息（表：log_drivers）" />
      <DataTable table={TABLE} columns={COLUMNS as any} onNew={openNew} onEdit={openEdit as any}
        onDelete={handleDelete as any} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? "编辑司机" : "新增司机"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
