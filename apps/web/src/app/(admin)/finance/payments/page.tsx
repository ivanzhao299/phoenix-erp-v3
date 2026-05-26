"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { LegacyFreezeBanner } from "@/components/finance/LegacyFreezeBanner";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 表: fin_payments
const TABLE = "fin_payments";

export default function Page() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "pay_no",     title: t("ui.付款单号", "付款单号"), width: 150 },
    { key: "payee",      title: t("ui.收款方", "收款方"),     width: 130 },
    { key: "amount",     title: t("common.amount", "金额"),   width: 100 },
    { key: "pay_method", title: t("ui.方式", "方式"),         width: 100 },
    { key: "pay_date",   title: t("common.date", "日期"),     width: 110 },
    { key: "status",     title: t("common.status", "状态"),   width: 90 },
  ];

  const FIELDS: FormField[] = [
    { key: "pay_no",     label: t("ui.付款单号", "付款单号"),   type: "text",   placeholder: t("ui.留空自动生成", "留空自动生成") },
    { key: "payee",      label: t("ui.收款方", "收款方"),       type: "text",   required: true },
    { key: "amount",     label: t("ui.付款金额", "付款金额"),   type: "number", required: true },
    { key: "pay_method", label: t("ui.付款方式", "付款方式"),   type: "select",
      options: [{ label: t("ui.现金", "现金"), value: "CASH" }, { label: t("ui.转账", "转账"), value: "TRANSFER" }, { label: t("ui.线上支付", "线上支付"), value: "ONLINE" }] },
    { key: "pay_date",   label: t("ui.付款日期", "付款日期"),   type: "date" },
    { key: "remark",     label: t("common.remark", "备注"),     type: "textarea" },
    { key: "status",     label: t("common.status", "状态"),     type: "select",
      options: [{ label: t("ui.草稿", "草稿"), value: "DRAFT" }, { label: t("ui.待审批", "待审批"), value: "PENDING" }, { label: t("status.approved", "已审批"), value: "APPROVED" }, { label: t("status.paid", "已付款"), value: "PAID" }] },
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
      <LegacyFreezeBanner redirectPath="/procurement2/payments" redirectLabel="前往采购 V2 付款" />
      <PageHeader
        breadcrumb={[t("ui.财务管理", "财务管理"), t("ui.收款管理", "收款管理")]}
        title={t("ui.付款单（已冻结）", "付款单（已冻结）")}
        subtitle={t("ui.管理对外付款单据", "⚠️ 已冻结 — 请使用采购 V2 付款管理")} />
      <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
      <RightDrawer open={o} title={e ? t("ui.编辑付款单", "编辑付款单") : t("ui.新增付款单", "新增付款单")} onClose={cl}>
        <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
      </RightDrawer>
      <ConfirmDialog open={co} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复", "删除后不可恢复？")} onConfirm={cDel} onCancel={()=>sCo(false)} />
    </div>
  );
}
