"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
// B4: store_receiving 真实列 — order_no (PK) / wave_no / store_code / status / operator / confirmed_at
//     旧版 receive_no / batch_no / qty 全部 DB 不存在
//     枚举 STATUS_CLS 含 PENDING/DONE/RECEIVED 三套互不一致 — 收敛为 PENDING/ACCEPTED/REJECTED
const STATUS_CLS: Record<string,string> = {
  "PENDING":  s.badgeWarning,
  "ACCEPTED": s.badgeSuccess,
  "REJECTED": s.badgeDanger,
};

const TABLE="store_receiving";
const COLUMNS=[{ key: "order_no", title: "收货单号", width: 160 },
    { key: "wave_no", title: "波次", width: 110 },
    { key: "store_code", title: "门店", width: 100 },
    { key: "operator", title: "收货员", width: 100 },
    { key: "confirmed_at", title: "确认时间", width: 160 },
    { key: "status", title: "状态", width: 80, render:(v:unknown)=><span className={`${s.badge} ${STATUS_CLS[String(v)]??s.badgeNeutral}`}>{String(v)}</span>}];
const FIELDS:FormField[]=[  { key: "order_no", label: "收货单号", type: "text", required: true, placeholder: "留空自动生成 SR-XXXXXX" },
  { key: "wave_no", label: "波次号", type: "text" },
  { key: "store_code", label: "门店编码", type: "text", required: true },
  { key: "operator", label: "收货员", type: "text" },
  { key: "status", label: "状态", type: "select", options: [{ label: "待验收", value: "PENDING"}, { label: "已验收", value: "ACCEPTED" }, { label: "已拒收", value: "REJECTED" }] },];
export default function Page(){
  const [o,sO]=useState(false);const [e,sE]=useState<Record<string,unknown>|null>(null);
  const [sv,sSv]=useState(false);const [rk,sRk]=useState(0);
  const [co,sCo]=useState(false);const [dt,sDt]=useState<Record<string,unknown>|null>(null);
  const rf=useCallback(()=>sRk(k=>k+1),[]);
  const oN=useCallback(()=>{sE(null);sO(true);},[]);
  const oE=useCallback((r:Record<string,unknown>)=>{sE(r);sO(true);},[]);
  const cl=useCallback(()=>sO(false),[]);
  const save=useCallback(async(v:Record<string,unknown>)=>{sSv(true);try{
    const payload = (e?.order_no || v.order_no) ? v : { ...v, order_no: `SR-${Date.now().toString().slice(-6)}` };
    e?.order_no
      ? await crudApi.update(TABLE, e.order_no as never, payload as never)
      : await crudApi.create(TABLE, payload);
    sO(false);rf();}finally{sSv(false);}},[e,rf]);
  const del=useCallback((r:Record<string,unknown>)=>{sDt(r);sCo(true);},[]);
  const cDel=useCallback(async()=>{if(!dt?.id)return;await crudApi.delete(TABLE,dt.id as number);sCo(false);rf();},[dt,rf]);
  return(<div><PageHeader
        breadcrumb={["门店管理","门店收货"]} title="收货验收" subtitle="管理门店收货记录（表：store_receiving）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑收货验收":"新增收货验收"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}