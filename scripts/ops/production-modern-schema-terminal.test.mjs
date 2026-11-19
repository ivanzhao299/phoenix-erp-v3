import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';
import {assertNoCutoverControlFiles} from './background-control-manifest.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {defaultOffEvidenceFromFacts} from './production-modern-schema-facts.mjs';
import {ModernSchemaRegistry} from './production-modern-schema-registration.mjs';
import {MODERN_SCHEMA_PHASES, modernSchemaReleaseBinding} from './production-modern-schema-state.mjs';
import {finalizeCommittedModernSchemaOpen,finalizeModernSchemaRelease,prepareModernSchemaOpenCommit} from './production-modern-schema-terminal.mjs';

const hash = char => char.repeat(64);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const date = minute => new Date(Date.UTC(2026, 10, 19, 0, minute)).toISOString();

function fixture(t,{preparing=false}={}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-terminal-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = name => path.join(directory, name);
  const write = (name, value) => {
    fs.mkdirSync(path.dirname(file(name)), {recursive: true});
    fs.writeFileSync(file(name), JSON.stringify(value) + '\n', {mode: 0o600});
  };
  const lookup = name => JSON.parse(fs.readFileSync(file(name)));
  const {context} = modernSchemaFixture();
  const preparationSha256 = hash('8');
  const migrationPath = 'apps/api/src/database/migrations/1794885912725-InvEggCostingColumns.ts';
  context.pendingMigrations = [{...context.pendingMigrations[0], path: migrationPath, timestamp: 1794885912725,
    effectiveName: 'InvEggCostingColumns1794885912725'}];
  context.changedMigrationPaths = [migrationPath];
  const databaseIdentity = {name: 'owned', schema: 'public', systemIdentifier: '583928'};
  context.databaseIdentitySha256 = canonicalDigest(databaseIdentity);
  const binding = modernSchemaReleaseBinding(context, preparationSha256);
  const contextDigest = binding.schemaRelease.contextDigest;
  const rootLease = {database: {...databaseIdentity, databaseOid: 16401, postmasterStartMicros: '212652'},
    sessionPid: 523, backendStartMicros: '212655'};
  const supervisor = {pid: process.pid, parentPid: process.ppid, startTicks: '27165', bootId: 'owned-host'};
  const events = [];
  let hasUnlinked = false;
  const flags = {lease: true, ingressAbsent: true, formal: true, faultFsync: false, omitUnlink: false};
  const io = Object.assign(Object.create(fs), {
    unlinkSync(filename) {
      if(filename!==file('schema-release-pending.json')){
        assert.equal(path.dirname(filename),directory);assert.match(path.basename(filename),/^\.registration-[a-f0-9]{32}$/);
        assert.equal(fs.lstatSync(filename).nlink,2);return fs.unlinkSync(filename);
      }
      assert.equal(filename, file('schema-release-pending.json'));
      events.push('unlink');
      if (flags.omitUnlink) throw Error('fixture unlink fault');
      fs.unlinkSync(filename);
      hasUnlinked = true;
    },
    fsyncSync(fd) {
      if (hasUnlinked && flags.faultFsync) {
        flags.faultFsync = false;
        throw Error('fixture directory fsync fault');
      }
      return fs.fsyncSync(fd);
    },
  });
  const store = new ModernSchemaRegistry({directory, fs: io, guard() {}, expectedUid: process.getuid(),
    inspectDirectory(folder) {
      const info = fs.lstatSync(folder);
      assert.equal(info.isDirectory(), true);
      return [{dev: info.dev, ino: info.ino}];
    }});
  const authority = {contextDigest, approvalSha256: hash('1')};
  const prepared = {context, preparationSha256, bodySource: {bodySha256: hash('2'), workflowSha256: hash('3')}};
  const participants = [{bootId: 'd705b897-d307-408a-98ea-a195908b7d43', containerId: hash('a'),
    revision: context.targetSha, allowedKinds: ['LOCAL']}];
  const manifest = {protocolVersion: 1, phase: preparing?'FENCED':'OPEN', owner: context.owner, generation: preparing?5:6, targetSha: context.targetSha, participants};
  const typed = {protocolVersion: 1, ...binding, generation: manifest.generation, phase: manifest.phase,
    manifestDigest: sha(JSON.stringify(manifest)), updatedAt: date(12)};
  const formal = {outcome: 'SUCCESS', target: context.targetSha, deployMode: 'api',
    active: {api: {imageId: context.candidateImageId}}, migrationPaths: context.changedMigrationPaths};
  const formalDeploymentSha256 = canonicalDigest(formal);
  const ingressReleaseReceipt = {schema: 'phoenix.modern-schema-ingress-released/v1', owner: context.owner, contextDigest,
    host: {bootId: 'owned-host', namespace: 'owned-net'}, outcome: 'EXACT_OWNED_TABLES_ABSENT', automaticRetry: false};
  const floor = {chanjetPolicy: 'HOLD', readonlyApproval: null};
  write('floor.json', floor);
  write('background-control.json', typed);
  write('background-generation.json', {schema: 'phoenix.background-generation/1', generation: manifest.generation, updatedAt: date(12)});
  write('schema-release-preparation-1234-1.json', prepared);
  write('schema-release-consumed-1234-1.json', {schema: 'phoenix.modern-schema-preparation-consumption/v1',
    owner: context.owner, targetSha: context.targetSha, preparationSha256});
  write('deploy-1234-1.json', formal);
  write('schema-release-ingress-released-1234-1.json', ingressReleaseReceipt);

  const before = {schema: 'phoenix.modern-schema-database-facts/v1', database: {name: databaseIdentity.name, systemIdentifier: databaseIdentity.systemIdentifier},
    tables: [], sequences: [], newTables: [], businessDataSha256: hash('9')};
  const scopes = ['production_cutover_scopes', 'production_batch_qualifications', 'production_cutover_apply_admissions', 'production_cutover_apply_results'];
  const after = {...before, newTables: scopes.map(table => ({schema: 'public', table, rows: 0}))};
  const {beforeLedgerSha256} = context;
  const afterLedgerSha256 = hash('7');
  function audit(ledgerSha256, minute, migrated = false) {
    const originalAudit = '{"conclusion":"HOLD","checked_at":"' + date(minute) + '","originalExact":9007199254740993,' +
      '"overposted_grades":[{"inbound_batches":[{"qty":30' + (migrated ? ',"unit_cost":0.000000' : '') +
      '}],"inbound_ledger":[{"qty_change":30' + (migrated ? ',"cost_change":null' : '') + '}]}]}';
    const evidence = {schema: 'phoenix.legacy-egg-audit-evidence/v1', originalAuditSha256: sha(originalAudit),
      targetSha: context.targetSha, floorSha: context.floorSha, runningApiSha: context.runtimeSha,
      ledgerSha256, observedLedgerSha256: ledgerSha256, databaseIdentity, originalConclusion: 'HOLD',
      disposition: 'HOLD', capturedAt: date(minute), verifiedTestScope: false, releaseAuthorized: false,
      reason: migrated ? 'MATCHING_FROZEN_TEST_MANIFEST_REQUIRED' : 'MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW',
      manifestSha256: migrated ? null : context.testManifestSha256,
      referenceCoverage: {inspected: ['owned'], missing: [], matches: [], uninspectedSources: []}};
    return {originalAudit, evidence: {...evidence, evidenceSha256: canonicalDigest(evidence)}};
  }
  const beforeAudit = audit(beforeLedgerSha256, 5), afterAudit = audit(afterLedgerSha256, 8, true);
  const cli = (mode, char) => ({schema: 'phoenix.modern-schema-gated-cli-result/v1', mode, owner: context.owner, contextDigest,
    imageId: context.candidateImageId, outcome: 'SUCCESS', containerId: hash(char), exitCode: 0, oomKilled: false, restartCount: 0,
    backendProof: {backend: {readonly: mode === 'show', databaseOid: rootLease.database.databaseOid, systemIdentifier: rootLease.database.systemIdentifier}}});
  const driver = {schema: 'phoenix.modern-schema-original-schema-driver/v1', owner: context.owner, contextDigest,
    imageId: context.candidateImageId, outcome: 'SUCCESS', automaticRetry: false, backupSha256: hash('4'), run: cli('run', '1'), show: cli('show', '2')};
  const backup = {schema: 'phoenix.modern-schema-protected-backup/v1', owner: context.owner, stage: 'fenced',
    format: 'POSTGRES_CUSTOM', tocVerified: true, fullParseVerified: true, fullParseExitCode: 0, productionRestore: false,
    sourceLedgerSha256: beforeLedgerSha256, sourceBusinessFactsSha256: before.businessDataSha256, createdAt: date(6),
    backup: {path: file('schema-release-fenced-backup-1234-1/database-dump.stdout'), bytes: 128, sha256: hash('4')}};
  const rehearsal = {schema: 'phoenix.modern-schema-isolated-rehearsal/v1', owner: context.owner, runtimeSha: context.runtimeSha,
    targetSha: context.targetSha, candidateImageId: context.candidateImageId, beforeLedgerSha256, afterLedgerSha256, backupSha256: hash('4'),
    pendingPlanSha256: canonicalDigest(context.pendingMigrations), outcome: 'PASS', originalRuntimeReady: true, candidateReady: true,
    businessFactsUnchanged: true, backgroundWrites: 0, isolatedRestore: true, productionMutation: false};
  const artifacts = {
    driverReceipt: ['schema-release-migration-1234-1/schema-driver-receipt.json', driver],
    beforeFacts: ['schema-release-before-facts-1234-1.json', before],
    afterFacts: ['schema-release-after-facts-1234-1.json', after],
    beforeRawAudit: ['schema-release-before-audit-1234-1.json', beforeAudit],
    afterRawAudit: ['schema-release-after-audit-1234-1.json', afterAudit],
  };
  const bundle = {schema: 'phoenix.modern-schema-effect-receipt/v1', owner: context.owner, contextDigest, preparationSha256,
    targetSha: context.targetSha, runtimeSha: context.runtimeSha, beforeLedgerSha256, afterLedgerSha256,
    pendingPlanSha256: canonicalDigest(context.pendingMigrations), sourceInventorySha256: context.sourceInventorySha256,
    candidateInventorySha256: context.candidateInventorySha256, originalLease: rootLease, outcome: 'SUCCESS_SCHEMA_ONLY',
    schemaApplied: true, businessActivation: false, originalConclusion: 'HOLD', createdAt: date(8), backupSha256: hash('4'),
    businessDataSha256: before.businessDataSha256, defaultOffEvidence: defaultOffEvidenceFromFacts(context.targetSha, after, {floor})};
  const unit = context.pendingMigrations[0];
  const unitName = 'migration-apply-receipts/' + path.basename(unit.path, '.ts') + '.json';
  const unitReceipt = {schema: 'phoenix.migration-apply-receipt/v1', outcome: 'SUCCESS', migrationPath: unit.path,
    migrationTimestamp: unit.timestamp, migrationName: unit.effectiveName.slice(0, -String(unit.timestamp).length),
    sourceBlob: unit.sourceBlob, sourceSha: context.targetSha, runId: context.owner, beforeLedgerSha256, afterLedgerSha256};
  const stepFile = (phase, index) => 'schema-release-step-1234-1-' + index + '-' + phase.toLowerCase().replaceAll('_', '-') + '.json';
  const terminalFile = 'schema-release-terminal-1234-1.json';
  const archiveFile = 'schema-release-typed-open-archive-1234-1.json';
  const regenerate = (changeStep = () => {}) => {
    const backupName = 'schema-release-fenced-backup-1234-1/backup-receipt.json';
    const rehearsalName = 'schema-release-fenced-rehearsal-1234-1/rehearsal-receipt.json';
    write(backupName, backup);
    write(rehearsalName, rehearsal);
    for (const [key, [name, body]] of Object.entries(artifacts)) {
      write(name, body);
      bundle[key + 'File'] = file(name);
      bundle[key + 'Sha256'] = canonicalDigest(body);
    }
    write(unitName, unitReceipt);
    bundle.perMigrationReceipts = [{path: unit.path, receiptFile: file(unitName), receiptSha256: canonicalDigest(unitReceipt)}];
    const schemaReceiptFile = 'schema-release-schema-receipt-1234-1.json';
    write(schemaReceiptFile, bundle);
    const schemaReceiptSha256 = canonicalDigest(bundle);
    const publicManifestSha256 = canonicalDigest(manifest);
    const commitIntent={schema:'phoenix.modern-schema-open-commit-intent/v1',owner:context.owner,targetSha:context.targetSha,contextDigest,preparationSha256,
      originalLease:rootLease,expectedPublicManifest:manifest,expectedPublicManifestSha256:publicManifestSha256,
      schemaReceiptSha256,formalDeploymentSha256,ingressReleaseReceiptSha256:canonicalDigest(ingressReleaseReceipt)};
    if(!preparing)write('schema-release-open-commit-intent-1234-1.json',commitIntent);
    const preOpenFactsFile='schema-release-pre-open-facts-1234-1.json',preOpenOffFile='schema-release-pre-open-off-1234-1.json';
    write(preOpenFactsFile,after);
    const liveOff={schema:'phoenix.modern-schema-live-default-off/v1',targetSha:context.targetSha,observedTables:scopes.map(table=>({table,rows:'0'})).sort((a,b)=>a.table.localeCompare(b.table)),
      featureRollout:'OFF',chanjetPolicy:'HOLD',verified:true,readOnly:true};
    write(preOpenOffFile,liveOff);
    const proofs = {
      BACKUP_VERIFIED: {backupReceiptFile: file(backupName), backupReceiptSha256: canonicalDigest(backup),
        rehearsalFile: file(rehearsalName), rehearsalSha256: canonicalDigest(rehearsal)},
      SCHEMA_RECEIPTED: {schemaReceiptFile: file(schemaReceiptFile), schemaReceiptSha256},
      API_BODY: {schemaReceiptSha256, bodyChild: supervisor, bodySourceSha256: prepared.bodySource.bodySha256,
        workflowSourceSha256: prepared.bodySource.workflowSha256},
      API_VERIFIED: {schemaReceiptSha256, formalDeploymentFile: file('deploy-1234-1.json'), formalDeploymentSha256,
        candidateParticipants: participants, bodyStdoutSha256: hash('a'), bodyStderrSha256: hash('b')},
      OPEN_INTENT: {schemaReceiptSha256, formalDeploymentSha256, candidateParticipants: participants},
      OPEN_PUBLISHED: {schemaReceiptSha256, publicManifest: manifest, privateControlSha256: canonicalDigest(typed),openCommitIntentSha256:canonicalDigest(commitIntent)},
      INGRESS_RELEASED: {ingressReleaseReceipt,fencedPublicManifestSha256:publicManifestSha256,
        preOpenFactsFile:file(preOpenFactsFile),preOpenFactsSha256:canonicalDigest(after),preOpenOffFile:file(preOpenOffFile),preOpenOffSha256:canonicalDigest(liveOff)},
      COMPLETED_OPEN: {schemaReceiptSha256, formalDeploymentSha256, publicManifestSha256,
        ingressReleaseReceiptSha256: canonicalDigest(ingressReleaseReceipt)},
    };
    let previousDigest = null;
    for (const [sequence, phase] of MODERN_SCHEMA_PHASES.slice(0,preparing?13:15).entries()) {
      const evidence = proofs[phase] ?? {fixture: phase};
      const payload = sequence === 0 ? {approvalSha256: authority.approvalSha256, supervisor} : {
        schema: 'phoenix.modern-schema-step-evidence/v1', kind: phase, contextDigest, evidence, evidenceSha256: canonicalDigest(evidence),
      };
      const step = {schema: 'phoenix.modern-schema-release-step/v1', ...binding, sequence,
        from: sequence === 0 ? null : MODERN_SCHEMA_PHASES[sequence - 1], to: phase, previousDigest, payload, recordedAt: date(sequence)};
      changeStep(step);
      write(stepFile(phase, sequence), step);
      previousDigest = canonicalDigest(step);
    }
    const content = {schema: 'phoenix.modern-schema-release-pending/v1', ...binding, phase: preparing?'INGRESS_RELEASED':'COMPLETED_OPEN', status: 'RUNNING',
      sequence: preparing?12:14, supervisor, lease: rootLease, receiptSha256: previousDigest, updatedAt: date(preparing?12:14)};
    write('schema-release-pending.json', {...content, stateDigest: canonicalDigest(content)});
  };
  regenerate();

  const deps = {store, now: () => Date.parse(date(17)), authority: () => authority, checkProcess: () => true,
    checkLease: () => flags.lease, readPublic: () => manifest,
    verifyFormal: (b, p) => {
      events.push('formal');
      assert.deepEqual(b, binding);
      assert.deepEqual(p, participants);
      return flags.formal;
    },
    ingressAbsent: () => flags.ingressAbsent,digestBackup:async()=>({sha256:hash('4'),bytes:128}),
    validatePreparation: value => value,
    writeOpen: value => {
      events.push('normalize');
      assert.equal(store.exists(archiveFile), true);
      assert.equal(store.exists(terminalFile), true);
      assert.equal(store.exists('schema-release-pending.json'), true);
      write('background-control.json', value);
    }};
  const args = {state: {read: () => store.read('schema-release-pending.json')}, context, preparationSha256,
    rootLease, admit: async stage => {events.push(stage); return true;}, ingressReleaseReceipt};
  const ordinaryAdmit = () => assertNoCutoverControlFiles(directory, {
    exists: filename => store.exists(path.basename(filename)),
    read: filename => store.read(path.basename(filename)),
  });
  return {store,file, write, lookup, manifest, typed, flags, events, deps, args, bundle, artifacts, unitReceipt, regenerate, stepFile, terminalFile,
    archiveFile, ordinaryAdmit, pending: () => store.exists('schema-release-pending.json'), run: () => finalizeModernSchemaRelease(args, deps),prepare:()=>prepareModernSchemaOpenCommit(args,deps)};
}

