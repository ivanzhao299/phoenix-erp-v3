import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('scripts/ops/production-prepared-transaction-recovery.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/chanjet-readonly-restoration.yml', 'utf8');

test('prepared recovery is explicitly authorized and bound to the failed transaction', () => {
  assert.match(source, /RECOVERY_EXECUTE/);
  assert.match(source, /prepared-no-switch/);
  assert.match(source, /TRANSACTION_BINDING/);
  assert.match(source, /DEPLOY_RECORD_BINDING/);
  assert.match(source, /BACKGROUND_BINDING/);
  assert.match(source, /RUNTIME_CHANGED/);
  assert.match(source, /assertScopeMigrationsReceipted/);
});

test('prepared recovery clears only the transaction and background fence after archiving', () => {
  assert.match(source, /recovery-prepared-\$\{targetRunId\}\.json/);
  assert.match(source, /unlinkSync\(path\.join\(stateDir, 'transaction\.json'\)\)/);
  assert.match(source, /unlinkSync\(path\.join\(stateDir, 'background-control\.json'\)\)/);
  assert.match(source, /recovery-prepared-\$\{targetRunId\}-complete\.json/);
  assert.doesNotMatch(source, /docker compose (up|down|restart)/);
  assert.doesNotMatch(source, /migration:run|migration:revert/);
});

test('workflow exposes a distinct prepared-no-switch recovery mode', () => {
  assert.match(workflow, /prepared-no-switch/);
  assert.match(workflow, /production-prepared-transaction-recovery\.mjs/);
});
