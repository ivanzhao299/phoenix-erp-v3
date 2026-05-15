"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ✅ V3 表: chn_distributor_grading
const TABLE = "chn_distributor_grading";
const COLUMNS = [{ key: "customer_code", title: "经销商编码", width: 130 },
    { key: "customer_name", title: "经销商名称", width: 160 },
    { key: "grade", title: "评级", width: 70 },
    { key: "credit_limit", title: "授信额度", width: 110 },
    { key: "region", title: "所属区域", width: 120 },
    { key: "status", title: "状态", width: 80 }];
const FIELDS: FormField[] = [
  { key: "customer_code", label: "经销商编码", type: "text", required: true, placeholder: "如：CHN-001" },
  { key: "customer_name", label: "经销商名称", type: "text", required: true },
  { key: "grade", label: "信用评级", type: "select", options: [{ label: "A级优质", value: "A" }, { label: "B级良好", value: "B" }, { label: "C级一般", value: "C" }, { label: "D级风险", value: "D" }] },
  { key: "credit_limit", label: "授信额度", type: "number" },
  { key: "region", label: "所属区域", type: "text", placeholder: "如：华南、老挝北部" },
  { key: "status", label: "状态", type: "select", options: [{ label: "合作中", value: "ACTIVE" }, { label: "已停止", value: "INACTIVE" }] },
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
    <PageHeader title="经销商分级" subtitle="管理渠道经销商信用评级和授信额度（仅管理员/区域经理可见）（表：chn_distributor_grading）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑经销商分级":"新增经销商分级"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}