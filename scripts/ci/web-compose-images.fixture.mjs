/** Build two genuine Web-only source bundles for isolated protocol fixtures.
 * No API source, credentials, production paths or registry uploads are staged. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const BEFORE='9155dcccd7578288a2ccedc9f2ec3f0dd0bf1f7e',SHA=/^[a-f0-9]{40}$/;
const selected=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','apps/web'];
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function cleanBuildEnv(sha){
  const env={PATH:process.env.PATH,CI:'1',GITHUB_SHA:sha,NEXT_TELEMETRY_DISABLED:'1',NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS:'1',API_TARGET:'http://127.0.0.1:3100'};
  for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'])if(process.env[key])env[key]=process.env[key];
  return env;
}
function git(root,args,encoding='utf8'){
  return execFileSync('/usr/bin/git',['-C',root,...args],{encoding,timeout:30000,maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
}
function pnpmCommand(args){return process.env.PNPM_JS?[process.execPath,[path.resolve(process.env.PNPM_JS),...args]]:['pnpm',args];}
function logged(command,args,{cwd,env,file,timeout}){
  const fd=fs.openSync(file,'wx',0o600);try{execFileSync(command,args,{cwd,env,timeout,maxBuffer:65536,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
}
export async function buildWebComposeImages({root=process.cwd(),targetSha}={}){
  if(process.versions.node.split('.')[0]!=='20')throw Error('WEB_COMPOSE_NODE20_REQUIRED');
  root=path.resolve(root);targetSha??=git(root,['rev-parse','HEAD']).trim();if(!SHA.test(targetSha)||targetSha===BEFORE)throw Error('WEB_COMPOSE_DISTINCT_EXACT_SOURCE_REQUIRED');
  for(const sha of [BEFORE,targetSha])if(git(root,['rev-parse',sha+'^{commit}']).trim()!==sha)throw Error('WEB_COMPOSE_COMMIT_UNVERIFIED');
  git(root,['merge-base','--is-ancestor',BEFORE,targetSha]);
  const owner=randomUUID(),directory=path.join(root,'artifacts/web-compose-image-builds',owner);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const result={schema:'phoenix.web-compose-source-build/v1',owner,targetSha,beforeSha:BEFORE,fixtureOnly:true,productionImage:false,registryUpload:false,builds:[],result:'BUILDING'};
  const save=()=>fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});save();
  let stage='SOURCE_EXPORT';
  try{
    for(const [role,sha] of [['before',BEFORE],['target',targetSha]]){
      stage='SOURCE_EXPORT';
      const base=path.join(directory,role),source=path.join(base,'source'),capsule=path.join(base,'capsule');fs.mkdirSync(source,{recursive:true,mode:0o700});fs.mkdirSync(capsule,{mode:0o700});
      const entries=git(root,['ls-tree','-r',sha,'--',...selected]).trim().split('\n').filter(Boolean);
      for(const entry of entries){const match=/^(100644|100755) blob [a-f0-9]{40}\t(.+)$/.exec(entry);if(!match||match[2].split('/').some(part=>part==='..')||/(^|\/)\.env(?:$|\.(?!example$))/.test(match[2]))throw Error('WEB_COMPOSE_ARCHIVE_PATH_UNSAFE');}
      const archive=git(root,['archive','--format=tar',sha,'--',...selected],null),tar=path.join(base,'source.tar');fs.writeFileSync(tar,archive,{mode:0o600,flag:'wx'});
      execFileSync('/usr/bin/tar',['-xf',tar,'--no-same-owner','--no-same-permissions','-C',source],{timeout:30000,stdio:['ignore','pipe','pipe']});
      const env=cleanBuildEnv(sha),[pnpm,prefix]=pnpmCommand([]),version=execFileSync(pnpm,[...prefix,'--version'],{env,encoding:'utf8',timeout:10000}).trim();if(!/^9\./.test(version))throw Error('WEB_COMPOSE_PNPM9_REQUIRED');
      const locked=hash(path.join(source,'pnpm-lock.yaml'));
      stage='INSTALL';logged(pnpm,[...prefix,'install','--filter','web...','--frozen-lockfile','--ignore-scripts'],{cwd:source,env,file:path.join(base,'install.private.log'),timeout:180000});
      if(hash(path.join(source,'pnpm-lock.yaml'))!==locked)throw Error('WEB_COMPOSE_FROZEN_LOCK_CHANGED');
      stage='NEXT_BUILD';logged(pnpm,[...prefix,'--filter','web','build'],{cwd:source,env,file:path.join(base,'next-build.private.log'),timeout:240000});stage='COPY_CAPSULE';
      for(const [name,from] of [['standalone','apps/web/.next/standalone'],['static','apps/web/.next/static'],['public','apps/web/public']])fs.cpSync(path.join(source,from),path.join(capsule,name),{recursive:true,dereference:false,verbatimSymlinks:true,errorOnExist:true});
      for(const name of ['web-evidence-runtime.Dockerfile','web-evidence-runtime.fixture.mjs'])fs.copyFileSync(path.join(root,'scripts/ci',name),path.join(capsule,name));
      const danglingInternalSymlinks=[];stage='VERIFY_CAPSULE';
      function verify(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),stat=fs.lstatSync(file);if(stat.isSymbolicLink()){
        const lexical=path.resolve(path.dirname(file),fs.readlinkSync(file));if(!lexical.startsWith(capsule+path.sep))throw Error('WEB_COMPOSE_CAPSULE_SYMLINK_ESCAPE');
        try{if(!fs.realpathSync(file).startsWith(capsule+path.sep))throw Error('WEB_COMPOSE_CAPSULE_SYMLINK_ESCAPE');}catch(error){if(error.code!=='ENOENT')throw error;danglingInternalSymlinks.push(path.relative(capsule,file));if(danglingInternalSymlinks.length>16)throw Error('WEB_COMPOSE_CAPSULE_DANGLING_LIMIT');}
      }else if(stat.isDirectory())verify(file);else if(name.startsWith('.env'))throw Error('WEB_COMPOSE_CAPSULE_ENV_FILE');}}
      verify(capsule);
      const iid=path.join(base,'image.id'),args=['build','--network=none','--pull=false','--label','phoenix.fixture.owner='+owner,'--label','phoenix.fixture.role='+role,'--build-arg','GIT_SHA='+sha,'--iidfile',iid,'-f',path.join(capsule,'web-evidence-runtime.Dockerfile'),capsule];
      stage='DOCKER_BUILD';logged('/usr/bin/docker',args,{cwd:root,env:{PATH:process.env.PATH,DOCKER_HOST:'unix:///var/run/docker.sock'},file:path.join(base,'docker-build.private.log'),timeout:180000});stage='VERIFY_IMAGE';
      const imageId=fs.readFileSync(iid,'utf8').trim();if(!/^sha256:[a-f0-9]{64}$/.test(imageId))throw Error('WEB_COMPOSE_BUILD_IMAGE_ID');
      const labels=JSON.parse(execFileSync('/usr/bin/docker',['image','inspect',imageId,'--format','{{json .Config.Labels}}'],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,DOCKER_HOST:'unix:///var/run/docker.sock'}}));
      if(labels['org.opencontainers.image.revision']!==sha||labels['phoenix.fixture.owner']!==owner||labels['phoenix.fixture.role']!==role||labels['phoenix.fixture.kind']!=='erp-web-evidence')throw Error('WEB_COMPOSE_BUILD_IMAGE_LABELS');
      const provenance={schema:'phoenix.web-compose-image-provenance/v1',owner,role,sourceSha:sha,webTree:git(root,['rev-parse',sha+':apps/web']).trim(),lockfileSha256:locked,archiveSha256:hash(tar),sourceArchivePaths:selected,imageId,
        runtimeHelperSha256:hash(path.join(capsule,'web-evidence-runtime.fixture.mjs')),dockerfileSha256:hash(path.join(capsule,'web-evidence-runtime.Dockerfile')),generatedSwSha256:hash(path.join(capsule,'public/sw.js')),danglingInternalSymlinks,runtimeVerification:'REQUIRES_ACTUAL_COMPOSE_FIXTURE',nodeVersion:process.version,pnpmVersion:version,install:'frozen-lockfile --ignore-scripts; filtered Web workspace',build:'pnpm --filter web build',gitShaStamp:sha,fixtureOnly:true,productionDeploy:false,result:'PASS'};
      fs.writeFileSync(path.join(base,'provenance.json'),JSON.stringify(provenance,null,2)+'\n',{mode:0o600});result.builds.push(provenance);save();
    }
    if(result.builds.length!==2||result.builds[0].imageId===result.builds[1].imageId)throw Error('WEB_COMPOSE_TWO_DISTINCT_BUILDS_REQUIRED');result.result='PASS';save();return {directory,...result};
  }catch(error){result.result='FAIL';result.failure='ISOLATED_SOURCE_BUILD_FAILED';result.failureStage=stage;result.failureCode=/^WEB_COMPOSE_[A-Z0-9_]+$/.test(error.message)?error.message:['ENOENT','EEXIST','ENOSPC','EACCES','ETIMEDOUT'].includes(error.code)?error.code:'UNCLASSIFIED_BUILD_FAILURE';save();throw Error('WEB_COMPOSE_SOURCE_BUILD_FAILED; owned private build logs retained in '+directory);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.env.WEB_COMPOSE_BUILD_IMAGES!=='1')throw Error('WEB_COMPOSE_BUILD_OPT_IN_REQUIRED');
  const result=await buildWebComposeImages();console.log('WEB_COMPOSE_IMAGE_SUMMARY='+path.join(result.directory,'summary.json'));
}
