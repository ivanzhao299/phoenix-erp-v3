import { classifyChanjetSyncFailure } from './chanjet-integration.service';
import { ChanjetCallbackController } from './chanjet-callback.controller';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import { approvedReadonlyPolicy, requireApprovedReadonlyRequest, readonlyScheduleEnabled, readonlyFailureCode } from './chanjet-readonly-policy';
import { readonlyApprovalFixture, installReadonlyApprovalFixture } from './chanjet-readonly-policy.test-fixture';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetArSyncService } from './chanjet-ar-sync.service';
describe('approved Chanjet production readonly policy', () => {
  let restore: () => void;
  beforeEach(() => { restore = installReadonlyApprovalFixture(); });
  afterEach(() => restore());
  it.each([undefined, '', 'HOLD', 'true', 'ACTIVE'])('unknown/default policy %s stays held', mode => {
    if (mode === undefined) delete process.env.CHANJET_SYNC_POLICY; else process.env.CHANJET_SYNC_POLICY = mode;
    expect(() => approvedReadonlyPolicy()).toThrow(); expect(readonlyScheduleEnabled()).toBe(false);
  });
  it.each([undefined, 'true', '', 'FALSE'])('requires explicit inbound=false, got %s', value => {
    if (value === undefined) delete process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED; else process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED = value;
    expect(() => approvedReadonlyPolicy()).toThrow();
  });
  it('requires exact approved book/company; financial source status grants no mapping permission', () => {
    expect(() => requireApprovedReadonlyRequest({ bookId: 'UNREVIEWED' })).toThrow();
    expect(() => requireApprovedReadonlyRequest({ bookId: 'BOOK-1' }, 'COMP-2')).toThrow();
    expect(requireApprovedReadonlyRequest({ bookId: 'BOOK-1' }, 'COMP-1').sourceClassification).toBe('PRODUCTION_DATA');
  });
  it('VERIFY grants only one exact book/period/scope and keeps timers held', () => {
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    const p = { ...readonlyApprovalFixture, verification: { ...readonlyApprovalFixture.verification, expiresAt: new Date(Date.now() + 60000).toISOString() } };
    process.env.CHANJET_READONLY_APPROVAL = JSON.stringify(p);
    expect(readonlyScheduleEnabled()).toBe(false);
    expect(() => requireApprovedReadonlyRequest({})).toThrow();
    expect(() => requireApprovedReadonlyRequest({ bookId: 'BOOK-2', period: '202610', scope: ['RECEIVABLE_STATISTICS'] })).toThrow();
    expect(() => requireApprovedReadonlyRequest({ bookId: 'BOOK-1', period: '202609', scope: ['RECEIVABLE_STATISTICS'] })).toThrow();
    expect(() => requireApprovedReadonlyRequest(p.verification)).not.toThrow();
  });
  it('expires VERIFY and requires successful orchestration evidence for ACTIVE', () => {
    process.env.CHANJET_SYNC_POLICY = 'READONLY_VERIFY';
    process.env.CHANJET_READONLY_APPROVAL = JSON.stringify({ ...readonlyApprovalFixture, verification: { ...readonlyApprovalFixture.verification, expiresAt: new Date(0).toISOString() } });
    expect(() => approvedReadonlyPolicy()).toThrow();
    process.env.CHANJET_SYNC_POLICY = 'READONLY_ACTIVE';
    process.env.CHANJET_READONLY_APPROVAL = JSON.stringify({ ...readonlyApprovalFixture, verifiedRunId: undefined });
    expect(() => approvedReadonlyPolicy()).toThrow();
  });
  it('stops remote mutation before token, budget, cache, or fetch access even when caller labels it READ', async () => {
    const subject = Object.create(ChanjetAuthService.prototype);
    await expect(subject.callApi('/accounting/openapi/cc/party/custvendor/update/BOOK-1', { kind: 'READ', method: 'POST' })).rejects.toThrow('CHANJET_EXTERNAL_WRITE_DISABLED');
  });
  it('does not seed bindings on activation or on company list read', async () => {
    const maps = { find: jest.fn().mockResolvedValue([]), insert: jest.fn() };
    const ar = new ChanjetArSyncService({} as never, {} as never, maps as never, {} as never, {} as never);
    await ar.onModuleInit(); await expect(ar.listCompanies()).resolves.toEqual([]); expect(maps.insert).not.toHaveBeenCalled();
  });
  it('does not leak provider amounts, credential strings or raw payloads in failure classification', () => {
    const error = new Error('timeout appSecret=SECRET customer=Alice amount=193.44');
    expect(readonlyFailureCode(error)).toBe('READONLY_HOLD_TIMEOUT');
    expect(readonlyFailureCode(new Error('token=SECRET forbidden 403'))).toBe('READONLY_HOLD_REMOTE_AUTH');
  });
  it('prevents direct mirror service calls from bypassing the durable queue and advisory lock', async () => {
    const flag = process.env.CHANJET_READONLY_SYNC_ENABLED;
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    try {
      const mirror = Object.create(ChanjetIntegrationService.prototype);
      await expect(mirror.syncReadOnlyMirror(['RECEIVABLE_STATISTICS'], 'BOOK-1', '202610')).rejects.toMatchObject({ response: { reason: 'READONLY_ORCHESTRATION_REQUIRED' } });
    } finally { if (flag === undefined) delete process.env.CHANJET_READONLY_SYNC_ENABLED; else process.env.CHANJET_READONLY_SYNC_ENABLED = flag; }
  });

  it('retains caller company authorization before dispatching the background queue', async () => {
    const controller = Object.create(ChanjetCallbackController.prototype) as ChanjetCallbackController;
    const raw = controller as unknown as Record<string, unknown>;
    raw.cls = { get: () => ({ isGlobal: false, allowedCompanyCodes: ['COMP-2'] }) };
    raw.integration = { accountBookMappingGate: jest.fn().mockResolvedValue({ mappings: [{ bookId: 'BOOK-1', companyCode: 'COMP-1', status: 'VALID', syncEnabled: true }] }) };
    const enqueue = jest.fn(); raw.readonlySyncScheduler = { enqueueManualSync: enqueue };
    await expect(controller.enqueueIntegrationAlignmentCycle({ bookId: 'BOOK-1' }, { user: { username: 'company-2-finance' } })).rejects.toThrow('CHANJET_SYNC_COMPANY_SCOPE_DENIED');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each(['READONLY_HOLD_MAPPING','READONLY_HOLD_UNSUPPORTED','READONLY_HOLD_REMOTE_AUTH','READONLY_HOLD_RATE_LIMIT'])('does not retry unrecoverable sanitized %s', code => {
    expect(classifyChanjetSyncFailure(code).retryEligible).toBe(false);
  });
  it('rejects unauthorized AR company before inspecting maps or reading remote data', async () => {
    const flag = process.env.CHANJET_READONLY_SYNC_ENABLED; process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    try {
      const provider = { callApi: jest.fn() }; const maps = { findOneBy: jest.fn() };
      const service = new ChanjetArSyncService(provider as never, {} as never, maps as never, {} as never, { get: () => ({ isGlobal: false, allowedCompanyCodes: ['COMP-2'] }) } as never);
      await expect(service.syncByCompanyCode('COMP-1', '202610')).rejects.toThrow('CHANJET_AR_COMPANY_SCOPE_DENIED');
      expect(maps.findOneBy).not.toHaveBeenCalled(); expect(provider.callApi).not.toHaveBeenCalled();
    } finally { if(flag === undefined) delete process.env.CHANJET_READONLY_SYNC_ENABLED; else process.env.CHANJET_READONLY_SYNC_ENABLED = flag; }
  });

});
