/** Release entrypoint admission, deliberately separate from verifyContext.
 * This module never changes state, runs Docker, or accepts an environment bypass.
 * Call it immediately before the typed effect while retaining the same FD 9. */
import {isOwnerDelegatedMaintenanceApproval} from './production-maintenance-owner-authority.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { CONTRACT, verifyContext } from './production-config-guard.mjs';
import { inspectTrustedDirectory, assertSameDirectory, readPinnedFile } from './production-trusted-paths.mjs';
import { MaintenanceReceiptStore, validateMaintenanceContext, bindingDigest, canonicalDigest, same,
  verifyGithubMaintenanceAuthority, HASH, hold, iso } from './production-maintenance-receipts.mjs';

const ownerPattern = /^\d+-\d+$/;
const profiles = Object.freeze({
  FENCE_INGRESS: { intent: 'FENCE_INGRESS', phases: ['PREPARED'], to: 'INGRESS_FENCED', status: 'FENCED_PREPARATION' },
  DISABLE_RESTART_POLICY: { intent: 'FENCE_INGRESS', phases: ['PREPARED'], to: 'INGRESS_FENCED', status: 'FENCED_PREPARATION' },
  DISCONNECT_LEGACY_NETWORKS: { intent: 'FENCE_INGRESS', phases: ['PREPARED'], to: 'INGRESS_FENCED', status: 'FENCED_PREPARATION' },
  STOP_LEGACY: { intent: 'STOP_LEGACY', phases: ['INGRESS_FENCED'], to: 'STOPPED_UNRECONCILED', status: 'FENCED' },
  RECONCILE: { intent: 'RECONCILE', phases: ['STOPPED_UNRECONCILED'], to: 'LEGACY_RECONCILED', status: 'HOLD_RECONCILIATION_REQUIRED' },
  PREPARE_PROMOTION: { intent: 'PREPARE_PROMOTION', phases: ['LEGACY_RECONCILED'], to: 'PROMOTION_PREPARED', status: 'FENCED' },
  REPLACE_CANDIDATE: { intent: 'REPLACE_CANDIDATE', phases: ['PROMOTION_PREPARED'], to: 'CANDIDATE_REPLACED', status: 'FENCED' },
  START_CANDIDATE: { intent: 'START_CANDIDATE', phases: ['CANDIDATE_REPLACED'], to: 'CANDIDATE_FENCED', status: 'HOLD_CANDIDATE_REVALIDATION_REQUIRED' },
  VERIFY_CANDIDATE: { intent: 'VERIFY_CANDIDATE', phases: ['CANDIDATE_FENCED'], to: 'VERIFIED_FENCED', status: 'FENCED' },
  OPEN_CANDIDATE: { intent: 'OPEN_CANDIDATE', phases: ['COMPLETED_OPEN'], to: 'COMPLETED_OPEN', status: 'OPEN_COMMIT_PENDING' },
});
const statIdentity = s => [s.dev, s.ino, s.uid, s.mode, s.nlink, s.size, s.mtimeMs, s.ctimeMs];
function safeStoreCall(work) {
  try { return work(); }
  catch (error) { if (/^(?:MAINTENANCE|CONFIG)_HOLD=[A-Z0-9_]+$/.test(error.message)) throw error; hold('MAINTENANCE_RECORD_INVALID'); }
}
function optionalLstat(file, io) {
  try { return io.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; hold('MAINTENANCE_PATH_UNREADABLE'); }
}
function dependencies(options, overrides) {
  const directory = options.directory || CONTRACT.stateDirectory;
  const guard = overrides.guard || (() => verifyContext(CONTRACT.repository, directory));
  const inspect = overrides.inspectDirectory || (value => inspectTrustedDirectory(value, CONTRACT));
  const io = overrides.fs || fs, expectedUid = overrides.expectedUid ?? 0;
  const store = context => new MaintenanceReceiptStore(context, { directory, guard, inspectDirectory: inspect, expectedUid });
  const read = file => {
    if (!optionalLstat(file, io)) hold('MAINTENANCE_RECORD_REQUIRED');
    try { return JSON.parse(readPinnedFile(file, { contract: CONTRACT, uid: expectedUid }, { fs: io, inspectDirectory: inspect })); }
    catch (error) { if (/^(?:MAINTENANCE|CONFIG)_HOLD=/.test(error.message)) throw error; hold('MAINTENANCE_RECORD_INVALID'); }
  };
  return { directory, guard, inspect, io, expectedUid, store, read };
}
function existingNames(d) {
  try {
    const names = d.io.readdirSync(d.directory);
    if (names.length > 4096) hold('MAINTENANCE_DIRECTORY_REQUIRES_AUDIT');
    return names;
  } catch (error) { if (error.message.startsWith('MAINTENANCE_HOLD=')) throw error; hold('MAINTENANCE_DIRECTORY_UNREADABLE'); }
}
function pinnedState(d, context) {
  const file = path.join(d.directory, `maintenance-${context.owner}.json`);
  const direct = d.read(file), store = d.store(context);
  const state = safeStoreCall(() => MaintenanceReceiptStore.prototype.readState.call(store));
  if (!state || !same(direct, state) || state.schema !== 'phoenix.legacy-maintenance-state/v1'
    || !same(state.context, context) || state.contextDigest !== bindingDigest(context)) hold('MAINTENANCE_STATE_MISMATCH');
  return { state, store, file };
}

