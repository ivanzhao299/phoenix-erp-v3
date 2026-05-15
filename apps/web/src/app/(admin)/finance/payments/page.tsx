"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";

// ✅ V3 表: fin_payments
const TABLE = "fin_payments";
const COLUMNS = [{ key: "pay_no", title: "付款单号", width: 150 },
    { key: "payee", title: "收款方", width: 130 },
    { key: "amount", title: "金额", width: 100 },
    { key: "pay_method", title: "方式", width: 100 },
    { key: "pay_date", title: "日期", width: 110 },
    { key: "status", title: "状态", width: 90 }];
const FIELDS: FormField[] = [
  { key: "pay_no", label: "付款单号", type: "text", placeholder: "留空自动生成" },
  { key: "payee", label: "收款方", type: "text", required: true },
  { key: "amount", label: "付款金额", type: "number", required: true },
  { key: "pay_method", label: "付款方式", type: "select", options: [{ label: "现金", value: "CASH" }, { label: "转账", value: "TRANSFER" }, { label: "线上支付", value: "ONLINE" }] },
  { key: "pay_date", label: "付款日期", type: "date" },
  { key: "remark", label: "备注", type: "textarea" },
  { key: "status", label: "状态", type: "select", options: [{ label: "草稿", value: "DRAFT" }, { label: "待审批", value: "PENDING" }, { label: "已审批", value: "APPROVED" }, { label: "已付款", value: "PAID" }] },
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
    <PageHeader
        breadcrumb={["财务管理","收款管理"]} title="付款单" subtitle="管理对外付款单据（表：fin_payments）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑付款单":"新增付款单"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}