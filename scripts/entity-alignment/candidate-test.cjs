// Official Node20 candidate migration and isolated real HTTP rehearsal; no production access.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const expectedDiff=Number(process.argv[3]);if(!Number.isSafeInteger(expectedDiff)||expectedDiff<1)throw Error('EXPLICIT_REVIEWED_DIFF_COUNT_REQUIRED');
const root=path.resolve(__dirname,'../..'),stamp=Date.now(),dir=path.join(root,'artifacts','packaging-candidate-'+stamp);fs.mkdirSync(dir);
const files=['.github/workflows/deploy.yml','scripts/check-entity-drift-baseline.sh','scripts/check-entity-schema.sh','scripts/deploy-schema-first.sh','scripts/entity-alignment/candidate-test.cjs','scripts/entity-alignment/candidate-http.cjs'];
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');const snap=()=>({head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),hashes:Object.fromEntries(files.map(f=>[f,hash(path.join(root,f))])),diff:cp.execFileSync('git',['diff','HEAD','--',...files],{cwd:root,encoding:'utf8'})});
const build=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),api=build.runs.find(r=>r.app==='api');if(!api||api.code!==0||!api.node.startsWith('v20.'))throw Error('OFFICIAL_NODE20_BUILD_REQUIRED');
const result={before:snap(),imageBuildSourceHead:build.head,buildEvidence:process.argv[2],node:api.node,runs:[],checks:[],resources:[]};const save=()=>fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(result,null,2));save();
function run(cmd,args,options={}){const r=cp.spawnSync(cmd,args,{cwd:dir,env:{PATH:process.env.PATH},encoding:'utf8',timeout:120000,...options});const log=path.join(dir,'command-'+result.runs.length+'.log');fs.writeFileSync(log,(r.stdout||'')+(r.stderr||''),{flag:'wx'});result.runs.push({cmd,args,exit:r.status,log:path.relative(root,log)});save();return r;}
function ok(r){if(r.status!==0)throw Error('command failed '+r.status);return r.stdout.trim();}
const {DataSource}=require(root+'/apps/api/node_modules/typeorm');const sources=[];
(async()=>{try{
 result.imageId=ok(run('docker',['image','inspect',api.imageId,'--format','{{.Id}}']));
 for(const [port,chain,dump] of [[55437,81,'baseline-81.dump'],[55438,83,'full-83.dump']]){
  const name='packaging-history-candidate-pg-'+port+'-'+stamp;ok(run('docker',['run','--pull=never','-d','--name',name,'--label','purpose=packaging-history-ab-node20','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=packaging_history_test','-p','127.0.0.1:'+port+':5432','postgres:18-alpine']));result.resources.push(name);save();
  for(let n=0;n<40;n++){const r=cp.spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','packaging_history_test'],{stdio:'ignore'});if(r.status===0)break;await new Promise(r=>setTimeout(r,250));}
  const backup=path.join(root,'artifacts/packaging-history-compatibility-1789365718577',dump);ok(run('docker',['exec','-i',name,'pg_restore','-U','postgres','-d','packaging_history_test','--exit-on-error','--single-transaction','--no-owner','--no-privileges'],{input:fs.readFileSync(backup)}));
  const ds=new DataSource({type:'postgres',host:'127.0.0.1',port,username:'postgres',database:'packaging_history_test',logging:false,entities:[]});await ds.initialize();sources.push(ds);const identity=(await ds.query("SELECT current_database() db,current_setting('server_version_num') version"))[0];if(identity.db!=='packaging_history_test'||identity.version!=='180006')throw Error('ISOLATION_REQUIRED');
  const count=async()=>Number((await ds.query('SELECT count(*) n FROM migrations'))[0].n);if(await count()!==chain)throw Error('BAD_CHAIN');
  const events=async()=>(await ds.query("SELECT count(*)::int n,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM pkg_packing_events t"))[0];const beforeEvents=chain===83?await events():null;
  const compose=path.join(dir,'compose-'+port+'.yml');fs.writeFileSync(compose,`name: packaging-ab-node20-${port}-${stamp}\nservices:\n  api:\n    image: \${API_IMAGE:-packaging-history-candidate-test:review26r2}\n    network_mode: host\n    environment:\n      DB_HOST: 127.0.0.1\n      DB_PORT: '${port}'\n      DB_USER: postgres\n      DB_NAME: packaging_history_test\n      NODE_ENV: production\n`,{flag:'wx'});
  const r=run('bash',[root+'/scripts/deploy-schema-first.sh',dir+'/evidence-'+port,result.imageId],{env:{PATH:process.env.PATH,COMPOSE_FILE:compose,PRESERVE_ARTIFACTS:'true'}});ok(r);if(r.stdout.trim()!==result.imageId||await count()!==83)throw Error('CANDIDATE_OR_CHAIN_MISMATCH');
  const afterEvents=await events();if(beforeEvents&&JSON.stringify(beforeEvents)!==JSON.stringify(afterEvents))throw Error('EVENTS_CHANGED');
  result.checks.push({port,identity,beforeMigrations:chain,afterMigrations:83,beforeEvents,afterEvents,verifiedImage:r.stdout.trim()});save();
 }
 // Run the production CLI in the actual Alpine image; run the unchanged Bash gate on host.
 const generatorName='packaging-entity-node20-'+stamp,artifact='/tmp/'+stamp+'-EntityDrift.ts';
 const r=run('docker',['run','--name',generatorName,'--network','host','-e','DB_HOST=127.0.0.1','-e','DB_PORT=55438','-e','DB_USER=postgres','-e','DB_NAME=packaging_history_test','--entrypoint','./node_modules/.bin/typeorm',result.imageId,'migration:generate','/tmp/EntityDrift','-d','dist/database/data-source.js','--timestamp',String(stamp)]);result.resources.push(generatorName);ok(r);
 const generated=path.join(dir,'EntityDrift.ts');ok(run('docker',['cp',generatorName+':'+artifact,generated]));
 const gate=run('bash',[root+'/scripts/check-entity-drift-baseline.sh',root+'/.github/entity-drift-baseline.txt',generated]);if(gate.status!==0||!gate.stdout.includes(expectedDiff+' / baseline 300'))throw Error('ACTUAL_GATE_COUNT_MISMATCH');
 result.checks.push({actualGenerator:expectedDiff,gateExit:gate.status,baseline:300});
 const httpName='packaging-node20-http-'+stamp;
 const http=run('docker',['run','-i','--name',httpName,'--network','host','-e','DB_HOST=127.0.0.1','-e','DB_PORT=55438','-e','DB_USER=postgres','-e','DB_NAME=packaging_history_test','--entrypoint','node',result.imageId],{input:fs.readFileSync(root+'/scripts/entity-alignment/candidate-http.cjs')});result.resources.push(httpName);ok(http);result.checks.push({http:JSON.parse(http.stdout.trim())});
 result.exit=0;
}catch(e){result.exit=1;result.error=e.message;process.exitCode=1;}
finally{for(const ds of sources)if(ds.isInitialized)await ds.destroy();for(const name of result.resources.filter(n=>n.startsWith('packaging-history-candidate-pg-')))ok(run('docker',['stop',name]));result.after=snap();if(JSON.stringify(result.before.hashes)!==JSON.stringify(result.after.hashes)){result.exit=1;process.exitCode=1;result.error='SOURCE_CHANGED';}save();console.log(JSON.stringify({dir,exit:result.exit,error:result.error,checks:result.checks}));}})();
