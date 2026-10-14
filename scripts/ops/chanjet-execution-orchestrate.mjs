#!/usr/bin/env node
// R4.2c orchestration entry: root-reviewed admission -> probe -> first sync
// through the durable execution transport (admission-counted gateway).
//
// This CLI is the ops-side wiring of already-reviewed primitives — it adds NO
// new store/gateway/executor behavior. Production invocation happens only
// inside the separately approved exact-SHA root control workflow (the FD9 /
// production / deployed-SHA / mapping / tuple guard stack). Ordinary API
// bearers and HTTP callers have no path here: there is no listening socket
// and no HTTP route reaches registration or limit mutation.
//
// Provenance guardrails verified BEFORE any registration or provider HTTP:
//   root        — manifest passes the strict ops validator (mirrors the API)
//   floor       — manifest.approval.floorSha === --expected-floor-sha
//   FD9         — /proc/self/fd/9 must exist when --register (the caller
//                 holds the production mutation lock; mirroring
//                 production-trusted-paths)
//   deployed SHA— floor-state.deployedSha === expected floor SHA
//   mapping     — enabled chanjet_book_company_map pairs ≡ approval.books,
//                 each with an enabled chanjet_account_books row matching
//                 company_code (the auditMappingScope binding subset)
//   tuple       — floor-state.operationalTuple.CHANJET_READONLY_SYNC_ENABLED
//                 === 'false' and chanjetPolicy === 'READONLY_VERIFY'
//   approval    — floor-state.readonlyApproval.verification/books are
//                 canonically identical to the manifest approval
// Any refusal exits non-zero with CHANJET_EXECUTION_ORCHESTRATE=REFUSED_*
// and zero provider HTTP (every provider call happens only inside the
// execution scope, after all guards).
//
// HOLD semantics: a transport failure, an unconfirmed hold (settled()
// UNCONFIRMED) or an unknown commit outcome is reported as
// CHANJET_EXECUTION_ORCHESTRATE=HOLD with the real settled() state — it is
// NEVER converted into success, retried, or resumed.
//
// Usage:
//   node scripts/ops/chanjet-execution-orchestrate.mjs \
//     --manifest <json-file> --expected-floor-sha <40-hex> \
//     --floor-state <json-file> --pg-url <loopback-fixture-url> \
//     --provider-base <http://127.0.0.1:port> \
//     [--register] [--skip-registration] [--phase all|probe|sync] \
//     [--probe-path <path>] [--sync-path <path>] [--period <YYYYMM>]
//
// Exit codes: 0 verified · 2 usage · 3 refused (provenance/registration) ·
//             4 hold (transport failure / unconfirmed hold)
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const getArg = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : undefined;
};
const fail = (code, reason, extra = {}) => {
  console.log(`CHANJET_EXECUTION_ORCHESTRATE=REFUSED_${reason};${JSON.stringify(extra)}`);
  process.exit(code);
};

const manifestFile = getArg('--manifest');
const expectedFloorSha = getArg('--expected-floor-sha') || '';
const floorStateFile = getArg('--floor-state');
const pgUrl = getArg('--pg-url') || process.env.CHANJET_ADMISSION_FIXTURE_URL || '';
const providerBase = getArg('--provider-base') || '';
const phase = getArg('--phase') || 'all';
const register = args.includes('--register');
const skipRegistration = args.includes('--skip-registration');
const probePath = getArg('--probe-path') || '/accounting/gl/statistics/receive/3533914511118750';
const syncPath = getArg('--sync-path') || '/accounting/gl/statistics/receive/3533914511118750';
const period = getArg('--period') || '202610';
const root = path.resolve(process.cwd());

if (!manifestFile || !/^[a-f0-9]{40}$/.test(expectedFloorSha) || !floorStateFile) fail(2, 'USAGE');
if (!['all', 'probe', 'sync'].includes(phase)) fail(2, 'USAGE_PHASE');
if (register && skipRegistration) fail(2, 'USAGE_REGISTRATION');
if (!pgUrl) fail(2, 'PG_URL_REQUIRED');
// Connection-target guard, evaluated BEFORE any connection: only loopback
// hosts serving a dedicated disposable fixture database are accepted — the
// same contract as the registration primitive.
try {
  const parsed = new URL(pgUrl);
  const disposable = /^(chanjet_admission_fixture|chanjet_transport_fixture.*|root_admission_review)$/.test(parsed.pathname.slice(1));
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) || !disposable) fail(2, 'LOOPBACK_DISPOSABLE_FIXTURE_URL_REQUIRED');
} catch { fail(2, 'PG_URL_UNPARSEABLE'); }
// The provider base must be an explicit loopback HTTP fixture; the real
// provider is never contacted by this isolated entry.
if (!providerBase) fail(2, 'PROVIDER_BASE_REQUIRED');
try {
  const parsed = new URL(providerBase);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) fail(2, 'PROVIDER_BASE_LOOPBACK_HTTP_REQUIRED');
} catch { fail(2, 'PROVIDER_BASE_UNPARSEABLE'); }

