// Code-only descendant deployment while the original public maintenance page remains live.
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectApiParticipant, verifyParticipantStatus } from './background-control-coordinator.mjs';
import { assertNoCutoverControlState, readPublicManifest } from './background-control-manifest.mjs';
import { assertLatestMain } from './background-deployment-session.mjs';
import { captureRuntime, IMAGE_ID, REVISION } from './capture-production-runtime.mjs';
import { CONTRACT, migrationScope } from './production-config-guard.mjs';
import { assertModernReleaseAdmission } from './production-maintenance-admission.mjs';
import { canonicalDigest, same } from './production-maintenance-receipts.mjs';
import { ModernSchemaIngress } from './production-modern-schema-ingress.mjs';
import { ModernSchemaRegistry } from './production-modern-schema-registration.mjs';
import { readHeldHandoff } from './production-remediation-fence-transfer.mjs';
import { assertHeldEdge, heldOwner } from './production-remediation-held-facts.mjs';

const original = 'fa1ea7a2c9de8a99b202c80645e73379dffaa2c9';
const apiOwner = '45256139320-1';
const webOwner = '45286437600-1';
const ownerPattern = /^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/;
const requireFact = (condition, code) => { if (!condition) throw new Error(`HELD_FOLLOW_UP=${code}`); };
const deploy = (store, owner) => store.read(`deploy-${owner}.json`);
const validPin = (pin, revision) => pin?.revision === revision && IMAGE_ID.test(pin.imageId);
const complete = (record, mode, sha) => record.version === CONTRACT.version && record.target === sha &&
  record.configSha === sha && record.floorSha === sha && record.deployMode === mode && record.outcome === 'SUCCESS';

function history(store, readHandoff, inspectRetirement) {
  const handoff = readHandoff(store, original);
  requireFact(handoff?.entry?.recoveryOwner === '45173837813-1', 'ORIGINAL_HANDOFF');
  const suffix = `${original}.json`;
  const consumed = store.read(`schema-release-1123-consumed-${suffix}`);
  const seal = store.read(`schema-release-1123-web-completed-${suffix}`);
  const verified = store.read(`schema-release-1123-web-verified-${suffix}`);
  const originalApi = deploy(store, apiOwner), originalWeb = deploy(store, webOwner);
  const archive = store.read(`schema-release-forward-terminal-archive-${apiOwner}.json`);
  const openIntent = store.read(`schema-release-open-commit-intent-${apiOwner}.json`);
  const removalIntent = store.read(`schema-release-handoff-remove-intent-${handoff.entry.recoveryOwner}.json`);
  const removed = store.read(`schema-release-handoff-removed-${handoff.entry.recoveryOwner}.json`);
  requireFact(consumed.owner === apiOwner && consumed.targetSha === original, 'ORIGINAL_CONSUMED');
  requireFact(complete(originalApi, 'api', original) && complete(originalWeb, 'web', original) &&
    validPin(originalApi.active?.api, original) && same(originalApi.active.api, originalWeb.active?.api) &&
    validPin(originalWeb.active?.web, original), 'ORIGINAL_IMAGES');
  requireFact(archive.schema === 'phoenix.modern-schema-forward-terminal-archive/v1' && archive.defaultOff === true &&
    archive.openCommitIntentSha256 === canonicalDigest(openIntent) && openIntent.formalDeploymentSha256 === canonicalDigest(originalApi) &&
    verified.apiTerminalSha256 === canonicalDigest(archive), 'ORIGINAL_API_TERMINAL');
  requireFact(seal.schema === 'phoenix.remediation-1123-completed-web/v1' && seal.apiOwner === apiOwner &&
    seal.webOwner === webOwner && seal.targetSha === original && seal.formalSha256 === canonicalDigest(originalWeb) &&
    seal.verificationSha256 === canonicalDigest(verified) && seal.apiImageId === originalWeb.active.api.imageId &&
    seal.webImageId === originalWeb.active.web.imageId, 'ORIGINAL_WEB_TERMINAL');
  requireFact(same(removed, { ...removalIntent, oldAbsent: true, outerIngressHeld: true }) &&
    removalIntent.originalOwner === heldOwner && removalIntent.apiOwner === apiOwner && removalIntent.webOwner === webOwner &&
    removalIntent.targetSha === original && removalIntent.archiveSha256 === handoff.entry.archiveSha256 &&
    removalIntent.oldIdentity === handoff.entry.ingressIdentitySha256 && removalIntent.webSealSha256 === canonicalDigest(seal),
  'ORIGINAL_RETIREMENT');
  requireFact(inspectRetirement(handoff) === 0, 'NATIVE_FENCE_PRESENT');
  return originalWeb.active;
}

