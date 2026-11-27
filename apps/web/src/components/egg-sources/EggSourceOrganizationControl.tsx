'use client';

import { type ReactNode,useCallback,useEffect,useState } from 'react';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { inputField,primaryActionButton,secondaryActionButton } from '@/components/design-system/cockpit-styles';
import { usePermission } from '@/hooks/usePermission';
import request from '@/lib/api-client';
import { Field,useSourceText } from './parts';
import { EggSourceVerificationSetup, type Verification } from './EggSourceCutover';
import { useSourceOperation } from './useSourceOperation';
import s from './EggSources.module.css';

const endpoint='/sys/menu-registry';
const scopes=['HOUSE','FARM','SITE','COMPANY'] as const;
const actions=['V','C','E','D','A','X'] as const;
type Scope=typeof scopes[number];
type Action=typeof actions[number];
type Grant={scope_type:Scope;scope_code:string;actions:Action[]};
type StandardGrant={actions:Action[];revision:string};
type GrantPreview={digest:string;accounts:number;houses:number;
  changes:Array<{username:string;companyCode:string;houseCode:string;before:Action[];after:Action[]}>};
type SourceGrants={
  rows:Grant[];digest:string;standardDigest:string;actions:Action[];standard:StandardGrant|null;
  inherited?:Array<{scope_type:Scope|'OWNER';scope_code:string|null;actions:Action[];set_code:string}>;
};
type Organization={code:string;name:string;companyCode:string};
type Rollout={house_code:string;company_code:string;enabled:boolean;changed_at:string;revision:string;change_reason:string};

function ScopePicker({scope,value,onScope,onPick,disabled}:{
  scope:Scope;value:string;onScope?:(scope:Scope)=>void;onPick:(value:string,organization?:Organization)=>void;disabled:boolean
}) {
  const {label}=useSourceText();
  const [search,setSearch]=useState('');
  const [options,setOptions]=useState<Organization[]>([]);
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  async function load() {
    setBusy(true);setFailed(false);
    try {
      const query=new URLSearchParams({scope,search:search.trim()});
      const result=await request<{data:Organization[]}>(endpoint+'/egg-source-organizations?'+query,
        {silent:true,bindSession:true,cache:'no-store'});
      setOptions(result.data);
    } catch {setOptions([]);setFailed(true);}
    finally {setBusy(false);}
  }
  return <div className={s.stack}>
    {onScope&&<Field title={label('organizationScope')}>{attrs=><select {...attrs} style={inputField} value={scope}
      disabled={disabled||busy} onChange={event=>{onScope(event.target.value as Scope);setOptions([]);onPick('');}}>
      {scopes.map(type=><option key={type} value={type}>{label('organization.'+type)}</option>)}
    </select>}</Field>}
    <div className={s.fields}>
      <Field title={label('organizationSearch')}>{attrs=><input {...attrs} style={inputField} value={search} maxLength={100}
        disabled={disabled||busy} onChange={event=>setSearch(event.target.value)}/>}</Field>
      <div className={s.actions}><button type="button" style={secondaryActionButton} disabled={disabled||busy}
        onClick={()=>void load()}>{label('organizationFind')}</button></div>
    </div>
    {failed&&<p role="alert" className={s.error}>{label('writeControl.failed')}</p>}
    <Field title={label('organization.'+scope)}>{attrs=><select {...attrs} style={inputField} value={value}
      disabled={disabled||busy} onChange={event=>onPick(event.target.value,options.find(row=>row.code===event.target.value))}>
      <option value="">{label('organizationChoose')}</option>
      {value&&!options.some(row=>row.code===value)&&<option value={value}>{value}</option>}
      {options.map(row=><option key={row.code} value={row.code}>{row.name} ({row.code}) · {row.companyCode}</option>)}
    </select>}</Field>
  </div>;
}

export function LegacySourceGrantSummary({actions,warehouse}:{actions:Set<string>;warehouse:string}) {
  const {label}=useSourceText();
  return <div className={s.stack}>
    <p className={s.hint}>{label('legacyGrantReadOnly')}</p>
    <div className={s.sourceGrantActions}>{(['V','E','A'] as const).map(action=><span key={action}
      data-action={action} data-configured={actions.has(action)} className={s.sourceGrantAction}
      title={label('organizationAction.'+action)}>{action}{actions.has(action)?' ✓':''}</span>)}</div>
    {warehouse&&<p className={s.hint}>{label('legacyGrantWarehouse')} · {warehouse}</p>}
  </div>;
}

export function EggSourceOrganizationGrants({subject,code,name,legacy,onSaved}:{
  subject:'role'|'set';code?:string;name:string;legacy?:ReactNode;onSaved?:(configured:boolean)=>void;
}) {
  const {role,roles,user}=usePermission();
  const editable=(role==='ROLE_ADMIN'||roles.includes('ROLE_ADMIN')) && !user.impersonatedBy
    && !!code && !(subject==='role'&&code==='ROLE_ADMIN');
  const path=editable ? endpoint+'/egg-source-organization-grants/'+subject+'/'+encodeURIComponent(code!) : undefined;
  const standardPath=path?.replace('egg-source-organization-grants','egg-source-standard-grants');
  return <GrantRow key={subject+'/'+code} name={name} path={path} standardPath={standardPath}
    legacy={editable ? legacy : undefined} onSaved={onSaved}/>;
}