// ---- provenance: root (strict manifest validation, ops parity validator) --
let manifest;
try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { fail(3, 'MANIFEST_UNREADABLE'); }
const { validateExecutionManifest } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'chanjet-execution-manifest.mjs'));
let binding;
try { binding = validateExecutionManifest(manifest); } catch { fail(3, 'MANIFEST_INVALID'); }
if (binding.manifest.approval.floorSha !== expectedFloorSha) fail(3, 'FLOOR_SHA_MISMATCH', { executionId: binding.manifest.executionId });

// ---- provenance: floor state (deployed SHA, policy, tuple, approval mirror)
let floorState;
try { floorState = JSON.parse(fs.readFileSync(floorStateFile, 'utf8')); } catch { fail(3, 'FLOOR_STATE_UNREADABLE'); }
const floorChecks = {
  floorSha: floorState.floorSha === expectedFloorSha,
  deployedSha: floorState.deployedSha === expectedFloorSha,
  policy: floorState.chanjetPolicy === 'READONLY_VERIFY',
  tuple: floorState.operationalTuple?.CHANJET_READONLY_SYNC_ENABLED === 'false',
};
if (Object.values(floorChecks).some((ok) => !ok)) fail(3, 'FLOOR_STATE_MISMATCH', floorChecks);
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const approval = binding.manifest.approval;
const floorApproval = floorState.readonlyApproval || {};
const verificationMatches = floorApproval.verification && canonical(floorApproval.verification) === canonical(approval.verification);
const booksMatches = Array.isArray(floorApproval.books)
  && canonical([...floorApproval.books].sort((a, b) => (a.bookId + a.companyCode < b.bookId + b.companyCode ? -1 : 1))) === canonical([...approval.books].sort((a, b) => (a.bookId + a.companyCode < b.bookId + b.companyCode ? -1 : 1)));
if (!verificationMatches || !booksMatches) fail(3, 'APPROVAL_SCOPE_CHANGED', { verificationMatches, booksMatches });

// ---- provenance: FD9 (production mutation lock held by the caller) --------
// Existence of /proc/self/fd/9 is NOT the check: a Node process always has
// internal descriptors there. The lock is verified by IDENTITY — fd 9 must
// resolve to the exact lock file the caller declared.
const fd9Lock = getArg('--fd9-lock');
if (register) {
  if (!fd9Lock) fail(2, 'USAGE_FD9_LOCK_PATH');
  let held = false;
  try { held = fs.realpathSync('/proc/self/fd/9') === fs.realpathSync(fd9Lock); } catch { held = false; }
  if (!held) fail(3, 'FD9_NOT_HELD', { executionId: binding.manifest.executionId });
}