/** Every ordinary modern release remains blocked for the whole maintenance
 * lifecycle, including gaps between individual operation transaction markers. */
export function assertModernReleaseAdmission(options = {}, overrides = {}) {
  const d = dependencies(options, overrides); d.guard(); const before = d.inspect(d.directory);
  for (const name of ['maintenance-current.json', 'maintenance-transaction.json']) {
    if (optionalLstat(path.join(d.directory, name), d.io)) hold('MAINTENANCE_LIFECYCLE_ACTIVE');
  }
  const names = existingNames(d);
  for (const name of names.filter(value => /^maintenance-\d+-\d+\.json$/.test(value))) {
    const raw = d.read(path.join(d.directory, name)); validateMaintenanceContext(raw.context);
    if (name !== `maintenance-${raw.context.owner}.json`) hold('MAINTENANCE_STATE_OWNER_MISMATCH');
    const { state, store } = pinnedState(d, raw.context);
    if (state.phase !== 'COMPLETED_OPEN' || state.status !== 'SUCCESS') hold('ORPHAN_UNFINISHED_MAINTENANCE');
    const last = state.receipts.at(-1);
    if (!last || safeStoreCall(() => store.readReceipt(last)).kind !== 'OPEN_PUBLISHED') hold('MAINTENANCE_COMPLETION_UNPROVEN');
    const archive = d.read(path.join(d.directory, `maintenance-owner-${state.context.owner}-${state.stateDigest}.json`));
    if (archive.schema !== 'phoenix.maintenance-owner/v1' || archive.owner !== state.context.owner || archive.contextDigest !== state.contextDigest) hold('MAINTENANCE_COMPLETION_UNPROVEN');
  }
  // Do not let a dangling symlink or unreadable marker be mistaken for absence,
  // including a new marker appearing during historical receipt verification.
  for (const name of ['maintenance-current.json', 'maintenance-transaction.json']) {
    if (optionalLstat(path.join(d.directory, name), d.io)) hold('MAINTENANCE_LIFECYCLE_ACTIVE');
  }
  assertSameDirectory(before, d.inspect(d.directory)); d.guard();
  return { schema: 'phoenix.maintenance-admission/v1', mode: 'MODERN_RELEASE', result: 'ADMITTED' };
}

