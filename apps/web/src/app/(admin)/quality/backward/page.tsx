"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE = "inv_batches";

export default function BackwardTracePage() {
  const { t } = useLanguage();

  const TITLE = t("ui.反向追溯","反向追溯");

  const COLUMNS = [
    { key: "batch_no", title: t("ui.批次号","批次号") },
    { key: "house_code", title: t("ui.来源鸡舍","来源鸡舍") },
    { key: "grading_date", title: t("ui.分级日期","分级日期") },
    { key: "sku_code", title: t("ui.品级","品级") },
    { key: "qty", title: t("ui.数量","数量") },
    { key: "status", title: t("common.status","状态") },
  ];

  const FIELDS: FormField[] = [
    { key: "batch_no", label: t("ui.批次号","批次号"), type: "text", required: true },
    { key: "house_code", label: t("ui.来源鸡舍","来源鸡舍"), type: "text" },
    { key: "sku_code", label: t("ui.品级编码","品级编码"), type: "text" },
    { key: "grading_date", label: t("ui.分级日期","分级日期"), type: "date" },
    { key: "qty", label: t("ui.数量","数量"), type: "number" },
    { key: "pack_type", label: t("ui.包装类型","包装类型"), type: "text" },
    { key: "status", label: t("common.status","状态"), type: "select", options: [
      { label: t("ui.可用","可用"), value: "AVAILABLE" },
      { label: t("ui.已锁定","已锁定"), value: "LOCKED" },
      { label: t("ui.已出库","已出库"), value: "OUTBOUND" },
      { label: t("ui.已报废","已报废"), value: "SCRAPPED" },
    ]},
  ];

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
      <PageHeader title={TITLE} subtitle={t("ui.反向追溯副标题","从批次反向追溯到源头生产记录（表：inv_batches）")} />
      <DataTable
        table={TABLE}
        columns={COLUMNS}
        onNew={openNew}
        onEdit={openEdit}
        onDelete={handleDelete}
        showActions
        refreshKey={refreshKey}
      />
      <RightDrawer open={drawerOpen} title={editing ? `${t("common.edit","编辑")}${TITLE}` : `${t("common.new","新增")}${TITLE}`} onClose={closeDrawer}>
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
        title={t("ui.确认删除","确认删除")}
        message={t("ui.删除不可恢复确认继续","删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
