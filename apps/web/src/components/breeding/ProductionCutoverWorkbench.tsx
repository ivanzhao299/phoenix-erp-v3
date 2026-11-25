'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CutoverExecutionReceipt from './CutoverExecutionReceipt';
import ProductionCutoverStatePanel from './ProductionCutoverStatePanel';
import PageHeader from '@/components/PageHeader';
import { CompanySelector, HouseSelector, WarehouseSelector, ProductSelector, SkuSelector, LocationSelector } from '@/components/shared-selectors/MasterDataSelectors';
import DictSelect from '@/components/shared-selectors/DictSelect';
import { AttachmentUploader } from '@/components/design-system/forms/AttachmentUploader';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import { useProductGrades } from '@/hooks/useProductGrades';
import { localizedMasterName } from '@/lib/localized-master-data';
import { previewProtectedAttachment } from '@/lib/attachments';
import { useDictOptions } from '@/hooks/useDictOptions';
import request from '@/lib/api-client';
import s from './ProductionInboundWorkbench.module.css';

const endpoint='/v2/inventory/production-cutovers';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
type Fact=Record<string,unknown>;
interface Decision {batchNo:string;disposition:string;evidenceFileId:string;reason:string}
interface RawCount {rawSegmentId:string;quantity:string;evidenceFileId:string;reason:string}
interface RawBalance {rawSegmentId:string;documentNo:string;warehouseCode:string;houseCode:string;gradeCode:string;productionDate:string;remainingQuantity:string}
interface ReferenceDecision {table:string;rowSha256:string;classification:string;evidenceFileId:string;reason:string}
interface Line {skuCode:string;productCode:string;gradeCode:string;specCode:string;locationCode:string;quantity:string;stockStatus:string;productionDate:string;expireDate:string;costStatus:string;unitCost:string;qualityConfirmed:boolean}
interface Form {companyCode:string;warehouseCode:string;intentKey:string;postingDate:string;houses:Array<{houseCode:string;firstProductionDate:string}>;
  extension?:Extension; products:Array<{productCode:string;quantity:string}>;openingLines:Line[];decisions:Decision[];referenceDecisions:ReferenceDecision[];rawCounts:RawCount[];evidenceFileIds:string[]}
type ExtensionSetup={targetClass:'STANDARD'|'RED'|'PINK';effectiveDate:string;requirements:Array<{gradeCode:string;specCode:string}>};
type Extension=ExtensionSetup&{kind:'ATTACH_EXISTING_SCOPE'|'INIT_EXISTING_SCOPE_ZERO';scopeId:string;scopeVersion:number;
 scopeManifestSha256:string;domainId?:string;domainVersion?:number;openingReceiptId?:string};
interface TransferProof {direction:'RECEIVED'|'DISPATCHED';batchNo:string;transferNo:string;transferLineId:string;skuCode:string;unit:string;quantity:number}
interface Evidence {snapshotSha256:string;references:Array<{table:string;rowSha256:string;fact:Fact}>;snapshot:{batches:Fact[];missingTables:string[];warnings:string[];crossCompanyProofs?:TransferProof[];processing?:{rawBalances:RawBalance[]}}}
interface Document {id:string;document_no:string;company_code:string;warehouse_code:string;intent_key:string;state:string;version:number;created_by:string;content_hash:string;snapshot_sha256:string;
  boundary:{houses:Form['houses'];productCodes:string[]};payload:{extension?:Extension;postingDate:string;physicalTotals:Array<{productCode:string;quantity:number}>;openingLines:Array<Omit<Line,'quantity'|'unitCost'|'productionDate'|'expireDate'>&{quantity:number;unitCost:number|string|null;productionDate:string|null;expireDate:string|null}>;decisions:Decision[];referenceDecisions:ReferenceDecision[];rawCounts:RawCount[];evidenceFileIds:string[]};
  references?:Evidence['references'];signatures:Array<{signature_role:string;signed_by:string;evidence_file_id:string;signed_at:string}>;snapshot:Evidence['snapshot']|null}
type InspectionBoundary = {companyCode:string;warehouseCode:string;houses:Form['houses'];productCodes:string[]};
function readCutoverEvidence(boundary:InspectionBoundary, extension?:ExtensionSetup) {
  const route = extension ? 'inspect-extension' : 'inspect';
  const data = extension ? {companyCode:boundary.companyCode,warehouseCode:boundary.warehouseCode,
    houseCode:boundary.houses[0]?.houseCode,productCode:boundary.productCodes[0],targetClass:extension.targetClass,
    effectiveDate:extension.effectiveDate,requirements:extension.requirements} : boundary;
  return request<Evidence>(endpoint+'/'+route,{method:'POST',body:JSON.stringify(data)});
}
const blank=():Form=>({companyCode:'',warehouseCode:'',intentKey:'',postingDate:today(),houses:[],products:[],openingLines:[],decisions:[],referenceDecisions:[],rawCounts:[],evidenceFileIds:[]});
const emptyLine=():Line=>({skuCode:'',productCode:'',gradeCode:'',specCode:'',locationCode:'',quantity:'',stockStatus:'',productionDate:'',expireDate:'',costStatus:'',unitCost:'',qualityConfirmed:false});
function fromDocument(d:Document):Form{return {companyCode:d.company_code,warehouseCode:d.warehouse_code,intentKey:d.intent_key,postingDate:d.payload.postingDate,
  houses:d.boundary.houses,extension:d.payload.extension,products:d.payload.physicalTotals.map(t=>({...t,quantity:String(t.quantity)})),
  openingLines:d.payload.openingLines.map(l=>({...l,quantity:String(l.quantity),unitCost:l.unitCost===null?'':String(l.unitCost),productionDate:l.productionDate??'',expireDate:l.expireDate??''})),
  rawCounts:(d.payload.rawCounts??[]).map(r=>({...r,quantity:String(r.quantity)})),decisions:d.payload.decisions,referenceDecisions:d.payload.referenceDecisions,evidenceFileIds:d.payload.evidenceFileIds};}

