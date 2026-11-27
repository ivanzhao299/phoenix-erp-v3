'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmptyState, MasterDataTemplate } from '@/components/design-system';
import { inputField, primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';
import { colors,creationStatus, isOptionList, isPlanList, isWorkspace, query, root, type Input, type Option, type Options, type PlanOption, type Requirement, type Shell, type Workspace } from './contracts';
import { sourceCreationProblem, useEggIdentity, useEggRead, useEggWrite } from './client';
import { Back, Busy, Field, OwnerMeta, ReadFailure, SelectOption, SourceCreationStatus, WriteFeedback, useSourceText } from './parts';
import { PrecheckPanel } from './PrecheckPanel';
import s from './EggSources.module.css';

const validOptions = (value:Options) => isOptionList(value.grades) && isOptionList(value.specs);

function nextDay(day:string) {
  const d = new Date(day+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
}

type FormDraft = {
  date?:string;
  color:Shell;
  warehouse:string;
  reason:string;
  linked:string;
  items:Array<Requirement&{id:number}>;
  nextId:number;
  continueOld:boolean;
};
const emptyDraft:FormDraft={color:'STANDARD',warehouse:'',reason:'',linked:'',
  items:[{id:1,gradeCode:'',specCode:''}],nextId:2,continueOld:false};

export default function NewChange() {
  const account=useEggIdentity();
  const router=useRouter();
  const house=useSearchParams().get('houseCode')||'';
  const key=JSON.stringify([account,house]);
  const [local,setLocal]=useState<{key:string;version:1|2|null;draft:FormDraft}>();
  const [precheckProblem,setPrecheckProblem]=useState<{key:string;code:string}>();
  const {label,crumb}=useSourceText();
  const workspace=useEggRead<Workspace>(account,house ? '/workspace'+query({houseCode:house}) : null,isWorkspace);
  const status=workspace.data ? creationStatus(workspace.data) : null;
  const houseContract=status?.version===2;
  const version=status?.version??null;
  const draft=local?.key===key ? local.version===version ? local.draft
    : {...local.draft,warehouse:'',linked:'',continueOld:false} : emptyDraft;
  const updateDraft=(values:Partial<FormDraft>)=>setLocal(previous=>({
    key,version,draft:{...(previous?.key===key&&previous.version===version ? previous.draft : draft),...values},
  }));
  const write=useEggWrite(account,house,key=>'/change-requests/'+key+query({houseCode:house}),receipt=>{
    router.push(root+'/changes/'+receipt.id+'?saved=1');
  },{
    path:(key,company)=>'/change-requests/'+key+'/legacy-resolution'+query({houseCode:house,companyCode:company}),
    onNotCommitted:workspace.reload,
  });
  const problem=precheckProblem?.key===key ? precheckProblem.code : write.problem;
  const changed=sourceCreationProblem(problem);
  const retiredPolicy=write.feedback==='V1_NOT_COMMITTED'&&!houseContract;
  const canCreate=!!status?.allowed&&!changed&&!retiredPolicy;
  const warehouses=useEggRead<Option[]>(account,canCreate&&!houseContract ? '/candidates/warehouses'+query({houseCode:house}) : null,isOptionList);
  const options=useEggRead<Options>(account,canCreate ? '/candidates/options'+query({houseCode:house,contractVersion:houseContract?'2':null}) : null,validOptions);
  const formReady=!!(workspace.data?.businessDay&&canCreate&&(houseContract||warehouses.data)&&options.data);
  return <MasterDataTemplate responsive title={label('newChange')} breadcrumb={crumb} content={<div className={s.stack}>
    <div className={s.actions}><Back href={root+query({houseCode:house,tab:'changes'})}/></div>
    {!house&&<EmptyState title={label('chooseHouse')}/>}
    {(workspace.loading||warehouses.loading||options.loading)&&<Busy/>}
    {workspace.error&&<ReadFailure error={workspace.error} retry={workspace.reload}/>}
    {warehouses.error&&<ReadFailure error={warehouses.error} retry={()=>{workspace.reload();warehouses.reload();}}/>}
    {options.error&&<ReadFailure error={options.error} retry={()=>{workspace.reload();options.reload();}}/>}
    {workspace.data&&<section className={s.section}>
      <OwnerMeta owner={workspace.data.owner} day={workspace.data.businessDay} zone={workspace.data.zone}/>
      <SourceCreationStatus workspace={workspace.data} onRefresh={workspace.reload}/>
    </section>}
    {changed&&<p role="alert" className={s.notice}>{label('problem.'+problem)}{' '}
      <button type="button" style={secondaryActionButton} onClick={()=>{setPrecheckProblem(undefined);write.resetFeedback();workspace.reload();}}>{label('refreshWorkspace')}</button></p>}
    {house&&!formReady&&<WriteFeedback write={write} allowRetry={false}/>}
    {retiredPolicy&&workspace.data&&<button type="button" style={secondaryActionButton} onClick={workspace.reload}>
      {label('refreshWorkspace')}
    </button>}
    {workspace.data?.businessDay&&canCreate&&(houseContract||warehouses.data)&&options.data&&
      <NewForm key={JSON.stringify([account,house,version])} account={account} house={house} company={workspace.data.owner.companyCode}
        earliest={nextDay(workspace.data.businessDay)} warehouses={warehouses.data??[]} options={options.data}
        houseContract={houseContract} continuation={workspace.data.continuation} write={write} draft={draft} updateDraft={updateDraft} onCreationProblem={code=>setPrecheckProblem({key,code})}/>}
  </div>}/>;
}

function NewForm({account,house,company,earliest,warehouses,options,houseContract,continuation,write,draft,updateDraft,onCreationProblem}:{
  account:string;house:string;company:string;earliest:string;warehouses:Option[];options:Options;houseContract:boolean;
  continuation:Workspace['continuation'];write:ReturnType<typeof useEggWrite>;draft:FormDraft;updateDraft:(values:Partial<FormDraft>)=>void;onCreationProblem:(code:string)=>void
}) {
  const {label,shell}=useSourceText();
  const {color,warehouse,reason,linked,items,nextId,continueOld}=draft;
  const date=draft.date??earliest;
  const [attempted,setAttempted]=useState(false);
  const selectedContinuation=continueOld ? continuation : null;
  const plans=useEggRead<PlanOption[]>(account,!selectedContinuation&&date>=earliest
    ? '/flock-plans'+query({houseCode:house,effectiveDate:date,contractVersion:houseContract?'2':null}) : null,isPlanList);
  const requirements=useMemo(()=>selectedContinuation?.requirements??items.map(({gradeCode,specCode})=>({gradeCode,specCode})),
    [items,selectedContinuation]);
  const input=useMemo<Input>(()=>({ houseCode:house,effectiveDate:date,targetClass:selectedContinuation?.targetClass??color,
    ...(houseContract ? {contractVersion:2 as const} : {warehouseCode:warehouse}),
    ...(selectedContinuation ? {continuationProfileCode:selectedContinuation.profileCode} : {}),
    reason:reason.trim(),requirements,planDocument:selectedContinuation ? null : linked||null }),
  [house,date,color,warehouse,reason,requirements,linked,houseContract,selectedContinuation]);
  const matchingRows=new Map<string,number>();
  const duplicates=new Set<number>();
  items.forEach(row=>{
    if (!row.gradeCode||!row.specCode) return;
    const key=JSON.stringify([row.gradeCode,row.specCode]);
    const prior=matchingRows.get(key);
    if (prior) { duplicates.add(prior);duplicates.add(row.id); }
    matchingRows.set(key,row.id);
  });
  const warehouseUnavailable=!!warehouse&&!warehouses.some(row=>row.code===warehouse);
  const dateInvalid=!date||date<earliest;
  const linkedUnavailable=!selectedContinuation&&!!linked&&!(plans.data?.some(plan=>plan.id===linked));
  const complete=!dateInvalid && (houseContract || !!warehouse && !warehouseUnavailable) && !!input.reason && !linkedUnavailable
    && (!!selectedContinuation || !duplicates.size && items.every(row=>options.grades.some(grade=>grade.code===row.gradeCode) && options.specs.some(spec=>spec.code===row.specCode)));
  const locked=write.busy||write.pending;
  function validate() {
    if (complete) return true;
    setAttempted(true);
    requestAnimationFrame(()=>document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus());
    return false;
  }
  const changeRow=(id:number,piece:Partial<Requirement>)=>updateDraft({items:items.map(row=>row.id===id?{...row,...piece}:row)});

  return <div className={s.stack}>
    <form className={s.stack} noValidate onSubmit={event=>{
      event.preventDefault();
      if (validate()) void write.send('/changes',input,houseContract?undefined:company);
    }}>
      <section className={s.section}>
        <h2>{label(houseContract?'scheduleHouseBasics':'scheduleBasics')}</h2>
        <p className={s.hint}>{label(houseContract?'houseContractWarehouseHelp':'legacyTransition')}</p>
        {continuation&&<label className={s.hint}>
          <input type="checkbox" checked={!!selectedContinuation} disabled={locked} onChange={e=>updateDraft({continueOld:e.target.checked})}/>
          {' '}{label('continueExistingProfile')}
        </label>}
        <div className={s.fields}>
          <Field title={label('start')} hint={label('dateHelp')+' '+earliest} error={attempted&&dateInvalid?label('problem.DATE_NOT_FUTURE'):undefined}>
            {attrs=><input {...attrs} type="date" required min={earliest} style={inputField} value={date} disabled={locked}
              onChange={e=>{updateDraft({date:e.target.value,linked:''});}}/>}
          </Field>
          <Field title={label('shell')}>{attrs=><select {...attrs} required style={inputField} value={input.targetClass} disabled={locked||!!selectedContinuation}
            onChange={e=>updateDraft({color:e.target.value as Shell})}>{colors.map(value=><option value={value} key={value}>{shell(value)}</option>)}</select>}</Field>
          {!houseContract&&<Field title={label('warehouse')} hint={label(warehouses.length?'warehouseHelp':'noWarehouses')}
            error={warehouseUnavailable?label('warehouseLost'):attempted&&!warehouse?label('required'):undefined}>
            {attrs=><SelectOption attrs={{...attrs,required:true,disabled:locked||!warehouses.length}} values={warehouses} value={warehouse} onChange={value=>updateDraft({warehouse:value})}/>}
          </Field>}
          {!selectedContinuation&&<Field title={label('changeDoc')} hint={plans.loading?label('loadingPlans'):label('optionalPlan')}
            error={linkedUnavailable?label('planLost'):undefined}>
            {attrs=><select {...attrs} style={inputField} value={linked} disabled={locked||plans.loading} onChange={e=>updateDraft({linked:e.target.value})}>
              <option value="">{label('noPlan')}</option>
              {plans.data?.map(row=><option key={row.id} value={row.id}>{label('plan.'+row.kind)} · {row.flock_no} · {label('status.'+row.status)}</option>)}
            </select>}
          </Field>}
        </div>
        {plans.error&&<ReadFailure error={plans.error} retry={plans.reload}/>}
      </section>
      <section className={s.section}>
        <h2>{label('combinations')}</h2>
        <div className={s.stack}>
          {!options.grades.length&&<p className={s.notice}>{label('noGrades')}</p>}
          {!options.specs.length&&<p className={s.notice}>{label('noSpecs')}</p>}
          {selectedContinuation&&<ul className={s.events}>{requirements.map(row=><li className={s.record} key={JSON.stringify(row)}>{row.gradeCode} · {row.specCode}</li>)}</ul>}
          {!selectedContinuation&&items.map((row,index)=><fieldset key={row.id} className={s.row} disabled={locked}>
            <legend>{label('combination')} {index+1}</legend>
            <div className={s.fields}>
              <Field title={label('grade')} error={attempted&&!options.grades.some(option=>option.code===row.gradeCode)?label('required'):undefined}>
                {attrs=><SelectOption attrs={{...attrs,required:true}} values={options.grades} value={row.gradeCode} onChange={gradeCode=>changeRow(row.id,{gradeCode})}/>}
              </Field>
              <Field title={label('spec')} error={duplicates.has(row.id)?label('duplicate'):attempted&&!options.specs.some(option=>option.code===row.specCode)?label('required'):undefined}>
                {attrs=><SelectOption attrs={{...attrs,required:true}} values={options.specs} value={row.specCode} onChange={specCode=>changeRow(row.id,{specCode})}/>}
              </Field>
              <div className={s.actions}>
                {items.length>1&&<button type="button" style={secondaryActionButton}
                  onClick={()=>updateDraft({items:items.filter(item=>item.id!==row.id)})}>{label('remove')}</button>}
              </div>
            </div>
          </fieldset>)}
          {!selectedContinuation&&<div className={s.actions}><button type="button" style={secondaryActionButton} disabled={locked||items.length>=96} onClick={()=>{
            updateDraft({items:[...items,{id:nextId,gradeCode:'',specCode:''}],nextId:nextId+1});
          }}>{label('add')}</button></div>}
        </div>
      </section>
      <section className={s.section}><Field title={label('reason')} error={attempted&&!reason.trim()?label('required'):undefined}>
        {attrs=><textarea {...attrs} required style={inputField} value={reason} maxLength={2000} disabled={locked} onChange={e=>updateDraft({reason:e.target.value})}/>}
      </Field></section>
      <div className={s.actions}>
        <PrecheckPanel placement="button" account={account} input={input} grades={options.grades} specs={options.specs} validate={validate} disabled={locked} onCreationProblem={onCreationProblem}/>
        <button type="submit" style={primaryActionButton} disabled={locked}>{label('save')}</button>
      </div>
      <p className={s.hint}>{label(complete?'draftHelp':houseContract?'completeHouseFields':'completeFields')}</p>
      <WriteFeedback write={write} allowRetry={!houseContract||!write.pendingLegacy}/>
    </form>
  </div>;
}
