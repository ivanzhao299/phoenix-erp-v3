'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmptyState, MasterDataTemplate } from '@/components/design-system';
import { inputField, primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';
import { colors, isOptionList, isPlanList, isWorkspace, query, root, type Input, type Option, type Options, type PlanOption, type Requirement, type Shell, type Workspace } from './contracts';
import { useEggIdentity, useEggRead, useEggWrite } from './client';
import { Back, Busy, Field, OwnerMeta, ReadFailure, SelectOption, WriteFeedback, useSourceText } from './parts';
import { PrecheckPanel } from './PrecheckPanel';
import s from './EggSources.module.css';

const validOptions = (value:Options) => isOptionList(value.grades) && isOptionList(value.specs);

function nextDay(day:string) {
  const d = new Date(day+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
}

export default function NewChange() {
  const account=useEggIdentity();
  const house=useSearchParams().get('houseCode')||'';
  const {label,crumb}=useSourceText();
  const workspace=useEggRead<Workspace>(account,house ? '/workspace'+query({houseCode:house}) : null,isWorkspace);
  const warehouses=useEggRead<Option[]>(account,house ? '/candidates/warehouses'+query({houseCode:house}) : null,isOptionList);
  const options=useEggRead<Options>(account,house ? '/candidates/options' : null,validOptions);
  return <MasterDataTemplate responsive title={label('newChange')} breadcrumb={crumb} content={<div className={s.stack}>
    <div className={s.actions}><Back href={root+query({houseCode:house,tab:'changes'})}/></div>
    {!house&&<EmptyState title={label('chooseHouse')}/>}
    {(workspace.loading||warehouses.loading||options.loading)&&<Busy/>}
    {workspace.error&&<ReadFailure error={workspace.error} retry={workspace.reload}/>}
    {warehouses.error&&<ReadFailure error={warehouses.error} retry={warehouses.reload}/>}
    {options.error&&<ReadFailure error={options.error} retry={options.reload}/>}
    {workspace.data&&<section className={s.section}><OwnerMeta owner={workspace.data.owner} day={workspace.data.businessDay} zone={workspace.data.zone}/></section>}
    {workspace.data?.createBlocker&&<p className={s.notice}>{label('problem.'+workspace.data.createBlocker)}</p>}
    {workspace.data?.businessDay&&!workspace.data.createBlocker&&warehouses.data&&options.data&&
      <NewForm key={JSON.stringify([account,house])} account={account} house={house} earliest={nextDay(workspace.data.businessDay)}
        warehouses={warehouses.data} options={options.data}/>}
  </div>}/>;
}

function NewForm({account,house,earliest,warehouses,options}:{account:string;house:string;earliest:string;warehouses:Option[];options:Options}) {
  const router=useRouter();
  const {label,shell}=useSourceText();
  const [date,setDate]=useState(earliest);
  const [color,setColor]=useState<Shell>('STANDARD');
  const [warehouse,setWarehouse]=useState('');
  const [reason,setReason]=useState('');
  const [linked,setLinked]=useState('');
  const [items,setItems]=useState<Array<Requirement&{id:number}>>([{id:1,gradeCode:'',specCode:''}]);
  const [nextId,setNextId]=useState(2);
  const [attempted,setAttempted]=useState(false);
  const plans=useEggRead<PlanOption[]>(account,date>=earliest ? '/flock-plans'+query({houseCode:house,effectiveDate:date}) : null,isPlanList);
  const write=useEggWrite(account,house,key=>'/change-requests/'+key+query({houseCode:house}),receipt=>{
    router.push(root+'/changes/'+receipt.id+'?saved=1');
  });
  const requirements=useMemo(()=>items.map(({gradeCode,specCode})=>({gradeCode,specCode})),[items]);
  const input=useMemo<Input>(()=>({ houseCode:house,effectiveDate:date,targetClass:color,warehouseCode:warehouse,
    reason:reason.trim(),requirements,planDocument:linked||null }),[house,date,color,warehouse,reason,requirements,linked]);
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
  const linkedUnavailable=!!linked&&!(plans.data?.some(plan=>plan.id===linked));
  const complete=!dateInvalid && !!warehouse && !warehouseUnavailable && !!input.reason && !linkedUnavailable && !duplicates.size
    && items.every(row=>options.grades.some(grade=>grade.code===row.gradeCode) && options.specs.some(spec=>spec.code===row.specCode));
  const locked=write.busy||write.pending;
  function validate() {
    if (complete) return true;
    setAttempted(true);
    requestAnimationFrame(()=>document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus());
    return false;
  }
  const changeRow=(id:number,piece:Partial<Requirement>)=>setItems(rows=>rows.map(row=>row.id===id?{...row,...piece}:row));

  return <div className={s.stack}>
    <form className={s.stack} noValidate onSubmit={event=>{
      event.preventDefault();
      if (validate()) void write.send('/changes',input);
    }}>
      <section className={s.section}>
        <h2>{label('scheduleBasics')}</h2>
        <div className={s.fields}>
          <Field title={label('start')} hint={label('dateHelp')+' '+earliest} error={attempted&&dateInvalid?label('problem.DATE_NOT_FUTURE'):undefined}>
            {attrs=><input {...attrs} type="date" required min={earliest} style={inputField} value={date} disabled={locked}
              onChange={e=>{setDate(e.target.value);setLinked('');}}/>}
          </Field>
          <Field title={label('shell')}>{attrs=><select {...attrs} required style={inputField} value={color} disabled={locked}
            onChange={e=>setColor(e.target.value as Shell)}>{colors.map(value=><option value={value} key={value}>{shell(value)}</option>)}</select>}</Field>
          <Field title={label('warehouse')} hint={label(warehouses.length?'warehouseHelp':'noWarehouses')}
            error={warehouseUnavailable?label('warehouseLost'):attempted&&!warehouse?label('required'):undefined}>
            {attrs=><SelectOption attrs={{...attrs,required:true,disabled:locked||!warehouses.length}} values={warehouses} value={warehouse} onChange={setWarehouse}/>}
          </Field>
          <Field title={label('changeDoc')} hint={plans.loading?label('loadingPlans'):label('optionalPlan')}
            error={linkedUnavailable?label('planLost'):undefined}>
            {attrs=><select {...attrs} style={inputField} value={linked} disabled={locked||plans.loading} onChange={e=>setLinked(e.target.value)}>
              <option value="">{label('noPlan')}</option>
              {plans.data?.map(row=><option key={row.id} value={row.id}>{label('plan.'+row.kind)} · {row.flock_no} · {label('status.'+row.status)}</option>)}
            </select>}
          </Field>
        </div>
        {plans.error&&<ReadFailure error={plans.error} retry={plans.reload}/>}
      </section>
      <section className={s.section}>
        <h2>{label('combinations')}</h2>
        <div className={s.stack}>
          {!options.grades.length&&<p className={s.notice}>{label('noGrades')}</p>}
          {!options.specs.length&&<p className={s.notice}>{label('noSpecs')}</p>}
          {items.map((row,index)=><fieldset key={row.id} className={s.row} disabled={locked}>
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
                  onClick={()=>setItems(rows=>rows.filter(item=>item.id!==row.id))}>{label('remove')}</button>}
              </div>
            </div>
          </fieldset>)}
          <div className={s.actions}><button type="button" style={secondaryActionButton} disabled={locked||items.length>=96} onClick={()=>{
            setItems(rows=>[...rows,{id:nextId,gradeCode:'',specCode:''}]);setNextId(id=>id+1);
          }}>{label('add')}</button></div>
        </div>
      </section>
      <section className={s.section}><Field title={label('reason')} error={attempted&&!reason.trim()?label('required'):undefined}>
        {attrs=><textarea {...attrs} required style={inputField} value={reason} maxLength={2000} disabled={locked} onChange={e=>setReason(e.target.value)}/>}
      </Field></section>
      <div className={s.actions}>
        <PrecheckPanel placement="button" account={account} input={input} grades={options.grades} specs={options.specs} validate={validate} disabled={locked}/>
        <button type="submit" style={primaryActionButton} disabled={locked}>{label('save')}</button>
      </div>
      <p className={s.hint}>{label(complete?'draftHelp':'completeFields')}</p>
      <WriteFeedback write={write}/>
    </form>
  </div>;
}
