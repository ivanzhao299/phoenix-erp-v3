"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

const STATUS_CLS: Record<string,string> = {"ACTIVE":s.badgeSuccess, "INACTIVE":s.badgeNeutral};

// ✅ V3 表: qa_standards
const TABLE = "qa_standards";

export default function QaStandardsPage() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "std_code",  title: t("ui.标准编码","标准编码") },
    { key: "name",      title: t("ui.标准名称","标准名称") },
    { key: "category",  title: t("ui.分类","分类") },
    { key: "threshold", title: t("ui.阈值","阈值") },
    { key: "unit",      title: t("ui.单位","单位") },
    { key: "status",    title: t("common.status","状态") },
  ];

  const FIELDS: FormField[] = [
    { key: "std_code",  label: t("ui.标准编码","标准编码"), type: "text",   required: true,  placeholder: t("ui.标准编码示例","如：QA-EGG-GRADE-A") },
    { key: "name",      label: t("ui.标准名称","标准名称"), type: "text",   required: true },
    { key: "category",  label: t("ui.分类","分类"),     type: "select", required: false,
      options: [
        { label: t("ui.蛋品规格","蛋品规格"), value: "EGG_GRADE" },
        { label: t("ui.重量标准","重量标准"), value: "WEIGHT" },
        { label: t("ui.外观标准","外观标准"), value: "APPEARANCE" },
        { label: t("ui.卫生标准","卫生标准"), value: "HYGIENE" },
      ]},
    { key: "threshold", label: t("ui.阈值","阈值"),     type: "number", required: false },
    { key: "unit",      label: t("ui.单位","单位"),     type: "text",   required: false, placeholder: t("ui.单位示例","如：g、mm、个") },
    { key: "status",    label: t("common.status","状态"),     type: "select", required: false,
      options: [{ label: t("status.active","启用"), value: "ACTIVE"}, { label: t("status.inactive","停用"), value: "INACTIVE" }] },
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
      <PageHeader
        breadcrumb={[t("ui.品质追溯","品质追溯"), t("ui.质检标准","质检标准")]} title={t("ui.质量标准","质量标准")} subtitle={t("ui.质量标准副标题","管理产品品质检测基准参数")} />
      <DataTable table={TABLE} columns={COLUMNS} onNew={openNew} onEdit={openEdit}
        onDelete={handleDelete} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑标准","编辑标准") : t("ui.新增标准","新增标准")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title={t("ui.确认删除","确认删除")} message={t("ui.删除不可恢复确认继续","删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
