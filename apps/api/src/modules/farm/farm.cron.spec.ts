import { FarmCronService } from './farm.cron';

describe('FarmCronService background admission', () => {
  const originalTimeZone = process.env.PHOENIX_BUSINESS_TIMEZONE;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-11T17:00:00Z'));
    process.env.PHOENIX_BUSINESS_TIMEZONE = 'Asia/Singapore';
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalTimeZone === undefined) delete process.env.PHOENIX_BUSINESS_TIMEZONE;
    else process.env.PHOENIX_BUSINESS_TIMEZONE = originalTimeZone;
  });

  function fixtures(admitted = true) {
    const query = jest.fn().mockResolvedValue([]);
    const monitor = { ok: jest.fn(), fail: jest.fn() };
    const gate = { runScheduled: jest.fn((_name: string, _kind: string, work: () => Promise<void>) =>
      admitted ? work() : Promise.resolve(undefined)) };
    const service = new FarmCronService({ query } as never, monitor as never, gate as never);
    return { service, query, monitor, gate };
  }

  it('skips medication and monitor writes while admission is fenced', async () => {
    const f = fixtures(false);
    await f.service.updateMedicationStatus();
    expect(f.gate.runScheduled).toHaveBeenCalledWith('farm.medication-status', 'LOCAL', expect.any(Function));
    expect(f.query).not.toHaveBeenCalled();
    expect(f.monitor.ok).not.toHaveBeenCalled();
    expect(f.monitor.fail).not.toHaveBeenCalled();
  });

  it('keeps MVP record transitions and business-timezone dates inside admission', async () => {
    const f = fixtures();
    await f.service.updateMedicationStatus();
    expect(f.gate.runScheduled).toHaveBeenCalledTimes(1);
    expect(f.query).toHaveBeenCalledTimes(2);
    expect(f.query).toHaveBeenNthCalledWith(1, expect.stringContaining('UPDATE "brd_medication_records"'), ['2026-11-12']);
    expect(f.query.mock.calls[0][0]).toContain("SET status = 'IN_WITHDRAWAL'");
    expect(f.query.mock.calls[0][0]).toContain('withdraw_until >= $1');
    expect(f.query).toHaveBeenNthCalledWith(2, expect.stringContaining("SET status = 'CLEARED'"), ['2026-11-12']);
    expect(f.query.mock.calls[1][0]).toContain('withdraw_until < $1');
    expect(f.monitor.ok).toHaveBeenCalledWith('farm_daily');
    expect(f.monitor.fail).not.toHaveBeenCalled();
  });

  it('records failures from admitted medication updates without reporting success', async () => {
    const f = fixtures();
    f.query.mockRejectedValueOnce(new Error('fixture database failure'));
    await f.service.updateMedicationStatus();
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.monitor.fail).toHaveBeenCalledWith('farm_daily', 'fixture database failure');
    expect(f.monitor.ok).not.toHaveBeenCalled();
  });
});
