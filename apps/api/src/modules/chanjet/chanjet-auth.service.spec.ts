import { chanjetBackgroundFixture } from './chanjet-background.test-fixture';
import {
  ChanjetAuthService,
  getChanjetBusinessFailure,
  isHealthyAccountBookResponse,
} from './chanjet-auth.service';
import { withReadonlyOrchestration } from './chanjet-readonly-execution';

function createService(options: {
  envCertificate?: string;
  persistedCertificate?: string | null;
  persistedTokens?: Record<string, { openToken: string; expiresAt: number }> | null;
  budgetQuery?: jest.Mock;
  background?: ReturnType<typeof chanjetBackgroundFixture>;
} = {}) {
  const stateRepo = {
    findOneBy: jest.fn().mockResolvedValue({
      key: 'singleton',
      appTicket: 'persisted-ticket',
      certificate: options.persistedCertificate ?? null,
      tokens: options.persistedTokens ?? null,
    }),
    save: jest.fn().mockResolvedValue(undefined),
    ...(options.budgetQuery ? {
      manager: {
        transaction: jest.fn(async (work: (tx: { query: jest.Mock }) => Promise<unknown>) => work({
          query: options.budgetQuery as jest.Mock,
        })),
      },
    } : {}),
  };
  const values: Record<string, string> = {
    CHANJET_APP_KEY: 'app-key',
    CHANJET_APP_SECRET: 'app-secret',
    CHANJET_ORG_ID: 'org-id',
    CHANJET_MSG_SECRET: '',
    CHANJET_CERT: options.envCertificate ?? '',
  };
  const service = new ChanjetAuthService({ get: jest.fn((key: string, fallback = '') => values[key] ?? fallback) } as never, stateRepo as never, { ok: jest.fn(), fail: jest.fn() } as never, (options.background ?? chanjetBackgroundFixture()).service);
  return { service, stateRepo };
}

describe('Chanjet business response guard', () => {
  it('rejects a new business call after orchestration ownership is lost without touching authentication or fetch', async () => {
    const { service } = createService();
    const transport = jest.spyOn(global, 'fetch');
    try {
      await expect(withReadonlyOrchestration('fixture-run', () => service.callApi('/accounting/gl/statistics/receive'), () => { throw Error('READONLY_HOLD_SESSION_LOST'); })).rejects.toThrow('READONLY_HOLD_SESSION_LOST');
      expect(transport).not.toHaveBeenCalled();
    } finally { transport.mockRestore(); }
  });
  it('rejects HTTP-200 business failure envelopes', () => {
    expect(getChanjetBusinessFailure({
      success: 'false',
      code: 'pub.e9002',
      msg: '参数不合法',
      data: null,
      requestId: 'REQ-1',
    })).toEqual({
      code: 'pub.e9002',
      message: '参数不合法',
      requestId: 'REQ-1',
    });
  });

  it('rejects provider error envelopes that omit the message', () => {
    expect(getChanjetBusinessFailure({
      code: 50000,
      status: 404,
      message: null,
      requestId: 'REQ-NO-MESSAGE',
    })).toEqual({
      code: '50000',
      message: '好业财返回业务失败',
      requestId: 'REQ-NO-MESSAGE',
    });
  });

  it('accepts successful response envelopes and ordinary entity rows', () => {
    expect(getChanjetBusinessFailure({ success: 'true', code: '200', data: [] })).toBeNull();
    expect(getChanjetBusinessFailure({
      code: 'openApi.e0000',
      msg: 'success',
      data: [],
      requestId: 'REQ-EMPTY-SUCCESS',
    })).toBeNull();
    expect(getChanjetBusinessFailure({ code: '1001', name: '现金账户', balance: 10 })).toBeNull();
    expect(getChanjetBusinessFailure({ code: '50000', status: 'ACTIVE', name: '合法业务对象' })).toBeNull();
  });
});

describe('Chanjet account-book health response', () => {
  it('accepts direct arrays and supported provider envelopes', () => {
    expect(isHealthyAccountBookResponse([{ id: 'BOOK-1' }])).toBe(true);
    expect(isHealthyAccountBookResponse({ code: '200', value: [] })).toBe(true);
    expect(isHealthyAccountBookResponse({ data: [{ id: 'BOOK-1' }] })).toBe(true);
  });

  it('rejects malformed and explicit failure responses', () => {
    expect(isHealthyAccountBookResponse(null)).toBe(false);
    expect(isHealthyAccountBookResponse({ code: '50111', message: 'permission denied' })).toBe(false);
  });
});

