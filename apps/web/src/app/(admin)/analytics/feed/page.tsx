"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE = "prc_receipts";

export default function FeedPage() {
  const { t } = useLanguage();
  const TITLE = t('ui.饲料核对', '饲料核对');

  const COLUMNS = [
      { key: "receipt_no", title: t('ui.收货单号', '收货单号') },
      { key: "item_name", title: t('ui.饲料名称', '饲料名称') },
      { key: "actual_qty", title: t('ui.到货量kg', '到货量（kg）') },
      { key: "arrive_date", title: t('ui.到货日期', '到货日期') },
      { key: "supplier_code", title: t('ui.供应商', '供应商') },
      { key: "status", title: t('common.status', '状态') },
  ];

  const FIELDS: FormField[] = [
      { key: "receipt_no", label: t('ui.收货单号', '收货单号'), type: "readonly" },
      { key: "supplier_code", label: t('ui.供应商', '供应商'), type: "text", required: true },
      { key: "item_name", label: t('ui.饲料物料名称', '饲料/物料名称'), type: "text", required: true },
      { key: "expected_qty", label: t('ui.计划数量', '计划数量'), type: "number" },
      { key: "actual_qty", label: t('ui.实收数量', '实收数量'), type: "number", required: true },
      { key: "arrive_date", label: t('ui.到货日期', '到货日期'), type: "date" },
      { key: "status", label: t('ui.验收结论', '验收结论'), type: "select", options: [{ label: t('ui.通过', '通过'), value: "ACCEPTED" }, { label: t('ui.部分', '部分'), value: "PARTIAL" }, { label: t('ui.拒收', '拒收'), value: "REJECTED" }] },
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
      <PageHeader title={TITLE} subtitle={t('ui.核对饲料采购到货与设备消耗对比', '核对饲料采购到货与设备消耗对比（表：prc_receipts）')} />
      <DataTable
        table={TABLE}
        columns={COLUMNS}
        onNew={openNew}
        onEdit={openEdit}
        onDelete={handleDelete}
        showActions
        refreshKey={refreshKey}
      />
      <RightDrawer open={drawerOpen} title={editing ? `${t('common.edit', '编辑')}${TITLE}` : `${t('common.new', '新增')}${TITLE}`} onClose={closeDrawer}>
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
        title={t('common.confirm', '确认删除')}
        message={t('ui.删除后不可恢复确认继续', '删除后不可恢复，确认继续？')}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
