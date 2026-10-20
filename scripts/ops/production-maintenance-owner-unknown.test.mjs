import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from '../ci/maintenance-transition-fixture.mjs';
import {canonicalDigest,bindingDigest,MAINTENANCE_AUTHORITY_SCHEMA} from './production-maintenance-receipts.mjs';
import {validateOwnerAuthUnknownDecision,createOwnerAuthUnknownApproval,isOwnerAuthUnknownApproval,verifyOwnerAuthUnknownAuthority} from './production-maintenance-owner-unknown.mjs';
import {verifyCommittedLegacyReconciliation} from './production-maintenance-reconciliation.mjs';
function setup(){
 const f=fixture({clock:Date.now}),context=f.context;
 const decision={schema:'phoenix.owner-scoped-auth-unknown-decision/v1',origin:'TRUSTED_INTERACTIVE_USER',authorizationRef:'OWNER_SCOPED_AUTH_UNKNOWN_NO_REPLAY',authorizationDigest:'d'.repeat(64),previousFloorSha:context.previousFloorSha,targetSha:context.targetSha,oldApiContainerId:context.preSnapshot.api.id,domain:'CHANJET_AUTH_REQUESTS',objects:[`api/${context.preSnapshot.api.id}/chanjet-auth-lineage`],noReplay:true,businessMutation:false,window:context.window};
 context.scopedUnknownDecisionSha256=canonicalDigest(decision);
 const maintenance={schema:MAINTENANCE_AUTHORITY_SCHEMA,authorityKind:'OWNER_DELEGATED',decision:'AUTHORIZED',purpose:'MAINTENANCE',bindingDigest:bindingDigest(context),payload:{fixture:true},payloadSha256:canonicalDigest({fixture:true}),ownerGrantSha256:'e'.repeat(64)};
 const envelope={...f.reconciliation,body:{...f.reconciliation.body,approvedScopeDigest:maintenance.payloadSha256}};
 envelope.body.domains.find(row=>row.domain==='CHANJET_AUTH_REQUESTS').disposition='SCOPED_NO_REPLAY_ACCEPTED';
 Object.assign(envelope.body.domains.find(row=>row.domain==='CHANJET_AUTH_REQUESTS'),{unknownEffects:1,unknownObjects:decision.objects});
 const approval=createOwnerAuthUnknownApproval(context,maintenance,envelope,decision);
 const records=[{kind:'STOP_LEGACY',payload:f.stopped},{kind:'UNKNOWN_EFFECTS_AUTHORITY',payload:approval},{kind:'RECONCILIATION',payload:envelope}],state={receipts:[0,1,2]};
 const store={readReceipt:index=>records[index],readOwnedState:()=>structuredClone(state)};
 return {context,decision,maintenanceApproval:maintenance,envelope,approval,records,state,store,verifyAuthority:async()=>true};
}
test('object-scoped decision keeps unknown distinct from maintenance permission',()=>{const f=setup();validateOwnerAuthUnknownDecision(f.decision,f.context);const expected={purpose:'UNKNOWN_EFFECTS',context:f.context,bindingDigest:bindingDigest(f.context)};assert.equal(isOwnerAuthUnknownApproval(f.approval,expected),true);assert.equal(isOwnerAuthUnknownApproval({...f.approval,purpose:'MAINTENANCE'},expected),false);});
test('wrong object, Web/business write scope, stale SHA or expired window refuses decision',()=>{for(const mutate of [d=>d.objects=['api/other/chanjet-auth-lineage'],d=>d.businessMutation=true,d=>d.noReplay=false,d=>d.targetSha='f'.repeat(40),d=>d.window.end='2020-01-01T00:00:00.000Z']){const f=setup();mutate(f.decision);assert.throws(()=>validateOwnerAuthUnknownDecision(f.decision,f.context),/EXACT_OWNER/);}});
test('structural approval alone never reads as actual authority',async()=>{const f=setup();assert.equal(await verifyOwnerAuthUnknownAuthority(f.approval,{purpose:'UNKNOWN_EFFECTS',context:f.context,bindingDigest:bindingDigest(f.context)},f.maintenanceApproval),false);});
test('committed closure requires separate same-chain approved unknown evidence',async()=>{const f=setup();assert.equal(await verifyCommittedLegacyReconciliation(f),true);f.records.splice(1,1);f.state.receipts=[0,1];await assert.rejects(()=>verifyCommittedLegacyReconciliation(f),/AUTHORITY_REQUIRED/);});
test('source acceptance is not enough if authority verifier rejects',async()=>{const f=setup();await assert.rejects(()=>verifyCommittedLegacyReconciliation({...f,verifyAuthority:async()=>false}),/AUTHORITY_REJECTED/);});
test('approval for another reconciliation or parent maintenance scope refuses release',async()=>{for(const key of ['reconciliationEvidenceSha256','scopeDigest']){const f=setup();f.approval.payload[key]='f'.repeat(64);f.approval.payloadSha256=canonicalDigest(f.approval.payload);await assert.rejects(()=>verifyCommittedLegacyReconciliation(f),/AUTHORITY_REJECTED/);}});
test('a reordered or synthetic receipt list cannot replace actual owned state',async()=>{const f=setup();await assert.rejects(()=>verifyCommittedLegacyReconciliation({...f,state:{receipts:[1,0,2]}}),/STATE_CHANGED/);});
test('state drift while authority is awaited refuses release',async()=>{const f=setup();await assert.rejects(()=>verifyCommittedLegacyReconciliation({...f,verifyAuthority:async()=>{f.store.readOwnedState=()=>({receipts:[0,2]});return true;}}),/STATE_CHANGED/);});
