"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const TABLE = "brd_daily_logs";
const TITLE = "生产报表";

const COLUMNS = [
    { key: "log_date", title: "日期" },
    { key: "house_code", title: "鸡舍" },
    { key: "flock_no", title: "鸡群" },
    { key: "eggs_produced", title: "产蛋数" },
    { key: "bad_eggs", title: "坏蛋" },
    { key: "operator", title: "操作员" },
];

const FIELDS: FormField[] = [
    { key: "flock_no", label: "鸡群编号", type: "text", required: true },
    { key: "house_code", label: "鸡舍编码", type: "text", required: true },
    { key: "log_date", label: "日期", type: "date", required: true },
    { key: "shift", label: "班次", type: "select", options: [{ label: "早班", value: "MORNING" }, { label: "午班", value: "AFTERNOON" }, { label: "晚班", value: "EVENING" }] },
    { key: "eggs_produced", label: "产蛋数量", type: "number" },
    { key: "bad_eggs", label: "坏蛋数", type: "number" },
    { key: "dirty_eggs", label: "脏蛋数", type: "number" },
    { key: "broken_eggs", label: "破蛋数", type: "number" },
    { key: "operator", label: "操作员", type: "text" },
    { key: "note", label: "备注", type: "textarea" },
];

export default function 生产报表Page() {
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
      <PageHeader title={TITLE} subtitle="按日期和鸡舍汇总生产数据（表：brd_daily_logs）" />
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
