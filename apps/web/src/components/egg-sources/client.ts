'use client';

import { EGG_SOURCE_MENU } from '@/lib/egg-source-permissions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePermission } from '@/hooks/usePermission';
import { dispatchAuthExpired } from '@/lib/auth-dispatch';
import { eggSourceEndpoint } from '@/lib/egg-source-api';

export function useEggIdentity() {
  const { canView,user } = usePermission(EGG_SOURCE_MENU);
  return canView ? identity(user) : '';
}

function identity(user:Record<string,unknown>) {
  const actor = user.userId ?? user.id ?? user.username;
  return actor == null ? '' : JSON.stringify([String(actor),user.impersonatedBy??null,user.perms_version??null]);
}

function sessionIdentity() {
  try { return identity(JSON.parse(sessionStorage.getItem('phoenix_user') || '{}')); }
  catch { return ''; }
}

export class EggError extends Error {
  constructor(readonly status:number,readonly subcode?:string) { super(String(status)); }
}

export function sourceCreationProblem(code:unknown): code is string {
  return typeof code==='string' && ['SOURCE_CONTRACT_CHANGED','HOUSE_NOT_OPEN','HOUSE_PAUSED','WRITES_PAUSED',
    'NO_CALENDAR','NOT_ENROLLED'].includes(code);
}

export async function eggRequest<T>(account:string,path:string,validate:(data:T)=>boolean,options?:RequestInit) {
  if (!account || account!==sessionIdentity()) throw new EggError(401);
  const token = sessionStorage.getItem('phoenix_token');
  if (!token) throw new EggError(401);
  const response = await fetch('/api'+eggSourceEndpoint+path,{ ...options,
    headers:{ Authorization:`Bearer ${token}`,'Content-Type':'application/json' } });
  if (account!==sessionIdentity()) throw new EggError(401);
  const envelope = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status===401 && token===sessionStorage.getItem('phoenix_token')) {
      dispatchAuthExpired(envelope?.subcode==='PERMS_CHANGED' ? 'perms_changed' : 'expired');
    }
    throw new EggError(response.status,envelope?.subcode);
  }
  if (![200,201].includes(envelope?.code) || envelope?.data==null || !validate(envelope.data)) throw new EggError(502);
  return envelope.data as T;
}

type ReadState<T> = { scope:object;data?:T;error?:Error };
export function useEggRead<T>(account:string,path:string|null,validate:(data:T)=>boolean) {
  const [revision,setRevision] = useState(0);
  const [result,setResult] = useState<ReadState<T>>();
  const reload = useCallback(() => setRevision(value => value+1),[]);
  const scope = useMemo(()=>({ account,path,revision }),[account,path,revision]);
  useEffect(() => {
    if (!scope.account || !scope.path) return;
    const controller = new AbortController();
    eggRequest(scope.account,scope.path,validate,{ signal:controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ scope,data });
    }).catch((error:unknown) => {
      if (!controller.signal.aborted) setResult({ scope,error:error instanceof Error ? error : new Error() });
    });
    return () => controller.abort();
  },[scope,validate]);
  const current = result?.scope===scope ? result : undefined;
  return { data:current?.data,error:current?.error,loading:!!account&&!!path&&!current,reload };
}

type Receipt = {id:string;state:string;version:number};
type Pending = {key:string;sentAt?:string;legacyCompany?:string};
type LegacyResolution = {status:'FOUND';receipt:Receipt}|{status:'UNKNOWN'|'V1_NOT_COMMITTED'};

function receiptIdentity(account:string) {
  try {
    const [actor,impersonation] = JSON.parse(account);
    return [actor,impersonation];
  } catch { return []; }
}
function loadPending(storageKey:string): Pending|null {
  try {
    const value:Pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (value && /^[0-9a-f-]{36}$/i.test(value.key)) return value;
    sessionStorage.removeItem(storageKey);
  } catch { /* storage may be unavailable */ }
  return null;
}

function savePending(storageKey:string,pending:Pending|null) {
  try {
    if (pending) sessionStorage.setItem(storageKey,JSON.stringify(pending));
    else sessionStorage.removeItem(storageKey);
  } catch { /* the in-session key remains available */ }
}

