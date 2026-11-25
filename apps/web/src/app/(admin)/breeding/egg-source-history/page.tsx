'use client';

import { FormEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { AttachmentUploader } from '@/components/design-system/forms/AttachmentUploader';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { previewProtectedAttachment } from '@/lib/attachments';
import request from '@/lib/api-client';
import { eggSourceEndpoint, requestEggSourceData } from '@/lib/egg-source-api';
import s from '@/components/breeding/ProductionInboundWorkbench.module.css';

type Evidence = { batchNo:string; productCode:string; skuCode:string|null; originalShell:string|null; exactQuantity:number|null;
  ledger:Array<{ id:string; ref_no:string|null; change_type:string; qty_change:string }> };
type Review = { id:string; state:string; submittedByMe?:boolean; source_line:string; quantity:number|null; target_class:string; reason:string; decision:string|null; disposition:string|null; attachments:Array<{file_id:string;checksum:string}>;
  dispositions:Array<{id?:string;ref_no?:string;log_date?:string;restricted?:boolean}> };
type History = { evidence:Evidence; reviews:Review[] };
type QueueRow = {id:string; state:string; house_code:string; warehouse_code:string; batch_no:string; production_date:string; quantity:number|null};
type FrozenReview = Review & {houseCode:string;warehouseCode:string;batchNo:string;productionDate:string;evidenceState:string;frozenLine:Evidence['ledger'][number]};
const endpoint=eggSourceEndpoint+'/history';

type ReviewAction={id:string;parkedKey?:string;kind:'review'|'disposition';state?:string;reason?:string;disposition?:string;ledgerId?:string};
type ReviewSubmission = {
  houseCode: string; warehouseCode: string; productionDate: string; batchNo: string;
  ledgerId: string; targetClass: string; quantity: number | null; reason: string; evidenceIds: string[];
  actionKey: string; companyCode?: string;
};

export default function EggSourceHistoryPage() {
  const { user } = usePermission('MENU_PROD_INBOUND');
  const actor = String(user?.userId ?? user?.id ?? user?.username ?? '');
  return <HistoryWorkbench key={actor} actor={actor} />;
}

function HistoryWorkbench({ actor }: { actor: string }) {
  const { t }=useLanguage();
  const permission=usePermission('MENU_PROD_INBOUND');
  const storageKey = actor ? 'production:history-review:' + actor : '';
  const [pending, setPending] = useState<ReviewSubmission | null>(null);
  const [parked,setParked]=useState<ReviewSubmission[]>([]);
  const [actions,setActions]=useState<Record<string,ReviewAction>>({});
  useEffect(() => {
    if (!storageKey) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved: ReviewSubmission | null = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
        if (saved?.actionKey && saved.batchNo) setPending(saved);
        const storedParked: ReviewSubmission|ReviewSubmission[]|null=JSON.parse(sessionStorage.getItem(storageKey+':parked')??'null');
        if(Array.isArray(storedParked)) setParked(storedParked);
        else if(storedParked?.actionKey) setParked([storedParked]);
        setActions(JSON.parse(sessionStorage.getItem(storageKey+':actions')??'{}'));
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    });
    return () => { active = false; };
  }, [storageKey]);
  const [house,setHouse]=useState('');
  const [houses, setHouses] = useState<{houseCode: string; name: string; status: string; companyCode: string; siteCode: string}[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<{code: string; name: string; status: string}[]>([]);
  const [optionsError, setOptionsError] = useState('');
  const [optionsRevision, setOptionsRevision] = useState(0);
  const owner = houses.find(option => option.houseCode === house);
  useEffect(() => {
    if (!permission.canView) return;
    const controller = new AbortController();
    void request<{code: number; data?: {houses: typeof houses}}>(endpoint + '/options', { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return;
        if (response.code !== 200 || !Array.isArray(response.data?.houses)) throw new Error('eggSources.historyHouseOptionsUnavailable');
        setHouses(response.data.houses);
        setOptionsError('');
      }).catch(error => { if (!controller.signal.aborted) setOptionsError(String(error.message)); });
    return () => controller.abort();
  }, [permission.canView, optionsRevision]);
  useEffect(() => {
    if (!permission.canView || !house) return;
    const controller = new AbortController();
    void request<{code: number; data?: {warehouses: typeof warehouseOptions}}>(
      endpoint + '/options?' + new URLSearchParams({ houseCode: house }), { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return;
        if (response.code !== 200 || !Array.isArray(response.data?.warehouses)) throw new Error('eggSources.historyWarehouseOptionsUnavailable');
        setWarehouseOptions(response.data.warehouses);
        setOptionsError('');
      }).catch(error => { if (!controller.signal.aborted) setOptionsError(String(error.message)); });
    return () => controller.abort();
  }, [permission.canView, house, optionsRevision]);
  const [warehouse,setWarehouse]=useState('');
  const [date,setDate]=useState('');
  const [batch,setBatch]=useState('');
  const [result,setResult]=useState<History|null>(null);
  const [ledger,setLedger]=useState('');
  const [target,setTarget]=useState('STANDARD');
  const [qty,setQty]=useState('');
  const [reason,setReason]=useState('');
  const [decisionReason,setDecisionReason]=useState<Record<string,string>>({});
  const [referral,setReferral]=useState<Record<string,boolean>>({});
  const [dispositionLedger,setDispositionLedger]=useState<Record<string,string>>({});
  const [attachments,setAttachments]=useState<string[]>([]);
  const [uploading,setUploading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [view,setView]=useState<'pending'|'mine'|'batch'>('batch');
  const [queue,setQueue]=useState<QueueRow[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [detail,setDetail]=useState<FrozenReview|null>(null);
  const [queueLoading,setQueueLoading]=useState(false);
  const queueRequest=useRef(0);
  const mobile=usePathname()?.startsWith('/mobile/');
  function closeReview() {
    const id=detail?.id;
    setDetail(null);
    requestAnimationFrame(()=>{
      (document.getElementById('egg-history-open-'+id)??document.getElementById('egg-history-view-'+view))?.focus();
    });
  }

  async function loadQueue(next: 'pending'|'mine', cursor?: string) {
    const requestId=++queueRequest.current;
    if (!cursor) setQueue([]);
    setNextCursor(null);
    setQueueLoading(true);
    try {
      const params=new URLSearchParams({view:next});
      if (cursor) params.set('cursor',cursor);
      const page=await requestEggSourceData<{rows:QueueRow[];nextCursor:string|null}>(endpoint+'/reviews?'+params,
        value=>Array.isArray(value.rows) && (value.nextCursor===null || typeof value.nextCursor==='string'),
        t('eggSources.invalidResponse','蛋品来源数据返回格式异常，请重试。'));
      if (requestId!==queueRequest.current) return;
      setQueue(previous=>cursor?[...previous,...page.rows]:page.rows);
      setNextCursor(page.nextCursor);
    } catch (failure) {
      if (requestId===queueRequest.current) setError(failure instanceof Error?failure.message:String(failure));
    } finally {
      if (requestId===queueRequest.current) setQueueLoading(false);
    }
  }

  async function openReview(id: string) {
    const row=await requestEggSourceData<FrozenReview>(endpoint+'/reviews/'+encodeURIComponent(id),
      value=>value.id===id && !!value.frozenLine && Array.isArray(value.attachments) && Array.isArray(value.dispositions),
      t('eggSources.invalidResponse','蛋品来源数据返回格式异常，请重试。'));
    setDetail(row);
    requestAnimationFrame(()=>document.getElementById('egg-history-frozen-detail')?.focus());
  }

  function chooseView(next: typeof view) {
    queueRequest.current++;
    setView(next);
    setDetail(null);
    setError('');
    if (next!=='batch') void loadQueue(next);
  }

  const inFlight = useRef(false);
  const query={houseCode:house,warehouseCode:warehouse,productionDate:date,batchNo:batch.trim()};
  const canLoad=house&&warehouse&&date&&batch.trim();
  const selectedLedger=result?.evidence.ledger.find(line=>line.id===ledger);
  const quantityLimit=result?.evidence.exactQuantity!=null&&selectedLedger
    ?Math.min(result.evidence.exactQuantity,Math.abs(Number(selectedLedger.qty_change))):undefined;
  const reviewRows=view==='batch'?result?.reviews??[]:[];
  const row=detail;

  const label=(value:string|null) => value==='STANDARD' ? t('eggSources.standard','普通蛋')
    : value==='RED' ? t('eggSources.red','红壳蛋') : value==='PINK' ? t('eggSources.pink','粉壳蛋')
    : t('eggSources.unknown','来源待核实');
  function clear() { setDetail(null);setResult(null);setLedger('');setQty('');setAttachments([]);setError('');setNotice(''); }
  async function load() {
    setResult(null);
    const data=await requestEggSourceData<History>(endpoint+'?'+new URLSearchParams(query),
      value=>value.evidence?.batchNo===query.batchNo && Array.isArray(value.evidence.ledger) &&
        value.evidence.ledger.every(Boolean) && Array.isArray(value.reviews) &&
        value.reviews.every(review=>Array.isArray(review?.attachments) && review.attachments.every(Boolean) &&
          Array.isArray(review.dispositions) && review.dispositions.every(Boolean)),
      t('eggSources.invalidResponse', '蛋品来源数据返回格式异常，请重试。'));
    setResult(data);
  }
  async function refreshAfterAction(linkedByAnother=false) {
    setNotice(linkedByAnother?t('eggSources.historyLinkedByAnother'):t('eggSources.actionSaved','已记录操作与回执'));
    if (detail) await openReview(detail.id);
    if (view==='batch') await load();
    else await loadQueue(view);
  }
  async function perform(work:()=>Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);setError('');setNotice('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function preview(reviewId:string,fileId:string) {
    const messages={blocked:t('productionConversion.allowPreview'),unavailable:t('productionCutover.previewFailed')};
    await previewProtectedAttachment(async()=>{
      const token=sessionStorage.getItem('phoenix_token')||localStorage.getItem('phoenix_token')||'';
      const response=await fetch(`/api${endpoint}/${reviewId}/evidence/${encodeURIComponent(fileId)}`,
        {headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw Error(messages.unavailable);
      return response.blob();
    },messages);
  }
  async function sendReview(payload: ReviewSubmission) {
    if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(payload));
    setPending(payload);
    try {
      const response = await request<{ code: number; data?: { id: string; state: string } }>(endpoint,
        { method: 'POST', body: JSON.stringify({...payload,companyCode:undefined}), bindSession: true });
      const receipt = response?.data;
      if (response?.code !== 201 || typeof receipt?.id !== 'string' || !receipt.id || typeof receipt.state !== 'string') {
        throw new Error(t('eggSources.invalidResponse', '蛋品来源数据返回格式异常，请重试。'));
      }
      if (storageKey) sessionStorage.removeItem(storageKey);
      setPending(null);
      setNotice(t('eggSources.savedReview', '已记录操作与回执') + ' · ' + receipt.id);
    } catch (e) {
      const status = (e as {status?: number})?.status;
      if (!pending && (status === 400 || status === 409 || status === 422)) {
        if (storageKey) sessionStorage.removeItem(storageKey);
        setPending(null);
      }
      throw e;
    }
  }
  async function confirmSubmission(payload: ReviewSubmission) {
    await sendReview(payload);
    if (payload.houseCode === query.houseCode && payload.warehouseCode === query.warehouseCode
      && payload.productionDate === query.productionDate && payload.batchNo === query.batchNo) {
      setAttachments([]);setReason('');setQty('');
      await load();
    }
  }
  async function recoverSubmission(payload:ReviewSubmission, waiting: boolean) {
    const companyCode=payload.companyCode??houses.find(item=>item.houseCode===payload.houseCode)?.companyCode;
    if(!companyCode) throw Error(t('eggSources.historyHouseOptionsUnavailable'));
    const receipt=await requestEggSourceData<{id:string;currentState:string}>(
      endpoint+'/requests/'+encodeURIComponent(payload.actionKey)+'?'+new URLSearchParams({companyCode}),
      value=>typeof value.id==='string'&&typeof value.currentState==='string',t('eggSources.invalidResponse'),{bindSession:true});
    if(waiting){sessionStorage.removeItem(storageKey);setPending(null);}
    else {
      const remaining=parked.filter(item=>item.actionKey!==payload.actionKey);
      sessionStorage.setItem(storageKey+':parked',JSON.stringify(remaining));setParked(remaining);
    }
    setNotice(t('eggSources.savedReview')+' · '+receipt.id+' · '+t(`eggSources.status.${receipt.currentState}`,receipt.currentState));
    if(payload.houseCode===query.houseCode&&payload.warehouseCode===query.warehouseCode&&
      payload.productionDate===query.productionDate&&payload.batchNo===query.batchNo) await load();
  }
  function rememberAction(action: ReviewAction, active:boolean) {
    const key=action.parkedKey??action.id+':'+action.kind;
    const saved=JSON.parse(sessionStorage.getItem(storageKey+':actions')??'{}') as Record<string,ReviewAction>;
    if(active) saved[key]=action; else delete saved[key];
    sessionStorage.setItem(storageKey+':actions',JSON.stringify(saved));
    setActions(saved);
  }
  async function sendAction(action:ReviewAction,retry=false) {
    if(!actor||!permission.canApprove||(!retry&&actions[action.id+':'+action.kind]))return;
    rememberAction(action,true);
    const url=endpoint+'/'+action.id+(action.kind==='review'?'/review':'/dispositions');
    const body=action.kind==='review'?{decision:action.state,reason:action.reason,disposition:action.disposition}:{ledgerId:action.ledgerId};
    let linkedByAnother=false;
    try {
      const response=await request<{code:number;data?:{linkedByAnother?:boolean}}>(url,
        {method:'POST',body:JSON.stringify(body),bindSession:true,retry:false});
      if(!response.data||![200,201].includes(response.code))throw Error(t('eggSources.invalidResponse'));
      rememberAction(action,false);
      linkedByAnother=response.data.linkedByAnother===true;
    } catch(error) {
      const status=(error as {status?:number}).status;
      if(!retry&&status&&[400,403,404,409,422].includes(status)) rememberAction(action,false);
      throw error;
    }
    await refreshAfterAction(linkedByAnother);
  }
  async function recoverAction(action:ReviewAction) {
    const params=new URLSearchParams({kind:action.kind,...(action.ledgerId?{ledgerId:action.ledgerId}:{})});
    const result=await requestEggSourceData<{id?:string;state?:string;reason?:string;disposition?:string|null;linkedByAnother?:boolean;receipt?:unknown}>(
      endpoint+'/reviews/'+action.id+'/action-receipt?'+params,
      value=>action.kind==='review'?value.id===action.id&&value.state===action.state&&
        value.reason===action.reason&&(value.disposition??null)===(action.state==='APPROVED'?action.disposition:null)
        :value.linkedByAnother===true||!!value.receipt,t('eggSources.invalidResponse'),{bindSession:true});
    rememberAction(action,false);
    await refreshAfterAction(result.linkedByAnother===true);
  }

  function recoverActionClick(event:MouseEvent<HTMLButtonElement>) {
    const action=actions[event.currentTarget.dataset.actionKey??''];
    if(action) void perform(()=>recoverAction(action));
  }

  function parkActionClick(event:MouseEvent<HTMLButtonElement>) {
    const activeKey=event.currentTarget.dataset.actionKey??'';
    const action=actions[activeKey];
    if(!action||inFlight.current)return;
    const parkedKey=activeKey+':'+crypto.randomUUID();
    const saved={...actions,[parkedKey]:{...action,parkedKey}};
    delete saved[activeKey];
    sessionStorage.setItem(storageKey+':actions',JSON.stringify(saved));
    setActions(saved);
  }

  function retryActionClick(event:MouseEvent<HTMLButtonElement>) {
    const action=actions[event.currentTarget.dataset.actionKey??''];
    if(action) void perform(()=>sendAction(action,true));
  }

  function submit(event:FormEvent) {
    event.preventDefault();
    if(!result || pending || busy || uploading || !permission.canEdit || qty&&quantityLimit!==undefined&&Number(qty)>quantityLimit) return;
    void perform(async()=>{
      await confirmSubmission({ ...query,companyCode:owner?.companyCode,ledgerId:ledger,targetClass:target,
        quantity:result.evidence.exactQuantity!==null&&qty?Number(qty):null,
        reason:reason.trim(),evidenceIds:attachments,actionKey:crypto.randomUUID() });
    });
  }
  return <div className={s.page}>
    <PageHeader title={t('eggSources.history','历史蛋品来源核认')}/>
    {mobile&&<div className={s.actions}><Link href="/mobile/home">{t('common.back')}</Link></div>}
    {permission.canView&&<nav className={s.actions} aria-label={t('eggSources.history','历史蛋品来源核认')}>
      {permission.canApprove&&<button id="egg-history-view-pending" type="button" aria-pressed={view==='pending'} disabled={busy} onClick={()=>chooseView('pending')}>{t('eggSources.pendingReview','待我审核')}</button>}
      <button id="egg-history-view-mine" type="button" aria-pressed={view==='mine'} disabled={busy} onClick={()=>chooseView('mine')}>{t('eggSources.myHistoryReviews','我的申请')}</button>
      <button id="egg-history-view-batch" type="button" aria-pressed={view==='batch'} disabled={busy} onClick={()=>chooseView('batch')}>{t('eggSources.traceHistoryBatch','按批次追溯')}</button>
    </nav>}
    {view!=='batch'&&permission.canView&&<section className={s.card} aria-busy={queueLoading}>
      {queueLoading&&<p role="status">{t('common.loading')}</p>}
      {!queueLoading&&!queue.length&&!error&&<p>{t('financeReview.empty','当前范围暂无记录')}</p>}
      <ul className={s.history}>{queue.map(row=><li key={row.id}><div>
        <strong>{row.batch_no}</strong><p>{row.house_code} / {row.warehouse_code} · {row.production_date} · {t(`eggSources.status.${row.state}`,row.state)}</p>
        <p>{t('eggSources.requestedHistoryQuantity','申请核认枚数')} {row.quantity??'—'}</p>
      </div><button id={'egg-history-open-'+row.id} type="button" disabled={busy} onClick={()=>void perform(()=>openReview(row.id))}>{t('productionInstallments.view','查看原单')}</button></li>)}</ul>
      {nextCursor&&<button type="button" disabled={busy||queueLoading} onClick={()=>void loadQueue(view,nextCursor)}>{t('financeReview.next','下一页')}</button>}
      {error&&!queueLoading&&<button type="button" onClick={()=>chooseView(view)}>{t('common.retry','重试')}</button>}
    </section>}
    {detail&&<section id="egg-history-frozen-detail" tabIndex={-1} className={s.card} aria-label={t('eggSources.frozenHistoryLine','冻结原流水')}>
      <div className={s.actions}><button type="button" disabled={busy} onClick={closeReview}>{t('common.close','关闭')}</button></div>
      <h2>{detail.batchNo} · {detail.houseCode} / {detail.warehouseCode}</h2>
      <p>{detail.productionDate} · {t('eggSources.frozenHistoryLine','冻结原流水')} #{detail.frozenLine.id} · {detail.frozenLine.change_type} · {detail.frozenLine.qty_change} {t('productionCutover.eggs','枚')}</p>
      <p>{detail.frozenLine.ref_no??t('eggSources.originalRestricted','原业务单据需相应权限')}</p>
      {detail.evidenceState==='NEEDS_REVIEW'&&<p role="status">{t('eggSources.historyEvidenceChanged','原据已变化，批准前须重新核实。')}</p>}
    </section>}

    {error&&<p className={s.notice} role="alert">{error}</p>}
    {notice&&<p className={s.notice} role="status">{notice}</p>}
    {pending&&permission.canView&&<div className={s.notice}>
      <p>{t('eggSources.pendingReviewReceipt','申请结果待核')} · {pending.houseCode} · {pending.productionDate} · {pending.batchNo}</p>
      <button type="button" disabled={busy} onClick={()=>void perform(()=>recoverSubmission(pending,true))}>
        {t('eggSources.recoverReviewReceipt','找回原申请回执')}
      </button>
      {permission.canEdit&&<button type="button" disabled={busy} onClick={()=>void perform(()=>confirmSubmission(pending))}>{t('pilotState.retry','按原操作号重试')}</button>}
      <button type="button" disabled={busy} onClick={()=>{
        const next=[...parked,pending];
        sessionStorage.setItem(storageKey+':parked',JSON.stringify(next));sessionStorage.removeItem(storageKey);setParked(next);setPending(null);
      }}>{t('eggSources.parkHistoryRequest','搁置待核申请')}</button>
    </div>}
    {permission.canView&&parked.map(item=><p role="status" key={item.actionKey}>{t('eggSources.parkHistoryRequest')} · {item.batchNo}
      <button disabled={busy} onClick={()=>void perform(()=>recoverSubmission(item,false))}>{t('eggSources.recoverReviewReceipt')}</button></p>)}
    {permission.canView&&Object.values(actions).map(action=><p role="status" key={action.parkedKey??action.id+':'+action.kind}>
      {t(action.parkedKey?'eggSources.parkHistoryAction':'eggSources.actionPending')} · {action.id}
      <button disabled={busy} data-action-key={action.parkedKey??action.id+':'+action.kind} onClick={recoverActionClick}>{t('eggSources.recoverActionReceipt')}</button>
      {permission.canApprove&&!action.parkedKey&&<>
        <button disabled={busy} data-action-key={action.id+':'+action.kind} onClick={retryActionClick}>{t('pilotState.retry')}</button>
        <button disabled={busy} data-action-key={action.id+':'+action.kind} onClick={parkActionClick}>{t('eggSources.parkHistoryAction')}</button>
      </>}</p>)}
    {permission.canView&&view==='batch'&&!detail&&<section className={s.card}>
      <div className={s.grid}>
        <label className={s.field}>{t('eggSources.house','鸡舍')}
          <select value={house} disabled={busy||uploading} onChange={event=>{
            setHouse(event.target.value);setWarehouse('');setWarehouseOptions([]);clear();
          }}>
            <option value="">{t('common.select','请选择')}</option>
            {houses.map(item=><option key={item.houseCode} value={item.houseCode}>
              {item.name||item.houseCode} ({item.houseCode}){item.status!=='ACTIVE' ? ' · ' + t('eggSources.historyOnlyLabel', '历史鸡舍') : ''}
            </option>)}
          </select>
        </label>
        <label className={s.field}>{t('eggSources.warehouse','目标仓库')}
          <select value={warehouse} disabled={busy||uploading||!house} onChange={event=>{setWarehouse(event.target.value);clear();}}>
            <option value="">{t('common.select','请选择')}</option>
            {warehouseOptions.map(item=><option key={item.code} value={item.code}>
              {item.name||item.code} ({item.code})
            </option>)}
          </select>
        </label>
        {optionsError&&<p role="alert">{t(optionsError, optionsError)} <button type="button" onClick={()=>setOptionsRevision(value=>value+1)}>{t('common.retry','重试')}</button></p>}
        <label className={s.field}>{t('eggSources.productionDate','产蛋日期')}<input type="date" value={date} disabled={busy||uploading}
          onChange={event=>{setDate(event.target.value);clear();}}/></label>
        <label className={s.field}>{t('eggSources.batch','批次号')}<input value={batch} disabled={busy||uploading} maxLength={128}
          onChange={event=>{setBatch(event.target.value);clear();}}/></label>
      </div>
      <button disabled={!canLoad||busy||uploading} onClick={()=>void perform(load)}>{t('eggSources.loadEvidence','查询历史凭据')}</button>
    </section>}
    {view==='batch'&&result&&!detail&&<section className={s.card}>
      <p>{result.evidence.batchNo} · {result.evidence.productCode} · {result.evidence.skuCode||'—'} · {label(result.evidence.originalShell)}</p>
      <p>{t('eggSources.exactQuantity','可归属枚数')} {result.evidence.exactQuantity??t('eggSources.unknown','来源待核实')}</p>
      {permission.canEdit&&<form onSubmit={submit}>
        <div className={s.grid}>
          <label className={s.field}>{t('eggSources.ledger','原库存流水')}<select required disabled={busy||!!pending} value={ledger} onChange={e=>{setLedger(e.target.value);setQty('');}}>
            <option value="">{t('eggSources.choose','请选择')}</option>
            {result.evidence.ledger.map(line=><option key={line.id} value={line.id}>#{line.id} · {line.ref_no??t('eggSources.originalRestricted','原业务单据需相应权限')} · {line.change_type} · {line.qty_change}</option>)}
          </select></label>
          <label className={s.field}>{t('eggSources.shell','商品壳色')}<select disabled={busy||!!pending} value={target} onChange={e=>setTarget(e.target.value)}>
            {['STANDARD','RED','PINK'].map(value=><option value={value} key={value}>{label(value)}</option>)}
          </select></label>
          <label className={s.field}>{t('eggSources.exactQuantity','可归属枚数')}<input type="number" min={1} step={1}
            disabled={busy||!!pending||result.evidence.exactQuantity===null} max={quantityLimit} value={qty} onChange={e=>setQty(e.target.value)}/></label>
          <label className={s.field}>{t('eggSources.reason','依据')}<textarea required disabled={busy||!!pending} value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label>
        </div>
        {owner&&<AttachmentUploader readOnly={busy||!!pending} value={attachments} onChange={setAttachments} onUploadingChange={setUploading}
          ownership={{moduleCode:'PRODUCTION_INBOUND',ownerType:'HOUSE',ownerId:house,companyCode:owner.companyCode,storeCode:owner.siteCode}}/>}
        <button type="submit" disabled={busy||!!pending||uploading||!ledger||!reason.trim()||!attachments.length}>{t('eggSources.submit','提交审核')}</button>
      </form>}
    </section>}
    {view==='batch'&&result&&!detail&&reviewRows.length>0&&<section className={s.card}>
      <ul className={s.history}>{reviewRows.map(row=><li key={row.id}><div>
        <strong>{label(row.target_class)} · {t(`eggSources.status.${row.state}`,row.state)}</strong>
        <p>#{row.source_line} · {row.quantity??'—'} · {row.reason}</p>
      </div><button id={'egg-history-open-'+row.id} type="button" disabled={busy} onClick={()=>void perform(()=>openReview(row.id))}>
        {t('productionInstallments.view')}</button></li>)}</ul>
    </section>}
    {row&&<section className={s.card}>
        <h2>{label(row.target_class)} · {t(`eggSources.status.${row.state}`,row.state)}</h2>
        <p>#{row.source_line} · {row.quantity??'—'} · {row.reason}{row.decision ? ' · '+row.decision : ''}</p>
          <ul>{row.attachments.map(file=><li key={file.file_id}>
            <button type="button" onClick={()=>void perform(()=>preview(row.id,file.file_id))}>{t('eggSources.evidence','核认证据')} {file.file_id}</button>
          </li>)}</ul>
          {row.disposition==='REFER_TO_ORIGINAL'&&<div>
            <p>{row.dispositions.length?t('eggSources.recorded','已关联原业务处置'):t('eggSources.referred','已转原业务，待办理')}</p>
            {row.dispositions.some(receipt=>receipt.restricted)&&<p>{t('eggSources.originalRestricted')}</p>}
            {row.dispositions.filter(receipt=>!receipt.restricted).map(receipt=><p key={receipt.id}>{receipt.log_date} · {receipt.ref_no} · #{receipt.id}</p>)}
            {permission.canApprove&&<div className={s.actions}>
              <input inputMode="numeric" aria-label={t('eggSources.reversalLedger','正式冲销库存流水号')}
                value={dispositionLedger[row.id]??''} onChange={e=>setDispositionLedger(old=>({...old,[row.id]:e.target.value}))}/>
              <button type="button" disabled={busy||!!actions[row.id+':disposition']||!/^\d+$/.test(dispositionLedger[row.id]??'')} onClick={()=>void perform(async()=>{
                await sendAction({id:row.id,kind:'disposition',ledgerId:dispositionLedger[row.id]});
              })}>{t('eggSources.bindReversal','关联已过账冲销')}</button>
            </div>}
          </div>}
          {row.state==='SUBMITTED'&&row.submittedByMe&&<p>{t('eggSources.awaitingIndependentReview','待他人审核')}</p>}
          {permission.canApprove&&row.state==='SUBMITTED'&&!row.submittedByMe&&<div className={s.actions}>
            <input aria-label={t('eggSources.decision','审核或撤销依据')} value={decisionReason[row.id]??''}
              onChange={e=>setDecisionReason(reasons=>({...reasons,[row.id]:e.target.value}))} />
            <label><input type="checkbox" checked={referral[row.id]??false}
              onChange={e=>setReferral(old=>({...old,[row.id]:e.target.checked}))}/>{t('eggSources.referOriginal','需转原业务处置')}</label>
            {['APPROVED','REJECTED'].map(decision=><button type="button" key={decision} disabled={busy||!!actions[row.id+':review']||!decisionReason[row.id]?.trim()||decision==='APPROVED'&&detail?.evidenceState==='NEEDS_REVIEW'}
              onClick={()=>void perform(async()=>{
                await sendAction({id:row.id,kind:'review',state:decision,reason:decisionReason[row.id].trim(),
                  disposition:referral[row.id]?'REFER_TO_ORIGINAL':'ANNOTATION'});
              })}>{decision==='APPROVED'?t('eggSources.approve','批准'):t('eggSources.reject','驳回')}</button>)}
          </div>}
    </section>}
  </div>;
}
