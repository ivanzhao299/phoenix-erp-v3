"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegacyFreezeBanner } from "@/components/LegacyFreezeBanner";

// ✅ V3 表: b2b_orders
const TABLE = "b2b_orders";

export default function Page() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "order_no",      title: t("ui.订单号", "订单号"),   width: 150 },
    { key: "customer_code", title: t("ui.客户", "客户"),       width: 120 },
    { key: "total_amount",  title: t("common.amount", "金额"), width: 100 },
    { key: "currency_code", title: t("ui.币种", "币种"),       width: 70 },
    { key: "status",        title: t("common.status", "状态"), width: 90 },
    { key: "created_at",    title: t("ui.下单时间", "下单时间"), width: 140 },
  ];

  const FIELDS: FormField[] = [
    { key: "order_no",      label: t("ui.订单号", "订单号"),           type: "text",   placeholder: t("ui.留空自动生成", "留空自动生成") },
    { key: "customer_code", label: t("ui.B2B客户编码", "B2B客户编码"), type: "text",   required: true },
    { key: "total_amount",  label: t("ui.订单金额", "订单金额"),       type: "number" },
    { key: "currency_code", label: t("ui.币种", "币种"),               type: "select",
      options: [{ label: t("ui.人民币", "人民币"), value: "CNY" }, { label: t("ui.老挝基普", "老挝基普"), value: "LAK" }] },
    { key: "is_urgent",     label: t("ui.加急", "加急"),               type: "select",
      options: [{ label: t("ui.是", "是"), value: "true" }, { label: t("ui.否", "否"), value: "false" }] },
    { key: "remark",        label: t("common.remark", "备注"),         type: "textarea" },
    { key: "status",        label: t("ui.订单状态", "订单状态"),       type: "select",
      options: [
        { label: t("ui.待审批", "待审批"),   value: "pending" },
        { label: t("status.approved", "已审批"), value: "approved" },
        { label: t("ui.拣货中", "拣货中"),   value: "picking" },
        { label: t("ui.已发货", "已发货"),   value: "shipped" },
        { label: t("ui.已签收", "已签收"),   value: "received" },
        { label: t("ui.已核销", "已核销"),   value: "reconciled" },
        { label: t("status.cancelled", "已取消"), value: "cancelled" },
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
      <PageHeader title={t("ui.B2B订单", "B2B 订单")} subtitle={t("ui.管理批发分销订单", "管理批发分销订单（表：b2b_orders）")} />
      <LegacyFreezeBanner message="当前模块已冻结，仅保留历史查询，请使用新版销售管理。" newPath="/sales2/orders" newModuleName="新版销售管理" />
      <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
      <RightDrawer open={o} title={e ? t("ui.编辑B2B订单", "编辑B2B 订单") : t("ui.新增B2B订单", "新增B2B 订单")} onClose={cl}>
        <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
      </RightDrawer>
      <ConfirmDialog open={co} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复", "删除后不可恢复？")} onConfirm={cDel} onCancel={()=>sCo(false)} />
    </div>
  );
}