export function useEggWrite(account:string,resource:string,receiptPath:(key:string)=>string,onReceipt:(receipt:Receipt)=>void,
  legacyResolution?:{path:(key:string,company:string)=>string; onNotCommitted:()=>void}) {
  const storageKey = 'phoenix.egg-source.pending.'+JSON.stringify([receiptIdentity(account),resource]);
  const activeKey = JSON.stringify([account,resource]);
  const [known,setKnown] = useState<{storageKey:string;pending:Pending|null}>({ storageKey,pending:null });
  type Feedback='UNKNOWN'|'CONFLICT'|'FAILED'|'SAVED'|'V1_NOT_COMMITTED';
  const [workingOn,setWorkingOn]=useState<string|null>(null);
  const [outcome,setOutcome]=useState<{resource:string;feedback:Feedback|null;problem?:string}>();
  const busy=workingOn===activeKey;
  const feedback=outcome?.resource===activeKey ? outcome.feedback : null;
  const problem=outcome?.resource===activeKey ? outcome.problem : undefined;
  const report=(feedback:Feedback|null,problem?:string)=>setOutcome({resource:activeKey,feedback,problem});
  const inFlight = useRef(false);
  const body = useRef<{path:string;body:string;activeKey:string}|null>(null);
  const [retryContext,setRetryContext] = useState<string|null>(null);
  const liveResource = useRef(activeKey);
  useEffect(() => { liveResource.current = activeKey; return () => { liveResource.current=''; }; },[activeKey]);
  const pending = known.storageKey===storageKey ? known.pending : null;

  useEffect(() => {
    if (!account) return;
    const timer = window.setTimeout(() => setKnown({ storageKey,pending:loadPending(storageKey) }),0);
    return () => window.clearTimeout(timer);
  },[account,storageKey]);

  const active = () => activeKey===liveResource.current && account===sessionIdentity();
  const remember = (next:Pending|null) => {
    savePending(storageKey,next);
    if (active()) setKnown({ storageKey,pending:next });
  };
  const deliver = (receipt:Receipt) => {
    if (!active()) return;
    remember(null);
    body.current = null;
    setRetryContext(null);
    report('SAVED');
    onReceipt(receipt);
  };
  const isReceipt = (row:Receipt) => typeof row.id==='string' && Number.isInteger(row.version);
  async function perform(work:()=>Promise<void>) {
    if (inFlight.current || !active()) return;
    inFlight.current=true;
    setWorkingOn(activeKey);
    report(null);
    try { await work(); }
    finally {
      inFlight.current=false;
      setWorkingOn(previous=>previous===activeKey ? null : previous);
    }
  }
  const transmit = (path:string,json:string,replay = false) => perform(async () => {
    try {
      const response = await eggRequest<Receipt|{change:Receipt}>(account,path,
        value => isReceipt('change' in value ? value.change : value),{ method:'POST',body:json });
      deliver('change' in response ? response.change : response);
    } catch (error) {
      if (!active()) return;
      const status = error instanceof EggError ? error.status : 0;
      const subcode=error instanceof EggError ? error.subcode : undefined;
      if (!replay && [400,403,404,409,422].includes(status)) {
        remember(null);
        body.current=null;
        setRetryContext(null);
        report(status===409 ? 'CONFLICT' : 'FAILED',subcode);
      } else report('UNKNOWN',subcode);
    }
  });
  return {
    busy,feedback,problem,resetFeedback:()=>report(null),pending:!!pending,pendingKey:pending?.key,pendingLegacy:!!pending?.legacyCompany,sentAt:pending?.sentAt,canRetry:!!pending && retryContext===activeKey,
    send(path:string,input:Record<string,unknown>,legacyCompany?:string) {
      if (pending || inFlight.current || !active() || loadPending(storageKey)) return;
      const key = crypto.randomUUID();
      const json = JSON.stringify({ ...input,actionKey:key });
      body.current={ path,body:json,activeKey };
      setRetryContext(activeKey);
      remember({key,sentAt:new Date().toISOString(),...(legacyCompany?{legacyCompany}:{})});
      return transmit(path,json);
    },
    lookup() { return pending && perform(async () => {
      try {
        if (pending.legacyCompany && legacyResolution) {
          const result=await eggRequest<LegacyResolution>(account,legacyResolution.path(pending.key,pending.legacyCompany),
            value=>value?.status==='UNKNOWN'||value?.status==='V1_NOT_COMMITTED'||value?.status==='FOUND'&&isReceipt(value.receipt));
          if (!active()) return;
          if (result.status==='FOUND') {deliver(result.receipt);return;}
          if (result.status==='V1_NOT_COMMITTED') {
            legacyResolution.onNotCommitted();
            remember(null);body.current=null;setRetryContext(null);report('V1_NOT_COMMITTED');
            return;
          }
        } else {
          deliver(await eggRequest(account,receiptPath(pending.key),isReceipt));
          return;
        }
      } catch { /* keep the original request until an authoritative result is available */ }
      if (active()) report('UNKNOWN');
    }); },
    retry() {
      const saved=body.current;
      if (pending && saved?.activeKey===activeKey) return transmit(saved.path,saved.body,true);
    },
  };
}
