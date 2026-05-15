"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
const TABLE="crm_points_rules";
const COLUMNS=[{ key: "rule_code", title: "规则编码", width: 130 },
    { key: "name", title: "规则名称", width: 160 },
    { key: "action", title: "触发动作", width: 130 },
    { key: "points", title: "积分值", width: 90 },
    { key: "status", title: "状态", width: 80 }];
const FIELDS:FormField[]=[  { key: "rule_code", label: "规则编码", type: "text", required: true, placeholder: "如：PURCHASE_1CNY" },
  { key: "name", label: "规则名称", type: "text", required: true },
  { key: "action", label: "触发动作", type: "text", required: true, placeholder: "如：PURCHASE、REGISTER、BIRTHDAY" },
  { key: "points", label: "积分数值", type: "number", required: true },
  { key: "status", label: "状态", type: "select", options: [{ label: "启用", value: "ACTIVE" }, { label: "停用", value: "INACTIVE" }] },];
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
  return(<div><PageHeader title="积分规则" subtitle="管理积分规则配置（表：crm_points_rules）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑积分规则":"新增积分规则"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}