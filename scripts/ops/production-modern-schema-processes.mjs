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
/** A terminal kernel task cannot execute, even before Node consumes SIGCHLD.
 * This is not a successful command result or a remote executor stop proof. */
export function isOriginalModernSchemaChildTerminal(entry){
 if(!(entry?.child instanceof ChildProcess)||entry.child.pid!==entry.pin?.pid||entry.pin.parentPid!==process.pid)return false;
 const pin=entry.pin,base=`/proc/${pin.pid}`;
 const sample=()=>{
  const raw=fs.readFileSync(base+'/stat','utf8'),end=raw.lastIndexOf(')'),fields=raw.slice(end+2).trim().split(/\s+/);
  if(end<1||Number(raw.slice(0,raw.indexOf(' ')))!==pin.pid||Number(fields[1])!==pin.parentPid
   ||fields[19]!==pin.startTicks||!['Z','X','x'].includes(fields[0])||Number(fields[17])!==1
   ||fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()!==pin.bootId
   ||fs.readlinkSync(base+'/ns/pid')!==pin.pidNamespace)return false;
  return true;
 };
 try{return sample()&&sample();}catch{return false;}
}
