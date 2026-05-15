"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ✅ V3 表: b2b_orders
const TABLE = "b2b_orders";
const COLUMNS = [{ key: "order_no", title: "订单号", width: 150 },
    { key: "customer_code", title: "客户", width: 120 },
    { key: "total_amount", title: "金额", width: 100 },
    { key: "currency_code", title: "币种", width: 70 },
    { key: "status", title: "状态", width: 90 },
    { key: "created_at", title: "下单时间", width: 140 }];
const FIELDS: FormField[] = [
  { key: "order_no", label: "订单号", type: "text", placeholder: "留空自动生成" },
  { key: "customer_code", label: "B2B客户编码", type: "text", required: true },
  { key: "total_amount", label: "订单金额", type: "number" },
  { key: "currency_code", label: "币种", type: "select", options: [{ label: "人民币", value: "CNY" }, { label: "老挝基普", value: "LAK" }] },
  { key: "is_urgent", label: "加急", type: "select", options: [{ label: "是", value: "true" }, { label: "否", value: "false" }] },
  { key: "remark", label: "备注", type: "textarea" },
  { key: "status", label: "订单状态", type: "select", options: [{ label: "待审批", value: "pending" }, { label: "已审批", value: "approved" }, { label: "拣货中", value: "picking" }, { label: "已发货", value: "shipped" }, { label: "已签收", value: "received" }, { label: "已核销", value: "reconciled" }, { label: "已取消", value: "cancelled" }] },
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
    <PageHeader title="B2B 订单" subtitle="管理批发分销订单（表：b2b_orders）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑B2B 订单":"新增B2B 订单"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}