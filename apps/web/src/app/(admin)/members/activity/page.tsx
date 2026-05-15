"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
const TABLE="crm_activities";
const COLUMNS=[{ key: "act_code", title: "活动编码", width: 130 },
    { key: "name", title: "活动名称", width: 160 },
    { key: "type", title: "类型", width: 90 },
    { key: "start_date", title: "开始日", width: 110 },
    { key: "end_date", title: "结束日", width: 110 },
    { key: "budget", title: "预算", width: 90 },
    { key: "status", title: "状态", width: 80 }];
const FIELDS:FormField[]=[  { key: "act_code", label: "活动编码", type: "text", placeholder: "留空自动生成" },
  { key: "name", label: "活动名称", type: "text", required: true },
  { key: "type", label: "活动类型", type: "select", options: [{ label: "折扣活动", value: "DISCOUNT" }, { label: "赠品活动", value: "GIFT" }, { label: "积分活动", value: "POINTS" }, { label: "组合活动", value: "COMBO" }] },
  { key: "start_date", label: "开始日期", type: "date" },
  { key: "end_date", label: "结束日期", type: "date" },
  { key: "budget", label: "预算金额", type: "number" },
  { key: "status", label: "状态", type: "select", options: [{ label: "草稿", value: "DRAFT" }, { label: "进行中", value: "ACTIVE" }, { label: "已结束", value: "ENDED" }, { label: "已取消", value: "CANCELLED" }] },];
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
  return(<div><PageHeader title="营销活动" subtitle="管理营销活动档案（表：crm_activities）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑营销活动":"新增营销活动"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}