import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { TARGET, FILES, hash, decodePackage, reconcileCheckout, execute, gitCommand } from '../ops/c3-authorized-transition.mjs';
const source = fs.readFileSync(new URL('../ops/c3-authorized-transition.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/production-git-remote-diagnostic.yml', import.meta.url), 'utf8');
function packageBytes(mutate = () => {}) {
  const files = Object.fromEntries(FILES.map(file => {
    const b = execFileSync('git', ['show', `${TARGET}:${file}`]);
    return [file, { base64: b.toString('base64'), sha256: hash(b) }];
  }));
  const bundle = { sourceSha: TARGET, files }; mutate(bundle);
  const bytes = gzipSync(JSON.stringify(bundle)); return [bytes.toString('base64'), hash(bytes)];
}
test('accepts only exact merged-source package', () => {
  const [encoded, digest] = packageBytes();
  const decoded = decodePackage(encoded, digest);
  assert.equal(Object.keys(decoded).length, FILES.length);
  for (const file of FILES) assert.deepEqual(decoded[file], execFileSync('git', ['show', `${TARGET}:${file}`]));
});
test('rejects transport digest mismatch', () => assert.throws(() => decodePackage(...[packageBytes()[0], '0'.repeat(64)]), /PACKAGE_DIGEST/));
test('rejects source revision substitution', () => assert.throws(() => decodePackage(...packageBytes(b => b.sourceSha = '8'.repeat(40))), /PACKAGE_SOURCE_OR_PATHS/));
test('rejects extra/traversal path', () => assert.throws(() => decodePackage(...packageBytes(b => b.files['../evil'] = {})), /PACKAGE_SOURCE_OR_PATHS/));
test('rejects missing validator', () => assert.throws(() => decodePackage(...packageBytes(b => delete b.files['scripts/ops/verify-config-floor-transition.mjs'])), /PACKAGE_SOURCE_OR_PATHS/));
test('rejects changed helper content', () => assert.throws(() => decodePackage(...packageBytes(b => b.files['scripts/ops/production-trusted-paths.mjs'].base64 = Buffer.from('unsafe').toString('base64'))), /PACKAGE_FILE_DIGEST/));
function simulatedCheckout({ fail = false, changedHead = false, dirty = false } = {}) {
  const calls = []; const old = '017633c5fb0a090d7b8cda375125d1832668f304'; let head = old;
  let restored = false;
  const git = args => {
    calls.push(args);
    if (args[0] === 'restore') return '';
    if (args[0] === 'merge') { if (changedHead) head = 'f'.repeat(40); if (fail) throw new Error('FF_FAILED'); head = TARGET; return ''; }
    if (args[0] === 'status') return dirty ? '?? unknown\n' : '';
    if (args[0] === 'rev-parse') return head + '\n';
    if (args[0] === 'branch') return 'main\n';
    if (args[0] === 'show') return 'old-compose\n';
    throw new Error('UNEXPECTED_COMMAND');
  };
  const action = () => reconcileCheckout({ git, oldCompose: Buffer.from('old-compose\n'), safeCompose: Buffer.from('safe-compose\n'),
    restoreSafe: bytes => { assert.equal(bytes.toString(), 'safe-compose\n'); restored = true; } });
  return { action, calls, recovered: () => restored };
}
test('successful reconciliation uses exact restore followed by ff-only and clean/SHA checks', () => {
  const s = simulatedCheckout(); s.action();
  assert.deepEqual(s.calls.slice(0, 3), [['restore','--source=HEAD','--worktree','--','docker-compose.yml'],['status','--porcelain','--untracked-files=all'],['merge','--ff-only','origin/main']]);
  assert.equal(s.recovered(), false);
});
test('failed FF with unchanged clean old HEAD restores only archived safe compose, then throws HOLD', () => {
  const s = simulatedCheckout({ fail: true }); assert.throws(s.action, /FF_FAILED/); assert.equal(s.recovered(), true);
});
test('changed HEAD on failure never blindly restores compose', () => {
  const s = simulatedCheckout({ fail: true, changedHead: true }); assert.throws(s.action, /FF_FAILED/); assert.equal(s.recovered(), false);
});
test('unknown dirt stops reconciliation and does not discard it', () => {
  const s = simulatedCheckout({ dirty: true }); assert.throws(s.action, /POST_RESTORE_DIRT/); assert.equal(s.recovered(), false);
  assert.equal(s.calls.some(args => args[0] === 'merge'), false);
});
test('missing exact approval stops before any initialization', async () => {
  const prior = process.env.C3_APPROVAL; delete process.env.C3_APPROVAL;
  try { await assert.rejects(execute('initialize'), /EXPLICIT_APPROVAL/); }
  finally { if (prior !== undefined) process.env.C3_APPROVAL = prior; }
});
test('no application-switch/database/unsafe Git commands in C3 program', () => {
  assert.doesNotMatch(source, /reset.*--hard|git.*stash|git.*clean|\['(?:restart|up|pull|build)'/);
  assert.doesNotMatch(source, /psql|migration:run|docker compose up|sudo|chownSync/);
  assert.match(source, /readonlySnapshot/); assert.match(source, /scope.changed.length === 0/);
});
test('production environment, formal SSH parameters, exact reviewed commit and program pinning', () => {
  assert.match(workflow, /environment: production\n/);
  assert.match(workflow, /GITHUB_SHA.*REVIEWED_COMMIT/);
  assert.match(workflow, /sha256sum scripts\/ops\/c3-authorized-transition.mjs/);
  assert.match(workflow, /TARGET_SHA: 23c7af86dd122379d01248a3b9542b8165f31498/);
  for (const key of ['DEPLOY_HOST','DEPLOY_USER','DEPLOY_SSH_KEY','DEPLOY_PROXY_HOST','DEPLOY_PROXY_USER','DEPLOY_PROXY_SSH_KEY']) assert.ok(workflow.includes(`secrets.${key}`));
});
test('merged-source policy and FD9 transaction boundaries preserved', () => {
  assert.match(workflow, /exec 9<>\/var\/lib\/phoenix-erp\/production-deployment-state\/mutation.lock\n\s+flock -n 9/);
  assert.match(source, /guard.verifyContext\(root, contract.stateDirectory\)/);
  assert.match(source, /trust.strictSshCommand/);
  assert.match(source, /verifier.verifyTransition/);
  assert.match(source, /guard.assertTransactionOwnership/);
  assert.match(source, /outcome: 'C3_CONFIG_READY'/);
  assert.doesNotMatch(source, /operation.*complete|outcome: 'SUCCESS'/);
});
test('cross-filesystem evidence move is exact and original historical copy untouched', () => {
  assert.match(source, /run\('mv', \['--no-clobber', '--', original, preservedOriginal\]\)/);
  assert.doesNotMatch(source, /(?:writeFileSync|unlinkSync|renameSync|chmodSync|chownSync)\(OLD_ARCHIVE/);
  assert.match(source, /HISTORICAL_EVIDENCE_CHANGED/);
  assert.match(source, /writeExclusive\(archiveBackup, sourceBytes, trust, contract\)/);
});
test('actual local post-merge and fsmonitor hooks cannot run during reconciliation', () => {
  assert.match(source, /GIT_ATTR_NOSYSTEM: '1'/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-c3-hooks-'));
  const local = args => execFileSync('git', args, { cwd: root, stdio: ['ignore','pipe','pipe'] });
  local(['init','-b','main']); local(['config','user.email','c3-test@example.invalid']); local(['config','user.name','C3 test']);
  fs.writeFileSync(path.join(root,'docker-compose.yml'),'old\n'); local(['add','docker-compose.yml']); local(['commit','-m','old']);
  const old = local(['rev-parse','HEAD']).toString().trim();
  fs.writeFileSync(path.join(root,'docker-compose.yml'),'safe\n'); local(['add','docker-compose.yml']); local(['commit','-m','safe']);
  const target = local(['rev-parse','HEAD']).toString().trim(); local(['switch','-c','temporary-old',old]);
  for (const name of ['post-merge','fsmonitor']) fs.writeFileSync(path.join(root,'.git/hooks',name), `#!/bin/sh\ntouch '${root}/${name}-executed'\nexit 0\n`, { mode:0o700 });
  local(['config','core.fsmonitor',path.join(root,'.git/hooks/fsmonitor')]);
  const git = gitCommand(root, { strictSshCommand: () => 'ssh -oStrictHostKeyChecking=yes' });
  git(['status','--porcelain','--untracked-files=all']); git(['merge','--ff-only',target]);
  assert.equal(fs.existsSync(path.join(root,'post-merge-executed')), false);
  assert.equal(fs.existsSync(path.join(root,'fsmonitor-executed')), false);
  assert.equal(git(['rev-parse','HEAD']).trim(),target);
});
