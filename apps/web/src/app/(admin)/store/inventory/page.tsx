"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
const STATUS_CLS: Record<string,string> = {"normal":s.badgeSuccess, "low":s.badgeWarning, "out":s.badgeDanger};

// B3: store_inventory 真实列 — product_code / sku / qty_on_hand / qty_reserved / qty_available / min_stock / reorder_qty / unit
//     旧版引用的 sku_code / qty 不存在 → 表恒空
const TABLE="store_inventory";
const COLUMNS=[{ key: "store_code", title: "门店", width: 100 },
    { key: "product_code", title: "产品编码", width: 130 },
    { key: "sku", title: "SKU", width: 120 },
    { key: "product_name", title: "产品名称", width: 140 },
    { key: "batch_no", title: "批次号", width: 140 },
    { key: "qty_on_hand", title: "在库", width: 90 },
    { key: "qty_reserved", title: "锁定", width: 90 },
    { key: "qty_available", title: "可用", width: 90 },
    { key: "min_stock", title: "最低库存", width: 90 },
    { key: "unit", title: "单位", width: 60 }];
const FIELDS:FormField[]=[  { key: "store_code", label: "门店编码", type: "text", required: true },
  { key: "product_code", label: "产品编码", type: "text", required: true },
  { key: "sku", label: "SKU", type: "text" },
  { key: "product_name", label: "产品名称", type: "text" },
  { key: "batch_no", label: "批次号", type: "text" },
  { key: "qty_on_hand", label: "在库数量", type: "number" },
  { key: "qty_reserved", label: "锁定数量", type: "number" },
  { key: "qty_available", label: "可用数量", type: "number" },
  { key: "min_stock", label: "最低库存", type: "number" },
  { key: "reorder_qty", label: "补货量", type: "number" },
  { key: "unit", label: "单位", type: "text" },];
export default function Page(){
  const [o,sO]=useState(false);const [e,sE]=useState<Record<string,unknown>|null>(null);
  const [sv,sSv]=useState(false);const [rk,sRk]=useState(0);
  const [co,sCo]=useState(false);const [dt,sDt]=useState<Record<string,unknown>|null>(null);
  const rf=useCallback(()=>sRk(k=>k+1),[]);
  const oN=useCallback(()=>{sE(null);sO(true);},[]);
  const oE=useCallback((r:Record<string,unknown>)=>{sE(r);sO(true);},[]);
  const cl=useCallback(()=>sO(false),[]);
  const save=useCallback(async(v:Record<string,unknown>)=>{sSv(true);try{e?.id?await crudApi.update(TABLE,e.id as number,v):await crudApi.create(TABLE,v);sO(false);rf();}finally{sSv(false);}},[e,rf]);
  const del=useCallback((r:Record<string,unknown>)=>{sDt(r);sCo(true);},[]);
  const cDel=useCallback(async()=>{if(!dt?.id)return;await crudApi.delete(TABLE,dt.id as number);sCo(false);rf();},[dt,rf]);
  return(<div><PageHeader
        breadcrumb={["门店管理","门店库存"]} title="门店库存" subtitle="管理门店当前库存（表：store_inventory）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑门店库存":"新增门店库存"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}