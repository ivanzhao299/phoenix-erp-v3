'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { HouseSelector, WarehouseSelector, LocationSelector, SpecSelector } from '@/components/shared-selectors/MasterDataSelectors';
import DictSelect from '@/components/shared-selectors/DictSelect';
import { AttachmentUploader } from '@/components/design-system/forms/AttachmentUploader';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import { useEggSourceProfile, varietyShortLabel } from '@/hooks/useEggSourceProfile';
import { SourceProfileBanner } from './SourceProfileBanner';
import { useProductGrades } from '@/hooks/useProductGrades';
import { useDictOptions } from '@/hooks/useDictOptions';
import request, { type ApiError } from '@/lib/api-client';
import { localizedMasterName } from '@/lib/localized-master-data';
import { previewProtectedAttachment } from '@/lib/attachments';
import s from './ProductionInboundWorkbench.module.css';
import RawCollectionReceipts,{RawCollectionSourcePicker,type RawSource} from './RawCollectionReceipts';
import ProductionStockTrace, {type TraceFilter} from './ProductionStockTrace';
import InventoryConversions from './InventoryConversions';

const endpoint='/v2/inventory/production-inbound-documents';
const businessDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
const key=()=>crypto.randomUUID();
interface Item { id:string;gradeCode:string;specCode:string;quantity:string;dailyLogId:string }
interface Form { companyCode:string;houseCode:string;siteCode:string;eggDate:string;warehouseCode:string;locationCode:string;intentKey:string;handoverRef:string;replacesId?:string;rawCollectionSourceId?:string;items:Item[];remark:string;evidenceFileIds:string[] }
interface Source { id:string;dailyLogId:number;gradeCode:string;quantity:number;evidenceFileId:string;shift:string }
interface Handover { id:string;state:string;version:number;handover_ref:string;content_hash:string;created_by:string;confirmed_by:string|null;confirmed_at?:string;replaces_id:string|null;payload:{sources:Source[];warehouseCode:string;rawCollection?:{sourceBatchId:string;batchCode:string;shiftId:string;sourceSnapshot:{received_qty:string}}} }
interface Allocation { id:string;daily_log_id:string;quantity:number;reversed_quantity:number }
interface Line { line_no:number;batch_no:string;grade_code:string;quantity:number;current_quantity:string;current_available:string;allocations:Allocation[] }
interface Document { id:string;document_no:string;state:string;kind:string;version:number;intent_key:string;handover_ref:string;company_code:string;house_code:string;production_date:string;content_hash:string;submit_key:string;created_by:string;original_document_id?:string;expected_posting_date:string;payload:{warehouseCode:string;locationCode:string;remark?:string;evidenceFileIds?:string[];items:Array<{gradeCode:string;specCode:string;quantity:number;allocations?:Array<{dailyLogId:number;quantity:number}>;batchNo?:string;sources?:Array<{dailyLogId:number;quantity:number}>}>};siteCode?:string;receipt?:Record<string,unknown>;lines?:Line[];clearances?:Array<{id:string;signed_by:string;signed_at:string;evidence_file_id:string}>;originalBatches?:Array<{batch_no:string;unit_cost:string|null;cost_status:string}> }
interface SourceBalance {
  dailyLogId:number;shift:string;productionDate?:string;flockNo?:string;occupancyId?:string;gradeCode:string;confirmedQty:number;
  ordinaryNet:number|null;rawUsedQty:number|null;remaining:number|null;
}
interface Balance { sourceReviewRequired?:boolean;stockBasisVersion?:number;stockByGrade?:Record<string,{attributableQty:number|null;warehouseQty:number;mixedBatchCount:number}>;scopeState:string;grades:Record<string,{reported:number;posted:number;remaining:number}>;currentStock:Record<string,number>;sourceBalances?:SourceBalance[];reports:Array<{id:number;shift:string;grades:Record<string,number>}> }
interface Period { state:'OPEN'|'CLOSED'|null;version:number }
const emptyForm=():Form=>({companyCode:'',houseCode:'',siteCode:'',eggDate:businessDay(),warehouseCode:'',locationCode:'',intentKey:'',handoverRef:'',items:[],remark:'',evidenceFileIds:[]});

function documentForm(d:Document):Form {
  return {...emptyForm(),companyCode:d.company_code,houseCode:d.house_code,siteCode:d.siteCode??'',eggDate:d.production_date,
    warehouseCode:d.payload.warehouseCode,locationCode:d.payload.locationCode,intentKey:d.intent_key,handoverRef:d.handover_ref??'',
    remark:d.payload.remark??'',evidenceFileIds:d.payload.evidenceFileIds??[],items:d.kind==='INBOUND'?d.payload.items.flatMap(i=>
      (i.allocations??i.sources??[{dailyLogId:0,quantity:i.quantity}]).map(a=>({id:key(),gradeCode:i.gradeCode,specCode:i.specCode,
        quantity:String(a.quantity),dailyLogId:a.dailyLogId?String(a.dailyLogId):''}))):[]};
}

export default function ProductionInboundWorkbench({mobile=false}:{mobile?:boolean}) {
  const {user,canView}=usePermission('MENU_PROD_INBOUND');
  const actor=String(user.userId??user.id??user.username??'');
  const {t}=useLanguage();
  if(!actor||!canView)return <p>{t('productionInstallments.noPermission')}</p>;
  return <ActorWorkbench key={actor} actor={actor} mobile={mobile}/>;
}

