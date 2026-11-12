#!/usr/bin/env node
/** Host bridge only: reviewed Git bytes execute on stdin in the existing API. No host pg or container writes. */
import { createHash } from 'node:crypto';
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
    'MANIFEST_CATALOG_POLICY','LEGACY_CATALOG_STATE_REQUIRED','LEGACY_PARENT_REQUIRED','LEGACY_VARIETY_MISMATCH',
    'LEGACY_PARENT_POLICY','LEGACY_STANDARD_TUPLE_AMBIGUOUS','LEGACY_STANDARD_TUPLE_MISSING','LEGACY_CATALOG_IDENTITY_MOVED',
    'APPROVAL_ONLY_FOR_APPLY', 'EXPLICIT_DATABASE_CONFIGURATION_REQUIRED', 'INVALID_DATABASE_PORT',
  ];
  const reason = typeof error?.message === 'string'
    ? /^SKU_ACTIVATION_HOLD=([A-Z0-9_]+)(?::[^\r\n]*)?$/.exec(error.message)?.[1] : undefined;
  const suffix = reasons.includes(reason) ? `reason=SKU_ACTIVATION_HOLD=${reason}`
    : typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? `sqlstate=${error.code}` : 'reason=OPERATION_FAILED';
  return `SKU_TRANSPORT_HOLD=OPERATION_FAILED;stage=${safeStage};${suffix}`;
}

