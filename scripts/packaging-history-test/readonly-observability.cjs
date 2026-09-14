// Local command fixtures only. Never invokes Docker, SSH or remote authentication.
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'artifacts','readonly-observability-'+Date.now());fs.mkdirSync(dir);
const old=cp.execFileSync('git',['show','a5759bde:scripts/ops/run-production-readonly-audit.sh'],{cwd:root});fs.writeFileSync(path.join(dir,'old.sh'),old);
const result={before:require('./revision.cjs').capture(),command:['node','scripts/packaging-history-test/readonly-observability.cjs'],cases:[]};
const original=path.join(dir,'old.sh'),current=path.join(root,'scripts/ops/run-production-readonly-audit.sh');
function check(name,{legacy=false,mode='ok',sql='',http='',validate=false,missingId=false,wrapper=false,badDirectory=false,badBundle=false,tilde=false,legacyWrapper=false}={},expected=0,marker){
 const work=fs.mkdtempSync(path.join(dir,'case-')),bin=path.join(work,'bin');fs.mkdirSync(bin);const audits=path.join(work,'scripts/ops/readonly-audits');fs.mkdirSync(audits,{recursive:true});
 fs.writeFileSync(path.join(audits,'valid.http.json'),'[{"name":"fixture","path":"/fixture","method":"GET"}]');fs.writeFileSync(path.join(audits,'write.http.json'),'[{"name":"fixture","path":"/fixture","method":"POST"}]');
 for(const [cmd,body] of Object.entries({docker:mode==='docker-fail'?'exit 42':mode==='log-error'?"echo 'ERROR lifecycle TEST_SENTINEL'":"exit 0",git:mode==='git-fail'?'exit 1':"echo 69d89dd44b8e1461d7eaf5193e60c994255aed2c",...(mode==='install-fail'?{install:'exit 73'}:{})})){fs.writeFileSync(path.join(bin,cmd),'#!/bin/sh\n'+body+'\n',{mode:0o755});}
 const env={PATH:bin+':'+process.env.PATH,HOME:process.env.HOME,AUDIT_RUN_ID:String(Date.now())+String(result.cases.length),AUDIT_BUNDLE_DIR:work,ASSERTION_SQL_PATH:sql,HTTP_ASSERTIONS_PATH:http,DEPLOY_PATH:badDirectory?path.join(work,'absent'):work};if(missingId)delete env.AUDIT_RUN_ID;
 if(tilde)env.DEPLOY_PATH='~/phoenix-erp';
 let args=[legacy?original:current,...(validate?['--validate']:[])];
 if(wrapper){let text=(legacyWrapper?cp.execFileSync('git',['show','e57aaa2b:.github/workflows/production-readonly-audit.yml'],{cwd:root,encoding:'utf8'}):fs.readFileSync(root+'/.github/workflows/production-readonly-audit.yml','utf8')).split('          script: |\n')[1].split('      - name: Persist')[0];text=text.split('\n').map(x=>x.startsWith('            ')?x.slice(12):x).join('\n');if(!badBundle)fs.copyFileSync(current,path.join(work,'scripts/ops/run-production-readonly-audit.sh'));if(tilde)text='cd(){ test "$1" = "$HOME/phoenix-erp"; };\n'+text;args=['-c',text];}
 const r=cp.spawnSync('bash',args,{cwd:work,env,encoding:'utf8',timeout:10000});const stdout=r.stdout||'',stderr=r.stderr||'';
 const row={name,exit:r.status,expected,stdout,stderr,work:path.relative(root,work)};result.cases.push(row);
 assert.equal(r.status,expected,name);if(marker)assert.match(stdout+stderr,marker,name);if(mode==='git-fail'&&legacy)assert.equal(stdout+stderr,'',name);
 assert.ok(!(stdout+stderr).includes('TEST_SENTINEL'),'raw Docker logs must not escape');
 if(!validate&&!missingId&&!badDirectory&&!badBundle&&!legacyWrapper&&mode!=='install-fail'){
  const receipt=path.join('/tmp','phoenix-production-readonly-audit-'+env.AUDIT_RUN_ID,'result.json');row.result=JSON.parse(fs.readFileSync(receipt));assert.equal(row.result.status,expected===0?'PASS':'FAIL');
 }
 console.log(name,'exit='+r.status);
}
try{
 check('legacy silent git failure produces empty captured log',{legacy:true,mode:'git-fail'},1);
 check('new silent git failure has safe stage',{mode:'git-fail'},1,/AUDIT_STAGE=CHECKOUT_REVISION exit=1/);
 check('blank inputs execute with mocked commands',{},0,/PASS REVISION/);
 check('pre-log install failure observable',{mode:'install-fail'},73,/AUDIT_STAGE=EVIDENCE_DIRECTORY exit=73/);
 check('missing run id observable',{missingId:true},1,/AUDIT_STAGE=RUN_ID exit=1/);
 check('missing SQL fail closed',{validate:true,sql:'scripts/ops/readonly-audits/absent.sql'},2,/AUDIT_STAGE=INPUT_VALIDATION/);
 check('relative valid HTTP manifest resolves',{validate:true,http:'scripts/ops/readonly-audits/valid.http.json'},0,/PASS audit inputs validated/);
 check('HTTP POST manifest rejected',{validate:true,http:'scripts/ops/readonly-audits/write.http.json'},1,/Only GET\/HEAD/);
 check('failed docker logs never healthy zero',{mode:'docker-fail'},42,/AUDIT_STAGE=LOG_COUNTER exit=42/);
 check('matching log count rejected without raw payload',{mode:'log-error'},1,/AUDIT_STAGE=LOG_COUNTER exit=1/);
 check('workflow missing deploy directory observable',{wrapper:true,badDirectory:true},2,/AUDIT_STAGE=DEPLOY_DIRECTORY exit=2/);
 check('workflow missing runner observable',{wrapper:true,badBundle:true},2,/AUDIT_STAGE=BUNDLE_RUNNER exit=2/);
 check('workflow merges runner failure stderr into stdout',{wrapper:true,mode:'git-fail'},1,/AUDIT_STAGE=CHECKOUT_REVISION exit=1/);
 check('old quoted tilde default fails cd fixture',{wrapper:true,tilde:true,legacyWrapper:true},2,/DEPLOY_DIRECTORY exit=2/);
 check('normalized tilde default passes without eval',{wrapper:true,tilde:true},0,/PASS REVISION/);
 result.exit=0;
}catch(e){result.exit=1;result.error=e.message;process.exitCode=1;}
finally{result.after=require('./revision.cjs').capture();result.sourceUnchanged=result.before.sourceFingerprint===result.after.sourceFingerprint;fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(result,null,2));console.log(dir,'exit='+result.exit);}
