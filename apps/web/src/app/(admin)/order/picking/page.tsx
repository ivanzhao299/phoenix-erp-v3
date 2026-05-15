"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ✅ V3 表: ord_orders（拣货任务通过订单状态管理）
// V3 中无独立的 egg_pick_h 表，拣货通过 ord_orders status 字段流转
// 此页显示状态为 approved/locked 的待拣订单
const TABLE = "ord_orders";

const COLUMNS = [
  { key: "order_no",      title: "订单号" },
  { key: "customer_code", title: "客户" },
  { key: "total_amount",  title: "金额" },
  { key: "status",        title: "订单状态" },
  { key: "sales_rep",     title: "销售员" },
  { key: "created_at",    title: "下单时间" },
];

const FIELDS: FormField[] = [
  { key: "order_no",      label: "订单号",   type: "readonly", required: false },
  { key: "customer_code", label: "客户编码", type: "text",     required: true },
  { key: "sales_rep",     label: "销售员",   type: "text",     required: false },
  { key: "total_amount",  label: "订单金额", type: "number",   required: false },
  { key: "status",        label: "状态",     type: "select",   required: false,
    options: [
      { label: "待审批",  value: "pending" },
      { label: "已审批",  value: "approved" },
      { label: "已锁定",  value: "locked" },
      { label: "已分配",  value: "allocated" },
      { label: "已发货",  value: "shipped" },
      { label: "已签收",  value: "received" },
      { label: "已核销",  value: "reconciled" },
    ]},
  { key: "is_urgent",     label: "加急",     type: "select",   required: false,
    options: [{ label: "是", value: "true" }, { label: "否", value: "false" }] },
  { key: "remark",        label: "备注",     type: "textarea", required: false, span: 2 },
];

export default function PickingPage() {
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
        title="拣货任务"
        subtitle="查看待拣货订单列表（表：ord_orders，状态 approved/locked）"
      />
      {/* 筛选：只显示已审批/已锁定的订单（待拣货状态）*/}
      <DataTable
        table={TABLE}
        columns={COLUMNS as any}
        params={{ status: "approved" } as any}
        onNew={openNew}
        onEdit={openEdit as any}
        onDelete={handleDelete as any}
        showActions
        refreshKey={refreshKey}
        emptyText="暂无待拣货订单"
      />
      <RightDrawer open={drawerOpen} title={editing ? "编辑订单" : "新建订单"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave}
          onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
