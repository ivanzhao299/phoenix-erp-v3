#!/usr/bin/env node
/** Host bridge only: reviewed Git bytes execute on stdin in the existing API. No host pg or container writes. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONTRACT, verifyContext, git } from './production-config-guard.mjs';
import { executionEnv, REVISION, IMAGE_ID } from './capture-production-runtime.mjs';

export const SOURCE_PATH = 'scripts/ops/sku-source-activation.mjs';
export const MANIFEST_PATH = 'scripts/ops/manifests/sku-two-company-source-activation.json';
const SHA256 = /^[a-f0-9]{64}$/;
const fail = code => { throw new Error(`SKU_TRANSPORT_HOLD=${code}`); };
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !value.startsWith('0000-') && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function validateActivationInputs({ effectiveDate = '', expectedPlanSha256 = '', approveProduction, deployMode, buildApi }) {
  if (!effectiveDate && !expectedPlanSha256) return false;
  if (!effectiveDate || !expectedPlanSha256) fail('PAIRED_INPUTS_REQUIRED');
  if (!validDate(effectiveDate) || !SHA256.test(expectedPlanSha256)) fail('INVALID_DATE_OR_PLAN_SHA256');
  if (approveProduction !== true || !['api', 'full'].includes(deployMode) || buildApi !== true) fail('APPROVED_API_DEPLOYMENT_REQUIRED');
  return true;
}
/** This function is embedded verbatim in stdin code: keep it self-contained.
 * Only declared invariant names (never their row/value suffixes) or SQLSTATE
 * leave the process. Neither pg.message/detail nor exec error text is emitted. */
export function safeFailureDiagnostic(error, stage = 'HOST') {
  const stages = ['HOST', 'OPTIONS', 'MANIFEST', 'PG_LOAD', 'DB_CONFIG', 'CONNECT', 'ACTIVATION', 'RECEIPT', 'CLOSE',
    'API_INSPECT', 'IMAGE_INSPECT', 'SOURCE_READ', 'CONTAINER_EXEC'];
  const safeStage = stages.includes(stage) ? stage : 'HOST';
  const reasons = [
    'EXPLICIT_VALID_EFFECTIVE_DATE_REQUIRED', 'MANIFEST_VERSION_OR_IMPLICIT_DATE', 'SOURCE_EFFECTIVE_DATE_NOT_REVIEWED',
    'MANIFEST_SCOPE_OR_SPECS', 'MANIFEST_SOURCE_COUNT', 'MANIFEST_SOURCE_NOT_REVIEWED', 'UNIQUE_MASTER_REQUIRED',
    'MASTER_INACTIVE', 'MASTER_DATE', 'SOURCE_ORGANIZATION', 'SOURCE_IDENTITY_CONFLICT', 'SOURCE_PERIOD_OVERLAP',
    'SPEC_UNIT', 'GRADE_STATUS', 'GRADE_USAGE', 'VARIETY_DUPLICATE', 'VARIETY_CONFLICT', 'PRODUCT_DUPLICATE',
    'EXISTING_STANDARD_PRODUCT_MISSING', 'PRODUCT_CONFLICT', 'SKU_DUPLICATE', 'SKU_IDENTITY_OR_STATUS',
    'LEGACY_SKU_POLICY_CHANGED', 'UNREVIEWED_ACTIVE_SKU_POLICY', 'EXISTING_STANDARD_SKU_MISSING', 'SKU_COMBINATION_COLLISION',
    'UNREVIEWED_COMPANY_CATALOG', 'COMPANY_SCOPE_CONFLICT', 'NONCOMPANY_SCOPE_REQUIRES_REVIEW', 'INSERT_NOT_ACKNOWLEDGED',
    'DRAFT_ACTIVATION_MOVED', 'GRADE0_ACTIVATION_MOVED', 'SKU_POLICY_MOVED', 'MODE_REQUIRED',
    'EXPLICIT_APPLY_APPROVAL_AND_PLAN_REQUIRED', 'PLAN_OR_DATABASE_STATE_MOVED', 'SOURCE_EFFECTIVE_DATE_IS_FUTURE',
    'POST_ACTIVATION_STATUS', 'POST_GRADE0_USAGE', 'POST_COMPANY_SCOPE', 'INVALID_OR_DUPLICATE_ARGUMENT',
    'APPROVAL_ONLY_FOR_APPLY', 'EXPLICIT_DATABASE_CONFIGURATION_REQUIRED', 'INVALID_DATABASE_PORT',
  ];
  const reason = typeof error?.message === 'string'
    ? /^SKU_ACTIVATION_HOLD=([A-Z0-9_]+)(?::[^\r\n]*)?$/.exec(error.message)?.[1] : undefined;
  const suffix = reasons.includes(reason) ? `reason=SKU_ACTIVATION_HOLD=${reason}`
    : typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? `sqlstate=${error.code}` : 'reason=OPERATION_FAILED';
  return `SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=${safeStage};${suffix}`;
}

