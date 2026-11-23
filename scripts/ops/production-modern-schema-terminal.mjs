/** Normalize a completed typed release for the ordinary Web follow-up. The
 * original supervisor retains FD9 and both PostgreSQL locks through this step. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {CONTRACT} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {atomicState} from './production-atomic-state.mjs';
import {assertContained, assertRegularFile, assertSameDirectory, readPinnedFile} from './production-trusted-paths.mjs';
import {assertNoCutoverControlState, assertSameBinding, readPublicManifest, validateManifest} from './background-control-manifest.mjs';
import {inspectApiParticipant, verifyCompletedDeployment, verifyParticipantStatus} from './background-control-coordinator.mjs';
import {canonicalDigest, HASH, iso, same} from './production-maintenance-receipts.mjs';
import {RECEIPT_DIRECTORY, validateRegistryReceipt} from './chanjet-admission-schema-receipt.mjs';
import {MODERN_SCHEMA_PHASES, modernSchemaReleaseBinding, validateModernSchemaPending} from './production-modern-schema-state.mjs';
import {readRegisteredModernSchemaApproval, validateModernSchemaContext} from './production-modern-schema-authority.mjs';
import {ModernSchemaRegistry, validateModernSchemaPreparation} from './production-modern-schema-registration.mjs';
import {assertModernSchemaLeaseStillOriginal, assertOriginalModernSchemaProcess} from './production-modern-schema-session-lease.mjs';
import {assertModernSchemaBusinessUnchanged, captureModernSchemaDefaultOff, defaultOffEvidenceFromFacts} from './production-modern-schema-facts.mjs';
import {verifyModernSchemaAuditAfterSchema} from './production-modern-schema-post-audit.mjs';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {confirmModernSchemaPublicDurability, modernSchemaOriginalSessionExitSql} from './production-modern-schema-completion.mjs';
import {captureModernSchemaLedger} from './production-modern-schema-schema-result.mjs';

const pendingFile = 'schema-release-pending.json';
const controlFile = 'background-control.json';
const last = MODERN_SCHEMA_PHASES.length - 1;
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const fail = code => { throw Error('MODERN_SCHEMA_TERMINAL_HOLD=' + code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = stat => [stat.dev, stat.ino, stat.mode, stat.uid, stat.nlink, stat.size, stat.mtimeMs, stat.ctimeMs];

function withinWindow(value, context, now) {
  return iso(value) && Date.parse(value) >= Date.parse(context.window.start) &&
    Date.parse(value) < Date.parse(context.window.end) && Date.parse(value) <= now;
}

function stepChain(store, pending, binding, approval, context, now, held = false) {
  const steps = [];
  let previous = null;
  let previousAt = Date.parse(context.window.start);
  for (const [sequence, phase] of MODERN_SCHEMA_PHASES.slice(0,pending.sequence+1).entries()) {
    const step = store.read('schema-release-step-' + context.owner + '-' + sequence + '-' + phase.toLowerCase().replaceAll('_', '-') + '.json');
    assertSameBinding(step, binding);
    if (step.schema !== 'phoenix.modern-schema-release-step/v1' || step.sequence !== sequence || step.to !== phase ||
        step.from !== (sequence === 0 ? null : MODERN_SCHEMA_PHASES[sequence - 1]) || step.previousDigest !== previous ||
        !withinWindow(step.recordedAt, context, now) || Date.parse(step.recordedAt) < previousAt || !plain(step.payload)) fail('EXACT_STEP_CHAIN_REQUIRED');
    if (sequence === 0) {
      if (!same(step.payload, {approvalSha256: approval.approvalSha256, supervisor: pending.supervisor})) fail('REGISTERED_OWNER_CHANGED');
    } else {
      const payload = step.payload;
      if (payload.schema !== 'phoenix.modern-schema-step-evidence/v1' || payload.kind !== phase ||
          payload.contextDigest !== binding.schemaRelease.contextDigest || !plain(payload.evidence) ||
          payload.evidenceSha256 !== canonicalDigest(payload.evidence)) fail('EXACT_STEP_EVIDENCE_REQUIRED');
    }
    steps.push(step);
    previous = canonicalDigest(step);
    previousAt = Date.parse(step.recordedAt);
  }
  const recordedAt = steps[pending.sequence]?.recordedAt;
  const tipTimeMatches = held
    ? withinWindow(pending.updatedAt, context, now) && Date.parse(pending.updatedAt) >= Date.parse(recordedAt)
    : pending.updatedAt === recordedAt;
  if (pending.sequence<0||pending.sequence>last||pending.receiptSha256 !== previous || !tipTimeMatches) {
    fail('TERMINAL_CHAIN_TIP_MISMATCH');
  }
  return steps;
}

function resolveArtifact(store, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) fail('EXACT_ARTIFACT_PATH_REQUIRED');
  assertContained(value, store.directory);
  return value;
}

function fixedArtifact(store, value, expected) {
  if (resolveArtifact(store, value) !== path.join(store.directory, expected)) fail('ARTIFACT_BINDING_CHANGED');
}
function readArtifact(store, ref, hash, expected) {
  const file = resolveArtifact(store, ref);
  if (file !== path.join(store.directory, expected) || !HASH.test(hash ?? '')) fail('EXACT_ARTIFACT_PIN_REQUIRED');
  const stat = store.io.lstatSync(file);
  assertRegularFile(stat, {uid: store.uid});
  if (stat.size < 2 || stat.size > 8 * 1024 * 1024) fail('BOUNDED_ARTIFACT_REQUIRED');
  const raw = readPinnedFile(file, {contract: CONTRACT, uid: store.uid}, {fs: store.io, inspectDirectory: store.inspect});
  const value = JSON.parse(raw);
  if (canonicalDigest(value) !== hash) fail('ARTIFACT_CONTENT_CHANGED');
  return value;
}

function validateSchemaEvidence({store, backupStep, schemaStep, context, contextDigest, preparationSha256, lease, now, historicalCliLabel = false}) {
  const filename = 'schema-release-schema-receipt-' + context.owner + '.json';
  fixedArtifact(store, schemaStep.schemaReceiptFile, filename);
  const read = (file, hash, expected) => readArtifact(store, file, hash, expected);
  const bundle = read(schemaStep.schemaReceiptFile, schemaStep.schemaReceiptSha256, filename);
  if (bundle.schema !== 'phoenix.modern-schema-effect-receipt/v1' || bundle.owner !== context.owner ||
      bundle.contextDigest !== contextDigest || bundle.preparationSha256 !== preparationSha256 ||
      bundle.targetSha !== context.targetSha || bundle.runtimeSha !== context.runtimeSha ||
      bundle.beforeLedgerSha256 !== context.beforeLedgerSha256 || !HASH.test(bundle.afterLedgerSha256 ?? '') ||
      bundle.afterLedgerSha256 === bundle.beforeLedgerSha256 || bundle.pendingPlanSha256 !== canonicalDigest(context.pendingMigrations) ||
      bundle.sourceInventorySha256 !== context.sourceInventorySha256 || bundle.candidateInventorySha256 !== context.candidateInventorySha256 ||
      !same(bundle.originalLease, lease) || bundle.outcome !== 'SUCCESS_SCHEMA_ONLY' || bundle.schemaApplied !== true ||
      bundle.businessActivation !== false || bundle.originalConclusion !== context.originalConclusion || !withinWindow(bundle.createdAt, context, now)) {
    fail('EXACT_SCHEMA_EFFECT_RECEIPT_REQUIRED');
  }
  const backupDirectory = 'schema-release-fenced-backup-' + context.owner + '/';
  const rehearsalDirectory = 'schema-release-fenced-rehearsal-' + context.owner + '/';
  const backup = read(backupStep.backupReceiptFile, backupStep.backupReceiptSha256, backupDirectory + 'backup-receipt.json');
  const rehearsal = read(backupStep.rehearsalFile, backupStep.rehearsalSha256, rehearsalDirectory + 'rehearsal-receipt.json');
  if (backup.schema !== 'phoenix.modern-schema-protected-backup/v1' || backup.owner !== context.owner || backup.stage !== 'fenced' ||
      backup.format !== 'POSTGRES_CUSTOM' || backup.tocVerified !== true || backup.fullParseVerified !== true || backup.fullParseExitCode !== 0 ||
      backup.productionRestore !== false || backup.sourceLedgerSha256 !== bundle.beforeLedgerSha256 ||
      backup.sourceBusinessFactsSha256 !== bundle.businessDataSha256 || !withinWindow(backup.createdAt, context, now) ||
      !HASH.test(backup.backup?.sha256 ?? '') || backup.backup.sha256 !== bundle.backupSha256 ||
      !Number.isSafeInteger(backup.backup.bytes) || backup.backup.bytes < 64) fail('EXACT_FENCED_BACKUP_REQUIRED');
  fixedArtifact(store, backup.backup.path, backupDirectory + 'database-dump.stdout');
  if (rehearsal.schema !== 'phoenix.modern-schema-isolated-rehearsal/v1' || rehearsal.owner !== context.owner ||
      rehearsal.runtimeSha !== context.runtimeSha || rehearsal.targetSha !== context.targetSha || rehearsal.candidateImageId !== context.candidateImageId ||
      rehearsal.beforeLedgerSha256 !== bundle.beforeLedgerSha256 || rehearsal.afterLedgerSha256 !== bundle.afterLedgerSha256 ||
      rehearsal.backupSha256 !== bundle.backupSha256 || rehearsal.pendingPlanSha256 !== bundle.pendingPlanSha256 || rehearsal.outcome !== 'PASS' ||
      rehearsal.originalRuntimeReady !== true || rehearsal.candidateReady !== true || rehearsal.businessFactsUnchanged !== true ||
      rehearsal.backgroundWrites !== 0 || rehearsal.isolatedRestore !== true || rehearsal.productionMutation !== false) fail('EXACT_BACKUP_REHEARSAL_REQUIRED');

  const migrationDirectory = 'schema-release-migration-' + context.owner + '/';
  const driver = read(bundle.driverReceiptFile, bundle.driverReceiptSha256, migrationDirectory + 'schema-driver-receipt.json');
  // The historical writer spread the creation record over the result tag.
  // Accept those already-sealed results only on the held API evidence path.
  const isCliResult = (cli, index) => cli.schema === 'phoenix.modern-schema-gated-cli-result/v1' ||
    historicalCliLabel && cli.schema === 'phoenix.modern-schema-owned-cli/v1' &&
    cli.role === 'controlled-migration-' + (index ? 'show' : 'run') &&
    cli.nativeBackend?.containerId === cli.containerId && cli.nativeBackend.networkId === cli.networkId &&
    same(cli.nativeBackend.backend, cli.backendProof?.backend) && same(cli.originalLease, lease);
  if (driver.schema !== 'phoenix.modern-schema-original-schema-driver/v1' || driver.owner !== context.owner ||
      driver.contextDigest !== contextDigest || driver.imageId !== context.candidateImageId || driver.outcome !== 'SUCCESS' ||
      driver.backupSha256 !== backup.backup.sha256 ||
      driver.automaticRetry !== false || !HASH.test(driver.run?.containerId ?? '') || !HASH.test(driver.show?.containerId ?? '') ||
      driver.run.containerId === driver.show.containerId ||
      [driver.run, driver.show].some((cli, index) => !isCliResult(cli, index) ||
        cli.mode !== (index ? 'show' : 'run') || cli.owner !== context.owner || cli.contextDigest !== contextDigest ||
        cli.imageId !== context.candidateImageId || cli.outcome !== 'SUCCESS' || cli.exitCode !== 0 || cli.oomKilled !== false ||
        cli.restartCount !== 0 || cli.backendProof?.backend?.readonly !== Boolean(index) ||
        cli.backendProof.backend.databaseOid !== lease.database.databaseOid ||
        cli.backendProof.backend.systemIdentifier !== lease.database.systemIdentifier)) fail('EXACT_NATIVE_DRIVER_RECEIPTS_REQUIRED');

  // These files preserve the forensic evidence. The ordinary deployment
  // validator separately re-observes the current native migration ledger.
  const ownerFile = kind => 'schema-release-' + kind + '-' + context.owner + '.json';
  const before = read(bundle.beforeFactsFile, bundle.beforeFactsSha256, ownerFile('before-facts'));
  const after = read(bundle.afterFactsFile, bundle.afterFactsSha256, ownerFile('after-facts'));
  if (before.schema !== 'phoenix.modern-schema-database-facts/v1' || after.schema !== before.schema ||
      !HASH.test(bundle.businessDataSha256 ?? '') || before.businessDataSha256 !== bundle.businessDataSha256 ||
      after.businessDataSha256 !== bundle.businessDataSha256 || before.database?.name !== lease.database.name ||
      before.database?.systemIdentifier !== lease.database.systemIdentifier) fail('EXACT_PRESERVED_BUSINESS_FACTS_REQUIRED');
  assertModernSchemaBusinessUnchanged(before, after);
  const defaultOff = defaultOffEvidenceFromFacts(context.targetSha, after, {floor: store.read('floor.json'),plan:context});
  if (!same(bundle.defaultOffEvidence, defaultOff)) fail('DEFAULT_OFF_RECEIPT_CHANGED');
  const beforeAudit = read(bundle.beforeRawAuditFile, bundle.beforeRawAuditSha256, ownerFile('before-audit'));
  const afterAudit = read(bundle.afterRawAuditFile, bundle.afterRawAuditSha256, ownerFile('after-audit'));
  verifyModernSchemaAuditAfterSchema({context, before: beforeAudit, after: afterAudit, afterLedgerSha256: bundle.afterLedgerSha256});

  if (!Array.isArray(bundle.perMigrationReceipts) || bundle.perMigrationReceipts.length !== context.pendingMigrations.length) {
    fail('COMPLETE_PER_MIGRATION_RECEIPTS_REQUIRED');
  }
  const seen = new Set();
  for (const reference of bundle.perMigrationReceipts) {
    const unit = context.pendingMigrations.find(migration => migration.path === reference.path);
    if (!unit || seen.has(unit.path)) fail('EXACT_MIGRATION_UNIT_REQUIRED');
    seen.add(unit.path);
    const file = RECEIPT_DIRECTORY + '/' + path.basename(unit.path, '.ts') + '.json';
    const receipt = read(reference.receiptFile, reference.receiptSha256, file);
    validateRegistryReceipt(receipt, {migrationPath: unit.path, sourceBlob: unit.sourceBlob});
    if (receipt.runId !== context.owner || receipt.sourceSha !== context.targetSha ||
        receipt.beforeLedgerSha256 !== context.beforeLedgerSha256 || receipt.afterLedgerSha256 !== bundle.afterLedgerSha256) fail('PER_MIGRATION_EFFECT_BINDING_CHANGED');
  }
  return bundle;
}

/** Read a completed schema/body handoff without changing the stopped owner's chain. */
export function readHeldModernSchemaApiBody({store, context, preparationSha256, prepared, pending, now = Date.now()}) {
  const binding = modernSchemaReleaseBinding(context, preparationSha256);
  const contextDigest = binding.schemaRelease.contextDigest;
  validateModernSchemaPending(pending, binding);
  if (pending.status !== 'HOLD' || pending.phase !== 'API_BODY' || pending.sequence !== 9 ||
      pending.holdReason !== 'SCHEMA_RELEASE_FAILED') fail('EXACT_HELD_API_BODY_REQUIRED');
  const historicalTime = Math.min(now, Date.parse(context.window.end) - 1);
  const approval = readRegisteredModernSchemaApproval(context, {now: () => historicalTime});
  const registered = validateModernSchemaPreparation(prepared, historicalTime);
  const consumed = store.read('schema-release-consumed-' + context.owner + '.json');
  if (!same(registered.context, context) || registered.preparationSha256 !== preparationSha256 ||
      consumed.schema !== 'phoenix.modern-schema-preparation-consumption/v1' || consumed.owner !== context.owner ||
      consumed.targetSha !== context.targetSha || consumed.preparationSha256 !== preparationSha256) fail('REGISTERED_PREPARATION_CHANGED');
  const steps = stepChain(store, pending, binding, approval, context, now, true);
  const schemaStep = steps[8].payload.evidence, body = steps[9].payload.evidence;
  const bundle = validateSchemaEvidence({store, backupStep: steps[6].payload.evidence, schemaStep, context,
    contextDigest, preparationSha256, lease: pending.lease, now, historicalCliLabel: true});
  const bodyDirectory = 'schema-release-body-' + context.owner;
  const bodyFile = path.join(store.directory, bodyDirectory, 'formal-api-body-receipt.json');
  const bodyReceipt = JSON.parse(readPinnedFile(bodyFile, {contract: CONTRACT}));
  if (bodyReceipt.schema !== 'phoenix.modern-schema-formal-api-body-result/v1' ||
      bodyReceipt.owner !== context.owner || bodyReceipt.contextDigest !== contextDigest ||
      bodyReceipt.outcome !== 'BODY_COMPLETE' || bodyReceipt.automaticRollback !== false ||
      bodyReceipt.schemaReceiptSha256 !== schemaStep.schemaReceiptSha256 || body.schemaReceiptSha256 !== schemaStep.schemaReceiptSha256 ||
      body.bodySourceSha256 !== prepared.bodySource.bodySha256 || body.workflowSourceSha256 !== prepared.bodySource.workflowSha256 ||
      bodyReceipt.bodySourceSha256 !== body.bodySourceSha256 || bodyReceipt.workflowSourceSha256 !== body.workflowSourceSha256) {
    fail('EXACT_COMPLETED_BODY_RECEIPT_REQUIRED');
  }
  for (const stream of ['stdout', 'stderr']) {
    fixedArtifact(store, bodyReceipt[stream].path, bodyDirectory + '/formal-api-body.' + stream);
    if (!HASH.test(bodyReceipt[stream].sha256 ?? '')) fail('EXACT_COMPLETED_BODY_LOG_REQUIRED');
  }
  const before = readArtifact(store, bundle.beforeFactsFile, bundle.beforeFactsSha256,
    'schema-release-before-facts-' + context.owner + '.json');
  const backup = steps[6].payload.evidence;
  const backupReceipt = readArtifact(store, backup.backupReceiptFile, backup.backupReceiptSha256,
    'schema-release-fenced-backup-' + context.owner + '/backup-receipt.json');
  return {binding, approval, bodyReceipt, before, bundle, backupReceipt, schemaReceiptSha256: schemaStep.schemaReceiptSha256};
}

