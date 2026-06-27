"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { actionPill } from "@/components/design-system/cockpit-styles";

// g200m: status + store_type DB enum → 中文 + actionPill
const STATUS_CFG: Record<string, { label: string; tone: 'success' | 'default' }> = {
  ACTIVE:   { label: '营业中', tone: 'success' },
  INACTIVE: { label: '已关闭', tone: 'default' },
};
const TYPE_LABEL: Record<string, string> = {
  DIRECT:       '直营',
  FRANCHISE:    '加盟',
  DISTRIBUTION: '经销',
};

// ✅ V3 表: mst_stores
const TABLE = "mst_stores";

export default function Page() {
  const toast = useToast();
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "store_code", title: t("ui.门店编码", "门店编码"), width: 120 },
    { key: "store_name", title: t("ui.门店名称", "门店名称"), width: 160 },
    { key: "address",    title: t("ui.地址", "地址") },
    { key: "contact",    title: t("ui.联系人", "联系人"),     width: 100 },
    { key: "store_type", title: t("ui.类型", "类型"),         width: 90,
      render: (v: unknown) => TYPE_LABEL[String(v ?? '')] ?? String(v ?? '—') },
    { key: "status",     title: t("common.status", "状态"),   width: 80,
      render: (v: unknown) => {
        const cfg = STATUS_CFG[String(v ?? '')] ?? { label: String(v ?? '—'), tone: 'default' as const };
        return <span style={actionPill(cfg.tone)}>{cfg.label}</span>;
      } },
  ];

  const FIELDS: FormField[] = [
    { key: "store_code", label: t("ui.门店编码", "门店编码"), type: "text",   required: true, placeholder: "如：ST-001" },
    { key: "store_name", label: t("ui.门店名称", "门店名称"), type: "text",   required: true },
    { key: "address",    label: t("ui.地址", "地址"),         type: "textarea" },
    { key: "contact",    label: t("ui.联系人", "联系人"),     type: "text" },
    { key: "store_type", label: t("ui.门店类型", "门店类型"), type: "select",
      options: [
        { label: t("ui.直营", "直营"), value: "DIRECT" },
        { label: t("ui.加盟", "加盟"), value: "FRANCHISE" },
        { label: t("ui.经销", "经销"), value: "DISTRIBUTION" },
      ] },
    { key: "status",     label: t("common.status", "状态"),   type: "select",
      options: [{ label: t("ui.营业中", "营业中"), value: "ACTIVE"}, { label: t("ui.已关闭", "已关闭"), value: "INACTIVE" }] },
  ];

  const [o,sO]=useState(false);const [e,sE]=useState<Record<string,unknown>|null>(null);
  const [sv,sSv]=useState(false);const [rk,sRk]=useState(0);
  const [co,sCo]=useState(false);const [dt,sDt]=useState<Record<string,unknown>|null>(null);
  const rf=useCallback(()=>sRk(k=>k+1),[]);
  const oN=useCallback(()=>{sE(null);sO(true);},[]);
  const oE=useCallback((r:Record<string,unknown>)=>{sE(r);sO(true);},[]);
  const cl=useCallback(()=>sO(false),[]);
  const save=useCallback(async(v:Record<string,unknown>)=>{sSv(true);try{e?.id?await crudApi.update(TABLE,e.id as number,v):await crudApi.create(TABLE,v); toast.success(t("ui.保存成功", "保存成功"));sO(false);rf();}finally{sSv(false);}},[e,rf,t]);
  const del=useCallback((r:Record<string,unknown>)=>{sDt(r);sCo(true);},[]);
  const cDel=useCallback(async()=>{if(!dt?.id)return;await crudApi.delete(TABLE,dt.id as number); toast.success(t("ui.已删除", "已删除"));sCo(false);rf();},[dt,rf,t]);

  return (
    <div>
      <PageHeader
        breadcrumb={[t("ui.主数据", "主数据"), t("ui.门店档案", "门店档案")]}
        title={t("ui.门店主档", "门店主档")}
        subtitle={t("ui.管理直营和加盟门店档案", "管理直营和加盟门店档案")} />
      <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
      <RightDrawer open={o} title={e ? t("ui.编辑门店主档", "编辑门店主档") : t("ui.新增门店主档", "新增门店主档")} onClose={cl}>
        <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
      </RightDrawer>
      <ConfirmDialog open={co} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复", "删除后不可恢复？")} onConfirm={cDel} onCancel={()=>sCo(false)} />
    </div>
  );
}
