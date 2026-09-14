const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'artifacts','packaging-deploy-gates-'+Date.now());fs.mkdirSync(dir);
const targets=['.github/workflows/deploy.yml','scripts/check-entity-drift-baseline.sh','scripts/check-entity-schema.sh','scripts/deploy-schema-first.sh','scripts/packaging-history-compatibility/deploy-test.cjs'];
const snapshot=()=>({head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files:Object.fromEntries(targets.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),diff:cp.execFileSync('git',['diff','HEAD','--',...targets],{cwd:root,encoding:'utf8'})});
const result={before:snapshot(),cases:[]};const save=()=>fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(result,null,2));save();
function run(name,cmd,args,env,expected,cwd=root){const r=cp.spawnSync(cmd,args,{cwd,env:{PATH:process.env.PATH,...env},encoding:'utf8'});fs.writeFileSync(path.join(dir,name+'.log'),r.stdout+r.stderr,{flag:'wx'});result.cases.push({name,exit:r.status,expected,passed:r.status===expected});save();if(r.status!==expected)throw Error(name+' unexpected exit '+r.status);return r;}
const mockDir=path.join(dir,'mock');fs.mkdirSync(mockDir);fs.mkdirSync(path.join(mockDir,'node_modules/.bin'),{recursive:true});
fs.writeFileSync(path.join(mockDir,'node_modules/.bin/typeorm'),`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');const a=process.argv.slice(2),dest=a[1],stamp=a[a.indexOf('--timestamp')+1],f=path.join(path.dirname(dest),stamp+'-EntityDrift.ts');
if(process.env.CASE==='zero'){console.log('No changes in database schema were found - cannot generate a migration. To create a new empty migration use "typeorm migration:create" command');process.exit(1);}
if(process.env.CASE==='exception'){console.log('Error during migration generation: TEST failure');process.exit(1);}
if(process.env.CASE==='misleading'){console.log('No changes in database schema were found');process.exit(2);}
if(process.env.CASE==='missing')process.exit(0);
fs.writeFileSync(f,'public async up() {\\n'+('await queryRunner.query(\\x60SELECT 1\\x60);\\n').repeat((process.env.CASE==='partial-error'?1:Number(process.env.CASE)))+'}\\npublic async down() {}\\n');if(process.env.CASE==='partial-error')process.exit(1);console.log('Migration '+f+' has been generated successfully.');
`,{mode:0o755,flag:'wx'});
try{
 for(const [name,mode,expected] of [['diff393','393',1],['diff299','299',0],['exact300','300',0],['known-zero','zero',0],['missing','missing',1],['generator-error','exception',1],['misleading-zero','misleading',1],['partial-artifact-error','partial-error',1]])run(name,'bash',[root+'/scripts/check-entity-schema.sh',root+'/.github/entity-drift-baseline.txt',dir+'/generated'],{CASE:mode},expected,mockDir);
 fs.writeFileSync(path.join(dir,'generated','stale_p5_entity_diff.ts'),'stale invalid artifact',{flag:'wx'});run('stale-ignored','bash',[root+'/scripts/check-entity-schema.sh',root+'/.github/entity-drift-baseline.txt',dir+'/generated'],{CASE:'299'},0,mockDir);
 run('direct-missing','bash',['scripts/check-entity-drift-baseline.sh','.github/entity-drift-baseline.txt',dir+'/absent.ts'],{},1);
 fs.writeFileSync(path.join(dir,'empty.ts'),'public async up() {}\npublic async down() {}\n',{flag:'wx'});run('empty-artifact','bash',['scripts/check-entity-drift-baseline.sh','.github/entity-drift-baseline.txt',dir+'/empty.ts'],{},1);
 run('actual393','bash',['scripts/check-entity-drift-baseline.sh','.github/entity-drift-baseline.txt','artifacts/packaging-history-local/entity-diff-1789364061536.ts'],{},1);
 const docker=path.join(mockDir,'docker');fs.writeFileSync(docker,`#!/usr/bin/env node
const fs=require('node:fs');const a=process.argv.slice(2);fs.appendFileSync(process.env.ORDER,JSON.stringify({args:a,image:process.env.API_IMAGE||null})+'\\n');
if(a.includes('--images')){console.log('TEST/candidate:local');process.exit(0);}
if(a[0]==='image'){console.log('sha256:'+'a'.repeat(64));process.exit(0);}
if(a.includes('migration:run')&&process.env.MODE==='migration-fail')process.exit(9);
if(a.includes('migration:show')){if(process.env.MODE==='show-fail')process.exit(8);console.log(process.env.MODE==='pending'?'[ ] Pending':process.env.MODE==='empty'?'':'[X] Applied');}
`,{mode:0o755,flag:'wx'});
 // Execute the actual workflow API/Web switch block, not a hand-written replacement.
 const workflow=fs.readFileSync(root+'/.github/workflows/deploy.yml','utf8');const start=workflow.indexOf('            # ── 滚动重启容器');const end=workflow.indexOf('            # ── 部署后温和清理',start);let block=workflow.slice(start,end).replaceAll('/opt/phoenix/backups/migration-evidence',dir+'/migration');
 if(!block.includes('CANDIDATE_API_IMAGE=$(bash scripts/deploy-schema-first.sh'))throw Error('workflow wiring missing');
 for(const [mode,expected]of [['success',0],['migration-fail',9],['show-fail',8],['pending',1],['empty',1]]){
  const order=path.join(dir,mode+'-order.jsonl');run('schema-'+mode,'bash',['-euc',block],{PATH:mockDir+':'+process.env.PATH,API_IMAGE:'TEST/candidate:local',BUILD_API:'true',BUILD_WEB:'true',PRESERVE_ARTIFACTS:'true',MODE:mode,ORDER:order},expected);
  const calls=fs.readFileSync(order,'utf8').trim().split('\n').map(JSON.parse);const switches=calls.filter(c=>c.args.includes('up'));if(mode==='success'){if(switches.length!==2||switches[0].image!=='sha256:'+'a'.repeat(64)||calls.findIndex(c=>c.args.includes('migration:show'))>calls.findIndex(c=>c.args.includes('up')))throw Error('wrong switch order/image');}else if(switches.length)throw Error('failed migration switched application');
 }
 const rollbackStart=workflow.indexOf('              if [ -n "$PREV_API_IMAGE_ID" ] && [ "$API_SWITCH_STARTED"');
 const rollbackEnd=workflow.indexOf('              fi',rollbackStart)+'              fi'.length;
 const rollback=workflow.slice(rollbackStart,rollbackEnd).replaceAll('${{ github.repository_owner }}','TEST-owner');
 for(const switched of ['false','true']){const order=path.join(dir,'rollback-'+switched+'.jsonl');run('rollback-'+switched,'bash',['-euc',rollback],{PATH:mockDir+':'+process.env.PATH,ORDER:order,PREV_API_IMAGE_ID:'TEST-old',API_SWITCH_STARTED:switched,ROLLBACK_TAG:'TEST-old'},0);const calls=fs.existsSync(order)?fs.readFileSync(order,'utf8').trim().split('\n').map(JSON.parse):[];if(calls.filter(c=>c.args.includes('up')).length!==(switched==='true'?1:0))throw Error('wrong rollback restart');}
 run('preserve-required','bash',['scripts/deploy-schema-first.sh',dir+'/preserve-reject','TEST/candidate:local'],{PRESERVE_ARTIFACTS:'false'},1);
 result.after=snapshot();if(JSON.stringify(result.before.files)!==JSON.stringify(result.after.files))throw Error('source changed');result.exit=0;save();console.log(JSON.stringify({dir,cases:result.cases.length,passed:result.cases.filter(c=>c.passed).length}));
}catch(e){result.error=e.message;result.exit=1;save();console.log(e.message);process.exitCode=1;}
