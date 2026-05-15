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
const STATUS_CLS: Record<string,string> = {"OPEN":s.badgeSuccess, "CLOSED":s.badgeNeutral, "active":s.badgeSuccess};


// ✅ V3 表: mst_stores
const TABLE = "mst_stores";
const COLUMNS = [{ key: "store_code", title: "门店编码", width: 120 },
    { key: "store_name", title: "门店名称", width: 160 },
    { key: "address", title: "地址" },
    { key: "contact", title: "联系人", width: 100 },
    { key: "store_type", title: "类型", width: 90 },
    { key: "status", title: "状态", width: 80}];
const FIELDS: FormField[] = [
  { key: "store_code", label: "门店编码", type: "text", required: true, placeholder: "如：ST-001" },
  { key: "store_name", label: "门店名称", type: "text", required: true },
  { key: "address", label: "地址", type: "textarea" },
  { key: "contact", label: "联系人", type: "text" },
  { key: "store_type", label: "门店类型", type: "select", options: [{ label: "直营", value: "DIRECT" }, { label: "加盟", value: "FRANCHISE" }, { label: "经销", value: "DISTRIBUTION" }] },
  { key: "status", label: "状态", type: "select", options: [{ label: "营业中", value: "ACTIVE"}, { label: "已关闭", value: "INACTIVE" }] },
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
        breadcrumb={["主数据","门店档案"]} title="门店主档" subtitle="管理直营和加盟门店档案（表：mst_stores）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑门店主档":"新增门店主档"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}