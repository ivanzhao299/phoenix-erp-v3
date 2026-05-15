"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const TABLE = "inv_batches";
const TITLE = "反向追溯";

const COLUMNS = [
    { key: "batch_no", title: "批次号" },
    { key: "house_code", title: "来源鸡舍" },
    { key: "grading_date", title: "分级日期" },
    { key: "sku_code", title: "品级" },
    { key: "qty", title: "数量" },
    { key: "status", title: "状态" },
];

const FIELDS: FormField[] = [
    { key: "batch_no", label: "批次号", type: "text", required: true },
    { key: "house_code", label: "来源鸡舍", type: "text" },
    { key: "sku_code", label: "品级编码", type: "text" },
    { key: "grading_date", label: "分级日期", type: "date" },
    { key: "qty", label: "数量", type: "number" },
    { key: "pack_type", label: "包装类型", type: "text" },
    { key: "status", label: "状态", type: "select", options: [{ label: "可用", value: "AVAILABLE" }, { label: "已锁定", value: "LOCKED" }, { label: "已出库", value: "OUTBOUND" }, { label: "已报废", value: "SCRAPPED" }] },
];

export default function BackwardTracePage() {
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editing, setEditing]           = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving]             = useState(false);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const openNew  = useCallback(() => { setEditing(null);  setDrawerOpen(true); }, []);
  const openEdit = useCallback((row: Record<string, unknown>) => { setEditing(row); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await crudApi.update(TABLE, editing.id as number, values);
      } else {
        await crudApi.create(TABLE, values);
      }
      setDrawerOpen(false);
      refresh();
    } finally {
      setSaving(false);
    }
  }, [editing, refresh]);

  const handleDelete = useCallback((row: Record<string, unknown>) => {
    setDeleteTarget(row);
    setConfirmOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false);
    refresh();
  }, [deleteTarget, refresh]);

  return (
    <div>
      <PageHeader title={TITLE} subtitle="从批次反向追溯到源头生产记录（表：inv_batches）" />
      <DataTable
        table={TABLE}
        columns={COLUMNS as any}
        onNew={openNew}
        onEdit={openEdit as any}
        onDelete={handleDelete as any}
        showActions
        refreshKey={refreshKey}
      />
      <RightDrawer open={drawerOpen} title={editing ? `编辑${TITLE}` : `新增${TITLE}`} onClose={closeDrawer}>
        <CrudForm
          fields={FIELDS}
          initialValues={editing ?? {}}
          onSubmit={handleSave}
          onCancel={closeDrawer}
          loading={saving}
        />
      </RightDrawer>
      <ConfirmDialog
        open={confirmOpen}
        title="确认删除"
        message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
