"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE = "brd_daily_logs";

export default function ProductionPage() {
  const { t } = useLanguage();
  const TITLE = t('ui.生产报表', '生产报表');

  const COLUMNS = [
      { key: "log_date", title: t('common.date', '日期') },
      { key: "house_code", title: t('ui.鸡舍', '鸡舍') },
      { key: "flock_no", title: t('ui.鸡群', '鸡群') },
      { key: "eggs_produced", title: t('ui.产蛋数', '产蛋数') },
      { key: "bad_eggs", title: t('ui.坏蛋', '坏蛋') },
      { key: "operator", title: t('ui.操作员', '操作员') },
  ];

  const FIELDS: FormField[] = [
      { key: "flock_no", label: t('ui.鸡群编号', '鸡群编号'), type: "text", required: true },
      { key: "house_code", label: t('ui.鸡舍编码', '鸡舍编码'), type: "text", required: true },
      { key: "log_date", label: t('common.date', '日期'), type: "date", required: true },
      { key: "shift", label: t('ui.班次', '班次'), type: "select", options: [{ label: t('ui.早班', '早班'), value: "MORNING" }, { label: t('ui.午班', '午班'), value: "AFTERNOON" }, { label: t('ui.晚班', '晚班'), value: "EVENING" }] },
      { key: "eggs_produced", label: t('ui.产蛋数量', '产蛋数量'), type: "number" },
      { key: "bad_eggs", label: t('ui.坏蛋数', '坏蛋数'), type: "number" },
      { key: "dirty_eggs", label: t('ui.脏蛋数', '脏蛋数'), type: "number" },
      { key: "broken_eggs", label: t('ui.破蛋数', '破蛋数'), type: "number" },
      { key: "operator", label: t('ui.操作员', '操作员'), type: "text" },
      { key: "note", label: t('common.remark', '备注'), type: "textarea" },
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
      <PageHeader title={TITLE} subtitle={t('ui.按日期和鸡舍汇总生产数据', '按日期和鸡舍汇总生产数据（表：brd_daily_logs）')} />
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
