'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {useLanguage} from '@/contexts/LanguageContext';
import request from '@/lib/api-client';
import s from './ProductionInboundWorkbench.module.css';

export interface ExecutionRecord {
  id:string;document_no:string;company_code:string;warehouse_code:string;state:string;content_hash:string;
  boundary:{houses:Array<{houseCode:string;firstProductionDate:string}>};
  receipt?:{manifestId:string;documentNo:string;contentHash:string;postingDate:string;mode:string;totalOpening:number;domains:Array<{openingReceiptId:string}>}|null;
}
export default function CutoverExecutionReceipt({document,mobile}:{document:ExecutionRecord;mobile:boolean}) {
  const {t}=useLanguage(),[states,setStates]=useState<Record<string,string>>({});
  const receipt=document.receipt;
  const applied=document.state==='APPLIED'&&receipt?.manifestId===document.id&&receipt?.contentHash===document.content_hash&&receipt?.documentNo===document.document_no;
  useEffect(()=>{
    if(!applied)return;
    const controller=new AbortController();
    for(const {houseCode} of document.boundary.houses){
      const qs=new URLSearchParams({companyCode:document.company_code,houseCode});
      request<{state:string}>(`/v2/inventory/production-inbound-documents/context?${qs}`,{signal:controller.signal,silent:true})
        .then(result=>{if(!controller.signal.aborted)setStates(old=>({...old,[houseCode]:result.state}));})
        .catch(()=>{if(!controller.signal.aborted)setStates(old=>({...old,[houseCode]:'UNKNOWN'}));});
    }
    return()=>controller.abort();
  },[applied,document]);
  if(document.state!=='APPROVED'&&document.state!=='APPLIED')return null;
  return <div className={s.notice}>
    <strong>{t(document.state==='APPROVED'?'productionJobs.awaitExecution':applied?'productionJobs.applied':'productionJobs.unverified')}</strong>
    {applied&&receipt&&<><p>{receipt.documentNo} · {receipt.postingDate} · {receipt.mode} · {t('productionCutover.opening')} {receipt.totalOpening}</p>
      {receipt.domains?.map(domain=><code key={domain.openingReceiptId} className={s.wide}>{domain.openingReceiptId} </code>)}</>}
    {document.boundary.houses.map(h=><p key={h.houseCode}>{h.houseCode} · {h.firstProductionDate} · {document.warehouse_code}
      {applied&&<> · {states[h.houseCode]==='SUSPENDED'?t('productionInstallments.suspended'):states[h.houseCode]==='ACTIVE'?t('productionJobs.active'):t('productionJobs.unknown')}</>}
      {' '}<Link href={`${mobile?'/mobile':'/breeding'}/production-inbound?${new URLSearchParams({houseCode:h.houseCode,companyCode:document.company_code,warehouseCode:document.warehouse_code})}`}>{t('productionJobs.dayClose')}</Link></p>)}
  </div>;
}
