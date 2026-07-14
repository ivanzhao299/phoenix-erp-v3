import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';

describe('ChanjetReadonlySyncScheduler', () => {
  const previousEnabled = process.env.CHANJET_READONLY_SYNC_ENABLED;

  afterEach(() => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = previousEnabled;
    jest.restoreAllMocks();
  });

  it('uses one dedicated database connection for advisory lock and unlock', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    const query = jest.fn()
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query,
      release: jest.fn().mockResolvedValue(undefined),
    };
    const integration = {
      syncReadOnlyMirrorResilient: jest.fn().mockResolvedValue({
        decision: 'GO',
        results: [{ key: 'ACCOUNT_BOOKS', bookId: '', status: 'SUCCESS' }],
        attempts: 1,
        unresolvedFailures: [],
      }),
      confirmDeterministicCounterpartyMappings: jest.fn().mockResolvedValue({ approved: 2 }),
    };
    const cronMonitor = {
      ok: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
    const scheduler = new ChanjetReadonlySyncScheduler(
      integration as never,
      cronMonitor as never,
      dataSource as never,
    );

    await scheduler.runScheduledSync();

    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('pg_try_advisory_lock'), ['chanjet-full-readonly-sync']);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('pg_advisory_unlock'), ['chanjet-full-readonly-sync']);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(integration.syncReadOnlyMirrorResilient).toHaveBeenCalledWith([], undefined, expect.stringMatching(/^\d{6}$/), 3);
    expect(integration.confirmDeterministicCounterpartyMappings).toHaveBeenCalledWith('system:chanjet-readonly-sync');
    expect(cronMonitor.ok).toHaveBeenCalledTimes(1);
    expect(cronMonitor.fail).not.toHaveBeenCalled();
  });

  it('records HOLD as a monitored failure and still releases the lock', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    const query = jest.fn()
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query,
      release: jest.fn().mockResolvedValue(undefined),
    };
    const integration = {
      syncReadOnlyMirrorResilient: jest.fn().mockResolvedValue({
        decision: 'HOLD',
        results: [],
        attempts: 3,
        unresolvedFailures: [{ key: 'VOUCHERS', bookId: 'BOOK-1', error: 'timeout' }],
      }),
      confirmDeterministicCounterpartyMappings: jest.fn(),
    };
    const cronMonitor = {
      ok: jest.fn(),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
    const scheduler = new ChanjetReadonlySyncScheduler(
      integration as never,
      cronMonitor as never,
      dataSource as never,
    );

    await scheduler.runScheduledSync();

    expect(cronMonitor.fail).toHaveBeenCalledWith(
      'chanjet-full-readonly-sync',
      expect.stringContaining('VOUCHERS/BOOK-1=timeout'),
    );
    expect(integration.confirmDeterministicCounterpartyMappings).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
