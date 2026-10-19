/** Opt-in synthetic containers only. This tests a supplied event sequence,
 * never a production STOP adapter, drain, authority, or continuous observer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fixture } from '../ci/maintenance-transition-fixture.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { validateLegacyTerminationEvents, TERMINATION_POLICY_SCHEMA } from './production-maintenance-termination-policy.mjs';
import { localTerminationDocker, terminationBudget, terminationEventFormat as format, inspectOwnedTerminationRuntime, isolatedTerminationStream } from './production-maintenance-termination-fixture.mjs';

const enabled=process.env.MAINTENANCE_TERMINATION_DOCKER_FIXTURE==='1';
const manifest=process.env.MAINTENANCE_TERMINATION_MANIFEST;
const owner=`termination-observation-${randomUUID()}`;
const resources=[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=localTerminationDocker();
const persist=()=>fs.writeFileSync(manifest,JSON.stringify({schema:'phoenix.isolated-termination-observation/v1',owner,resources,
  productionAuthority:false,fullFactory:false,continuousObserver:'NOT_INSTALLED',legacyDrainResult:'UNSUPPORTED'},null,2)+'\n',{mode:0o600});
const inspect=(resource,remaining)=>inspectOwnedTerminationRuntime(resource,{run,owner,remaining});
test('actual synthetic declared stop: bounded stream observations with history limitations', {skip:!enabled,timeout:90000},async t=>{
  assert.ok(path.isAbsolute(manifest||'') && (manifest.startsWith('/tmp/')||manifest.includes('/artifacts/')));
  fs.writeFileSync(manifest,'{}\n',{mode:0o600,flag:'wx'});persist();
  const base=run(['image','inspect','node:20-bookworm-slim','--format','{{.Id}}']);assert.match(base,/^sha256:[a-f0-9]{64}$/);
  const image=run(['build','--quiet','--pull=false','--label',`phoenix.test.owner=${owner}`,'--label','phoenix.test.kind=termination-observation','-'],
    {input:`FROM node:20-bookworm-slim\nLABEL org.opencontainers.image.revision=${'a'.repeat(40)}\n`,timeout:30000});
  assert.match(image,/^sha256:[a-f0-9]{64}$/);resources.push({kind:'image',id:image});persist();
  // BuildKit does not accept a local image config ID as a FROM repository.
  // Verify the actual resulting filesystem and runtime configuration instead
  // of claiming that the mutable tag alone pins the synthetic base.
  assert.equal(run(['image','inspect','node:20-bookworm-slim','--format','{{.Id}}']),base);
  const shape='{{json .RootFS.Layers}}\t{{json .Config.Cmd}}\t{{json .Config.Entrypoint}}\t{{json .Config.User}}\t{{json .Config.WorkingDir}}';
  assert.equal(run(['image','inspect',image,'--format',shape]),run(['image','inspect',base,'--format',shape]));
  for(const mode of ['term-exit','timeout-escalation']) await t.test(mode,async()=>{
    const code=`process.on('SIGTERM',()=>{${mode==='term-exit'?'process.exit(0);':''}});setInterval(()=>{},1000)`;
    const name=`phoenix-${owner}-${mode}`;
    const item={kind:'container',name,imageId:image,creation:'INTENT',stopAttempt:'NOT_STARTED'};resources.push(item);persist();
    item.id=run(['create','--name',name,'--pull=never','--restart=no','--network=none','--read-only','--cap-drop=ALL',
      '--security-opt=no-new-privileges','--pids-limit','64','--memory','128m','--stop-signal','SIGTERM',
      '--label',`phoenix.test.owner=${owner}`,'--label','phoenix.test.kind=termination-observation',
      '--health-cmd','node -e "process.exit(0)"','--health-interval','1s','--health-timeout','2s',image,'node','-e',code]);
    persist();inspect(item);item.creation='OWNED_ID_VERIFIED';persist();run(['start',item.id]);
    const deadline=performance.now()+15000;let before;
    do { before=inspect(item);if(before.running&&before.health==='healthy')break;assert.ok(performance.now()<deadline,'owned fixture health timeout');await wait(100); } while(true);
    const context=fixture().context;context.window={start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+60000).toISOString()};
    context.preSnapshot.api=before;context.executors=[before];
    const {id,imageId,revision,startedAt,restartCount}=before;
    const policy={schema:TERMINATION_POLICY_SCHEMA,protocol:'STOP_AND_RECONCILE',owner:context.owner,targetSha:context.targetSha,window:context.window,
      executors:[{id,imageId,revision,startedAt,restartCount}],method:'DOCKER_STOP',stopSignal:'SIGTERM',timeoutSeconds:30,
      timeoutEscalation:'DOCKER_SIGKILL',commandTimeoutMs:35000,maxAttempts:1,recoveryOperator:'owned-isolated-fixture-only'};
    context.terminationPolicy=policy;
    const command=['stop','--signal','SIGTERM','--time','30',item.id];
    const remaining=terminationBudget(),startMs=Date.now();
    item.stopAttempt='INTENT';item.policySha256=canonicalDigest(policy);item.commandSha256=canonicalDigest(command);persist();
    let observer;
    try {
      observer=isolatedTerminationStream({id:item.id,start:new Date(startMs).toISOString(),register:child=>{
        item.observer={originalPid:child.pid,registeredBeforeTargetStop:true,subscriptionReadiness:'NOT_PROVED'};persist();
      }});
      observer.assertLocalProcessLive();
      run(command,{timeout:remaining()});item.stopAttempt='COMMAND_RETURNED';persist();
      const after=inspect(item,remaining);assert.equal(after.running,false);assert.equal(after.pid,0);assert.equal(after.oomKilled,false);
      for(const key of ['id','imageId','revision','startedAt','restartCount'])assert.equal(after[key],before[key]);
      await observer.waitForTerminal(remaining);
      const endMs=Date.now();
      const text=run(['events','--filter',`container=${item.id}`,'--since',new Date(startMs).toISOString(),
        '--until',new Date(endMs).toISOString(),'--format',format],{timeout:remaining()});
      const history=text.split('\n').filter(Boolean).map(row=>JSON.parse(row));
      const endNano=BigInt(endMs)*1000000n;
      const interval={startNano:String(BigInt(startMs)*1000000n),endNano:String(BigInt(endMs)*1000000n)};
      // Retain the fixed safe projection before classification, including on
      // HOLD. Do not discard a real sequence because it challenges the model.
      item.before=before;item.after=after;item.interval=interval;item.safeHistory=history;persist();
      item.observer.close=await observer.close(remaining);
      // Classify the FINAL flushed sequence after actual stdio close. A row
      // delivered while closing must not be hidden by an earlier snapshot.
      const events=observer.snapshot().filter(e=>BigInt(e.timeNano)>=BigInt(startMs)*1000000n&&BigInt(e.timeNano)<endNano);
      item.safeEvents=events;persist();
      const observation=validateLegacyTerminationEvents(events,{policy,context,executorId:item.id,interval,exitCode:after.exitCode,oomKilled:after.oomKilled});
      remaining();
      assert.equal(observation.mechanism,mode==='term-exit'?'OBSERVED_TERM_THEN_EXIT':'OBSERVED_TERM_AND_KILL_DURING_STOP');
      assert.equal(after.exitCode,mode==='term-exit'?0:137);
      item.stopAttempt='ISOLATED_TERMINATION_OBSERVATION';item.before=before;item.after=after;item.observation=observation;
      item.filteredHistoryCompleteness='NOT_PROVED_NO_CONTINUOUS_STREAM';item.gracefulDrain='NOT_PROVED';persist();remaining();
    } catch(error) {
      item.stopAttempt='HOLD_OUTCOME_REQUIRES_INSPECTION';
      const pending=observer||error.originalObserverHandle;
      if(pending){
        item.observer??={originalPid:pending.child.pid};
        if(!pending.disposition().closeAttempted)try{item.observer.close=await pending.close(remaining);}catch{item.observer.closeAcceptance='HOLD';}
        item.observer.disposition=pending.disposition();item.observer.closeDebt=item.observer.disposition.cleanupDebt;
        item.safeEvents=pending.snapshot();
      }
      persist();throw error;
    }
  });
});
