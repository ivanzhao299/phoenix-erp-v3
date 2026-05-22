"use client";
import { useState, useCallback } from "react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { crudApi } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE = "log_receipts";

interface Receipt {
  id: number;
  receipt_no: string;
  dispatch_no: string;  // 与 log_dispatch.dispatch_no 关联（移动端写入字段）
  store_code: string;
  receive_date: string;
  qty: number;
  status: string;
  remark?: string;
}

export default function ReceiptPage() {
  const { t } = useLanguage();

  const STATUS_MAP: Record<string, { label: string; color: string }> = {
    PENDING:   { label: t("ui.待签收", "待签收"), color: "#f59e0b" },
    SIGNED:    { label: t("ui.已签收", "已签收"), color: "#22c55e" },
    EXCEPTION: { label: t("ui.签收异常", "签收异常"), color: "#ef4444" },
  };

  const COLS: Column<Receipt>[] = [
    { key: "receipt_no",   title: t("ui.签收单号", "签收单号"), width: 150 },
    { key: "dispatch_no",  title: t("ui.配送波次", "配送波次"), width: 150 },
    { key: "store_code",   title: t("ui.门店编号", "门店编号"), width: 100 },
    { key: "receive_date", title: t("ui.签收日期", "签收日期"), width: 110 },
    { key: "qty",          title: t("ui.签收数量", "签收数量"), width: 100, align: "right" },
    { key: "status", title: t("common.status", "状态"), width: 90, align: "center",
      render: v => { const s = STATUS_MAP[String(v)]; return s ? <span style={{ color: s.color, fontWeight: 700, fontSize: 12 }}>{s.label}</span> : String(v ?? "—"); }
    },
  ];

  const FIELDS: FormField[] = [
    { key: "receipt_no",   label: t("ui.签收单号", "签收单号"), type: "text",   required: true },
    { key: "dispatch_no",  label: t("ui.配送波次", "配送波次"), type: "text" },
    { key: "store_code",   label: t("ui.门店编号", "门店编号"), type: "text",   required: true },
    { key: "receive_date", label: t("ui.签收日期", "签收日期"), type: "date" },
    { key: "qty",          label: t("ui.签收数量", "签收数量"), type: "number", defaultValue: 0 },
    { key: "status", label: t("common.status", "状态"), type: "select", defaultValue: "PENDING",
      options: [
        { label: t("ui.待签收",   "待签收"),   value: "PENDING"   },
        { label: t("ui.已签收",   "已签收"),   value: "SIGNED"    },
        { label: t("ui.签收异常", "签收异常"), value: "EXCEPTION" },
      ]
    },
    { key: "remark", label: t("common.remark", "备注"), type: "textarea", span: 2 as const },
  ];

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editRow, setEditRow]       = useState<Receipt | null>(null);
  const [deleteRow, setDeleteRow]   = useState<Receipt | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const refresh = () => setRefreshKey(k => k + 1);
  const close   = () => { setDrawerOpen(false); setEditRow(null); };

  const handleSubmit = useCallback(async (v: Record<string, unknown>) => {
    setSaving(true);
    try {
      editRow?.id ? await crudApi.update(TABLE, editRow.id, v) : await crudApi.create(TABLE, v);
      close(); refresh();
    } finally { setSaving(false); }
  }, [editRow]);

  const handleDelete = useCallback(async () => {
    if (!deleteRow?.id) return;
    setDeleting(true);
    try { await crudApi.delete(TABLE, deleteRow.id); setDeleteRow(null); refresh(); }
    finally { setDeleting(false); }
  }, [deleteRow]);

  return (
    <div>
      <PageHeader title={t("ui.到店签收", "到店签收")} subtitle={t("ui.管理配送到门店的签收记录", "管理配送到门店的签收记录（表：log_receipts）")} />
      <DataTable<Receipt> table={TABLE} columns={COLS} showActions
        onNew={() => { setEditRow(null); setDrawerOpen(true); }}
        onEdit={r => { setEditRow(r); setDrawerOpen(true); }}
        onDelete={r => setDeleteRow(r)}
        refreshKey={refreshKey} newLabel={t("ui.新建签收单", "新建签收单")} />
      <RightDrawer open={drawerOpen} title={editRow ? t("ui.编辑签收单", "编辑签收单") : t("ui.新建签收单", "新建签收单")} onClose={close}>
        <CrudForm fields={FIELDS} initialValues={(editRow as unknown as Record<string, unknown>) ?? undefined} onSubmit={handleSubmit} onCancel={close} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={!!deleteRow} title={t("common.confirm", "确认删除")} message={`${t("ui.确定删除签收单", "确定删除签收单")}「${deleteRow?.receipt_no}」？`} confirmLabel={t("common.delete", "删除")} danger loading={deleting} onConfirm={handleDelete} onCancel={() => setDeleteRow(null)} />
    </div>
  );
}
