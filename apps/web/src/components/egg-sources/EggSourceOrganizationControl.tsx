'use client';

import { type ReactNode,useCallback,useEffect,useState } from 'react';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { inputField,primaryActionButton,secondaryActionButton } from '@/components/design-system/cockpit-styles';
import { usePermission } from '@/hooks/usePermission';
import request from '@/lib/api-client';
import { Field,useSourceText } from './parts';
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
  scope:Scope;value:string;onScope?:(scope:Scope)=>void;onPick:(value:string)=>void;disabled:boolean
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
      disabled={disabled||busy} onChange={event=>onPick(event.target.value)}>
      <option value="">{label('organizationChoose')}</option>
      {value&&!options.some(row=>row.code===value)&&<option value={value}>{value}</option>}
      {options.map(row=><option key={row.code} value={row.code}>{row.name} ({row.code}) · {row.companyCode}</option>)}
    </select>}</Field>
  </div>;
}

export function EggSourceOrganizationGrants({subject,code,name,legacy}:{
  subject:'role'|'set';code?:string;name:string;legacy?:ReactNode;
}) {
  const {role,roles,user}=usePermission();
  const editable=(role==='ROLE_ADMIN'||roles.includes('ROLE_ADMIN')) && !user.impersonatedBy
    && !!code && !(subject==='role'&&code==='ROLE_ADMIN');
  const path=editable ? endpoint+'/egg-source-organization-grants/'+subject+'/'+encodeURIComponent(code!) : undefined;
  const standardPath=path?.replace('egg-source-organization-grants','egg-source-standard-grants');
  return <GrantRow key={subject+'/'+code} name={name} path={path} standardPath={standardPath} legacy={editable ? legacy : undefined}/>;
}

function GrantRow({path,standardPath,name,legacy}:{path?:string;standardPath?:string;name:string;legacy?:ReactNode}) {
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
    } catch {setFailed(true);}
    finally {setBusy(false);}
  }

  function toggle(action:Action) {
    setOpen(true);setSaved(false);setPreview(null);
    if (converting) return;
    setDraft(previous=>previous.includes(action)?previous.filter(value=>value!==action):[...previous,action]);
  }

  return <div className={s.sourceGrantRow}>
    <div className={s.sourceGrantToolbar}>
      <strong>{name}</strong>
      <div className={s.sourceGrantActions}>
        {actions.map(action=><button key={action} type="button" data-action={action}
          className={s.sourceGrantAction} disabled={!data||busy||failed||action==='D'||action==='X'}
          title={label('organizationAction.'+action)} aria-label={label('organizationAction.'+action)}
          aria-pressed={draft.includes(action)}
          data-configured={draft.includes(action)}
          data-inherited={!!data?.inherited?.some(row=>row.actions.includes(action))}
          onClick={()=>toggle(action)}>{action}</button>)}
        {path&&<button type="button" className={s.sourceGrantScope} aria-expanded={open}
          onClick={()=>setOpen(value=>!value)} disabled={busy}>{label('standardGrantSettings')}</button>}
      </div>
    </div>
    {open&&path&&<div className={s.stack} aria-busy={busy}>
      <p className={s.hint}>{label('standardGrantHelp')}</p>
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
    {legacy&&<details><summary className={s.hint}>{label('legacyPermission')}</summary>{legacy}</details>}
  </div>;
}

