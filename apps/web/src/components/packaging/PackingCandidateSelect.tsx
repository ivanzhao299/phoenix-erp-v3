'use client';
import {useEffect,useState,useId} from 'react';
import {SelectField} from '@/components/design-system/forms/SelectField';
import {packingHistoryRequest} from '@/lib/packing-history-api';
/** Search and keyset pagination stay within the original-record candidate endpoint. */
export function PackingCandidateSelect({title,value,onChange,sourcePath,disabled}:{title:string;value:string;onChange:(v:string)=>void;sourcePath:string;disabled?:boolean}){
 const selectId=useId();
 const [search,setSearch]=useState(''),[after,setAfter]=useState('');
 const key=JSON.stringify([sourcePath,search,after]);
 const [state,setState]=useState<{key:string;items:{code:string;label:string}[];nextCursor:string|null;error:string}>({key:'',items:[],nextCursor:null,error:''});
 const [selected,setSelected]=useState<{code:string;label:string}|null>(null);
 useEffect(()=>{let current=true;
  if(!sourcePath)return;
  packingHistoryRequest(`${sourcePath}&paged=1&limit=50&search=${encodeURIComponent(search)}&after=${encodeURIComponent(after)}`).then(result=>{if(current)setState({key,items:Array.isArray(result)?result:result.items,nextCursor:result.nextCursor||null,error:''});}).catch(()=>{if(current)setState({key,items:[],nextCursor:null,error:'候选读取失败'});});
  return()=>{current=false;};
 },[key,sourcePath,search,after]);
 const current=state.key===key,items=current?state.items:[];
 const options=[...(selected&&selected.code===value&&!items.some(i=>i.code===value)?[selected]:[]),...items].map(i=>({value:i.code,label:`${i.label} (${i.code})`}));
 return <fieldset disabled={disabled}><legend>{title}</legend><label>搜索{title}<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setAfter('');}}/></label>
 <label htmlFor={selectId}>选择{title}</label><SelectField id={selectId} value={value} options={options} disabled={disabled||!sourcePath||!current} onChange={v=>{const item=items.find(i=>i.code===v);if(!v||item){setSelected(item||null);onChange(v);}}}/>
 {current&&state.error&&<p role="alert">{state.error}</p>}{current&&!items.length&&!state.error&&<p role="status">无匹配的授权候选</p>}
 {current&&state.nextCursor&&<button type="button" onClick={()=>setAfter(state.nextCursor!)}>更多{title}</button>}
 {after&&<button type="button" onClick={()=>setAfter('')}>返回首批{title}</button>}
 </fieldset>;
}
