import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { baseline,beforeStandardMigration,extractFunctions,seal,unit,validateCatalog,verifyAppliedLedger,verifySource } from './egg-source-standard-release.mjs';
import { parseInspectionReceipt } from './egg-source-permissions-inspection-receipt.mjs';

const source='apps/api/src/database/migrations/'+unit+'.ts';
const added={timestamp:1795658800000,name:'EggSourceStandardGrants1795658800000'};
const original={legacy:['x'],typeorm:[{timestamp:1795658700000,name:'TransferCostEvidence1795658700000'}]};
test('accepts only exact appended ledger scope and preserves historical migration identity',()=>{
  const after={...original,typeorm:[...original.typeorm,added]};
  assert.deepEqual(beforeStandardMigration(after),original);
  assert.doesNotThrow(()=>verifyAppliedLedger(original,after));
  assert.throws(()=>verifyAppliedLedger(original,{...after,legacy:[]}),/AFTER_LEDGER/);
  assert.throws(()=>verifyAppliedLedger(original,{...after,typeorm:[...after.typeorm,{timestamp:9,name:'Unrelated'}]}),/AFTER_LEDGER/);
});
test('binds the final main tree to a reviewed seal and a single migration',()=>{
  const target='a'.repeat(40),head='b'.repeat(40),reviewed='c'.repeat(40),tree='d'.repeat(40),blob='e'.repeat(40);
  const git=(...args)=>{
    if(args[0]==='show'&&args[1]==='-s') return args.at(-1)===target ? baseline+' '+head : reviewed;
    if(args[0]==='show') return args[1]===target+':'+seal?reviewed:'PENDING';
    if(args[0]==='rev-parse')return tree;
    if(args[0]==='merge-base')return '';
    if(args[0]==='diff')return args[4]===reviewed?'M\t'+seal:args.includes('--name-status')?
      (args.includes(reviewed)?'M\t'+seal:'A\t'+source):'';
    if(args[0]==='ls-tree')return '100644 blob '+blob+'\t'+source;
    throw Error(args.join(' '));
  };
  assert.equal(verifySource(target,git).migrations[0].blob,blob);
  assert.throws(()=>verifySource(target,(...args)=>args[0]==='ls-tree'?'120000 blob '+blob:git(...args)),/MIGRATION_BLOB/);
});
test('catalog rejects partial installation and an incorrect effective-grant view',()=>{
  const empty={tableKind:null,viewKind:null,viewHash:null,columns:null,constraints:null,functions:{},triggers:[]};
  assert.doesNotThrow(()=>validateCatalog(empty));
  assert.throws(()=>validateCatalog({...empty,viewKind:'v'}),/SCHEMA_SHAPE/);
  const defs=extractFunctions(readFileSync(source,'utf8'));
  assert.equal(Object.keys(defs).length,3);
  assert.throws(()=>validateCatalog({...empty,tableKind:'r',viewKind:'v',viewHash:'wrong',functions:defs},defs),/SCHEMA_SHAPE/);
});
test('new scope requires its own inspection artifact and exact pending migration',()=>{
  const receipt='LEDGER_SHA256='+'a'.repeat(64)+'\nSCOPED_INSPECTION_SHA256='+'b'.repeat(64)+
    '\nPENDING_MIGRATION_FILES='+unit+'\nVET_BACKUP_VOLUME=VERIFIED\nINSPECT=COMPLETE\n';
  assert.equal(parseInspectionReceipt(receipt,'c'.repeat(40),'123-1','egg-source-standard-1127').run,'123-1');
  assert.throws(()=>parseInspectionReceipt(receipt,'c'.repeat(40),'123-1','egg-source-house-1126'),/PENDING_MIGRATION_FILES/);
});
