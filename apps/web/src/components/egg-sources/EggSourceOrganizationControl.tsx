'use client';

import { type ReactNode,useEffect,useState } from 'react';
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
  return <GrantRow key={subject+'/'+code} name={name} path={path} legacy={editable ? legacy : undefined}/>;
}

function GrantRow({path,name,legacy}:{path?:string;name:string;legacy?:ReactNode}) {
  const {label}=useSourceText();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const [saved,setSaved]=useState(false);
  const [digest,setDigest]=useState('');
  const [rows,setRows]=useState<Grant[]>([]);
  const [configured,setConfigured]=useState<Grant[]>([]);
  const [inherited,setInherited]=useState<Array<Grant&{set_code:string}>>([]);
  const [scope,setScope]=useState<Scope>('HOUSE');
  const [code,setCode]=useState('');
  const [reason,setReason]=useState('');
  const title=label('organizationGrants');
  async function load() {
    if (!path) return;
    setBusy(true);setFailed(false);setSaved(false);setDigest('');
    try {
      const {data}=await request<{data:{rows:Grant[];digest:string;inherited?:Array<Grant&{set_code:string}>}}>(path,{silent:true,bindSession:true,cache:'no-store'});
      setRows(data.rows);setConfigured(data.rows);setInherited(data.inherited??[]);setDigest(data.digest);setReason('');
    } catch {setFailed(true);}
    finally {setBusy(false);}
  }
  async function save() {
    if (!path || !digest || !reason.trim() || rows.some(row=>!row.actions.length)) return;
    setBusy(true);setFailed(false);setSaved(false);
    try {
      const {data}=await request<{data:{rows:Grant[];digest:string}}>(path,{
        method:'PUT',body:JSON.stringify({rows,expectedDigest:digest,reason:reason.trim()}),silent:true,bindSession:true,retry:false});
      setRows(data.rows);setConfigured(data.rows);setDigest(data.digest);setReason('');setSaved(true);
    } catch {setDigest('');setFailed(true);}
    finally {setBusy(false);}
  }
  useEffect(()=>{
    if (!path) return;
    const controller=new AbortController();
    void request<{data:{rows:Grant[];inherited?:Array<Grant&{set_code:string}>}}>(path,{
      silent:true,bindSession:true,cache:'no-store',signal:controller.signal,
    }).then(({data})=>{
      if (controller.signal.aborted) return;
      setConfigured(data.rows);setInherited(data.inherited??[]);
    }).catch(()=>{ /* Re-read when the editor is opened. */ });
    return ()=>controller.abort();
  },[path]);

  function show() {
    if (!open) void load();
    setOpen(!open);
  }

  return <div className={s.sourceGrantRow}>
    <div className={s.sourceGrantToolbar}>
      <strong>{name}</strong>
      <div className={s.sourceGrantActions}>
        {actions.map(action=><button key={action} type="button" data-action={action}
          className={s.sourceGrantAction} disabled={!path||busy||action==='D'||action==='X'}
          title={label('organizationAction.'+action)} aria-label={label('organizationAction.'+action)}
          aria-expanded={path&&action!=='D'&&action!=='X' ? open : undefined}
          data-configured={[...configured,...inherited].some(row=>row.actions.includes(action))}
          onClick={show}>{action}</button>)}
        {path&&<button type="button" className={s.sourceGrantScope} aria-expanded={open} onClick={show}
          disabled={busy}>{title}</button>}
      </div>
    </div>
    {open&&path&&<div className={s.stack} aria-busy={busy}>
        <p className={s.hint}>{label('organizationGrantsHelp')}</p>
        {failed&&<><p role="alert" className={s.error}>{label('writeControl.failed')}</p>
          <button type="button" style={secondaryActionButton} onClick={()=>void load()}>{label('writeControl.refresh')}</button></>}
        {saved&&<p role="status" className={s.notice}>{label('organizationGrantSaved')}</p>}
        {!!inherited.length&&<div className={s.record}>
          <strong>{label('inheritedGrants')}</strong>
          <ul>{inherited.map(row=><li key={row.set_code+'/'+row.scope_type+'/'+row.scope_code}>
            {row.set_code} · {label('organization.'+row.scope_type)} {row.scope_code} · {row.actions.join(' / ')}
          </li>)}</ul>
        </div>}
        {digest&&<>
          <ScopePicker scope={scope} value={code} onScope={setScope} onPick={setCode} disabled={busy}/>
          <button type="button" style={secondaryActionButton}
            disabled={busy||!code||rows.some(row=>row.scope_type===scope&&row.scope_code===code)}
            onClick={()=>{setRows([...rows,{scope_type:scope,scope_code:code,actions:[]}]);setCode('');setSaved(false);}}>
            {label('organizationAdd')}
          </button>
          {rows.map((row,index)=><fieldset key={row.scope_type+'/'+row.scope_code} disabled={busy} className={s.record}>
            <legend>{label('organization.'+row.scope_type)} · {row.scope_code}</legend>
            <div className={s.actions}>{actions.map(action=><label key={action} title={label('organizationAction.'+action)}>
              <input type="checkbox" checked={row.actions.includes(action)} disabled={action==='D'||action==='X'}
                onChange={event=>{const checked=event.target.checked;setSaved(false);setRows(current=>current.map((grant,i)=>i===index
                  ? {...grant,actions:checked?[...grant.actions,action]:grant.actions.filter(value=>value!==action)}:grant));}}/>
              {' '}{label('organizationAction.'+action)}
            </label>)}</div>
            <button type="button" style={secondaryActionButton}
              onClick={()=>{setRows(current=>current.filter((_,i)=>i!==index));setSaved(false);}}>{label('remove')}</button>
          </fieldset>)}
          <Field title={label('writeControl.reason')}>{attrs=><textarea {...attrs} style={inputField} maxLength={500}
            value={reason} onChange={event=>setReason(event.target.value)} disabled={busy}/>}</Field>
          <button type="button" style={primaryActionButton} disabled={busy||!reason.trim()||rows.some(row=>!row.actions.length)}
            onClick={()=>void save()}>{label('organizationSave')}</button>
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
  const [effective,setEffective]=useState<{maker:string[];reviewer:string[]}>();
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
      const inspect=(username:string)=>request<{data:{actions:string[]}}>(endpoint+'/egg-source-house-access?'+
        new URLSearchParams({house,username:username.trim()}),{silent:true,bindSession:true,cache:'no-store'});
      const [one,two]=await Promise.all([inspect(maker),inspect(reviewer)]);
      setEffective({maker:one.data.actions,reviewer:two.data.actions});
    } catch {setFailed(true);}
    finally {setBusy(false);}
  }
  const enable=prior ? !prior.enabled : opening;
  const rolesReady=maker.trim()!==reviewer.trim() && ['V','C','E'].every(action=>effective?.maker.includes(action))
    && ['V','A'].every(action=>effective?.reviewer.includes(action));
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
            {effective&&<p role="status">{label('rolloutMaker')} {effective.maker.join(' / ')||'—'} · {label('rolloutReviewer')} {effective.reviewer.join(' / ')||'—'}
              {!rolesReady&&<> · {label('problem.HOUSE_ROLES_NOT_READY')}</>}</p>}
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
