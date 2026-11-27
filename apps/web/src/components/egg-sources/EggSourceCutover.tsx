'use client';

import { useCallback,useEffect,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { inputField,primaryActionButton,secondaryActionButton } from '@/components/design-system/cockpit-styles';
import request from '@/lib/api-client';
import { Badge,CopyId,Field,Meta,useSourceText } from './parts';
import s from './EggSources.module.css';

const admin='/sys/menu-registry';
const cleanup=admin+'/egg-source-legacy-cleanup';
const verification=admin+'/egg-source-legacy-verification';
const options={silent:true,bindSession:true,retry:false,cache:'no-store'} as const;

function post<T>(path:string,body:object) {
  return request<{data:T}>(path,{...options,method:'POST',body:JSON.stringify(body)});
}

function failure(error:unknown,fallback:string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

type OldChange={id:string;company_code:string;house_code:string;state:string;version:number;warehouse_code:string|null;
  archived:boolean;classification:'ELIGIBLE'|'ARCHIVED'|'NEEDS_DISPOSITION'|'RETAIN_EVIDENCE';digest:string};
type OldGrant={kind:'role'|'set';code:string;perm_codes:string;deny_codes:string|null;scope_type:string|null;
  scope_value:string|null;digest:string;members:string[]};
type Inventory={rows:OldChange[];grants:OldGrant[];paused:boolean;retired:boolean;pauseRevision:string};
type Receipt={requestId:string};

function grantKey(grant:OldGrant) {return grant.kind+'/'+grant.code;}

export function EggSourceLegacyCleanup() {
  const {label}=useSourceText();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [inventory,setInventory]=useState<Inventory|null>(null);
  const [error,setError]=useState('');
  const [receipt,setReceipt]=useState('');
  const [receiptId,setReceiptId]=useState('');
  const [receiptStatus,setReceiptStatus]=useState<{kind:string;created_at:string}|null>(null);
  const [archived,setArchived]=useState(true);
  const [selection,setSelection]=useState<string[]>([]);
  const [grantId,setGrantId]=useState('');
  const [remove,setRemove]=useState<string[]>([]);
  const [reason,setReason]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [operation,setOperation]=useState<{path:string;body:object}|null>(null);
  const grant=inventory?.grants.find(row=>grantKey(row)===grantId);
  const targets=inventory?.rows.filter(row=>selection.includes(row.id)).map(({id,digest})=>({id,digest}))??[];

  async function refresh() {
    setBusy(true);setError('');setOperation(null);setSelection([]);setGrantId('');setRemove([]);setConfirmed(false);
    try { setInventory((await request<{data:Inventory}>(cleanup,options)).data); }
    catch(error) {setError(failure(error,label('writeControl.failed')));setInventory(null);}
    finally {setBusy(false);}
  }

  async function loadReceipt() {
    setBusy(true);setError('');setReceiptStatus(null);
    try {
      const {data}=await request<{data:{kind:string;created_at:string}}>(cleanup+'/receipts/'+encodeURIComponent(receiptId.trim()),options);
      setReceiptStatus(data);
    } catch(error) {setError(failure(error,label('writeControl.failed')));}
    finally {setBusy(false);}
  }

  async function apply(type:'archive'|'grant') {
    const key=crypto.randomUUID();
    const input={requestId:key,reason:reason.trim(),confirmed,pauseRevision:inventory?.pauseRevision};
    const next=operation??(type==='grant'&&grant ?
      {path:cleanup+'/grants/'+grant.kind+'/'+encodeURIComponent(grant.code),body:{...input,digest:grant.digest,remove}} :
      {path:cleanup+'/archive',body:{...input,rows:targets,archived}});
    setReceiptId(operation?receiptId:key);setReceiptStatus(null);
    setOperation(next);setError('');setBusy(true);
    try {
      const {data}=await post<Receipt>(next.path,next.body);
      setReceipt(data.requestId);setReason('');
      await refresh();
    } catch(error) {setError(failure(error,label('writeControl.failed')));}
    finally {setBusy(false);}
  }

  const editable=!!inventory?.paused&&!busy&&!operation;
  const canWithdraw=editable&&!!inventory?.retired;
  return <>
    <button type="button" style={secondaryActionButton} onClick={()=>{setOpen(true);void refresh();}}>
      {label('cutover.cleanup')}</button>
    <RightDrawer open={open} title={label('cutover.cleanup')} onClose={()=>{if (!busy) setOpen(false);}}>
      <div className={s.stack} aria-busy={busy}>
        <p className={s.hint}>{label('cutover.cleanupHint')}</p>
        {inventory&&!inventory.paused&&<p role="status">{label('cutover.pauseFirst')}</p>}
        {error&&<p role="alert" className={s.error}>{error}</p>}
        {receipt&&<p role="status">{label('cutover.receipt')} <CopyId id={receipt}/></p>}
        <Field title={label('cutover.receipt')}>{attrs=><input {...attrs} style={inputField} maxLength={36}
          value={receiptId} disabled={busy} onChange={event=>setReceiptId(event.target.value)}/>}</Field>
        {receiptStatus&&<p role="status">{label('cutover.'+receiptStatus.kind)} · {new Date(receiptStatus.created_at).toLocaleString()}</p>}
        <button type="button" style={secondaryActionButton} disabled={busy||!receiptId.trim()} onClick={()=>void loadReceipt()}>
          {label('cutover.findReceipt')}</button>
        <div className={s.actions}>
          <button type="button" style={secondaryActionButton} disabled={busy} onClick={()=>void refresh()}>
            {label('writeControl.refresh')}</button>
          {operation&&<button type="button" style={secondaryActionButton} disabled={busy} onClick={()=>void apply('archive')}>
            {label('cutover.retryOperation')}</button>}
        </div>
        {inventory&&<>
          <Field title={label('cutover.archiveAction')}>{attrs=><select {...attrs} style={inputField} value={String(archived)}
            disabled={busy||!!operation} onChange={event=>{setArchived(event.target.value==='true');setSelection([]);setConfirmed(false);}}>
            <option value="true">{label('cutover.archive')}</option>
            <option value="false">{label('cutover.restore')}</option>
          </select>}</Field>
          <ul className={s.stack}>
            {inventory.rows.map(row=>{
              const selectable=archived?row.classification==='ELIGIBLE':row.archived;
              return <li key={row.id} className={s.record}>
                <label><input type="checkbox" checked={selection.includes(row.id)} disabled={!editable||!selectable}
                  onChange={event=>{setSelection(event.target.checked?[...selection,row.id]:selection.filter(id=>id!==row.id));setConfirmed(false);}}/>
                  {' '}{row.company_code} / {row.house_code} · <code>{row.id}</code></label>
                {' · '}<Badge value={row.state}/>{' · '}{label('cutover.'+row.classification)}
                {row.warehouse_code&&' · '+row.warehouse_code}
              </li>;
            })}
          </ul>
          {!inventory.retired&&<p role="status">{label('cutover.retireBeforeWithdrawal')}</p>}
          <Field title={label('cutover.grant')}>{attrs=><select {...attrs} style={inputField} value={grantId}
            disabled={!canWithdraw} onChange={event=>{setGrantId(event.target.value);setRemove([]);setConfirmed(false);}}>
            <option value="">{label('choose')}</option>
            {inventory.grants.map(row=><option key={grantKey(row)} value={grantKey(row)}>
              {label('cutover.'+row.kind)} · {row.code} · {row.perm_codes}
            </option>)}
          </select>}</Field>
          {grant&&<div className={s.stack}>
            <p>{label('organizationScope')} {grant.scope_value??'—'} · {label('cutover.explicitDenial')} {grant.deny_codes??'—'}</p>
            <p>{label('cutover.members')} {grant.members.length}</p>
            <div className={s.actions}>{(['V','E','A']).filter(action=>grant.perm_codes.split(',').map(code=>code.trim()).includes(action))
              .map(action=><label key={action}><input type="checkbox" checked={remove.includes(action)} disabled={!canWithdraw}
                onChange={event=>{setRemove(event.target.checked?[...remove,action]:remove.filter(code=>code!==action));setConfirmed(false);}}/> {action}</label>)}</div>
          </div>}
          <Field title={label('writeControl.reason')}>{attrs=><textarea {...attrs} style={inputField} maxLength={500} value={reason}
            disabled={!editable} onChange={event=>{setReason(event.target.value);setConfirmed(false);}}/>}</Field>
          <label><input type="checkbox" checked={confirmed} disabled={!editable||(!targets.length&&!remove.length)}
            onChange={event=>setConfirmed(event.target.checked)}/> {label('cutover.cleanupConfirm')}</label>
          <div className={s.actions}>
            <button type="button" style={primaryActionButton} disabled={!editable||!confirmed||!reason.trim()||!targets.length||targets.length>500}
              onClick={()=>void apply('archive')}>{label(archived?'cutover.archive':'cutover.restore')}</button>
            <button type="button" style={secondaryActionButton} disabled={!canWithdraw||!confirmed||!reason.trim()||!grant||!remove.length||!!targets.length}
              onClick={()=>void apply('grant')}>{label('cutover.withdraw')}</button>
          </div>
        </>}
      </div>
    </RightDrawer>
  </>;
}

export type Verification={id:string;house:string;expiresAt:string;digest:string;makerSigned:boolean;reviewerSigned:boolean;
  consumed:boolean;reason?:string;schedule?:{code:string;mode:string;variety:string|null;effective:string;expires:string|null}[];company?:string;site?:string;businessDay?:string;release?:string;step?:'MAKER'|'REVIEWER'|null};

function VerificationStatus({status}:{status:Verification}) {
  const {label,time}=useSourceText();
  return <Meta pairs={[
    [label('house'),status.house],
    [label('cutover.expires'),time(status.expiresAt)],
    [label('rolloutMaker'),label(status.makerSigned?'cutover.signed':'cutover.waiting')],
    [label('rolloutReviewer'),label(status.reviewerSigned?'cutover.signed':'cutover.waiting')],
  ]}/>;
}

export function EggSourceVerificationSetup({house,reason,onReady,disabled}:{house:string;reason:string;
  onReady:(id:string)=>void;disabled:boolean}) {
  const {label}=useSourceText();
  const [maker,setMaker]=useState('');
  const [reviewer,setReviewer]=useState('');
  const [active,setActive]=useState<Verification|null>(null);
  const [manualId,setManualId]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [pending,setPending]=useState<{requestId:string;house:string;maker:string;reviewer:string;reason:string}|null>(null);

  async function submit() {
    const body=pending??{requestId:crypto.randomUUID(),house,maker:maker.trim(),reviewer:reviewer.trim(),reason:reason.trim()};
    setBusy(true);setPending(body);setError('');onReady('');
    try {
      const {data}=await post<Verification>(verification,body);
      setActive(data);setManualId(data.id);setPending(null);
    } catch(error) {setError(failure(error,label('writeControl.failed')));}
    finally {setBusy(false);}
  }

  async function refresh() {
    setBusy(true);setError('');onReady('');
    try {
      const {data}=await request<{data:Verification}>(verification+'/'+encodeURIComponent(manualId.trim()),options);
      setActive(data);
      if (!data.consumed&&data.makerSigned&&data.reviewerSigned) onReady(data.id);
    } catch(error) {setError(failure(error,label('writeControl.failed')));setActive(null);}
    finally {setBusy(false);}
  }

  const editing=busy||disabled||!!pending;
  return <section className={s.stack} aria-busy={busy}>
    <h3>{label('cutover.verify')}</h3>
    <p className={s.hint}>{label('cutover.verifyHint')}</p>
    <div className={s.fields}>
      <Field title={label('rolloutMaker')}>{attrs=><input {...attrs} style={inputField} maxLength={64}
        value={maker} disabled={editing} onChange={event=>setMaker(event.target.value)}/>}</Field>
      <Field title={label('rolloutReviewer')}>{attrs=><input {...attrs} style={inputField} maxLength={64}
        value={reviewer} disabled={editing} onChange={event=>setReviewer(event.target.value)}/>}</Field>
    </div>
    <button type="button" style={secondaryActionButton}
      disabled={busy||disabled||(!pending&&(!house||!reason.trim()||!maker.trim()||!reviewer.trim()||maker.trim()===reviewer.trim()))}
      onClick={()=>void submit()}>{label(pending?'cutover.retryOperation':'cutover.createVerification')}</button>
    {pending&&<button type="button" style={secondaryActionButton} disabled={busy} onClick={()=>setPending(null)}>
      {label('writeControl.refresh')}</button>}
    <Field title={label('cutover.verificationId')}>{attrs=><input {...attrs} style={inputField} disabled={busy}
      value={manualId} maxLength={36} onChange={event=>{onReady('');setManualId(event.target.value);}}/>}</Field>
    <button type="button" style={secondaryActionButton} disabled={busy||!manualId.trim()} onClick={()=>void refresh()}>
      {label('cutover.checkSignatures')}</button>
    {error&&<p role="alert" className={s.error}>{error}</p>}
    {active&&<div className={s.record}>
      <VerificationStatus status={active}/>
      <p>{label('cutover.shareLink')} <CopyId id={window.location.origin+'/master-data/egg-sources/verification?id='+active.id}/></p>
    </div>}
  </section>;
}

export function EggSourceVerificationPage() {
  const {label}=useSourceText();
  const id=useSearchParams().get('id')??'';
  const path='/product-master/egg-sources/retirement-verification/'+encodeURIComponent(id);
  const [status,setStatus]=useState<Verification|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [requestId,setRequestId]=useState('');
  const errorText=label('writeControl.failed');
  const read=useCallback(async (signal?:AbortSignal)=>{
    setBusy(true);setError('');
    try {
      if (!id) throw new Error(errorText);
      const {data}=await request<{data:Verification}>(path,{...options,signal});
      if (!signal?.aborted) setStatus(data);
    } catch(error) {if (!signal?.aborted) setError(failure(error,errorText));}
    finally {if (!signal?.aborted) setBusy(false);}
  },[errorText,id,path]);
  useEffect(()=>{
    const controller=new AbortController();
    queueMicrotask(()=>{if (!controller.signal.aborted) void read(controller.signal);});
    return ()=>controller.abort();
  },[read]);

  async function sign() {
    if (!status) return;
    const key=requestId||crypto.randomUUID();
    setRequestId(key);setBusy(true);setError('');
    try {
      const {data}=await post<Verification>(path,{requestId:key,digest:status.digest,confirmed});
      setStatus({...status,...data});setConfirmed(false);
    } catch(error) {setError(failure(error,errorText));}
    finally {setBusy(false);}
  }

  const signed=status?.step==='MAKER' ? status.makerSigned : status?.reviewerSigned;
  return <main className={s.stack} aria-busy={busy}>
    <h1>{label('cutover.verify')}</h1>
    <p>{label('cutover.participantHint')}</p>
    {error&&<p role="alert" className={s.error}>{error}</p>}
    <div className={s.actions}>
      <button type="button" style={secondaryActionButton} disabled={busy} onClick={()=>void read()}>
        {label('writeControl.refresh')}</button>
    </div>
    {status&&<>
      <VerificationStatus status={status}/>
      <Meta pairs={[
        [label('company'),status.company],[label('site'),status.site],[label('businessDay'),status.businessDay],
        [label('cutover.release'),status.release],[label('writeControl.reason'),status.reason],
        [label('cutover.yourStep'),label(status.step==='MAKER'?'rolloutMaker':'rolloutReviewer')],
      ]}/>
      {!!status.schedule?.length&&<section>
        <h2>{label('cutover.schedule')}</h2>
        <ul>{status.schedule.map(row=><li key={row.code}>
          {row.variety??label('standard')} · {row.effective} → {row.expires??'—'} · <code>{row.code}</code>
        </li>)}</ul>
      </section>}
      {signed&&<p role="status">{label('cutover.signed')}</p>}
      {!status.consumed&&!signed&&<>
        <label><input type="checkbox" checked={confirmed} disabled={busy}
          onChange={event=>setConfirmed(event.target.checked)}/> {label('cutover.signConfirm')}</label>
        <div className={s.actions}><button type="button" style={primaryActionButton} disabled={busy||!confirmed}
          onClick={()=>void sign()}>{label('cutover.sign')}</button></div>
      </>}
    </>}
  </main>;
}
