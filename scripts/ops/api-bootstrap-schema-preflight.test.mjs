import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootstrapSchemaRequirements, bootstrapSchemaSql, assertBootstrapSchemaEvidence, readBootstrapSchemaEvidence } from './api-bootstrap-schema-preflight.mjs';
const contract=JSON.parse(fs.readFileSync('apps/api/src/common/database/api-bootstrap-schema-contract.json','utf8'));
const columns=Object.entries(bootstrapSchemaRequirements(contract)).flatMap(([table,names])=>names.map(column=>({table,column})));
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
 assert.match(s,/const write = dependencies\.atomicState \|\| atomicState/);
 assert.match(s,/assertBootstrapSchemaEvidence\(bootstrapContract, \(dependencies\.readBootstrapSchemaEvidence \|\| readBootstrapSchemaEvidence\)\(bootstrapContract\)\)/);
 const verified=s.indexOf('bootstrapSchema = assertBootstrapSchemaEvidence('), floorWrite=s.indexOf("write(path.join(directory, 'floor.json')");
 assert(verified>=0 && floorWrite>verified);
 assert.match(s,/api-bootstrap-schema-contract.json/);assert.match(s,/STAGED_HELPER_MISMATCH/);assert.match(s,/bootstrapSchema, marker/);
 const w=fs.readFileSync('.github/workflows/deploy.yml','utf8');assert.match(w,/git show "\$TARGET_SHA:apps\/api\/src\/common\/database\/api-bootstrap-schema-contract.json"/);
 assert.match(w,/always\(\) && steps.bootstrap_sql.outcome/);assert.doesNotMatch(w.slice(w.indexOf('Preserve sanitized API bootstrap proof'),w.indexOf('Check entity ↔ DB schema sync')),/private-runtime/);
});

test('promotion refuses known UI columns before floor mutation without expanding startup SQL',()=>{
 const missing=columns.filter(x=>!(x.table==='brd_flocks'&&x.column==='farm_name'));
 assert.throws(()=>assertBootstrapSchemaEvidence(contract,{...evidence,columns:missing}),/BOOTSTRAP_SCHEMA_GAP/);
 const farmMissing=columns.filter(x=>!(x.table==='brd_farms'&&x.column==='mapped_site_code'));
 assert.throws(()=>assertBootstrapSchemaEvidence(contract,{...evidence,columns:farmMissing}),/BOOTSTRAP_SCHEMA_GAP/);
 assert(!Object.hasOwn(contract.tables,'brd_flocks'));
 assert.throws(()=>bootstrapSchemaSql({...contract,prePromotionTables:{sys_settings:[]}}),/BOOTSTRAP_SCHEMA_CONTRACT/);
});
