import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../ci/maintenance-transition-fixture.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { validateLegacyTerminationPolicy, requireLegacyTerminationApproval, redactLegacyTerminationEvent,
  validateLegacyTerminationEvents, TERMINATION_POLICY_SCHEMA } from './production-maintenance-termination-policy.mjs';

function sample() {
  const context = fixture().context;
  const policy = { schema:TERMINATION_POLICY_SCHEMA,protocol:'STOP_AND_RECONCILE',owner:context.owner,targetSha:context.targetSha,
    window:structuredClone(context.window),executors:context.executors.map(({id,imageId,revision,startedAt,restartCount}) => ({id,imageId,revision,startedAt,restartCount})),
    method:'DOCKER_STOP',stopSignal:'SIGTERM',timeoutSeconds:30,timeoutEscalation:'DOCKER_SIGKILL',commandTimeoutMs:35000,maxAttempts:1,recoveryOperator:'fixture-operator' };
  context.terminationPolicy = policy;
  const start = BigInt(Date.parse(context.window.start)+1000)*1000000n;
  const event = (Action,offset,Attributes = {}) => ({Type:'container',Action,Actor:{ID:context.preSnapshot.api.id,Attributes},timeNano:String(start+BigInt(offset))});
  const events = [event('kill',1n,{signal:'15'}),event('kill',30000000001n,{signal:'9'}),event('die',30000000002n,{exitCode:'137'}),event('stop',30000000003n)];
  const args = {policy,context,executorId:context.preSnapshot.api.id,interval:{startNano:String(start),endNano:String(start+35000000000n)},exitCode:137,oomKilled:false};
  return {context,policy,start,event,events,args};
}
test('exact policy and an explicit digest remain structural, never grant server authority', () => {
  const f=sample(); assert.deepEqual(validateLegacyTerminationPolicy(f.policy,f.context),f.policy);
  assert.throws(() => requireLegacyTerminationApproval({payload:{}},f.context),/POLICY_NOT_EXPLICITLY_IN_APPROVAL/);
  const result = requireLegacyTerminationApproval({payload:{terminationPolicySha256:canonicalDigest(f.policy)}},f.context);
  assert.equal(result.policySha256,canonicalDigest(f.policy)); assert.equal('approved' in result,false);
});
for (const [name,mutate] of [
  ['old target',p=>p.targetSha='e'.repeat(40)],['different owner',p=>p.owner='999-1'],['old window',p=>p.window.end='2026-10-18T01:15:00.000Z'],
  ['different image',p=>p.executors[0].imageId='sha256:'+'9'.repeat(64)],['second attempt',p=>p.maxAttempts=2],['shorter stop',p=>p.timeoutSeconds=1],
  ['no escalation declaration',p=>delete p.timeoutEscalation],['different signal',p=>p.stopSignal='SIGQUIT'],['longer command',p=>p.commandTimeoutMs=60000],
  ['unrecognized field',p=>p.allowForce=true],['secret-shaped operator',p=>p.recoveryOperator='operator\nENV=private']
]) test(`reject policy: ${name}`,()=> { const f=sample(),p=structuredClone(f.policy);mutate(p);assert.throws(()=>validateLegacyTerminationPolicy(p,f.context),/HOLD/); });
test('observed 30-second escalation keeps all completion and authority claims unproved',()=> {
  const f=sample(),r=validateLegacyTerminationEvents(f.events,f.args);
  assert.equal(r.mechanism,'OBSERVED_TERM_AND_KILL_DURING_STOP');assert.equal(r.exitCode,137);
  assert.equal(r.gracefulCompletion,'NOT_PROVED');assert.equal(r.businessReconciliation,'NOT_PROVED');assert.equal(r.productionAuthority,false);
  assert.equal(r.legacyDrainResult,'UNSUPPORTED');assert.match(r.coverage,/SUPPLIED_EVENT_SEQUENCE_ONLY/);
  assert.match(r.correlation,/NOT_EXCLUSIVE_ISSUER/);
});
test('TERM then process exit is an observation, not a business-completion receipt',()=> {
  const f=sample();f.args.exitCode=143;
  const r=validateLegacyTerminationEvents([f.event('kill',1n,{signal:'15'}),f.event('die',2n,{exitCode:'143'}),f.event('stop',3n)],f.args);
  assert.equal(r.mechanism,'OBSERVED_TERM_THEN_EXIT');assert.equal(r.gracefulCompletion,'NOT_PROVED');
});
for (const delay of [0n,1n,29999999999n]) test(`reject escalation before timeout: ${delay}ns`,()=>{
  const f=sample();f.events[1].timeNano=String(BigInt(f.events[0].timeNano)+delay);
  assert.throws(()=>validateLegacyTerminationEvents(f.events,f.args),/KILL_BEFORE_APPROVED_TIMEOUT/);
});
test('adjacent nanoseconds above Number-safe range retain exact order and event digest',()=>{
  const f=sample();const r=validateLegacyTerminationEvents(f.events,f.args);
  const changed=structuredClone(f.events);changed[3].timeNano=String(BigInt(changed[3].timeNano)+1n);
  assert.notEqual(validateLegacyTerminationEvents(changed,f.args).eventDigest,r.eventDigest);
  changed[3].timeNano=changed[2].timeNano;
  assert.throws(()=>validateLegacyTerminationEvents(changed,f.args),/AMBIGUOUS_TERMINAL_EVENT_TIME/);
  const rounded=structuredClone(f.events);rounded[0].timeNano=Number(rounded[0].timeNano);
  assert.throws(()=>validateLegacyTerminationEvents(rounded,f.args),/EVENT_SHAPE/);
});
test('actual daemon stop-before-die logging is retained as a partial order, never reordered',()=>{
  const f=sample();f.args.exitCode=0;
  const events=[f.event('kill',1n,{signal:'15'}),f.event('stop',2n),f.event('die',3n,{exitCode:'0'})];
  const r=validateLegacyTerminationEvents(events,f.args);assert.equal(r.terminalLogOrder,'STOP_BEFORE_DIE');
  assert.equal(r.eventDigest,canonicalDigest(events));assert.equal(r.gracefulCompletion,'NOT_PROVED');
  assert.throws(()=>validateLegacyTerminationEvents([events[1],events[0],events[2]],f.args),/STOP_EVENT/);
  const forced=sample();
  const beforeKill=[forced.events[0],forced.event('stop',2n),...forced.events.slice(1,3)];
  assert.throws(()=>validateLegacyTerminationEvents(beforeKill,forced.args),/UNAPPROVED_OR_REPEATED_SIGNAL/);
  const afterKill=[forced.events[0],forced.events[1],forced.event('stop',30000000002n),forced.event('die',30000000003n,{exitCode:'137'})];
  assert.equal(validateLegacyTerminationEvents(afterKill,forced.args).terminalLogOrder,'STOP_BEFORE_DIE');
});
for (const action of ['oom','pause','start','restart','unpause','destroy','rename','update','create','copy','commit','unknown'])
  test(`reject non-contract lifecycle: ${action}`,()=> { const f=sample();f.events.splice(1,0,f.event(action,2n));assert.throws(()=>validateLegacyTerminationEvents(f.events,f.args),/EXECUTOR_LIFECYCLE_CHANGED/); });
