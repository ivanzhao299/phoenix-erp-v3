import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { PackagingHistoryService } from './packaging-history.service';
import { PackagingHandoverService } from './packaging-handover.service';
import { PackagingBoxService } from './packaging-box.service';
import { PackagingWorkflowPolicy } from './packaging-workflow-policy';
import { PackagingInventoryIntegrationService } from '../sales-v2/services/packaging-inventory-integration.service';
import { EggInventoryService } from '../sales-v2/services/egg-inventory.service';
import { packingHistoryFixture } from './packaging-history.fixture';

(process.env.PACKAGING_HISTORY_PG === '1' ? describe : describe.skip)('packaging verification recovery PG', () => {
  let ds: DataSource;
  let f: Awaited<ReturnType<typeof packingHistoryFixture>>;
  let workflow: PackagingHandoverService;

  beforeAll(async () => {
    const url = process.env.PACKAGING_HISTORY_TEST_DATABASE_URL;
    const parsed = url ? new URL(url) : null;
    if (process.env.NODE_ENV !== 'test' || !parsed || !['127.0.0.1', 'localhost'].includes(parsed.hostname)
      || parsed.port !== '54329' || parsed.pathname !== '/packaging_history_test') {
      throw Error('EXPLICIT_LOCAL_PG18_HISTORY_TEST_URL_REQUIRED');
    }
    ds = new DataSource({ type: 'postgres', url, database: 'packaging_history_test', entities: [], logging: false });
    await ds.initialize();
  });
  afterAll(async () => { await ds?.destroy(); });

  beforeEach(async () => {
    f = await packingHistoryFixture(ds);
    const history = new PackagingHistoryService(ds.manager, { resolve: async () => f.scope } as any);
    const policy = new PackagingWorkflowPolicy();
    policy.get = async () => ({ version: 'TEST', R: true, B: true, P: true, V: true, H: true, Q: true,
      encodingVersion: 'TEST-NON-BUSINESS-v1', receiptMode: 'C' } as any);
    const cls = { get: (key: string) => key === 'dataScope' ? f.scope : { username: 'TEST' } };
    const inventory = new PackagingInventoryIntegrationService(ds, cls as any,
      new EggInventoryService(ds, cls as any), { resolveMode: async () => 'PACKAGING_INBOUND' } as any);
    workflow = new PackagingHandoverService(history, new PackagingBoxService(), policy, inventory);
  });

  async function command(action: string, body: any) {
    const d = await workflow.detail(f.prefix, f.req);
    return workflow.command(action, f.prefix, randomUUID(), { expectedRevision: d.revision, ...body }, f.req);
  }

  it('restores distinct per-box proofs across sessions for the same operator and hides them from another operator', async () => {
    await command('REGISTER', { registrationKind: 'FIRST_LABEL_CONFIRMED', reason: 'TEST fixture only',
      items: f.outputs.map((_: any, outputOrdinal: number) => ({ outputOrdinal, boxOrdinal: 1, declaration: 'TEST fixture only' })) });
    const registered = await workflow.detail(f.prefix, f.req);
    const boxIds = registered.boxes.map((box: any) => box.boxId);

    for (const purpose of ['LABEL_CHECK', 'HANDOVER'] as const) {
      const first = await command('SESSION', { purpose });
      const second = await command('SESSION', { purpose });
      for (const [index, session] of [first, second].entries()) {
        const box = registered.boxes[index];
        const label = box.labels.find((item: any) => item.kind === 'CANONICAL').code;
        await command('SCAN', { boxId: box.boxId, labelCode: label, method: 'MANUAL', purpose, sessionId: session.eventId });
      }
    }

    const recovered = await workflow.detail(f.prefix, f.req);
    expect(recovered.verificationRecovery).toMatchObject({ actorId: String(f.actor), revision: recovered.revision });
    expect(recovered.actions.printResult).toEqual({ allowed: true, reasons: [] });
    for (const purpose of ['LABEL_CHECK', 'HANDOVER'] as const) {
      const round = recovered.verificationRecovery.rounds[purpose];
      expect(round).toBeTruthy();
      expect(Object.keys(round.scans).sort()).toEqual([...boxIds].sort());
      expect(new Set(Object.values(round.scans).map((proof: any) => proof.eventId)).size).toBe(boxIds.length);
      expect(Object.values(round.scans).every((proof: any) => Date.parse(proof.expiresAt) > Date.now())).toBe(true);
      expect(Object.values(round.scans).every((proof: any) => Boolean(proof.sessionId))).toBe(true);
    }

    const otherOperator = { ...f.req, user: { ...f.req.user, userId: randomUUID() } };
    const hidden = await workflow.detail(f.prefix, otherOperator);
    expect(hidden.verificationRecovery.rounds.LABEL_CHECK).toBeNull();
    expect(hidden.verificationRecovery.rounds.HANDOVER).toBeNull();
  });

  it('recovers an active alias only while it resolves to the registered box', async () => {
    await command('REGISTER', { registrationKind: 'LEGACY_VERIFIED', reason: 'TEST legacy labels observed',
      items: f.outputs.map((_: any, outputOrdinal: number) => ({ outputOrdinal, boxOrdinal: 1,
        declaration: 'TEST fixture only', observedLabelCode: `LEGACY-${randomUUID()}` })) });
    const registered = await workflow.detail(f.prefix, f.req);
    const session = await command('SESSION', { purpose: 'HANDOVER' });
    for (const box of registered.boxes) {
      const alias = box.labels.find((item: any) => item.kind === 'ALIAS' && item.status === 'ACTIVE' && item.resolution === 'BOUND');
      expect(alias).toBeTruthy();
      await command('SCAN', { boxId: box.boxId, labelCode: alias.code, method: 'MANUAL', purpose: 'HANDOVER', sessionId: session.eventId });
    }
    const recovered = await workflow.detail(f.prefix, f.req);
    expect(Object.keys(recovered.verificationRecovery.rounds.HANDOVER.scans).sort())
      .toEqual(registered.boxes.map((box: any) => box.boxId).sort());
  });

  it('stops recovering both purposes after expiry and rejects late scans', async () => {
    await command('REGISTER', { registrationKind: 'FIRST_LABEL_CONFIRMED', reason: 'TEST expiry fixture',
      items: f.outputs.map((_, outputOrdinal) => ({ outputOrdinal, boxOrdinal: 1, declaration: 'TEST expiry fixture' })) });
    const detail=await workflow.detail(f.prefix,f.req),box=detail.boxes[0];
    const label=box.labels.find((item:{kind:string})=>item.kind==='CANONICAL').code;
    const sessions=await Promise.all(['LABEL_CHECK','HANDOVER'].map(purpose=>command('SESSION',{purpose})));
    for(const session of sessions)
      await command('SCAN',{boxId:box.boxId,labelCode:label,method:'MANUAL',purpose:session.purpose,sessionId:session.eventId});
    const [before]=await ds.query("SELECT count(*)::int scans FROM pkg_packing_events WHERE packing_id=$1 AND event_type='BOX_VERIFIED'",[f.packingId]);
    const now=jest.spyOn(Date,'now').mockReturnValue(Date.parse(sessions[1].expiresAt)+1000);
    try {
      const expired=await workflow.detail(f.prefix,f.req);
      expect(expired.verificationRecovery.rounds).toEqual({LABEL_CHECK:null,HANDOVER:null});
      await expect(command('SCAN',{boxId:box.boxId,labelCode:label,method:'MANUAL',purpose:'HANDOVER',sessionId:sessions[1].eventId}))
        .rejects.toThrow('VERIFICATION_EXPIRED');
    } finally { now.mockRestore(); }
    const [after]=await ds.query("SELECT count(*)::int scans FROM pkg_packing_events WHERE packing_id=$1 AND event_type='BOX_VERIFIED'",[f.packingId]);
    expect(after).toEqual(before);
  });
});
