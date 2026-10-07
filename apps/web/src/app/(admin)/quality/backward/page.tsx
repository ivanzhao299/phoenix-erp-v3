"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { formatMasterData } from '@/lib/business-display';
import { MasterLabel } from '@/components/MasterNameCode';
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE = "inv_batches";

export default function BackwardTracePage() {
  const { t, lang } = useLanguage();

  const TITLE = t("ui.反向追溯","反向追溯");

  const COLUMNS = [
    { key: "batch_no",       title: t("ui.批次号","批次号") },
    { key: "product_code",   title: t("ui.产品编码","产品编码") , render: (v: unknown, row: Record<string, unknown>) => <MasterLabel>{formatMasterData(row, 'product_name', v, lang)}</MasterLabel> },
    { key: "warehouse_code", title: t("ui.仓库","仓库") , render: (v: unknown, row: Record<string, unknown>) => <MasterLabel>{formatMasterData(row, 'warehouse_name', v, lang, { canonicalFallback: true })}</MasterLabel> },
    { key: "location_code",  title: t("ui.库位","库位") , render: (v: unknown, row: Record<string, unknown>) => <MasterLabel>{formatMasterData(row, 'location_name', v, lang)}</MasterLabel> },
    { key: "qty",            title: t("ui.总数量","总数量") },
    { key: "qty_available",  title: t("ui.可用数量","可用数量") },
    { key: "expire_date",    title: t("ui.过期日期","过期日期") },
    { key: "status",         title: t("common.status","状态") },
  ];

  const FIELDS: FormField[] = [
    { key: "batch_no",       label: t("ui.批次号","批次号"),     type: "batch", required: true, onPickKeys: { product_code: "product_code", warehouse_code: "warehouse_code" } },
    { key: "product_code",   label: t("ui.产品编码","产品编码"), type: "sku" },
    { key: "warehouse_code", label: t("ui.仓库","仓库"), type: "warehouse" },
    { key: "location_code",  label: t("ui.库位","库位"), type: "location", filterBy: { warehouseField: "warehouse_code" } },
    { key: "qty",            label: t("ui.总数量","总数量"),     type: "number" },
    { key: "qty_available",  label: t("ui.可用数量","可用数量"), type: "number" },
    { key: "expire_date",    label: t("ui.过期日期","过期日期"), type: "date" },
    { key: "status", label: t("common.status","状态"), type: "select", options: [
      { label: t("ui.可用","可用"),   value: "AVAILABLE" },
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
      <PageHeader title={TITLE} subtitle={t("ui.反向追溯副标题","从批次号反向查询仓库位置、产品信息及库存状态")} />
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