describe('Chanjet authorization lifecycle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prefers the callback-persisted certificate over a stale env bootstrap value', async () => {
    const { service } = createService({
      envCertificate: 'old-env-certificate',
      persistedCertificate: 'new-callback-certificate',
    });
    jest.spyOn(global, 'setImmediate').mockImplementation(() => 0 as never);

    await service.onModuleInit();

    expect((service as unknown as { cert: string }).cert).toBe('new-callback-certificate');
  });

  it('invalidates cached openTokens when the enterprise certificate changes', () => {
    const { service, stateRepo } = createService();
    const internals = service as unknown as {
      cert: string;
      tokenCache: Map<string, { openToken: string; expiresAt: number }>;
    };
    internals.cert = 'old-certificate';
    internals.tokenCache.set('org-id', {
      openToken: 'old-open-token',
      expiresAt: Date.now() + 60_000,
    });

    service.setCertificate('new-certificate');

    expect(internals.tokenCache.size).toBe(0);
    expect(internals.cert).toBe('new-certificate');
    expect(stateRepo.save).toHaveBeenCalled();
  });

  it('keeps a valid token cache when the callback repeats the same certificate', () => {
    const { service } = createService();
    const internals = service as unknown as {
      cert: string;
      tokenCache: Map<string, { openToken: string; expiresAt: number }>;
    };
    internals.cert = 'same-certificate';
    internals.tokenCache.set('org-id', {
      openToken: 'current-open-token',
      expiresAt: Date.now() + 60_000,
    });

    service.setCertificate('same-certificate');

    expect(internals.tokenCache.size).toBe(1);
  });

  it('coalesces concurrent identical reads and serves the short cache', async () => {
    const { service } = createService({
      persistedCertificate: 'certificate',
      persistedTokens: {
        'org-id': { openToken: 'open-token', expiresAt: Date.now() + 120_000 },
      },
    });
    jest.spyOn(global, 'setImmediate').mockImplementation(() => 0 as never);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ code: '200', data: [{ id: 'ROW-1' }] }),
    } as Response);
    await service.onModuleInit();

    const [first, second] = await Promise.all([
      service.callApi('/accounting/openapi/cc/book/findByEnterpriseId', { method: 'GET' }),
      service.callApi('/accounting/openapi/cc/book/findByEnterpriseId', { method: 'GET' }),
    ]);
    const third = await service.callApi('/accounting/openapi/cc/book/findByEnterpriseId', { method: 'GET' });

    expect(first).toEqual(second);
    expect(third).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('caps reads below the total daily budget to reserve write capacity', async () => {
    const budgetQuery = jest.fn().mockResolvedValue([{ request_count: 1 }]);
    const { service } = createService({ budgetQuery });
    const reserve = (service as unknown as {
      reserveTrafficBudget: (kind: 'READ' | 'WRITE', path: string) => Promise<void>;
    }).reserveTrafficBudget.bind(service);

    await reserve('READ', '/readonly');
    await reserve('WRITE', '/write');

    // deadline-bound timeout SET LOCAL statements precede the budget keys and
    // are filtered out; the bound key sequence itself is unchanged
    const budgetCalls = budgetQuery.mock.calls
      .filter((call) => !String(call[0]).includes('SET LOCAL'))
      .map((call) => call[1]?.[0]);
    expect(budgetCalls).toEqual([
      expect.stringMatching(/^M:/),
      expect.stringMatching(/^D:/),
      expect.stringMatching(/^R:/),
      expect.stringMatching(/^M:/),
      expect.stringMatching(/^D:/),
      expect.stringMatching(/^W:/),
    ]);
    const readReservation = budgetQuery.mock.calls.find((call) => String(call[1]?.[0]).startsWith('R:'));
    const dailyReservation = budgetQuery.mock.calls.find((call) => String(call[1]?.[0]).startsWith('D:'));
    expect(readReservation?.[1]?.[1]).toBe(620);
    expect(dailyReservation?.[1]?.[1]).toBe(650);
    expect(service.diagnostics().trafficPolicy).toMatchObject({
      dailyLocalBudget: 650,
      dailyReadBudget: 620,
      dailyWriteBudget: 20,
    });
  });
});


