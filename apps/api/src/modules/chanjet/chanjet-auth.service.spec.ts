import {
  ChanjetAuthService,
  getChanjetBusinessFailure,
  isHealthyAccountBookResponse,
} from './chanjet-auth.service';

function createService(options: {
  envCertificate?: string;
  persistedCertificate?: string | null;
  persistedTokens?: Record<string, { openToken: string; expiresAt: number }> | null;
} = {}) {
  const stateRepo = {
    findOneBy: jest.fn().mockResolvedValue({
      key: 'singleton',
      appTicket: 'persisted-ticket',
      certificate: options.persistedCertificate ?? null,
      tokens: options.persistedTokens ?? null,
    }),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const values: Record<string, string> = {
    CHANJET_APP_KEY: 'app-key',
    CHANJET_APP_SECRET: 'app-secret',
    CHANJET_ORG_ID: 'org-id',
    CHANJET_MSG_SECRET: '',
    CHANJET_CERT: options.envCertificate ?? '',
  };
  const service = new ChanjetAuthService(
    { get: jest.fn((key: string, fallback = '') => values[key] ?? fallback) } as never,
    stateRepo as never,
    { ok: jest.fn(), fail: jest.fn() } as never,
  );
  return { service, stateRepo };
}

describe('Chanjet business response guard', () => {
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
});
