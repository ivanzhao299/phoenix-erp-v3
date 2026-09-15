'use strict';
// Standalone Node >=20, builtins only. Never import application code or credentials.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASELINE='a53d91f33ff733bf28e19ca11d7491f1bfd46922';
const KEYS=['R','B','P','V','H','Q'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fail(stage,klass='FAILED',exit=2,detail){const e=new Error('metadata failure');Object.assign(e,{stage,klass,exit,detail});throw e;}
function safeRelative(root,p){const rel=path.relative(root,p).replaceAll('\\','/');return rel.replace(/[^A-Za-z0-9._\/-]/g,'_').slice(0,160)||'.';}
function lstatType(s){if(s.isSymbolicLink())return 'symlink';if(s.isFile())return 'file';if(s.isDirectory())return 'directory';if(s.isFIFO())return 'fifo';if(s.isSocket())return 'socket';if(s.isCharacterDevice())return 'character-device';if(s.isBlockDevice())return 'block-device';return 'other';}
function backupFail(root,p,s,klass,depth){fail('BACKUP',klass,2,{type:lstatType(s),relativePath:safeRelative(root,p),depth});}
function classifyDbFailure(result){
 const text=[result.error&&result.error.code,result.stderr].filter(Boolean).join(' ').toLowerCase();
 if(/no such container|container .*not found|is not running|cannot find container/.test(text))return 'MISSING_CONTAINER';
 if(/psql(?::|\s).*not found|executable file not found|no such file or directory/.test(text))return 'MISSING_PSQL';
 if(/database [^\n]* does not exist|unknown database/.test(text))return 'MISSING_DATABASE';
 if(/role [^\n]* does not exist|unknown user/.test(text))return 'MISSING_ROLE';
 if(/permission denied|not permitted|authentication failed|password authentication failed/.test(text))return 'PERMISSION_DENIED';
 return 'READONLY_SQL_FAILURE';
}
function run(stage,cmd,args,input){
 const r=cp.spawnSync(cmd,args,{input,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,
   env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',LC_ALL:'C'}});
 if(r.error||r.status!==0){const klass=stage==='DB'?classifyDbFailure(r):(r.error?'EXECUTION_ERROR':'COMMAND_FAILED');fail(stage,klass,Number.isInteger(r.status)&&r.status>0?r.status:2);}
 return r.stdout.trim(); // stderr NEVER forwarded, even on errors.
}
function regular(p,directory=false){
 const absolute=path.resolve(p),parts=absolute.split(path.sep);let current=path.parse(absolute).root;
 for(const part of parts.filter(Boolean)){current=path.join(current,part);const s=fs.lstatSync(current);if(s.isSymbolicLink())fail('PATH','SYMLINK');}
 const s=fs.lstatSync(absolute);if(directory?!s.isDirectory():!s.isFile())fail('PATH','WRONG_TYPE');return s;
}
function manifest(dir){
 regular(dir,true);
 const entries=fs.readdirSync(dir).filter(f=>/^\d{13}-[A-Za-z0-9_-]+\.ts$/.test(f)).sort().map(file=>{
  const p=path.join(dir,file);regular(p);const source=fs.readFileSync(p,'utf8');
  // Static grammar, no require/eval/import. Reject ambiguity rather than guess.
  const classes=[...source.matchAll(/^export class ([A-Za-z][A-Za-z0-9]*\d{13}) implements MigrationInterface\s*\{/gm)];
  if(classes.length!==1)fail('MANIFEST','UNSUPPORTED_CLASS');
  const name=classes[0][1],timestamp=name.slice(-13);
  if(timestamp!==file.slice(0,13))fail('MANIFEST','TIMESTAMP_MISMATCH');
  const names=[...source.matchAll(/^\s*(?:readonly )?name\s*=\s*['"]([^'"]+)['"]\s*;/gm)];
  if(names.length>1||names.some(m=>m[1]!==name))fail('MANIFEST','NAME_MISMATCH');
  return {file,name,timestamp,sha256:hash(source)};
 });
 if(!entries.length||new Set(entries.map(e=>e.name)).size!==entries.length)fail('MANIFEST','EMPTY_OR_DUPLICATE');
 return entries;
}
function flags(rows,ready=true){
 if(!ready)return {state:'schema_not_ready'};
 if(!rows.length)return {state:'no_config',effective_default_all_off:true};
 const seen=new Set(),raw=Object.fromEntries(KEYS.map(k=>[k,false])),effective={...raw};
 for(const row of rows){
  const p=row.config_json,code=row.dict_code;
  // PostgreSQL TEXT stays a JS string, exactly like pg/EntityManager.query.
  if(typeof code!=='string'||seen.has(code)||!p||typeof p!=='object'||Array.isArray(p)
    ||typeof p.companyCode!=='string'||typeof p.siteCode!=='string'||`${p.companyCode}:${p.siteCode}`!==code
    ||p.receiptMode!=='C'||typeof p.version!=='string'||!p.version||KEYS.some(k=>typeof p[k]!=='boolean'))return {state:'malformed'};
  seen.add(code);
  const q=p.Q===true&&p.encodingVersion==='PBX-v1'&&typeof p.deviceProfile==='string'&&p.deviceProfile.length>0
   &&p.qualification?.accepted===true&&typeof p.qualification.evidenceRef==='string'&&p.qualification.evidenceRef.length>0
   &&typeof p.qualification.acceptedAt==='string'&&Number.isFinite(Date.parse(p.qualification.acceptedAt));
  if(p.H&&(!p.R||!p.B||!p.P||!p.V||!q))return {state:'malformed'};
  for(const k of KEYS){raw[k] ||= p[k];effective[k] ||= k==='Q'?q:p[k];}
 }
 return {state:Object.values(raw).some(Boolean)?'any_true':'valid_all_off',raw,effective};
}
function backupMetadata(dir){
 const root=path.resolve(dir);regular(root,true);let count=0,bytes=0,maxMtime=0,partial=[],unrelatedTopLevel=[];
 const dirs=fs.readdirSync(root);
 for(const name of dirs){
  const p=path.join(root,name),s=fs.lstatSync(p),depth=1;
  if(s.isSymbolicLink())backupFail(root,p,s,'SYMLINK',depth);
  if(!s.isDirectory())backupFail(root,p,s,'UNSUPPORTED_TYPE',depth);
  if(!/^deploy-pre-migration-[0-9]+$/.test(name)){
   // Independent backup/artifact directories (for example bug-intake-runner) are
   // reported by metadata only. Never recurse into them or treat their contents
   // as migration backups; their own audit has a separate contract.
   unrelatedTopLevel.push({type:lstatType(s),relativePath:safeRelative(root,p),depth});
   continue;
  }
  const files=fs.readdirSync(p),seen=new Map();
  for(const file of files){
   const fp=path.join(p,file),fsx=fs.lstatSync(fp),fd=2;
   if(fsx.isSymbolicLink())backupFail(root,fp,fsx,'SYMLINK',fd);
   if(!fsx.isFile())backupFail(root,fp,fsx,'UNSUPPORTED_TYPE',fd);
   const m=file.match(/^phoenix_erp_pre_([a-f0-9]{12})\.(dump|dump\.sha256)$/);
   if(!m)backupFail(root,fp,fsx,'UNKNOWN_NAME',fd);
   const key=m[1];seen.set(key,(seen.get(key)||[]).concat(m[2]));
   count++;bytes+=fsx.size;maxMtime=Math.max(maxMtime,Math.floor(fsx.mtimeMs));
  }
  for(const [key,parts] of seen){if(parts.length!==2){partial.push({type:'file',relativePath:safeRelative(root,path.join(p,`phoenix_erp_pre_${key}.dump`)),depth:2});}}
 }
 if(partial.length)fail('BACKUP','PARTIAL_BACKUP',2,partial[0]);
 return {state:count?'METADATA_ONLY':'NO_BACKUP',count,bytes,maxMtime,layout:'deploy-pre-migration/<numeric-run>/phoenix_erp_pre_<12hex>.dump[.sha256]',unrelatedTopLevel};
}
function validate(env){
 const expectedHashes=['BUNDLE_HELPER_SHA256','BUNDLE_SQL_SHA256','BUNDLE_MANIFEST_SHA256'];
 if(!/^[a-f0-9]{40}$/.test(env.BUNDLE_SOURCE_COMMIT||''))fail('INPUT','BUNDLE_SOURCE_COMMIT');
 for(const key of expectedHashes)if(!/^[a-f0-9]{64}$/.test(env[key]||''))fail('INPUT',key);
 const bundleFiles={BUNDLE_HELPER_SHA256:__filename,BUNDLE_SQL_SHA256:path.join(__dirname,'packaging-metadata.sql'),BUNDLE_MANIFEST_SHA256:path.join(__dirname,'packaging-metadata-manifest.json')};
 for(const [key,file] of Object.entries(bundleFiles)){if(hash(fs.readFileSync(file))!==env[key])fail('BUNDLE','HASH_MISMATCH');}
 if(env.AUDIT_MODE!=='packaging-metadata'||env.ASSERTION_SQL_PATH||env.HTTP_ASSERTIONS_PATH)fail('INPUT','MODE_OR_PATH');
 if(env.EXPECTED_DEPLOY_SHA!==BASELINE)fail('INPUT','BASELINE');
 if(env.BACKUP_DIRECTORY!=='deploy-backups')fail('INPUT','BACKUP_NAME');
 return true;
}
function main(env=process.env,io={}){
 const command=io.run||run,backupPath=io.backupPath||'/opt/phoenix-erp-backups';
 validate(env);if(process.argv.includes('--validate'))return {state:'INPUT_VALID'};
 if(Number(process.versions.node.split('.')[0])<20)fail('RUNTIME','NODE_20_REQUIRED');
 const actual=command('CHECKOUT','git',['rev-parse','HEAD']);
 if(!/^[a-f0-9]{40}$/.test(actual))fail('CHECKOUT','INVALID_SHA');
 // Actual SHA is independently safe, including the mismatch case.
 console.log(JSON.stringify({stage:'CHECKOUT',actualSHA:actual}));
 if(actual!==env.EXPECTED_DEPLOY_SHA)fail('CHECKOUT','SHA_MISMATCH');
 const dirty=command('CHECKOUT','git',['status','--porcelain','--untracked-files=all']);
 const dirtyLines=dirty?dirty.split('\n').filter(Boolean):[];
 // Sanitized paths only (safeRelative charset+length cap, 50 entries max); never contents.
 const dirtyEntries=dirtyLines.slice(0,50).map(l=>({status:l.slice(0,2).trim()||'??',path:safeRelative(process.cwd(),path.resolve(l.slice(3).split(' -> ')[0]))}));
 const images={};
 for(const service of ['api','web']){
  const fields=command('IMAGES','docker',['inspect','--format','{{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}',`phoenix-v3-${service}`]).split(/\s+/);
  if(!/^sha256:[a-f0-9]{64}$/.test(fields[0]))fail('IMAGES','INVALID_IMAGE_ID');
  images[service]={imageID:fields[0],revision:/^[a-f0-9]{40}$/.test(fields[1])?fields[1]:'UNKNOWN'};
 }
 const backup=backupMetadata(backupPath);
 const capacity={};for(const [key,p] of [['checkout',process.cwd()],['backup',backupPath]]){
  const fields=command('CAPACITY','df',['-B1','--output=size,used,avail',p]).split('\n').slice(1).join(' ').trim().split(/\s+/);
  if(fields.length!==3||fields.some(f=>!/^\d+$/.test(f)))fail('CAPACITY','INVALID_METADATA');capacity[key]=fields.map(Number);
 }
 const preamble=fs.readFileSync(path.join(__dirname,'packaging-metadata.sql'),'utf8');
 function query(sql){
  const out=command('DB','docker',['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on','phoenix-v3-db',
   'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U','phoenix_metadata_readonly','-d','phoenix_erp'],preamble+'\n'+sql+'\nROLLBACK;\n');
  let lines;try{lines=out.split('\n').map(s=>JSON.parse(s));}catch{fail('DB','INVALID_METADATA');}
  const identity=lines.shift();if(identity.transaction_read_only!=='on'||identity.default_transaction_read_only!=='on'||identity.role_safe!==true)fail('DB','READONLY_ROLE_REQUIRED');
  if(Math.floor(Number(identity.server_version_num)/10000)!==16)fail('DB','PG_MAJOR');
  return lines;
 }
 // First verify the role before querying any application metadata.
 query('');
 const [schema]=query(`SELECT json_build_object('ready', (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='public' AND table_name='sys_dict' AND column_name IN ('dict_type','dict_code','status','config_json')) AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='sys_dict' AND c.relkind='r' AND NOT c.relrowsecurity));`);
 let policy=flags([],false);
 if(schema.ready){const rows=query(`SELECT json_build_object('dict_code',dict_code,'config_json',config_json) FROM public.sys_dict WHERE dict_type='PKG_HISTORY_POLICY' AND status='ACTIVE';`);policy=flags(rows);}
 console.log(JSON.stringify({stage:'FLAGS',...policy}));
 if(!['no_config','valid_all_off'].includes(policy.state))fail('FLAGS','NOT_ALL_OFF');
 const candidate=JSON.parse(fs.readFileSync(path.join(__dirname,'packaging-metadata-manifest.json'),'utf8'));
 const checkout=manifest(path.resolve('apps/api/src/database/migrations'));
 const applied=query('SELECT to_json(name) FROM public.migrations ORDER BY name;');
 if(applied.some(n=>typeof n!=='string'||!/^\w+$/.test(n)))fail('MIGRATIONS','INVALID_NAME');
 const pending=candidate.filter(e=>!applied.includes(e.name)).map(e=>e.name);
 return {state:'METADATA_COLLECTED',auditObject:'deployed-baseline-only',expectedDeploySHA:BASELINE,sourceBundleCommit:env.BUNDLE_SOURCE_COMMIT,actualSHA:actual,dirty:Boolean(dirty),dirtyCount:dirtyLines.length,dirtyEntries,
  images,pgMajor:16,backup,capacity,policy,pending,checkoutPending:checkout.filter(e=>!applied.includes(e.name)).map(e=>e.name),
  appliedOutsideCandidate:applied.filter(n=>!candidate.some(e=>e.name===n)),candidateManifestSHA256:hash(JSON.stringify(candidate))};
}
module.exports={BASELINE,flags,manifest,backupMetadata,regular,validate,main,run,classifyDbFailure};
if(require.main===module){try{
 if(process.argv[2]==='--manifest')console.log(JSON.stringify(manifest(process.argv[3]),null,2));
 else console.log(JSON.stringify(main()));
}catch(e){console.log(JSON.stringify({state:'FAIL',stage:e.stage||'METADATA',class:e.klass||'UNAVAILABLE',exit:e.exit||2,...(e.detail?{detail:e.detail}:{})}));process.exitCode=e.exit||2;}}
