'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
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
const endpoint=eggSourceEndpoint+'/history';

type ReviewSubmission = {
  houseCode: string; warehouseCode: string; productionDate: string; batchNo: string;
  ledgerId: string; targetClass: string; quantity: number | null; reason: string; evidenceIds: string[];
  actionKey: string;
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
  useEffect(() => {
    if (!storageKey) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved: ReviewSubmission | null = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
        if (saved?.actionKey && saved.batchNo) setPending(saved);
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
        if (response.code !== 200 || !Array.isArray(response.data?.houses)) throw new Error(t('eggSources.historyHouseOptionsUnavailable'));
        setHouses(response.data.houses);
        setOptionsError('');
      }).catch(error => { if (!controller.signal.aborted) setOptionsError(String(error.message)); });
    return () => controller.abort();
  }, [permission.canView, optionsRevision, t]);
  useEffect(() => {
    if (!permission.canView || !house) return;
    const controller = new AbortController();
    void request<{code: number; data?: {warehouses: typeof warehouseOptions}}>(
      endpoint + '/options?' + new URLSearchParams({ houseCode: house }), { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return;
        if (response.code !== 200 || !Array.isArray(response.data?.warehouses)) throw new Error(t('eggSources.historyWarehouseOptionsUnavailable'));
        setWarehouseOptions(response.data.warehouses);
        setOptionsError('');
      }).catch(error => { if (!controller.signal.aborted) setOptionsError(String(error.message)); });
    return () => controller.abort();
  }, [permission.canView, house, optionsRevision, t]);
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
  const inFlight = useRef(false);
  const query={houseCode:house,warehouseCode:warehouse,productionDate:date,batchNo:batch.trim()};
  const canLoad=house&&warehouse&&date&&batch.trim();
  const label=(value:string|null) => value==='STANDARD' ? t('eggSources.standard','普通蛋')
    : value==='RED' ? t('eggSources.red','红壳蛋') : value==='PINK' ? t('eggSources.pink','粉壳蛋')
    : t('eggSources.unknown','来源待核实');
  function clear() { setResult(null);setLedger('');setQty('');setAttachments([]);setError('');setNotice(''); }
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
  async function refreshAfterAction() {
    setNotice(t('eggSources.actionSaved','已记录操作与回执'));
    await load();
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
        { method: 'POST', body: JSON.stringify(payload), bindSession: true });
      const receipt = response?.data;
      if (response?.code !== 201 || typeof receipt?.id !== 'string' || !receipt.id || typeof receipt.state !== 'string') {
        throw new Error(t('eggSources.invalidResponse', '蛋品来源数据返回格式异常，请重试。'));
      }
      if (storageKey) sessionStorage.removeItem(storageKey);
      setPending(null);
      setNotice(t('eggSources.savedReview', '已记录操作与回执') + ' · ' + receipt.id);
    } catch (e) {
      const status = (e as {status?: number})?.status;
      if (status === 400 || status === 409 || status === 422) {
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
  function submit(event:FormEvent) {
    event.preventDefault();
    if(!result || pending || busy || uploading || !permission.canEdit) return;
    void perform(async()=>{
      await confirmSubmission({ ...query,ledgerId:ledger,targetClass:target,
        quantity:result.evidence.exactQuantity!==null&&qty?Number(qty):null,
        reason:reason.trim(),evidenceIds:attachments,actionKey:crypto.randomUUID() });
    });
  }
  return <div className={s.page}>
    <PageHeader title={t('eggSources.history','历史蛋品来源核认')}/>
    {error&&<p className={s.notice} role="alert">{error}</p>}
    {notice&&<p className={s.notice} role="status">{notice}</p>}
    {pending&&permission.canEdit&&<div className={s.notice}>
      <p>{t('eggSources.pendingReviewReceipt','申请结果待核')} · {pending.houseCode} · {pending.productionDate} · {pending.batchNo}</p>
      <button type="button" disabled={busy} onClick={()=>void perform(()=>confirmSubmission(pending))}>
        {t('eggSources.recoverReviewReceipt','找回原申请回执')}
      </button>
    </div>}
    {permission.canView&&<section className={s.card}>
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
        {optionsError&&<p role="alert">{optionsError} <button type="button" onClick={()=>setOptionsRevision(value=>value+1)}>{t('common.retry','重试')}</button></p>}
        <label className={s.field}>{t('eggSources.productionDate','产蛋日期')}<input type="date" value={date} disabled={busy||uploading}
          onChange={event=>{setDate(event.target.value);clear();}}/></label>
        <label className={s.field}>{t('eggSources.batch','批次号')}<input value={batch} disabled={busy||uploading} maxLength={128}
          onChange={event=>{setBatch(event.target.value);clear();}}/></label>
      </div>
      <button disabled={!canLoad||busy||uploading} onClick={()=>void perform(load)}>{t('eggSources.loadEvidence','查询历史凭据')}</button>
    </section>}
    {result&&<section className={s.card}>
      <p>{result.evidence.batchNo} · {result.evidence.productCode} · {result.evidence.skuCode||'—'} · {label(result.evidence.originalShell)}</p>
      <p>{t('eggSources.exactQuantity','可归属枚数')} {result.evidence.exactQuantity??t('eggSources.unknown','来源待核实')}</p>
      {permission.canEdit&&<form onSubmit={submit}>
        <div className={s.grid}>
          <label className={s.field}>{t('eggSources.ledger','原库存流水')}<select required value={ledger} onChange={e=>setLedger(e.target.value)}>
            <option value="">{t('eggSources.choose','请选择')}</option>
            {result.evidence.ledger.map(line=><option key={line.id} value={line.id}>#{line.id} · {line.ref_no??t('eggSources.originalRestricted','原业务单据需相应权限')} · {line.change_type} · {line.qty_change}</option>)}
          </select></label>
          <label className={s.field}>{t('eggSources.shell','商品壳色')}<select value={target} onChange={e=>setTarget(e.target.value)}>
            {['STANDARD','RED','PINK'].map(value=><option value={value} key={value}>{label(value)}</option>)}
          </select></label>
          <label className={s.field}>{t('eggSources.exactQuantity','可归属枚数')}<input type="number" min={1} step={1}
            disabled={result.evidence.exactQuantity===null} max={result.evidence.exactQuantity??undefined} value={qty} onChange={e=>setQty(e.target.value)}/></label>
          <label className={s.field}>{t('eggSources.reason','依据')}<textarea required value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label>
        </div>
        {owner&&<AttachmentUploader value={attachments} onChange={setAttachments} onUploadingChange={setUploading}
          ownership={{moduleCode:'PRODUCTION_INBOUND',ownerType:'HOUSE',ownerId:house,companyCode:owner.companyCode,storeCode:owner.siteCode}}/>}
        <button type="submit" disabled={busy||!!pending||uploading||!ledger||!reason.trim()||!attachments.length}>{t('eggSources.submit','提交审核')}</button>
      </form>}
      <div className={s.scroll}><table className={s.table}><thead><tr>
        <th>{t('eggSources.ledger','原库存流水')}</th><th>{t('eggSources.shell','商品壳色')}</th>
        <th>{t('eggSources.status','状态')}</th><th>{t('eggSources.reason','依据')}</th>
      </tr></thead><tbody>{result.reviews.map(row=><tr key={row.id}>
        <td>#{row.source_line} · {row.quantity??'—'}</td><td>{label(row.target_class)}</td>
        <td>{t(`eggSources.status.${row.state}`,row.state)}</td><td>{row.reason}{row.decision ? ' · '+row.decision : ''}
          <ul>{row.attachments.map(file=><li key={file.file_id}>
            <button type="button" onClick={()=>void perform(()=>preview(row.id,file.file_id))}>{t('eggSources.evidence','核认证据')} {file.file_id}</button>
          </li>)}</ul>
          {row.disposition==='REFER_TO_ORIGINAL'&&<div>
            <p>{row.dispositions.length?t('eggSources.recorded','已关联原业务处置'):t('eggSources.referred','已转原业务，待办理')}</p>
            {row.dispositions.filter(receipt=>!receipt.restricted).map(receipt=><p key={receipt.id}>{receipt.log_date} · {receipt.ref_no} · #{receipt.id}</p>)}
            {permission.canApprove&&<div className={s.actions}>
              <input inputMode="numeric" aria-label={t('eggSources.reversalLedger','正式冲销库存流水号')}
                value={dispositionLedger[row.id]??''} onChange={e=>setDispositionLedger(old=>({...old,[row.id]:e.target.value}))}/>
              <button type="button" disabled={busy||!/^\d+$/.test(dispositionLedger[row.id]??'')} onClick={()=>void perform(async()=>{
                await request(endpoint+'/'+row.id+'/dispositions',{method:'POST',body:JSON.stringify({ledgerId:dispositionLedger[row.id]})});
                await refreshAfterAction();
              })}>{t('eggSources.bindReversal','关联已过账冲销')}</button>
            </div>}
          </div>}
          {row.state==='SUBMITTED'&&row.submittedByMe&&<p>{t('eggSources.awaitingIndependentReview','待他人审核')}</p>}
          {permission.canApprove&&row.state==='SUBMITTED'&&!row.submittedByMe&&<div className={s.actions}>
            <input aria-label={t('eggSources.decision','审核或撤销依据')} value={decisionReason[row.id]??''}
              onChange={e=>setDecisionReason(reasons=>({...reasons,[row.id]:e.target.value}))} />
            <label><input type="checkbox" checked={referral[row.id]??false}
              onChange={e=>setReferral(old=>({...old,[row.id]:e.target.checked}))}/>{t('eggSources.referOriginal','需转原业务处置')}</label>
            {['APPROVED','REJECTED'].map(decision=><button type="button" key={decision} disabled={busy||!decisionReason[row.id]?.trim()}
              onClick={()=>void perform(async()=>{
                await request(endpoint+'/'+row.id+'/review',{method:'POST',body:JSON.stringify({decision,reason:decisionReason[row.id].trim(),disposition:referral[row.id]?'REFER_TO_ORIGINAL':'ANNOTATION'})});
                await refreshAfterAction();
              })}>{decision==='APPROVED'?t('eggSources.approve','批准'):t('eggSources.reject','驳回')}</button>)}
          </div>}
        </td>
      </tr>)}</tbody></table></div>
    </section>}
  </div>;
}
