"use client";
import { useState, useCallback } from "react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { crudApi } from "@/lib/api-client";

const TABLE = "log_dispatch";
type Row = Record<string, unknown>;

const COLS: Column<Row>[] = [
  { key: "wave_no",    title: "波次号",  width: 150 },
  { key: "vehicle_no", title: "车牌号",  width: 110 },
  { key: "driver_id",  title: "司机",    width: 90  },
  { key: "plan_date",  title: "计划日期", width: 110 },
  { key: "stores",     title: "门店列表", width: 200 },
  { key: "status",     title: "状态",    width: 90, align: "center" as const },
];
const FIELDS: FormField[] = [
  { key: "wave_no",    label: "波次号",   type: "text" as const, required: true },
  { key: "vehicle_no", label: "车牌号",   type: "text" as const },
  { key: "driver_id",  label: "司机编号", type: "text" as const },
  { key: "plan_date",  label: "计划日期", type: "date" as const },
  { key: "stores",     label: "门店列表(逗号分隔)", type: "textarea" as const, span: 2 as const },
  { key: "status", label: "状态", type: "select" as const, defaultValue: "PENDING",
    options: [{label:"待出发",value:"PENDING"},{label:"配送中",value:"IN_TRANSIT"},{label:"已完成",value:"COMPLETED"},{label:"已取消",value:"CANCELLED"}] },
];

export default function Page() {
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
      <PageHeader title="配送波次" subtitle="管理每次配送的车辆、司机和门店波次计划" />
      <DataTable<Row>
        table={TABLE}
        columns={COLS}
        showActions
        onNew={() => { setEditRow(null); setDrawerOpen(true); }}
        onEdit={r => { setEditRow(r); setDrawerOpen(true); }}
        onDelete={r => setDeleteRow(r)}
        refreshKey={refreshKey}
      />
      <RightDrawer open={drawerOpen} title={editRow ? "编辑" : "新增"} onClose={close}>
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
        title="确认删除"
        message="确定删除该记录？"
        confirmLabel="删除"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteRow(null)}
      />
    </div>
  );
}
