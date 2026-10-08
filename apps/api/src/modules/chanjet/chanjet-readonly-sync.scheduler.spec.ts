import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';
import { installReadonlyApprovalFixture, readonlyApprovalFixture } from './chanjet-readonly-policy.test-fixture';
describe('ChanjetReadonlySyncScheduler production restoration', () => {
  let restore: () => void;
  const previous = process.env.CHANJET_READONLY_SYNC_ENABLED;
  beforeEach(() => { restore = installReadonlyApprovalFixture(); process.env.CHANJET_READONLY_SYNC_ENABLED = 'true'; });
  afterEach(() => { restore(); if(previous === undefined) delete process.env.CHANJET_READONLY_SYNC_ENABLED; else process.env.CHANJET_READONLY_SYNC_ENABLED = previous; jest.restoreAllMocks(); });
  function fixture({ durable = [] as unknown[], lock = true, failure = false } = {}) {
    const query = jest.fn().mockImplementation((sql: string) => {
      if(sql.includes('advisory')) return Promise.resolve([{ acquired:lock }]);
      if(sql.includes('SELECT id')) return Promise.resolve(durable);
      return Promise.resolve([]);
    });
    const runner = { query, connect:jest.fn(), startTransaction:jest.fn(), commitTransaction:jest.fn(), rollbackTransaction:jest.fn(), release:jest.fn().mockResolvedValue(undefined), isTransactionActive:false };
    const ds = { query:jest.fn().mockResolvedValue([]), createQueryRunner:jest.fn(()=>runner) };
    const cycle = { decision:failure?'HOLD':'GO', mirror:{results:[{key:'RECEIVABLE_STATISTICS'}],attempts:1,unresolvedFailures:failure?[{error:'secret=123 amount=42'}]:[]},exactMappings:null,reconciliation:{created:1,autoResolved:0},readiness:null,stoppedAt:null };
    const integration = { runReadonlyAlignmentCycle:jest.fn().mockResolvedValue(cycle), recordCurrentStateAlert:jest.fn() };
    const inbound = { syncScheduledShareholderBalances:jest.fn() };
    const monitor = { ok:jest.fn(), fail:jest.fn() };
    return { subject:new ChanjetReadonlySyncScheduler(integration as never,monitor as never,ds as never,inbound as never),ds,runner,integration,inbound,monitor };
  }
  it.each([undefined,'false','','0','yes'])('default/ambiguous flag %s prevents any durable or remote work',async value=>{
    if(value===undefined)delete process.env.CHANJET_READONLY_SYNC_ENABLED;else process.env.CHANJET_READONLY_SYNC_ENABLED=value;
    const f=fixture();await f.subject.runScheduledSync();await expect(f.subject.enqueueManualSync('operator')).resolves.toMatchObject({accepted:false});
    expect(f.ds.createQueryRunner).not.toHaveBeenCalled();expect(f.integration.runReadonlyAlignmentCycle).not.toHaveBeenCalled();
  });
  it('explicit true + ACTIVE runs once at current Shanghai period with the existing lock and no ledger promotion',async()=>{
    const f=fixture();await f.subject.runScheduledSync();
    expect(f.runner.query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_xact_lock'),['chanjet-full-readonly-sync']);
    expect(f.runner.query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_lock'),['chanjet-full-readonly-sync']);
    expect(f.runner.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_unlock'),['chanjet-full-readonly-sync']);
    expect(f.integration.runReadonlyAlignmentCycle).toHaveBeenCalledTimes(1);expect(f.inbound.syncScheduledShareholderBalances).not.toHaveBeenCalled();
    expect(f.ds.query).toHaveBeenCalledWith(expect.stringContaining('result_summary'),expect.arrayContaining(['SUCCESS']));
  });
  it('VERIFY prevents cron before first finite manual run',async()=>{
    process.env.CHANJET_SYNC_POLICY='READONLY_VERIFY';process.env.CHANJET_READONLY_APPROVAL=JSON.stringify({...readonlyApprovalFixture,verification:{...readonlyApprovalFixture.verification,expiresAt:new Date(Date.now()+60000).toISOString()}});
    const f=fixture();await f.subject.runScheduledSync();expect(f.integration.runReadonlyAlignmentCycle).not.toHaveBeenCalled();
    await expect(f.subject.enqueueManualSync('operator',{})).rejects.toThrow();
    await expect(f.subject.enqueueManualSync('operator',readonlyApprovalFixture.verification)).resolves.toMatchObject({accepted:true});
    await new Promise(r=>setImmediate(r));expect(f.integration.runReadonlyAlignmentCycle).toHaveBeenCalledTimes(1);
  });
  it('stale legacy or durable RUNNING jobs block admission without changing historical rows',async()=>{
    const f=fixture({durable:[{id:3}]});await f.subject.runScheduledSync();
    expect(f.integration.runReadonlyAlignmentCycle).not.toHaveBeenCalled();expect(f.runner.query.mock.calls.some(c=>String(c[0]).includes('INSERT'))).toBe(false);
  });
  it('another process holding advisory lock prevents a second durable job',async()=>{
    const f=fixture({lock:false});await f.subject.runScheduledSync();expect(f.integration.runReadonlyAlignmentCycle).not.toHaveBeenCalled();expect(f.runner.commitTransaction).not.toHaveBeenCalled();expect(f.runner.release).toHaveBeenCalled();
  });
  it('bootstrap retains interrupted run for manual review without replay or terminal rewrites',async()=>{
    const f=fixture();f.ds.query.mockResolvedValue([{status:'RUNNING',request_scope:{orchestrationRunId:'OLD-RUN'},created_at:new Date(),updated_at:new Date(),result_summary:null,error_message:null}]);
    f.subject.onApplicationBootstrap();await new Promise(r=>setImmediate(r));
    expect(f.integration.runReadonlyAlignmentCycle).not.toHaveBeenCalled();expect(f.ds.query.mock.calls.every(c=>String(c[0]).startsWith('SELECT'))).toBe(true);
    await expect(f.subject.getRunState()).resolves.toMatchObject({state:'HOLD'});
  });
  it('failure persists HOLD and sanitized code, and releases advisory connection',async()=>{
    const f=fixture({failure:true});await f.subject.runScheduledSync();await expect(f.subject.getRunState()).resolves.toMatchObject({state:'HOLD',message:'READONLY_HOLD_EXECUTION'});
    expect(f.monitor.fail).toHaveBeenCalledWith('chanjet-full-readonly-sync','READONLY_HOLD_EXECUTION');expect(JSON.stringify(f.ds.query.mock.calls)).not.toContain('secret=');expect(f.runner.release).toHaveBeenCalled();
  });
  it('terminates an already accepted durable job as HOLD if the flag closes before deferred execution', async () => {
    const f=fixture();const accepted=await f.subject.enqueueManualSync('operator');expect(accepted.accepted).toBe(true);
    process.env.CHANJET_READONLY_SYNC_ENABLED='false';await new Promise(r=>setImmediate(r));
    expect(f.integration.runReadonlyAlignmentCycle).not.toHaveBeenCalled();
    expect(f.ds.query).toHaveBeenCalledWith(expect.stringContaining('result_summary'),expect.arrayContaining(['FAIL']));
    await expect(f.subject.getRunState()).resolves.toMatchObject({state:'HOLD'});
  });

});
