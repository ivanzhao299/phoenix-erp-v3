/** Synthetic wire/parser/transport-debt tests only. No actual Netlink socket,
 * packet filtering, multicast readiness, event-loss or continuity acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source=fileURLToPath(new URL('./maintenance-kernel-netlink.fixture.py',import.meta.url));
const owned='phoenix_fixture_'+'a'.repeat(32),readiness='phoenix_ready_'+'a'.repeat(32);
const little=os.endianness()==='LE';
const u16=(b,n,o)=>b[little?'writeUInt16LE':'writeUInt16BE'](n,o);
const u32=(b,n,o)=>b[little?'writeUInt32LE':'writeUInt32BE'](n,o);
function attr(kind,value){const size=value.length+4,b=Buffer.alloc((size+3)&~3);u16(b,size,0);u16(b,kind,2);value.copy(b,4);return b;}
function message(type,payload,{sequence=0,flags=0,port=1234}={}){const size=16+payload.length,b=Buffer.alloc((size+3)&~3);u32(b,size,0);u16(b,type,4);u16(b,flags,6);u32(b,sequence,8);u32(b,port,12);payload.copy(b,16);return b;}
const nf=Buffer.from([2,0,0,0]);
const table=(name=owned,operation=0)=>message((10<<8)|operation,Buffer.concat([nf,attr(1,Buffer.from(name+'\0'))]));
function generation(sequence=1,value=42){const n=Buffer.alloc(4);n.writeUInt32BE(value);return message((10<<8)|15,Buffer.concat([Buffer.alloc(4),attr(0x4001,n)]),{sequence});}
function ack(sequence=1,{requestSequence=sequence,requestPort=1234,requestType=(10<<8)|16,requestFlags=5,flags=0x100}={}){const p=Buffer.alloc(20);u32(p,20,4);u16(p,requestType,8);u16(p,requestFlags,10);u32(p,requestSequence,12);u32(p,requestPort,16);return message(2,p,{sequence,flags});}
const frame=(packet,group=0)=>({hex:packet.toString('hex'),group});
const program=String.raw`
import sys,json,importlib.util,os,time,errno
sys.dont_write_bytecode=True
s=importlib.util.spec_from_file_location('owned_netlink',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
v=json.load(sys.stdin)
try:
 if sys.argv[2]=='parse':
  out=m.parse_datagram(bytes.fromhex(v['hex']),v.get('sender',0),v.get('flags',0),v['owned'],v['readiness'],v.get('group',0))
 elif sys.argv[2]=='background-probe':
  class FakeSocket:
   def __init__(self):self.responses=v['frames'][:]
   def recvmsg(self,*args):
    if not self.responses:raise m.ObserverHold('SYNTHETIC_NO_MATCHING_REPLY')
    f=self.responses.pop(0);g=f['group'];return bytes.fromhex(f['hex']),[(270,3,m.struct.pack('=I',g))],0,(0,64 if g==7 else 0)
   def sendto(self,data,address):return len(data)
  o=object.__new__(m.OwnedNetlinkSocket);o.namespace=os.readlink('/proc/self/ns/net');o.owned_table=v['owned'];o.readiness_table=v['readiness']
  o.socket=FakeSocket();o.started=time.monotonic();o.sequence=0;o.frames=[];o.reported_index=0;o.chain='0'*64;o.failed=False;o.port_id=1234;o.last_generation=None
  m.select.select=lambda *args:([o.socket],[],[])
  o.receive();out=o.probe('a'*36)
 elif sys.argv[2]=='loss':
  class FakeSocket:
   def recvmsg(self,*args):raise OSError(errno.ENOBUFS,'SYNTHETIC_RECEIVE_LOSS')
  o=object.__new__(m.OwnedNetlinkSocket);o.namespace=os.readlink('/proc/self/ns/net');o.socket=FakeSocket();o.started=time.monotonic();o.failed=False
  try:o.receive()
  except m.ObserverHold as e:first=str(e)
  try:o.check()
  except m.ObserverHold as e:second=str(e)
  out={'first':first,'second':second,'failed':o.failed,'actualKernelOverflowTested':False}
 else:raise RuntimeError('FIXED_TEST_MODE')
 print(json.dumps({'ok':True,'value':out}))
except m.ObserverHold as e:print(json.dumps({'ok':False,'error':str(e)}))
`;
const run=(mode,value)=>JSON.parse(execFileSync('/usr/bin/python3',['-I','-c',program,source,mode],{
 input:JSON.stringify(value),env:{PATH:'/usr/bin:/bin'},encoding:'utf8',timeout:3000,maxBuffer:262144,stdio:['pipe','pipe','pipe']}));
const parse=(packet,extra={})=>run('parse',{hex:packet.toString('hex'),owned,readiness,...extra});

test('actual UAPI framing is classified without exporting foreign table names or payloads',()=>{
 const a=parse(table());assert.equal(a.ok,true);assert.equal(a.value[0].tableScope,'OWNED');
 assert.equal(parse(table(readiness)).value[0].tableScope,'READINESS');
 const foreign=parse(table('FOREIGN_METADATA_NOT_FOR_OUTPUT'));assert.equal(foreign.value[0].tableScope,'FOREIGN');
 assert.equal(JSON.stringify(foreign).includes('FOREIGN_METADATA_NOT_FOR_OUTPUT'),false);
 const combined=parse(Buffer.concat([table(),generation(),ack()]));assert.equal(combined.ok,true);assert.equal(combined.value.length,3);
 assert.equal(combined.value[1].generation,42);assert.equal(combined.value[2].kind,'ACK');
});
for(const [name,packet,extra]of[
 ['userspace sender',table(),{sender:123}],['foreign group',table(),{group:6}],['truncated packet',table(),{flags:32}],['truncated ancillary',table(),{flags:8}],
 ['short header',Buffer.alloc(15),{}],['oversized datagram',Buffer.alloc(65537),{}],
 ['overrun',message(4,Buffer.alloc(0)),{}],['interrupted dump',message((10<<8),Buffer.concat([nf,attr(1,Buffer.from(owned+'\0'))]),{flags:16}),{}],
 ['unsupported operation',message((10<<8)|255,nf),{}],['missing table attribute',message((10<<8),nf),{}],
 ['duplicate table attribute',message((10<<8),Buffer.concat([nf,attr(1,Buffer.from(owned+'\0')),attr(1,Buffer.from(owned+'\0'))])),{}],
 ['missing generation',message((10<<8)|15,nf),{}],['invalid generation width',message((10<<8)|15,Buffer.concat([nf,attr(1,Buffer.from([1]))])),{}]
])test('synthetic netlink framing refuses '+name,()=>assert.equal(parse(packet,extra).ok,false));
test('events received between probes cannot disappear from the next reported delta',()=>{
 const result=run('background-probe',{owned,readiness,frames:[frame(table(owned,2),7),frame(Buffer.concat([generation(),ack()]))]});
 assert.equal(result.ok,true);assert.equal(result.value.events.length,3);assert.equal(result.value.events[0].operation,2);
 assert.equal(result.value.eventCount,3);assert.equal(result.value.continuousIngressProof,false);
 assert.equal(result.value.multicastReadiness,'NOT_PROVED_REQUIRES_PARENT_SENTINEL');
});
test('same-sequence multicast cannot complete the unicast GETGEN or mask a real reply',()=>{
 const other=message((10<<8),Buffer.concat([nf,attr(1,Buffer.from(owned+'\0'))]),{sequence:1,port:9999});
 const result=run('background-probe',{owned,readiness,frames:[frame(table(),7),frame(generation(1,99),7),frame(other,7),frame(ack()),frame(generation(1,42))]});
 assert.equal(result.ok,true);assert.equal(result.value.generation,42);assert.equal(result.value.events.length,5);
 const missing=run('background-probe',{owned,readiness,frames:[frame(table(),7),frame(generation(1,99),7),frame(ack())]});
 assert.equal(missing.ok,false);assert.match(missing.error,/NO_MATCHING_REPLY/);
});
for(const [name,packet]of[
 ['embedded sequence',ack(1,{requestSequence:2})],['embedded port',ack(1,{requestPort:9999})],
 ['embedded type',ack(1,{requestType:(10<<8)|1})],['embedded flags',ack(1,{requestFlags:1})],
 ['unsupported ext ACK',ack(1,{flags:0x300})],
 ['wrong reply port',message((10<<8)|15,Buffer.concat([Buffer.alloc(4),attr(1,Buffer.alloc(4))]),{sequence:1,port:9999})],
])test('probe rejects '+name,()=>{
 const result=run('background-probe',{owned,readiness,frames:[frame(table(),7),frame(packet),frame(Buffer.concat([generation(),ack()]))]});
 assert.equal(result.ok,false);
});
test('synthetic ENOBUFS permanently poisons the original observer rather than resyncing into success',()=>{
 const value=run('loss',{}).value;assert.match(value.first,/RECEIVE_ENOBUFS/);assert.match(value.second,/FAILED_WINDOW_OR_NAMESPACE/);
 assert.equal(value.failed,true);assert.equal(value.actualKernelOverflowTested,false);
});
test('readonly CLI cannot open its channel without the exclusive owned-VM boundary',()=>{
 const result=spawnSync('/usr/bin/python3',['-I',source,'--owned-readonly-channel','123456-1'],{
  env:{PATH:'/usr/bin:/bin'},encoding:'utf8',timeout:3000,maxBuffer:4096,stdio:['ignore','pipe','pipe']});
 assert.equal(result.status,64);assert.match(result.stderr,/EXCLUSIVE_VM_REQUIRED/);assert.equal(result.stdout,'');
});