function GrantRow({path,standardPath,name,legacy,onSaved}:{
  path?:string;standardPath?:string;name:string;legacy?:ReactNode;onSaved?:(configured:boolean)=>void;
}) {
  const {label}=useSourceText();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const [saved,setSaved]=useState(false);
  const [data,setData]=useState<SourceGrants|null>(null);
  const [draft,setDraft]=useState<Action[]>([]);
  const [preview,setPreview]=useState<GrantPreview|null>(null);
  const [reason,setReason]=useState('');

  const fetchGrant=useCallback(async (signal?:AbortSignal)=>{
    if (!path) return;
    try {
      const result=await request<{data:SourceGrants}>(path,{silent:true,bindSession:true,cache:'no-store',signal});
      if (signal?.aborted) return;
      if (!Array.isArray(result.data.actions)||typeof result.data.standardDigest!=='string') {
        setFailed(true);
        return;
      }
      setData(result.data);setDraft(result.data.standard?.actions??result.data.actions);setReason('');
    } catch {if (!signal?.aborted) setFailed(true);}
    finally {if (!signal?.aborted) setBusy(false);}
  },[path]);
  useEffect(()=>{
    const controller=new AbortController();
    queueMicrotask(()=>{ if (!controller.signal.aborted) void fetchGrant(controller.signal); });
    return ()=>controller.abort();
  },[fetchGrant]);

  function reloadGrant() {
    setBusy(true);setFailed(false);setSaved(false);setPreview(null);
    void fetchGrant();
  }

  const current=data?.standard?.actions??data?.actions??[];
  const keepLimits=!!data?.rows.length;
  const converting=keepLimits&&!data?.standard;
  const changed=draft.length!==current.length||draft.some(action=>!current.includes(action));
  async function previewChange() {
    if (!standardPath||!data||(!changed&&data.standard)) return;
    setBusy(true);setFailed(false);setPreview(null);
    try {
      const result=await request<{data:GrantPreview}>(standardPath+'/preview',{
        method:'POST',body:JSON.stringify({actions:draft,expectedDigest:data.standardDigest}),silent:true,bindSession:true,retry:false});
      setPreview(result.data);
    } catch {setFailed(true);}
    finally {setBusy(false);}
  }

  async function save() {
    if (!data||!standardPath||!preview||!reason.trim()||(!changed&&data.standard)) return;
    setBusy(true);setFailed(false);setSaved(false);
    try {
      const {data:result}=await request<{data:{standard:StandardGrant;digest:string}}>(standardPath,{
        method:'PUT',body:JSON.stringify({actions:draft,expectedDigest:preview.digest,reason:reason.trim()}),
        silent:true,bindSession:true,retry:false});
      setData({...data,standard:result.standard,standardDigest:result.digest});
      setDraft(result.standard.actions);setPreview(null);setReason('');setSaved(true);
      onSaved?.(result.standard.actions.length>0);
    } catch {setFailed(true);}
    finally {setBusy(false);}
  }

  function toggle(action:Action) {
    setOpen(true);setSaved(false);setPreview(null);
    if (converting) return;
    setDraft(previous=>previous.includes(action)?previous.filter(value=>value!==action):[...previous,action]);
  }

  function closeSettings() {
    setDraft(current);setPreview(null);setReason('');setSaved(false);setOpen(false);
  }

  return <div className={s.sourceGrantRow}>
    <div className={s.sourceGrantToolbar}>
      <strong>{name}</strong>
      <div className={s.sourceGrantActions}>
        {actions.map(action=><button key={action} type="button" data-action={action}
          className={s.sourceGrantAction} disabled={!data||busy||failed||action==='D'||action==='X'}
          title={label(converting?'standardGrantEquivalent':'organizationAction.'+action)} aria-label={label('organizationAction.'+action)}
          aria-pressed={draft.includes(action)}
          data-configured={draft.includes(action)}
          data-inherited={!!data?.inherited?.some(row=>row.actions.includes(action))}
          onClick={()=>toggle(action)}>{action}</button>)}
        {path&&<button type="button" className={s.sourceGrantScope} aria-expanded={open}
          onClick={()=>open?closeSettings():setOpen(true)} disabled={busy}>{label('standardGrantSettings')}</button>}
      </div>
    </div>
    {open&&path&&<div className={s.stack} aria-busy={busy}>
      <p className={s.hint}>{label('standardGrantHelp')} {label('standardGrantIndependentSave')}</p>
      {failed&&<><p role="alert" className={s.error}>{label('writeControl.failed')}</p>
        <button type="button" style={secondaryActionButton} onClick={reloadGrant}>{label('writeControl.refresh')}</button></>}
      {saved&&<p role="status" className={s.notice}>{label('organizationGrantSaved')}</p>}
      {!!data?.inherited?.length&&<div className={s.record}>
        <strong>{label('inheritedGrants')}</strong>
        <ul>{data.inherited.map((row,index)=><li key={row.set_code+'/'+row.scope_code+'/'+index}>
          {row.set_code} · {row.scope_type==='OWNER'?label('standardGrantAccountScope'):label('organization.'+row.scope_type)+' '+row.scope_code} · {row.actions.join(' / ')}
        </li>)}</ul>
      </div>}
      {keepLimits&&<div className={s.record}>
        <strong>{label('standardGrantRetained')}</strong>
        <ul>{data?.rows.map(row=>{
          const forScope=(values:Action[])=>values.filter(action=>row.actions.includes(action)||
            !data.rows.some(old=>old.actions.includes(action)));
          return <li key={row.scope_type+'/'+row.scope_code}>
            {label('organization.'+row.scope_type)} · {row.scope_code} · {label('standardGrantCurrent')} {forScope(current).join(' / ')||'—'}
            {' → '}{label('standardGrantNext')} {forScope(draft).join(' / ')||'—'}
          </li>;
        })}</ul>
      </div>}
      {data&&!failed&&<>
        <p>{label('standardGrantCurrent')} {current.join(' / ')||'—'} · {label('standardGrantNext')} {draft.join(' / ')||'—'}</p>
        {converting&&<p className={s.hint}>{label('standardGrantEquivalent')}</p>}
        <button type="button" style={secondaryActionButton} disabled={busy||(!changed&&!!data.standard)}
          onClick={()=>void previewChange()}>{label('standardGrantPreview')}</button>
        {preview&&<div className={s.record} role="status">
          <p>{label('standardGrantImpact')} {preview.accounts} / {preview.houses}</p>
          {preview.changes.length===0 ? <p>{label('standardGrantNoChange')}</p> : <ul>{preview.changes.map(row=>
            <li key={row.username+'/'+row.companyCode+'/'+row.houseCode}>
              {row.username} · {row.companyCode} / {row.houseCode} · {row.before.join('/')||'—'} → {row.after.join('/')||'—'}
            </li>)}</ul>}
        </div>}
        <Field title={label('writeControl.reason')}>{attrs=><textarea {...attrs} style={inputField} maxLength={500}
          value={reason} onChange={event=>setReason(event.target.value)} disabled={busy}/>}</Field>
        <button type="button" style={primaryActionButton} disabled={busy||!preview||!reason.trim()||(!changed&&!!data.standard)}
          onClick={()=>void save()}>{label(converting?'standardGrantConvert':'standardGrantSave')}</button>
      </>}
    </div>}
    {legacy&&<details className={s.legacyGrant}><summary>{label('legacyPermission')}</summary><p className={s.hint}>{label('legacyPermissionHelp')}</p>{legacy}</details>}
  </div>;
}