// ---- registration through the single-sourced primitive --------------------
// NOTE: invoked only AFTER the mapping evidence check below — registration
// through this entry never precedes its provenance verification.
const registerCli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'chanjet-execution-admission-register.mjs');
const runRegistration = () => {
  if (register) {
    const spawned = spawnSync(process.execPath, [
      registerCli, '--manifest', manifestFile, '--expected-floor-sha', expectedFloorSha, '--pg-url', pgUrl, '--register',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (spawned.status !== 0) fail(3, 'REGISTRATION_REFUSED', { cliExit: spawned.status, detail: String(spawned.stdout || '').trim().split(';')[0] || 'REGISTER_CLI_FAILED' });
  } else if (!skipRegistration) {
    // dry-run validation of the registration primitive without inserting
    const spawned = spawnSync(process.execPath, [
      registerCli, '--manifest', manifestFile, '--expected-floor-sha', expectedFloorSha,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (spawned.status !== 0) fail(3, 'REGISTRATION_REFUSED', { cliExit: spawned.status });
  }
};

// ---- mapping/tuple evidence against the same database ---------------------
const apiDir = path.join(root, 'apps', 'api');
const distStore = path.join(apiDir, 'dist/modules/chanjet/chanjet-execution-admission.store.js');
const distGuard = path.join(apiDir, 'dist/modules/chanjet/chanjet-execution-guard-executor.js');
const distTransport = path.join(apiDir, 'dist/modules/chanjet/chanjet-execution-transport.js');
const distScope = path.join(apiDir, 'dist/modules/chanjet/chanjet-execution-scope.js');
const distAuth = path.join(apiDir, 'dist/modules/chanjet/chanjet-auth.service.js');
for (const file of [distStore, distGuard, distTransport, distScope, distAuth]) {
  if (!fs.existsSync(file)) fail(2, 'COMPILED_MODULE_MISSING', { file: path.basename(file) });
}
require(path.join(apiDir, 'node_modules/reflect-metadata'));
const { ChanjetExecutionAdmissionStore } = await import(pathToFileURL(distStore).href);
const { createBoundedGuardExecutor } = await import(pathToFileURL(distGuard).href);
const { ChanjetExecutionHttpGateway } = await import(pathToFileURL(distTransport).href);
const scope = await import(pathToFileURL(distScope).href);
const { ChanjetAuthService } = await import(pathToFileURL(distAuth).href);
const { DataSource } = await import(pathToFileURL(path.join(apiDir, 'node_modules/typeorm/index.js')));

process.env.CHANJET_PROVIDER_BASE_URL = providerBase.replace(/\/+$/, '');
process.env.CHANJET_SYNC_POLICY = floorState.chanjetPolicy;

const dataSource = new DataSource({ type: 'postgres', url: pgUrl, logging: false });
const guard = createBoundedGuardExecutor(pgUrl);
const ok = (summary) => { console.log(`CHANJET_EXECUTION_ORCHESTRATE=PASS;${JSON.stringify(summary)}`); };
const hold = (summary) => { console.log(`CHANJET_EXECUTION_ORCHESTRATE=HOLD;${JSON.stringify(summary)}`); process.exitCode = 4; };
await (async () => {
  try {
  await dataSource.initialize();
  const store = new ChanjetExecutionAdmissionStore(dataSource.manager);
  store.setStandaloneExecutor(guard);

  // mapping evidence BEFORE registration: the enabled mapping pairs must be
  // exactly the approved books, each bound to an enabled book of the same
  // company (the auditMappingScope binding subset over the same database)
  let evidence;
  try {
    evidence = (await dataSource.query(`SELECT json_build_object(
      'mappings', (SELECT COALESCE(json_agg(json_build_object('bookId', bookid, 'companyCode', company_code)), '[]'::json) FROM chanjet_book_company_map WHERE sync_enabled = true),
      'books', (SELECT COALESCE(json_agg(json_build_object('bookId', book_id, 'companyCode', company_code)), '[]'::json) FROM chanjet_account_books WHERE enabled = true)
    ) AS e`))[0].e;
  } catch { fail(3, 'MAPPING_EVIDENCE_UNAVAILABLE'); }
  const enabledPairs = (evidence.mappings || []).map((m) => `${m.bookId}/${m.companyCode}`).sort();
  const approvedPairs = approval.books.map((b) => `${b.bookId}/${b.companyCode}`).sort();
  const bookFor = (pair) => (evidence.books || []).some((b) => `${b.bookId}/${b.companyCode}` === pair);
  if (JSON.stringify(enabledPairs) !== JSON.stringify(approvedPairs)
    || !approvedPairs.every((pair) => bookFor(pair))) fail(3, 'MAPPING_SCOPE', { enabledPairs, approvedPairs });

  runRegistration();

  // trusted DB-owned identity: the admission row must exist and own the
  // absolute deadline; without it the run refuses with zero provider HTTP
  const row = await store.load(binding.manifest).catch(() => null);
  if (!row || row.execution_id !== binding.manifest.executionId) fail(3, 'UNREGISTERED', { executionId: binding.manifest.executionId });
  if (!(row.deadline_at instanceof Date) || !Number.isFinite(row.deadline_at.getTime())) fail(3, 'UNTRUSTED_DEADLINE');
  if (row.deadline_at.getTime() <= Date.now()) fail(3, 'EXECUTION_EXPIRED', { deadlineAt: row.deadline_at.toISOString() });

  // auth service on the real env contract (credentials never printed); the
  // state adapter reads/writes the same singleton table the API uses
  const auth = new ChanjetAuthService(
    { get: (key, fallback) => process.env[key] ?? fallback },
    {
      findOneBy: async (criteria) => (await dataSource.query('SELECT key, app_ticket, certificate, tokens FROM sys_chanjet_state WHERE key=$1', [criteria.key]))[0] || null,
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
    appTicket: 'SYNTHETIC_TICKET',
  });
  const gateway = new ChanjetExecutionHttpGateway(store, binding.manifest);

  const receiptsFor = async () => (await dataSource.query(
    'SELECT ordinal, phase, kind, status, result FROM chanjet_execution_requests WHERE execution_id=$1 ORDER BY ordinal',
    [binding.manifest.executionId],
  ));
  const runPhase = async (phaseName, leaseId, requestPhase, sendPath) => {
    const begun = await store.begin(binding.manifest, requestPhase, leaseId);
    if (!(begun?.deadline_at instanceof Date)) throw Object.assign(new Error('CHANJET_EXECUTION_SCOPE_PHASE'), { orchestrationRefusal: 'PHASE_BEGIN' });
    const current = { manifest: binding.manifest, leaseId, phase: requestPhase };
    const state = { manifest: binding.manifest, store, gateway, transport: { resend: async () => { throw new Error('CHANJET_EXECUTION_RESEND_FORBIDDEN'); } }, deadlineAt: begun.deadline_at, current };
    await scope.withExecutionScope(state, () => auth.callApi(sendPath, { method: 'GET', query: { period }, kind: 'READ' }));
    return current;
  };

  const leases = {};
  const summary = {
    executionId: binding.manifest.executionId,
    approvalId: approval.approvalId,
    floorSha: expectedFloorSha,
    deadlineAt: row.deadline_at.toISOString(),
    requestCap: binding.manifest.requestCap,
  };
  try {
    if (phase === 'all' || phase === 'probe') {
      leases.probe = `PROBE_${randomUUID().slice(0, 8)}`;
      const probeContext = await runPhase('probe', leases.probe, 'PROBING', probePath);
      await store.finish(probeContext, 'PROBED');
    }
    if (phase === 'all' || phase === 'sync') {
      leases.sync = `SYNC_${randomUUID().slice(0, 8)}`;
      const syncContext = await runPhase('sync', leases.sync, 'SYNCING', syncPath);
      await store.finish(syncContext, 'VERIFIED');
    }
  } catch (error) {
    // HOLD path: a transport failure, an unconfirmed hold or any non-OK
    // outcome is reported with its real state and never converted into
    // success, retried, or resumed.
    const settled = await gateway.settled().catch(() => 'UNKNOWN');
    let holdRow = null;
    try { holdRow = await store.load(binding.manifest); } catch { /* already reported */ }
    hold({
      ...summary,
      reason: String(error?.message || error).slice(0, 120),
      settled,
      phase: holdRow?.phase ?? null,
      holdReason: holdRow?.hold_reason ?? null,
      leases,
    });
    return;
  }
  const settled = await gateway.settled().catch(() => 'UNKNOWN');
  if (settled === 'UNCONFIRMED') {
    hold({ ...summary, reason: 'CHANJET_EXECUTION_HOLD_UNCONFIRMED', settled, leases });
    return;
  }
  const finalRow = await store.load(binding.manifest);
  ok({
    ...summary,
    verified: finalRow.phase === 'VERIFIED',
    phase: finalRow.phase,
    requestCount: finalRow.request_count,
    settled,
    leases,
    receipts: (await receiptsFor()).map((r) => ({ ordinal: r.ordinal, kind: r.kind, result: r.result, status: r.status })),
  });
} catch (error) {
  const text = String(error?.message || error);
  console.error(`CHANJET_EXECUTION_ORCHESTRATE_DIAGNOSTIC=${text.replace(/[^\x20-\x7e]/g, ' ').slice(0, 200)}`);
  hold({ reason: text.slice(0, 120) });
} finally {
  // release lifecycle: the controlled guard connection and the data source
  // are always torn down, on every exit path
  await guard.dispose().catch(() => undefined);
  if (dataSource.isInitialized) await dataSource.destroy().catch(() => undefined);
}
})();