test('full schema and native ingress proofs are persisted before public OPEN can be a release commit',async t=>{
 const f=fixture(t,{preparing:true});const intent=await f.prepare();
 assert.equal(intent.expectedPublicManifest.phase,'OPEN');assert.equal(intent.expectedPublicManifest.generation,6);
 assert.equal(f.manifest.phase,'FENCED');assert.equal(f.lookup('background-control.json').phase,'FENCED');
 assert.equal(f.pending(),true);assert.throws(f.ordinaryAdmit,/DEDICATED_RECOVERY_REQUIRED/);
 assert.deepEqual(f.lookup('schema-release-open-commit-intent-1234-1.json'),intent);
 assert.ok(!f.events.includes('normalize'));assert.ok(!f.events.includes('unlink'));
});
test('a missing physical release, changed full facts, live rollout, or unverified original S prevents an OPEN intent',async t=>{
 for(const mutate of [f=>{f.flags.ingressAbsent=false;},f=>{f.flags.lease=false;},f=>{f.bundle.businessActivation=true;f.regenerate();},f=>{
  const file='schema-release-pre-open-off-1234-1.json',off=f.lookup(file);off.observedTables[0].rows='1';f.write(file,off);
 }]){
  const f=fixture(t,{preparing:true});mutate(f);await assert.rejects(f.prepare());
  assert.equal(f.manifest.phase,'FENCED');assert.equal(f.store.exists('schema-release-open-commit-intent-1234-1.json'),false);
 }
});
test('a missing or changed archive before OPEN prevents intent despite an otherwise valid backup receipt',async t=>{
 for(const digest of [async()=>{throw Error('archive absent');},async()=>({sha256:hash('5'),bytes:128})]){
  const f=fixture(t,{preparing:true});f.deps.digestBackup=digest;await assert.rejects(f.prepare());
  assert.equal(f.manifest.phase,'FENCED');assert.equal(f.store.exists('schema-release-open-commit-intent-1234-1.json'),false);
 }
});

