'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { HouseSelector, WarehouseSelector, LocationSelector, SpecSelector } from '@/components/shared-selectors/MasterDataSelectors';
import DictSelect from '@/components/shared-selectors/DictSelect';
import { AttachmentUploader } from '@/components/design-system/forms/AttachmentUploader';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import { useProductGrades } from '@/hooks/useProductGrades';
import { useDictOptions } from '@/hooks/useDictOptions';
import request from '@/lib/api-client';
import { localizedMasterName } from '@/lib/localized-master-data';
import s from './ProductionInboundWorkbench.module.css';

const endpoint='/v2/inventory/production-inbound-documents';
const businessDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
const key=()=>crypto.randomUUID();
interface Item { id:string;gradeCode:string;specCode:string;quantity:string;dailyLogId:string }
interface Form { companyCode:string;houseCode:string;siteCode:string;eggDate:string;warehouseCode:string;locationCode:string;intentKey:string;handoverRef:string;replacesId?:string;items:Item[];remark:string;evidenceFileIds:string[] }
interface Source { id:string;dailyLogId:number;gradeCode:string;quantity:number;evidenceFileId:string;shift:string }
interface Handover { id:string;state:string;version:number;handover_ref:string;content_hash:string;created_by:string;confirmed_by:string|null;replaces_id:string|null;payload:{sources:Source[];warehouseCode:string} }
interface Allocation { id:string;daily_log_id:string;quantity:number;reversed_quantity:number }
interface Line { line_no:number;batch_no:string;grade_code:string;quantity:number;current_quantity:string;current_available:string;allocations:Allocation[] }
interface Document { id:string;document_no:string;state:string;kind:string;version:number;intent_key:string;handover_ref:string;company_code:string;house_code:string;production_date:string;content_hash:string;submit_key:string;created_by:string;original_document_id?:string;expected_posting_date:string;payload:{warehouseCode:string;locationCode:string;remark?:string;evidenceFileIds?:string[];items:Array<{gradeCode:string;specCode:string;quantity:number;allocations?:Array<{dailyLogId:number;quantity:number}>;batchNo?:string;sources?:Array<{dailyLogId:number;quantity:number}>}>};siteCode?:string;receipt?:Record<string,unknown>;lines?:Line[];clearances?:Array<{id:string;signed_by:string;signed_at:string;evidence_file_id:string}>;originalBatches?:Array<{batch_no:string;unit_cost:string|null;cost_status:string}> }
interface Balance { scopeState:string;grades:Record<string,{reported:number;posted:number;remaining:number}>;currentStock:Record<string,number>;reports:Array<{id:number;shift:string;grades:Record<string,number>}> }
interface Period { state:'OPEN'|'CLOSED'|null;version:number }
interface Cost { batchNo:string;costStatus:string;unitCost:string }
const emptyForm=():Form=>({companyCode:'',houseCode:'',siteCode:'',eggDate:businessDay(),warehouseCode:'',locationCode:'',intentKey:'',handoverRef:'',items:[],remark:'',evidenceFileIds:[]});

function documentForm(d:Document):Form {
  return {...emptyForm(),companyCode:d.company_code,houseCode:d.house_code,siteCode:d.siteCode??'',eggDate:d.production_date,
    warehouseCode:d.payload.warehouseCode,locationCode:d.payload.locationCode,intentKey:d.intent_key,handoverRef:d.handover_ref??'',
    remark:d.payload.remark??'',evidenceFileIds:d.payload.evidenceFileIds??[],items:d.kind==='INBOUND'?d.payload.items.flatMap(i=>
      (i.allocations??i.sources??[{dailyLogId:0,quantity:i.quantity}]).map(a=>({id:key(),gradeCode:i.gradeCode,specCode:i.specCode,
        quantity:String(a.quantity),dailyLogId:a.dailyLogId?String(a.dailyLogId):''}))):[]};
}

