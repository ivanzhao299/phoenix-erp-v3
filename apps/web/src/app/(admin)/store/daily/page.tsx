"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
const STATUS_CLS: Record<string,string> = {"DRAFT":s.badgeWarning, "OPEN":s.badgeWarning, "CLOSED":s.badgeSuccess, "APPROVED":s.badgeSuccess, "done":s.badgeSuccess};

// B2: daily_close 真实列 — cash_sales / qr_sales (不是 cash_amount / online_amount)
//     状态枚举与 store.service.ts:24 对齐 DRAFT / CLOSED / APPROVED
const TABLE="daily_close";
const COLUMNS=[{ key: "store_code", title: "门店", width: 100 },
    { key: "close_date", title: "结算日期", width: 110 },
    { key: "total_sales", title: "总销售", width: 100 },
    { key: "cash_sales", title: "现金", width: 90 },
    { key: "qr_sales", title: "扫码/线上", width: 100 },
    { key: "discount_total", title: "总折扣", width: 90 },
    { key: "cash_diff", title: "现金差额", width: 90 },
    { key: "operator", title: "操作员", width: 100 },
    { key: "status", title: "状态", width: 80, render:(v:unknown)=><span className={`${s.badge} ${STATUS_CLS[String(v)]??s.badgeNeutral}`}>{String(v)}</span>}];
const FIELDS:FormField[]=[  { key: "store_code", label: "门店编码", type: "text", required: true },
  { key: "close_date", label: "结算日期", type: "date", required: true },
  { key: "total_sales", label: "总销售额", type: "number" },
  { key: "cash_sales", label: "现金金额", type: "number" },
  { key: "qr_sales", label: "扫码/线上金额", type: "number" },
  { key: "discount_total", label: "总折扣", type: "number" },
  { key: "cash_actual", label: "实收现金", type: "number" },
  { key: "operator", label: "操作员", type: "text" },
  { key: "note", label: "备注", type: "textarea" },
  { key: "status", label: "状态", type: "select", options: [{ label: "草稿", value: "DRAFT"}, { label: "已结算", value: "CLOSED" }, { label: "已审核", value: "APPROVED" }] },];
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
        breadcrumb={["门店管理","日结作业"]} title="门店日结" subtitle="管理门店每日结算（表：daily_close）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑门店日结":"新增门店日结"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}