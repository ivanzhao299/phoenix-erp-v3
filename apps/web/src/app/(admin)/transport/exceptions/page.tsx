"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegacyFreezeBanner } from "@/components/LegacyFreezeBanner";

// ✅ V3 表: log_exceptions
// 实际字段: id, wave_no, store_code, type, description, severity, status
const TABLE = "log_exceptions";

export default function LogExceptionsPage() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "wave_no",     title: t("ui.波次单号", "波次单号") },
    { key: "store_code",  title: t("ui.门店编码", "门店编码") },
    { key: "type",        title: t("ui.异常类型", "异常类型") },
    { key: "severity",    title: t("ui.严重程度", "严重程度") },
    { key: "status",      title: t("ui.处理状态", "处理状态") },
    { key: "description", title: t("ui.描述", "描述") },
  ];

  const FIELDS: FormField[] = [
    { key: "wave_no",     label: t("ui.关联波次单号", "关联波次单号"), type: "text",   required: true },
    { key: "store_code",  label: t("ui.门店编码", "门店编码"),     type: "text",   required: false },
    { key: "type",        label: t("ui.异常类型", "异常类型"),     type: "select", required: true,
      options: [
        { label: t("ui.短缺", "短缺"), value: "SHORTAGE" },
        { label: t("ui.破损", "破损"), value: "BREAKAGE" },
        { label: t("ui.延误", "延误"), value: "DELAY"    },
        { label: t("ui.其他", "其他"), value: "OTHER"    },
      ] },
    { key: "severity",    label: t("ui.严重程度", "严重程度"),     type: "select", required: false,
      options: [
        { label: t("ui.低", "低"), value: "LOW"    },
        { label: t("ui.中", "中"), value: "MEDIUM" },
        { label: t("ui.高", "高"), value: "HIGH"   },
      ] },
    { key: "status",      label: t("ui.处理状态", "处理状态"),     type: "select", required: false,
      options: [
        { label: t("status.pending", "待处理"),  value: "OPEN"        },
        { label: t("ui.处理中", "处理中"),       value: "IN_PROGRESS" },
        { label: t("ui.已关闭", "已关闭"),       value: "CLOSED"      },
      ] },
    { key: "description", label: t("ui.异常描述", "异常描述"),     type: "textarea", required: false, span: 2 },
  ];

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
      <PageHeader title={t("ui.物流异常", "物流异常")} subtitle={t("ui.记录配送波次中的物流异常事件", "记录配送波次中的物流异常事件（表：log_exceptions）")} />
      <LegacyFreezeBanner message="当前模块已冻结，仅保留历史查询，请使用新版配送管理。" newPath="/sales2/delivery" newModuleName="新版配送管理" />
      <DataTable table={TABLE} columns={COLUMNS} onNew={openNew} onEdit={openEdit}
        onDelete={handleDelete} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑异常记录", "编辑异常记录") : t("ui.新增异常记录", "新增异常记录")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title={t("common.confirm", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