type RetirementHouse={house_code:string; house_name:string; company_code:string|null; site_code:string|null; enabled:boolean|null; revision:string|null};
type Pilot={changeId:string; approvalId:string; companyCode:string; houseCode:string};
type RetirementState={
  enabled:boolean; available:boolean; verificationAvailable:boolean; roster:RetirementHouse[];
  pendingHouses:RetirementHouse[]; checklistDigest:string; pilot:Pilot|null;
};
type RetirementCommand={
  requestId:string; method:'PILOT'|'VERIFICATION'; confirmed:true; reason:string; checklistDigest:string;
  companyCode:string; houseCode:string; changeId?:string; approvalId?:string;
  verificationId?:string; verificationDigest?:string; signedReason?:string;
};
type RetirementReceipt={requestId:string; status:'RECORDED'|'CANCELLED'; companyCode?:string; houseCode?:string};

export function EggSourceLegacyCreationGate() {
  const {label}=useSourceText();
  const [open,setOpen]=useState(false);
  const [state,setState]=useState<RetirementState|null>(null);
  const [working,setWorking]=useState(false);
  const [failed,setFailed]=useState(false);
  const [reason,setReason]=useState('');
  const [signedReason,setSignedReason]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [method,setMethod]=useState<''|'PILOT'|'VERIFICATION'>('');
  const [house,setHouse]=useState<Organization>();
  const [verification,setVerification]=useState<Verification|null>(null);
  const [receipt,setReceipt]=useState<RetirementReceipt>();
  const [pauseHouse,setPauseHouse]=useState<RetirementHouse>();
  const [pauseReason,setPauseReason]=useState('');
  const retire=useSourceOperation<RetirementCommand,RetirementReceipt>('retire',['RETIRE','RETIRE_PILOT']);
  const pause=useSourceOperation<RolloutCommand,RolloutReceipt>('retire-pause','HOUSE_ROLLOUT');
  const path=endpoint+'/egg-source-legacy-creation';
  const busy=working||retire.busy||pause.busy;

  function resetEvidence() {
    setVerification(null);setConfirmed(false);
  }
  async function read() {
    setWorking(true);setFailed(false);resetEvidence();
    try {setState((await request<{data:RetirementState}>(path,adminRead)).data);}
    catch {setState(null);setFailed(true);}
    finally {setWorking(false);}
  }
  async function acceptRetirement(result?:RetirementReceipt) {
    if (!result) return;
    setReceipt(result);setReason('');setMethod('');setSignedReason('');setHouse(undefined);
    await read();
  }
  async function acceptPause(result?:RolloutReceipt) {
    if (!result) return;
    setPauseHouse(undefined);setPauseReason('');
    await read();
  }
  useEffect(()=>{
    if (!verification) return;
    const timeout=setTimeout(()=>{
      setVerification(null);setConfirmed(false);
    },Math.max(0,Date.parse(verification.expiresAt)-Date.now()));
    return ()=>clearTimeout(timeout);
  },[verification]);
  const validVerification=verification?.house===house?.code && verification?.company===house?.companyCode &&
    verification?.reason===signedReason.trim() ? verification : null;
  const evidence=method==='PILOT' ? state?.pilot : method==='VERIFICATION' && house && validVerification ?
    {companyCode:house.companyCode,houseCode:house.code,verificationId:validVerification.id,
      verificationDigest:validVerification.digest,signedReason:signedReason.trim()} : null;
  const ready=!!state?.enabled&&state.available&&!state.pendingHouses.length&&!!method&&!!evidence&&
    !!reason.trim()&&confirmed&&!busy&&!retire.pending&&!pause.pending;
  async function submit() {
    if (!ready||!state||!method||!evidence) return;
    setConfirmed(false);
    await acceptRetirement(await retire.start(path,'POST',{
      requestId:crypto.randomUUID(),method,confirmed:true,reason:reason.trim(),checklistDigest:state.checklistDigest,...evidence,
    }));
  }
  async function submitPause() {
    if (busy||pause.pending||retire.pending||!pauseHouse?.company_code||!pauseReason.trim()) return;
    await acceptPause(await pause.start(rolloutUrl(pauseHouse.house_code),'PUT',{
      requestId:crypto.randomUUID(),companyCode:pauseHouse.company_code,enabled:false,
      expectedEnabled:pauseHouse.enabled,expectedRevision:pauseHouse.revision,reason:pauseReason.trim(),
    }));
  }
  return <>
    <button type="button" style={secondaryActionButton} onClick={()=>{setOpen(true);retire.restore();pause.restore();void read();}}>{label('legacyGate')}</button>
    <RightDrawer open={open} title={label('legacyGate')} onClose={()=>{if (!busy) {setOpen(false);resetEvidence();}}}>
      <div className={s.stack} aria-busy={busy}>
        {failed&&<p role="alert" className={s.error}>{label('writeControl.failed')}</p>}
        {(failed||retire.error||pause.error)&&<button type="button" style={secondaryActionButton} disabled={busy}
          onClick={()=>void read()}>{label('writeControl.refresh')}</button>}
        {[retire.error,pause.error].flatMap((error,index)=>error ?
          [<p role="alert" className={s.error} key={index}>{error.businessCode ? label('problem.'+error.businessCode) : error.message}</p>] : [])}
        {retire.pending&&<div className={s.record} role="status">
          <p>{label('operationPending')} · <code>{retire.pending.id}</code></p>
          <div className={s.actions}>
            <button type="button" style={secondaryActionButton} disabled={busy} onClick={async()=>acceptRetirement(await retire.lookup())}>{label('operationLookup')}</button>
            {retire.pending.body&&<button type="button" style={secondaryActionButton} disabled={busy}
              onClick={async()=>acceptRetirement(await retire.retry())}>{label('cutover.retryOperation')}</button>}
            <button type="button" style={secondaryActionButton} disabled={busy} onClick={async()=>acceptRetirement(await retire.cancel())}>{label('operationCancel')}</button>
          </div>
        </div>}
        {pause.pending&&<div className={s.record} role="status">
          <p>{label('operationPending')} · <code>{pause.pending.id}</code></p>
          <div className={s.actions}>
            <button type="button" style={secondaryActionButton} disabled={busy} onClick={async()=>acceptPause(await pause.lookup())}>{label('operationLookup')}</button>
            {pause.pending.body&&<button type="button" style={secondaryActionButton} disabled={busy}
              onClick={async()=>acceptPause(await pause.retry())}>{label('cutover.retryOperation')}</button>}
            <button type="button" style={secondaryActionButton} disabled={busy} onClick={async()=>acceptPause(await pause.cancel())}>{label('operationCancel')}</button>
          </div>
        </div>}
        {receipt&&<p className={s.notice} role="status">{label(receipt.status==='CANCELLED'?'operationCancelled':'legacyGateRetired')}
          {receipt.companyCode&&' · '+receipt.companyCode+' · '+receipt.houseCode} · <code>{receipt.requestId}</code></p>}
        {state&&<p role="status">{label(state.enabled?'legacyGateOpen':'legacyGateRetired')}</p>}
        {state?.enabled&&!retire.pending&&!pause.pending&&<>
          {!state.available&&<p>{label('legacyGateNeedsWrite')}</p>}
          {!state.pilot&&!state.verificationAvailable&&<p>{label('legacyGateNeedsPilot')}</p>}
          <details className={s.record} open={!!state.pendingHouses.length}>
            <summary>{label('retirementRoster')} · {state.roster.length}</summary>
            <ul>{state.roster.map(row=><li key={row.company_code+'/'+row.house_code}>
              {row.house_name} ({row.house_code}) · {row.company_code||'—'} · {label(row.enabled===null?'rollout.UNREGISTERED':row.enabled?'rollout.OPEN':'rollout.PAUSED')}
              {!row.company_code ? <p>{label('retirementCompanyMissing')}</p> : !row.site_code&&<p>{label('retirementSiteMissing')}</p>}
              {row.company_code&&state.pendingHouses.some(house=>house.house_code===row.house_code&&house.company_code===row.company_code)&&<button type="button" style={secondaryActionButton} disabled={busy}
                onClick={()=>{setPauseHouse(row);setPauseReason('');resetEvidence();}}>{label('recordHousePause')}</button>}
            </li>)}</ul>
          </details>
          {pauseHouse&&<section className={s.record}>
            <strong>{label('recordHousePause')} · {pauseHouse.company_code} · {pauseHouse.house_code}</strong>
            <Field title={label('writeControl.reason')}>{attrs=><textarea {...attrs} style={inputField} maxLength={500}
              value={pauseReason} disabled={busy} onChange={event=>setPauseReason(event.target.value)}/>}</Field>
            <div className={s.actions}>
              <button type="button" style={primaryActionButton} disabled={busy||!pauseReason.trim()} onClick={()=>void submitPause()}>{label('houseRolloutPause')}</button>
              <button type="button" style={secondaryActionButton} disabled={busy} onClick={()=>setPauseHouse(undefined)}>{label('closeDialog')}</button>
            </div>
          </section>}
          {!state.pendingHouses.length&&state.available&&<>
            <Field title={label('retirementMethod')}>{attrs=><select {...attrs} style={inputField} value={method} disabled={busy}
              onChange={event=>{setMethod(event.target.value as typeof method);resetEvidence();}}>
              <option value="">{label('rolloutSelectAction')}</option>
              {state.pilot&&<option value="PILOT">{label('retirementPilot')}</option>}
              {state.verificationAvailable&&<option value="VERIFICATION">{label('cutover.verify')}</option>}
            </select>}</Field>
            {method==='PILOT'&&state.pilot&&<p className={s.record}>{state.pilot.companyCode} · {state.pilot.houseCode} · <code>{state.pilot.changeId}</code></p>}
            {method==='VERIFICATION'&&<>
              <ScopePicker scope="HOUSE" value={house?.code??''} onPick={(_,row)=>{setHouse(row);resetEvidence();}} disabled={busy}/>
              <Field title={label('retirementSignedReason')}>{attrs=><textarea {...attrs} style={inputField} maxLength={500}
                value={signedReason} disabled={busy} onChange={event=>{setSignedReason(event.target.value);resetEvidence();}}/>}</Field>
              {house&&signedReason.trim()&&<EggSourceVerificationSetup key={house.companyCode+'/'+house.code+'/'+signedReason.trim()}
                house={house.code} reason={signedReason} onReady={value=>{setVerification(value);setConfirmed(false);}} disabled={busy}/>}
            </>}
            {method&&<>
              <Field title={label('retirementAdminReason')}>{attrs=><textarea {...attrs} style={inputField} maxLength={500}
                value={reason} onChange={event=>{setReason(event.target.value);setConfirmed(false);}} disabled={busy}/>}</Field>
              <label><input type="checkbox" checked={confirmed} disabled={busy||!evidence}
                onChange={event=>setConfirmed(event.target.checked)}/> {label('legacyGateConfirm')}</label>
              <div className={s.actions}>
                <button type="button" style={primaryActionButton} disabled={!ready} onClick={()=>void submit()}>{label('legacyGateRetire')}</button>
              </div>
            </>}
          </>}
        </>}
      </div>
    </RightDrawer>
  </>;
}

