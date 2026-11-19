import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {ModernSchemaReleaseState,MODERN_SCHEMA_PHASES,classifyModernSchemaRecovery} from './production-modern-schema-state.mjs';
import {ModernSchemaRegistry} from './production-modern-schema-registration.mjs';
import {readLinuxProcessIdentity} from './production-modern-schema-session-lease.mjs';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function fixture(){
 const {context}=modernSchemaFixture(),directory=fs.mkdtempSync(path.join(root,'artifacts/modern-schema-state-'));
 const store=new ModernSchemaRegistry({directory,expectedUid:process.getuid(),guard(){},inspectDirectory:()=>{const stat=fs.statSync(directory);return {dev:stat.dev,ino:stat.ino,mode:stat.mode};}});
 const effects={leaseLost:false},deps={store,noOtherRelease(){},now:()=>Date.parse(context.window.start)+1000,authority:()=>({approvalSha256:'f'.repeat(64)}),
  checkLease:()=>{if(effects.leaseLost)throw Error('synthetic original lease lost');},
  writeAtomic:value=>fs.writeFileSync(store.file('schema-release-pending.json'),JSON.stringify(value)+'\n',{mode:0o600})};
 const state=new ModernSchemaReleaseState(context,'a'.repeat(64),deps),lease={fixtureOnly:true};return {state,store,effects,deps,context,lease};
}
test('durable REGISTERED pending exists before the caller can perform FENCE or stop an executor',()=>{
 const f=fixture();f.state.claim();assert.equal(f.store.read('schema-release-pending.json').phase,'REGISTERED');assert.equal(f.state.ddlIntentExists(),false);
 assert.throws(()=>f.state.claim(),/CREATE_ONLY/);assert.throws(()=>f.state.advance('REGISTERED','R_STOPPED',{}),/SINGLE_NEXT_STEP/);
});
test('lease loss when the DRAINED receipt lands preserves orphan evidence and cannot return success',()=>{
 const f=fixture();f.state.claim();const write=f.store.immutable.bind(f.store);
 f.store.immutable=(name,value)=>{write(name,value);if(name.endsWith('-1-drained.json'))f.effects.leaseLost=true;};
 assert.throws(()=>f.state.advance('REGISTERED','DRAINED',{fixtureOnly:true},{lease:f.lease}),/synthetic original lease lost/);
 assert.equal(f.state.read().phase,'REGISTERED');assert.equal(f.store.exists(`schema-release-step-${f.context.owner}-1-drained.json`),true);
 f.effects.leaseLost=false;assert.throws(()=>f.state.advance('REGISTERED','DRAINED',{}, {lease:f.lease}),/CREATE_ONLY/);
});
test('loss immediately after marker replacement is rechecked before any successful return',()=>{
 const f=fixture();f.state.claim();f.state.writeAtomic=value=>{f.deps.writeAtomic(value);f.effects.leaseLost=true;};
 assert.throws(()=>f.state.advance('REGISTERED','DRAINED',{}, {lease:f.lease}),/synthetic original lease lost/);assert.equal(f.state.read().phase,'DRAINED');
});
test('orphan DDL intent remains unknown even when marker replacement failed and ledger is unchanged',()=>{
 const f=fixture();f.state.claim();
 for(let index=0;index<6;index++)f.state.advance(MODERN_SCHEMA_PHASES[index],MODERN_SCHEMA_PHASES[index+1],{},index===0?{lease:f.lease}:{});
 f.state.writeAtomic=()=>{throw Error('synthetic disk failure');};assert.throws(()=>f.state.advance('BACKUP_VERIFIED','DDL_STARTED',{}),/disk failure/);
 assert.equal(f.state.read().phase,'BACKUP_VERIFIED');assert.equal(f.state.ddlIntentExists(),true);
 const result=classifyModernSchemaRecovery({pending:f.state.read(),ddlIntentExists:true,facts:{ledgerUnchanged:true,schemaUnchanged:true,businessFactsUnchanged:true}});
 assert.equal(result.disposition,'DDL_RESULT_UNKNOWN_KEEP_FENCED');assert.equal(result.automaticRetry,false);assert.equal(result.automaticRollback,false);
});
test('only the original supervisor itself can advance; descendant admission is insufficient',()=>{
 const f=fixture();f.state.readProcess=()=>({...readLinuxProcessIdentity(process.pid),pid:process.pid+50000});f.state.checkProcess=()=>true;f.state.claim();
 assert.throws(()=>f.state.advance('REGISTERED','DRAINED',{}, {lease:f.lease}),/ORIGINAL_SUPERVISOR_WRITER_REQUIRED/);
});
test('pre-DDL restore eligibility requires every observed fact and never authorizes a restart itself',()=>{
 const facts=Object.fromEntries(['ledgerUnchanged','schemaUnchanged','businessFactsUnchanged','floorPinsUnchanged','transactionAbsent','allExecutorsAccountedFor','originalImagePresent'].map(key=>[key,true]));
 const input={pending:{phase:'R_STOPPED'},ddlIntentExists:false,facts};assert.equal(classifyModernSchemaRecovery(input).disposition,'ELIGIBLE_FOR_CONTROLLED_ORIGINAL_R_RESTORE');
 for(const key of Object.keys(facts)){assert.equal(classifyModernSchemaRecovery({...input,facts:{...facts,[key]:false}}).disposition,'PRE_DDL_FACTS_UNPROVED_KEEP_FENCED');}
 assert.equal(classifyModernSchemaRecovery(input).releaseAuthorized,false);
});
