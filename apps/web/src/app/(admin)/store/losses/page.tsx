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

// ✅ V3 表: store_losses
const TABLE = "store_losses";
export default function Page() {
  const { t } = useLanguage();
  const COLUMNS = [{ key: "store_code", title: t('ui.门店', '门店'), width: 100 },
      { key: "sku_code", title: t('ui.品级', '品级'), width: 110 },
      { key: "qty", title: t('ui.损耗数量', '损耗数量'), width: 80 },
      { key: "reason", title: t('ui.原因', '原因'), width: 140 },
      { key: "status", title: t('common.status', '状态'), width: 90 }];
  const FIELDS: FormField[] = [
    { key: "store_code", label: t('ui.门店编码', '门店编码'), type: "text", required: true },
    { key: "sku_code", label: t('ui.品级编码', '品级编码'), type: "text", required: true },
    { key: "qty", label: t('ui.损耗数量', '损耗数量'), type: "number", required: true },
    { key: "reason", label: t('ui.损耗原因', '损耗原因'), type: "select", options: [{ label: t('ui.过期', '过期'), value: "EXPIRED" }, { label: t('ui.损坏', '损坏'), value: "DAMAGED" }, { label: t('ui.盗失', '盗失'), value: "THEFT" }, { label: t('ui.其他', '其他'), value: "OTHER" }] },
    { key: "remark", label: t('common.remark', '备注'), type: "textarea" },
    { key: "status", label: t('common.status', '状态'), type: "select", options: [{ label: t('ui.草稿', '草稿'), value: "DRAFT" }, { label: t('ui.已确认', '已确认'), value: "CONFIRMED" }, { label: t('status.approved', '已审核'), value: "APPROVED" }] },
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
  return(<div>
    <PageHeader
        breadcrumb={[t('ui.门店管理', '门店管理'), t('ui.损耗上报', '损耗上报')]} title={t('ui.损耗记录', '损耗记录')} subtitle={t('ui.记录门店商品损耗', '记录门店商品损耗（表：store_losses）')} />
    <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?t('ui.编辑损耗记录', '编辑损耗记录'):t('ui.新增损耗记录', '新增损耗记录')} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title={t('common.confirm', '确认删除')} message={t('ui.删除后不可恢复', '删除后不可恢复？')} onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}
