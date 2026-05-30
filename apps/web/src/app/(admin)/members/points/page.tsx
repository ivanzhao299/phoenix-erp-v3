"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

const TABLE="crm_points_rules";
export default function Page(){
  const { t } = useLanguage();
  const COLUMNS=[{ key: "rule_code", title: t('ui.规则编码', '规则编码'), width: 130 },
      { key: "name", title: t('ui.规则名称', '规则名称'), width: 160 },
      { key: "action", title: t('ui.触发动作', '触发动作'), width: 130 },
      { key: "points", title: t('ui.积分值', '积分值'), width: 90 },
      { key: "status", title: t('common.status', '状态'), width: 80 }];
  const FIELDS:FormField[]=[  { key: "rule_code", label: t('ui.规则编码', '规则编码'), type: "text", required: true, placeholder: t('ui.如PURCHASE_1CNY', '如：PURCHASE_1CNY') },
    { key: "name", label: t('ui.规则名称', '规则名称'), type: "text", required: true },
    { key: "action", label: t('ui.触发动作', '触发动作'), type: "text", required: true, placeholder: t('ui.如PURCHASE_REGISTER_BIRTHDAY', '如：PURCHASE、REGISTER、BIRTHDAY') },
    { key: "points", label: t('ui.积分数值', '积分数值'), type: "number", required: true },
    { key: "status", label: t('common.status', '状态'), type: "select", options: [{ label: t('status.active', '启用'), value: "ACTIVE" }, { label: t('status.inactive', '停用'), value: "INACTIVE" }] },];
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
  return(<div><PageHeader title={t('ui.积分规则', '积分规则')} subtitle={t('ui.管理积分规则配置', '管理积分规则配置')} />
    <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?t('ui.编辑积分规则', '编辑积分规则'):t('ui.新增积分规则', '新增积分规则')} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title={t('common.confirm', '确认删除')} message={t('ui.删除后不可恢复', '删除后不可恢复？')} onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}
