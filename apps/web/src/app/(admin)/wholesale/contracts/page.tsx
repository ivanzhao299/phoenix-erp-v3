"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 表: ws_contracts
const TABLE = "ws_contracts";

export default function Page() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "contract_no",   title: t("ui.合同编号", "合同编号"),   width: 160 },
    { key: "customer_code", title: t("ui.客户", "客户"),           width: 120 },
    { key: "product_code",  title: t("ui.品级", "品级"),           width: 100 },
    { key: "price",         title: t("ui.合同单价", "合同单价"),   width: 100 },
    { key: "start_date",    title: t("ui.生效日", "生效日"),       width: 110 },
    { key: "end_date",      title: t("ui.到期日", "到期日"),       width: 110 },
    { key: "status",        title: t("common.status", "状态"),     width: 80 },
  ];

  const FIELDS: FormField[] = [
    { key: "contract_no",   label: t("ui.合同编号", "合同编号"),       type: "text",   placeholder: t("ui.留空自动生成", "留空自动生成") },
    { key: "customer_code", label: t("ui.客户编码", "客户编码"),       type: "text",   required: true },
    { key: "product_code",  label: t("ui.产品品级编码", "产品/品级编码"), type: "text", required: true },
    { key: "price",         label: t("ui.合同单价每枚", "合同单价（/枚）"), type: "number", required: true },
    { key: "start_date",    label: t("ui.合同生效日", "合同生效日"),   type: "date" },
    { key: "end_date",      label: t("ui.合同到期日", "合同到期日"),   type: "date" },
    { key: "status",        label: t("ui.合同状态", "合同状态"),       type: "select",
      options: [
        { label: t("ui.执行中", "执行中"),   value: "ACTIVE" },
        { label: t("ui.已到期", "已到期"),   value: "EXPIRED" },
        { label: t("ui.提前终止", "提前终止"), value: "TERMINATED" },
        { label: t("ui.草稿", "草稿"),       value: "DRAFT" },
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
      <PageHeader title={t("ui.批发合同", "批发合同")} subtitle={t("ui.管理与大客户的长期批量供货合同", "管理与大客户的长期批量供货合同（锁定价格和周期）")} />
      <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
      <RightDrawer open={o} title={e ? t("ui.编辑批发合同", "编辑批发合同") : t("ui.新增批发合同", "新增批发合同")} onClose={cl}>
        <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
      </RightDrawer>
      <ConfirmDialog open={co} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复", "删除后不可恢复？")} onConfirm={cDel} onCancel={()=>sCo(false)} />
    </div>
  );
}