type HouseGrantResult = {
  actions:string[];
  eligibleAccount?:boolean;
  diagnostics?:string[];
  denials?:string[];
  current?:{version:1|2;rollout:'OPEN'|'PAUSED'|'UNREGISTERED';globalWrites:boolean;houseWrites:boolean;
    legacyCreation:boolean;legacyClosed:boolean;createReason:string|null;businessDay:string|null};
  legacy?:{view:boolean;warehouses:{code:string;name:string;actions:string[]}[]};
  origins?:{action:string;source:{subject:'role'|'set';code:string;scopeType:string;scopeCode:string|null}}[];
};

function inspectHouseAccount(house:string,username:string) {
  return request<{data:HouseGrantResult}>(endpoint+'/egg-source-house-access?'+
    new URLSearchParams({house,username:username.trim()}),{silent:true,bindSession:true,cache:'no-store'});
}

function AccountAccess({result}:{result:HouseGrantResult}) {
  const {label}=useSourceText();
  const {current,legacy}=result;
  return <>
    {result.diagnostics?.map(code=><p role="status" key={code}>{label('cutover.'+code)}{code==='EXPLICIT_DENIAL'&&result.denials?.length?' '+result.denials.join(' / '):''}</p>)}
    {result.eligibleAccount===false&&<p>{label('problem.HOUSE_ROLES_NOT_READY')}</p>}
    {current&&<>
      <p>{label(current.version===1?'creationV1':'creationV2')} · {label('rollout.'+current.rollout)}
        {current.businessDay&&' · '+current.businessDay}</p>
      <p>{label('globalWriteControl')} · {label(current.globalWrites?'writeControl.enabled':'writeControl.paused')}
        {' / '}{label('houseWriteControl')} · {label(current.houseWrites?'writeControl.enabled':'writeControl.paused')}
        {' / '}{label(current.legacyClosed?'legacyGateRetired':current.legacyCreation?'legacyGateOpen':'legacyGateNeedsWrite')}</p>
      <p>{current.createReason ? label('problem.'+current.createReason) : label('diagnosticCreateReady')}</p>
    </>}
    <p>{label('diagnosticActionsV2')} · {result.actions.join(' / ')||'—'}</p>
    {!!result.origins?.length&&<ul>{result.origins.map(({action,source})=><li
      key={[action,source.subject,source.code,source.scopeType,source.scopeCode].join('/')}>
      {action} · {label(source.subject==='role'?'standardGrantRole':'standardGrantSet')} {source.code} · {
        source.scopeType==='OWNER'?label('standardGrantAccountScope'):label('organization.'+source.scopeType)+' '+source.scopeCode}
    </li>)}</ul>}
    {legacy&&<>
      <p>{label('diagnosticActionsV1')} · {legacy.view?'V':'—'} · {label('diagnosticLegacyWarehouses')}</p>
      {legacy.warehouses.length ? <ul>{legacy.warehouses.map(row=><li key={row.code}>
        {row.name} ({row.code}) · {row.actions.join(' / ')}
      </li>)}</ul> : <p>—</p>}
    </>}
  </>;
}


