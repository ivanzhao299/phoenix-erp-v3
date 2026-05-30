"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE="crm_coupons";
export default function Page(){
  const { t } = useLanguage();
  const COLUMNS=[{ key: "coupon_code", title: t('ui.券码', '券码'), width: 130 },
      { key: "name", title: t('ui.名称', '名称'), width: 150 },
      { key: "type", title: t('ui.类型', '类型'), width: 80 },
      { key: "discount", title: t('ui.折扣金额', '折扣/金额'), width: 100 },
      { key: "quota", title: t('ui.发行量', '发行量'), width: 80 },
      { key: "used_count", title: t('ui.已用', '已用'), width: 70 },
      { key: "start_date", title: t('ui.生效日', '生效日'), width: 100 },
      { key: "end_date", title: t('ui.失效日', '失效日'), width: 100 },
      { key: "status", title: t('common.status', '状态'), width: 80 }];
  const FIELDS:FormField[]=[  { key: "coupon_code", label: t('ui.券码', '券码'), type: "text", placeholder: t('ui.留空自动生成', '留空自动生成') },
    { key: "name", label: t('ui.优惠券名称', '优惠券名称'), type: "text", required: true },
    { key: "type", label: t('ui.类型', '类型'), type: "select", required: true, options: [{ label: t('ui.折扣券', '折扣券'), value: "DISCOUNT" }, { label: t('ui.满减券', '满减券'), value: "AMOUNT" }, { label: t('ui.赠品券', '赠品券'), value: "FREE" }] },
    { key: "discount", label: t('ui.折扣减免金额', '折扣/减免金额'), type: "number" },
    { key: "min_amount", label: t('ui.最低消费金额', '最低消费金额'), type: "number" },
    { key: "quota", label: t('ui.发行总量', '发行总量'), type: "number" },
    { key: "used_count", label: t('ui.已使用数', '已使用数'), type: "number" },
    { key: "start_date", label: t('ui.生效日期', '生效日期'), type: "date" },
    { key: "end_date", label: t('ui.失效日期', '失效日期'), type: "date" },
    { key: "status", label: t('common.status', '状态'), type: "select", options: [{ label: t('ui.有效', '有效'), value: "ACTIVE" }, { label: t('ui.已过期', '已过期'), value: "EXPIRED" }, { label: t('status.inactive', '停用'), value: "INACTIVE" }] },];
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
  return(<div><PageHeader title={t('ui.优惠券', '优惠券')} subtitle={t('ui.管理优惠券档案', '管理优惠券档案')} />
    <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?t('ui.编辑优惠券', '编辑优惠券'):t('ui.新增优惠券', '新增优惠券')} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title={t('common.confirm', '确认删除')} message={t('ui.删除后不可恢复', '删除后不可恢复？')} onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}
