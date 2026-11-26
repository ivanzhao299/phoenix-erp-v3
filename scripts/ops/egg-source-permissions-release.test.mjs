import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { unit, validateCatalog, verifyAppliedLedger, verifySource } from './egg-source-permissions-release.mjs';
import { parseInspectionReceipt } from './egg-source-permissions-inspection-receipt.mjs';

const base='24ce3f015e2ba96ecfadbdf1ddf4dc2eb9872428';
const original='bb208ee3f6cbb9e4032969cc229bf5126ba45ec8';
const target='a'.repeat(40), sealed='b'.repeat(40), reviewed='c'.repeat(40);
const receiptSealed='f'.repeat(40), receiptReviewed='1'.repeat(40);
const seal='scripts/ops/egg-source-permissions-reviewed-head';
const receiptSeal='scripts/ops/egg-source-permissions-receipt-reviewed-head';
const path='apps/api/src/database/migrations/'+unit+'.ts';
const transportFiles = [
  '.github/workflows/controlled-pending-migration-apply.yml',
  'scripts/ops/egg-source-permissions-inspection-receipt.mjs',
  'scripts/ops/egg-source-permissions-release.mjs',
  'scripts/ops/egg-source-permissions-release.test.mjs',
  receiptSeal,
];

function gitFixture({migration='A\t'+path,floor='',sealChange='M\t'+seal,firstParent=base,
 /****/ receiptFiles=transportFiles, receiptParent=original, receiptSealChange='M\t'+receiptSeal}={}) {
  const parents = new Map([[original,firstParent+' '+sealed],[sealed,reviewed],
    [target,receiptParent+' '+receiptSealed],[receiptSealed,receiptReviewed]]);
  const seals = new Map([[original+':'+seal,reviewed],[reviewed+':'+seal,'PENDING'],
    [target+':'+receiptSeal,receiptReviewed],[receiptReviewed+':'+receiptSeal,'PENDING']]);
  return (command,...args) => {
    if (command==='show') return args.includes('--format=%P') ? parents.get(args.at(-1)) : seals.get(args[0]);
    if (command==='diff') {
      if (args.includes('--name-only')) return args.includes('--') ? floor : receiptFiles.join('\n');
      if (args.includes('--')) return migration;
      return args.includes(receiptSealed) ? receiptSealChange : sealChange;
    }
    if (command==='rev-parse') return 'd'.repeat(40);
    if (command==='merge-base') return '';
    if (command==='ls-tree') return '100644 blob '+'e'.repeat(40)+'\t'+path;
    throw Error(command);
  };
}

