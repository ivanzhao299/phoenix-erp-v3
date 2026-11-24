'use client';
import {downloadProtectedPdf} from '@/lib/attachments';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import request,{farmProductionApi} from '@/lib/api-client';
import {useLanguage} from '@/contexts/LanguageContext';
import {usePermission} from '@/hooks/usePermission';
import {DictSelect} from '@/components/shared-selectors/DictSelect';
import {useDictOptions} from '@/hooks/useDictOptions';
import FlockBreedConfirmation from '@/components/breeding/FlockBreedConfirmation';
import {SupplierSelector,CustomerSelector,UserSelector,FarmSelector,GradeSelector} from '@/components/shared-selectors/MasterDataSelectors';
import {AttachmentUploader} from '@/components/design-system/forms/AttachmentUploader';
import css from './FlockLifecycle.module.css';

type Row=Record<string,unknown>;
type Doc=Row&{id:string;kind:string;status:string;version:number;house_code:string;flock_no:string;created_by:string;payload:Row;breed_confirmation_required?:boolean};
const endpoint='/v3/farm/flock-lifecycle';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
const kindNames:Record<string,string>={REPORT_CORRECTION:'历史日报更正与补录',TRANSFER_IN:'整群转入',TRANSFER_OUT:'整群转出',REVERSE_MORTALITY:'冲销死亡',REVERSE_CULL:'冲销淘汰',REVERSE_ADJUST:'冲销盘点',BASELINE:'历史实盘接续',ADMIT:'入栏',MORTALITY:'死亡处置',CULL:'淘汰移出待售',SELL_HELD:'待售鸡交付结算',TRANSFER:'整群转舍',ADJUST:'盘点调整',REVERSE:'冲销更正',CLOSE:'关闭鸡群',CLEAN_START:'开始清舍',CLEAN_ACCEPT:'清舍验收',HISTORY_AUTH:'历史期间更正授权'};
const stateNames:Record<string,string>={DRAFT:'草稿',SUBMITTED:'待审核',APPROVED:'已审核',POSTED:'已过账',CANCELLED:'已取消',OCCUPIED:'在栏',DIRTY:'待清舍',CLEANING:'清舍中',READY:'可入栏'};
const entryHints: Record<string,string> = {
  FIRST_CLEAN:'flockEntry.firstClean', DIRTY:'flockEntry.dirty', CLEANING:'flockEntry.cleaning', OCCUPIED:'flockEntry.occupied',
  HISTORY_REVIEW:'flockEntry.historyReview', INACTIVE:'flockEntry.inactive',
};
const readyForEntry=(house: Row)=>house.entry_readiness==='READY'
  || (house.entry_readiness===undefined && house.status==='ACTIVE' && house.state==='READY' && !house.turnaround_history_review);
const blank=()=>({finalProductionStatus:'REPORTED',dailyLogId:'0',expectedReportHash:'ABSENT',reportFeed:'',reportWater:'',reportNotes:'',addGrade:'',kind:'MORTALITY',houseCode:'',flockNo:'',businessDate:today(),quantity:'',reason:'',responsible:'',
  sourceKind:'SUPPLIER',sourceFarmCode:'',sourceReceipt:'',sourceCode:'',breedCode:'',placementAge:'',plannedEliminationDate:'',targetHouseCode:'',positionCode:'',heldId:'',salesRef:'',
  disposalMethod:'',receiver:'',differenceReceipt:'',periodApprovalRef:'',originalDocumentId:'',replacementKind:'',replacementQuantity:'',
  customerCode:'',currencyCode:'',unitPrice:'',periodFrom:'',periodTo:'',authorizedSourceKey:''});
