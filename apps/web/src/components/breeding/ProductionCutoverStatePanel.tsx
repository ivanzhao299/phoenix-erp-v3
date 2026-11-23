'use client';

import { useEffect, useRef, useState } from 'react';
import request from '@/lib/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { AttachmentUploader } from '@/components/design-system/forms/AttachmentUploader';
import s from './ProductionInboundWorkbench.module.css';

interface Props {id:string;actor:string;company:string;warehouse:string;houses:string[]}
interface Member {house_code:string;scope_state:string;product_code:string;domain_state:string;version:number;scope_intent:string|null}
interface Boundary {canManage:boolean;boundaryHash:string;members:Member[]}
interface Receipt {intentKey:string;state:string;houses:string[]}
export default function ProductionCutoverStatePanel({id,actor,company,warehouse,houses}:Props){
  const {t}=useLanguage(),base='/v2/inventory/production-cutovers/'+encodeURIComponent(id);
  const [house,setHouse]=useState(''),[epoch,refresh]=useState(0);
  const [view,setView]=useState<{key:string;data:Boundary}|null>(null),[reason,setReason]=useState(''),[files,setFiles]=useState<string[]>([]);
  const [error,setError]=useState(''),[receipt,setReceipt]=useState<Receipt|null>(null),[busy,setBusy]=useState(false);
  const inFlight=useRef(false),selector=id+':'+house+':'+epoch,storage='cutover-state:'+actor+':'+id;
  const visible=view?.key===selector?view.data:null, members=visible?.members??[];
  const action=members.length&&members.every(m=>m.scope_state==='ACTIVE'&&m.domain_state==='ACTIVE')?'SUSPENDED':
    members.length&&members.every(m=>m.scope_state==='SUSPENDED'&&m.scope_intent===members[0].scope_intent&&m.domain_state===(house?'ACTIVE':'SUSPENDED'))?'ACTIVE':null;
  const stateName=(state:string)=>state==='ACTIVE'?t('pilotState.active','已启用'):t('pilotState.suspended','已暂停');
  useEffect(()=>{
    let live=true;
    request<Boundary>(base+'/state-boundary'+(house?'?houseCode='+encodeURIComponent(house):''))
      .then(data=>{if(live){setView({key:selector,data});setError('');}}).catch((e:Error)=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[base,house,selector]);
  async function operate(recover:boolean){
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try{
      let result:Receipt;
      if(recover){
        const key=sessionStorage.getItem(storage);
        if(!key)throw Error(t('pilotState.noIntent','此账号在本设备没有保存的启停操作号。'));
        result=await request<Receipt>(base+'/state-receipts/'+encodeURIComponent(key));
      }else{
        if(!visible?.canManage||!action||!files[0]||!reason.trim())return;
        const intentKey=crypto.randomUUID();sessionStorage.setItem(storage,intentKey);
        result=await request<Receipt>(base+'/state',{method:'POST',body:JSON.stringify({state:action,intentKey,
          houseCode:house||undefined,boundaryHash:visible.boundaryHash,pauseIntentKey:action==='ACTIVE'?members[0].scope_intent:undefined,
          evidenceFileId:files[0],reason:reason.trim()})});
        setFiles([]);setReason('');
      }
      setReceipt(result);refresh(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <section className={s.card}>
    <h2>{t('pilotState.title','试点运行控制')}</h2>
    <label className={s.field}>{t('pilotState.extent','影响范围')}
      <select value={house} disabled={busy} onChange={e=>{setHouse(e.target.value);setError('');setReceipt(null);setReason('');setFiles([]);}}>
        <option value="">{t('pilotState.shared','共享实物域及所有关联鸡舍')}</option>
        {houses.map(h=><option key={h} value={h}>{t('pilotState.house','仅此鸡舍')} · {h}</option>)}
      </select>
    </label>
    {members.map(m=><p key={m.house_code+':'+m.product_code}>{m.house_code} · {stateName(m.scope_state)} ／ {warehouse} · {m.product_code} · {stateName(m.domain_state)} (v{m.version})</p>)}
    {visible?.canManage&&action&&<>
      <label className={s.field}>{t('pilotState.reason','填写暂停依据或核清库存、未办单及下游引用后的恢复结论')}
        <textarea value={reason} disabled={busy} maxLength={1000} onChange={e=>setReason(e.target.value)}/>
      </label>
      <AttachmentUploader value={files} onChange={setFiles} readOnly={busy} ownership={{moduleCode:'PRODUCTION_CUTOVER',ownerType:'WAREHOUSE',ownerId:warehouse,companyCode:company}}/>
      <button disabled={busy||!files[0]||!reason.trim()} onClick={()=>void operate(false)}>
        {action==='ACTIVE'?t('pilotState.resume','确认恢复上述范围'):t('pilotState.pause','确认暂停上述范围')}
      </button>
    </>}
    <button disabled={busy} onClick={()=>void operate(true)}>{t('pilotState.recover','查回本设备上次启停回执')}</button>
    <button disabled={busy} onClick={()=>refresh(v=>v+1)}>{t('pilotState.reload','重新核对范围')}</button>
    {receipt&&<p role="status">{stateName(receipt.state)} · {receipt.houses.join('、')} · {receipt.intentKey}</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
