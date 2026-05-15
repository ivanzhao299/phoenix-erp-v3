"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const TABLE = "prc_receipts";
const TITLE = "饲料核对";

const COLUMNS = [
    { key: "receipt_no", title: "收货单号" },
    { key: "item_name", title: "饲料名称" },
    { key: "actual_qty", title: "到货量（kg）" },
    { key: "arrive_date", title: "到货日期" },
    { key: "supplier_code", title: "供应商" },
    { key: "status", title: "状态" },
];

const FIELDS: FormField[] = [
    { key: "receipt_no", label: "收货单号", type: "readonly" },
    { key: "supplier_code", label: "供应商", type: "text", required: true },
    { key: "item_name", label: "饲料/物料名称", type: "text", required: true },
    { key: "expected_qty", label: "计划数量", type: "number" },
    { key: "actual_qty", label: "实收数量", type: "number", required: true },
    { key: "arrive_date", label: "到货日期", type: "date" },
    { key: "status", label: "验收结论", type: "select", options: [{ label: "通过", value: "ACCEPTED" }, { label: "部分", value: "PARTIAL" }, { label: "拒收", value: "REJECTED" }] },
];

export default function 饲料核对Page() {
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
      <PageHeader title={TITLE} subtitle="核对饲料采购到货与设备消耗对比（表：prc_receipts）" />
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
