import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { units, verifyAppliedLedger } from './egg-source-release.mjs';

const added=units.map(unit=>{
  const [stamp,name]=unit.split('-');
  return {timestamp:Number(stamp),name:name+stamp};
});
const before={legacy:[{filename:'previous.sql',applied_at:1000}],typeorm:[{timestamp:1000000000000,name:'Existing1000000000000'}]};

test('egg source apply allows only the three reviewed additions to the migration ledger',()=>{
  const after={legacy:before.legacy,typeorm:[...before.typeorm,...added]};
  verifyAppliedLedger(before,after);
  assert.throws(()=>verifyAppliedLedger(before,{...after,typeorm:after.typeorm.slice(0,-1)}),/AFTER_LEDGER_DELTA/);
  assert.throws(()=>verifyAppliedLedger(before,{...after,typeorm:[...after.typeorm,{timestamp:2000000000000,name:'Unexpected'}]}),/AFTER_LEDGER_DELTA/);
  assert.throws(()=>verifyAppliedLedger(before,{...after,legacy:[]}),/AFTER_LEDGER_DELTA/);
  assert.throws(()=>verifyAppliedLedger(after,after),/AFTER_LEDGER_DELTA/);
});

test('egg source scope preserves the standard HOLD and requires fresh bound evidence before schema-first',()=>{
  const flow=readFileSync(new URL('../../.github/workflows/controlled-pending-migration-apply.yml',import.meta.url),'utf8');
  assert.match(flow,/inputs\.audit_scope == 'egg-source-1125' && inputs\.approve_production == 'APPLY-EGG-SOURCE-20261125'/);
  assert.match(flow,/AUDIT_CONCLUSION="\$\(run_audit\)"[\s\S]+test "\$AUDIT_CONCLUSION" = GO/);
  assert.match(flow,/FINAL_VET_INSPECTION_SHA256="[\s\S]+verify "\$MIGRATION_RUN_ID"[\s\S]+bash scripts\/deploy-schema-first\.sh/);
});
