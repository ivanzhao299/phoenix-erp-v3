'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { HouseSelector } from '@/components/shared-selectors/MasterDataSelectors';
import DictSelect from '@/components/shared-selectors/DictSelect';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { localizedMasterName } from '@/lib/localized-master-data';
import request from '@/lib/api-client';
import type { ProductGrade } from '@/hooks/useProductGrades';
import s from '@/components/breeding/ProductionInboundWorkbench.module.css';

interface House {houseCode:string;companyCode:string;siteCode?:string}
interface Basis {house_code:string;flock_no:string;occupancy_id:string|null;current_qty:number|null}
interface Report {grade_status?:'RECORDED'|'REVIEW_REQUIRED';id:number;shift:string;flock_no:string;eggs_by_grade:Record<string,number>|null;feed_consumed:number|null;water_consumed:number|null;note:string|null}
interface Draft {quantities:Record<string,string>;feed:string;water:string;note:string}
const empty=():Draft=>({quantities:{},feed:'',water:'',note:''});
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
export default function ProductionReports(){
  const mobile=useMobilePermission('production_reports');const {user}=usePermission('MENU_FARM_DAILY');
  return mobile.allowed?<ReportForm key={String(user.userId??user.id??user.username??'')}/>:null;
}
function ReportForm(){
  const permission=usePermission('MENU_FARM_DAILY');const {t,lang}=useLanguage();
  const [house,setHouse]=useState<House|null>(null),[date,setDate]=useState(day),[shift,setShift]=useState('');
  const [state,setState]=useState(''),[basis,setBasis]=useState<Basis|null>(null),[grades,setGrades]=useState<ProductGrade[]>([]);
  const [reports,setReports]=useState<Report[]>([]),[draft,setDraft]=useState<Draft>(empty),[loadedKey,setLoadedKey]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
  const [verifiedRange,setVerifiedRange]=useState('');
  const rangeKey=JSON.stringify([house?.companyCode,house?.houseCode,date]);
  const verified=!!house&&rangeKey===verifiedRange;
  const inbound=usePermission('MENU_PROD_INBOUND');
  const flock=usePermission('MENU_FARM_DATA'),createFlock=usePermission('MENU_FLOCK_CREATE');
  const reportCorrection=usePermission('MENU_FLOCK_REPORT');
  const canOpenLifecycle=flock.canView&&createFlock.canEdit;
  const canCorrect=canOpenLifecycle&&reportCorrection.canApprove;
  const touched=useRef(false), saving=useRef(false);
  useEffect(()=>{
    const signal=new AbortController();
    request<House[]|{data:House[]}>('/lookup/houses',{signal:signal.signal,silent:true}).then(result=>{
      const rows=Array.isArray(result)?result:result.data;
      if(!signal.signal.aborted&&!touched.current&&rows?.length===1&&rows[0].companyCode)setHouse(rows[0]);
    }).catch(()=>{ /* The selector remains available for manual retry. */ });
    return()=>signal.abort();
  },[]);
  const prior=verified?reports.find(r=>r.shift===shift):undefined;
  const priorGrades=Object.values(prior?.eggs_by_grade??{});
  const priorTotal=prior?.grade_status!=='REVIEW_REQUIRED'&&priorGrades.length>0&&priorGrades.every(n=>Number.isSafeInteger(n)&&n>=0)
    ? priorGrades.reduce((total,n)=>total+n,0) : null;
  const storage=`production-reports:v1:${String(permission.user.userId??permission.user.id??permission.user.username??'')}:${house?.houseCode??''}:${date}:${shift}`;
  const ready=verified&&loadedKey===storage&&state==='ACTIVE'&&!!basis?.occupancy_id&&basis.current_qty!==null&&!!shift&&grades.length>0;
  const valid=ready&&[draft.feed,draft.water].every(v=>v===''||Number.isFinite(Number(v))&&Number(v)>=0)&&grades.every(g=>/^\d+$/.test(draft.quantities[g.grade_code]??'')&&Number.isSafeInteger(Number(draft.quantities[g.grade_code])));
  useEffect(()=>{let alive=true;Promise.resolve().then(async()=>{
    if(alive){setVerifiedRange('');setState('');setBasis(null);setReports([]);setGrades([]);setError('');}
    if(!house)return;
    try{const qs=new URLSearchParams({companyCode:house.companyCode,houseCode:house.houseCode});
      const [context,balance,sources,master]=await Promise.all([
        request<{state:string;firstProductionDate:string|null}>(`/v2/inventory/production-inbound-documents/context?${qs}`),
        request<{rows:Basis[]}>(`/v3/farm/daily-hen-report?date=${date}`),
        request<Report[]>(`/v3/farm/daily-logs/production-sources?${new URLSearchParams({date,houseCode:house.houseCode})}`),
        request<ProductGrade[]|{data:ProductGrade[]}>('/lookup/product-grades')]);
      if(!alive)return;setVerifiedRange(rangeKey);setState(context.firstProductionDate&&date<context.firstProductionDate?'ARCHIVED':context.state);setReports(sources);setGrades((Array.isArray(master)?master:master.data).filter(g=>g.status==='ACTIVE'&&(g.stock_managed??g.is_storable)!==false));
      const matches=balance.rows.filter(r=>r.house_code===house.houseCode&&r.occupancy_id);setBasis(matches.length===1?matches[0]:null);
    }catch(e){if(alive)setError(e instanceof Error?e.message:String(e));}
  });return()=>{alive=false;};},[house,date,revision,rangeKey]);
  useEffect(()=>{Promise.resolve().then(()=>{try{const saved=sessionStorage.getItem(storage);setDraft(saved?JSON.parse(saved):empty());}catch{setDraft(empty());}setLoadedKey(storage);});},[storage]);
  useEffect(()=>{if(loadedKey===storage&&house&&shift)sessionStorage.setItem(storage,JSON.stringify(draft));},[draft,loadedKey,storage,house,shift]);
  const submit=async()=>{if(!valid||saving.current||prior||!basis)return;saving.current=true;setBusy(true);setError('');
    try{await request('/v3/farm/daily-logs',{method:'POST',body:JSON.stringify({house_code:house!.houseCode,flock_no:basis.flock_no,log_date:date,shift,
      eggs_by_grade:Object.fromEntries(grades.map(g=>[g.grade_code,Number(draft.quantities[g.grade_code])])),
      ...(draft.feed!==''?{feed_consumed:Number(draft.feed)}:{}),...(draft.water!==''?{water_consumed:Number(draft.water)}:{}),note:draft.note})});
      setRevision(n=>n+1);setNotice(t('productionReports.saved','日报已保存。入库时选择本班次的实际交接分段。'));
    }catch(e){setNotice(t('productionJobs.draftRead')+' '+(e instanceof Error?e.message:String(e)));setVerifiedRange('');setRevision(n=>n+1);}finally{saving.current=false;setBusy(false);}};
  const lifeHref=(kind:string,id?:number)=>`/mobile/flock-lifecycle?${new URLSearchParams({kind,houseCode:house?.houseCode??'',date,...(id?{dailyLogId:String(id)}:{})})}`;
  return <main className={s.page}><h1>{t('productionReports.title','正式分级产蛋日报')}</h1><div className={s.actions}>
    <Link href="/mobile/home">{t('common.back','返回')}</Link>{inbound.canView&&<Link href="/mobile/production-inbound">{t('productionInstallments.title','分次生产入库')}</Link>}{verified&&canOpenLifecycle&&<Link href={lifeHref('MORTALITY')}>{t('productionJobs.recordLoss')}</Link>}</div>
    <p className={s.notice}>{t('productionReports.instructions','按真实班次填写全部分级数量；没有产量的档位请明确填0。日报不自动入库，死淘由生命周期单据汇总。')}</p>
    {error&&<p role="alert" className={`${s.notice} ${s.error}`}>{error}</p>}{notice&&<p role="status" className={s.notice}>{notice}</p>}
    <section className={s.card}><div className={s.grid}>
      <label className={s.field}>{t('productionInstallments.house','鸡舍')}<HouseSelector ariaLabel={t('productionInstallments.house','鸡舍')} disabled={busy} value={house?.houseCode??''} onChange={code=>{touched.current=true;setNotice('');if(!code)setHouse(null);}} onPick={opt=>setHouse(opt?{houseCode:opt.value,companyCode:String(opt.raw?.companyCode??''),siteCode:String(opt.raw?.siteCode??'')}:null)}/></label>
      <label className={s.field}>{t('productionInstallments.productionDate','生产日期')}<input type="date" disabled={busy} value={date} max={day()} onChange={e=>{setNotice('');setDate(e.target.value);}}/></label>
      <label className={s.field}>{t('productionInstallments.shift','来源班次')}<DictSelect dictType="PRODUCTION_REPORT_SHIFT" ariaLabel={t('productionInstallments.shift','来源班次')} value={shift} disabled={busy} onChange={setShift}/></label>
      <label className={s.field}>{t('productionReports.flock','有效占栏鸡群')}<input readOnly value={verified?basis?.flock_no??'':''}/></label></div>
      {house&&!verified&&<p role="status">{t(error?'productionJobs.unverified':'common.loading')}</p>}
      {verified&&state!=='ACTIVE'&&<p role="status">{t(state==='ARCHIVED'?'productionJobs.archived':'productionReports.closed')} {state==='OFF'&&<Link href="/mobile/egglog">{t('productionJobs.legacyEntry')}</Link>}</p>}
      {verified&&<p>{t('productionJobs.reportedShifts')} · {reports.map(r=><button key={r.id} onClick={()=>setShift(r.shift)}>#{r.id} · {r.shift}</button>)}{!reports.length&&t('productionJobs.notReported')}</p>}
      {prior?<div className={s.notice}><p>{t('productionReports.existing','该班次已有原日报，以下为原始记录；更正请走审核单。')}</p>
        <strong>#{prior.id}{priorTotal!==null&&<> · {priorTotal} {t('productionJobs.eggs')}</>}</strong>
        {prior.grade_status==='REVIEW_REQUIRED'&&<p role="status">{t('breeding.daily.reviewGrades','历史分级须核对原单后才能发起新的交接。')}</p>}
        {canCorrect&&<p><Link href={lifeHref('REPORT_CORRECTION',prior.id)}>{t('productionJobs.correctReport')}</Link></p>}
        {Object.entries(prior.eggs_by_grade??{}).map(([code,qty])=>{
          const grade=grades.find(g=>g.grade_code===code);
          return <p key={code}>{grade?localizedMasterName(grade as unknown as Record<string,unknown>,'grade_name',lang)||code:code}: {typeof qty==='number'||typeof qty==='string'?qty:'—'}</p>;
        })}</div>:
      verified&&state==='ACTIVE'&&<><div className={s.grid}>{grades.map(g=><label className={s.field} key={g.grade_code}>
        {localizedMasterName(g as unknown as Record<string,unknown>,'grade_name',lang)||g.grade_code}
        <input aria-label={g.grade_code} type="number" inputMode="numeric" step="1" min="0" disabled={!ready||busy||!permission.canEdit} value={draft.quantities[g.grade_code]??''}
          onChange={e=>setDraft(d=>({...d,quantities:{...d.quantities,[g.grade_code]:e.target.value}}))}/></label>)}</div>
      <div className={s.grid}><label className={s.field}>{t('productionReports.feed','本班饲料 kg（未记录留空）')}<input type="number" min="0" step="any" disabled={busy||!permission.canEdit} value={draft.feed} onChange={e=>setDraft(d=>({...d,feed:e.target.value}))}/></label>
        <label className={s.field}>{t('productionReports.water','本班饮水 L（未记录留空）')}<input type="number" min="0" step="any" disabled={busy||!permission.canEdit} value={draft.water} onChange={e=>setDraft(d=>({...d,water:e.target.value}))}/></label>
        <label className={s.field}>{t('common.remark','备注')}<textarea disabled={busy||!permission.canEdit} value={draft.note} onChange={e=>setDraft(d=>({...d,note:e.target.value}))}/></label></div>
      <div className={s.actions}><button disabled={!valid||busy||!permission.canEdit} onClick={submit}>{t('productionReports.save','确认本班次日报')}</button></div></>}
      <div className={s.actions}><button disabled={busy} onClick={()=>setRevision(n=>n+1)}>{t('productionReports.recover','查找原日报 / 刷新')}</button></div>
    </section></main>;
}