test('archived typed authority precedes ordinary OPEN and removal of the same pending marker', async t => {
  const f = fixture(t);
  assert.throws(f.ordinaryAdmit, /DEDICATED_RECOVERY_REQUIRED/);
  const result = await f.run();
  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.defaultOff, true);
  const saved = f.lookup(f.terminalFile);
  assert.equal(saved.outcome, 'VERIFIED_OPEN_READY_TO_FINALIZE');
  assert.equal(result.pendingMarkerCleared, true);
  assert.equal(result.terminalReceiptSha256, canonicalDigest(saved));
  assert.deepEqual(f.lookup(f.archiveFile).backgroundControl, f.typed);
  assert.deepEqual(f.lookup(f.archiveFile).publicManifest, f.manifest);
  const ordinary = f.lookup('background-control.json');
  const expected = {...f.typed};
  delete expected.purpose;
  delete expected.schemaRelease;
  assert.deepEqual(ordinary, expected);
  assert.equal(f.pending(), false);
  assert.equal(f.ordinaryAdmit(), true);
  assert.deepEqual(f.events, ['TERMINAL_VERIFY', 'formal', 'TERMINAL_ARCHIVE', 'TERMINAL_NORMALIZE',
    'normalize', 'TERMINAL_CLEAR_PENDING', 'formal', 'unlink']);
});

