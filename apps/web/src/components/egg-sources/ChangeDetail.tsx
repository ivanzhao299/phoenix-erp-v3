'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ConfirmDialogV2, DetailTemplate, MasterDataTemplate, ModalV2, PageSection } from '@/components/design-system';
import { inputField, primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';
import { useEggIdentity, useEggRead, useEggWrite } from './client';
import { isDetail, query, root, type Action, type Detail } from './contracts';
import { Back, Badge, Busy, CopyId, Field, Meta, ReadFailure, Schedule, WriteFeedback, useSourceText } from './parts';
import { PrecheckPanel } from './PrecheckPanel';
import s from './EggSources.module.css';

const actionKeys:Record<Action,string> = {
  submit:'submit',approve:'approve',cancel:'cancel',reject:'reject','request-revoke':'requestRevoke',
  revoke:'revoke','decline-revoke':'declineRevoke',
};
const requiresReason=(action:Action)=>['reject','request-revoke','revoke','decline-revoke'].includes(action);
const isReview=(action:Action)=>['approve','reject','revoke','decline-revoke'].includes(action);

export default function ChangeDetail({id}:{id:string}) {
  const account=useEggIdentity();
  return <ScopedDetail id={id} account={account} key={JSON.stringify([id,account])}/>;
}

function ScopedDetail({account,id}:{account:string;id:string}) {
  const params=useSearchParams();
  const {label,shell,time,crumb}=useSourceText();
  const url='/changes/'+encodeURIComponent(id);
  const read=useEggRead<Detail>(account,url,isDetail);
  const [choose,setChoose]=useState<{action:Action;version:number}|null>(null);
  const [reason,setReason]=useState('');
  const [latestReceipt,setLatestReceipt]=useState<{state:string;version:number}|null>(null);
  const write=useEggWrite(account,id,key=>url+'/action-requests/'+key,receipt=>{
    setChoose(null);
    setLatestReceipt(receipt);
    read.reload();
  });
  const detail=read.data;
  const requestedReturn=new URLSearchParams(params.get('return')||'');
  const house=detail?.owner.houseCode;
  if (latestReceipt) {
    requestedReturn.delete('cursor');
    requestedReturn.set('applied',id);
  }
  const returnHref=house && requestedReturn.get('houseCode')===house && requestedReturn.get('tab')==='changes'
    ? root+'?'+requestedReturn.toString() : root+query({houseCode:house,tab:'changes',applied:latestReceipt?id:null});
  const feedback=<div tabIndex={-1} id="egg-source-write-status">
    {params.get('saved')==='1'&&<p role="status" className={s.notice}>{label('saved')}</p>}
    {latestReceipt&&<p role="status" className={s.notice}>{label('actionSaved')} · {label('status.'+latestReceipt.state)} · {label('version')} {latestReceipt.version}</p>}
    <WriteFeedback write={write} allowRetry={!!detail?.allowedActions.length} refresh={()=>{write.resetFeedback();read.reload();}}/>
  </div>;
  if (!detail) return <MasterDataTemplate responsive title={label('detail')} breadcrumb={crumb}
    content={<div className={s.stack}><div className={s.actions}><Back href={returnHref}/></div>{feedback}
      {read.loading&&<Busy/>}{read.error&&<ReadFailure error={read.error} retry={read.reload}/>}</div>}/>;

  const currentAction=choose?.version===detail.version ? choose.action : null;
  const clear=()=>{setChoose(null);setReason('');};
  function submit(action:Action) {
    if (detail?.version!==choose?.version || !detail?.allowedActions.includes(action)) return;
    const text=reason.trim();
    if (requiresReason(action)&&!text) return;
    void write.send(url+(isReview(action)?'/reviews/':'/actions/')+action,{
      version:detail.version,reason:text||null,
      ...(detail.contractVersion===2 ? {contractVersion:2} : {}),
      ...(action==='approve'?{planDigest:detail.planDigest,...(detail.contractVersion===2 ? {readinessDigest:detail.readiness?.digest} : {})}:{}),
    });
    clear();
    requestAnimationFrame(()=>document.getElementById('egg-source-write-status')?.focus());
  }
  const noWrites=write.busy||write.pending||write.feedback==='CONFLICT';
  const old=detail.originalApproval;
  const actionButtons=<div className={s.actions}>
    {detail.allowedActions.map(action=><button key={action} type="button"
      style={['submit','approve'].includes(action) ? primaryActionButton : secondaryActionButton} disabled={noWrites}
      onClick={()=>{setReason('');setChoose({action,version:detail.version});}}>{label(actionKeys[action])}</button>)}
  </div>;
  const dialogTitle=currentAction ? label(actionKeys[currentAction]) : '';
  const explanation=currentAction ? label('effect.'+currentAction) : '';
  return <>
    <DetailTemplate responsive title={label('detail')} breadcrumb={crumb} status={detail.state}
      statusLabel={label('status.'+detail.state)} actions={<Back href={returnHref}/>}
      coreFields={[
        {label:label('requestId'),value:<CopyId id={detail.id}/>,full:true},
        {label:label('start'),value:detail.effectiveDate},{label:label('zone'),value:detail.zone},
        {label:label('createdBy'),value:detail.createdByName||detail.createdBy},{label:label('createdAt'),value:time(detail.createdAt)},
        {label:label('house'),value:detail.owner.houseName+' ('+detail.owner.houseCode+')'},
        {label:label('company'),value:detail.owner.companyName||detail.owner.companyCode},
        {label:label('farm'),value:detail.owner.farmName || detail.owner.farmCode},
        {label:label('site'),value:detail.owner.siteName||detail.owner.siteCode},
        ...(detail.contractVersion===2 ? [] : [{label:label('warehouse'),value:detail.warehouseName ? detail.warehouseName+' ('+detail.warehouseCode+')' : detail.warehouseCode}]),
        {label:label('shell'),value:shell(detail.targetClass)},
      ]}
      sections={[
        {title:label('requestContents'),content:<div className={s.stack}>
          <p className={s.long}>{detail.reason}</p>
          {detail.linkedPlan&&<p className={s.hint}>{detail.plan ?
            <Link href={`/breeding/flock-lifecycle/${detail.plan.kind==='ADMIT' ? 'admissions' : 'transfers'}?doc=${encodeURIComponent(detail.plan.id)}`}>
              {label('plan.'+detail.plan.kind)} · {detail.plan.flock_no} · {label('version')} {detail.plan.frozenVersion??detail.plan.version}
            </Link> : label('planLinkedRestricted')}</p>}
          <ul className={s.events}>{detail.requirements.map(row=><li key={JSON.stringify(row)} className={s.record}>{row.gradeCode} · {row.specCode}</li>)}</ul>
          {detail.canPrecheck&&<DraftPrecheck key={detail.version} account={account} detail={detail} disabled={noWrites}/>}
        </div>},
        {title:label('frozenTitle'),content:detail.frozenItems.length ? <ul className={s.events}>{detail.frozenItems.map(row=>
          <li key={JSON.stringify([row.gradeCode,row.specCode])} className={s.record}>
            <Meta pairs={[[label('grade'),row.gradeCode],[label('spec'),row.specCode],[label('product'),row.productCode],[label('sku'),row.skuCode],
              ...(detail.contractVersion===2 ? [] : [[label('inventoryDomain'),label(row.domainVerified?'domainVerified':'domainNotRecorded')] as [string,string]])]}/>
          </li>)}</ul> : <p className={s.hint}>{label('notFrozen')}</p>},
        ...(detail.contractVersion===2 ? [{title:label('inventoryReadiness'),content:<div className={s.stack}>
          <p className={s.hint}>{label(detail.readiness ? 'readiness.'+detail.readiness.status : 'readiness.NOT_CHECKED')}</p>
          {detail.readiness?.warehouseCode&&<p>{label('warehouse')} · {detail.readiness.warehouseCode}</p>}
          {detail.readiness?.code&&<p className={s.notice}>{label('problem.'+detail.readiness.code)}</p>}
        </div>}] : []),
        {title:label('originalApproval'),content:<div className={s.stack}>
          <Meta pairs={[
            [label('oldProfile'),old?.previousProfileCode||label('oldProfileUnknown')],
            [label('oldShell'),detail.previousClass?shell(detail.previousClass):'—'],
            [label('oldEnds'),old?.previousProfileCode && old.newProfileCode ? priorDay(detail.effectiveDate) : '—'],
            [label('newProfile'),old?.newProfileCode],
            [label('end'),old?.newProfileCode ? old.newExpiry||label('noEnd') : '—'],
          ]}/>
          {!old&&<p className={s.hint}>{label('noApproval')}</p>}
        </div>},
        {title:label('currentSchedule'),content:<div className={s.stack}><p className={s.hint}>{label('scheduleBasis')}</p><Schedule profiles={detail.currentProfiles}/></div>},
      ]}
      sidebar={<div className={s.stack}>
        <PageSection title={label('actions')}><div className={s.stack}>{feedback}
          {detail.writesPaused&&<p role="status" className={s.notice}>{label('problem.WRITES_PAUSED')}</p>}
          {detail.overdue&&<p role="status" className={s.notice}>{label('overdueDetail')}</p>}
          {detail.allowedActions.length ? actionButtons : <p className={s.hint}>{label('noActions')}</p>}
        </div></PageSection>
        <PageSection title={label('historyActions')}>
          <ol className={s.events}>
            <li className={s.record}><strong>{label('created')}</strong><p className={s.hint}>{detail.createdByName||detail.createdBy} · {time(detail.createdAt)}</p></li>
            {detail.events.map((event,index)=><li className={s.record} key={event.version??index}>
              <div className={s.actions}><strong>{label(actionKeys[event.action])}</strong>{event.state&&<Badge value={event.state}/>}</div>
              <p className={s.hint}>{event.actorName||event.actor} · {time(event.at)} · {label('version')} {event.version??'—'}</p>
              {event.reason&&<p className={s.long}>{event.reason}</p>}
            </li>)}
          </ol>
        </PageSection>
      </div>}/>
    <ConfirmDialogV2 open={!!currentAction&&!requiresReason(currentAction)} title={dialogTitle} message={explanation}
      confirmLabel={dialogTitle} onCancel={clear} danger={currentAction==='cancel'} onConfirm={()=>currentAction&&submit(currentAction)}/>
    <ModalV2 open={!!currentAction&&requiresReason(currentAction)} title={dialogTitle} onClose={clear}
      footer={<div className={s.actions}>
        <button type="button" style={secondaryActionButton} onClick={clear}>{label('closeDialog')}</button>
        <button type="button" style={primaryActionButton} disabled={!reason.trim()||noWrites}
          onClick={()=>currentAction&&submit(currentAction)}>{dialogTitle}</button>
      </div>}>
      <div className={s.stack}><p className={s.hint}>{explanation}</p><Field title={label('decision')}>
        {attrs=><textarea {...attrs} style={inputField} value={reason} required maxLength={2000} onChange={e=>setReason(e.target.value)}/>}
      </Field></div>
    </ModalV2>
  </>;
}

function DraftPrecheck({account,detail,disabled}:{account:string;detail:Detail;disabled:boolean}) {
  const input=useMemo(()=>({houseCode:detail.owner.houseCode,effectiveDate:detail.effectiveDate,targetClass:detail.targetClass,
    warehouseCode:detail.warehouseCode}),[detail]);
  return <PrecheckPanel account={account} input={input} draftId={detail.id} disabled={disabled}/>;

}

function priorDay(day:string) {
  const date=new Date(day+'T00:00:00Z');
  if (!Number.isFinite(date.getTime())) return '—';
  date.setUTCDate(date.getUTCDate()-1);
  return date.toISOString().slice(0,10);
}
