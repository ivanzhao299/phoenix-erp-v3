/** Physical core-material observations only. No CLI, writes, image pull,
 * authority decision or producer-registry installation. The old guard closure,
 * future producer closure, operator and compatibility evidence remain separate. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { CONTRACT, verifyContext } from './production-config-guard.mjs';
import { readPinnedFile, inspectTrustedDirectory, assertSameDirectory } from './production-trusted-paths.mjs';
import { inspectCandidate } from './production-deployment-state.mjs';
import { validateRecoveryMaterial } from './production-maintenance-transition.mjs';
import { bindingDigest, canonicalDigest, same, HASH } from './production-maintenance-receipts.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hold = reason => { throw Error('RECOVERY_MATERIAL_HOLD=' + reason); };
// Independently audited literal import closure of the seven maintenance cores.
// This list deliberately does not claim coverage of the uninstalled registry.
export const RECOVERY_CORE_FILES = Object.freeze([
  'production-maintenance-deployment-session.mjs', 'production-maintenance-transition.mjs',
  'production-maintenance-control-participants.mjs',
  'production-maintenance-public-control.mjs', 'production-maintenance-replacement.mjs',
  'production-maintenance-admission.mjs', 'production-maintenance-receipts.mjs',
  'production-deployment-state.mjs', 'promote-production-config-floor.mjs',
  'production-config-guard.mjs', 'production-config-contract.json', 'production-trusted-paths.mjs',
  'production-atomic-state.mjs', 'capture-production-runtime.mjs', 'production-deployment-evidence.mjs',
  'background-control-coordinator.mjs', 'background-control-manifest.mjs',
  'background-control-legacy-transition.mjs', 'chanjet-admission-schema-receipt.mjs',
  'chanjet-readonly-policy.mjs', 'update-managed-chanjet-env.mjs', 'api-bootstrap-schema-preflight.mjs',
].map(file => 'scripts/ops/' + file).concat([
  'apps/api/src/common/database/api-bootstrap-schema-contract.json', 'docker-compose.yml',
]).sort());
const keys = (value, expected) => value && Object.getPrototypeOf(value) === Object.prototype && same(Object.keys(value).sort(), [...expected].sort());
const fileIdentity = stat => [stat.dev,stat.ino,stat.uid,stat.mode,stat.nlink,stat.size,stat.mtimeMs,stat.ctimeMs];
/** An explicitly owned isolated fixture may inject filesystem/guard/runner.
 * None of these observations can mint RECOVERY_MATERIAL or operator approval. */