test('missing native proofs or a divergent step prevent archival', async t => {
  for (const [mutate, error] of [
    [f => {f.flags.formal = false;}, /EXACT_FORMAL_AND_PUBLIC_OPEN/],
    [f => {f.flags.ingressAbsent = false;}, /ACTUAL_INGRESS_RELEASE/],
    [f => {f.flags.lease = false;}, /EXACT_ORIGINAL_COMPLETED_OPEN/],
    [f => f.regenerate(step => {if (step.sequence === 7) step.previousDigest = hash('0');}), /EXACT_STEP_CHAIN/],
    [f => f.regenerate(step => {if (step.sequence === 7) step.payload.evidenceSha256 = hash('0');}), /EXACT_STEP_EVIDENCE/],
    [f => {f.unitReceipt.sourceSha = 'e'.repeat(40); f.regenerate();}, /PER_MIGRATION_EFFECT_BINDING/],
    [f => {f.bundle.backupSha256 = hash('5'); f.artifacts.driverReceipt[1].backupSha256 = hash('5'); f.regenerate();}, /EXACT_FENCED_BACKUP/],
    [f => {f.artifacts.driverReceipt[1].backupSha256 = hash('5'); f.regenerate();}, /EXACT_NATIVE_DRIVER_RECEIPTS/],
    [f => {fs.unlinkSync(f.file('schema-release-fenced-backup-1234-1/backup-receipt.json'));}, /backup-receipt/],
    [f => {f.bundle.businessActivation = true; f.regenerate();}, /EXACT_SCHEMA_EFFECT_RECEIPT/],
    [f => {f.bundle.defaultOffEvidence.scopeRows = 1; f.regenerate();}, /DEFAULT_OFF_RECEIPT_CHANGED/],
    [f => {f.artifacts.afterFacts[1].businessDataSha256 = hash('a'); f.regenerate();}, /EXACT_PRESERVED_BUSINESS_FACTS/],
    ...[ ['9007199254740993', '9007199254740992', /ORIGINAL_AUDIT_CHANGED/],
      ['0.000000', '0.000001', /NEW_COST_COLUMN_VALUE_NOT_DDL_DEFAULT/],
      ['\"cost_change\":null', '\"cost_change\":0', /NEW_COST_COLUMN_VALUE_NOT_DDL_DEFAULT/],
      ['\"qty\":30', '\"qty\":31', /ORIGINAL_AUDIT_CHANGED/],
    ].map(([from, to, error]) => [f => {
      const after = f.artifacts.afterRawAudit[1];
      after.originalAudit = after.originalAudit.replace(from, to);
      const {evidenceSha256, ...candidate} = after.evidence;
      candidate.originalAuditSha256 = sha(after.originalAudit);
      after.evidence = {...candidate, evidenceSha256: canonicalDigest(candidate)};
      f.regenerate();
    }, error]),
  ]) {
    const f = fixture(t);
    mutate(f);
    await assert.rejects(f.run(), error);
    assert.equal(f.pending(), true);
    assert.deepEqual(f.lookup('background-control.json'), f.typed);
    assert.equal(fs.existsSync(f.file(f.archiveFile)), false);
  }
});

