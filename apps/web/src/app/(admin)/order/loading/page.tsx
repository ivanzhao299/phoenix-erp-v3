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

// ✅ V3 表: log_dispatch
const TABLE = "log_dispatch";

const STATUS_CLS: Record<string,string> = {
  PENDING:    s.badgeWarning,
  LOADING:    s.badgeInfo,
  DISPATCHED: s.badgeSuccess,
  ARRIVED:    s.badgeSuccess,
  CLOSED:     s.badgeNeutral,
};

export default function LoadingPage() {
  const { t } = useLanguage();

  const STATUS_LABEL: Record<string,string> = {
    PENDING:t("status.pending","待发运"), LOADING:t("ui.装车中","装车中"), DISPATCHED:t("ui.已发运","已发运"), ARRIVED:t("ui.已到达","已到达"), CLOSED:t("ui.已关闭","已关闭")
  };

  const COLUMNS = [
    { key: "wave_no",    title: t("ui.波次单号","波次单号"),  width: 160 },
    { key: "vehicle_no", title: t("ui.车辆","车辆"),      width: 110 },
    { key: "driver_id",  title: t("ui.司机","司机"),      width: 100 },
    { key: "plan_date",  title: t("ui.计划日期","计划日期"),  width: 110 },
    { key: "stores",     title: t("ui.覆盖门店","覆盖门店") },
    { key: "status",     title: t("common.status","状态"),      width: 100, align: "center" as const,
      render: (v: unknown) => <span className={`${s.badge} ${STATUS_CLS[String(v)] ?? s.badgeNeutral}`}>{STATUS_LABEL[String(v)] ?? String(v)}</span> },
  ];

  const FIELDS: FormField[] = [
    { key: "wave_no",    label: t("ui.波次单号","波次单号"),   type: "text",   required: true,  placeholder: t("ui.波次单号示例","如：WAVE-20260510-001") },
    { key: "vehicle_no", label: t("ui.车辆编号","车辆编号"),   type: "text",   required: true },
    { key: "driver_id",  label: t("ui.司机编号","司机编号"),   type: "text",   required: false },
    { key: "plan_date",  label: t("ui.计划日期","计划日期"),   type: "date",   required: false },
    { key: "stores",     label: t("ui.覆盖门店","覆盖门店"),   type: "textarea",required: false, placeholder: t("ui.多个门店用逗号分隔","多个门店用逗号分隔"), span: 2 },
    { key: "status",     label: t("common.status","状态"),       type: "select", required: false,
      options: [
        { label: t("status.pending","待发运"), value: "PENDING" },
        { label: t("ui.装车中","装车中"), value: "LOADING" },
        { label: t("ui.已发运","已发运"), value: "DISPATCHED" },
        { label: t("ui.已到达","已到达"), value: "ARRIVED" },
        { label: t("ui.已关闭","已关闭"), value: "CLOSED" },
      ]},
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
      <PageHeader title={t("ui.装车清单","装车清单")} subtitle={t("ui.装车清单副标题","管理配送波次及装车安排")} breadcrumb={[t("ui.物流","物流"), t("ui.装车清单","装车清单")]} />
      <DataTable table={TABLE} columns={COLUMNS} onNew={openNew} onEdit={openEdit}
        onDelete={handleDelete} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑波次","编辑波次") : t("ui.新建波次","新建波次")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title={t("ui.确认删除","确认删除")} message={t("ui.删除不可恢复确认继续","删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
