"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ✅ V3 表: wms_warehouses
const TABLE = "wms_warehouses";
// B4: wms_warehouses 真实列 warehouse_code / warehouse_name_zh / warehouse_name_lo / address / manager / status
//     原 warehouse_name / contact 字段在 DB 不存在 — 写入静默丢失
const COLUMNS = [
    { key: "warehouse_code",    title: "仓库编码", width: 110 },
    { key: "warehouse_name_zh", title: "仓库名称(中)", width: 160 },
    { key: "warehouse_name_lo", title: "仓库名称(老)", width: 160 },
    { key: "address",           title: "地址" },
    { key: "manager",           title: "负责人",   width: 100 },
    { key: "status",            title: "状态",     width: 80  },
];
const FIELDS: FormField[] = [
  { key: "warehouse_code",    label: "仓库编码",     type: "text", required: true, placeholder: "如：WH-001" },
  { key: "warehouse_name_zh", label: "仓库名称(中)", type: "text", required: true },
  { key: "warehouse_name_lo", label: "仓库名称(老)", type: "text" },
  { key: "address",           label: "地址",         type: "textarea" },
  { key: "manager",           label: "负责人",       type: "text" },
  { key: "status", label: "状态", type: "select", options: [{ label: "启用", value: "ACTIVE" }, { label: "停用", value: "INACTIVE" }] },
];

export default function Page() {
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
  const handleSave  = useCallback(async (values: Record<string, unknown>) => {
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
      <PageHeader title="仓库主档" subtitle="管理仓库基础信息（表：wms_warehouses）" />
      <DataTable table={TABLE} columns={COLUMNS as any} onNew={openNew} onEdit={openEdit as any}
        onDelete={handleDelete as any} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? "编辑仓库主档" : "新增仓库主档"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