function deadline(context, budget, now) {
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > CONTRACT.maximumTransitionMs) hold('MAINTENANCE_OPERATION_BUDGET_REQUIRED');
  if (now < Date.parse(context.window.start) || now + budget >= Date.parse(context.window.end)) hold('MAINTENANCE_WINDOW_CLOSED');
}
function readLegacy(d, context, { operation, expectedPhase, expectedStateDigest }, checkedAt) {
  const profile = profiles[operation];
  if (!profile || !profile.phases.includes(expectedPhase) || !HASH.test(expectedStateDigest)) hold('MAINTENANCE_TYPED_OPERATION_REQUIRED');
  const currentFile = path.join(d.directory, 'maintenance-current.json'), markerFile = path.join(d.directory, 'maintenance-transaction.json');
  const current = d.read(currentFile);
  if (current.schema !== 'phoenix.maintenance-owner/v1' || current.owner !== context.owner || current.contextDigest !== bindingDigest(context)) hold('MAINTENANCE_OWNER_MISMATCH');
  const { state, store, file } = pinnedState(d, context);
  if (state.phase !== expectedPhase || state.stateDigest !== expectedStateDigest || state.status !== profile.status) hold('MAINTENANCE_PHASE_OR_DIGEST_MISMATCH');
  // Read with lstat/pinned metadata before calling the real store method. Never
  // accept a caller's object implementing an assertOwnedIntent-shaped function.
  const marker = d.read(markerFile);
  if (typeof MaintenanceReceiptStore.prototype.assertOwnedEffectState !== 'function') hold('MAINTENANCE_EFFECT_STATE_VALIDATOR_UNAVAILABLE');
  const owned = safeStoreCall(() => MaintenanceReceiptStore.prototype.assertOwnedEffectState.call(store, profile.intent, state));
  if (!same(marker, owned) || marker.owner !== context.owner || marker.contextDigest !== state.contextDigest || marker.operation !== profile.intent || marker.to !== profile.to) hold('MAINTENANCE_INTENT_MISMATCH');
  if (!iso(current.claimedAt) || !iso(marker.startedAt) || !iso(state.updatedAt)
    || Date.parse(current.claimedAt) < Date.parse(context.window.start) || Date.parse(current.claimedAt) > Date.parse(marker.startedAt)
    || Date.parse(marker.startedAt) > checkedAt || Date.parse(marker.startedAt) >= Date.parse(context.window.end)
    || Date.parse(state.updatedAt) < Date.parse(context.window.start) || Date.parse(state.updatedAt) > checkedAt) hold('MAINTENANCE_INTENT_TIME_MISMATCH');
  return { state, current, marker, identities: [currentFile, markerFile, file].map(name => {
    const stat = optionalLstat(name, d.io); if (!stat) hold('MAINTENANCE_RECORD_REQUIRED'); return statIdentity(stat);
  }) };
}

/** A time-bound admission snapshot, never a bearer capability or global bypass.
 * The actual typed adapter must retain FD 9 and re-check before each effect. */
export async function assertLegacyMaintenanceAdmission(options, overrides = {}) {
  validateMaintenanceContext(options?.context);
  if (!ownerPattern.test(options.context.owner)) hold('MAINTENANCE_OWNER_MISMATCH');
  const context = structuredClone(options.context), d = dependencies(options, overrides), now = overrides.now || Date.now;
  const verifyAuthority = overrides.verifyAuthority || (async () => false);
  deadline(context, options.requiredBudgetMs, now()); d.guard(); const beforeDirectory = d.inspect(d.directory);
  const before = readLegacy(d, context, options, now());
  const approval = options.approval, profile = profiles[options.operation];
  const expected = { purpose: 'MAINTENANCE', operation: options.operation, intentOperation: profile.intent,
    bindingDigest: bindingDigest(context), targetSha: context.targetSha, context,
    expectedPhase: options.expectedPhase, stateDigest: before.state.stateDigest, intentSha256: canonicalDigest(before.marker) };
  const verify=async()=>{try{return await verifyAuthority(approval,expected)===true;}catch{return false;}};
  const ownerDelegated=approval?.authorityKind==='OWNER_DELEGATED';
  const authorized=ownerDelegated?(isOwnerDelegatedMaintenanceApproval(approval,expected)&&await verify()):(
    approval?.authorityKind===undefined&&Date.parse(approval?.serverRecord?.submittedAt)<=now()
    &&await verifyGithubMaintenanceAuthority(approval,expected,{verifyServerRecord:verify})===true);
  if(approval?.payload?.protocol!=='STOP_AND_RECONCILE'||!Array.isArray(approval.payload.operations)
    ||!approval.payload.operations.includes(options.operation)||!approval.payload.operations.includes(profile.intent)||!authorized)hold('INDEPENDENT_MAINTENANCE_AUTHORITY_REQUIRED');
  // Authority retrieval can await remote service calls. Re-read all identities
  // and the owned intent after it, rather than using a stale approval snapshot.
  deadline(context, options.requiredBudgetMs, now()); d.guard();
  const after = readLegacy(d, context, options, now());
  if (!same(before, after)) hold('MAINTENANCE_ADMISSION_CHANGED');
  assertSameDirectory(beforeDirectory, d.inspect(d.directory)); deadline(context, options.requiredBudgetMs, now());
  return { schema: 'phoenix.maintenance-admission/v1', mode: 'LEGACY_EXACT_INTENT', result: 'ADMITTED', owner: context.owner,
    contextDigest: expected.bindingDigest, operation: options.operation, intentOperation: profile.intent, phase: after.state.phase,
    stateDigest: after.state.stateDigest, intentSha256: expected.intentSha256, deadlineAt: context.window.end,
    admittedAt: new Date(now()).toISOString(), requiredBudgetMs: options.requiredBudgetMs };
}
