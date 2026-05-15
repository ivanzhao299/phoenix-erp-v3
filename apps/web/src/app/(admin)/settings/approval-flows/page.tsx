"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";

// ✅ V3 表: sys_approval_flows
const TABLE = "sys_approval_flows";
const COLUMNS = [{ key: "doc_type", title: "单据类型", width: 150 },
    { key: "amount_min", title: "最低金额", width: 100 },
    { key: "amount_max", title: "最高金额", width: 100 },
    { key: "currency_code", title: "币种", width: 70 },
    { key: "approver_chain", title: "审批角色链" }];
const FIELDS: FormField[] = [
  { key: "doc_type", label: "单据类型", type: "select", required: true, options: [{ label: "现金报销", value: "CASH_EXPENSE" }, { label: "销售订单", value: "ORD_ORDER" }, { label: "采购订单", value: "PRC_ORDER" }, { label: "应付款", value: "PAYABLE" }, { label: "应收款", value: "RECEIVABLE" }] },
  { key: "amount_min", label: "最低触发金额", type: "number", required: true, placeholder: "如：0" },
  { key: "amount_max", label: "最高金额（空=无上限）", type: "number", placeholder: "留空表示无上限" },
  { key: "currency_code", label: "阈值币种", type: "select", options: [{ label: "人民币", value: "CNY" }, { label: "老挝基普", value: "LAK" }] },
  { key: "approver_chain", label: "审批角色链（JSON数组）", type: "textarea", required: true, placeholder: '如：["ROLE_FARM_MGR","ROLE_COMPANY_GM"]' },
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
        breadcrumb={["系统设置","审批流配置"]} title="审批流配置" subtitle="配置各类单据的审批金额阈值和审批角色链（表：sys_approval_flows）" />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?"编辑审批流配置":"新增审批流配置"} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title="确认删除" message="删除后不可恢复？" onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}