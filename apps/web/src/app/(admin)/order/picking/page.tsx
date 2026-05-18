"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 表: ord_orders（拣货任务通过订单状态管理）
const TABLE = "ord_orders";

export default function PickingPage() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "order_no",      title: t("ui.订单号","订单号") },
    { key: "customer_code", title: t("ui.客户","客户") },
    { key: "total_amount",  title: t("common.amount","金额") },
    { key: "status",        title: t("ui.订单状态","订单状态") },
    { key: "sales_rep",     title: t("ui.销售员","销售员") },
    { key: "created_at",    title: t("ui.下单时间","下单时间") },
  ];

  const FIELDS: FormField[] = [
    { key: "order_no",      label: t("ui.订单号","订单号"),   type: "readonly", required: false },
    { key: "customer_code", label: t("ui.客户编码","客户编码"), type: "text",     required: true },
    { key: "sales_rep",     label: t("ui.销售员","销售员"),   type: "text",     required: false },
    { key: "total_amount",  label: t("ui.订单金额","订单金额"), type: "number",   required: false },
    { key: "status",        label: t("common.status","状态"),     type: "select",   required: false,
      options: [
        { label: t("status.pending","待审批"),  value: "pending" },
        { label: t("status.approved","已审批"),  value: "approved" },
        { label: t("ui.已锁定","已锁定"),  value: "locked" },
        { label: t("ui.已分配","已分配"),  value: "allocated" },
        { label: t("status.shipped","已发货"),  value: "shipped" },
        { label: t("ui.已签收","已签收"),  value: "received" },
        { label: t("ui.已核销","已核销"),  value: "reconciled" },
      ]},
    { key: "is_urgent",     label: t("ui.加急","加急"),     type: "select",   required: false,
      options: [{ label: t("ui.是","是"), value: "true" }, { label: t("ui.否","否"), value: "false" }] },
    { key: "remark",        label: t("common.remark","备注"),     type: "textarea", required: false, span: 2 },
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
        title={t("ui.拣货任务","拣货任务")}
        subtitle={t("ui.拣货任务副标题","查看待拣货订单列表（表：ord_orders，状态 approved/locked）")}
      />
      <DataTable
        table={TABLE}
        columns={COLUMNS}
        params={{ status: "approved" }}
        onNew={openNew}
        onEdit={openEdit}
        onDelete={handleDelete}
        showActions
        refreshKey={refreshKey}
        emptyText={t("ui.暂无待拣货订单","暂无待拣货订单")}
      />
      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑订单","编辑订单") : t("ui.新建订单","新建订单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title={t("ui.确认删除","确认删除")} message={t("ui.删除不可恢复确认继续","删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
