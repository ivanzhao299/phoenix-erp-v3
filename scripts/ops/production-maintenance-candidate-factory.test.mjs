/** Manifest interoperability only. No factory registry or release proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BackgroundManifestPublisher,HOLD_KINDS} from './background-control-manifest.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {nextMaintenanceOpenManifest,MaintenanceObservationGate} from './production-maintenance-candidate-factory.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const context={owner:'12345-1',previousFloorSha:'a'.repeat(40),targetSha:'b'.repeat(40)};
const participants=[{containerId:'c'.repeat(64),revision:context.targetSha,bootId:'11111111-1111-4111-8111-111111111111',allowedKinds:[...HOLD_KINDS]}];
const current={protocolVersion:1,phase:'FENCED',owner:context.owner,generation:2,targetSha:context.targetSha,participants};
test('predicted completion digest equals the existing actual publisher projection',async()=>{
 let privateValue={protocolVersion:1,owner:context.owner,previousFloorSha:context.previousFloorSha,targetSha:context.targetSha,generation:2,phase:'FENCED',manifestDigest:digest(current)},publicValue=structuredClone(current),checked=false;
 const publisher=new BackgroundManifestPublisher({}, {guard:()=>{},inspect:()=>{},readPrivate:()=>privateValue,writePrivate:v=>{privateValue=v;},readPublic:()=>publicValue,writePublic:v=>{publicValue=v;}});
 const predicted=nextMaintenanceOpenManifest(current,context,participants);
 const opened=await publisher.open(context,participants,async value=>{assert.deepEqual(value.participants,participants);checked=true;return true;});
 assert.equal(checked,true);assert.deepEqual(opened,predicted);assert.equal(privateValue.manifestDigest,digest(predicted));assert.notEqual(digest(predicted),canonicalDigest(predicted));
});
test('completion cannot be predicted from wrong owner, target, phase or generation',()=>{
 for(const change of [{owner:'54321-1'},{targetSha:'d'.repeat(40)},{phase:'OPEN'},{generation:1},{generation:3}])assert.throws(()=>nextMaintenanceOpenManifest({...current,...change},context,participants),/OWNED_ADOPTED_FENCE/);
});
test('changed or empty participants never receive a next OPEN projection',()=>{
 assert.throws(()=>nextMaintenanceOpenManifest(current,context,[]));
 assert.throws(()=>nextMaintenanceOpenManifest(current,context,[{...participants[0],bootId:'22222222-2222-4222-8222-222222222222'}]),/OWNED_ADOPTED_FENCE/);
});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const window=()=>({start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+60000).toISOString()});
test('the full binding/ingress/inventory observation is serialized across monitor and step',async()=>{
 const gate=new MaintenanceObservationGate(window());let active=0,maximum=0;const events=[];
 const read=name=>gate.run({timeoutMs:1000},async()=>{
  active++;maximum=Math.max(maximum,active);events.push(name+':binding');await wait(10);events.push(name+':ingress');await wait(10);events.push(name+':inventory');active--;return name;
 });
 assert.deepEqual(await Promise.all([read('monitor'),read('step')]),['monitor','step']);assert.equal(maximum,1);
 assert.deepEqual(events,['monitor:binding','monitor:ingress','monitor:inventory','step:binding','step:ingress','step:inventory']);
 await gate.join();assert.equal(gate.debt().pendingCaptures,0);
});
test('expired queued capture never starts and ignored abort retains actual debt',async()=>{
 const gate=new MaintenanceObservationGate(window());let release,secondStarted=false;
 const first=gate.run({timeoutMs:1000},()=>new Promise(resolve=>{release=resolve;}));const firstRejected=assert.rejects(first);
 await wait(5);
 const second=gate.run({timeoutMs:20},async()=>{secondStarted=true;});await assert.rejects(second,/OBSERVATION_DEADLINE/);
 assert.equal(secondStarted,false);assert.ok(gate.debt().pendingCaptures>0);
 await assert.rejects(gate.join({timeoutMs:20}),/CAPTURE_UNSETTLED/);
 release();await firstRejected;await wait(0);assert.equal(secondStarted,false);assert.equal(gate.debt().pendingCaptures,0);
 await assert.rejects(gate.run({timeoutMs:1000},async()=>{}));
});
