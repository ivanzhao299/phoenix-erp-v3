"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ✅ V3 表: biz_cash_flow (专用现金流水表)
// 字段: id, store_code, flow_type, category, amount, currency_code, payer, payee, remark, status, ref_doc_id
// fin_transactions 用于双向AR/AP台账；biz_cash_flow 专记现金进出流水
const TABLE = "biz_cash_flow";

const COLUMNS = [
  { key: "store_code",    title: "门店/组织" },
  { key: "flow_type",     title: "收/付" },
  { key: "category",      title: "类别" },
  { key: "amount",        title: "金额" },
  { key: "currency_code", title: "币种" },
  { key: "payer",         title: "付款方" },
  { key: "payee",         title: "收款方" },
  { key: "status",        title: "状态" },
];

const FIELDS: FormField[] = [
  { key: "store_code",    label: "门店/组织编码", type: "text",   required: false, defaultValue: "ALL" },
  { key: "flow_type",     label: "收付类型",       type: "select", required: true,
    options: [{ label: "收款（流入）", value: "IN" }, { label: "付款（流出）", value: "OUT" }] },
  { key: "category",      label: "业务类别",       type: "text",   required: true, placeholder: "如：销货收款、采购付款" },
  { key: "amount",        label: "金额",           type: "number", required: true },
  { key: "currency_code", label: "币种",           type: "select", required: true,
    options: [{ label: "人民币 CNY", value: "CNY" }, { label: "老挝基普 LAK", value: "LAK" }] },
  { key: "payer",         label: "付款方",         type: "text",   required: false },
  { key: "payee",         label: "收款方",         type: "text",   required: false },
  { key: "status",        label: "状态",           type: "select", required: false,
    options: [{ label: "草稿", value: "DRAFT" }, { label: "已确认", value: "CONFIRMED" }, { label: "已核销", value: "SETTLED" }] },
  { key: "remark",        label: "备注",           type: "textarea", required: false, span: 2 },
];

export default function CashflowPage() {
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
      <PageHeader title="现金流水" subtitle="记录企业现金收付流水明细（表：biz_cash_flow）" />
      <DataTable table={TABLE} columns={COLUMNS as any} onNew={openNew} onEdit={openEdit as any}
        onDelete={handleDelete as any} showActions refreshKey={refreshKey} />
      <RightDrawer open={drawerOpen} title={editing ? "编辑流水" : "新增流水"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