function checkOpen(store, manifest, owner, revision, project, verify) {
  const control = store.read('background-control.json');
  assertNoCutoverControlState(control);
  requireFact(manifest && ['phase', 'owner', 'generation', 'targetSha'].every(key => control[key] === manifest[key]) &&
    control.phase === 'OPEN' && control.owner === owner && control.targetSha === revision &&
    control.manifestDigest === createHash('sha256').update(JSON.stringify(manifest)).digest('hex') &&
    Array.isArray(manifest.participants) && manifest.participants.length === 1 &&
    manifest.participants[0].revision === revision, 'BACKGROUND_NOT_OPEN');
  verify(manifest.participants[0], project, manifest);
}

const inspectRetirement = handoff => new ModernSchemaIngress({
  context: handoff.original.context, scope: handoff.original.ingressScope, admit: () => false,
}).names().length;
const verifyOpenParticipant = (participant, project, manifest) =>
  verifyParticipantStatus(inspectApiParticipant(participant, project), participant, manifest);

export function verifyHeldFollowUp(requestedPhase, env, deps = {}) {
  const { DEPLOY_MODE: mode, DEPLOY_RUN_ID: dispatchOwner, TARGET_SHA: target, HELD_FOLLOW_UP: selection } = env;
  const webRequest = /^web-([0-9]+-[0-9]+)(?:-verify-([0-9]+-[0-9]+))?$/.exec(selection || '');
  const selectedApiOwner = webRequest?.[1], replayOwner = webRequest?.[2];
  const owner = replayOwner ?? dispatchOwner;
  const phase = replayOwner ? 'seal' : requestedPhase;
  requireFact(!replayOwner || requestedPhase === 'admit' && mode === 'web' && owner !== dispatchOwner, 'REPLAY_INPUT');
  requireFact(REVISION.test(target) && target !== original && ownerPattern.test(owner) && ownerPattern.test(dispatchOwner) && ['admit', 'before', 'after', 'seal'].includes(phase) &&
    ((mode === 'api' && selection === 'api' && env.BUILD_API === 'true' && env.BUILD_WEB === 'false' &&
      env.APPROVED_CONFIG_FLOOR_SHA === target && env.APPROVED_PREVIOUS_FLOOR_SHA === original) ||
    (mode === 'web' && ownerPattern.test(selectedApiOwner) && ![owner, apiOwner, webOwner].includes(selectedApiOwner) &&
      env.BUILD_API === 'false' && env.BUILD_WEB === 'true' && !env.APPROVED_CONFIG_FLOOR_SHA && !env.APPROVED_PREVIOUS_FLOOR_SHA)) &&
    env.RUN_MIG === 'false' && env.APPROVE_PRODUCTION === 'true' && env.PRESERVE_ARTIFACTS === 'true' &&
    !env.MODERN_SCHEMA_WEB_SELECTION && !env.MAINTENANCE_RELEASE_INPUT && !env.NGINX_CONF &&
    !env.SKU_SOURCE_EFFECTIVE_DATE && !env.SKU_SOURCE_PLAN_SHA256 &&
    env.ROTATE_CHANJET_CREDENTIALS === 'false' && env.ONE_TIME_CONFIG_FLOOR_TRANSITION === 'false', 'INPUT');
  const store = deps.store ?? new ModernSchemaRegistry();
  store.guard();
  if (replayOwner || phase !== 'seal') (deps.latestMain ?? assertLatestMain)(target);
  const scope = (deps.migrations ?? migrationScope)(CONTRACT.repository, original, target);
  requireFact(scope?.changed?.length === 0, 'MIGRATION_SCOPE');
  requireFact(!store.exists('schema-release-1123-origin-open.json') && !store.exists('schema-release-pending.json') &&
    !store.exists('cutover-pending.json') && !store.exists('maintenance-current.json') && !store.exists('maintenance-transaction.json'), 'OTHER_MAINTENANCE');
  requireFact(!['consumed', 'web-completed', 'web-verified'].some(kind =>
    store.exists(`schema-release-1123-${kind}-${target}.json`)), 'CANDIDATE_SCHEMA_RECEIPT');
  const ownsTransaction = phase === 'before' || phase === 'after';
  if (ownsTransaction) {
    const tx = store.read('transaction.json');
    requireFact(tx.runId === owner && tx.target === target && tx.phase === 'IN_PROGRESS', 'TRANSACTION_OWNER');
    if (mode === 'api') {
      const policy = store.read('policy-transition.json');
      requireFact(policy.runId === owner && policy.target === target && policy.operation === 'CODE_HOLD', 'POLICY_OWNER');
    }
  } else {
    requireFact(!store.exists('transaction.json'), 'TRANSACTION_PENDING');
  }
  if (!(ownsTransaction && mode === 'api')) requireFact(!store.exists('policy-transition.json'), 'POLICY_PENDING');
  if (requestedPhase === 'admit') (deps.admit ?? assertModernReleaseAdmission)();
  const base = history(store, deps.handoff ?? readHeldHandoff, deps.retired ?? inspectRetirement);
  const actual = (deps.runtime ?? captureRuntime)(), active = store.read('active.json'), floor = store.read('floor.json');
  const floorSha = mode === 'api' && phase === 'admit' ? original : target;
  requireFact(floor.version === CONTRACT.version && floor.phase === 'READY' && floor.floorSha === floorSha &&
    floor.chanjetPolicy === 'HOLD' && floor.readonlyApproval === null &&
    active.version === CONTRACT.version && active.floorSha === floorSha, 'FLOOR');

  let previous = base;
  if (mode === 'web') {
    const api = deploy(store, selectedApiOwner);
    requireFact(complete(api, 'api', target) && same(api.previous, base) && same(api.active?.web, base.web) &&
      validPin(api.active?.api, target) && api.switched?.api === true && api.switched?.web === false &&
      api.migrationPaths?.length === 0, 'TARGET_API_UNVERIFIED');
    previous = api.active;
  }
  if (phase === 'admit' || mode === 'web' || phase === 'seal') {
    const currentApiOwner = mode === 'web' ? selectedApiOwner : phase === 'seal' ? owner : apiOwner;
    const currentRevision = floorSha;
    checkOpen(store, (deps.manifest ?? readPublicManifest)(), currentApiOwner, currentRevision, floor.project, deps.verifyParticipant ?? verifyOpenParticipant);
  }
  if (phase === 'admit') {
    requireFact(active.outcome === 'SUCCESS' && same(active.active, previous) && same(actual, previous), 'ADMISSION_PINS');
  } else {
    const record = deploy(store, owner);
    const switched = phase !== 'before';
    const expected = { ...previous, [mode]: switched ? record.candidates?.[mode] : previous[mode] };
    requireFact(record.target === target && record.floorSha === target && record.configSha === target &&
      record.deployMode === mode && record.migrationPaths?.length === 0 && same(record.previous, previous) &&
      record.outcome === (phase === 'seal' ? 'SUCCESS' : switched ? 'SWITCHING' : 'PREPARED') &&
      record.switched?.[mode] === switched && record.switched?.[mode === 'api' ? 'web' : 'api'] === false &&
      validPin(record.candidates?.[mode], target) && same(record.active, expected) && same(actual, expected), 'SWITCH_PINS');
    if (phase === 'seal') requireFact(active.outcome === 'SUCCESS' && same(active.active, actual), 'SEALED_PINS');
  }
  (deps.edge ?? assertHeldEdge)(store.directory, { forceProbe: true });
  return { phase, target, mode, publicMaintenance: true, migrations: false, receiptOnly: Boolean(replayOwner) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = verifyHeldFollowUp(process.argv[2], process.env);
    console.log(result.receiptOnly ? 'HELD_WEB_RECEIPT_VERIFIED' : `HELD_FOLLOW_UP=PASS_${result.mode.toUpperCase()}_${result.phase.toUpperCase()}`);
  } catch (error) {
    const message = error?.message;
    console.error(typeof message === 'string' && /^[A-Z_]+=[A-Z_]+$/.test(message) ? message : 'HELD_FOLLOW_UP=UNVERIFIED');
    process.exitCode = 1;
  }
}