function childFailureDiagnostic(error) {
  const stderr = error?.stderr;
  if (!(typeof stderr === 'string' || Buffer.isBuffer(stderr)) || Buffer.byteLength(stderr) > 512) return undefined;
  const line = String(stderr).trim();
  const match = /^SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=([A-Z_]+);(?:reason=(SKU_ACTIVATION_HOLD=[A-Z0-9_]+|OPERATION_FAILED)|sqlstate=([A-Z0-9]{5}))$/.exec(line);
  if (!match) return undefined;
  const normalized = safeFailureDiagnostic({ message: match[2], code: match[3] }, match[1]);
  return normalized === line ? line : undefined;
}

export function containerProgram(source) {
  // The source's main guard sees no argv[1] under stdin eval. Its relative file
  // defaults are never used: the manifest is explicit and pg resolves in /app.
  return `${source}\n
import { createRequire as transportRequire } from 'node:module';
let transportClient;
let transportStage = 'OPTIONS';
const transportDiagnostic = ${safeFailureDiagnostic.toString()};
try {
  const transportOptions = JSON.parse(Buffer.from(process.env.SKU_ACTIVATION_OPTIONS_B64, 'base64').toString('utf8'));
  transportStage = 'MANIFEST';
  const transportManifest = JSON.parse(Buffer.from(process.env.SKU_ACTIVATION_MANIFEST_B64, 'base64').toString('utf8'));
  transportStage = 'PG_LOAD';
  const { Client: TransportClient } = transportRequire('/app/package.json')('pg');
  transportStage = 'DB_CONFIG';
  // Match app.module.ts: the API uses DB_*, never DATABASE_URL precedence.
  const transportConfig = explicitDbConfig(Object.fromEntries(['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME']
    .map(key => [key, process.env[key]])));
  if (transportOptions.mode === 'inspect') transportConfig.options = '-c default_transaction_read_only=on';
  transportClient = new TransportClient(transportConfig);
  transportStage = 'CONNECT';
  await transportClient.connect();
  transportStage = 'ACTIVATION';
  const transportResult = await runActivation(transportClient, { ...transportOptions, manifest: transportManifest,
    confirm: transportOptions.mode === 'apply' ? CONFIRM : undefined });
  transportStage = 'RECEIPT';
  console.log(JSON.stringify({ mode: transportResult.mode, plan_sha256: transportResult.plan_sha256,
    manifest_sha256: transportResult.manifest_sha256, db_state_sha256: transportResult.db_state_sha256,
    effective_date: transportResult.effective_date,
    database: transportResult.database && Object.fromEntries(['name','oid','today','schema','server_version']
      .map(key => [key, transportResult.database[key]])), existingCounts: transportResult.existingCounts,
    expectedCounts: transportResult.expectedCounts, rows: transportResult.rows,
    after_state_sha256: transportResult.after_state_sha256 }));
} catch (error) { console.error(transportDiagnostic(error, transportStage)); process.exitCode = 1; }
finally { if (transportClient) { try { await transportClient.end(); } catch (error) {
  if (!process.exitCode) console.error(transportDiagnostic(error, 'CLOSE'));
  process.exitCode = 1;
} } }
`;
}
const execute = (program, argv, options = {}) => execFileSync(program, argv, {
  encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 2 * 1024 * 1024,
  env: executionEnv(), ...options,
});
export function runTransport(options, dependencies = {}) {
  const { mode, effectiveDate, expectedPlanSha256 = '', approveProduction = false,
    targetSha, root = CONTRACT.repository, stateDirectory = CONTRACT.stateDirectory, deployMode, buildApi } = options;
  if (!['inspect', 'preflight', 'apply'].includes(mode)) fail('UNKNOWN_MODE'); // No independent write/rollback dry-run surface.
  if (!validDate(effectiveDate) || !REVISION.test(targetSha || '')) fail('INVALID_DATE_OR_TARGET');
  if (mode !== 'inspect') validateActivationInputs({ effectiveDate, expectedPlanSha256, approveProduction, deployMode, buildApi });
  else if (expectedPlanSha256 || approveProduction) fail('INSPECT_APPROVAL_NOT_ALLOWED');
  (dependencies.verifyContext || verifyContext)(root, stateDirectory); // Includes root identity, trusted paths and inherited FD9.
  const probe = dependencies.git || git;
  if (probe(root, ['branch', '--show-current']) !== 'main' || probe(root, ['status', '--porcelain', '--untracked-files=all'])) fail('CLEAN_MAIN_REQUIRED');
  if (probe(root, ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']) !== `${targetSha}\trefs/heads/main`) fail('REMOTE_MAIN_MOVED');
  if (mode !== 'inspect' && probe(root, ['rev-parse', 'HEAD']) !== targetSha) fail('HEAD_TARGET_MISMATCH');
  const rawRun = dependencies.execute || execute;
  const run = (program, args, options) => {
    const stage = program === 'git' ? 'SOURCE_READ' : args[0] === 'exec' ? 'CONTAINER_EXEC'
      : args[0] === 'image' ? 'IMAGE_INSPECT' : 'API_INSPECT';
    try { return rawRun(program, args, options); }
    catch (error) {
      // execFileSync's message contains the full command and child stderr.
      // Forward only one exact normalized child diagnostic, never that message.
      throw new Error(stage === 'CONTAINER_EXEC' && childFailureDiagnostic(error) || safeFailureDiagnostic(error, stage));
    }
  };
  const docker = args => String(run('docker', args)).trim();
  // Inspect may deliberately use the old API's pg dependency before the switch.
  // Apply must use the actual image ID/revision, never a mutable tag or env assertion.
  const before = JSON.parse(docker(['inspect', 'phoenix-v3-api', '--format',
    '{"Id":{{json .Id}},"Image":{{json .Image}},"State":{{json .State}}}']));
  const imageId = before.Image;
  if (!IMAGE_ID.test(imageId || '') || !/^[a-f0-9]{64}$/.test(before.Id || '')) fail('INVALID_API_IDENTITY');
  if (before.State?.Running !== true || before.State?.Health?.Status !== 'healthy') fail('API_NOT_HEALTHY');
  const actualRevision = docker(['image', 'inspect', imageId, '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}']);
  if (!REVISION.test(actualRevision) || (mode === 'apply' && actualRevision !== targetSha)) fail('ACTUAL_API_REVISION_MISMATCH');
  const blob = file => String(run('git', ['-c', `safe.directory=${root}`, '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false', 'show', `${targetSha}:${file}`], { cwd: root }));
  const source = blob(SOURCE_PATH);
  const manifest = blob(MANIFEST_PATH);
  try { JSON.parse(manifest); } catch { fail('INVALID_MANIFEST_JSON'); }
  const executionMode = mode === 'preflight' ? 'inspect' : mode;
  const env = { ...executionEnv(), SKU_ACTIVATION_OPTIONS_B64: Buffer.from(JSON.stringify({ mode: executionMode, effectiveDate,
    ...(mode === 'apply' ? { expectedPlanSha256 } : {}) })).toString('base64'),
    SKU_ACTIVATION_MANIFEST_B64: Buffer.from(manifest).toString('base64') };
  // -e NAME passes only these two host variables. DB credentials stay inside the
  // existing container environment; no shell, SQL interpolation or docker cp.
  const stdout = run('docker', ['exec', '-i', '-e', 'SKU_ACTIVATION_OPTIONS_B64', '-e', 'SKU_ACTIVATION_MANIFEST_B64',
    before.Id, 'node', '--input-type=module'], { env, input: containerProgram(source) });
  let result;
  try { result = JSON.parse(stdout); } catch { fail('INVALID_CONTAINER_RECEIPT'); }
  if (result.mode !== executionMode || result.effective_date !== effectiveDate || !SHA256.test(result.plan_sha256 || '')) fail('RECEIPT_BINDING');
  if (mode !== 'inspect' && result.plan_sha256 !== expectedPlanSha256) fail('PLAN_OR_DATABASE_STATE_MOVED');
  return { ...result, mode, target_sha: targetSha, actual_api_revision: actualRevision };
}
export function optionsFromEnv(env) {
  return { mode: env.SKU_ACTIVATION_MODE, effectiveDate: env.SKU_SOURCE_EFFECTIVE_DATE,
    expectedPlanSha256: env.SKU_SOURCE_PLAN_SHA256 || '', approveProduction: env.APPROVE_PRODUCTION === 'true',
    targetSha: env.TARGET_SHA, root: env.DEPLOY_REPO_ROOT || CONTRACT.repository,
    stateDirectory: env.STATE_DIR || CONTRACT.stateDirectory, deployMode: env.DEPLOY_MODE, buildApi: env.BUILD_API === 'true' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(runTransport(optionsFromEnv(process.env)))); }
  catch (error) {
    console.error(childFailureDiagnostic({ stderr: error?.message })
      || (/^SKU_TRANSPORT_HOLD=[A-Z0-9_]{1,64}$/.test(error?.message || '') ? error.message : safeFailureDiagnostic(error)));
    process.exitCode = 1;
  }
}
