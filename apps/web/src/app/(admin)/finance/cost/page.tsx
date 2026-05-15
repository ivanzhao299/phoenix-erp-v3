"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
const TABLE="fin_transactions";
const COLUMNS=[{ key: "trans_no", title: "交易单号", width: 150 },
    { key: "amount", title: "金额", width: 100 },
    { key: "trans_type", title: "类型", width: 80 },
    { key: "pay_method", title: "支付方式", width: 100 },
    { key: "pay_date", title: "日期", width: 110 },
    { key: "status", title: "状态", width: 80 }];
const FIELDS:FormField[]=[  { key: "trans_no", label: "交易单号", type: "text", placeholder: "留空自动生成" },
  { key: "invoice_no", label: "关联凭证号", type: "text" },
  { key: "amount", label: "金额", type: "number", required: true },
  { key: "trans_type", label: "类型", type: "select", required: true, options: [{ label: "支出", value: "DEBIT" }, { label: "收入", value: "CREDIT" }, { label: "调账", value: "ADJUSTMENT" }] },
  { key: "pay_method", label: "结算方式", type: "select", options: [{ label: "现金", value: "CASH" }, { label: "转账", value: "TRANSFER" }, { label: "线上", value: "ONLINE" }] },
  { key: "pay_date", label: "记账日期", type: "date" },
  { key: "remark", label: "备注", type: "textarea" },
  { key: "status", label: "状态", type: "select", options: [{ label: "待审核", value: "PENDING" }, { label: "已确认", value: "CONFIRMED" }, { label: "已核销", value: "SETTLED" }] },];
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
        breadcrumb={["财务管理","成本核算"]} title="成本核算" subtitle="管理成本相关财务记录（表：fin_transactions）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑成本核算":"新增成本核算"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}