type RolloutReadiness = {
  owner: { companyCode: string; houseCode: string };
  current: Rollout | null;
  businessDay: string | null;
  ready: boolean;
  blockers: string[];
  digest: string;
  maker: HouseGrantResult & { username: string; required: string[]; missing: string[] };
  reviewer: HouseGrantResult & { username: string; required: string[]; missing: string[] };
};
type RolloutCommand = {
  requestId: string;
  companyCode: string;
  enabled: boolean;
  expectedEnabled: boolean | null;
  expectedRevision: string | null;
  reason: string;
  maker?: string;
  reviewer?: string;
  readinessDigest?: string;
};
type RolloutReceipt = { requestId: string; status: 'RECORDED' | 'CANCELLED'; rollout: Rollout | null };

const adminRead = {silent:true,bindSession:true,cache:'no-store'} as const;
const rolloutPath = endpoint+'/egg-source-house-rollouts';
const rolloutUrl = (house:string) => rolloutPath+'/'+encodeURIComponent(house);

function RolloutReceiptView({receipt,current}:{receipt:RolloutReceipt;current?:Rollout}) {
  const {label,time}=useSourceText();
  return <div role="status" className={s.notice}>
    <p>{label(receipt.status==='RECORDED'?'rolloutRecorded':'operationCancelled')} · <code>{receipt.requestId}</code></p>
    {receipt.rollout&&<p>{receipt.rollout.company_code} · {receipt.rollout.house_code} · {time(receipt.rollout.changed_at)} · {receipt.rollout.change_reason}</p>}
    {current&&receipt.rollout?.revision!==current.revision&&
      <p>{label('rolloutDifferent')} · {label(current.enabled?'rollout.OPEN':'rollout.PAUSED')} · {time(current.changed_at)}</p>}
  </div>;
}

