import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflowPath = new URL('../../.github/workflows/production-schema-data-safety-audit.yml', import.meta.url);
const sqlPath = new URL('./production-schema-data-safety-audit.sql', import.meta.url);
const workflowText = fs.readFileSync(workflowPath, 'utf8');
const sqlText = fs.readFileSync(sqlPath, 'utf8');

function parseWorkflow() {
  const parser = spawnSync('python3', ['-c', `
import json, pathlib, sys, yaml
doc=yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
on=doc.get(True, doc.get('on', {}))
step=next(s for s in doc['jobs']['audit']['steps'] if s.get('name') == 'Audit production schema data over read-only SSH')
print(json.dumps({'triggers': list(on), 'job': doc['jobs']['audit'], 'permissions': doc['permissions'], 'script': step['with']['script']}))
`, workflowPath.pathname], { encoding: 'utf8' });
  assert.equal(parser.status, 0, parser.stderr || parser.stdout);
  return JSON.parse(parser.stdout);
}

const parsed = parseWorkflow();
const script = parsed.script;

test('workflow is manual-only, main-only, and production-readonly', () => {
  assert.deepEqual(parsed.triggers, ['workflow_dispatch']);
  assert.match(parsed.job.if, /github\.event_name == 'workflow_dispatch'/);
  assert.match(parsed.job.if, /github\.ref == 'refs\/heads\/main'/);
  assert.equal(parsed.job.environment, 'production-readonly');
  assert.equal(parsed.permissions.contents, 'read');
});

test('production script fails closed on read-only and PG16.14 gates', () => {
  assert.match(script, /SHOW transaction_read_only/);
  assert.match(script, /test "\$db_read_only" = on/);
  assert.match(script, /test "\$version_num" = 160014/);
  assert.match(script, /statement_timeout=30000/);
  assert.match(script, /lock_timeout=5000/);
});

test('production script has exact Bash syntax and no mutation path', () => {
  const path = '/tmp/production-schema-data-safety-audit.test.sh';
  fs.writeFileSync(path, script);
  const syntax = spawnSync('bash', ['-n', path], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  for (const forbidden of ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'INSERT', 'UPDATE', 'DELETE', 'db-migrate.sh', 'migration:run', 'bridge --apply', 'docker compose up', 'docker compose down', 'docker compose restart', 'git pull', 'git fetch', 'git reset', 'git clean', 'git switch']) {
    assert.doesNotMatch(script, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(script, /printenv\s+\|/);
  assert.match(script, /AUDIT_RESULT=READ_ONLY_DATA_SAFETY_EVIDENCE_COLLECTED/);
});

test('SQL covers exactly the five scoped objects and emits metadata', () => {
  for (const table of ['prc_purchase_requests', 'wms_stocktake', 'wms_inbound', 'acc_ledger', 'wms_warehouses']) {
    assert.match(sqlText, new RegExp(table));
  }
  for (const key of ['null_count', 'blank_count', 'duplicate_group_count', 'over_64_count', 'over_20_count', 'status_domain', 'min_created_at', 'max_created_at', 'updated_at_null_count', 'min_updated_at', 'max_updated_at', 'updated_before_created_count', 'updated_equals_created_count', 'updated_after_created_count', 'database_timezone', 'foreign_keys', 'relation_sizes']) {
    assert.match(sqlText, new RegExp(key));
  }
  assert.match(sqlText, /wms_inbound_updated_at/);
  assert.match(sqlText, /column_name = 'created_at'/);
  assert.match(sqlText, /column_name = 'updated_at'/);
  assert.doesNotMatch(sqlText, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  assert.match(sqlText, /SELECT json_build_object/);
});

test('PG16 fixture passes when a PostgreSQL service is available', (t) => {
  if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGDATABASE) {
    t.skip('PostgreSQL service is not available');
    return;
  }
  const result = spawnSync('bash', ['scripts/ci/run-production-schema-data-safety-fixture.sh'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /POSTGRES16_DATA_SAFETY_FIXTURE=PASS/);
});
