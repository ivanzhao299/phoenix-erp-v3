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
//   FD9         — the caller's fd 9 is verified as the DECLARED lock file AND
//                 as the process actually HOLDING the flock: a probe fd must
//                 fail to lock (someone holds it) while fd 9 itself must
//                 convert the lock (the holder is this entry's inherited
//                 description). Merely opening the file, or a lock held by an
//                 unrelated process, is refused.
//   deployed SHA— floor-state.deployedSha === expected floor SHA
//   mapping     — enabled chanjet_book_company_map pairs ≡ approval.books,
//                 each with an enabled chanjet_account_books row matching
//                 company_code (the auditMappingScope binding subset)
//   tuple       — floor-state.operationalTuple.CHANJET_READONLY_SYNC_ENABLED
//                 === 'false' and chanjetPolicy === 'READONLY_VERIFY'
//   approval    — floor-state.readonlyApproval approvalId, verification and
//                 books are canonically identical (full recursive
//                 sorted-key canonical JSON: same-length-but-different
//                 content never matches)
//   overrides   — NO CLI override of book/period/scope/endpoint exists: the
//                 provider endpoint and period are DERIVED from
//                 approval.verification alone; --probe-path/--sync-path/
//                 --period are refused outright, before registration.
// The floor-state/mapping/tuple checks are FIXTURE CONSISTENCY evidence for
// this isolated entry — they are NOT a real root-provenance proof. Real root
// provenance keeps living in the separately approved controlled root
// workflow, whose guardrails this file must not weaken or duplicate.
//
// First sync: the SYNCING provider exchange is a REHEARSAL only. VERIFIED is
// impossible without the existing alignment first-sync flow: with
// --alignment-base (+ operator token env) the orchestrator enqueues the
// reviewed alignment run through the protected API, polls it to COMPLETED
// (never HOLD), and requires the database sync-job proof bound to THIS
// approval (status SUCCESS, scope/approvalId/bookId/period match,
// erpInbound not applied, external write disabled — the
// FIRST_CONTROLLED_SYNC_PROOF semantics) before store.finish(VERIFIED).
// The second BUSINESS ACK alone can never produce VERIFIED.
//
// HOLD semantics: a transport failure, an unconfirmed hold, an unknown commit
// outcome or a sync/alignment refusal is reported as
// CHANJET_EXECUTION_ORCHESTRATE=HOLD with the real settled() state — it is
// NEVER converted into success, retried, or resumed.
//
// Usage:
//   node scripts/ops/chanjet-execution-orchestrate.mjs \
//     --manifest <json-file> --expected-floor-sha <40-hex> \
//     --floor-state <json-file> --pg-url <loopback-fixture-url> \
//     --provider-base <http://127.0.0.1:port> \
//     [--register --fd9-lock <path>] [--skip-registration] \
//     [--phase all|probe|sync|prepare-sync] \
//     [--alignment-base <http://127.0.0.1[:port][/api]> \
//      --alignment-token-env <ENV_VAR_NAME>]
//
// Exit codes: 0 verified · 2 usage · 3 refused (provenance/registration) ·
//             4 hold (transport failure / unconfirmed hold / sync refusal)
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
const alignmentBase = getArg('--alignment-base') || '';
const alignmentTokenEnv = getArg('--alignment-token-env') || '';
const fd9Lock = getArg('--fd9-lock');
const root = path.resolve(process.cwd());

// NO CLI override of the approved request shape: endpoint and period are
// derived from approval.verification alone.
if (getArg('--probe-path') || getArg('--sync-path') || getArg('--period')) fail(2, 'OVERRIDE_NOT_ALLOWED');
if (!manifestFile || !/^[a-f0-9]{40}$/.test(expectedFloorSha) || !floorStateFile) fail(2, 'USAGE');
if (!['all', 'probe', 'sync', 'prepare-sync'].includes(phase)) fail(2, 'USAGE_PHASE');
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
if (phase === 'sync') {
  // VERIFIED depends on the real alignment first-sync flow: without its base
  // (and the operator token) the sync phase cannot even start. prepare-sync
  // deliberately stops at the SYNCING handover — the protected first-sync
  // entry owns the enqueue.
  if (!alignmentBase) fail(2, 'ALIGNMENT_BASE_REQUIRED');
  try {
    const parsed = new URL(alignmentBase);
    if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) fail(2, 'ALIGNMENT_BASE_LOOPBACK_HTTP_REQUIRED');
  } catch { fail(2, 'ALIGNMENT_BASE_UNPARSEABLE'); }
  if (!alignmentTokenEnv) fail(2, 'ALIGNMENT_TOKEN_ENV_REQUIRED');
  if (!process.env[alignmentTokenEnv]) fail(3, 'ALIGNMENT_AUTH', { tokenEnv: alignmentTokenEnv });
}