test('admission loss after writing ordinary OPEN leaves the dedicated pending deny', async t => {
  const f = fixture(t);
  f.args.admit = async stage => {
    if (stage === 'TERMINAL_CLEAR_PENDING') f.flags.lease = false;
    return true;
  };
  await assert.rejects(f.run(), /EXACT_ORIGINAL_COMPLETED_OPEN/);
  assert.equal(f.pending(), true);
  assert.throws(f.ordinaryAdmit, /DEDICATED_RECOVERY_REQUIRED/);
  assert.equal(Object.hasOwn(f.lookup('background-control.json'), 'purpose'), false);
  assert.equal(fs.existsSync(f.file(f.archiveFile)), true);
  assert.equal(f.events.includes('unlink'), false);
});

test('an independently renamed pending record with identical bytes is not removed', async t => {
  const f = fixture(t);
  f.args.admit = async stage => {
    if (stage === 'TERMINAL_CLEAR_PENDING') {
      const marker = f.file('schema-release-pending.json');
      fs.copyFileSync(marker, marker + '.swap');
      fs.renameSync(marker + '.swap', marker);
    }
    return true;
  };
  await assert.rejects(f.run(), /ORIGINAL_ADMISSION_LOST/);
  assert.equal(f.pending(), true);
  assert.equal(f.events.includes('unlink'), false);
});

