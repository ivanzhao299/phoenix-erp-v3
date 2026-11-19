/** Original ChildProcess handles, never name/PPID-only exemptions. */
import fs from 'node:fs';import {ChildProcess} from 'node:child_process';import {createHash} from 'node:crypto';
import {readLinuxProcessIdentity} from './production-modern-schema-session-lease.mjs';
const fail=()=>{throw Error('MODERN_SCHEMA_EXECUTORS_HOLD=ORIGINAL_CONTROL_CHILD_UNPROVED');};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function pinModernSchemaChild(child){
 if(!(child instanceof ChildProcess)||!Number.isSafeInteger(child.pid)||child.pid<2||child.exitCode!==null||child.signalCode!==null)fail();
 const identity=readLinuxProcessIdentity(child.pid),base=`/proc/${child.pid}`;
 if(identity.parentPid!==process.pid)fail();
 const argv=fs.readFileSync(base+'/cmdline');if(!Array.isArray(child.spawnargs)||hash(argv)!==hash(Buffer.from(child.spawnargs.join('\0')+'\0')))fail();
 const pin={...identity,exe:fs.readlinkSync(base+'/exe'),argvSha256:hash(argv),cwdSha256:hash(fs.readlinkSync(base+'/cwd')),pidNamespace:fs.readlinkSync(base+'/ns/pid')};
 if(readLinuxProcessIdentity(child.pid).startTicks!==pin.startTicks)fail();return {child,pin};
}
export function verifyModernSchemaChild(entry,observation){
 if(!(entry?.child instanceof ChildProcess)||entry.child.pid!==entry.pin?.pid||entry.child.exitCode!==null||entry.child.signalCode!==null)fail();
 const p=entry.pin;
 if(observation.pid!==p.pid||observation.ppid!==p.parentPid||observation.startTicks!==p.startTicks||observation.exe!==p.exe
  ||observation.argvSha256!==p.argvSha256||observation.cwdSha256!==p.cwdSha256||observation.pidNamespace!==p.pidNamespace)fail();return true;
}
