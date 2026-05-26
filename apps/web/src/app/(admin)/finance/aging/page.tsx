"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LegacyFreezeBanner } from "@/components/finance/LegacyFreezeBanner";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE = "fin_transactions";

export default function 账龄分析Page() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "trans_no",   title: t("ui.交易单号", "交易单号") },
    { key: "amount",     title: t("common.amount", "金额") },
    { key: "trans_type", title: t("ui.类型", "类型") },
    { key: "pay_method", title: t("ui.支付方式", "支付方式") },
    { key: "status",     title: t("common.status", "状态") },
    { key: "created_at", title: t("common.date", "日期") },
  ];

  const FIELDS: FormField[] = [
    { key: "trans_no",   label: t("ui.交易单号", "交易单号"),   type: "readonly" },
    { key: "invoice_no", label: t("ui.关联发票号", "关联发票号"), type: "text" },
    { key: "amount",     label: t("common.amount", "金额"),     type: "number", required: true },
    { key: "trans_type", label: t("ui.类型", "类型"),           type: "select", required: true,
      options: [{ label: t("ui.收款", "收款"), value: "CREDIT" }, { label: t("ui.付款", "付款"), value: "DEBIT" }] },
    { key: "pay_method", label: t("ui.支付方式", "支付方式"),   type: "select",
      options: [{ label: t("ui.现金", "现金"), value: "CASH" }, { label: t("ui.转账", "转账"), value: "TRANSFER" }, { label: t("ui.线上支付", "线上支付"), value: "ONLINE" }] },
    { key: "pay_date",   label: t("ui.支付日期", "支付日期"),   type: "date" },
    { key: "remark",     label: t("common.remark", "备注"),     type: "textarea" },
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

  const TITLE = t("ui.账龄分析", "账龄分析");

  return (
    <div>
      <LegacyFreezeBanner redirectPath="/finance2/ap" redirectLabel="前往 Finance V2 AP" />
      <PageHeader title={TITLE} subtitle={t("ui.按账期维度分析应收款项逾期情况", "按账期维度分析应收款项逾期情况（表：fin_transactions）")} />
      <DataTable
        table={TABLE}
        columns={COLUMNS}
        onNew={openNew}
        onEdit={openEdit}
        onDelete={handleDelete}
        showActions
        refreshKey={refreshKey}
      />
      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑账龄分析", `编辑${TITLE}`) : t("ui.新增账龄分析", `新增${TITLE}`)} onClose={closeDrawer}>
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
        title={t("ui.确认删除", "确认删除")}
        message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
