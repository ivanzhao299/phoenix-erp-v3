import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  expectedLedgerEntry, unit, validateCatalog, verifyAppliedLedger, verifySource, withoutHouseMigration,
} from './egg-source-house-release.mjs';
import { parseInspectionReceipt } from './egg-source-permissions-inspection-receipt.mjs';

const base='2deff2c343eb012a16d6f0ac4e305533c96705f5';
const target='779d78aaec96f7a54b9f43c763d3c5a60c19b489', sealed='b'.repeat(40), reviewed='c'.repeat(40);
const followup='a'.repeat(40), followupSeal='f'.repeat(40), followupReviewed='1'.repeat(40);
const seal='scripts/ops/egg-source-house-reviewed-head';
const migration='apps/api/src/database/migrations/'+unit+'.ts';
const preflightSeal='scripts/ops/egg-source-house-preflight-reviewed-head';
const preflightFiles=['.github/workflows/controlled-pending-migration-apply.yml','scripts/ops/egg-source-house-release.mjs','scripts/ops/egg-source-house-release.test.mjs',
  'scripts/ops/vet-1124-migration.test.mjs',preflightSeal];

function fixture({ migrationDiff='A\t'+migration,floor='',sealDiff='M\t'+seal,firstParent=base,followupFiles=preflightFiles }={}) {
  const parents=new Map([[target,firstParent+' '+sealed],[sealed,reviewed],[followup,target+' '+followupSeal],[followupSeal,followupReviewed]]);
  const seals=new Map([[target+':'+seal,reviewed],[reviewed+':'+seal,'PENDING'],
    [followup+':'+preflightSeal,followupReviewed],[followupReviewed+':'+preflightSeal,'PENDING']]);
  return (command,...args)=>{
    if(command==='show') return args.includes('--format=%P') ? parents.get(args.at(-1)) : seals.get(args[0]);
    if(command==='diff') {
      if (args.includes('--name-only')) return args.includes('--') ? floor : followupFiles.join('\n');
      return args.includes('--') ? migrationDiff : args.includes(followupSeal) ? 'M\t'+preflightSeal : sealDiff;
    }
    if(command==='rev-parse') return 'd'.repeat(40);
    if(command==='merge-base') return '';
    if(command==='ls-tree') return '100644 blob '+'e'.repeat(40)+'\t'+migration;
    throw Error(command);
  };
}

test('the release accepts one migration and an unchanged protected configuration floor',()=>{
  assert.equal(verifySource(target,fixture()).migrations[0].path,migration);
  assert.throws(()=>verifySource(target,fixture({migrationDiff:'A\tother.ts'})),/MIGRATION_SET/);
  assert.throws(()=>verifySource(target,fixture({floor:'docker-compose.yml'})),/CONFIG_FLOOR/);
  assert.throws(()=>verifySource(target,fixture({sealDiff:'M\tother.ts'})),/REVIEWED_TREE/);
  assert.throws(()=>verifySource(target,fixture({firstParent:'2'.repeat(40)})),/EXACT_MAIN_MERGE/);
});

test('the preflight follow-up may only change the reviewed check and seal',()=>{
  assert.equal(verifySource(followup,fixture()).reviewed,followupReviewed);
  assert.throws(()=>verifySource(followup,fixture({followupFiles:[...preflightFiles,'apps/api/extra.ts']})),/PREFLIGHT_ONLY_DIFF/);
});

test('recovery reconstructs the original ledger with one precise addition',()=>{
  const before={legacy:[{name:'base'}],typeorm:[{name:'Older123',timestamp:123}]};
  const after={...before,typeorm:[...before.typeorm,expectedLedgerEntry]};
  assert.deepEqual(withoutHouseMigration(after),before);
  verifyAppliedLedger(before,after);
  assert.throws(()=>verifyAppliedLedger(before,{...after,legacy:[]}),/AFTER_LEDGER_DELTA/);
  assert.throws(()=>verifyAppliedLedger(before,{...after,typeorm:[...after.typeorm,expectedLedgerEntry]}),/AFTER_LEDGER_DELTA/);
  assert.throws(()=>verifyAppliedLedger(before,before),/AFTER_LEDGER_DELTA/);
});

test('schema proof checks legacy and new fences and a quiet V2 launch',()=>{
  const legacy=[
    ['md_egg_source_change_events','egg_source_event_require_independent_writer','require_independent_egg_source_writer','O',7],
    ['md_egg_source_changes','egg_source_require_independent_writer','require_independent_egg_source_writer','O',23],
  ];
  const before={databaseMajor:18,contract:null,newTables:false,anyNewTables:false,controlColumns:0,triggers:legacy};
  validateCatalog(before,null);
  assert.throws(()=>validateCatalog({...before,anyNewTables:true},null),/PARTLY_APPLIED/);
  const after={...before,contract:['smallint',true,'1'],controlColumns:5,newTables:true,anyNewTables:true,triggers:[
    ['md_egg_source_change_events','egg_source_event_require_house_protocol','require_egg_source_house_protocol','O',7],
    legacy[0],
    ['md_egg_source_house_rollouts','egg_source_house_rollout_managed','guard_egg_source_house_rollout','O',31],
    ['md_egg_source_organization_grants','egg_source_organization_grants_managed','guard_egg_source_organization_grants','O',31],
    ['md_egg_source_changes','egg_source_require_house_protocol','require_egg_source_house_protocol','O',23],
    legacy[1],
  ]};
  const state={control:[[1,false,false,null,null,null]],grants:0,rollouts:0,changes:0};
  validateCatalog(after,state);
  assert.throws(()=>validateCatalog({...after,triggers:after.triggers.slice(1)},state),/TRIGGERS/);
  assert.throws(()=>validateCatalog(after,{...state,grants:1}),/POST_SCHEMA/);
  assert.throws(()=>validateCatalog(after,{...state,control:[[1,true,true,null,'1','release']]}),/POST_SCHEMA/);
});

test('recovery requires original backup and does not enter the migration runner',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/controlled-pending-migration-apply.yml',import.meta.url),'utf8');
  const recovery=workflow.indexOf('node "$STAGE/pending-migration-backup-paths.mjs" recover');
  assert.ok(recovery>0);
  assert.ok(workflow.indexOf('HOLD_RECOVERY_WITH_PENDING')<recovery);
  assert.ok(recovery<workflow.indexOf('node "$STAGE/$SCOPED_REVIEW_HELPER" recover'));
  assert.ok(workflow.indexOf('HOLD_RECOVERY_PROOF_REQUIRED')<workflow.indexOf('PRESERVE_ARTIFACTS=true bash scripts/deploy-schema-first.sh'));
  assert.ok(workflow.indexOf('node "$STAGE/$SCOPED_REVIEW_HELPER" after')<workflow.indexOf('node "$STAGE/record-migration-apply-receipt.mjs"'));
  const ledgerSha256='8'.repeat(64),scopedInspectionSha256='9'.repeat(64);
  const log=['LEDGER_SHA256='+ledgerSha256,'PENDING_MIGRATION_FILES= '+unit,
    'SCOPED_INSPECTION_SHA256='+scopedInspectionSha256,'VET_BACKUP_VOLUME=VERIFIED','INSPECT=COMPLETE'].join('\n');
  assert.deepEqual(parseInspectionReceipt(log,target,'77-1','egg-source-house-1126'),{target,run:'77-1',ledgerSha256,scopedInspectionSha256});
  assert.throws(()=>parseInspectionReceipt(log,target,'77-1','egg-source-permissions-1126'),/INVALID_PENDING_MIGRATION_FILES/);
});