// ---- provenance: root (strict manifest validation, ops parity validator) --
let manifest;
try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { fail(3, 'MANIFEST_UNREADABLE'); }
const { validateExecutionManifest } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'chanjet-execution-manifest.mjs'));
let binding;
try { binding = validateExecutionManifest(manifest); } catch { fail(3, 'MANIFEST_INVALID'); }
if (binding.manifest.approval.floorSha !== expectedFloorSha) fail(3, 'FLOOR_SHA_MISMATCH', { executionId: binding.manifest.executionId });
const approval = binding.manifest.approval;

// ---- derived request shape: from approval.verification ONLY ---------------
const SCOPE_ENDPOINTS = {
  RECEIVABLE_STATISTICS: (bookId) => `/accounting/gl/statistics/receive/${bookId}`,
};
const derivedScopes = approval.verification.scope.map((scope) => {
  const build = SCOPE_ENDPOINTS[scope];
  return { scope, endpoint: build ? build(approval.verification.bookId) : null };
});
if (derivedScopes.some((s) => !s.endpoint)) fail(3, 'UNSUPPORTED_VERIFICATION_SCOPE', { scopes: approval.verification.scope });
const derivedPeriod = approval.verification.period;
const derivedEndpoint = derivedScopes[0].endpoint;

// ---- provenance: floor state (deployed SHA, policy, tuple, approval mirror)
// Full recursive sorted-key canonical JSON: key filtering or order
// dependence would let same-length-but-different content pass.
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
let floorState;
try { floorState = JSON.parse(fs.readFileSync(floorStateFile, 'utf8')); } catch { fail(3, 'FLOOR_STATE_UNREADABLE'); }
const floorChecks = {
  floorSha: floorState.floorSha === expectedFloorSha,
  deployedSha: floorState.deployedSha === expectedFloorSha,
  policy: floorState.chanjetPolicy === 'READONLY_VERIFY',
  tuple: floorState.operationalTuple?.CHANJET_READONLY_SYNC_ENABLED === 'false',
};
if (Object.values(floorChecks).some((ok) => !ok)) fail(3, 'FLOOR_STATE_MISMATCH', floorChecks);
const floorApproval = floorState.readonlyApproval || {};
const approvalBinding = {
  approvalId: floorApproval.approvalId === approval.approvalId,
  verification: floorApproval.verification ? canonicalJson(floorApproval.verification) === canonicalJson(approval.verification) : false,
  books: Array.isArray(floorApproval.books) ? canonicalJson(floorApproval.books) === canonicalJson(approval.books) : false,
};
if (Object.values(approvalBinding).some((ok) => !ok)) fail(3, 'APPROVAL_SCOPE_CHANGED', approvalBinding);