test('a failed unlink leaves pending and failed durability restores the deny', async t => {
  for (const flag of ['omitUnlink', 'faultFsync']) {
    const f = fixture(t);
    f.flags[flag] = true;
    await assert.rejects(f.run(), flag === 'omitUnlink' ? /fixture unlink fault/ : /PENDING_UNLINK_DURABILITY_UNVERIFIED/);
    assert.equal(f.pending(), true);
    assert.throws(f.ordinaryAdmit, /DEDICATED_RECOVERY_REQUIRED/);
    assert.equal(f.lookup(f.archiveFile).pending.stateDigest, f.lookup('schema-release-pending.json').stateDigest);
  }
});

test('a second finalizer cannot normalize or archive the cleared marker again', async t => {
  const f = fixture(t);
  await f.run();
  await assert.rejects(f.run());
  assert.equal(f.events.filter(event => event === 'normalize').length, 1);
  assert.equal(f.events.filter(event => event === 'unlink').length, 1);
});

async function committedFixture(t) {
  const f = fixture(t, {preparing:true});
  const intent = await f.prepare();
  const manifest = intent.expectedPublicManifest;
  const pendingName = 'schema-release-pending.json';
  const controlName = 'background-control.json';
  const forwardName = 'schema-release-forward-terminal-archive-1234-1.json';
  const typed = {...f.typed, phase:'OPEN', generation:manifest.generation, manifestDigest:sha(JSON.stringify(manifest))};
  const {purpose, schemaRelease, ...ordinary} = typed;
  f.write(controlName, typed);
  f.write('background-generation.json', {generation:manifest.generation});
  const {database} = f.args.rootLease;
  const state = {manifest, durable:true, originalSessionPresent:false, visibleBoot:manifest.participants[0].bootId, ledger:intent.afterLedgerSha256, active:false};
  const args = {context:f.args.context, preparationSha256:f.args.preparationSha256, client:{async query(sql) {
    assert.match(sql, /originalSessionPresent/);
    return {rows:[{primary:true,databaseOid:database.databaseOid,systemIdentifier:database.systemIdentifier,
      postmasterStartMicros:database.postmasterStartMicros,originalSessionPresent:state.originalSessionPresent}]};
  }}};
  const deps = {...f.deps,
    authority() {throw Error('a completed OPEN cannot request a fresh approval');},
    now:()=>Date.parse(args.context.window.end)+3600000,
    readPublic:()=>state.manifest,
    confirmDurability(read,guard) {guard();read();return {durabilityConfirmed:state.durable};},
    inspectParticipant(expected) {
      return {...expected,imageId:args.context.candidateImageId,status:{protocolVersion:1,bootId:state.visibleBoot,poisoned:false,stopping:false,
        phase:'OPEN',owner:manifest.owner,generation:manifest.generation,pendingChildren:0,taskGraphs:0,inFlight:1,
        controlSession:{connected:true,broken:false,sessionPid:19,databaseOid:database.databaseOid,backendStartedAt:date(12)}}};
    },
    captureLedger:async()=>({sha256:state.ledger}),
    captureOff:async()=>{
      const off = f.lookup('schema-release-pre-open-off-1234-1.json');
      if (state.active) off.observedTables[0].rows='1';
      return off;
    },
    writeOpen(value) {
      assert.equal(f.store.exists(forwardName), true);
      assert.throws(f.ordinaryAdmit,/DEDICATED_RECOVERY_REQUIRED/);
      f.events.push('forward-normalize');
      f.write(controlName,value);
    },
  };
  return {...f,intent,typed,ordinary,manifest,pendingName,controlName,forwardName,state,args,deps,
    forward:()=>finalizeCommittedModernSchemaOpen(args,deps)};
}

