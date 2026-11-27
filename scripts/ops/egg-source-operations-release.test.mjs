import test from 'node:test';
import assert from 'node:assert/strict';
import { baseline,migration,seal,unit,validateOperationsCatalog,verifyAppliedLedger,verifySource } from './egg-source-operations-release.mjs';
import { parseInspectionReceipt } from './egg-source-permissions-inspection-receipt.mjs';

const target='a'.repeat(40),head='b'.repeat(40),reviewed='c'.repeat(40),blob='d'.repeat(40);
function gitFixture(override={}) {
  return (command,...args)=>{
    if (command==='show') {
      if (args[0]==='-s') return args[2]===target?override.parents??baseline+' '+head:reviewed;
      return args[0]===target+':'+seal?reviewed:'PENDING';
    }
    if (command==='diff') {
      if (args.includes('--name-only')) return override.floor??'';
      return args[2]===reviewed ? 'M\t'+seal : override.paths??'A\t'+migration;
    }
    if (command==='rev-parse') return 'tree';
    if (command==='ls-tree') return '100644 blob '+blob+'\t'+migration;
    if (command==='merge-base') return '';
    throw Error('unexpected git command');
  };
}

test('binds the operations migration to its reviewed main merge and no other DDL',()=>{
  assert.deepEqual(verifySource(target,gitFixture()),{target,baseline,reviewed,migrations:[{path:migration,blob}]});
  assert.throws(()=>verifySource(target,gitFixture({paths:'A\textra'})),/MIGRATION_SET/);
  assert.throws(()=>verifySource(target,gitFixture({parents:reviewed+' '+head})),/EXACT_MAIN_MERGE/);
  assert.throws(()=>verifySource(target,gitFixture({floor:'docker-compose.yml'})),/CONFIG_OR_AUDIT_FLOOR/);
});

test('requires the exact new ledger entry and a scoped inspection receipt',()=>{
  const before={typeorm:[{timestamp:1795658900000,name:'EggSourceCutoverEvidence1795658900000'}],other:['stable']};
  const after={...before,typeorm:[...before.typeorm,{timestamp:1795659000000,name:'EggSourceOperationReceipts1795659000000'}]};
  verifyAppliedLedger(before,after);
  assert.throws(()=>verifyAppliedLedger(before,{...after,other:[]}),/AFTER_LEDGER/);
  assert.throws(()=>verifyAppliedLedger(before,before),/AFTER_LEDGER/);
  const output=['LEDGER_SHA256='+'b'.repeat(64),'SCOPED_INSPECTION_SHA256='+'c'.repeat(64),
    'PENDING_MIGRATION_FILES='+unit,'VET_BACKUP_VOLUME=VERIFIED','INSPECT=COMPLETE'].join('\n');
  assert.equal(parseInspectionReceipt(output,target,'123-1','egg-source-operations-1127').target,target);
  assert.throws(()=>parseInspectionReceipt(output.replace(unit,unit+' Other'),target,'123-1','egg-source-operations-1127'));
});

test('rejects a permissive operation kind check before comparing the rest of the catalog',()=>{
  assert.throws(()=>validateOperationsCatalog({constraints:[]},'guard','CHECK (true)',true),/KIND_CHECK/);
});
