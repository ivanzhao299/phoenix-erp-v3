import { IotSyncService } from '../iot/iot-sync.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { WorkflowSlaScheduler } from '../workflow/workflow-sla.scheduler';
import { CustomerCreditSchedulerService } from '../sales-v2/services/customer-credit-scheduler.service';
import { EggInventorySchedulerService } from '../sales-v2/services/egg-inventory-scheduler.service';
import { FarmCronService } from '../farm/farm.cron';
import { ArReconciliationService } from '../finance-v2/services/ar-reconciliation.service';

/** Domain integration assertions; coordinator concurrency/lease behavior is tested by its own suites. */
describe('non-Chanjet background admission integrations', () => {
  const denied = new Error('background admission denied');
  function fixtures(open = false) {
    const query = jest.fn().mockResolvedValue([]);
    const run = jest.fn((_name: string, _kind: string, work: () => Promise<unknown>) => open ? work() : Promise.reject(denied));
    const runScheduled = jest.fn((_name: string, _kind: string, work: () => Promise<unknown>) => open ? work() : Promise.resolve(undefined));
    const gate = { run, runScheduled };
    const monitor = { ok: jest.fn(), fail: jest.fn(), runGuarded: jest.fn((_name: string, work: () => Promise<unknown>) => work()) };
    const dispatcher = { fire: jest.fn().mockResolvedValue(undefined) };
    const ds = { query } as never;
    const credit = { refreshCustomerCredit: jest.fn() };
    const inventory = { markExpiredBatches: jest.fn() };
    const sla = { checkOverdueTasks: jest.fn() };
    const recipients = { resolve: jest.fn() };
    const iot = new IotSyncService(ds, monitor as never, {} as never, gate as never);
    return {
      query, gate, monitor, dispatcher, credit, inventory, sla,
      scheduled: [
        () => iot.scheduledSync(),
        () => new NotificationSchedulerService(ds, dispatcher as never, monitor as never, gate as never).tick(),
        () => new WorkflowSlaScheduler(sla as never, ds, monitor as never, gate as never).handleSlaCheck(),
        () => new CustomerCreditSchedulerService(ds, credit as never, monitor as never, recipients as never, gate as never).runDailyCreditRefresh(),
        () => new EggInventorySchedulerService(ds, inventory as never, monitor as never, recipients as never, gate as never).runDailyMaintenance(),
        () => new FarmCronService(ds, monitor as never, gate as never).updateMedicationStatus(),
        () => new ArReconciliationService(ds, {} as never, {} as never, monitor as never, gate as never).cronMonthlyReconciliation(),
      ],
      manual: [
        () => iot.syncAllRealtime(),
        () => iot.syncHistoryCatchUp('house', '2026-01-01', '2026-01-02', []),
        () => iot.backfillAllHistory(),
        () => iot.probeVendorAuth(),
        () => iot.fetchRealtimeProxy('house'),
        () => iot.listVendorHouses(),
        () => iot.dumpVendorHistory('house', '2026-01-01', []),
        () => new CustomerCreditSchedulerService(ds, credit as never, monitor as never, recipients as never, gate as never).runManually(),
        () => new EggInventorySchedulerService(ds, inventory as never, monitor as never, recipients as never, gate as never).runManually(),
        () => new ArReconciliationService(ds, {} as never, {} as never, monitor as never, gate as never).runMonthlyReconciliationNow(),
      ],
    };
  }

  it.each(Array.from({ length: 7 }, (_, i) => i))('FENCED cron %i skips before queries, monitor writes, locks or notifications', async (index: number) => {
    const f = fixtures();
    await f.scheduled[index]();
    expect(f.gate.runScheduled).toHaveBeenCalledTimes(1);
    expect(f.query).not.toHaveBeenCalled();
    expect(f.monitor.runGuarded).not.toHaveBeenCalled();
    expect(f.monitor.ok).not.toHaveBeenCalled();
    expect(f.dispatcher.fire).not.toHaveBeenCalled();
    expect(f.sla.checkOverdueTasks).not.toHaveBeenCalled();
  });

  it.each(Array.from({ length: 10 }, (_, i) => i))('FENCED shared/manual operation %i rejects before business/provider side effects', async (index: number) => {
    const f = fixtures();
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      await expect(f.manual[index]()).rejects.toBe(denied);
      expect(f.gate.run).toHaveBeenCalledTimes(1);
      expect(f.query).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(f.credit.refreshCustomerCredit).not.toHaveBeenCalled();
      expect(f.inventory.markExpiredBatches).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it('keeps scheduled notification task pending through asynchronous delivery completion', async () => {
    let release!: () => void;
    const work = new Promise<void>(resolve => { release = resolve; });
    const query = jest.fn().mockResolvedValue([{ rule_code: 'fixture', trigger_config: { cron: '* * * * *' } }]);
    const dispatcher = { fire: jest.fn().mockReturnValue(work) };
    const gate = { runScheduled: jest.fn((_name: string, _kind: string, fn: () => Promise<unknown>) => fn()) };
    const monitor = { runGuarded: jest.fn((_name: string, fn: () => Promise<unknown>) => fn()) };
    const service = new NotificationSchedulerService({ query } as never, dispatcher as never, monitor as never, gate as never);
    let done = false;
    const tick = service.tick().then(() => { done = true; });
    await new Promise(resolve => setImmediate(resolve));
    expect(dispatcher.fire).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    release();
    await tick;
    expect(done).toBe(true);
  });
});