export function observeIngressAbsent(context, proof) {
  const host = {bootId: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(), namespace: fs.readlinkSync('/proc/self/ns/net')};
  if (!same(proof.host, host)) fail('RELEASED_INGRESS_HOST_CHANGED');
  let inventory;
  try {
    inventory = JSON.parse(execFileSync('/usr/sbin/nft', ['--json', 'list', 'tables'], {
      env: executionEnv(), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch {
    fail('RELEASED_INGRESS_UNOBSERVABLE');
  }
  const table = 'phoenix_maintenance_' + canonicalDigest(context).slice(0, 32);
  return Array.isArray(inventory.nftables) && !inventory.nftables.some(row => row.table?.name === table);
}

function pinPending(store, pending, binding) {
  const io = store.io;
  const directory = store.inspect(store.directory);
  const filename = store.file(pendingFile);
  const pin = () => {
    const stat = io.lstatSync(filename);
    assertRegularFile(stat, {uid: store.uid});
    return identity(stat);
  };
  const before = pin();
  if (!same(validateModernSchemaPending(store.read(pendingFile), binding), pending) || !same(before, pin())) fail('PENDING_REPLACED');
  assertSameDirectory(directory, store.inspect(store.directory));
  return {filename, directory, before, pin};
}

/** Internal entry only. On any disagreement the pending marker remains the
 * ordinary execution deny, including after normalization of the OPEN record. */
export async function prepareModernSchemaOpenCommit(args,dependencies={}){return completeModernSchemaRelease(args,dependencies,true);}
export async function finalizeModernSchemaRelease(args,dependencies={}){return completeModernSchemaRelease(args,dependencies,false);}
async function completeModernSchemaRelease({
  state, context: input, preparationSha256, rootLease, admit, ingressReleaseReceipt,
}, dependencies = {}, preparing) {
  const context = validateModernSchemaContext(input);
  const binding = modernSchemaReleaseBinding(context, preparationSha256);
  const contextDigest = binding.schemaRelease.contextDigest;
  const store = dependencies.store ?? new ModernSchemaRegistry();
  const now = dependencies.now ?? Date.now;
  const authority = dependencies.authority ?? (() => readRegisteredModernSchemaApproval(context));
  const checkProcess = dependencies.checkProcess ?? assertOriginalModernSchemaProcess;
  const checkLease = dependencies.checkLease ?? assertModernSchemaLeaseStillOriginal;
  const readPublic = dependencies.readPublic ?? readPublicManifest;
  const verifyFormal = dependencies.verifyFormal ?? verifyCompletedDeployment;
  const ingressAbsent = dependencies.ingressAbsent ?? observeIngressAbsent;
  const writeOpen = dependencies.writeOpen ?? (value => atomicState(store.file(controlFile), value));
  if (typeof admit !== 'function' || typeof state?.read !== 'function' || !plain(rootLease) || !plain(ingressReleaseReceipt)) {
    fail('ORIGINAL_SUPERVISOR_ADMISSION_REQUIRED');
  }

  const exactPending = () => {
    store.guard();
    const pending = validateModernSchemaPending(state.read(), binding);
    if (pending.phase !== (preparing?'INGRESS_RELEASED':'COMPLETED_OPEN') || pending.status !== 'RUNNING' || pending.supervisor.pid !== process.pid ||
        !same(pending.lease, rootLease) || checkProcess(pending.supervisor) !== true || checkLease(rootLease) !== true ||
        store.exists('transaction.json') || store.exists('policy-transition.json') || store.exists('cutover-pending.json')) {
      fail('EXACT_ORIGINAL_COMPLETED_OPEN_REQUIRED');
    }
    return pending;
  };
  const pending = exactPending();
  const pin = pinPending(store, pending, binding);
  const stillOriginal = () => same(exactPending(), pending) && same(pin.before, pin.pin());
  const check = async stage => {
    if (!stillOriginal() || await admit(stage) !== true || !stillOriginal()) fail('ORIGINAL_ADMISSION_LOST');
    const record = authority();
    if (!HASH.test(record?.approvalSha256 ?? '') || record.contextDigest !== contextDigest) fail('REGISTRATION_CHANGED');
    return record;
  };

  const first = await check('TERMINAL_VERIFY');
  const prepared = store.read('schema-release-preparation-' + context.owner + '.json');
  const validatePreparation = dependencies.validatePreparation ?? validateModernSchemaPreparation;
  const registered = validatePreparation(prepared, now());
  const consumption = store.read('schema-release-consumed-' + context.owner + '.json');
  if (!same(registered.context, context) || registered.preparationSha256 !== preparationSha256 ||
      consumption.schema !== 'phoenix.modern-schema-preparation-consumption/v1' || consumption.owner !== context.owner ||
      consumption.targetSha !== context.targetSha || consumption.preparationSha256 !== preparationSha256) fail('REGISTERED_PREPARATION_CHANGED');

  const steps = stepChain(store, pending, binding, first, context, now());
  const backupStep = steps[6].payload.evidence;
  const schemaStep = steps[8].payload.evidence;
  const body = steps[9].payload.evidence;
  const api = steps[10].payload.evidence;
  const openIntent = steps[11].payload.evidence;
  const ingress = steps[12].payload.evidence;
  const open = preparing?null:steps[13].payload.evidence;
  const completed = preparing?null:steps[14].payload.evidence;
  const schemaReceiptSha256 = schemaStep.schemaReceiptSha256;
  const bundle = validateSchemaEvidence({store, backupStep, schemaStep, context, contextDigest, preparationSha256, lease: rootLease, now: now()});
  if (![body, api, openIntent, ...(preparing?[]:[open,completed])].every(evidence => evidence.schemaReceiptSha256 === schemaReceiptSha256) ||
      body.bodySourceSha256 !== prepared.bodySource?.bodySha256 || body.workflowSourceSha256 !== prepared.bodySource?.workflowSha256 ||
      !HASH.test(api.bodyStdoutSha256 ?? '') || !HASH.test(api.bodyStderrSha256 ?? '')) fail('SCHEMA_HANDOFF_BINDING_CHANGED');
  const formalFile = 'deploy-' + context.owner + '.json';
  fixedArtifact(store, api.formalDeploymentFile, formalFile);
  const formal = store.read(formalFile);
  const formalDeploymentSha256 = canonicalDigest(formal);
  if (formal.outcome !== 'SUCCESS' || formal.target !== context.targetSha || formal.deployMode !== 'api' ||
      (!Array.isArray(formal.migrationPaths) || !same([...formal.migrationPaths].sort(), context.changedMigrationPaths)) || formal.active?.api?.imageId !== context.candidateImageId ||
      ![api, openIntent, ...(preparing?[]:[completed])].every(evidence => evidence.formalDeploymentSha256 === formalDeploymentSha256)) fail('FORMAL_DEPLOYMENT_CHANGED');
  const typed = store.read(controlFile);
  const manifest = validateManifest(readPublic());
  const publicManifestSha256 = canonicalDigest(manifest);
  assertSameBinding(typed, binding);
  const participants=api.candidateParticipants;
  if(!same(participants,openIntent.candidateParticipants)||!Array.isArray(participants)||participants.length!==1||verifyFormal(binding,participants)!==true)fail('EXACT_FORMAL_AND_PUBLIC_OPEN_REQUIRED');
  if (typed.protocolVersion !== 1 || typed.phase !== (preparing?'FENCED':'OPEN') || Object.hasOwn(typed, 'holdReason') || typed.generation !== manifest.generation ||
      typed.manifestDigest !== sha(JSON.stringify(manifest)) || manifest.phase !== (preparing?'FENCED':'OPEN') || manifest.owner !== context.owner ||manifest.targetSha!==context.targetSha)fail('EXACT_FORMAL_AND_PUBLIC_OPEN_REQUIRED');
  if(!preparing&&(!same(manifest,open.publicManifest)||open.privateControlSha256!==canonicalDigest(typed)||!same(manifest.participants,participants)
    ||completed.publicManifestSha256!==publicManifestSha256))fail('EXACT_FORMAL_AND_PUBLIC_OPEN_REQUIRED');
  if(preparing&&ingress.fencedPublicManifestSha256!==publicManifestSha256)fail('EXACT_FENCED_RELEASE_REQUIRED');
  const releasedFile = 'schema-release-ingress-released-' + context.owner + '.json';
  const released = store.read(releasedFile);
  const ingressReleaseReceiptSha256 = canonicalDigest(released);
  if (released.schema !== 'phoenix.modern-schema-ingress-released/v1' || released.owner !== context.owner ||
      released.contextDigest !== contextDigest || released.outcome !== 'EXACT_OWNED_TABLES_ABSENT' || released.automaticRetry !== false ||
      !same(released, ingress.ingressReleaseReceipt) || !same(released, ingressReleaseReceipt) ||
      (!preparing&&ingressReleaseReceiptSha256 !== completed.ingressReleaseReceiptSha256) || ingressAbsent(context, released) !== true) fail('ACTUAL_INGRESS_RELEASE_REQUIRED');

  if(preparing){
    const actualBackup=readArtifact(store,backupStep.backupReceiptFile,backupStep.backupReceiptSha256,'schema-release-fenced-backup-'+context.owner+'/backup-receipt.json');
    const digestBackup=dependencies.digestBackup??(file=>new ModernSchemaPrivateRuntime().digest(file));
    const archive=await digestBackup(actualBackup.backup.path);
    if(archive.sha256!==actualBackup.backup.sha256||archive.bytes!==actualBackup.backup.bytes)fail('LIVE_FENCED_BACKUP_CHANGED');
    const fresh=readArtifact(store,ingress.preOpenFactsFile,ingress.preOpenFactsSha256,'schema-release-pre-open-facts-'+context.owner+'.json');
    const before=readArtifact(store,bundle.beforeFactsFile,bundle.beforeFactsSha256,'schema-release-before-facts-'+context.owner+'.json');
    assertModernSchemaBusinessUnchanged(before,fresh);
    const off=defaultOffEvidenceFromFacts(context.targetSha,fresh,{floor:store.read('floor.json'),plan:context});
    if(!same(off,bundle.defaultOffEvidence))fail('PRE_OPEN_DEFAULT_OFF_CHANGED');
    const liveOff=readArtifact(store,ingress.preOpenOffFile,ingress.preOpenOffSha256,'schema-release-pre-open-off-'+context.owner+'.json');
    const expectedTables=off.observedTables.map(row=>row.table).sort();
    if(liveOff.schema!=='phoenix.modern-schema-live-default-off/v1'||liveOff.targetSha!==context.targetSha||liveOff.verified!==true||liveOff.readOnly!==true
      ||liveOff.featureRollout!=='OFF'||liveOff.chanjetPolicy!=='HOLD'||!Array.isArray(liveOff.observedTables)||liveOff.observedTables.length!==expectedTables.length
      ||!same(liveOff.observedTables.map(row=>row.table).sort(),expectedTables)||!liveOff.observedTables.every(row=>row.rows==='0'))fail('PRE_OPEN_DEFAULT_OFF_CHANGED');
    const expectedPublicManifest=validateManifest({protocolVersion:1,phase:'OPEN',owner:context.owner,generation:typed.generation+1,targetSha:context.targetSha,participants});
    const intent={schema:'phoenix.modern-schema-open-commit-intent/v1',owner:context.owner,targetSha:context.targetSha,contextDigest,preparationSha256,
      approvalSha256:first.approvalSha256,originalLease:rootLease,supervisor:pending.supervisor,pendingReceiptSha256:pending.receiptSha256,
      fencedControlSha256:canonicalDigest(typed),fencedPublicManifestSha256:publicManifestSha256,expectedPublicManifest,
      expectedPublicManifestSha256:canonicalDigest(expectedPublicManifest),schemaReceiptSha256,formalDeploymentSha256,ingressReleaseReceiptSha256,
      afterLedgerSha256:bundle.afterLedgerSha256,preOpenFactsFile:ingress.preOpenFactsFile,preOpenFactsSha256:ingress.preOpenFactsSha256,
      liveDefaultOffFile:ingress.preOpenOffFile,liveDefaultOffSha256:ingress.preOpenOffSha256,defaultOffEvidence:off,defaultOff:true,automaticRetry:false,createdAt:new Date(now()).toISOString()};
    await check('OPEN_COMMIT_INTENT');
    if(!same(store.read(controlFile),typed)||!same(readPublic(),manifest)||!same(store.read(releasedFile),released)||ingressAbsent(context,released)!==true
      ||!same(store.read(formalFile),formal)||verifyFormal(binding,participants)!==true)fail('OPEN_COMMIT_NATIVE_EVIDENCE_CHANGED');
    store.immutable('schema-release-open-commit-intent-'+context.owner+'.json',intent);
    return intent;
  }
  const committedIntent=store.read('schema-release-open-commit-intent-'+context.owner+'.json');
  if(committedIntent.schema!=='phoenix.modern-schema-open-commit-intent/v1'||committedIntent.contextDigest!==contextDigest
    ||committedIntent.preparationSha256!==preparationSha256||committedIntent.schemaReceiptSha256!==schemaReceiptSha256
    ||committedIntent.formalDeploymentSha256!==formalDeploymentSha256||committedIntent.ingressReleaseReceiptSha256!==ingressReleaseReceiptSha256
    ||!same(committedIntent.originalLease,rootLease)||!same(committedIntent.expectedPublicManifest,manifest)
    ||committedIntent.expectedPublicManifestSha256!==publicManifestSha256||open.openCommitIntentSha256!==canonicalDigest(committedIntent))fail('EXACT_OPEN_COMMIT_INTENT_REQUIRED');

  const {purpose, schemaRelease, ...ordinary} = typed;
  assertNoCutoverControlState(ordinary);
  const assertCurrent = (expected, checkFormal = false) => {
    const currentManifest = readPublic();
    if (!same(store.read(controlFile), expected) || !same(currentManifest, manifest) || sha(JSON.stringify(currentManifest)) !== expected.manifestDigest ||
        !same(store.read(releasedFile), released) || ingressAbsent(context, released) !== true ||
        store.read('background-generation.json').generation !== manifest.generation ||
        (checkFormal && (!same(store.read(formalFile), formal) || verifyFormal(binding, manifest.participants) !== true))) {
      fail('NATIVE_TERMINAL_OBSERVATION_CHANGED');
    }
  };
  const authorize = async stage => {
    if ((await check(stage)).approvalSha256 !== first.approvalSha256) fail('REGISTRATION_CHANGED');
  };
  const archived = {schema: 'phoenix.modern-schema-typed-open-archive/v1', owner: context.owner, targetSha: context.targetSha,
    contextDigest, pending, backgroundControl: typed, publicManifest: manifest, ingressReleaseReceipt: released};
  const receipt = {schema: 'phoenix.modern-schema-terminal-open/v1', owner: context.owner, contextDigest, preparationSha256,
    runtimeSha: context.runtimeSha, targetSha: context.targetSha, schemaReceiptSha256, formalDeploymentSha256, publicManifestSha256,
    ingressReleaseReceiptSha256, terminalStepSha256: pending.receiptSha256, typedArchiveSha256: canonicalDigest(archived),
    ordinaryControlSha256: canonicalDigest(ordinary), generation: ordinary.generation, afterLedgerSha256: bundle.afterLedgerSha256,
    phase: 'COMPLETED_OPEN', outcome: 'VERIFIED_OPEN_READY_TO_FINALIZE', defaultOff: true, automaticRetry: false};
  await authorize('TERMINAL_ARCHIVE');
  assertCurrent(typed);
  const archiveName = 'schema-release-typed-open-archive-' + context.owner + '.json';
  const terminalName = 'schema-release-terminal-' + context.owner + '.json';
  store.immutable(archiveName, archived);
  store.immutable(terminalName, receipt);

  await authorize('TERMINAL_NORMALIZE');
  assertCurrent(typed);
  writeOpen(ordinary);
  await authorize('TERMINAL_CLEAR_PENDING');
  assertCurrent(ordinary, true);
  assertNoCutoverControlState(store.read(controlFile));
  if (!same(store.read(archiveName), archived) || !same(store.read(terminalName), receipt) ||
      !same(stepChain(store, pending, binding, first, context, now()), steps)) fail('TERMINAL_ARCHIVE_CHANGED');

  const fd = store.io.openSync(store.directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  let durable=false;
  try {
    store.io.fsyncSync(fd);
    if (!stillOriginal()) fail('PENDING_REPLACED');
    assertSameDirectory(pin.directory, store.inspect(store.directory));
    // The durable unlink commits terminal normalization. No subsequent
    // authorization check can supersede the already committed release.
    store.io.unlinkSync(pin.filename);
    try {
      store.io.fsyncSync(fd);durable=true;
    } catch {
      // An uncertain unlink is not success. Recreate the original deny only
      // if the same guarded namespace is still available and the name is gone.
      store.guard();
      assertSameDirectory(pin.directory, store.inspect(store.directory));
      if (!store.exists(pendingFile)) store.immutable(pendingFile, pending);
      fail('PENDING_UNLINK_DURABILITY_UNVERIFIED');
    }
  } finally {
    // A close error cannot undo an already fsynced unlink.
    try{store.io.closeSync(fd);}catch(error){if(!durable)throw error;}
  }
  return {...receipt, outcome: 'SUCCESS', pendingMarkerCleared: true, terminalReceiptSha256: canonicalDigest(receipt)};
}

/** Finish bookkeeping for a release already committed by the original owner.
 * The protected intent fixes the historical authority. Current FD9 protects
 * the namespace, and independent native reads establish that S really ended. */
export async function finalizeCommittedModernSchemaOpen({context: input, preparationSha256, client}, dependencies = {}) {
  const context = validateModernSchemaContext(input);
  const binding = modernSchemaReleaseBinding(context, preparationSha256);
  const {contextDigest} = binding.schemaRelease;
  const store = dependencies.store ?? new ModernSchemaRegistry();
  const now = dependencies.now ?? Date.now;
  const readPublic = dependencies.readPublic ?? readPublicManifest;
  const verifyFormal = dependencies.verifyFormal ?? verifyCompletedDeployment;
  const inspectParticipant = dependencies.inspectParticipant ?? inspectApiParticipant;
  const ingressAbsent = dependencies.ingressAbsent ?? observeIngressAbsent;
  const confirmDurability = dependencies.confirmDurability ?? confirmModernSchemaPublicDurability;
  const captureLedger = dependencies.captureLedger ?? captureModernSchemaLedger;
  const captureOff = dependencies.captureOff ?? captureModernSchemaDefaultOff;
  const writeOpen = dependencies.writeOpen ?? (value => atomicState(store.file(controlFile), value));
  const owner = context.owner;
  const intentName = 'schema-release-open-commit-intent-' + owner + '.json';
  const formalName = 'deploy-' + owner + '.json';
  const releasedName = 'schema-release-ingress-released-' + owner + '.json';
  const forwardName = 'schema-release-forward-terminal-archive-' + owner + '.json';
  const originalArchiveName = 'schema-release-typed-open-archive-' + owner + '.json';
  const exclusions = ['transaction.json', 'policy-transition.json', 'cutover-pending.json'];
  const guard = () => {
    store.guard();
    if (exclusions.some(name => store.exists(name))) fail('FORWARD_CONCURRENT_TRANSACTION');
  };
  guard();
  const directory = store.inspect(store.directory);
  const intent = store.read(intentName);
  if (intent.schema !== 'phoenix.modern-schema-open-commit-intent/v1' || intent.owner !== owner ||
      intent.targetSha !== context.targetSha || intent.contextDigest !== contextDigest ||
      intent.preparationSha256 !== preparationSha256 || intent.defaultOff !== true || intent.automaticRetry !== false ||
      !withinWindow(intent.createdAt, context, now()) ||
      ![intent.approvalSha256, intent.fencedControlSha256, intent.fencedPublicManifestSha256,
        intent.afterLedgerSha256, intent.pendingReceiptSha256].every(value => HASH.test(value ?? ''))) {
    fail('FORWARD_COMMIT_INTENT_UNVERIFIED');
  }
  const intentDigest = canonicalDigest(intent);
  const originalLease = intent.originalLease;
  const sessionExitSql = modernSchemaOriginalSessionExitSql(originalLease);
  const manifest = validateManifest(intent.expectedPublicManifest);
  if (manifest.phase !== 'OPEN' || manifest.owner !== owner || manifest.targetSha !== context.targetSha ||
      canonicalDigest(manifest) !== intent.expectedPublicManifestSha256) fail('FORWARD_PUBLIC_INTENT_UNVERIFIED');

  const persisted = store.exists(forwardName) ? store.read(forwardName) : null;
  const originalArchive = store.exists(originalArchiveName) ? store.read(originalArchiveName) : null;
  const currentPending = store.exists(pendingFile) ? store.read(pendingFile) : null;
  const pending = validateModernSchemaPending(currentPending ?? persisted?.pending ?? originalArchive?.pending, binding);
  const validPhases = ['INGRESS_RELEASED', 'OPEN_PUBLISHED', 'COMPLETED_OPEN'];
  if (!validPhases.includes(pending.phase) || MODERN_SCHEMA_PHASES[pending.sequence] !== pending.phase ||
      !same(pending.supervisor, intent.supervisor) || !same(pending.lease, originalLease)) fail('FORWARD_PENDING_UNVERIFIED');
  const pin = currentPending ? pinPending(store, currentPending, binding) : null;
  const originalStep = store.read('schema-release-step-' + owner + '-12-ingress-released.json');
  const tipName = 'schema-release-step-' + owner + '-' + pending.sequence + '-' + pending.phase.toLowerCase().replaceAll('_', '-') + '.json';
  const tip = store.read(tipName);
  if (pending.status === 'HOLD' && Date.parse(pending.updatedAt) < Date.parse(tip.recordedAt)) fail('FORWARD_PENDING_UNVERIFIED');
  const steps = stepChain(store, pending.status === 'HOLD' ? {...pending, updatedAt: tip.recordedAt} : pending,
    binding, {approvalSha256: intent.approvalSha256}, context, now());
  if (canonicalDigest(originalStep) !== intent.pendingReceiptSha256 ||
      !same(originalStep, steps[12]) || Date.parse(intent.createdAt) < Date.parse(originalStep.recordedAt)) fail('FORWARD_INTENT_CHAIN_UNVERIFIED');

  const api = steps[10].payload.evidence;
  const schemaStep = steps[8].payload.evidence;
  const ingress = steps[12].payload.evidence;
  const released = store.read(releasedName);
  const formal = store.read(formalName);
  const schema = readArtifact(store, schemaStep.schemaReceiptFile, intent.schemaReceiptSha256, 'schema-release-schema-receipt-' + owner + '.json');
  const off = readArtifact(store, intent.liveDefaultOffFile, intent.liveDefaultOffSha256, 'schema-release-pre-open-off-' + owner + '.json');
  const fullFacts = readArtifact(store, intent.preOpenFactsFile, intent.preOpenFactsSha256, 'schema-release-pre-open-facts-' + owner + '.json');
  fixedArtifact(store, api.formalDeploymentFile, formalName);
  if (!same(manifest.participants, api.candidateParticipants) || manifest.participants.length !== 1 ||
      api.schemaReceiptSha256 !== intent.schemaReceiptSha256 || schemaStep.schemaReceiptSha256 !== intent.schemaReceiptSha256 ||
      api.formalDeploymentSha256 !== intent.formalDeploymentSha256 || canonicalDigest(formal) !== intent.formalDeploymentSha256 ||
      formal.target !== context.targetSha || formal.deployMode !== 'api' || formal.outcome !== 'SUCCESS' ||
      formal.active?.api?.imageId !== context.candidateImageId || !Array.isArray(formal.migrationPaths) ||
      !same([...formal.migrationPaths].sort(), context.changedMigrationPaths) ||
      schema.contextDigest !== contextDigest || schema.preparationSha256 !== preparationSha256 || schema.targetSha !== context.targetSha ||
      schema.afterLedgerSha256 !== intent.afterLedgerSha256 || schema.outcome !== 'SUCCESS_SCHEMA_ONLY' || schema.businessActivation !== false ||
      !same(schema.originalLease, originalLease) || !same(schema.defaultOffEvidence, intent.defaultOffEvidence) ||
      !same(defaultOffEvidenceFromFacts(context.targetSha, fullFacts, {floor: store.read('floor.json'),plan:context}), intent.defaultOffEvidence) ||
      ingress.fencedPublicManifestSha256 !== intent.fencedPublicManifestSha256 ||
      ingress.preOpenFactsFile !== intent.preOpenFactsFile || ingress.preOpenFactsSha256 !== intent.preOpenFactsSha256 ||
      ingress.preOpenOffFile !== intent.liveDefaultOffFile || ingress.preOpenOffSha256 !== intent.liveDefaultOffSha256 ||
      released.schema !== 'phoenix.modern-schema-ingress-released/v1' || released.owner !== owner || released.contextDigest !== contextDigest || released.automaticRetry !== false ||
      released.outcome !== 'EXACT_OWNED_TABLES_ABSENT' || canonicalDigest(released) !== intent.ingressReleaseReceiptSha256 ||
      !same(ingress.ingressReleaseReceipt, released)) fail('FORWARD_COMMIT_EVIDENCE_CHANGED');

  const control = store.read(controlFile);
  const typed = Object.hasOwn(control, 'purpose') ? control : persisted?.backgroundControl ?? originalArchive?.backgroundControl;
  assertSameBinding(typed, binding);
  if (typed.phase !== 'OPEN' || typed.protocolVersion !== 1 || typed.generation !== manifest.generation ||
      typed.manifestDigest !== sha(JSON.stringify(manifest)) || Object.hasOwn(typed, 'holdReason')) fail('FORWARD_TYPED_OPEN_UNVERIFIED');
  const {purpose, schemaRelease, ...ordinary} = typed;
  assertNoCutoverControlState(ordinary);
  if (!same(control, typed) && !same(control, ordinary)) fail('FORWARD_PRIVATE_OPEN_UNVERIFIED');
  const archive = {schema:'phoenix.modern-schema-forward-terminal-archive/v1', owner, targetSha:context.targetSha,
    contextDigest, preparationSha256, pending, backgroundControl:typed, publicManifest:manifest, ingressReleaseReceipt:released,
    openCommitIntentSha256:intentDigest, ordinaryControlSha256:canonicalDigest(ordinary), originalLeaseSha256:canonicalDigest(originalLease),
    afterLedgerSha256:intent.afterLedgerSha256, defaultOff:true, automaticRetry:false};
  if (persisted && !same(persisted, archive)) fail('FORWARD_ARCHIVE_DIVERGED');
  if (originalArchive && !same(originalArchive, {schema:'phoenix.modern-schema-typed-open-archive/v1', owner, targetSha:context.targetSha,
    contextDigest, pending, backgroundControl:typed, publicManifest:manifest, ingressReleaseReceipt:released})) fail('FORWARD_ORIGINAL_ARCHIVE_DIVERGED');
  const published = steps[13]?.payload.evidence;
  const complete = steps[14]?.payload.evidence;
  if ((published && (!same(published.publicManifest, manifest) || published.privateControlSha256 !== canonicalDigest(typed) ||
      published.openCommitIntentSha256 !== intentDigest || published.schemaReceiptSha256 !== intent.schemaReceiptSha256)) ||
      (complete && (complete.publicManifestSha256 !== intent.expectedPublicManifestSha256 ||
      complete.schemaReceiptSha256 !== intent.schemaReceiptSha256 || complete.formalDeploymentSha256 !== intent.formalDeploymentSha256 ||
      complete.ingressReleaseReceiptSha256 !== intent.ingressReleaseReceiptSha256))) fail('FORWARD_RECORDED_OPEN_DIVERGED');

  const samePending = () => {
    if (pin ? !same(store.read(pendingFile), pending) || !same(pin.pin(), pin.before) : store.exists(pendingFile)) fail('PENDING_REPLACED');
  };
  const exactCurrent = (expected, verifyLive = false) => {
    guard();
    assertSameDirectory(directory, store.inspect(store.directory));
    samePending();
    if (!same(store.read(intentName), intent) || !same(store.read(controlFile), expected) || !same(readPublic(), manifest) ||
        store.read('background-generation.json').generation !== manifest.generation ||
        !same(store.read(releasedName), released) || ingressAbsent(context, released) !== true ||
        !same(store.read(formalName), formal) || (verifyLive && verifyFormal(binding, manifest.participants) !== true)) fail('FORWARD_NATIVE_OPEN_CHANGED');
  };
  const observeNative = async expected => {
    exactCurrent(expected, true);
    const observation = inspectParticipant(manifest.participants[0], store.read('floor.json').project);
    verifyParticipantStatus(observation, manifest.participants[0], manifest);
    if (observation.imageId !== context.candidateImageId) fail('FORWARD_NATIVE_IMAGE_CHANGED');
    const {rows:[backend]} = await client.query(sessionExitSql);
    if (backend?.primary !== true || backend.databaseOid !== originalLease.database.databaseOid ||
        backend.systemIdentifier !== originalLease.database.systemIdentifier ||
        backend.postmasterStartMicros !== originalLease.database.postmasterStartMicros ||
        backend.originalSessionPresent !== false || (await captureLedger(client)).sha256 !== intent.afterLedgerSha256 ||
        !same(await captureOff(client, context.targetSha, {floor:store.read('floor.json'),plan:context}), off)) fail('FORWARD_NATIVE_FACTS_UNVERIFIED');
    const durability = confirmDurability(() => {exactCurrent(expected); return manifest;}, guard);
    if (durability?.durabilityConfirmed !== true) fail('FORWARD_PUBLIC_DURABILITY_UNVERIFIED');
  };

  await observeNative(control);
  if (!pin && !same(control, ordinary)) fail('FORWARD_CLEARED_MARKER_WITH_TYPED_CONTROL');
  if (!persisted) store.immutable(forwardName, archive);
  const fd = store.io.openSync(store.directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  let durable = false;
  try {
    // A previous create may have lost its fsync response. Recheck exact bytes
    // and force both the receipt and its containing directory to stable storage.
    const archivedFd = store.io.openSync(store.file(forwardName), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const opened = store.io.fstatSync(archivedFd);
      assertRegularFile(opened, {uid:store.uid});
      if (!same(JSON.parse(store.io.readFileSync(archivedFd, 'utf8')), archive) ||
          !same(identity(opened), identity(store.io.lstatSync(store.file(forwardName))))) fail('FORWARD_ARCHIVE_DIVERGED');
      store.io.fsyncSync(archivedFd);
    } finally { store.io.closeSync(archivedFd); }
    store.io.fsyncSync(fd);
    if (!same(store.read(forwardName), archive)) fail('FORWARD_ARCHIVE_DIVERGED');
    exactCurrent(control);
    if (!same(control, ordinary)) writeOpen(ordinary);
    await observeNative(ordinary);
    if (!same(store.read(forwardName), archive)) fail('FORWARD_ARCHIVE_DIVERGED');
    store.io.fsyncSync(fd);
    exactCurrent(ordinary,true);
    const lastParticipant=inspectParticipant(manifest.participants[0],store.read('floor.json').project);
    verifyParticipantStatus(lastParticipant,manifest.participants[0],manifest);
    if(lastParticipant.imageId!==context.candidateImageId)fail('FORWARD_NATIVE_IMAGE_CHANGED');
    if (pin) {
      store.io.unlinkSync(pin.filename);
      try { store.io.fsyncSync(fd); } catch {
        guard();
        assertSameDirectory(directory, store.inspect(store.directory));
        if (!store.exists(pendingFile)) store.immutable(pendingFile, pending);
        fail('PENDING_UNLINK_DURABILITY_UNVERIFIED');
      }
    }
    durable = true;
  } finally {
    try { store.io.closeSync(fd); } catch (error) { if (!durable) throw error; }
  }
  return {schema:'phoenix.modern-schema-forward-terminal/v1', owner, targetSha:context.targetSha, outcome:'SUCCESS',
    pendingMarkerCleared:true, defaultOff:true, forwardArchiveSha256:canonicalDigest(archive)};
}
