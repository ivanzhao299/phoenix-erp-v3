'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { HouseSelector, WarehouseSelector, SpecSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { useProductGrades } from '@/hooks/useProductGrades';
import request from '@/lib/api-client';
import { eggSourceEndpoint as endpoint, requestEggSourceData } from '@/lib/egg-source-api';
import s from '@/components/breeding/ProductionInboundWorkbench.module.css';

type EggClass = 'STANDARD' | 'RED' | 'PINK';
type Item = { gradeCode:string; specCode:string };
type Profile = { profile_code:string; effective_date:string; expire_date:string|null; shellClass:EggClass|null; status:string };
type Change = { id:string; state:string; version:number; effective_date:string; target_class:EggClass;
  payload:{ reason:string; warehouseCode:string }; approval:{ planDigest:string; previousClass?:EggClass|null; snapshot?:{scopeId:string|null;items:Array<Item & {productCode:string;skuCode:string}>} }|null };
type Timeline = { owner:{ companyCode:string; siteCode:string; houseCode:string }; businessDay:string; zone:string; profiles:Profile[]; changes:Change[] };
type PlanOption = { id:string; flock_no:string; kind:string; status:string };
type PreviewItem = { skuCode:string; productCode:string };
const shellClasses: EggClass[] = ['STANDARD','RED','PINK'];

