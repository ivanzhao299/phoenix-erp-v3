"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

const STATUS_CLS: Record<string,string> = {"DRAFT":s.badgeWarning, "CLOSED":s.badgeSuccess, "APPROVED":s.badgeSuccess};

// B2: daily_close 真实列 — cash_sales / qr_sales (不是 cash_amount / online_amount)
//     状态枚举与 store.service.ts:24 对齐 DRAFT / CLOSED / APPROVED
const TABLE="daily_close";
export default function Page(){
  const { t } = useLanguage();
  const COLUMNS=[{ key: "store_code", title: t('ui.门店', '门店'), width: 100 },
      { key: "close_date", title: t('ui.结算日期', '结算日期'), width: 110 },
      { key: "total_sales", title: t('ui.总销售', '总销售'), width: 100 },
      { key: "cash_sales", title: t('ui.现金', '现金'), width: 90 },
      { key: "qr_sales", title: t('ui.扫码线上', '扫码/线上'), width: 100 },
      { key: "discount_total", title: t('ui.总折扣', '总折扣'), width: 90 },
      { key: "cash_diff", title: t('ui.现金差额', '现金差额'), width: 90 },
      { key: "operator", title: t('ui.操作员', '操作员'), width: 100 },
      { key: "status", title: t('common.status', '状态'), width: 80, render:(v:unknown)=><span className={`${s.badge} ${STATUS_CLS[String(v)]??s.badgeNeutral}`}>{String(v)}</span>}];
  const FIELDS:FormField[]=[  { key: "store_code", label: t('ui.门店编码', '门店编码'), type: "text", required: true },
    { key: "close_date", label: t('ui.结算日期', '结算日期'), type: "date", required: true },
    { key: "total_sales", label: t('ui.总销售额', '总销售额'), type: "number" },
    { key: "cash_sales", label: t('ui.现金金额', '现金金额'), type: "number" },
    { key: "qr_sales", label: t('ui.扫码线上金额', '扫码/线上金额'), type: "number" },
    { key: "discount_total", label: t('ui.总折扣', '总折扣'), type: "number" },
    { key: "cash_actual", label: t('ui.实收现金', '实收现金'), type: "number" },
    { key: "operator", label: t('ui.操作员', '操作员'), type: "text" },
    { key: "note", label: t('common.remark', '备注'), type: "textarea" },
    { key: "status", label: t('common.status', '状态'), type: "select", options: [{ label: t('ui.草稿', '草稿'), value: "DRAFT"}, { label: t('ui.已结算', '已结算'), value: "CLOSED" }, { label: t('status.approved', '已审核'), value: "APPROVED" }] },];
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
        breadcrumb={[t('ui.门店管理', '门店管理'), t('ui.日结作业', '日结作业')]} title={t('ui.门店日结', '门店日结')} subtitle={t('ui.管理门店每日结算', '管理门店每日结算（表：daily_close）')} />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?t('ui.编辑门店日结', '编辑门店日结'):t('ui.新增门店日结', '新增门店日结')} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title={t('common.confirm', '确认删除')} message={t('ui.删除后不可恢复', '删除后不可恢复？')} onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}
