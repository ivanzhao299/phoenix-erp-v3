import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const helper = path.resolve('scripts/ci/candidate-typeorm-inventory.sh');

function validateInventory(raw) {
  if (!raw.trim()) throw new Error('CANDIDATE_TYPEORM_INVENTORY_EMPTY');
  let inventory;
  try {
    inventory = JSON.parse(raw);
  } catch {
    throw new Error('CANDIDATE_TYPEORM_INVENTORY_INVALID');
  }
  if (!Array.isArray(inventory) || inventory.length === 0) {
    throw new Error('CANDIDATE_TYPEORM_INVENTORY_INVALID');
  }
  return inventory;
}

function hasDocker() {
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

test('candidate inventory preserves stdin and emits parseable JSON', (t) => {
  if (!hasDocker()) {
    t.skip('Docker daemon unavailable in this environment');
    return;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-inventory-'));
  const tag = `candidate-inventory-fixture:${process.pid}`;
  fs.writeFileSync(path.join(root, 'Dockerfile'), [
    'FROM node:20-alpine',
    'RUN mkdir -p /app/dist/database/migrations',
    'COPY fixture.js /app/dist/database/migrations/fixture.js',
    ''
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'fixture.js'), [
    'class FixtureMigration1780000000000 {',
    '  async up() {}',
    '  async down() {}',
    '}',
    'module.exports = { FixtureMigration1780000000000 };',
    ''
  ].join('\n'));

  try {
    const build = spawnSync('docker', ['build', '--tag', tag, root], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);

    const run = spawnSync('bash', [helper, tag], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const inventory = validateInventory(run.stdout);
    assert.deepEqual(inventory.map(({ effective_name, timestamp }) => ({ effective_name, timestamp })), [
      { effective_name: 'FixtureMigration1780000000000', timestamp: 1780000000000 }
    ]);

    const withoutInteractiveStdin = fs.readFileSync(helper, 'utf8').replace(
      'docker run --rm -i --network none',
      'docker run --rm --network none'
    );
    const brokenHelper = path.join(root, 'candidate-typeorm-inventory-no-i.sh');
    fs.writeFileSync(brokenHelper, withoutInteractiveStdin, { mode: 0o755 });
    const broken = spawnSync('bash', [brokenHelper, tag], { encoding: 'utf8' });
    assert.equal(broken.status, 0, broken.stderr);
    assert.throws(() => validateInventory(broken.stdout), /CANDIDATE_TYPEORM_INVENTORY_EMPTY/);
  } finally {
    spawnSync('docker', ['rmi', '--force', tag], { stdio: 'ignore' });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('candidate inventory helper accepts digest-pinned image references', () => {
  const script = fs.readFileSync('scripts/ci/candidate-typeorm-inventory.sh', 'utf8');
  assert.match(script, /docker run --rm -i [^\n]*\"\$IMAGE\"/);
  assert.match('ghcr.io/example/api@sha256:' + 'a'.repeat(64), /@sha256:[0-9a-f]{64}$/);
});

test('candidate inventory validation blocks empty and invalid JSON', () => {
  assert.throws(() => validateInventory(''), /CANDIDATE_TYPEORM_INVENTORY_EMPTY/);
  assert.throws(() => validateInventory('not-json'), /CANDIDATE_TYPEORM_INVENTORY_INVALID/);
  assert.throws(() => validateInventory('[]'), /CANDIDATE_TYPEORM_INVENTORY_INVALID/);
});

test('workflow has fail-closed candidate inventory gates', () => {
  const workflow = fs.readFileSync('.github/workflows/phase1-controlled-production-execution.yml', 'utf8');
  assert.match(workflow, /test -s candidate-typeorm\.json/);
  assert.match(workflow, /CANDIDATE_TYPEORM_INVENTORY_EMPTY/);
  assert.match(workflow, /CANDIDATE_TYPEORM_INVENTORY_INVALID/);
  assert.match(fs.readFileSync(helper, 'utf8'), /docker run --rm -i --network none/);
});
