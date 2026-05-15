"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ✅ V3 表: ws_shipments
const TABLE = "ws_shipments";
const COLUMNS = [{ key: "shipment_no", title: "发货单号", width: 150 },
    { key: "contract_no", title: "所属合同", width: 150 },
    { key: "dispatch_date", title: "发货日期", width: 110 },
    { key: "qty", title: "发货数量", width: 90 },
    { key: "status", title: "状态", width: 80 }];
const FIELDS: FormField[] = [
  { key: "shipment_no", label: "发货单号", type: "text", placeholder: "留空自动生成" },
  { key: "contract_no", label: "所属合同编号", type: "text", required: true },
  { key: "dispatch_date", label: "发货日期", type: "date", required: true },
  { key: "qty", label: "发货数量", type: "number", required: true },
  { key: "status", label: "状态", type: "select", options: [{ label: "待发货", value: "PENDING" }, { label: "已发货", value: "SHIPPED" }, { label: "已签收", value: "SIGNED" }, { label: "已取消", value: "CANCELLED" }] },
];
export default function Page() {
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
  return(<div>
    <PageHeader title="合同发货记录" subtitle="按批发合同记录每次发货履约情况（表：ws_shipments）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑合同发货记录":"新增合同发货记录"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}