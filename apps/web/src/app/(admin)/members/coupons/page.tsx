"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
const TABLE="crm_coupons";
const COLUMNS=[{ key: "coupon_code", title: "券码", width: 130 },
    { key: "name", title: "名称", width: 150 },
    { key: "type", title: "类型", width: 80 },
    { key: "discount", title: "折扣/金额", width: 100 },
    { key: "quota", title: "发行量", width: 80 },
    { key: "used_count", title: "已用", width: 70 },
    { key: "start_date", title: "生效日", width: 100 },
    { key: "end_date", title: "失效日", width: 100 },
    { key: "status", title: "状态", width: 80 }];
const FIELDS:FormField[]=[  { key: "coupon_code", label: "券码", type: "text", placeholder: "留空自动生成" },
  { key: "name", label: "优惠券名称", type: "text", required: true },
  { key: "type", label: "类型", type: "select", required: true, options: [{ label: "折扣券", value: "DISCOUNT" }, { label: "满减券", value: "AMOUNT" }, { label: "赠品券", value: "FREE" }] },
  { key: "discount", label: "折扣/减免金额", type: "number" },
  { key: "min_amount", label: "最低消费金额", type: "number" },
  { key: "quota", label: "发行总量", type: "number" },
  { key: "used_count", label: "已使用数", type: "number" },
  { key: "start_date", label: "生效日期", type: "date" },
  { key: "end_date", label: "失效日期", type: "date" },
  { key: "status", label: "状态", type: "select", options: [{ label: "有效", value: "ACTIVE" }, { label: "已过期", value: "EXPIRED" }, { label: "停用", value: "INACTIVE" }] },];
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
  return(<div><PageHeader title="优惠券" subtitle="管理优惠券档案（表：crm_coupons）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑优惠券":"新增优惠券"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}