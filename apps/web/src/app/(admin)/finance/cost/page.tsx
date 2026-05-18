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

const TABLE = "fin_transactions";

export default function Page() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "trans_no",   title: t("ui.交易单号", "交易单号"),   width: 150 },
    { key: "amount",     title: t("common.amount", "金额"),     width: 100 },
    { key: "trans_type", title: t("ui.类型", "类型"),           width: 80 },
    { key: "pay_method", title: t("ui.支付方式", "支付方式"),   width: 100 },
    { key: "pay_date",   title: t("common.date", "日期"),       width: 110 },
    { key: "status",     title: t("common.status", "状态"),     width: 80 },
  ];

  const FIELDS: FormField[] = [
    { key: "trans_no",   label: t("ui.交易单号", "交易单号"),   type: "text",     placeholder: t("ui.留空自动生成", "留空自动生成") },
    { key: "invoice_no", label: t("ui.关联凭证号", "关联凭证号"), type: "text" },
    { key: "amount",     label: t("common.amount", "金额"),     type: "number",   required: true },
    { key: "trans_type", label: t("ui.类型", "类型"),           type: "select",   required: true,
      options: [{ label: t("ui.支出", "支出"), value: "DEBIT" }, { label: t("ui.收入", "收入"), value: "CREDIT" }, { label: t("ui.调账", "调账"), value: "ADJUSTMENT" }] },
    { key: "pay_method", label: t("ui.结算方式", "结算方式"),   type: "select",
      options: [{ label: t("ui.现金", "现金"), value: "CASH" }, { label: t("ui.转账", "转账"), value: "TRANSFER" }, { label: t("ui.线上", "线上"), value: "ONLINE" }] },
    { key: "pay_date",   label: t("ui.记账日期", "记账日期"),   type: "date" },
    { key: "remark",     label: t("common.remark", "备注"),     type: "textarea" },
    { key: "status",     label: t("common.status", "状态"),     type: "select",
      options: [{ label: t("ui.待审核", "待审核"), value: "PENDING" }, { label: t("ui.已确认", "已确认"), value: "CONFIRMED" }, { label: t("ui.已核销", "已核销"), value: "SETTLED" }] },
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
      <PageHeader
        breadcrumb={[t("ui.财务管理", "财务管理"), t("ui.成本核算", "成本核算")]}
        title={t("ui.成本核算", "成本核算")}
        subtitle={t("ui.管理成本相关财务记录", "管理成本相关财务记录（表：fin_transactions）")} />
      <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
      <RightDrawer open={o} title={e ? t("ui.编辑成本核算", "编辑成本核算") : t("ui.新增成本核算", "新增成本核算")} onClose={cl}>
        <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
      </RightDrawer>
      <ConfirmDialog open={co} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复", "删除后不可恢复？")} onConfirm={cDel} onCancel={()=>sCo(false)} />
    </div>
  );
}
