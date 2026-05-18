"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 表: biz_cash_flow (专用现金流水表)
// 字段: id, store_code, flow_type, category, amount, currency_code, payer, payee, remark, status, ref_doc_id
// fin_transactions 用于双向AR/AP台账；biz_cash_flow 专记现金进出流水
const TABLE = "biz_cash_flow";

export default function CashflowPage() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "store_code",    title: t("ui.门店组织", "门店/组织") },
    { key: "flow_type",     title: t("ui.收付", "收/付") },
    { key: "category",      title: t("ui.类别", "类别") },
    { key: "amount",        title: t("common.amount", "金额") },
    { key: "currency_code", title: t("ui.币种", "币种") },
    { key: "payer",         title: t("ui.付款方", "付款方") },
    { key: "payee",         title: t("ui.收款方", "收款方") },
    { key: "status",        title: t("common.status", "状态") },
  ];

  const FIELDS: FormField[] = [
    { key: "store_code",    label: t("ui.门店组织编码", "门店/组织编码"), type: "text",   required: false, defaultValue: "ALL" },
    { key: "flow_type",     label: t("ui.收付类型", "收付类型"),           type: "select", required: true,
      options: [{ label: t("ui.收款流入", "收款（流入）"), value: "IN" }, { label: t("ui.付款流出", "付款（流出）"), value: "OUT" }] },
    { key: "category",      label: t("ui.业务类别", "业务类别"),           type: "text",   required: true, placeholder: t("ui.如销货收款采购付款", "如：销货收款、采购付款") },
    { key: "amount",        label: t("common.amount", "金额"),             type: "number", required: true },
    { key: "currency_code", label: t("ui.币种", "币种"),                   type: "select", required: true,
      options: [{ label: t("ui.人民币CNY", "人民币 CNY"), value: "CNY" }, { label: t("ui.老挝基普LAK", "老挝基普 LAK"), value: "LAK" }] },
    { key: "payer",         label: t("ui.付款方", "付款方"),               type: "text",   required: false },
    { key: "payee",         label: t("ui.收款方", "收款方"),               type: "text",   required: false },
    { key: "status",        label: t("common.status", "状态"),             type: "select", required: false,
      options: [{ label: t("ui.草稿", "草稿"), value: "DRAFT" }, { label: t("ui.已确认", "已确认"), value: "CONFIRMED" }, { label: t("ui.已核销", "已核销"), value: "SETTLED" }] },
    { key: "remark",        label: t("common.remark", "备注"),             type: "textarea", required: false, span: 2 },
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
      <PageHeader title={t("ui.现金流水", "现金流水")} subtitle={t("ui.记录企业现金收付流水明细", "记录企业现金收付流水明细（表：biz_cash_flow）")} />
      <DataTable table={TABLE} columns={COLUMNS} onNew={openNew} onEdit={openEdit}
        onDelete={handleDelete} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑流水", "编辑流水") : t("ui.新增流水", "新增流水")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
