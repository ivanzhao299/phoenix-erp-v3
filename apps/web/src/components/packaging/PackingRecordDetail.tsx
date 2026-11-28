'use client';
import {PackingCandidateSelect} from './PackingCandidateSelect';
import Link from 'next/link';
import {useEffect,useState,useRef} from 'react';
import {usePackingRecord} from '@/hooks/usePackingRecord';
import {packingHistoryRequest} from '@/lib/packing-history-api';
import {usePathname} from 'next/navigation';
import {useLanguage} from '@/contexts/LanguageContext';
import {restoreVerificationRounds,type VerificationPurpose,type VerificationRound} from './verification-recovery';
import PackingPrintControls from './PackingPrintControls';

const verificationPurposes: VerificationPurpose[] = ['LABEL_CHECK','HANDOVER'];

export default function PackingRecordDetail({packingCode}:{packingCode:string}){
 const state=usePackingRecord(packingCode),pathname=usePathname();
 return <main style={{padding:24,overflow:'auto'}}><Link href={pathname.startsWith('/terminal/')?'/terminal/packaging/history':'/packaging/history'}>包装历史</Link>
 {state.error&&<p role="alert">{state.error}</p>}{state.loading&&<p role="status">读取原单</p>}
 {state.data&&<RecordBody key={JSON.stringify([state.identityKey,state.data.revision])} d={state.data} actorId={state.actorId} identityKey={state.identityKey} reload={state.reload}/>}</main>;
}
type ConfirmBody = {
 contractVersion: 2;
 packingCode: string;
 productionDate: string;
 shiftId: string;
 boxIds: string[];
 verificationIds: string[];
 warehouseCode: string;
 locationCode: string;
 receiverUserId: string;
 expectedRevision: string;
};
type ConfirmIntent = { key: string; body?: ConfirmBody };
type CommitReceipt = {
 receiptState: 'RECORDED';
 handoverCode: string;
 receiverNameSnapshot?: string;
 recordedBy?: string;
 groups?: Array<{batchNo:string;ledgerId:string;qty:number;warehouseCode:string;locationCode:string}>;
};
function recordedReceipt(value:unknown):value is CommitReceipt {
 if(!value||typeof value!=='object')return false;
 const receipt=value as Partial<CommitReceipt>;
 return receipt.receiptState==='RECORDED'&&typeof receipt.handoverCode==='string'&&Boolean(receipt.handoverCode);
}

