import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const preflight = fs.readFileSync('.github/workflows/production-ledger-preflight.yml', 'utf8');
const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');

function workflowSteps(source) {
  const lines = source.split('\n');
  const steps = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^      - name: (.+)$/);
    if (!match) continue;
    const body = [];
    for (let j = i + 1; j < lines.length && !/^      - name: /.test(lines[j]); j += 1) body.push(lines[j]);
    steps.push({ name: match[1], body: body.join('\n') });
  }
  return steps;
}

const steps = workflowSteps(preflight);
const stepIndex = (name) => steps.findIndex((step) => step.name === name);

test('manual preflight binds runner inventory and keeps production SHA independent', () => {
  assert.match(preflight, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(preflight, /git rev-parse HEAD.*EXPECTED_SHA/s);
  const ssh = preflight.split('uses: appleboy\/ssh-action@v1')[1] ?? '';
  assert.doesNotMatch(ssh, /test \"\$\(git rev-parse HEAD\)\" = \"\$EXPECTED_SHA\"/);
  assert.match(ssh, /--inventory \"\$INVENTORY_FILE\"/);
  assert.match(preflight, /LEDGER_INVENTORY_B64/);
});

test('runner provisions the exact Node and pnpm toolchain before inventory build', () => {
  const checkout = stepIndex('Checkout approved main commit');
  const pnpmSetup = stepIndex('Setup pnpm');
  const nodeSetup = stepIndex('Setup Node 20');
  const validate = stepIndex('Validate manual read-only invocation');
  const inventory = stepIndex('Build candidate ledger inventory');
  const production = stepIndex('Run production ledger preflight over read-only SSH');
  assert.ok(checkout >= 0 && pnpmSetup > checkout && nodeSetup > pnpmSetup);
  assert.ok(validate > nodeSetup && inventory > validate && production > inventory);
  assert.match(steps[pnpmSetup].body, /uses: pnpm\/action-setup@v4/);
  assert.match(steps[pnpmSetup].body, /version: 9/);
  assert.match(steps[nodeSetup].body, /uses: actions\/setup-node@v5/);
  assert.match(steps[nodeSetup].body, /node-version: ['"]?20['"]?/);
  assert.match(steps[nodeSetup].body, /cache: pnpm/);
  assert.match(steps[validate].body, /pnpm --version/);
  assert.match(steps[validate].body, /process\.versions\.node/);
  assert.match(steps[validate].body, /RUNNER_NODE_MAJOR=20/);
  assert.match(steps[validate].body, /RUNNER_PNPM_MAJOR=9/);
  assert.match(preflight, /timeout-minutes: 25/);
});

test('deploy orders candidate inventory and preflight before migrations and API switch', () => {
  const inventory = deploy.indexOf('candidate-typeorm-inventory.sh');
  const preflightIndex = deploy.indexOf('ledger-preflight.mjs --mode pre-migration --inventory');
  const legacyIndex = deploy.indexOf('MIG_MODE=prod MIG_DIR=apps/api bash scripts/db-migrate.sh');
  const switchIndex = deploy.indexOf('docker compose up -d --no-deps --wait api', legacyIndex);
  assert.ok(inventory >= 0 && preflightIndex > inventory);
  assert.ok(legacyIndex > preflightIndex);
  assert.ok(switchIndex > legacyIndex);
  assert.match(deploy, /candidate image that will execute/);
});

test('preflight has no mutation execution path', () => {
  assert.doesNotMatch(preflight, /migration:run|migration:revert|bridge-schema-migrations-to-typeorm\.sh\s+--apply|docker compose (up|down|restart)/);
});
