"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 表: ws_shipments
const TABLE = "ws_shipments";

export default function Page() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "shipment_no",   title: t("ui.发货单号", "发货单号"),   width: 150 },
    { key: "contract_no",   title: t("ui.所属合同", "所属合同"),   width: 150 },
    { key: "dispatch_date", title: t("ui.发货日期", "发货日期"),   width: 110 },
    { key: "qty",           title: t("ui.发货数量", "发货数量"),   width: 90 },
    { key: "status",        title: t("common.status", "状态"),     width: 80 },
  ];

  const FIELDS: FormField[] = [
    { key: "shipment_no",   label: t("ui.发货单号", "发货单号"),     type: "text",   placeholder: t("ui.留空自动生成", "留空自动生成") },
    { key: "contract_no",   label: t("ui.所属合同编号", "所属合同编号"), type: "text", required: true },
    { key: "dispatch_date", label: t("ui.发货日期", "发货日期"),     type: "date",   required: true },
    { key: "qty",           label: t("ui.发货数量", "发货数量"),     type: "number", required: true },
    { key: "status",        label: t("common.status", "状态"),       type: "select",
      options: [
        { label: t("ui.待发货", "待发货"),   value: "PENDING" },
        { label: t("ui.已发货", "已发货"),   value: "SHIPPED" },
        { label: t("ui.已签收", "已签收"),   value: "SIGNED" },
        { label: t("status.cancelled", "已取消"), value: "CANCELLED" },
      ] },
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

  return (
    <div>
      <PageHeader title={t("ui.合同发货记录", "合同发货记录")} subtitle={t("ui.按批发合同记录每次发货履约情况", "按批发合同记录每次发货履约情况")} />
      <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
      <RightDrawer open={o} title={e ? t("ui.编辑合同发货记录", "编辑合同发货记录") : t("ui.新增合同发货记录", "新增合同发货记录")} onClose={cl}>
        <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
      </RightDrawer>
      <ConfirmDialog open={co} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复", "删除后不可恢复？")} onConfirm={cDel} onCancel={()=>sCo(false)} />
    </div>
  );
}
