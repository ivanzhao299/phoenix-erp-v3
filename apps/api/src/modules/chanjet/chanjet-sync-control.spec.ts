import { explicitTrue, readonlySyncEnabled, erpInboundEnabled } from './chanjet-sync-control';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import { ChanjetArSyncService } from './chanjet-ar-sync.service';
import { ChanjetErpInboundSyncService } from './chanjet-erp-inbound-sync.service';

describe('Chanjet execution hold contract', () => {
  const previous = { readonly: process.env.CHANJET_READONLY_SYNC_ENABLED, inbound: process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED };
  afterEach(() => {
    for (const [key, value] of Object.entries({ CHANJET_READONLY_SYNC_ENABLED: previous.readonly, CHANJET_ERP_INBOUND_SYNC_ENABLED: previous.inbound })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  it.each([undefined, '', 'false', 'FALSE', '0', '1', 'yes', 'true,false'])('ambiguous or absent %s is disabled', value => {
    expect(explicitTrue(value)).toBe(false);
  });
  it.each(['true', 'TRUE', ' true '])('only explicit %s enables', value => {
    expect(explicitTrue(value)).toBe(true);
  });
  it.each([['false', 'false', false, false], ['false', 'true', false, true], ['true', 'false', true, false], ['true', 'true', true, true]])('keeps readonly=%s and inbound=%s independent', (readonly, inbound, ro, erp) => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = String(readonly);
    process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED = String(inbound);
    expect(readonlySyncEnabled()).toBe(ro); expect(erpInboundEnabled()).toBe(erp);
  });
  it.each(['refreshAccountBooks', 'probe', 'syncReadOnlyMirror', 'syncReadOnlyMirrorResilient', 'runReadonlyAlignmentCycle', 'analyzeFieldGaps', 'runMappingReconciliation'])('guards direct %s before dependencies are accessed', async method => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'false';
    // No dependencies installed: a missing boundary would throw TypeError or perform work.
    const subject = Object.create(ChanjetIntegrationService.prototype);
    await expect(subject[method]()).rejects.toMatchObject({ response: { reason: 'SYNC_DISABLED' } });
  });
  it('guards independent AR snapshot refresh before remote access or replacement', async () => {
    delete process.env.CHANJET_READONLY_SYNC_ENABLED;
    const subject = Object.create(ChanjetArSyncService.prototype);
    await expect(subject.syncByCompanyCode('TEST', '202610')).rejects.toMatchObject({ response: { reason: 'SYNC_DISABLED' } });
  });
  it('AR bootstrap seed does not refresh runtime while held', async () => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'false';
    const subject = Object.create(ChanjetArSyncService.prototype);
    await expect(subject.onModuleInit()).resolves.toBeUndefined();
  });
  it('direct scheduled inbound does not inspect/apply plans when held', async () => {
    process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED = 'false';
    const subject = Object.create(ChanjetErpInboundSyncService.prototype);
    await expect(subject.syncScheduledShareholderBalances('202610', 'operator')).rejects.toMatchObject({ response: { reason: 'ERP_INBOUND_DISABLED' } });
  });
  it('independent AR ledger import is held before ledger writes when inbound=false', async () => {
    process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED = 'false';
    const subject = Object.create(ChanjetArSyncService.prototype);
    await expect(subject.importToArLedger('TEST', '202610')).rejects.toMatchObject({ response: { reason: 'ERP_INBOUND_DISABLED' } });
  });
  it.each([false, true])('inbound service gate cannot be bypassed with trustedScheduler=%s', async trusted => {
    process.env.CHANJET_READONLY_SYNC_ENABLED = 'true';
    process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED = 'false';
    const subject = Object.create(ChanjetErpInboundSyncService.prototype);
    await expect(subject.applyShareholderPlan('202610', 'hash', 'operator', 'SYNC_CHANJET_ACCOUNTING_FACTS_TO_ERP', trusted)).rejects.toMatchObject({ response: { reason: 'ERP_INBOUND_DISABLED' } });
  });
});
