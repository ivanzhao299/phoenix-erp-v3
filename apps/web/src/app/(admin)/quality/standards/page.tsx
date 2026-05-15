"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
const STATUS_CLS: Record<string,string> = {"active":s.badgeSuccess, "ACTIVE":s.badgeSuccess, "inactive":s.badgeNeutral};


// ✅ V3 表: qa_standards
// 实际字段: id, std_code, name, category, threshold, unit, status
const TABLE = "qa_standards";

const COLUMNS = [
  { key: "std_code",  title: "标准编码" },
  { key: "name",      title: "标准名称" },
  { key: "category",  title: "分类" },
  { key: "threshold", title: "阈值" },
  { key: "unit",      title: "单位" },
  { key: "status",    title: "状态"},
];

const FIELDS: FormField[] = [
  { key: "std_code",  label: "标准编码", type: "text",   required: true,  placeholder: "如：QA-EGG-GRADE-A" },
  { key: "name",      label: "标准名称", type: "text",   required: true },
  { key: "category",  label: "分类",     type: "select", required: false,
    options: [{ label: "蛋品规格", value: "EGG_GRADE" }, { label: "重量标准", value: "WEIGHT" },
              { label: "外观标准", value: "APPEARANCE" }, { label: "卫生标准", value: "HYGIENE" }] },
  { key: "threshold", label: "阈值",     type: "number", required: false },
  { key: "unit",      label: "单位",     type: "text",   required: false, placeholder: "如：g、mm、个" },
  { key: "status",    label: "状态",     type: "select", required: false,
    options: [{ label: "启用", value: "ACTIVE"}, { label: "停用", value: "INACTIVE" }] },
];

export default function QaStandardsPage() {
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
      <PageHeader
        breadcrumb={["品质追溯","质检标准"]} title="质量标准" subtitle="管理产品品质检测基准参数（表：qa_standards）" />
      <DataTable table={TABLE} columns={COLUMNS as any} onNew={openNew} onEdit={openEdit as any}
        onDelete={handleDelete as any} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? "编辑标准" : "新增标准"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
