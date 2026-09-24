import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/production-migration-applied-state-audit.yml', 'utf8');
const productionScriptSection = workflow.split('      - name: Audit production migration ledgers over read-only SSH')[1] ?? '';
const runnerSection = workflow.split('      - name: Build canonical TypeORM inventory')[1]?.split('      - name: Validate manual read-only invocation')[0] ?? '';
test('workflow is manual read-only and does not require SHA equality', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /RUN_PRODUCTION_MIGRATION_APPLIED_STATE_AUDIT/);
  assert.match(workflow, /production-readonly/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(runnerSection, /git rev-parse HEAD/);
  assert.match(runnerSection, /GITHUB_SHA/);
  assert.doesNotMatch(productionScriptSection, /rev-parse HEAD.*AUDIT_TARGET_SHA/s);
  assert.doesNotMatch(productionScriptSection, /rev-parse HEAD.*GITHUB_SHA/s);
  assert.doesNotMatch(workflow, /migration:run|bridge-schema-migrations-to-typeorm\.sh\s+--apply|\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
});

test('workflow contains production read-only and independent ledger reads', () => {
  assert.match(workflow, /default_transaction_read_only=on/);
  assert.match(workflow, /schema_migrations/);
  assert.match(workflow, /migrations/);
  assert.match(workflow, /AUDIT_TARGET_SHA/);
  assert.match(workflow, /PRODUCTION_SHA/);
});

test('runner checkout and Phase 1 membership are exact', () => {
  assert.match(workflow, /uses: actions\/checkout@v5[\s\S]*?ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(runnerSection, /178960\\d\{6\}/);
  for (const timestamp of ['1789600000000', '1789600100000', '1789600200000', '1789600300000']) assert.match(runnerSection, new RegExp(timestamp));
  assert.match(runnerSection, /PHASE1_EXPECTED_COUNT/);
  assert.match(runnerSection, /PHASE1_EXPECTED_INVENTORY_INVALID/);
});
