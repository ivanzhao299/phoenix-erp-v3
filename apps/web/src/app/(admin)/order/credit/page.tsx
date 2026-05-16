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

const STATUS_CLS: Record<string,string> = {"RESERVED":s.badgeWarning, "RELEASED":s.badgeSuccess, "SETTLED":s.badgeNeutral};

const TABLE = "ord_credit_usage";

export default function Page() {
  const { t } = useLanguage();

  const COLUMNS = [
    { key: "customer_code", title: t("ui.客户编码", "客户编码"), width: 130 },
    { key: "order_no", title: t("ui.关联订单", "关联订单"), width: 150 },
    { key: "amount", title: t("common.amount", "金额"), width: 100 },
    { key: "type", title: t("ui.操作类型", "操作类型"), width: 100, render:(v:unknown)=><span className={`${s.badge} ${STATUS_CLS[String(v)]??s.badgeNeutral}`}>{String(v)}</span>},
  ];
  const FIELDS: FormField[] = [
    { key: "customer_code", label: t("ui.客户编码", "客户编码"), type: "text", required: true },
    { key: "order_no", label: t("ui.关联订单号", "关联订单号"), type: "text" },
    { key: "amount", label: t("common.amount", "金额"), type: "number", required: true },
    { key: "type", label: t("ui.操作类型", "操作类型"), type: "select", required: true, options: [{ label: t("ui.预占", "预占"), value: "RESERVED" }, { label: t("ui.释放", "释放"), value: "RELEASED" }, { label: t("ui.结清", "结清"), value: "SETTLED" }] },
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
  return(<div><PageHeader
        breadcrumb={[t("ui.销售", "销售"), t("ui.信用台账", "信用台账")]} title={t("ui.信用台账", "信用台账")} subtitle={t("ui.信用台账副标题", "客户信用额度占用记录（表：ord_credit_usage）")} />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={openNew} onEdit={openEdit as any} onDelete={handleDelete as any} showActions refreshKey={refreshKey} />
    <RightDrawer open={drawerOpen} title={editing?t("ui.编辑信用台账", "编辑信用台账"):t("ui.新增信用台账", "新增信用台账")} onClose={closeDrawer}>
      <CrudForm fields={FIELDS} initialValues={editing??{}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
    </RightDrawer>
    <ConfirmDialog open={confirmOpen} title={t("ui.确认删除", "确认删除")} message={t("ui.删除不可恢复确认继续", "删除后不可恢复，确认继续？")} onConfirm={confirmDelete} onCancel={()=>setConfirmOpen(false)} />
  </div>);
}
