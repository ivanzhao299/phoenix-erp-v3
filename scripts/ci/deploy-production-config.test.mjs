import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertFenceCoverage, denyDuringHold, nginxFenceMap } from '../ops/chanjet-maintenance-fence.mjs';
const read = file => fs.readFileSync(file, 'utf8');
const workflow = read('.github/workflows/deploy.yml');
const state = read('scripts/ops/production-deployment-state.mjs');
const wrapper = read('scripts/ops/phoenix-production-compose.mjs');
const guard = read('scripts/ops/production-config-guard.mjs');

test('safe HEAD/config remains current; no destructive reset, ref rollback, stash or clean', () => {
  const rollback = workflow.split('            rollback_deploy() {')[1].split('            docker() {')[0];
  assert.doesNotMatch(rollback, /git reset|git update-ref|git restore|git stash|git clean|git checkout/);
  assert.match(rollback, /rollback-plan/); assert.match(rollback, /rollback-pin/); assert.match(rollback, /rolled-back/);
  assert.match(workflow, /git status --porcelain --untracked-files=all/);
  assert.match(workflow, /if \[ "\$CURRENT_BRANCH" != "main" \]/);
});
test('running identities captured before code sync and target floor checked before FF', () => {
  assert.ok(workflow.indexOf('capture.mjs" > "$CAPTURE_FILE"') < workflow.indexOf('git merge --ff-only origin/main'));
  assert.ok(workflow.indexOf('production-config-guard.mjs --target "$TARGET_SHA"') < workflow.indexOf('git merge --ff-only origin/main'));
  assert.match(state, /migrationScope\(root, previous.api.revision, target\)/);
  assert.match(guard, /cat-file.*apiRevision/); assert.match(guard, /merge-base.*apiRevision, target/);
});
test('ordinary deployment never writes env or invokes schema-changing track; credential rotation is explicit', () => {
  assert.match(workflow, /rotate_chanjet_credentials:[\s\S]*?default: false/);
  assert.match(workflow, /ROTATE_CHANJET_CREDENTIALS.*= true[\s\S]*?update-managed-chanjet-env.mjs/);
  assert.doesNotMatch(workflow, /const keySet = new Set\(keys\)/);
  assert.match(state, /scope.changed.length.*throw new Error\('MIGRATION_SCOPE=HOLD/);
  assert.match(workflow, /RUN_MIG=false/);
});
test('API and Web image revision labels are explicit and build pipeline injects TARGET_SHA metadata', () => {
  for (const file of ['apps/api/Dockerfile', 'apps/web/Dockerfile']) assert.match(read(file), /LABEL org.opencontainers.image.revision=["\{]*\$\{?GIT_SHA/);
  assert.match(workflow, /labels: \$\{\{ steps.meta.outputs.labels \}\}/);
  assert.match(workflow, /GIT_SHA=\$\{\{ github.sha \}\}/);
  assert.match(state, /revision !== target/);
});
test('all three production callers share host lock, guard and restricted wrapper; protected images are not pruned', () => {
  for (const file of ['.github/workflows/deploy.yml', '.github/workflows/production-disk-maintenance.yml', '.github/workflows/phase1-controlled-production-execution.yml']) {
    const text = read(file); assert.match(text, /flock -n 9/); assert.match(text, /production-config-guard.mjs/); assert.match(text, /phoenix-production-compose.mjs/);
    assert.doesNotMatch(text, /docker image prune -a/);
  }
  assert.match(wrapper, /\['up', 'restart'\].*rollbackEligibility/);
  assert.doesNotMatch(wrapper, /process.stdout.write/); // no resolved config or secrets returned
});
test('real controller inventory is denied except reviewed side-effect-free status reads; unknown starts also denied', () => {
  const routes = assertFenceCoverage(read('apps/api/src/modules/chanjet/chanjet-callback.controller.ts'));
  for (const route of routes.filter(route => route.method !== 'GET')) assert.equal(denyDuringHold(route.method, route.path), true);
  for (const suffix of ['sync-ar', 'ar-ledger-import', 'integration/mirror/sync', 'integration/mirror/sync-resilient', 'integration/alignment/run', 'integration/alignment/enqueue']) assert.ok(routes.some(route => route.path.endsWith('/'+suffix)));
  assert.equal(denyDuringHold('POST', '/api/chanjet/new-unreviewed-start'), true);
  assert.equal(denyDuringHold('GET', '/api/chanjet/new-unreviewed-start'), true);
  assert.equal(denyDuringHold('GET', '/api/chanjet/integration/alignment/status'), false);
  assert.ok(read('nginx/erp.eggslao.com.conf').includes(nginxFenceMap()));
  assert.match(read('scripts/ops/production-config-contract.json'), /"legacyApiRollback": "HOLD"/);
});
test('real Nginx fixture blocks every actual POST route with zero upstream execution during hold', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-fence-')); const name = `phoenix-fence-test-${randomUUID()}`;
  const image = 'nginx:1.28-alpine';
  const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    try { docker(['image', 'inspect', image]); } catch { docker(['pull', image]); }
    const production = read('nginx/erp.eggslao.com.conf');
    const maps = production.split('# Phoenix ERP V3')[0];
    const hold = production.match(/    set \$phoenix_chanjet_hold 0;[\s\S]*?    # 畅捷通回调/)?.[0].replace('    # 畅捷通回调', '');
    const location = production.match(/    location \/api\/chanjet\/ \{[\s\S]*?\n    \}/)?.[0].replace('127.0.0.1:3100', '127.0.0.1:8081');
    assert.ok(hold && location);
    fs.writeFileSync(path.join(dir, 'nginx.conf'), `events {}\nhttp { ${maps}\nserver {listen 8080; ${hold}\n${location}\n} server { listen 8081; location / { return 204; } } }`);
    fs.mkdirSync(path.join(dir, 'control')); fs.writeFileSync(path.join(dir, 'control', 'chanjet-sync-hold'), 'hold\n');
    docker(['run', '-d', '--name', name, '-p', '127.0.0.1::8080', '-v', `${dir}/nginx.conf:/etc/nginx/nginx.conf:ro`, '-v', `${dir}/control:/etc/phoenix/runtime-control:ro`, image]);
    docker(['exec', name, 'nginx', '-t']);
    const port = docker(['port', name, '8080/tcp']).split(':').at(-1);
    execFileSync('curl', ['-fsS', '--retry', '5', '--retry-connrefused', '--max-time', '5', `http://127.0.0.1:${port}/api/chanjet/integration/alignment/status`], { stdio: 'ignore' });
    const routes = assertFenceCoverage(read('apps/api/src/modules/chanjet/chanjet-callback.controller.ts')).filter(route => route.method === 'POST');
    for (const route of routes) {
      const status = execFileSync('curl', ['-sS', '--max-time', '5', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST', `http://127.0.0.1:${port}${route.path.replace(/:[^/]+/g, 'fixture')}`], { encoding: 'utf8' });
      assert.equal(status, '503'); // 204 would mean the upstream executed
    }
    const status = execFileSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', `http://127.0.0.1:${port}/api/chanjet/integration/alignment/status`], { encoding: 'utf8' }); assert.equal(status, '204');
  } finally { spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('actual Bash ERR handler rolls back pinned Web after switch failure and retains safe checkout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-web-trap-'));
  try {
    const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
    const log = path.join(dir, 'calls'); const once = path.join(dir, 'once');
    fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh
if [ "$1" = -e ]; then exec "$REAL_NODE" "$@"; fi
printf '%s\\n' "$*" >> "$CALL_LOG"
case "$*" in
  *'rollback-plan'*) printf '%s\\n' '[{"service":"web","imageId":"sha256:${'b'.repeat(64)}","revision":"${'b'.repeat(40)}"}]';;
  *'phoenix-production-compose.mjs up'*) if [ ! -f "$ONCE" ]; then touch "$ONCE"; exit 42; fi;;
esac
`); fs.chmodSync(path.join(bin, 'node'), 0o755);
    const fragment = workflow.slice(workflow.indexOf('            rollback_deploy() {'), workflow.indexOf('            # ── 干净工作树硬门禁:')).replace(/^ {12}/gm, '');
    fs.writeFileSync(path.join(dir, 'deploy-1.json'), '{}');
    const script = `set -Eeuo pipefail\nSTATE_DIR="$FIXTURE_DIR"\nDEPLOY_RUN_ID=1\nCODE_SYNCED=true\n${fragment}\ntrap rollback_deploy ERR\ndocker compose up -d --no-deps --wait web\n`;
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_NODE: process.execPath, CALL_LOG: log, ONCE: once, FIXTURE_DIR: dir } });
    assert.equal(result.status, 42);
    const calls = read(log); assert.match(calls, /rollback-plan/); assert.match(calls, /rollback-pin web/); assert.match(calls, /rolled-back/);
    assert.equal(calls.match(/phoenix-production-compose.mjs up/g).length, 2);
    assert.doesNotMatch(calls, /git reset|git update-ref|git restore/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('smoke failure is a bare ERR-producing command rather than an explicit exit bypass', () => {
  const smoke = workflow.split('            # ── Smoke test')[1].split('            # ── 磁盘用量报告')[0];
  assert.doesNotMatch(smoke, /\|\||exit 1|docker compose logs/);
  const result = spawnSync('bash', ['-c', 'set -Eeuo pipefail\ntrap \'echo SAFE_ROLLBACK_TRIGGERED; exit 37\' ERR\ncurl() { return 37; }\ncurl -fsSL fixture -o /dev/null\n'], { encoding: 'utf8' });
  assert.equal(result.status, 37); assert.match(result.stdout, /SAFE_ROLLBACK_TRIGGERED/);
});
