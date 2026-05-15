"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
const STATUS_CLS: Record<string,string> = {"PASS":s.badgeSuccess, "FAIL":s.badgeDanger, "PENDING":s.badgeWarning};

const TABLE="qa_inspections";
const COLUMNS=[{ key: "inspect_no", title: "质检单号", width: 150 },
    { key: "batch_no", title: "批次号", width: 150 },
    { key: "house_code", title: "鸡舍", width: 100 },
    { key: "inspector", title: "质检员", width: 100 },
    { key: "status", title: "状态", width: 90 }];
const FIELDS:FormField[]=[  { key: "inspect_no", label: "质检单号", type: "text", placeholder: "留空自动生成" },
  { key: "batch_no", label: "关联批次号", type: "text" },
  { key: "house_code", label: "鸡舍编码", type: "text" },
  { key: "inspector", label: "质检员", type: "text" },
  { key: "status", label: "质检状态", type: "select", options: [{ label: "合格", value: "PASS" }, { label: "不合格", value: "FAIL" }, { label: "待检", value: "PENDING" }] },];
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
        breadcrumb={["品质追溯","场端质检"]} title="场端质检" subtitle="管理场端质检记录（表：qa_inspections）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑场端质检":"新增场端质检"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}