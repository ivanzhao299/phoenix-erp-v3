"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ✅ V3 表: log_exceptions
// 实际字段: id, wave_no, store_code, type, description, severity, status
const TABLE = "log_exceptions";

const COLUMNS = [
  { key: "wave_no",     title: "波次单号" },
  { key: "store_code",  title: "门店编码" },
  { key: "type",        title: "异常类型" },
  { key: "severity",    title: "严重程度" },
  { key: "status",      title: "处理状态" },
  { key: "description", title: "描述" },
];

const FIELDS: FormField[] = [
  { key: "wave_no",     label: "关联波次单号", type: "text",   required: true },
  { key: "store_code",  label: "门店编码",     type: "text",   required: false },
  { key: "type",        label: "异常类型",     type: "select", required: true,
    options: [{ label: "短缺", value: "SHORTAGE" }, { label: "破损", value: "BREAKAGE" },
              { label: "延误", value: "DELAY" },    { label: "其他", value: "OTHER" }] },
  { key: "severity",    label: "严重程度",     type: "select", required: false,
    options: [{ label: "低", value: "LOW" }, { label: "中", value: "MEDIUM" }, { label: "高", value: "HIGH" }] },
  { key: "status",      label: "处理状态",     type: "select", required: false,
    options: [{ label: "待处理", value: "OPEN" }, { label: "处理中", value: "IN_PROGRESS" }, { label: "已关闭", value: "CLOSED" }] },
  { key: "description", label: "异常描述",     type: "textarea", required: false, span: 2 },
];

export default function LogExceptionsPage() {
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
      <PageHeader title="物流异常" subtitle="记录配送波次中的物流异常事件（表：log_exceptions）" />
      <DataTable table={TABLE} columns={COLUMNS as any} onNew={openNew} onEdit={openEdit as any}
        onDelete={handleDelete as any} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? "编辑异常记录" : "新增异常记录"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
