'use client';

import { useEffect, useRef, useState } from 'react';
import { secondaryActionButton } from '@/components/design-system/cockpit-styles';
import { eggRequest, EggError, sourceCreationProblem } from './client';
import { isRequirement, listOf, type Input, type Option, type Precheck } from './contracts';
import { PrecheckResult, useSourceText } from './parts';
import s from './EggSources.module.css';

function valid(result:Precheck) {
  return ['READY','BLOCKED'].includes(result.status) && Array.isArray(result.problems) &&
    listOf<Precheck['rows'][number]>(result.rows,row=>isRequirement(row) && ['PASSED','BLOCKED','NOT_CHECKED'].includes(row.status)
      && listOf<Precheck['rows'][number]['issues'][number]>(row.issues,issue=>typeof issue.layer==='string' && typeof issue.code==='string'));
}

export function PrecheckPanel({account,input,draftId,grades=[],specs=[],validate,disabled,placement,refreshWorkspace}:{
  account:string;input:Pick<Input,'houseCode'|'warehouseCode'|'targetClass'|'effectiveDate'>;draftId?:string;grades?:Option[];specs?:Option[];validate?:()=>boolean;disabled?:boolean;placement?:'button';refreshWorkspace?:()=>void
}) {
  const { label }=useSourceText();
  const current=useRef<AbortController|null>(null);
  const [state,setState]=useState<{input:typeof input; account:string;busy?:boolean;result?:Precheck;failure?:string}>();
  useEffect(()=>()=>{current.current?.abort();current.current=null;},[input,account]);
  const visible=state?.input===input&&state.account===account ? state : null;
  async function run() {
    if (visible?.busy || validate&&!validate()) return;
    const controller=new AbortController();
    current.current?.abort();
    current.current=controller;
    setState({input,account,busy:true});
    try {
      const path=draftId ? '/changes/'+encodeURIComponent(draftId)+'/precheck' : '/precheck';
      const result=await eggRequest<Precheck>(account,path,valid,{ method:'POST',signal:controller.signal,
        body:draftId ? undefined : JSON.stringify(input) });
      if (!controller.signal.aborted && result.targetClass===input.targetClass && result.effectiveDate===input.effectiveDate && result.houseCode===input.houseCode && result.warehouseCode===(input.warehouseCode??null)) {
        setState({input,account,result});
      } else if (!controller.signal.aborted) setState({input,account,failure:'precheckError'});
    } catch (error) {
      if (controller.signal.aborted) return;
      const status=error instanceof EggError ? error.status : 0;
      const problem=error instanceof EggError && sourceCreationProblem(error.subcode) ? 'problem.'+error.subcode : null;
      setState({input,account,failure:problem??(status===400?'precheckInputError':[401,403,404].includes(status)?'readDenied':'precheckError')});
    }
  }
  return <>
    <button type="button" style={secondaryActionButton} disabled={disabled||visible?.busy} onClick={()=>void run()}>
      {label(visible?.busy?'runningPrecheck':'preview')}
    </button>
    {visible?.failure&&<p role="alert" className={s.error}>{label(visible.failure)}
      {visible.failure.startsWith('problem.')&&refreshWorkspace&&<>{' '}
        <button type="button" style={secondaryActionButton} onClick={refreshWorkspace}>{label('refreshWorkspace')}</button></>}
    </p>}
    {visible?.result&&<div className={placement ? s.fullActionWidth : undefined}><PrecheckResult result={visible.result} grades={grades} specs={specs}/>
      {visible.result.readiness&&<p role="status" className={s.hint}>{label('readiness.'+visible.result.readiness.status)}
        {visible.result.readiness.code&&' · '+label('problem.'+visible.result.readiness.code)}</p>}</div>}
  </>;
}
