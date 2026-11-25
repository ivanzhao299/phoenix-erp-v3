'use client';

import { useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { DataTableV3, DrawerV2, StatusBadge } from '@/components/design-system';
import { AttachmentUploader } from '@/components/design-system/forms/AttachmentUploader';
import { usePermission } from '@/hooks/usePermission';
import { useDictOptions } from '@/hooks/useDictOptions';
import { useLanguage } from '@/contexts/LanguageContext';
import { previewProtectedAttachment } from '@/lib/attachments';
import request, { assertBoundSession, captureBoundSession } from '@/lib/api-client';
import s from '@/components/breeding/ProductionInboundWorkbench.module.css';

const kindLabels={cutover:'financeReview.cutover',reversal:'financeReview.reversal'} as const;
const lineLabels=['financeReview.reference','financeReview.grade','financeReview.quantity','financeReview.unitCost','financeReview.amount'] as const;
const endpoint='/v2/inventory/production-finance-review';
interface Task {id:string;kind:'cutover'|'reversal';document_no:string;state:string;company_code:string;warehouse_code:string;finance_signed:boolean;posting_day?:string;review_state?:string}
type TaskReference=Pick<Task,'id'|'kind'> & Partial<Task>;
type PendingSignature={intentId:string;task:Pick<Task,'id'|'kind'>;params:Record<string,string>;body:Record<string,unknown>};

interface Detail extends Task {
  house?:string; postingDay:string; contentHash:string; snapshotHash?:string; reviewHash?:string;reason?:string;canSign:boolean;
  original:{number:string;date:string;quantity:string}|null; physicalTotals:{productCode:string;quantity:number}[];
  periods:{period_month:string;state:string;version:number|null}[];
  lines:{reference:string;grade:string;quantity:string;unit_cost:string|null;cost_status:string;amount:string|null}[];
  files:{file_id:string;original_name:string|null}[]; ownFiles:string[];
  signatures:{id?:string;role:string;signed_by:string;signed_at:string;evidence_file_id?:string;current?:boolean;adopted?:boolean;costs?:{batchNo:string;recordedUnitCostDecimal?:string|null;costStatus?:string}[];period_versions?:{periodMonth:string;version:number}[]}[];
}
const statusLabels:Record<string,string>={PENDING:'financeReview.pending',SIGNED:'financeReview.signed',
  HISTORY:'financeReview.history',REVIEW_REQUIRED:'financeReview.recheckRequired',ADMIN_REQUIRED:'financeReview.adminRequired'};
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
function TaskDetail({task,canEdit,onSigned,pending,remember,stateLabel}:{task:TaskReference;canEdit:boolean;onSigned:()=>void;
  pending?:PendingSignature;remember:(pending:PendingSignature|null,completedId?:string)=>void;stateLabel?:(task:Task)=>string}) {
  const {t}=useLanguage();
  const [data,setData]=useState<Detail>();const [proof,setProof]=useState<string[]>([]);
  const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [version,setVersion]=useState(0);const [success,setSuccess]=useState(false);
  const [verifiedVersion,setVerifiedVersion]=useState(-1);
  const [uploading,setUploading]=useState(false);
  const [retryAllowed,setRetryAllowed]=useState(false);
  const [receiptId,setReceiptId]=useState('');
  const inFlight=useRef(false);
  const {codeMap:periodStates}=useDictOptions('PRODUCTION_POSTING_PERIOD_STATE');
  const {codeMap:signerRoles}=useDictOptions('PRODUCTION_CUTOVER_ROLE');
  const path=endpoint+'/'+task.kind+'/'+task.id;
  useEffect(()=>{const gate=new AbortController();
    request<Detail>(path,{signal:gate.signal}).then(d=>{if(!gate.signal.aborted){setData(d);setError('');setVerifiedVersion(version);setProof(previous=>previous.length?previous:d.ownFiles.slice(-1));}}).catch(e=>{if(!gate.signal.aborted)setError(message(e));});
    return ()=>gate.abort();
  },[path,version]);
  const rev=task.kind==='reversal';
  const preview=async(id:string)=>{
    const unavailable=t('financeReview.noFile');
    try{await previewProtectedAttachment(async()=>{
      const token=sessionStorage.getItem('phoenix_token')||localStorage.getItem('phoenix_token')||'';
      const res=await fetch('/api'+path+'/evidence/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token}});
      if(!res.ok)throw new Error(unavailable);return res.blob();
    },{blocked:t('productionConversion.allowPreview'),unavailable});}catch(e){setError(message(e));}
  };
  const submitSignature=async(signature:PendingSignature,isRetry=false)=>{
    if(inFlight.current)return;
    inFlight.current=true;
    setBusy(true);setError('');setRetryAllowed(false);
    try{
      const session=captureBoundSession();
      if(!rev&&!isRetry){
        const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(signature.body.reason)));
        signature={...signature,params:{...signature.params,reasonHash:Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')}};
      }
      assertBoundSession(session);
      remember(signature);
      const route=rev?'production-inbound-documents':'production-cutovers';
      const action=rev?'financial-clearance':'sign';
      const receipt=await request<{id:string}>(`/v2/inventory/${route}/${task.id}/${action}`,{
        method:'POST',bindSession:session,retry:false,body:JSON.stringify(signature.body),
      });
      if (typeof receipt?.id!=='string'||!receipt.id) throw Error(t('financeReview.resultPending'));
      remember(null,signature.intentId);setReceiptId(receipt.id);setSuccess(true);setVersion(n=>n+1);onSigned();
    }catch(e){
      const status=(e as {status?:number}).status;
      setError(message(e));
      // A response from the first submission can reject it. A retry cannot rule out a previous commit.
      if(!isRetry&&status&&[400,403,404,409,422].includes(status)) {
        remember(null,signature.intentId);setVerifiedVersion(-1);
      }
    }finally{inFlight.current=false;setBusy(false);}
  };
  const sign=()=>{
    if(!data?.canSign||verifiedVersion!==version||uploading||busy||pending||!proof[0]||(!rev&&!reason.trim()))return;
    const fileId=proof[0];
    const params:Record<string,string>=rev?{reviewHash:data.reviewHash??'',fileId}
      :{contentHash:data.contentHash,snapshotHash:data.snapshotHash??'',fileId};
    const body=rev?{contentHash:data.contentHash,reviewHash:data.reviewHash,periodStatus:'OPEN',financialEvidenceFileId:fileId,
      costs:data.lines.map(l=>({batchNo:l.reference,costStatus:l.cost_status,unitCostDecimal:l.unit_cost}))}
      :{contentHash:data.contentHash,snapshotSha256:data.snapshotHash,role:'FINANCE',reason:reason.trim(),evidenceFileId:fileId};
    void submitSignature({intentId:crypto.randomUUID(),task:{id:task.id,kind:task.kind},params,body});
  };
  const recover=async()=>{
    if(!pending||inFlight.current)return;
    inFlight.current=true;
    setBusy(true);setError('');setRetryAllowed(false);
    try{
      const params=new URLSearchParams(pending.params);
      const receipt=await request<{id:string}>(path+'/receipt?'+params,{bindSession:true});
      if(!receipt.id)throw Error(t('financeReview.resultPending'));
      remember(null,pending.intentId);setReceiptId(receipt.id);setSuccess(true);setVersion(n=>n+1);onSigned();
    }catch(e){
      if ((e as {status?:number}).status===404) setRetryAllowed(true);
      setError(message(e));
    }finally{inFlight.current=false;setBusy(false);}
  };
  const pendingControls=pending&&<div className={s.notice}>
    <p role="status">{t('financeReview.resultPending')}</p>
    <div className={s.actions}>
      <button disabled={busy} onClick={()=>void recover()}>{t('financeReview.recoverReceipt')}</button>
      {retryAllowed&&canEdit&&<button disabled={busy} onClick={()=>void submitSignature(pending,true)}>{t('pilotState.retry')}</button>}
    </div>
  </div>;
  if(!data)return <>{pendingControls}<div role={error?'alert':'status'}>{error||t('common.loading')}{error&&<button onClick={()=>setVersion(n=>n+1)}>{t('common.retry')}</button>}</div></>;
  return <section className={s.card} aria-labelledby="review-id"><h2 id="review-id">{data.document_no}</h2>
    <div className={s.actions}><button disabled={busy||!!pending} onClick={()=>{setVersion(n=>n+1);setSuccess(false);}}>{t('common.refresh')}</button></div>
    <p>{t(kindLabels[task.kind])} · {data.company_code} / {data.warehouse_code} {data.house} · {data.postingDay} · {stateLabel?.(data)??data.state}</p>
    {data.review_state&&<p>{t(statusLabels[data.review_state]??data.review_state)}</p>}
    {data.original&&<p>{t('financeReview.original')} {data.original.number} · {data.original.date} · {data.original.quantity}</p>}
    {data.reason&&<p>{data.reason}</p>}
    {data.physicalTotals.map(p=><p key={p.productCode}>{t('financeReview.physical')} · {p.productCode} · {p.quantity}</p>)}
    {data.periods.map(p=><p key={p.period_month}>{t('financeReview.period')} {p.period_month} · {periodStates[p.state]??p.state} {p.version!==null&&'v'+p.version}</p>)}
    {rev&&data.state!=='POSTED'&&<p className={s.muted}>{t('financeReview.currentCostReference')}</p>}
    {data.lines.length>0&&<div className={s.scroll}><table className={s.table}><thead><tr>{lineLabels.map(k=><th key={k}>{t(k)}</th>)}</tr></thead><tbody>
      {data.lines.map((l,i)=><tr key={i}><td>{l.reference}</td><td>{l.grade}</td><td>{l.quantity}</td><td>{l.cost_status==='CONFIRMED'?l.unit_cost:[t('financeReview.unknown'),l.unit_cost].filter(v=>v!==null).join(' · ')}</td><td>{l.amount??'—'}</td></tr>)}
    </tbody></table></div>}
    <details><summary>{t('financeReview.hash')}</summary><p className={s.wide}>{data.contentHash}</p>{data.snapshotHash&&<p className={s.wide}>{data.snapshotHash}</p>}</details>
    <h3>{t('financeReview.evidence')}</h3><div className={s.actions}>
      {data.files.map(f=><button key={f.file_id} onClick={()=>preview(f.file_id)}>{f.original_name||f.file_id} · {f.file_id.slice(-8)}</button>)}
      {proof.filter(id=>!data.files.some(f=>f.file_id===id)).map(id=><button key={id} onClick={()=>preview(id)}>{t('financeReview.preview')} · {id.slice(-8)}</button>)}
    </div>
    {data.signatures.map(x=><details key={x.id??x.signed_at+x.signed_by}><summary>{t('financeReview.signed')} · {rev?t('financeReview.sign'):(signerRoles[x.role]??x.role)} · {x.signed_by} · {new Date(x.signed_at).toLocaleString()}
      {x.adopted&&' · '+t('financeReview.adopted')}{x.current===false&&data.review_state!=='HISTORY'&&' · '+t('financeReview.recheckRequired')}</summary>
      {x.period_versions?.map(period=><p key={period.periodMonth}>{period.periodMonth} · v{period.version}</p>)}
      {x.costs?.map(cost=><p key={cost.batchNo}>{cost.batchNo} · {data.lines.find(line=>line.reference===cost.batchNo)?.quantity??'—'} {t('productionCutover.eggs')}
        {' · '}{cost.costStatus==='UNKNOWN'?t('financeReview.unknown'):cost.recordedUnitCostDecimal??'—'}</p>)}
      {x.evidence_file_id&&data.files.some(file=>file.file_id===x.evidence_file_id)&&
        <button onClick={()=>void preview(x.evidence_file_id!)}>{t('financeReview.preview')} · {x.evidence_file_id.slice(-8)}</button>}
    </details>)}
    {pendingControls}
    {canEdit&&data.canSign&&!success&&<><AttachmentUploader value={proof} onChange={ids=>setProof(ids.slice(-1))} onUploadingChange={setUploading} readOnly={busy||!!pending||verifiedVersion!==version} label={t('financeReview.upload')}
      ownership={{moduleCode:rev?'PRODUCTION_INBOUND':'PRODUCTION_CUTOVER',ownerType:rev?'HOUSE':'WAREHOUSE',ownerId:rev?data.house!:data.warehouse_code,companyCode:data.company_code,financeReviewId:data.id}}/>
      {!rev&&<label className={s.field}>{t('financeReview.reason')}<textarea value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></label>}
      <div className={s.actions}><button disabled={busy||!!pending||uploading||verifiedVersion!==version||!proof.length||(!rev&&!reason.trim())} onClick={sign}>{t('financeReview.sign')}</button></div></>}
    {success&&<p role="status">{t('financeReview.signed')} {receiptId}</p>}{error&&<p role="alert" className={s.error}>{error}</p>}
  </section>;
}

export default function ProductionFinanceReview() {
  const {user}=usePermission('MENU_PROD_FIN_REVIEW');
  const actor=String(user?.userId??user?.id??'');
  return <FinanceReviewWorkbench key={actor} actor={actor}/>;
}

function FinanceReviewWorkbench({actor}:{actor:string}) {
  const {t}=useLanguage();const narrow=usePermission('MENU_PROD_FIN_REVIEW'),ledger=usePermission('MENU_FIN2_AR_LEDGER');
  const {codeMap:cutoverStates}=useDictOptions('PRODUCTION_CUTOVER_STATE');
  const {codeMap:inboundStates}=useDictOptions('PRODUCTION_INBOUND_DOCUMENT_STATE');
  const stateLabel=(row:Task)=>(row.kind==='cutover'?cutoverStates:inboundStates)[row.state]??row.state;
  const canEdit=narrow.canEdit||ledger.canEdit,canRead=narrow.canView||canEdit;
  const [pendingByTask,setPendingByTask]=useState<Record<string,PendingSignature>>({});
  const [restored,setRestored]=useState(false);
  const storageKey='production-finance-pending:'+actor;
  useEffect(()=>{
    let active=true;
    queueMicrotask(()=>{
      if(!active)return;
      if(actor){
        try { setPendingByTask(JSON.parse(sessionStorage.getItem(storageKey)??'{}')); }
        catch { /* An inaccessible cache must not block the read-only queue. */ }
      }
      setRestored(true);
    });
    return ()=>{active=false;};
  },[actor,storageKey]);

  function updatePending(id:string,signature:PendingSignature|null,completedId?:string){
    if(!actor)return;
    let next:Record<string,PendingSignature>={};
    try { next=JSON.parse(sessionStorage.getItem(storageKey)??'{}'); }catch { /* replace unreadable local data */ }
    if(signature){
      if(next[id]&&next[id].intentId!==signature.intentId) throw Error(t('financeReview.resultPending'));
      next[id]=signature;
    }else if(next[id]?.intentId===completedId){
      delete next[id];
    }
    sessionStorage.setItem(storageKey,JSON.stringify(next));
    setPendingByTask(next);
  }
  const [filters,setFilters]=useState({kind:'',companyCode:'',warehouseCode:'',documentNo:'',postingDay:''});
  const [query,setQuery]=useState(filters);
  const [history,setHistory]=useState(false);const [offset,setOffset]=useState(0);const [version,setVersion]=useState(0);
  const [page,setPage]=useState<{rows:Task[];hasMore:boolean}>();const [task,setTask]=useState<TaskReference>();const [error,setError]=useState('');
  useEffect(()=>{if(!canRead)return;const gate=new AbortController();
    request<{rows:Task[];hasMore:boolean}>(endpoint+'?'+new URLSearchParams({...query,view:history?'history':'pending',offset:String(offset)}),{signal:gate.signal})
      .then(p=>{if(!gate.signal.aborted){setPage(p);setError('');}}).catch(e=>{if(!gate.signal.aborted)setError(message(e));});return ()=>gate.abort();
  },[history,offset,version,canRead,query]);
  const changePage=(value:number)=>{setTask(undefined);setPage(undefined);setError('');setOffset(value);};
  return <main className={s.page}><PageHeader title={t('menu.production-finance-review')}/>
    {canRead&&restored?<>{Object.values(pendingByTask).length>0&&<section className={s.card}>
      <h2>{t('financeReview.resultPending')}</h2>
      {Object.values(pendingByTask).map(({task:waiting})=><button key={waiting.id} onClick={()=>setTask(waiting)}>
        {t(kindLabels[waiting.kind])} · {t('financeReview.recoverReceipt')}</button>)}
    </section>}<div className={s.actions}>{[false,true].map(h=><button id={h===history?'finance-review-view':undefined} aria-pressed={h===history} key={String(h)} onClick={()=>{if(h!==history){changePage(0);setHistory(h);}}}>{t(h?'financeReview.history':'financeReview.pending')}</button>)}</div>
    <form className={s.card} onSubmit={event=>{event.preventDefault();changePage(0);setQuery({...filters});}}>
      <div className={s.grid}>
        <label className={s.field}>{t('productionCutover.documentNo')}<input value={filters.documentNo} maxLength={128} onChange={event=>setFilters({...filters,documentNo:event.target.value})}/></label>
        <label className={s.field}>{t('financeReview.type')}<select value={filters.kind} onChange={event=>setFilters({...filters,kind:event.target.value})}>
          <option value="">{t('financeReview.all')}</option><option value="cutover">{t(kindLabels.cutover)}</option><option value="reversal">{t(kindLabels.reversal)}</option>
        </select></label>
        <label className={s.field}>{t('productionCutover.company')}<input value={filters.companyCode} maxLength={64} onChange={event=>setFilters({...filters,companyCode:event.target.value})}/></label>
        <label className={s.field}>{t('productionCutover.warehouse')}<input value={filters.warehouseCode} maxLength={64} onChange={event=>setFilters({...filters,warehouseCode:event.target.value})}/></label>
        <label className={s.field}>{t('productionInstallments.postingDate')}<input type="date" value={filters.postingDay} onChange={event=>setFilters({...filters,postingDay:event.target.value})}/></label>
      </div>
      <button type="submit">{t('common.search')}</button>
    </form>
    {error&&<p role="alert">{error} <button onClick={()=>setVersion(n=>n+1)}>{t('common.retry')}</button></p>}
    {page?<><div className={s.financeTable}><DataTableV3<Task> rows={page.rows} serverManaged rowKey={row=>row.kind+row.id} emptyText={t('financeReview.empty')} columns={[
      {key:'document_no',title:t('productionCutover.documentNo'),render:row=><button aria-pressed={row.id===task?.id} onClick={()=>setTask(row)}>
        {row.document_no} <span className="sr-only">{t(kindLabels[row.kind])}</span></button>},
      {key:'kind',title:t('financeReview.type'),render:row=>t(kindLabels[row.kind])},
      {key:'company_code',title:t('productionCutover.company')},
      {key:'warehouse_code',title:t('productionCutover.warehouse')},
      {key:'posting_day',title:t('productionInstallments.postingDate'),type:'date'},
      {key:'state',title:t('financeReview.state'),render:row=><StatusBadge status={row.state} label={stateLabel(row)}/> },
      {key:'review_state',title:t('financeReview.sign'),render:row=>row.review_state
        ?t(statusLabels[row.review_state]??row.review_state):row.finance_signed?t('financeReview.signed'):'—'},
    ]}/></div>
    <div className={s.financeCards}>
      {page.rows.length===0?<p>{t('financeReview.empty')}</p>:<ul className={s.history}>{page.rows.map(row=><li key={row.kind+row.id}><div>
        <p><strong>{row.document_no}</strong></p>
        <p>{t(kindLabels[row.kind])} · {row.company_code} / {row.warehouse_code}</p>
        <p>{row.posting_day??'—'} · {stateLabel(row)}</p>
        <p>{row.review_state?t(statusLabels[row.review_state]??row.review_state):row.finance_signed?t('financeReview.signed'):'—'}</p>
      </div><button onClick={()=>setTask(row)} aria-label={t('productionInstallments.view')+' '+t(kindLabels[row.kind])+' '+row.document_no}>
        {t('productionInstallments.view')}</button></li>)}</ul>}
    </div>
    <div className={s.actions}>{offset>0&&<button onClick={()=>changePage(offset-50)}>{t('financeReview.previous')}</button>}{page.hasMore&&<button onClick={()=>changePage(offset+50)}>{t('financeReview.next')}</button>}</div></>:<p>{t('common.loading')}</p>}
    {task&&<DrawerV2 open title={task.document_no??t('financeReview.recoverReceipt')} width={800} zIndex={10010} onClose={()=>{
      setTask(undefined);
      requestAnimationFrame(()=>{if(document.activeElement===document.body)document.getElementById('finance-review-view')?.focus();});
    }}>
      <TaskDetail key={task.id} task={task} canEdit={canEdit&&!!actor} pending={pendingByTask[task.id]}
        remember={(signature,completedId)=>updatePending(task.id,signature,completedId)} stateLabel={stateLabel} onSigned={()=>setVersion(n=>n+1)}/>
    </DrawerV2>}</>:<p role="status">{t(canRead?'common.loading':'productionInstallments.noPermission')}</p>}
  </main>;
}
