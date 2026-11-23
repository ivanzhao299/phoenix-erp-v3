'use client';

import { useEffect, useState } from 'react';
import request, { type ApiError } from '@/lib/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import s from './ProductionInboundWorkbench.module.css';

interface Source {
  kind:'INBOUND'|'RAW';documentId:string;documentNo:string;handoverRef:string;originBatchNo:string|null;
  rawSegmentId:string|null;productionDate:string;houseCode:string;dailyLogId:string;occupancyId:string;flockNo:string;gradeCode:string;
}
interface Batch {
  batchNo:string;warehouseCode:string;locationCode:string|null;skuCode:string;unit:string|null;status:string;batchQty:number;
  availableQty:number;attributableQty:number|null;attribution:string;sources:Source[];
}
interface Result {items:Batch[];nextCursor:string|null}
export interface TraceFilter {gradeCode?:string;batchNo?:string;view:'warehouse'|'source'}
export default function ProductionStockTrace({query,filter,onFilter,onDocument}:{query:string;filter:TraceFilter;onFilter:(filter:TraceFilter)=>void;onDocument:(id:string)=>void}) {
  const {t}=useLanguage();
  const [batch,setBatch]=useState(filter.batchNo??''),[after,setAfter]=useState(''),[result,setResult]=useState<Result|null>(null);
  const [error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController(),qs=new URLSearchParams(query);
    for(const [key,value] of Object.entries(filter))if(value)qs.set(key,value);
    if(after)qs.set('after',after);
    request<Result>(`/v2/inventory/production-inbound-documents/stock-batches?${qs}`,{signal:controller.signal,silent:true}).then(page=>{
      if(!controller.signal.aborted)setResult(page);
    }).catch((e:ApiError)=>{if(!controller.signal.aborted)setError(e.status===403?t('productionJobs.forbidden'):e.message);});
    return()=>controller.abort();
  },[query,filter,after,retry,t]);
  function loadPage(cursor:string){setResult(null);setError('');setAfter(cursor);setRetry(n=>n+1);}
  return <section className={s.card} id="stock-trace"><h3>{t('productionJobs.trace')}</h3>
    <form className={s.actions} onSubmit={event=>{event.preventDefault();onFilter({view:'warehouse',batchNo:batch.trim()||undefined});}}>
      <label className={s.field}>{t('productionJobs.batchNo')}<input value={batch} onChange={e=>setBatch(e.target.value)} maxLength={100}/></label>
      <button>{t('productionJobs.findBatch')}</button></form>
    <div className={s.actions}>{(['source','warehouse'] as const).map(view=><button key={view} aria-pressed={filter.view===view} onClick={()=>onFilter({...filter,view})}>{t('productionJobs.view'+view)}</button>)}</div>
    {filter.gradeCode&&<p>{t('productionInstallments.grade')} · {filter.gradeCode}</p>}
    {error?<p role="alert">{error} <button onClick={()=>loadPage(after)}>{t('common.refresh')}</button></p>:!result?<p role="status">{t('common.loading')}</p>:
      <>{!result.items.length&&<p>{t('productionJobs.empty')}</p>}{result.items.map(b=><article key={b.batchNo} className={s.card}>
        <strong className={s.wide}>{b.batchNo}</strong><p>{b.warehouseCode} / {b.locationCode??'—'} · {b.skuCode} · {b.status}</p>
        <p>{t('productionInstallments.current')} {b.batchQty} {b.unit} · {t('productionInstallments.available')} {b.availableQty} {b.unit}</p>
        <p>{t('productionJobs.attributable')} {b.attributableQty??t('productionJobs.unknown')} · {t('productionJobs.'+b.attribution)}</p>
        {b.sources.map((source,i)=><div key={i} className={s.notice}><strong>{source.kind==='INBOUND'?t('productionInstallments.title'):t('productionRaw.source')}</strong>
          <p>{source.kind==='INBOUND'?<button onClick={()=>onDocument(source.documentId)}>{source.documentNo}</button>:source.documentNo} · {source.handoverRef}</p>
          <p>{source.houseCode} · {source.flockNo} · {source.productionDate} · {source.gradeCode}</p>
          <p>{t('productionJobs.dailyLogId')} #{source.dailyLogId} · {t('productionJobs.occupancy')} {source.occupancyId}</p>
          {(source.originBatchNo||source.rawSegmentId)&&<p>{source.originBatchNo} {source.rawSegmentId}</p>}
        </div>)}
      </article>)}<div className={s.actions}>{after&&<button onClick={()=>loadPage('')}>{t('productionJobs.firstPage')}</button>}{result.nextCursor&&<button onClick={()=>loadPage(result.nextCursor!)}>{t('productionJobs.more')}</button>}</div></>}
  </section>;
}
