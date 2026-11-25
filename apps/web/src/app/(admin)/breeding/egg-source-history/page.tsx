'use client';

import { FormEvent, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { AttachmentUploader } from '@/components/design-system/forms/AttachmentUploader';
import { HouseSelector, WarehouseSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { previewProtectedAttachment } from '@/lib/attachments';
import request from '@/lib/api-client';
import s from '@/components/breeding/ProductionInboundWorkbench.module.css';

type Evidence = { batchNo:string; productCode:string; skuCode:string|null; originalShell:string|null; exactQuantity:number|null;
  ledger:Array<{ id:string; ref_no:string|null; change_type:string; qty_change:string }> };
type Review = { id:string; state:string; source_line:string; quantity:number|null; target_class:string; reason:string; decision:string|null; disposition:string|null; attachments:Array<{file_id:string;checksum:string}>;
  dispositions:Array<{id:string;ref_no:string;log_date:string}> };
type History = { evidence:Evidence; reviews:Review[] };
const endpoint='/product-master/egg-sources/history';

export default function EggSourceHistoryPage() {
  const { t }=useLanguage();
  const permission=usePermission('MENU_PROD_INBOUND');
  const [house,setHouse]=useState('');
  const [owner,setOwner]=useState({companyCode:'',siteCode:''});
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
  const requestKey=useRef<{input:string;key:string}|null>(null);
  const query={houseCode:house,warehouseCode:warehouse,productionDate:date,batchNo:batch.trim()};
  const canLoad=house&&warehouse&&date&&batch.trim();
  const label=(value:string|null) => value==='STANDARD' ? t('eggSources.standard','普通蛋')
    : value==='RED' ? t('eggSources.red','红壳蛋') : value==='PINK' ? t('eggSources.pink','粉壳蛋')
    : t('eggSources.unknown','来源待核实');
  function clear() { setResult(null);setLedger('');setAttachments([]);setError(''); }
  async function load() {
    setResult(await request<History>(endpoint+'?'+new URLSearchParams(query)));
  }
  async function perform(work:()=>Promise<void>) {
    setBusy(true);setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
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
  function submit(event:FormEvent) {
    event.preventDefault();
    if (!result||busy||uploading||!permission.canEdit) return;
    void perform(async()=>{
      const payload={...query,ledgerId:ledger,targetClass:target,quantity:qty?Number(qty):null,
        reason:reason.trim(),evidenceIds:attachments};
      const signature=JSON.stringify(payload);
      if (requestKey.current?.input!==signature) requestKey.current={input:signature,key:crypto.randomUUID()};
      await request(endpoint,{method:'POST',body:JSON.stringify({...payload,actionKey:requestKey.current.key})});
      requestKey.current=null;setAttachments([]);setReason('');setQty('');await load();
    });
  }
  return <div className={s.page}>
    <PageHeader title={t('eggSources.history','历史蛋品来源核认')}/>
    {error&&<p className={s.notice} role="alert">{error}</p>}
    {permission.canView&&<section className={s.card}>
      <div className={s.grid}>
        <label className={s.field}>{t('eggSources.house','鸡舍')}<HouseSelector value={house} disabled={busy||uploading}
          onChange={code=>{setHouse(code);setWarehouse('');clear();}}
          onPick={option=>setOwner({companyCode:String(option?.raw?.companyCode??''),siteCode:String(option?.raw?.siteCode??'')})}/></label>
        <label className={s.field}>{t('eggSources.warehouse','目标仓库')}<WarehouseSelector value={warehouse}
          companyCode={owner.companyCode} disabled={busy||uploading||!owner.companyCode}
          onChange={code=>{setWarehouse(code);clear();}}/></label>
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
        <AttachmentUploader value={attachments} onChange={setAttachments} onUploadingChange={setUploading}
          ownership={{moduleCode:'PRODUCTION_INBOUND',ownerType:'HOUSE',ownerId:house,companyCode:owner.companyCode,storeCode:owner.siteCode}}/>
        <button type="submit" disabled={busy||uploading||!ledger||!reason.trim()||!attachments.length}>{t('eggSources.submit','提交审核')}</button>
      </form>}
      <div className={s.scroll}><table className={s.table}><thead><tr>
        <th>{t('eggSources.ledger','原库存流水')}</th><th>{t('eggSources.shell','商品壳色')}</th>
        <th>{t('eggSources.status','状态')}</th><th>{t('eggSources.reason','依据')}</th>
      </tr></thead><tbody>{result.reviews.map(row=><tr key={row.id}>
        <td>#{row.source_line} · {row.quantity??'—'}</td><td>{label(row.target_class)}</td>
        <td>{t('eggSources.status.'+row.state,row.state)}</td><td>{row.reason}{row.decision ? ' · '+row.decision : ''}
          <ul>{row.attachments.map(file=><li key={file.file_id}>
            <button type="button" onClick={()=>void perform(()=>preview(row.id,file.file_id))}>{t('eggSources.evidence','核认证据')} {file.file_id}</button>
          </li>)}</ul>
          {row.disposition==='REFER_TO_ORIGINAL'&&<div>
            <p>{row.dispositions.length?t('eggSources.recorded','已关联原业务处置'):t('eggSources.referred','已转原业务，待办理')}</p>
            {row.dispositions.map(receipt=><p key={receipt.id}>{receipt.log_date} · {receipt.ref_no} · #{receipt.id}</p>)}
            {permission.canApprove&&<div className={s.actions}>
              <input inputMode="numeric" aria-label={t('eggSources.reversalLedger','正式冲销库存流水号')}
                value={dispositionLedger[row.id]??''} onChange={e=>setDispositionLedger(old=>({...old,[row.id]:e.target.value}))}/>
              <button type="button" disabled={busy||!/^\d+$/.test(dispositionLedger[row.id]??'')} onClick={()=>void perform(async()=>{
                await request(endpoint+'/'+row.id+'/dispositions',{method:'POST',body:JSON.stringify({ledgerId:dispositionLedger[row.id]})});
                await load();
              })}>{t('eggSources.bindReversal','关联已过账冲销')}</button>
            </div>}
          </div>}
          {permission.canApprove&&row.state==='SUBMITTED'&&<div className={s.actions}>
            <input aria-label={t('eggSources.decision','审核或撤销依据')} value={decisionReason[row.id]??''}
              onChange={e=>setDecisionReason(reasons=>({...reasons,[row.id]:e.target.value}))} />
            <label><input type="checkbox" checked={referral[row.id]??false}
              onChange={e=>setReferral(old=>({...old,[row.id]:e.target.checked}))}/>{t('eggSources.referOriginal','需转原业务处置')}</label>
            {['APPROVED','REJECTED'].map(decision=><button type="button" key={decision} disabled={busy||!decisionReason[row.id]?.trim()}
              onClick={()=>void perform(async()=>{
                await request(endpoint+'/'+row.id+'/review',{method:'POST',body:JSON.stringify({decision,reason:decisionReason[row.id].trim(),disposition:referral[row.id]?'REFER_TO_ORIGINAL':'ANNOTATION'})});
                await load();
              })}>{decision==='APPROVED'?t('eggSources.approve','批准'):t('eggSources.reject','驳回')}</button>)}
          </div>}
        </td>
      </tr>)}</tbody></table></div>
    </section>}
  </div>;
}
