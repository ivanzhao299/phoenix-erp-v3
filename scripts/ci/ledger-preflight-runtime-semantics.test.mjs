import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const preflight = fs.readFileSync('.github/workflows/production-ledger-preflight.yml', 'utf8');
const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');

test('manual preflight binds runner inventory and keeps production SHA independent', () => {
  assert.match(preflight, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(preflight, /git rev-parse HEAD.*EXPECTED_SHA/s);
  const ssh = preflight.split('uses: appleboy\/ssh-action@v1')[1] ?? '';
  assert.doesNotMatch(ssh, /test \"\$\(git rev-parse HEAD\)\" = \"\$EXPECTED_SHA\"/);
  assert.match(ssh, /--inventory \"\$INVENTORY_FILE\"/);
  assert.match(preflight, /LEDGER_INVENTORY_B64/);
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