/** Self-contained: embedded in stdin and independently rechecked on the host. No free-text/catalog row passthrough. */
export function sanitizeCatalogSnapshot(result) {
  const reject=()=>{ throw new Error('SKU_TRANSPORT_HOLD=INVALID_CATALOG_SNAPSHOT'); };
  const sha=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
  const code=value=>typeof value==='string' && /^[A-Za-z0-9_.:/-]{1,128}$/.test(value);
  const specs=['LOOSE','TRAY30','TRAY36','BOX360','BOX720','GIFT12','GIFT24'];
  const fields=['sku_code','product_code','grade_code','spec_code','status','variety_code','parent_status',
    'parent_variety_code','org_context_required','base_unit'];
  const nullableDate=value=>value===null || (typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !value.startsWith('0000-') && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value);
  const rows=(input,ready)=>{
    const rowFields=ready?fields:[...fields,'category_code','effective_date','expire_date','parent_effective_date','parent_expire_date'];
    if (!Array.isArray(input) || (ready ? input.length!==35 : input.length>140)) reject();
    const seen=new Set(),skus=new Set();
    return input.map(row=>{
      if (!row || typeof row!=='object' || Object.keys(row).length!==rowFields.length || rowFields.some(k=>!Object.hasOwn(row,k))) reject();
      if (!code(row.sku_code) || !code(row.product_code) || !/^GRADE_[1-5]$/.test(row.grade_code) || !specs.includes(row.spec_code)
        || !code(row.status) || row.status.length>32 || !(row.parent_status===null || (code(row.parent_status) && row.parent_status.length<=32))
        || !(row.variety_code===null || code(row.variety_code)) || !(row.parent_variety_code===null || code(row.parent_variety_code))
        || ![true,false,null].includes(row.org_context_required)
        || !(row.base_unit===null || (typeof row.base_unit==='string' && row.base_unit.length<=16 && !/[\r\n\x00-\x1f]/.test(row.base_unit)))) reject();
      if (!ready && (!(row.category_code===null || (code(row.category_code) && row.category_code.length<=64))
        || ['effective_date','expire_date','parent_effective_date','parent_expire_date'].some(k=>!nullableDate(row[k])))) reject();
      if (ready) {
        const tuple=`${row.grade_code}:${row.spec_code}`;
        if (seen.has(tuple) || skus.has(row.sku_code) || row.status!=='ACTIVE' || row.parent_status!=='ACTIVE'
          || row.variety_code!==null || row.parent_variety_code!==null || row.org_context_required!==false || row.base_unit!=='枚') reject();
        seen.add(tuple);skus.add(row.sku_code);
      }
      return Object.fromEntries(rowFields.map(k=>[k,row[k]]));
    });
  };
  if (!result || typeof result.plan_ready!=='boolean' || !sha(result.manifest_sha256) || !sha(result.db_state_sha256)) reject();
  if (result.plan_ready) {
    if (!sha(result.plan_sha256) || !sha(result.legacy_identity_map_sha256) || Object.hasOwn(result,'catalog_report')) reject();
    return {plan_ready:true,legacy_identity_map:rows(result.legacy_identity_map,true),legacy_identity_map_sha256:result.legacy_identity_map_sha256};
  }
  if (result.mode!=='inspect' || Object.hasOwn(result,'plan_sha256') || Object.hasOwn(result,'legacy_identity_map') || !sha(result.catalog_report_sha256)) reject();
  const report=result.catalog_report;
  if (!report || Object.keys(report).length!==6 || report.report_version!=='1' || report.plan_ready!==false
    || !/^[A-Z][A-Z0-9_]{0,63}$/.test(report.reason) || !Number.isSafeInteger(report.candidate_count) || report.candidate_count<0
    || typeof report.truncated!=='boolean' || report.truncated!==(report.candidate_count>140)) reject();
  const candidates=rows(report.candidates,false);
  if (candidates.length!==Math.min(report.candidate_count,140)) reject();
  return {plan_ready:false,catalog_report:{report_version:'1',plan_ready:false,reason:report.reason,
    candidate_count:report.candidate_count,truncated:report.truncated,candidates},catalog_report_sha256:result.catalog_report_sha256};
}
/** Keep the remainder of the receipt scalar/count-only, including future child additions. */
export function safeReceiptMetadata(result) {
  const reject=()=>{throw new Error('SKU_TRANSPORT_HOLD=INVALID_RECEIPT_METADATA');};
  const counts=(value,keys)=>{
    if (value===undefined) return undefined;
    if (!value || typeof value!=='object' || Array.isArray(value)) reject();
    return Object.fromEntries(keys.filter(k=>Object.hasOwn(value,k)).map(k=>{
      if (!Number.isSafeInteger(value[k]) || value[k]<0) reject();return [k,value[k]];
    }));
  };
  let database;
  if (result.database!==undefined) {
    database=Object.fromEntries(['name','oid','today','schema','server_version'].map(k=>{
      const v=result.database?.[k];
      if (typeof v!=='string' || !v.length || v.length>128 || /[\x00-\x1f\x7f]/.test(v)) reject();return [k,v];
    }));
  }
  if (result.after_state_sha256!==undefined && !/^[a-f0-9]{64}$/.test(result.after_state_sha256)) reject();
  return {database,existingCounts:counts(result.existingCounts,['grades','specs','varieties','products','skus','scopes','profiles']),
    expectedCounts:counts(result.expectedCounts,['profiles','standardSkus','variantSkus','scopes']),
    rows:result.rows===undefined?undefined:{...counts(result.rows,['activatedDrafts','policyUpgrades']),
      inserted:counts(result.rows?.inserted,['grades','varieties','products','skus','scopes','profiles'])},
    after_state_sha256:result.after_state_sha256};
}
const snapshotDigest=value=>createHash('sha256').update(JSON.stringify(value, function(key,v) {
  return v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v;
})).digest('hex');

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
const transportCatalogSnapshot = ${sanitizeCatalogSnapshot.toString()};
const transportReceiptMetadata = ${safeReceiptMetadata.toString()};
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
  const transportCatalog = transportCatalogSnapshot(transportResult);
  console.log(JSON.stringify({ mode: transportResult.mode, ...transportCatalog,
    ...(transportResult.plan_ready ? {plan_sha256:transportResult.plan_sha256} : {}),
    manifest_sha256: transportResult.manifest_sha256, db_state_sha256: transportResult.db_state_sha256,
    effective_date: transportResult.effective_date,
    ...transportReceiptMetadata(transportResult) }));
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
  if (result.mode !== executionMode || result.effective_date !== effectiveDate) fail('RECEIPT_BINDING');
  const snapshot = sanitizeCatalogSnapshot(result);
  if (snapshot.plan_ready) {
    if (snapshotDigest(snapshot.legacy_identity_map)!==snapshot.legacy_identity_map_sha256) fail('INVALID_CATALOG_SNAPSHOT');
  } else if (snapshotDigest(snapshot.catalog_report)!==snapshot.catalog_report_sha256) fail('INVALID_CATALOG_SNAPSHOT');
  if (mode !== 'inspect' && (!snapshot.plan_ready || result.plan_sha256 !== expectedPlanSha256)) fail('PLAN_OR_DATABASE_STATE_MOVED');
  // Fixed receipt projection prevents a compromised child/accidental field addition exporting rows or secrets.
  return { mode, ...snapshot, ...(snapshot.plan_ready ? {plan_sha256:result.plan_sha256} : {}),
    effective_date:result.effective_date, manifest_sha256:result.manifest_sha256,db_state_sha256:result.db_state_sha256,
    ...safeReceiptMetadata(result),
    target_sha:targetSha,actual_api_revision:actualRevision };
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
