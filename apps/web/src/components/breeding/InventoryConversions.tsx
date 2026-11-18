'use client';

import { useCallback,useEffect,useLayoutEffect,useRef,useState } from 'react';
import { ProductSelector,WarehouseSelector,SkuSelector,GradeSelector,LocationSelector } from '@/components/shared-selectors/MasterDataSelectors';
import DictSelect from '@/components/shared-selectors/DictSelect';
import { AttachmentUploader } from '@/components/design-system/forms/AttachmentUploader';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import { useDictOptions } from '@/hooks/useDictOptions';
import { useProductGrades } from '@/hooks/useProductGrades';
import { localizedMasterName } from '@/lib/localized-master-data';
import request from '@/lib/api-client';
import s from './ProductionInboundWorkbench.module.css';

const endpoint='/v2/inventory/conversions';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date());
type OutputKind='STOCK'|'WIP'|'LOSS';
interface InputLine {key:string;source:string;quantity:string}
interface OutputLine {key:string;kind:string;grade:string;quantity:string;sku:string;location:string;reason:string;files:string[]}
interface Form {warehouse:string;product:string;kind:string;date:string;group:string;intent:string;inputs:InputLine[];outputs:OutputLine[]}
interface DraftRequest {companyCode:string;warehouseCode:string;productCode:string;operationKind:string;operationDate:string;physicalGroupRef:string;intentKey:string;
  inputs:Array<{rawSegmentId?:string;parentBatchNo?:string;quantity:number}>;
  outputs:Array<{outputKind:OutputKind;gradeCode:string;quantity:number;evidenceFileId:string;skuCode?:string;locationCode?:string;lossReason?:string}>}
interface Receipt {documentNo:string;inputQuantity:number;outputQuantity:number;lossQuantity:number;postingDate:string;costStatus:string;
  batches:Array<{batchNo:string;outputKind:string;skuCode:string;gradeCode:string;quantity:number;warehouseCode:string;locationCode:string}>}
interface Conversion {id:string;document_no:string;company_code:string;warehouse_code:string;product_code:string;physical_group_ref:string;state:string;version:number;
  created_by:string;ready_by?:string;expected_posting_date?:string;submit_key:string;content_hash:string;receipt?:Receipt;
  payload:{request:DraftRequest;inputs?:Array<{rawSegmentId?:string;parentBatchNo?:string;quantity:number;gradeCode:string;productionDate:string;costStatus:string}>;
    outputs?:Array<DraftRequest['outputs'][number]&{inventoryStatus?:string;eggDate?:string;expireDate?:string}>}}
interface Sources {available:boolean;raw:Array<{raw_segment_id:string;document_no:string;house_code:string;grade_code:string;remaining_quantity:string;production_date:string}>;
  inventory:Array<{batch_no:string;sku_code:string;grade_code:string;inventory_class:string;remaining_quantity:string;production_date:string;expire_date:string;cost_status:string}>}
const input=():InputLine=>({key:crypto.randomUUID(),source:'',quantity:''});
const output=():OutputLine=>({key:crypto.randomUUID(),kind:'',grade:'',quantity:'',sku:'',location:'',reason:'',files:[]});
const empty=(warehouse=''):Form=>({warehouse,product:'',kind:'',date:day(),group:'',intent:crypto.randomUUID(),inputs:[input()],outputs:[output()]});
const fromDocument=(d:Conversion):Form=>{
  const p=d.payload.request;return {warehouse:p.warehouseCode,product:p.productCode,kind:p.operationKind,date:p.operationDate,group:p.physicalGroupRef,intent:p.intentKey,
    inputs:p.inputs.map(i=>({key:crypto.randomUUID(),source:i.rawSegmentId?`RAW:${i.rawSegmentId}`:`INV:${i.parentBatchNo}`,quantity:String(i.quantity)})),
    outputs:p.outputs.map(o=>({key:crypto.randomUUID(),kind:o.outputKind,grade:o.gradeCode,quantity:String(o.quantity),sku:o.skuCode??'',location:o.locationCode??'',reason:o.lossReason??'',files:[o.evidenceFileId]}))};
};