// ---- provenance: FD9 (production mutation lock held by the caller) --------
// Three-case verification: (1) fd 9 must BE the declared lock file;
// (2) a separate probe fd must FAIL to lock it — the lock is genuinely held
// by someone (a file that was merely opened is refused here);
// (3) fd 9 itself must convert LOCK_EX|LOCK_NB — the holder is this entry's
// inherited description, not an unrelated process.
if (register) {
  if (!fd9Lock) fail(2, 'USAGE_FD9_LOCK_PATH');
  let identity = false;
  try { identity = fs.realpathSync('/proc/self/fd/9') === fs.realpathSync(fd9Lock); } catch { identity = false; }
  if (!identity) fail(3, 'FD9_NOT_HELD', { executionId: binding.manifest.executionId });
  const probeFd = fs.openSync(fd9Lock, 'r+');
  try {
    const probe = spawnSync('flock', ['-n', '3'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe', probeFd] });
    if (probe.status === 0) fail(3, 'FD9_NOT_HELD', { executionId: binding.manifest.executionId, detail: 'NOT_LOCKED' });
  } finally { fs.closeSync(probeFd); }
  const convert = spawnSync('flock', ['-n', '9'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 9] });
  if (convert.status !== 0) fail(3, 'FD9_LOCKED_ELSEWHERE', { executionId: binding.manifest.executionId });
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

// ---- compiled reviewed primitives ------------------------------------------
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
    // absolute deadline; without it the run refuses with zero provider HTTP.
    // A contended row (another transaction holds the FOR UPDATE lock) is its
    // own refusal — bounded by the store's per-statement lock bound, never
    // by waiting the deadline out.
    const row = await store.load(binding.manifest).catch(() => null);
    if (!row) {
      const exists = await dataSource.query('SELECT execution_id FROM chanjet_execution_admissions WHERE execution_id=$1', [binding.manifest.executionId]).catch(() => []);
      if (exists.length) fail(3, 'ADMISSION_ROW_CONTENDED', { executionId: binding.manifest.executionId });
      fail(3, 'UNREGISTERED', { executionId: binding.manifest.executionId });
    }
    if (row.execution_id !== binding.manifest.executionId) fail(3, 'UNREGISTERED', { executionId: binding.manifest.executionId });
    if (!(row.deadline_at instanceof Date) || !Number.isFinite(row.deadline_at.getTime())) fail(3, 'UNTRUSTED_DEADLINE');
    if (row.deadline_at.getTime() <= Date.now()) fail(3, 'EXECUTION_EXPIRED', { deadlineAt: row.deadline_at.toISOString() });
    const deadlineAt = row.deadline_at;

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
    // the DB-owned deadline flows into the phase context and EVERY store call
    // made through it (reserve/acknowledge/finish all re-validate it)
    const runPhase = async (requestPhase, leaseId, sendPath) => {
      const begun = await store.begin(binding.manifest, requestPhase, leaseId);
      if (!(begun?.deadline_at instanceof Date)) throw Object.assign(new Error('CHANJET_EXECUTION_SCOPE_PHASE'), { orchestrationRefusal: 'PHASE_BEGIN' });
      const current = { manifest: binding.manifest, leaseId, phase: requestPhase, deadlineAt: begun.deadline_at };
      lastPhaseContext = current;
      const state = { manifest: binding.manifest, store, gateway, transport: { resend: async () => { throw new Error('CHANJET_EXECUTION_RESEND_FORBIDDEN'); } }, deadlineAt: begun.deadline_at, current };
      await scope.withExecutionScope(state, () => auth.callApi(sendPath, { method: 'GET', query: { period: derivedPeriod }, kind: 'READ' }));
      return current;
    };

    // the existing alignment first-sync flow, wired through the protected
    // API contract: the enqueue NAMES the execution (executionId + the
    // SYNCING lease); the scheduler re-reads every bound attribute from the
    // admission row and the worker's provider HTTP runs inside the same
    // durable execution (cumulative cap, absolute deadline). All waits here
    // are bounded by the SAME deadline — the CLI returning never means the
    // background job stopped.
    const alignmentDeadlineMs = () => Math.max(1, Math.min(20_000, deadlineAt.getTime() - Date.now()));
    const alignmentFetch = async (suffix, options = {}) => {
      if (Date.now() >= deadlineAt.getTime()) {
        throw Object.assign(new Error('CHANJET_EXECUTION_DEADLINE'), { orchestrationRefusal: 'FIRST_SYNC' });
      }
      const url = `${alignmentBase.replace(/\/+$/, '')}/chanjet/integration/alignment/${suffix}`;
      const response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${process.env[alignmentTokenEnv]}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(alignmentDeadlineMs()),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.success === false) throw Object.assign(new Error('CHANJET_ALIGNMENT_API'), { detail: suffix });
      return body;
    };
    // strict proof: every field required, explicit types, explicit false —
    // a missing field or a wrong type never passes as "not applied"
    const syncJobProof = async (orchestrationRunId) => {
      const runs = await dataSource.query(
        `SELECT status, request_scope, result_summary FROM chanjet_sync_jobs
         WHERE request_scope->>'orchestrationRunId' = $1 ORDER BY id DESC LIMIT 1`, [orchestrationRunId]);
      const run = runs[0];
      if (!run) return false;
      const summary = run.result_summary;
      const execution = run.request_scope?.execution;
      const bindingMatches = !!execution && typeof execution === 'object' && !Array.isArray(execution)
        && canonicalJson(execution) === canonicalJson({
          executionId: binding.manifest.executionId,
          leaseId: leases.sync,
          phase: 'SYNCING',
          approvalId: approval.approvalId,
          floorSha: expectedFloorSha,
          deadlineAt: deadlineAt.toISOString(),
        });
      // FULL execution binding: the job's own scope fields must match the
      // reviewed approval and the registered floor as well
      const scopeBindingMatches = run.request_scope?.approvalId === approval.approvalId
        && run.request_scope?.floorSha === expectedFloorSha
        && run.request_scope?.bookId === approval.verification.bookId
        && run.request_scope?.period === approval.verification.period
        && canonicalJson(run.request_scope?.scope) === canonicalJson(approval.verification.scope);
      const inbound = summary?.erpInbound;
      const inboundForbidden = !!inbound && typeof inbound === 'object' && !Array.isArray(inbound)
        && inbound.applied === false;
      const sends = summary?.executionSends;
      const workerSendsDeclared = typeof sends === 'number' && Number.isInteger(sends) && sends >= 1;
      // the persisted ordinals identify EXACTLY this run's worker sends: the
      // rehearsal ACK (lower ordinals) can never satisfy them
      const ordinals = summary?.executionReceiptOrdinals;
      const ordinalsDeclared = Array.isArray(ordinals) && ordinals.length >= 1
        && ordinals.every((o) => typeof o === 'number' && Number.isInteger(o) && o > 0)
        && ordinals.length === sends;
      let ordinalsVerified = ordinalsDeclared;
      if (ordinalsDeclared) {
        // independent verification: EVERY persisted ordinal must be a real
        // counted SYNCING BUSINESS OK receipt under this execution and lease
        const [counted] = await dataSource.query(
          `SELECT count(*)::integer AS n FROM chanjet_execution_requests
            WHERE execution_id=$1 AND phase='SYNCING' AND lease_id=$2
              AND kind='BUSINESS' AND status='ACKNOWLEDGED' AND result='OK'
              AND ordinal = ANY($3::int[])`,
          [binding.manifest.executionId, leases.sync, ordinals]);
        ordinalsVerified = Number(counted?.n || 0) === ordinals.length;
      }
      // VERIFIED is committed by the scheduler's SUCCESS gate inside its
      // deadline-bounded terminal transaction — the CLI never finishes
      const admissionRows = await dataSource.query(
        'SELECT phase, hold_reason, lease_id FROM chanjet_execution_admissions WHERE execution_id=$1', [binding.manifest.executionId]);
      const verified = admissionRows[0]?.phase === 'VERIFIED'
        && admissionRows[0]?.hold_reason === ''
        && admissionRows[0]?.lease_id === '';
      return run.status === 'SUCCESS'
        && summary?.state === 'COMPLETED'
        && typeof summary.decision === 'string' && summary.decision !== 'HOLD'
        && typeof summary.externalWriteEnabled === 'boolean' && summary.externalWriteEnabled === false
        && inboundForbidden
        && workerSendsDeclared
        && ordinalsDeclared
        && ordinalsVerified
        && bindingMatches
        && scopeBindingMatches
        && verified;
    };
    const runAlignmentFirstSync = async () => {
      const accepted = await alignmentFetch('enqueue', {
        method: 'POST',
        body: JSON.stringify({
          bookId: approval.verification.bookId,
          period: approval.verification.period,
          scope: approval.verification.scope,
          maxAttempts: 1,
          execution: { executionId: binding.manifest.executionId, leaseId: leases.sync },
        }),
      });
      const orchestrationRunId = accepted?.run?.runId;
      if (!accepted?.accepted || typeof orchestrationRunId !== 'string') {
        throw Object.assign(new Error('CHANJET_ALIGNMENT_NOT_ACCEPTED'), { orchestrationRefusal: 'FIRST_SYNC' });
      }
      let terminal;
      for (let attempt = 0; attempt < 25; attempt += 1) {
        if (Date.now() >= deadlineAt.getTime()) break; // alignmentFetch re-checks too
        const status = await alignmentFetch('status');
        if (status?.run?.runId !== orchestrationRunId) {
          throw Object.assign(new Error('CHANJET_ALIGNMENT_RUN_DRIFT'), { orchestrationRefusal: 'FIRST_SYNC' });
        }
        if (['COMPLETED', 'HOLD', 'FAILED', 'SKIPPED'].includes(status.run.state)) { terminal = status.run; break; }
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.min(200, deadlineAt.getTime() - Date.now()))));
      }
      if (!terminal || terminal.state !== 'COMPLETED' || terminal.decision === 'HOLD') {
        throw Object.assign(new Error('CHANJET_ALIGNMENT_FAILURE_OR_TIMEOUT'), { orchestrationRefusal: 'FIRST_SYNC', state: terminal?.state ?? null });
      }
      if (!(await syncJobProof(orchestrationRunId))) {
        throw Object.assign(new Error('CHANJET_ALIGNMENT_FIRST_SYNC_PROOF'), { orchestrationRefusal: 'FIRST_SYNC', orchestrationRunId });
      }
      return orchestrationRunId;
    };

    const leases = {};
    let lastPhaseContext;
    const summary = {
      executionId: binding.manifest.executionId,
      approvalId: approval.approvalId,
      floorSha: expectedFloorSha,
      deadlineAt: deadlineAt.toISOString(),
      requestCap: binding.manifest.requestCap,
      derivedRequest: { endpoint: derivedEndpoint, period: derivedPeriod },
      // fixture consistency only — real root provenance remains with the
      // approved exact-SHA root control workflow
      provenance: { fd9: register ? 'HELD_BY_ENTRY' : 'NOT_CHECKED', fixtureConsistency: 'PASS' },
    };
    try {
      if (phase === 'all' || phase === 'probe' || phase === 'prepare-sync') {
        leases.probe = `PROBE_${randomUUID().slice(0, 8)}`;
        const probeContext = await runPhase('PROBING', leases.probe, derivedEndpoint);
        await store.finish(probeContext, 'PROBED');
      }
      if (phase === 'all' || phase === 'sync' || phase === 'prepare-sync') {
        leases.sync = `SYNC_${randomUUID().slice(0, 8)}`;
        const syncContext = await runPhase('SYNCING', leases.sync, derivedEndpoint);
        // the provider exchange above is the REHEARSAL receipt only. The
        // VERIFIED commit belongs exclusively to the scheduler's SUCCESS
        // gate (inside its deadline-bounded terminal transaction) — the CLI
        // never finishes the execution itself; it only VERIFIES the outcome
        // through the strict first-sync proof below.
        if (phase === 'all' || phase === 'sync') {
          const orchestrationRunId = await runAlignmentFirstSync();
          summary.firstSync = { orchestrationRunId, proof: 'FIRST_CONTROLLED_SYNC_PROOF' };
        } else {
          // prepare-sync handover: the execution stays SYNCING under its
          // lease — the protected first-sync entry (chanjet-readonly-first-sync)
          // owns the enqueue against the SAME execution, cumulative budget
          // and DB-owned deadline. The handover is persisted ATOMICALLY next
          // to the reviewed floor state: the first-sync entry reads its
          // binding from THERE (never from env or the request).
          const handoverFile = path.join(path.dirname(floorStateFile), 'prepare-sync-handover.json');
          const handoverTmp = `${handoverFile}.tmp`;
          fs.writeFileSync(handoverTmp, JSON.stringify({
            version: 1,
            target: expectedFloorSha,
            executionId: binding.manifest.executionId,
            leaseId: leases.sync,
            deadlineAt: deadlineAt.toISOString(),
            approvalId: approval.approvalId,
            floorSha: expectedFloorSha,
          }));
          fs.renameSync(handoverTmp, handoverFile);
          summary.prepareSync = { handover: 'FIRST_SYNC_ENTRY', leaseId: leases.sync, handoverFile };
        }
        void syncContext;
      }
    } catch (error) {
      // HOLD path: a transport failure, an unconfirmed hold or any non-OK
      // outcome is reported with its real state and never converted into
      // success, retried, or resumed. A first-sync failure or a deadline hit
      // DURABLY STOPS the execution through the bounded guard mechanism (the
      // CLI returning never assumes the background job stopped).
      const reasonText = String(error?.message || error);
      const reasonClass = /DEADLINE/.test(reasonText) ? 'DEADLINE' : 'CANCELLED';
      const stopContext = lastPhaseContext?.phase
        ? lastPhaseContext
        : { manifest: binding.manifest, leaseId: '', phase: 'PROBING' };
      // the durable stop is reported ACCURATELY by its REAL outcome:
      // CONFIRMED / ALREADY_STOPPED mean the stop stands; NO_HOLD_NEEDED
      // means the row was VERIFIED (nothing to stop); anything else —
      // including a thrown refusal — is UNCONFIRMED, never swallowed into a
      // persisted claim
      const stopOutcome = await store.holdExecution(stopContext, reasonClass)
        .then((result) => String(result), () => 'UNCONFIRMED');
      const stopPersisted = stopOutcome === 'CONFIRMED' || stopOutcome === 'ALREADY_STOPPED';
      const settled = await gateway.settled().catch(() => 'UNKNOWN');
      let holdRow = null;
      try { holdRow = await store.load(binding.manifest); } catch { /* already reported */ }
      hold({
        ...summary,
        reason: reasonText.slice(0, 120),
        stopPersisted,
        stopOutcome,
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
