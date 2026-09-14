'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {packingHistoryRequest,packingIdentity} from '@/lib/packing-history-api';
export default function PackingProductionReport(){
 const {user}=useAuth(),identity=packingIdentity(user);
 const [date,setDate]=useState(''),[shiftId,setShiftId]=useState(''),[query,setQuery]=useState(''),[state,setState]=useState<{key:string;result:any;error:string}>({key:'',result:null,error:''});
 const key=`${identity}:${query}`;
 useEffect(()=>{let current=true;const abort=new AbortController();setState({key,result:null,error:''});if(identity&&query)packingHistoryRequest(`reports/production-summary?${query}`,{signal:abort.signal}).then(result=>{if(current)setState({key,result,error:''});}).catch(e=>{if(current&&!abort.signal.aborted)setState({key,result:null,error:e.message});});return()=>{current=false;abort.abort();};},[key,query,identity]);
 const result=state.key===key?state.result:null,error=state.key===key?state.error:'',loading=!!query&&!result&&!error;
 const load=(trend=false)=>{const from=trend?new Date(Date.parse(date)-6*86400000).toISOString().slice(0,10):date;const q=new URLSearchParams({dateFrom:from,dateTo:date,aggregation:shiftId?'SHIFT':'DAY'});if(shiftId)q.set('shiftId',shiftId);setQuery(q.toString());};
 return <main style={{padding:24,overflow:'auto'}}><h1>包装生产日报</h1><p>终端原包装单口径，按原生产日统计；与旧任务统计分别展示，不合计。</p>
 <form onSubmit={e=>{e.preventDefault();load();}}><label>原生产日 <input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
 <label>精确班次 ID（留空为全天）<input inputMode="numeric" value={shiftId} onChange={e=>setShiftId(e.target.value)} pattern="[1-9][0-9]*"/></label><button disabled={loading||!date}>查询</button><button type="button" disabled={loading||!date||!!shiftId} onClick={()=>load(true)}>截至该日七日趋势</button></form>
 {loading&&<p role="status">查询中</p>}{error&&<p role="alert">{error}</p>}{result&&<><h2>{result.aggregation==='DAY'?'全天所有授权班次':'指定班次'}</h2><p>{result.totalEggs} 枚 / {result.totalBoxes} 盒，作废单 {result.voidCount}；班次 {result.shiftIds.join('、')}</p>
 <p>分级原产出 {result.gradingEggs} 枚；包装原产出 {result.totalEggs} 枚（分别统计）</p><p>{result.unassigned?.message}</p><table><thead><tr><th>原生产日</th><th>枚数</th><th>盒数</th></tr></thead><tbody>{result.days.map((d:any)=><tr key={d.date}><td>{d.date}</td><td>{d.totalEggs}</td><td>{d.totalBoxes}</td></tr>)}</tbody></table>
 {result.records.map((r:any)=><p key={r.code}><Link href={`/packaging/history/${encodeURIComponent(r.code)}`}>{r.code}</Link> · {r.totalEggs} 枚 / {r.totalBoxes} 盒 · {r.handover.state}</p>)}</>}
 <Link href="/packaging/history">查询包装历史</Link></main>;
}
