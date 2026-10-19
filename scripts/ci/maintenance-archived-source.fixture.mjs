/** Read-only archive identity checks for isolated image builds. No runtime,
 * authority or production recovery claim is created by these checks. */
import fs from 'node:fs';import path from 'node:path';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export function readUnreplacedGit(root,args,{binary=false,maxBuffer=32*1024*1024}={}){
 const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
 const paths=values=>values.length>0&&values.every(v=>typeof v==='string'&&/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(v)&&!v.split('/').includes('..')&&path.posix.normalize(v)===v);
 const selected=JSON.stringify(args);
 const allowed=selected===JSON.stringify(['rev-parse','HEAD'])
  ||selected===JSON.stringify(['rev-parse','--path-format=absolute','--git-common-dir'])
  ||selected===JSON.stringify(['for-each-ref','--format=%(refname)','refs/replace/'])
  ||selected===JSON.stringify(['config','--null','--name-only','--list'])
  ||args.length===2&&args[0]==='show'&&sha(args[1].split(':')[0])&&paths([args[1].slice(41)])
  ||args.length===4&&args[0]==='merge-base'&&args[1]==='--is-ancestor'&&sha(args[2])&&sha(args[3])
  ||args[0]==='archive'&&args[1]==='--format=tar'&&sha(args[2])&&paths(args.slice(3))
  ||args[0]==='diff'&&args[1]==='--quiet'&&args[2]==='HEAD'&&args[3]==='--'&&paths(args.slice(4))
  ||args[0]==='ls-tree'&&args[1]==='-r'&&(sha(args[2])&&args[3]==='--'&&paths(args.slice(4))||args[2]==='-z'&&sha(args[3])&&args[4]==='--'&&paths(args.slice(5)));
 assert.ok(allowed,'ARCHIVE_FIXED_READ_COMMAND_REQUIRED');
 assert.ok(Number.isInteger(maxBuffer)&&maxBuffer>0&&maxBuffer<=32*1024*1024);
 return execFileSync('/usr/bin/git',['--no-replace-objects','--no-optional-locks','-c',`safe.directory=${root}`,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',...args],{
  cwd:root,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'},
  ...(binary?{}:{encoding:'utf8'}),timeout:30000,maxBuffer,stdio:['ignore','pipe','pipe']});
}
export function assertUnreplacedArchiveStore(root){
 assert.equal(fs.realpathSync(root),root);
 const common=readUnreplacedGit(root,['rev-parse','--path-format=absolute','--git-common-dir']).trim();
 assert.equal(fs.realpathSync(common),common);
 for(const name of ['info/grafts','objects/info/alternates','objects/info/http-alternates'])assert.equal(fs.existsSync(path.join(common,name)),false,'ARCHIVE_OBJECT_STORE_UNSUPPORTED');
 assert.equal(readUnreplacedGit(root,['for-each-ref','--format=%(refname)','refs/replace/']).trim(),'','ARCHIVE_REPLACE_REF_UNSUPPORTED');
 const keys=readUnreplacedGit(root,['config','--null','--name-only','--list']).split('\0').filter(Boolean);
 assert.ok(!keys.some(k=>/^(?:filter\.|tar\..*\.command$|extensions\.partialclone$|remote\..*\.(?:promisor|partialclonefilter)$)/i.test(k)),'ARCHIVE_EXECUTABLE_OR_LAZY_CONFIG_UNSUPPORTED');
 return {commonDirectory:common,replacements:false,grafts:false,externalObjectStores:false};
}
export function verifyExtractedGitTree(root,revision,selected,directory){
 assert.match(revision,/^[a-f0-9]{40}$/);assertUnreplacedArchiveStore(root);
 assert.equal(fs.realpathSync(directory),directory);
 const entries=readUnreplacedGit(root,['ls-tree','-r','-z',revision,'--',...selected]).split('\0').filter(Boolean);
 const expected=new Set();const manifest=[];
 for(const entry of entries){
  const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);assert.ok(match,'ARCHIVE_REGULAR_BLOB_REQUIRED');
  const [,mode,blob,relative]=match;assert.ok(!path.isAbsolute(relative)&&path.posix.normalize(relative)===relative&&!relative.split('/').includes('..'));
  const file=path.join(directory,relative),stat=fs.lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);
  assert.equal(fs.realpathSync(file),file);
  const pin=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeMs,s.ctimeMs];
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let bytes;
  try{assert.deepEqual(pin(fs.fstatSync(fd)),pin(stat));bytes=fs.readFileSync(fd);assert.deepEqual(pin(fs.fstatSync(fd)),pin(stat));}finally{fs.closeSync(fd);}
  assert.deepEqual(pin(fs.lstatSync(file)),pin(stat));assert.equal(fs.realpathSync(file),file);
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),blob,'ARCHIVE_BLOB_BYTES_MISMATCH');
  assert.ok(!expected.has(relative));expected.add(relative);manifest.push({relative,mode,blob,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 const walk=dir=>{for(const name of fs.readdirSync(dir)){
  const file=path.join(dir,name),stat=fs.lstatSync(file);assert.equal(stat.isSymbolicLink(),false);
  if(stat.isDirectory())walk(file);else assert.ok(expected.delete(path.relative(directory,file)),'ARCHIVE_EXTRA_FILE');
 }};
 walk(directory);assert.equal(expected.size,0);assert.ok(manifest.length>0);
 return {schema:'phoenix.extracted-archive-identity/v1',files:manifest.length,
  manifestSha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),everyBlobVerified:true,fixtureOnly:true,productionAuthority:false};
}
