'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { EmptyState, MasterDataTemplate, PresentationalTable, type ColumnV3 } from '@/components/design-system';
import { inputField, primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';
import { useEggIdentity, useEggRead } from './client';
import { isChange, isHouseList, isWorkspace, listOf, query, root, states, type Change, type Changes, type House, type Workspace as Model } from './contracts';
import { Badge, Busy, Field, Meta, OwnerMeta, ReadFailure, Schedule, useSourceText } from './parts';
import s from './EggSources.module.css';

const isPage = (data:Changes) => listOf(data.items,isChange) && (data.nextCursor===null || typeof data.nextCursor==='string');

export default function Workspace() {
  const account=useEggIdentity();
  const params=useSearchParams();
  const router=useRouter();
  const path=usePathname();
  const { label,shell,time,crumb }=useSourceText();
  const house=params.get('houseCode')??'';
  const tab=params.get('tab')==='changes' ? 'changes' : 'schedule';
  const filter={ state:params.get('state'),dateFrom:params.get('dateFrom'),dateTo:params.get('dateTo'),changeId:params.get('changeId') };
  const cursor=params.get('cursor');
  const houses=useEggRead<House[]>(account,'/candidates/houses',isHouseList);
  const workspace=useEggRead<Model>(account,house ? '/workspace'+query({houseCode:house}) : null,isWorkspace);
  const changes=useEggRead<Changes>(account,house&&tab==='changes' ? '/changes'+query({ houseCode:house,...filter,cursor }) : null,isPage);
  const result=workspace.data;
  const availableHouses=houses.data??[];
  const heading=useRef<HTMLHeadingElement>(null);
  const list=useRef<HTMLDivElement>(null);
  const returnKey='phoenix.egg-source.return.'+JSON.stringify([account,params.toString()]);
  const positionKey='phoenix.egg-source.page.'+JSON.stringify([account,house,...Object.values(filter)]);
  useEffect(()=>{
    if (!changes.data || !list.current) return;
    try {
      const id=sessionStorage.getItem(returnKey);
      if (!id) return;
      sessionStorage.removeItem(returnKey);
      const links=Array.from(list.current.querySelectorAll<HTMLAnchorElement>('[data-change]'));
      const target=links.find(link=>link.dataset.change===id && link.getClientRects().length);
      const focus=target??heading.current;
      focus?.focus({preventScroll:true});
      focus?.scrollIntoView({ block:'nearest' });
    } catch { /* focus restoration is best effort */ }
  },[changes.data,returnKey]);

  function select(next:string) {
    router.replace(path+query({ houseCode:next,tab }),{scroll:false});
  }

  function apply(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    router.replace(path+query({houseCode:house,tab,state:String(form.get('state')||''),
      dateFrom:String(form.get('dateFrom')||''),dateTo:String(form.get('dateTo')||''),changeId:String(form.get('changeId')||'').trim()}),{scroll:false});
  }

  const pageTo=(next:string|null)=>{
    router.replace(path+query({houseCode:house,tab,...filter,cursor:next}),{scroll:false});
    list.current?.scrollIntoView({block:'nearest'});
  };
  const previousCursor = () => {
    try { return sessionStorage.getItem(positionKey+cursor)||null; }
    catch { return null; }
  };
  const applied=params.get('applied');
  const action=(row:Change)=><Link data-change={row.id} href={root+'/changes/'+row.id+'?return='+encodeURIComponent(params.toString())}
    onClick={()=>{try {sessionStorage.setItem(returnKey,row.id);}catch {/* unavailable */}}}>{label('viewDetail')}</Link>;
  const columns:ColumnV3<Change>[]=[
    {key:'id',title:label('requestId'),render:row=><code title={row.id}>{row.id.slice(0,8)}…</code>},
    {key:'effectiveDate',title:label('start')},
    {key:'shell',title:label('shell'),render:row=>shell(row.targetClass)},
    {key:'warehouse',title:label('warehouse'),render:row=>row.warehouseName||row.warehouseCode},
    {key:'state',title:label('status'),render:row=><Badge value={row.state}/>},
    {key:'createdBy',title:label('createdBy'),render:row=>row.createdByName||row.createdBy},
    {key:'createdAt',title:label('createdAt'),render:row=>time(row.createdAt)},
    {key:'open',title:label('viewDetail'),render:action},
  ];

  return <MasterDataTemplate responsive title={label('title')} breadcrumb={crumb} content={<div className={s.stack}>
    <section className={s.section}>
      {houses.loading&&<Busy/>}
      {houses.error&&<ReadFailure error={houses.error} retry={houses.reload}/>}
      {houses.data&&<div className={s.stack}>
        <div className={s.fields}>
          <Field title={label('house')}>{attrs=><select {...attrs} style={inputField} value={house} onChange={e=>select(e.target.value)}>
            <option value="">{label('chooseHouse')}</option>
            {house&&!availableHouses.some(row=>row.houseCode===house)&&<option value={house} disabled>{house}</option>}
            {availableHouses.map(row=><option key={row.houseCode} value={row.houseCode}>{row.houseName} ({row.houseCode}) · {row.farmName||row.farmCode}</option>)}
          </select>}</Field>
        </div>
        {result&&<OwnerMeta owner={result.owner} day={result.businessDay} zone={result.zone}/>}
        {result?.createBlocker&&<p className={s.hint}>{label('problem.'+result.createBlocker)}</p>}
        {result&&!result.createBlocker&&<div className={s.actions}>
          <Link href={root+'/new'+query({houseCode:house})} style={primaryActionButton}>{label('newChange')}</Link>
        </div>}
      </div>}
    </section>
    {!house&&account&&<EmptyState title={label(houses.data?.length===0 ? 'noHouses' : 'chooseHouse')}/>}
    {workspace.loading&&<Busy/>}
    {workspace.error&&<ReadFailure error={workspace.error} retry={workspace.reload}/>}
    {result&&<>
      <nav className={s.tabs} aria-label={label('title')}>
        <Link href={root+query({houseCode:house})} aria-current={tab==='schedule'?'page':undefined}>{label('schedule')}</Link>
        <Link href={root+query({houseCode:house,tab:'changes',...filter})} aria-current={tab==='changes'?'page':undefined}>{label('changes')}</Link>
      </nav>
      {tab==='schedule'&&<section className={s.section}>
        <div className={s.stack}>
          <div>
            <h2>{label(result.profiles.some(row=>row.status==='CURRENT')?'schedule':'noCurrent')}</h2>
            <p className={s.hint}>{label('scheduleBasis')}</p>
          </div>
          {(result.pending.submitted>0||result.pending.revokeRequested>0)&&<div className={s.actions}>
            {result.pending.submitted>0&&<Link href={root+query({houseCode:house,tab:'changes',state:'SUBMITTED'})}>
              {label('status.SUBMITTED')} ({result.pending.submitted})
            </Link>}
            {result.pending.revokeRequested>0&&<Link href={root+query({houseCode:house,tab:'changes',state:'REVOKE_REQUESTED'})}>
              {label('status.REVOKE_REQUESTED')} ({result.pending.revokeRequested})
            </Link>}
          </div>}
          <Schedule profiles={result.profiles}/>
        </div>
      </section>}
      {tab==='changes'&&<section className={s.section} ref={list}>
        <div className={s.stack}>
          <h2 ref={heading} tabIndex={-1}>{label('changes')}</h2>
          {applied&&/^[0-9a-f-]{36}$/i.test(applied)&&<p role="status" className={s.notice}>{label('appliedReturn')}{' '}
            <Link href={root+'/changes/'+applied}>{label('viewDetail')}</Link></p>}
          <form className={s.stack} onSubmit={apply} key={JSON.stringify([house,filter])}>
            <div className={s.fields}>
              <Field title={label('status')}>{attrs=><select {...attrs} name="state" style={inputField} defaultValue={filter.state??''}>
                <option value="">{label('allStates')}</option>
                {states.map(state=><option key={state} value={state}>{label('status.'+state)}</option>)}
              </select>}</Field>
              <Field title={label('startFrom')}>{attrs=><input {...attrs} name="dateFrom" type="date" style={inputField} defaultValue={filter.dateFrom??''}/>}</Field>
              <Field title={label('startTo')}>{attrs=><input {...attrs} name="dateTo" type="date" style={inputField} defaultValue={filter.dateTo??''}/>}</Field>
              <Field title={label('requestId')}>{attrs=><input {...attrs} name="changeId" maxLength={36} style={inputField} defaultValue={filter.changeId??''}/>}</Field>
            </div>
            <div className={s.actions}>
              <button type="submit" style={secondaryActionButton}>{label('applyFilters')}</button>
              <Link href={root+query({houseCode:house,tab})}>{label('clearFilters')}</Link>
            </div>
          </form>
          {changes.loading&&<Busy/>}
          {changes.error&&<ReadFailure error={changes.error} retry={changes.reload}/>}
          {changes.data&&<>
            {changes.data.items.length===0?<EmptyState title={label(Object.values(filter).some(Boolean) ? 'noFiltered' : 'noChanges')}/>:<>
              <div className={s.desktop}><PresentationalTable serverManaged rows={changes.data.items} columns={columns} rowKey={row=>row.id}/></div>
              <div className={s.compact}>{changes.data.items.map(row=><article key={row.id} className={s.record}>
                <Meta pairs={[[label('requestId'),<code key="id" title={row.id}>{row.id.slice(0,8)}…</code>],[label('start'),row.effectiveDate],
                  [label('shell'),shell(row.targetClass)],[label('warehouse'),row.warehouseName||row.warehouseCode],
                  [label('status'),<Badge key="status" value={row.state}/>],[label('createdBy'),row.createdByName||row.createdBy],[label('createdAt'),time(row.createdAt)]]}/>
                {action(row)}
              </article>)}</div>
            </>}
            <div className={s.actions+' '+s.next}>
              <button type="button" style={secondaryActionButton} disabled={!cursor}
                onClick={()=>pageTo(previousCursor())}>{label('previousPage')}</button>
              <button type="button" style={secondaryActionButton} disabled={!changes.data.nextCursor} onClick={()=>{
                const next=changes.data?.nextCursor;
                if (!next) return;
                try { sessionStorage.setItem(positionKey+next,cursor??''); } catch { /* optional navigation history */ }
                pageTo(next);
              }}>{label('nextPage')}</button>
            </div>
          </>}
        </div>
      </section>}
    </>}
  </div>}/>;
}
