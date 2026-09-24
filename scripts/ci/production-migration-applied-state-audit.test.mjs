import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/production-migration-applied-state-audit.yml', 'utf8');
test('workflow is manual read-only and does not require SHA equality', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /RUN_PRODUCTION_MIGRATION_APPLIED_STATE_AUDIT/);
  assert.match(workflow, /production-readonly/);
  assert.match(workflow, /contents:\s*read/);
  assert.doesNotMatch(workflow, /rev-parse HEAD.*GITHUB_SHA/s);
  assert.doesNotMatch(workflow, /migration:run|bridge-schema-migrations-to-typeorm\.sh\s+--apply|\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
});

test('workflow contains production read-only and independent ledger reads', () => {
  assert.match(workflow, /default_transaction_read_only=on/);
  assert.match(workflow, /schema_migrations/);
  assert.match(workflow, /migrations/);
  assert.match(workflow, /AUDIT_TARGET_SHA/);
  assert.match(workflow, /PRODUCTION_SHA/);
});
