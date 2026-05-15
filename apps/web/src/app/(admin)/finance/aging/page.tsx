"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const TABLE = "fin_transactions";
const TITLE = "账龄分析";

const COLUMNS = [
    { key: "trans_no", title: "交易单号" },
    { key: "amount", title: "金额" },
    { key: "trans_type", title: "类型" },
    { key: "pay_method", title: "支付方式" },
    { key: "status", title: "状态" },
    { key: "created_at", title: "日期" },
];

const FIELDS: FormField[] = [
    { key: "trans_no", label: "交易单号", type: "readonly" },
    { key: "invoice_no", label: "关联发票号", type: "text" },
    { key: "amount", label: "金额", type: "number", required: true },
    { key: "trans_type", label: "类型", type: "select", required: true, options: [{ label: "收款", value: "CREDIT" }, { label: "付款", value: "DEBIT" }] },
    { key: "pay_method", label: "支付方式", type: "select", options: [{ label: "现金", value: "CASH" }, { label: "转账", value: "TRANSFER" }, { label: "线上支付", value: "ONLINE" }] },
    { key: "pay_date", label: "支付日期", type: "date" },
    { key: "remark", label: "备注", type: "textarea" },
];

export default function 账龄分析Page() {
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
      <PageHeader title={TITLE} subtitle="按账期维度分析应收款项逾期情况（表：fin_transactions）" />
      <DataTable
        table={TABLE}
        columns={COLUMNS as any}
        onNew={openNew}
        onEdit={openEdit as any}
        onDelete={handleDelete as any}
        showActions
        refreshKey={refreshKey}
      />
      <RightDrawer open={drawerOpen} title={editing ? `编辑${TITLE}` : `新增${TITLE}`} onClose={closeDrawer}>
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
        title="确认删除"
        message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
