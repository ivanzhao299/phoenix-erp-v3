'use client';

import { type ReactNode, useId, useState } from 'react';
import Link from 'next/link';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { ErrorState, LoadingSkeleton, PresentationalTable, StatusBadge } from '@/components/design-system';
import { inputField, secondaryActionButton } from '@/components/design-system/cockpit-styles';
import type { Owner, Option, Precheck, Profile, Shell } from './contracts';
import { EggError, type useEggWrite } from './client';
import s from './EggSources.module.css';

export function useSourceText() {
  const { t, lang:locale } = useLanguage();
  const label = (key:string) => t(`eggSources.${key}`,key);
  const shell = (value: Shell|null) => label(value==='STANDARD' ? 'standard' : value==='RED' ? 'red' : value==='PINK' ? 'pink' : 'unknown');
  const status = (value:string) => label('status.'+value);
  const option = (value:Option) => (locale==='lo' ? value.nameLo : locale==='en' ? value.nameEn : '') || value.name || value.code;
  const time = (value:string) => {
    const stamp = new Date(value);
    return Number.isFinite(stamp.getTime()) ? new Intl.DateTimeFormat(locale,{ dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Vientiane' }).format(stamp) : value;
  };
  return { label,shell,status,option,time,crumb:[{label:t('md.center','主数据中心')},{label:label('title')}] };
}

export function Badge({ value }: {value:string}) {
  const { status } = useSourceText();
  const appearance:Record<string,string> = { CURRENT:'ACTIVE',FUTURE:'PENDING',EXPIRED:'CANCELLED',
    UNVERIFIED:'PENDING',REVOKE_REQUESTED:'PENDING',REVOKED:'CANCELLED',PASSED:'ACTIVE',BLOCKED:'REJECTED',NOT_CHECKED:'PENDING' };
  return <StatusBadge status={appearance[value]??value} label={status(value)} />;
}

export function Field({ title,hint,error,children }: {title:string;hint?:string;error?:string;children:(attrs:{
  id:string;'aria-describedby'?:string;'aria-invalid'?:true
})=>ReactNode}) {
  const id = useId();
  return <div className={s.field}>
    <label htmlFor={id}>{title}</label>
    {children({ id,'aria-describedby':[hint&&id+'-hint',error&&id+'-err'].filter(Boolean).join(' ')||undefined,'aria-invalid':error?true:undefined })}
    {hint&&<p className={s.hint} id={id+'-hint'}>{hint}</p>}
    {error&&<p className={s.error} id={id+'-err'}>{error}</p>}
  </div>;
}

export function SelectOption({ values,value,onChange,attrs }: {values:Option[];value:string;onChange:(value:string)=>void;attrs:React.ComponentProps<'select'>}) {
  const { label,option } = useSourceText();
  return <select style={inputField} value={value} onChange={e=>onChange(e.target.value)} {...attrs}>
    <option value="">{label('choose')}</option>
    {values.map(row=><option key={row.code} value={row.code}>{option(row)} ({row.code})</option>)}
  </select>;
}

export function ReadFailure({error,retry}:{error:unknown;retry:()=>void}) {
  const { label } = useSourceText();
  const denied = error instanceof EggError && [401,403,404].includes(error.status);
  return <div role="alert"><ErrorState compact message={label(denied ? 'readDenied' : 'invalidResponse')} onRetry={retry}/></div>;
}

export function Meta({pairs}:{pairs:Array<[string,ReactNode]>}) {
  return <dl className={s.meta}>{pairs.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value??'—'}</dd></div>)}</dl>;
}

export function OwnerMeta({ owner,day,zone }: {owner:Owner;day:string|null;zone:string|null}) {
  const { label } = useSourceText();
  return <Meta pairs={[
    [label('house'),owner.houseName ? `${owner.houseName} (${owner.houseCode})` : owner.houseCode],
    [label('company'),owner.companyName ? `${owner.companyName} (${owner.companyCode})` : owner.companyCode],
    [label('farm'),owner.farmName ? `${owner.farmName} (${owner.farmCode})` : owner.farmCode],
    [label('site'),owner.siteName ? `${owner.siteName} (${owner.siteCode})` : owner.siteCode],
    [label('businessDay'),day&&zone ? `${day} (${zone})` : label('unknown')],
  ]}/>;
}

