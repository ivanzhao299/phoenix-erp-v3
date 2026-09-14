'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {packingHistoryRequest,packingIdentity} from '@/lib/packing-history-api';
const fields=[['packingCode','完整原单号'],['dateFrom','原生产日起'],['dateTo','止'],['companyCode','公司编码筛选'],['siteCode','场编码筛选'],['shiftId','精确班次 ID']] as const;
export default function PackingHistoryList({terminal=false}:{terminal?:boolean}){
 const {user}=useAuth(),identity=packingIdentity(user);
 const [query,setQuery]=useState(''),[draft,setDraft]=useState<Record<string,string>>({}),[state,setState]=useState<{key:string;result:any;error:string}>({key:'',result:null,error:''});
 const key=`${identity}:${query}`;
 useEffect(()=>{const sync=()=>{const q=new URLSearchParams(window.location.search);if(!q.has('pageSize'))q.set('pageSize','25');setQuery(q.toString());setDraft(Object.fromEntries(q));};sync();window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[]);
 useEffect(()=>{const abort=new AbortController();let current=true;setState({key,result:null,error:''});if(identity&&query)packingHistoryRequest(`history?${query}`,{signal:abort.signal}).then(result=>{if(current)setState({key,result,error:''});}).catch(e=>{if(current&&!abort.signal.aborted)setState({key,result:null,error:e.message});});return()=>{current=false;abort.abort();};},[key,identity,query]);
 const result=state.key===key?state.result:null,error=state.key===key?state.error:'';
 const navigate=(q:URLSearchParams)=>{window.history.pushState(null,'',`${window.location.pathname}?${q}`);setQuery(q.toString());};
 const base=terminal?'/terminal/packaging/history':'/packaging/history';
 return <main style={{padding:24,overflow:'auto'}}><h1>包装历史</h1><p>按原包装单查询，包含已关闭班次。筛选条件保存在本页 URL。</p>
 <form onSubmit={e=>{e.preventDefault();const q=new URLSearchParams();for(const [k,v] of Object.entries(draft))if(v.trim()&&k!=='cursor')q.set(k,v.trim());if(!q.has('pageSize'))q.set('pageSize','25');navigate(q);}}>
 {fields.map(([name,title])=><label key={name}>{title} <input type={name.startsWith('date')?'date':'text'} value={draft[name]||''} onChange={e=>setDraft(v=>({...v,[name]:e.target.value}))}/></label>)}
 {([['shiftStatus','班次状态',['ALL','OPEN','CLOSED']],['recordStatus','原单状态',['ALL','ACTIVE','VOID']],['handoverState','交接状态',['ALL','PENDING','COMMITTED','HANDOVER_ONLY','INVENTORY_ONLY']],['inventoryMode','入库模式',['ALL','PACKAGING_INBOUND','TEMP_PRODUCTION_INBOUND']],['pageSize','每页',['25','50','100']]] as const).map(([name,title,values])=><fieldset key={name}><legend>{title}</legend>{values.map(v=><label key={v}><input type="radio" name={name} checked={(draft[name]||values[0])===v} onChange={()=>setDraft(d=>({...d,[name]:v}))}/>{v}</label>)}</fieldset>)}<button>查询</button></form>
 {error&&<p role="alert">{error}</p>}{identity&&query&&!result&&!error&&<p role="status">正在查询</p>}
 {result&&<><p>符合条件 {result.totalMatching} 单</p><table><thead><tr><th>原单号</th><th>原生产日</th><th>班次</th><th>公司 / 场</th><th>原量</th><th>状态</th></tr></thead><tbody>
 {result.items.map((d:any)=><tr key={d.record.id}><td><Link href={`${base}/${encodeURIComponent(d.record.code)}`}>{d.record.code}</Link></td><td>{d.record.productionDate}</td><td>{d.shift.code} / {d.shift.status}</td><td>{d.ownership.companyCode} / {d.ownership.siteCode}</td><td>{d.record.totalEggs} 枚 / {d.record.totalBoxes} 盒</td><td>{d.record.recordStatus} / {d.handover.state} / {d.handover.quality}</td></tr>)}
 </tbody></table>{!result.items.length&&<p>没有符合条件的原单</p>}<button onClick={()=>window.history.back()}>上一页 / 返回</button><button disabled={!result.hasMore} onClick={()=>{const q=new URLSearchParams(query);q.set('cursor',result.nextCursor);navigate(q);}}>下一页</button></>}
 </main>;
}
