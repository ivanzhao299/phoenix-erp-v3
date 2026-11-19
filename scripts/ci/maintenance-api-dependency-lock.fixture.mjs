/** Conservative archive-build compatibility check. Lock equality is necessary
 * evidence for this fixture, never proof of installed bytes or native ABI. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&Object.getPrototypeOf(item)===Object.prototype
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
export function verifyArchivedApiDependencyLock({previousLock,currentLock,previousManifest,currentManifest}){
  assert.equal(previousManifest,currentManifest,'ARCHIVED_API_MANIFEST_CHANGED');
  const previous=yaml.load(previousLock),current=yaml.load(currentLock);
  assert.equal(String(previous?.lockfileVersion),'9.0');assert.equal(String(current?.lockfileVersion),'9.0');
  const api=previous.importers?.['apps/api'];assert.ok(api&&Object.getPrototypeOf(api)===Object.prototype);
  assert.equal(canonical(api),canonical(current.importers?.['apps/api']),'ARCHIVED_API_IMPORTER_CHANGED');
  for(const kind of ['dependencies','devDependencies','optionalDependencies'])for(const value of Object.values(api[kind]??{})){
    assert.ok(value&&typeof value.version==='string'&&!/^(?:link|file|workspace|https?):/.test(value.version),'ARCHIVED_API_NONREGISTRY_DEPENDENCY');
  }
  // Stronger than comparing just API's transitive closure: require every
  // resolution/snapshot/settings map unchanged. Changes to other importers
  // alone cannot select different dependencies for this archived API build.
  const resolved=Object.fromEntries(Object.entries(previous).filter(([key])=>key!=='importers'));
  const currentResolved=Object.fromEntries(Object.entries(current).filter(([key])=>key!=='importers'));
  assert.ok(resolved.packages&&resolved.snapshots);
  assert.equal(canonical(resolved),canonical(currentResolved),'ARCHIVED_API_RESOLUTIONS_CHANGED');
  return {schema:'phoenix.archived-api-lock-equivalence/v1',fixtureOnly:true,productionAuthority:false,
    manifestSha256:createHash('sha256').update(previousManifest).digest('hex'),apiImporterSha256:digest(api),
    allResolutionMapsSha256:digest(resolved),packages:Object.keys(resolved.packages).length,
    snapshots:Object.keys(resolved.snapshots).length,installedBytesVerified:false,nativeAbiVerified:false};
}

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertUnreplacedArchiveStore,readUnreplacedGit} from './maintenance-archived-source.fixture.mjs';
const blobSha=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function archivedDependencyInputs({root,revision}) {
  assert.match(revision,/^[a-f0-9]{40}$/);assertUnreplacedArchiveStore(root);
  const read=relative=>{
    const tree=readUnreplacedGit(root,['ls-tree','-r',revision,'--',relative]).trim();
    assert.match(tree,/^100(?:644|755) blob [a-f0-9]{40}\t/,'ARCHIVED_DEPENDENCY_REGULAR_BLOB_REQUIRED');
    assert.equal(tree.split('\n').length,1);assert.equal(tree.split('\t')[1],relative);
    const bytes=readUnreplacedGit(root,['show',`${revision}:${relative}`],{binary:true});
    assert.equal(blobSha(bytes),tree.split(' ')[2].split('\t')[0]);return bytes;
  };
  const files=new Map(['package.json','pnpm-lock.yaml','pnpm-workspace.yaml'].map(relative=>[relative,read(relative)]));
  const lock=yaml.load(files.get('pnpm-lock.yaml').toString());
  assert.equal(String(lock?.lockfileVersion),'9.0');assert.ok(lock.importers?.['apps/api']);
  for(const importer of Object.keys(lock.importers)) {
    assert.ok(importer==='.'||/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(importer)&&path.posix.normalize(importer)===importer&&!importer.split('/').includes('..'),'ARCHIVED_IMPORTER_PATH_REQUIRED');
    const file=importer==='.'?'package.json':`${importer}/package.json`;
    if(!files.has(file))files.set(file,read(file));
  }
  const manifest=JSON.parse(files.get('apps/api/package.json'));
  assert.equal(manifest.name,'phoenix-erp-v3-nest');
  for(const kind of ['dependencies','devDependencies','optionalDependencies']) {
    const declared=manifest[kind]??{},imported=lock.importers['apps/api'][kind]??{};
    assert.deepEqual(Object.keys(declared).sort(),Object.keys(imported).sort(),'ARCHIVED_MANIFEST_IMPORTER_NAMES');
    for(const [name,specifier]of Object.entries(declared))assert.equal(imported[name].specifier,specifier,'ARCHIVED_MANIFEST_IMPORTER_SPECIFIER');
  }
  // Reuse checks stay strict. This new route installs the archive's own frozen
  // inputs, rather than declaring different current dependencies equivalent.
  verifyArchivedApiDependencyLock({previousLock:files.get('pnpm-lock.yaml').toString(),currentLock:files.get('pnpm-lock.yaml').toString(),
    previousManifest:files.get('apps/api/package.json').toString(),currentManifest:files.get('apps/api/package.json').toString()});
  return files;
}
export function installArchivedApiDependencies({root,revision,directory}) {
  assert.equal(Number(process.versions.node.split('.')[0]),20,'ARCHIVED_BUILD_NODE20_REQUIRED');
  assert.equal(fs.realpathSync(root),root);assert.equal(path.resolve(directory),directory);
  assert.ok(directory.startsWith(path.join(root,'artifacts')+path.sep)&&!fs.existsSync(directory),'ARCHIVED_PRIVATE_INSTALL_DIRECTORY_REQUIRED');
  const files=archivedDependencyInputs({root,revision});
  fs.mkdirSync(directory,{recursive:true,mode:0o700});assert.equal(fs.realpathSync(directory),directory);
  for(const [relative,bytes]of files){const file=path.join(directory,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{mode:0o644,flag:'wx'});}
  const privateDirectory=path.join(directory,'.fixture-install');fs.mkdirSync(privateDirectory,{mode:0o700});
  const emptyConfig=path.join(privateDirectory,'empty.npmrc');fs.writeFileSync(emptyConfig,'',{mode:0o600,flag:'wx'});
  // Install lifecycle code has no host FD9, Docker socket, root UID or other
  // fixture state. Only this new directory crosses the Docker boundary.
  const uid=process.getuid()===0?65534:process.getuid(),gid=process.getuid()===0?65534:process.getgid();
  if(process.getuid()===0){
    const own=dir=>{for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),stat=fs.lstatSync(file);assert.equal(stat.isSymbolicLink(),false);if(stat.isDirectory())own(file);fs.chownSync(file,uid,gid);}fs.chownSync(dir,uid,gid);};own(directory);
  }
  const inside='/install/.fixture-install';
  const env={PATH:'/usr/local/bin:/usr/bin:/bin',CI:'true',COREPACK_ENABLE_AUTO_PIN:'0',COREPACK_ENABLE_DOWNLOAD_PROMPT:'0',
    NPM_CONFIG_USERCONFIG:inside+'/empty.npmrc',NPM_CONFIG_GLOBALCONFIG:inside+'/empty.npmrc',NPM_CONFIG_CACHE:inside+'/npm-cache',
    npm_config_devdir:inside+'/node-gyp',XDG_CONFIG_HOME:inside+'/config',XDG_CACHE_HOME:inside+'/cache',PNPM_HOME:inside+'/pnpm',COREPACK_HOME:inside+'/corepack'};
  for(const key of ['HTTPS_PROXY','HTTP_PROXY','NO_PROXY','https_proxy','http_proxy','no_proxy'])if(process.env[key])env[key]=process.env[key];
  const docker=args=>execFileSync('/usr/bin/docker',args,{env:{PATH:process.env.PATH,DOCKER_HOST:'unix:///var/run/docker.sock'},encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
  const imageId=docker(['image','inspect','node:20-bookworm-slim','--format','{{.Id}}']);assert.match(imageId,/^sha256:[a-f0-9]{64}$/);
  const program=`const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
    assert.notEqual(process.getuid(),0);assert.equal(fs.existsSync('/var/run/docker.sock'),false);assert.equal(fs.existsSync('/var/lib/phoenix-erp'),false);
    const options={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:540000,maxBuffer:16*1024*1024};
    const version=execFileSync('corepack',['pnpm@9.15.9','--version'],options).trim();assert.equal(version,'9.15.9');
    execFileSync('corepack',['pnpm@9.15.9','install','--frozen-lockfile','--filter','phoenix-erp-v3-nest...','--ignore-pnpmfile','--store-dir','/install/.fixture-install/store','--package-import-method=copy'],options);
    console.log('ARCHIVED_INSTALL_ISOLATED_OK');`;
  const owner='archived-'+sha(directory).slice(0,20);
  const containerId=docker(['create','--pull=never','--label',`phoenix.test.owner=${owner}`,'--label','phoenix.test.kind=maintenance-archive-dependencies',
    '--network=bridge','--restart=no','--read-only','--user',`${uid}:${gid}`,'--cap-drop=ALL','--security-opt=no-new-privileges',
    '--tmpfs','/tmp:rw,nosuid,nodev,size=134217728,mode=1777','--mount',`type=bind,source=${directory},target=/install`,'--workdir','/install',
    ...Object.entries(env).flatMap(([key,value])=>['-e',`${key}=${value}`]),imageId,'node','-e',program]);
  assert.match(containerId,/^[a-f0-9]{64}$/);
  // Keep the owned container for inspection. A failed install is never retried
  // with alternate dependencies or scripts disabled.
  const output=docker(['start','-a',containerId]);
  const meta=JSON.parse(docker(['inspect',containerId,'--format','{{json .}}']));
  assert.equal(meta.State.ExitCode,0);assert.equal(meta.State.Running,false);assert.equal(meta.Image,imageId);
  assert.equal(meta.Config.User,`${uid}:${gid}`);assert.equal(meta.HostConfig.Privileged,false);assert.equal(meta.HostConfig.ReadonlyRootfs,true);
  assert.deepEqual(meta.HostConfig.CapDrop,['ALL']);assert.ok(meta.HostConfig.SecurityOpt.includes('no-new-privileges'));
  assert.equal(meta.Mounts.length,1);assert.equal(meta.Mounts[0].Source,directory);assert.equal(meta.Mounts[0].Destination,'/install');assert.equal(meta.Mounts[0].RW,true);
  assert.ok(output.includes('ARCHIVED_INSTALL_ISOLATED_OK'));const pnpmVersion='9.15.9';
  const installer={containerId,imageId,owner,kind:'maintenance-archive-dependencies',user:meta.Config.User,root:false,hostFd9:false,dockerSocket:false,onlyInstallDirectoryMounted:true,productionAuthority:false};
  for(const [relative,bytes]of files){
    let cursor=directory;for(const part of relative.split('/')){cursor=path.join(cursor,part);assert.equal(fs.lstatSync(cursor).isSymbolicLink(),false,'ARCHIVED_FROZEN_INPUT_SYMLINK');}
    const file=path.join(directory,relative),stat=fs.lstatSync(file);assert.ok(stat.isFile()&&stat.nlink===1);assert.ok(fs.readFileSync(file).equals(bytes),'ARCHIVED_FROZEN_INPUT_CHANGED');
  }
  const apiRoot=path.join(directory,'apps/api');
  assert.ok(fs.realpathSync(path.join(apiRoot,'node_modules')).startsWith(directory+path.sep),'ARCHIVED_INSTALL_ESCAPED');
  const receipt={schema:'phoenix.archived-api-frozen-install/v1',fixtureOnly:true,productionAuthority:false,revision,pnpmVersion,installer,
    packageBlob:blobSha(files.get('apps/api/package.json')),lockBlob:blobSha(files.get('pnpm-lock.yaml')),
    lockSha256:sha(files.get('pnpm-lock.yaml')),inputs:[...files].map(([relative,bytes])=>({relative,sha256:sha(bytes)})),
    frozenInputsUnchanged:true,independentInstall:true,installScriptsEnabled:true,installedBytesVerified:false,nativeAbiVerified:false};
  fs.writeFileSync(directory+'.receipt.json',JSON.stringify(receipt,null,2),{mode:0o600,flag:'wx'});
  return {apiRoot,receipt};
}

/** Archive-installed JavaScript, including tsc, is never run by the host. */
export function compileArchivedApi({source,dependencyApi,destination,receipt}) {
  const dependencies=path.resolve(dependencyApi,'../..');
  for(const directory of [source,dependencies])assert.equal(fs.realpathSync(directory),directory);
  assert.equal(fs.existsSync(destination),false);fs.mkdirSync(destination,{mode:0o755});
  const user=receipt.installer.user;assert.match(user,/^[1-9][0-9]*:[0-9]+$/);
  const [uid,gid]=user.split(':').map(Number);if(process.getuid()===0)fs.chownSync(destination,uid,gid);
  const link=path.join(source,'apps/api/node_modules');assert.equal(fs.existsSync(link),false);
  fs.symlinkSync('/install/apps/api/node_modules',link);
  const readable=directory=>{for(const name of fs.readdirSync(directory)){const file=path.join(directory,name),stat=fs.lstatSync(file);if(stat.isSymbolicLink()){assert.equal(file,link);continue;}if(stat.isDirectory())readable(file);else{assert.ok(stat.isFile()&&stat.nlink===1);fs.chmodSync(file,(stat.mode&0o111)?0o755:0o644);}}fs.chmodSync(directory,0o755);};readable(source);
  const docker=args=>execFileSync('/usr/bin/docker',args,{env:{PATH:process.env.PATH,DOCKER_HOST:'unix:///var/run/docker.sock'},encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
  const imageId=receipt.installer.imageId;assert.match(imageId,/^sha256:[a-f0-9]{64}$/);
  const owner='archived-compile-'+sha(destination).slice(0,20);
  const id=docker(['create','--pull=never','--label',`phoenix.test.owner=${owner}`,'--label','phoenix.test.kind=maintenance-archive-compiler',
    '--network=none','--restart=no','--read-only','--user',user,'--cap-drop=ALL','--security-opt=no-new-privileges',
    '--mount',`type=bind,source=${source},target=/source,readonly`,'--mount',`type=bind,source=${dependencies},target=/install,readonly`,
    '--mount',`type=bind,source=${destination},target=/out`,'--workdir','/source/apps/api',imageId,'node',
    '/install/apps/api/node_modules/typescript/bin/tsc','-p','/source/apps/api/tsconfig.build.json','--outDir','/out','--rootDir','/source/apps/api/src','--incremental','false','--listFiles']);
  assert.match(id,/^[a-f0-9]{64}$/);
  let output;try{output=docker(['start','-a',id]);}finally{fs.unlinkSync(link);}
  const meta=JSON.parse(docker(['inspect',id,'--format','{{json .}}']));
  assert.equal(meta.State.ExitCode,0);assert.equal(meta.State.Running,false);assert.equal(meta.Image,imageId);assert.equal(meta.Config.User,user);
  assert.equal(meta.HostConfig.NetworkMode,'none');assert.equal(meta.HostConfig.Privileged,false);assert.equal(meta.HostConfig.ReadonlyRootfs,true);
  assert.deepEqual(meta.HostConfig.CapDrop,['ALL']);assert.ok(meta.HostConfig.SecurityOpt.includes('no-new-privileges'));assert.equal(meta.Mounts.length,3);
  for(const [from,to,rw]of [[source,'/source',false],[dependencies,'/install',false],[destination,'/out',true]])assert.equal(meta.Mounts.filter(m=>m.Type==='bind'&&m.Source===from&&m.Destination===to&&m.RW===rw).length,1);
  const files=output.split('\n').filter(file=>path.posix.isAbsolute(file));assert.ok(files.length>0,'ARCHIVED_COMPILER_FILES_REQUIRED');
  for(const file of files){
    const mapping=[['/source',source],['/install',dependencies]].find(([prefix])=>file.startsWith(prefix+'/'));
    assert.ok(mapping,'ARCHIVED_COMPILER_DEPENDENCY_ESCAPE');const [prefix,root]=mapping,actual=fs.realpathSync(path.join(root,file.slice(prefix.length)));
    assert.ok(actual.startsWith(root+path.sep),'ARCHIVED_COMPILER_DEPENDENCY_ESCAPE');
  }
  let emittedFiles=0;
  const inspect=directory=>{assert.equal(fs.realpathSync(directory),directory);for(const name of fs.readdirSync(directory)){const file=path.join(directory,name),stat=fs.lstatSync(file);assert.equal(stat.isSymbolicLink(),false,'ARCHIVED_COMPILER_OUTPUT_SYMLINK');if(stat.isDirectory())inspect(file);else{assert.ok(stat.isFile()&&stat.nlink===1,'ARCHIVED_COMPILER_OUTPUT_REGULAR_FILE');emittedFiles++;fs.chmodSync(file,0o644);}}fs.chmodSync(directory,0o755);};inspect(destination);assert.ok(emittedFiles>0);
  const proof={containerId:id,imageId,owner,kind:'maintenance-archive-compiler',user,network:'none',root:false,hostFd9:false,dockerSocket:false,sourceReadOnly:true,dependenciesReadOnly:true,compilerFiles:files.length,emittedFiles,productionAuthority:false};
  fs.writeFileSync(destination+'.receipt.json',JSON.stringify(proof,null,2),{mode:0o600,flag:'wx'});return proof;
}