describe('Chanjet background admission', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fenced startup suppresses auth bootstrap even when sync flags alone would not stop authentication', async () => {
    const background = chanjetBackgroundFixture(['CHANJET_AUTH', 'CHANJET_SYNC']);
    const { service, stateRepo } = createService({ background });
    stateRepo.findOneBy.mockResolvedValue(null as never);
    const send = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('unexpected provider send'));
    await service.onModuleInit();
    await background.settle();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(send).not.toHaveBeenCalled();
    expect(background.calls).toContainEqual({ name: 'chanjet-auth-bootstrap', kind: 'CHANJET_AUTH' });
  });

  it('direct manual auth and business calls refuse before provider, budget, cache, or persistence work', async () => {
    const background = chanjetBackgroundFixture(['CHANJET_AUTH', 'CHANJET_SYNC']);
    const { service, stateRepo } = createService({ background });
    const send = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('unexpected provider send'));
    const budget = jest.spyOn(service as never, 'reserveTrafficBudget' as never);
    await expect(service.triggerAppTicket()).rejects.toThrow('BACKGROUND_ADMISSION_DENIED');
    await expect(service.fetchCertificateByAuthCode('synthetic-code')).rejects.toThrow('BACKGROUND_ADMISSION_DENIED');
    await expect(service.getOpenToken()).rejects.toThrow('BACKGROUND_ADMISSION_DENIED');
    await expect(service.callApi('/accounting/gl/statistics/receive')).rejects.toThrow('BACKGROUND_ADMISSION_DENIED');
    expect(send).not.toHaveBeenCalled();
    expect(budget).not.toHaveBeenCalled();
    expect(stateRepo.save).not.toHaveBeenCalled();
  });

  it('fenced token and health Cron skip provider calls and keep the token cache intact', async () => {
    const background = chanjetBackgroundFixture(['CHANJET_AUTH']);
    const { service } = createService({ background });
    await service.onModuleInit();
    const token = jest.spyOn(service, 'getOpenToken');
    const health = jest.spyOn(service, 'listAccountBooks');
    await service.cronRefreshToken();
    await service.cronHealthCheck();
    expect(token).not.toHaveBeenCalled();
    expect(health).not.toHaveBeenCalled();
  });

  it('tracks callback persistence until its write has settled without changing callback memory semantics', async () => {
    const background = chanjetBackgroundFixture();
    const { service, stateRepo } = createService({ background });
    let finish!: () => void;
    stateRepo.save.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    service.setAppTicket('synthetic-ticket');
    expect(service.getAppTicket()).toBe('synthetic-ticket');
    expect(background.pending.size).toBe(1);
    finish();
    await background.settle();
    expect(background.pending.size).toBe(0);
  });
});

describe('Chanjet deadline continuation drain coverage', () => {
  it('retains a timed-out budget acquisition until the transaction settles and refuses its late SQL', async () => {
    const background = chanjetBackgroundFixture();
    const { service, stateRepo } = createService({ background });
    let release!: () => void;
    const poolWait = new Promise<void>((resolve) => { release = resolve; });
    const query = jest.fn();
    Object.assign(stateRepo, { manager: { transaction: async (work: (tx: { query: jest.Mock }) => Promise<unknown>) => {
      await poolWait;
      return work({ query });
    } } });
    await expect(service['reserveTrafficBudget']('READ', '/synthetic', new Date(Date.now() + 15))).rejects.toThrow('CHANJET_EXECUTION_DEADLINE');
    expect(background.pending.size).toBe(1);
    expect(query).not.toHaveBeenCalled();
    release();
    await background.settle();
    expect(query).not.toHaveBeenCalled();
    expect(background.pending.size).toBe(0);
  });

  it('retains an abandoned FIFO traffic slot through its predecessor and timer settlement', async () => {
    const background = chanjetBackgroundFixture();
    const { service } = createService({ background });
    let release!: () => void;
    service['trafficQueue'] = new Promise<void>((resolve) => { release = resolve; });
    await expect(service['waitForTrafficSlot'](new Date(Date.now() + 15))).rejects.toThrow('CHANJET_EXECUTION_DEADLINE');
    expect(background.pending.size).toBe(1);
    release();
    await background.settle();
    expect(background.pending.size).toBe(0);
    await expect(service['trafficQueue']).resolves.toBeUndefined();
  });
});
