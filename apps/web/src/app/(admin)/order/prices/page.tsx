"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { LegacyFreezeBanner } from "@/components/LegacyFreezeBanner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

const STATUS_CLS: Record<string,string> = {"ACTIVE":s.badgeSuccess, "EXPIRED":s.badgeNeutral, "INACTIVE":s.badgeNeutral};

const TABLE = "ord_prices";

export default function Page() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "price_code", title: t("ui.价格编码","价格编码"), width: 130 },
    { key: "customer_code", title: t("ui.客户","客户"), width: 120 },
    { key: "sku_code", title: t("ui.品级","品级"), width: 100 },
    { key: "sku_name", title: t("ui.品级名称","品级名称"), width: 140 },
    { key: "unit_price", title: t("ui.合同单价","合同单价"), width: 100 },
    { key: "floor_price", title: t("ui.底价","底价"), width: 100 },
    { key: "valid_from", title: t("ui.生效日","生效日"), width: 100 },
    { key: "valid_to", title: t("ui.到期日","到期日"), width: 100 },
    { key: "status", title: t("common.status","状态"), width: 80, render:(v:unknown)=>{ const u=String(v).toUpperCase(); return <span className={`${s.badge} ${STATUS_CLS[u]??s.badgeNeutral}`}>{u}</span>; }},
  ];
  const FIELDS: FormField[] = [
    { key: "price_code", label: t("ui.价格档位编码","价格档位编码"), type: "text", placeholder: t("ui.留空自动生成","留空自动生成") },
    { key: "customer_code", label: t("ui.客户编码","客户编码"), type: "text", required: true },
    { key: "sku_code", label: t("ui.品级编码","品级编码"), type: "text", required: true },
    { key: "sku_name", label: t("ui.品级名称","品级名称"), type: "text" },
    { key: "unit_price", label: t("ui.合同单价","合同单价"), type: "number", required: true },
    { key: "floor_price", label: t("ui.保底价","保底价"), type: "number" },
    { key: "valid_from", label: t("ui.生效日期","生效日期"), type: "date" },
    { key: "valid_to", label: t("ui.到期日期","到期日期"), type: "date" },
    { key: "status", label: t("common.status","状态"), type: "select", options: [{ label: t("ui.生效中","生效中"), value: "ACTIVE" }, { label: t("ui.已到期","已到期"), value: "EXPIRED" }, { label: t("ui.停用","停用"), value: "INACTIVE" }] },
  ];

  const [drawerOpen,setDrawerOpen]=useState(false);const [editing,setEditing]=useState<Record<string,unknown>|null>(null);
  const [saving,setSaving]=useState(false);const [refreshKey,setRefreshKey]=useState(0);
  const [confirmOpen,setConfirmOpen]=useState(false);const [deleteTarget,setDeleteTarget]=useState<Record<string,unknown>|null>(null);
  const refresh=useCallback(()=>setRefreshKey(k=>k+1),[]);
  const openNew=useCallback(()=>{setEditing(null);setDrawerOpen(true);},[]);
  const openEdit=useCallback((row:Record<string,unknown>)=>{setEditing(row);setDrawerOpen(true);},[]);
  const closeDrawer=useCallback(()=>setDrawerOpen(false),[]);
  const handleSave=useCallback(async(values:Record<string,unknown>)=>{
    setSaving(true);try{editing?.id?await crudApi.update(TABLE,editing.id as number,values):await crudApi.create(TABLE,values);setDrawerOpen(false);refresh();}finally{setSaving(false);}
  },[editing,refresh]);
  const handleDelete=useCallback((row:Record<string,unknown>)=>{setDeleteTarget(row);setConfirmOpen(true);},[]);
  const confirmDelete=useCallback(async()=>{if(!deleteTarget?.id)return;await crudApi.delete(TABLE,deleteTarget.id as number);setConfirmOpen(false);refresh();},[deleteTarget,refresh]);
  return(<div>
    {/* [LEGACY FREEZE] Sales V2 Phase 0 — 此页面已冻结，迁移至 sal_price_books / sal_price_items (Phase 2) */}
    <LegacyFreezeBanner newPath="/sales2/pricing" newModuleName="Sales V2 价格管理" migrationPhase="Phase 2" />
    <PageHeader
        breadcrumb={[t("ui.销售","销售"), t("ui.价格管理","价格管理")]} title={t("ui.合同价格","合同价格")} subtitle={t("ui.合同价格副标题","管理客户合同价格档位（表：ord_prices）")} />
    <DataTable table={TABLE} columns={COLUMNS} onNew={openNew} onEdit={openEdit} onDelete={handleDelete} showActions refreshKey={refreshKey} />
    <RightDrawer open={drawerOpen} title={editing?t("ui.编辑合同价格","编辑合同价格"):t("ui.新增合同价格","新增合同价格")} onClose={closeDrawer}>
      <CrudForm fields={FIELDS} initialValues={editing??{}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
    </RightDrawer>
    <ConfirmDialog open={confirmOpen} title={t("ui.确认删除","确认删除")} message={t("ui.删除不可恢复确认继续","删除后不可恢复，确认继续？")} onConfirm={confirmDelete} onCancel={()=>setConfirmOpen(false)} />
  </div>);
}