test('an expired but committed OPEN is finalized from the genuine phase-12 chain, and replay is read-only',async t=>{
  const f=await committedFixture(t);
  const pending=f.lookup(f.pendingName);
  const {stateDigest,...prior}=pending;
  const held={...prior,status:'HOLD',holdReason:'WINDOW_ENDED',updatedAt:new Date(f.deps.now()).toISOString()};
  f.write(f.pendingName,{...held,stateDigest:canonicalDigest(held)});
  assert.equal(await f.forward().then(r=>r.outcome),'SUCCESS');
  assert.deepEqual(f.lookup(f.controlName),f.ordinary);
  assert.deepEqual(f.state.manifest,f.intent.expectedPublicManifest);
  assert.doesNotThrow(f.ordinaryAdmit);
  const events=f.events.filter(event=>event==='unlink'||event==='forward-normalize');
  assert.deepEqual(events,['forward-normalize','unlink']);
  assert.equal(await f.forward().then(r=>r.outcome),'SUCCESS');
  assert.deepEqual(f.events.filter(event=>event==='unlink'||event==='forward-normalize'),events);
});

test('forward replay resumes ordinary OPEN after unlink fails or its durability is uncertain',async t=>{
  for (const flag of ['omitUnlink','faultFsync']) {
    const f=await committedFixture(t);
    f.flags[flag]=true;
    await assert.rejects(f.forward());
    assert.throws(f.ordinaryAdmit,/DEDICATED_RECOVERY_REQUIRED/);
    assert.deepEqual(f.lookup(f.controlName),f.ordinary);
    assert.ok(f.store.exists(f.forwardName));
    f.flags[flag]=false;
    assert.equal(await f.forward().then(r=>r.outcome),'SUCCESS');
    assert.doesNotThrow(f.ordinaryAdmit);
    assert.equal(f.events.filter(event=>event==='forward-normalize').length,1);
  }
});

