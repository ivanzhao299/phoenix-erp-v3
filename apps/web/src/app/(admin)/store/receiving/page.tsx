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

// B4: store_receiving 真实列 — order_no (PK) / wave_no / store_code / status / operator / confirmed_at
//     旧版 receive_no / batch_no / qty 全部 DB 不存在
//     枚举 STATUS_CLS 含 PENDING/DONE/RECEIVED 三套互不一致 — 收敛为 PENDING/ACCEPTED/REJECTED
type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";
/* g200k(2026-06-20):状态 tone + 中文 label,按 [feedback_hardcoded_english_to_chinese] */
const STATUS_CFG: Record<string, { tone: Tone; label: string }> = {
  PENDING:  { tone: "warning", label: "待验收" },
  ACCEPTED: { tone: "success", label: "已验收" },
  REJECTED: { tone: "danger",  label: "已拒收" },
};

const TABLE="store_receiving";
export default function Page(){
  const { t } = useLanguage();
  const COLUMNS=[{ key: "order_no", title: t('ui.收货单号', '收货单号'), width: 160 },
      { key: "wave_no", title: t('ui.波次', '波次'), width: 110 },
      { key: "store_code", title: t('ui.门店', '门店'), width: 100 },
      { key: "operator", title: t('ui.收货员', '收货员'), width: 100 },
      { key: "confirmed_at", title: t('ui.确认时间', '确认时间'), width: 160 },
      { key: "status", title: t('common.status', '状态'), width: 90, render:(v:unknown)=>{
        const cfg = STATUS_CFG[String(v)] ?? { tone: "default" as Tone, label: String(v ?? "—") };
        return <span style={actionPill(cfg.tone)}>{cfg.label}</span>;
      }}];
  const FIELDS:FormField[]=[  { key: "order_no", label: t('ui.收货单号', '收货单号'), type: "text", required: true, placeholder: t('ui.留空自动生成SR', '留空自动生成 SR-XXXXXX') },
    { key: "wave_no", label: t('ui.波次号', '波次号'), type: "text" },
    { key: "store_code", label: t('ui.门店编码', '门店编码'), type: "text", required: true },
    { key: "operator", label: t('ui.收货员', '收货员'), type: "text" },
    { key: "status", label: t('common.status', '状态'), type: "select", options: [{ label: t('ui.待验收', '待验收'), value: "PENDING"}, { label: t('ui.已验收', '已验收'), value: "ACCEPTED" }, { label: t('ui.已拒收', '已拒收'), value: "REJECTED" }] },];
  const [o,sO]=useState(false);const [e,sE]=useState<Record<string,unknown>|null>(null);
  const [sv,sSv]=useState(false);const [rk,sRk]=useState(0);
  const [co,sCo]=useState(false);const [dt,sDt]=useState<Record<string,unknown>|null>(null);
  const rf=useCallback(()=>sRk(k=>k+1),[]);
  const oN=useCallback(()=>{sE(null);sO(true);},[]);
  const oE=useCallback((r:Record<string,unknown>)=>{sE(r);sO(true);},[]);
  const cl=useCallback(()=>sO(false),[]);
  const save=useCallback(async(v:Record<string,unknown>)=>{sSv(true);try{
    const payload = (e?.order_no || v.order_no) ? v : { ...v, order_no: `SR-${Date.now().toString().slice(-6)}` };
    e?.order_no
      ? await crudApi.update(TABLE, e.order_no as never, payload as never)
      : await crudApi.create(TABLE, payload);
    sO(false);rf();}finally{sSv(false);}},[e,rf]);
  const del=useCallback((r:Record<string,unknown>)=>{sDt(r);sCo(true);},[]);
  const cDel=useCallback(async()=>{if(!dt?.order_no)return;await crudApi.delete(TABLE,dt.order_no as never);sCo(false);rf();},[dt,rf]);
  return(<div><PageHeader
        breadcrumb={[t('ui.门店管理', '门店管理'), t('ui.门店收货', '门店收货')]} title={t('ui.收货验收', '收货验收')} subtitle={t('ui.管理门店收货记录', '管理门店收货记录')} />
    <DataTable table={TABLE} columns={COLUMNS} onNew={oN} onEdit={oE} onDelete={del} showActions refreshKey={rk} />
    <RightDrawer open={o} title={e?t('ui.编辑收货验收', '编辑收货验收'):t('ui.新增收货验收', '新增收货验收')} onClose={cl}>
      <CrudForm fields={FIELDS} initialValues={e??{}} onSubmit={save} onCancel={cl} loading={sv} />
    </RightDrawer>
    <ConfirmDialog open={co} title={t('common.confirm', '确认删除')} message={t('ui.删除后不可恢复', '删除后不可恢复？')} onConfirm={cDel} onCancel={()=>sCo(false)} />
  </div>);
}
