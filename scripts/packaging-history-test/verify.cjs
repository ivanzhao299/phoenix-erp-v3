// Local-only verification ledger; every process exit, failure and skip is preserved.
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'artifacts/packaging-history-local');
const tests=[
 ['readonly-observability','.','node',['scripts/packaging-history-test/readonly-observability.cjs']],
 ['scope-validity','.','node',['scripts/packaging-history-test/scope-validity.cjs']],
 ['payments','apps/api','./node_modules/.bin/jest',['--runInBand','src/modules/procurement-v2/services/payments.service.spec.ts']],
 ['rebuild-sql','.','node',['scripts/packaging-history-test/migrate.cjs']],
 ['rebuild-bootstrap','.','node',['scripts/packaging-history-test/bootstrap.cjs']],
 ['rebuild-ts','.','node',['scripts/packaging-history-test/migrate-ts.cjs']],
 ['perf-plan','.','node',['scripts/packaging-history-test/performance.cjs','--plan']],
 ['performance','.','node',['scripts/packaging-history-test/performance.cjs']],
 ['legacy-wms','apps/api','./node_modules/.bin/jest',['--runInBand','src/modules/wms/inventory/inventory.pg.spec.ts','src/modules/wms/inventory/inventory.service.spec.ts']],
 ['auth-approval','apps/api','./node_modules/.bin/jest',['--runInBand','entity-alignment.pg.spec.ts','jwt-rotation.spec.ts','permissions-resolver.spec.ts','permissions.service.spec.ts','approval-action-menu-gate.spec.ts','sales-order-approval-consistency.spec.ts','sales-order-approval.pg.integration.spec.ts']],
 ['api-tsc','apps/api','./node_modules/.bin/tsc',['--noEmit']],
 ['web-tsc','apps/web','./node_modules/.bin/tsc',['--noEmit']],
 ['api-regression','apps/api','./node_modules/.bin/jest',['--runInBand','data-scope.service.spec.ts','data-scope-row-equivalence.spec.ts','egg-inventory.service.spec.ts','wms.service.spec.ts','packaging-inventory-integration.service.spec.ts']],
 ['web-auth','apps/web','./node_modules/.bin/vitest',['run','src/lib/auth-navigation.test.ts','src/lib/auth-session.test.ts','src/lib/auth-dispatch.test.ts']],
 ['api-unit','apps/api','./node_modules/.bin/jest',['--runInBand','bff.controller.spec.ts','grading-governance.spec.ts','packaging-protection.spec.ts','packaging-workflow-policy.spec.ts','packaging-review.spec.ts']],
 ['pg-http','apps/api','./node_modules/.bin/jest',['--runInBand','packaging-history.pg.spec.ts','packaging-history.http.spec.ts']],
 ['web-dom','apps/web','./node_modules/.bin/vitest',['run','src/__tests__/packing-history-client.test.ts','src/__tests__/packing-history.dom.test.tsx','src/__tests__/packing-history-ui.dom.test.tsx','src/__tests__/packaging-terminal-context.dom.test.tsx','src/__tests__/bug-20260722-0003-warehouse-handover.test.ts']],
 ['nullable','.','node',['scripts/check-nullable-in-unique.js']],
 ['constraint-parser','.','node',['scripts/entity-alignment/constraint-test.cjs']],
 ['constraint-self-test','.','node',['scripts/check-constraint-drift.js','--self-test']],
 ['constraint','.','node',['scripts/check-constraint-drift.js']],
 ['migration-down','.','bash',['scripts/check-ts-migration-down.sh']],
 ['migration-dml','.','bash',['scripts/check-ts-migration-no-data-dml.sh']],
 ['entity-diff','.','node',['scripts/packaging-history-test/entity-diff.cjs']],
 ['entity-baseline','.','node',['scripts/packaging-history-test/entity-diff.cjs','--baseline']],
 ['entity-gate','.','node',['scripts/packaging-history-test/entity-gate.cjs']],
 ['runtime-scope-audit','.','bash',['apps/api/test/scope-audit.sh']],
 ['browser','.','node',['scripts/packaging-history-test/browser.cjs']],
];
const {capture}=require('./revision.cjs');
const selected=process.argv.slice(2),currentRun=[];
const ledger=path.join(dir,'verification-results.json');
const readResults=()=>fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger,'utf8')):[];
for(const [name,cwd,command,args] of tests){
 if(selected.length?!selected.includes(name):name.startsWith('rebuild-'))continue;
 let attempt=readResults().filter(r=>r.name===name).length+1,log,fd;
 while(true){log=path.join(dir,'verified-'+name+(attempt>1?'-r'+attempt:'')+'.log');try{fd=fs.openSync(log,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;attempt++;}}
 const started=new Date().toISOString();
 const before=capture();
 const revisionFile=log.replace(/\.log$/,'.revision.json');
 fs.writeFileSync(revisionFile,JSON.stringify({before},null,2));
 const run=spawnSync(command,args,{cwd:path.join(root,cwd),env:{...process.env,NODE_ENV:'test',PACKAGING_HISTORY_PG:'1',LD_LIBRARY_PATH:path.join(dir,'browser-libs')},stdio:['ignore',fd,fd],timeout:300000});fs.closeSync(fd);
 const after=capture();
 fs.writeFileSync(revisionFile,JSON.stringify({before,after,sourceUnchanged:before.sourceFingerprint===after.sourceFingerprint},null,2));
 const result={revision:path.relative(root,revisionFile),head:before.head,sourceFingerprint:before.sourceFingerprint,sourceUnchanged:before.sourceFingerprint===after.sourceFingerprint,name,cwd,command:[command,...args],started,finished:new Date().toISOString(),exit:run.status,signal:run.signal,error:run.error?.code||null,log:path.relative(root,log)};
 currentRun.push(result);const results=readResults();results.push(result);fs.writeFileSync(path.join(dir,'verification-results.json'),JSON.stringify(results,null,2));
 fs.appendFileSync(path.join(root,'artifacts/packaging-history-implementation-progress.md'),`\n最终验证 ${result.finished}：${name} exit=${run.status}, signal=${run.signal||'none'}；日志 ${result.log}。`);
 console.log(name,'EXIT',run.status,'SIGNAL',run.signal||'none');
}
process.exitCode=currentRun.some(r=>r.exit!==0)?1:0;