test('forward publication never trusts a stale boot, live original S, changed ledger, rollout, or undurable publication',async t=>{
  for (const mutate of [
    f=>{f.state.visibleBoot='wrong';},f=>{f.state.originalSessionPresent=true;},f=>{f.state.ledger=hash('0');},
    f=>{f.state.active=true;},f=>{f.state.durable=false;},f=>{f.state.manifest={...f.manifest,generation:90};},
    f=>{f.flags.ingressAbsent=false;},f=>{f.flags.formal=false;},f=>{f.write('background-generation.json',{generation:90});},
    f=>{f.write(f.controlName,f.ordinary);},
  ]) {
    const f=await committedFixture(t);mutate(f);
    await assert.rejects(f.forward());
    assert.throws(f.ordinaryAdmit,/DEDICATED_RECOVERY_REQUIRED/);
    assert.equal(f.store.exists(f.forwardName),false);
  }
});

test('forward replay accepts the exact original typed archive after a phase-14 normalization response loss',async t=>{
  const f=await committedFixture(t);
  let pending=f.lookup(f.pendingName);
  const intent=f.intent;
  for (const [sequence, phase, evidence] of [
    [13,'OPEN_PUBLISHED',{publicManifest:f.manifest,privateControlSha256:canonicalDigest(f.typed),openCommitIntentSha256:canonicalDigest(intent),
      schemaReceiptSha256:intent.schemaReceiptSha256}],
    [14,'COMPLETED_OPEN',{publicManifestSha256:intent.expectedPublicManifestSha256,schemaReceiptSha256:intent.schemaReceiptSha256,
      formalDeploymentSha256:intent.formalDeploymentSha256,ingressReleaseReceiptSha256:intent.ingressReleaseReceiptSha256}],
  ]) {
    const step={...f.lookup(f.stepFile(pending.phase,pending.sequence)),sequence,from:pending.phase,to:phase,
      previousDigest:pending.receiptSha256,recordedAt:date(sequence),
      payload:{schema:'phoenix.modern-schema-step-evidence/v1',kind:phase,contextDigest:intent.contextDigest,
        evidence,evidenceSha256:canonicalDigest(evidence)}};
    f.write(f.stepFile(phase,sequence),step);
    const {stateDigest,...previous}=pending;
    const next={...previous,phase,sequence,receiptSha256:canonicalDigest(step),updatedAt:step.recordedAt};
    pending={...next,stateDigest:canonicalDigest(next)};
    f.write(f.pendingName,pending);
  }
  f.write(f.archiveFile,{schema:'phoenix.modern-schema-typed-open-archive/v1',owner:intent.owner,targetSha:intent.targetSha,
    contextDigest:intent.contextDigest,pending,backgroundControl:f.typed,publicManifest:f.manifest,ingressReleaseReceipt:f.lookup('schema-release-ingress-released-1234-1.json')});
  f.write(f.controlName,f.ordinary);
  assert.equal(await f.forward().then(r=>r.outcome),'SUCCESS');
  assert.equal(f.events.includes('forward-normalize'),false);
  assert.doesNotThrow(f.ordinaryAdmit);
});
test('a restart during the last awaited OFF observation keeps the ordinary deployment deny',async t=>{
 const f=await committedFixture(t);const capture=f.deps.captureOff;let calls=0;
 f.deps.captureOff=async(...args)=>{const off=await capture(...args);if(++calls===2)f.state.visibleBoot='restarted-after-last-await';return off;};
 await assert.rejects(f.forward(),/BACKGROUND_HOLD=/);
 assert.equal(f.pending(),true);assert.throws(f.ordinaryAdmit,/DEDICATED_RECOVERY_REQUIRED/);
 assert.equal(f.events.filter(event=>event==='unlink').length,0);
});
