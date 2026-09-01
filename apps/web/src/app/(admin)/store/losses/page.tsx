"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { actionPill } from "@/components/design-system/cockpit-styles";
import { useToast } from '@/contexts/ToastContext';

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";
/* g200k(2026-06-20):状态 + 原因 中文化,按 [feedback_hardcoded_english_to_chinese] */
const STATUS_CFG: Record<string, { tone: Tone; label: string }> = {
  DRAFT:     { tone: "warning", label: "草稿" },
  CONFIRMED: { tone: "info",    label: "已确认" },
  APPROVED:  { tone: "success", label: "已审核" },
};
const REASON_LABEL: Record<string, string> = {
  EXPIRED: "过期",
  DAMAGED: "损坏",
  THEFT:   "盗失",
  OTHER:   "其他",
};

// ✅ V3 表: store_losses
const TABLE = "store_losses";
export default function Page() {
  const { t } = useLanguage();
  const toast = useToast();
  const COLUMNS = [{ key: "store_code", title: t('ui.门店', '门店'), width: 100 },
      { key: "sku_code", title: t('ui.品级', '品级'), width: 110 },
      { key: "qty", title: t('ui.损耗数量', '损耗数量'), width: 80 },
      { key: "reason", title: t('ui.原因', '原因'), width: 140, render: (v:unknown)=>REASON_LABEL[String(v)] ?? String(v ?? "—") },
      { key: "status", title: t('common.status', '状态'), width: 90, render: (v:unknown)=>{
        const cfg = STATUS_CFG[String(v)] ?? { tone: "default" as Tone, label: String(v ?? "—") };
        return <span style={actionPill(cfg.tone)}>{cfg.label}</span>;
      }}];
  const FIELDS: FormField[] = [
    { key: "store_code", label: t('ui.门店编码', '门店编码'), type: "store", required: true },
    { key: "sku_code", label: t('ui.品级编码', '品级编码'), type: "sku", required: true },
    { key: "qty", label: t('ui.损耗数量', '损耗数量'), type: "number", required: true },
    { key: "reason", label: t('ui.损耗原因', '损耗原因'), type: "dict", dictType: "INV_LOSS_REASON" },
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
  const save=useCallback(async(v:Record<string,unknown>)=>{sSv(true);try{e?.id?await crudApi.update(TABLE,e.id as number,v):await crudApi.create(TABLE,v);toast.success(t('ui.保存成功','保存成功'));sO(false);rf();}catch(x:any){toast.error(x.message||t('ui.保存失败','保存失败'));}finally{sSv(false);}},[e,rf,t,toast]);
  const del=useCallback((r:Record<string,unknown>)=>{sDt(r);sCo(true);},[]);
  const cDel=useCallback(async()=>{if(!dt?.id)return;try{await crudApi.delete(TABLE,dt.id as number);toast.success(t('ui.删除成功','删除成功'));sCo(false);rf();}catch(x:any){toast.error(x.message||t('ui.删除失败','删除失败'));}},[dt,rf,t,toast]);
  return(<div>
    <PageHeader
        breadcrumb={[t('ui.门店管理', '门店管理'), t('ui.损耗上报', '损耗上报')]} title={t('ui.损耗记录', '损耗记录')} subtitle={t('ui.记录门店商品损耗', '记录门店商品损耗')} />
    <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?t('ui.编辑损耗记录', '编辑损耗记录'):t('ui.新增损耗记录', '新增损耗记录')} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title={t('common.confirm', '确认删除')} message={t('ui.删除后不可恢复', '删除后不可恢复？')} onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}
