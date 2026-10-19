/** Real local Linux flock/OFD tests; not a production/trusted-root receipt. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const helper=new URL('./production-trusted-paths.mjs',import.meta.url).href;
const program=`import {assertWorkflowFd9Lock} from ${JSON.stringify(helper)};
try{assertWorkflowFd9Lock(process.argv[1],process.ppid);process.stdout.write('EXACT_ORIGINAL_OFD_LOCK_VERIFIED');}
catch(e){process.stdout.write(e.message);process.exitCode=42;}`;
function run(body){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-fd9-native-')),file=path.join(directory,'mutation.lock');fs.writeFileSync(file,'',{mode:0o600});
 try{return spawnSync('/bin/bash',['-c','set -euo pipefail\n'+body+'\nresult=$?\nexit "$result"','owned-fd9-test',process.execPath,program,file],{encoding:'utf8',timeout:8000});}
 finally{fs.rmSync(directory,{recursive:true});}}
test('actual original FD9 flock is verified through fdinfo, despite Node self fd9 reuse',()=>{
 const r=run('exec 9<>"$3"\nflock -n 9\n"$1" --input-type=module -e "$2" "$3"');assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'EXACT_ORIGINAL_OFD_LOCK_VERIFIED');
});
test('open FD9 without any flock is refused',()=>{
 const r=run('exec 9<>"$3"\n"$1" --input-type=module -e "$2" "$3"');assert.equal(r.status,42,r.stderr);assert.match(r.stdout,/WORKFLOW_FD9_NOT_LOCK_OWNER/);
});
test('original shell releases while another run owns same inode: old FD9 still refuses',()=>{
 const r=run(`exec 9<>"$3"
flock -n 9
flock -u 9
flock -x "$3" /bin/bash -c 'printf ready >"$1"; sleep 2' owned-lock "$3.ready" &
other=$!
for n in {1..200}; do test ! -e "$3.ready" || break; sleep 0.005; done
test -e "$3.ready"
set +e
"$1" --input-type=module -e "$2" "$3"
result=$?
wait "$other"
exit "$result"`);
 assert.equal(r.status,42,r.stderr);assert.match(r.stdout,/WORKFLOW_FD9_NOT_LOCK_OWNER/);
});
test('a different inode held by original FD9 is refused',()=>{
 const r=run('touch "$3.other"\nchmod 600 "$3.other"\nexec 9<>"$3.other"\nflock -n 9\n"$1" --input-type=module -e "$2" "$3"');assert.equal(r.status,42,r.stderr);assert.match(r.stdout,/HOST_LOCK_REQUIRED/);
});