function ActorWorkbench({actor,mobile}:{actor:string;mobile:boolean}) {
  const {t,lang}=useLanguage();const p=usePermission('MENU_PROD_INBOUND');const finance=usePermission('MENU_FIN2_AR_LEDGER');
  const {grades}=useProductGrades({onlyStorable:true});const {codeMap:states}=useDictOptions('PRODUCTION_INBOUND_DOCUMENT_STATE');
  const {codeMap:kinds}=useDictOptions('PRODUCTION_INBOUND_KIND');const {codeMap:handoverStates}=useDictOptions('PRODUCTION_HANDOVER_STATE');
  const {codeMap:shifts}=useDictOptions('PRODUCTION_REPORT_SHIFT');
  const [form,setForm]=useState<Form>(emptyForm);const [restoredKey,setRestoredKey]=useState('');const [snapshotKey,setSnapshotKey]=useState('');const [scope,setScope]=useState('');const [rangeStatus,setRangeStatus]=useState<'idle'|'loading'|'verified'|'refreshing'|'failed'>('idle');
  const [rawSources,setRawSources]=useState<RawSource[]>([]);
  const [balance,setBalance]=useState<Balance|null>(null);const [handovers,setHandovers]=useState<Handover[]>([]);const [documents,setDocuments]=useState<Document[]>([]);
  const [selected,setSelected]=useState<Document|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const [savedIntents,setSavedIntents]=useState<Form[]>([]);
  const [reason,setReason]=useState('');const [proof,setProof]=useState<string[]>([]);const [reverseQty,setReverseQty]=useState<Record<string,string>>({});
  const [periodMonth,setPeriodMonth]=useState(businessDay().slice(0,7));const [period,setPeriod]=useState<Period|null>(null);
  const [periodState,setPeriodState]=useState('');const storageKey=`production-installments:v1:${String(p.user.userId??p.user.id??p.user.username??'')}`;
  const restored=restoredKey===storageKey;
  const generation=useRef(0);const submitKeys=useRef<Record<string,string>>({});
  const rangeKey=JSON.stringify([actor,form.companyCode,form.houseCode,form.eggDate,form.warehouseCode]);
  const verified=restored&&rangeKey===snapshotKey&&(rangeStatus==='verified'||rangeStatus==='refreshing');
  const [recovered,setRecovered]=useState<Document[]|null>(null);
  const [reviewOnly,setReviewOnly]=useState(false),[rangeVersion,setRangeVersion]=useState(0);
  const commercial = useEggSourceProfile(p.canView ? form.houseCode : '', form.eggDate, form.companyCode, rangeVersion);
  const variety = varietyShortLabel(commercial.profile);
  const inFlight=useRef(false), lifetime=useRef<AbortController|null>(null);
  useEffect(()=>{const controller=new AbortController();lifetime.current=controller;return()=>controller.abort();},[]);
  const [pendingOnly,setPendingOnly]=useState(false);
  const [trace,setTrace]=useState<TraceFilter|null>(null);
  const flockAccess=usePermission('MENU_FARM_DATA'),flockApprove=usePermission('MENU_FLOCK_APPROVE');
  const pending=handovers.filter(h=>h.state==='DRAFT'&&h.created_by!==actor);
  function inspect(filter:TraceFilter){setTrace(filter);requestAnimationFrame(()=>document.getElementById('stock-trace')?.scrollIntoView({block:'start'}));}
  const linkedFinance=usePermission('MENU_PROD_FIN_REVIEW');
  const patch=(next:Partial<Form>)=>setForm(old=>({...old,...next}));
  const ownership={moduleCode:'PRODUCTION_INBOUND',ownerType:'HOUSE',ownerId:form.houseCode,companyCode:form.companyCode,storeCode:form.siteCode};
  const hasSourceBalances=verified&&Array.isArray(balance?.sourceBalances);
  const canWrite=hasSourceBalances&&rangeStatus==='verified'&&scope==='ACTIVE'&&balance?.scopeState==='ACTIVE'&&!!form.warehouseCode;
  const sources:SourceBalance[]=!verified?[]:Array.isArray(balance?.sourceBalances)?balance.sourceBalances:(balance?.reports??[]).flatMap(report=>
    Object.entries(report.grades).map(([gradeCode,confirmedQty])=>({
      dailyLogId:report.id,shift:report.shift,gradeCode,confirmedQty,ordinaryNet:null,rawUsedQty:null,remaining:null,
    })));
  const gradeName=(code:string)=>localizedMasterName(grades.find(g=>g.grade_code===code) as unknown as Record<string,unknown>|undefined,'grade_name',lang)||code;

  const sourceKey=(dailyLogId:string|number,gradeCode:string)=>`${dailyLogId}:${gradeCode}`;
  const bySource=new Map(sources.map(source=>[sourceKey(source.dailyLogId,source.gradeCode),source]));
  const allowance=(source:SourceBalance|undefined)=>{
    if (balance?.sourceReviewRequired) return null;
    const value=source?.remaining;
    if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||source?.productionDate&&source.productionDate!==form.eggDate)return null;
    return value;
  };
  const availableGrades = new Set(sources.filter(source => (allowance(source) ?? 0) > 0).map(source => source.gradeCode));
  const availableLabel=(source:SourceBalance|undefined)=>{
    const value=allowance(source);
    return value===null?t('productionJobs.unknown'):value===0?`0 · ${t('productionJobs.sourceExhausted')}`:`${t('productionJobs.sourceAvailable')} ${value}`;
  };
  const selectedTotals=new Map<string,number>();
  const completeItems=form.items.length>0&&form.items.every(item=>grades.some(g=>g.grade_code===item.gradeCode)&&item.specCode&&item.dailyLogId
    &&Number.isSafeInteger(Number(item.quantity))&&Number(item.quantity)>0);
  for(const item of form.items){
    const key=sourceKey(item.dailyLogId,item.gradeCode),quantity=Number(item.quantity);
    if(item.dailyLogId&&item.gradeCode&&Number.isSafeInteger(quantity)&&quantity>0)selectedTotals.set(key,(selectedTotals.get(key)??0)+quantity);
  }
  const sourceOverage=[...selectedTotals].some(([key,quantity])=>quantity>(allowance(bySource.get(key))??0));
  const canSubmitSources=canWrite&&completeItems&&!sourceOverage;

  const displayDocument=useCallback((d:Document)=>{setTrace(null);setSelected(d);setReverseQty({});setForm(documentForm(d));setProof([]);},[]);
  useEffect(()=>{let alive=true;Promise.resolve().then(()=>{
    if(!alive)return;try{const saved=sessionStorage.getItem(storageKey);const value=saved?JSON.parse(saved):null;
      setForm(value?.form??{...emptyForm(),intentKey:key()});submitKeys.current=value?.submitKeys??{};
      const prefix=`${storageKey}:draft:`;const savedForms=Object.keys(sessionStorage).filter(k=>k.startsWith(prefix)).map(k=>JSON.parse(sessionStorage.getItem(k)??'null')).filter(Boolean) as Form[];
      if(value?.form?.items?.length){sessionStorage.setItem(`${prefix}${value.form.intentKey}`,JSON.stringify(value.form));savedForms.unshift(value.form);}
      setSavedIntents(savedForms.filter((f,i,all)=>all.findIndex(a=>a.intentKey===f.intentKey)===i));
      const params=new URLSearchParams(location.search);
      if(params.has('houseCode')&&params.has('companyCode')&&!params.has('documentId')){
        setForm({...emptyForm(),intentKey:key(),companyCode:params.get('companyCode')!,houseCode:params.get('houseCode')!,
          warehouseCode:params.get('warehouseCode')??'',eggDate:params.get('eggDate')??businessDay()});
      }
      const id=params.get('documentId'),last=sessionStorage.getItem('production-installments:last-open');
      if(id&&last&&last.split(':')[0]!==actor&&last.endsWith(':'+id)){params.delete('documentId');history.replaceState(null,'',location.pathname+(params.size?'?'+params:''));}
      else if(id)request<Document>(`${endpoint}/${encodeURIComponent(id)}`).then(d=>{if(alive)displayDocument(d);}).catch(e=>{if(alive)setError(String(e.message));});
    }catch{setForm({...emptyForm(),intentKey:key()});}setRestoredKey(storageKey);
  });return()=>{alive=false;};},[storageKey,displayDocument,actor]);
  useEffect(()=>{if(restored)sessionStorage.setItem(storageKey,JSON.stringify({form,submitKeys:submitKeys.current}));},[restored,form,storageKey]);
  useEffect(()=>{if(!restored||!selected)return;const url=new URL(location.href);url.searchParams.set('documentId',selected.id);sessionStorage.setItem('production-installments:last-open',actor+':'+selected.id);history.replaceState(null,'',url);},[restored,selected,actor]);
  const refresh=useCallback(async()=>{
    const turn=++generation.current;
    if(!restored||!form.houseCode||!form.companyCode||!form.eggDate)return;
    setRangeStatus(old=>old==='verified'||old==='refreshing'?'refreshing':'loading');
    const qs=new URLSearchParams({companyCode:form.companyCode,houseCode:form.houseCode,eggDate:form.eggDate});
    try {
      const context=await request<{state:string;firstProductionDate:string|null}>(`${endpoint}/context?${qs}`);
      const state=context.firstProductionDate&&form.eggDate<context.firstProductionDate?'ARCHIVED':context.state;
      const withStock=!!form.warehouseCode&&['ACTIVE','SUSPENDED'].includes(state);
      const rawQs=new URLSearchParams({companyCode:form.companyCode,houseCode:form.houseCode,productionDate:form.eggDate,warehouseCode:form.warehouseCode});
      const [docs,receipts,stock,raw]=await Promise.all([
        request<Document[]>(`${endpoint}?${qs}`),request<Handover[]>(`${endpoint}/handovers?${qs}`),
        withStock?request<Balance>(`${endpoint}/balance?${qs}&warehouseCode=${encodeURIComponent(form.warehouseCode)}`,{silent:true}).catch(()=>null):null,
        withStock?request<RawSource[]>(`/v2/inventory/raw-collection-receipts/sources?${rawQs}`):[],
      ]);
      if(turn!==generation.current)return;
      setDocuments(docs.filter(d=>!form.warehouseCode||d.payload.warehouseCode===form.warehouseCode));
      setHandovers(receipts.filter(h=>!form.warehouseCode||h.payload.warehouseCode===form.warehouseCode));
      setBalance(stock);setRawSources(raw);setScope(state);setSnapshotKey(rangeKey);setRangeStatus('verified');
    } catch (e) {
      if(turn!==generation.current)return;
      setRangeStatus('failed');setError(e instanceof Error?e.message:String(e));
    }
  },[restored,form.companyCode,form.houseCode,form.eggDate,form.warehouseCode,rangeKey]);
  useEffect(()=>{let alive=true;Promise.resolve().then(()=>{if(alive)void refresh();});return()=>{alive=false;};},[refresh,rangeVersion]);

  useEffect(()=>{let alive=true;Promise.resolve().then(async()=>{
    if(!finance.canEdit||!form.companyCode){if(alive)setPeriod(null);return;}
    try{const result=await request<Period>(`${endpoint}/posting-period?${new URLSearchParams({companyCode:form.companyCode,periodMonth})}`);if(alive)setPeriod(result);}
    catch(e){if(alive)setError(e instanceof Error?e.message:String(e));}
  });return()=>{alive=false;};},[finance.canEdit,form.companyCode,periodMonth]);
  const run=async(fn:()=>Promise<void>,reload=true)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');try{await fn();if(reload)await refresh();}
    catch(cause){
      const e=cause as ApiError;
      const details=e.details;
      const detailLabels: Record<string,string> = {
        gradeCode: t('productionJobs.gradeCode'),
        dailyLogId: t('productionJobs.dailyLogId'),
        remaining: t('productionJobs.remaining'),
        currentVersion: t('productionJobs.currentVersion'),
        documentNo: t('productionJobs.documentNo'),
        blockingDocumentNo: t('productionJobs.blockingDocumentNo'),
      };
      const fields=Object.entries(details??{}).flatMap(([name,value])=>
        detailLabels[name] ? [`${detailLabels[name]} ${value}`] : []);
      const hint=e.status===403?t('productionJobs.forbidden'):e.code==='NETWORK'||e.code==='SERVER'?t('productionJobs.uncertain'):'';
      const capacity=['PRODUCTION_GRADE_CAPACITY','PRODUCTION_HANDOVER_CAPACITY'].includes(e.businessCode??'');
      setError([capacity?t('productionJobs.capacity'):e.message,...fields,hint].filter(Boolean).join(' · '));
    }finally{inFlight.current=false;setBusy(false);}};
  const send=<T,>(path:string,body:unknown,method='POST')=>request<T>(`${endpoint}${path}`,{method,body:JSON.stringify(body),signal:lifetime.current?.signal});
  async function load(id:string) {
    if(lifetime.current?.signal.aborted)throw new DOMException('Aborted','AbortError');
    if(restored&&form.intentKey&&form.items.length){sessionStorage.setItem(`${storageKey}:draft:${form.intentKey}`,JSON.stringify(form));
      setSavedIntents(old=>[form,...old.filter(f=>f.intentKey!==form.intentKey)]);}
    const d=await request<Document>(`${endpoint}/${id}`);displayDocument(d);return d;
  }
  const items=()=>{
    const grouped=new Map<string,{gradeCode:string;specCode:string;quantity:number;allocations:Array<{dailyLogId:number;quantity:number}>}>();
    for(const i of form.items){const quantity=Number(i.quantity);if(!i.gradeCode||!i.specCode||!Number.isSafeInteger(quantity)||quantity<=0||!Number(i.dailyLogId))throw new Error(t('productionInstallments.positive','请填写实际来源、档位、规格和正整数枚数。'));
      const id=`${i.gradeCode}:${i.specCode}`;const item=grouped.get(id)??{gradeCode:i.gradeCode,specCode:i.specCode,quantity:0,allocations:[]};
      const prior=item.allocations.find(a=>a.dailyLogId===Number(i.dailyLogId));if(prior)prior.quantity+=quantity;else item.allocations.push({dailyLogId:Number(i.dailyLogId),quantity});
      item.quantity+=quantity;grouped.set(id,item);
    }return [...grouped.values()];
  };
  const payload=()=>({...form,siteCode:undefined,replacesId:undefined,rawCollectionSourceId:undefined,items:items()});
  function changeRange(next:Partial<Form>) {
    generation.current++;setRangeVersion(n=>n+1);
    setTrace(null);setRangeStatus('idle');setSelected(null);setRecovered(null);setError('');setNotice('');
    setProof([]);setReason('');setReverseQty({});setPeriod(null);
    if(form.items.length&&form.intentKey){
      sessionStorage.setItem(`${storageKey}:draft:${form.intentKey}`,JSON.stringify(form));
      setSavedIntents(old=>[form,...old.filter(f=>f.intentKey!==form.intentKey)]);
    }
    setForm(old=>({...emptyForm(),companyCode:old.companyCode,houseCode:old.houseCode,siteCode:old.siteCode,
      warehouseCode:old.warehouseCode,locationCode:old.locationCode,eggDate:old.eggDate,intentKey:key(),...next}));
    history.replaceState(null,'',location.pathname);
  }
  const newIntent=()=>{setSelected(null);setReverseQty({});setProof([]);patch({intentKey:key(),handoverRef:'',replacesId:undefined,rawCollectionSourceId:undefined,items:[],remark:'',evidenceFileIds:[]});history.replaceState(null,'',location.pathname);};
  const freeze=async(d:Document)=>{const submit=submitKeys.current[d.id]??key();submitKeys.current[d.id]=submit;
    sessionStorage.setItem(storageKey,JSON.stringify({form,submitKeys:submitKeys.current}));await send(`/${d.id}/ready`,{version:d.version,submitKey:submit});await load(d.id);};
  const updateItem=(id:string,next:Partial<Item>)=>patch({items:form.items.map(i=>i.id===id?{...i,...next}:i)});
  const preview=async(kind:'handovers'|'documents',id:string,fileId:string)=>{
    const path=kind==='handovers'?`${endpoint}/handovers/${id}`:`${endpoint}/${id}`;
    const messages={blocked:t('productionConversion.allowPreview'),unavailable:t('productionInstallments.proofUnavailable')};
    await previewProtectedAttachment(async()=>{
      const token=sessionStorage.getItem('phoenix_token')||localStorage.getItem('phoenix_token')||'';
      const response=await fetch(`/api${path}/evidence/${encodeURIComponent(fileId)}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw new Error(messages.unavailable);
      return response.blob();
    },messages);
  };
  const rows=documents.filter(d=>(!recovered||recovered.some(hit=>hit.id===d.id))&&(!reviewOnly||d.kind==='REVERSAL'&&d.state==='READY'));
  const drafts=savedIntents.filter(d=>d.companyCode===form.companyCode&&d.houseCode===form.houseCode&&d.eggDate===form.eggDate&&d.warehouseCode===form.warehouseCode);
  if(!p.canView)return <p>{t('productionInstallments.noPermission','无权查看生产交库。')}</p>;
  if(!restored)return <p>{t('common.loading','加载中…')}</p>;
  const flockReviewPage = `/breeding/flock-lifecycle?${new URLSearchParams({review:'pending',houseCode:form.houseCode,date:form.eggDate})}#flock-documents`;
  return <main className={s.page}>
    {mobile&&<Link href="/mobile/home">{t('common.back','返回')}</Link>}
    <PageHeader title={t('productionInstallments.title','正式分次生产入库')} subtitle={t('productionInstallments.subtitle','按实际交接逐次入库，保留原单及不可改写的过账回执。')} />
    <div className={s.actions}><Link href={mobile?"/mobile/production-cutovers":"/breeding/production-cutovers"}>{t('productionCutover.title','正式库存切换盘点')}</Link><Link href={mobile?"/mobile/production-reports":"/breeding/daily"}>{t('productionInstallments.daily','产蛋日报')}</Link>{!mobile&&<Link href="/breeding/daily-inbound-ledger">{t('productionInstallments.legacy','历史入库资料')}</Link>}
      <button disabled={busy} onClick={()=>setRangeVersion(n=>n+1)}>{t('common.refresh','刷新')}</button>{p.canCreate&&<button disabled={busy} onClick={newIntent}>{t('productionInstallments.new','新交接意图')}</button>}</div>
    <nav className={s.actions} aria-label={t('productionJobs.tasks')}>
      {p.canCreate&&<a href="#delivery">{t('productionInstallments.thisDelivery')}</a>}
      {p.canEdit&&<a href="#handover" onClick={()=>setPendingOnly(true)}>{t('productionJobs.receive')}</a>}
      <a href="#history" onClick={()=>{setReviewOnly(false);setRecovered(null);}}>{t('productionInstallments.history')}</a>
      {p.canApprove&&<a href="#history" onClick={()=>setReviewOnly(true)}>{t('productionJobs.pendingReview')}</a>}
      {!mobile&&flockAccess.canView&&flockApprove.canApprove&&<Link href={flockReviewPage}>{t('productionJobs.flockReview')}</Link>}
      {!mobile&&(linkedFinance.canView||linkedFinance.canEdit||finance.canEdit)&&<Link href="/breeding/production-finance-review">{t('productionJobs.finance')}</Link>}
    </nav>
    {error&&<p role="alert" className={`${s.notice} ${s.error}`}>{error}</p>}{notice&&<p role="status" className={s.notice}><span>{notice}</span> {form.handoverRef&&<code>{form.handoverRef}</code>}</p>}
    {p.canCreate&&!!drafts.length&&<div className={s.actions}>{drafts.map(d=><button key={d.intentKey} disabled={busy} onClick={()=>{changeRange(d);setForm(d);}}>{t('productionInstallments.resumeDraft','返回暂存交接')} · {d.handoverRef||d.houseCode}</button>)}</div>}
    <section className={s.card} aria-label={t('productionInstallments.context','交库范围')}><div className={s.grid}>
      <label className={s.field}>{t('productionInstallments.house','鸡舍')}<HouseSelector ariaLabel={t('productionInstallments.house','鸡舍')} disabled={busy} value={form.houseCode} onChange={v=>changeRange({houseCode:v,companyCode:'',siteCode:'',warehouseCode:'',locationCode:'',rawCollectionSourceId:undefined})}
        onPick={opt=>patch({companyCode:String(opt?.raw?.companyCode??''),siteCode:String(opt?.raw?.siteCode??'')})} /></label>
      <label className={s.field}>{t('productionInstallments.company','归属公司')}<input readOnly value={form.companyCode} style={{background:'var(--bg-muted)',cursor:'not-allowed'}} /></label>
      <label className={s.field}>{t('productionInstallments.productionDate','生产日期')}<input type="date" disabled={busy} value={form.eggDate} onChange={e=>changeRange({eggDate:e.target.value,rawCollectionSourceId:undefined})}/></label>
      <label className={s.field}>{t('productionInstallments.warehouse','交库仓库')}<WarehouseSelector ariaLabel={t('productionInstallments.warehouse','交库仓库')} value={form.warehouseCode} companyCode={form.companyCode} siteCode={form.siteCode} type="EGG_FARM" disabled={busy||!form.companyCode} onChange={v=>changeRange({warehouseCode:v,locationCode:'',rawCollectionSourceId:undefined})}/></label>
      <label className={s.field}>{t('productionInstallments.location','库位')}<LocationSelector ariaLabel={t('productionInstallments.location','库位')} value={form.locationCode} lookupEndpoint={`${endpoint}/locations?${new URLSearchParams({companyCode:form.companyCode,houseCode:form.houseCode,warehouseCode:form.warehouseCode})}`} warehouseCode={form.warehouseCode} disabled={busy||!form.warehouseCode} onChange={v=>patch({locationCode:v})}/></label>
    </div>{form.houseCode&&!verified&&<p role="status">{t(rangeStatus==='failed'?'productionJobs.unverified':'common.loading')}</p>}
    {form.houseCode&&form.eggDate&&<SourceProfileBanner houseCode={form.houseCode} {...commercial} />}
    {verified&&scope==='ARCHIVED'&&<p role="status">{t('productionJobs.archived')}</p>}
    {verified&&scope==='FENCED'&&<p role="status">{t('productionJobs.fenced')}</p>}
    {verified&&scope==='OFF'&&<p role="status" className={s.notice}>{t('productionInstallments.off','该鸡舍尚未启用正式入库。现场盘点及切换确认后才能办理。')}</p>}
    {verified&&scope==='SUSPENDED'&&<p className={s.notice}>{t('productionInstallments.suspended','该范围暂停新写入，历史回执仍可查看。')}</p>}</section>
    {verified&&balance&&<section className={s.card}><h2>{t('productionInstallments.balance','当日产蛋、正式净入与当前库存')}</h2><p className={s.muted}>{t('productionJobs.stockHint')}</p>
      <div className={s.scroll}><table className={s.table}><thead><tr>{['grade','reported','received','remaining'].map(n=><th key={n}>{t(`productionInstallments.${n}`)}</th>)}{p.canCreate&&<th>{t('productionInstallments.quantity')}</th>}<th>{t('productionJobs.attributable')}</th><th>{t('productionJobs.warehouseQty')}</th><th>{t('productionJobs.mixed')}</th></tr></thead>
      <tbody>{Array.from(new Set([...Object.keys(balance.grades),...Object.keys(balance.stockByGrade??{})])).map(grade=>{const n=balance.grades[grade]??{reported:0,posted:0,remaining:0};return <tr key={grade}><td>{balance.stockBasisVersion===2?<button onClick={()=>inspect({view:'source',gradeCode:grade})}>{gradeName(grade)}</button>:gradeName(grade)}</td><td>{n.reported}</td><td>{n.posted}</td><td>{n.remaining}</td>{p.canCreate&&<td>{form.items.filter(i=>i.gradeCode===grade).reduce((total,i)=>total+(Number(i.quantity)||0),0)}</td>}<td>{balance.stockByGrade?.[grade]?.attributableQty??t('productionJobs.unknown')}</td><td>{balance.stockByGrade?.[grade]?.warehouseQty??'—'}</td><td>{balance.stockByGrade?.[grade]?.mixedBatchCount??'—'}</td></tr>;})}</tbody></table></div>
      <p>{t('productionJobs.openHandovers')} · <a href="#handover" onClick={()=>setPendingOnly(false)}>{handovers.filter(h=>h.state==='DRAFT').length}</a></p>
      {balance.stockBasisVersion===2&&<button onClick={()=>inspect({view:'warehouse'})}>{t('productionJobs.trace')}</button>}</section>}
    {verified&&!!form.warehouseCode&&['ACTIVE','SUSPENDED'].includes(scope)&&<section className={s.card} aria-label={t('productionJobs.sourceBalances')}>
      <h2>{t('productionJobs.sourceBalances')}</h2>
      {(!hasSourceBalances||balance?.sourceReviewRequired)&&<p role="status" className={s.notice}>{t('productionJobs.sourceUnverified')}</p>}
      {hasSourceBalances&&!sources.length&&<p>{t('productionJobs.notReported')}</p>}
      {sources.length>0&&<div className={s.scroll}><table className={s.table}><thead><tr>
        <th>{t('productionInstallments.productionDate')}</th><th>{t('productionInstallments.shift')}</th><th>{t('productionJobs.dailyLogId')}</th><th>{t('ui.鸡群','鸡群')}</th>
        <th>{t('productionInstallments.grade')}</th><th>{t('productionInstallments.reported')}</th><th>{t('productionJobs.sourceRawUsed')}</th>
        <th>{t('productionJobs.sourceAvailable')}</th>
      </tr></thead><tbody>{sources.map(source=><tr key={sourceKey(source.dailyLogId,source.gradeCode)}>
        <td>{source.productionDate??form.eggDate}</td><td>{shifts[source.shift]??source.shift}</td><td>#{source.dailyLogId}</td><td>{source.flockNo??t('productionJobs.unknown')}</td>
        <td>{gradeName(source.gradeCode)}</td><td>{source.confirmedQty}</td><td>{source.rawUsedQty??t('productionJobs.unknown')}</td>
        <td>{availableLabel(source)}</td>
      </tr>)}</tbody></table></div>}
    </section>}
    {verified&&trace&&<ProductionStockTrace key={rangeKey+JSON.stringify(trace)} query={new URLSearchParams({companyCode:form.companyCode,houseCode:form.houseCode,eggDate:form.eggDate,warehouseCode:form.warehouseCode}).toString()} filter={trace} onFilter={setTrace} onDocument={id=>void run(async()=>{await load(id);},false)}/>}
    <section id="delivery" className={s.card}>{p.canCreate&&form.items.length>0&&verified&&!documents.some(d=>d.intent_key===form.intentKey)&&<p role="status">{t('productionJobs.localDraft')}</p>}<h2>{p.canCreate?t('productionInstallments.thisDelivery','本次实际交接'):t('productionInstallments.recoverHandover')}</h2><div className={s.grid}>
      <label className={s.field}>{t('productionInstallments.handoverRef','实物交接编号')}<input value={form.handoverRef} maxLength={100} onChange={e=>patch({handoverRef:e.target.value})}/></label>
      {p.canCreate&&<RawCollectionSourcePicker sources={verified?rawSources:[]} value={form.rawCollectionSourceId??''} disabled={busy||!canWrite||!p.canCreate} onChange={v=>patch({rawCollectionSourceId:v||undefined})}/>}
      {canWrite&&p.canCreate&&<label className={s.field}>{t('common.remark','备注')}<input value={form.remark} maxLength={1000} onChange={e=>patch({remark:e.target.value})}/></label>}</div>
      {p.canCreate&&<>
      {form.replacesId&&<p>{t('productionInstallments.replaces','重新签认的原交接')}：{form.replacesId}</p>}
      {form.items.map(i=><div key={i.id} className={s.line}>
        <label className={s.field}>{t('productionInstallments.grade','档位')}<select aria-label={t('productionInstallments.grade','档位')} disabled={busy||!canWrite} value={i.gradeCode} onChange={e=>updateItem(i.id,{gradeCode:e.target.value,dailyLogId:''})}><option value="">{t('common.select','请选择')}</option>{grades.filter(g=>availableGrades.has(g.grade_code)||g.grade_code===i.gradeCode).map(g=><option key={g.grade_code} value={g.grade_code} disabled={!availableGrades.has(g.grade_code)}>{gradeName(g.grade_code)}{variety ? ` (${t(`ui.${variety}`,variety)})` : ''}</option>)}</select></label>
        <label className={s.field}>{t('productionInstallments.spec','规格')}<SpecSelector ariaLabel={t('productionInstallments.spec','规格')} disabled={busy||!canWrite} value={i.specCode} onChange={v=>updateItem(i.id,{specCode:v})}/></label>
        <label className={s.field}>{t('productionInstallments.source','实际日报来源')}
          <select aria-label={t('productionInstallments.source','实际日报来源')} value={i.dailyLogId} disabled={busy||!canWrite||!i.gradeCode} onChange={e=>{
            const value=e.target.value;
            if(!value||(allowance(bySource.get(sourceKey(value,i.gradeCode)))??0)>0)updateItem(i.id,{dailyLogId:value});
          }}>
            <option value="">{t('common.select','请选择')}</option>
            {sources.filter(source=>source.gradeCode===i.gradeCode).sort((a,b)=>Number((allowance(b)??0)>0)-Number((allowance(a)??0)>0)).map(source=>
              <option key={source.dailyLogId} value={source.dailyLogId} disabled={(allowance(source)??0)===0}>
                {source.productionDate??form.eggDate} · {shifts[source.shift]??source.shift} · #{source.dailyLogId}{source.flockNo ? ` · ${source.flockNo}` : ''} · {availableLabel(source)}
              </option>)}
            {i.dailyLogId&&!bySource.has(sourceKey(i.dailyLogId,i.gradeCode))&&<option value={i.dailyLogId} disabled>#{i.dailyLogId} · {t('productionJobs.unknown')}</option>}
          </select>
        </label>
        <label className={s.field}>{t('productionInstallments.quantity','本次枚数')}<input type="number" min="1" step="1" disabled={busy||!canWrite} value={i.quantity} onChange={e=>updateItem(i.id,{quantity:e.target.value})}/></label>
        <button onClick={()=>patch({items:form.items.filter(row=>row.id!==i.id)})} disabled={busy}>{t('productionCutover.remove','移除')}</button>
      </div>)}
      <div className={s.actions}><button disabled={busy||!canWrite||!p.canCreate||!sources.some(source=>(allowance(source)??0)>0)} onClick={()=>patch({items:[...form.items,{id:key(),gradeCode:'',specCode:'LOOSE',quantity:'',dailyLogId:''}]})}>{t('productionInstallments.addLine','增加档位或规格')}</button></div>
      {hasSourceBalances&&sourceOverage&&<p role="status" className={s.notice}>{t('productionJobs.sourceOverage')}</p>}
      {form.houseCode&&<AttachmentUploader value={form.evidenceFileIds} onChange={v=>patch({evidenceFileIds:v})} ownership={ownership} readOnly={busy||!canWrite||!p.canCreate} label={t('productionInstallments.physicalProof','实物交接原证据（班次、档位、数量）')}/>}
      <div className={s.actions}>
        <button disabled={busy||!canSubmitSources||!p.canCreate} onClick={()=>run(async()=>{
          if(!canSubmitSources)return;
          if(!form.evidenceFileIds.length)throw new Error(t('productionInstallments.proofRequired','请上传实际交接依据。'));
          const segments:Record<string,{dailyLogId:number;gradeCode:string;quantity:number;evidenceFileId:string}>={};for(const i of items()){
            for(const a of i.allocations){const id=`${a.dailyLogId}:${i.gradeCode}`;const row=segments[id]??={dailyLogId:a.dailyLogId,gradeCode:i.gradeCode,quantity:0,evidenceFileId:form.evidenceFileIds[0]};row.quantity+=a.quantity;}}
          await send('/handovers',{companyCode:form.companyCode,houseCode:form.houseCode,eggDate:form.eggDate,warehouseCode:form.warehouseCode,handoverRef:form.handoverRef,replacesId:form.replacesId,rawCollectionSourceId:form.rawCollectionSourceId,segments:Object.values(segments)});
          setNotice(t('productionInstallments.receiverNeeded','交接已登记，请由另一名实际接收人核对分段并签认。'));})}>{t('productionInstallments.registerPhysical','登记实物交接')}</button>
        <button disabled={busy||!canSubmitSources||!p.canCreate||!!form.rawCollectionSourceId} onClick={()=>run(async()=>{if(!canSubmitSources)return;const d=await send<Document>('',payload());await load(d.id);})}>{t('productionInstallments.saveDraft','保存或找回本意图草稿')}</button>
        {selected?.state==='DRAFT'&&selected.kind==='INBOUND'&&<button disabled={busy||!canSubmitSources||!p.canEdit} onClick={()=>run(async()=>{
          if(!canSubmitSources)return;
          if(form.intentKey!==selected.intent_key)throw new Error(t('productionInstallments.loadDraftFirst','请先载入此草稿。'));await send(`/${selected.id}`,{...payload(),version:selected.version},'PATCH');await load(selected.id);})}>{t('productionInstallments.saveChanges','保存草稿修改')}</button>}
      </div><p className={s.muted}>{t('productionInstallments.intentHint','刷新后保留原意图。改变交接身份请新建意图；未确认结果前先找回原单。')}</p></>}
    </section>
    <section id="handover" className={s.card}><h2>{t('productionInstallments.physicalHistory','实物交接签认')}</h2>{p.canEdit&&<label><input type="checkbox" checked={pendingOnly} onChange={e=>setPendingOnly(e.target.checked)}/> {t('productionJobs.receive')}</label>}{verified&&!(pendingOnly?pending:handovers).length&&<p>{t('productionJobs.empty')}</p>}{verified&&[...(pendingOnly?pending:handovers)].sort((a,b)=>Number(b.state==='DRAFT'&&b.created_by!==actor)-Number(a.state==='DRAFT'&&a.created_by!==actor)).map(h=><article key={h.id} className={s.card}>
      {h.payload.rawCollection&&<p>{t('productionRaw.source','原始采集原行（包装路径）')}：{h.payload.rawCollection.batchCode} · #{h.payload.rawCollection.shiftId} · {h.payload.rawCollection.sourceSnapshot.received_qty}</p>}
      <p>{form.houseCode} · {form.eggDate} · {h.payload.warehouseCode}</p><strong className={s.wide}>{h.handover_ref} · {handoverStates[h.state]??h.state}</strong><p>{t('productionInstallments.parties','登记人 / 接收人')}：{h.created_by} / {h.confirmed_by??'—'} {h.confirmed_at??''}</p>
      <p>{Object.entries(h.payload.sources.reduce<Record<string,number>>((totals,row)=>({...totals,[row.gradeCode]:(totals[row.gradeCode]??0)+Number(row.quantity)}),{})).map(([grade,qty])=>gradeName(grade)+' '+qty).join(' · ')}</p>
      {h.payload.sources.map(a=><p key={a.id}>{shifts[a.shift]??a.shift} #{a.dailyLogId} · {gradeName(a.gradeCode)} · {a.quantity} <button onClick={()=>run(()=>preview('handovers',h.id,a.evidenceFileId))}>{t('productionInstallments.proof','查看原证据')}</button></p>)}
      <div className={s.actions}>{h.state==='DRAFT'&&h.created_by!==actor&&p.canEdit&&<button disabled={busy||!canWrite||!p.canEdit} onClick={()=>run(async()=>{await send(`/handovers/${h.id}/confirm`,{version:h.version,contentHash:h.content_hash});})}>{t('productionInstallments.receive','核对并实名签收')}</button>}
      {h.state!=='CANCELLED'&&(p.canEdit||p.canApprove||p.canCreate)&&<button disabled={busy||!canWrite} onClick={()=>run(async()=>{await send(`/handovers/${h.id}/cancel`,{version:h.version,reason,evidenceFileIds:proof});})}>{t('productionInstallments.cancelPhysical','按差异依据废止未过账交接')}</button>}
      {h.state==='CANCELLED'&&<button disabled={busy||!canWrite||!p.canCreate} onClick={()=>{newIntent();patch({handoverRef:h.handover_ref,replacesId:h.id});}}>{t('productionInstallments.resign','据原交接重新签认')}</button>}</div></article>)}</section>
    {verified&&['ACTIVE','SUSPENDED'].includes(scope)&&<RawCollectionReceipts key={'raw'+rangeKey} company={form.companyCode} house={form.houseCode} date={form.eggDate} warehouse={form.warehouseCode} active={canWrite} busy={busy} handovers={handovers} run={run}/>}
    {verified&&form.warehouseCode&&['ACTIVE','SUSPENDED'].includes(scope)&&<InventoryConversions key={'conversion'+rangeKey} company={form.companyCode} initialWarehouse={form.warehouseCode} active={canWrite}/>}
    <section id="history" className={s.card}><h2>{t('productionInstallments.history','分次入库及冲销历史')}</h2><div className={s.actions}>
      <button disabled={busy||!form.companyCode} onClick={()=>run(async()=>{const docs=await request<Document[]>(`${endpoint}/recover?${new URLSearchParams({companyCode:form.companyCode,intentKey:form.intentKey})}`);if(docs[0])await load(docs[0].id);else setNotice(t('productionInstallments.notFound','尚未找到该意图的单据，可保留原意图重试。'));})}>{t('productionInstallments.recover','找回原意图结果')}</button>
      <button disabled={busy||!form.companyCode||!form.handoverRef} onClick={()=>run(async()=>{const found=await request<Document[]>(`${endpoint}/recover?${new URLSearchParams({companyCode:form.companyCode,handoverRef:form.handoverRef})}`);
        setRecovered(found);if(!found.length)setNotice(t('productionInstallments.notFound','尚未找到该意图的单据，可保留原意图重试。'));})}>{t('productionInstallments.recoverHandover','按实物交接号找回（跨设备）')}</button></div>
      {p.canApprove&&<label><input type="checkbox" checked={reviewOnly} onChange={e=>setReviewOnly(e.target.checked)}/> {t('productionJobs.pendingReview')}</label>}
      {verified&&(rows.length?<ul className={s.history}>{rows.map(d=><li key={d.id}><div><strong>{d.handover_ref||kinds[d.kind]||d.kind}</strong>
          <p>{kinds[d.kind]??d.kind} · {states[d.state]??d.state} · {d.production_date}</p><code>{d.document_no}</code></div>
          <button disabled={busy} onClick={()=>run(async()=>{await load(d.id);},false)}>{t('productionInstallments.view','查看原单')}</button></li>)}</ul>:<p>{t('productionJobs.empty')}</p>)}
    </section>
    {verified&&selected&&<section className={`${s.card} ${s.selected}`}><h2 className={s.wide}>{selected.document_no}</h2><p>{kinds[selected.kind]??selected.kind} · {states[selected.state]??selected.state} · v{selected.version}</p>
      <p>{t('productionInstallments.productionDate','生产日期')}：{selected.production_date} · {t('productionInstallments.postingDate','记账日期')}：{selected.expected_posting_date??'—'}</p>
      <p>{selected.payload.remark??''}</p>{selected.kind==='REVERSAL'&&<p>{t('productionInstallments.reason','实物差异或期间变更依据')}：{String((selected.payload as unknown as {reason?:string}).reason??'')}</p>}
      <div className={s.scroll}><table className={s.table}><thead><tr><th>{t('productionInstallments.grade','档位')}</th><th>{t('productionInstallments.spec','规格')}</th><th>{t('productionInstallments.quantity','本次枚数')}</th><th>{t('productionInstallments.source','实际日报来源')}</th></tr></thead>
        <tbody>{selected.payload.items.map((i,n)=><tr key={n}><td>{gradeName(i.gradeCode)}</td><td>{i.specCode}</td><td>{i.quantity}</td><td>{(i.sources??i.allocations??[]).map(a=>`#${a.dailyLogId}: ${a.quantity}`).join(' / ')}</td></tr>)}</tbody></table></div>
      <div className={s.actions}>{selected.payload.evidenceFileIds?.map(file=><button key={file} disabled={busy} onClick={()=>run(()=>preview('documents',selected.id,file))}>{t('productionInstallments.proof','查看原证据')}</button>)}</div>
      <div className={s.actions}>
        {selected.state==='DRAFT'&&selected.kind==='INBOUND'&&p.canEdit&&<button disabled={busy||!p.canEdit} onClick={()=>patch({companyCode:selected.company_code,houseCode:selected.house_code,eggDate:selected.production_date,warehouseCode:selected.payload.warehouseCode,locationCode:selected.payload.locationCode,intentKey:selected.intent_key,handoverRef:selected.handover_ref,remark:selected.payload.remark??'',evidenceFileIds:selected.payload.evidenceFileIds??[],items:selected.payload.items.flatMap(i=>(i.allocations??[{dailyLogId:0,quantity:i.quantity}]).map(a=>({id:key(),gradeCode:i.gradeCode,specCode:i.specCode,quantity:String(a.quantity),dailyLogId:a.dailyLogId?String(a.dailyLogId):''})))})}>{t('productionInstallments.loadDraft','载入草稿编辑')}</button>}
        {selected.state==='DRAFT'&&<button disabled={busy||!(selected.kind==='INBOUND'?canSubmitSources&&!!commercial.profile:canWrite)||!p.canEdit} onClick={()=>run(()=>freeze(selected))}>{t('productionInstallments.ready','核对并冻结本单')}</button>}
        {(selected.state==='READY'&&selected.kind==='INBOUND'||selected.state==='APPROVED'||selected.state==='POSTED')&&<button disabled={busy||selected.state!=='POSTED'&&(!canWrite||!p.canEdit)} onClick={()=>run(async()=>{await send(`/${selected.id}/post`,{submitKey:selected.submit_key,contentHash:selected.content_hash});await load(selected.id);})}>{selected.state==='POSTED'?t('productionInstallments.receipt','找回原过账回执'):t('productionInstallments.post','过账本单')}</button>}
        {['READY','APPROVED'].includes(selected.state)&&selected.expected_posting_date<businessDay()&&p.canEdit&&p.canCreate&&<button disabled={busy||!canWrite} onClick={()=>run(async()=>{
          const idKey=`${storageKey}:reissue:${selected.id}`;const intent=sessionStorage.getItem(idKey)??key();sessionStorage.setItem(idKey,intent);
          const next=await send<{documentId:string}>(`/${selected.id}/reissue`,{version:selected.version,intentKey:intent});await load(next.documentId);
        })}>{t('productionJobs.reissue')}</button>}
        {['DRAFT','READY','APPROVED'].includes(selected.state)&&p.canEdit&&<button disabled={busy||!canWrite} onClick={()=>run(async()=>{await send(`/${selected.id}/cancel`,{version:selected.version});await load(selected.id);})}>{t('productionInstallments.cancelDocument','取消未过账单')}</button>}
      </div>
      {selected.receipt&&<div className={s.notice} role="status">{t('productionInstallments.postedReceipt','原过账回执')} · {t('productionInstallments.quantity','本次枚数')} {String(selected.receipt.totalInbound??selected.receipt.totalReversed??'—')} · {t('productionInstallments.postingDate','记账日期')} {String(selected.receipt.postingDate??'—')}</div>}
      {selected.lines?.map(l=><div key={l.line_no} className={s.notice}><strong>{gradeName(l.grade_code)} · {balance?.stockBasisVersion===2?<button onClick={()=>inspect({view:'warehouse',batchNo:l.batch_no})}>{l.batch_no}</button>:l.batch_no}</strong><p>{t('productionInstallments.original','原单数量')} {l.quantity} · {t('productionInstallments.current','当前实存')} {l.current_quantity} · {t('productionInstallments.available','当前可用')} {l.current_available}</p>
        {selected.kind==='INBOUND'&&selected.state==='POSTED'&&p.canCreate&&l.allocations.map(a=><label key={a.id} className={s.field}>{t('productionInstallments.reverseSegment','原来源分段冲销')} #{a.daily_log_id} · {t('productionInstallments.reversible','原分段尚未冲销')} {a.quantity-a.reversed_quantity}
          <input type="number" min="0" max={a.quantity-a.reversed_quantity} step="1" disabled={!canWrite||!p.canCreate} value={reverseQty[a.id]??''} onChange={e=>setReverseQty(old=>({...old,[a.id]:e.target.value}))}/></label>)}</div>)}
      {selected.kind==='INBOUND'&&selected.state==='POSTED'&&p.canCreate&&<div className={s.actions}><button disabled={busy||!canWrite||!p.canCreate} onClick={()=>run(async()=>{
        const storage=`${storageKey}:reversal:${selected.id}`;const prior=sessionStorage.getItem(storage);
        let intent=prior??key();if(prior){const existing=await request<Document[]>(`${endpoint}/recover?${new URLSearchParams({companyCode:selected.company_code,intentKey:prior})}`);
          if(existing[0]&&!['POSTED','CANCELLED'].includes(existing[0].state)){await load(existing[0].id);return;}
          if(existing[0])intent=key();}
        sessionStorage.setItem(storage,intent);
        const segments=Object.entries(reverseQty).filter(([,n])=>Number(n)>0).map(([allocationId,n])=>({allocationId,quantity:Number(n)}));
        const d=await send<Document>(`/${selected.id}/reversals`,{intentKey:intent,reason,segments,evidenceFileIds:proof});await load(d.id);})}>{t('productionInstallments.createReversal','依原来源建立冲销草稿')}</button></div>}
      {!mobile&&selected.kind==='REVERSAL'&&selected.state==='READY'&&(linkedFinance.canView||linkedFinance.canEdit||finance.canEdit)&&<Link href="/breeding/production-finance-review">{t('productionJobs.finance')}</Link>}
      {selected.kind==='REVERSAL'&&selected.state==='READY'&&p.canApprove&&<div className={s.actions}>{selected.clearances?.map(c=><div key={c.id}><button disabled={busy} onClick={()=>run(()=>preview('documents',selected.id,c.evidence_file_id))}>{t('productionInstallments.financeProof','查看此财务签认原据')}</button><button disabled={busy||!canWrite||selected.created_by===actor} onClick={()=>run(async()=>{await send(`/${selected.id}/approve`,{version:selected.version,contentHash:selected.content_hash,financialClearanceId:c.id});await load(selected.id);})}>{t('productionInstallments.approve','审核此摘要及财务回执')} · {c.signed_by}</button></div>)}</div>}
    </section>}
    {verified&&(p.canEdit||p.canCreate||p.canApprove||finance.canEdit)&&<section className={s.card}><h2>{t('productionInstallments.difference','差异、冲销与期间证据')}</h2><label className={s.field}>{t('productionInstallments.reason','实物差异或期间变更依据')}<textarea maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {form.houseCode&&<AttachmentUploader ownership={ownership} value={proof} onChange={setProof} readOnly={busy||!p.canCreate&&!p.canEdit&&!finance.canEdit} label={t('productionInstallments.differenceProof','上传本人取得的差异 / 财务依据')}/>}
      {finance.canEdit&&<div className={s.card}><h3>{t('productionInstallments.period','财务记账期间')}</h3><div className={s.grid}>
        <label className={s.field}>{t('productionInstallments.month','期间月份')}<input type="month" value={periodMonth} onChange={e=>setPeriodMonth(e.target.value)}/></label>
        <label className={s.field}>{t('productionInstallments.periodState','设置期间状态')}<DictSelect dictType="PRODUCTION_POSTING_PERIOD_STATE" value={periodState} onChange={setPeriodState}/></label>
        <p>{t('productionInstallments.periodVersion','当前期间版本')}：{period?.version??'—'}</p></div><p className={s.muted}>{t('productionInstallments.periodHint','冲销须核对原记账月和本次记账月。期间重新开放需要财务审批权，原审批后期间版本变化须重新核对。')}</p>
        <button disabled={busy||!period||!form.houseCode||!periodState||!proof.length} onClick={()=>run(async()=>{await send('/posting-period',{companyCode:form.companyCode,houseCode:form.houseCode,periodMonth,state:periodState,expectedVersion:period?.version,evidenceFileId:proof[0],reason});setPeriod(await request<Period>(`${endpoint}/posting-period?${new URLSearchParams({companyCode:form.companyCode,periodMonth})}`));})}>{t('productionInstallments.signPeriod','实名确认期间状态')}</button></div>}
    </section>}
  </main>;
}
