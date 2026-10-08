import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootstrapSchemaSql, assertBootstrapSchemaEvidence, readBootstrapSchemaEvidence } from './api-bootstrap-schema-preflight.mjs';
const contract=JSON.parse(fs.readFileSync('apps/api/src/common/database/api-bootstrap-schema-contract.json','utf8'));
const columns=Object.entries(contract.tables).flatMap(([table,names])=>names.map(column=>({table,column})));
const evidence={columns,extensions:contract.extensions,retiredConstraints:[]};
test('runtime and promotion consume the same frozen requirements and reject real gaps',()=>{
 assert.equal(assertBootstrapSchemaEvidence(contract,evidence).status,'PASS');
 for(const change of [{columns:columns.slice(1)},{extensions:[]},{retiredConstraints:[contract.absentConstraints[0]]}])assert.throws(()=>assertBootstrapSchemaEvidence(contract,{...evidence,...change}),/BOOTSTRAP_SCHEMA_GAP/);
});
test('production schema preflight is metadata SELECT inside enforced read-only transaction',()=>{
 let options;
 const result=readBootstrapSchemaEvidence(contract,(command,args,opts)=>{
  assert.equal(command,'docker');assert(args.includes('PGOPTIONS=-c default_transaction_read_only=on'));options=opts;return JSON.stringify(evidence)+'\n';
 });
 assert.deepEqual(result,evidence);assert.match(options.input,/BEGIN READ ONLY/);assert.match(options.input,/ROLLBACK/);assert.doesNotMatch(bootstrapSchemaSql(contract),/CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|setval|nextval/i);
});
test('promotion verifies approved requirement bytes and production metadata before writing floor state',()=>{
 const s=fs.readFileSync('scripts/ops/promote-production-config-floor.mjs','utf8');
 assert(s.indexOf('readBootstrapSchemaEvidence(bootstrapContract)')<s.indexOf("atomicState(path.join(directory, 'floor.json')"));
 assert.match(s,/api-bootstrap-schema-contract.json/);assert.match(s,/STAGED_HELPER_MISMATCH/);assert.match(s,/bootstrapSchema, marker/);
 const w=fs.readFileSync('.github/workflows/deploy.yml','utf8');assert.match(w,/git show "\$TARGET_SHA:apps\/api\/src\/common\/database\/api-bootstrap-schema-contract.json"/);
 assert.match(w,/always\(\) && steps.bootstrap_sql.outcome/);assert.doesNotMatch(w.slice(w.indexOf('Preserve sanitized API bootstrap proof'),w.indexOf('Check entity ↔ DB schema sync')),/private-runtime/);
});
