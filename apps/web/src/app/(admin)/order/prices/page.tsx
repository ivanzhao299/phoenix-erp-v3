"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
const STATUS_CLS: Record<string,string> = {"active":s.badgeSuccess, "ACTIVE":s.badgeSuccess, "expired":s.badgeNeutral, "EXPIRED":s.badgeNeutral};

const TABLE = "ord_prices";
const COLUMNS = [
    { key: "price_code", title: "价格编码", width: 130 },
    { key: "customer_code", title: "客户", width: 120 },
    { key: "sku_code", title: "品级", width: 100 },
    { key: "sku_name", title: "品级名称", width: 140 },
    { key: "unit_price", title: "合同单价", width: 100 },
    { key: "floor_price", title: "底价", width: 100 },
    { key: "valid_from", title: "生效日", width: 100 },
    { key: "valid_to", title: "到期日", width: 100 },
    { key: "status", title: "状态", width: 80, render:(v:unknown)=><span className={`${s.badge} ${STATUS_CLS[String(v)]??s.badgeNeutral}`}>{String(v)}</span>},
];
const FIELDS: FormField[] = [
  { key: "price_code", label: "价格档位编码", type: "text", placeholder: "留空自动生成" },
  { key: "customer_code", label: "客户编码", type: "text", required: true },
  { key: "sku_code", label: "品级编码", type: "text", required: true },
  { key: "sku_name", label: "品级名称", type: "text" },
  { key: "unit_price", label: "合同单价", type: "number", required: true },
  { key: "floor_price", label: "保底价", type: "number" },
  { key: "valid_from", label: "生效日期", type: "date" },
  { key: "valid_to", label: "到期日期", type: "date" },
  { key: "status", label: "状态", type: "select", options: [{ label: "生效中", value: "ACTIVE" }, { label: "已到期", value: "EXPIRED" }, { label: "停用", value: "INACTIVE" }] },
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
        breadcrumb={["销售","价格管理"]} title="合同价格" subtitle="管理客户合同价格档位（表：ord_prices）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={openNew} onEdit={openEdit as any} onDelete={handleDelete as any} showActions refreshKey={refreshKey} />
    <RightDrawer open={drawerOpen} title={editing?"编辑合同价格":"新增合同价格"} onClose={closeDrawer}>
      <CrudForm fields={FIELDS} initialValues={editing??{}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
    </RightDrawer>
    <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？" onConfirm={confirmDelete} onCancel={()=>setConfirmOpen(false)} />
  </div>);
}
