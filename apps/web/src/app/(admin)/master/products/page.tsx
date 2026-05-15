"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
import { useToast } from "@/contexts/ToastContext";
const STATUS_CLS: Record<string,string> = {"active":s.badgeSuccess, "ACTIVE":s.badgeSuccess, "inactive":s.badgeNeutral};


// ✅ V3 表: mst_products
const TABLE = "mst_products";
const COLUMNS = [{ key: "product_code", title: "品级编码", width: 120 },
    { key: "product_name", title: "品级名称", width: 160 },
    { key: "pack_type", title: "包装类型", width: 110 },
    { key: "unit", title: "单位", width: 70 },
    { key: "status", title: "状态", width: 80}];
const FIELDS: FormField[] = [
  { key: "product_code", label: "品级编码", type: "text", required: true, placeholder: "如：EGG-AA-30" },
  { key: "product_name", label: "品级名称", type: "text", required: true },
  { key: "pack_type", label: "包装类型", type: "text", placeholder: "如：30枚托、6枚盒" },
  { key: "unit", label: "计量单位", type: "text", placeholder: "如：枚、托" },
  { key: "status", label: "状态", type: "select", options: [{ label: "启用", value: "ACTIVE"}, { label: "已停产", value: "DISCONTINUED" }] },
];
export default function Page() {
  const toast = useToast();
  const [o,sO]=useState(false);const [e,sE]=useState<Record<string,unknown>|null>(null);
  const [sv,sSv]=useState(false);const [rk,sRk]=useState(0);
  const [co,sCo]=useState(false);const [dt,sDt]=useState<Record<string,unknown>|null>(null);
  const rf=useCallback(()=>sRk(k=>k+1),[]);
  const oN=useCallback(()=>{sE(null);sO(true);},[]);
  const oE=useCallback((r:Record<string,unknown>)=>{sE(r);sO(true);},[]);
  const cl=useCallback(()=>sO(false),[]);
  const save=useCallback(async(v:Record<string,unknown>)=>{sSv(true);try{e?.id?await crudApi.update(TABLE,e.id as number,v):await crudApi.create(TABLE,v); toast.success("保存成功");sO(false);rf();}finally{sSv(false);}},[e,rf]);
  const del=useCallback((r:Record<string,unknown>)=>{sDt(r);sCo(true);},[]);
  const cDel=useCallback(async()=>{if(!dt?.id)return;await crudApi.delete(TABLE,dt.id as number); toast.success("已删除");sCo(false);rf();},[dt,rf]);
  return(<div>
    <PageHeader
        breadcrumb={["主数据","产品档案"]} title="产品品级" subtitle="管理鸡蛋产品规格和品级（表：mst_products）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑产品品级":"新增产品品级"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}