export function Schedule({ profiles }: {profiles:Profile[]}) {
  const { label,shell } = useSourceText();
  return <PresentationalTable serverManaged rows={profiles} rowKey={row=>row.profileCode} emptyText={label('noProfiles')}
    columns={[
      {key:'shell',title:label('shell'),render:row=>shell(row.shellClass)},
      {key:'effectiveDate',title:label('start')},
      {key:'expireDate',title:label('end')},
      {key:'status',title:label('status'),render:row=><Badge value={row.status}/>},
    ]}/>;
}

export function CopyId({ id }: {id:string}) {
  const { label } = useSourceText();
  const [result,setResult] = useState<string|null>(null);
  return <span className={s.actions}>
    <code className={s.long} title={id}>{id}</code>
    <button type="button" style={secondaryActionButton} onClick={async()=>{
      try { await navigator.clipboard.writeText(id);setResult('copied'); } catch { setResult('copyFailed'); }
    }}>{label('copy')}</button>
    {result&&<span role="status" className={s.hint}>{label(result)}</span>}
  </span>;
}

export function PrecheckResult({ result,grades,specs }: {result:Precheck;grades:Option[];specs:Option[]}) {
  const { label,shell,option } = useSourceText();
  const cutover=usePermission('MENU_PROD_INBOUND');
  const optionName = (list:Option[],code:string) => {
    const found=list.find(row=>row.code===code);
    return found ? `${option(found)} (${code})` : code;
  };
  return <section aria-label={label('precheckResult')} className={s.section}>
    <h2>{label('precheckResult')}</h2>
    <p role="status" className={s.notice}>{label(result.status==='READY' ? 'precheckReady' : 'precheckBlocked')}</p>
    {!!result.problems.length&&<ul>{result.problems.map(problem=><li key={problem}>{label('problem.'+problem)}</li>)}</ul>}
    <ul className={s.events}>{result.rows.map(row=><li className={s.record} key={JSON.stringify([row.gradeCode,row.specCode])}>
      <Meta pairs={[[label('shell'),shell(result.targetClass)],[label('grade'),optionName(grades,row.gradeCode)],
        [label('spec'),optionName(specs,row.specCode)],[label('status'),<Badge key="status" value={row.status}/>]]}/>
      {row.skuCode&&<p className={s.hint}>{row.productCode} · {row.skuCode}</p>}
      {!!row.issues.length&&<ul>{row.issues.map((issue,index)=><li key={index}>
        {row.issues.some(other=>other.group!==issue.group)&&<>{label('candidatePath')} {issue.group} · </>}<strong>{label('layer.'+issue.layer)}</strong> · {label('issue.'+issue.code)}
        {(issue.effectiveDate||issue.expireDate)&&<small> · {issue.effectiveDate||'—'} → {issue.expireDate||'—'}</small>}
      </li>)}</ul>}
    </li>)}</ul>
    {result.rows.some(row=>row.issues.some(issue=>issue.layer==='INVENTORY'))&&
      <p className={s.hint}>{label('domainNextStep')} {cutover.canView&&<Link href="/breeding/production-cutovers">{label('openCutover')}</Link>}</p>}
  </section>;
}

export function WriteFeedback({ write,refresh }: {write:ReturnType<typeof useEggWrite>;refresh?:()=>void}) {
  const { label } = useSourceText();
  return <>
    {write.feedback&&<p role={write.feedback==='SAVED' ? 'status' : 'alert'} className={s.notice}>{label('write.'+write.feedback)}</p>}
    {write.pending&&<div className={s.actions}>
      {!write.feedback&&!write.busy&&<p className={s.hint}>{label('write.UNKNOWN')}</p>}
      <button type="button" style={secondaryActionButton} disabled={write.busy} onClick={()=>void write.lookup()}>{label('checkReceipt')}</button>
      {write.canRetry&&<button type="button" style={secondaryActionButton} disabled={write.busy} onClick={()=>void write.retry()}>
        {label('retrySameAction')}</button>}
    </div>}
    {write.feedback==='CONFLICT'&&refresh&&<button type="button" style={secondaryActionButton} onClick={refresh}>{label('refreshDetail')}</button>}
  </>;
}

export function Back({ href }: {href:string}) {
  const { label } = useSourceText();
  return <Link style={secondaryActionButton} href={href}>{label('backToList')}</Link>;
}

export function Busy() {
  return <LoadingSkeleton variant="card" rows={3}/>;
}
