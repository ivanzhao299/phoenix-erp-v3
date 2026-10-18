import { CustomerCreditSchedulerService } from '../sales-v2/services/customer-credit-scheduler.service';
import { EggInventorySchedulerService } from '../sales-v2/services/egg-inventory-scheduler.service';
import { WorkflowSlaScheduler } from '../workflow/workflow-sla.scheduler';
import { BackgroundBusinessLockHold } from './background-business-lock.service';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function common() {
  const monitor = { ok: jest.fn(), fail: jest.fn() };
  const locks = { run: jest.fn(async (_name: string, work: () => Promise<unknown>): Promise<{ acquired: boolean; value?: unknown }> => ({ acquired: true, value: await work() })) };
  const tasks = { run: (_name: string, _kind: string, work: () => Promise<unknown>) => work(), runScheduled: (_name: string, _kind: string, work: () => Promise<unknown>) => work() };
  return { monitor, locks, tasks };
}
function credit() {
  const f = common();
  const service = new CustomerCreditSchedulerService({} as never, {} as never, f.monitor as never, {} as never, f.tasks as never, f.locks as never);
  const work = jest.spyOn(service as unknown as { doRefresh: () => Promise<Record<string, number>> }, 'doRefresh').mockResolvedValue({ totalCustomers: 1, refreshed: 1, frozen: 0, overdue: 0, overLimit: 0 });
  return { ...f, work, key: 'credit_scheduler', daily: () => service.runDailyCreditRefresh(), manual: () => service.runManually() };
}
function egg() {
  const f = common();
  const service = new EggInventorySchedulerService({} as never, {} as never, f.monitor as never, {} as never, f.tasks as never, f.locks as never);
  const work = jest.spyOn(service as unknown as { runMaintenance: () => Promise<Record<string, number>> }, 'runMaintenance').mockResolvedValue({ expiredBatches: 1, expireWriteOff: 1, expiringBatches: 0, expiringNotifications: 0, durationMs: 7 });
  return { ...f, work, key: 'egg_inventory_scheduler', daily: () => service.runDailyMaintenance(), manual: () => service.runManually() };
}
for (const [label, create] of [['credit', credit], ['egg', egg]] as const) {
  describe(`${label} Cron/manual shared lock contract`, () => {
    it('uses the same business key for both entrypoints and preserves successful statistics', async () => {
      const f = create(); await f.daily(); const result = await f.manual();
      expect(f.locks.run.mock.calls.map(([key]) => key)).toEqual([f.key, f.key]); expect(f.work).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject(label === 'credit' ? { totalCustomers: 1, refreshed: 1 } : { expiredBatches: 1, expireWriteOff: 1 }); expect(f.monitor.ok).toHaveBeenCalledTimes(1);
    });
    it('skips a busy Cron, returns explicit manual BUSY and never manufactures success statistics', async () => {
      const f = create(); f.locks.run.mockResolvedValue({ acquired: false });
      await f.daily(); await expect(f.manual()).rejects.toThrow('BACKGROUND_BUSINESS_TASK_BUSY');
      expect(f.work).not.toHaveBeenCalled(); expect(f.monitor.ok).not.toHaveBeenCalled(); expect(f.monitor.fail).not.toHaveBeenCalled();
    });
    it('does not write an OK heartbeat when real lock cleanup returns HOLD', async () => {
      const f = create(); f.locks.run.mockRejectedValue(new BackgroundBusinessLockHold('NONE', 'RETIRE'));
      await expect(f.daily()).rejects.toThrow('HOLD'); expect(f.monitor.ok).not.toHaveBeenCalled();
    });
    it('waits for helper completion after business work before writing an OK heartbeat', async () => {
      const f = create(), close = deferred(), entered = deferred();
      f.locks.run.mockImplementation(async (_key, work) => { const value = await work(); entered.resolve(); await close.promise; return { acquired: true, value }; });
      const daily = f.daily(); await entered.promise; await tick(); expect(f.monitor.ok).not.toHaveBeenCalled();
      close.resolve(); await daily; expect(f.monitor.ok).toHaveBeenCalledTimes(1);
    });
  });
}
it('SLA uses its fixed shared key and only writes OK after lock cleanup', async () => {
  const f = common(), close = deferred(), entered = deferred(); const sla = { checkOverdueTasks: jest.fn(async () => undefined) };
  const service = new WorkflowSlaScheduler(sla as never, f.locks as never, f.monitor as never, f.tasks as never);
  f.locks.run.mockImplementation(async (_key, work) => { const value = await work(); entered.resolve(); await close.promise; return { acquired: true, value }; });
  const operation = service.handleSlaCheck(); await entered.promise; expect(f.locks.run.mock.calls[0][0]).toBe('workflow_sla_scheduler'); expect(f.monitor.ok).not.toHaveBeenCalled();
  close.resolve(); await operation; expect(f.monitor.ok).toHaveBeenCalledTimes(1);
});
