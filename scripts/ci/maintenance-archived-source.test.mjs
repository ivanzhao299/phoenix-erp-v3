import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {assertUnreplacedArchiveStore,readUnreplacedGit,verifyExtractedGitTree} from './maintenance-archived-source.fixture.mjs';
const artifacts=fileURLToPath(new URL('../../artifacts/maintenance-archive-counterexamples/',import.meta.url));
test('archive helper rejects writes, external archive and path escape before spawning',()=>{
 for(const args of [['push','origin','main'],['config','tar.fixture.command','NEVER_EXECUTE'],['archive','--remote=ssh://example.invalid/repo','HEAD'],['show','a'.repeat(40)+':../private'],['ls-tree','-r','HEAD']])
  assert.throws(()=>readUnreplacedGit('/unavailable-fixture-path',args),/FIXED_READ_COMMAND_REQUIRED/);
});
function fixture(){
 const root=path.join(artifacts,randomUUID());fs.mkdirSync(root,{recursive:true,mode:0o700});
 const git=args=>execFileSync('/usr/bin/git',['-C',root,'-c','core.hooksPath=/dev/null','-c','user.name=Owned Archive Fixture','-c','user.email=fixture@example.invalid',...args],{env:{PATH:'/usr/bin:/bin',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','-b','main']);fs.writeFileSync(path.join(root,'source.txt'),'EXACT_ORIGINAL_SOURCE\n');git(['add','source.txt']);git(['commit','-m','owned original']);const first=git(['rev-parse','HEAD']);
 fs.writeFileSync(path.join(root,'source.txt'),'DIFFERENT_REPLACEMENT_SOURCE\n');git(['add','source.txt']);git(['commit','-m','owned changed']);const second=git(['rev-parse','HEAD']);
 return {root,git,first,second};
}
test('actual local replace-ref cannot relabel different source as an allowed old commit',()=>{
 const f=fixture();f.git(['replace',f.first,f.second]);
 assert.equal(f.git(['show',f.first+':source.txt']),'DIFFERENT_REPLACEMENT_SOURCE');
 assert.equal(readUnreplacedGit(f.root,['show',f.first+':source.txt']).trim(),'EXACT_ORIGINAL_SOURCE');
 assert.throws(()=>assertUnreplacedArchiveStore(f.root),/REPLACE_REF_UNSUPPORTED/);
});
test('grafts and executable archive/filter configuration are independently rejected',()=>{
 for(const kind of ['graft','filter','tar']){
  const f=fixture();if(kind==='graft')fs.writeFileSync(path.join(f.root,'.git/info/grafts'),f.second+'\n');
  else f.git(['config',kind==='filter'?'filter.fixture.clean':'tar.fixture.command','NEVER_EXECUTE_FIXTURE']);
  assert.throws(()=>assertUnreplacedArchiveStore(f.root),/UNSUPPORTED/);
 }
});
test('actual extracted bytes must match the original object and no extra file may hide in the source tree',()=>{
 const f=fixture(),out=path.join(f.root,'extracted');fs.mkdirSync(out);
 const bytes=readUnreplacedGit(f.root,['archive','--format=tar',f.first,'source.txt'],{binary:true});
 execFileSync('/usr/bin/tar',['-x','-C',out],{input:bytes,stdio:['pipe','pipe','pipe']});
 assert.equal(verifyExtractedGitTree(f.root,f.first,['source.txt'],out).everyBlobVerified,true);
 fs.writeFileSync(path.join(out,'source.txt'),'DIFFERENT_REPLACEMENT_SOURCE\n');assert.throws(()=>verifyExtractedGitTree(f.root,f.first,['source.txt'],out),/BLOB_BYTES_MISMATCH/);
 fs.writeFileSync(path.join(out,'source.txt'),'EXACT_ORIGINAL_SOURCE\n');fs.writeFileSync(path.join(out,'extra.txt'),'EXTRA');assert.throws(()=>verifyExtractedGitTree(f.root,f.first,['source.txt'],out),/EXTRA_FILE/);
});
