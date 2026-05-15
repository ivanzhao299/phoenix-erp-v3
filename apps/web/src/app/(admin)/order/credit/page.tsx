"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
const STATUS_CLS: Record<string,string> = {"RESERVED":s.badgeWarning, "RELEASED":s.badgeSuccess, "SETTLED":s.badgeNeutral};

const TABLE = "ord_credit_usage";
const COLUMNS = [
    { key: "customer_code", title: "客户编码", width: 130 },
    { key: "order_no", title: "关联订单", width: 150 },
    { key: "amount", title: "金额", width: 100 },
    { key: "type", title: "操作类型", width: 100, render:(v:unknown)=><span className={`${s.badge} ${STATUS_CLS[String(v)]??s.badgeNeutral}`}>{String(v)}</span>},
];
const FIELDS: FormField[] = [
  { key: "customer_code", label: "客户编码", type: "text", required: true },
  { key: "order_no", label: "关联订单号", type: "text" },
  { key: "amount", label: "金额", type: "number", required: true },
  { key: "type", label: "操作类型", type: "select", required: true, options: [{ label: "预占", value: "RESERVED" }, { label: "释放", value: "RELEASED" }, { label: "结清", value: "SETTLED" }] },
];
export default function Page() {
  const [drawerOpen,setDrawerOpen]=useState(false);const [editing,setEditing]=useState<Record<string,unknown>|null>(null);
  const [saving,setSaving]=useState(false);const [refreshKey,setRefreshKey]=useState(0);
  const [confirmOpen,setConfirmOpen]=useState(false);const [deleteTarget,setDeleteTarget]=useState<Record<string,unknown>|null>(null);
  const refresh=useCallback(()=>setRefreshKey(k=>k+1),[]);
  const openNew=useCallback(()=>{setEditing(null);setDrawerOpen(true);},[]);
  const openEdit=useCallback((row:Record<string,unknown>)=>{setEditing(row);setDrawerOpen(true);},[]);
  const closeDrawer=useCallback(()=>setDrawerOpen(false),[]);
  const handleSave=useCallback(async(values:Record<string,unknown>)=>{
    setSaving(true);try{editing?.id?await crudApi.update(TABLE,editing.id as number,values):await crudApi.create(TABLE,values);setDrawerOpen(false);refresh();}finally{setSaving(false);}
  },[editing,refresh]);
  const handleDelete=useCallback((row:Record<string,unknown>)=>{setDeleteTarget(row);setConfirmOpen(true);},[]);
  const confirmDelete=useCallback(async()=>{if(!deleteTarget?.id)return;await crudApi.delete(TABLE,deleteTarget.id as number);setConfirmOpen(false);refresh();},[deleteTarget,refresh]);
  return(<div><PageHeader
        breadcrumb={["销售","信用台账"]} title="信用台账" subtitle="客户信用额度占用记录（表：ord_credit_usage）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={openNew} onEdit={openEdit as any} onDelete={handleDelete as any} showActions refreshKey={refreshKey} />
    <RightDrawer open={drawerOpen} title={editing?"编辑信用台账":"新增信用台账"} onClose={closeDrawer}>
      <CrudForm fields={FIELDS} initialValues={editing??{}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
    </RightDrawer>
    <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？" onConfirm={confirmDelete} onCancel={()=>setConfirmOpen(false)} />
  </div>);
}