for (const oomKilled of [true,undefined,null,'false']) test(`reject unproved final OOM state: ${String(oomKilled)}`,()=>{
  const f=sample();assert.throws(()=>validateLegacyTerminationEvents(f.events,{...f.args,oomKilled}),/FINAL_EXECUTOR_OR_OOM_STATE/);
});
test('cannot use events from a previous attempt, future interval, other executor or oversized interval',()=>{
  const f=sample();
  for (const interval of [{startNano:String(f.start+2n),endNano:f.args.interval.endNano},
    {startNano:f.args.interval.startNano,endNano:f.events[3].timeNano},
    {startNano:f.args.interval.startNano,endNano:String(f.start+35000000001n)},
    {startNano:String(BigInt(Date.parse(f.context.window.start))*1000000n-1n),endNano:f.args.interval.endNano}])
    assert.throws(()=>validateLegacyTerminationEvents(f.events,{...f.args,interval}),/EVENT_OUTSIDE_INTERVAL|INTERVAL_OUTSIDE_POLICY/);
  assert.throws(()=>validateLegacyTerminationEvents(f.events,{...f.args,executorId:'f'.repeat(64)}),/FINAL_EXECUTOR_OR_OOM_STATE/);
  const other=structuredClone(f.events);other[0].Actor.ID='f'.repeat(64);
  assert.throws(()=>validateLegacyTerminationEvents(other,f.args),/EVENT_EXECUTOR_CHANGED/);
});
test('missing, duplicated, reordered or saturated event sequences are not accepted',()=>{
  const f=sample();
  for (const events of [[],f.events.slice(1),f.events.slice(0,-1),f.events.filter(e=>e.Action!=='die'),
    [f.events[0],f.events[0],...f.events.slice(1)], [...f.events].reverse(), Array(256).fill(f.events[0])])
    assert.throws(()=>validateLegacyTerminationEvents(events,f.args),/HOLD/);
});
test('137 alone and unexpected exit status do not prove approved Docker escalation',()=>{
  const f=sample();assert.throws(()=>validateLegacyTerminationEvents(f.events.filter(e=>e.Actor.Attributes.signal!=='9'),f.args),/SIGNAL_EXIT_CHAIN_INCOMPLETE/);
  f.args.exitCode=0;assert.throws(()=>validateLegacyTerminationEvents(f.events,f.args),/EXIT_EVENT/);
});
test('redaction removes command suffixes, arbitrary labels and environment-shaped attributes',()=>{
  const f=sample(),e=f.event('exec_create: private command',1n,{signal:'15',exitCode:null,password:'private',env:'private',name:'private'});
  const safe=redactLegacyTerminationEvent(e);
  assert.equal(safe.Action,'exec_create');assert.deepEqual(safe.Actor.Attributes,{signal:'15'});
  assert.equal(JSON.stringify(safe).includes('private'),false);
  for(const value of ['-1','256','9\n','secret',9]) assert.throws(()=>redactLegacyTerminationEvent(f.event('kill',1n,{signal:value})),/EVENT_ATTRIBUTE/);
});
test('caller-supplied sequences never claim continuous stream completeness or exclusive signal issuance',()=>{
  const f=sample(),r=validateLegacyTerminationEvents(f.events,f.args);
  assert.equal(r.coverage,'SUPPLIED_EVENT_SEQUENCE_ONLY_NOT_CONTINUOUS_OBSERVER_PROOF');
  assert.equal(r.correlation,'INTERVAL_AND_CONTAINER_ONLY_NOT_EXCLUSIVE_ISSUER');
});
