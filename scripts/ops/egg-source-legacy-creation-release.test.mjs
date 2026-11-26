import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { baseline,extractDefinitions,seal,unit,validateGateCatalog,verifyAppliedLedger,verifySource } from './egg-source-legacy-creation-release.mjs';
import { parseInspectionReceipt } from './egg-source-permissions-inspection-receipt.mjs';

const target='a'.repeat(40), head='b'.repeat(40), reviewed='c'.repeat(40);
const migration='apps/api/src/database/migrations/'+unit+'.ts';
const mockGit=(bad='')=>(command,...args)=>{
  if (command==='show') {
    if (args[0]==='-s') return args[2]===target ? baseline+' '+head : reviewed;
    if (args[0]===target+':'+seal) return reviewed;
    if (args[0]===reviewed+':'+seal) return 'PENDING';
  }
  if (command==='diff') {
    if (args.includes('--name-only')) return bad==='config' ? 'scripts/ops/audit-daily-egg-inbound.mjs' : '';
    return args.includes('--') ? 'A\t'+(bad==='path' ? 'other.ts' : migration) : 'M\t'+(bad==='tree' ? 'other' : seal);
  }
  if (command==='rev-parse') return 'd'.repeat(40);
  if (command==='merge-base') return '';
  if (command==='ls-tree') return '100644 blob '+'e'.repeat(40)+'\t'+migration;
  throw Error(command);
};

test('seals the candidate and preserves the audit source and single DDL scope',()=>{
  assert.equal(verifySource(target,mockGit()).migrations[0].path,migration);
  assert.throws(()=>verifySource(target,mockGit('config')),/CONFIG_OR_AUDIT_FLOOR/);
  assert.throws(()=>verifySource(target,mockGit('path')),/MIGRATION_SET/);
  assert.throws(()=>verifySource(target,mockGit('tree')),/REVIEWED_TREE/);
});

test('proves the new scope with its own receipt and exactly one ledger addition',()=>{
  const before={legacy:[],typeorm:[{timestamp:1795654800000,name:'EggSourceHouseContract1795654800000'}]};
  const after={...before,typeorm:[...before.typeorm,{timestamp:1795658400000,name:'EggSourceLegacyCreationGate1795658400000'}]};
  verifyAppliedLedger(before,after);
  assert.throws(()=>verifyAppliedLedger(before,before),/AFTER_LEDGER/);
  assert.throws(()=>verifyAppliedLedger(before,{...after,legacy:[{}]}),/AFTER_LEDGER/);
  const log=['LEDGER_SHA256='+'f'.repeat(64),'PENDING_MIGRATION_FILES= '+unit,'SCOPED_INSPECTION_SHA256='+'a'.repeat(64),
    'VET_BACKUP_VOLUME=VERIFIED','INSPECT=COMPLETE'].join('\n');
  assert.equal(parseInspectionReceipt(log,target,'470-1','egg-source-legacy-creation-1126').target,target);
  assert.throws(()=>parseInspectionReceipt(log,target,'470-1','egg-source-house-1126'),/PENDING_MIGRATION_FILES/);
});

test('gate catalog distinguishes not installed, compatible default and illegally activated shape',()=>{
  validateGateCatalog({column:null,control:[[1,null]],triggers:[],functions:{}});
  assert.throws(()=>validateGateCatalog({column:null,control:[[1,null]],triggers:[[]],functions:{}}),/PARTIALLY_APPLIED/);
  const defs=extractDefinitions(readFileSync(new URL('../../'+migration,import.meta.url),'utf8'));
  const catalog={
    column:['boolean',true,'true'],control:[[1,true]],functions:defs,
    triggers:[
      ['md_egg_source_changes','egg_source_legacy_creation_guard','guard_egg_source_legacy_creation','O',7,true],
      ['md_egg_source_write_control','egg_source_legacy_creation_permanent','prevent_egg_source_legacy_reopening','O',27,true],
      ['md_egg_source_write_control','egg_source_write_control_no_truncate','prevent_egg_source_legacy_reopening','O',34,true],
    ],
  };
  validateGateCatalog(catalog,defs);
  assert.throws(()=>validateGateCatalog({...catalog,control:[[1,false]]},defs),/NEW_GATE_NOT_DEFAULT_COMPATIBLE/);
  assert.throws(()=>validateGateCatalog({...catalog,triggers:catalog.triggers.slice(1)},defs),/NEW_GATE_NOT_DEFAULT_COMPATIBLE/);
});
