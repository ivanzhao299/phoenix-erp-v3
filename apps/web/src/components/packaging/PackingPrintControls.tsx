'use client';

import {useEffect,useRef,useState} from 'react';
import {useLanguage} from '@/contexts/LanguageContext';
import {generateCode128SVG} from '@/lib/barcode';
import {packingHistoryRequest} from '@/lib/packing-history-api';
import {
  clearPendingPrint,clearPendingPrintResult,readPendingPrint,readPendingPrintResult,recoverLatestPrintOperation,
  recoverPrintOperation,recoverSavedPrintResult,retryPrintRequestWithSameKey,retryPrintResultWithSameKey,
  savePendingPrint,savePendingPrintResult,type PendingPrintOperation,type PendingPrintResultOperation,
} from '@/lib/packing-print-recovery';
import {printLabel} from './printLabel';

type PrintEvent = {
  id:string;
  event_type:string;
  box_id?:string;
  actor_id?:string;
  payload?:{requestId?:string;type?:string;physicalVerification?:string};
};
type Props = {
  actorId:string;
  packingCode:string;
  revision:string;
  boxId:string;
  labelCode?:string;
  reason:string;
  encodingVersion:string;
  events:PrintEvent[];
  blockedReason?:string|null;
  canPrint:boolean;
  canRecordResult:boolean;
  busy:boolean;
  task:(fn:()=>Promise<void>)=>Promise<void>;
  reload:()=>void;
};
function lastOutcome(events:PrintEvent[],requestId:string) {
  return events.filter(event=>event.event_type==='PRINT_RESULT'&&event.payload?.requestId===requestId).at(-1);
}
const escape=(input:string)=>input.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export default function PackingPrintControls({
  actorId,packingCode,revision,boxId,labelCode,reason,encodingVersion,events,blockedReason,canPrint,canRecordResult,busy,task,reload,
}:Props) {
  const {t}=useLanguage();
  const active=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const ownRequests=events.filter(event=>event.event_type==='PRINT_REQUEST'&&event.box_id===boxId);
  const unresolved=ownRequests.find(event=>{
    const outcome=lastOutcome(events,event.id);
    return !outcome||outcome.payload?.type==='UNKNOWN';
  });
  const [newRequestId,setNewRequestId]=useState<string|null>(null);
  const selectedId=newRequestId??unresolved?.id??ownRequests.at(-1)?.id;
  const outcome=selectedId?lastOutcome(events,selectedId):undefined;
  const canReconcile=canRecordResult&&Boolean(newRequestId||ownRequests.some(event=>event.id===selectedId&&event.actor_id===actorId));
  const [pending,setPending]=useState(()=>readPendingPrint(actorId,packingCode,revision,boxId));
  const [savedResult,setSavedResult]=useState(()=>selectedId?readPendingPrintResult(actorId,packingCode,selectedId):null);
  const [retry,setRetry]=useState<'REQUEST'|'RESULT'|null>(null);
  const [status,setStatus]=useState('');
  const blocked=Boolean(blockedReason||unresolved||newRequestId||pending||savedResult);

  function rememberRequest(operation:PendingPrintOperation) {
    savePendingPrint(operation);
    setPending(operation);
  }
  function finishRequest(operation:PendingPrintOperation,eventId:string) {
    clearPendingPrint(operation);
    if(active.current){setPending(null);setNewRequestId(eventId);setRetry(null);}
  }
  async function recordResult(requestId:string,body:Record<string,unknown>) {
    const operation={actorId,packingCode,requestId,key:crypto.randomUUID(),body:{packingCode,...body},startedAt:new Date().toISOString()};
    savePendingPrintResult(operation);
    if(!active.current)return;
    setSavedResult(operation);
    const result=await packingHistoryRequest(`labels/print-requests/${encodeURIComponent(requestId)}/events`,{key:operation.key,body:operation.body});
    if(typeof result?.eventId!=='string'||result.requestId!==requestId||result.type!==body.type)
      throw new Error(t('packaging.printResultPending','原打印结果写入待核'));
    clearPendingPrintResult(operation);
    if(active.current){setSavedResult(null);setRetry(null);reload();}
  }
  function startRequest() {
    if(!labelCode||!actorId||blocked||!canPrint)return;
    void task(async()=>{
      if(ownRequests.length&&!reason.trim())throw new Error(t('packaging.printRepeatReason','请填写补打原因'));
      const body={packingCode,boxId,labelCode,printType:ownRequests.length?'REPRINT':'NORMAL',reason:reason.trim()||undefined,
        copies:1,templateVersion:encodingVersion,expectedRevision:revision};
      const operation={actorId,packingCode,revision,boxId,key:crypto.randomUUID(),body,startedAt:new Date().toISOString()};
      rememberRequest(operation);
      const request=await packingHistoryRequest('labels/print-requests',{key:operation.key,body:operation.body});
      if(!active.current)return;
      if(typeof request?.eventId!=='string'||!request.renderPayload)throw new Error(t('packaging.printRecoveryPending','原打印请求结果待核，请先查询'));
      finishRequest(operation,request.eventId);
      try {
        const payload=request.renderPayload;
        await printLabel({singleLabelHtml:`<div>${encodingVersion==='TEST-NON-BUSINESS-v1'?'TEST / NON-BUSINESS':t('packaging.printLabelTitle','包装箱标签')}</div><div>${escape(payload.productionDate)}</div>${generateCode128SVG(payload.labelCode,{height:60,showText:true})}<div>${escape(payload.labelCode)}</div><div>${Number(payload.qty)} ${t('ui.枚','枚')}</div>`,
          css:'@page{size:100mm 60mm}',copies:1});
      } catch { /* The printer result still requires a physical check. */ }
      await recordResult(request.eventId,{type:'UNKNOWN',clientOccurredAt:new Date().toISOString()});
    });
  }
  async function queryRequest() {
    setRetry(null);
    if(!pending){
      const latest=await recoverLatestPrintOperation(packingCode,packingHistoryRequest,boxId);
      if(!active.current)return;
      if(latest.state==='COMMITTED'&&typeof latest.eventId==='string'){
        await packingHistoryRequest(`labels/print-requests/${encodeURIComponent(latest.eventId)}`);
        if(active.current)reload();
      } else setStatus(t('packaging.printOwnNotFound','目前未查到本人已提交的原打印请求'));
      return;
    }
    const result=await recoverPrintOperation(pending);
    if(!active.current)return;
    if(result.state==='COMMITTED'&&result.eventId){finishRequest(pending,result.eventId);reload();return;}
    if(result.state==='NOT_FOUND')setRetry('REQUEST');
    setStatus(t('packaging.printRecoveryPending','原打印请求结果待核，请先查询'));
  }
  async function queryResult(requestId:string) {
    setRetry(null);
    if(!savedResult){
      await packingHistoryRequest(`labels/print-requests/${encodeURIComponent(requestId)}`);
      if(active.current)reload();
      return;
    }
    const found=await recoverSavedPrintResult(savedResult);
    if(!active.current)return;
    if(found.state==='COMMITTED'){clearPendingPrintResult(savedResult);setSavedResult(null);reload();return;}
    if(found.state==='NOT_FOUND')setRetry('RESULT');
    setStatus(t('packaging.printResultPending','原打印结果写入待核'));
  }
  async function retrySavedResult(operation:PendingPrintResultOperation) {
    setRetry(null);
    const result=await retryPrintResultWithSameKey(operation);
    if(typeof result?.eventId!=='string'||result.requestId!==operation.requestId||result.type!==operation.body.type)
      throw new Error(t('packaging.printResultPending','原打印结果写入待核'));
    clearPendingPrintResult(operation);
    if(active.current){setSavedResult(null);reload();}
  }
  function physicalResult(printed:boolean) {
    if(!selectedId||!canReconcile||savedResult||!reason.trim())return;
    const prompt=printed?t('packaging.printPhysicalPresent','确认现场已找到本请求的实体标签？')
      :t('packaging.printPhysicalAbsent','确认已核实现场未出纸？');
    if(!window.confirm(prompt))return;
    void task(()=>recordResult(selectedId,{type:printed?'DISPATCHED':'FAILED',reconciliationReason:reason.trim(),
      physicalVerification:printed?'CONFIRMED_PRESENT':'CONFIRMED_ABSENT'}));
  }

  return <>
    <button type="button" disabled={busy||!actorId||!labelCode||!canPrint||blocked} onClick={startRequest}>{t('packaging.printRequest','请求打印 / 同码补打')}</button>
    {blocked&&<p role="status">{blockedReason||t('packaging.printPhysicalUnknown','打印结果待核，请查看原请求并核对实物')}</p>}
    <button type="button" disabled={busy||!actorId} onClick={()=>task(queryRequest)}>{t('packaging.printLookupOriginal','查询本人原打印请求')}</button>
    {pending&&retry==='REQUEST'&&<button type="button" disabled={busy||!canPrint} onClick={()=>task(async()=>{
      setRetry(null);
      const request=await retryPrintRequestWithSameKey(pending);
      if(!active.current)return;
      if(typeof request?.eventId!=='string')throw new Error(t('packaging.printRecoveryPending','原打印请求结果待核，请先查询'));
      finishRequest(pending,request.eventId);
      reload();
    })}>{t('packaging.printRetryOriginal','按原键重试打印请求')}</button>}
    {selectedId&&<div>
      <p>{t('packaging.printOriginalId','原打印请求')} <code>{selectedId}</code> · {outcome?.payload?.type||'UNKNOWN'}</p>
      <button type="button" disabled={busy} onClick={()=>task(()=>queryResult(selectedId))}>{t('packaging.printLookupResult','查看原打印结果')}</button>
      {savedResult&&retry==='RESULT'&&<button type="button" disabled={busy||!canRecordResult} onClick={()=>task(()=>retrySavedResult(savedResult))}>{t('packaging.printRetryResult','按原键重试记录结果')}</button>}
      {canReconcile&&(!outcome||outcome.payload?.type==='UNKNOWN')&&<>
        <button type="button" disabled={busy||!!savedResult||!reason.trim()} onClick={()=>physicalResult(true)}>{t('packaging.printConfirmPresent','已核实出纸')}</button>
        <button type="button" disabled={busy||!!savedResult||!reason.trim()} onClick={()=>physicalResult(false)}>{t('packaging.printConfirmAbsent','已核实未出纸')}</button>
      </>}
    </div>}
    {status&&<p role="status">{status}</p>}
  </>;
}
