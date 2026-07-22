import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';

describe('ChanjetReadonlySyncScheduler', () => {
  const previousEnabled = process.env.CHANJET_READONLY_SYNC_ENABLED;
  const readiness = {
    generatedAt: '2026-07-21T00:00:00.000Z',
    decision: 'GO' as const,
    score: 100,
    grade: 'A' as const,
    summary: {},
    phases: [],
    blockers: [],
    conditions: [],
    tokenHealth: {},
    guardrails: {},
  };

  afterEach(() => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = previousEnabled;
    jest.restoreAllMocks();
  });

  function createQueryRunner(lockAcquired = true) {
    const query = jest.fn()
      .mockResolvedValueOnce([{ acquired: lockAcquired }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    return {
      query,
      runner: {
        connect: jest.fn().mockResolvedValue(undefined),
        query,
        release: jest.fn().mockResolvedValue(undefined),
      },
    };
  }

  function createIntegration(decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD' = 'GO') {
    return {
      runReadonlyAlignmentCycle: jest.fn().mockResolvedValue({
        decision,
        mirror: {
          results: decision === 'HOLD' ? [] : [{ key: 'ACCOUNT_BOOKS', bookId: '', status: 'SUCCESS' }],
          attempts: decision === 'HOLD' ? 3 : 1,
          unresolvedFailures: decision === 'HOLD'
            ? [{ key: 'VOUCHERS', bookId: 'BOOK-1', error: 'timeout' }]
            : [],
        },
        exactMappings: decision === 'HOLD' ? null : { approved: 2 },
        reconciliation: decision === 'HOLD' ? null : { created: 1, autoResolved: 3 },
        readiness: decision === 'HOLD' ? null : { ...readiness, decision },
        stoppedAt: decision === 'HOLD' ? 'READONLY_MIRROR' : null,
      }),
      recordCurrentStateAlert: jest.fn().mockResolvedValue(undefined),
    };
  }

  function createDataSource(queryRunner: ReturnType<typeof createQueryRunner>['runner'], query = jest.fn().mockResolvedValue([])) {
    return {
      query,
      createQueryRunner: jest.fn(() => queryRunner),
    };
  }

  function createInboundSync() {
    return {
      syncScheduledShareholderBalances: jest.fn().mockResolvedValue({
        decision: 'READY',
        applied: true,
        plan: {
          planHash: 'plan-hash',
          counts: { source: 3, mapped: 3, sourceOnly: 0 },
          blockers: [],
        },
      }),
    };
  }

  async function waitForTerminal(scheduler: ChanjetReadonlySyncScheduler) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const state = await scheduler.getRunState();
      if (['COMPLETED', 'HOLD', 'FAILED'].includes(state.state)) return state;
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('scheduler did not reach a terminal state');
  }

  it('persists one durable run and uses one dedicated connection for advisory lock lifecycle', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    const { query, runner } = createQueryRunner();
    const integration = createIntegration();
    const cronMonitor = {
      ok: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = createDataSource(runner);
    const inboundSync = createInboundSync();
    const scheduler = new ChanjetReadonlySyncScheduler(integration as never, cronMonitor as never, dataSource as never, inboundSync as never);

    await scheduler.runScheduledSync();

    expect(runner.connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('pg_try_advisory_lock'), ['chanjet-full-readonly-sync']);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('pg_advisory_unlock'), ['chanjet-full-readonly-sync']);
    expect(runner.release).toHaveBeenCalledTimes(1);
    expect(integration.runReadonlyAlignmentCycle).toHaveBeenCalledWith(
      'system:chanjet-readonly-sync', [], undefined, expect.stringMatching(/^\d{6}$/), 3,
    );
    expect(cronMonitor.ok).toHaveBeenCalledTimes(1);
    expect(cronMonitor.fail).not.toHaveBeenCalled();
    expect(integration.recordCurrentStateAlert).toHaveBeenCalledWith(expect.objectContaining({ decision: 'GO' }));
    expect(inboundSync.syncScheduledShareholderBalances).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/), 'system:chanjet-readonly-sync');
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chanjet_sync_jobs'), expect.any(Array));
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining("status = 'RUNNING'"), expect.any(Array));
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('result_summary = $4::jsonb'), expect.any(Array));
    await expect(scheduler.getRunState()).resolves.toMatchObject({ state: 'COMPLETED', decision: 'GO' });
  });

  it('records HOLD as a durable monitored failure and still releases the lock', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    const { runner } = createQueryRunner();
    const integration = createIntegration('HOLD');
    const cronMonitor = {
      ok: jest.fn(),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = createDataSource(runner);
    const scheduler = new ChanjetReadonlySyncScheduler(integration as never, cronMonitor as never, dataSource as never, createInboundSync() as never);

    await scheduler.runScheduledSync();

    expect(cronMonitor.fail).toHaveBeenCalledWith(
      'chanjet-full-readonly-sync',
      expect.stringContaining('VOUCHERS/BOOK-1=timeout'),
    );
    expect(runner.release).toHaveBeenCalledTimes(1);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('result_summary = $4::jsonb'),
      expect.arrayContaining([expect.any(String), 'FAIL']),
    );
    await expect(scheduler.getRunState()).resolves.toMatchObject({ state: 'HOLD', decision: 'HOLD' });
  });

  it('accepts a manual run immediately and exposes durable completion status for polling', async () => {
    const { runner } = createQueryRunner();
    const integration = createIntegration();
    const cronMonitor = {
      ok: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const scheduler = new ChanjetReadonlySyncScheduler(
      integration as never,
      cronMonitor as never,
      createDataSource(runner) as never,
      createInboundSync() as never,
    );

    const accepted = await scheduler.enqueueManualSync('user:admin', { period: '202607' });

    expect(accepted).toMatchObject({ accepted: true, run: { state: 'QUEUED', requestedBy: 'user:admin' } });
    await expect(waitForTerminal(scheduler)).resolves.toMatchObject({ state: 'COMPLETED', decision: 'GO' });
    expect(integration.runReadonlyAlignmentCycle).toHaveBeenCalledWith('user:admin', [], undefined, '202607', 3);
  });

  it('recovers and completes a persisted RUNNING orchestration after API restart', async () => {
    const { runner } = createQueryRunner();
    const integration = createIntegration();
    const cronMonitor = {
      ok: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const persisted = {
      status: 'RUNNING',
      request_scope: {
        orchestrationRunId: 'CHANJET-RO-RECOVER',
        requestedBy: 'user:admin',
        scope: ['ACCOUNT_BOOKS'],
        period: '202607',
        maxAttempts: 3,
        queuedAt: '2026-07-21T00:00:00.000Z',
      },
      result_summary: null,
      error_message: null,
      created_at: '2026-07-21T00:00:00.000Z',
      updated_at: '2026-07-21T00:01:00.000Z',
    };
    let recoveryStarted = false;
    const dataQuery = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT status') && !recoveryStarted) return Promise.resolve([persisted]);
      if (sql.includes('recoveredAt')) recoveryStarted = true;
      return Promise.resolve([]);
    });
    const scheduler = new ChanjetReadonlySyncScheduler(
      integration as never,
      cronMonitor as never,
      createDataSource(runner, dataQuery) as never,
      createInboundSync() as never,
    );

    scheduler.onApplicationBootstrap();

    await expect(waitForTerminal(scheduler)).resolves.toMatchObject({
      runId: 'CHANJET-RO-RECOVER',
      state: 'COMPLETED',
      decision: 'GO',
    });
    expect(integration.runReadonlyAlignmentCycle).toHaveBeenCalledWith(
      'user:admin', ['ACCOUNT_BOOKS'], undefined, '202607', 3,
    );
  });
});
