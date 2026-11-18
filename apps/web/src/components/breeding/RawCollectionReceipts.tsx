'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import { useDictOptions } from '@/hooks/useDictOptions';
import request from '@/lib/api-client';
import s from './ProductionInboundWorkbench.module.css';

const endpoint='/v2/inventory/raw-collection-receipts';
export interface RawHandover {id:string;state:string;handover_ref:string;payload:{warehouseCode:string;rawCollection?:{
  sourceBatchId:string;batchCode:string;shiftId:string;sourceSnapshot:{received_qty:string}}}}
interface Receipt {company_code:string;house_code:string;production_date:string;warehouse_code:string;id:string;document_no:string;source_batch_id:string;state:string;version:number;created_by:string;ready_by?:string;expected_posting_date?:string;approved_by?:string;approved_at?:string;content_hash:string;submit_key:string;
  payload?:{quantity?:number;source?:{batch_code:string;shift_id:string};sources?:Array<{id:string;dailyLogId:number;gradeCode:string;quantity:number}>};receipt?:{quantity:number;postingDate:string;inventoryCreated:false};segments?:Array<{id:string;daily_log_id:string;grade_code:string;quantity:number}>}
export interface RawSource {id:string;batch_code:string;received_qty:string}
export function RawCollectionSourcePicker({sources,value,disabled,onChange}:{sources:RawSource[];value:string;disabled:boolean;onChange:(value:string)=>void}){
  const {t}=useLanguage();return <label className={s.field}>{t('productionRaw.source','原始采集原行（包装路径）')}
    <select aria-label={t('productionRaw.source','原始采集原行（包装路径）')} disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}>
      <option value="">{t('productionRaw.direct','直接库存交接')}</option>{sources.map(r=><option key={r.id} value={r.id}>{r.batch_code} · {r.received_qty}</option>)}
    </select></label>;
}
export default function RawCollectionReceipts({company,house,date,warehouse,active,busy,handovers,run}:{company:string;house:string;date:string;warehouse:string;
  active:boolean;busy:boolean;handovers:RawHandover[];run:(fn:()=>Promise<void>)=>Promise<void>}){
  const {t}=useLanguage(),p=usePermission('MENU_PROD_INBOUND'),{codeMap:states}=useDictOptions('PRODUCTION_RAW_RECEIPT_STATE');
  const [rows,setRows]=useState<Receipt[]>([]),[selected,setSelected]=useState<Receipt|null>(null),[error,setError]=useState('');
  const generation=useRef(0);
  const actor=String(p.user.userId??p.user.id??''),storage=`raw-collection:v1:${actor}`;
  const label=(name:string,fallback:string)=>t(`productionRaw.${name}`,fallback);
  const refresh=useCallback(async(isCurrent:()=>boolean=()=>true)=>{
    const turn=++generation.current;if(!company||!house||!date||!warehouse){setRows([]);return;}
    const qs=new URLSearchParams({companyCode:company,houseCode:house,productionDate:date,warehouseCode:warehouse});
    const result=await request<Receipt[]>(`${endpoint}?${qs}`);if(turn===generation.current&&isCurrent())setRows(result);
  },[company,house,date,warehouse]);
  useEffect(()=>{let alive=true;Promise.resolve().then(()=>{if(alive)return refresh(()=>alive);}).catch(e=>{if(alive)setError(e.message);});
    return()=>{alive=false;};},[refresh,handovers]);
  useEffect(()=>{Promise.resolve().then(()=>setSelected(null));},[company,house,date,warehouse]);
  const send=(path:string,body:unknown)=>request<Receipt>(`${endpoint}${path}`,{method:'POST',body:JSON.stringify(body)});
  const load=async(id:string)=>{const turn=generation.current;const d=await request<Receipt>(`${endpoint}/${id}`);if(turn!==generation.current||d.company_code!==company||d.house_code!==house||d.production_date!==date||d.warehouse_code!==warehouse)return d;setSelected(d);return d;};
  const action=(fn:()=>Promise<void>)=>run(async()=>{setError('');await fn();await refresh();});
  const savedKey=(name:string)=>{const k=`${storage}:${name}`;let v=sessionStorage.getItem(k);if(!v){v=crypto.randomUUID();sessionStorage.setItem(k,v);}return v;};
  return <section className={s.card} aria-label={label('title','原始收蛋凭证')}>
    <h2>{label('title','原始收蛋凭证')}</h2><p className={s.muted}>{label('hint','完整承接双方已签认的实际采集与日报分段。收蛋凭证保留原始来源，不生成库存；分级、包装实耗须另有实际转换凭证。')}</p>
    {error&&<p role="alert" className={s.error}>{error}</p>}
    {handovers.filter(h=>h.state==='CONFIRMED'&&h.payload.warehouseCode===warehouse&&h.payload.rawCollection).map(h=><div className={s.actions} key={h.id}>
      <span>{h.handover_ref} · {h.payload.rawCollection!.batchCode} · {h.payload.rawCollection!.sourceSnapshot.received_qty}</span>
      <button disabled={busy||!active||!p.canCreate} onClick={()=>action(async()=>{
        const d=await send('',{companyCode:company,houseCode:house,productionDate:date,warehouseCode:warehouse,
          sourceBatchId:h.payload.rawCollection!.sourceBatchId,handoverId:h.id,intentKey:savedKey(`intent:${h.id}`)});await load(d.id);
      })}>{label('create','保存或找回原始收蛋草稿')}</button>
    </div>)}
    <div className={s.scroll}><table className={s.table}><thead><tr><th>{label('document','原始收蛋单')}</th><th>{t('common.status','状态')}</th><th>{t('common.operation','操作')}</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.id}><td className={s.wide}>{r.document_no}</td><td>{states[r.state]??r.state}</td><td>
        <button disabled={busy} onClick={()=>action(async()=>{await load(r.id);})}>{t('common.view','查看')}</button></td></tr>)}</tbody></table></div>
    {selected&&<article className={s.card}><strong className={s.wide}>{selected.document_no}</strong><p>{states[selected.state]??selected.state} · v{selected.version}</p>
      {selected.expected_posting_date&&<p>{t('productionInstallments.postingDate','记账日期')}：{selected.expected_posting_date}</p>}
      {selected.payload?.source&&<p>{selected.payload.source.batch_code} · #{selected.payload.source.shift_id} · {selected.payload.quantity}</p>}
      {selected.payload?.sources?.map(row=><p key={row.id}>#{row.dailyLogId} · {row.gradeCode} · {row.quantity}</p>)}
      <div className={s.actions}>
        {selected.state==='DRAFT'&&<button disabled={busy||!active||!p.canEdit} onClick={()=>action(async()=>{
          await send(`/${selected.id}/ready`,{version:selected.version,submitKey:savedKey(`submit:${selected.id}`)});await load(selected.id);
        })}>{label('ready','核对并冻结来源')}</button>}
        {selected.state==='READY'&&<button disabled={busy||!active||!p.canApprove||selected.created_by===actor||selected.ready_by===actor} onClick={()=>action(async()=>{
          await send(`/${selected.id}/approve`,{version:selected.version,contentHash:selected.content_hash});await load(selected.id);
        })}>{label('approve','独立审核原始来源')}</button>}
        {['APPROVED','POSTED'].includes(selected.state)&&<button disabled={busy||selected.state!=='POSTED'&&(!active||!p.canEdit)} onClick={()=>action(async()=>{
          await send(`/${selected.id}/post`,{submitKey:selected.submit_key,contentHash:selected.content_hash});await load(selected.id);
        })}>{selected.state==='POSTED'?label('replay','找回原收蛋回执'):label('post','确认本次原始收蛋')}</button>}
        {['DRAFT','READY','APPROVED'].includes(selected.state)&&<button disabled={busy||!p.canEdit} onClick={()=>action(async()=>{
          await send(`/${selected.id}/cancel`,{version:selected.version});await load(selected.id);
        })}>{label('cancel','取消未确认收蛋单')}</button>}
      </div>
      {selected.segments?.map(r=><p key={r.id}>#{r.daily_log_id} · {r.grade_code} · {r.quantity}</p>)}
      {selected.receipt&&<p role="status" className={s.notice}>{label('receipt','原收蛋回执')} · {selected.receipt.quantity} · {selected.receipt.postingDate} · {label('noStock','尚未生成库存')}</p>}
    </article>}
  </section>;
}