export function observeRecoveryCoreMaterials(request, dependencies = {}) {
  if (!keys(request, ['context','recoveryPlan','signal']) || !(request.signal instanceof AbortSignal)) hold('TYPED_REQUEST_REQUIRED');
  const signal = request.signal, context = structuredClone(request.context), plan = structuredClone(request.recoveryPlan);
  validateRecoveryMaterial(plan, context);
  const contextDigest = bindingDigest(context), planDigest = canonicalDigest(plan);
  const byKind = new Map(plan.materials.map(material => [material.kind, material]));
  if (plan.materials.length !== 4 || byKind.size !== 4 || byKind.get('CANDIDATE_IMAGE').sha256 !== context.candidate.imageId.slice(7)) hold('FOUR_UNIQUE_MATERIALS_AND_IMAGE_CONFIG_ID_REQUIRED');
  const io = dependencies.fs || fs, now = dependencies.now || Date.now;
  const guard = dependencies.guard || (() => verifyContext(CONTRACT.repository, CONTRACT.stateDirectory));
  const directory = path.join(dependencies.stateDirectory || CONTRACT.stateDirectory, 'maintenance-materials-' + context.owner);
  const inspect = dependencies.inspectDirectory || (dir => inspectTrustedDirectory(dir, CONTRACT));
  const uid = dependencies.expectedUid ?? 0;
  const started = now(), deadline = Math.min(started + 10000, Date.parse(context.window.end));
  const check = () => {
    if (request.signal !== signal) hold('SIGNAL_CHANGED');
    if (signal.aborted) hold('ABORTED');
    if (!Number.isFinite(now()) || now() < started || now() < Date.parse(context.window.start) || now() >= deadline) hold('WINDOW_OR_READ_DEADLINE');
    if (canonicalDigest(request.context) !== contextDigest || canonicalDigest(request.recoveryPlan) !== planDigest) hold('REQUEST_CHANGED');
  };
  check(); guard(); const before = inspect(directory), observations = [];
  // readPinnedFile retains NOFOLLOW, mode0600, uid, nlink and pre/post inode
  // checks. Its read is additionally bounded before allocating any file bytes.
  const boundedIo = Object.create(io);
  boundedIo.readFileSync = fd => {
    const size = io.fstatSync(fd).size;
    if (!Number.isSafeInteger(size) || size < 1 || size > 1024 * 1024) hold('FILE_SIZE');
    const bytes = Buffer.alloc(size + 1); let offset = 0;
    while (offset < bytes.length) { check(); const n = io.readSync(fd, bytes, offset, bytes.length - offset, null); if (!n) break; offset += n; }
    if (offset !== size) hold('FILE_SIZE_CHANGED');
    return bytes.subarray(0,size);
  };
  const read = relative => {
    check(); const file = path.join(directory, relative), stat = io.lstatSync(file);
    if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > 1024 * 1024) hold('FILE_SIZE');
    const initial = fileIdentity(stat);
    const bytes = readPinnedFile(file, { contract: CONTRACT, uid }, { fs: boundedIo, inspectDirectory: inspect });
    if (!same(initial,fileIdentity(io.lstatSync(file)))) hold('FILE_CHANGED');
    observations.push({ relative, file, initial, sha256:hash(bytes) }); check(); return bytes;
  };
  const json = relative => { try { return JSON.parse(read(relative).toString('utf8')); } catch(error) { if (/^(RECOVERY_MATERIAL_HOLD|CONFIG_HOLD)=/.test(error.message)) throw error; hold('MATERIAL_JSON'); } };
  const pre = json('pre.json');
  if (!keys(pre,['owner','targetSha','previousFloorSha','runtime']) || pre.owner !== context.owner || pre.targetSha !== context.targetSha
    || pre.previousFloorSha !== context.previousFloorSha || !same(pre.runtime,context.preSnapshot)) hold('PRE_BINDING');
  const procedure = read('procedure.txt');
  if (hash(procedure) !== plan.procedureSha256) hold('PROCEDURE_DIGEST');
  const manifest = json('helpers.json');
  if (!keys(manifest,['schema','targetSha','files']) || manifest.schema !== 'phoenix.maintenance-core-helper-files/v1' || manifest.targetSha !== context.targetSha
    || !Array.isArray(manifest.files) || manifest.files.length !== RECOVERY_CORE_FILES.length || canonicalDigest(manifest) !== context.sourceHelperSha256
    || manifest.files.some(entry => !keys(entry,['path','sha256']) || !HASH.test(entry.sha256))
    || !same(manifest.files.map(entry=>entry.path).sort(),RECOVERY_CORE_FILES)) hold('CORE_HELPER_MANIFEST');
  for (const entry of manifest.files) if (hash(read('helpers/' + entry.path)) !== entry.sha256) hold('CORE_HELPER_BYTES');
  const run = dependencies.run || (args => {
    check();
    try { return execFileSync('/usr/bin/docker',args,{env:{PATH:'/usr/bin:/bin',DOCKER_HOST:'unix:///var/run/docker.sock'},encoding:'utf8',timeout:Math.max(1,Math.min(3000,deadline-now())),maxBuffer:4096,stdio:['ignore','pipe','pipe']}).trim(); }
    catch { hold('LOCAL_IMAGE_INSPECT_UNAVAILABLE'); }
  });
  let candidate;
  try { candidate = inspectCandidate(context.candidate.imageId,context.targetSha,args=>{check();const value=run(args);check();return value;}); }
  catch(error) { if (/^RECOVERY_MATERIAL_HOLD=/.test(error.message)) throw error; hold('LOCAL_IMAGE_IDENTITY'); }
  if (!same(candidate,context.candidate)) hold('LOCAL_IMAGE_IDENTITY');
  for (const observation of observations) {
    check();
    if (!same(observation.initial,fileIdentity(io.lstatSync(observation.file)))) hold('MATERIAL_REPLACED');
    const bytes = readPinnedFile(observation.file,{contract:CONTRACT,uid},{fs:boundedIo,inspectDirectory:inspect});
    if (!same(observation.initial,fileIdentity(io.lstatSync(observation.file)))) hold('MATERIAL_REPLACED');
    if (hash(bytes) !== observation.sha256) hold('MATERIAL_CHANGED');
  }
  guard(); assertSameDirectory(before,inspect(directory)); check();
  const finished = now();
  return { schema:'phoenix.maintenance-core-material-observation/v1',contextDigest,planDigest,
    startedAt:new Date(started).toISOString(),finishedAt:new Date(finished).toISOString(),
    status:'CORE_MATERIALS_OBSERVED',image:{...candidate,digestKind:'DOCKER_IMAGE_CONFIG_ID',sha256:candidate.imageId.slice(7)},
    files:observations.map(({relative,sha256})=>({relative,sha256})),coreHelperClosure:'KNOWN_SEVEN_CORE_ENTRIES_ONLY',
    recoveryReady:false,productionMutation:false,admissionOrApprovalGranted:false,registryInstalled:false,
    unverified:['OLD_INSTALLED_GUARD_CLOSURE','FUTURE_PRODUCER_CLOSURE','OPERATOR_AUTHORITY','SCHEMA_FLOOR_COMPATIBILITY','IMAGE_LAYER_RECOVERABILITY','SOURCE_ORIGIN_PROVENANCE','OUTER_PROCESS_SUPERVISION'] };
}