test('the sealed candidate binds the live baseline, preserved configuration floor and one migration',()=>{
  assert.equal(verifySource(original,gitFixture()).migrations[0].path,path);
  assert.throws(()=>verifySource(original,gitFixture({migration:'A\t'+path+'\nA\tother.ts'})),/MIGRATION_SET/);
  assert.throws(()=>verifySource(original,gitFixture({floor:'docker-compose.yml'})),/CONFIG_FLOOR/);
  assert.throws(()=>verifySource(original,gitFixture({sealChange:'M\tnew-app-file'})),/REVIEWED_TREE/);
  assert.throws(()=>verifySource(original,gitFixture({firstParent:'2'.repeat(40)})),/EXACT_MAIN_MERGE/);
});
test('the follow-up merge preserves the original approved source and allows only the sealed receipt change',()=>{
  assert.deepEqual(verifySource(target,gitFixture()),{target,reviewed,baseline:base,migrations:[{path,blob:'e'.repeat(40)}]});
  assert.throws(()=>verifySource(target,gitFixture({receiptParent:base})),/EXACT_MAIN_MERGE/);
  assert.throws(()=>verifySource(target,gitFixture({receiptSealChange:'M\tnew-app-file'})),/REVIEWED_TREE/);
  assert.throws(()=>verifySource(target,gitFixture({receiptFiles:[...transportFiles,'new-app-file']})),/RECEIPT_ONLY_DIFF/);
});
test('the artifact carries the two complete digests and discards other stdout',()=>{
  const ledgerSha256='8'.repeat(64), scopedInspectionSha256='9'.repeat(64);
  const complete=[
    'LEDGER_SHA256='+ledgerSha256,'PENDING_MIGRATION_FILES= '+unit,
    'SCOPED_INSPECTION_SHA256='+scopedInspectionSha256,'VET_BACKUP_VOLUME=VERIFIED','INSPECT=COMPLETE',
    'RAW_UNRELATED_STDOUT=excluded',
  ].join('\r\n');
  assert.deepEqual(parseInspectionReceipt(complete,target,'77-1'),{target,run:'77-1',ledgerSha256,scopedInspectionSha256});
  assert.throws(()=>parseInspectionReceipt(complete.replace(scopedInspectionSha256,'***'),target,'77-1'),/INVALID_SCOPED_INSPECTION_SHA256/);
  assert.throws(()=>parseInspectionReceipt(complete+'\nLEDGER_SHA256='+ledgerSha256,target,'77-1'),/INVALID_LEDGER_SHA256/);
  assert.throws(()=>parseInspectionReceipt(complete.replace('INSPECT=COMPLETE','INSPECT='),target,'77-1'),/INVALID_INSPECT/);
  assert.throws(()=>parseInspectionReceipt(complete,'unbound','77-1'),/INVALID_IDENTITY/);
});
test('the receipt accepts only the exact new ledger entry',()=>{
  const before={legacy:[{name:'base'}],typeorm:[{name:'Other123',timestamp:123}]};
  const after={...before,typeorm:[...before.typeorm,{name:'EggSourceIndependentPermissions1795651200000',timestamp:1795651200000}]};
  verifyAppliedLedger(before,after);
  assert.throws(()=>verifyAppliedLedger(before,{...after,legacy:[]}),/AFTER_LEDGER_DELTA/);
  assert.throws(()=>verifyAppliedLedger(before,before),/AFTER_LEDGER_DELTA/);
});
test('the after check requires the exact catalog and four enabled guards while writes are closed',()=>{
  const before={databaseMajor:18,baseTables:true,controlTable:false,catalog:[],triggers:[]};
  validateCatalog(before,null);
  assert.throws(()=>validateCatalog({...before,controlTable:true},null),/PARTLY_APPLIED/);
  const after={...before,controlTable:true,catalog:[['MENU_MD_EGG_SOURCE','蛋品来源档案','MASTER','MENU_MASTER_DATA','/master-data/egg-sources']],
    triggers:[
      ['md_egg_source_change_events','egg_source_event_require_independent_writer','require_independent_egg_source_writer','O',7],
      ['sys_menu','egg_source_menu_managed','guard_egg_source_permission_configuration','O',31],
      ['md_egg_source_changes','egg_source_require_independent_writer','require_independent_egg_source_writer','O',23],
      ['sys_role_menu_permission','egg_source_role_grants_managed','guard_egg_source_permission_configuration','O',31],
    ]};
  const state={control:[[1,false,false,null,null,true]],grants:0};
  validateCatalog(after,state);
  assert.throws(()=>validateCatalog({...after,triggers:after.triggers.slice(1)},state),/POST_SCHEMA/);
  assert.throws(()=>validateCatalog(after,{...state,grants:1}),/POST_SCHEMA/);
  assert.throws(()=>validateCatalog(after,{...state,control:[[1,true,true,'1','test',true]]}),/POST_SCHEMA/);
});
test('protected workflow retains ordinary GO guard and rechecks the scope before applying and recording a receipt',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/controlled-pending-migration-apply.yml',import.meta.url),'utf8');
  assert.match(workflow,/inputs\.audit_scope == 'egg-source-permissions-1126' && inputs\.approve_production == 'APPLY-EGG-SOURCE-PERMISSIONS-20261126'/);
  assert.match(workflow,/egg-source-permissions-1126\) SCOPED_REVIEW_HELPER=egg-source-permissions-release\.mjs/);
  assert.match(workflow,/test "\$AUDIT_CONCLUSION" = GO/);
  assert.ok(workflow.indexOf('FINAL_VET_INSPECTION_SHA256="$(vet_inspection)"')<workflow.indexOf('PRESERVE_ARTIFACTS=true bash scripts/deploy-schema-first.sh'));
  assert.ok(workflow.indexOf('node "$STAGE/$SCOPED_REVIEW_HELPER" after')<workflow.indexOf('node "$STAGE/record-migration-apply-receipt.mjs"'));
});
