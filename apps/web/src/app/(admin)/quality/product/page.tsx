"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

const STATUS_CLS: Record<string,string> = {"PASS":s.badgeSuccess, "FAIL":s.badgeDanger, "PENDING":s.badgeWarning, "CONDITIONAL":s.badgeWarning};

const TABLE="qa_product_inspections";

export default function Page(){
  const { t } = useLanguage();

  const COLUMNS=[
    { key: "inspect_no", title: t("ui.质检单号","质检单号"), width: 150 },
    { key: "batch_no", title: t("ui.批次号","批次号"), width: 150 },
    { key: "sku_code", title: t("ui.品级","品级"), width: 100 },
    { key: "result", title: t("ui.结果","结果"), width: 90, render:(v:unknown)=><span className={`${s.badge} ${STATUS_CLS[String(v)]??s.badgeNeutral}`}>{String(v)}</span>},
    { key: "inspector", title: t("ui.质检员","质检员"), width: 100 },
  ];
  const FIELDS:FormField[]=[
    { key: "inspect_no", label: t("ui.质检单号","质检单号"), type: "text", placeholder: t("ui.留空自动生成","留空自动生成") },
    { key: "batch_no", label: t("ui.关联批次号","关联批次号"), type: "text", required: true },
    { key: "sku_code", label: t("ui.品级编码","品级编码"), type: "text" },
    { key: "result", label: t("ui.质检结论","质检结论"), type: "select", required: true, options: [{ label: t("ui.合格","合格"), value: "PASS"}, { label: t("ui.不合格","不合格"), value: "FAIL" }, { label: t("ui.有条件通过","有条件通过"), value: "CONDITIONAL" }] },
    { key: "inspector", label: t("ui.质检员","质检员"), type: "text" },
  ];

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
        breadcrumb={[t("ui.品质追溯","品质追溯"), t("ui.成品质检","成品质检")]} title={t("ui.成品质检","成品质检")} subtitle={t("ui.成品质检副标题","管理成品质检记录（表：qa_product_inspections）")} />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?t("ui.编辑成品质检","编辑成品质检"):t("ui.新增成品质检","新增成品质检")} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title={t("ui.确认删除","确认删除")} message={t("ui.删除不可恢复","删除后不可恢复？")} onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}
