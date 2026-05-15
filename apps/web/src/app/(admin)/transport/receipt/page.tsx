"use client";
import { useState, useCallback } from "react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import { crudApi } from "@/lib/api-client";

// ✅ log_receipts - 字段对齐：receipt_no, wave_no, store_code, receive_date, qty, status
const TABLE = "log_receipts";

interface Receipt {
  id: number;
  receipt_no: string;   // ✅ DB字段
  wave_no: string;      // ✅ DB字段（非dispatch_no）
  store_code: string;   // ✅ DB字段
  receive_date: string; // ✅ DB字段（非sign_time）
  qty: number;          // ✅ DB字段（DECIMAL）
  status: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING:   { label: "待签收", color: "#f59e0b" },
  RECEIVED:  { label: "已签收", color: "#22c55e" },
  DISPUTED:  { label: "有异议", color: "#ef4444" },
};

const COLS: Column<Receipt>[] = [
  { key: "receipt_no",   title: "签收单号", width: 150 },
  { key: "wave_no",      title: "配送波次", width: 150 }, // ✅ wave_no
  { key: "store_code",   title: "门店编号", width: 100 },
  { key: "receive_date", title: "签收日期", width: 110 }, // ✅ receive_date
  { key: "qty",          title: "签收数量", width: 100, align: "right" },
  { key: "status", title: "状态", width: 90, align: "center",
    render: v => { const s = STATUS_MAP[String(v)]; return s ? <span style={{ color: s.color, fontWeight: 700, fontSize: 12 }}>{s.label}</span> : String(v ?? "—"); }
  },
];

const FIELDS: FormField[] = [
  { key: "receipt_no",   label: "签收单号", type: "text",   required: true },
  { key: "wave_no",      label: "配送波次", type: "text" }, // ✅ wave_no
  { key: "store_code",   label: "门店编号", type: "text",   required: true },
  { key: "receive_date", label: "签收日期", type: "date" },  // ✅ receive_date
  { key: "qty",          label: "签收数量", type: "number", defaultValue: 0 },
  { key: "status", label: "状态", type: "select", defaultValue: "PENDING",
    options: [
      { label: "待签收", value: "PENDING" },
      { label: "已签收", value: "RECEIVED" },
      { label: "有异议", value: "DISPUTED" },
    ]
  },
];

export default function ReceiptPage() {
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
      <PageHeader title="到店签收" subtitle="管理配送到门店的签收记录（表：log_receipts）" />
      <DataTable<Receipt> table={TABLE} columns={COLS} showActions
        onNew={() => { setEditRow(null); setDrawerOpen(true); }}
        onEdit={r => { setEditRow(r); setDrawerOpen(true); }}
        onDelete={r => setDeleteRow(r)}
        refreshKey={refreshKey} newLabel="新建签收单" />
      <RightDrawer open={drawerOpen} title={editRow ? "编辑签收单" : "新建签收单"} onClose={close}>
        <CrudForm fields={FIELDS} initialValues={(editRow as unknown as Record<string, unknown>) ?? undefined} onSubmit={handleSubmit} onCancel={close} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={!!deleteRow} title="确认删除" message={`确定删除签收单「${deleteRow?.receipt_no}」？`} confirmLabel="删除" danger loading={deleting} onConfirm={handleDelete} onCancel={() => setDeleteRow(null)} />
    </div>
  );
}