export default function ProductionCutoverWorkbench(){
  const {user}=usePermission('MENU_PROD_INBOUND');return <ActorCutoverWorkbench key={String(user.userId??user.id??'')}/>;
}
function ActorCutoverWorkbench(){
  const {t,lang}=useLanguage(),p=usePermission('MENU_PROD_INBOUND'),finance=usePermission('MENU_FIN2_AR_LEDGER');
  const {codeMap:states}=useDictOptions('PRODUCTION_CUTOVER_STATE'),{grades}=useProductGrades({onlyStorable:true});
  const gradeName=(code:string)=>localizedMasterName(grades.find(g=>g.grade_code===code) as unknown as Fact|undefined,'grade_name',lang)||code;
  const [form,setForm]=useState<Form>(blank),[selected,setSelected]=useState<Document|null>(null),[evidenceState,setEvidence]=useState<(Evidence&{boundaryKey:string})|null>(null);
  const [documents,setDocuments]=useState<Document[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[restored,setRestored]=useState('');
  const [query,setQuery]=useState({companyCode:'',warehouseCode:'',documentNo:'',state:''});
  const [hasSearched,setHasSearched]=useState(false);
  const [restoreAttempt,setRestoreAttempt]=useState(0);
  const [restoreFailed,setRestoreFailed]=useState(false);
  const [draftConflict,setDraftConflict]=useState<Form|null>(null);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [freezePreview,setFreezePreview]=useState<(Evidence&{id:string;version:number;previewToken:string})|null>(null);
  const [extend,setExtend]=useState(false);
  const [extensionSetup,setExtensionSetup]=useState<ExtensionSetup>({targetClass:'STANDARD',effectiveDate:'',requirements:[]});
  const [selectedExtensionSku,setSelectedExtensionSku]=useState('');
  const [role,setRole]=useState(''),[signatureFiles,setSignatureFiles]=useState<string[]>([]),[reason,setReason]=useState('');
  const documentRequest=useRef(0);
  const evidenceRequest=useRef(0),evidenceBoundary=JSON.stringify({companyCode:form.companyCode,warehouseCode:form.warehouseCode,houses:form.houses,productCodes:form.products.map(product=>product.productCode)});
  const confirmedPreview=freezePreview?.id===selected?.id&&freezePreview?.version===selected?.version?freezePreview:null;
  const evidence=confirmedPreview??(evidenceState?.boundaryKey===evidenceBoundary?evidenceState:null);
  const actor=String(p.user.userId??p.user.id??''),storageKey=`production-cutover:v1:${actor}`;
  const editable=restored===storageKey&&!busy&&(!selected&&p.canCreate||selected?.state==='DRAFT'&&p.canEdit&&selected.created_by===actor),queryBoundary=!busy&&!selected,ownership={moduleCode:'PRODUCTION_CUTOVER',ownerType:'WAREHOUSE',ownerId:form.warehouseCode,companyCode:form.companyCode};
  const patch=(next:Partial<Form>)=>{setFreezePreview(null);setForm(old=>({...old,...next}));};
  const updateQuery=(change:Partial<typeof query>)=>{
    setQuery(previous=>({...previous,...change}));setHasSearched(false);setDocuments([]);setNextCursor(null);
  };
  async function listDocuments(cursor?:string) {
    const params=new URLSearchParams(query);
    if(cursor) params.set('cursor',cursor);
    const page=await request<{rows:Document[];nextCursor:string|null}>(endpoint+'/page?'+params);
    setDocuments(previous=>cursor?[...previous,...page.rows]:page.rows);
    setNextCursor(page.nextCursor);
    setHasSearched(true);
  }
  const cachedForm=useCallback((d:Document, parsed:{documentId?:string;version?:number;form?:Form}|null)=>{
    const serverForm=fromDocument(d);
    const backupKey=storageKey+':older:'+d.id;
    if(parsed?.documentId===d.id&&parsed.form){
      if(d.state==='DRAFT'&&parsed.version===d.version){
        setDraftConflict(JSON.parse(sessionStorage.getItem(backupKey)??'null'));
        return parsed.form;
      }
      if(JSON.stringify(parsed.form)!==JSON.stringify(serverForm)){
        sessionStorage.setItem(backupKey,JSON.stringify(parsed.form));
      }
    }
    setDraftConflict(JSON.parse(sessionStorage.getItem(backupKey)??'null'));
    return serverForm;
  },[storageKey]);
  useEffect(()=>{
    const gate=new AbortController();
    const generation=++documentRequest.current;
    void Promise.resolve().then(async()=>{
      try{
        const parsed=JSON.parse(sessionStorage.getItem(storageKey)??'null');
        const id=new URLSearchParams(location.search).get('documentId')??parsed?.documentId;
        const d=id?await request<Document>(`${endpoint}/${encodeURIComponent(id)}`,{signal:gate.signal}):null;
        if(gate.signal.aborted||generation!==documentRequest.current)return;
        if(d)setSelected(d);
        setForm(d?cachedForm(d,parsed):(parsed?.form??{...blank(),intentKey:crypto.randomUUID()}));
        setRestoreFailed(false);
        setRestored(storageKey);
      }catch(error){
        if(!gate.signal.aborted&&generation===documentRequest.current){
          setRestoreFailed(true);
          setError(error instanceof Error?error.message:String(error));
        }
      }
    });
    return ()=>gate.abort();
  },[storageKey,restoreAttempt,cachedForm]);
  useEffect(()=>{if(restored===storageKey)sessionStorage.setItem(storageKey,JSON.stringify({form,documentId:selected?.id,version:selected?.version}));},[restored,storageKey,form,selected]);
  useEffect(()=>{
    const generation=++evidenceRequest.current;let alive=true;
    if(selected?.state!=='DRAFT')return;
    // A draft has no frozen snapshot. Refresh its actual rows without replacing the measured input.
    const boundary=JSON.parse(evidenceBoundary);if(!boundary.houses.length||!boundary.productCodes.length)return;
    readCutoverEvidence(boundary,selected.payload.extension)
      .then(current=>{if(alive&&generation===evidenceRequest.current)setEvidence({...current,boundaryKey:evidenceBoundary});}).catch(e=>{if(alive&&generation===evidenceRequest.current)setError(String(e.message));});
    return()=>{alive=false;};
  },[selected,evidenceBoundary]);
  const load=async(id:string,options:{focus?:boolean;refreshList?:boolean}={})=>{const generation=++documentRequest.current;
    const d=await request<Document>(`${endpoint}/${encodeURIComponent(id)}`);
    if(generation!==documentRequest.current)return;
    const nextForm=options.focus?cachedForm(d,JSON.parse(sessionStorage.getItem(storageKey)??'null')):fromDocument(d);
    setRestoreFailed(false);setRestored(storageKey);setSelected(d);setForm(nextForm);setFreezePreview(null);setEvidence(null);setSignatureFiles([]);setRole('');setReason('');
    const url=new URL(location.href);url.searchParams.set('documentId',d.id);history.replaceState(null,'',url);
    if(options.focus)requestAnimationFrame(()=>document.getElementById('production-cutover-detail')?.focus());
    if(options.refreshList&&hasSearched){
      setHasSearched(false);setDocuments([]);setNextCursor(null);
      await listDocuments();
    }
  };
  async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  function boundary(){if(!form.companyCode||!form.warehouseCode||!form.houses.length||!form.products.length)throw Error(t('productionCutover.boundaryRequired','请先选择公司、仓库、全部相关鸡舍和产品。'));
    return {companyCode:form.companyCode,warehouseCode:form.warehouseCode,houses:form.houses,productCodes:form.products.map(p=>p.productCode)};}
  function payload(){if(extend&&!form.extension)throw Error(t('eggSources.extendRequired','请先预检正式扩域范围'));const number=(value:string,zero=false)=>{if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<(zero?0:1))throw Error(t('productionCutover.quantityRequired','请逐项输入实际整数数量；零盘点须明确输入 0。'));return Number(value);};
    return {boundary:boundary(),...(form.extension?{extension:form.extension}:{}),intentKey:form.intentKey,postingDate:form.postingDate,evidenceFileIds:form.evidenceFileIds,
      physicalTotals:form.products.map(p=>({productCode:p.productCode,quantity:number(p.quantity,true)})),decisions:form.decisions,referenceDecisions:form.referenceDecisions,rawCounts:(form.rawCounts??[]).map(r=>({...r,quantity:number(r.quantity,true)})),
      openingLines:form.openingLines.map(l=>({...l,quantity:number(l.quantity),productionDate:l.productionDate||null,expireDate:l.expireDate||null,
        unitCost:l.costStatus==='UNKNOWN'?null:l.unitCost.trim()||null}))};}
  async function inspectExtension() {
    const generation=++evidenceRequest.current;
    const result=await request<Evidence&{boundary:{houses:Form['houses']};extension:Extension}>(endpoint+'/inspect-extension',
      {method:'POST',body:JSON.stringify({companyCode:form.companyCode,warehouseCode:form.warehouseCode,houseCode:form.houses[0].houseCode,
        productCode:form.products[0].productCode,...extensionSetup})});
    if(generation!==evidenceRequest.current)return;
    const key=JSON.stringify({companyCode:form.companyCode,warehouseCode:form.warehouseCode,houses:result.boundary.houses,
      productCodes:form.products.map(product=>product.productCode)});
    patch({houses:result.boundary.houses,extension:result.extension,openingLines:[],decisions:[],referenceDecisions:[],rawCounts:[]});
    setEvidence({...result,boundaryKey:key});
  }
  const updateLine=(index:number,next:Partial<Line>)=>patch({openingLines:form.openingLines.map((l,i)=>i===index?{...l,...next}:l)});
  const changeDecision=(batchNo:string,next:Partial<Decision>)=>patch({decisions:[...form.decisions.filter(d=>d.batchNo!==batchNo),
    {...form.decisions.find(d=>d.batchNo===batchNo)??{batchNo,disposition:'',evidenceFileId:'',reason:''},...next}]});
  const changeReference=(table:string,rowSha256:string,next:Partial<ReferenceDecision>)=>patch({referenceDecisions:[...form.referenceDecisions.filter(d=>d.table!==table||d.rowSha256!==rowSha256),
    {...form.referenceDecisions.find(d=>d.table===table&&d.rowSha256===rowSha256)??{table,rowSha256,classification:'',evidenceFileId:'',reason:''},...next}]});
  async function preview(file:string){
    if(!selected)return;
    const messages={blocked:t('productionConversion.allowPreview'),unavailable:t('productionCutover.previewFailed')};
    await previewProtectedAttachment(async()=>{
      const token=sessionStorage.getItem('phoenix_token')||localStorage.getItem('phoenix_token')||'';
      const response=await fetch(`/api${endpoint}/${selected.id}/evidence/${encodeURIComponent(file)}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw new Error(messages.unavailable);
      return response.blob();
    },messages);
  }
  if(!p.canView&&!p.canApprove&&!finance.canEdit)return <div className={s.page}>{t('productionCutover.denied','无权查看盘点交接。')}</div>;
  const rawBalances=(evidence?.snapshot.processing?.rawBalances??selected?.snapshot?.processing?.rawBalances??[]).filter(r=>r.warehouseCode===form.warehouseCode&&Number(r.remainingQuantity)>0);
  const changeRawCount=(rawSegmentId:string,next:Partial<RawCount>)=>patch({rawCounts:[...(form.rawCounts??[]).filter(r=>r.rawSegmentId!==rawSegmentId),
    {...(form.rawCounts??[]).find(r=>r.rawSegmentId===rawSegmentId)??{rawSegmentId,quantity:'',reason:'',evidenceFileId:form.evidenceFileIds[0]??''},...next}]});
  const sourceBatches=evidence?.snapshot.batches??selected?.snapshot?.batches??[];
  const transferProofs=evidence?.snapshot.crossCompanyProofs??selected?.snapshot?.crossCompanyProofs??[];
  return <main className={`${s.page} ${s.cutover}`} data-i18n-skip="true">
    <PageHeader title={t('productionCutover.title','正式库存切换盘点')} subtitle={t('productionCutover.subtitle','按真实现场盘点准备交接，保留原始证据。')}/>
    <p className={s.notice}>{t('productionCutover.off','当前仅开放盘点准备和签认。签认不启用业务，也不代表发布批准。请按实际盘点填写；没有现场依据时保留草稿。')}</p>
    {error&&<p role="alert" className={`${s.notice} ${s.error}`}>{error}</p>}
    {restoreFailed&&<button disabled={busy} onClick={()=>{setError('');setRestoreAttempt(n=>n+1);}}>{t('common.retry')}</button>}
    {draftConflict&&<details className={s.notice}><summary>{t('productionJobs.draftVersionChanged')}</summary>
      <ul>{draftConflict.products.map(row=><li key={row.productCode}>{row.productCode} · {row.quantity}</li>)}
        {draftConflict.rawCounts.map(row=><li key={row.rawSegmentId}>{row.rawSegmentId} · {row.quantity} · {row.reason}</li>)}
        {draftConflict.openingLines.map((row,index)=><li key={row.skuCode+':'+index}>{row.skuCode} · {row.locationCode} · {row.quantity}</li>)}
      </ul>
    </details>}
    <section className={s.card} aria-label={t('productionCutover.existing','已有盘点')}>
      <h2>{t('productionCutover.existing','已有盘点')}</h2>
      <div className={s.grid}>
        <CompanySelector ariaLabel={t('productionCutover.queryCompany','查询公司')} value={query.companyCode} disabled={busy} onChange={companyCode=>updateQuery({companyCode,warehouseCode:''})}/>
        <WarehouseSelector ariaLabel={t('productionCutover.queryWarehouse','查询仓库')} value={query.warehouseCode} companyCode={query.companyCode} disabled={busy||!query.companyCode} onChange={warehouseCode=>updateQuery({warehouseCode})}/>
        <label className={s.field}>{t('productionCutover.documentNo','单号')}<input maxLength={128} disabled={busy} value={query.documentNo} onChange={e=>updateQuery({documentNo:e.target.value.trim()})}/></label>
        <label className={s.field}>{t('financeReview.state','状态')}<DictSelect dictType="PRODUCTION_CUTOVER_STATE" value={query.state} disabled={busy} onChange={state=>updateQuery({state})}/></label>
      </div>
      <div className={s.actions}><button disabled={busy||!query.companyCode||!query.warehouseCode} onClick={()=>run(()=>listDocuments())}>{t('productionCutover.recover','查找已有盘点')}</button></div>
      {hasSearched&&!documents.length&&<p role="status">{t('financeReview.empty','当前范围暂无记录')}</p>}
      <ul className={s.history}>{documents.map(d=><li key={d.id}><div><strong>{d.document_no}</strong><p>{states[d.state]??d.state} · {d.created_by}</p></div>
        <button disabled={busy} onClick={()=>run(()=>load(d.id,{focus:true}))}>{t('productionInstallments.view','查看原单')}</button></li>)}</ul>
      {nextCursor&&<button disabled={busy} onClick={()=>run(()=>listDocuments(nextCursor))}>{t('financeReview.next','下一页')}</button>}
    </section>
    {transferProofs.length>0&&<section className={s.card} aria-label={t('productionCutover.transferProofs','已核验跨公司调拨')}>
      <h2>{t('productionCutover.transferProofs','已核验跨公司调拨')}</h2>
      <p>{t('productionCutover.transferProofHelp','按本公司实际调拨流水及原始来源核验；每次新增签认都会复核。')}</p>
      {transferProofs.map(proof=><div key={`${proof.batchNo}:${proof.transferLineId}`} className={s.card}>
        <p>{proof.direction==='RECEIVED'?t('productionCutover.received','实际接收'):t('productionCutover.dispatched','实际发出')} · {proof.transferNo}</p>
        <p>{t('productionCutover.localBatch','本公司批次')} · {proof.batchNo}</p>
        <p>{t('productionCutover.sku','实物 SKU')} · {proof.skuCode} · {proof.quantity} {t('productionCutover.eggs','枚')}</p>
      </div>)}
    </section>}
    <section className={s.card}>
      <div className={s.grid}>
        <label className={s.field}>{t('productionCutover.company','公司')}<CompanySelector ariaLabel={t('productionCutover.company','公司')} value={form.companyCode} disabled={!queryBoundary} onChange={companyCode=>{setEvidence(null);patch({...blank(),intentKey:crypto.randomUUID(),companyCode});}}/></label>
        <label className={s.field}>{t('productionCutover.warehouse','实盘仓库')}<WarehouseSelector ariaLabel={t('productionCutover.warehouse','实盘仓库')} value={form.warehouseCode} companyCode={form.companyCode} disabled={!queryBoundary} onChange={warehouseCode=>{setEvidence(null);patch({warehouseCode,intentKey:crypto.randomUUID(),products:form.products.map(product=>({...product,quantity:''})),openingLines:[],decisions:[],referenceDecisions:[],evidenceFileIds:[],rawCounts:[]});}}/></label>
        <label className={s.field}>{t('productionCutover.postingDate','预计记账日')}<input type="date" value={form.postingDate} disabled={!editable} onChange={e=>patch({postingDate:e.target.value})}/></label>
      </div>
      {queryBoundary&&<label><input type="checkbox" checked={extend} onChange={e=>{
        setExtend(e.target.checked);patch({extension:undefined});setEvidence(null);
      }}/>{t('eggSources.extend','为既有鸡舍扩展正式产品域')}</label>}
      {extend&&!selected&&<div className={s.grid}>
        <label className={s.field}>{t('eggSources.shell','商品壳色')}<select value={extensionSetup.targetClass} onChange={e=>{
          patch({extension:undefined});setExtensionSetup({...extensionSetup,targetClass:e.target.value as ExtensionSetup['targetClass']});
        }}><option value="STANDARD">{t('eggSources.standard','普通蛋')}</option>
          <option value="RED">{t('eggSources.red','红壳蛋')}</option><option value="PINK">{t('eggSources.pink','粉壳蛋')}</option></select></label>
        <label className={s.field}>{t('eggSources.effectiveDate','生效日期')}<input type="date" value={extensionSetup.effectiveDate} onChange={e=>{
          patch({extension:undefined});setExtensionSetup({...extensionSetup,effectiveDate:e.target.value});
        }}/></label>
        <SkuSelector value={selectedExtensionSku} onChange={setSelectedExtensionSku} companyCode={form.companyCode} usage="stock"
          onPick={option=>{const raw=option?.raw;if(!raw)return;
            const gradeCode=String(raw.grade_code??''),specCode=String(raw.spec_code??'');
            if(String(raw.product_code)!==form.products[0]?.productCode||!gradeCode||!specCode||
              extensionSetup.requirements.some(item=>item.gradeCode===gradeCode&&item.specCode===specCode))return;
            patch({extension:undefined});setExtensionSetup({...extensionSetup,requirements:[...extensionSetup.requirements,{gradeCode,specCode}]});
          }}/>
        <ul>{extensionSetup.requirements.map(item=><li key={item.gradeCode+item.specCode}>{item.gradeCode} · {item.specCode}{' '}
          <button onClick={()=>{patch({extension:undefined});setExtensionSetup({...extensionSetup,requirements:
            extensionSetup.requirements.filter(current=>current!==item)});}}>{t('productionCutover.remove','移除')}</button>
        </li>)}</ul>
      </div>}
      {form.extension&&<p>{form.extension.kind==='ATTACH_EXISTING_SCOPE'?t('eggSources.attachDomain','关联已开账产品域'):
        t('eggSources.zeroDomain','经零实盘新开产品域')} · {form.extension.effectiveDate}</p>}
      <h2>{t('productionCutover.houses','全部相关鸡舍及首个正式产蛋日')}</h2>
      {form.houses.map((h,i)=><div className={s.grid} key={h.houseCode}>
        <label className={s.field}>{t('productionCutover.house','鸡舍')}<input readOnly value={h.houseCode} style={{background:'var(--bg-muted)',cursor:'not-allowed'}}/></label>
        <label className={s.field}>{t('productionCutover.firstDay','首个正式产蛋日')}<input type="date" value={h.firstProductionDate} disabled={!editable||extend||!!form.extension} onChange={e=>patch({houses:form.houses.map((v,index)=>index===i?{...v,firstProductionDate:e.target.value}:v)})}/></label>
        {editable&&<button type="button" onClick={()=>patch({houses:form.houses.filter((_,index)=>i!==index)})}>{t('productionCutover.remove','移除')}</button>}
      </div>)}
      {editable&&<HouseSelector value="" onChange={()=>{}} ariaLabel={t('productionCutover.addHouse','添加相关鸡舍')} onPick={option=>{const raw=option?.raw as Fact|undefined;if(!raw)return;const houseCode=String(raw.houseCode??raw.house_code??'');
        if(raw.companyCode!==form.companyCode&&raw.company_code!==form.companyCode){setError(t('productionCutover.houseCompany','鸡舍与所选公司不匹配。'));return;}
        if(houseCode&&!form.houses.some(h=>h.houseCode===houseCode))patch({extension:undefined,houses:[...form.houses,{houseCode,firstProductionDate:''}]});}}/>}
      <h2>{t('productionCutover.totals','实盘产品总数（枚）')}</h2>
      {form.products.map((product,i)=><div className={s.grid} key={product.productCode}>
        <label className={s.field}>{t('productionCutover.product','产品')}<input value={product.productCode} readOnly style={{background:'var(--bg-muted)',cursor:'not-allowed'}}/></label>
        <label className={s.field}>{t('productionCutover.counted','现场库存实盘（不含原始收蛋）')}<input inputMode="numeric" value={product.quantity} disabled={!editable} onChange={e=>patch({products:form.products.map((v,index)=>i===index?{...v,quantity:e.target.value}:v)})}/></label>
        {editable&&<button type="button" onClick={()=>patch({products:form.products.filter((_,index)=>i!==index)})}>{t('productionCutover.remove','移除')}</button>}
      </div>)}
      {editable&&<ProductSelector value="" ariaLabel={t('productionCutover.addProduct','添加实盘产品')} onChange={productCode=>{if(productCode&&!form.products.some(p=>p.productCode===productCode))patch({extension:undefined,products:[...form.products,{productCode,quantity:''}]});}}/>}
      <div className={s.actions}><button disabled={busy||!form.companyCode||!form.warehouseCode||!!selected&&selected.state!=='DRAFT'||extend&&!selected&&(form.houses.length!==1||form.products.length!==1||!extensionSetup.effectiveDate||!extensionSetup.requirements.length)} onClick={()=>run(async()=>{if(extend&&!selected){await inspectExtension();return;}const generation=++evidenceRequest.current,e=await readCutoverEvidence(boundary(),selected?.payload.extension);if(generation!==evidenceRequest.current)return;setEvidence({...e,boundaryKey:evidenceBoundary});patch({rawCounts:(form.rawCounts??[]).filter(r=>(e.snapshot.processing?.rawBalances??[]).some(balance=>balance.rawSegmentId===r.rawSegmentId&&balance.warehouseCode===form.warehouseCode&&Number(balance.remainingQuantity)>0)),decisions:form.decisions.filter(d=>e.snapshot.batches.some(b=>b.batch_no===d.batchNo)),referenceDecisions:form.referenceDecisions.filter(d=>e.references.some(r=>r.table===d.table&&r.rowSha256===d.rowSha256))});})}>{t('productionCutover.inspect','读取实际库存及关联清单')}</button>
      </div>
      {evidence&&<p className={s.notice}>{t('productionCutover.evidenceOnly','清单仅供核验，不构成启用批准。')}{evidence.snapshot.missingTables.length>0&&t('productionCutover.missing',' 部分检查数据尚未齐备，启用前须补齐核验。')}{evidence.snapshot.warnings.length>0&&t('productionCutover.held',' 范围中存在待确认项，请处理后重新读取。')}</p>}
    </section>
    <section className={s.card}>
      <h2>{t('productionCutover.proof','实际盘点及处置证据')}</h2>
      {form.companyCode&&form.warehouseCode&&<AttachmentUploader value={form.evidenceFileIds} onChange={evidenceFileIds=>patch({evidenceFileIds})} ownership={ownership} readOnly={!editable}/>}
      {selected&&form.evidenceFileIds.map(file=><button key={file} onClick={()=>run(()=>preview(file))}>{t('productionCutover.preview','查看原附件')}</button>)}
      {rawBalances.length>0&&<section aria-label={t('productionCutover.rawCounts','本仓原始收蛋单独实盘')}><h2>{t('productionCutover.rawCounts','本仓原始收蛋单独实盘')}</h2>
        <p>{t('productionCutover.rawCountHelp','已签认但未入库的原蛋逐来源段实盘，不计入下面的库存总数或期初；过期或暂停也不能忽略实物。')}</p>
        {rawBalances.map(balance=>{const count=(form.rawCounts??[]).find(r=>r.rawSegmentId===balance.rawSegmentId);return <div className={s.card} key={balance.rawSegmentId}>
          <p>{balance.documentNo} · {balance.houseCode} · {gradeName(balance.gradeCode)} · {balance.productionDate}</p>
          <p>{t('productionCutover.rawBookBalance','原料账面剩余')}：{balance.remainingQuantity}</p>
          <label className={s.field}>{t('productionCutover.rawMeasured','本次原料实盘（枚）')}<input inputMode="numeric" value={count?.quantity??''} disabled={!editable}
            onChange={e=>changeRawCount(balance.rawSegmentId,{quantity:e.target.value,evidenceFileId:form.evidenceFileIds[0]??''})}/></label>
          <label className={s.field}>{t('productionCutover.rawBasis','原料实盘依据')}<textarea value={count?.reason??''} disabled={!editable}
            onChange={e=>changeRawCount(balance.rawSegmentId,{reason:e.target.value,evidenceFileId:form.evidenceFileIds[0]??''})}/></label>
        </div>;})}
      </section>}
      <h2>{t('productionCutover.oldStocks','原批次及来源后代')}</h2>
      {sourceBatches.map(b=>{const no=String(b.batch_no),d=form.decisions.find(d=>d.batchNo===no);return <div className={s.card} key={no}>
        <p>{no} · {String(b.warehouse_code??'')} · {String(b.sku_code??'')} · {String(b.qty??'')} {t('productionCutover.eggs','枚')}</p>
        <DictSelect dictType="PRODUCTION_CUTOVER_DISPOSITION" value={d?.disposition??''} disabled={!editable} onChange={disposition=>changeDecision(no,{disposition})}/>
        <label className={s.field}>{t('productionCutover.reason','实际处置依据')}<textarea value={d?.reason??''} disabled={!editable} onChange={e=>changeDecision(no,{reason:e.target.value,evidenceFileId:form.evidenceFileIds[0]??''})}/></label>
      </div>;})}
      {(evidence?.references??selected?.references??[]).map(r=>{const d=form.referenceDecisions.find(d=>d.table===r.table&&d.rowSha256===r.rowSha256);return <div className={s.card} key={`${r.table}:${r.rowSha256}`}>
        <p>{t('productionCutover.reference','关联事实')} · {String(r.fact.order_no??r.fact.transfer_no??r.fact.return_no??r.fact.id??r.rowSha256.slice(0,12))} · {String(r.fact.status??r.fact.state??'')}</p>
        <DictSelect dictType="PRODUCTION_CUTOVER_REFERENCE" value={d?.classification??''} allowedValues={['production_raw_receipts','production_conversion_documents'].includes(r.table)?['RESOLVED']:undefined} disabled={!editable} onChange={classification=>changeReference(r.table,r.rowSha256,{classification})}/>
        <label className={s.field}>{t('productionCutover.reason','实际处置依据')}<textarea disabled={!editable} value={d?.reason??''} onChange={e=>changeReference(r.table,r.rowSha256,{reason:e.target.value,evidenceFileId:form.evidenceFileIds[0]??''})}/></label>
      </div>;})}
    </section>
    <section className={s.card}><h2>{t('productionCutover.opening','独立实物期初明细')}</h2><p>{t('productionCutover.openingHelp','只录入尚无合法来源接续的实物；期初不计日产量、不占日报额度。未知日期留空，未知成本须明确选择。')}</p>
      {form.openingLines.map((l,i)=><div className={s.card} key={i}><div className={s.grid}>
        <label className={s.field}>{t('productionCutover.sku','实物 SKU')}<SkuSelector ariaLabel={t('productionCutover.sku','实物 SKU')} value={l.skuCode} companyCode={form.companyCode} usage="stock" disabled={!editable} onChange={()=>{}} onPick={option=>{const raw=option?.raw as Fact|undefined;if(raw)updateLine(i,{skuCode:String(raw.sku_code??''),productCode:String(raw.product_code??''),gradeCode:String(raw.grade_code??''),specCode:String(raw.spec_code??'')});}}/></label>
        <label className={s.field}>{t('productionCutover.location','仓位')}<LocationSelector ariaLabel={t('productionCutover.location','仓位')} lookupEndpoint={`${endpoint}/locations?${new URLSearchParams({companyCode:form.companyCode,warehouseCode:form.warehouseCode})}`} warehouseCode={form.warehouseCode} value={l.locationCode} disabled={!editable} onChange={locationCode=>updateLine(i,{locationCode})}/></label>
        <label className={s.field}>{t('productionCutover.quantity','实物数量（枚）')}<input inputMode="numeric" value={l.quantity} disabled={!editable} onChange={e=>updateLine(i,{quantity:e.target.value})}/></label>
        <label className={s.field}>{t('productionCutover.stockStatus','实物状态')}<DictSelect dictType="INV_STOCK_STATUS" ariaLabel={t('productionCutover.stockStatus','实物状态')} value={l.stockStatus} disabled={!editable} onChange={stockStatus=>updateLine(i,{stockStatus})}/></label>
        <label className={s.field}>{t('productionCutover.productionDate','实际生产日')}<input type="date" value={l.productionDate} disabled={!editable} onChange={e=>updateLine(i,{productionDate:e.target.value})}/></label>
        <label className={s.field}>{t('productionCutover.expiry','实际效期')}<input type="date" value={l.expireDate} disabled={!editable} onChange={e=>updateLine(i,{expireDate:e.target.value})}/></label>
        <label className={s.field}>{t('productionCutover.costStatus','成本确认')}<DictSelect dictType="PRODUCTION_COST_STATUS" ariaLabel={t('productionCutover.costStatus','成本确认')} value={l.costStatus} disabled={!editable} onChange={costStatus=>updateLine(i,{costStatus,unitCost:''})}/></label>
        <label className={s.field}>{t('productionCutover.unitCost','财务核定单位成本')}<input inputMode="decimal" value={l.unitCost} disabled={!editable||l.costStatus!=='CONFIRMED'} onChange={e=>updateLine(i,{unitCost:e.target.value})}/></label>
        <label><input type="checkbox" checked={l.qualityConfirmed} disabled={!editable} onChange={e=>updateLine(i,{qualityConfirmed:e.target.checked})}/>{t('productionCutover.quality','已按实物质检确认')}</label>
      </div>{editable&&<button onClick={()=>patch({openingLines:form.openingLines.filter((_,index)=>index!==i)})}>{t('productionCutover.remove','移除')}</button>}</div>)}
      {editable&&<button onClick={()=>patch({openingLines:[...form.openingLines,emptyLine()]})}>{t('productionCutover.addLine','添加实物明细')}</button>}
      <div className={s.actions}>
        <button disabled={busy||!editable||(!selected&&!p.canCreate)||(!!selected&&!p.canEdit)} onClick={()=>run(async()=>{const data=payload();const d=await request<Document>(selected?`${endpoint}/${selected.id}`:endpoint,
          {method:selected?'PATCH':'POST',body:JSON.stringify(selected?{...data,version:selected.version}:data)});await load(d.id,{refreshList:true});})}>{t('productionCutover.save','保存盘点草稿')}</button>
        {selected?.state==='DRAFT'&&p.canEdit&&<button disabled={busy} onClick={()=>run(async()=>{
          setFreezePreview(null);
          const saved=selected.created_by===actor && JSON.stringify(form)!==JSON.stringify(fromDocument(selected))
            ?await request<Document>(`${endpoint}/${selected.id}`,{method:'PATCH',body:JSON.stringify({...payload(),version:selected.version}),bindSession:true})
            :selected;
          if(saved.version!==selected.version) await load(saved.id);
          const preview=await request<Evidence&{version:number;previewToken:string}>(`${endpoint}/${saved.id}/freeze-preview`,{bindSession:true});
          if(preview.version!==saved.version||!preview.previewToken) throw Error(t('productionCutover.previewChanged','盘点已变化，请重新核对。'));
          ++evidenceRequest.current;
          setEvidence({...preview,boundaryKey:evidenceBoundary});
          setFreezePreview({...preview,id:saved.id});
        })}>{t('productionCutover.previewFreeze','核对冻结预览')}</button>}
        {selected&&['DRAFT','READY','APPROVED'].includes(selected.state)&&p.canEdit&&<button disabled={busy} onClick={()=>run(async()=>{await request(`${endpoint}/${selected.id}/cancel`,{method:'POST',body:JSON.stringify({version:selected.version})});await load(selected.id,{refreshList:true});})}>{t('productionCutover.cancel','取消本单')}</button>}
        <button disabled={busy||!p.canCreate} onClick={()=>{documentRequest.current++;setRestoreFailed(false);setRestored(storageKey);setSelected(null);setDraftConflict(null);setFreezePreview(null);setEvidence(null);setForm({...blank(),intentKey:crypto.randomUUID()});const url=new URL(location.href);url.searchParams.delete('documentId');history.replaceState(null,'',url);}}>{t('productionCutover.new','另建盘点')}</button>
      </div>
    </section>
    {freezePreview&&selected?.id===freezePreview.id&&selected.version===freezePreview.version&&<section className={s.card}>
      <h2>{t('productionCutover.previewFreeze','核对冻结预览')} · {selected.document_no} · v{selected.version}</h2>
      <p>{t('productionCutover.confirmPreviewHelp','请核对本页实盘、原批、原始收蛋、处置证据及期初明细，再确认冻结。')}</p>
      {selected.payload.physicalTotals.map(row=><p key={row.productCode}>{row.productCode} · {row.quantity} {t('productionCutover.eggs','枚')}</p>)}
      <p className={s.wide}>{freezePreview.snapshotSha256}</p>
      <button disabled={busy} onClick={()=>run(async()=>{
        const {id,version,previewToken}=freezePreview;
        try {
          await request(`${endpoint}/${id}/freeze`,{method:'POST',bindSession:true,body:JSON.stringify({version,previewToken})});
          await load(id,{refreshList:true});
        } catch (failure) {
          if((failure as {status?:number}).status===409) setFreezePreview(null);
          throw failure;
        }
      })}>{t('productionCutover.freeze','冻结已保存盘点，交业务及财务签认')}</button>
    </section>}
    {selected&&<section className={s.card}><h2 id="production-cutover-detail" tabIndex={-1}>{selected.document_no} · {selected.state==='APPLIED'?t('productionJobs.executionRecord'):states[selected.state]??selected.state}</h2>
      <CutoverExecutionReceipt key={selected.id+selected.version} document={selected} mobile={location.pathname.startsWith('/mobile/')}/>
      <p className={s.wide}>{t('productionCutover.hash','冻结内容摘要')}：{selected.content_hash||t('productionCutover.notFrozen','尚未冻结')}</p>
      {selected.signatures?.map(sign=><p key={sign.signature_role}>{sign.signature_role==='BUSINESS'?t('productionCutover.business','业务签认'):t('productionCutover.finance','财务签认')} · {sign.signed_by} · {sign.signed_at}</p>)}
      {selected.state==='READY'&&selected.created_by!==actor&&(p.canApprove||finance.canEdit)&&<>
        <label className={s.field}>{t('productionCutover.role','实名签认角色')}<DictSelect dictType="PRODUCTION_CUTOVER_ROLE" ariaLabel={t('productionCutover.role','实名签认角色')} value={role} onChange={setRole}/></label>
        <AttachmentUploader value={signatureFiles} onChange={setSignatureFiles} ownership={ownership}/>
        <label className={s.field}>{t('productionCutover.signReason','签认依据')}<textarea aria-label={t('productionCutover.signReason','签认依据')} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button disabled={busy||!signatureFiles.length||!reason||(role==='BUSINESS'?!p.canApprove:role==='FINANCE'?!finance.canEdit:true)} onClick={()=>run(async()=>{
          await request(`${endpoint}/${selected.id}/sign`,{method:'POST',body:JSON.stringify({role,contentHash:selected.content_hash,snapshotSha256:selected.snapshot_sha256,evidenceFileId:signatureFiles[0],reason})});await load(selected.id,{refreshList:true});
        })}>{t('productionCutover.sign','签认冻结原单')}</button>
      </>}
    </section>}
    {selected?.state==='APPLIED'&&<ProductionCutoverStatePanel key={selected.id+actor} id={selected.id} actor={actor}
      company={selected.company_code} warehouse={selected.warehouse_code} houses={selected.boundary.houses.map(h=>h.houseCode)}/>}
  </main>;
}
