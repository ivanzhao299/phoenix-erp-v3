import test from 'node:test';
import assert from 'node:assert/strict';
import { baseline,migration,seal,unit,validateCatalog,verifyAppliedLedger,verifySource } from './egg-source-retirement-release.mjs';
import { parseInspectionReceipt } from './egg-source-permissions-inspection-receipt.mjs';

const target='a'.repeat(40),head='b'.repeat(40),reviewed='c'.repeat(40),blob='d'.repeat(40);
function source(override={}) {
  return (...args)=>{
    const [command,...rest]=args;
    switch (command) {
      case 'show':
        if (rest[0]==='-s') return rest[2]===target?override.parents??baseline+' '+head:reviewed;
        return rest[0]===target+':'+seal?reviewed:'PENDING';
      case 'diff':
        if (rest.includes('--name-only')) return override.floor??'';
        return rest[2]===reviewed ? 'M\t'+seal : override.paths??'A\t'+migration;
      case 'rev-parse': return 'tree';
      case 'ls-tree': return '100644 blob '+blob+'\t'+migration;
      case 'merge-base': return '';
      default: throw Error('unexpected git command');
    }
  };
}

test('binds exactly one migration to the sealed main merge',()=>{
  assert.deepEqual(verifySource(target,source()),{target,baseline,reviewed,migrations:[{path:migration,blob}]});
  assert.throws(()=>verifySource(target,source({paths:'A\textra'})),/MIGRATION_SET/);
  assert.throws(()=>verifySource(target,source({parents:reviewed+' '+head})),/EXACT_MAIN_MERGE/);
  assert.throws(()=>verifySource(target,source({floor:'docker-compose.yml'})),/CONFIG_OR_AUDIT_FLOOR/);
});

test('accepts only the exact additive ledger and inspection identity',()=>{
  const before={typeorm:[{timestamp:1795658800000,name:'EggSourceStandardGrants1795658800000'}],other:['stable']};
  const after={...before,typeorm:[...before.typeorm,{timestamp:1795658900000,name:'EggSourceCutoverEvidence1795658900000'}]};
  verifyAppliedLedger(before,after);
  assert.throws(()=>verifyAppliedLedger(before,{...after,other:[]}),/AFTER_LEDGER/);
  assert.throws(()=>verifyAppliedLedger(before,before),/AFTER_LEDGER/);
  const output=['LEDGER_SHA256='+'b'.repeat(64),'SCOPED_INSPECTION_SHA256='+'c'.repeat(64),
    'PENDING_MIGRATION_FILES='+unit,'VET_BACKUP_VOLUME=VERIFIED','INSPECT=COMPLETE'].join('\n');
  assert.equal(parseInspectionReceipt(output,target,'123-1','egg-source-retirement-1127').target,target);
  assert.throws(()=>parseInspectionReceipt(output.replace(unit,unit+' Other'),target,'123-1','egg-source-retirement-1127'));
});

test('requires the append-only catalog and prohibits preexisting evidence tables',()=>{
  validateCatalog({tables:[],triggers:[],function:null,columns:[],constraints:[],indexes:[]});
  assert.throws(()=>validateCatalog({tables:['md_egg_source_cutover_records'],triggers:[],function:null,indexes:[]}),/CATALOG/);
  assert.throws(()=>validateCatalog({tables:[],triggers:[],function:null,columns:[],constraints:[],indexes:[]},'expected trigger body'),/CATALOG/);
});
