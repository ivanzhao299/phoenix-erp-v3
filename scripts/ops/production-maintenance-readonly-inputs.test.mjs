import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const runner=path.join(root,'scripts/ops/run-production-readonly-audit.sh');
const sql='scripts/ops/readonly-audits/daily-egg-grade-evidence-20261117.sql';
const run=value=>spawnSync('/bin/bash',[runner,'--validate'],{cwd:root,encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,AUDIT_BUNDLE_DIR:root,ASSERTION_SQL_PATH:sql,HTTP_ASSERTIONS_PATH:value}});
test('explicit NONE disables HTTP before path validation while the selected SQL stays validated',()=>{
 const out=run('NONE');assert.equal(out.status,0,out.stderr);assert.match(out.stdout,/PASS audit inputs validated/);
 const bad=spawnSync('/bin/bash',[runner,'--validate'],{cwd:root,encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,AUDIT_BUNDLE_DIR:root,ASSERTION_SQL_PATH:'scripts/ops/readonly-audits/missing.sql',HTTP_ASSERTIONS_PATH:'NONE'}});
 assert.notEqual(bad.status,0);assert.match(bad.stderr,/audit file not found/);
});
test('only exact NONE is special; malformed, traversal and unknown manifest values remain rejected',()=>{
 for(const value of ['none',' NONE','NONE ','NONE.http.json','NONE\n','../NONE','scripts/ops/readonly-audits/../escape.http.json']){
  const out=run(value);assert.notEqual(out.status,0,value);
 }
 assert.equal(run('scripts/ops/readonly-audits/sales-order-lifecycle.http.json').status,0);
});
test('actual SQL-only runner prefix bypasses HTTP preparation and api/web identity reads with NONE',()=>{
 // Run the real prefix through HTTP handling. Fixed local mocks stop before
 // log collection/packaging and reject every docker call except readonly SQL.
 const directory=fs.mkdtempSync(path.join(root,'artifacts/readonly-inputs-'));
 try{
  const trace=path.join(directory,'trace');
  fs.writeFileSync(path.join(directory,'git'),'#!/bin/bash\nprintf "%s\\n" cb42966edfa717b0984936951143d84973c1a263\n',{mode:0o700});
  fs.writeFileSync(path.join(directory,'install'),'#!/bin/bash\nexit 0\n',{mode:0o700});
  fs.writeFileSync(path.join(directory,'tee'),'#!/bin/bash\ncat\n',{mode:0o700});
  fs.writeFileSync(path.join(directory,'docker'),'#!/bin/bash\nprintf "%s\\n" "$*" >> "$OWNED_TRACE"\ncase "$1" in inspect) exit 0;; exec) if [[ "$*" != *"default_transaction_read_only=on"* || "$*" == *phoenix-v3-api* ]]; then exit 91; fi; cat >/dev/null; echo SQL_READONLY_EXECUTED;; *) exit 92;; esac\n',{mode:0o700});
  const source=fs.readFileSync(runner,'utf8');
  const original=source.slice(0,source.indexOf('audit_stage=LOG_COUNTER'));
  assert.ok(original.includes('out_dir="/tmp/phoenix-production-readonly-audit-$run_id"'));
  const prefix=original.replace('out_dir="/tmp/phoenix-production-readonly-audit-$run_id"','out_dir="$OWNED_OUTPUT_ROOT"')+'\ntrap - EXIT\nexit 0\n';
  assert.ok(prefix.includes('if [ -n "$http_path" ]; then'));
  const out=spawnSync('/bin/bash',['-c',prefix],{cwd:root,encoding:'utf8',timeout:5000,env:{PATH:directory+':'+process.env.PATH,OWNED_TRACE:trace,OWNED_OUTPUT_ROOT:directory,AUDIT_BUNDLE_DIR:root,ASSERTION_SQL_PATH:sql,HTTP_ASSERTIONS_PATH:'NONE',READONLY_DB_CONTAINER:'owned-test-db',AUDIT_RUN_ID:'901'}});
  assert.equal(out.status,0,out.stderr);assert.match(out.stdout,/api\/web=not-required\(sql-only\)/);assert.match(out.stdout,/SQL_READONLY_EXECUTED/);
  const calls=fs.readFileSync(trace,'utf8').trim().split('\n');assert.equal(calls.length,2);assert.ok(calls[0].startsWith('inspect '));assert.ok(calls[1].startsWith('exec '));assert.doesNotMatch(calls.join('\n'),/phoenix-v3-api|org\.opencontainers|HTTP_MANIFEST/);
 }finally{for(const name of fs.readdirSync(directory))fs.unlinkSync(path.join(directory,name));fs.rmdirSync(directory);}
});