export function EggSourceHouseRollout() {
  const {label,time}=useSourceText();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [house,setHouse]=useState('');
  const [company,setCompany]=useState('');
  const [rows,setRows]=useState<Rollout[]>([]);
  const [reason,setReason]=useState('');
  const [maker,setMaker]=useState('');
  const [reviewer,setReviewer]=useState('');
  const [effective,setEffective]=useState<RolloutReadiness>();
  const [target,setTarget]=useState<''|'enable'|'pause'>('');
  const [confirmation,setConfirmation]=useState<RolloutCommand>();
  const [diagnosticUser,setDiagnosticUser]=useState('');
  const [diagnostic,setDiagnostic]=useState<HouseGrantResult>();
  const [receipt,setReceipt]=useState<RolloutReceipt>();
  const operation=useSourceOperation<RolloutCommand,RolloutReceipt>('rollout','HOUSE_ROLLOUT');
  const working=busy||operation.busy;
  const prior=rows.find(row=>row.house_code===house&&row.company_code===company);
  const currentReceiptHouse=receipt?.rollout;
  const currentAfterWrite=rows.find(row=>row.house_code===currentReceiptHouse?.house_code&&row.company_code===currentReceiptHouse?.company_code);
  const enable=target==='enable';
  const chosen=target!=='' && (prior?.enabled??null)!==enable;
  const action=label(enable ? prior ? 'houseRolloutRestore' : 'houseRolloutResume' : 'houseRolloutPause');
  const canConfirm=loaded&&!working&&!operation.pending&&!!house&&!!company&&chosen&&!!reason.trim()&&(!enable||!!effective?.ready);

  function resetFields() {
    setReason('');setMaker('');setReviewer('');setEffective(undefined);setTarget('');setConfirmation(undefined);
    setDiagnosticUser('');setDiagnostic(undefined);setFailed(false);
  }
  async function load(expected?:RolloutCommand) {
    setBusy(true);setFailed(false);setLoaded(false);setConfirmation(undefined);setEffective(undefined);setDiagnostic(undefined);
    try {
      const {data}=await request<{data:Rollout[]}>(rolloutPath,adminRead);
      setRows(data);setLoaded(true);
      if (expected) {
        const current=data.find(row=>row.house_code===house&&row.company_code===expected.companyCode);
        if (current?.enabled===expected.enabled || (current?.revision??null)!==expected.expectedRevision) {
          setTarget('');setReason('');
        }
      }
    } catch {setFailed(true);}
    finally {setBusy(false);}
  }
  async function checkAccounts() {
    if (!house||!maker.trim()||!reviewer.trim()) return;
    setBusy(true);setFailed(false);setEffective(undefined);setConfirmation(undefined);
    try {
      const {data}=await request<{data:RolloutReadiness}>(endpoint+'/egg-source-house-rollout-readiness?'+
        new URLSearchParams({house,maker:maker.trim(),reviewer:reviewer.trim()}),adminRead);
      if (data.owner.companyCode!==company) {setFailed(true);return;}
      setEffective(data);
      if (data.current) setRows(old=>[...old.filter(row=>row.house_code!==house||row.company_code!==company),data.current!]);
    } catch {setFailed(true);}
    finally {setBusy(false);}
  }
  async function checkDiagnostic() {
    if (!house||!diagnosticUser.trim()) return;
    setBusy(true);setFailed(false);setDiagnostic(undefined);
    try {setDiagnostic((await inspectHouseAccount(house,diagnosticUser)).data);}
    catch {setFailed(true);}
    finally {setBusy(false);}
  }
  function confirm() {
    if (!canConfirm) return;
    setConfirmation({ requestId:crypto.randomUUID(),companyCode:company,enabled:enable,
      expectedEnabled:prior?.enabled??null,expectedRevision:prior?.revision??null,reason:reason.trim(),
      ...(enable&&effective ? {maker:maker.trim(),reviewer:reviewer.trim(),readinessDigest:effective.digest} : {}),
    });
  }
  async function accept(result?:RolloutReceipt) {
    if (!result) return;
    setReceipt(result);resetFields();
    await load();
  }
  async function save() {
    if (!canConfirm||!confirmation) return;
    const command=confirmation;
    setConfirmation(undefined);setReceipt(undefined);
    const result=await operation.start(rolloutUrl(house),'PUT',command);
    if (result) await accept(result);
    else await load(command);
  }
  const errorCode=operation.error?.businessCode;
  return <>
    <button type="button" style={secondaryActionButton} onClick={()=>{setOpen(true);operation.restore();void load();}}>{label('houseRollout')}</button>
    <RightDrawer open={open} title={label('houseRollout')} onClose={()=>{if (!working) {resetFields();setHouse('');setCompany('');setOpen(false);}}}>
      <div className={s.stack} aria-busy={working}>
        <p className={s.hint}>{label('houseRolloutHelp')}</p>
        {operation.pending&&<div className={s.record} role="status">
          <p>{label('operationPending')} · <code>{operation.pending.id}</code></p>
          <div className={s.actions}>
            <button type="button" style={secondaryActionButton} disabled={working} onClick={async()=>accept(await operation.lookup())}>{label('operationLookup')}</button>
            {operation.pending.body&&<button type="button" style={secondaryActionButton} disabled={working}
              onClick={async()=>accept(await operation.retry())}>{label('cutover.retryOperation')}</button>}
            <button type="button" style={secondaryActionButton} disabled={working}
              onClick={async()=>accept(await operation.cancel())}>{label('operationCancel')}</button>
          </div>
        </div>}
        {failed&&<p role="alert" className={s.error}>{label('writeControl.failed')}</p>}
        {operation.error&&<p role="alert" className={s.error}>
          {errorCode ? label('problem.'+errorCode) : operation.error.message}
        </p>}
        {(failed||operation.error)&&<button type="button" style={secondaryActionButton} disabled={working} onClick={()=>void load()}>{label('writeControl.refresh')}</button>}
        {receipt&&<RolloutReceiptView receipt={receipt} current={currentAfterWrite}/>}
        {loaded&&!operation.pending&&<>
          <ScopePicker scope="HOUSE" value={house} onPick={(value,row)=>{
            resetFields();operation.clearError();setHouse(value);setCompany(row?.companyCode??'');
          }} disabled={working}/>
          {house&&<p role="status" className={s.hint}>{label(prior ? prior.enabled?'rollout.OPEN':'rollout.PAUSED' : 'rollout.UNREGISTERED')}
            {prior&&' · '+time(prior.changed_at)+' · '+prior.change_reason}</p>}
          {house&&<details key={house} className={s.record}>
            <summary>{label('diagnosticTitle')}</summary>
            <Field title={label('diagnosticAccount')}>{attrs=><input {...attrs} style={inputField} value={diagnosticUser} maxLength={64}
              disabled={working} onChange={event=>{setDiagnosticUser(event.target.value);setDiagnostic(undefined);}}/>}</Field>
            <button type="button" style={secondaryActionButton} disabled={working||!diagnosticUser.trim()} onClick={()=>void checkDiagnostic()}>
              {label('diagnosticCheck')}
            </button>
            {diagnostic&&<div role="status"><AccountAccess result={diagnostic}/></div>}
          </details>}
          {house&&<Field title={label('rolloutAction')}>{attrs=><select {...attrs} style={inputField} value={target}
            disabled={working} onChange={event=>{
              setTarget(event.target.value as typeof target);setReason('');setEffective(undefined);setConfirmation(undefined);operation.clearError();
            }}>
            <option value="">{label('rolloutSelectAction')}</option>
            {!prior?.enabled&&<option value="enable">{label(prior?'houseRolloutRestore':'houseRolloutResume')}</option>}
            {prior?.enabled!==false&&<option value="pause">{label('houseRolloutPause')}</option>}
          </select>}</Field>}
          {enable&&house&&<>
            <div className={s.fields}>
              <Field title={label('rolloutMaker')}>{attrs=><input {...attrs} style={inputField} value={maker} maxLength={64}
                disabled={working} onChange={event=>{setMaker(event.target.value);setEffective(undefined);setConfirmation(undefined);}}/>}</Field>
              <Field title={label('rolloutReviewer')}>{attrs=><input {...attrs} style={inputField} value={reviewer} maxLength={64}
                disabled={working} onChange={event=>{setReviewer(event.target.value);setEffective(undefined);setConfirmation(undefined);}}/>}</Field>
            </div>
            <button type="button" style={secondaryActionButton} disabled={working||!maker.trim()||!reviewer.trim()}
              onClick={()=>void checkAccounts()}>{label('rolloutCheckAccounts')}</button>
            {effective&&<div role="status" className={s.record}>
              <strong>{label(effective.ready?'rolloutReady':'rolloutNotReady')}</strong>
              {effective.businessDay&&<p>{label('businessDay')} · {effective.businessDay}</p>}
              <ul>{effective.blockers.map(code=><li key={code}>{label('problem.'+code)}</li>)}</ul>
              {(['maker','reviewer'] as const).map(side=><div key={side}>
                <strong>{label(side==='maker'?'rolloutMaker':'rolloutReviewer')} · {effective[side].username} · {effective[side].required.join(' / ')}</strong>
                {!!effective[side].missing.length&&<p>{label('rolloutMissing')} · {effective[side].missing.join(' / ')}</p>}
                <AccountAccess result={effective[side]}/>
              </div>)}
            </div>}
          </>}
          {chosen&&<Field title={label('writeControl.reason')}>{attrs=><textarea {...attrs} style={inputField} maxLength={500}
            value={reason} onChange={event=>{setReason(event.target.value);setConfirmation(undefined);}} disabled={working}/>}</Field>}
          {chosen&&<div className={s.actions}>
            {!confirmation ? <button type="button" style={primaryActionButton} disabled={!canConfirm}
              onClick={confirm}>{label('rolloutReview')}</button> : <div className={s.record}>
              <p role="status"><strong>{company} · {house} · {action}</strong></p>
              <p>{label(prior ? prior.enabled?'rollout.OPEN':'rollout.PAUSED' : 'rollout.UNREGISTERED')} → {label(enable?'rollout.OPEN':'rollout.PAUSED')}</p>
              {enable&&<p>{label('rolloutMaker')} · {confirmation.maker} · {label('rolloutReviewer')} · {confirmation.reviewer}</p>}
              <p className={s.long}>{confirmation.reason}</p>
              {!prior&&<p>{label('rolloutFirstRegistration')}</p>}
              <div className={s.actions}>
                <button type="button" style={primaryActionButton} disabled={!canConfirm} onClick={()=>void save()}>{action}</button>
                <button type="button" style={secondaryActionButton} disabled={working} onClick={()=>setConfirmation(undefined)}>{label('rolloutBack')}</button>
              </div>
            </div>}
          </div>}
        </>}
      </div>
    </RightDrawer>
  </>;
}
