import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ops = path.dirname(new URL(import.meta.url).pathname);
const workflow = fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
test('inline workflow scripts retain size headroom before GitHub expression expansion',()=>{
  const lines=workflow.split('\n'),scripts=[];
  for(let index=0;index<lines.length;index++){
    const match=/^( *)(?:run|script): \|\s*$/.exec(lines[index]);if(!match)continue;
    const indent=match[1].length,body=[];
    for(let at=index+1;at<lines.length;at++){
      const line=lines[at];if(line.trim()&&line.match(/^ */)[0].length<=indent)break;
      body.push(line.slice(indent+2));
    }
    const value=body.join('\n');scripts.push(value);
    // The old deployment action input grew from 20,601 to 21,015 UTF-8 bytes
    // and GitHub rejected the workflow before creating any jobs. Reserve
    // additional room for its embedded expressions, without removing checks.
    assert.ok(Buffer.byteLength(value)<=20000,`inline script at line ${index+1} must be moved into a reviewed helper before growing further`);
  }
  assert.ok(scripts.length>=10);
  const remote=scripts.find(value=>value.startsWith('set -Eeuo pipefail\n')&&value.includes('CODE_SYNCED=false'));
  assert.ok(remote);execFileSync('/bin/bash',['-n'],{input:remote,stdio:['pipe','pipe','pipe']});
});
function closure(files) {
  const seen = new Set();
  function visit(name) {
    if (seen.has(name)) return; seen.add(name);
    if (!name.endsWith('.mjs')) return;
    const source = fs.readFileSync(path.join(ops, name), 'utf8');
    for (const pattern of [/(?:from\s+|import\()\s*['"]\.\/([^'"]+)['"]/g, /new URL\(\s*['"]\.\/([^'"]+)['"]/g]) {
      for (const match of source.matchAll(pattern)) visit(match[1]);
    }
  }
  for (const file of files) visit(file); return seen;
}
for (const [name, variable] of [['floor promotion', 'FLOOR_STAGE'], ['ordinary evidence', 'EVIDENCE_STAGE']]) {
  test(`${name} target bundle has full import closure and imports after isolated staging`, async t => {
    const pattern = new RegExp(`for helper in ([^;]+); do\\n\\s+git show "\\$TARGET_SHA:scripts/ops/\\$helper" > "\\$${variable}/\\$helper"`);
    const match = workflow.match(pattern); assert.ok(match, `${variable} staging list`);
    const files = match[1].split(/\s+/).filter(Boolean);
    if (variable === 'FLOOR_STAGE') files.push('production-deployment-evidence.mjs', 'api-bootstrap-schema-contract.json');
    const missing = [...closure(files)].filter(file => !files.includes(file));
    assert.deepEqual(missing, []);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-staging-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const file of files) {
      const source = file === 'api-bootstrap-schema-contract.json'
        ? new URL('../../apps/api/src/common/database/api-bootstrap-schema-contract.json', import.meta.url)
        : path.join(ops, file);
      fs.copyFileSync(source, path.join(dir, file));
    }
    for (const file of files.filter(x => x.endsWith('.mjs'))) {
      execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(path.join(dir, file)).href)})`], { stdio: 'pipe' });
    }
    if (variable === 'FLOOR_STAGE') {
      const promotion = fs.readFileSync(path.join(ops, 'promote-production-config-floor.mjs'), 'utf8');
      const identityFiles = [...promotion.match(/for \(const file of \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
      for (const file of files) assert.ok(identityFiles.includes(file), `staged helper ${file} identity is verified`);
    }
  });
}

test('background staging list is reviewed on main and has the full import closure', () => {
  const workflowText = workflow;
  assert.match(workflowText, /git show "\$TARGET_SHA:scripts\/ops\/background-stage-helpers\.txt" \| while IFS= read -r helper/);
  const files = fs.readFileSync(path.join(ops, 'background-stage-helpers.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
  assert.ok(files.length >= 15);
  for (const file of files) assert.ok(fs.existsSync(path.join(ops, file)), `staged helper ${file} exists on main`);
  const missing = [...closure(files)].filter(file => !files.includes(file));
  assert.deepEqual(missing, []);
});

test('shared atomic helper is pinned in the critical-file contract', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ops, 'production-config-contract.json')));
  assert.ok(contract.criticalFiles.includes('scripts/ops/production-atomic-state.mjs'));
});

test('v3 re-anchor admits a new critical helper through installed and target validators', async t => {
  const { CONTRACT, assertFloor, assertFloorMonotonic, migrationScope } = await import('./production-config-guard.mjs');
  const { promotionPlan } = await import('./promote-production-config-floor.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-helper-upgrade-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const git = args => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '-q', '--initial-branch=main']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  const newHelper = 'scripts/ops/production-atomic-state.mjs';
  const oldContract = { ...CONTRACT, criticalFiles: CONTRACT.criticalFiles.filter(file => file !== newHelper) };
  for (const file of oldContract.criticalFiles) {
    const dest = path.join(repo, file); fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.endsWith('production-config-contract.json') ? JSON.stringify(oldContract) : 'old-floor fixture\n');
  }
  git(['add', '.']); git(['commit', '-qm', 'old floor without shared helper']); const oldSha = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(repo, newHelper), fs.readFileSync(path.join(ops, 'production-atomic-state.mjs')));
  fs.writeFileSync(path.join(repo, 'scripts/ops/production-config-contract.json'), JSON.stringify(CONTRACT));
  git(['add', '.']); git(['commit', '-qm', 'target adds critical helper']); const target = git(['rev-parse', 'HEAD']);
  // Installed validator carries the historical contract and must still admit
  // its own old floor. The target validator is used only for the proposed floor.
  const installedDir = path.join(root, 'installed'); fs.mkdirSync(installedDir);
  for (const file of closure(['production-config-guard.mjs'])) fs.copyFileSync(path.join(ops, file), path.join(installedDir, file));
  fs.writeFileSync(path.join(installedDir, 'production-config-contract.json'), JSON.stringify(oldContract));
  const installed = await import(pathToFileURL(path.join(installedDir, 'production-config-guard.mjs')).href);
  const previousFloor = { version: 3, phase: 'READY', floorSha: oldSha, chanjetPolicy: 'HOLD', readonlyApproval: null,
    operationalTuple: { CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' } };
  assert.doesNotThrow(() => installed.assertFloor(repo, previousFloor, oldSha, { targetTree: true }));
  assert.throws(() => assertFloor(repo, previousFloor, oldSha, { targetTree: true }), /FLOOR_CAPABILITY_MISSING/);
  assert.doesNotThrow(() => assertFloorMonotonic(repo, oldSha, target));
  const actual = { api: { imageId: `sha256:${'a'.repeat(64)}`, revision: oldSha }, web: { imageId: `sha256:${'b'.repeat(64)}`, revision: oldSha } };
  const scope = migrationScope(repo, oldSha, target); assert.deepEqual(scope.changed, []);
  const changed = git(['diff', '--name-only', oldSha, target, '--', ...CONTRACT.criticalFiles]).split('\n');
  assert.ok(changed.includes(newHelper));
  const plan = promotionPlan({ previousFloor, previousActive: { version: 3, floorSha: oldSha, outcome: 'SUCCESS', active: actual },
    actual, target, approvedSha: target, runId: '123-1', scope, criticalFilesChanged: changed.length > 0, expectedPreviousFloorSha: oldSha });
  assert.doesNotThrow(() => assertFloor(repo, plan.floor, target, { targetTree: true }));
  assert.equal(plan.marker.previousFloorSha, oldSha); assert.equal(plan.active.outcome, 'CONFIG_READY_HOLD');
});

test('standalone audit stages its reviewed verifier closure before importing against an older checkout', async t => {
  const restoration = fs.readFileSync('.github/workflows/chanjet-readonly-restoration.yml', 'utf8');
  assert.match(restoration, /if \[ "\$OPERATION" = recovery \] \|\| \[ "\$OPERATION" = audit \]/);
  const { AUDIT_BUNDLE_FILES, auditBundleManifest } = await import('./readonly-audit-bundle-manifest.mjs');
  const files = AUDIT_BUNDLE_FILES;
  assert.deepEqual([...closure(files)].filter(name => !files.includes(name)), []);
  assert.doesNotMatch(restoration, /RECOVERY_BUNDLE_B64/);
  assert.match(restoration, /AUDIT_CLOSURE_MANIFEST_B64/);
  const manifest = auditBundleManifest(ops);
  assert.equal(manifest.schema, 'phoenix.readonly-audit-closure/1');
  assert.deepEqual(manifest.files.map(x => x.path), [...files].sort());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-audit-stage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of files) fs.copyFileSync(path.join(ops, name), path.join(dir, name));
  fs.copyFileSync(path.join(ops, 'chanjet-readonly-production-audit.mjs'), path.join(dir, 'audit.mjs'));
  const audit = await import(pathToFileURL(path.join(dir, 'audit.mjs')).href);
  const verifier = await audit.loadAuditEvidenceVerifier();
  assert.equal(typeof verifier.evidenceMode, 'function');
  assert.equal(typeof verifier.verifyLiveSnapshot, 'function');
  const chain = fs.readFileSync('scripts/ops/chanjet-readonly-production-chain.sh', 'utf8');
  const copied = chain.match(/for helper in ([^;]+); do\n\s+cp "scripts\/ops\/\$helper" "\$AUDIT_DIR\/\$helper"/)[1].split(/\s+/);
  assert.deepEqual([...closure(['chanjet-readonly-production-audit.mjs'])].filter(name => name !== 'chanjet-readonly-production-audit.mjs' && !copied.includes(name)), []);
});

test('audit transport uses faithful SSH command sizing and rejects tampered staged closure', async t => {
  const { auditBundleManifest } = await import('./readonly-audit-bundle-manifest.mjs');
  const { stageReadonlyAuditClosure } = await import('./readonly-audit-bundle-stage.mjs');
  const target = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const manifest = auditBundleManifest(ops); manifest.targetSha = target;
  const encodedValues = [
    'production-config-contract.json', 'production-trusted-paths.mjs', 'production-control-bootstrap.sh',
    'chanjet-readonly-production-audit.mjs', 'readonly-audits/chanjet-restoration-preflight.sql',
  ].map(name => Buffer.from(fs.readFileSync(path.join(ops, name))).toString('base64'));
  encodedValues.push(Buffer.from(JSON.stringify(manifest)).toString('base64'), Buffer.from(fs.readFileSync(path.join(ops, 'readonly-audit-bundle-stage.mjs'))).toString('base64'));
  const envCommands = encodedValues.map((value, index) => `export AUDIT_PAYLOAD_${index}='${value}'`).join('\\n');
  const remoteCommand = `${envCommands}\\nnode audit.mjs preflight.sql`;
  assert.ok(Buffer.byteLength(remoteCommand) < 131072);
  const oversized = `${remoteCommand}${'x'.repeat(140000)}`;
  const tooLarge = spawnSync('/bin/true', [oversized], { encoding: 'utf8' });
  assert.equal(tooLarge.error?.code, 'E2BIG');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-stage-e2e-'));
  t?.after?.(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  stageReadonlyAuditClosure(path.join(dir, 'manifest.json'), target, process.cwd(), dir);
  for (const entry of manifest.files) {
    const staged = fs.readFileSync(path.join(dir, entry.path));
    assert.equal(createHash('sha256').update(staged).digest('hex'), entry.sha256);
    assert.equal(fs.statSync(path.join(dir, entry.path)).mode & 0o777, 0o600);
  }
  const tampered = structuredClone(manifest); tampered.files[0].sha256 = '0'.repeat(64);
  fs.writeFileSync(path.join(dir, 'tampered.json'), JSON.stringify(tampered));
  assert.throws(() => stageReadonlyAuditClosure(path.join(dir, 'tampered.json'), target, process.cwd(), dir), /AUDIT_BUNDLE_OUTPUT|AUDIT_BUNDLE_HASH/);
  fs.rmSync(dir, { recursive: true, force: true });
});
