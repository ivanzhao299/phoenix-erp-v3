/** Bounded readonly experiment probes. Never production authorization. */
import { performance } from 'node:perf_hooks';
export function kernelRemaining(timeoutMs=170000, clock=()=>performance.now()) {
  const start=clock();let last=start;
  return ()=>{const now=clock();const value=Math.floor(timeoutMs-(now-start));
    if(![start,now,last].every(Number.isFinite)||now<last||!Number.isSafeInteger(value)||value<1)throw Error('KERNEL_FIXTURE_DEADLINE');last=now;return value;};
}
export function kernelCommandTimeout(remaining, requested=10000) {
  if(!Number.isSafeInteger(remaining)||remaining<1||!Number.isSafeInteger(requested)||requested<1||requested>35000)throw Error('KERNEL_FIXTURE_COMMAND_BUDGET');
  return Math.min(remaining,requested);
}
/** This function is also serialized into the owned readonly Node client. Keep
 * it closure-free: no untrusted code, path, URL or caller command is accepted. */
export function boundedOwnedHttpProbe(url,{requestFactory,remaining,ledger=[],expectedMarker,monotonicNow=()=>performance.now()}) {
  return new Promise((resolve,reject)=>{
    if(expectedMarker!==undefined&&!/^[a-f0-9]{32}-(old|candidate)$/.test(expectedMarker)){reject(Error('KERNEL_FIXTURE_PROBE_MARKER'));return;}
    const started=monotonicNow();const available=remaining();if(!Number.isFinite(started)){reject(Error('KERNEL_FIXTURE_PROBE_CLOCK'));return;}if(!Number.isSafeInteger(available)||available<1200){reject(Error('KERNEL_FIXTURE_PROBE_BUDGET'));return;}
    const debt={kind:'OWNED_HTTP_PROBE',pending:true,closeObserved:false};ledger.push(debt);
    let request,result,absolute,joining,settled=false,responseStarted=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(absolute);clearTimeout(joining);if(error)reject(error);else resolve(result);};
    const deadline=()=>{
      result=(result||responseStarted)?{kind:'HOLD',code:'EARLY_RESULT_UNCLOSED'}:{kind:'ERROR',code:'FIXTURE_TIMEOUT'};
      joining=setTimeout(()=>finish(Error('KERNEL_FIXTURE_PROBE_STDIO_OR_SOCKET_UNCLOSED')),500);
      try{request?.destroy();}catch{finish(Error('KERNEL_FIXTURE_PROBE_DESTROY_UNKNOWN'));}
    };
    absolute=setTimeout(deadline,700);
    try{
      request=requestFactory(url,{agent:false,headers:{Connection:'close'}},response=>{
        responseStarted=true;
        if(expectedMarker!==undefined&&response.headers?.['x-phoenix-fixture']!==expectedMarker)result={kind:'HOLD',code:'WRONG_OWNED_ENDPOINT'};
        response.on('error',()=>{result={kind:'HOLD',code:'RESPONSE_ERROR'};});response.resume();
        response.on('end',()=>{if(!result)result={kind:'HTTP',status:response.statusCode,...(expectedMarker?{markerVerified:true}:{})};});
      });
      request.on('error',error=>{if(!result)result={kind:'ERROR',code:error.code};});
      request.once('close',()=>{debt.pending=false;debt.closeObserved=true;
        if(!result){finish(Error('KERNEL_FIXTURE_PROBE_CLOSE_UNKNOWN'));return;}
        const elapsed=monotonicNow()-started;
        if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=1200||(result.code!=='FIXTURE_TIMEOUT'&&elapsed>=700)||result.kind==='HOLD'){finish(Error('KERNEL_FIXTURE_PROBE_CLOSE_DEADLINE'));return;}
        try{remaining();}catch(error){finish(error);return;}finish();
      });
    }catch{finish(Error('KERNEL_FIXTURE_PROBE_START_UNKNOWN'));}
  });
}
export const ownedHttpProbeProgram = `const http=require('node:http');const probe=${boundedOwnedHttpProbe.toString()};const start=performance.now();const remaining=()=>{const n=Math.floor(2500-(performance.now()-start));if(n<1)throw Error('KERNEL_FIXTURE_PROBE_DEADLINE');return n;};const hard=setTimeout(()=>{console.error('KERNEL_FIXTURE_PROBE_CLIENT_FORCED_FAILURE_EXIT');process.exit(70)},1500);probe(process.argv[1],{requestFactory:http.get,remaining,expectedMarker:process.argv[2]}).then(result=>{clearTimeout(hard);console.log(JSON.stringify(result))},()=>{console.error('KERNEL_FIXTURE_PROBE_CLIENT_HOLD');process.exitCode=70});`;
