import { DataSource } from 'typeorm';
import { ChanjetSyncJobEntity } from './chanjet-sync-job.entity';
import { ChanjetArSnapshotEntity } from './chanjet-ar-snapshot.entity';
import { ChanjetArSyncService } from './chanjet-ar-sync.service';
import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';
import { installReadonlyApprovalFixture } from './chanjet-readonly-policy.test-fixture';

const fixtureUrl = process.env.CHANJET_READONLY_FIXTURE_URL;
const integration = fixtureUrl ? describe : describe.skip;
integration('isolated PostgreSQL Chanjet restoration', () => {
  let ds: DataSource;
  let restore: () => void;
  const previousFlag = process.env.CHANJET_READONLY_SYNC_ENABLED;
  beforeAll(async () => {
    const url = new URL(fixtureUrl!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/chanjet_restore_fixture') throw Error('Only the isolated loopback fixture database is permitted');
    ds = new DataSource({ type: 'postgres', url: fixtureUrl, entities: [ChanjetSyncJobEntity, ChanjetArSnapshotEntity], synchronize: true });
    await ds.initialize();
  });
  beforeEach(async () => {
    restore = installReadonlyApprovalFixture(); process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    await ds.query('TRUNCATE chanjet_sync_jobs, chanjet_ar_snapshot');
  });
  afterEach(() => { restore?.(); if(previousFlag === undefined) delete process.env.CHANJET_READONLY_SYNC_ENABLED; else process.env.CHANJET_READONLY_SYNC_ENABLED = previousFlag; });
  afterAll(async () => { if(ds?.isInitialized) await ds.destroy(); });
  const cycle = { decision:'GO',mirror:{results:[{key:'RECEIVABLE_STATISTICS'}],attempts:1,unresolvedFailures:[]},exactMappings:null,reconciliation:{created:0,autoResolved:0},readiness:null };
  const scheduler = (call=jest.fn().mockResolvedValue(cycle)) => {
    const subject=new ChanjetReadonlySyncScheduler({runReadonlyAlignmentCycle:call} as never,{ok:jest.fn(),fail:jest.fn()} as never,ds,{} as never);
    let complete!: () => void;
    const done=new Promise<void>(resolve=>{complete=resolve;});
    const internal=subject as unknown as {executeSync:(...args:unknown[])=>Promise<void>};
    const execute=internal.executeSync.bind(subject);
    internal.executeSync=async(...args)=>{try{await execute(...args);}finally{complete();}};
    return {call,subject,done};
  };
  it('serializes competing processes before durable insertion and executes only one orchestration',async()=>{
    const a=scheduler(),b=scheduler();
    const responses=await Promise.all([a.subject.enqueueManualSync('operator'),b.subject.enqueueManualSync('operator')]);
    expect(responses.filter(x=>x.accepted)).toHaveLength(1);
    // Observe the admitted execution's completion, including terminal persistence and cleanup.
    await (responses[0].accepted?a.done:b.done);
    expect(a.call.mock.calls.length+b.call.mock.calls.length).toBe(1);
    expect(await ds.query('SELECT status FROM chanjet_sync_jobs')).toEqual([{status:'SUCCESS'}]);
  });
  it('deduplicates the same scheduled slot even when the earlier process has already completed', async () => {
    const a=scheduler(),b=scheduler();await a.subject.runScheduledSync();await b.subject.runScheduledSync();
    expect(a.call).toHaveBeenCalledTimes(1);expect(b.call).not.toHaveBeenCalled();
    expect(await ds.query('SELECT status FROM chanjet_sync_jobs')).toEqual([{status:'SUCCESS'}]);
  });
  it('treats legacy RUNNING rows as HOLD without deleting or replaying them',async()=>{
    await ds.getRepository(ChanjetSyncJobEntity).save({jobType:'SNAPSHOT',bookId:'BOOK-1',status:'RUNNING'});
    const f=scheduler();expect((await f.subject.enqueueManualSync('operator')).accepted).toBe(false);
    expect(f.call).not.toHaveBeenCalled();expect(await ds.query('SELECT status FROM chanjet_sync_jobs')).toEqual([{status:'RUNNING'}]);
  });
  it('honors an advisory lock held on an independent PostgreSQL connection',async()=>{
    const runner=ds.createQueryRunner();await runner.connect();await runner.query('SELECT pg_advisory_lock(hashtext($1))',['chanjet-full-readonly-sync']);
    try { const f=scheduler();expect((await f.subject.enqueueManualSync('operator')).accepted).toBe(false);expect(f.call).not.toHaveBeenCalled(); }
    finally{await runner.query('SELECT pg_advisory_unlock(hashtext($1))',['chanjet-full-readonly-sync']);await runner.release();}
  });
  it('updates an existing AR mirror atomically; duplicate provider rows roll back to the previous official snapshot',async()=>{
    const repo=ds.getRepository(ChanjetArSnapshotEntity);
    await repo.save({bookid:'BOOK-1',companyCode:'COMP-1',period:'202610',assistantCustomerCode:'OLD',subjectId:'1',endbalance:'10'});
    const provider=jest.fn().mockResolvedValue([{assistantCustomerCode:'NEW',subjectId:2,endbalance:20},{assistantCustomerCode:'NEW',subjectId:2,endbalance:30}]);
    const ledger={save:jest.fn()};
    const service=new ChanjetArSyncService({callApi:provider} as never,repo,{findOneBy:jest.fn().mockResolvedValue({bookid:'BOOK-1',companyCode:'COMP-1',syncEnabled:true})} as never,ledger as never,{get:()=>({isGlobal:true})} as never);
    await expect(service.syncByCompanyCode('COMP-1','202610')).rejects.toThrow();
    expect(await repo.find()).toEqual([expect.objectContaining({assistantCustomerCode:'OLD',endbalance:'10.00'})]);
    provider.mockResolvedValue([{assistantCustomerCode:'NEW',subjectId:2,endbalance:20}]);
    await expect(service.syncByCompanyCode('COMP-1','202610')).resolves.toMatchObject({saved:1});
    await expect(service.syncByCompanyCode('COMP-1','202610')).resolves.toMatchObject({saved:1});
    expect(await repo.count()).toBe(1);expect(ledger.save).not.toHaveBeenCalled();
  });
  it('retains the current mirror on provider failure and rejects cross-company bindings before remote read',async()=>{
    const repo=ds.getRepository(ChanjetArSnapshotEntity);await repo.save({bookid:'BOOK-1',companyCode:'COMP-1',period:'202610',assistantCustomerCode:'OLD',subjectId:'1'});
    const provider=jest.fn().mockRejectedValue(new Error('provider timeout'));
    const service=new ChanjetArSyncService({callApi:provider} as never,repo,{findOneBy:jest.fn().mockResolvedValue({bookid:'BOOK-1',companyCode:'COMP-2',syncEnabled:true})} as never,{} as never,{get:()=>({isGlobal:true})} as never);
    await expect(service.syncByCompanyCode('COMP-2','202610')).rejects.toThrow();expect(provider).not.toHaveBeenCalled();expect(await repo.count()).toBe(1);
  });
});
