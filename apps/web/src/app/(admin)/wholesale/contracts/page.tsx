"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ✅ V3 表: ws_contracts
const TABLE = "ws_contracts";
const COLUMNS = [{ key: "contract_no", title: "合同编号", width: 160 },
    { key: "customer_code", title: "客户", width: 120 },
    { key: "product_code", title: "品级", width: 100 },
    { key: "price", title: "合同单价", width: 100 },
    { key: "start_date", title: "生效日", width: 110 },
    { key: "end_date", title: "到期日", width: 110 },
    { key: "status", title: "状态", width: 80 }];
const FIELDS: FormField[] = [
  { key: "contract_no", label: "合同编号", type: "text", placeholder: "留空自动生成" },
  { key: "customer_code", label: "客户编码", type: "text", required: true },
  { key: "product_code", label: "产品/品级编码", type: "text", required: true },
  { key: "price", label: "合同单价（/枚）", type: "number", required: true },
  { key: "start_date", label: "合同生效日", type: "date" },
  { key: "end_date", label: "合同到期日", type: "date" },
  { key: "status", label: "合同状态", type: "select", options: [{ label: "执行中", value: "ACTIVE" }, { label: "已到期", value: "EXPIRED" }, { label: "提前终止", value: "TERMINATED" }, { label: "草稿", value: "DRAFT" }] },
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
    <PageHeader title="批发合同" subtitle="管理与大客户的长期批量供货合同（锁定价格和周期）（表：ws_contracts）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑批发合同":"新增批发合同"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}