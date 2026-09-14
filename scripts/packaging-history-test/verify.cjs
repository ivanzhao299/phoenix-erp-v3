// Local-only verification ledger; every process exit, failure and skip is preserved.
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'artifacts/packaging-history-local');
const tests=[
 ['api-tsc','apps/api','./node_modules/.bin/tsc',['--noEmit']],
 ['web-tsc','apps/web','./node_modules/.bin/tsc',['--noEmit']],
 ['api-unit','apps/api','./node_modules/.bin/jest',['--runInBand','bff.controller.spec.ts','grading-governance.spec.ts','packaging-protection.spec.ts','packaging-workflow-policy.spec.ts']],
 ['pg-http','apps/api','./node_modules/.bin/jest',['--runInBand','packaging-history.pg.spec.ts','packaging-history.http.spec.ts']],
 ['web-dom','apps/web','./node_modules/.bin/vitest',['run','src/__tests__/packing-history-client.test.ts','src/__tests__/packing-history.dom.test.tsx','src/__tests__/packing-history-ui.dom.test.tsx','src/__tests__/packaging-terminal-context.dom.test.tsx','src/__tests__/bug-20260722-0003-warehouse-handover.test.ts']],
 ['nullable','.','node',['scripts/check-nullable-in-unique.js']],
 ['constraint','.','node',['scripts/check-constraint-drift.js']],
 ['migration-down','.','bash',['scripts/check-ts-migration-down.sh']],
 ['migration-dml','.','bash',['scripts/check-ts-migration-no-data-dml.sh']],
 ['entity-diff','.','node',['scripts/packaging-history-test/entity-diff.cjs']],
 ['entity-gate','.','bash',['scripts/check-entity-drift-baseline.sh','.github/entity-drift-baseline.txt','artifacts/packaging-history-local/entity-diff.ts']],
 ['runtime-scope-audit','.','bash',['apps/api/test/scope-audit.sh']],
 ['browser','.','node',['scripts/packaging-history-test/browser.cjs']],
];
const selected=process.argv.slice(2),currentRun=[];
const ledger=path.join(dir,'verification-results.json');
const results=fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger,'utf8')):[];
for(const [name,cwd,command,args] of tests){
 if(selected.length&&!selected.includes(name))continue;
 const attempt=results.filter(r=>r.name===name).length+1;
 const started=new Date().toISOString(),log=path.join(dir,'verified-'+name+(attempt>1?'-r'+attempt:'')+'.log'),fd=fs.openSync(log,'w');
 const run=spawnSync(command,args,{cwd:path.join(root,cwd),env:{...process.env,NODE_ENV:'test',PACKAGING_HISTORY_PG:'1',LD_LIBRARY_PATH:path.join(dir,'browser-libs')},stdio:['ignore',fd,fd],timeout:300000});fs.closeSync(fd);
 const result={name,cwd,command:[command,...args],started,finished:new Date().toISOString(),exit:run.status,signal:run.signal,error:run.error?.code||null,log:path.relative(root,log)};
 currentRun.push(result);results.push(result);fs.writeFileSync(path.join(dir,'verification-results.json'),JSON.stringify(results,null,2));
 fs.appendFileSync(path.join(root,'artifacts/packaging-history-implementation-progress.md'),`\n最终验证 ${result.finished}：${name} exit=${run.status}, signal=${run.signal||'none'}；日志 ${result.log}。`);
 console.log(name,'EXIT',run.status,'SIGNAL',run.signal||'none');
}
process.exitCode=currentRun.some(r=>r.exit!==0)?1:0;
