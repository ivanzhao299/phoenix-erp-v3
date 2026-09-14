'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'artifacts','readonly-metadata-'+Date.now());fs.mkdirSync(dir);
const revision=require('./revision.cjs'),helper=require('../ops/readonly-audits/packaging-metadata.cjs');
const results={before:revision.capture(),command:'node scripts/packaging-history-test/readonly-metadata.cjs',cases:[]};
const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex'); const bundleDir=path.join(root,'scripts/ops/readonly-audits'); const env={AUDIT_MODE:'packaging-metadata',EXPECTED_DEPLOY_SHA:helper.BASELINE,BACKUP_DIRECTORY:'deploy-backups',ASSERTION_SQL_PATH:'',HTTP_ASSERTIONS_PATH:'',BUNDLE_SOURCE_COMMIT:'a'.repeat(40),BUNDLE_HELPER_SHA256:hash(fs.readFileSync(path.join(bundleDir,'packaging-metadata.cjs'))),BUNDLE_SQL_SHA256:hash(fs.readFileSync(path.join(bundleDir,'packaging-metadata.sql'))),BUNDLE_MANIFEST_SHA256:hash(fs.readFileSync(path.join(bundleDir,'packaging-metadata-manifest.json')))};
const config={companyCode:'TEST',siteCode:'TEST',version:'TEST',receiptMode:'C',R:false,B:false,P:false,V:false,H:false,Q:false};
const rows=p=>[{dict_code:'TEST:TEST',config_json:p}];
function test(name,kind,fn){fn();results.cases.push({name,kind,status:'PASS'});console.log(kind+': '+name);}
function throws(fn,klass){assert.throws(fn,e=>e.klass===klass);}
const container='packaging-history-metadata-test-'+Date.now();let created=false;
function command(cmd,args,input){const r=cp.spawnSync(cmd,args,{input,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});if(r.status!==0){const e=new Error('local fixture command failed');e.status=r.status;e.localCommand=cmd;e.localSubcommand=args[0];e.sqlState=(r.stderr.match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)||[])[1];throw e;}return r.stdout.trim();}
function sql(query,user='postgres',options=[]){return command('docker',['exec','-i',...options,container,'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U',user,'-d','metadata_test'],query);}
try{
 test('actual PackagingWorkflowPolicy parser parity (13 cases)','unit/runtime',()=>{const r=JSON.parse(command(process.execPath,[path.join(__dirname,'readonly-policy-parity.cjs')]));assert.equal(r.cases,13);assert.equal(r.passed,true);});
 test('input exact fixed baseline and logical directory','unit',()=>assert.equal(helper.validate(env),true));
 for(const [key,value] of [['EXPECTED_DEPLOY_SHA','$(TEST)'],['BACKUP_DIRECTORY','../../etc'],['BACKUP_DIRECTORY','deploy-backups;echo TEST'],['ASSERTION_SQL_PATH','/etc/passwd'],['HTTP_ASSERTIONS_PATH','scripts/ops/readonly-audits/test.json']])test('reject input '+key+' '+value,'unit',()=>assert.throws(()=>helper.validate({...env,[key]:value})));
 test('schema absent differs from no config','unit',()=>{assert.equal(helper.flags([],false).state,'schema_not_ready');assert.equal(helper.flags([]).state,'no_config');});
 test('valid boolean all off','unit',()=>assert.equal(helper.flags(rows(config)).state,'valid_all_off'));
 test('TEXT config remains malformed as pg driver would return','unit',()=>assert.equal(helper.flags(rows(JSON.stringify(config))).state,'malformed'));
 test('duplicate key blocks although application disables duplicates','unit',()=>assert.equal(helper.flags([...rows(config),...rows(config)]).state,'malformed'));
 for(const p of [null,{}, {...config,R:'true'},{...config,receiptMode:'A'},{...config,siteCode:'FOREIGN'}, {...config,version:''}, {...config,H:true}])test('malformed policy '+results.cases.length,'unit',()=>assert.equal(helper.flags(rows(p)).state,'malformed'));
 test('raw Q true blocks even if unqualified effective Q false','unit',()=>{const r=helper.flags(rows({...config,Q:true}));assert.equal(r.state,'any_true');assert.equal(r.effective.Q,false);});
 const qualified={...config,R:true,B:true,P:true,V:true,H:true,Q:true,encodingVersion:'PBX-v1',deviceProfile:'TEST',qualification:{accepted:true,evidenceRef:'TEST',acceptedAt:'2026-09-14'}};
 test('nested qualified policy uses Date.parse semantics','unit',()=>assert.equal(helper.flags(rows(qualified)).effective.Q,true));
 test('nested invalid date with H blocks','unit',()=>assert.equal(helper.flags(rows({...qualified,qualification:{...qualified.qualification,acceptedAt:'invalid'}})).state,'malformed'));
 const backup=path.join(dir,'TEST-backups');const legal=path.join(backup,'deploy-pre-migration-12345');fs.mkdirSync(legal,{recursive:true});fs.writeFileSync(path.join(legal,'phoenix_erp_pre_0123456789ab.dump'),'TEST not a real backup');fs.writeFileSync(path.join(legal,'phoenix_erp_pre_0123456789ab.dump.sha256'),'TEST digest');
 test('backup metadata accepts exact deploy layout without reading contents','filesystem',()=>{const r=helper.backupMetadata(backup);assert.equal(r.count,2);assert.equal(r.layout,'deploy-pre-migration/<numeric-run>/phoenix_erp_pre_<12hex>.dump[.sha256]');assert.ok(!JSON.stringify(r).includes('TEST'));});
 const independent=path.join(backup,'bug-intake-runner');fs.mkdirSync(independent);fs.symlinkSync(path.join(legal,'phoenix_erp_pre_0123456789ab.dump'),path.join(independent,'unrelated-link'));test('independent top-level is reported without recursive content inspection','filesystem',()=>{const r=helper.backupMetadata(backup);assert.deepEqual(r.unrelatedTopLevel,[{type:'directory',relativePath:'bug-intake-runner',depth:1}]);});
 const rootFile=path.join(dir,'root-file');fs.mkdirSync(rootFile);fs.writeFileSync(path.join(rootFile,'unexpected'),'TEST');test('root regular file remains fail closed','filesystem',()=>assert.throws(()=>helper.backupMetadata(rootFile),e=>e.klass==='UNSUPPORTED_TYPE'&&e.detail.depth===1));
 for(const bad of ['phoenix_erp_pre_0123456789ab.dump.tmp','phoenix_erp_pre_0123456789ab.lock','phoenix_erp_pre_0123456789ab.partial','.hidden','random.dump']){const b=path.join(dir,'bad-'+bad.replace(/[^A-Za-z0-9]/g,'_'));fs.mkdirSync(path.join(b,'deploy-pre-migration-1'),{recursive:true});fs.writeFileSync(path.join(b,'deploy-pre-migration-1',bad),'TEST');test('backup rejects unknown temporary/hidden name '+bad,'filesystem',()=>{assert.throws(()=>helper.backupMetadata(b),e=>e.klass==='UNKNOWN_NAME'&&e.detail.depth===2&&e.detail.relativePath.includes('deploy-pre-migration-1'));});}
 const badDir=path.join(dir,'bad-dir');fs.mkdirSync(path.join(badDir,'deploy-pre-migration-1','nested','child'),{recursive:true});test('backup rejects nested unknown directory and depth','filesystem',()=>assert.throws(()=>helper.backupMetadata(badDir),e=>e.klass==='UNSUPPORTED_TYPE'&&e.detail.depth===2));
 const deep=path.join(dir,'deep');fs.mkdirSync(path.join(deep,'deploy-pre-migration-1','nested'),{recursive:true});test('backup rejects nested directory type','filesystem',()=>assert.throws(()=>helper.backupMetadata(deep),e=>e.klass==='UNSUPPORTED_TYPE'&&e.detail.depth===2));
 const partial=path.join(dir,'partial');fs.mkdirSync(path.join(partial,'deploy-pre-migration-1'),{recursive:true});fs.writeFileSync(path.join(partial,'deploy-pre-migration-1','phoenix_erp_pre_0123456789ab.dump'),'TEST');test('backup rejects unmatched partial pair','filesystem',()=>assert.throws(()=>helper.backupMetadata(partial),e=>e.klass==='PARTIAL_BACKUP'&&e.detail.depth===2));
 const fifo=path.join(dir,'fifo');fs.mkdirSync(path.join(fifo,'deploy-pre-migration-1'),{recursive:true});require('node:child_process').execFileSync('mkfifo',[path.join(fifo,'deploy-pre-migration-1','phoenix_erp_pre_0123456789ab.dump')]);test('backup rejects special fifo','filesystem',()=>assert.throws(()=>helper.backupMetadata(fifo),e=>e.klass==='UNSUPPORTED_TYPE'&&e.detail.type==='fifo'));

 const links=path.join(dir,'TEST-links');fs.mkdirSync(links);fs.symlinkSync(path.join(legal,'phoenix_erp_pre_0123456789ab.dump'),path.join(links,'phoenix_erp_pre_0123456789ab.dump'));
 test('backup symlink fails closed','filesystem',()=>throws(()=>helper.backupMetadata(links),'SYMLINK'));
 test('parent symlink fails closed','filesystem',()=>{fs.symlinkSync(backup,path.join(dir,'linked-directory'));throws(()=>helper.backupMetadata(path.join(dir,'linked-directory')),'SYMLINK');});
 test('static manifest matches reviewed 83 TS classes','static',()=>assert.deepEqual(helper.manifest(path.join(root,'apps/api/src/database/migrations')),require('../ops/readonly-audits/packaging-metadata-manifest.json')));
 const badManifest=path.join(dir,'TEST-ts');fs.mkdirSync(badManifest);fs.writeFileSync(path.join(badManifest,'1780000000000-Test.ts'),"throw new Error('MUST NEVER EXECUTE');\nexport class Test1780000000000 implements MigrationInterface {\n name = 'wrong';\n}");
 test('static manifest rejects name mismatch without executing TS','static',()=>throws(()=>helper.manifest(badManifest),'NAME_MISMATCH'));
 // End-to-end CLI command fixtures: stdout/stderr from failing subprocess never escapes.
 const bin=path.join(dir,'bin');fs.mkdirSync(bin);
 fs.writeFileSync(path.join(bin,'git'),`#!/bin/sh\necho aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n`,{mode:0o755});
 const runCLI=()=>cp.spawnSync(process.execPath,[path.join(root,'scripts/ops/readonly-audits/packaging-metadata.cjs')],{env:{...env,PATH:bin+':'+process.env.PATH},encoding:'utf8'});
 test('wrong actual SHA is printed and stops before Docker','shell',()=>{const r=runCLI();assert.equal(r.status,2);assert.match(r.stdout,/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);assert.match(r.stdout,/SHA_MISMATCH/);});
 fs.writeFileSync(path.join(bin,'git'),`#!/bin/sh\necho TEST_SECRET_SENTINEL >&2\nexit 42\n`,{mode:0o755});
 test('command stderr sanitized, original exit retained','shell',()=>{const r=runCLI();assert.equal(r.status,42);assert.ok(!(r.stdout+r.stderr).includes('TEST_SECRET_SENTINEL'));assert.match(r.stdout,/CHECKOUT/);});
 let wrapper=fs.readFileSync(path.join(root,'.github/workflows/production-readonly-audit.yml'),'utf8').split('          script: |\n')[1].split('      - name: Enforce metadata')[0].split('\n').map(s=>s.startsWith('            ')?s.slice(12):s).join('\n');
 fs.writeFileSync(path.join(bin,'node'),'#!/bin/sh\necho TEST_SECRET_SENTINEL >&2\nexit 37\n',{mode:0o755});
 test('metadata wrapper isolates legacy stderr and missing runtime failure','shell',()=>{const r=cp.spawnSync('bash',['-c',wrapper],{env:{...env,PATH:bin+':'+process.env.PATH,DEPLOY_PATH:root,AUDIT_BUNDLE_DIR:root},encoding:'utf8'});assert.equal(r.status,0);assert.ok(!(r.stdout+r.stderr).includes('TEST_SECRET_SENTINEL'));assert.match(r.stdout,/AUDIT_METADATA_RESULT=FAIL/);});
 // DB command fixtures exercise classification without exposing stderr or secrets.
 const dbCases={MISSING_CONTAINER:'docker: Error response from daemon: No such container TEST_SECRET',MISSING_PSQL:'exec: \"psql\": executable file not found',MISSING_ROLE:'FATAL: role \"phoenix_metadata_readonly\" does not exist',MISSING_DATABASE:'FATAL: database \"phoenix_erp\" does not exist',PERMISSION_DENIED:'FATAL: permission denied for relation sys_dict',READONLY_SQL_FAILURE:'ERROR: statement timeout'};
 for(const [klass,message] of Object.entries(dbCases))test('DB fixture '+klass,'shell',()=>{assert.equal(helper.classifyDbFailure({stderr:message}||{}),klass);});
 test('DB failure classification never includes stderr','shell',()=>{const e={stderr:'FATAL SECRET_TOKEN permission denied'};assert.equal(helper.classifyDbFailure(e),'PERMISSION_DENIED');assert.ok(!JSON.stringify({stage:'DB',class:helper.classifyDbFailure(e),exit:2}).includes('SECRET_TOKEN'));});
 const wrapperText=fs.readFileSync(path.join(root,'.github/workflows/production-readonly-audit.yml'),'utf8').split('          script: |\n')[1].split('      - name: Enforce metadata')[0];
 test('metadata SSH wrapper isolates stderr and has no EOF heredoc','shell',()=>{const start=wrapperText.indexOf('if [ \"${AUDIT_MODE:-legacy}\" = packaging-metadata ]');const end=wrapperText.indexOf('if [ \"${AUDIT_MODE:-legacy}\" != legacy ]');const branch=wrapperText.slice(start,end);assert.ok(branch.includes('exec 2>/dev/null'));assert.ok(branch.includes('set +e'));assert.ok(branch.includes('AUDIT_METADATA_RESULT=PASS'));assert.ok(branch.includes('AUDIT_METADATA_RESULT=FAIL'));assert.ok(!branch.includes('EOF'));assert.ok(!branch.includes('exec 2>&1'));});
 // Dedicated networkless PG18 TEST instance; no existing service or credentials touched.
 command('docker',['create','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=metadata_test','sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2']);created=true;
 command('docker',['start',container]);
 let ready=false;for(let i=0;i<60;i++){const r=cp.spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres','-d','metadata_test'],{stdio:'ignore'});if(r.status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);}assert.ok(ready,'PG ready');
 results.container=container;results.isolation={network:'none',publishedPorts:0,database:'metadata_test',version:sql('SHOW server_version;')};
 sql(`CREATE ROLE phoenix_metadata_readonly LOGIN; REVOKE CREATE,TEMP ON DATABASE metadata_test FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO phoenix_metadata_readonly;
 CREATE TABLE public.migrations (name text NOT NULL); CREATE TABLE public.test_evidence (id int PRIMARY KEY,note text); INSERT INTO public.test_evidence VALUES (1,'TEST immutable'); GRANT SELECT ON ALL TABLES IN SCHEMA public TO phoenix_metadata_readonly;`);
 const preamble=fs.readFileSync(path.join(root,'scripts/ops/readonly-audits/packaging-metadata.sql'),'utf8');
 function readonly(q,user='phoenix_metadata_readonly'){return sql(preamble+'\n'+q+'\nROLLBACK;',user,['-e','PGOPTIONS=-c default_transaction_read_only=on']);}
 const digest=()=>sql(`SELECT md5(coalesce((SELECT string_agg(row_to_json(t)::text,',' ORDER BY id) FROM public.test_evidence t),'') || (SELECT string_agg(c.relname || ':' || a.attname || ':' || a.atttypid::text,',' ORDER BY c.relname,a.attnum) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND a.attnum>0));`);
 test('real PG18 readonly settings and genuinely unprivileged role','PG',()=>{const identity=JSON.parse(readonly(''));assert.equal(identity.role_safe,true);assert.equal(identity.transaction_read_only,'on');assert.equal(identity.default_transaction_read_only,'on');assert.match(identity.server_version_num,/^18/);});
 test('superuser rejected even inside readonly transaction','PG',()=>assert.equal(JSON.parse(readonly('','postgres')).role_safe,false));
 test('readonly role cannot INSERT even without readonly transaction','PG',()=>assert.throws(()=>sql("INSERT INTO public.test_evidence VALUES(2,'TEST');",'phoenix_metadata_readonly'),e=>e.sqlState==='42501'));
 test('write-capable role fails role metadata check','PG',()=>{sql('GRANT UPDATE ON public.test_evidence TO phoenix_metadata_readonly;');assert.equal(JSON.parse(readonly('')).role_safe,false);sql('REVOKE UPDATE ON public.test_evidence FROM phoenix_metadata_readonly;');});
 test('role membership cannot hide SET ROLE write capability','PG',()=>{sql('CREATE ROLE test_writer NOLOGIN; GRANT test_writer TO phoenix_metadata_readonly WITH INHERIT FALSE;');assert.equal(JSON.parse(readonly('')).role_safe,false);sql('REVOKE test_writer FROM phoenix_metadata_readonly;');});
 test('readonly role cannot CREATE table','PG',()=>assert.throws(()=>sql('CREATE TABLE public.test_forbidden(id int);','phoenix_metadata_readonly'),e=>e.sqlState==='42501'));
 test('readonly transaction forbids writes even superuser','PG',()=>assert.throws(()=>readonly("INSERT INTO public.test_evidence VALUES(3,'TEST');",'postgres'),e=>e.sqlState==='25006'));
 let mode='normal';const output=[];const oldLog=console.log;
 function audit(){console.log=s=>output.push(JSON.parse(s));try{return helper.main(env,{backupPath:backup,run(stage,cmd,args,input){
  if(stage==='CHECKOUT')return args[0]==='rev-parse'?helper.BASELINE:'';
  if(stage==='IMAGES'){if(mode==='docker-fail')throw Object.assign(new Error('fixture'),{stage:'IMAGES',klass:'COMMAND_FAILED'});return 'sha256:'+'a'.repeat(64)+' <no value>';}
  if(stage==='CAPACITY')return 'Size Used Avail\n10000 1000 9000';
  if(stage==='DB'){if(mode==='db-fail')throw Object.assign(new Error('fixture'),{stage:'DB',klass:'COMMAND_FAILED'});return sql(input,'phoenix_metadata_readonly',['-e','PGOPTIONS=-c default_transaction_read_only=on']);}
  throw Error('unexpected command');
 }});}finally{console.log=oldLog;}}
 test('missing sys_dict table is schema_not_ready and stops','PG/helper',()=>{assert.throws(audit);assert.equal(output.at(-1).state,'schema_not_ready');});
 sql('CREATE TABLE public.sys_dict(dict_type text,dict_code text,status text); GRANT SELECT ON public.sys_dict TO phoenix_metadata_readonly;');
 test('missing config column remains schema_not_ready','PG/helper',()=>{assert.throws(audit);assert.equal(output.at(-1).state,'schema_not_ready');});
 sql('ALTER TABLE public.sys_dict ADD COLUMN config_json text;');
 test('RLS hidden policy rows fail closed','PG/helper',()=>{sql('ALTER TABLE public.sys_dict ENABLE ROW LEVEL SECURITY;');assert.throws(audit);assert.equal(output.at(-1).state,'schema_not_ready');sql('ALTER TABLE public.sys_dict DISABLE ROW LEVEL SECURITY;');});
 test('empty TEXT policy table no_config and missing image label UNKNOWN','PG/helper',()=>{const r=audit();assert.equal(r.policy.state,'no_config');assert.equal(r.images.api.revision,'UNKNOWN');assert.equal(r.pending.length,83);});
 sql(`INSERT INTO public.sys_dict VALUES ('PKG_HISTORY_POLICY','TEST:TEST','ACTIVE','${JSON.stringify(config)}');`);
 test('real PG TEXT policy rejected consistent with runtime driver','PG/helper',()=>{assert.throws(audit);assert.equal(output.at(-1).state,'malformed');});
 // Separate TEST schema representation to exercise true JSONB configurations; not a product migration.
 sql('ALTER TABLE public.sys_dict ALTER COLUMN config_json TYPE jsonb USING config_json::jsonb;');
 test('real PG JSONB valid all off accepted','PG/helper',()=>assert.equal(audit().policy.state,'valid_all_off'));
 sql(`UPDATE public.sys_dict SET config_json=jsonb_set(config_json,'{Q}','true');`);
 test('real PG raw Q true blocks regardless of effective qualification','PG/helper',()=>{assert.throws(audit);assert.equal(output.at(-1).state,'any_true');});
 sql(`UPDATE public.sys_dict SET config_json=jsonb_set(config_json,'{Q}','false');`);
 for(const value of ['docker-fail','db-fail'])test(value+' does not produce successful metadata','helper',()=>{mode=value;assert.throws(audit);mode='normal';});
 test('manifest compares names, not counts, preserves bridge names','PG/helper',()=>{const names=require('../ops/readonly-audits/packaging-metadata-manifest.json');sql(`INSERT INTO public.migrations VALUES ('${names[0].name}'),('TESTFrozenSqlBridge');`);const r=audit();assert.equal(r.pending.length,82);assert.ok(!r.pending.includes(names[0].name));assert.deepEqual(r.appliedOutsideCandidate,['TESTFrozenSqlBridge']);});
 const snapshot=()=>sql(`SELECT md5((SELECT coalesce(string_agg(row_to_json(t)::text,',' ORDER BY dict_code),'') FROM public.sys_dict t) || (SELECT coalesce(string_agg(name,',' ORDER BY name),'') FROM public.migrations)) || ':' || '${digest()}';`);
 test('real readonly audit preserves public data and catalog summary','PG/helper',()=>{const catalog=()=>sql(`SELECT md5(json_build_object('columns',(SELECT json_agg(x ORDER BY x.table_name,x.ordinal_position) FROM information_schema.columns x WHERE table_schema='public'),'constraints',(SELECT json_agg(pg_get_constraintdef(c.oid) ORDER BY c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),'indexes',(SELECT json_agg(x ORDER BY x.indexname) FROM pg_indexes x WHERE schemaname='public'),'acl',(SELECT json_agg(json_build_array(c.relname,c.relacl) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'))::text);`);const before=snapshot(),catalogBefore=catalog();audit();assert.equal(snapshot(),before);assert.equal(catalog(),catalogBefore);results.catalogDigest=catalogBefore;results.unchangedDigest=before;results.digestScope='all three public TEST tables; column names/types plus public constraints/index definitions/ACL';});
 results.exit=0;
}catch(e){results.exit=1;results.failureClass=e.name||'ERROR';results.localCommand=e.localCommand;results.localSubcommand=e.localSubcommand;results.localCommandExit=e.status;results.failedAfter=results.cases.length;console.log('FAIL local metadata test after '+results.cases.length);process.exitCode=1;}
finally{
 if(created){try{command('docker',['stop',container]);results.fixtureStopped=true;}catch{results.fixtureStopped=false;process.exitCode=1;results.exit=1;}}
 results.after=revision.capture();results.sourceUnchanged=results.before.sourceFingerprint===results.after.sourceFingerprint;
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(results,null,2));console.log(dir,'exit='+results.exit);
}
