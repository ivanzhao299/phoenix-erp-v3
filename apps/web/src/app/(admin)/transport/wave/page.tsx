"use client";
import { useState, useCallback } from "react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { crudApi } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE = "log_dispatch";
type Row = Record<string, unknown>;

export default function Page() {
  const { t } = useLanguage();

  const COLS: Column<Row>[] = [
    { key: "wave_no",    title: t("ui.波次号", "波次号"),  width: 150 },
    { key: "vehicle_no", title: t("ui.车牌号", "车牌号"),  width: 110 },
    { key: "driver_id",  title: t("ui.司机", "司机"),    width: 90  },
    { key: "plan_date",  title: t("common.date", "计划日期"), width: 110 },
    { key: "stores",     title: t("ui.门店列表", "门店列表"), width: 200 },
    { key: "status",     title: t("common.status", "状态"),    width: 90, align: "center" as const },
  ];
  const FIELDS: FormField[] = [
    { key: "wave_no",    label: t("ui.波次号", "波次号"),   type: "text" as const, required: true },
    { key: "vehicle_no", label: t("ui.车牌号", "车牌号"),   type: "text" as const },
    { key: "driver_id",  label: t("ui.司机编号", "司机编号"), type: "text" as const },
    { key: "plan_date",  label: t("common.date", "计划日期"), type: "date" as const },
    { key: "stores",     label: t("ui.门店列表逗号分隔", "门店列表(逗号分隔)"), type: "textarea" as const, span: 2 as const },
    { key: "status", label: t("common.status", "状态"), type: "select" as const, defaultValue: "PENDING",
      options: [
        { label: t("status.pending",   "待出发"), value: "PENDING"    },
        { label: t("ui.装车中",        "装车中"), value: "LOADING"    },
        { label: t("ui.已发运",        "已发运"), value: "DISPATCHED" },
        { label: t("ui.已到达",        "已到达"), value: "ARRIVED"    },
        { label: t("ui.已关闭",        "已关闭"), value: "CLOSED"     },
        { label: t("status.cancelled", "已取消"), value: "CANCELLED"  },
      ] },
  ];

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
      <PageHeader title={t("ui.配送波次", "配送波次")} subtitle={t("ui.管理每次配送的车辆司机和门店波次计划", "管理每次配送的车辆、司机和门店波次计划")} />
      <DataTable<Row>
        table={TABLE}
        columns={COLS}
        showActions
        onNew={() => { setEditRow(null); setDrawerOpen(true); }}
        onEdit={r => { setEditRow(r); setDrawerOpen(true); }}
        onDelete={r => setDeleteRow(r)}
        refreshKey={refreshKey}
      />
      <RightDrawer open={drawerOpen} title={editRow ? t("common.edit", "编辑") : t("common.new", "新增")} onClose={close}>
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
        title={t("common.confirm", "确认删除")}
        message={t("ui.确定删除该记录", "确定删除该记录？")}
        confirmLabel={t("common.delete", "删除")}
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteRow(null)}
      />
    </div>
  );
}