export default function ProductionInboundWorkbench({mobile=false}:{mobile?:boolean}) {
  const {t,lang}=useLanguage();const p=usePermission('MENU_PROD_INBOUND');const finance=usePermission('MENU_FIN2_AR_LEDGER');
  const {grades}=useProductGrades({onlyStorable:true});const {codeMap:states}=useDictOptions('PRODUCTION_INBOUND_DOCUMENT_STATE');
  const {codeMap:kinds}=useDictOptions('PRODUCTION_INBOUND_KIND');const {codeMap:handoverStates}=useDictOptions('PRODUCTION_HANDOVER_STATE');
  const {codeMap:shifts}=useDictOptions('PRODUCTION_REPORT_SHIFT');
  const [form,setForm]=useState<Form>(emptyForm);const [restoredKey,setRestoredKey]=useState('');const [scope,setScope]=useState<string>('');
  const [balance,setBalance]=useState<Balance|null>(null);const [handovers,setHandovers]=useState<Handover[]>([]);const [documents,setDocuments]=useState<Document[]>([]);
  const [selected,setSelected]=useState<Document|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const [savedIntents,setSavedIntents]=useState<Form[]>([]);
  const [reason,setReason]=useState('');const [proof,setProof]=useState<string[]>([]);const [reverseQty,setReverseQty]=useState<Record<string,string>>({});
  const [costs,setCosts]=useState<Cost[]>([]);const [periodMonth,setPeriodMonth]=useState(businessDay().slice(0,7));const [period,setPeriod]=useState<Period|null>(null);
  const [periodState,setPeriodState]=useState('');const storageKey=`production-installments:v1:${String(p.user.userId??p.user.id??p.user.username??'')}`;
  const restored=restoredKey===storageKey;
  const generation=useRef(0);const submitKeys=useRef<Record<string,string>>({});
  const label=(name:string,fallback:string)=>t(`productionInstallments.${name}`,fallback);
  const actor=String(p.user.userId??p.user.id??p.user.username??'');
  const patch=(next:Partial<Form>)=>setForm(old=>({...old,...next}));
  const ownership={moduleCode:'PRODUCTION_INBOUND',ownerType:'HOUSE',ownerId:form.houseCode,companyCode:form.companyCode,storeCode:form.siteCode};
  const canWrite=scope==='ACTIVE';const gradeName=(code:string)=>localizedMasterName(grades.find(g=>g.grade_code===code) as unknown as Record<string,unknown>|undefined,'grade_name',lang)||code;

  const displayDocument=useCallback((d:Document)=>{setSelected(d);setReverseQty({});setForm(documentForm(d));setProof([]);
    setCosts((d.originalBatches??[]).map(b=>({batchNo:b.batch_no,costStatus:b.cost_status,unitCost:b.unit_cost??''})));},[]);
  useEffect(()=>{let alive=true;Promise.resolve().then(()=>{
    if(!alive)return;try{const saved=sessionStorage.getItem(storageKey);const value=saved?JSON.parse(saved):null;
      setForm(value?.form??{...emptyForm(),intentKey:key()});submitKeys.current=value?.submitKeys??{};
      const prefix=`${storageKey}:draft:`;const savedForms=Object.keys(sessionStorage).filter(k=>k.startsWith(prefix)).map(k=>JSON.parse(sessionStorage.getItem(k)??'null')).filter(Boolean) as Form[];
      if(value?.form?.items?.length){sessionStorage.setItem(`${prefix}${value.form.intentKey}`,JSON.stringify(value.form));savedForms.unshift(value.form);}
      setSavedIntents(savedForms.filter((f,i,all)=>all.findIndex(a=>a.intentKey===f.intentKey)===i));
      const id=new URLSearchParams(location.search).get('documentId');if(id)request<Document>(`${endpoint}/${encodeURIComponent(id)}`).then(d=>{if(alive)displayDocument(d);}).catch(e=>{if(alive)setError(String(e.message));});
    }catch{setForm({...emptyForm(),intentKey:key()});}setRestoredKey(storageKey);
  });return()=>{alive=false;};},[storageKey,displayDocument]);
  useEffect(()=>{if(restored)sessionStorage.setItem(storageKey,JSON.stringify({form,submitKeys:submitKeys.current}));},[restored,form,storageKey]);
  useEffect(()=>{if(!restored||!selected)return;const url=new URL(location.href);url.searchParams.set('documentId',selected.id);history.replaceState(null,'',url);},[restored,selected]);
  useEffect(()=>{let alive=true;Promise.resolve().then(async()=>{
    if(!form.houseCode||!form.companyCode){if(alive)setScope('');return;}if(alive)setScope('');
    try{const value=await request<{state:string}>(`${endpoint}/context?${new URLSearchParams({companyCode:form.companyCode,houseCode:form.houseCode})}`);if(alive)setScope(value.state);}
    catch(e){if(alive){setScope('');setError(e instanceof Error?e.message:String(e));}}
  });return()=>{alive=false;};},[form.companyCode,form.houseCode]);
  const refresh=useCallback(async()=>{
    const turn=++generation.current;if(!form.companyCode||!form.houseCode||!form.eggDate)return;
    const qs=new URLSearchParams({companyCode:form.companyCode,houseCode:form.houseCode,eggDate:form.eggDate});
    const [docs,receipts]=await Promise.all([request<Document[]>(`${endpoint}?${qs}`),request<Handover[]>(`${endpoint}/handovers?${qs}`)]);
    if(turn!==generation.current)return;setDocuments(docs);setHandovers(receipts);
    if(form.warehouseCode&&scope&&scope!=='OFF'){
      qs.set('warehouseCode',form.warehouseCode);const result=await request<Balance>(`${endpoint}/balance?${qs}`);if(turn===generation.current)setBalance(result);
    }else setBalance(null);
  },[form.companyCode,form.houseCode,form.eggDate,form.warehouseCode,scope]);
  useEffect(()=>{if(!restored||!p.canView)return;Promise.resolve().then(refresh).catch(e=>setError(e instanceof Error?e.message:String(e)));},[refresh,restored,p.canView]);
  useEffect(()=>{let alive=true;Promise.resolve().then(async()=>{
    if(!finance.canEdit||!form.companyCode){if(alive)setPeriod(null);return;}
    try{const result=await request<Period>(`${endpoint}/posting-period?${new URLSearchParams({companyCode:form.companyCode,periodMonth})}`);if(alive)setPeriod(result);}
    catch(e){if(alive)setError(e instanceof Error?e.message:String(e));}
  });return()=>{alive=false;};},[finance.canEdit,form.companyCode,periodMonth]);
  const run=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await fn();await refresh();}
    catch(e){setError(`${e instanceof Error?e.message:String(e)}\n${label('recoverHint','结果不明时先找回原单，保留原提交键重试。')}`);}finally{setBusy(false);}};
  const send=<T,>(path:string,body:unknown,method='POST')=>request<T>(`${endpoint}${path}`,{method,body:JSON.stringify(body)});
  async function load(id:string) {
    if(restored&&form.intentKey&&form.items.length){sessionStorage.setItem(`${storageKey}:draft:${form.intentKey}`,JSON.stringify(form));
      setSavedIntents(old=>[form,...old.filter(f=>f.intentKey!==form.intentKey)]);}
    const d=await request<Document>(`${endpoint}/${id}`);displayDocument(d);return d;
  }
  const items=()=>{
    const grouped=new Map<string,{gradeCode:string;specCode:string;quantity:number;allocations:Array<{dailyLogId:number;quantity:number}>}>();
    for(const i of form.items){const quantity=Number(i.quantity);if(!i.gradeCode||!i.specCode||!Number.isSafeInteger(quantity)||quantity<=0||!Number(i.dailyLogId))throw new Error(label('positive','请填写实际来源、档位、规格和正整数枚数。'));
      const id=`${i.gradeCode}:${i.specCode}`;const item=grouped.get(id)??{gradeCode:i.gradeCode,specCode:i.specCode,quantity:0,allocations:[]};
      const prior=item.allocations.find(a=>a.dailyLogId===Number(i.dailyLogId));if(prior)prior.quantity+=quantity;else item.allocations.push({dailyLogId:Number(i.dailyLogId),quantity});
      item.quantity+=quantity;grouped.set(id,item);
    }return [...grouped.values()];
  };
  const payload=()=>({...form,siteCode:undefined,replacesId:undefined,items:items()});
  const newIntent=()=>{setSelected(null);setReverseQty({});setProof([]);patch({intentKey:key(),handoverRef:'',replacesId:undefined,items:[],remark:'',evidenceFileIds:[]});history.replaceState(null,'',location.pathname);};
  const freeze=async(d:Document)=>{const submit=submitKeys.current[d.id]??key();submitKeys.current[d.id]=submit;
    sessionStorage.setItem(storageKey,JSON.stringify({form,submitKeys:submitKeys.current}));await send(`/${d.id}/ready`,{version:d.version,submitKey:submit});await load(d.id);};
  const updateItem=(id:string,next:Partial<Item>)=>patch({items:form.items.map(i=>i.id===id?{...i,...next}:i)});
  const preview=async(kind:'handovers'|'documents',id:string,fileId:string)=>{
    const token=sessionStorage.getItem('phoenix_token')||localStorage.getItem('phoenix_token')||'';
    const path=kind==='handovers'?`${endpoint}/handovers/${id}`:`${endpoint}/${id}`;
    const response=await fetch(`/api${path}/evidence/${encodeURIComponent(fileId)}`,{headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok)throw new Error(label('proofUnavailable','无权访问该附件或原证据已失效。'));
    const blob=URL.createObjectURL(await response.blob());window.open(blob,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(blob),60000);
  };
  if(!p.canView)return <p>{label('noPermission','无权查看生产交库。')}</p>;
  if(!restored)return <p>{t('common.loading','加载中…')}</p>;
  return <main className={s.page}>
    {mobile&&<Link href="/mobile/home">{t('common.back','返回')}</Link>}
    <PageHeader title={label('title','正式分次生产入库')} subtitle={label('subtitle','按实际交接逐次入库，保留原单及不可改写的过账回执。')} />
    <div className={s.actions}><Link href={mobile?"/mobile/production-reports":"/breeding/daily"}>{label('daily','产蛋日报')}</Link>{!mobile&&<Link href="/breeding/daily-inbound-ledger">{label('legacy','历史入库资料')}</Link>}
      <button disabled={busy} onClick={()=>run(refresh)}>{t('common.refresh','刷新')}</button><button disabled={busy} onClick={newIntent}>{label('new','新交接意图')}</button></div>
    {error&&<p role="alert" className={`${s.notice} ${s.error}`}>{error}</p>}{notice&&<p role="status" className={s.notice}>{notice}</p>}
    {!!savedIntents.length&&<div className={s.actions}>{savedIntents.map(d=><button key={d.intentKey} disabled={busy} onClick={()=>{setForm(d);setSelected(null);setReverseQty({});}}>{label('resumeDraft','返回暂存交接')} · {d.handoverRef||d.houseCode}</button>)}</div>}
    <section className={s.card} aria-label={label('context','交库范围')}><div className={s.grid}>
      <label className={s.field}>{label('house','鸡舍')}<HouseSelector ariaLabel={label('house','鸡舍')} value={form.houseCode} onChange={v=>patch({houseCode:v,companyCode:'',siteCode:'',warehouseCode:'',locationCode:''})}
        onPick={opt=>patch({companyCode:String(opt?.raw?.companyCode??''),siteCode:String(opt?.raw?.siteCode??'')})} /></label>
      <label className={s.field}>{label('company','归属公司')}<input readOnly value={form.companyCode} style={{background:'var(--bg-muted)',cursor:'not-allowed'}} /></label>
      <label className={s.field}>{label('productionDate','生产日期')}<input type="date" value={form.eggDate} onChange={e=>patch({eggDate:e.target.value})}/></label>
      <label className={s.field}>{label('warehouse','交库仓库')}<WarehouseSelector ariaLabel={label('warehouse','交库仓库')} value={form.warehouseCode} companyCode={form.companyCode} siteCode={form.siteCode} type="EGG_FARM" disabled={!form.companyCode} onChange={v=>patch({warehouseCode:v,locationCode:''})}/></label>
      <label className={s.field}>{label('location','库位')}<LocationSelector ariaLabel={label('location','库位')} value={form.locationCode} lookupEndpoint={`${endpoint}/locations?${new URLSearchParams({companyCode:form.companyCode,houseCode:form.houseCode,warehouseCode:form.warehouseCode})}`} warehouseCode={form.warehouseCode} disabled={!form.warehouseCode} onChange={v=>patch({locationCode:v})}/></label>
    </div>{scope==='OFF'&&<p role="status" className={s.notice}>{label('off','该鸡舍尚未启用正式入库。现场盘点及切换确认后才能办理。')}</p>}
    {scope&&scope!=='OFF'&&scope!=='ACTIVE'&&<p className={s.notice}>{label('suspended','该范围暂停新写入，历史回执仍可查看。')}</p>}</section>
    {balance&&<section className={s.card}><h2>{label('balance','当日产蛋、正式净入与当前库存')}</h2><p className={s.muted}>{label('stockHint','当前库存为该生产日在所选仓的正式批次及其派生批次实存；销售不会返还可入额度。')}</p>
      <div className={s.scroll}><table className={s.table}><thead><tr>{['grade','reported','posted','remaining','current'].map((n,i)=><th key={n}>{label(n,['档位','日报量','已过账净量','剩余额度','当前实存'][i])}</th>)}</tr></thead>
      <tbody>{Object.entries(balance.grades).map(([grade,n])=><tr key={grade}><td>{gradeName(grade)}</td><td>{n.reported}</td><td>{n.posted}</td><td>{n.remaining}</td><td>{balance.currentStock[grade]??0}</td></tr>)}</tbody></table></div></section>}
    <section className={s.card}><h2>{label('thisDelivery','本次实际交接')}</h2><div className={s.grid}>
      <label className={s.field}>{label('handoverRef','实物交接编号')}<input value={form.handoverRef} maxLength={100} onChange={e=>patch({handoverRef:e.target.value})}/></label>
      <label className={s.field}>{t('common.remark','备注')}<input value={form.remark} maxLength={1000} onChange={e=>patch({remark:e.target.value})}/></label></div>
      {form.replacesId&&<p>{label('replaces','重新签认的原交接')}：{form.replacesId}</p>}
      {form.items.map(i=><div key={i.id} className={s.line}>
        <label className={s.field}>{label('grade','档位')}<select aria-label={label('grade','档位')} value={i.gradeCode} onChange={e=>updateItem(i.id,{gradeCode:e.target.value})}><option value="">{t('common.select','请选择')}</option>{grades.map(g=><option key={g.grade_code} value={g.grade_code}>{gradeName(g.grade_code)}</option>)}</select></label>
        <label className={s.field}>{label('spec','规格')}<SpecSelector ariaLabel={label('spec','规格')} value={i.specCode} onChange={v=>updateItem(i.id,{specCode:v})}/></label>
        <label className={s.field}>{label('source','实际日报来源')}<select aria-label={label('source','实际日报来源')} value={i.dailyLogId} onChange={e=>updateItem(i.id,{dailyLogId:e.target.value})}><option value="">{t('common.select','请选择')}</option>{balance?.reports.map(r=><option key={r.id} value={r.id}>{shifts[r.shift]??r.shift} · #{r.id} · {r.grades[i.gradeCode]??0}</option>)}</select></label>
        <label className={s.field}>{label('quantity','本次枚数')}<input type="number" min="1" step="1" value={i.quantity} onChange={e=>updateItem(i.id,{quantity:e.target.value})}/></label>
        <button onClick={()=>patch({items:form.items.filter(row=>row.id!==i.id)})} disabled={busy}>{t('common.remove','移除')}</button>
      </div>)}
      <div className={s.actions}><button disabled={busy||!canWrite||!p.canCreate||!balance} onClick={()=>patch({items:[...form.items,{id:key(),gradeCode:'',specCode:'LOOSE',quantity:'',dailyLogId:balance?.reports.length===1?String(balance.reports[0].id):''}]})}>{label('addLine','增加档位或规格')}</button></div>
      {form.houseCode&&<AttachmentUploader value={form.evidenceFileIds} onChange={v=>patch({evidenceFileIds:v})} ownership={ownership} readOnly={busy||!canWrite||!p.canCreate} label={label('physicalProof','实物交接原证据（班次、档位、数量）')}/>}
      <div className={s.actions}>
        <button disabled={busy||!canWrite||!p.canCreate} onClick={()=>run(async()=>{
          if(!form.evidenceFileIds.length)throw new Error(label('proofRequired','请上传实际交接依据。'));
          const segments:Record<string,{dailyLogId:number;gradeCode:string;quantity:number;evidenceFileId:string}>={};for(const i of items()){
            for(const a of i.allocations){const id=`${a.dailyLogId}:${i.gradeCode}`;const row=segments[id]??={dailyLogId:a.dailyLogId,gradeCode:i.gradeCode,quantity:0,evidenceFileId:form.evidenceFileIds[0]};row.quantity+=a.quantity;}}
          await send('/handovers',{companyCode:form.companyCode,houseCode:form.houseCode,eggDate:form.eggDate,warehouseCode:form.warehouseCode,handoverRef:form.handoverRef,replacesId:form.replacesId,segments:Object.values(segments)});
          setNotice(label('receiverNeeded','交接已登记，请由另一名实际接收人核对分段并签认。'));})}>{label('registerPhysical','登记实物交接')}</button>
        <button disabled={busy||!canWrite||!p.canCreate} onClick={()=>run(async()=>{const d=await send<Document>('',payload());await load(d.id);})}>{label('saveDraft','保存或找回本意图草稿')}</button>
        {selected?.state==='DRAFT'&&selected.kind==='INBOUND'&&<button disabled={busy||!canWrite||!p.canEdit} onClick={()=>run(async()=>{
          if(form.intentKey!==selected.intent_key)throw new Error(label('loadDraftFirst','请先载入此草稿。'));await send(`/${selected.id}`,{...payload(),version:selected.version},'PATCH');await load(selected.id);})}>{label('saveChanges','保存草稿修改')}</button>}
      </div><p className={s.muted}>{label('intentHint','刷新后保留原意图。改变交接身份请新建意图；未确认结果前先找回原单。')}</p>
    </section>
    <section className={s.card}><h2>{label('physicalHistory','实物交接签认')}</h2>{handovers.map(h=><article key={h.id} className={s.card}>
      <strong>{h.handover_ref} · {handoverStates[h.state]??h.state}</strong><p>{label('parties','登记人 / 接收人')}：{h.created_by} / {h.confirmed_by??'—'}</p>
      {h.payload.sources.map(a=><p key={a.id}>{shifts[a.shift]??a.shift} #{a.dailyLogId} · {gradeName(a.gradeCode)} · {a.quantity} <button onClick={()=>run(()=>preview('handovers',h.id,a.evidenceFileId))}>{label('proof','查看原证据')}</button></p>)}
      <div className={s.actions}>{h.state==='DRAFT'&&h.created_by!==actor&&<button disabled={busy||!canWrite||!p.canEdit} onClick={()=>run(async()=>{await send(`/handovers/${h.id}/confirm`,{version:h.version,contentHash:h.content_hash});})}>{label('receive','核对并实名签收')}</button>}
      {h.state!=='CANCELLED'&&<button disabled={busy||!p.canEdit&&!p.canApprove&&!p.canCreate} onClick={()=>run(async()=>{await send(`/handovers/${h.id}/cancel`,{version:h.version,reason,evidenceFileIds:proof});})}>{label('cancelPhysical','按差异依据废止未过账交接')}</button>}
      {h.state==='CANCELLED'&&<button disabled={busy||!canWrite||!p.canCreate} onClick={()=>{newIntent();patch({handoverRef:h.handover_ref,replacesId:h.id});}}>{label('resign','据原交接重新签认')}</button>}</div></article>)}</section>
    <section className={s.card}><h2>{label('history','分次入库及冲销历史')}</h2><div className={s.actions}>
      <button disabled={busy||!form.companyCode} onClick={()=>run(async()=>{const docs=await request<Document[]>(`${endpoint}/recover?${new URLSearchParams({companyCode:form.companyCode,intentKey:form.intentKey})}`);if(docs[0])await load(docs[0].id);else setNotice(label('notFound','尚未找到该意图的单据，可保留原意图重试。'));})}>{label('recover','找回原意图结果')}</button>
      <button disabled={busy||!form.companyCode||!form.handoverRef} onClick={()=>run(async()=>{const found=await request<Document[]>(`${endpoint}/recover?${new URLSearchParams({companyCode:form.companyCode,handoverRef:form.handoverRef})}`);
        if(found.length)setDocuments(found);else setNotice(label('notFound','尚未找到该意图的单据，可保留原意图重试。'));})}>{label('recoverHandover','按实物交接号找回（跨设备）')}</button></div>
      <div className={s.scroll}><table className={s.table}><thead><tr><th>{label('document','单据')}</th><th>{t('common.status','状态')}</th><th>{label('handoverRef','实物交接编号')}</th><th>{t('common.operation','操作')}</th></tr></thead>
        <tbody>{documents.map(d=><tr key={d.id}><td className={s.wide}>{d.document_no}<br/>{kinds[d.kind]??d.kind}</td><td>{states[d.state]??d.state}</td><td>{d.handover_ref??'—'}</td><td><button disabled={busy} onClick={()=>run(async()=>{await load(d.id);})}>{label('view','查看原单')}</button></td></tr>)}</tbody></table></div>
    </section>
    {selected&&<section className={`${s.card} ${s.selected}`}><h2 className={s.wide}>{selected.document_no}</h2><p>{kinds[selected.kind]??selected.kind} · {states[selected.state]??selected.state} · v{selected.version}</p>
      <p>{label('productionDate','生产日期')}：{selected.production_date} · {label('postingDate','记账日期')}：{selected.expected_posting_date??'—'}</p>
      <p>{selected.payload.remark??''}</p>{selected.kind==='REVERSAL'&&<p>{label('reason','实物差异或期间变更依据')}：{String((selected.payload as unknown as {reason?:string}).reason??'')}</p>}
      <div className={s.scroll}><table className={s.table}><thead><tr><th>{label('grade','档位')}</th><th>{label('spec','规格')}</th><th>{label('quantity','本次枚数')}</th><th>{label('source','实际日报来源')}</th></tr></thead>
        <tbody>{selected.payload.items.map((i,n)=><tr key={n}><td>{gradeName(i.gradeCode)}</td><td>{i.specCode}</td><td>{i.quantity}</td><td>{(i.sources??i.allocations??[]).map(a=>`#${a.dailyLogId}: ${a.quantity}`).join(' / ')}</td></tr>)}</tbody></table></div>
      <div className={s.actions}>{selected.payload.evidenceFileIds?.map(file=><button key={file} disabled={busy} onClick={()=>run(()=>preview('documents',selected.id,file))}>{label('proof','查看原证据')}</button>)}</div>
      <div className={s.actions}>
        {selected.state==='DRAFT'&&selected.kind==='INBOUND'&&<button disabled={busy||!p.canEdit} onClick={()=>patch({companyCode:selected.company_code,houseCode:selected.house_code,eggDate:selected.production_date,warehouseCode:selected.payload.warehouseCode,locationCode:selected.payload.locationCode,intentKey:selected.intent_key,handoverRef:selected.handover_ref,remark:selected.payload.remark??'',evidenceFileIds:selected.payload.evidenceFileIds??[],items:selected.payload.items.flatMap(i=>(i.allocations??[{dailyLogId:0,quantity:i.quantity}]).map(a=>({id:key(),gradeCode:i.gradeCode,specCode:i.specCode,quantity:String(a.quantity),dailyLogId:a.dailyLogId?String(a.dailyLogId):''})))})}>{label('loadDraft','载入草稿编辑')}</button>}
        {selected.state==='DRAFT'&&<button disabled={busy||!canWrite||!p.canEdit} onClick={()=>run(()=>freeze(selected))}>{label('ready','核对并冻结本单')}</button>}
        {(selected.state==='READY'&&selected.kind==='INBOUND'||selected.state==='APPROVED'||selected.state==='POSTED')&&<button disabled={busy||selected.state!=='POSTED'&&(!canWrite||!p.canEdit)} onClick={()=>run(async()=>{await send(`/${selected.id}/post`,{submitKey:selected.submit_key,contentHash:selected.content_hash});await load(selected.id);})}>{selected.state==='POSTED'?label('receipt','找回原过账回执'):label('post','过账本单')}</button>}
        {['DRAFT','READY','APPROVED'].includes(selected.state)&&<button disabled={busy||!p.canEdit} onClick={()=>run(async()=>{await send(`/${selected.id}/cancel`,{version:selected.version});await load(selected.id);})}>{label('cancelDocument','取消未过账单')}</button>}
      </div>
      {selected.receipt&&<div className={s.notice} role="status">{label('postedReceipt','原过账回执')} · {label('quantity','本次枚数')} {String(selected.receipt.totalInbound??selected.receipt.totalReversed??'—')} · {label('postingDate','记账日期')} {String(selected.receipt.postingDate??'—')}</div>}
      {selected.lines?.map(l=><div key={l.line_no} className={s.notice}><strong>{gradeName(l.grade_code)} · {l.batch_no}</strong><p>{label('original','原单数量')} {l.quantity} · {label('current','当前实存')} {l.current_quantity} · {label('available','当前可用')} {l.current_available}</p>
        {selected.kind==='INBOUND'&&selected.state==='POSTED'&&l.allocations.map(a=><label key={a.id} className={s.field}>{label('reverseSegment','原来源分段冲销')} #{a.daily_log_id} · {label('reversible','原分段尚未冲销')} {a.quantity-a.reversed_quantity}
          <input type="number" min="0" max={a.quantity-a.reversed_quantity} step="1" disabled={!canWrite||!p.canCreate} value={reverseQty[a.id]??''} onChange={e=>setReverseQty(old=>({...old,[a.id]:e.target.value}))}/></label>)}</div>)}
      {selected.kind==='INBOUND'&&selected.state==='POSTED'&&<div className={s.actions}><button disabled={busy||!canWrite||!p.canCreate} onClick={()=>run(async()=>{
        const storage=`${storageKey}:reversal:${selected.id}`;const prior=sessionStorage.getItem(storage);
        let intent=prior??key();if(prior){const existing=await request<Document[]>(`${endpoint}/recover?${new URLSearchParams({companyCode:selected.company_code,intentKey:prior})}`);
          if(existing[0]&&!['POSTED','CANCELLED'].includes(existing[0].state)){await load(existing[0].id);return;}
          if(existing[0])intent=key();}
        sessionStorage.setItem(storage,intent);
        const segments=Object.entries(reverseQty).filter(([,n])=>Number(n)>0).map(([allocationId,n])=>({allocationId,quantity:Number(n)}));
        const d=await send<Document>(`/${selected.id}/reversals`,{intentKey:intent,reason,segments,evidenceFileIds:proof});await load(d.id);})}>{label('createReversal','依原来源建立冲销草稿')}</button></div>}
      {selected.kind==='REVERSAL'&&finance.canEdit&&selected.state==='READY'&&<div className={s.card}><h3>{label('finance','独立财务核对')}</h3>
        {costs.map((c,i)=><div key={c.batchNo} className={s.grid}><span className={s.wide}>{c.batchNo}</span><DictSelect dictType="PRODUCTION_COST_STATUS" value={c.costStatus} onChange={v=>setCosts(old=>old.map((row,n)=>n===i?{...row,costStatus:v}:row))} allowEmpty={false}/>
          <label className={s.field}>{label('unitCost','账载单位成本（空值表示未知）')}<input type="number" min="0" step="any" value={c.unitCost} onChange={e=>setCosts(old=>old.map((row,n)=>n===i?{...row,unitCost:e.target.value}:row))}/></label></div>)}
        <button disabled={busy||!canWrite||selected.created_by===actor} onClick={()=>run(async()=>{await send(`/${selected.id}/financial-clearance`,{contentHash:selected.content_hash,financialEvidenceFileId:proof[0],periodStatus:'OPEN',costs:costs.map(c=>({...c,unitCost:c.unitCost===''?null:Number(c.unitCost)}))});await load(selected.id);})}>{label('financeSign','提交财务核对回执')}</button></div>}
      {selected.kind==='REVERSAL'&&selected.state==='READY'&&p.canApprove&&<div className={s.actions}>{selected.clearances?.map(c=><div key={c.id}><button disabled={busy} onClick={()=>run(()=>preview('documents',selected.id,c.evidence_file_id))}>{label('financeProof','查看此财务签认原据')}</button><button disabled={busy||!canWrite||selected.created_by===actor} onClick={()=>run(async()=>{await send(`/${selected.id}/approve`,{version:selected.version,contentHash:selected.content_hash,financialClearanceId:c.id});await load(selected.id);})}>{label('approve','审核此摘要及财务回执')} · {c.signed_by}</button></div>)}</div>}
    </section>}
    <section className={s.card}><h2>{label('difference','差异、冲销与期间证据')}</h2><label className={s.field}>{label('reason','实物差异或期间变更依据')}<textarea maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {form.houseCode&&<AttachmentUploader ownership={ownership} value={proof} onChange={setProof} readOnly={busy||!p.canCreate&&!p.canEdit&&!finance.canEdit} label={label('differenceProof','上传本人取得的差异 / 财务依据')}/>}
      {finance.canEdit&&<div className={s.card}><h3>{label('period','财务记账期间')}</h3><div className={s.grid}>
        <label className={s.field}>{label('month','期间月份')}<input type="month" value={periodMonth} onChange={e=>setPeriodMonth(e.target.value)}/></label>
        <label className={s.field}>{label('periodState','设置期间状态')}<DictSelect dictType="PRODUCTION_POSTING_PERIOD_STATE" value={periodState} onChange={setPeriodState}/></label>
        <p>{label('periodVersion','当前期间版本')}：{period?.version??'—'}</p></div><p className={s.muted}>{label('periodHint','冲销须核对原记账月和本次记账月。期间重新开放需要财务审批权，原审批后期间版本变化须重新核对。')}</p>
        <button disabled={busy||!period||!form.houseCode||!periodState||!proof.length} onClick={()=>run(async()=>{await send('/posting-period',{companyCode:form.companyCode,houseCode:form.houseCode,periodMonth,state:periodState,expectedVersion:period?.version,evidenceFileId:proof[0],reason});setPeriod(await request<Period>(`${endpoint}/posting-period?${new URLSearchParams({companyCode:form.companyCode,periodMonth})}`));})}>{label('signPeriod','实名确认期间状态')}</button></div>}
    </section>
  </main>;
}
