// R4.2d production prepare: the controlled root workflow's register + probe
// + SYNCING-begin + handover, executed INSIDE the deployed API container —
// /app/dist and /app/node_modules are the DEPLOYED revision's compiled
// modules and runtime dependencies, and the DB_* / CHANJET_* environment is
// the container's own configuration. No hand-placed files: everything except
// the approved manifest (a workflow input) is already delivered.
//
// Inputs (env):
//   R42D_MANIFEST       — the approved execution manifest JSON (workflow input)
//   EXPECTED_FLOOR_SHA  — the approved floor SHA (workflow input)
//   R42D_STATE          — the state directory for the handover file
// Output:
//   PREPARE=PASS;{executionId,leaseId,deadlineAt,approvalId,floorSha} — the
//   host persists the handover JSON into the approved state directory.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Deploy layout (production): /app/dist + /app/node_modules. The isolated
// acceptance stages the SAME layout shape via R42D_DIST_ROOT/R42D_MODULES —
// the reviewed code path is identical either way.
const distRoot = process.env.R42D_DIST_ROOT || '/app/dist';
const modulesRoot = process.env.R42D_MODULES || '/app/node_modules';
const entryRequire = createRequire(pathToFileURL(path.join(distRoot, 'modules/chanjet/chanjet-execution-admission.store.js')));
entryRequire('reflect-metadata');
const { ChanjetExecutionAdmissionStore } = await import(pathToFileURL(path.join(distRoot, 'modules/chanjet/chanjet-execution-admission.store.js')).href);
const { ChanjetExecutionHttpGateway } = await import(pathToFileURL(path.join(distRoot, 'modules/chanjet/chanjet-execution-transport.js')).href);
const scopeModule = await import(pathToFileURL(path.join(distRoot, 'modules/chanjet/chanjet-execution-scope.js')).href);
const { ChanjetAuthService } = await import(pathToFileURL(path.join(distRoot, 'modules/chanjet/chanjet-auth.service.js')).href);
const { DataSource } = entryRequire(path.join(modulesRoot, 'typeorm/index.js'));
const { Client } = entryRequire(path.join(modulesRoot, 'pg'));

const fail = (reason, extra = {}) => {
  console.log(`PREPARE=HOLD;${JSON.stringify({ reason, ...extra })}`);
  process.exit(4);
};

const manifest = JSON.parse(process.env.R42D_MANIFEST || 'null');
const expectedFloorSha = process.env.EXPECTED_FLOOR_SHA || '';
const stateDir = process.env.R42D_STATE || '';
if (!manifest || typeof manifest !== 'object' || manifest.version !== 1
  || !manifest.executionId || !manifest.approval?.verification) fail('MANIFEST', { executionId: manifest?.executionId ?? null });
if (!/^[a-f0-9]{40}$/.test(expectedFloorSha) || manifest.approval.floorSha !== expectedFloorSha) fail('FLOOR_SHA_MISMATCH', { executionId: manifest.executionId });
if (!stateDir) fail('STATE_REQUIRED');

await (async () => {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'mac',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'phoenix_erp',
    logging: false,
  });
  await dataSource.initialize();
  const store = new ChanjetExecutionAdmissionStore(dataSource.manager);
  // registration (fresh run) or skip for an already-registered execution —
  // the store/guard validate the manifest identity on EVERY statement
  if (process.env.R42D_SKIP_REGISTRATION !== '1') {
    await store.registerFromReviewedRootManifest(manifest);
  }
  const auth = new ChanjetAuthService(
    { get: (key, fallback) => process.env[key] ?? fallback },
    {
      findOneBy: async (criteria) => (await dataSource.query('SELECT key, app_ticket AS "appTicket", certificate, tokens FROM sys_chanjet_state WHERE key=$1', [criteria.key]))[0] || null,
      save: async (entity) => {
        await dataSource.query(
          'INSERT INTO sys_chanjet_state (key, app_ticket, certificate, tokens) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET app_ticket=EXCLUDED.app_ticket, certificate=EXCLUDED.certificate, tokens=EXCLUDED.tokens',
          [entity.key, entity.appTicket ?? null, entity.certificate ?? null, entity.tokens ?? null],
        );
        return entity;
      },
    },
    { ok: async () => {}, fail: async () => {} },
  );
  Object.assign(auth, {
    appKey: process.env.CHANJET_APP_KEY || '',
    appSecret: process.env.CHANJET_APP_SECRET || '',
    orgId: process.env.CHANJET_ORG_ID || '',
    msgSecret: process.env.CHANJET_MSG_SECRET || '',
    cert: process.env.CHANJET_CERT || '',
    appTicket: process.env.CHANJET_APP_TICKET || 'SYNTHETIC_TICKET',
  });
  const verification = manifest.approval.verification;
  const derivedEndpoint = `/accounting/gl/statistics/receive/${verification.bookId}`;
  const gateway = new ChanjetExecutionHttpGateway(store, manifest);
  const probeLease = `PROBE_${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
  await store.begin(manifest, 'PROBING', probeLease);
  const [row] = await dataSource.query('SELECT deadline_at FROM chanjet_execution_admissions WHERE execution_id=$1', [manifest.executionId]);
  const deadlineAt = new Date(row.deadline_at);
  const probeContext = { manifest, leaseId: probeLease, phase: 'PROBING', deadlineAt };
  const current = { manifest, store, gateway, transport: { resend: async () => { throw Error('CHANJET_EXECUTION_RESEND_FORBIDDEN'); } }, deadlineAt, current: probeContext };
  await scopeModule.withExecutionScope(current, () => auth.callApi(derivedEndpoint, { method: 'GET', query: { period: verification.period }, kind: 'READ' }));
  await store.finish(probeContext, 'PROBED');
  const syncLease = `SYNC_${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
  await store.begin(manifest, 'SYNCING', syncLease);
  const handover = {
    version: 1,
    target: expectedFloorSha,
    executionId: manifest.executionId,
    leaseId: syncLease,
    deadlineAt: deadlineAt.toISOString(),
    approvalId: manifest.approval.approvalId,
    floorSha: expectedFloorSha,
  };
  const handoverFile = path.join(stateDir, 'prepare-sync-handover.json');
  const tmp = `${handoverFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(handover));
  fs.renameSync(tmp, handoverFile);
  console.log(`PREPARE=PASS;${JSON.stringify({ executionId: manifest.executionId, leaseId: syncLease, deadlineAt: deadlineAt.toISOString(), approvalId: manifest.approval.approvalId, floorSha: expectedFloorSha })}`);
  await dataSource.destroy().catch(() => undefined);
  process.exit(0);
})().catch(async (error) => {
  fail(String(error?.message || error).replace(/[^\x20-\x7e]/g, ' ').slice(0, 160));
});
