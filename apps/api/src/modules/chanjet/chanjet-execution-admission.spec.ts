import { randomUUID } from 'node:crypto';
import { spawnSync, fork, ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { CreateChanjetExecutionAdmissions1791878400000 } from '../../database/migrations/1791878400000-CreateChanjetExecutionAdmissions';
import { ChanjetExecutionAdmissionEntity, ChanjetExecutionRequestEntity } from './chanjet-execution-admission.entity';
import { ChanjetExecutionAdmissionStore, ExecutionContext, AdmissionManager } from './chanjet-execution-admission.store';
import { ExecutionManifest, validateExecutionManifest } from './chanjet-execution-manifest';

// All values are SYNTHETIC_NOT_APPROVAL. The URL must name a dedicated loopback fixture DB.
function manifest(cap=3, duration=60000): ExecutionManifest {
  const id=randomUUID();
  return { version:1,executionId:`SYNTHETIC_EXEC_${id}`,ownerId:'SYNTHETIC_OPERATOR',requestCap:cap,totalTimeoutMs:duration,httpTimeoutMs:500,
    approval:{version:3,approvalId:`SYNTHETIC_APPROVAL_${id}`,floorSha:'a'.repeat(40),sourceClassification:'PRODUCTION_DATA',remoteWrite:false,erpInbound:false,
      books:[{bookId:'SYNTHETIC_BOOK',companyCode:'SYNTHETIC_COMPANY'}],scopes:['RECEIVABLE_STATISTICS'],periodPolicy:'REQUESTED_PERIOD_NO_BACKFILL',
      verification:{bookId:'SYNTHETIC_BOOK',period:'202610',scope:['RECEIVABLE_STATISTICS'],expiresAt:new Date(Date.now()+120000).toISOString()}} };
}
describe('strict storage-only execution contract',()=>{
  it.each(['requestCap','totalTimeoutMs','httpTimeoutMs'])('rejects invalid required numeric %s',key=>{
    for(const value of [undefined,null,true,'3',0,-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER,2147483648]) {
      expect(()=>validateExecutionManifest({...manifest(),[key]:value})).toThrow('CHANJET_ADMISSION_HOLD');
    }
  });
  it('rejects extra nested fields, duplicate scopes/books and invalid expiry',()=>{
    const m=manifest();
    expect(()=>validateExecutionManifest({...m,unapproved:true})).toThrow();
    expect(()=>validateExecutionManifest({...m,approval:{...m.approval,books:[...m.approval.books,...m.approval.books]}})).toThrow();
    expect(()=>validateExecutionManifest({...m,approval:{...m.approval,scopes:['RECEIVABLE_STATISTICS','RECEIVABLE_STATISTICS']}})).toThrow();
    expect(()=>validateExecutionManifest({...m,approval:{...m.approval,verification:{...m.approval.verification,expiresAt:'2026-02-30T00:00:00.000Z'}}})).toThrow();
  });
  it('standalone ops and API validators produce identical canonical binding and rejections',()=>{
    const m=manifest();
    const script=`import {validateExecutionManifest} from ${JSON.stringify(resolve(__dirname,'../../../../../scripts/ops/chanjet-execution-manifest.mjs'))};
      const m=JSON.parse(process.argv[1]);const results=[];
      for(const key of ['requestCap','totalTimeoutMs','httpTimeoutMs'])for(const value of [undefined,null,true,'3',0,-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER,2147483648]){try{validateExecutionManifest({...m,[key]:value});results.push(false);}catch{results.push(true);}}
      console.log(JSON.stringify({binding:validateExecutionManifest(m),rejected:results}));`;
    const out=spawnSync(process.execPath,['--input-type=module','-e',script,JSON.stringify(m)],{encoding:'utf8'});
    expect(out.status).toBe(0);const result=JSON.parse(out.stdout);
    expect(result.binding).toEqual(validateExecutionManifest(m));expect(result.rejected).toEqual(Array(33).fill(true));
  });
  it('fails closed with no manager/transaction before any query',async()=>{
    for(const manager of [undefined,{} as AdmissionManager]) {
      const store=new ChanjetExecutionAdmissionStore(manager);
      await expect(store.registerFromReviewedRootManifest(manifest())).rejects.toThrow('CHANJET_ADMISSION_HOLD');
      await expect(store.reserve({manifest:manifest(),leaseId:'SYNTHETIC_LEASE',phase:'PROBING'},'BUSINESS')).rejects.toThrow();
    }
  });
});

const fixtureUrl=process.env.CHANJET_ADMISSION_FIXTURE_URL;
if (process.env.CHANJET_ADMISSION_FIXTURE_REQUIRED === 'true' && !fixtureUrl) throw Error('REAL_ADMISSION_FIXTURE_URL_REQUIRED');
const database=fixtureUrl?describe:describe.skip;
database('real PostgreSQL admission invariants (no provider wiring)',()=>{
  let ds:DataSource, store:ChanjetExecutionAdmissionStore, directory:string;
  let applied=false;
  const migration=new CreateChanjetExecutionAdmissions1791878400000();
  const children:ChildProcess[]=[];
  beforeAll(async()=>{
    const url=new URL(fixtureUrl!);
    if(url.hostname!=='127.0.0.1'||url.pathname!=='/chanjet_admission_fixture')throw Error('isolated loopback fixture database required');
    ds=new DataSource({type:'postgres',url:fixtureUrl,entities:[ChanjetExecutionAdmissionEntity,ChanjetExecutionRequestEntity],synchronize:false,extra:{max:24}});
    await ds.initialize();
    // own the fixture schema: other suites in the same database may have left
    // tables behind (the migration is not IF NOT EXISTS)
    await ds.query('DROP SCHEMA public CASCADE');await ds.query('CREATE SCHEMA public');
    const runner=ds.createQueryRunner();
    try {await runner.startTransaction();await migration.up(runner);await runner.commitTransaction();applied=true;}catch(error){if(runner.isTransactionActive)await runner.rollbackTransaction();throw error;}finally{await runner.release();}
    store=new ChanjetExecutionAdmissionStore(ds.manager);
    directory=mkdtempSync(join(tmpdir(),'chanjet-admission-synthetic-'));
    for(const name of ['chanjet-execution-manifest','chanjet-execution-admission.store']) {
      const source=readFileSync(join(__dirname,`${name}.ts`),'utf8');
      writeFileSync(join(directory,`${name}.js`),transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2021}}).outputText);
    }
  });
  afterAll(async()=>{
    for(const child of children)if(child.connected)child.kill();
    if(ds?.isInitialized){const runner=ds.createQueryRunner();try{if(applied)await migration.down(runner);}finally{await runner.release();await ds.destroy();}}
    if(directory)rmSync(directory,{recursive:true,force:true});
  });
  async function start(cap=3,duration=60000){const m=manifest(cap,duration);await store.registerFromReviewedRootManifest(m);const leaseId=`SYNTHETIC_LEASE_${randomUUID()}`;await store.begin(m,'PROBING',leaseId);return {manifest:m,leaseId,phase:'PROBING' as const};}
  it('migration columns, entity metadata and checks align with actual isolated DB',async()=>{
    const diff=await ds.driver.createSchemaBuilder().log();expect(diff.upQueries.map(q=>q.query)).toEqual([]);
    expect(await ds.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='chanjet_sync_jobs'")).toEqual([]);
  });
  it('INSERT-only identity rejects duplicate, same approval/new ID and tuple/limit mutations',async()=>{
    const m=manifest();const first=await store.registerFromReviewedRootManifest(m);
    await expect(store.registerFromReviewedRootManifest(m)).rejects.toThrow();
    await expect(store.registerFromReviewedRootManifest({...m,executionId:'SYNTHETIC_NEW_ID'})).rejects.toThrow();
    await expect(store.load({...m,requestCap:4})).rejects.toThrow();
    for(const assignment of ["request_cap=request_cap+1","request_count=-1","deadline_at=deadline_at+interval '1 second'","manifest_digest=repeat('b',64)","owner_id='OTHER'"]) {
      await expect(ds.query(`UPDATE chanjet_execution_admissions SET ${assignment} WHERE execution_id=$1`,[m.executionId])).rejects.toThrow();
    }
    expect((await store.load(m)).deadline_at).toEqual(first.deadline_at);
  });
  it('DB clock owns start/deadline and bounds it by verification expiry',async()=>{
    const m=manifest(3,2147483647);const r=await store.registerFromReviewedRootManifest(m);
    expect(r.deadline_at.toISOString()).toBe(m.approval.verification.expiresAt);
    const stale=manifest();stale.approval.verification.expiresAt=new Date(Date.now()-1000).toISOString();
    await expect(store.registerFromReviewedRootManifest(stale)).rejects.toThrow();
    const excessive=manifest();excessive.approval.verification.expiresAt=new Date(Date.now()+31*60000).toISOString();
    await expect(store.registerFromReviewedRootManifest(excessive)).rejects.toThrow();
  });
  it('persists cap denial before returning failure, no B+1 ticket and no reset',async()=>{
    const context=await start(2);await store.reserve(context,'BUSINESS');await store.reserve(context,'TOKEN');
    await expect(store.reserve(context,'RESEND')).rejects.toThrow();
    const row=await store.load(context.manifest);expect(row.request_count).toBe(2);expect(row.phase).toBe('HOLD');expect(row.hold_reason).toBe('CAP');
    await expect(ds.query("UPDATE chanjet_execution_admissions SET request_count=0,phase='REGISTERED' WHERE execution_id=$1",[row.execution_id])).rejects.toThrow();
  });
  it('refuses wrong owner/book/period/scope/lease and missing context without changing valid row',async()=>{
    const context=await start();const m=context.manifest as ExecutionManifest;
    const changed=[{...m,ownerId:'OTHER'},{...m,approval:{...m.approval,verification:{...m.approval.verification,period:'202611'}}},
      {...m,approval:{...m.approval,books:[{bookId:'OTHER',companyCode:'OTHER'}],verification:{...m.approval.verification,bookId:'OTHER'}}}];
    for(const value of changed)await expect(store.reserve({...context,manifest:value},'BUSINESS')).rejects.toThrow();
    await expect(store.reserve({...context,leaseId:'OTHER'},'BUSINESS')).rejects.toThrow();
    await expect(store.reserve(undefined as unknown as ExecutionContext,'BUSINESS')).rejects.toThrow();
    expect((await store.load(m)).request_count).toBe(0);
  });
  it('clean probe checkpoint reloads in a second real connection without resetting count/deadline',async()=>{
    const context=await start();const ticket=await store.reserve(context,'BUSINESS');await store.acknowledge(context,ticket.ticket,'OK');
    const checkpoint=await store.finish(context,'PROBED');
    const second=new DataSource({type:'postgres',url:fixtureUrl,synchronize:false});await second.initialize();
    try {
      const next=new ChanjetExecutionAdmissionStore(second.manager);const loaded=await next.recoverInterrupted(context.manifest);
      expect(loaded.phase).toBe('PROBED');expect(loaded.request_count).toBe(1);expect(loaded.deadline_at).toEqual(checkpoint.deadline_at);expect(loaded.started_at).toEqual(checkpoint.started_at);
      const leaseId='SYNTHETIC_SECOND_PROCESS';await next.begin(context.manifest,'SYNCING',leaseId);
      const request=await next.reserve({...context,leaseId,phase:'SYNCING' as const},'BUSINESS');await next.acknowledge({...context,leaseId,phase:'SYNCING' as const},request.ticket,'OK');await next.finish({...context,leaseId,phase:'SYNCING' as const},'VERIFIED');await expect(next.begin(context.manifest,'SYNCING','ANOTHER')).rejects.toThrow();
    }finally{await second.destroy();}
  });
  it('outstanding request, phase regression and interrupted restart cannot reopen or auto repeat',async()=>{
    const context=await start();await store.reserve(context,'CERTIFICATE');
    await expect(store.finish(context,'PROBED')).rejects.toThrow();
    await expect(ds.query("UPDATE chanjet_execution_admissions SET phase='REGISTERED',lease_id='' WHERE execution_id=$1",[(context.manifest as ExecutionManifest).executionId])).rejects.toThrow();
    const recovered=await store.recoverInterrupted(context.manifest);expect(recovered.phase).toBe('HOLD');expect(recovered.hold_reason).toBe('INTERRUPTED');
    await expect(store.reserve(context,'RESEND')).rejects.toThrow();
  });
  it('DB-time expiry persists HOLD and rejects work despite an unchanged caller manifest',async()=>{
    // the registration->begin pair runs inside a GENEROUS budget so begin
    // itself can never race the deadline (a slow runner once made begin
    // land past expiry); the pg_sleep then deterministically crosses the
    // DB-owned deadline before the reserve is refused as DEADLINE
    const context=await start(3,2000);await ds.query('SELECT pg_sleep(2.1)');
    await expect(store.reserve(context,'BUSINESS')).rejects.toThrow();
    const row=await store.load(context.manifest);expect(row.phase).toBe('HOLD');expect(row.hold_reason).toBe('DEADLINE');expect(row.request_count).toBe(0);
  });
  it('each verification phase requires its own acknowledged BUSINESS receipt, not an auth-only receipt',async()=>{
    const context=await start(5);await expect(store.finish(context,'PROBED')).rejects.toThrow();
    const token=await store.reserve(context,'TOKEN');await store.acknowledge(context,token.ticket,'OK');
    await expect(store.finish(context,'PROBED')).rejects.toThrow();
    const probe=await store.reserve(context,'BUSINESS');await store.acknowledge(context,probe.ticket,'OK');await store.finish(context,'PROBED');
    const next={...context,leaseId:'SYNTHETIC_SYNC_LEASE',phase:'SYNCING' as const};await store.begin(context.manifest,'SYNCING',next.leaseId);
    await expect(store.finish(next,'VERIFIED')).rejects.toThrow();
    const syncToken=await store.reserve(next,'TOKEN');await store.acknowledge(next,syncToken.ticket,'OK');await expect(store.finish(next,'VERIFIED')).rejects.toThrow();
    const sync=await store.reserve(next,'BUSINESS');await store.acknowledge(next,sync.ticket,'OK');
    await expect(store.acknowledge(next,sync.ticket,'OK')).rejects.toThrow();await store.finish(next,'VERIFIED');
    await expect(ds.query("UPDATE chanjet_execution_admissions SET phase='PROBED' WHERE execution_id=$1",[(context.manifest as ExecutionManifest).executionId])).rejects.toThrow();
  });
  it('ordinary DML cannot mutate/remove evidence and count without a receipt fails closed on load',async()=>{
    const context=await start();const m=context.manifest as ExecutionManifest;
    await expect(ds.query('DELETE FROM chanjet_execution_admissions WHERE execution_id=$1',[m.executionId])).rejects.toThrow();
    await expect(ds.query('TRUNCATE chanjet_execution_requests')).rejects.toThrow();
    await ds.query('UPDATE chanjet_execution_admissions SET request_count=request_count+1 WHERE execution_id=$1',[m.executionId]);
    await expect(store.load(m)).rejects.toThrow();await expect(store.reserve(context,'BUSINESS')).rejects.toThrow();
  });
  it('rejects the actual cap=1 probe-ACK/reused-lease bypass at store and SQL boundaries',async()=>{
    const context=await start(1);const ticket=await store.reserve(context,'BUSINESS');await store.acknowledge(context,ticket.ticket,'OK');await store.finish(context,'PROBED');
    const id=(context.manifest as ExecutionManifest).executionId;
    await expect(store.begin(context.manifest,'SYNCING',context.leaseId)).rejects.toThrow();
    await expect(ds.query("UPDATE chanjet_execution_admissions SET phase='SYNCING',lease_id=$2 WHERE execution_id=$1",[id,context.leaseId])).rejects.toThrow();
    expect((await store.load(context.manifest)).phase).toBe('PROBED');
    const sync={...context,phase:'SYNCING' as const,leaseId:'SYNTHETIC_DISTINCT_SYNC_LEASE'};
    await store.begin(context.manifest,'SYNCING',sync.leaseId);
    await expect(store.acknowledge(sync,ticket.ticket,'OK')).rejects.toThrow();
    await expect(store.finish(sync,'VERIFIED')).rejects.toThrow();
    await expect(ds.query("UPDATE chanjet_execution_admissions SET phase='VERIFIED',lease_id='' WHERE execution_id=$1",[id])).rejects.toThrow();
    await expect(store.reserve(sync,'BUSINESS')).rejects.toThrow();
    const row=await store.load(context.manifest);expect(row.phase).toBe('HOLD');expect(row.request_count).toBe(1);expect(row.hold_reason).toBe('CAP');
  });
  it('receipt phase is immutable and a probing context cannot spend a syncing allowance',async()=>{
    const context=await start(3);const probe=await store.reserve(context,'BUSINESS');await store.acknowledge(context,probe.ticket,'OK');await store.finish(context,'PROBED');
    const sync={...context,phase:'SYNCING' as const,leaseId:'SYNTHETIC_FRESH_SYNC'};await store.begin(context.manifest,'SYNCING',sync.leaseId);
    await expect(store.reserve({...sync,phase:'PROBING'},'BUSINESS')).rejects.toThrow();
    await expect(ds.query("UPDATE chanjet_execution_requests SET phase='SYNCING',lease_id=$2 WHERE ticket=$1",[probe.ticket,sync.leaseId])).rejects.toThrow();
    const own=await store.reserve(sync,'BUSINESS');await store.acknowledge(sync,own.ticket,'OK');
    const receipts=await ds.query('SELECT phase FROM chanjet_execution_requests WHERE execution_id=$1 ORDER BY ordinal',[(context.manifest as ExecutionManifest).executionId]);
    expect(receipts.map((r:{phase:string})=>r.phase)).toEqual(['PROBING','SYNCING']);await store.finish(sync,'VERIFIED');
  });
  it('rollback and lost COMMIT acknowledgement never return a usable ticket',async()=>{
    const context=await start();
    const rollback:AdmissionManager={transaction:callback=>ds.manager.transaction(async tx=>{await callback(tx);throw Error('synthetic before commit');})};
    await expect(new ChanjetExecutionAdmissionStore(rollback).reserve(context,'BUSINESS')).rejects.toThrow();expect((await store.load(context.manifest)).request_count).toBe(0);
    const unknown:AdmissionManager={transaction:async callback=>{await ds.manager.transaction(callback);throw Error('synthetic lost commit acknowledgement');}};
    await expect(new ChanjetExecutionAdmissionStore(unknown).reserve(context,'BUSINESS')).rejects.toThrow();expect((await store.load(context.manifest)).request_count).toBe(1);
    expect((await store.recoverInterrupted(context.manifest)).phase).toBe('HOLD');
  });
  it('two independent Node20 processes reserve at most B against real PostgreSQL',async()=>{
    const context=await start(5);const states:Array<{accepted:number;rejected:number}>=[];
    const tasks=Array.from({length:2},()=>{
      const child=fork(join(__dirname,'../../../test/fixtures/chanjet-admission-worker.cjs'),[],{stdio:['ignore','pipe','pipe','ipc']});children.push(child);
      let readyResolve!:()=>void;
      const ready=new Promise<void>(r=>{readyResolve=r;});
      const done=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>{if(code)reject(Error('synthetic worker failure'));});child.on('message',(m:{state:string;accepted:number;rejected:number})=>{if(m.state==='READY')readyResolve();if(m.state==='DONE'){states.push(m);resolve();}if(m.state==='FAILED')reject(Error('synthetic worker failure'));});});
      child.send({operation:'prepare',url:fixtureUrl,context,work:8,compiledStore:join(directory,'chanjet-execution-admission.store.js')});return {child,ready,done};
    });
    await Promise.all(tasks.map(t=>t.ready));tasks.forEach(t=>t.child.send({operation:'go'}));await Promise.all(tasks.map(t=>t.done));
    expect(states.reduce((n,r)=>n+r.accepted,0)).toBe(5);expect(states.reduce((n,r)=>n+r.rejected,0)).toBe(11);
    const row=await store.load(context.manifest);expect(row.request_count).toBe(5);expect(row.phase).toBe('HOLD');
    const [count]=await ds.query('SELECT count(*)::integer AS n FROM chanjet_execution_requests WHERE execution_id=$1',[row.execution_id]);expect(count.n).toBe(5);
  },20000);
  it('one Node20 process checkpoints and exits; a new process reloads original count/start/deadline',async()=>{
    const context=await start(3);
    async function operation(name:string,leaseId:string):Promise<Record<string,unknown>> {
      const child=fork(join(__dirname,'../../../test/fixtures/chanjet-admission-worker.cjs'),[],{stdio:['ignore','pipe','pipe','ipc']});children.push(child);
      let evidence:Record<string,unknown>;
      return new Promise((resolve,reject)=>{
        child.on('error',reject);child.on('exit',code=>{if(code||!evidence)reject(Error('synthetic checkpoint process failure'));else resolve(evidence);});
        child.on('message',(m:Record<string,unknown>)=>{
          if(m.state==='READY')child.send({operation:name});
          if(['CHECKPOINT','RESUMED'].includes(String(m.state)))evidence=m;
          if(m.state==='FAILED')reject(Error('synthetic checkpoint failure'));
        });
        child.send({operation:'prepare',url:fixtureUrl,context:{...context,leaseId,phase:name==='resume'?'SYNCING':'PROBING'},work:0,compiledStore:join(directory,'chanjet-execution-admission.store.js')});
      });
    }
    const first=await operation('checkpoint',context.leaseId);
    const second=await operation('resume','SYNTHETIC_RECREATED_LEASE');
    expect(first.pid).not.toBe(second.pid);expect(first.count).toBe(1);expect(second.countBefore).toBe(1);expect(second.phaseBefore).toBe('PROBED');
    expect(second.startedAt).toBe(first.startedAt);expect(second.deadlineAt).toBe(first.deadlineAt);
    expect((await store.load(context.manifest)).request_count).toBe(2);
  },20000);
});
