'use client';

import { useState } from 'react';
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
type Rollout={house_code:string;company_code:string;enabled:boolean;changed_at:string;change_reason:string};

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

export function EggSourceOrganizationGrants({subject,code}:{subject:'role'|'set';code:string}) {
  const {isSuper,user}=usePermission();
  if (!isSuper || user.impersonatedBy) return null;
  return <GrantDrawer key={subject+'/'+code} path={endpoint+'/egg-source-organization-grants/'+subject+'/'+encodeURIComponent(code)}/>;
}

function GrantDrawer({path}:{path:string}) {
  const {label}=useSourceText();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const [saved,setSaved]=useState(false);
  const [digest,setDigest]=useState('');
  const [rows,setRows]=useState<Grant[]>([]);
  const [scope,setScope]=useState<Scope>('HOUSE');
  const [code,setCode]=useState('');
  const [reason,setReason]=useState('');
  const title=label('organizationGrants');
  async function load() {
    setBusy(true);setFailed(false);setSaved(false);setDigest('');
    try {
      const {data}=await request<{data:{rows:Grant[];digest:string}}>(path,{silent:true,bindSession:true,cache:'no-store'});
      setRows(data.rows);setDigest(data.digest);setReason('');
    } catch {setFailed(true);}
    finally {setBusy(false);}
  }
  async function save() {
    if (!digest || !reason.trim() || rows.some(row=>!row.actions.length)) return;
    setBusy(true);setFailed(false);setSaved(false);
    try {
      const {data}=await request<{data:{rows:Grant[];digest:string}}>(path,{
        method:'PUT',body:JSON.stringify({rows,expectedDigest:digest,reason:reason.trim()}),silent:true,bindSession:true,retry:false});
      setRows(data.rows);setDigest(data.digest);setReason('');setSaved(true);
    } catch {setDigest('');setFailed(true);}
    finally {setBusy(false);}
  }
  return <>
    <button type="button" style={secondaryActionButton} onClick={()=>{setOpen(true);void load();}}>{title}</button>
    <RightDrawer open={open} title={title} onClose={()=>{if (!busy) setOpen(false);}}>
      <div className={s.stack} aria-busy={busy}>
        <p className={s.hint}>{label('organizationGrantsHelp')}</p>
        {failed&&<><p role="alert" className={s.error}>{label('writeControl.failed')}</p>
          <button type="button" style={secondaryActionButton} onClick={()=>void load()}>{label('writeControl.refresh')}</button></>}
        {saved&&<p role="status" className={s.notice}>{label('organizationGrantSaved')}</p>}
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
  async function save() {
    if (!loaded || !house || !reason.trim()) return;
    setBusy(true);setFailed(false);
    try {
      const {data}=await request<{data:Rollout}>(path+'/'+encodeURIComponent(house),{
        method:'PUT',body:JSON.stringify({expectedEnabled:prior?.enabled??null,enabled:!prior?.enabled,reason:reason.trim()}),
        silent:true,bindSession:true,retry:false});
      setRows(values=>[...values.filter(row=>row.house_code!==data.house_code),data]);setReason('');
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
          <ScopePicker scope="HOUSE" value={house} onPick={setHouse} disabled={busy}/>
          {prior&&<p role="status" className={s.hint}>{label(prior.enabled?'writeControl.enabled':'writeControl.paused')}
            {' · '}{time(prior.changed_at)} · {prior.change_reason}</p>}
          <Field title={label('writeControl.reason')}>{attrs=><textarea {...attrs} style={inputField} maxLength={500}
            value={reason} onChange={event=>setReason(event.target.value)} disabled={busy}/>}</Field>
          <button type="button" style={primaryActionButton} disabled={busy||!house||!reason.trim()} onClick={()=>void save()}>
            {label(prior?.enabled?'houseRolloutPause':'houseRolloutResume')}
          </button>
        </>}
      </div>
    </RightDrawer>
  </>;
}
