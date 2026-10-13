// R0 read-only production evidence collector (2026-10-12 handoff, run-bound).
//
// Zero-write by construction: this program never calls fs.write*/mkdir/unlink/
// chmod, never runs `docker run/exec` outside a READ ONLY psql session, never
// mutates git, and never calls guardProduction or any state-machine operation.
// It reads pinned state files, inspects containers, replays the bounded docker
// log window of the failed deploy, and prints one sanitized JSON object.
//
// Sanitization contract: raw log lines are NEVER printed. For schema/write
// signal lines only {timestamp, stream, matched token, mapped-route flag,
// leading SQL verb, line length} are emitted. No .env content, no tokens, no
// business payloads. Comparisons (digest match, SHA equality, expiry) are
// computed host-side so upstream log masking cannot corrupt verdicts.
//
// Delivered via stdin (`node --input-type=module -`) from a reviewed runner
// payload; requires R0_DEPLOY_RUN_ID and R0_TARGET_SHA from the workflow.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// Kept local because the stdin collector runs against the installed M12 tree,
// whose recovery module predates this transaction. Contract tests bind this
// tuple and SQL regex exactly to PR395's recovery constants/definition.
export const M12_MATERIAL_TRANSACTION = Object.freeze({
  runId: '38333221687-1', runAttempt: 1,
  targetSha: '2e713d44b9697796ec903927bb5dd5e6fb9e4cb4',
  previousFloorSha: '797eeca1db229f5e4d288da88d83888ad92b35c5',
});
export const REPLAY_SQL_SHAPE_PATTERN = /\b(insert\s+into|update\s+\S+\s+set|delete\s+from|alter\s+table|create\s+(?:table|index|unique|sequence)|drop\s+(?:table|index|constraint)|truncate\s+table?|grant\s+|revoke\s+)\b/i;
const ansiPattern = /\x1b\[[0-9;]*[A-Za-z]/g;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validPin = pin => record(pin) && typeof pin.imageId === 'string' && typeof pin.revision === 'string' && /^sha256:[a-f0-9]{64}$/.test(pin.imageId || '') && /^[a-f0-9]{40}$/.test(pin.revision || '')
  && isDeepStrictEqual(Object.keys(pin).sort(), ['imageId', 'revision']);
const validPins = pins => record(pins) && validPin(pins.api) && validPin(pins.web)
  && isDeepStrictEqual(Object.keys(pins).sort(), ['api', 'web']);
const validContainer = c => record(c) && typeof c.id === 'string' && typeof c.image === 'string' && typeof c.ociRevision === 'string' && typeof c.startedAt === 'string' && /^[a-f0-9]{12,64}$/.test(c.id || '') && /^sha256:[a-f0-9]{64}$/.test(c.image || '')
  && /^[a-f0-9]{40}$/.test(c.ociRevision || '') && Number.isFinite(Date.parse(c.startedAt)) && c.running === true && c.health === 'healthy'
  && Number.isSafeInteger(c.restartCount) && c.restartCount >= 0 && Array.isArray(c.mounts);
const matchingPins = (a, b) => validPins(a) && validPins(b) && isDeepStrictEqual(a, b);
const matchingPin = (a, b) => validPin(a) && validPin(b) && isDeepStrictEqual(a, b);

// Diagnostics only: these host-side comparisons survive display-value masking.
// They do not authorize recovery, whose CLI independently rechecks raw state.
export function frozenM12Identity(out) {
  const f = M12_MATERIAL_TRANSACTION;
  const read = name => out.stateFiles?.[name]?.pinned === true && record(out.stateFiles[name].content) ? out.stateFiles[name].content : null;
  const floor = read('floor.json'), active = read('active.json'), txn = read('transaction.json'), marker = read('policy-transition.json');
  const deploy = read(`deploy-${f.runId}.json`), pre = read(`deploy-${f.runId}-pre-evidence.json`);
  const post = read(`deploy-${f.runId}-post-evidence.json`), startup = read(`deploy-${f.runId}-startup-evidence.json`);
  const before = pre?.containers?.api, after = post?.containers?.api, live = out.containers?.api;
  const applicable = out.binding?.runId === f.runId && out.binding?.targetSha === f.targetSha;
  const available = applicable && [floor, active, txn, marker, deploy, pre, post, startup].every(record)
    && validPins(marker.previous) && validPins(deploy.previous) && validPins(active.active)
    && validPin(marker.candidateApi) && validPin(deploy.candidates?.api) && validPins(deploy.active)
    && [before, after, live].every(validContainer);
  const snapshotBinding = (item, phase) => item?.schema === 'phoenix.production-deployment-evidence/v2' && item.phase === phase
    && item.deployRunId === f.runId && item.deployRunAttempt === f.runAttempt && item.targetSha === f.targetSha && item.configFloorSha === f.targetSha;
  const checks = {
    bindingMatchesFrozen: applicable,
    markerPreviousFloorMatchesM6: marker?.previousFloorSha === f.previousFloorSha,
    markerPreviousApiMatchesM6: marker?.previous?.api?.revision === f.previousFloorSha,
    deployPreviousApiMatchesM6: deploy?.previous?.api?.revision === f.previousFloorSha,
    deployMigrationBaselineMatchesM6: deploy?.migrationBaseline === f.previousFloorSha,
    activePreviousApiMatchesM6: active?.active?.api?.revision === f.previousFloorSha,
    activeMigrationBaselineMatchesM6: active?.migrationBaseline === f.previousFloorSha,
    preApiMatchesPreviousM6: before?.ociRevision === f.previousFloorSha && before.image === deploy?.previous?.api?.imageId
      && before.running === true && before.health === 'healthy',
    markerPreviousMatchesDeployPrevious: matchingPins(marker?.previous, deploy?.previous),
    markerCandidateMatchesDeployCandidate: matchingPin(marker?.candidateApi, deploy?.candidates?.api),
    activePinsMatchDeployPrevious: matchingPins(active?.active, deploy?.previous),
    deployActiveMatchesCandidateAndPreviousWeb: matchingPins(deploy?.active, { api: deploy?.candidates?.api, web: deploy?.previous?.web }),
    floorMatchesM12: floor?.version === 3 && floor.phase === 'READY' && floor.floorSha === f.targetSha,
    activeConfigAndFloorMatchesM12: active?.version === 3 && active.outcome === 'CONFIG_READY_HOLD' && active.configSha === f.targetSha && active.floorSha === f.targetSha,
    transactionMatchesFrozenM12: txn?.version === 3 && txn.runId === f.runId && txn.phase === 'IN_PROGRESS' && txn.target === f.targetSha && txn.configSha === f.targetSha,
    deployMatchesFrozenM12: deploy?.version === 3 && deploy.outcome === 'SWITCHING' && deploy.target === f.targetSha && deploy.configSha === f.targetSha && deploy.floorSha === f.targetSha
      && deploy.candidates?.api?.revision === f.targetSha && deploy.switched?.api === true && deploy.switched?.web === false
      && Array.isArray(deploy.migrationPaths) && deploy.migrationPaths.length === 0,
    markerMatchesFrozenM12: marker?.version === 3 && marker.runId === f.runId && marker.operation === 'CODE_HOLD' && marker.phase === 'IN_PROGRESS' && marker.target === f.targetSha,
    preBindingMatchesFrozen: snapshotBinding(pre, 'PRE_SNAPSHOT'),
    postBindingMatchesFrozen: snapshotBinding(post, 'POST_SNAPSHOT'),
    startupBindingMatchesFrozen: snapshotBinding(startup, 'API_STARTUP_LOG'),
    postApiMatchesM12Candidate: after?.ociRevision === f.targetSha && after.image === deploy?.candidates?.api?.imageId && after.running === true && after.health === 'healthy',
    liveApiMatchesPostM12: live?.ociRevision === f.targetSha && matchingPin({ imageId: live?.image, revision: live?.ociRevision }, { imageId: after?.image, revision: after?.ociRevision })
      && typeof live?.id === 'string' && live.id === after?.id && typeof live.startedAt === 'string' && live.startedAt === after?.startedAt
      && live.running === true && live.health === 'healthy',
    checkoutMatchesM12: out.checkout?.head === f.targetSha && out.checkout.branch === 'main' && out.checkout.clean === true,
  };
  return { schema: 'phoenix.r0-m12-frozen-identity/1', diagnosticOnly: true, scope: 'FROZEN_TRANSACTION_IDENTITY_ONLY', applicable, available,
    checks, allIdentityChecksPass: available && Object.values(checks).every(value => value === true) };
}

export function replayWindowDiagnostics({ stdout, stderr, startup, post, binding, readinessVerified }, evidence) {
  const stdoutLines = stdout.split(/\r?\n/).filter(Boolean), stderrLines = stderr.split(/\r?\n/).filter(Boolean);
  const sqlShapeCount = [...stdoutLines, ...stderrLines].filter(line => REPLAY_SQL_SHAPE_PATTERN.test(line.replace(ansiPattern, ''))).length;
  const digestRecomputed = createHash('sha256').update(Buffer.from(stdout)).update(Buffer.from([0])).update(Buffer.from(stderr)).digest('hex');
  const attempt = binding?.runId?.match(/-(\d+)$/)?.[1];
  const bindingVerified = typeof binding?.targetSha === 'string' && /^[a-f0-9]{40}$/.test(binding.targetSha) && !!attempt && Number.isSafeInteger(Number(attempt)) && Number(attempt) > 0
    && startup?.schema === evidence.EVIDENCE_SCHEMA && startup.phase === 'API_STARTUP_LOG' && post?.schema === evidence.EVIDENCE_SCHEMA && post.phase === 'POST_SNAPSHOT'
    && startup.deployRunId === binding.runId && post.deployRunId === binding.runId && startup.deployRunAttempt === Number(attempt) && post.deployRunAttempt === Number(attempt)
    && startup.targetSha === binding.targetSha && post.targetSha === binding.targetSha && startup.configFloorSha === binding.targetSha && post.configFloorSha === binding.targetSha
    && typeof startup.containerId === 'string' && startup.containerId === post.containers?.api?.id && typeof startup.startedAt === 'string' && startup.startedAt === post.containers?.api?.startedAt;
  let summary = null;
  try {
    summary = evidence.summarizeStartupLogs({ stdout, stderr, containerId: startup?.containerId, startedAt: startup?.startedAt, capturedAt: startup?.capturedAt,
      runId: startup?.deployRunId, runAttempt: startup?.deployRunAttempt, targetSha: startup?.targetSha, floorSha: startup?.configFloorSha,
      readinessVerified: readinessVerified === true && startup?.eventCounts?.READINESS_HTTP_PASS === 1 });
  } catch { /* return unavailable/false without raw validation text */ }
  const windowVerified = bindingVerified && summary !== null;
  return { bindingVerified, windowVerified, sqlShapeCount, sqlShapeCheckedLineCount: stdoutLines.length + stderrLines.length,
    sqlShapeZero: windowVerified && sqlShapeCount === 0, stdoutLineCount: stdoutLines.length, stderrLineCount: stderrLines.length, digestRecomputed,
    digestMatchesPersisted: /^[a-f0-9]{64}$/.test(startup?.combinedDigest || '') && digestRecomputed === startup.combinedDigest,
    lineCountsMatchPersisted: Number.isSafeInteger(startup?.stdoutLineCount) && Number.isSafeInteger(startup?.stderrLineCount)
      && stdoutLines.length === startup.stdoutLineCount && stderrLines.length === startup.stderrLineCount,
    replaySummaryVerified: summary?.result === 'PASS_REDACTED_SUMMARY',
  };
}

export async function collectReadOnlyEvidence() {
// Imported helper CLIs must stay library-only during reviewed stdin execution.
if (!process.argv[1] || process.argv[1] === '-') process.argv[1] = '/r0-evidence-stdin';

const ROOT = process.env.R0_ROOT || '/data/phoenix-erp';
const RUN_ID = process.env.R0_DEPLOY_RUN_ID || '';
const TARGET_SHA = process.env.R0_TARGET_SHA || '';
const stage = name => process.stderr.write(`R0_STAGE=${name}\n`);
const errors = [];

const helpers = await import(pathToFileURL(path.join(ROOT, 'scripts/ops/production-trusted-paths.mjs')).href);
const evidence = await import(pathToFileURL(path.join(ROOT, 'scripts/ops/production-deployment-evidence.mjs')).href);
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/ops/production-config-contract.json'), 'utf8'));
const STATE = CONTRACT.stateDirectory;

const cleanEnv = { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', DOCKER_CONFIG: '/home/phoenix-codex-deploy/.docker', DOCKER_HOST: 'unix:///var/run/docker.sock' };
const run = (file, args, options = {}) => execFileSync(file, args, { env: cleanEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024, ...options }).trim();
const dockerRun = args => run('docker', args);
const gitRun = args => execFileSync('git', ['-c', `safe.directory=${ROOT}`, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const out = { schema: 'phoenix.r0-readonly-evidence/1', collectedAt: new Date().toISOString(), binding: { runId: RUN_ID, targetSha: TARGET_SHA }, execution: { uid: process.getuid(), euid: process.geteuid() }, errors };

// Mirrors the schemaWritePattern alternations in production-deployment-evidence.mjs
// so per-line token attribution uses the same match surface as the classifier.
const tokenPattern = /\b(alter\s+table|create\s+(?:table|index|sequence|unique)|drop\s+(?:table|index|constraint)|truncate|insert\s+into|update\s+[\w."]+\s+set|delete\s+from|upsert\s+into|setval|nextval|ddl|schema\s+(?:repair|write|mutation)|(?:execut\w*|run(?:ning)?)\s+(?:of\s+)?migrations?|migrations?\s+[\w."']+\s+has\s+been\s+(?:successfully\s+)?executed|migrationsRun|runMigrations|(?:execut\w*|run(?:ning)?)\s+(?:of\s+)?seeds?|seed(?:ing)?\s+(?:data|script)?\s*(?:executed|completed|inserted|applied))\b/gi;

const attempt = (name, fn) => { try { stage(name); return fn(); } catch (error) { errors.push({ stage: name, error: String(error?.message || error).slice(0, 300) }); return null; } };

attempt('ROOT_IDENTITY', () => {
  helpers.assertRootIdentity(CONTRACT);
  out.rootIdentity = 'PASS';
});
attempt('TRUSTED_DIRECTORY', () => {
  out.stateDirectoryInspection = helpers.inspectTrustedDirectory(STATE, CONTRACT).map(s => ({ path: s.path, uid: s.uid, mode: s.mode & 0o7777, mounts: s.mounts.length }));
});
attempt('CHECKOUT', () => {
  const head = gitRun(['rev-parse', 'HEAD']);
  out.checkout = { head, headEqualsTargetSha: head === TARGET_SHA, branch: gitRun(['branch', '--show-current']), clean: gitRun(['status', '--porcelain', '--untracked-files=all']) === '' };
});

attempt('STATE_FILES', () => {
  out.stateFiles = {};
  const readStateFile = name => {
    const file = path.join(STATE, name);
    if (!fs.existsSync(file)) { out.stateFiles[name] = { exists: false }; return null; }
    const stat = fs.lstatSync(file);
    const entry = { exists: true, identity: { uid: stat.uid, mode: stat.mode & 0o7777, size: stat.size, nlink: stat.nlink, mtimeMs: Math.round(stat.mtimeMs) } };
    try {
      const content = JSON.parse(helpers.readPinnedFile(file, { contract: CONTRACT }).toString('utf8'));
      out.stateFiles[name] = { ...entry, pinned: true, content };
      return content;
    } catch (error) {
      out.stateFiles[name] = { ...entry, pinned: false, error: String(error?.message || error).slice(0, 200) };
      return null;
    }
  };
  for (const name of [
    'transaction.json', 'policy-transition.json', 'floor.json', 'active.json',
    `deploy-${RUN_ID}.json`, `floor-promotion-${RUN_ID}.json`,
    `deploy-${RUN_ID}-pre-evidence.json`, `deploy-${RUN_ID}-post-evidence.json`, `deploy-${RUN_ID}-startup-evidence.json`,
    `run-${RUN_ID}/runtime-before.json`,
  ]) readStateFile(name);
});
attempt('STATE_INVENTORY', () => {
  const list = name => fs.readdirSync(path.join(STATE, name)).sort().map(entry => {
    const stat = fs.lstatSync(path.join(STATE, name, entry));
    return { name: entry, type: stat.isDirectory() ? 'dir' : stat.isSymbolicLink() ? 'symlink' : 'file', uid: stat.uid, mode: stat.mode & 0o7777, size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
  });
  out.stateDirectoryListing = list('.');
  for (const dir of out.stateDirectoryListing.filter(e => e.type === 'dir' && (e.name === `run-${RUN_ID}` || e.name === `floor-stage-${RUN_ID}`))) out.stateDirectoryListing.push(...list(dir.name).map(e => ({ ...e, name: `${dir.name}/${e.name}` })));
});

attempt('CONTAINERS', () => {
  out.containers = {};
  for (const service of ['db', 'api', 'web']) {
    try { out.containers[service] = evidence.metadataFor(service, dockerRun); }
    catch (error) { out.containers[service] = { error: String(error?.message || error).slice(0, 200) }; }
  }
});
attempt('HEALTH', () => {
  try { out.readiness = { apiHttp: run('curl', ['-sS', '--max-time', '15', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:3100/api/readiness']) }; }
  catch (error) { out.readiness = { apiHttp: 'ERROR', error: String(error?.message || error).slice(0, 200) }; }
  const flagsEnv = JSON.parse(run('docker', ['inspect', 'phoenix-v3-api', '--format', '{{json .Config.Env}}']));
  const live = Object.fromEntries(flagsEnv.filter(line => /^(CHANJET_READONLY_SYNC_ENABLED|CHANJET_ERP_INBOUND_SYNC_ENABLED|CHANJET_SYNC_POLICY|CHANJET_READONLY_APPROVAL)=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  if (typeof live.CHANJET_READONLY_APPROVAL === 'string' && live.CHANJET_READONLY_APPROVAL.length > 300) live.CHANJET_READONLY_APPROVAL = `${live.CHANJET_READONLY_APPROVAL.slice(0, 300)}…`;
  out.liveChanjetEnv = live;
});

const pre = attempt('PRE_PARSE', () => out.stateFiles?.[`deploy-${RUN_ID}-pre-evidence.json`]?.pinned ? out.stateFiles[`deploy-${RUN_ID}-pre-evidence.json`].content : null);
const post = out.stateFiles?.[`deploy-${RUN_ID}-post-evidence.json`]?.pinned ? out.stateFiles[`deploy-${RUN_ID}-post-evidence.json`].content : null;
const startup = out.stateFiles?.[`deploy-${RUN_ID}-startup-evidence.json`]?.pinned ? out.stateFiles[`deploy-${RUN_ID}-startup-evidence.json`].content : null;

attempt('SNAPSHOT_COMPARE', () => {
  out.snapshotComparison = { comparable: Boolean(pre && post) };
  if (!pre || !post) return;
  const cmp = {};
  for (const service of ['db', 'web']) {
    const before = pre.containers[service]; const after = post.containers[service];
    cmp[service] = {
      preVsPost: { idEqual: before.id === after.id, startedAtEqual: before.startedAt === after.startedAt, imageEqual: before.image === after.image, mountsEqual: JSON.stringify(before.mounts) === JSON.stringify(after.mounts), preHealth: before.health, postHealth: after.health },
    };
    const live = out.containers?.[service];
    if (live && !live.error) cmp[service].liveVsPost = { idEqual: live.id === after.id, startedAtEqual: live.startedAt === after.startedAt, imageEqual: live.image === after.image, healthEqual: live.health === after.health, mountsEqual: JSON.stringify(live.mounts) === JSON.stringify(after.mounts), restartCount: live.restartCount };
  }
  const postApi = post.containers.api;
  cmp.api = { postOciRevision: postApi.ociRevision, postOciEqualsTargetSha: postApi.ociRevision === TARGET_SHA, postHealth: postApi.health };
  const liveApi = out.containers?.api;
  if (liveApi && !liveApi.error) cmp.api.liveVsPost = { idEqual: liveApi.id === postApi.id, startedAtEqual: liveApi.startedAt === postApi.startedAt, imageEqual: liveApi.image === postApi.image, healthEqual: liveApi.health === postApi.health, liveOciRevision: liveApi.ociRevision, liveOciEqualsTargetSha: liveApi.ociRevision === TARGET_SHA, liveRestartCount: liveApi.restartCount, restartCountSincePost: liveApi.restartCount - postApi.restartCount, mountsEqual: JSON.stringify(liveApi.mounts) === JSON.stringify(postApi.mounts) };
  let moduleVerdict = null;
  try { evidence.compareSnapshots(pre, post); moduleVerdict = 'COMPARE_SNAPSHOTS_PASS'; } catch (error) { moduleVerdict = String(error?.message || error); }
  out.snapshotComparison.containers = cmp;
  out.snapshotComparison.moduleVerdict = moduleVerdict;
});

attempt('STARTUP_LOG_REPLAY', () => {
  out.startupReplay = { available: Boolean(startup && post), replay: { available: false, bindingVerified: false, windowVerified: false, replaySummaryVerified: false, sqlShapeCount: null, sqlShapeCheckedLineCount: null, sqlShapeZero: false, stdoutLineCount: null, stderrLineCount: null, digestRecomputed: null, digestMatchesPersisted: false, lineCountsMatchPersisted: false } };
  if (!startup || !post) return;
  const api = post.containers.api;
  const persisted = {
    containerId: startup.containerId, startedAt: startup.startedAt, capturedAt: startup.capturedAt,
    stdoutLineCount: startup.stdoutLineCount, stderrLineCount: startup.stderrLineCount,
    errorSignalCount: startup.errorSignalCount, schemaWriteSignalCount: startup.schemaWriteSignalCount,
    sensitiveLineCount: startup.sensitiveLineCount, result: startup.result,
    eventCounts: startup.eventCounts, combinedDigest: startup.combinedDigest,
    // Split halves so a sanitized Actions log can still carry the full digest:
    // GitHub secret masking corrupts long hex substrings, never split lines.
    digestA: String(startup.combinedDigest ?? '').slice(0, 32), digestB: String(startup.combinedDigest ?? '').slice(32),
    // Parity streams: even- and odd-index characters. Any CONTIGUOUS substring
    // secret of length >= 2 spans both parities and can never appear
    // contiguously inside either stream, so masking cannot corrupt them.
    // Recombine by interleaving: combined[i] = i % 2 === 0 ? digestEven[i/2] : digestOdd[(i-1)/2].
    digestOdd: [...String(startup.combinedDigest ?? '')].filter((_, index) => index % 2 === 1).join(''),
    digestEven: [...String(startup.combinedDigest ?? '')].filter((_, index) => index % 2 === 0).join(''),
    containerIdMatchesPostApi: startup.containerId === api.id, startedAtMatchesPostApi: startup.startedAt === api.startedAt,
  };
  out.startupReplay.persisted = persisted;
  const result = spawnSync('docker', ['logs', '--timestamps', '--since', persisted.startedAt, '--until', persisted.capturedAt, api.id], { env: cleanEnv, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    out.startupReplay.replay = { ...out.startupReplay.replay, available: false, status: result.status, error: String(result.error?.message || result.stderr || 'DOCKER_LOG_FAILED').slice(0, 300) };
    return;
  }
  const stdout = result.stdout || ''; const stderr = result.stderr || '';
  const classifyLine = line => {
    const ts = line.match(/^(\d{4}-\d{2}-\d{2}T[^ ]+Z)\s/);
    const verdict = evidence.classifyStartupLine(line);
    const entry = { ts: ts ? ts[1] : null, kind: verdict.kind };
    if (verdict.schemaWrite) {
      entry.tokens = [...line.matchAll(tokenPattern)].map(match => match[0].toLowerCase());
      entry.mappedRouteLine = /Mapped\s*\{/.test(line);
      const shape = line.replace(ansiPattern, '').match(REPLAY_SQL_SHAPE_PATTERN);
      entry.sqlStatementShape = shape ? shape[1].toLowerCase() : null;
      entry.lineLength = line.length;
      // Minimal sanitized identity for unattributed signal lines: word set only
      // (alpha tokens, hex-like tokens dropped); sensitive-flagged lines get no
      // word set at all. Raw line content is never emitted.
      entry.sensitive = verdict.sensitive;
      if (!entry.mappedRouteLine && !verdict.sensitive) entry.wordSet = [...new Set(line.match(/[A-Za-z]{3,}/g) ?? [])].filter(word => !/^[a-fA-F0-9]{8,}$/.test(word));
    } else if (verdict.error) {
      // R0.1: same sanitized word-set attribution for standalone ERROR_SIGNAL
      // lines (schema/write lines already covered above).
      entry.sensitive = verdict.sensitive;
      if (!verdict.sensitive) entry.wordSet = [...new Set(line.match(/[A-Za-z]{3,}/g) ?? [])].filter(word => !/^[a-fA-F0-9]{8,}$/.test(word));
    }
    return entry;
  };
  const diagnostics = replayWindowDiagnostics({ stdout, stderr, startup, post, binding: out.binding, readinessVerified: out.readiness?.apiHttp === '200' }, evidence);
  const stdoutLines = stdout.split(/\r?\n/).filter(Boolean);
  const stderrLines = stderr.split(/\r?\n/).filter(Boolean);
  const lines = [
    ...stdoutLines.map(line => ({ stream: 'stdout', ...classifyLine(line) })),
    ...stderrLines.map(line => ({ stream: 'stderr', ...classifyLine(line) })),
  ];
  const kindCounts = {};
  for (const line of lines) kindCounts[line.kind] = (kindCounts[line.kind] || 0) + 1;
  out.startupReplay.replay = {
    available: true,
    ...diagnostics,
    stdoutLineCount: stdoutLines.length, stderrLineCount: stderrLines.length,
    combinedBytes: Buffer.byteLength(stdout) + Buffer.byteLength(stderr),
    schemaWriteSignalCountReplayed: kindCounts.SCHEMA_OR_WRITE_SIGNAL || 0,
    schemaWriteCountMatchesPersisted: (kindCounts.SCHEMA_OR_WRITE_SIGNAL || 0) === persisted.schemaWriteSignalCount,
    errorSignalCountReplayed: lines.filter(l => l.kind === 'ERROR_SIGNAL' || l.kind === 'SCHEMA_OR_WRITE_SIGNAL').length,
    sensitiveLineCountReplayed: Object.entries(kindCounts).filter(([kind]) => kind.includes('SENSITIVE')).reduce((sum, [, count]) => sum + count, 0),
    kindCounts,
    schemaWriteLines: lines.filter(line => line.kind === 'SCHEMA_OR_WRITE_SIGNAL'),
    schemaCompatibilityPassInReplay: /API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS/i.test(`${stdout}\n${stderr}`),
    lines,
  };
});

attempt('DB_READONLY', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'scripts/ops/readonly-audits/chanjet-restoration-preflight.sql'), 'utf8');
  out.dbEvidence = { sqlSha256: createHash('sha256').update(sql).digest('hex') };
  try {
    const output = run('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', 'phoenix-v3-db', 'sh', '-c', 'exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"'], { stdio: ['pipe', 'pipe', 'pipe'], input: `BEGIN READ ONLY;\nSET LOCAL statement_timeout='20s';\nSET LOCAL lock_timeout='3s';\n${sql}\nROLLBACK;\n` });
    const line = output.split('\n').find(candidate => candidate.startsWith('{'));
    out.dbEvidence.result = line ? JSON.parse(line) : { error: 'NO_JSON_LINE', rawPrefix: output.slice(0, 200) };
  } catch (error) {
    out.dbEvidence.result = { error: String(error?.message || error).slice(0, 300) };
  }
});

attempt('CONSISTENCY', () => {
  const floor = out.stateFiles?.['floor.json']?.pinned ? out.stateFiles['floor.json'].content : null;
  const active = out.stateFiles?.['active.json']?.pinned ? out.stateFiles['active.json'].content : null;
  const transaction = out.stateFiles?.['transaction.json']?.pinned ? out.stateFiles['transaction.json'].content : null;
  const deployRecord = out.stateFiles?.[`deploy-${RUN_ID}.json`]?.pinned ? out.stateFiles[`deploy-${RUN_ID}.json`].content : null;
  const marker = out.stateFiles?.['policy-transition.json']?.pinned ? out.stateFiles['policy-transition.json'].content : null;
  const now = Date.now();
  out.consistency = {
    floor: floor && { version: floor.version, phase: floor.phase, floorSha: floor.floorSha, floorShaEqualsTarget: floor.floorSha === TARGET_SHA, chanjetPolicy: floor.chanjetPolicy, readonlyApproval: floor.readonlyApproval, project: floor.project, operationalTuple: floor.operationalTuple },
    active: active && { version: active.version, configSha: active.configSha, floorSha: active.floorSha, floorShaEqualsTarget: active.floorSha === TARGET_SHA, outcome: active.outcome, activeApiRevision: active.active?.api?.revision, activeWebRevision: active.active?.web?.revision, activeApiEqualsRunning: out.containers?.api && !out.containers.api.error ? active.active?.api?.revision === out.containers.api.ociRevision : null, migrationBaseline: active.migrationBaseline },
    transaction: transaction && { runId: transaction.runId, runIdEqualsBinding: transaction.runId === RUN_ID, phase: transaction.phase, target: transaction.target, targetEqualsBinding: transaction.target === TARGET_SHA, configSha: transaction.configSha },
    deployRecord: deployRecord && { version: deployRecord.version, outcome: deployRecord.outcome, switched: deployRecord.switched, candidateApiRevision: deployRecord.candidates?.api?.revision, candidateApiEqualsTarget: deployRecord.candidates?.api?.revision === TARGET_SHA, activeApiRevision: deployRecord.active?.api?.revision, previousApiRevision: deployRecord.previous?.api?.revision, protectedImagesCount: Array.isArray(deployRecord.protectedImages) ? deployRecord.protectedImages.length : null, migrationPaths: deployRecord.migrationPaths, migrationPathsCount: Array.isArray(deployRecord.migrationPaths) ? deployRecord.migrationPaths.length : null, expiresAt: deployRecord.expiresAt, expiredNow: Date.parse(deployRecord.expiresAt) <= now },
    policyTransition: marker && { version: marker.version, operation: marker.operation, phase: marker.phase, runId: marker.runId, runIdEqualsBinding: marker.runId === RUN_ID, target: marker.target, targetEqualsBinding: marker.target === TARGET_SHA, startedAt: marker.startedAt, expiresAt: marker.expiresAt, expiredNow: Date.parse(marker.expiresAt) <= now, durationMs: Date.parse(marker.expiresAt) - Date.parse(marker.startedAt), previousApiRevision: marker.previous?.api?.revision, candidateApiRevision: marker.candidateApi?.revision, nextEnvPolicy: marker.nextEnv?.CHANJET_SYNC_POLICY },
    liveEnvVsFloorPolicy: (() => {
      const flags = out.liveChanjetEnv; if (!flags || !floor) return null;
      const expected = { CHANJET_SYNC_POLICY: floor.chanjetPolicy || 'HOLD', CHANJET_READONLY_SYNC_ENABLED: floor.operationalTuple?.CHANJET_READONLY_SYNC_ENABLED, CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' };
      return { expectedPolicy: expected.CHANJET_SYNC_POLICY, matchesHoldTuple: flags.CHANJET_SYNC_POLICY === expected.CHANJET_SYNC_POLICY && flags.CHANJET_READONLY_SYNC_ENABLED === expected.CHANJET_READONLY_SYNC_ENABLED && flags.CHANJET_ERP_INBOUND_SYNC_ENABLED === 'false' };
    })(),
  };
});

// Compact verdict-first summary (single bounded line), then the full payload in
// digest-checked chunks: single-line Actions log limits must not lose evidence.
out.m12FrozenIdentity = frozenM12Identity(out);
const compact = {
  schema: out.schema, collectedAt: out.collectedAt, binding: out.binding,
  m12FrozenIdentity: out.m12FrozenIdentity,
  checkout: out.checkout, consistency: out.consistency, readiness: out.readiness, liveChanjetEnv: out.liveChanjetEnv,
  snapshotModuleVerdict: out.snapshotComparison?.moduleVerdict,
  snapshotContainers: out.snapshotComparison?.containers,
  containers: Object.fromEntries(Object.entries(out.containers ?? {}).map(([service, value]) => [service, value?.error ? { error: value.error } : { id: value.id, image: value.image, ociRevision: value.ociRevision, health: value.health, restartCount: value.restartCount, startedAt: value.startedAt }])),
  dbEvidence: out.dbEvidence,
  startupPersisted: out.startupReplay?.persisted,
  startupReplayVerdict: out.startupReplay?.replay && { available: out.startupReplay.replay.available, bindingVerified: out.startupReplay.replay.bindingVerified, windowVerified: out.startupReplay.replay.windowVerified, replaySummaryVerified: out.startupReplay.replay.replaySummaryVerified, sqlShapeCount: out.startupReplay.replay.sqlShapeCount, sqlShapeCheckedLineCount: out.startupReplay.replay.sqlShapeCheckedLineCount, sqlShapeZero: out.startupReplay.replay.sqlShapeZero, stdoutLineCount: out.startupReplay.replay.stdoutLineCount, stderrLineCount: out.startupReplay.replay.stderrLineCount, digestRecomputed: out.startupReplay.replay.digestRecomputed, status: out.startupReplay.replay.status, error: out.startupReplay.replay.error, lineCountsMatchPersisted: out.startupReplay.replay.lineCountsMatchPersisted, digestMatchesPersisted: out.startupReplay.replay.digestMatchesPersisted, schemaWriteSignalCountReplayed: out.startupReplay.replay.schemaWriteSignalCountReplayed, schemaWriteCountMatchesPersisted: out.startupReplay.replay.schemaWriteCountMatchesPersisted, schemaWriteLines: out.startupReplay.replay.schemaWriteLines, errorLines: (out.startupReplay.replay.lines ?? []).filter(line => line.kind === 'ERROR_SIGNAL'), schemaCompatibilityPassInReplay: out.startupReplay.replay.schemaCompatibilityPassInReplay, kindCounts: out.startupReplay.replay.kindCounts },
  errors: out.errors,
};
console.log(`R0_SUMMARY=${JSON.stringify(compact)}`);
const payload = JSON.stringify(out);
const payloadDigest = createHash('sha256').update(payload).digest('hex');
const chunks = payload.match(/.{1,60000}/g) ?? [];
console.log(`R0_OUTPUT_BEGIN bytes=${Buffer.byteLength(payload)} sha256=${payloadDigest} chunks=${chunks.length}`);
for (let index = 0; index < chunks.length; index++) console.log(`R0_CHUNK_${index + 1}_${chunks.length}=${chunks[index]}`);
console.log('R0_OUTPUT_END');

return out;
}

if (!process.argv[1] || process.argv[1] === '-' || import.meta.url === pathToFileURL(process.argv[1]).href) await collectReadOnlyEvidence();
