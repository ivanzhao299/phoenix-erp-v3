'use client';
import {useEffect,useState,useCallback} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {packingHistoryRequest,packingIdentity} from '@/lib/packing-history-api';

export function usePackingRecord(packingCode:string){
  const {user}=useAuth();
  const identity=packingIdentity(user);
  const key=`${identity}:${packingCode}`;
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState<{key:string;data:any;error:string}>({key:'',data:null,error:''});
  useEffect(()=>{
    const abort=new AbortController();let current=true;
    setState({key,data:null,error:''});
    if(user&&packingCode)packingHistoryRequest(`history/${encodeURIComponent(packingCode)}`,{signal:abort.signal})
      .then(data=>{if(current)setState({key,data,error:''});})
      .catch(e=>{if(current&&!abort.signal.aborted)setState({key,data:null,error:e.message});});
    return()=>{current=false;abort.abort();};
  },[key,attempt]); // identity + code + explicit refresh; current shift never participates.
  return {data:state.key===key?state.data:null,error:state.key===key?state.error:'',loading:!!user&&!!packingCode&&(state.key!==key||(!state.data&&!state.error)),
    identityKey:key,reload:useCallback(()=>setAttempt(n=>n+1),[])};
}
