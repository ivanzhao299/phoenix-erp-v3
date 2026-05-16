"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE="crm_activities";
export default function Page(){
  const { t } = useLanguage();
  const COLUMNS=[{ key: "act_code", title: t('ui.活动编码', '活动编码'), width: 130 },
      { key: "name", title: t('ui.活动名称', '活动名称'), width: 160 },
      { key: "type", title: t('ui.类型', '类型'), width: 90 },
      { key: "start_date", title: t('ui.开始日', '开始日'), width: 110 },
      { key: "end_date", title: t('ui.结束日', '结束日'), width: 110 },
      { key: "budget", title: t('ui.预算', '预算'), width: 90 },
      { key: "status", title: t('common.status', '状态'), width: 80 }];
  const FIELDS:FormField[]=[  { key: "act_code", label: t('ui.活动编码', '活动编码'), type: "text", placeholder: t('ui.留空自动生成', '留空自动生成') },
    { key: "name", label: t('ui.活动名称', '活动名称'), type: "text", required: true },
    { key: "type", label: t('ui.活动类型', '活动类型'), type: "select", options: [{ label: t('ui.折扣活动', '折扣活动'), value: "DISCOUNT" }, { label: t('ui.赠品活动', '赠品活动'), value: "GIFT" }, { label: t('ui.积分活动', '积分活动'), value: "POINTS" }, { label: t('ui.组合活动', '组合活动'), value: "COMBO" }] },
    { key: "start_date", label: t('ui.开始日期', '开始日期'), type: "date" },
    { key: "end_date", label: t('ui.结束日期', '结束日期'), type: "date" },
    { key: "budget", label: t('ui.预算金额', '预算金额'), type: "number" },
    { key: "status", label: t('common.status', '状态'), type: "select", options: [{ label: t('ui.草稿', '草稿'), value: "DRAFT" }, { label: t('ui.进行中', '进行中'), value: "ACTIVE" }, { label: t('ui.已结束', '已结束'), value: "ENDED" }, { label: t('status.cancelled', '已取消'), value: "CANCELLED" }] },];
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
  return(<div><PageHeader title={t('ui.营销活动', '营销活动')} subtitle={t('ui.管理营销活动档案', '管理营销活动档案（表：crm_activities）')} />
    <DataTable table={TABLE} columns={COLUMNS as any} onNew={oN} onEdit={oE as any} onDelete={del as any} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?t('ui.编辑营销活动', '编辑营销活动'):t('ui.新增营销活动', '新增营销活动')} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title={t('common.confirm', '确认删除')} message={t('ui.删除后不可恢复', '删除后不可恢复？')} onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}