function RecordBody({d,reload,actorId,identityKey}:{d:any;actorId:string;identityKey:string;reload:()=>void}){
 const {t}=useLanguage();
 const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[reason,setReason]=useState('');
 const [warehouse,setWarehouse]=useState(''),[location,setLocation]=useState(''),[receiver,setReceiver]=useState('');
 const [rounds,setRounds]=useState(()=>restoreVerificationRounds(d.verificationRecovery,actorId,d.revision));
 const [purpose,setPurpose]=useState<VerificationPurpose|null>(()=>verificationPurposes.find(next=>rounds[next])??null),[scan,setScan]=useState('');
 const [now,setNow]=useState(Date.now);
 const [clockOffset]=useState(()=>{
   const serverNow=Date.parse(d.verificationRecovery?.serverNow);
   return Number.isFinite(serverNow)?Date.now()-serverNow:0;
 });
 const currentRound=purpose ? rounds[purpose] : null;
 const legacyUnknownKey=`packing-confirm:${identityKey}`;
 const unknownKey=`packing-confirm:v2:${JSON.stringify([actorId,d.record.code])}`;
 const [unknown,setUnknown]=useState<ConfirmIntent|null>(()=>{
   try {
     const v=JSON.parse(sessionStorage.getItem(unknownKey)||sessionStorage.getItem(legacyUnknownKey)||'null');
     if(typeof v?.key!=='string'||!v.key)return null;
     return {key:v.key,body:v.body?.packingCode===d.record.code?v.body:undefined};
   } catch { return null; }
 });
 const remember=(value:ConfirmIntent|null)=>{
   if(value)sessionStorage.setItem(unknownKey,JSON.stringify(value));
   else sessionStorage.removeItem(unknownKey);
   sessionStorage.removeItem(legacyUnknownKey);
   if(active.current)setUnknown(value);
 };
 const [retryAllowed,setRetryAllowed]=useState(false);
 const [legacy,setLegacy]=useState(false),[observed,setObserved]=useState<Record<string,string>>({});
 const [voidTarget,setVoidTarget]=useState<string|null>(null),[disposition,setDisposition]=useState('');
 const base=`history/${encodeURIComponent(d.record.code)}`;
 useEffect(()=>{setLocation('');setReceiver('');},[warehouse]);
 useEffect(()=>{
   const deadlines=Object.values(rounds).flatMap(round=>[round.expiresAt,...Object.values(round.scans).map(proof=>proof.expiresAt)]).filter(expiresAt=>expiresAt>now);
   if(!deadlines.length)return;
   const timer=setTimeout(()=>setNow(Date.now()),Math.max(0,Math.min(...deadlines)-Date.now()));
   return()=>clearTimeout(timer);
 },[rounds,now]);
 async function run(path:string,body:any,key=crypto.randomUUID()){const result=await packingHistoryRequest(path,{key,body:{...body,expectedRevision:d.revision}});if(!active.current)throw new Error('原单或身份已切换，请查询原操作结果');return result;}
 async function task(fn:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');try{await fn();}catch(e){if(active.current)setMessage(e instanceof Error?e.message:'操作失败');}finally{if(active.current)setBusy(false);}}
 function startVerification(next:VerificationPurpose){
   const previous=rounds[next];
   if(previous&&previous.expiresAt>Date.now()){
     setPurpose(next);
     setScan('');
     return;
   }
   void task(async()=>{
     const result=await run(`${base}/verification-sessions`,{purpose:next});
     const expiresAt=Date.parse(result.expiresAt)+clockOffset;
     const observedAt=Date.now();
     if(typeof result.eventId!=='string'||result.purpose!==next||result.targetRevision!==d.revision||expiresAt<=observedAt||!Number.isFinite(expiresAt)){
       throw new Error(t('packaging.verifyInvalidSession','核验会话无法确认，请重新开始'));
     }
     setRounds(previous=>({...previous,[next]:{eventId:result.eventId,expiresAt,scans:previous[next]?.scans??{}}}));
     setPurpose(next);
     setScan('');
     setNow(observedAt);
   });
 }
 const scannedBoxes=(next:VerificationPurpose)=>{
   const round=rounds[next];
   return round ? d.boxes.filter((box:{boxId:string})=>(round.scans[box.boxId]?.expiresAt??0)>now).length : 0;
 };
 const haveBothScans=verificationPurposes.every(next=>scannedBoxes(next)===d.record.totalBoxes);
 const immutableReceipt:unknown=d.receipt.evidence?.find((event:{event_type?:string})=>event.event_type==='COMMIT_RECEIPT')?.payload;
 const savedReceipt=recordedReceipt(immutableReceipt)?immutableReceipt:null;
 const canRetry=(intent:ConfirmIntent|null)=>Boolean(intent?.body?.expectedRevision===d.revision&&d.handover.state==='PENDING'&&!savedReceipt);
 function acceptConfirmation(value:unknown) {
   if(!recordedReceipt(value))throw new Error(t('packaging.confirmReceiptIncomplete','提交凭据不完整，请查询原操作结果'));
   remember(null);
   setRetryAllowed(false);
   reload();
 }
 async function queryConfirmation(intent:ConfirmIntent|null) {
   setRetryAllowed(false);
   const path=intent?`operations/${encodeURIComponent(intent.key)}?action=CONFIRM&packingCode=${encodeURIComponent(d.record.code)}`
     :`${base}/my-operation?action=CONFIRM`;
   const result=await packingHistoryRequest(path);
   if(!active.current)return null;
   if(result.state==='COMMITTED'){
     acceptConfirmation(intent?result.result:result.payload);
     return null;
   }
   if(result.state==='NOT_FOUND'){
     setRetryAllowed(canRetry(intent));
     setMessage(t('packaging.confirmNotVisible','目前未查到本人提交，原请求可能仍在处理。'));
     return 'NOT_FOUND';
   }
   setMessage(t('packaging.confirmRecoveryPending','提交结果待核，请继续查询原操作。'));
   return null;
 }
 const recordReady=d.handover.quality==='VERIFIED'&&d.record.recordStatus==='ACTIVE'&&d.record.totalBoxes>0;
 const canVerify=recordReady&&d.identityStatus==='REGISTERED'&&d.policy.V&&d.actions.printResult?.allowed!==false;
 return <><h1>{d.record.code}</h1><p>原生产日 {d.record.productionDate} · 原班次 {d.shift.code} / {d.shift.status} · {d.record.recordStatus}</p>
 {d.shift.status==='CLOSED'&&<p>原班次已关闭；此原单可在证据满足时继续标签与交接。</p>}
 <p>{d.ownership.companyCode} / {d.ownership.siteCode} · 原量 {d.record.totalEggs} 枚 / {d.record.totalBoxes} 盒</p>
 <p>交接：{d.handover.state} / {d.handover.quality}；接收人记录：{d.receipt.state}</p>
 <h2>原产出</h2><table><thead><tr><th>序号</th><th>等级 / 规格</th><th>原枚数 / 盒数</th><th>原保存 SKU</th></tr></thead><tbody>{d.outputs.map((o:any)=><tr key={o.outputOrdinal}><td>{o.outputOrdinal+1}</td><td>{o.original.grade} / {o.original.specId||o.original.spec}</td><td>{o.original.eggs} / {o.original.boxes}</td><td>{o.original.skuCode||'未记录'}</td></tr>)}</tbody></table>
 <h2>关联来源</h2>{d.sources.map((s:any,i:number)=><p key={i}>{s.gradingCode} → {s.sourceBatchCode||'关联缺失'} / {s.houseCode}；本单分摊量未记录</p>)}
 <h2>箱身份与标签</h2><p>{d.identityStatus}；期望 {d.expectedBoxCount} 盒</p>
 <label>{t('packaging.printEvidenceReason','登记事实、补打原因或实物核实说明')} <input value={reason} onChange={e=>setReason(e.target.value)}/></label>
 {d.identityStatus==='UNREGISTERED'&&<><label><input type="checkbox" checked={legacy} onChange={e=>setLegacy(e.target.checked)}/>现场已存在旧标签，逐箱登记实测旧码</label>{legacy&&d.outputs.flatMap((o:any)=>Array.from({length:o.original.boxes},(_,i)=>{const k=`${o.outputOrdinal}:${i+1}`;return <label key={k}>产出 {o.outputOrdinal+1} 箱 {i+1} 实测旧码<input value={observed[k]||''} onChange={e=>setObserved(v=>({...v,[k]:e.target.value}))}/></label>;}))}<button disabled={busy||!recordReady||!d.actions.registerBoxes.allowed||!reason.trim()} onClick={()=>task(async()=>{
 await run(`${base}/box-registration`,{registrationKind:legacy?'LEGACY_VERIFIED':'FIRST_LABEL_CONFIRMED',reason,items:d.outputs.flatMap((o:any)=>Array.from({length:o.original.boxes},(_,i)=>({outputOrdinal:o.outputOrdinal,boxOrdinal:i+1,declaration:reason,...(legacy?{observedLabelCode:observed[`${o.outputOrdinal}:${i+1}`]}:{})})))});reload();})}>{legacy?'登记逐箱旧标签实测事实':'确认未贴标事实并登记'}</button><p>{d.actions.registerBoxes.reasons.join('；')}</p></>}
 {d.boxes.map((b:any)=>{const label=b.labels.find((l:any)=>l.kind==='CANONICAL'&&l.status==='ACTIVE'&&l.resolution==='BOUND');return <div key={b.boxId}><p>{label?.code||'标签待核实'} · {b.originalQty} 枚</p>
 <p>{verificationPurposes.map(next=>{
   const checked=(rounds[next]?.scans[b.boxId]?.expiresAt??0)>now;
   return <span key={next} style={{marginInlineEnd:12}}>
     {next==='LABEL_CHECK'?t('packaging.verifyLabelProgress','标签核验'):t('packaging.verifyHandoverProgress','交接核验')}
     {' '}{checked?t('packaging.boxVerified','已核验'):t('packaging.boxNeedsVerification','待核验')}
   </span>;
 })}</p>
 <PackingPrintControls actorId={actorId} packingCode={d.record.code} revision={d.revision} boxId={b.boxId} labelCode={label?.code}
   reason={reason} encodingVersion={d.policy.encodingVersion} events={d.events} blockedReason={b.printBlockedReason}
   canPrint={recordReady&&d.actions.print.allowed} canRecordResult={Boolean(d.actions.printResult?.allowed)}
   busy={busy} task={task} reload={reload}/>
 {label&&recordReady&&d.handover.state==='PENDING'&&d.actions.voidLabel?.allowed&&<>
   <button type="button" disabled={busy||!!b.printBlockedReason} onClick={()=>{setVoidTarget(b.boxId);setDisposition('');}}>
     {t('packaging.voidLabel','作废旧标并换码')}
   </button>
   {voidTarget===b.boxId&&<div>
     <label>{t('packaging.voidDisposition','旧标处置说明')} <input value={disposition} onChange={e=>setDisposition(e.target.value)}/></label>
     <button type="button" disabled={busy||!reason.trim()||!disposition.trim()} onClick={()=>task(async()=>{
       if(!window.confirm(t('packaging.voidConfirm','确认已处置旧标并为该箱生成新码？')))return;
       await run(`${base}/labels/${encodeURIComponent(label.code)}/void`,{reason:reason.trim(),dispositionDeclaration:disposition.trim()});
       reload();
     })}>{t('packaging.voidConfirmButton','确认作废并换码')}</button>
     <button type="button" disabled={busy} onClick={()=>setVoidTarget(null)}>{t('common.cancel','取消')}</button>
   </div>}
 </>}
 </div>;})}
 <p>{d.actions.print.reasons.join('；')}</p><h2>逐箱核验</h2>
 <button type="button" aria-pressed={purpose==='LABEL_CHECK'} disabled={busy||!canVerify} onClick={()=>startVerification('LABEL_CHECK')}>{t('packaging.verifyStartLabel','开始标签核验')}</button>
 <button type="button" aria-pressed={purpose==='HANDOVER'} disabled={busy||!canVerify} onClick={()=>startVerification('HANDOVER')}>{t('packaging.verifyStartHandover','开始交接核验')}</button>
 <form onSubmit={e=>{
   e.preventDefault();
   if(!canVerify||!purpose||!currentRound||!scan.trim()||currentRound.expiresAt<=Date.now())return;
   const {eventId,expiresAt,scans}=currentRound;
   void task(async()=>{
     const b=await packingHistoryRequest(`boxes/resolve?packingCode=${encodeURIComponent(d.record.code)}&labelCode=${encodeURIComponent(scan)}`);
     if(!active.current||expiresAt<=Date.now())return;
     if((scans[b.id]?.expiresAt??0)>Date.now())throw new Error(t('packaging.verifyDuplicate','本轮该箱已核验，请继续下一箱'));
     const result=await run(`${base}/box-verifications`,{boxId:b.id,labelCode:scan,method:'MANUAL',purpose,sessionId:eventId});
     if(typeof result.eventId!=='string'||expiresAt<=Date.now())return;
     setRounds(previous=>{
       const round=previous[purpose];
       return round?.eventId===eventId ? {...previous,[purpose]:{...round,scans:{...round.scans,[b.id]:{eventId:result.eventId,sessionId:eventId,expiresAt}}}} : previous;
     });
     setScan('');
   });
 }}><label>逐箱输入标签码（手工采集）<input value={scan} onChange={e=>setScan(e.target.value)}/></label>
 <button disabled={busy||!canVerify||!currentRound||currentRound.expiresAt<=now||!scan.trim()}>核验本箱</button></form>
 <ul aria-live="polite">{verificationPurposes.map(next=><li key={next}>
   {next==='LABEL_CHECK'?t('packaging.verifyLabelProgress','标签核验'):t('packaging.verifyHandoverProgress','交接核验')} {scannedBoxes(next)} / {d.record.totalBoxes}
   {rounds[next]&&rounds[next].expiresAt<=now ? ` · ${t('packaging.verifyExpired','已过期，请重新核验')}` : ''}
 </li>)}</ul>
 <h2>一次交接入库</h2><p>接收人由操作者记录；不代表接收员本人独立登录签收。</p>
 {[{title:'仓库',value:warehouse,set:setWarehouse,kind:'WAREHOUSE'},{title:'库位',value:location,set:setLocation,kind:'LOCATION'},{title:'接收人',value:receiver,set:setReceiver,kind:'RECEIVER'}].map(f=><PackingCandidateSelect key={`${f.title}:${f.title==='仓库'?'':warehouse}`} title={f.title} value={f.value} onChange={f.set} sourcePath={f.kind==='WAREHOUSE'?`${base}/candidates?kind=WAREHOUSE`:warehouse?`${base}/candidates?kind=${f.kind}&warehouseCode=${encodeURIComponent(warehouse)}`:''} disabled={busy}/>)}
 <button disabled={busy||!recordReady||d.handover.state!=='PENDING'||d.boxes.length!==d.record.totalBoxes||!!unknown||!d.actions.confirm.allowed||!haveBothScans||!warehouse||!location||!receiver} onClick={()=>task(async()=>{
 const handover=rounds.HANDOVER;
 const checkedAt=Date.now();
 const currentScans=(round:VerificationRound|undefined)=>d.boxes.flatMap((box:{boxId:string})=>{
   const proof=round?.scans[box.boxId];
   return proof&&proof.expiresAt>checkedAt?[proof.eventId]:[];
 });
 if(!handover||verificationPurposes.some(next=>currentScans(rounds[next]).length!==d.record.totalBoxes)){
   setNow(checkedAt);
   throw new Error(t('packaging.verifyExpired','已过期，请重新核验'));
 }
 const body:ConfirmBody={contractVersion:2,packingCode:d.record.code,productionDate:d.record.productionDate,shiftId:d.shift.id,boxIds:d.boxes.map((b:{boxId:string})=>b.boxId).sort(),verificationIds:currentScans(handover).sort(),warehouseCode:warehouse,locationCode:location,receiverUserId:receiver,expectedRevision:d.revision};
 if(!window.confirm(`${d.record.code} / ${d.record.productionDate} / ${d.record.totalEggs} 枚 / ${d.record.totalBoxes} 盒 → ${location}，接收人 ${receiver}`))return;
 const key=crypto.randomUUID();
 remember({key,body});
 setRetryAllowed(false);
 const receipt=await packingHistoryRequest('warehouse/confirm',{key,body});
 if(active.current)acceptConfirmation(receipt);
 })}>确认本单交接入库</button>
 <p>{d.actions.confirm.reasons.join('；')}</p>
 {(unknown||!savedReceipt)&&<button type="button" disabled={busy||!actorId} onClick={()=>task(async()=>{await queryConfirmation(unknown);})}>
   {unknown?t('packaging.confirmLookupUnknown','查询未知提交结果'):t('packaging.confirmLookupOwn','查询本人原交库操作')}
 </button>}
 {unknown?.body&&retryAllowed&&<button type="button" disabled={busy} onClick={()=>task(async()=>{
   if(!window.confirm(t('packaging.confirmRetryPrompt','按保存的原操作键和原载荷重试？')))return;
   const status=await queryConfirmation(unknown);
   if(status!=='NOT_FOUND'||!active.current||!canRetry(unknown))return;
   setRetryAllowed(false);
   const result=await packingHistoryRequest('warehouse/confirm',{key:unknown.key,body:unknown.body});
   if(active.current)acceptConfirmation(result);
 })}>{t('packaging.confirmRetry','用原操作键重试')}</button>}
 {savedReceipt&&<section aria-label={t('packaging.originalReceipt','原交库回执')}>
 <h2>{t('packaging.originalReceipt','原交库回执')}</h2><strong>{savedReceipt.handoverCode}</strong>
 <p>{t('packaging.receiptOperator','交库经办人')} {savedReceipt.recordedBy||'—'} · {t('packaging.recordedReceiver','登记接收人')} {savedReceipt.receiverNameSnapshot||'—'}</p>
 {Array.isArray(savedReceipt.groups)&&savedReceipt.groups.map(group=><p key={group.ledgerId}>
   {group.batchNo} · {t('packaging.originalPostedQuantity','原入账')} {group.qty} · {t('packaging.receiptLedger','流水')} {group.ledgerId} · {group.warehouseCode} / {group.locationCode}
 </p>)}
 </section>}
 <h2>原入账与当前库存</h2><p>原入账：{d.inventory.postingQuality}；当前库存：{d.inventory.currentInventoryQuality}</p>{d.inventory.batches.map((b:any)=><p key={b.id}>{b.batch_no} · 当前实存 {b.qty} / 当前可用 {b.qty_available} · {b.warehouse_code} / {b.location_code}</p>)}{d.inventory.ledger.map((l:any)=><p key={l.id}>流水 {l.id} · {l.change_type} · {l.qty_change} · {l.log_date}</p>)}{message&&<p role="alert">{message}</p>}<h2>事件证据</h2>{d.events.map((e:any)=><p key={e.id}>{e.event_type} · {e.server_at} · 操作者 {e.actor_id}</p>)}
 </>;
}