export default function EggSourcesPage() {
  const { t } = useLanguage();
  const permission = usePermission('MENU_MD_PRODUCT');
  const invalidResponse = t('eggSources.invalidResponse', '蛋品来源数据返回格式异常，请重试。');
  const { grades } = useProductGrades({ onlyStorable:true });
  const [house,setHouse]=useState('');
  const [timeline,setTimeline]=useState<Timeline|null>(null);
  const [warehouse,setWarehouse]=useState('');
  const [date,setDate]=useState('');
  const [shell,setShell]=useState<EggClass>('STANDARD');
  const [reason,setReason]=useState('');
  const [planDocument,setPlanDocument]=useState('');
  const [planOptions,setPlanOptions]=useState<PlanOption[]>([]);
  const [items,setItems]=useState<Item[]>([{gradeCode:'',specCode:''}]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [preview,setPreview]=useState<PreviewItem[]|null>(null);
  const [decisionReasons,setDecisionReasons]=useState<Record<string,string>>({});
  const [creatingKey,setCreatingKey]=useState('');
  const keys=useRef(new Map<string,string>());
  const label=(value:EggClass|null) => value==='STANDARD' ? t('eggSources.standard','普通蛋')
    : value==='RED' ? t('eggSources.red','红壳蛋') : value==='PINK' ? t('eggSources.pink','粉壳蛋')
    : t('eggSources.unknown','来源待核实');
  const currentHouse=useRef(house);
  const selectHouse=useCallback((code:string)=>{
    if (currentHouse.current===code) return;
    currentHouse.current=code;
    setHouse(code);
    setTimeline(null);
    setWarehouse('');
    setPlanDocument('');
    setPlanOptions([]);
    setPreview(null);
    setCreatingKey('');
    setError('');
    setNotice('');
  },[]);
  const refresh=useCallback(async (code:string, signal?:AbortSignal)=>{
    if (!code || currentHouse.current!==code) return;
    setError('');
    try {
      const data=await requestEggSourceData<Timeline>(endpoint+'?'+new URLSearchParams({houseCode:code}),
        value=>value.owner?.houseCode===code && typeof value.owner.companyCode==='string' &&
          typeof value.businessDay==='string' && Array.isArray(value.profiles) && value.profiles.every(Boolean) &&
          Array.isArray(value.changes) && value.changes.every(change=>change?.payload &&
            (!change.approval?.snapshot || Array.isArray(change.approval.snapshot.items))),
        invalidResponse,{signal});
      if (!signal?.aborted && currentHouse.current===code) setTimeline(data);
    } catch (e) {
      if (!signal?.aborted && currentHouse.current===code) {
        setTimeline(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  },[invalidResponse]);
  useEffect(()=>{
    if(!permission.canView)return;
    const timer=window.setTimeout(()=>{
      const selected=new URLSearchParams(window.location.search).get('houseCode');
      if(selected)selectHouse(selected);
    },0);
    return()=>window.clearTimeout(timer);
  },[permission.canView,selectHouse]);
  useEffect(()=>{
    if(!house||!date||!permission.canEdit)return;
    const controller=new AbortController();
    const qs=new URLSearchParams({houseCode:house,effectiveDate:date});
    requestEggSourceData<PlanOption[]>(endpoint+'/flock-plans?'+qs,
      options=>Array.isArray(options) && options.every(Boolean),invalidResponse,{signal:controller.signal})
      .then(options=>{if(!controller.signal.aborted)setPlanOptions(options);})
      .catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error ? error.message : String(error));});
    return()=>controller.abort();
  },[house,date,permission.canEdit,invalidResponse]);
  useEffect(()=>{
    if(!house||!permission.canView)return;
    const controller=new AbortController();
    const timer=window.setTimeout(()=>void refresh(house,controller.signal),0);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[house,permission.canView,refresh]);

  const input={houseCode:house,effectiveDate:date,targetClass:shell,warehouseCode:warehouse,
    reason:reason.trim(),requirements:items,planDocument:planDocument.trim()||null};
  const ready=!!house&&!!timeline&&date>timeline.businessDay&&!!warehouse&&!!reason.trim()
    &&items.every(item=>item.gradeCode&&item.specCode);
  function changeItem(index:number, value:Partial<Item>) {
    setPreview(null);
    setItems(previous=>previous.map((item,i)=>i!==index?item:{...item,...value}));
  }
  async function perform(work:()=>Promise<void>) {
    if (busy) return;
    setBusy(true);setError('');setNotice('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready||!permission.canEdit) return;
    void perform(async()=>{
      const key=creatingKey||crypto.randomUUID();
      setCreatingKey(key);
      await request(endpoint+'/changes',{method:'POST',body:JSON.stringify({...input,actionKey:key})});
      setCreatingKey('');setReason('');setPreview(null);await refresh(house);
      setNotice(t('eggSources.saved','申请草稿已保存'));
    });
  }
  function act(change:Change, action:string, review:boolean) {
    void perform(async()=>{
      const reason=decisionReasons[change.id]?.trim() || null;
      const signature=JSON.stringify([change.id,change.version,action,reason]);
      const key=keys.current.get(signature)||crypto.randomUUID();
      keys.current.set(signature,key);
      await request(endpoint+'/changes/'+change.id+(review?'/reviews/':'/actions/')+action,
        {method:'POST',body:JSON.stringify({actionKey:key,version:change.version,planDigest:change.approval?.planDigest,reason})});
      keys.current.delete(signature);await refresh(house);
      setNotice(t('eggSources.actionSaved','已记录操作与回执'));
    });
  }

  return <div className={s.page}>
    <PageHeader title={t('eggSources.title','蛋品来源档案')} breadcrumb={[t('md.center','主数据中心'),t('eggSources.title','蛋品来源档案')]} />
    {error&&<p role="alert" className={s.notice}>{error}</p>}
    {notice&&<p role="status" className={s.notice}>{notice}</p>}
    {permission.canView&&<section className={s.card}>
      <label className={s.field}>{t('eggSources.house','鸡舍')}
        <HouseSelector value={house} disabled={busy} onChange={selectHouse} />
      </label>
      {house&&!timeline&&error&&<button type="button" disabled={busy} onClick={()=>void perform(()=>refresh(house))}>
        {t('common.retry','重试')}
      </button>}
      {timeline&&<><p>{timeline.owner.companyCode} · {timeline.owner.siteCode} · {timeline.businessDay} ({timeline.zone})</p>
        <div className={s.scroll}><table className={s.table}><thead><tr>
          <th>{t('eggSources.shell','商品壳色')}</th><th>{t('eggSources.start','生效日')}</th>
          <th>{t('eggSources.end','到期日')}</th><th>{t('eggSources.status','状态')}</th>
        </tr></thead><tbody>{timeline.profiles.map(profile=><tr key={profile.profile_code}>
          <td>{label(profile.shellClass)}</td><td>{profile.effective_date}</td><td>{profile.expire_date||'—'}</td>
          <td>{t(`eggSources.status.${profile.status}`,profile.status)}</td>
        </tr>)}</tbody></table></div></>}
    </section>}
    {timeline&&permission.canEdit&&<form className={s.card} onSubmit={submit}>
      <h2>{t('eggSources.new','首次建档或按日改色')}</h2>
      <div className={s.grid}>
        <label className={s.field}>{t('eggSources.start','生效日')}<input type="date" required value={date} onChange={e=>{setDate(e.target.value);setPlanDocument('');setPlanOptions([]);setPreview(null);}} /></label>
        <label className={s.field}>{t('eggSources.shell','商品壳色')}<select value={shell} onChange={e=>{setShell(e.target.value as EggClass);setPreview(null);}}>
          {shellClasses.map(value=><option key={value} value={value}>{label(value)}</option>)}
        </select></label>
        <label className={s.field}>{t('eggSources.warehouse','目标仓库')}
          <WarehouseSelector value={warehouse} companyCode={timeline.owner.companyCode} siteCode={timeline.owner.siteCode} onChange={value=>{setWarehouse(value);setPreview(null);}}/>
        </label>
        <label className={s.field}>{t('eggSources.changeDoc','关联入栏或转舍计划（可选）')}
          <select value={planDocument} onChange={event=>{setPlanDocument(event.target.value);setPreview(null);}}>
            <option value="">{t('eggSources.noPlan','本次未关联入栏或转舍计划')}</option>
            {planOptions.map(plan=><option key={plan.id} value={plan.id}>{plan.flock_no} · {t(`eggSources.plan.${plan.kind}`,plan.kind)} · {t(`eggSources.status.${plan.status}`,plan.status)}</option>)}
          </select>
        </label>
      </div>
      {items.map((item,index)=><div className={s.grid} key={index}>
        <label className={s.field}>{t('eggSources.grade','等级')}<select required value={item.gradeCode}
          onChange={event=>changeItem(index,{gradeCode:event.target.value})}>
          <option value="">{t('eggSources.choose','请选择')}</option>
          {grades.map(grade=><option value={grade.grade_code} key={grade.grade_code}>{grade.grade_name}</option>)}
        </select></label>
        <label className={s.field}>{t('eggSources.spec','规格')}<SpecSelector value={item.specCode} onChange={code=>changeItem(index,{specCode:code})}/></label>
        <button type="button" disabled={items.length===1 || busy} onClick={()=>{setPreview(null);setItems(previous=>previous.filter((_,i)=>i!==index));}}>
          {t('eggSources.remove','删除一行')}
        </button>
      </div>)}
      <button type="button" disabled={busy||items.length>=96} onClick={()=>{setPreview(null);setItems(previous=>[...previous,{gradeCode:'',specCode:''}]);}}>
        {t('eggSources.add','添加等级与规格')}
      </button>
      <label className={s.field}>{t('eggSources.reason','依据')}<textarea required maxLength={2000} value={reason}
        onChange={e=>{setReason(e.target.value);setPreview(null);}} /></label>
      <div className={s.actions}>
        <button type="button" disabled={busy||!ready} onClick={()=>void perform(async()=>{
          const data=await requestEggSourceData<{verified:{items:PreviewItem[]}}>(endpoint+'/preview',
            value=>Array.isArray(value.verified?.items) && value.verified.items.every(Boolean),
            invalidResponse,{method:'POST',body:JSON.stringify(input)});
          setPreview(data.verified.items);
        })}>{t('eggSources.preview','预检 SKU 与库存范围')}</button>
        <button type="submit" disabled={busy||!ready}>{t('eggSources.save','保存草稿')}</button>
      </div>
      {preview&&<ul>{preview.map(item=><li key={item.skuCode}>{item.productCode} · {item.skuCode}</li>)}</ul>}
    </form>}
    {timeline&&<section className={s.card}>
      <h2>{t('eggSources.changes','来源变更申请')}</h2>
      {timeline.changes.map(change=><div className={s.card} key={change.id}>
        <p>{change.effective_date} · {label(change.target_class)} · {change.payload.warehouseCode} · {t(`eggSources.status.${change.state}`,change.state)}</p>
        <p>{change.payload.reason}</p>
        {change.approval?.snapshot&&<ul>{change.approval.snapshot.items.map(item=>
          <li key={item.skuCode}>{item.productCode} · {item.gradeCode} · {item.specCode} · {item.skuCode}</li>)}</ul>}
        {['SUBMITTED','APPROVED','REVOKE_REQUESTED'].includes(change.state)&&<label className={s.field}>
          {t('eggSources.decision','审核或撤销依据')}<input value={decisionReasons[change.id]??''}
            onChange={event=>setDecisionReasons(old=>({...old,[change.id]:event.target.value}))}/></label>}
        <div className={s.actions}>
          {permission.canEdit&&change.state==='DRAFT'&&<button disabled={busy} onClick={()=>act(change,'submit',false)}>{t('eggSources.submit','提交审核')}</button>}
          {permission.canEdit&&['DRAFT','SUBMITTED'].includes(change.state)&&<button disabled={busy} onClick={()=>act(change,'cancel',false)}>{t('eggSources.cancel','取消申请')}</button>}
          {permission.canApprove&&change.state==='SUBMITTED'&&<>
            <button disabled={busy} onClick={()=>act(change,'approve',true)}>{t('eggSources.approve','批准')}</button>
            <button disabled={busy||!decisionReasons[change.id]?.trim()} onClick={()=>act(change,'reject',true)}>{t('eggSources.reject','驳回')}</button>
          </>}
          {permission.canEdit&&change.state==='APPROVED'&&change.effective_date>timeline.businessDay
            &&<button disabled={busy||!decisionReasons[change.id]?.trim()} onClick={()=>act(change,'request-revoke',false)}>{t('eggSources.requestRevoke','申请撤销排期')}</button>}
          {permission.canApprove&&change.state==='REVOKE_REQUESTED'&&<>
            <button disabled={busy||!decisionReasons[change.id]?.trim()} onClick={()=>act(change,'revoke',true)}>{t('eggSources.revoke','批准撤销')}</button>
            <button disabled={busy||!decisionReasons[change.id]?.trim()} onClick={()=>act(change,'decline-revoke',true)}>{t('eggSources.declineRevoke','驳回撤销')}</button>
          </>}
        </div>
      </div>)}
    </section>}
  </div>;
}