export default function InventoryConversions({company,initialWarehouse}:{company:string;initialWarehouse:string}){
  const {t,lang}=useLanguage(),permission=usePermission('MENU_PROD_INBOUND'),actor=String(permission.user.userId??permission.user.id??'');
  const {codeMap:states}=useDictOptions('PRODUCTION_INBOUND_DOCUMENT_STATE'),{codeMap:kinds}=useDictOptions('PRODUCTION_CONVERSION_KIND');
  const {codeMap:outputKinds}=useDictOptions('PRODUCTION_CONVERSION_OUTPUT_KIND'),{grades}=useProductGrades({onlyStorable:true});
  const gradeName=(code:string)=>localizedMasterName(grades.find(g=>g.grade_code===code) as unknown as Record<string,unknown>|undefined,'grade_name',lang)||code;
  const [form,setForm]=useState<Form>(()=>empty(initialWarehouse)),[selected,setSelected]=useState<Conversion|null>(null),[rows,setRows]=useState<Conversion[]>([]);
  const [sources,setSources]=useState<Sources>({available:false,raw:[],inventory:[]}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[restored,setRestored]=useState('');
  const generation=useRef(0),submitKeys=useRef<Record<string,string>>({}),initial=useRef(initialWarehouse);
  const context=useRef(''),boundary=useRef('');
  const storage=`inventory-conversion:v1:${actor}:${company}`,ready=restored===storage&&!!actor&&!!company;
  const currentBoundary=`${storage}:${form.warehouse}:${form.product}`;
  useLayoutEffect(()=>{context.current=storage;boundary.current=currentBoundary;return()=>{context.current='';boundary.current='';};},[storage,currentBoundary]);
  const [sourceBoundary,setSourceBoundary]=useState('');
  const currentSources=sourceBoundary===currentBoundary?sources:{available:false,raw:[],inventory:[]};
  const currentRows=sourceBoundary===currentBoundary?rows:[];
  const label=(key:string,fallback:string)=>t(`productionConversion.${key}`,fallback);
  useEffect(()=>{
    let alive=true;generation.current++;
    Promise.resolve().then(()=>{
      if(!alive)return;let saved:Form|undefined;
      try{const state=JSON.parse(localStorage.getItem(storage)??'null');saved=state?.form;submitKeys.current=state?.submitKeys??{};}catch{submitKeys.current={};}
      setForm(saved?.intent&&typeof saved.warehouse==='string'&&typeof saved.product==='string'&&Array.isArray(saved.inputs)&&saved.inputs.length>0&&saved.inputs.every(i=>typeof i.key==='string'&&typeof i.source==='string'&&typeof i.quantity==='string')&&Array.isArray(saved.outputs)&&saved.outputs.length>0&&saved.outputs.every(o=>typeof o.key==='string'&&Array.isArray(o.files)&&o.files.every(f=>typeof f==='string')&&['kind','grade','quantity','sku','location','reason'].every(k=>typeof o[k as keyof OutputLine]==='string'))?saved:empty(initial.current));setSelected(null);setRows([]);setError('');setRestored(storage);
    });return()=>{alive=false;};
  },[storage]);
  useEffect(()=>{if(ready)localStorage.setItem(storage,JSON.stringify({form,submitKeys:submitKeys.current}));},[form,ready,storage]);
  const refresh=useCallback(async()=>{
    const turn=++generation.current,expected=currentBoundary;if(!ready||!form.warehouse||!form.product){setRows([]);setSources({available:false,raw:[],inventory:[]});return;}
    const qs=new URLSearchParams({companyCode:company,warehouseCode:form.warehouse,productCode:form.product});
    setSources({available:false,raw:[],inventory:[]});
    const [available,documents]=await Promise.allSettled([request<Sources>(`${endpoint}/sources?${qs}`),request<Conversion[]>(`${endpoint}?${qs}`)]);
    if(turn===generation.current&&boundary.current===expected){
      if(documents.status==='rejected'){setRows([]);throw documents.reason;}
      setSources(available.status==='fulfilled'?available.value:{available:false,raw:[],inventory:[]});setRows(documents.value);setSourceBoundary(expected);
      if(available.status==='rejected')setError(available.reason instanceof Error?available.reason.message:String(available.reason));
    }
  },[ready,company,form.warehouse,form.product,currentBoundary]);
  useEffect(()=>{let alive=true;Promise.resolve().then(()=>{if(alive)return refresh();}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[refresh]);
  const load=async(id:string)=>{
    const expected=storage,d=await request<Conversion>(`${endpoint}/${id}`);
    if(context.current===expected&&d.company_code===company){setSelected(d);setForm(fromDocument(d));}return d;
  };
  const send=(path:string,body:unknown)=>request<Conversion>(`${endpoint}${path}`,{method:'POST',body:JSON.stringify(body)});
  const recover=async(byGroup=false)=>{
    if(byGroup&&!form.group.trim())throw new Error(label('groupRequired','请填写实际作业组号再找回原单'));
    const qs=new URLSearchParams({companyCode:company,warehouseCode:form.warehouse,...(byGroup?{physicalGroupRef:form.group}:{intentKey:form.intent})});
    const found=await request<Conversion[]>(`${endpoint}/recover?${qs}`);if(found[0])await load(found[0].id);else throw new Error(label('notFound','未找到该实际作业原单，请核对仓库和作业组号'));
  };
  const run=async(work:()=>Promise<void>)=>{
    if(busy)return;const expected=storage;setBusy(true);setError('');
    try{await work();if(context.current===expected)await refresh();}catch(e){if(context.current!==expected)return;setError(e instanceof Error?e.message:String(e));try{if(selected)await load(selected.id);else if(form.warehouse)await recover();}catch{/* Keep the original intent until connectivity returns. */}}
    finally{if(context.current===expected)setBusy(false);}
  };
  const count=(value:string)=>{const n=Number(value);if(!value.trim()||!Number.isSafeInteger(n)||n<=0)throw new Error(label('actualQuantity','请填写每条实际正整数枚数，未填不能当作零'));return n;};
  const payload=():DraftRequest=>({companyCode:company,warehouseCode:form.warehouse,productCode:form.product,operationKind:form.kind,operationDate:form.date,physicalGroupRef:form.group,intentKey:form.intent,
    inputs:form.inputs.map(i=>{if(!i.source)throw new Error(label('selectSource','请选择每条实际来源'));return {...(i.source.startsWith('RAW:')?{rawSegmentId:i.source.slice(4)}:{parentBatchNo:i.source.slice(4)}),quantity:count(i.quantity)};}),
    outputs:form.outputs.map(o=>{
      if(!['STOCK','WIP','LOSS'].includes(o.kind)||!o.files[0])throw new Error(label('outputRequired','请选择实际产出类型并上传本仓的实物证据'));
      return {outputKind:o.kind as OutputKind,gradeCode:o.grade,quantity:count(o.quantity),evidenceFileId:o.files[o.files.length-1],
        ...(o.kind==='LOSS'?{lossReason:o.reason}:{skuCode:o.sku,locationCode:o.location})};
    })});
  const save=async()=>{
    const body=payload(),d=selected?await send(`/${selected.id}/edit`,{...body,version:selected.version}):await send('',body);await load(d.id);return d;
  };
  const freeze=async()=>{
    const d=selected?.created_by===actor?await save():selected!;const submit=submitKeys.current[d.id]??crypto.randomUUID();submitKeys.current[d.id]=submit;
    localStorage.setItem(storage,JSON.stringify({form,submitKeys:submitKeys.current}));await send(`/${d.id}/ready`,{version:d.version,submitKey:submit});await load(d.id);
  };
  const preview=async(fileId:string)=>{
    if(!selected)return;const expected=storage,tab=window.open('about:blank','_blank');
    if(!tab)throw new Error(label('allowPreview','请允许预览窗口后重试'));tab.opener=null;
    try{
      const token=sessionStorage.getItem('phoenix_token')||localStorage.getItem('phoenix_token')||'';
      const response=await fetch(`/api${endpoint}/${selected.id}/evidence/${encodeURIComponent(fileId)}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw new Error(label('proofUnavailable','原单证据无法访问或已失效'));
      if(context.current!==expected){tab.close();return;}
      const url=URL.createObjectURL(await response.blob());tab.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){tab.close();throw e;}
  };
  const editable=!busy&&(!selected&&permission.canCreate||selected?.state==='DRAFT'&&permission.canEdit&&selected.created_by===actor),headerEditable=editable&&!selected,boundaryEditable=!busy&&!selected;
  const patch=(next:Partial<Form>)=>setForm(old=>({...old,...next}));
  const patchInput=(key:string,next:Partial<InputLine>)=>setForm(old=>({...old,inputs:old.inputs.map(row=>row.key===key?{...row,...next}:row)}));
  const patchOutput=(key:string,next:Partial<OutputLine>)=>setForm(old=>({...old,outputs:old.outputs.map(row=>row.key===key?{...row,...next}:row)}));
  if(!company)return null;
  if(!ready)return <p>{t('common.loading','加载中…')}</p>;
  return <section className={s.card} aria-label={label('title','实际分级、包装与在制品')}>
    <h2>{label('title','实际分级、包装与在制品')}</h2><p className={s.muted}>{label('hint','按一个真实作业组登记投入、实物产出和实际损耗。在制品须实际存放；不得把计划或估算当作库存。')}</p>
    {error&&<p role="alert" className={s.error}>{error}</p>}
    <div className={s.actions}><button disabled={busy} onClick={()=>{setSelected(null);setForm(empty(form.warehouse));setError('');}}>{label('new','新作业意图')}</button>
      <button disabled={busy||!form.warehouse} onClick={()=>run(()=>recover())}>{label('recover','找回本意图原单')}</button><button disabled={busy||!form.warehouse||!form.group.trim()} onClick={()=>run(()=>recover(true))}>{label('recoverGroup','按实际作业组找回原单')}</button><button disabled={busy} onClick={()=>run(refresh)}>{t('common.refresh','刷新')}</button></div>
    <div className={s.grid}>
      <label className={s.field}>{label('warehouse','实际作业仓')}<WarehouseSelector ariaLabel={label('warehouse','实际作业仓')} value={form.warehouse} companyCode={company} disabled={!boundaryEditable}
        onChange={warehouse=>patch({warehouse,inputs:[input()],outputs:[output()]})}/></label>
      <label className={s.field}>{label('product','实际产品')}<ProductSelector ariaLabel={label('product','实际产品')} value={form.product} disabled={!boundaryEditable}
        onChange={product=>patch({product,inputs:[input()],outputs:[output()]})}/></label>
      <label className={s.field}>{label('kind','实际作业类型')}<DictSelect ariaLabel={label('kind','实际作业类型')} dictType="PRODUCTION_CONVERSION_KIND" value={form.kind} onChange={kind=>patch({kind})} disabled={!headerEditable}/></label>
      <label className={s.field}>{label('date','实际作业日期')}<input aria-label={label('date','实际作业日期')} type="date" value={form.date} disabled={!headerEditable} onChange={e=>patch({date:e.target.value})}/></label>
      <label className={s.field}>{label('group','实际作业组 / 工单号')}<input aria-label={label('group','实际作业组 / 工单号')} value={form.group} disabled={!boundaryEditable} maxLength={128} onChange={e=>patch({group:e.target.value})}/></label>
    </div>
    {form.warehouse&&form.product&&!currentSources.available&&<p className={s.notice}>{label('off','该仓与产品尚未正式启用或已暂停，仅可查看原单。')}</p>}
    <h3>{label('inputs','实际投入')}</h3>
    {form.inputs.map((row,index)=><div key={row.key} className={s.card}><div className={s.grid}>
      <label className={s.field}>{label('source','实际来源')} {index+1}<select aria-label={`${label('source','实际来源')} ${index+1}`} value={row.source} disabled={!editable||!currentSources.available} onChange={e=>patchInput(row.key,{source:e.target.value,quantity:''})}>
        <option value="">{label('selectSource','请选择每条实际来源')}</option><optgroup label={label('raw','已签认原始收蛋')}>
          {currentSources.raw.map(r=><option key={r.raw_segment_id} value={`RAW:${r.raw_segment_id}`}>{r.document_no} · {r.house_code} · {gradeName(r.grade_code)} · {r.remaining_quantity}</option>)}</optgroup>
        <optgroup label={label('stock','库存父批 / 实际在制品')}>{currentSources.inventory.map(b=><option key={b.batch_no} value={`INV:${b.batch_no}`}>{b.batch_no} · {b.sku_code} · {b.remaining_quantity}</option>)}</optgroup>
        {row.source&&!currentSources.raw.some(r=>`RAW:${r.raw_segment_id}`===row.source)&&!currentSources.inventory.some(b=>`INV:${b.batch_no}`===row.source)&&<option value={row.source}>{row.source}</option>}
      </select></label>
      <label className={s.field}>{label('inputQuantity','本次实际领用（枚）')}<input aria-label={`${label('inputQuantity','本次实际领用（枚）')} ${index+1}`} type="number" min="1" step="1" inputMode="numeric" value={row.quantity} disabled={!editable} onChange={e=>patchInput(row.key,{quantity:e.target.value})}/></label>
    </div><button disabled={!editable||form.inputs.length<=1} onClick={()=>patch({inputs:form.inputs.filter(i=>i.key!==row.key)})}>{t('common.delete','删除')}</button></div>)}
    <button disabled={!editable||form.inputs.length>=200} onClick={()=>patch({inputs:[...form.inputs,input()]})}>{label('addInput','增加实际投入')}</button>
    <h3>{label('outputs','实际产出与损耗')}</h3>
    {form.outputs.map((row,index)=><div className={s.card} key={row.key}><div className={s.grid}>
      <label className={s.field}>{label('outputKind','实际产出类型')} {index+1}<DictSelect dictType="PRODUCTION_CONVERSION_OUTPUT_KIND" value={row.kind} disabled={!editable} onChange={kind=>patchOutput(row.key,{kind,sku:'',grade:'',location:'',reason:''})}/></label>
      {row.kind==='LOSS'?<><label className={s.field}>{label('grade','实际档位')}<GradeSelector value={row.grade} disabled={!editable} onChange={grade=>patchOutput(row.key,{grade})}/></label>
        <label className={s.field}>{label('lossReason','实际损耗原因')}<DictSelect dictType="PRODUCTION_CONVERSION_LOSS_REASON" value={row.reason} disabled={!editable} onChange={reason=>patchOutput(row.key,{reason})}/></label></>
        :<><label className={s.field}>{label('sku','实际产出 SKU')}<SkuSelector ariaLabel={`${label('sku','实际产出 SKU')} ${index+1}`} value={row.sku} productCode={form.product} companyCode={company} usage="stock" disabled={!editable||!form.product}
          onChange={sku=>patchOutput(row.key,{sku,grade:''})} onPick={opt=>patchOutput(row.key,{grade:String(opt?.raw?.grade_code??'')})}/></label>
          <label className={s.field}>{label('location','实际存放库位')}<LocationSelector ariaLabel={label('location','实际存放库位')} lookupEndpoint={`/v2/inventory/production-cutovers/locations?${new URLSearchParams({companyCode:company,warehouseCode:form.warehouse})}`} value={row.location} warehouseCode={form.warehouse} disabled={!editable||!form.warehouse} onChange={location=>patchOutput(row.key,{location})}/></label></>}
      <label className={s.field}>{label('outputQuantity','实际产出 / 损耗（枚）')}<input aria-label={`${label('outputQuantity','实际产出 / 损耗（枚）')} ${index+1}`} type="number" min="1" step="1" inputMode="numeric" value={row.quantity} disabled={!editable} onChange={e=>patchOutput(row.key,{quantity:e.target.value})}/></label>
    </div>
      {row.kind==='WIP'&&<p className={s.notice}>{label('wip','仅登记实际存放的在制实物；不得用于销售。')}</p>}
      {form.warehouse&&<AttachmentUploader value={row.files} onChange={files=>patchOutput(row.key,{files})} readOnly={!editable} label={label('proof','上传本作业组实际测量 / 损耗证据')}
        ownership={{moduleCode:'PRODUCTION_CONVERSION',ownerType:'WAREHOUSE',ownerId:form.warehouse,companyCode:company}}/>}
      <div className={s.actions}>{selected&&row.files.map(file=><button key={file} disabled={busy} onClick={()=>run(()=>preview(file))}>{label('viewProof','查看原单证据')}</button>)}
      <button disabled={!editable||form.outputs.length<=1} onClick={()=>patch({outputs:form.outputs.filter(o=>o.key!==row.key)})}>{t('common.delete','删除')}</button></div>
    </div>)}
    <button disabled={!editable||form.outputs.length>=200} onClick={()=>patch({outputs:[...form.outputs,output()]})}>{label('addOutput','增加实际产出或损耗')}</button>
    <p className={s.muted}>{label('costHint','本单保留实际投入金额，产出成本待财务分配；未知成本不会显示为已确认零成本。')}</p>
    <div className={s.actions}>
      {(!selected||selected.state==='DRAFT')&&<><button disabled={!editable||!currentSources.available} onClick={()=>run(async()=>{await save();})}>{label('save','保存实际作业草稿')}</button>
        <button disabled={busy||!selected||!permission.canEdit||!currentSources.available} onClick={()=>run(freeze)}>{label('freeze','核对并冻结实际作业')}</button></>}
      {selected?.state==='READY'&&<button disabled={busy||!permission.canApprove||selected.created_by===actor||selected.ready_by===actor} onClick={()=>run(async()=>{
        await send(`/${selected.id}/approve`,{version:selected.version,contentHash:selected.content_hash});await load(selected.id);
      })}>{label('approve','独立审核实际作业')}</button>}
      {selected&&['APPROVED','POSTED'].includes(selected.state)&&<button disabled={busy||selected.state!=='POSTED'&&(!permission.canEdit||!currentSources.available)} onClick={()=>run(async()=>{
        await send(`/${selected.id}/post`,{submitKey:selected.submit_key,contentHash:selected.content_hash});await load(selected.id);
      })}>{selected.state==='POSTED'?label('replay','找回原转换回执'):label('post','按原摘要确认实际转换')}</button>}
      {selected&&['DRAFT','READY','APPROVED'].includes(selected.state)&&<button disabled={busy||!permission.canEdit} onClick={()=>run(async()=>{
        await send(`/${selected.id}/cancel`,{version:selected.version});await load(selected.id);
      })}>{label('cancel','取消未过账作业')}</button>}
    </div>
    {selected&&<article className={s.notice}><strong className={s.wide}>{selected.document_no}</strong><p>{states[selected.state]??selected.state} · {kinds[selected.payload.request.operationKind]??selected.payload.request.operationKind} · v{selected.version}</p>
      {selected.expected_posting_date&&<p>{label('postingDate','本次记账日期')}：{selected.expected_posting_date}</p>}
      {selected.receipt&&<div role="status"><p>{label('receipt','原转换回执')} · {selected.receipt.inputQuantity} = {selected.receipt.outputQuantity} + {selected.receipt.lossQuantity}</p>
        <p>{label('pendingCost','产出成本待分配')}</p>{selected.receipt.batches.map(b=><p className={s.wide} key={b.batchNo}>{b.batchNo} · {outputKinds[b.outputKind]??b.outputKind} · {b.skuCode} · {gradeName(b.gradeCode)} · {b.quantity}</p>)}</div>}
    </article>}
    <div className={s.scroll}><table className={s.table}><thead><tr><th>{label('document','实际作业单')}</th><th>{t('common.status','状态')}</th><th>{t('common.operation','操作')}</th></tr></thead>
      <tbody>{currentRows.map(d=><tr key={d.id}><td className={s.wide}>{d.physical_group_ref}</td><td>{states[d.state]??d.state}</td><td><button disabled={busy} onClick={()=>run(async()=>{await load(d.id);})}>{t('common.view','查看')}</button></td></tr>)}</tbody></table></div>
  </section>;
}
