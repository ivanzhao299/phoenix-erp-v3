"use client";
import { useState, useCallback } from "react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { crudApi } from "@/lib/api-client";

const TABLE = "log_routes";
type Row = Record<string, unknown>;

const COLS: Column<Row>[] = [
  { key: "route_code",  title: "路线编号", width: 120 },
  { key: "name",        title: "路线名称", width: 160 },
  { key: "stores",      title: "覆盖门店", width: 200 },
  { key: "distance_km", title: "距离(km)", width: 100, align: "right" as const },
  { key: "status",      title: "状态",    width: 90, align: "center" as const },
];
const FIELDS: FormField[] = [
  { key: "route_code",  label: "路线编号", type: "text" as const, required: true },
  { key: "name",        label: "路线名称", type: "text" as const, required: true },
  { key: "stores",      label: "门店列表(逗号分隔)", type: "textarea" as const, span: 2 as const },
  { key: "distance_km", label: "距离(km)", type: "number" as const, defaultValue: 0 },
  { key: "status", label: "状态", type: "select" as const, defaultValue: "ACTIVE",
    options: [{label:"启用",value:"ACTIVE"},{label:"停用",value:"INACTIVE"}] },
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
      <PageHeader title="配送跟踪" subtitle="查看配送路线规划和门店到达情况" />
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
