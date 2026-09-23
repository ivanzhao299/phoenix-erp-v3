import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const workflowPath = new URL('../../.github/workflows/production-schema-drift-audit.yml', import.meta.url);
const workflow = readFileSync(workflowPath, 'utf8');
const sql = readFileSync(new URL('./production-schema-fingerprint.sql', import.meta.url), 'utf8');

function parseWorkflow() {
  const parser = spawnSync('python3', ['-c', `
import json, pathlib, sys, yaml
doc=yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
on=doc.get(True, doc.get('on', {}))
step=next(s for s in doc['jobs']['audit']['steps'] if s.get('name') == 'Audit production schema over read-only SSH')
print(json.dumps({'triggers': list(on), 'environment': doc['jobs']['audit']['environment'],
                  'permissions': doc['permissions'], 'guard': doc['jobs']['audit']['if'],
                  'workflow': doc, 'production_script': step['with']['script'],
                  'production_envs': step['with']['envs']}))
`, workflowPath.pathname], { encoding: 'utf8' });
  assert.equal(parser.status, 0, parser.stderr || parser.stdout);
  return JSON.parse(parser.stdout);
}

test('schema drift audit is manual-only and production-readonly', () => {
  const parsed = parseWorkflow();
  assert.deepEqual(parsed.triggers, ['workflow_dispatch']);
  assert.equal(parsed.environment, 'production-readonly');
  assert.deepEqual(parsed.permissions, { contents: 'read' });
  assert.match(parsed.guard, /github\.event_name == 'workflow_dispatch'/);
  assert.match(parsed.guard, /github\.ref == 'refs\/heads\/main'/);
});

test('dual canonical versions are exact and production compares only to PG16', () => {
  const parsed = parseWorkflow();
  assert.match(workflow, /postgres:16\.14-alpine/);
  assert.match(workflow, /postgres:18-alpine/);
  assert.match(workflow, /FINGERPRINT_PREFIX: PG16/);
  assert.match(workflow, /FINGERPRINT_PREFIX: PG18/);
  assert.match(workflow, /CANONICAL_PG16_HASH/);
  assert.doesNotMatch(parsed.production_envs, /CANONICAL_PG18/);
  assert.match(workflow, /steps\.pg16\.outcome == 'success' && steps\.pg18\.outcome == 'success'/);
});

test('fingerprint contract and production command remain read-only', () => {
  const parsed = parseWorkflow();
  assert.match(sql, /UNION ALL/);
  assert.match(sql, /ORDER BY 1/);
  for (const token of ['schema_migrations', 'migrations', 'pg_catalog', 'information_schema', 'pg_toast']) assert.match(sql, new RegExp(token));
  assert.match(parsed.production_script, /PGOPTIONS='-c default_transaction_read_only=on'/);
  assert.match(parsed.production_script, /SHOW transaction_read_only/);
  assert.match(parsed.production_script, /SAME_VERSION_SCHEMA_MATCH/);
  for (const forbidden of ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'INSERT', 'UPDATE', 'DELETE', 'db-migrate.sh', 'migration:run', 'bridge --apply', 'docker compose up', 'docker compose down', 'docker compose restart', 'git pull', 'git fetch', 'git reset']) {
    assert.doesNotMatch(parsed.production_script, new RegExp(forbidden.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'i'), forbidden);
  }
});

test('fingerprint SQL uses explicit PostgreSQL char casts', () => {
  assert.match(sql, /con\.contype::text/);
  assert.match(sql, /t\.typtype::text/);
});

test('exact production SSH script is valid Bash', () => {
  const parsed = parseWorkflow();
  const check = spawnSync('bash', ['-n'], { input: parsed.production_script, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr || check.stdout);
});
