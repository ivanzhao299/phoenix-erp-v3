import { EggInventorySchedulerService } from './egg-inventory-scheduler.service';

describe('EggInventorySchedulerService notifications', () => {
  it('propagates notification delivery failures instead of swallowing them', async () => {
    const ds = { query: jest.fn()
      .mockResolvedValueOnce([{ config_value: '7' }])
      .mockResolvedValueOnce([{ config_value: '3' }]) };
    const inventory = {
      markExpiredBatches: jest.fn().mockResolvedValue({ expired: 0, written: 0 }),
      getExpiringBatches: jest.fn().mockResolvedValue([{
        batch_no: 'B-1', product_code: 'EGG', qty_available: 10,
        company_code: 'COMP-A', days_remaining: 2,
      }]),
    };
    const recipients = { resolve: jest.fn().mockRejectedValue(new Error('recipient lookup failed')) };
    const service = new EggInventorySchedulerService(
      ds as never, inventory as never, { ok: jest.fn(), fail: jest.fn() } as never, recipients as never,
      { run: (_name: string, _kind: string, work: () => Promise<unknown>) => work() } as never,
      { run: async (_name: string, work: () => Promise<unknown>) => ({ acquired: true, value: await work() }) } as never,
    );
    await expect(service.runManually()).rejects.toThrow('recipient lookup failed');
  });
});