export function EggSourceLegacyCreationGate() {
  const {label}=useSourceText();
  const [open,setOpen]=useState(false);
  const [state,setState]=useState<{enabled:boolean; available:boolean; pilotVerified:boolean; unclassified:string[]}|null>(null);
  const [working,setWorking]=useState(false);
  const [failed,setFailed]=useState(false);
  const [reason,setReason]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const path=endpoint+'/egg-source-legacy-creation';
  async function read(retire=false) {
    setWorking(true);setFailed(false);
    try {
      const {data}=await request<{data:{enabled:boolean;available:boolean;pilotVerified:boolean;unclassified:string[]}}>(path,retire ? {
        method:'POST',body:JSON.stringify({reason:reason.trim(),confirmed}),silent:true,bindSession:true,retry:false,
      } : {silent:true,bindSession:true,cache:'no-store'});
      setState(data);setReason('');setConfirmed(false);
    } catch {setState(null);setFailed(true);}
    finally {setWorking(false);}
  }
  return <>
    <button type="button" style={secondaryActionButton} onClick={()=>{setOpen(true);void read();}}>{label('legacyGate')}</button>
    <RightDrawer open={open} title={label('legacyGate')} onClose={()=>{if (!working) setOpen(false);}}>
      <div className={s.stack} aria-busy={working}>
        {failed&&<><p role="alert">{label('writeControl.failed')}</p>
          <button type="button" style={secondaryActionButton} onClick={()=>void read()}>{label('writeControl.refresh')}</button></>}
        {state&&<p role="status">{label(state.enabled?'legacyGateOpen':'legacyGateRetired')}</p>}
        {!!state?.enabled&&<>
          {!state.available&&<p>{label('legacyGateNeedsWrite')}</p>}
          {!state.pilotVerified&&<p>{label('legacyGateNeedsPilot')}</p>}
          {!!state.unclassified.length&&<p>{label('legacyGateUnclassified')} {state.unclassified.join('、')}</p>}
          <Field title={label('writeControl.reason')}>{attrs=><textarea {...attrs} style={inputField}
            maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} disabled={working}/>}</Field>
          <label><input type="checkbox" checked={confirmed} disabled={working}
            onChange={event=>setConfirmed(event.target.checked)}/> {label('legacyGateConfirm')}</label>
          <button type="button" style={primaryActionButton} disabled={working||!state.available||!state.pilotVerified||!reason.trim()||!confirmed||!!state.unclassified.length}
            onClick={()=>void read(true)}>{label('legacyGateRetire')}</button>
        </>}
      </div>
    </RightDrawer>
  </>;
}

type HouseGrantResult = {
  actions:string[];
  origins?:{action:string;source:{subject:'role'|'set';code:string;scopeType:string;scopeCode:string|null}}[];
};