function specificFields(detail:Row):Record<string,unknown>{
  const p=detail.payload as Row;const type=String(detail.kind);
  const byType:Record<string,Record<string,unknown>>={
    BASELINE:{实盘数量:p.quantity,核对时系统旧余额:p.expectedLegacyQty,实际责任人:p.responsible,差异处理回执:p.differenceReceipt},
    ADMIT:{来源类型:p.sourceKind==='INTERNAL'?'内部育成交接':'外购供应商',来源供应商:p.sourceCode,内部来源农场:p.sourceFarmCode,实际交接单号:p.sourceReceipt,遗传品种:p.breedCode,入栏日龄:p.placementAge,计划淘汰日期:p.plannedEliminationDate},
    MORTALITY:{处置方式:p.disposalMethod,接收确认人:p.receiver,实际责任人:p.responsible},
    CULL:{待售实际安置位置:p.positionCode,实际责任人:p.responsible},
    SELL_HELD:{待售批次:p.heldId,客户:p.customerCode,币种:p.currencyCode,每羽单价:p.unitPrice,交付结算金额:Number(p.unitPrice)*Number(p.quantity),客户签收人:p.receiver,客户签收回执:p.salesRef,财务处理:'待财务审核入账；此单不表示已经收款'},
    TRANSFER:{转出鸡舍:detail.house_code,目标空舍:p.targetHouseCode,数量口径:'过账时全群余额，不支持部分转入或混群'},
    REVERSE:{原过账单:p.originalDocumentId,重记类型:kindNames[String(p.replacementKind)]??'不重记',重记数量或差额:p.replacementQuantity,更正待售去向:p.positionCode,更正处置方式:p.disposalMethod,更正接收人:p.receiver,差异处理回执:p.differenceReceipt},
    ADJUST:{实际盘点差额:p.quantity,责任人:p.responsible,差异处理回执:p.differenceReceipt},
    CLOSE:{关闭条件:'存栏归零、未完业务/免疫及疗程休药处理完成'},
    CLEAN_START:{工作依据:p.reason},CLEAN_ACCEPT:{验收人:p.responsible,验收依据:p.reason},
    HISTORY_AUTH:{受影响原日期起:p.periodFrom,受影响原日期止:p.periodTo,绑定更正业务来源:p.authorizedSourceKey},
  };
  return byType[type]??{};
}
export default function FlockLifecycle(){
  const {user}=usePermission('MENU_FARM_DATA');
  return <ActorLifecycle key={String(user.userId??user.id??user.username??'')}/>;
}
function ActorLifecycle(){
  const {t}=useLanguage();
  const access=usePermission('MENU_FARM_DATA');
  const [confirmFlockNo,setConfirmFlockNo]=useState('');
  const {optionPairs:breedOptions,loading:breedsLoading}=useDictOptions('BRD_BREED');
  const [review,setReview]=useState<{house:string;date:string}|null>(null);
  const vetAccess=usePermission('MENU_FARM_VET');
  const cleanAccess=usePermission('MENU_FLOCK_CLEAN');
  const createAccess=usePermission('MENU_FLOCK_CREATE');const approveAccess=usePermission('MENU_FLOCK_APPROVE');const postAccess=usePermission('MENU_FLOCK_POST');
  const [houses,setHouses]=useState<Row[]>([]),[balances,setBalances]=useState<Row[]>([]),[held,setHeld]=useState<Row[]>([]),[legacy,setLegacy]=useState<Row[]>([]);
  const [occupancies,setOccupancies]=useState<Row[]>([]);
  const [reports,setReports]=useState<Row[]>([]),[reportGrades,setReportGrades]=useState<Record<string,string>>({});
  const [care,setCare]=useState<{plans:Row[];medications:Row[]}>({plans:[],medications:[]});const [actualHeads,setActualHeads]=useState<Record<string,string>>({});
  const [docs,setDocs]=useState<Doc[]>([]),[form,setForm]=useState(blank),[evidence,setEvidence]=useState<string[]>([]);
  const [previewUrl,setPreviewUrl]=useState('');
  useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);},[previewUrl]);
  const [sourceKey,setSourceKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[detail,setDetail]=useState<Row|null>(null);
  const loadData=useCallback(()=>Promise.all([
      request<{data:Row[]}>(`${endpoint}/houses`),request<{data:Row[]}>(`${endpoint}/balances`),request<{data:Row[]}>(`${endpoint}/held`),
      request<{data:Doc[]}>(`${endpoint}/documents`),request<{data:Row[]}>('/crud/brd_flocks?limit=1000'),request<{data:Row[]}>(`${endpoint}/reports`),request<{data:Row[]}>(`${endpoint}/occupancies`)]),[]);
  const linked=useRef(false);
  const applyData=useCallback(([h,b,l,d,f,r,o]:Awaited<ReturnType<typeof loadData>>)=>{
    setHouses(h.data);setBalances(b.data);setHeld(l.data);setDocs(d.data);setLegacy(f.data??[]);setReports(r.data);setOccupancies(o.data);setSourceKey(p=>p||crypto.randomUUID());
    if(linked.current)return;
    linked.current=true;
    const query=new URLSearchParams(location.search), houseCode=query.get('houseCode'), date=query.get('date'),kind=query.get('kind');
    if(query.get('review')==='pending')setReview({house:houseCode??'',date:date??''});
    const house=h.data.find(row=>row.house_code===houseCode);
    if(!house||!houseCode||!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    if(kind==='MORTALITY')setForm({...blank(),kind,houseCode,businessDate:date,flockNo:String(house.flock_no??'')});
    if(kind==='REPORT_CORRECTION'){
      const matches=r.data.filter(row=>row.house_code===houseCode&&String(row.log_date).slice(0,10)===date
        &&(!query.has('dailyLogId')||String(row.id)===query.get('dailyLogId'))&&(!query.has('shift')||row.shift===query.get('shift')));
      if(matches.length===1){const report=matches[0];setForm({...blank(),kind,houseCode,businessDate:date,flockNo:String(report.flock_no),dailyLogId:String(report.id),
        expectedReportHash:String(report.report_hash),reportFeed:String(report.feed_consumed??''),reportWater:String(report.water_consumed??''),reportNotes:String(report.notes??'')});
        setReportGrades(Object.fromEntries(Object.entries((report.eggs_by_grade??{}) as Row).map(([k,v])=>[k,String(v)])));
      }else{setMessage(t('productionJobs.selectReport'));setForm({...blank(),kind,houseCode,businessDate:date,flockNo:String(house.flock_no??'')});}
    }
  },[t]);
  const refresh=useCallback(async()=>applyData(await loadData()),[loadData,applyData]);
  useEffect(()=>{let alive=true;loadData().then(data=>{if(alive)applyData(data);}).catch(e=>{if(alive)setMessage(e.message);});return()=>{alive=false;};},[loadData,applyData]);
  useEffect(()=>{if(!vetAccess.canView)return;let alive=true;request<{data:{plans:Row[];medications:Row[]}}>(`${endpoint}/care`).then(r=>{if(alive)setCare(r.data);}).catch(e=>{if(alive)setMessage(e.message);});return()=>{alive=false;};},[vetAccess.canView,docs]);
  const house=houses.find(h=>h.house_code===form.houseCode);
  const balance=balances.find(b=>b.flock_no===form.flockNo);
  const oldFlock=legacy.find(b=>b.flock_no===form.flockNo);
  const selectedBaselineBreedNeedsReview=form.kind==='BASELINE'&&Boolean(oldFlock)&&(!String(oldFlock?.breed_code??'').trim()||(!breedsLoading&&!breedOptions.some(o=>o.value===oldFlock?.breed_code)));
  const heldRow=held.find(b=>b.id===form.heldId);
  const flockOptions=useMemo(()=>[...new Map([...balances,...legacy,...occupancies].filter(f=>f.house_code===form.houseCode).map(b=>[String(b.flock_no),b])).values()], [balances,legacy,occupancies,form.houseCode]);
  const field=(name:keyof ReturnType<typeof blank>,value:string)=>{setForm(p=>({...p,[name]:value}));setSourceKey(crypto.randomUUID());};
  const chooseHouse=(code:string)=>{
    const h=houses.find(x=>x.house_code===code);const flock=h?.flock_no??legacy.find(x=>x.house_code===code&&x.status!=='RETIRED')?.flock_no??'';
    setForm(p=>({...p,houseCode:code,flockNo:String(flock),targetHouseCode:'',heldId:'',originalDocumentId:'',dailyLogId:'0',expectedReportHash:'ABSENT'}));setEvidence([]);setSourceKey(crypto.randomUUID());
  };
  const entryHint=(target?:Row)=>{
    const key=entryHints[String(target?.entry_readiness)];
    return key?t(key):'';
  };
  const prepareHouse=(target:Row)=>{
    const initial=blank();
    const hasUnsavedInput=evidence.length>0||Object.keys(reportGrades).length>0||
      (Object.keys(form) as (keyof typeof form)[]).some(key=>!['kind','houseCode','flockNo'].includes(key)&&form[key]!==initial[key]);
    if (hasUnsavedInput&&!window.confirm(t('flockEntry.replaceDraft'))) return;
    setReportGrades({});
    const kind=target.entry_readiness==='CLEANING'?'CLEAN_ACCEPT':'CLEAN_START';
    setForm({...blank(),kind,houseCode:String(target.house_code)});
    setEvidence([]);
    setSourceKey(crypto.randomUUID());
    document.getElementById('flock-new-document')?.scrollIntoView({block:'start'});
  };
  const hasCleanAction=(target?:Row)=>createAccess.canEdit&&cleanAccess.canApprove&&
    ['FIRST_CLEAN','DIRTY','CLEANING'].includes(String(target?.entry_readiness));
  const cleanActionLabel=(target:Row)=>target.entry_readiness==='CLEANING'?t('flockEntry.acceptAction'):t('flockEntry.cleanAction');
  const entryDocumentHint=(d:Doc,target?:Row)=>{
    if (!target || !['ADMIT','TRANSFER'].includes(d.kind) || !['DRAFT','SUBMITTED','APPROVED'].includes(d.status)) return '';
    if (!readyForEntry(target)) return entryHint(target);
    if (target.entry_readiness!==undefined && target.max_capacity==null) return t('flockEntry.capacity');
    if (d.kind==='ADMIT' && Number(target.house_version)!==d.payload.expectedHouseVersion) return t('flockEntry.versionChanged');
    return '';
  };
  const run=async(fn:()=>Promise<unknown>,ok:string)=>{setBusy(true);setMessage('');try{await fn();await refresh();setMessage(ok);}catch(e){setMessage(e instanceof Error?e.message:'操作失败，请核对');}finally{setBusy(false);}};
  const submit=()=>run(async()=>{
    if(!house)throw new Error('请选择有效鸡舍');
    if(['BASELINE','ADMIT','MORTALITY','CULL','SELL_HELD','ADJUST'].includes(form.kind)&&form.quantity.trim()==='')throw new Error('请明确填写实际数量；真实零须显式输入0');
    if(form.kind==='ADMIT'&&form.placementAge.trim()==='')throw new Error('请填写真实入栏日龄');
    const body:Row={kind:form.kind,sourceKey,houseCode:form.houseCode,flockNo:form.flockNo,businessDate:form.businessDate,
      expectedVersion:Number(balance?.version??0),reason:form.reason};
    if(['BASELINE','ADMIT','MORTALITY','CULL','SELL_HELD','ADJUST'].includes(form.kind))body.quantity=Number(form.quantity);
    if(['CLEAN_START','CLEAN_ACCEPT','ADMIT'].includes(form.kind))body.expectedHouseVersion=Number(house.house_version??0);
    if(form.kind==='BASELINE')body.expectedLegacyQty=Number(oldFlock?.current_qty);
    if(evidence.length)body.evidence=evidence;
    if(form.responsible)body.responsible=form.responsible;
    if(form.kind==='REPORT_CORRECTION'){body.dailyLogId=Number(form.dailyLogId);body.expectedReportHash=form.expectedReportHash;body.correction={eggsByGrade:Object.fromEntries(Object.entries(reportGrades).map(([k,v])=>[k,Number(v)])),feedConsumed:form.reportFeed===''?null:Number(form.reportFeed),waterConsumed:form.reportWater===''?null:Number(form.reportWater),notes:form.reportNotes};}
    const fields:Record<string,string[]>={ADMIT:['sourceKind','sourceFarmCode','sourceCode','sourceReceipt','breedCode','plannedEliminationDate'],MORTALITY:['disposalMethod','receiver'],CULL:['positionCode'],
      SELL_HELD:['heldId','salesRef','customerCode','currencyCode','receiver'],TRANSFER:['targetHouseCode'],REVERSE:['originalDocumentId','replacementKind','positionCode','disposalMethod','receiver'],
      HISTORY_AUTH:['periodFrom','periodTo','authorizedSourceKey']};
    for(const key of [...(fields[form.kind]??[]),...(['REPORT_CORRECTION','BASELINE','ADJUST','REVERSE'].includes(form.kind)?['differenceReceipt']:[]), 'periodApprovalRef']) {
      const val=form[key as keyof typeof form];if(val)body[key]=val;
    }
    if(form.kind==='CLOSE')body.finalProductionStatus=form.finalProductionStatus;
    if(form.kind==='SELL_HELD'){body.expectedHeldVersion=Number(heldRow?.version);body.unitPrice=Number(form.unitPrice);}
    if(form.kind==='ADMIT')body.placementAge=Number(form.placementAge);
    if(form.kind==='REVERSE'&&form.replacementKind)body.replacementQuantity=Number(form.replacementQuantity);
    await request(`${endpoint}/documents`,{method:'POST',body:JSON.stringify(body)});
    setForm(blank());setEvidence([]);setSourceKey(crypto.randomUUID());
  },'单据已保存，请提交并由另一人审核后过账。');
  const showDetail=(id:string)=>run(async()=>{const r=await request<{data:Row}>(`${endpoint}/documents/${encodeURIComponent(id)}`);setDetail(r.data);},'已加载原单、事件与审核记录。');
  if(!access.canView)return <p role="alert">当前账号没有鸡群管理查看权限。</p>;
  return <main className={css.root}>
    <h1>鸡群生命周期</h1>
    {confirmFlockNo&&<FlockBreedConfirmation key={confirmFlockNo} flockNo={confirmFlockNo} onClose={()=>setConfirmFlockNo('')}
      onConfirmed={({receiptId})=>{
        setConfirmFlockNo('');
        const confirmation = receiptId
          ? t('breeding.breed.confirmedReceipt', '品种已确认，审计编号 {id}').replace('{id}', receiptId)
          : t('breeding.breed.confirmed', '品种已确认');
        void refresh().then(() => setMessage(`${confirmation} · ${t('breeding.breed.resumeDocument', '可继续处理原单。')}`))
          .catch(() => setMessage(t('breeding.breed.refreshAfterConfirmation', '品种已确认，请刷新单据与审核时间线。')));
      }}/>}

    <p>{t('flockEntry.instructions')}</p>
    <nav className={css.actions}><a href="/breeding/flock">鸡群档案</a><a href="/mobile/mortality">移动死淘汇总</a><button disabled={busy} onClick={()=>run(refresh,'已刷新。')}>刷新</button>
      {access.isSuper&&<button disabled={busy} onClick={()=>run(()=>request(`${endpoint}/provision-actions`,{method:'POST',body:'{}'}),'权限项已注册，请在角色管理分别授权并重新登录。')}>注册角色动作权限</button>}</nav>
    {message&&<p role="status" className={css.message}>{message}</p>}
    <section className={css.cards} aria-label="鸡舍占栏看板">{houses.map(h=>{
      const first=h.entry_readiness==='FIRST_CLEAN', empty=first||readyForEntry(h)||['DIRTY','CLEANING'].includes(String(h.entry_readiness));
      return <article key={String(h.house_code)}>
        <strong>{String(h.house_name??h.house_code)}</strong><p>{String(h.company_code)} / {String(h.farm_code)}</p>
        <p>{first?t('flockEntry.newEmpty'):stateNames[String(h.state)]??'未接续'} · 存栏 <span data-i18n-skip="true">{h.quantity==null?(empty?'0':'待实盘'):String(h.quantity)}</span> / 容量 {String(h.max_capacity??'待核实')}</p>
        <small>{h.flock_no?`当前群 ${String(h.flock_no)}`:`历史在栏档案 ${String(h.legacy_flocks)}`}</small>
        {h.entry_readiness!=='OCCUPIED'&&entryHint(h)&&<p>{entryHint(h)}</p>}
        <button disabled={busy} onClick={()=>chooseHouse(String(h.house_code))}>选择此舍</button>
        {hasCleanAction(h)&&<button disabled={busy} onClick={()=>prepareHouse(h)}>{cleanActionLabel(h)}</button>}
      </article>;
    })}</section>
    {createAccess.canEdit&&<section id="flock-new-document" aria-label="生命周期制单" className={css.panel}><h2>新建业务单据</h2>
      <p>当前余额与版本自动带出，过账时再次校验。失败后可重试同一内容；修改内容会创建新来源。</p>
      <div className={css.grid}>
        <label>业务类型<DictSelect ariaLabel="业务类型" dictType="BRD_LIFECYCLE_KIND" value={form.kind} onChange={v=>field('kind',v)} allowEmpty={false}/></label>
        <label>鸡舍<select aria-label="鸡舍" value={form.houseCode} onChange={e=>chooseHouse(e.target.value)}><option value="">请选择鸡舍</option>{houses.filter(h=>h.status==='ACTIVE').map(h=><option key={String(h.house_code)} value={String(h.house_code)}>{String(h.house_name)}（{String(h.house_code)}）</option>)}</select></label>
        {!['ADMIT','CLEAN_START','CLEAN_ACCEPT'].includes(form.kind)&&<label>鸡群<select aria-label="鸡群" value={form.flockNo} onChange={e=>field('flockNo',e.target.value)}><option value="">请选择已核实鸡群</option>{flockOptions.filter(f=>f.house_code===form.houseCode||f.flock_no===form.flockNo).map(f=><option key={String(f.flock_no)} value={String(f.flock_no)}>{String(f.flock_no)}</option>)}</select></label>}
        <label>业务日期<input type="date" readOnly={form.kind==='REPORT_CORRECTION'&&form.dailyLogId!=='0'} value={form.businessDate} onChange={e=>field('businessDate',e.target.value)}/></label>
        {['BASELINE','ADMIT','MORTALITY','CULL','SELL_HELD','ADJUST'].includes(form.kind)&&<label>{form.kind==='ADJUST'?'实盘差额（可正可负）':'实际数量（羽）'}<input type="number" step="1" value={form.quantity} onChange={e=>field('quantity',e.target.value)}/></label>}
        <label>当前存栏<input readOnly value={balance?String(balance.quantity):house&&(['FIRST_CLEAN','DIRTY','CLEANING'].includes(String(house.entry_readiness))||readyForEntry(house))?'0':'未接续，须实盘签认'}/></label>
        {form.kind==='ADMIT'&&<><label>来源类型<DictSelect ariaLabel="来源类型" dictType="BRD_FLOCK_SOURCE" value={form.sourceKind} onChange={v=>{setForm(p=>({...p,sourceKind:v,sourceCode:'',sourceFarmCode:'',sourceReceipt:''}));setSourceKey(crypto.randomUUID());}} allowEmpty={false}/></label>{form.sourceKind==='SUPPLIER'?<label>来源供应商<SupplierSelector ariaLabel="来源供应商" value={form.sourceCode} onChange={v=>field('sourceCode',v)}/></label>:<label>内部育成来源农场<FarmSelector ariaLabel="内部育成来源农场" value={form.sourceFarmCode} onChange={v=>field('sourceFarmCode',v)}/></label>}<label>实际来源交接单号<input value={form.sourceReceipt} onChange={e=>field('sourceReceipt',e.target.value)}/></label><label>遗传品种<DictSelect ariaLabel="遗传品种" dictType="BRD_BREED" value={form.breedCode} onChange={v=>field('breedCode',v)}/></label><label>入栏日龄<input type="number" min="0" value={form.placementAge} onChange={e=>field('placementAge',e.target.value)}/></label><label>计划淘汰日期<input type="date" value={form.plannedEliminationDate} onChange={e=>field('plannedEliminationDate',e.target.value)}/></label></>}
        {['MORTALITY','REVERSE'].includes(form.kind)&&<><label>处置方式<input value={form.disposalMethod} onChange={e=>field('disposalMethod',e.target.value)} placeholder="实际处置与确认依据"/></label><label>处置接收人<input value={form.receiver} onChange={e=>field('receiver',e.target.value)}/></label></>}
        {['CULL','REVERSE'].includes(form.kind)&&<label>待售实际位置<input value={form.positionCode} onChange={e=>field('positionCode',e.target.value)} placeholder="鸡只实际安置位置说明"/></label>}
        {form.kind==='TRANSFER'&&<label>目标空舍<select value={form.targetHouseCode} onChange={e=>field('targetHouseCode',e.target.value)}><option value="">{t('flockEntry.pickTransfer')}</option>{houses.filter(h=>h.company_code===house?.company_code&&h.house_code!==form.houseCode&&readyForEntry(h)&&h.max_capacity!=null).map(h=><option key={String(h.house_code)} value={String(h.house_code)}>{String(h.house_name)}</option>)}</select></label>}
        {form.kind==='SELL_HELD'&&<><label>待售批次<select value={form.heldId} onChange={e=>{const r=held.find(x=>x.id===e.target.value);setForm({...blank(),kind:'SELL_HELD',heldId:e.target.value,flockNo:String(r?.flock_no??''),houseCode:String(r?.house_code??'')});setEvidence([]);setSourceKey(crypto.randomUUID());}}><option value="">请选择真实待售余额</option>{held.filter(h=>Number(h.quantity)>0).map(h=><option key={String(h.id)} value={String(h.id)}>{String(h.flock_no)} / {String(h.position_code)} / {String(h.quantity)}羽</option>)}</select></label>
          <label>客户<CustomerSelector ariaLabel="客户" value={form.customerCode} onChange={v=>field('customerCode',v)}/></label><label>币种<DictSelect ariaLabel="币种" dictType="SYS_CURRENCY" value={form.currencyCode} onChange={v=>field('currencyCode',v)}/></label><label>每羽单价<input type="number" min="0" step="0.01" value={form.unitPrice} onChange={e=>field('unitPrice',e.target.value)}/></label><label>客户签收回执编号<input value={form.salesRef} onChange={e=>field('salesRef',e.target.value)}/></label><label>客户签收人<input value={form.receiver} onChange={e=>field('receiver',e.target.value)}/></label></>}
        {form.kind==='REVERSE'&&<><label>原过账单<select value={form.originalDocumentId} onChange={e=>{const d=docs.find(x=>x.id===e.target.value);setForm({...blank(),kind:'REVERSE',originalDocumentId:e.target.value,houseCode:d?.house_code??'',flockNo:d?.flock_no??''});setSourceKey(crypto.randomUUID());setEvidence([]);}}><option value="">请选择原单</option>{docs.filter(d=>d.status==='POSTED'&&['MORTALITY','CULL','ADJUST'].includes(d.kind)).map(d=><option key={d.id} value={d.id}>{kindNames[d.kind]} · {d.flock_no} · {String(d.business_date).slice(0,10)} · {String(d.payload.quantity)}</option>)}</select></label>
          <label>同时重记类型<DictSelect dictType="BRD_LIFECYCLE_KIND" allowedValues={['MORTALITY','CULL','ADJUST']} value={form.replacementKind} onChange={v=>field('replacementKind',v)}/></label><label>重记实际数量/差额<input type="number" step="1" value={form.replacementQuantity} onChange={e=>field('replacementQuantity',e.target.value)}/></label></>}
        {['REPORT_CORRECTION','BASELINE','ADJUST','REVERSE'].includes(form.kind)&&<label>差异处理回执<textarea value={form.differenceReceipt} onChange={e=>field('differenceReceipt',e.target.value)}/></label>}
        {form.kind==='CLOSE'&&<label>最后产蛋确认<DictSelect ariaLabel="最后产蛋确认" dictType="BRD_FINAL_PRODUCTION_CONFIRM" value={form.finalProductionStatus} onChange={v=>field('finalProductionStatus',v)} allowEmpty={false}/></label>}
        {form.kind==='REPORT_CORRECTION'&&<><label>原占栏日报<select aria-label="原占栏日报" value={form.dailyLogId} onChange={e=>{if(e.target.value==='0'){setForm(p=>({...p,dailyLogId:'0',expectedReportHash:'ABSENT',reportFeed:'',reportWater:'',reportNotes:''}));setReportGrades({});setSourceKey(crypto.randomUUID());return;}const r=reports.find(x=>String(x.id)===e.target.value);if(!r)return;setForm(p=>({...p,dailyLogId:String(r.id),expectedReportHash:String(r.report_hash),houseCode:String(r.house_code),flockNo:String(r.flock_no),businessDate:String(r.log_date),reportFeed:String(r.feed_consumed??''),reportWater:String(r.water_consumed??''),reportNotes:String(r.notes??'')}));setReportGrades(Object.fromEntries(Object.entries((r.eggs_by_grade??{}) as Record<string,unknown>).map(([k,v])=>[k,String(v)])));setSourceKey(crypto.randomUUID());setEvidence([]);}}><option value="0">所选业务日缺日报 · 独立审批补录</option>{reports.filter(r=>r.house_code===form.houseCode&&r.flock_no===form.flockNo).map(r=><option key={String(r.id)} value={String(r.id)}>{String(r.log_date)} · {String(r.flock_no)} · 原产蛋 {String(r.eggs_produced)}</option>)}</select></label>
          {Object.entries(reportGrades).map(([grade,value])=><label key={grade}>更正分级 {grade}<input type="number" min="0" step="1" value={value} onChange={e=>{setReportGrades(p=>({...p,[grade]:e.target.value}));setSourceKey(crypto.randomUUID());}}/></label>)}
          <label>增加实际等级<GradeSelector ariaLabel="增加实际等级" value={form.addGrade} onChange={v=>{if(v)setReportGrades(p=>({...p,[v]:p[v]??'0'}));field('addGrade',v);}}/></label>
          <label>更正实际饲料（公斤）<input type="number" min="0" step="0.01" value={form.reportFeed} onChange={e=>field('reportFeed',e.target.value)}/></label><label>更正实际用水（升）<input type="number" min="0" step="0.01" value={form.reportWater} onChange={e=>field('reportWater',e.target.value)}/></label><label>更正日报备注<textarea value={form.reportNotes} onChange={e=>field('reportNotes',e.target.value)}/></label><p>原值快照随单保留；审批期间原日报变化会阻止过账。死淘由冲销单更正，库存差异须关联正式库存单据，不会自动补记产蛋入库。</p></>}
        {form.kind==='HISTORY_AUTH'&&<><label>授权影响日起<input type="date" value={form.periodFrom} onChange={e=>field('periodFrom',e.target.value)}/></label><label>授权影响日止<input type="date" value={form.periodTo} onChange={e=>field('periodTo',e.target.value)}/></label><label>待更正业务单据<select value={form.authorizedSourceKey} onChange={e=>field('authorizedSourceKey',e.target.value)}><option value="">请选择待授权单据</option>{docs.filter(d=>d.flock_no===form.flockNo&&d.status!=='POSTED'&&d.status!=='CANCELLED').map(d=><option key={d.id} value={String(d.source_key)}>{kindNames[d.kind]} · {String(d.business_date).slice(0,10)} · {String(d.payload.reason)}</option>)}</select></label></>}
        <label>历史期间批准单（跨月时）<select value={form.periodApprovalRef} onChange={e=>field('periodApprovalRef',e.target.value)}><option value="">当期业务无需选择</option>{docs.filter(d=>d.kind==='HISTORY_AUTH'&&d.status==='POSTED'&&d.flock_no===form.flockNo).map(d=><option key={d.id} value={d.id}>{String(d.payload.periodFrom)} — {String(d.payload.periodTo)}</option>)}</select></label>
        <label>责任人<UserSelector ariaLabel="责任人" value={form.responsible} onChange={v=>field('responsible',v)}/></label>
        <label>业务原因及交接说明<textarea value={form.reason} onChange={e=>field('reason',e.target.value)}/></label>
      </div>
      {form.kind==='ADMIT'&&house&&entryHint(house)&&<p role="status">{entryHint(house)} {t('flockEntry.preSubmit')}</p>}
      {form.kind==='ADMIT'&&house&&readyForEntry(house)&&house.max_capacity==null&&<p role="status">{t('flockEntry.capacity')}</p>}
      {form.kind==='TRANSFER'&&<p>{t('flockEntry.transferHint')}</p>}
      {selectedBaselineBreedNeedsReview&&<p role="status">{t('breeding.breed.draftNeedsConfirmation', '该鸡群的遗传品种标准码待核对。可以先保存草稿，确认品种后再提交。')}
        <button type="button" disabled={busy} onClick={()=>setConfirmFlockNo(form.flockNo)}>{t('ui.核对品种', '核对品种')}</button>
      </p>}
      {house&&<AttachmentUploader value={evidence} onChange={v=>{setEvidence(v);setSourceKey(crypto.randomUUID());}} ownership={{moduleCode:'FLOCK_LIFECYCLE',ownerType:'HOUSE',ownerId:form.houseCode,companyCode:String(house.company_code),storeCode:String(house.site_code??'')}}/>}
      <p>业务来源编号：{sourceKey}（自动生成，供历史授权绑定）</p>
      <button disabled={busy||!form.houseCode} onClick={submit}>保存草稿</button>
    </section>}
    <section id="flock-documents" className={css.panel}><h2>单据与审核时间线</h2><p>制单、审核、过账分开；已过账事实通过冲销保留原单。待售交付生成结算依据，财务另行审核入账。</p>
      {review&&<p>{t('productionJobs.flockReview')} · {review.house} {review.date} <button onClick={()=>setReview(null)}>{t('productionInstallments.history')}</button></p>}
      {docs.filter(d=>!review||['REPORT_CORRECTION','CLOSE'].includes(d.kind)&&['SUBMITTED','APPROVED'].includes(d.status)&&(!review.house||d.house_code===review.house)&&(!review.date||String(d.business_date).slice(0,10)===review.date)).map(d=>{
        const target=houses.find(h=>h.house_code===(d.kind==='TRANSFER'?d.payload.targetHouseCode:d.house_code));
        const hint=entryDocumentHint(d,target);
        const canHandleCleaning=!['CLEAN_START','CLEAN_ACCEPT'].includes(d.kind)||cleanAccess.canApprove;
        const canCancel=createAccess.canEdit&&canHandleCleaning&&(d.status!=='APPROVED'||approveAccess.canApprove);
        return <article className={css.document} key={d.id}><strong>{kindNames[d.kind]??d.kind} · {stateNames[d.status]}</strong><p>{d.flock_no||d.house_code} · {String(d.business_date).slice(0,10)} · {d.payload.quantity==null?'':`${String(d.payload.quantity)}羽`}</p><small>制单人 {d.created_by} · {String(d.payload.reason)}</small>
        {hint&&<p role="status">{hint} {d.status==='APPROVED'&&!canCancel&&t('flockEntry.cancelAccess')}</p>}
        {d.breed_confirmation_required&&<p>{t('breeding.breed.documentNeedsConfirmation', '品种标准码待核对。确认后可继续处理本单。')}</p>}
        <div className={css.actions}><button disabled={busy} onClick={()=>showDetail(d.id)}>原单与事件</button>
          {hint&&target&&hasCleanAction(target)&&<button disabled={busy} onClick={()=>prepareHouse(target)}>{cleanActionLabel(target)}</button>}
          {d.breed_confirmation_required&&<button type="button" disabled={busy} onClick={()=>setConfirmFlockNo(d.flock_no)}>{t('ui.核对品种', '核对品种')}</button>}
          {d.status==='DRAFT'&&createAccess.canEdit&&canHandleCleaning&&<button disabled={busy||d.breed_confirmation_required||Boolean(hint)} onClick={()=>run(()=>request(`${endpoint}/documents/${d.id}/submit`,{method:'POST',body:JSON.stringify({version:d.version})}),'已提交审核。')}>提交</button>}
          {d.status==='SUBMITTED'&&approveAccess.canApprove&&canHandleCleaning&&d.created_by!==access.user.username&&<button disabled={busy||d.breed_confirmation_required||Boolean(hint)} onClick={()=>run(()=>request(`${endpoint}/documents/${d.id}/approve`,{method:'POST',body:JSON.stringify({version:d.version})}),'已审核。')}>审核</button>}
          {d.status==='APPROVED'&&postAccess.canEdit&&canHandleCleaning&&<button disabled={busy||d.breed_confirmation_required||Boolean(hint)} onClick={()=>run(()=>request(`${endpoint}/documents/${d.id}/post`,{method:'POST',body:JSON.stringify({version:d.version})}),'已原子过账。')}>过账</button>}
          {d.status!=='POSTED'&&d.status!=='CANCELLED'&&canCancel&&<button disabled={busy} onClick={()=>run(()=>request(`${endpoint}/documents/${d.id}/cancel`,{method:'POST',body:JSON.stringify({version:d.version})}),'已取消，原单保留。')}>取消</button>}
        </div></article>;})}
    </section>
    {vetAccess.canView&&<section className={css.panel}><h2>免疫与休药承接</h2><p>计划原位置、用药发生位置与当前照管位置分开保留；转舍后由当前群继续承接，休药期蛋品禁止正常入库。</p>
      {care.plans.map(p=><article className={css.document} key={String(p.id)}><strong>{String(p.flock_no)} · {String(p.vaccine_name??p.vaccine_code)} · {String(p.status)}</strong><p>原计划舍 {String(p.house_code)} → 当前舍 {String(p.current_house_code)} · 计划日期 {String(p.plan_date).slice(0,10)}{p.actual_date?` · 实际执行 ${String(p.actual_date).slice(0,10)} / ${String(p.executed_house_code??p.house_code)}`:''}</p>
        {!p.actual_date&&vetAccess.canEdit&&<div className={css.actions}><label>本次实际免疫羽数<input type="number" min="1" step="1" value={actualHeads[String(p.id)]??''} onChange={e=>setActualHeads(prev=>({...prev,[String(p.id)]:e.target.value}))}/></label><button disabled={busy||!actualHeads[String(p.id)]} onClick={()=>run(()=>farmProductionApi.executeImmunePlan(Number(p.id),{actual_heads:Number(actualHeads[String(p.id)])}),'免疫执行已记录，实际位置保留。')}>记录实际执行</button><button disabled={busy} onClick={()=>run(()=>farmProductionApi.cancelImmunePlan(Number(p.id)),'计划已受控取消。')}>取消未完计划</button></div>}
      </article>)}
      {care.medications.map(m=><article className={css.document} key={String(m.id)}><strong>{String(m.flock_no)} · 用药/休药隔离</strong><p>发生时鸡舍 {String(m.house_code)} → 当前照管舍 {String(m.current_house_code)} · 开始 {String(m.start_date).slice(0,10)} · 休药至 {m.withdraw_until?String(m.withdraw_until).slice(0,10):'疗程未结束，须兽医核实'}</p></article>)}
    </section>}
    {detail&&<section className={css.panel} aria-label="单据详情"><h2>{kindNames[String(detail.kind)]} · {stateNames[String(detail.status)]}</h2><button onClick={()=>setDetail(null)}>收起详情</button>
      <dl className={css.grid}>{Object.entries({鸡群:detail.flock_no,鸡舍:detail.house_code,公司:detail.company_code,业务日期:String(detail.business_date).slice(0,10),
        实际数量:String((detail.payload as Row)?.quantity??'—'),业务原因:(detail.payload as Row)?.reason,制单人:detail.created_by,审核人:detail.approved_by,
        过账人:detail.posted_by,过账时间:detail.posted_at,差异处理回执:(detail.payload as Row)?.differenceReceipt,...specificFields(detail)}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{String(value||'—')}</dd></div>)}</dl>
      {detail.kind==='REPORT_CORRECTION'&&(()=>{const p=detail.payload as Row,o=(p.originalReport??{}) as Row,c=p.correction as Row;return <section><h3>日报原值与批准更正</h3><p>{p.originalReport?'稳定原日报':'受控补录（此前无日报）'}编号 {String(p.dailyLogId)} · {String(o.log_date??p.businessDate)} · 原占栏 {String(o.occupancy_id??p.originalOccupancyId)}</p><table><thead><tr><th>字段</th><th>原值</th><th>批准值</th></tr></thead><tbody>{Object.keys({...((o.eggs_by_grade??{}) as Row),...((c.eggsByGrade??{}) as Row)}).map(g=><tr key={g}><td>等级 {g}</td><td>{String(((o.eggs_by_grade??{}) as Row)[g]??0)}</td><td>{String(((c.eggsByGrade??{}) as Row)[g]??0)}</td></tr>)}<tr><td>饲料（公斤）</td><td>{String(o.feed_consumed??'未知')}</td><td>{c.feedConsumed==null?'未知':String(c.feedConsumed)}</td></tr><tr><td>用水（升）</td><td>{String(o.water_consumed??'未知')}</td><td>{c.waterConsumed==null?'未知':String(c.waterConsumed)}</td></tr><tr><td>备注</td><td>{String(o.notes??'')}</td><td>{String(c.notes)}</td></tr></tbody></table></section>;})()}
      {((detail.payload as Row).originalZeroConfirmation as Row|undefined)&&<p>本单明确更正原关闭单 {String(((detail.payload as Row).originalZeroConfirmation as Row).documentId)} 对该业务日的零产蛋声明；原声明保留，实际日报以本次批准结果为准。</p>}
      {((detail.amendments as Row[])??[]).map(a=><p key={String(a.id)}>本单零产蛋声明已由 <button onClick={()=>showDetail(String(a.id))}>历史日报更正 {String(a.id)}</button> 重新签认，差异回执：{String(a.difference_receipt)}</p>)}
      <h3>存栏事件</h3>{((detail.events as Row[])??[]).map(e=><article key={String(e.id)} className={css.document}><strong>{kindNames[String(e.kind)]??String(e.kind)}</strong><p>{String(e.business_date).slice(0,10)} · {String(e.house_code)} · 存栏变动 {Number(e.quantity_delta)>0?'+':''}{String(e.quantity_delta)} 羽 · 过账前 {String(e.document_opening_qty??'待核对')} 羽 → 过账后 {String(e.document_closing_qty??'待核对')} 羽 · 待售变动 {Number(e.held_delta)>0?'+':''}{String(e.held_delta)} 羽</p><small>{String(e.actor)}过账，{String(e.approved_by)}审核</small></article>)}
      <h3>审核记录</h3>{((detail.audits as Row[])??[]).map(a=><p key={String(a.id)}>{({CREATE:'制单',SUBMIT:'提交审核',APPROVE:'审核通过',POST:'过账',CANCEL:'取消'} as Record<string,string>)[String(a.action)]??String(a.action)} · {String(a.actor)} · {new Date(String(a.recorded_at)).toLocaleString('zh-CN',{timeZone:'Asia/Singapore'})}</p>)}
      <h3>业务证据</h3>{(((detail.payload as Row)?.evidence as string[])??[]).map((id,index)=><button key={id} disabled={busy} onClick={()=>run(async()=>{
        const token=sessionStorage.getItem('phoenix_token');const res=await fetch(`/api${endpoint}/documents/${String(detail.id)}/evidence/${encodeURIComponent(id)}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
        if(!res.ok)throw new Error('附件不可访问或已失效，请核对权限');
        const blob=await res.blob();if(!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(blob.type))throw new Error('附件格式不受支持');
        if(blob.type==='application/pdf'){downloadProtectedPdf(blob,`flock-evidence-${index+1}.pdf`);return;}
        setPreviewUrl(URL.createObjectURL(blob));
      },'操作成功')}>查看证据{index+1}</button>)}
    </section>}
    {previewUrl&&<section className={css.panel}><button onClick={()=>setPreviewUrl('')}>关闭附件预览</button><iframe title="业务证据预览" src={previewUrl} sandbox="allow-same-origin" referrerPolicy="no-referrer" style={{width:'100%',height:'70vh',border:0}}/></section>}

  </main>;
}
