'use client';
import Link from 'next/link';
import {useEffect,useState,useRef} from 'react';
import {usePackingRecord} from '@/hooks/usePackingRecord';
import {packingHistoryRequest} from '@/lib/packing-history-api';
import {generateCode128SVG} from '@/lib/barcode';
import {usePathname} from 'next/navigation';
import {printLabel} from '@/components/packaging/printLabel';

export default function PackingRecordDetail({packingCode}:{packingCode:string}){
 const state=usePackingRecord(packingCode),pathname=usePathname();
 return <main style={{padding:24,overflow:'auto'}}><Link href={pathname.startsWith('/terminal/')?'/terminal/packaging/history':'/packaging/history'}>包装历史</Link>
 {state.error&&<p role="alert">{state.error}</p>}{state.loading&&<p role="status">读取原单</p>}
 {state.data&&<RecordBody key={state.identityKey} d={state.data} identityKey={state.identityKey} reload={state.reload}/>}</main>;
}
function RecordBody({d,reload,identityKey}:{d:any;identityKey:string;reload:()=>void}){
 const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[reason,setReason]=useState('');
 const [warehouse,setWarehouse]=useState(''),[location,setLocation]=useState(''),[receiver,setReceiver]=useState('');
 const [warehouses,setWarehouses]=useState<any[]>([]),[locations,setLocations]=useState<any[]>([]),[receivers,setReceivers]=useState<any[]>([]);
 const [session,setSession]=useState<any>(null),[scan,setScan]=useState(''),[scans,setScans]=useState<string[]>([]);
 const unknownKey=`packing-confirm:${identityKey}`;
 const [unknown,setUnknown]=useState<{key:string;body?:any}|null>(()=>{try{const v=JSON.parse(sessionStorage.getItem(unknownKey)||'null');return v&&typeof v.key==='string'?{key:v.key,body:v.body}:null;}catch{return null;}});
 const remember=(value:{key:string;body?:any}|null)=>{if(value)sessionStorage.setItem(unknownKey,JSON.stringify(value));else sessionStorage.removeItem(unknownKey);if(active.current)setUnknown(value);};
 const [retryAllowed,setRetryAllowed]=useState(false);
 const verifiedBoxes=useRef(new Set<string>());
 const [legacy,setLegacy]=useState(false),[observed,setObserved]=useState<Record<string,string>>({});
 const base=`history/${encodeURIComponent(d.record.code)}`;
 useEffect(()=>{let current=true;packingHistoryRequest(`${base}/candidates?kind=WAREHOUSE`).then(v=>{if(current)setWarehouses(v);}).catch(()=>{if(current)setMessage('候选读取失败');});return()=>{current=false;};},[base]);
 useEffect(()=>{let current=true;setLocation('');setReceiver('');setLocations([]);setReceivers([]);setScans([]);verifiedBoxes.current.clear();setSession(null);
 if(warehouse)Promise.all(['LOCATION','RECEIVER'].map(kind=>packingHistoryRequest(`${base}/candidates?kind=${kind}&warehouseCode=${encodeURIComponent(warehouse)}`))).then(([l,r])=>{if(current){setLocations(l);setReceivers(r);}}).catch(()=>{if(current)setMessage('候选读取失败');});return()=>{current=false;};},[warehouse,base]);
 async function run(path:string,body:any,key=crypto.randomUUID()){const result=await packingHistoryRequest(path,{key,body:{...body,expectedRevision:d.revision}});if(!active.current)throw new Error('原单或身份已切换，请查询原操作结果');return result;}
 async function task(fn:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');try{await fn();}catch(e){if(active.current)setMessage(e instanceof Error?e.message:'操作失败');}finally{if(active.current)setBusy(false);}}
 const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return <><h1>{d.record.code}</h1><p>原生产日 {d.record.productionDate} · 原班次 {d.shift.code} / {d.shift.status} · {d.record.recordStatus}</p>
 {d.shift.status==='CLOSED'&&<p>原班次已关闭；此原单可在证据满足时继续标签与交接。</p>}
 <p>{d.ownership.companyCode} / {d.ownership.siteCode} · 原量 {d.record.totalEggs} 枚 / {d.record.totalBoxes} 盒</p>
 <p>交接：{d.handover.state} / {d.handover.quality}；接收人记录：{d.receipt.state}</p>
 <h2>原产出</h2><table><thead><tr><th>序号</th><th>等级 / 规格</th><th>原枚数 / 盒数</th><th>原保存 SKU</th></tr></thead><tbody>{d.outputs.map((o:any)=><tr key={o.outputOrdinal}><td>{o.outputOrdinal+1}</td><td>{o.original.grade} / {o.original.specId||o.original.spec}</td><td>{o.original.eggs} / {o.original.boxes}</td><td>{o.original.skuCode||'未记录'}</td></tr>)}</tbody></table>
 <h2>关联来源</h2>{d.sources.map((s:any,i:number)=><p key={i}>{s.gradingCode} → {s.sourceBatchCode||'关联缺失'} / {s.houseCode}；本单分摊量未记录</p>)}
 <h2>箱身份与标签</h2><p>{d.identityStatus}；期望 {d.expectedBoxCount} 盒</p>
 <label>登记事实 / 补打原因 <input value={reason} onChange={e=>setReason(e.target.value)}/></label>
 {d.identityStatus==='UNREGISTERED'&&<><label><input type="checkbox" checked={legacy} onChange={e=>setLegacy(e.target.checked)}/>现场已存在旧标签，逐箱登记实测旧码</label>{legacy&&d.outputs.flatMap((o:any)=>Array.from({length:o.original.boxes},(_,i)=>{const k=`${o.outputOrdinal}:${i+1}`;return <label key={k}>产出 {o.outputOrdinal+1} 箱 {i+1} 实测旧码<input value={observed[k]||''} onChange={e=>setObserved(v=>({...v,[k]:e.target.value}))}/></label>;}))}<button disabled={busy||!d.actions.registerBoxes.allowed||!reason.trim()} onClick={()=>task(async()=>{
 await run(`${base}/box-registration`,{registrationKind:legacy?'LEGACY_VERIFIED':'FIRST_LABEL_CONFIRMED',reason,items:d.outputs.flatMap((o:any)=>Array.from({length:o.original.boxes},(_,i)=>({outputOrdinal:o.outputOrdinal,boxOrdinal:i+1,declaration:reason,...(legacy?{observedLabelCode:observed[`${o.outputOrdinal}:${i+1}`]}:{})})))});reload();})}>确认未贴标事实并登记</button><p>{d.actions.registerBoxes.reasons.join('；')}</p></>}
 {d.boxes.map((b:any)=>{const label=b.labels.find((l:any)=>l.kind==='CANONICAL'&&l.status==='ACTIVE'&&l.resolution==='BOUND');return <div key={b.boxId}><p>{label?.code||'标签待核实'} · {b.originalQty} 枚</p>
 <button disabled={busy||!label||!d.actions.print.allowed} onClick={()=>task(async()=>{
 const previous=d.events.some((e:any)=>e.event_type==='PRINT_REQUEST'&&e.box_id===b.boxId);
 if(previous&&!reason.trim())throw new Error('补打原因必填');
 const request=await run('labels/print-requests',{packingCode:d.record.code,boxId:b.boxId,labelCode:label.code,printType:previous?'REPRINT':'NORMAL',reason:reason||undefined,copies:1,templateVersion:d.policy.encodingVersion});
 let type='UNKNOWN';try{await printLabel({singleLabelHtml:`<div>${d.policy.encodingVersion==='TEST-NON-BUSINESS-v1'?'TEST / NON-BUSINESS':'包装箱标签'}</div><div>${escape(request.renderPayload.productionDate)}</div>${generateCode128SVG(request.renderPayload.labelCode,{height:60,showText:true})}<div>${escape(request.renderPayload.labelCode)}</div><div>${request.renderPayload.qty} 枚</div>`,css:'@page{size:100mm 60mm}',copies:1});type='DISPATCHED';}catch{type='FAILED';}
 await run(`labels/print-requests/${request.eventId}/events`,{packingCode:d.record.code,type});setMessage('打印请求已记录，仍需实物核验；浏览器调用不证明出纸');reload();})}>请求打印 / 同码补打</button></div>;})}
 <p>{d.actions.print.reasons.join('；')}</p><h2>逐箱核验</h2>
 <button disabled={busy||d.identityStatus!=='REGISTERED'||!d.policy.V} onClick={()=>task(async()=>{setScans([]);verifiedBoxes.current.clear();setSession({...await run(`${base}/verification-sessions`,{purpose:'LABEL_CHECK'}),purpose:'LABEL_CHECK'});})}>开始标签核验</button>
 <button disabled={busy||d.identityStatus!=='REGISTERED'||!d.policy.V} onClick={()=>task(async()=>{setScans([]);verifiedBoxes.current.clear();setSession({...await run(`${base}/verification-sessions`,{purpose:'HANDOVER'}),purpose:'HANDOVER'});})}>开始交接核验</button>
 <form onSubmit={e=>{e.preventDefault();task(async()=>{const b=await packingHistoryRequest(`boxes/resolve?packingCode=${encodeURIComponent(d.record.code)}&labelCode=${encodeURIComponent(scan)}`);
 if(!active.current) return; if(verifiedBoxes.current.has(b.id))throw new Error('本轮该箱已核验，请继续下一箱');
 const result=await run(`${base}/box-verifications`,{boxId:b.id,labelCode:scan,method:'MANUAL',purpose:session.purpose,sessionId:session.eventId});verifiedBoxes.current.add(b.id);setScans(v=>[...v,result.eventId]);setScan('');});}}><label>逐箱输入标签码（手工采集）<input value={scan} onChange={e=>setScan(e.target.value)}/></label><button disabled={busy||!session||!scan.trim()}>核验本箱</button></form><p>{session?.purpose}：本轮已核验 {scans.length} 箱。刷新后未提交草稿需重新核验。</p>
 <h2>一次交接入库</h2><p>接收人由操作者记录；不代表接收员本人独立登录签收。</p>
 {[{title:'仓库',value:warehouse,set:setWarehouse,items:warehouses},{title:'库位',value:location,set:setLocation,items:locations},{title:'接收人',value:receiver,set:setReceiver,items:receivers}].map(f=><fieldset key={f.title}><legend>{f.title}</legend>{f.items.map(i=><label key={i.code}><input type="radio" name={f.title} checked={f.value===i.code} onChange={()=>f.set(i.code)}/>{i.label} ({i.code})</label>)}</fieldset>)}
 <button disabled={busy||!!unknown||!d.actions.confirm.allowed||session?.purpose!=='HANDOVER'||scans.length!==d.record.totalBoxes||!location||!receiver} onClick={()=>task(async()=>{
 const body={contractVersion:2,packingCode:d.record.code,productionDate:d.record.productionDate,shiftId:d.shift.id,boxIds:d.boxes.map((b:any)=>b.boxId).sort(),verificationIds:[...scans].sort(),warehouseCode:warehouse,locationCode:location,receiverUserId:receiver,expectedRevision:d.revision};
 if(!window.confirm(`${d.record.code} / ${d.record.productionDate} / ${d.record.totalEggs} 枚 / ${d.record.totalBoxes} 盒 → ${location}，接收人 ${receiver}`))return;
 const key=crypto.randomUUID();remember({key,body});setRetryAllowed(false);const receipt=await packingHistoryRequest('warehouse/confirm',{key,body});if(!active.current)return;if(receipt.receiptState!=='RECORDED'||!receipt.handoverCode)throw new Error('提交凭据不完整，请查询原操作结果');remember(null);setMessage('交接入库已提交，请核对下方凭据');reload();})}>确认本单交接入库</button>
 <p>{d.actions.confirm.reasons.join('；')}</p>{unknown&&<button disabled={busy} onClick={()=>task(async()=>{const result=await packingHistoryRequest(`operations/${unknown.key}?action=CONFIRM&packingCode=${encodeURIComponent(d.record.code)}`);if(!active.current)return;if(result.state==='COMMITTED'&&result.result?.receiptState==='RECORDED'&&result.result?.handoverCode){remember(null);reload();}setRetryAllowed(result.state==='NOT_FOUND');setMessage(`提交结果：${result.state}，未自动重发`);})}>查询未知提交结果</button>}
 <h2>原入账与当前库存</h2><p>原入账：{d.inventory.postingQuality}；当前库存：{d.inventory.currentInventoryQuality}</p>{d.inventory.batches.map((b:any)=><p key={b.id}>{b.batch_no} · 原数量 {b.qty} / 当前可用 {b.qty_available} · {b.warehouse_code} / {b.location_code}</p>)}{d.inventory.ledger.map((l:any)=><p key={l.id}>流水 {l.id} · {l.change_type} · {l.qty_change} · {l.log_date}</p>)}{unknown?.body&&retryAllowed&&<button disabled={busy} onClick={()=>task(async()=>{if(!window.confirm('以原操作键重试保存的原单请求；不会新建操作键。'))return;const result=await packingHistoryRequest('warehouse/confirm',{key:unknown.key,body:unknown.body});if(!active.current)return;if(result.receiptState!=='RECORDED'||!result.handoverCode)throw new Error('提交凭据不完整');remember(null);setRetryAllowed(false);reload();})}>用原操作键重试</button>}{message&&<p role="alert">{message}</p>}<h2>事件证据</h2>{d.events.map((e:any)=><p key={e.id}>{e.event_type} · {e.server_at} · 操作者 {e.actor_id}</p>)}
 </>;
}