export function EggSourceHouseRollout() {
  const {label,time}=useSourceText();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [house,setHouse]=useState('');
  const [rows,setRows]=useState<Rollout[]>([]);
  const [reason,setReason]=useState('');
  const [maker,setMaker]=useState('');
  const [reviewer,setReviewer]=useState('');
  const [effective,setEffective]=useState<{maker:HouseGrantResult;reviewer:HouseGrantResult}>();
  const [opening,setOpening]=useState(true);
  const path=endpoint+'/egg-source-house-rollouts';
  const prior=rows.find(row=>row.house_code===house);
  async function load() {
    setBusy(true);setFailed(false);setLoaded(false);
    try {
      const {data}=await request<{data:Rollout[]}>(path,{silent:true,bindSession:true,cache:'no-store'});
      setRows(data);setLoaded(true);
    } catch {setFailed(true);}
    finally {setBusy(false);}
  }
  async function checkAccounts() {
    if (!house||!maker.trim()||!reviewer.trim()) return;
    setBusy(true);setFailed(false);setEffective(undefined);
    try {
      const inspect=(username:string)=>request<{data:HouseGrantResult}>(endpoint+'/egg-source-house-access?'+
        new URLSearchParams({house,username:username.trim()}),{silent:true,bindSession:true,cache:'no-store'});
      const [one,two]=await Promise.all([inspect(maker),inspect(reviewer)]);
      setEffective({maker:one.data,reviewer:two.data});
    } catch {setFailed(true);}
    finally {setBusy(false);}
  }
  const enable=prior ? !prior.enabled : opening;
  const rolesReady=maker.trim()!==reviewer.trim() && ['V','C','E'].every(action=>effective?.maker.actions.includes(action))
    && ['V','A'].every(action=>effective?.reviewer.actions.includes(action));
  async function save() {
    if (!loaded || !house || !reason.trim() || enable&&!rolesReady) return;
    setBusy(true);setFailed(false);
    try {
      const {data}=await request<{data:Rollout}>(path+'/'+encodeURIComponent(house),{
        method:'PUT',body:JSON.stringify({expectedEnabled:prior?.enabled??null,expectedRevision:prior?.revision??null,enabled:enable,reason:reason.trim(),
          ...(enable ? {maker:maker.trim(),reviewer:reviewer.trim()}: {})}),
        silent:true,bindSession:true,retry:false});
      setRows(values=>[...values.filter(row=>row.house_code!==data.house_code),data]);setReason('');setEffective(undefined);
    } catch {setLoaded(false);setFailed(true);}
    finally {setBusy(false);}
  }
  return <>
    <button type="button" style={secondaryActionButton} onClick={()=>{setOpen(true);void load();}}>{label('houseRollout')}</button>
    <RightDrawer open={open} title={label('houseRollout')} onClose={()=>{if (!busy) setOpen(false);}}>
      <div className={s.stack} aria-busy={busy}>
        <p className={s.hint}>{label('houseRolloutHelp')}</p>
        {failed&&<><p role="alert" className={s.error}>{label('writeControl.failed')}</p>
          <button type="button" style={secondaryActionButton} onClick={()=>void load()}>{label('writeControl.refresh')}</button></>}
        {loaded&&<>
          <ScopePicker scope="HOUSE" value={house} onPick={value=>{setHouse(value);setEffective(undefined);}} disabled={busy}/>
          {prior&&<p role="status" className={s.hint}>{label(prior.enabled?'writeControl.enabled':'writeControl.paused')}
            {' · '}{time(prior.changed_at)} · {prior.change_reason}</p>}
          {!prior&&house&&<label><input type="checkbox" checked={!opening} disabled={busy}
            onChange={event=>setOpening(!event.target.checked)}/> {label('recordHousePause')}</label>}
          {enable&&house&&<>
            <div className={s.fields}>
              <Field title={label('rolloutMaker')}>{attrs=><input {...attrs} style={inputField} value={maker} maxLength={64}
                disabled={busy} onChange={event=>{setMaker(event.target.value);setEffective(undefined);}}/>}</Field>
              <Field title={label('rolloutReviewer')}>{attrs=><input {...attrs} style={inputField} value={reviewer} maxLength={64}
                disabled={busy} onChange={event=>{setReviewer(event.target.value);setEffective(undefined);}}/>}</Field>
            </div>
            <button type="button" style={secondaryActionButton} disabled={busy||!maker.trim()||!reviewer.trim()}
              onClick={()=>void checkAccounts()}>{label('rolloutCheckAccounts')}</button>
            {effective&&<div role="status" className={s.record}>
              {(['maker','reviewer'] as const).map(side=><div key={side}>
                <strong>{label(side==='maker'?'rolloutMaker':'rolloutReviewer')} {effective[side].actions.join(' / ')||'—'}</strong>
                {!!effective[side].origins?.length&&<ul>{effective[side].origins?.map(({action,source})=><li
                  key={[action,source.subject,source.code,source.scopeType,source.scopeCode].join('/')}>
                  {action} · {label(source.subject==='role'?'standardGrantRole':'standardGrantSet')} {source.code} · {
                    source.scopeType==='OWNER'?label('standardGrantAccountScope'):label('organization.'+source.scopeType)+' '+source.scopeCode}
                </li>)}</ul>}
              </div>)}
              {!rolesReady&&<p>{label('problem.HOUSE_ROLES_NOT_READY')}</p>}
            </div>}
          </>}
          <Field title={label('writeControl.reason')}>{attrs=><textarea {...attrs} style={inputField} maxLength={500}
            value={reason} onChange={event=>setReason(event.target.value)} disabled={busy}/>}</Field>
          <button type="button" style={primaryActionButton} disabled={busy||!house||!reason.trim()||enable&&!rolesReady} onClick={()=>void save()}>
            {label(enable?'houseRolloutResume':'houseRolloutPause')}
          </button>
        </>}
      </div>
    </RightDrawer>
  </>;
}
